// Cisum web player v0.10.2 - server-injected configuration.
// The server renders index.html as a Go template and injects window.__APP_CONFIG__
// (a JSON string in production, absent when running the Vite dev server).

const defaults = {
  version: 'dev',
  cisumVersion: '0.10.2',
  firstTime: false,
  baseURL: '',
  waveformEnabled: true,
  lrclibEnabled: true,
  enableFavourites: true,
  enableDownloads: true,
  defaultUIVolume: 100,
}

function readConfig() {
  try {
    const raw = window.__APP_CONFIG__
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return { ...defaults, ...(parsed || {}) }
  } catch {
    return defaults
  }
}

const config = readConfig()

export const APP_VERSION = '0.10.2'
export const WEB_ROOT = `${config.baseURL}/web`

/** Public share page data (injected on /share/{id} pages), or null. */
export const SHARE_INFO = (() => {
  try {
    const raw = window.__SHARE_INFO__
    return typeof raw === 'string' ? JSON.parse(raw) : raw || null
  } catch {
    return null
  }
})()

export default config
