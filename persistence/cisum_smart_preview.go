// Cisum v0.10.0 - Dynamic playlists: evaluates smart playlist rules without saving anything.
package persistence

import (
	"context"
	"errors"

	. "github.com/Masterminds/squirrel"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/criteria"
)

// PreviewSmartPlaylist evaluates rules for the logged user, exactly like a smart playlist refresh
// (same joins, library filter, sort, limit and offset), but only reads. It returns the number of
// songs the playlist would contain and the ids of the first maxIDs of them, in playlist order.
// Referenced playlists (inPlaylist / notInPlaylist) are used as they currently are, not refreshed.
func (r *playlistRepository) PreviewSmartPlaylist(ctx context.Context, rules criteria.Criteria, maxIDs int) (int64, []string, error) {
	usr := loggedUser(ctx)
	rulesSQL := newSmartPlaylistCriteria(rules, withSmartPlaylistOwner(*usr))
	cond, err := rulesSQL.where()
	if err != nil {
		return 0, nil, err
	}

	// Songs matching the rules, before limit and offset
	countSq := Select("count(*) as count").From("media_file")
	countSq = rulesSQL.applyExpressionJoins(countSq, usr.ID)
	countSq = r.applyLibraryFilter(ctx, countSq, "media_file").Where(cond)
	var res struct{ Count int64 }
	if err = r.queryOne(ctx, countSq, &res); err != nil {
		return 0, nil, err
	}
	rulesSQL.ResolveLimit(res.Count)

	total := max(res.Count-int64(rulesSQL.Offset), 0)
	if rulesSQL.Limit > 0 {
		total = min(total, int64(rulesSQL.Limit))
	}
	take := min(int64(maxIDs), total)
	if take <= 0 {
		return total, []string{}, nil
	}

	idSq := Select("media_file.id").From("media_file")
	idSq = rulesSQL.applyRequiredJoins(idSq, usr.ID)
	idSq = r.applyLibraryFilter(ctx, idSq, "media_file").Where(cond)
	if order := rulesSQL.orderBy(); order != "" {
		idSq = idSq.OrderBy(order)
	}
	idSq = idSq.Limit(uint64(take)).Offset(uint64(rulesSQL.Offset))
	var ids []string
	if err = r.queryAllSlice(ctx, idSq, &ids); err != nil && !errors.Is(err, model.ErrNotFound) {
		return 0, nil, err
	}
	return total, ids, nil
}
