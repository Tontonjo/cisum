// Package permissions implements Cisum per-user rights (v0.4.0).
//
// Rights are stored as JSON in the user_props table and checked on the server, for the web player
// and for Subsonic apps. Administrators always have every right. Missing values fall back to
// Defaults, so existing users keep their current abilities after an upgrade.
package permissions

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
)

const propsKey = "cisum.permissions"

// Right names, used by middlewares and the API.
const (
	Download             = "download"
	Share                = "share"
	PlaylistImportExport = "playlistImportExport"
)

// Permissions are the rights a regular user can be given or refused.
type Permissions struct {
	Download             bool `json:"download"`             // download original files and albums
	Share                bool `json:"share"`                // create public share links
	PlaylistImportExport bool `json:"playlistImportExport"` // import and export M3U playlists
}

// Defaults applies to users that were never edited.
var Defaults = Permissions{Download: true, Share: true, PlaylistImportExport: true}

var all = Permissions{Download: true, Share: true, PlaylistImportExport: true}

// Get returns the effective rights of a user.
func Get(ctx context.Context, ds model.DataStore, user model.User) Permissions {
	if user.IsAdmin {
		return all
	}
	p := Defaults
	value, err := ds.UserProps().DefaultGet(ctx, user.ID, propsKey, "")
	if err != nil || value == "" {
		return p
	}
	if err := json.Unmarshal([]byte(value), &p); err != nil {
		log.Warn(ctx, "Invalid permissions stored for user, using defaults", "user", user.UserName, err)
		return Defaults
	}
	return p
}

// Set stores the rights of a user.
func Set(ctx context.Context, ds model.DataStore, userID string, p Permissions) error {
	data, err := json.Marshal(p)
	if err != nil {
		return err
	}
	return ds.UserProps().Put(ctx, userID, propsKey, string(data))
}

// Has reports whether a user holds the named right.
func (p Permissions) Has(right string) bool {
	switch right {
	case Download:
		return p.Download
	case Share:
		return p.Share
	case PlaylistImportExport:
		return p.PlaylistImportExport
	}
	return false
}

// Allowed checks the right for the user of the request context.
func Allowed(ctx context.Context, ds model.DataStore, right string) bool {
	user, ok := request.UserFrom(ctx)
	if !ok {
		return false
	}
	return Get(ctx, ds, user).Has(right)
}

// Require returns a middleware answering 403 when the logged user lacks the right.
// onDenied writes the error; nil writes a plain HTTP 403.
func Require(ds model.DataStore, right string, onDenied func(w http.ResponseWriter, r *http.Request)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if Allowed(r.Context(), ds, right) {
				next.ServeHTTP(w, r)
				return
			}
			user, _ := request.UserFrom(r.Context())
			log.Warn(r.Context(), "Permission denied", "user", user.UserName, "right", right, "path", r.URL.Path)
			if onDenied != nil {
				onDenied(w, r)
				return
			}
			http.Error(w, "You are not allowed to do this. Ask an administrator.", http.StatusForbidden)
		})
	}
}
