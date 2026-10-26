// Cisum v0.11.8 - Administration of the extra tags: MediaMonkey Custom 1-10 (built in) and free tags, with the
// labels shown in the dynamic playlist rules editor. Storage and rules: model/cisum_tags.go.
// Routes mounted under /cisum/admin (administrators only, see cisum_admin.go).
package nativeapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/deluan/rest"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
)

const cisumTagsMaxBytes = 64 << 10

// cisumTagsStatus is the answer of GET and PUT /cisum/admin/tags.
type cisumTagsStatus struct {
	BuiltIn         []model.CustomTag `json:"builtIn"`
	Tags            []model.CustomTag `json:"tags"`
	Active          []model.CustomTag `json:"active"`
	Labels          map[string]string `json:"labels"`
	RestartRequired bool              `json:"restartRequired"`
	Max             int               `json:"max"`
}

func newCisumTagsStatus(saved model.CisumTags) cisumTagsStatus {
	tags := saved.Tags
	if tags == nil {
		tags = []model.CustomTag{}
	}
	labels := saved.Labels
	if labels == nil {
		labels = map[string]string{}
	}
	active := model.ActiveCustomTags()
	if active == nil {
		active = []model.CustomTag{}
	}
	return cisumTagsStatus{
		BuiltIn: model.MediaMonkeyCustomTags(), Tags: tags, Active: active, Labels: labels,
		RestartRequired: model.CustomTagsRestartRequired(tags), Max: model.CustomTagsMax,
	}
}

func getCisumTags(w http.ResponseWriter, r *http.Request) {
	saved, err := model.LoadCisumTags()
	if err != nil {
		log.Error(r.Context(), "Could not read the Cisum tags", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = rest.RespondWithJSON(w, http.StatusOK, newCisumTagsStatus(saved))
}

func putCisumTags(w http.ResponseWriter, r *http.Request) {
	var body model.CisumTags
	if err := json.NewDecoder(io.LimitReader(r.Body, cisumTagsMaxBytes)).Decode(&body); err != nil {
		http.Error(w, `expected {"tags": [...], "labels": {...}}`, http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	saved, err := model.SaveCisumTags(body)
	var invalid model.ValidationError
	if errors.As(err, &invalid) {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err != nil {
		log.Error(ctx, "Could not save the Cisum tags", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	status := newCisumTagsStatus(saved)
	user, _ := request.UserFrom(ctx)
	log.Info(ctx, "Cisum tags changed from the admin page", "freeTags", len(saved.Tags), "labels", len(saved.Labels),
		"user", user.UserName, "restartRequired", status.RestartRequired)
	_ = rest.RespondWithJSON(w, http.StatusOK, status)
}
