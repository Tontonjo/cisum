// Cisum v0.1.0 - Playlist import / export helpers.
//
// Import accepts M3U/M3U8 content and matches each entry, in order of reliability:
//  1. the exact path (absolute path inside a library, as written by Navidrome/Cisum exports)
//  2. the end of the path (last 3, then 2 components), for playlists made on another machine
//  3. the #EXTINF "Artist - Title" info, picking the closest duration
//
// Export writes Extended M3U8, including missing tracks so they are not lost.
package playlists

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"math"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"

	. "github.com/Masterminds/squirrel"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	"golang.org/x/text/unicode/norm"
)

const maxReportedUnmatched = 50

// ImportReport summarizes the result of one imported playlist file.
type ImportReport struct {
	File      string   `json:"file"`
	ID        string   `json:"id,omitempty"`
	Name      string   `json:"name,omitempty"`
	Total     int      `json:"total"`
	Matched   int      `json:"matched"`
	Unmatched []string `json:"unmatched,omitempty"`
	Error     string   `json:"error,omitempty"`
}

type m3uEntry struct {
	path     string
	artist   string
	title    string
	duration float64
}

// ImportM3UWithReport parses an M3U/M3U8 playlist, creates it for the current user and reports
// which entries could not be matched.
func ImportM3UWithReport(ctx context.Context, ds model.DataStore, fileName string, reader io.Reader) ImportReport {
	report := ImportReport{File: fileName}
	name, entries, err := parseM3UEntries(reader)
	if err != nil {
		report.Error = err.Error()
		return report
	}
	if name == "" {
		name = strings.TrimSuffix(filepath.Base(fileName), filepath.Ext(fileName))
	}
	resolver, err := newPathResolver(ctx, ds)
	if err != nil {
		report.Error = err.Error()
		return report
	}

	ids := make([]string, 0, len(entries))
	for _, e := range entries {
		mf := matchEntry(ctx, ds, resolver, e)
		if mf == nil {
			if len(report.Unmatched) < maxReportedUnmatched {
				report.Unmatched = append(report.Unmatched, e.describe())
			}
			continue
		}
		ids = append(ids, mf.ID)
	}

	owner, _ := request.UserFrom(ctx)
	pls := &model.Playlist{Name: name, OwnerID: owner.ID}
	pls.AddMediaFilesByID(ids)
	if err := ds.Playlist().Put(ctx, pls); err != nil {
		report.Error = err.Error()
		return report
	}
	report.ID, report.Name = pls.ID, pls.Name
	report.Total, report.Matched = len(entries), len(ids)
	log.Info(ctx, "Imported playlist", "name", name, "total", report.Total, "matched", report.Matched)
	return report
}

func (e m3uEntry) describe() string {
	if e.title != "" {
		return strings.TrimPrefix(e.artist+" - "+e.title, " - ")
	}
	return e.path
}

// parseM3UEntries reads the playlist name and its entries with their #EXTINF metadata.
func parseM3UEntries(reader io.Reader) (string, []m3uEntry, error) {
	var name string
	var entries []m3uEntry
	var pending m3uEntry
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(strings.TrimPrefix(scanner.Text(), "\uFEFF"))
		switch {
		case line == "":
			continue
		case strings.HasPrefix(line, "#PLAYLIST:"):
			name = strings.TrimSpace(strings.TrimPrefix(line, "#PLAYLIST:"))
		case strings.HasPrefix(line, "#EXTINF:"):
			pending = parseExtInf(strings.TrimPrefix(line, "#EXTINF:"))
		case strings.HasPrefix(line, "#"):
			continue
		default:
			if after, ok := strings.CutPrefix(line, "file://"); ok {
				line, _ = url.PathUnescape(after)
			}
			pending.path = line
			entries = append(entries, pending)
			pending = m3uEntry{}
		}
	}
	return name, entries, scanner.Err()
}

