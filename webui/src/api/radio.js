// Cisum web player v0.11.1 - Web radio data access, playlist files (M3U / PLS) and directory search.
// Stations are shared by all users; only administrators create, edit or delete them (server rule).
import { nativeApi, getSession } from './client'
import config from '../config'
import { artworkId } from './library'

// ---------- Stations ----------

/** Station shape used by the UI. coverArt is null when the station has no logo. */
export function radioFromNative(r) {
  return {
    id: r.id,
    name: r.name,
    streamUrl: r.streamUrl,
    homePageUrl: r.homePageUrl || '',
    coverArt: r.uploadedImage ? artworkId('ra', r.id, r) : null,
    coverVersion: r.imageHash || r.updatedAt,
    createdAt: r.createdAt,
  }
}

export async function getRadios() {
  const { data } = await nativeApi('/radio', { query: { _sort: 'name', _order: 'ASC', _start: 0, _end: 10000 } })
  return data.map(radioFromNative)
}

export async function createRadio({ name, streamUrl, homePageUrl = '' }) {
  const { data } = await nativeApi('/radio', { method: 'POST', body: { name, streamUrl, homePageUrl } })
  return data.id
}

export const updateRadio = (id, { name, streamUrl, homePageUrl = '' }) =>
  nativeApi(`/radio/${id}`, { method: 'PUT', body: { id, name, streamUrl, homePageUrl } })

export const deleteRadio = (id) => nativeApi(`/radio/${id}`, { method: 'DELETE' })

export function uploadRadioLogo(id, file) {
  const form = new FormData()
  form.append('image', file)
  return nativeApi(`/radio/${id}/image`, { method: 'POST', body: form })
}

export const setRadioLogoFromUrl = (id, url) => nativeApi(`/cisum/radio/${id}/image-from-url`, { method: 'POST', body: { url } })

export const deleteRadioLogo = (id) => nativeApi(`/radio/${id}/image`, { method: 'DELETE' })

// ---------- Playback ----------

/**
 * Audio URL relayed by the server (avoids mixed content and reads song titles). The token goes in
 * the query because an <audio> element cannot send headers; the timestamp forces a fresh connection.
 */
export const radioStreamUrl = (id) =>
  `${config.baseURL}/api/cisum/radio/${id}/stream?jwt=${encodeURIComponent(getSession().token || '')}&t=${Date.now()}`

/** { title, name, genre, bitrate, contentType } of what the station plays now (title may be empty). */
export const getRadioNowPlaying = async (id) => (await nativeApi(`/cisum/radio/${id}/nowplaying`)).data

/** Queue entry for a station, understood by the player (isRadio). */
export const radioToTrack = (r) => ({
  id: r.id,
  isRadio: true,
  title: r.name,
  artist: 'Web radio',
  streamUrl: r.streamUrl,
  homePageUrl: r.homePageUrl,
  coverArt: r.coverArt,
  coverVersion: r.coverVersion,
  duration: 0,
})

// ---------- Administration helpers ----------

/** Connects to a stream and returns { ok, hls, info: { name, genre, bitrate, title }, error }. */
export const probeRadio = async (url) => (await nativeApi('/cisum/radio/probe', { query: { url } })).data

export const searchRadioDirectory = async ({ name, tag, country }) =>
  (await nativeApi('/cisum/radio/directory', { query: { name: name || undefined, tag: tag || undefined, country: country || undefined, limit: 60 } })).data

export const getRadioCountries = async () => (await nativeApi('/cisum/radio/countries')).data

// ---------- Playlist files ----------

/** Reads stations from an .m3u / .m3u8 / .pls file: [{ name, streamUrl }]. */
export function parseRadioPlaylist(text, fileName = '') {
  const stations = []
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  if (/\.pls$/i.test(fileName) || /^\[playlist\]/i.test(lines[0] || '')) {
    const files = {}
    const titles = {}
    for (const line of lines) {
      const m = /^(file|title)(\d+)=(.*)$/i.exec(line)
      if (m) (m[1].toLowerCase() === 'file' ? files : titles)[m[2]] = m[3].trim()
    }
    for (const [n, url] of Object.entries(files)) stations.push({ name: titles[n] || '', streamUrl: url })
  } else {
    let title = ''
    for (const line of lines) {
      if (line.startsWith('#EXTINF')) title = line.slice(line.indexOf(',') + 1).trim()
      else if (/^https?:\/\//i.test(line)) {
        stations.push({ name: title, streamUrl: line })
        title = ''
      }
    }
  }
  return stations
    .filter((s) => /^https?:\/\//i.test(s.streamUrl))
    .map((s) => ({ ...s, name: s.name || hostName(s.streamUrl) }))
}

export const hostName = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Downloads all stations as an M3U8 playlist. */
export function exportRadios(radios) {
  const text = ['#EXTM3U', ...radios.flatMap((r) => [`#EXTINF:-1,${r.name}`, r.streamUrl])].join('\n') + '\n'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'audio/x-mpegurl' }))
  a.download = 'radios.m3u8'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
