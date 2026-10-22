// Cisum web player v0.11.1 - Instant detail pages: previews and preloading.
// When a link to an album, artist or playlist is pressed (mouse button down, touch) or focused with the
// keyboard, two things happen:
// - the summary already shown by the link (name, artist, cover...) is kept as a "preview", so the
//   detail page can draw its header immediately instead of a spinner;
// - the detail data is requested at once, about 100 ms before the click completes.
// v0.11.1: no more preloading on hover. Sweeping the mouse over a grid or the sidebar sent many useless
// requests that delayed the covers and the page actually opened, on small servers (NAS).
import { queryClient } from './queryClient'
import { getAlbum, getArtist, getPlaylist, getPlaylistTracks } from './library'

const MAX_PREVIEWS = 500

// ---------- Query definitions shared by the pages and the preloader ----------

export const albumQuery = (id) => ({ queryKey: ['album', id], queryFn: () => getAlbum(id) })
export const artistQuery = (id) => ({ queryKey: ['artist', id], queryFn: () => getArtist(id) })
export const playlistInfoQuery = (id) => ({ queryKey: ['playlist', id, 'info'], queryFn: () => getPlaylist(id) })
export const playlistTracksQuery = (id) => ({ queryKey: ['playlist', id], queryFn: () => getPlaylistTracks(id) })

const QUERIES = {
  album: (id) => [albumQuery(id)],
  artist: (id) => [artistQuery(id)],
  playlist: (id) => [playlistInfoQuery(id), playlistTracksQuery(id)],
}

// ---------- Previews ----------

const previews = new Map()

/** Remembers what a link knows about an item. coverPx: size of the cover already shown (browser cache). */
export function setPreview(kind, item, coverPx) {
  if (!item?.id) return
  const key = `${kind}:${item.id}`
  previews.delete(key) // re-insert so the oldest entries are dropped first
  previews.set(key, { ...item, coverPx: coverPx ?? item.coverPx })
  if (previews.size > MAX_PREVIEWS) previews.delete(previews.keys().next().value)
}

export const getPreview = (kind, id) => previews.get(`${kind}:${id}`)

// ---------- Preloading ----------

/** Starts loading the detail data unless it is already cached and fresh. */
export function preload(kind, item) {
  // Dynamic playlists are rebuilt by the server on every read: never read them ahead of time
  if (kind === 'playlist' && item.rules) return
  for (const q of QUERIES[kind](item.id)) queryClient.prefetchQuery(q)
}

/**
 * Event handlers to spread on a link: <Link {...intentProps('album', album, 400)} />.
 * Mouse button down, touch and keyboard focus remember the preview and start loading.
 */
export function intentProps(kind, item, coverPx) {
  if (!item?.id) return {}
  const start = () => {
    setPreview(kind, item, coverPx)
    preload(kind, item)
  }
  return { onMouseDown: start, onTouchStart: start, onFocus: start }
}
