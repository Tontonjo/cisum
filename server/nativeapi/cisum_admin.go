// Cisum v0.7.0 - Administration API: server status, maintenance, user rights and import.
// All /cisum/admin routes are mounted behind adminOnlyMiddleware (see native_api.go).
package nativeapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/deluan/rest"
	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/consts"
	"github.com/navidrome/navidrome/core/ffmpeg"
	"github.com/navidrome/navidrome/core/importer"
	"github.com/navidrome/navidrome/core/permissions"
	playlistsvc "github.com/navidrome/navidrome/core/playlists"
	"github.com/navidrome/navidrome/db"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
)

// ---------- Current user ----------

func (api *Router) addMeRoute(r chi.Router) {
	r.Get("/cisum/me", func(w http.ResponseWriter, r *http.Request) {
		user, _ := request.UserFrom(r.Context())
		_ = rest.RespondWithJSON(w, http.StatusOK, map[string]any{
			"id":              user.ID,
			"userName":        user.UserName,
			"name":            user.Name,
			"isAdmin":         user.IsAdmin,
			"permissions":     permissions.Get(r.Context(), api.ds, user),
			"sharingEnabled":  conf.Server.EnableSharing,
			"downloadEnabled": conf.Server.EnableDownloads,
			"radioDirectory":  conf.Server.RadioBrowser.Enabled,
		})
	})
}

// ---------- Admin routes ----------

func (api *Router) addCisumAdminRoutes(r chi.Router) {
	r.Route("/cisum/admin", func(r chi.Router) {
		r.Get("/status", api.adminStatus)
		r.Post("/maintenance/{action}", api.adminMaintenance)
		r.Get("/maintenance", api.maintenanceStatus)
		r.Get("/users/{id}/permissions", api.getUserPermissions)
		r.Put("/users/{id}/permissions", api.setUserPermissions)
		r.Post("/import/test", api.importTest)
		r.Post("/import", api.importStart)
		r.Get("/import", func(w http.ResponseWriter, r *http.Request) {
			_ = rest.RespondWithJSON(w, http.StatusOK, importer.Status())
		})
	})
}

type folderInfo struct {
	Name  string `json:"name"`
	Bytes int64  `json:"bytes"`
	Files int    `json:"files"`
}

type backupInfo struct {
	Name  string    `json:"name"`
	Bytes int64     `json:"bytes"`
	Date  time.Time `json:"date"`
}

