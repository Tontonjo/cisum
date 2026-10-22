// Cisum v0.7.0 - Web radio API: stream relay and current title (every user), station directory,
// stream check and logo from a URL (admins, who manage the stations).
package nativeapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/deluan/rest"
	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/consts"
	"github.com/navidrome/navidrome/core/radio"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
)

const maxLogoBytes = 4 << 20

// addRadioPlaybackRoutes: GET /cisum/radio/{id}/stream (audio relay, authenticate with ?jwt=)
// and GET /cisum/radio/{id}/nowplaying.
func (api *Router) addRadioPlaybackRoutes(r chi.Router) {
	r.Get("/cisum/radio/{id}/stream", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		st, ok := api.getRadio(w, r)
		if !ok {
			return
		}
		err := radio.Relay(ctx, w, st.ID, st.StreamUrl)
		if errors.Is(err, radio.ErrHLS) {
			http.Error(w, err.Error(), http.StatusUnsupportedMediaType)
			return
		}
		if err != nil {
			log.Warn(ctx, "Web radio relay failed", "station", st.Name, "url", st.StreamUrl, err)
			http.Error(w, "station unreachable: "+err.Error(), http.StatusBadGateway)
		}
	})
	r.Get("/cisum/radio/{id}/nowplaying", func(w http.ResponseWriter, r *http.Request) {
		st, ok := api.getRadio(w, r)
		if !ok {
			return
		}
		info, err := radio.NowPlaying(r.Context(), st.ID, st.StreamUrl)
		if err != nil {
			log.Debug(r.Context(), "Web radio title not available", "station", st.Name, err)
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, info) // empty title when unknown
	})
}

func (api *Router) getRadio(w http.ResponseWriter, r *http.Request) (*model.Radio, bool) {
	st, err := api.ds.Radio().Get(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, model.ErrNotFound) {
		http.Error(w, "station not found", http.StatusNotFound)
		return nil, false
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return nil, false
	}
	return st, true
}

// addRadioAdminRoutes is mounted behind adminOnlyMiddleware.
func (api *Router) addRadioAdminRoutes(r chi.Router) {
	r.Get("/cisum/radio/probe", func(w http.ResponseWriter, r *http.Request) {
		info, err := radio.Probe(r.Context(), r.URL.Query().Get("url"))
		if err != nil {
			hls := errors.Is(err, radio.ErrHLS)
			_ = rest.RespondWithJSON(w, http.StatusOK, map[string]any{"ok": hls, "hls": hls, "error": err.Error()})
			return
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, map[string]any{"ok": true, "info": info})
	})
	r.Get("/cisum/radio/directory", func(w http.ResponseWriter, r *http.Request) {
		if !conf.Server.RadioBrowser.Enabled {
			http.Error(w, "station directory is disabled", http.StatusNotImplemented)
			return
		}
		q := r.URL.Query()
		limit, _ := strconv.Atoi(q.Get("limit"))
		list, err := radio.Search(r.Context(), conf.Server.RadioBrowser.BaseURL,
			radio.Query{Name: q.Get("name"), Tag: q.Get("tag"), Country: q.Get("country"), Limit: limit})
		if err != nil {
			log.Warn(r.Context(), "Radio directory search failed", err)
			http.Error(w, "radio directory unreachable: "+err.Error(), http.StatusBadGateway)
			return
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, list)
	})
	r.Get("/cisum/radio/countries", func(w http.ResponseWriter, r *http.Request) {
		if !conf.Server.RadioBrowser.Enabled {
			http.Error(w, "station directory is disabled", http.StatusNotImplemented)
			return
		}
		list, err := radio.Countries(r.Context(), conf.Server.RadioBrowser.BaseURL)
		if err != nil {
			http.Error(w, "radio directory unreachable: "+err.Error(), http.StatusBadGateway)
			return
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, list)
	})
	r.Post("/cisum/radio/{id}/image-from-url", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		st, ok := api.getRadio(w, r)
		if !ok {
			return
		}
		var body struct {
			URL string `json:"url"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil || body.URL == "" {
			http.Error(w, "url is required", http.StatusBadRequest)
			return
		}
		data, ext, err := downloadImage(ctx, body.URL)
		if err != nil {
			http.Error(w, "logo not usable: "+err.Error(), http.StatusUnprocessableEntity)
			return
		}
		filename, err := api.imgUpload.SetImage(ctx, consts.EntityRadio, st.ID, st.Name, st.UploadedImagePath(), bytes.NewReader(data), ext)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		st.UploadedImage = filename
		if err := api.ds.Radio().Put(ctx, st, "UploadedImage"); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.imgUpload.EnqueueArtwork(ctx, consts.EntityRadio, st.ID)
		_ = rest.RespondWithJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
}

// downloadImage fetches a logo and checks it is an image format the artwork service can read
// (JPEG, PNG, GIF, WebP; .ico favicons are refused).
func downloadImage(ctx context.Context, rawURL string) ([]byte, string, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil || (req.URL.Scheme != "http" && req.URL.Scheme != "https") {
		return nil, "", errors.New("invalid URL")
	}
	req.Header.Set("User-Agent", consts.HTTPUserAgent)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", errors.New(resp.Status)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxLogoBytes+1))
	if err != nil {
		return nil, "", err
	}
	if len(data) > maxLogoBytes {
		return nil, "", errors.New("image larger than 4 MB")
	}
	_, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, "", errors.New("unsupported image format")
	}
	return data, "." + format, nil
}
