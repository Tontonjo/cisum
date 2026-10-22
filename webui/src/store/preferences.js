// Cisum web player v0.8.0 - Per-user preferences, stored on the server (follow the user on every device).
import { create } from 'zustand'
import { nativeApi } from '../api/client'

export const DEFAULT_PREFERENCES = {
  lyricsUnderCover: true, // show synced lyrics under the cover in the now playing view
  sorts: {}, // last sort chosen on each list: { [listKey]: { key, dir: 'ASC' | 'DESC' } }
  favoriteRadios: [], // ids of the user's favorite web radio stations
  homeShelves: [], // home lists in display order: [{ id, visible }]; empty = default order, all visible
}

/** Lists that can be shown on the home page, in their default order. */
export const HOME_SHELVES = [
  { id: 'radios', title: 'Favorite radios' },
  { id: 'newest', title: 'Recently added' },
  { id: 'recent', title: 'Played recently' },
  { id: 'frequent', title: 'Most played' },
  { id: 'random', title: 'Something different' },
]

export const usePreferences = create((set, get) => ({
  ...DEFAULT_PREFERENCES,
  loaded: false,

  load: async () => {
    try {
      const { data } = await nativeApi('/cisum/preferences')
      set({ ...DEFAULT_PREFERENCES, ...(data || {}), loaded: true })
    } catch {
      set({ loaded: true }) // keep defaults if the server is unreachable
    }
  },

  /** Updates one preference immediately, then saves all of them; reverts if saving fails. */
  update: async (key, value) => {
    const previous = get()[key]
    set({ [key]: value })
    const prefs = Object.fromEntries(Object.keys(DEFAULT_PREFERENCES).map((k) => [k, get()[k]]))
    try {
      await nativeApi('/cisum/preferences', { method: 'PUT', body: prefs })
    } catch (e) {
      set({ [key]: previous })
      throw e
    }
  },
}))

/**
 * Sort state of one list, remembered per user on the server.
 * options: { [key]: { order: 'ASC' | 'DESC' (default direction), ... } }
 * Returns [{ key, dir }, setSort, loaded]. A saved key that no longer exists falls back to defaultKey.
 */
export function useSort(listKey, options, defaultKey) {
  const saved = usePreferences((s) => s.sorts?.[listKey])
  const loaded = usePreferences((s) => s.loaded)
  const key = saved && options[saved.key] ? saved.key : defaultKey
  const dir = saved && options[saved.key] && (saved.dir === 'ASC' || saved.dir === 'DESC') ? saved.dir : options[key].order
  const setSort = (value) => {
    const { sorts, update } = usePreferences.getState()
    update('sorts', { ...sorts, [listKey]: value }).catch(() => {}) // the list still sorts if saving fails
  }
  return [{ key, dir }, setSort, loaded]
}

/** Favorite web radios of the current user: [isFavorite(id), toggle(id)]. */
export function useRadioFavorites() {
  const ids = usePreferences((s) => s.favoriteRadios || [])
  const isFavorite = (id) => ids.includes(id)
  const toggle = (id) => {
    const { favoriteRadios = [], update } = usePreferences.getState()
    const next = favoriteRadios.includes(id) ? favoriteRadios.filter((x) => x !== id) : [...favoriteRadios, id]
    return update('favoriteRadios', next)
  }
  return [isFavorite, toggle, ids]
}

/**
 * Home lists of the current user: [shelves, setShelves].
 * shelves = [{ id, title, visible }] in display order. Unknown saved ids are dropped and
 * lists added in a later version are appended, visible.
 */
export function useHomeShelves() {
  const saved = usePreferences((s) => s.homeShelves || [])
  const known = Object.fromEntries(HOME_SHELVES.map((s) => [s.id, s]))
  const ordered = saved.filter((s) => known[s.id]).map((s) => ({ ...known[s.id], visible: s.visible !== false }))
  const missing = HOME_SHELVES.filter((s) => !ordered.some((o) => o.id === s.id)).map((s) => ({ ...s, visible: true }))
  const shelves = [...ordered, ...missing]
  const setShelves = (next) => usePreferences.getState().update('homeShelves', next.map(({ id, visible }) => ({ id, visible })))
  return [shelves, setShelves]
}
