// Cisum v0.6.0 - Resets the play counts of one album for one user.
package playcounts

import (
	"context"
	"database/sql"
	"fmt"
)

// Result tells what a reset changed.
type Result struct {
	Songs int   `json:"songs"` // songs of the album that had at least one play
	Plays int64 `json:"plays"` // total plays removed from those songs
}

// ResetAlbum sets the play count (and last play date) of the album and of all its songs to zero
// for userID. Play counts of the album's track artists are then recomputed from their songs, the
// same way Navidrome's RefreshPlayCounts does, so artist totals stay consistent.
// Other users' counts and the scrobble history are not touched.
func ResetAlbum(ctx context.Context, db *sql.DB, userID, albumID string) (Result, error) {
	var res Result
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return res, err
	}
	defer func() { _ = tx.Rollback() }() // no-op after a successful commit

	const songsOfAlbum = `select id from media_file where album_id = ?`

	err = tx.QueryRowContext(ctx, `select count(*), ifnull(sum(play_count), 0) from annotation
where user_id = ? and item_type = 'media_file' and play_count > 0 and item_id in (`+songsOfAlbum+`)`,
		userID, albumID).Scan(&res.Songs, &res.Plays)
	if err != nil {
		return res, fmt.Errorf("reading play counts: %w", err)
	}

	steps := []struct {
		name  string
		query string
		args  []any
	}{
		{"songs", `update annotation set play_count = 0, play_date = null
where user_id = ? and item_type = 'media_file' and item_id in (` + songsOfAlbum + `)`, []any{userID, albumID}},
		{"album", `update annotation set play_count = 0, play_date = null
where user_id = ? and item_type = 'album' and item_id = ?`, []any{userID, albumID}},
		// Track artists of the album get their total recomputed from all their songs
		{"artists", `with album_artists as (
    select distinct jt.atom as artist_id
    from media_file m, json_tree(m.participants, '$.artist') jt
    where m.album_id = ? and jt.key = 'id' and jt.atom is not null
), totals as (
    select jt.atom as artist_id, sum(a.play_count) as total, max(a.play_date) as last
    from media_file m
    join annotation a on a.item_id = m.id and a.item_type = 'media_file' and a.user_id = ?
    join json_tree(m.participants, '$.artist') jt
    where jt.key = 'id' and jt.atom in (select artist_id from album_artists)
    group by jt.atom
)
update annotation set
    play_count = ifnull((select total from totals where totals.artist_id = annotation.item_id), 0),
    play_date  = (select last from totals where totals.artist_id = annotation.item_id)
where user_id = ? and item_type = 'artist' and item_id in (select artist_id from album_artists)`,
			[]any{albumID, userID, userID}},
	}
	for _, s := range steps {
		if _, err := tx.ExecContext(ctx, s.query, s.args...); err != nil {
			return res, fmt.Errorf("resetting %s play counts: %w", s.name, err)
		}
	}
	return res, tx.Commit()
}
