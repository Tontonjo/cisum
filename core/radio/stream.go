// Cisum v0.7.0 - Web radio streams: opening (playlists, Shoutcast "ICY" servers) and ICY metadata.
package radio

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/navidrome/navidrome/consts"
)

// ErrHLS is returned for HLS streams (.m3u8 with segments): they cannot be relayed as one audio
// stream, so the web player plays them directly.
var ErrHLS = errors.New("HLS stream, play it directly")

const (
	maxPlaylistSize  = 64 << 10 // .pls / .m3u files are small
	maxRedirectDepth = 3        // playlist pointing to a playlist...
)

// icyConn turns the "ICY 200 OK" status line of old Shoutcast servers into "HTTP/1.0 200 OK",
// which Go's HTTP client would otherwise reject as a malformed response.
type icyConn struct {
	net.Conn
	checked bool
	pending []byte
}

func (c *icyConn) Read(p []byte) (int, error) {
	if !c.checked {
		c.checked = true
		head := make([]byte, 4)
		n, err := io.ReadFull(c.Conn, head)
		if err != nil {
			return copy(p, head[:n]), err
		}
		if string(head) == "ICY " {
			c.pending = []byte("HTTP/1.0 ")
		} else {
			c.pending = head
		}
	}
	if len(c.pending) > 0 {
		n := copy(p, c.pending)
		c.pending = c.pending[n:]
		return n, nil
	}
	return c.Conn.Read(p)
}

var client = &http.Client{
	Transport: &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			d := net.Dialer{Timeout: 10 * time.Second}
			conn, err := d.DialContext(ctx, network, addr)
			if err != nil {
				return nil, err
			}
			return &icyConn{Conn: conn}, nil
		},
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 15 * time.Second,
	},
}

// Stream is an open radio stream. Close must be called.
type Stream struct {
	Body        io.ReadCloser
	ContentType string
	MetaInt     int    // bytes of audio between two metadata blocks, 0 when the server sends none
	Name        string // icy-name
	Genre       string // icy-genre
	Bitrate     int    // kbit/s (icy-br)
	URL         string // final audio URL after following playlists
}

func (s *Stream) Close() error { return s.Body.Close() }

// Open connects to a station. Playlist URLs (.pls, .m3u) are followed to the first audio URL.
// withMeta asks the server to interleave ICY metadata (song titles) in the audio.
func Open(ctx context.Context, rawURL string, withMeta bool) (*Stream, error) {
	target := rawURL
	for range maxRedirectDepth + 1 {
		u, err := url.Parse(target)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			return nil, fmt.Errorf("invalid stream URL %q", target)
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", consts.HTTPUserAgent)
		if withMeta {
			req.Header.Set("Icy-MetaData", "1")
		}
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return nil, fmt.Errorf("station answered %s", resp.Status)
		}
		ctype := strings.ToLower(strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0]))
		if isPlaylist(ctype, u.Path) {
			body, err := io.ReadAll(io.LimitReader(resp.Body, maxPlaylistSize))
			resp.Body.Close()
			if err != nil {
				return nil, err
			}
			if bytes.Contains(body, []byte("#EXT-X-")) {
				return nil, ErrHLS
			}
			next := firstURL(body)
			if next == "" {
				return nil, errors.New("playlist without any stream URL")
			}
			target = next
			continue
		}
		metaInt, _ := strconv.Atoi(resp.Header.Get("icy-metaint"))
		bitrate, _ := strconv.Atoi(strings.Split(resp.Header.Get("icy-br"), ",")[0])
		if ctype == "" || ctype == "application/octet-stream" {
			ctype = "audio/mpeg" // most Shoutcast servers send MP3 without a proper type
		}
		return &Stream{
			Body: resp.Body, ContentType: ctype, MetaInt: metaInt, URL: target, Bitrate: bitrate,
			Name: decodeText(resp.Header.Get("icy-name")), Genre: decodeText(resp.Header.Get("icy-genre")),
		}, nil
	}
	return nil, errors.New("too many nested playlists")
}

func isPlaylist(ctype, path string) bool {
	switch ctype {
	case "audio/x-scpls", "application/pls+xml", "audio/x-mpegurl", "audio/mpegurl",
		"application/x-mpegurl", "application/vnd.apple.mpegurl":
		return true
	}
	p := strings.ToLower(path)
	return (ctype == "" || strings.HasPrefix(ctype, "text/")) &&
		(strings.HasSuffix(p, ".pls") || strings.HasSuffix(p, ".m3u") || strings.HasSuffix(p, ".m3u8"))
}

// firstURL returns the first http(s) URL of a .pls (FileN=...) or .m3u playlist.
func firstURL(body []byte) string {
	sc := bufio.NewScanner(bytes.NewReader(body))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if i := strings.Index(line, "="); i > 0 && strings.HasPrefix(strings.ToLower(line), "file") {
			line = strings.TrimSpace(line[i+1:])
		}
		if strings.HasPrefix(line, "http://") || strings.HasPrefix(line, "https://") {
			return line
		}
	}
	return ""
}

// metaReader removes the ICY metadata blocks from the audio and reports each new StreamTitle.
type metaReader struct {
	r       io.Reader
	metaInt int
	left    int
	onTitle func(string)
}

func newMetaReader(r io.Reader, metaInt int, onTitle func(string)) *metaReader {
	return &metaReader{r: r, metaInt: metaInt, left: metaInt, onTitle: onTitle}
}

func (m *metaReader) Read(p []byte) (int, error) {
	if m.left == 0 {
		var size [1]byte
		if _, err := io.ReadFull(m.r, size[:]); err != nil {
			return 0, err
		}
		if n := int(size[0]) * 16; n > 0 {
			block := make([]byte, n)
			if _, err := io.ReadFull(m.r, block); err != nil {
				return 0, err
			}
			if title, ok := parseStreamTitle(block); ok {
				m.onTitle(title)
			}
		}
		m.left = m.metaInt
	}
	if len(p) > m.left {
		p = p[:m.left]
	}
	n, err := m.r.Read(p)
	m.left -= n
	return n, err
}

// parseStreamTitle extracts StreamTitle='...'; from a metadata block.
func parseStreamTitle(block []byte) (string, bool) {
	s := string(bytes.TrimRight(block, "\x00"))
	const key = "StreamTitle='"
	i := strings.Index(s, key)
	if i < 0 {
		return "", false
	}
	s = s[i+len(key):]
	if j := strings.Index(s, "';"); j >= 0 {
		s = s[:j]
	} else {
		s = strings.TrimSuffix(s, "'")
	}
	return strings.TrimSpace(decodeText(s)), true
}

// decodeText keeps UTF-8 as is and converts anything else from Latin-1, the usual fallback of
// Shoutcast servers.
func decodeText(s string) string {
	if utf8.ValidString(s) {
		return s
	}
	runes := make([]rune, 0, len(s))
	for i := 0; i < len(s); i++ {
		runes = append(runes, rune(s[i]))
	}
	return string(runes)
}
