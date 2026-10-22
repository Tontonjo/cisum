// Cisum v0.2.0 - Native API additions: waveform peaks, multi-playlist import and export, user preferences.
package nativeapi

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/deluan/rest"
	"github.com/go-chi/chi/v5"
	playlistsvc "github.com/navidrome/navidrome/core/playlists"
	"github.com/navidrome/navidrome/core/waveform"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	"github.com/navidrome/navidrome/utils/req"
	"github.com/navidrome/navidrome/utils/str"
)

const (
	maxImportUpload  = 64 << 20 // 64 MiB for all uploaded files together
	maxPlaylistBytes = 16 << 20 // 16 MiB per playlist file inside a ZIP
)

func (api *Router) addWaveformRoute(r chi.Router) {
	r.Get("/song/{id}/waveform", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		id := chi.URLParam(r, "id")
		mf, err := api.ds.MediaFile().Get(ctx, id)
		if errors.Is(err, model.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		bins, _ := strconv.Atoi(r.URL.Query().Get("bins"))
		peaks, err := waveform.Get(ctx, mf, bins)
		if errors.Is(err, waveform.ErrDisabled) {
			http.Error(w, err.Error(), http.StatusNotImplemented)
			return
		}
		if err != nil {
			log.Warn(ctx, "Could not generate waveform", "id", id, "path", mf.Path, err)
			http.Error(w, "waveform not available", http.StatusUnprocessableEntity)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Cache-Control", "private, max-age=2592000")
		_, _ = w.Write(peaks)
	})
}

// importPlaylists accepts one or more M3U/M3U8 files (multipart field "file"), or ZIP archives of them.
func (api *Router) importPlaylists(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxImportUpload)
	if err := r.ParseMultipartForm(maxImportUpload); err != nil {
		http.Error(w, "invalid upload: "+err.Error(), http.StatusBadRequest)
		return
	}
	var reports []playlistsvc.ImportReport
	for _, fh := range r.MultipartForm.File["file"] {
		f, err := fh.Open()
		if err != nil {
			reports = append(reports, playlistsvc.ImportReport{File: fh.Filename, Error: err.Error()})
			continue
		}
		data, err := io.ReadAll(f)
		_ = f.Close()
		if err != nil {
			reports = append(reports, playlistsvc.ImportReport{File: fh.Filename, Error: err.Error()})
			continue
		}
		if strings.EqualFold(filepath.Ext(fh.Filename), ".zip") {
			reports = append(reports, api.importZip(r, fh.Filename, data)...)
			continue
		}
		reports = append(reports, playlistsvc.ImportM3UWithReport(ctx, api.ds, fh.Filename, bytes.NewReader(data)))
	}
	if len(reports) == 0 {
		http.Error(w, "no playlist file received", http.StatusBadRequest)
		return
	}
	_ = rest.RespondWithJSON(w, http.StatusOK, reports)
}

func (api *Router) importZip(r *http.Request, name string, data []byte) []playlistsvc.ImportReport {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return []playlistsvc.ImportReport{{File: name, Error: "invalid ZIP: " + err.Error()}}
	}
	var reports []playlistsvc.ImportReport
	for _, zf := range zr.File {
		ext := strings.ToLower(filepath.Ext(zf.Name))
		if zf.FileInfo().IsDir() || (ext != ".m3u" && ext != ".m3u8") {
			continue
		}
		rc, err := zf.Open()
		if err != nil {
			reports = append(reports, playlistsvc.ImportReport{File: zf.Name, Error: err.Error()})
			continue
		}
		rep := playlistsvc.ImportM3UWithReport(r.Context(), api.ds, zf.Name, io.LimitReader(rc, maxPlaylistBytes))
		_ = rc.Close()
		reports = append(reports, rep)
	}
	if len(reports) == 0 {
		return []playlistsvc.ImportReport{{File: name, Error: "no .m3u/.m3u8 file found in archive"}}
	}
	return reports
}

// exportPlaylists returns one playlist as .m3u8, or several (?id=a&id=b) as a ZIP archive.
func (api *Router) exportPlaylists(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	ids := req.Params(r).Strings("id")
	if len(ids) == 0 {
		http.Error(w, "missing id parameter", http.StatusBadRequest)
		return
	}
	if len(ids) == 1 {
		name, content, err := playlistsvc.ExportM3U8(ctx, api.ds, ids[0])
		if err != nil {
			writePlaylistError(w, err, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "audio/x-mpegurl; charset=utf-8")
		w.Header().Set("Content-Disposition", str.ContentDispositionAttachment(playlistsvc.SafeFileName(name)+".m3u8"))
		_, _ = w.Write([]byte(content)) //nolint:gosec
		return
	}

	buf := &bytes.Buffer{}
	zw := zip.NewWriter(buf)
	used := map[string]int{}
	for _, id := range ids {
		name, content, err := playlistsvc.ExportM3U8(ctx, api.ds, id)
		if err != nil {
			log.Warn(ctx, "Skipping playlist in export", "id", id, err)
			continue
		}
		fw, err := zw.Create(playlistsvc.UniqueName(used, playlistsvc.SafeFileName(name)) + ".m3u8")
		if err == nil {
			_, err = fw.Write([]byte(content))
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if err := zw.Close(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", str.ContentDispositionAttachment("playlists.zip"))
	_, _ = w.Write(buf.Bytes())
}

// ---------- Per-user preferences (Cisum v0.2.0) ----------

const (
	preferencesKey      = "cisum.preferences"
	maxPreferencesBytes = 16 << 10
)

// addPreferencesRoute stores a free-form JSON object per user (web player options such as
// showing lyrics under the cover), so preferences follow the user across browsers and devices.
func (api *Router) addPreferencesRoute(r chi.Router) {
	r.Get("/cisum/preferences", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		user, _ := request.UserFrom(ctx)
		value, err := api.ds.UserProps().DefaultGet(ctx, user.ID, preferencesKey, "{}")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(value))
	})
	r.Put("/cisum/preferences", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		user, _ := request.UserFrom(ctx)
		body, err := io.ReadAll(io.LimitReader(r.Body, maxPreferencesBytes+1))
		if err != nil || len(body) > maxPreferencesBytes {
			http.Error(w, "preferences too large", http.StatusRequestEntityTooLarge)
			return
		}
		var prefs map[string]any
		if err := json.Unmarshal(body, &prefs); err != nil || prefs == nil {
			http.Error(w, "preferences must be a JSON object", http.StatusBadRequest)
			return
		}
		normalized, _ := json.Marshal(prefs)
		if err := api.ds.UserProps().Put(ctx, user.ID, preferencesKey, string(normalized)); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(normalized)
	})
}
