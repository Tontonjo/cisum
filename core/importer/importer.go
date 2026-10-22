// Cisum v0.5.0 - Import job: reads the remote account, matches songs/albums/artists to the local
// library, then writes playlists, favorites, ratings and play counts for a local user.
package importer

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"sync"
	"time"
	"unicode"

	. "github.com/Masterminds/squirrel"
	"github.com/navidrome/navidrome/db"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

const (
	maxListed         = 100 // unmatched items listed per category in the report
	durationTolerance = 5.0 // seconds, for artist + title matching
)

// Options selects what to import and for which local user.
type Options struct {
	Source       Source `json:"source"`
	TargetUserID string `json:"targetUserId"`
	Playlists    bool   `json:"playlists"`
	Favorites    bool   `json:"favorites"`
	Ratings      bool   `json:"ratings"`
	PlayCounts   bool   `json:"playCounts"`
}

// Category summarizes one kind of imported data.
type Category struct {
	Total     int      `json:"total"`
	Imported  int      `json:"imported"`
	Unmatched []string `json:"unmatched,omitempty"`
	Notes     []string `json:"notes,omitempty"`
}

// Report is the state of the current or last import.
type Report struct {
	Status     string               `json:"status"` // idle, running, done, failed
	Step       string               `json:"step,omitempty"`
	Progress   float64              `json:"progress"` // 0-100
	Server     string               `json:"server,omitempty"`
	TargetUser string               `json:"targetUser,omitempty"`
	StartedAt  *time.Time           `json:"startedAt,omitempty"`
	FinishedAt *time.Time           `json:"finishedAt,omitempty"`
	Error      string               `json:"error,omitempty"`
	Categories map[string]*Category `json:"categories,omitempty"`
}

var (
	mu      sync.Mutex
	current = Report{Status: "idle"}
)

// Status returns a copy of the current report.
func Status() Report {
	mu.Lock()
	defer mu.Unlock()
	r := current
	return r
}

func update(fn func(r *Report)) {
	mu.Lock()
	defer mu.Unlock()
	fn(&current)
}

// Start launches the import in the background. Only one import runs at a time.
func Start(ds model.DataStore, opts Options) error {
	if !opts.Playlists && !opts.Favorites && !opts.Ratings && !opts.PlayCounts {
		return errors.New("choose at least one kind of data to import")
	}
	target, err := ds.User().Get(context.Background(), opts.TargetUserID)
	if err != nil {
		return fmt.Errorf("local user not found: %w", err)
	}
	if libs, err := ds.User().GetUserLibraries(context.Background(), target.ID); err == nil {
		target.Libraries = libs
	}
	server, err := Ping(context.Background(), opts.Source)
	if err != nil {
		return err
	}

	mu.Lock()
	if current.Status == "running" {
		mu.Unlock()
		return errors.New("an import is already running")
	}
	now := time.Now()
	current = Report{Status: "running", Step: "Starting", Server: server, TargetUser: target.UserName,
		StartedAt: &now, Categories: map[string]*Category{}}
	mu.Unlock()

	go func() {
		ctx := request.WithUser(context.Background(), *target)
		err := run(ctx, ds, opts, *target)
		end := time.Now()
		update(func(r *Report) {
			r.FinishedAt = &end
			r.Step = ""
			if err != nil {
				r.Status, r.Error = "failed", err.Error()
				log.Error(ctx, "Import failed", "server", opts.Source.URL, err)
				return
			}
			r.Status = "done"
			log.Info(ctx, "Import finished", "server", opts.Source.URL, "user", target.UserName)
		})
	}()
	return nil
}

func setStep(step string) { update(func(r *Report) { r.Step = step }) }

// phase is a slice of the overall progress bar, sized by the expected amount of work.
type phase struct{ from, to float64 }

// set reports progress inside the phase (fraction 0-1).
func (p phase) set(fraction float64) {
	fraction = max(0, min(fraction, 1))
	update(func(r *Report) { r.Progress = p.from + (p.to-p.from)*fraction })
}

