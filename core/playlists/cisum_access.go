// Cisum v0.5.0 - Playlist access: visibility (private, all users, selected users) and editors.
//
// The owner (creator or import target) and administrators manage these settings. Editors can add,
// remove and reorder songs, but cannot rename, delete or change the access of the playlist.
// Rows live in the playlist_access table; "all users" reuses the playlist "public" flag.
package playlists

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/navidrome/navidrome/db"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
)

// Visibility values.
const (
	VisibilityPrivate = "private" // owner and editors only
	VisibilityUsers   = "users"   // owner, selected viewers and editors
	VisibilityAll     = "all"     // every user of the server
)

// Access describes who can see and edit a playlist, and what the current user may do.
type Access struct {
	OwnerID    string   `json:"ownerId"`
	OwnerName  string   `json:"ownerName"`
	Visibility string   `json:"visibility"`
	Viewers    []string `json:"viewers"`
	Editors    []string `json:"editors"`
	CanEdit    bool     `json:"canEdit"`   // current user can change the songs
	CanManage  bool     `json:"canManage"` // current user can change settings, rename, delete
	ReadOnly   bool     `json:"readOnly"`  // smart or file-synced playlist: songs cannot be edited by anyone
}

// AccessUpdate is sent by the owner or an administrator. OwnerID is honored for administrators only.
type AccessUpdate struct {
	Visibility string   `json:"visibility"`
	Viewers    []string `json:"viewers"`
	Editors    []string `json:"editors"`
	OwnerID    string   `json:"ownerId,omitempty"`
}

// IsEditor reports whether the user was given edit access to the playlist.
func IsEditor(ctx context.Context, playlistID, userID string) bool {
	var n int
	err := db.Db().QueryRowContext(ctx,
		`select count(*) from playlist_access where playlist_id = ? and user_id = ? and can_edit = 1`,
		playlistID, userID).Scan(&n)
	return err == nil && n > 0
}

// GetAccess returns the access settings of a playlist visible to the current user.
func GetAccess(ctx context.Context, ds model.DataStore, id string) (*Access, error) {
	pls, err := ds.Playlist().Get(ctx, id)
	if err != nil {
		return nil, err
	}
	usr, _ := request.UserFrom(ctx)
	a := &Access{OwnerID: pls.OwnerID, OwnerName: pls.OwnerName, Viewers: []string{}, Editors: []string{}, ReadOnly: !pls.TracksEditable()}
	rows, err := db.Db().QueryContext(ctx, `select user_id, can_edit from playlist_access where playlist_id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var uid string
		var canEdit bool
		if err := rows.Scan(&uid, &canEdit); err != nil {
			return nil, err
		}
		if canEdit {
			a.Editors = append(a.Editors, uid)
		} else {
			a.Viewers = append(a.Viewers, uid)
		}
	}
	switch {
	case pls.Public:
		a.Visibility = VisibilityAll
	case len(a.Viewers) > 0:
		a.Visibility = VisibilityUsers
	default:
		a.Visibility = VisibilityPrivate
	}
	a.CanManage = usr.IsAdmin || pls.OwnerID == usr.ID
	a.CanEdit = !a.ReadOnly && (a.CanManage || slices.Contains(a.Editors, usr.ID))
	return a, rows.Err()
}

// SetAccess replaces the access settings. Only the owner or an administrator may call it.
func SetAccess(ctx context.Context, ds model.DataStore, id string, upd AccessUpdate) (*Access, error) {
	pls, err := ds.Playlist().Get(ctx, id)
	if err != nil {
		return nil, err
	}
	usr, _ := request.UserFrom(ctx)
	if !usr.IsAdmin && pls.OwnerID != usr.ID {
		return nil, model.ErrNotAuthorized
	}
	if !slices.Contains([]string{VisibilityPrivate, VisibilityUsers, VisibilityAll}, upd.Visibility) {
		return nil, fmt.Errorf("%w: unknown visibility %q", model.ErrValidation, upd.Visibility)
	}
	owner := pls.OwnerID
	if upd.OwnerID != "" && upd.OwnerID != owner {
		if !usr.IsAdmin {
			return nil, errors.New("only an administrator can change the owner")
		}
		if _, err := ds.User().Get(ctx, upd.OwnerID); err != nil {
			return nil, fmt.Errorf("new owner: %w", err)
		}
		owner = upd.OwnerID
	}

	tx, err := db.Db().BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `update playlist set public = ?, owner_id = ?, updated_at = ? where id = ?`,
		upd.Visibility == VisibilityAll, owner, time.Now(), id); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `delete from playlist_access where playlist_id = ?`, id); err != nil {
		return nil, err
	}
	insert := func(userID string, canEdit bool) error {
		if userID == "" || userID == owner {
			return nil // the owner always has full access
		}
		_, err := tx.ExecContext(ctx, `insert into playlist_access (playlist_id, user_id, can_edit) values (?, ?, ?)
			on conflict (playlist_id, user_id) do update set can_edit = max(can_edit, excluded.can_edit)`, id, userID, canEdit)
		return err
	}
	for _, e := range upd.Editors {
		if err := insert(e, true); err != nil {
			return nil, err
		}
	}
	if upd.Visibility == VisibilityUsers {
		for _, v := range upd.Viewers {
			if err := insert(v, false); err != nil {
				return nil, err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return GetAccess(ctx, ds, id)
}
