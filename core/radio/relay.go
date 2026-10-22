// Cisum v0.7.0 - Relays a station through the server: no mixed content (http station on an https
// server), no CORS issue, and the song titles are read on the way.
package radio

import (
	"context"
	"io"
	"net/http"
)

// Relay streams a station to w until the client disconnects. An error is returned only when the
// station cannot be reached (nothing written yet).
func Relay(ctx context.Context, w http.ResponseWriter, id, streamURL string) error {
	s, err := Open(ctx, streamURL, true)
	if err != nil {
		return err
	}
	defer s.Close()

	mu.Lock()
	get(id).relays++
	mu.Unlock()
	defer func() {
		mu.Lock()
		get(id).relays--
		mu.Unlock()
	}()
	setInfo(id, s, "", false)

	var body io.Reader = s.Body
	if s.MetaInt > 0 {
		body = newMetaReader(s.Body, s.MetaInt, func(t string) { setInfo(id, s, t, true) })
	}

	h := w.Header()
	h.Set("Content-Type", s.ContentType)
	h.Set("Cache-Control", "no-cache, no-store")
	h.Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)

	flusher, _ := w.(http.Flusher)
	buf := make([]byte, 16<<10)
	for {
		n, rerr := body.Read(buf)
		if n > 0 {
			if _, err := w.Write(buf[:n]); err != nil {
				return nil // listener left
			}
			if flusher != nil {
				flusher.Flush()
			}
		}
		if rerr != nil {
			return nil // station closed the stream or listener left: headers are already sent
		}
	}
}