// planPhases splits 0-100 between the selected steps, by relative weight.
func planPhases(opts Options) map[string]phase {
	weights := []struct {
		name string
		w    float64
		on   bool
	}{
		{"index", 5, true},
		{"songs", 45, opts.Ratings || opts.PlayCounts},
		{"ratings", 10, opts.Ratings},
		{"playCounts", 10, opts.PlayCounts},
		{"favorites", 5, opts.Favorites},
		{"playlists", 25, opts.Playlists},
	}
	total := 0.0
	for _, w := range weights {
		if w.on {
			total += w.w
		}
	}
	res := map[string]phase{}
	pos := 0.0
	for _, w := range weights {
		if !w.on {
			continue
		}
		size := 100 * w.w / total
		res[w.name] = phase{pos, pos + size}
		pos += size
	}
	return res
}

func addCategory(name string, c *Category) { update(func(r *Report) { r.Categories[name] = c }) }

func run(ctx context.Context, ds model.DataStore, opts Options, target model.User) error {
	c := newClient(opts.Source)
	phases := planPhases(opts)

	setStep("Indexing the local library")
	idx, err := buildIndex(ctx, ds)
	if err != nil {
		return fmt.Errorf("reading local library: %w", err)
	}
	phases["index"].set(1)

	if opts.Ratings || opts.PlayCounts {
		setStep("Reading all songs of the remote account")
		// The remote song total (when the server reports it) gives a real percentage while reading
		remoteTotal := 0
		if r, err := c.call(ctx, "getScanStatus", nil); err == nil && r.ScanStatus != nil {
			remoteTotal = r.ScanStatus.Count
		}
		songs, err := c.allSongs(ctx, func(n int) {
			if remoteTotal > 0 {
				setStep(fmt.Sprintf("Reading remote songs (%d of %d)", n, remoteTotal))
				phases["songs"].set(float64(n) / float64(remoteTotal))
			} else {
				setStep(fmt.Sprintf("Reading remote songs (%d)", n))
			}
		})
		if err != nil {
			return err
		}
		phases["songs"].set(1)
		if opts.Ratings {
			setStep("Importing ratings")
			albums, artists := c.allAlbumsAndArtists(ctx)
			addCategory("ratings", importRatings(ctx, ds, idx, songs, albums, artists))
			phases["ratings"].set(1)
		}
		if opts.PlayCounts {
			setStep("Importing play counts")
			cat, err := importPlayCounts(ctx, idx, target, songs)
			if err != nil {
				return err
			}
			addCategory("playCounts", cat)
			phases["playCounts"].set(1)
		}
	}

	if opts.Favorites {
		setStep("Importing favorites")
		r, err := c.call(ctx, "getStarred2", nil)
		if err != nil {
			return err
		}
		addCategory("favorites", importFavorites(ctx, ds, idx, r))
		phases["favorites"].set(1)
	}

	if opts.Playlists {
		setStep("Importing playlists")
		cat, err := importPlaylists(ctx, ds, c, idx, opts.Source.Username, target, phases["playlists"])
		if err != nil {
			return err
		}
		addCategory("playlists", cat)
	}
	update(func(r *Report) { r.Progress = 100 })
	return nil
}

// ---------- Local index and matching ----------

type localSong struct {
	id, albumID, artistID string
	duration              float64
}

type index struct {
	songByMbid      map[string]localSong
	songByPath      map[string]localSong
	songByFull      map[string]localSong   // artist|title|album
	songsByArtTitle map[string][]localSong // artist|title
	albumByMbid     map[string]string
	albumByName     map[string]string // album artist|name
	albumByTitle    map[string][]string
	artistByMbid    map[string]string
	artistByName    map[string]string
}

var stripMarks = transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)

// key normalizes text for matching: lower case, no accents, letters and digits only.
func key(parts ...string) string {
	out := make([]string, len(parts))
	for i, p := range parts {
		s, _, _ := transform.String(stripMarks, strings.ToLower(p))
		s = strings.Map(func(r rune) rune {
			if unicode.IsLetter(r) || unicode.IsDigit(r) {
				return r
			}
			return ' '
		}, s)
		out[i] = strings.Join(strings.Fields(s), " ")
	}
	return strings.Join(out, "|")
}

