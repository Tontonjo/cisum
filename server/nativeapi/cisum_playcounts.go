// Cisum v0.6.0 - Play count reset: every user can reset his own play counts of an album.
package nativeapi

import (
	"errors"
	"net/http"

	"github.com/deluan/rest"
	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/core/playcounts"
	"github.com/navidrome/navidrome/db"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
)

func (api *Router) addPlayCountRoutes(r chi.Router) {
	r.Post("/cisum/albums/{id}/reset-plays", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		user, _ := request.UserFrom(ctx)
		id := chi.URLParam(r, "id")
		// Get applies library restrictions, so a user cannot touch an album he cannot see
		if _, err := api.ds.Album().Get(ctx, id); err != nil {
			if errors.Is(err, model.ErrNotFound) {
				http.Error(w, "album not found", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		res, err := playcounts.ResetAlbum(ctx, db.Db(), user.ID, id)
		if err != nil {
			log.Error(ctx, "Could not reset album play counts", "album", id, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		log.Info(ctx, "Album play counts reset", "album", id, "user", user.UserName, "songs", res.Songs, "plays", res.Plays)
		_ = rest.RespondWithJSON(w, http.StatusOK, res)
	})
}
