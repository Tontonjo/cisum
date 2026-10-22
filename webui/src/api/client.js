// Cisum web player v0.7.0 - HTTP client for the native API (/api) and the Subsonic API (/rest).
// Session keys are shared with the classic UI (/app), so logging in once works for both.
import config from '../config'

const base = config.baseURL
const CLIENT_NAME = 'Cisum'
const SUBSONIC_VERSION = '1.16.1'

// ---------- Session ----------

const SESSION_KEYS = {
  token: 'token',
  userId: 'userId',
  name: 'name',
  username: 'username',
  role: 'role',
  salt: 'subsonic-salt',
  subsonicToken: 'subsonic-token',
  authenticated: 'is-authenticated',
}

function storageGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key, value) {
  try {
    if (value === undefined || value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: session lasts for this page only */
  }
}

const memorySession = {}

export function getSession() {
  const s = {}
  for (const [k, key] of Object.entries(SESSION_KEYS)) s[k] = memorySession[k] ?? storageGet(key)
  s.isAdmin = s.role === 'admin'
  s.loggedIn = s.authenticated === 'true' && !!s.token
  return s
}

function saveSession(auth) {
  const values = {
    token: auth.token,
    userId: auth.id,
    name: auth.name,
    username: auth.username,
    role: auth.isAdmin ? 'admin' : 'regular',
    salt: auth.subsonicSalt,
    subsonicToken: auth.subsonicToken,
    authenticated: 'true',
  }
  for (const [k, v] of Object.entries(values)) {
    memorySession[k] = v
    storageSet(SESSION_KEYS[k], v)
  }
}

export function clearSession() {
  for (const [k, key] of Object.entries(SESSION_KEYS)) {
    delete memorySession[k]
    storageSet(key, null)
  }
}

let onUnauthorized = () => {}
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

export async function login(username, password, createAdmin = false) {
  const res = await fetch(`${base}/auth/${createAdmin ? 'createAdmin' : 'login'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Wrong username or password')
  saveSession(body)
  return getSession()
}

// ---------- Native API ----------

function updateTokenFrom(res) {
  const header = res.headers.get('x-nd-authorization')
  if (header) {
    const token = header.replace(/^Bearer\s+/i, '')
    memorySession.token = token
    storageSet(SESSION_KEYS.token, token)
  }
}

/**
 * Calls the native API. Returns { data, total } where total comes from X-Total-Count.
 * options: { method, query, body (object | FormData), raw (return Response) }
 */
export async function nativeApi(path, { method = 'GET', query, body, raw = false } = {}) {
  const url = new URL(`${base}/api${path}`, window.location.origin)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item))
      else url.searchParams.set(k, v)
    }
  }
  const headers = { 'x-nd-authorization': `Bearer ${getSession().token}` }
  let payload = body
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(url, { method, headers, body: payload })
  updateTokenFrom(res)
  if (res.status === 401) {
    onUnauthorized()
    throw new Error('Session expired, please log in again')
  }
  if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`)
  if (raw) return res
  const text = await res.text()
  return {
    data: text ? JSON.parse(text) : null,
    total: Number(res.headers.get('x-total-count') || 0),
  }
}

// ---------- Subsonic API ----------

function subsonicParams(extra = {}) {
  const s = getSession()
  const p = new URLSearchParams({
    u: s.username || '',
    t: s.subsonicToken || '',
    s: s.salt || '',
    v: SUBSONIC_VERSION,
    c: CLIENT_NAME,
    f: 'json',
  })
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) v.forEach((item) => p.append(k, item))
    else p.set(k, v)
  }
  return p
}

export function subsonicUrl(method, params) {
  return `${base}/rest/${method}?${subsonicParams(params)}`
}

export async function subsonic(method, params) {
  const res = await fetch(subsonicUrl(method, params))
  const body = await res.json()
  const r = body['subsonic-response']
  if (r?.status !== 'ok') {
    if (r?.error?.code === 40 || r?.error?.code === 44) onUnauthorized()
    throw new Error(r?.error?.message || 'Server error')
  }
  return r
}

export const streamUrl = (id) => subsonicUrl('stream', { id })
export const downloadUrl = (id) => subsonicUrl('download', { id })

/**
 * Cover art URL. id may already be prefixed (al-, ar-, mf-, pl-, ra-) as returned by Subsonic.
 * version (optional) changes the URL when an image is replaced, so the browser cache is bypassed.
 */
export function coverUrl(id, size = 300, version) {
  if (!id) return null
  return subsonicUrl('getCoverArt', { id, size, square: true, v: version })
}