// pathKey keeps the last 3 path components (Artist/Album/File), the most stable part across servers.
func pathKey(p string) string {
	p = strings.ReplaceAll(p, "\\", "/")
	parts := strings.Split(strings.Trim(p, "/"), "/")
	if len(parts) > 3 {
		parts = parts[len(parts)-3:]
	}
	if len(parts) < 2 {
		return ""
	}
	return strings.ToLower(norm.NFC.String(strings.Join(parts, "/")))
}

func buildIndex(ctx context.Context, ds model.DataStore) (*index, error) {
	idx := &index{
		songByMbid: map[string]localSong{}, songByPath: map[string]localSong{}, songByFull: map[string]localSong{},
		songsByArtTitle: map[string][]localSong{}, albumByMbid: map[string]string{}, albumByName: map[string]string{},
		albumByTitle: map[string][]string{}, artistByMbid: map[string]string{}, artistByName: map[string]string{},
	}
	mfs, err := ds.MediaFile().GetAll(ctx, model.QueryOptions{Filters: Eq{"missing": false}})
	if err != nil {
		return nil, err
	}
	for _, mf := range mfs {
		s := localSong{id: mf.ID, albumID: mf.AlbumID, artistID: mf.ArtistID, duration: float64(mf.Duration)}
		if mf.MbzRecordingID != "" {
			idx.songByMbid[mf.MbzRecordingID] = s
		}
		if pk := pathKey(mf.Path); pk != "" {
			idx.songByPath[pk] = s
		}
		idx.songByFull[key(mf.Artist, mf.Title, mf.Album)] = s
		idx.songByFull[key(mf.AlbumArtist, mf.Title, mf.Album)] = s
		at := key(mf.Artist, mf.Title)
		idx.songsByArtTitle[at] = append(idx.songsByArtTitle[at], s)
	}
	albums, err := ds.Album().GetAll(ctx, model.QueryOptions{Filters: Eq{"missing": false}})
	if err != nil {
		return nil, err
	}
	for _, a := range albums {
		if a.MbzAlbumID != "" {
			idx.albumByMbid[a.MbzAlbumID] = a.ID
		}
		idx.albumByName[key(a.AlbumArtist, a.Name)] = a.ID
		t := key(a.Name)
		idx.albumByTitle[t] = append(idx.albumByTitle[t], a.ID)
	}
	artists, err := ds.Artist().GetAll(ctx)
	if err != nil {
		return nil, err
	}
	for _, a := range artists {
		if a.MbzArtistID != "" {
			idx.artistByMbid[a.MbzArtistID] = a.ID
		}
		idx.artistByName[key(a.Name)] = a.ID
	}
	return idx, nil
}

// song finds the local song for a remote one: MusicBrainz ID, path, artist+title+album, then
// artist+title with the closest duration.
func (idx *index) song(s remoteSong) (localSong, bool) {
	if s.MusicBrainzID != "" {
		if l, ok := idx.songByMbid[s.MusicBrainzID]; ok {
			return l, true
		}
	}
	if pk := pathKey(s.Path); pk != "" && !strings.HasPrefix(pk, "/") {
		if l, ok := idx.songByPath[pk]; ok {
			return l, true
		}
	}
	for _, artist := range []string{s.Artist, s.DisplayArtist} {
		if artist == "" {
			continue
		}
		if l, ok := idx.songByFull[key(artist, s.Title, s.Album)]; ok {
			return l, true
		}
	}
	best, bestDiff := localSong{}, math.MaxFloat64
	for _, l := range idx.songsByArtTitle[key(s.Artist, s.Title)] {
		if d := math.Abs(l.duration - s.Duration); d < bestDiff {
			best, bestDiff = l, d
		}
	}
	if best.id != "" && (s.Duration == 0 || bestDiff <= durationTolerance) {
		return best, true
	}
	return localSong{}, false
}

func (idx *index) album(a remoteAlbum) (string, bool) {
	if a.MusicBrainzID != "" {
		if id, ok := idx.albumByMbid[a.MusicBrainzID]; ok {
			return id, true
		}
	}
	name := a.Name
	if name == "" {
		name = a.Title
	}
	if id, ok := idx.albumByName[key(a.Artist, name)]; ok {
		return id, true
	}
	if ids := idx.albumByTitle[key(name)]; len(ids) == 1 { // unique title in the library
		return ids[0], true
	}
	return "", false
}

