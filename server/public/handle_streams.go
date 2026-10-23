package public

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/navidrome/navidrome/core/auth"
	streampkg "github.com/navidrome/navidrome/core/stream"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	. "github.com/navidrome/navidrome/utils/gg"
	"github.com/navidrome/navidrome/utils/req"
)

func (pub *Router) handleStream(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	p := req.Params(r)
	tokenId, _ := p.String(":id")
	info, err := decodeStreamInfo(tokenId)
	if err != nil {
		log.Error(ctx, "Error parsing shared stream info", err)
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	// Do not re-evaluate a shared smart playlist for every audio request (Cisum 0.11.2)
	share, err := pub.ds.Share().Get(request.WithNoSmartRefresh(ctx), info.shareID)
	if err != nil {
		checkShareError(ctx, w, err, info.shareID)
		return
	}
	if expiresAt := V(share.ExpiresAt); !expiresAt.IsZero() && expiresAt.Before(time.Now()) {
		checkShareError(ctx, w, model.ErrExpired, info.shareID)
		return
	}
	shareOwner, err := pub.ds.User().Get(ctx, share.UserID)
	if err != nil {
		log.Error(ctx, "Error retrieving share owner for shared stream", "share", info.shareID, "owner", share.UserID, err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	mf, err := pub.ds.MediaFile().Get(ctx, info.id)
	if err != nil {
		if errors.Is(err, model.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
		} else {
			log.Error(ctx, "Error retrieving media file for shared stream", "id", info.id, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
		}
		return
	}

	// 404 rather than 403 so the response doesn't reveal whether the id exists.
	// The track must belong to the share AND be within the owner's libraries.
	// A smart playlist changes by itself (random order, play dates...): its signed link, minted when
	// the share page listed the song, is proof enough (Cisum 0.11.2).
	inShare := shareContainsTrack(share, mf.ID) || pub.isSmartPlaylistShare(ctx, share, shareOwner)
	if !inShare || !shareOwner.HasLibraryAccess(mf.LibraryID) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	streamReq := pub.decider.ResolveRequest(ctx, mf, info.format, info.bitrate, 0)
	stream, err := pub.streamer.NewStream(ctx, mf, streamReq)
	if err != nil {
		if errors.Is(err, streampkg.ErrTooManyTranscodes) {
			w.Header().Set("Retry-After", strconv.Itoa(streampkg.RetryAfterSeconds))
			http.Error(w, "too many concurrent transcodes, please retry shortly", http.StatusTooManyRequests)
			return
		}
		log.Error(ctx, "Error starting shared stream", err)
		http.Error(w, "invalid request", http.StatusInternalServerError)
		return
	}

	// Make sure the stream will be closed at the end, to avoid leakage
	defer func() {
		if err := stream.Close(); err != nil && log.IsGreaterOrEqualTo(log.LevelDebug) {
			log.Error("Error closing shared stream", "id", info.id, "file", stream.Name(), err)
		}
	}()

	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Content-Duration", strconv.FormatFloat(float64(stream.Duration()), 'G', -1, 32))

	n, err := stream.Serve(ctx, w, r)
	if err != nil || n == 0 {
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

type shareTrackInfo struct {
	id      string
	format  string
	bitrate int
	shareID string
}

// isSmartPlaylistShare reports whether the share points to a smart (rule based) playlist the owner can see.
func (pub *Router) isSmartPlaylistShare(ctx context.Context, share *model.Share, owner *model.User) bool {
	if share.ResourceType != "playlist" || share.ResourceIDs == "" {
		return false
	}
	pls, err := pub.ds.Playlist().Get(request.WithUser(ctx, *owner), strings.Split(share.ResourceIDs, ",")[0])
	return err == nil && pls.IsSmartPlaylist()
}

func shareContainsTrack(share *model.Share, mediaFileID string) bool {
	return slices.ContainsFunc(share.Tracks, func(mf model.MediaFile) bool {
		return mf.ID == mediaFileID
	})
}

// decodeStreamInfo decodes the signed share-link token. This is a scoped
// public-share capability, not an auth credential; see encodeMediafileShare for
// why a JWT is used here.
func decodeStreamInfo(tokenString string) (shareTrackInfo, error) {
	c, err := auth.ValidatePublic(tokenString)
	if err != nil {
		return shareTrackInfo{}, err
	}
	if c.ID == "" {
		return shareTrackInfo{}, errors.New("required claim \"id\" not found")
	}
	if c.ShareID == "" {
		return shareTrackInfo{}, errors.New("required claim \"sid\" not found")
	}
	return shareTrackInfo{
		id:      c.ID,
		format:  c.Format,
		bitrate: c.BitRate,
		shareID: c.ShareID,
	}, nil
}
