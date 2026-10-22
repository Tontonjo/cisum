// Cisum web player v0.1.0 - Global UI state: notifications, dialogs, now playing view.
import { create } from 'zustand'

export const useUi = create((set) => ({
  toast: null,
  playlistPicker: null, // tracks waiting to be added to a playlist
  nowPlayingOpen: false,
  nowPlayingTab: 'lyrics',
  queueOpen: false,
  notify: (message) => set({ toast: { message, key: Date.now() } }),
  closeToast: () => set({ toast: null }),
  pickPlaylist: (tracks) => set({ playlistPicker: tracks }),
  closePlaylistPicker: () => set({ playlistPicker: null }),
  openNowPlaying: (tab) => set((s) => ({ nowPlayingOpen: true, nowPlayingTab: tab || s.nowPlayingTab })),
  closeNowPlaying: () => set({ nowPlayingOpen: false }),
  setNowPlayingTab: (nowPlayingTab) => set({ nowPlayingTab }),
  toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
}))
