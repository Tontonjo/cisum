// Cisum v0.7.0 - Tests for web radio streams (ICY metadata, Shoutcast v1, playlists, relay).
package radio

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// icyBody builds audio with a metadata block every metaInt bytes.
func icyBody(metaInt, blocks int, title string) []byte {
	var b bytes.Buffer
	for i := 0; i < blocks; i++ {
		b.Write(bytes.Repeat([]byte{byte('a' + i)}, metaInt))
		meta := fmt.Sprintf("StreamTitle='%s %d';", title, i)
		pad := (16 - len(meta)%16) % 16
		meta += strings.Repeat("\x00", pad)
		b.WriteByte(byte(len(meta) / 16))
		b.WriteString(meta)
	}
	return b.Bytes()
}

func TestMetaReaderStripsBlocks(t *testing.T) {
	var titles []string
	r := newMetaReader(bytes.NewReader(icyBody(100, 3, "Air - La femme d'argent")), 100, func(s string) { titles = append(titles, s) })
	out, _ := io.ReadAll(r)
	if len(out) != 300 || strings.ContainsAny(string(out), "S'") {
		t.Fatalf("audio not clean: %d bytes", len(out))
	}
	if len(titles) != 3 || titles[0] != "Air - La femme d'argent 0" {
		t.Fatalf("titles %v", titles)
	}
}

func TestLatin1(t *testing.T) {
	if got, _ := parseStreamTitle([]byte("StreamTitle='Caf\xe9';\x00")); got != "Café" {
		t.Fatal(got)
	}
}

// Raw Shoutcast v1 server answering "ICY 200 OK".
func icyServer(t *testing.T) string {
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer c.Close()
				buf := make([]byte, 4096)
				n, _ := c.Read(buf)
				meta := strings.Contains(strings.ToLower(string(buf[:n])), "icy-metadata: 1")
				hdr := "ICY 200 OK\r\nicy-name:Test FM\r\nicy-br:128\r\ncontent-type:audio/mpeg\r\n"
				if meta {
					hdr += "icy-metaint:64\r\n"
				}
				c.Write([]byte(hdr + "\r\n"))
				if meta {
					c.Write(icyBody(64, 50, "Daft Punk - One More Time"))
				} else {
					c.Write(bytes.Repeat([]byte("x"), 64*50))
				}
			}(c)
		}
	}()
	t.Cleanup(func() { ln.Close() })
	return "http://" + ln.Addr().String() + "/stream"
}

func TestProbeICYv1AndPlaylist(t *testing.T) {
	stream := icyServer(t)
	pls := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/radio.pls":
			w.Header().Set("Content-Type", "audio/x-scpls")
			fmt.Fprintf(w, "[playlist]\nNumberOfEntries=1\nFile1=%s\nTitle1=Test\n", stream)
		case "/live.m3u8":
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			fmt.Fprint(w, "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\nseg1.ts\n")
		}
	}))
	defer pls.Close()

	info, err := Probe(context.Background(), pls.URL+"/radio.pls")
	if err != nil || info.Title != "Daft Punk - One More Time 0" || info.Name != "Test FM" || info.Bitrate != 128 {
		t.Fatalf("%+v %v", info, err)
	}
	if _, err := Probe(context.Background(), pls.URL+"/live.m3u8"); err != ErrHLS {
		t.Fatalf("want ErrHLS, got %v", err)
	}
}

func TestRelayAndNowPlaying(t *testing.T) {
	stream := icyServer(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = Relay(r.Context(), w, "st1", stream)
	}))
	defer srv.Close()
	resp, err := http.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	if resp.Header.Get("Content-Type") != "audio/mpeg" || len(body) != 64*50 || bytes.Contains(body, []byte("StreamTitle")) {
		t.Fatalf("relay output %d bytes, type %s", len(body), resp.Header.Get("Content-Type"))
	}
	info, _ := NowPlaying(context.Background(), "st1", stream)
	if info.Title != "Daft Punk - One More Time 49" {
		t.Fatalf("last title %q", info.Title)
	}
	// Cached: a second call does not reconnect
	start := time.Now()
	NowPlaying(context.Background(), "st1", "http://127.0.0.1:1/never")
	if time.Since(start) > 100*time.Millisecond {
		t.Fatal("not cached")
	}
}