func (idx *index) artist(a remoteArtist) (string, bool) {
	if a.MusicBrainzID != "" {
		if id, ok := idx.artistByMbid[a.MusicBrainzID]; ok {
			return id, true
		}
	}
	id, ok := idx.artistByName[key(a.Name)]
	return id, ok
}

func describeSong(s remoteSong) string {
	return strings.TrimPrefix(s.Artist+" - "+s.Title, " - ")
}

func (c *Category) miss(item string) {
	if len(c.Unmatched) < maxListed {
		c.Unmatched = append(c.Unmatched, item)
	}
}

// ---------- Writers ----------

func importFavorites(ctx context.Context, ds model.DataStore, idx *index, r *response) *Category {
	cat := &Category{}
	if r.Starred2 == nil {
		return cat
	}
	var songs, albums, artists []string
	for _, s := range r.Starred2.Song {
		cat.Total++
		if l, ok := idx.song(s); ok {
			songs = append(songs, l.id)
		} else {
			cat.miss("Song: " + describeSong(s))
		}
	}
	for _, a := range r.Starred2.Album {
		cat.Total++
		if id, ok := idx.album(a); ok {
			albums = append(albums, id)
		} else {
			cat.miss("Album: " + strings.TrimPrefix(a.Artist+" - "+a.Name+a.Title, " - "))
		}
	}
	for _, a := range r.Starred2.Artist {
		cat.Total++
		if id, ok := idx.artist(a); ok {
			artists = append(artists, id)
		} else {
			cat.miss("Artist: " + a.Name)
		}
	}
	star := func(repo model.AnnotatedRepository, ids []string) {
		if len(ids) == 0 {
			return
		}
		if err := repo.SetStar(ctx, true, ids...); err != nil {
			cat.Notes = append(cat.Notes, err.Error())
			return
		}
		cat.Imported += len(ids)
	}
	star(ds.MediaFile(), songs)
	star(ds.Album(), albums)
	star(ds.Artist(), artists)
	return cat
}

func importRatings(ctx context.Context, ds model.DataStore, idx *index, songs []remoteSong, albums []remoteAlbum, artists []remoteArtist) *Category {
	cat := &Category{}
	rate := func(repo model.AnnotatedRepository, id string, rating int) {
		if err := repo.SetRating(ctx, rating, id); err == nil {
			cat.Imported++
		}
	}
	for _, s := range songs {
		if s.UserRating <= 0 {
			continue
		}
		cat.Total++
		if l, ok := idx.song(s); ok {
			rate(ds.MediaFile(), l.id, s.UserRating)
		} else {
			cat.miss(fmt.Sprintf("Song: %s (%d stars)", describeSong(s), s.UserRating))
		}
	}
	for _, a := range albums {
		if a.UserRating <= 0 {
			continue
		}
		cat.Total++
		if id, ok := idx.album(a); ok {
			rate(ds.Album(), id, a.UserRating)
		} else {
			cat.miss(fmt.Sprintf("Album: %s (%d stars)", a.Name, a.UserRating))
		}
	}
	for _, a := range artists {
		if a.UserRating <= 0 {
			continue
		}
		cat.Total++
		if id, ok := idx.artist(a); ok {
			rate(ds.Artist(), id, a.UserRating)
		} else {
			cat.miss(fmt.Sprintf("Artist: %s (%d stars)", a.Name, a.UserRating))
		}
	}
	return cat
}

