// Package importer copies a user's playlists, favorites, ratings and play counts from another
// Subsonic-compatible server (Navidrome, Cisum, Airsonic, Gonic...) into Cisum. Cisum v0.4.0
package importer

import (
	"context"
	"crypto/md5" //nolint:gosec // required by the Subsonic token authentication scheme
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/navidrome/navidrome/consts"
)

// Source identifies the remote server and account to read from.
type Source struct {
	URL      string `json:"url"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// remoteSong holds the Subsonic song fields used for matching and import.
type remoteSong struct {
	ID            string  `json:"id"`
	Title         string  `json:"title"`
	Artist        string  `json:"artist"`
	Album         string  `json:"album"`
	DisplayArtist string  `json:"displayArtist"`
	Duration      float64 `json:"duration"`
	Path          string  `json:"path"`
	MusicBrainzID string  `json:"musicBrainzId"`
	Starred       string  `json:"starred"`
	UserRating    int     `json:"userRating"`
	PlayCount     int64   `json:"playCount"`
	Played        string  `json:"played"`
}

type remoteAlbum struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Title         string `json:"title"`
	Artist        string `json:"artist"`
	MusicBrainzID string `json:"musicBrainzId"`
	Starred       string `json:"starred"`
	UserRating    int    `json:"userRating"`
}

type remoteArtist struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	MusicBrainzID string `json:"musicBrainzId"`
	Starred       string `json:"starred"`
	UserRating    int    `json:"userRating"`
}

type remotePlaylist struct {
	ID      string       `json:"id"`
	Name    string       `json:"name"`
	Comment string       `json:"comment"`
	Owner   string       `json:"owner"`
	Public  bool         `json:"public"`
	Entry   []remoteSong `json:"entry"`
}

type response struct {
	Status        string `json:"status"`
	Type          string `json:"type"`
	ServerVersion string `json:"serverVersion"`
	Version       string `json:"version"`
	Error         *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
	Playlists *struct {
		Playlist []remotePlaylist `json:"playlist"`
	} `json:"playlists"`
	Playlist *remotePlaylist `json:"playlist"`
	Starred2 *struct {
		Song   []remoteSong   `json:"song"`
		Album  []remoteAlbum  `json:"album"`
		Artist []remoteArtist `json:"artist"`
	} `json:"starred2"`
	SearchResult3 *struct {
		Song   []remoteSong   `json:"song"`
		Album  []remoteAlbum  `json:"album"`
		Artist []remoteArtist `json:"artist"`
	} `json:"searchResult3"`
	AlbumList2 *struct {
		Album []remoteAlbum `json:"album"`
	} `json:"albumList2"`
	Album *struct {
		Song []remoteSong `json:"song"`
	} `json:"album"`
	ScanStatus *struct {
		Count int `json:"count"`
	} `json:"scanStatus"`
}

type client struct {
	src  Source
	http *http.Client
}

func newClient(src Source) *client {
	src.URL = strings.TrimRight(strings.TrimSpace(src.URL), "/")
	return &client{src: src, http: &http.Client{Timeout: 60 * time.Second}}
}

// call performs a Subsonic request with token authentication (salted MD5, Subsonic 1.13+).
func (c *client) call(ctx context.Context, method string, params url.Values) (*response, error) {
	saltBytes := make([]byte, 8)
	_, _ = rand.Read(saltBytes)
	salt := hex.EncodeToString(saltBytes)
	sum := md5.Sum([]byte(c.src.Password + salt)) //nolint:gosec
	q := url.Values{}
	for k, v := range params {
		q[k] = v
	}
	q.Set("u", c.src.Username)
	q.Set("t", hex.EncodeToString(sum[:]))
	q.Set("s", salt)
	q.Set("v", "1.16.1")
	q.Set("c", consts.CisumName+"-import")
	q.Set("f", "json")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.src.URL+"/rest/"+method+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", consts.HTTPUserAgent)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("cannot reach %s: %w", c.src.URL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s answered HTTP %d to %s", c.src.URL, resp.StatusCode, method)
	}
	var body struct {
		Response response `json:"subsonic-response"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("%s is not a Subsonic server (invalid answer to %s)", c.src.URL, method)
	}
	r := body.Response
	if r.Status != "ok" {
		if r.Error != nil {
			return nil, fmt.Errorf("remote server refused %s: %s (code %d)", method, r.Error.Message, r.Error.Code)
		}
		return nil, fmt.Errorf("remote server refused %s", method)
	}
	return &r, nil
}

// Ping checks the address and the credentials, and returns a short server description.
func Ping(ctx context.Context, src Source) (string, error) {
	r, err := newClient(src).call(ctx, "ping", nil)
	if err != nil {
		return "", err
	}
	desc := "Subsonic API " + r.Version
	if r.Type != "" {
		desc = r.Type + " " + r.ServerVersion + ", " + desc
	}
	return desc, nil
}

// allSongs lists every song with its user data. It uses an empty search3 query (Navidrome, Cisum,
// Gonic...) and falls back to walking all albums for servers that do not support it.
func (c *client) allSongs(ctx context.Context, progress func(int)) ([]remoteSong, error) {
	const page = 500
	var songs []remoteSong
	for offset := 0; ; offset += page {
		r, err := c.call(ctx, "search3", url.Values{
			"query": {""}, "songCount": {fmt.Sprint(page)}, "songOffset": {fmt.Sprint(offset)},
			"artistCount": {"0"}, "albumCount": {"0"},
		})
		if err != nil || r.SearchResult3 == nil {
			break
		}
		songs = append(songs, r.SearchResult3.Song...)
		progress(len(songs))
		if len(r.SearchResult3.Song) < page {
			break
		}
	}
	if len(songs) > 0 {
		return songs, nil
	}
	return c.songsByAlbums(ctx, progress)
}

func (c *client) songsByAlbums(ctx context.Context, progress func(int)) ([]remoteSong, error) {
	const page = 500
	var songs []remoteSong
	for offset := 0; ; offset += page {
		r, err := c.call(ctx, "getAlbumList2", url.Values{"type": {"alphabeticalByName"}, "size": {fmt.Sprint(page)}, "offset": {fmt.Sprint(offset)}})
		if err != nil {
			return nil, err
		}
		if r.AlbumList2 == nil || len(r.AlbumList2.Album) == 0 {
			break
		}
		for _, a := range r.AlbumList2.Album {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			ar, err := c.call(ctx, "getAlbum", url.Values{"id": {a.ID}})
			if err != nil || ar.Album == nil {
				continue
			}
			songs = append(songs, ar.Album.Song...)
			progress(len(songs))
		}
		if len(r.AlbumList2.Album) < page {
			break
		}
	}
	return songs, nil
}

// allAlbumsAndArtists lists albums and artists with their ratings (empty search3 query).
func (c *client) allAlbumsAndArtists(ctx context.Context) ([]remoteAlbum, []remoteArtist) {
	const page = 500
	var albums []remoteAlbum
	var artists []remoteArtist
	for offset := 0; ; offset += page {
		r, err := c.call(ctx, "search3", url.Values{"query": {""}, "songCount": {"0"}, "albumCount": {fmt.Sprint(page)},
			"albumOffset": {fmt.Sprint(offset)}, "artistCount": {fmt.Sprint(page)}, "artistOffset": {fmt.Sprint(offset)}})
		if err != nil || r.SearchResult3 == nil {
			break
		}
		albums = append(albums, r.SearchResult3.Album...)
		artists = append(artists, r.SearchResult3.Artist...)
		if len(r.SearchResult3.Album) < page && len(r.SearchResult3.Artist) < page {
			break
		}
	}
	return albums, artists
}
