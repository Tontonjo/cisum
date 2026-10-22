// Cisum web player v0.11.1 - Library data access and normalization.
// Every song, from either API, is normalized to the same Track shape:
// { id, title, artist, artistId, album, albumId, duration, track, disc, year, starred, starredAt,
//   playCount, createdAt, coverArt, missing }
// Playlist entries additionally carry `position` (their 1-based position in the playlist).
import { nativeApi, subsonic, getSession } from './client'
import config from '../config'
import { plural, formatLength } from '../utils/format'

// ---------- Normalizers ----------

/**
 * Cover art id built like the server does: "<kind>-<id>_<content hash>". With the hash the server lets
 * the browser keep the image for a year without asking again; without it every display costs a request
 * to the server. Returns null when the server knows the item has no image (no request at all).
 * item: native API object carrying imageHash / imageAbsent.
 */
export function artworkId(kind, id, item) {
  if (!id || item?.imageAbsent) return null
  return item?.imageHash ? `${kind}-${id}_${item.imageHash}` : `${kind}-${id}`
}

/** Cover of a playlist (native API object). */
export const playlistCover = (p) => artworkId('pl', p?.id, p)

export function trackFromSubsonic(s) {
  return {
    id: s.id,
    title: s.title,
    artist: s.displayArtist || s.artist,
    artistId: s.artistId,
    album: s.album,
    albumId: s.albumId,
    duration: s.duration || 0,
    track: s.track,
    disc: s.discNumber,
    year: s.year,
    starred: !!s.starred,
    starredAt: s.starred || null,
    playCount: s.playCount || 0,
    createdAt: s.created || null,
    // Hash-suffixed id from the server; absent when the server knows there is no image
    coverArt: s.coverArt || null,
    missing: false,
  }
}

export function trackFromNative(s, position) {
  const id = s.mediaFileId || s.id
  return {
    id,
    position,
    title: s.title,
    artist: s.artist,
    artistId: s.artistId,
    album: s.album,
    albumId: s.albumId,
    duration: s.duration || 0,
    track: s.trackNumber,
    disc: s.discNumber,
    year: s.year,
    starred: !!s.starred,
    starredAt: s.starredAt || null,
    playCount: s.playCount || 0,
    createdAt: s.createdAt || null,
    coverArt: artworkId('mf', id, s),
    missing: !!s.missing,
  }
}

export function albumFromSubsonic(a) {
  return {
    id: a.id,
    name: a.name || a.title || a.album,
    artist: a.displayArtist || a.artist,
    artistId: a.artistId,
    year: a.year,
    songCount: a.songCount,
    duration: a.duration,
    starred: !!a.starred,
    starredAt: a.starred || null,
    playCount: a.playCount || 0,
    createdAt: a.created || null,
    coverArt: a.coverArt || null,
  }
}

export function albumFromNative(a) {
  return {
    id: a.id,
    name: a.name,
    artist: a.albumArtist,
    artistId: a.albumArtistId,
    year: a.maxYear,
    songCount: a.songCount,
    duration: a.duration,
    starred: !!a.starred,
    starredAt: a.starredAt || null,
    playCount: a.playCount || 0,
    createdAt: a.createdAt || null,
    coverArt: artworkId('al', a.id, a),
  }
}

export function artistFromSubsonic(a) {
  return {
    id: a.id,
    name: a.name,
    albumCount: a.albumCount,
    starred: !!a.starred,
    starredAt: a.starred || null,
    coverArt: a.coverArt || null,
  }
}

/** Native artist: counts come from the album artist role, as in the Subsonic artist list. */
export function artistFromNative(a) {
  const stats = a.stats?.albumartist || {}
  return {
    id: a.id,
    name: a.name,
    sortName: a.orderArtistName || a.name,
    albumCount: stats.albumCount ?? a.albumCount ?? 0,
    songCount: stats.songCount ?? a.songCount ?? 0,
    playCount: a.playCount || 0,
    starred: !!a.starred,
    starredAt: a.starredAt || null,
    coverArt: artworkId('ar', a.id, a),
  }
}

// ---------- Home and lists ----------

export async function getAlbumList(type, size = 18, offset = 0) {
  const r = await subsonic('getAlbumList2', { type, size, offset })
  return (r.albumList2?.album || []).map(albumFromSubsonic)
}

