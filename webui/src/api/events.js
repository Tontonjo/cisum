// Cisum web player v0.11.6 - Server events: reloads library data when the library changes.
// The server pushes Server-Sent Events on /api/events. After a scan that changed the library
// (files added, modified or deleted), it sends "refreshResource" with {"*":"*"}: every library
// query is then marked stale and the ones on screen reload at once, so deleted albums and songs
// disappear without a page reload. A detail page whose item is gone goes back (see AlbumDetail).
// Only the web player can be refreshed this way: Subsonic apps have no push channel.
import config from '../config'
import { getSession } from './client'
import { queryClient } from './queryClient'

// Queries that show library content (albums, songs, artists, counts, missing files)
const LIBRARY_KEYS = new Set([
  'album', 'albums', 'albumList', 'artist', 'artists', 'artistInfo', 'topSongs', 'songs',
  'starred', 'search', 'genres', 'genre', 'playlist', 'playlists', 'editablePlaylists', 'adminMissing', 'adminStatus',
])

const RETRY_MIN_MS = 5_000
const RETRY_MAX_MS = 60_000

/** Marks every library query stale; the ones currently displayed reload immediately. */
export function refreshLibrary() {
  queryClient.invalidateQueries({ predicate: (q) => LIBRARY_KEYS.has(q.queryKey[0]) })
}

/** True when the event asks for a full refresh (scan with changes). Targeted events are ignored. */
function isFullRefresh(data) {
  try {
    return JSON.parse(data)?.['*'] === '*'
  } catch {
    return false
  }
}

/**
 * Opens the event stream and keeps it open (reconnects with the current session token).
 * Returns a function that closes it. A reconnection also refreshes the library, since
 * a scan may have finished while the connection was down.
 */
export function startLibraryEvents() {
  let source = null
  let retryTimer = null
  let retryDelay = RETRY_MIN_MS
  let connectedOnce = false
  let stopped = false

  const connect = () => {
    const url = new URL(`${config.baseURL}/api/events`, window.location.origin)
    url.searchParams.set('jwt', getSession().token || '')
    source = new EventSource(url)

    source.addEventListener('open', () => {
      retryDelay = RETRY_MIN_MS
      if (connectedOnce) refreshLibrary()
      connectedOnce = true
    })
    source.addEventListener('refreshResource', (e) => {
      if (isFullRefresh(e.data)) refreshLibrary()
    })
    // The browser retries by itself with the same URL, whose token may have expired:
    // close and reconnect later with the current token instead.
    source.addEventListener('error', () => {
      source.close()
      if (stopped) return
      retryTimer = setTimeout(connect, retryDelay)
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
    })
  }

  connect()
  return () => {
    stopped = true
    clearTimeout(retryTimer)
    source?.close()
  }
}