func (api *Router) adminStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	type libraryStats struct {
		Songs    int64   `json:"songs"`
		Albums   int64   `json:"albums"`
		Artists  int64   `json:"artists"`
		Missing  int64   `json:"missing"`
		Bytes    int64   `json:"bytes"`
		Duration float64 `json:"duration"`
	}
	var stats libraryStats
	row := db.Db().QueryRowContext(ctx, `select count(*), coalesce(sum(size),0), coalesce(sum(duration),0) from media_file where missing = 0`)
	_ = row.Scan(&stats.Songs, &stats.Bytes, &stats.Duration)
	_ = db.Db().QueryRowContext(ctx, `select count(*) from media_file where missing = 1`).Scan(&stats.Missing)
	_ = db.Db().QueryRowContext(ctx, `select count(*) from album where missing = 0`).Scan(&stats.Albums)
	_ = db.Db().QueryRowContext(ctx, `select count(*) from artist`).Scan(&stats.Artists)

	playlists, _ := api.ds.Playlist().CountAll(ctx)
	users, _ := api.ds.User().CountAll(ctx)
	libs, _ := api.ds.Library().GetAll(ctx)

	dbPath := strings.SplitN(conf.Server.DbPath, "?", 2)[0]
	var dbBytes int64
	for _, suffix := range []string{"", "-wal", "-shm"} {
		if st, err := os.Stat(dbPath + suffix); err == nil {
			dbBytes += st.Size()
		}
	}

	ff := ffmpeg.New()
	_ = rest.RespondWithJSON(w, http.StatusOK, map[string]any{
		"version": map[string]string{
			"cisum":     consts.CisumVersion,
			"navidrome": consts.Version,
			"go":        runtime.Version(),
			"ffmpeg":    ff.Version(),
		},
		"startedAt": consts.ServerStart,
		"library":   stats,
		"playlists": playlists,
		"users":     users,
		"libraries": libs,
		"database":  map[string]any{"path": dbPath, "bytes": dbBytes},
		"cache":     cacheFolders(),
		"backups":   listBackups(),
		"backupDir": conf.Server.Backup.Path.String(),
		"features": map[string]any{
			"sharing":        conf.Server.EnableSharing,
			"downloads":      conf.Server.EnableDownloads,
			"lrclib":         conf.Server.LRCLib.Enabled,
			"waveform":       conf.Server.Waveform.Enabled,
			"lastfm":         conf.Server.LastFM.Enabled && conf.Server.LastFM.ApiKey != "",
			"deezer":         conf.Server.Deezer.Enabled,
			"scanSchedule":   conf.Server.Scanner.Schedule,
			"watcher":        conf.Server.Scanner.Enabled && conf.Server.Scanner.WatcherWait > 0,
			"watcherWait":    conf.Server.Scanner.WatcherWait.Seconds(),
			"ffmpeg":         ff.IsAvailable(),
			"musicFolder":    conf.Server.MusicFolder,
			"dataFolder":     conf.Server.DataFolder.String(),
			"backupSchedule": conf.Server.Backup.Schedule,
			"backupCount":    conf.Server.Backup.Count,
		},
	})
}

// cacheFolders measures each subfolder of the cache folder.
func cacheFolders() []folderInfo {
	root := conf.Server.CacheFolder.String()
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var res []folderInfo
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		info := folderInfo{Name: e.Name()}
		_ = filepath.WalkDir(filepath.Join(root, e.Name()), func(_ string, d fs.DirEntry, err error) error {
			if err == nil && !d.IsDir() {
				if fi, err := d.Info(); err == nil {
					info.Bytes += fi.Size()
					info.Files++
				}
			}
			return nil
		})
		res = append(res, info)
	}
	return res
}

func listBackups() []backupInfo {
	dir := conf.Server.Backup.Path.String()
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var res []backupInfo
	for _, e := range entries {
		if fi, err := e.Info(); err == nil && !e.IsDir() && strings.HasSuffix(e.Name(), ".db") {
			res = append(res, backupInfo{Name: e.Name(), Bytes: fi.Size(), Date: fi.ModTime()})
		}
	}
	sort.Slice(res, func(i, j int) bool { return res[i].Date.After(res[j].Date) })
	return res
}

// clearableCaches are rebuilt automatically on demand, so deleting them is always safe.
var clearableCaches = map[string]string{
	"waveforms": "waveforms",
	"lyrics":    filepath.Join("lyrics", "lrclib"),
}

// maintenanceJob is the state of the current or last maintenance task (one at a time).
type maintenanceJob struct {
	Action     string     `json:"action"`
	Status     string     `json:"status"`   // idle, running, done, failed
	Progress   float64    `json:"progress"` // 0-100, or -1 when the task cannot measure it
	Message    string     `json:"message,omitempty"`
	Error      string     `json:"error,omitempty"`
	StartedAt  *time.Time `json:"startedAt,omitempty"`
	FinishedAt *time.Time `json:"finishedAt,omitempty"`
}

var (
	jobMu sync.Mutex
	job   = maintenanceJob{Status: "idle"}
)

func jobState() maintenanceJob {
	jobMu.Lock()
	defer jobMu.Unlock()
	return job
}

func setJobProgress(p float64) {
	jobMu.Lock()
	job.Progress = p
	jobMu.Unlock()
}

func (api *Router) maintenanceStatus(w http.ResponseWriter, _ *http.Request) {
	_ = rest.RespondWithJSON(w, http.StatusOK, jobState())
}