// ---------- Sort options ----------
// Each option: label, order (default direction, the other one is reached by clicking again),
// value(item) for lists sorted in the browser, detail(item) for the quantity shown while sorting by it,
// random for shuffled orders (no direction). Keys of server-side sorts are Navidrome sort fields.

const plays = (x) => plural(x.playCount || 0, 'play')
const byName = (field) => (x) => x[field] || ''

export const ALBUM_SORTS = {
  recently_added: { label: 'Recently added', order: 'DESC' },
  name: { label: 'Name', order: 'ASC' },
  album_artist: { label: 'Artist', order: 'ASC' },
  max_year: { label: 'Year', order: 'DESC' },
  play_count: { label: 'Plays', order: 'DESC', detail: plays },
  song_count: { label: 'Songs', order: 'DESC', detail: (a) => plural(a.songCount || 0, 'song') },
  duration: { label: 'Duration', order: 'DESC', detail: (a) => formatLength(a.duration) },
  random: { label: 'Random', order: 'ASC', random: true },
}

export const SONG_SORTS = {
  title: { label: 'Title', order: 'ASC' },
  artist: { label: 'Artist', order: 'ASC' },
  album: { label: 'Album', order: 'ASC' },
  year: { label: 'Year', order: 'DESC' },
  recently_added: { label: 'Recently added', order: 'DESC' },
  play_count: { label: 'Plays', order: 'DESC', detail: plays },
  duration: { label: 'Duration', order: 'ASC' },
  random: { label: 'Random', order: 'ASC', random: true },
}

export const ARTIST_SORTS = {
  name: { label: 'Name', order: 'ASC', value: byName('sortName') },
  album_count: { label: 'Albums', order: 'DESC', value: (a) => a.albumCount, detail: (a) => plural(a.albumCount, 'album') },
  song_count: { label: 'Songs', order: 'DESC', value: (a) => a.songCount, detail: (a) => plural(a.songCount, 'song') },
  play_count: { label: 'Plays', order: 'DESC', value: (a) => a.playCount, detail: plays },
  random: { label: 'Random', order: 'ASC', random: true },
}

export const PLAYLIST_SORTS = {
  name: { label: 'Name', order: 'ASC', value: byName('name') },
  owner: { label: 'Owner', order: 'ASC', value: byName('ownerName') },
  song_count: { label: 'Songs', order: 'DESC', value: (p) => p.songCount },
  duration: { label: 'Duration', order: 'DESC', value: (p) => p.duration },
  updated: { label: 'Recently updated', order: 'DESC', value: (p) => p.updatedAt },
}

export const FAVORITE_SONG_SORTS = {
  starred: { label: 'Recently liked', order: 'DESC', value: (t) => t.starredAt },
  title: { label: 'Title', order: 'ASC', value: byName('title') },
  artist: { label: 'Artist', order: 'ASC', value: byName('artist') },
  album: { label: 'Album', order: 'ASC', value: byName('album') },
  play_count: { label: 'Plays', order: 'DESC', value: (t) => t.playCount, detail: plays },
  duration: { label: 'Duration', order: 'ASC', value: (t) => t.duration },
}

export const FAVORITE_ALBUM_SORTS = {
  starred: { label: 'Recently liked', order: 'DESC', value: (a) => a.starredAt },
  name: { label: 'Name', order: 'ASC', value: byName('name') },
  artist: { label: 'Artist', order: 'ASC', value: byName('artist') },
  year: { label: 'Year', order: 'DESC', value: (a) => a.year },
  play_count: { label: 'Plays', order: 'DESC', value: (a) => a.playCount, detail: plays },
}

export const FAVORITE_ARTIST_SORTS = {
  starred: { label: 'Recently liked', order: 'DESC', value: (a) => a.starredAt },
  name: { label: 'Name', order: 'ASC', value: byName('name') },
  album_count: { label: 'Albums', order: 'DESC', value: (a) => a.albumCount, detail: (a) => plural(a.albumCount || 0, 'album') },
}

export const ARTIST_ALBUM_SORTS = {
  year: { label: 'Year', order: 'DESC', value: (a) => a.year },
  name: { label: 'Name', order: 'ASC', value: byName('name') },
  play_count: { label: 'Plays', order: 'DESC', value: (a) => a.playCount, detail: plays },
  song_count: { label: 'Songs', order: 'DESC', value: (a) => a.songCount, detail: (a) => plural(a.songCount || 0, 'song') },
}

/** Text shown under an item for the current sort (e.g. "42 plays"), or undefined. */
export const sortDetail = (options, sort, item) => options[sort.key]?.detail?.(item)

