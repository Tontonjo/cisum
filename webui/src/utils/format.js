// Cisum web player v0.4.0 - Formatting helpers.

/** 185.4 -> "3:05", 3725 -> "1:02:05" */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Total length in words: "47 min", "2 h 13 min" */
export function formatLength(seconds) {
  const total = Math.round((seconds || 0) / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** 1536 -> "1.5 KB" */
export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

/** Date and time in the browser's locale, or a dash. */
export function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) || d.getFullYear() < 2000 ? '-' : d.toLocaleString()
}
