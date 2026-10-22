// Cisum web player v0.9.0 - Administration API (admin only on the server side).
import { nativeApi, subsonic } from './client'

export const getStatus = async () => (await nativeApi('/cisum/admin/status')).data

/** Starts a maintenance task in the background; follow it with getMaintenanceStatus. */
export const runMaintenance = async (action) =>
  (await nativeApi(`/cisum/admin/maintenance/${action}`, { method: 'POST' })).data

export const getMaintenanceStatus = async () => (await nativeApi('/cisum/admin/maintenance')).data

/** All playlists of the server (administrators see every playlist). */
/** Every playlist of every user (admin_all: lists hide other people's private playlists, even for admins). */
export async function getAllPlaylists() {
  const { data } = await nativeApi('/playlist', { query: { _sort: 'name', _order: 'ASC', _start: 0, _end: 5000, admin_all: true } })
  return data
}

// ---------- Scan (Subsonic API) ----------

export async function getScanStatus() {
  const r = await subsonic('getScanStatus')
  return r.scanStatus || {}
}

export const startScan = (full = false) => subsonic('startScan', full ? { fullScan: true } : {})

// ---------- Users ----------

export async function getUsers() {
  const { data } = await nativeApi('/user', { query: { _sort: 'userName', _order: 'ASC', _start: 0, _end: 1000 } })
  return data
}

export const createUser = async (user) => (await nativeApi('/user', { method: 'POST', body: user })).data
export const updateUser = async (id, user) => (await nativeApi(`/user/${id}`, { method: 'PUT', body: { ...user, id } })).data
export const deleteUser = (id) => nativeApi(`/user/${id}`, { method: 'DELETE' })

export const getUserLibraries = async (id) => (await nativeApi(`/user/${id}/library`)).data || []
export const setUserLibraries = (id, libraryIds) =>
  nativeApi(`/user/${id}/library`, { method: 'PUT', body: { libraryIds } })

export const getUserPermissions = async (id) => (await nativeApi(`/cisum/admin/users/${id}/permissions`)).data
export const setUserPermissions = async (id, p) =>
  (await nativeApi(`/cisum/admin/users/${id}/permissions`, { method: 'PUT', body: p })).data

// ---------- Libraries ----------

export async function getLibraries() {
  const { data } = await nativeApi('/library', { query: { _sort: 'name', _order: 'ASC', _start: 0, _end: 100 } })
  return data
}

export const createLibrary = async (lib) => (await nativeApi('/library', { method: 'POST', body: lib })).data
export const updateLibrary = async (id, lib) => (await nativeApi(`/library/${id}`, { method: 'PUT', body: { ...lib, id } })).data
export const deleteLibrary = (id) => nativeApi(`/library/${id}`, { method: 'DELETE' })

// ---------- Missing files ----------

export async function getMissingFiles(start = 0, count = 100) {
  const { data, total } = await nativeApi('/missing', { query: { _sort: 'updated_at', _order: 'DESC', _start: start, _end: start + count } })
  return { items: data, total }
}

// ---------- Import from another server ----------

export const testImportSource = async (source) => (await nativeApi('/cisum/admin/import/test', { method: 'POST', body: source })).data
export const startImport = async (options) => (await nativeApi('/cisum/admin/import', { method: 'POST', body: options })).data
export const getImportStatus = async () => (await nativeApi('/cisum/admin/import')).data

// ---------- Shares ----------

export async function getShares() {
  const { data } = await nativeApi('/share', { query: { _sort: 'created_at', _order: 'DESC', _start: 0, _end: 500 } })
  return data
}

export const createShare = async (share) => (await nativeApi('/share', { method: 'POST', body: share })).data
export const deleteShare = (id) => nativeApi(`/share/${id}`, { method: 'DELETE' })
