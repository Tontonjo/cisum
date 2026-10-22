// Cisum v0.10.0 - Dynamic playlists: criteria catalog, value suggestions and live preview of rules.
// Dynamic playlists are Navidrome smart playlists (playlist.rules); they are created and edited with
// the regular /playlist REST endpoints. These routes only help the web player's rules editor.
package nativeapi

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/Masterminds/squirrel"
	"github.com/deluan/rest"
	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/db"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/criteria"
	"github.com/navidrome/navidrome/model/request"
)

const (
	smartPreviewDefault = 50
	smartPreviewMax     = 200
	smartValuesMax      = 25
	smartRulesMaxBytes  = 256 << 10
)

func (api *Router) addSmartPlaylistRoutes(r chi.Router) {
	r.Route("/cisum/smart", func(r chi.Router) {
		r.Get("/fields", smartFields)
		r.Get("/values", smartValues)
		r.Post("/preview", api.smartPreview)
	})
}

// smartField describes one criteria field for the rules editor.
type smartField struct {
	Name     string `json:"name"`
	Kind     string `json:"kind"` // field, tag or role
	Numeric  bool   `json:"numeric,omitempty"`
	Boolean  bool   `json:"boolean,omitempty"`
	Nullable bool   `json:"nullable,omitempty"`
}

// smartFields lists every canonical criteria field, including the tags of mappings.yaml and the
// artist roles registered at start-up. Backward compatibility aliases are left out.
func smartFields(w http.ResponseWriter, _ *http.Request) {
	names := criteria.AllFieldNames()
	slices.Sort(names)
	fields := make([]smartField, 0, len(names))
	for _, name := range names {
		info, ok := criteria.LookupField(name)
		if !ok || info.Alias != "" || name == "random" {
			continue
		}
		kind := "field"
		switch {
		case info.IsRole:
			kind = "role"
		case info.IsTag:
			kind = "tag"
		}
		fields = append(fields, smartField{
			Name: name, Kind: kind, Numeric: info.Numeric, Boolean: info.Boolean,
			Nullable: info.Nullable || info.IsTag || info.IsRole,
		})
	}
	_ = rest.RespondWithJSON(w, http.StatusOK, fields)
}

// smartValues suggests existing values for a field (?field=genre&q=ro): tag values for tags, artist
// names for roles, album names for "album". Only libraries the user can access are searched.
func smartValues(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	field := strings.ToLower(r.URL.Query().Get("field"))
	q := r.URL.Query().Get("q")
	info, ok := criteria.LookupField(field)
	if !ok {
		_ = rest.RespondWithJSON(w, http.StatusOK, []string{})
		return
	}
	usr, _ := request.UserFrom(ctx)
	like := "%" + escapeLike(q) + "%"

	var sq squirrel.SelectBuilder
	switch {
	case info.IsTag:
		sq = squirrel.Select("distinct tag.tag_value").From("tag").
			Join("library_tag on library_tag.tag_id = tag.id").
			Where(squirrel.Eq{"tag.tag_name": info.Name()}).
			Where("tag.tag_value like ? escape '\\'", like).
			OrderBy("tag.tag_value collate nocase")
		sq = whereUserLibrary(sq, "library_tag.library_id", usr)
	case info.IsRole:
		sq = squirrel.Select("distinct artist.name").From("artist").
			Join("library_artist on library_artist.artist_id = artist.id").
			Where("artist.name like ? escape '\\'", like).
			OrderBy("artist.name collate nocase")
		sq = whereUserLibrary(sq, "library_artist.library_id", usr)
	case info.Name() == "album":
		sq = squirrel.Select("distinct media_file.album").From("media_file").
			Where("media_file.album like ? escape '\\'", like).
			OrderBy("media_file.album collate nocase")
		sq = whereUserLibrary(sq, "media_file.library_id", usr)
	default:
		_ = rest.RespondWithJSON(w, http.StatusOK, []string{})
		return
	}
	values, err := queryStrings(ctx, sq.Limit(smartValuesMax))
	if err != nil {
		log.Error(ctx, "Error loading smart playlist value suggestions", "field", field, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = rest.RespondWithJSON(w, http.StatusOK, values)
}

// smartPreview evaluates the rules in the request body (same JSON as playlist.rules) and returns
// {count, songs}: the number of songs the playlist would contain and the first ?size= of them.
func (api *Router) smartPreview(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	body, err := io.ReadAll(io.LimitReader(r.Body, smartRulesMaxBytes))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var rules criteria.Criteria
	if err := json.Unmarshal(body, &rules); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	size, _ := strconv.Atoi(r.URL.Query().Get("size"))
	if size <= 0 {
		size = smartPreviewDefault
	}
	size = min(size, smartPreviewMax)

	count, ids, err := api.ds.Playlist().PreviewSmartPlaylist(ctx, rules, size)
	if err != nil {
		// Invalid rules (unknown field, bad value) end up here: report them to the editor
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	songs := model.MediaFiles{}
	if len(ids) > 0 {
		files, err := api.ds.MediaFile().GetAll(ctx, model.QueryOptions{Filters: squirrel.Eq{"media_file.id": ids}})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// Keep the playlist order
		byID := make(map[string]model.MediaFile, len(files))
		for _, f := range files {
			byID[f.ID] = f
		}
		for _, id := range ids {
			if f, ok := byID[id]; ok {
				songs = append(songs, f)
			}
		}
	}
	_ = rest.RespondWithJSON(w, http.StatusOK, map[string]any{"count": count, "songs": songs})
}

// whereUserLibrary restricts a query to the libraries of a regular user (administrators see all).
func whereUserLibrary(sq squirrel.SelectBuilder, column string, usr model.User) squirrel.SelectBuilder {
	if usr.IsAdmin {
		return sq
	}
	return sq.Where(column+" in (select library_id from user_library where user_id = ?)", usr.ID)
}

func queryStrings(ctx context.Context, sq squirrel.SelectBuilder) ([]string, error) {
	query, args, err := sq.ToSql()
	if err != nil {
		return nil, err
	}
	rows, err := db.Db().QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []string{}
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		if v != "" {
			values = append(values, v)
		}
	}
	return values, rows.Err()
}

// escapeLike escapes the LIKE wildcards of a user search (escape character: backslash).
func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}
