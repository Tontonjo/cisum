package model

import "github.com/Masterminds/squirrel"

// PlaylistVisibleTo returns the condition matching the playlists a user may see as a regular user:
// public ones, the ones they own and the ones shared with them (viewer or editor).
// Cisum uses it for every user, and for administrators in playlist lists (web player, Subsonic
// getPlaylists), so they are not flooded with other people's private playlists. Administrators still
// open, edit and delete any playlist by id, and the admin panel lists them all (filter admin_all).
func PlaylistVisibleTo(userID string) squirrel.Sqlizer {
	return squirrel.Or{
		squirrel.Eq{"public": true},
		squirrel.Eq{"owner_id": userID},
		squirrel.Expr("playlist.id in (select playlist_id from playlist_access where user_id = ?)", userID),
	}
}