// ---------- Paged lists sorted by the server ----------

export async function getAlbumsPage({ sort = 'recently_added', dir, start = 0, count = 60, filter = {} }) {
  const { data, total } = await nativeApi('/album', {
    query: {
      _sort: sort,
      _order: dir || ALBUM_SORTS[sort]?.order || 'ASC',
      _start: start,
      _end: start + count,
      missing: false,
      ...filter,
    },
  })
  return { items: data.map(albumFromNative), total }
}

export async function getSongsPage({ sort = 'title', dir, start = 0, count = 100 }) {
  const { data, total } = await nativeApi('/song', {
    query: {
      _sort: sort,
      _order: dir || SONG_SORTS[sort]?.order || 'ASC',
      _start: start,
      _end: start + count,
      missing: false,
    },
  })
  return { items: data.map((s) => trackFromNative(s)), total }
}

// ---------- Albums and artists ----------

export async function getAlbum(id) {
  const r = await subsonic('getAlbum', { id })
  const a = r.album
  return { ...albumFromSubsonic(a), genre: a.genre, tracks: (a.song || []).map(trackFromSubsonic) }
}

/** All album artists (same set as the Subsonic artist list), with album, song and play counts. */
export async function getArtists() {
  const { data } = await nativeApi('/artist', {
    query: { role: 'albumartist', missing: false, _sort: 'name', _order: 'ASC', _start: 0, _end: 100000 },
  })
  return data.map(artistFromNative)
}

export async function getArtist(id) {
  const r = await subsonic('getArtist', { id })
  return { ...artistFromSubsonic(r.artist), albums: (r.artist.album || []).map(albumFromSubsonic) }
}

export async function getArtistInfo(id) {
  const r = await subsonic('getArtistInfo2', { id, count: 8 })
  const info = r.artistInfo2 || {}
  return {
    biography: cleanBiography(info.biography),
    image: info.largeImageUrl || info.mediumImageUrl,
    lastFmUrl: info.lastFmUrl,
    similar: (info.similarArtist || []).map(artistFromSubsonic),
  }
}

export async function getTopSongs(artistName) {
  const r = await subsonic('getTopSongs', { artist: artistName, count: 10 })
  return (r.topSongs?.song || []).map(trackFromSubsonic)
}

/** Removes HTML tags and the trailing "Read more on Last.fm" link from biographies. */
function cleanBiography(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('a').forEach((a) => {
    if (/last\.fm/i.test(a.href)) a.remove()
  })
  return (doc.body.textContent || '').trim()
}

// ---------- Search and favorites ----------

export async function search(query) {
  const r = await subsonic('search3', { query, artistCount: 8, albumCount: 12, songCount: 30 })
  const s = r.searchResult3 || {}
  return {
    artists: (s.artist || []).map(artistFromSubsonic),
    albums: (s.album || []).map(albumFromSubsonic),
    songs: (s.song || []).map(trackFromSubsonic),
  }
}

export async function getStarred() {
  const r = await subsonic('getStarred2')
  const s = r.starred2 || {}
  return {
    artists: (s.artist || []).map(artistFromSubsonic),
    albums: (s.album || []).map(albumFromSubsonic),
    songs: (s.song || []).map(trackFromSubsonic),
  }
}

export const setStarred = (id, starred) => subsonic(starred ? 'star' : 'unstar', { id })

// ---------- Lyrics ----------

/** Returns { synced, lines: [{ time (ms) | null, text }] } or null. */
export async function getLyrics(id) {
  const r = await subsonic('getLyricsBySongId', { id })
  const list = r.lyricsList?.structuredLyrics || []
  if (!list.length) return null
  const best = list.find((l) => l.synced) || list[0]
  return {
    synced: !!best.synced,
    lines: (best.line || []).map((l) => ({ time: best.synced ? l.start : null, text: l.value })),
  }
}

// ---------- Waveform ----------

/** Returns an array of peaks (0-1) or null when the server cannot generate one. */
export async function getWaveform(id, bins = 800) {
  try {
    const res = await nativeApi(`/song/${id}/waveform`, { query: { bins }, raw: true })
    const buf = new Uint8Array(await res.arrayBuffer())
    return Array.from(buf, (v) => v / 255)
  } catch {
    return null
  }
}

// ---------- Playlists ----------

export async function getPlaylists() {
  const { data } = await nativeApi('/playlist', { query: { _sort: 'name', _order: 'ASC', _start: 0, _end: 1000 } })
  return data
}