// importPlayCounts keeps the highest count between local and remote (never adds them twice), for
// songs and for their albums and artists (sum of the imported song counts).
func importPlayCounts(ctx context.Context, idx *index, target model.User, songs []remoteSong) (*Category, error) {
	cat := &Category{}
	type agg struct {
		count int64
		last  time.Time
	}
	items := map[string]map[string]*agg{"media_file": {}, "album": {}, "artist": {}}
	add := func(kind, id string, count int64, last time.Time) {
		if id == "" {
			return
		}
		a := items[kind][id]
		if a == nil {
			a = &agg{}
			items[kind][id] = a
		}
		if kind == "media_file" {
			a.count = max(a.count, count)
		} else {
			a.count += count
		}
		if last.After(a.last) {
			a.last = last
		}
	}
	for _, s := range songs {
		if s.PlayCount <= 0 {
			continue
		}
		cat.Total++
		l, ok := idx.song(s)
		if !ok {
			cat.miss(fmt.Sprintf("%s (%d plays)", describeSong(s), s.PlayCount))
			continue
		}
		last, _ := time.Parse(time.RFC3339, s.Played)
		add("media_file", l.id, s.PlayCount, last)
		add("album", l.albumID, s.PlayCount, last)
		add("artist", l.artistID, s.PlayCount, last)
		cat.Imported++
	}

	const upsert = `insert into annotation (user_id, item_id, item_type, play_count, play_date) values (?, ?, ?, ?, ?)
on conflict (user_id, item_id, item_type) do update set
  play_count = max(annotation.play_count, excluded.play_count),
  play_date = case when excluded.play_date is null then annotation.play_date
                   else max(ifnull(annotation.play_date, ''), excluded.play_date) end`
	tx, err := db.Db().BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	for kind, m := range items {
		for id, a := range m {
			var last any
			if !a.last.IsZero() {
				last = a.last
			}
			if _, err := tx.ExecContext(ctx, upsert, target.ID, id, kind, a.count, last); err != nil {
				_ = tx.Rollback()
				return nil, fmt.Errorf("saving play counts: %w", err)
			}
		}
	}
	return cat, tx.Commit()
}

func importPlaylists(ctx context.Context, ds model.DataStore, c *client, idx *index, remoteUser string, target model.User, ph phase) (*Category, error) {
	cat := &Category{}
	r, err := c.call(ctx, "getPlaylists", nil)
	if err != nil {
		return nil, err
	}
	existing := map[string]bool{}
	if own, err := ds.Playlist().GetAll(ctx, model.QueryOptions{Filters: Eq{"owner_id": target.ID}}); err == nil {
		for _, p := range own {
			existing[strings.ToLower(p.Name)] = true
		}
	}
	if r.Playlists == nil {
		return cat, nil
	}
	for i, p := range r.Playlists.Playlist {
		ph.set(float64(i) / float64(len(r.Playlists.Playlist)))
		setStep(fmt.Sprintf("Importing playlists (%d of %d)", i+1, len(r.Playlists.Playlist)))
		// Only the account's own playlists: public playlists of other users are not theirs to copy
		if p.Owner != "" && !strings.EqualFold(p.Owner, remoteUser) {
			continue
		}
		cat.Total++
		full, err := c.call(ctx, "getPlaylist", map[string][]string{"id": {p.ID}})
		if err != nil || full.Playlist == nil {
			cat.Notes = append(cat.Notes, fmt.Sprintf("%s: could not be read", p.Name))
			continue
		}
		var ids []string
		missing := 0
		for _, s := range full.Playlist.Entry {
			if l, ok := idx.song(s); ok {
				ids = append(ids, l.id)
			} else {
				missing++
				cat.miss(fmt.Sprintf("%s: %s", p.Name, describeSong(s)))
			}
		}
		name := p.Name
		if existing[strings.ToLower(name)] {
			name += " (imported)"
		}
		pls := &model.Playlist{Name: name, Comment: p.Comment, OwnerID: target.ID, Public: false}
		pls.AddMediaFilesByID(ids)
		if err := ds.Playlist().Put(ctx, pls); err != nil {
			cat.Notes = append(cat.Notes, fmt.Sprintf("%s: %v", p.Name, err))
			continue
		}
		existing[strings.ToLower(name)] = true
		cat.Imported++
		note := fmt.Sprintf("%s: %d of %d songs", name, len(ids), len(full.Playlist.Entry))
		if missing > 0 {
			note += fmt.Sprintf(", %d not found", missing)
		}
		cat.Notes = append(cat.Notes, note)
	}
	return cat, nil
}
