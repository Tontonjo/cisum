// Cisum v0.11.4 - Manual artist matching: an admin picks which provider entry (Deezer, Last.fm...)
// is the right one for a local artist, when the automatic match by name picked a homonym.
// Agents that support it read the pin of the local artist id they receive before searching by name.
package agents

import (
	"context"
	"encoding/json"

	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
)

// ArtistCandidate is one artist a provider found for a name.
type ArtistCandidate struct {
	ID       string `json:"id,omitempty"` // provider id (Deezer artist id), "" when the provider has none
	Name     string `json:"name"`
	MBID     string `json:"mbid,omitempty"`
	ImageURL string `json:"imageUrl,omitempty"`
	URL      string `json:"url,omitempty"`
	Albums   int    `json:"albums,omitempty"`
	Fans     int    `json:"fans,omitempty"` // Deezer fans, Last.fm listeners
}

// ArtistCandidatesRetriever lists the provider artists matching a name, for manual matching.
type ArtistCandidatesRetriever interface {
	SearchArtistCandidates(ctx context.Context, name string, limit int) ([]ArtistCandidate, error)
}

// ArtistCandidateAgent pairs an enabled agent's name with its ArtistCandidatesRetriever capability.
type ArtistCandidateAgent struct {
	Name      string
	Retriever ArtistCandidatesRetriever
}

// ArtistCandidateAgents returns the enabled agents that support manual artist matching,
// in conf.Server.Agents order.
func (a *Agents) ArtistCandidateAgents() []ArtistCandidateAgent {
	var result []ArtistCandidateAgent
	for _, ea := range a.getEnabledAgentNames() {
		if retriever, ok := a.getAgent(ea).(ArtistCandidatesRetriever); ok {
			result = append(result, ArtistCandidateAgent{Name: ea.name, Retriever: retriever})
		}
	}
	return result
}

// ArtistPin is the provider entry chosen for a local artist.
type ArtistPin struct {
	None bool   `json:"none,omitempty"` // the artist is not on this provider: never use it for this artist
	ID   string `json:"id,omitempty"`
	Name string `json:"name,omitempty"`
	MBID string `json:"mbid,omitempty"`
}

// ArtistPins maps an agent name to its pin. Agents without a pin use the automatic match.
type ArtistPins map[string]ArtistPin

const artistPinsPropertyPrefix = "CisumArtistPins:"

// GetArtistPins returns the pins of a local artist (empty when none, or on error).
func GetArtistPins(ctx context.Context, ds model.DataStore, artistID string) ArtistPins {
	if artistID == "" || ds == nil {
		return ArtistPins{}
	}
	raw, err := ds.Property().DefaultGet(ctx, artistPinsPropertyPrefix+artistID, "")
	if err != nil || raw == "" {
		return ArtistPins{}
	}
	var pins ArtistPins
	if err := json.Unmarshal([]byte(raw), &pins); err != nil {
		log.Warn(ctx, "Ignoring invalid artist match", "artistID", artistID, err)
		return ArtistPins{}
	}
	return pins
}

// GetArtistPin returns the pin of one agent for a local artist, ok=false when it uses the automatic match.
func GetArtistPin(ctx context.Context, ds model.DataStore, artistID, agent string) (ArtistPin, bool) {
	pin, ok := GetArtistPins(ctx, ds, artistID)[agent]
	return pin, ok
}

// SetArtistPins saves the pins of a local artist; empty pins go back to the automatic match.
func SetArtistPins(ctx context.Context, ds model.DataStore, artistID string, pins ArtistPins) error {
	key := artistPinsPropertyPrefix + artistID
	if len(pins) == 0 {
		return ds.Property().Delete(ctx, key)
	}
	raw, err := json.Marshal(pins)
	if err != nil {
		return err
	}
	return ds.Property().Put(ctx, key, string(raw))
}
