// Cisum v0.1.0 - LRCLIB online lyrics source.
// Used as a fallback when no local lyrics (sidecar files or embedded tags) are found.
// Results (including "not found") are cached on disk to avoid repeated network calls.
package lyrics

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/consts"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
)

const (
	lrclibSource      = "lrclib"
	lrclibTimeout     = 8 * time.Second
	lrclibNotFoundTTL = 7 * 24 * time.Hour // retry songs without lyrics once a week
)

var lrclibClient = &http.Client{Timeout: lrclibTimeout}

// lrclibEntry is both the LRCLIB API response and the on-disk cache format.
type lrclibEntry struct {
	PlainLyrics  string    `json:"plainLyrics"`
	SyncedLyrics string    `json:"syncedLyrics"`
	Instrumental bool      `json:"instrumental"`
	NotFound     bool      `json:"notFound,omitempty"`
	FetchedAt    time.Time `json:"fetchedAt"`
}

func fromLRCLib(ctx context.Context, mf *model.MediaFile) (model.LyricList, error) {
	if !conf.Server.LRCLib.Enabled || mf.Title == "" || mf.Artist == "" {
		return nil, nil
	}
	entry, err := lrclibCached(mf.ID)
	if err != nil {
		entry, err = lrclibFetch(ctx, mf)
		if err != nil {
			return nil, err
		}
		lrclibStore(mf.ID, entry)
	}
	return entry.toLyrics(ctx)
}

func (e *lrclibEntry) toLyrics(ctx context.Context) (model.LyricList, error) {
	switch {
	case e.NotFound || e.Instrumental:
		return nil, nil
	case e.SyncedLyrics != "":
		return model.ParseLyrics(ctx, ".lrc", "xxx", []byte(e.SyncedLyrics))
	case e.PlainLyrics != "":
		return model.ParseLyrics(ctx, ".txt", "xxx", []byte(e.PlainLyrics))
	}
	return nil, nil
}

func lrclibFetch(ctx context.Context, mf *model.MediaFile) (*lrclibEntry, error) {
	q := url.Values{}
	q.Set("artist_name", mf.Artist)
	q.Set("track_name", mf.Title)
	if mf.Album != "" {
		q.Set("album_name", mf.Album)
	}
	if mf.Duration > 0 {
		q.Set("duration", strconv.Itoa(int(mf.Duration+0.5)))
	}
	endpoint := strings.TrimSuffix(conf.Server.LRCLib.BaseURL, "/") + "/api/get?" + q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", consts.CisumName+"/"+consts.CisumVersion+" (self-hosted music server)")
	resp, err := lrclibClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("lrclib request: %w", err)
	}
	defer resp.Body.Close()

	entry := &lrclibEntry{FetchedAt: time.Now()}
	switch resp.StatusCode {
	case http.StatusOK:
		if err := json.NewDecoder(resp.Body).Decode(entry); err != nil {
			return nil, fmt.Errorf("lrclib response: %w", err)
		}
	case http.StatusNotFound:
		entry.NotFound = true
	default:
		return nil, fmt.Errorf("lrclib returned status %d", resp.StatusCode)
	}
	log.Debug(ctx, "Fetched lyrics from LRCLIB", "title", mf.Title, "found", !entry.NotFound)
	return entry, nil
}

func lrclibCachePath(id string) string {
	return filepath.Join(conf.Server.CacheFolder.String(), "lyrics", "lrclib", id+".json")
}

// lrclibCached returns a cached entry, or an error when absent or expired.
func lrclibCached(id string) (*lrclibEntry, error) {
	data, err := os.ReadFile(lrclibCachePath(id))
	if err != nil {
		return nil, err
	}
	var e lrclibEntry
	if err := json.Unmarshal(data, &e); err != nil {
		return nil, err
	}
	if e.NotFound && time.Since(e.FetchedAt) > lrclibNotFoundTTL {
		return nil, errors.New("expired")
	}
	return &e, nil
}

func lrclibStore(id string, e *lrclibEntry) {
	p := lrclibCachePath(id)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return
	}
	if data, err := json.Marshal(e); err == nil {
		_ = os.WriteFile(p, data, 0o600)
	}
}