// adminMaintenance starts a maintenance task in the background; follow it with GET /maintenance.
func (api *Router) adminMaintenance(w http.ResponseWriter, r *http.Request) {
	action := chi.URLParam(r, "action")
	task, measurable, ok := api.maintenanceTask(action)
	if !ok {
		http.Error(w, "unknown action", http.StatusBadRequest)
		return
	}
	user, _ := request.UserFrom(r.Context())

	jobMu.Lock()
	if job.Status == "running" {
		jobMu.Unlock()
		http.Error(w, "another maintenance task is running: "+job.Action, http.StatusConflict)
		return
	}
	now := time.Now()
	job = maintenanceJob{Action: action, Status: "running", StartedAt: &now, Progress: -1}
	if measurable {
		job.Progress = 0
	}
	jobMu.Unlock()

	// Detached from the request: the task continues if the browser closes
	ctx := request.WithUser(context.WithoutCancel(r.Context()), user)
	log.Info(ctx, "Maintenance task started", "action", action, "user", user.UserName)
	go func() {
		message, err := task(ctx)
		end := time.Now()
		jobMu.Lock()
		defer jobMu.Unlock()
		job.FinishedAt = &end
		if err != nil {
			log.Error(ctx, "Maintenance task failed", "action", action, err)
			job.Status, job.Error = "failed", err.Error()
			return
		}
		job.Status, job.Message, job.Progress = "done", message, 100
		log.Info(ctx, "Maintenance task finished", "action", action, "elapsed", end.Sub(now))
	}()
	_ = rest.RespondWithJSON(w, http.StatusAccepted, jobState())
}

// maintenanceTask returns the function for an action and whether it reports progress.
func (api *Router) maintenanceTask(action string) (func(context.Context) (string, error), bool, bool) {
	switch {
	case action == "backup":
		return func(ctx context.Context) (string, error) {
			path, err := db.BackupWithProgress(ctx, setJobProgress)
			return "Backup created: " + filepath.Base(path), err
		}, true, true
	case action == "optimize":
		return func(ctx context.Context) (string, error) {
			return "Database statistics refreshed", db.Optimize(ctx)
		}, false, true
	case action == "vacuum":
		return func(ctx context.Context) (string, error) {
			_, err := db.Db().ExecContext(ctx, "VACUUM")
			return "Database compacted", err
		}, false, true
	case action == "purge-missing":
		return func(ctx context.Context) (string, error) {
			return "Missing files removed (files still used by a playlist are kept)", api.maintenance.DeleteAllMissingFiles(ctx)
		}, false, true
	case strings.HasPrefix(action, "clear-"):
		sub, ok := clearableCaches[strings.TrimPrefix(action, "clear-")]
		if !ok {
			return nil, false, false
		}
		return func(context.Context) (string, error) {
			return "Cache cleared", removeWithProgress(filepath.Join(conf.Server.CacheFolder.String(), sub))
		}, true, true
	}
	return nil, false, false
}

// removeWithProgress deletes a folder file by file, reporting progress.
func removeWithProgress(dir string) error {
	var files []string
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			files = append(files, p)
		}
		return nil
	})
	for i, f := range files {
		_ = os.Remove(f)
		if i%50 == 0 {
			setJobProgress(100 * float64(i) / float64(len(files)))
		}
	}
	return os.RemoveAll(dir)
}

func (api *Router) userByID(ctx context.Context, w http.ResponseWriter, id string) (*model.User, bool) {
	u, err := api.ds.User().Get(ctx, id)
	if errors.Is(err, model.ErrNotFound) {
		http.Error(w, "user not found", http.StatusNotFound)
		return nil, false
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return nil, false
	}
	return u, true
}