// parseExtInf parses "duration,Artist - Title" (attributes before the comma are ignored).
func parseExtInf(info string) m3uEntry {
	var e m3uEntry
	head, label, found := strings.Cut(info, ",")
	if !found {
		return e
	}
	fields := strings.Fields(head)
	if len(fields) > 0 {
		e.duration, _ = strconv.ParseFloat(fields[0], 64)
	}
	if artist, title, ok := strings.Cut(label, " - "); ok {
		e.artist, e.title = strings.TrimSpace(artist), strings.TrimSpace(title)
	} else {
		e.title = strings.TrimSpace(label)
	}
	return e
}

func matchEntry(ctx context.Context, ds model.DataStore, resolver *pathResolver, e m3uEntry) *model.MediaFile {
	repo := ds.MediaFile()
	path := strings.ReplaceAll(e.path, "\\", "/")

	// 1. Exact path inside a library
	if res := resolver.resolvePath(path, nil); res.valid {
		if q, err := res.ToQualifiedString(); err == nil {
			if found, err := repo.FindByPaths(ctx, []string{norm.NFC.String(q), norm.NFD.String(q)}); err == nil && len(found) > 0 {
				return &found[0]
			}
		}
	}

	// 2. Path suffix (Artist/Album/File.ext, then Album/File.ext)
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for _, n := range []int{3, 2} {
		if len(parts) < n {
			continue
		}
		suffix := norm.NFC.String(strings.Join(parts[len(parts)-n:], "/"))
		if mf := firstMatch(ctx, repo, e.duration, Like{"media_file.path": "%/" + escapeLike(suffix)}); mf != nil {
			return mf
		}
	}

	// 3. Artist + title from #EXTINF
	if e.title != "" {
		cond := And{Expr("lower(media_file.title) = lower(?)", e.title)}
		if e.artist != "" {
			cond = append(cond, Or{
				Expr("lower(media_file.artist) = lower(?)", e.artist),
				Expr("lower(media_file.album_artist) = lower(?)", e.artist),
			})
		}
		return firstMatch(ctx, repo, e.duration, cond)
	}
	return nil
}

// firstMatch returns the candidate closest in duration, preferring files that are not missing.
func firstMatch(ctx context.Context, repo model.MediaFileRepository, duration float64, cond Sqlizer) *model.MediaFile {
	found, err := repo.GetAll(ctx, model.QueryOptions{Filters: cond, Max: 20})
	if err != nil || len(found) == 0 {
		return nil
	}
	best := -1
	bestScore := math.MaxFloat64
	for i, mf := range found {
		score := 0.0
		if duration > 0 {
			score = math.Abs(float64(mf.Duration) - duration)
		}
		if mf.Missing {
			score += 1e6
		}
		if score < bestScore {
			best, bestScore = i, score
		}
	}
	// Ignore matches whose duration is clearly different (more than 10 s apart)
	if duration > 0 && bestScore > 10 {
		return nil
	}
	return &found[best]
}

func escapeLike(s string) string {
	// SQLite LIKE without ESCAPE clause: only neutralize wildcards that are unlikely in paths
	return strings.NewReplacer("%", "_").Replace(s)
}

// ExportM3U8 returns the playlist as Extended M3U8, including missing tracks.
func ExportM3U8(ctx context.Context, ds model.DataStore, id string) (string, string, error) {
	pls, err := ds.Playlist().GetWithTracks(ctx, id, true, true)
	if err != nil {
		return "", "", err
	}
	return pls.Name, pls.MediaFiles().ToM3U8(pls.Name, true), nil
}

// SafeFileName removes characters that are not allowed in file names on common systems.
func SafeFileName(name string) string {
	clean := strings.Map(func(r rune) rune {
		if strings.ContainsRune(`<>:"/\|?*`, r) || r < 32 {
			return '_'
		}
		return r
	}, strings.TrimSpace(name))
	if clean == "" {
		clean = "playlist"
	}
	return clean
}

// UniqueName appends a counter to name when it was already used.
func UniqueName(used map[string]int, name string) string {
	key := strings.ToLower(name)
	used[key]++
	if used[key] == 1 {
		return name
	}
	return fmt.Sprintf("%s (%d)", name, used[key])
}