export async function getPlaylist(id) {
  const { data } = await nativeApi(`/playlist/${id}`)
  return data
}

export async function getPlaylistTracks(id) {
  const { data } = await nativeApi(`/playlist/${id}/tracks`, { query: { _sort: 'id', _order: 'ASC', _start: 0, _end: 10000 } })
  return data.map((t) => trackFromNative(t, Number(t.id)))
}

export async function createPlaylist(name, ids = []) {
  const { data } = await nativeApi('/playlist', { method: 'POST', body: { name, public: false } })
  if (ids.length) await addToPlaylist(data.id, ids)
  return data
}

// ---------- Dynamic playlists (Navidrome smart playlists) ----------

/** Creates a dynamic playlist from rules (same JSON as playlist.rules / .nsp files). */
export async function createSmartPlaylist({ name, comment = '', rules, isPublic = false }) {
  const { data } = await nativeApi('/playlist', { method: 'POST', body: { name, comment, public: isPublic, rules } })
  return data
}

/** Criteria fields known by the server, including the tags and artist roles of mappings.yaml. */
export const getSmartFields = async () => (await nativeApi('/cisum/smart/fields')).data

/** Existing values of a tag, role or album field matching q (autocompletion). */
export const getSmartValues = async (field, q) => (await nativeApi('/cisum/smart/values', { query: { field, q } })).data

/** Evaluates rules without saving: { count, songs } (songs normalized as tracks). */
export async function previewSmartPlaylist(rules, size = 50) {
  const { data } = await nativeApi('/cisum/smart/preview', { method: 'POST', query: { size }, body: rules })
  return { count: data.count, songs: (data.songs || []).map((s) => trackFromNative(s)) }
}

export const updatePlaylist = (id, fields) => nativeApi(`/playlist/${id}`, { method: 'PUT', body: { id, ...fields } })

export const deletePlaylist = (id) => nativeApi(`/playlist/${id}`, { method: 'DELETE' })

export const addToPlaylist = (id, ids) => nativeApi(`/playlist/${id}/tracks`, { method: 'POST', body: { ids } })

export const removeFromPlaylist = (id, positions) =>
  nativeApi(`/playlist/${id}/tracks`, { method: 'DELETE', query: { id: positions } })

export const moveInPlaylist = (id, from, to) =>
  nativeApi(`/playlist/${id}/tracks/${from}`, { method: 'PUT', body: { insert_before: String(to) } })

/**
 * Uploads M3U/M3U8/ZIP files and returns the import reports. onProgress receives the upload
 * percentage (0-100); XMLHttpRequest is used because fetch cannot report upload progress.
 */
export function importPlaylists(files, onProgress) {
  const form = new FormData()
  for (const f of files) form.append('file', f)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${config.baseURL}/api/playlist/import`)
    xhr.setRequestHeader('x-nd-authorization', `Bearer ${getSession().token}`)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.((100 * e.loaded) / e.total)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText))
      else reject(new Error(xhr.responseText || `Import failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(form)
  })
}

// ---------- Playlist access (visibility, editors, owner) ----------

export const getPlaylistAccess = async (id) => (await nativeApi(`/cisum/playlists/${id}/access`)).data

export const setPlaylistAccess = async (id, access) =>
  (await nativeApi(`/cisum/playlists/${id}/access`, { method: 'PUT', body: access })).data

export const getEditablePlaylistIds = async () => (await nativeApi('/cisum/playlists/editable')).data

export const getUserNames = async () => (await nativeApi('/cisum/users')).data

/** Downloads one playlist as .m3u8 or several as a ZIP. */
export async function exportPlaylists(ids) {
  const res = await nativeApi('/playlist/export', { query: { id: ids }, raw: true })
  const blob = await res.blob()
  const disposition = res.headers.get('content-disposition') || ''
  const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1]
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name ? decodeURIComponent(name) : ids.length > 1 ? 'playlists.zip' : 'playlist.m3u8'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ---------- Play counts ----------

/** Resets the current user's play counts of an album and its songs. Returns { songs, plays }. */
export const resetAlbumPlays = async (id) => (await nativeApi(`/cisum/albums/${id}/reset-plays`, { method: 'POST' })).data

// ---------- Playback reporting ----------

export const scrobble = (id, submission) => subsonic('scrobble', { id, submission }).catch(() => {})

export const startScan = () => subsonic('startScan')