func (api *Router) getUserPermissions(w http.ResponseWriter, r *http.Request) {
	u, ok := api.userByID(r.Context(), w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	_ = rest.RespondWithJSON(w, http.StatusOK, permissions.Get(r.Context(), api.ds, *u))
}

func (api *Router) setUserPermissions(w http.ResponseWriter, r *http.Request) {
	u, ok := api.userByID(r.Context(), w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	var p permissions.Permissions
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid permissions", http.StatusBadRequest)
		return
	}
	if err := permissions.Set(r.Context(), api.ds, u.ID, p); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = rest.RespondWithJSON(w, http.StatusOK, permissions.Get(r.Context(), api.ds, *u))
}

func (api *Router) importTest(w http.ResponseWriter, r *http.Request) {
	var src importer.Source
	if err := json.NewDecoder(r.Body).Decode(&src); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	desc, err := importer.Ping(r.Context(), src)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	_ = rest.RespondWithJSON(w, http.StatusOK, map[string]string{"server": desc})
}

func (api *Router) importStart(w http.ResponseWriter, r *http.Request) {
	var opts importer.Options
	if err := json.NewDecoder(r.Body).Decode(&opts); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := importer.Start(api.ds, opts); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	_ = rest.RespondWithJSON(w, http.StatusAccepted, importer.Status())
}

// ---------- Playlist access (owner, editors, administrators) ----------

func (api *Router) addPlaylistAccessRoutes(r chi.Router) {
	r.Get("/cisum/users", api.listUserNames)
	r.Get("/cisum/playlists/editable", api.editablePlaylists)
	r.Get("/cisum/playlists/{id}/access", func(w http.ResponseWriter, r *http.Request) {
		a, err := playlistsvc.GetAccess(r.Context(), api.ds, chi.URLParam(r, "id"))
		if err != nil {
			writePlaylistError(w, err, http.StatusInternalServerError)
			return
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, a)
	})
	r.Put("/cisum/playlists/{id}/access", func(w http.ResponseWriter, r *http.Request) {
		var upd playlistsvc.AccessUpdate
		if err := json.NewDecoder(r.Body).Decode(&upd); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		a, err := playlistsvc.SetAccess(r.Context(), api.ds, chi.URLParam(r, "id"), upd)
		if errors.Is(err, model.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err != nil {
			writePlaylistError(w, err, http.StatusBadRequest)
			return
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, a)
	})
}

// listUserNames lets any user pick people to share a playlist with (names only, no other details).
func (api *Router) listUserNames(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Db().QueryContext(r.Context(), `select id, user_name, name from user order by name`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	type userName struct {
		ID       string `json:"id"`
		UserName string `json:"userName"`
		Name     string `json:"name"`
	}
	res := []userName{}
	for rows.Next() {
		var u userName
		if rows.Scan(&u.ID, &u.UserName, &u.Name) == nil {
			res = append(res, u)
		}
	}
	_ = rest.RespondWithJSON(w, http.StatusOK, res)
}

// playlistShareGuard lets only the owner of a playlist (or an administrator) create a public link to it.
func (api *Router) playlistShareGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			next.ServeHTTP(w, r)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		var req struct {
			ResourceIDs string `json:"resourceIds"`
		}
		_ = json.Unmarshal(body, &req)
		user, _ := request.UserFrom(r.Context())
		if !user.IsAdmin {
			for _, id := range strings.Split(req.ResourceIDs, ",") {
				if pls, err := api.ds.Playlist().Get(r.Context(), strings.TrimSpace(id)); err == nil && pls.OwnerID != user.ID {
					http.Error(w, "Only the owner of a playlist can share it", http.StatusForbidden)
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

// editablePlaylists returns the ids of the playlists whose songs the current user may change.
func (api *Router) editablePlaylists(w http.ResponseWriter, r *http.Request) {
	user, _ := request.UserFrom(r.Context())
	query := `select id from playlist where (rules is null or rules = '') and sync = 0 and (owner_id = ? or ? or
		id in (select playlist_id from playlist_access where user_id = ? and can_edit = 1))`
	rows, err := db.Db().QueryContext(r.Context(), query, user.ID, user.IsAdmin, user.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	_ = rest.RespondWithJSON(w, http.StatusOK, ids)
}
