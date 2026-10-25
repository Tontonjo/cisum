// Cisum v0.11.4 - Manual artist matching (admin): lists the provider artists (Deezer, Last.fm) matching a
// name, and saves which one is right for a local artist when the automatic match by name picked a homonym.
// Routes (mounted under /cisum/admin, admin only):
//
//	GET /artists/{id}/match?q=name  candidates of every enabled provider + current choice
//	PUT /artists/{id}/match         {"pins": {"deezer": {"id": "123", "name": "..."}, "lastfm": {"none": true}}}
package nativeapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"

	"github.com/deluan/rest"
	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/core/agents"
	"github.com/navidrome/navidrome/core/artwork"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
)

const artistMatchLimit = 15

var providerLabels = map[string]string{"deezer": "Deezer", "lastfm": "Last.fm"}

type artistMatchProvider struct {
	Agent      string                   `json:"agent"`
	Label      string                   `json:"label"`
	Candidates []agents.ArtistCandidate `json:"candidates"`
	Pin        *agents.ArtistPin        `json:"pin"`
	Error      string                   `json:"error,omitempty"`
}

// candidateAgents returns the enabled providers supporting manual matching. The Agents singleton is
// created at startup by the external info provider, so the nil plugin loader here is never used.
func (api *Router) candidateAgents() []agents.ArtistCandidateAgent {
	return agents.GetAgents(api.ds, nil).ArtistCandidateAgents()
}

func (api *Router) getArtistMatch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	artist, ok := api.matchArtist(ctx, w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		query = artist.Name
	}
	pins := agents.GetArtistPins(ctx, api.ds, artist.ID)
	list := api.candidateAgents()
	providers := make([]artistMatchProvider, len(list))
	var wg sync.WaitGroup
	for i, ca := range list {
		p := artistMatchProvider{Agent: ca.Name, Label: providerLabels[ca.Name], Candidates: []agents.ArtistCandidate{}}
		if p.Label == "" {
			p.Label = ca.Name
		}
		if pin, ok := pins[ca.Name]; ok {
			p.Pin = &pin
		}
		providers[i] = p
		wg.Add(1)
		go func() {
			defer wg.Done()
			found, err := ca.Retriever.SearchArtistCandidates(ctx, query, artistMatchLimit)
			if err != nil {
				log.Warn(ctx, "Artist match: search failed", "agent", ca.Name, "query", query, err)
				providers[i].Error = "Search failed, try again later"
				return
			}
			if found != nil {
				providers[i].Candidates = found
			}
		}()
	}
	wg.Wait()
	_ = rest.RespondWithJSON(w, http.StatusOK, map[string]any{
		"artist":    map[string]string{"id": artist.ID, "name": artist.Name, "mbid": artist.MbzArtistID},
		"query":     query,
		"providers": providers,
	})
}

func (api *Router) setArtistMatch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	artist, ok := api.matchArtist(ctx, w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	var body struct {
		Pins agents.ArtistPins `json:"pins"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	// Only enabled providers, and only meaningful pins: anything else means "automatic"
	known := map[string]bool{}
	for _, ca := range api.candidateAgents() {
		known[ca.Name] = true
	}
	pins := agents.ArtistPins{}
	for agent, pin := range body.Pins {
		if !known[agent] {
			continue
		}
		switch {
		case pin.None:
			pins[agent] = agents.ArtistPin{None: true}
		case pin.ID != "" || pin.Name != "":
			pins[agent] = agents.ArtistPin{ID: pin.ID, Name: pin.Name, MBID: pin.MBID}
		}
	}
	// Pins of providers disabled since then are kept: they apply again if the provider comes back
	for agent, pin := range agents.GetArtistPins(ctx, api.ds, artist.ID) {
		if !known[agent] {
			pins[agent] = pin
		}
	}
	if err := agents.SetArtistPins(ctx, api.ds, artist.ID, pins); err != nil {
		log.Error(ctx, "Artist match: could not save", "artist", artist.Name, err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}
	log.Info(ctx, "Artist match changed", "artist", artist.Name, "id", artist.ID, "pins", pins)
	api.refreshArtistAfterMatch(ctx, artist.ID)
	_ = rest.RespondWithJSON(w, http.StatusOK, map[string]any{"pins": pins})
}

// refreshArtistAfterMatch drops the resolved picture and fetches the external info again with the new match.
func (api *Router) refreshArtistAfterMatch(ctx context.Context, id string) {
	if err := artwork.Refresh(ctx, api.ds, model.KindArtistArtwork, id); err != nil {
		log.Error(ctx, "Artist match: could not refresh the artist picture", "id", id, err)
	}
	// Detached: the request ends before the providers answer
	bg := context.WithoutCancel(ctx)
	go func() {
		if err := api.provider.RefreshInfo(bg, model.KindArtistArtwork, id); err != nil {
			log.Error(bg, "Artist match: could not refresh the artist info", "id", id, err)
		}
	}()
}

func (api *Router) matchArtist(ctx context.Context, w http.ResponseWriter, id string) (*model.Artist, bool) {
	artist, err := api.ds.Artist().Get(ctx, id)
	if errors.Is(err, model.ErrNotFound) {
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
		return nil, false
	}
	if err != nil {
		log.Error(ctx, "Artist match: could not load the artist", "id", id, err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return nil, false
	}
	return artist, true
}
