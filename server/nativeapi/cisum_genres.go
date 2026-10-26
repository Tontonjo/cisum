// Cisum v0.11.6 - Genres: list with live counts, and one genre by id.
// Counts only include albums and songs present on disk (missing = 0) in the libraries the user can access,
// so a genre whose files were all deleted disappears from the list.
package nativeapi

import (
	"context"
	"net/http"
	"sort"
	"strings"

	"github.com/deluan/rest"
	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/db"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
)

type genreStats struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	AlbumCount  int    `json:"albumCount"`
	SongCount   int    `json:"songCount"`
	ArtistCount int    `json:"artistCount"`
}

func (api *Router) addGenreRoutes(r chi.Router) {
	r.Get("/cisum/genres", func(w http.ResponseWriter, r *http.Request) {
		genres, err := loadGenreStats(r.Context(), "")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, genres)
	})
	r.Get("/cisum/genres/{id}", func(w http.ResponseWriter, r *http.Request) {
		genres, err := loadGenreStats(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if len(genres) == 0 {
			http.Error(w, "genre not found", http.StatusNotFound)
			return
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, genres[0])
	})
}

// loadGenreStats returns the genres that still have albums or songs, sorted by name.
// genreID limits the result to one genre (empty = all).
func loadGenreStats(ctx context.Context, genreID string) ([]genreStats, error) {
	user, _ := request.UserFrom(ctx)
	// Restriction to the user's libraries (administrators see every library)
	libFilter, libArgs := "", []any{}
	if !user.IsAdmin {
		libFilter = " and x.library_id in (select library_id from user_library where user_id = ?)"
		libArgs = append(libArgs, user.ID)
	}
	tagFilter, tagArgs := "", []any{}
	if genreID != "" {
		tagFilter = " and t.tag_id = ?"
		tagArgs = append(tagArgs, genreID)
	}
	args := func() []any { return append(append([]any{}, tagArgs...), libArgs...) }

	byID := map[string]*genreStats{}
	get := func(id string) *genreStats {
		if byID[id] == nil {
			byID[id] = &genreStats{ID: id}
		}
		return byID[id]
	}
	counts := []struct {
		query string
		set   func(g *genreStats, n int)
	}{
		{`select t.tag_id, count(*) from album_tags t join album x on x.id = t.album_id
			where x.missing = 0` + tagFilter + libFilter + ` group by t.tag_id`,
			func(g *genreStats, n int) { g.AlbumCount = n }},
		{`select t.tag_id, count(*) from media_file_tags t join media_file x on x.id = t.media_file_id
			where x.missing = 0` + tagFilter + libFilter + ` group by t.tag_id`,
			func(g *genreStats, n int) { g.SongCount = n }},
		{`select t.tag_id, count(distinct aa.artist_id) from album_tags t join album x on x.id = t.album_id
			join album_artists aa on aa.album_id = x.id and aa.role = 'albumartist'
			where x.missing = 0` + tagFilter + libFilter + ` group by t.tag_id`,
			func(g *genreStats, n int) { g.ArtistCount = n }},
	}
	for _, c := range counts {
		rows, err := db.Db().QueryContext(ctx, c.query, args()...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id string
			var n int
			if rows.Scan(&id, &n) == nil {
				c.set(get(id), n)
			}
		}
		rows.Close()
	}
	if len(byID) == 0 {
		return []genreStats{}, nil
	}

	// Names from the tag dictionary
	nameQuery := `select id, tag_value from tag where tag_name = ?`
	nameArgs := []any{string(model.TagGenre)}
	if genreID != "" {
		nameQuery += " and id = ?"
		nameArgs = append(nameArgs, genreID)
	}
	rows, err := db.Db().QueryContext(ctx, nameQuery, nameArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	res := make([]genreStats, 0, len(byID))
	for rows.Next() {
		var id, name string
		if rows.Scan(&id, &name) != nil {
			continue
		}
		if g := byID[id]; g != nil {
			g.Name = name
			res = append(res, *g)
		}
	}
	sort.Slice(res, func(i, j int) bool { return strings.ToLower(res[i].Name) < strings.ToLower(res[j].Name) })
	return res, nil
}
