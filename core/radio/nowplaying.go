// Cisum v0.7.0 - What a station is playing now (ICY StreamTitle), shared by relays and probes.
package radio

import (
	"context"
	"io"
	"sync"
	"time"
)

// Info describes what a station broadcasts. Title is "Artist - Title" as sent by the station.
type Info struct {
	Title       string    `json:"title"`
	Name        string    `json:"name,omitempty"`
	Genre       string    `json:"genre,omitempty"`
	Bitrate     int       `json:"bitrate,omitempty"`
	ContentType string    `json:"contentType,omitempty"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

const (
	probeCacheTTL = 20 * time.Second
	probeTimeout  = 12 * time.Second
	maxProbeBytes = 512 << 10 // stations with a huge metaint are not worth waiting for
)

type entry struct {
	info    Info
	relays  int // relays currently streaming this station keep the title up to date
	probing *sync.WaitGroup
}

var (
	mu      sync.Mutex
	entries = map[string]*entry{}
)

func get(id string) *entry {
	e := entries[id]
	if e == nil {
		e = &entry{}
		entries[id] = e
	}
	return e
}

func setInfo(id string, s *Stream, title string, hasTitle bool) {
	mu.Lock()
	defer mu.Unlock()
	e := get(id)
	e.info.Name, e.info.Genre, e.info.Bitrate, e.info.ContentType = s.Name, s.Genre, s.Bitrate, s.ContentType
	if hasTitle {
		e.info.Title = title
	}
	e.info.UpdatedAt = time.Now()
}

// NowPlaying returns the current title of a station. While someone listens through the relay
// the title comes from that stream; otherwise the station is probed (cached a few seconds).
func NowPlaying(ctx context.Context, id, streamURL string) (Info, error) {
	mu.Lock()
	e := get(id)
	if e.relays > 0 || time.Since(e.info.UpdatedAt) < probeCacheTTL {
		info := e.info
		mu.Unlock()
		return info, nil
	}
	if wg := e.probing; wg != nil { // another request is already probing this station
		mu.Unlock()
		wg.Wait()
		mu.Lock()
		defer mu.Unlock()
		return e.info, nil
	}
	wg := &sync.WaitGroup{}
	wg.Add(1)
	e.probing = wg
	mu.Unlock()

	info, err := Probe(ctx, streamURL)
	mu.Lock()
	if err == nil {
		e.info = info
	}
	e.probing = nil
	mu.Unlock()
	wg.Done()
	return info, err
}

// Probe connects to a stream, reads its headers and the first metadata block, then disconnects.
func Probe(ctx context.Context, streamURL string) (Info, error) {
	ctx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()
	s, err := Open(ctx, streamURL, true)
	if err != nil {
		return Info{}, err
	}
	defer s.Close()
	info := Info{Name: s.Name, Genre: s.Genre, Bitrate: s.Bitrate, ContentType: s.ContentType, UpdatedAt: time.Now()}
	if s.MetaInt <= 0 || s.MetaInt > maxProbeBytes {
		return info, nil
	}
	r := newMetaReader(s.Body, s.MetaInt, func(t string) { info.Title = t })
	// Reading metaInt bytes of audio brings the first metadata block
	if _, err := io.CopyN(io.Discard, r, int64(s.MetaInt)); err != nil {
		return info, nil
	}
	var one [1]byte
	_, _ = r.Read(one[:])
	return info, nil
}
