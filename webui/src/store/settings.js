// Cisum web player v0.1.0 - Per-browser UI settings (theme mode, dynamic color, accent).
import { create } from 'zustand'
import { DEFAULT_SEED } from '../theme/theme'

const KEY = 'cisum-settings'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

function save(state) {
  try {
    const { mode, dynamicColor, accent } = state
    localStorage.setItem(KEY, JSON.stringify({ mode, dynamicColor, accent }))
  } catch {
    /* settings kept for this session only */
  }
}

const initial = { mode: 'system', dynamicColor: true, accent: DEFAULT_SEED, ...load() }

export const useSettings = create((set, get) => ({
  ...initial,
  // Seed extracted from the cover of the playing track (not persisted)
  coverSeed: null,
  setMode: (mode) => {
    set({ mode })
    save(get())
  },
  setDynamicColor: (dynamicColor) => {
    set({ dynamicColor })
    save(get())
  },
  setAccent: (accent) => {
    set({ accent })
    save(get())
  },
  setCoverSeed: (coverSeed) => set({ coverSeed }),
}))
