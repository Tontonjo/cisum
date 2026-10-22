// Cisum web player v0.4.0 - Current user: admin flag, rights and server features (from /api/cisum/me).
import { create } from 'zustand'
import { nativeApi } from '../api/client'

const ALL = { download: true, share: true, playlistImportExport: true }

export const useMe = create((set) => ({
  loaded: false,
  isAdmin: false,
  permissions: ALL,
  sharingEnabled: false,
  downloadEnabled: true,

  load: async () => {
    try {
      const { data } = await nativeApi('/cisum/me')
      set({ ...data, permissions: { ...ALL, ...(data.permissions || {}) }, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
}))

/** True when the user may use the feature (right granted and feature enabled on the server). */
export const useCan = (right) =>
  useMe((s) => {
    if (right === 'share') return s.sharingEnabled && s.permissions.share
    if (right === 'download') return s.downloadEnabled && s.permissions.download
    return !!s.permissions[right]
  })
