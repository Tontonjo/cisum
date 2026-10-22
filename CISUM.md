# Cisum 0.10.2

Cisum is a music server with a modern web player, built on [Navidrome](https://github.com/navidrome/navidrome).
It keeps Navidrome's scanner, file matching and full Subsonic/OpenSubsonic API, so every Subsonic
mobile app keeps working, and adds the features below.

## What Cisum adds

| Area | Change |
|---|---|
| Web player | New Material 3 interface at `/web` (default page). Colors follow the album art of the playing song. Works on phones. |
| Progress bar | The seek bar draws the waveform of the song. Peaks are computed once by ffmpeg and cached. |
| Now playing | Full screen view with synced lyrics (click a line to jump), artist picture, biography and similar artists, and the queue. |
| Lyrics under the cover | Optional: the current synced lines shown under the cover in the now playing view. On/off per user in Settings > Player, saved on the server. |
| Playlists | A song whose file disappears is never removed from playlists. It is shown greyed out and plays again as soon as the file is found, even at a new location. |
| Import / export | Import several `.m3u` / `.m3u8` files at once, or a ZIP of them. Export one playlist as M3U8 or several as a ZIP. |
| Lyrics | Order: sidecar files (`.lrc`, `.txt`...), embedded tags, then LRCLIB online (cached). |
| Administration | Built into the web player (menu > Administration, admins only): library statistics and scan, users with their libraries and rights, libraries, database backup / optimize / compact, caches, missing files, import from another server, public shares. The classic Navidrome interface is removed (`/app` redirects to `/web`). |
| User rights | Per user: download, public sharing, playlist import/export. Checked by the server for the web player and for Subsonic apps. Administrators have every right. |
| Import from another server | Copies one account's playlists, favorites, ratings and play counts from any Subsonic server (Navidrome, Cisum, Airsonic, Gonic...) to a local user. Play counts keep the highest value, so importing twice never doubles them. |
| Public sharing | Share an album, a playlist or a song with a link (optional expiry and download). Enable with `CISUM_ENABLESHARING=true`. |
| Search | Results are ordered artists, albums, then songs. |
| Playlist sharing | A playlist belongs to its creator (or to the user it was imported for). The owner chooses who can listen (private, selected people, everyone) and who can edit (selected editors: add, remove, reorder songs). Only the owner renames, deletes, shares publicly or changes access. Works for Subsonic apps too. |
| Playlist administration | Administration > Playlists: change the owner, who can listen and edit, edit the songs or delete any playlist. Elsewhere (web player lists, menu, Subsonic apps) administrators only see the playlists they could see as a regular user: public, their own and the ones shared with them. |
| Automatic scan | The music folder is watched: a scan starts a few seconds after files change (`CISUM_SCANNER_WATCHERWAIT`, default 5s; network shares may not report changes, the scheduled scan covers them). |
| Progress | Scans, imports, backups, cache clearing and playlist uploads show a percentage (tasks that cannot measure it show an animated bar). |
| Lyrics line | The current synced line is shown above the progress bar (same setting as the lyrics under the cover). |
| Sorting | Albums, songs, artists, playlists, favorites and the albums of an artist can be sorted. Click the selected sort again to reverse it (the arrow shows the direction). The last sort of each list is remembered per user, on the server. Sorting by a quantity (plays, songs, albums, duration) shows it under each item. |
| Play count reset | Album page > more options > Reset play count: the album and its songs go back to 0 plays for your account (artist totals are recomputed). |
| Web radios | Menu > Radios. Administrators add stations by URL (direct stream, `.pls` or `.m3u` link), find them in the radio-browser.info directory (name, genre, country), import `.m3u` / `.pls` files and edit or delete them; everyone can export the list. Stations play through the server (works on an https server with http stations) and show the song being broadcast with the titles heard during the session. Each user has favorite radios, shown on the home page. Subsonic apps see the same stations. Disable the directory with `CISUM_RADIOBROWSER_ENABLED=false`. |
| Home page | Settings > Home page: show or hide each home list (favorite radios, recently added, played recently, most played, something different) and drag them to change their order. Saved per user, on the server. |
| Dynamic playlists | Playlists built from rules and rebuilt each time they are opened (by their owner; others see the last result). Create one with the sparkle icon next to + in the menu, or Playlists > New dynamic playlist. Rules on about 80 criteria (title, artist and every role, genre and every tag, year, dates, duration, favorite, rating, play count, last played, album and artist statistics, file details, other playlists...), matched all together (and) or any of them (or); order random or by up to 3 fields; limit in songs or percent. Templates, value suggestions, live preview of the matching songs, JSON editing for nested groups, export and import of `.nsp` files (Navidrome format). Subsonic apps see these playlists too. |
| Error screen | If the interface crashes or does not start, a message replaces the blank page, with Reload, Reset player (clears the play queue saved in the browser) and the technical details to report. |

## Install with Docker

```bash
# On the Debian server, in the folder containing this file
nano docker-compose.yml           # set your music path and the user id
docker compose up -d --build
```

Open `http://<server>:6874`, create the administrator account, and point your Subsonic apps
(Symfonium, DSub, Substreamer, Tempo...) to the same address.

Configuration uses Navidrome's options with the `CISUM_` prefix (environment variables) or
`/data/cisum.toml` (same names, without prefix). Option list:
https://www.navidrome.org/docs/usage/configuration-options/ (replace `ND_` with `CISUM_`).

The container starts as root only to prepare `/data`, gives it to `PUID:PGID` (default 1000:1000),
then runs Cisum as that user. The music folder must be readable by this user.

Cisum options:

| Option | Default | Purpose |
|---|---|---|
| `CISUM_LRCLIB_ENABLED` | `true` | Online lyrics fallback (https://lrclib.net) |
| `CISUM_LRCLIB_BASEURL` | `https://lrclib.net` | LRCLIB server |
| `CISUM_WAVEFORM_ENABLED` | `true` | Waveform progress bar |
| `CISUM_WAVEFORM_BINS` | `800` | Waveform resolution |
| `CISUM_WAVEFORM_CONCURRENCY` | `2` | Max simultaneous waveform decodes |
| `CISUM_LYRICSPRIORITY` | `...,embedded,lrclib` | Lyrics sources in order |

Artist biographies need a free Last.fm API key (`CISUM_LASTFM_APIKEY`, `CISUM_LASTFM_SECRET`).
Artist pictures also come from Deezer (enabled by default, no key).

## Troubleshooting

| Message at startup | Fix |
|---|---|
| `cannot write in data folder "/data"` | Set `PUID`/`PGID` in `docker-compose.yml` to the owner you want, or `sudo chown -R 1000:1000 ./data`. Do not use the compose `user:` option. |
| Music library empty | The `PUID` user cannot read the music folder: check its permissions. |

Coming from Navidrome: rename `navidrome.db` to `cisum.db` (and the `-wal` / `-shm` files),
`navidrome.toml` to `cisum.toml`, and the `ND_` variables to `CISUM_`.

Branding notes: Subsonic responses still report `"type": "navidrome"` on purpose, so apps keep their
Navidrome-specific features. The anonymous usage collector (which reports to the Navidrome project)
is off by default.

## How missing songs are kept

* When a file disappears, the scanner marks it "missing" instead of deleting it (Navidrome behavior).
* Cisum never purges a missing file that is still referenced by a playlist, neither through
  `Scanner.PurgeMissing` nor through "Delete missing files" in the administration.
* When the file comes back (same tags, moved or renamed), the scanner matches it and the playlist
  entry points to it again automatically.
* Subsonic apps cannot display unavailable songs, so they don't see them. Cisum keeps them
  in place anyway: removing a song by index and replacing a whole playlist from an app both
  keep the hidden missing songs at their position.

## Native API additions

| Endpoint | Description |
|---|---|
| `GET /api/song/{id}/waveform?bins=800` | Peaks as raw bytes (0-255) |
| `POST /api/playlist/import` | Multipart field `file` (repeatable): `.m3u`, `.m3u8` or `.zip`. Returns a report per playlist |
| `GET /api/playlist/export?id=a&id=b` | One id: `.m3u8`. Several ids: `playlists.zip` |
| `GET` / `PUT /api/cisum/preferences` | Current user's web player preferences (JSON object, stored in user properties) |
| `GET /api/cisum/smart/fields` | Criteria fields for dynamic playlist rules (including tags and artist roles) |
| `GET /api/cisum/smart/values?field=genre&q=ro` | Existing values of a tag, role or album, for autocompletion |
| `POST /api/cisum/smart/preview?size=50` | Body: rules JSON. Returns `{count, songs}` without saving. Dynamic playlists themselves are created and edited with `POST` / `PUT /api/playlist` and a `rules` field |
| `GET /api/cisum/me` | Current user's admin flag, rights and enabled features |
| `GET /api/cisum/radio/{id}/stream?jwt=...` | Station audio relayed by the server (ICY metadata removed) |
| `GET /api/cisum/radio/{id}/nowplaying` | `{title, name, genre, bitrate, contentType}` of the station |
| `GET /api/cisum/radio/probe?url=`, `/directory?name=&tag=&country=`, `/countries`, `POST /api/cisum/radio/{id}/image-from-url` | Stream check, directory search, logo from a URL (admin) |
| `POST /api/cisum/albums/{id}/reset-plays` | Resets the current user's play counts of the album and its songs. Returns `{songs, plays}` |
| `GET /api/cisum/admin/status` | Library statistics, database, caches, backups, versions (admin) |
| `POST /api/cisum/admin/maintenance/{action}` | Starts `backup`, `optimize`, `vacuum`, `purge-missing`, `clear-waveforms`, `clear-lyrics` in the background (admin) |
| `GET /api/cisum/admin/maintenance` | Current or last maintenance task with its progress (admin) |
| `GET` / `PUT /api/cisum/playlists/{id}/access` | Visibility (`private`, `users`, `all`), viewers, editors; `ownerId` for admins |
| `GET /api/cisum/playlists/editable` | Ids of the playlists the current user can edit |
| `GET /api/cisum/users` | User names, for choosing people to share with |
| `GET` / `PUT /api/cisum/admin/users/{id}/permissions` | `{download, share, playlistImportExport}` (admin) |
| `POST /api/cisum/admin/import/test`, `POST` / `GET /api/cisum/admin/import` | Test a remote server, start an import, follow its progress and report (admin) |

Import matches each entry by exact path, then by the end of the path (`Artist/Album/File`), then by
`#EXTINF` artist and title with the closest duration. This lets playlists made on another computer
be imported.

## Development

```bash
# Web player (hot reload, proxies the API to a running server on :6874)
cd webui && npm install && npm run dev
# Server
go build -tags=netgo,sqlite_fts5 -o cisum .
```

Code added by Cisum: `webui/`, `core/waveform/`, `core/lyrics/lrclib.go`, `core/playlists/cisum_io.go`,
`core/permissions/`, `core/importer/`, `core/playlists/cisum_access.go`, `server/nativeapi/cisum*.go`, `persistence/cisum_*.go`, `consts/cisum.go`, plus small marked changes ("Cisum:") in the
playlist, media file and server code.

Licensed under GPL-3.0, like Navidrome.
