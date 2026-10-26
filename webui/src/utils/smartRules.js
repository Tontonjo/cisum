// Cisum web player v0.11.8 - Dynamic playlists: field catalog, operators, templates, conversion
// between the editor model and Navidrome smart playlist rules (playlist.rules / .nsp files).
//
// Editor model (one level, as chosen for Cisum):
// { match: 'all' | 'any', rules: [{ key, field, op, value, value2, unit }],
//   sort: [{ field, desc }] | 'random', limitType: 'none' | 'songs' | 'percent', limit }

// ---------- Field catalog ----------

// Value types: text, number, date, bool, duration (edited in minutes), rating (0-5), playlist
export const GROUPS = ['Song', 'People', 'Tags', 'Custom tags', 'Your activity', 'Album', 'Artist', 'File', 'Identifiers']

const KNOWN = {
  title: ['Title', 'Song', 'text'],
  album: ['Album', 'Song', 'text'],
  year: ['Year', 'Song', 'number'],
  date: ['Recording date', 'Song', 'text'],
  originalyear: ['Original year', 'Song', 'number'],
  originaldate: ['Original date', 'Song', 'text'],
  releaseyear: ['Release year', 'Song', 'number'],
  releasedate: ['Release date', 'Song', 'text'],
  tracknumber: ['Track number', 'Song', 'number'],
  discnumber: ['Disc number', 'Song', 'number'],
  discsubtitle: ['Disc subtitle', 'Song', 'text'],
  duration: ['Duration', 'Song', 'duration'],
  bpm: ['BPM', 'Song', 'number'],
  compilation: ['Compilation', 'Song', 'bool'],
  explicitstatus: ['Explicit status', 'Song', 'text'],
  comment: ['Comment', 'Song', 'text'],
  lyrics: ['Lyrics', 'Song', 'text'],
  catalognumber: ['Catalog number', 'Song', 'text'],
  albumcomment: ['Album comment', 'Song', 'text'],
  sorttitle: ['Sort title', 'Song', 'text'],
  sortalbum: ['Sort album', 'Song', 'text'],
  sortartist: ['Sort artist', 'Song', 'text'],
  sortalbumartist: ['Sort album artist', 'Song', 'text'],
  dateadded: ['Date added', 'Song', 'date'],
  datemodified: ['Date modified', 'Song', 'date'],
  playlist: ['Playlist', 'Song', 'playlist'],

  loved: ['Favorite', 'Your activity', 'bool'],
  dateloved: ['Date favorited', 'Your activity', 'date'],
  playcount: ['Play count', 'Your activity', 'number'],
  lastplayed: ['Last played', 'Your activity', 'date'],
  rating: ['Rating', 'Your activity', 'rating'],
  daterated: ['Date rated', 'Your activity', 'date'],
  averagerating: ['Average rating (all users)', 'Your activity', 'number'],

  albumloved: ['Album favorite', 'Album', 'bool'],
  albumrating: ['Album rating', 'Album', 'rating'],
  albumplaycount: ['Album play count', 'Album', 'number'],
  albumlastplayed: ['Album last played', 'Album', 'date'],
  albumdateloved: ['Album date favorited', 'Album', 'date'],
  albumdaterated: ['Album date rated', 'Album', 'date'],
  albumdateadded: ['Album date added', 'Album', 'date'],
  albumdatemodified: ['Album date modified', 'Album', 'date'],
  albumduration: ['Album duration', 'Album', 'duration'],
  albumsongcount: ['Album song count', 'Album', 'number'],
  albumsize: ['Album size (bytes)', 'Album', 'number'],

  artistloved: ['Artist favorite', 'Artist', 'bool'],
  artistrating: ['Artist rating', 'Artist', 'rating'],
  artistplaycount: ['Artist play count', 'Artist', 'number'],
  artistlastplayed: ['Artist last played', 'Artist', 'date'],
  artistdateloved: ['Artist date favorited', 'Artist', 'date'],
  artistdaterated: ['Artist date rated', 'Artist', 'date'],

  filepath: ['File path', 'File', 'text'],
  filetype: ['File type', 'File', 'text'],
  codec: ['Codec', 'File', 'text'],
  bitrate: ['Bit rate (kbps)', 'File', 'number'],
  bitdepth: ['Bit depth', 'File', 'number'],
  samplerate: ['Sample rate (Hz)', 'File', 'number'],
  channels: ['Channels', 'File', 'number'],
  size: ['File size (bytes)', 'File', 'number'],
  hascoverart: ['Has embedded cover', 'File', 'bool'],
  missing: ['File missing', 'File', 'bool'],
  library_id: ['Library id', 'File', 'number'],
  rgtrackgain: ['ReplayGain track gain', 'File', 'number'],
  rgtrackpeak: ['ReplayGain track peak', 'File', 'number'],
  rgalbumgain: ['ReplayGain album gain', 'File', 'number'],
  rgalbumpeak: ['ReplayGain album peak', 'File', 'number'],

  mbz_recording_id: ['MusicBrainz recording id', 'Identifiers', 'text'],
  mbz_album_id: ['MusicBrainz album id', 'Identifiers', 'text'],
  mbz_artist_id: ['MusicBrainz artist id', 'Identifiers', 'text'],
  mbz_album_artist_id: ['MusicBrainz album artist id', 'Identifiers', 'text'],
  mbz_release_group_id: ['MusicBrainz release group id', 'Identifiers', 'text'],
  mbz_release_track_id: ['MusicBrainz release track id', 'Identifiers', 'text'],
}

// Friendly labels for common tags and artist roles (others are capitalized)
const NAMES = {
  albumartist: 'Album artist', djmixer: 'DJ mixer', maincredit: 'Main credit', releasetype: 'Release type',
  recordlabel: 'Record label', albumversion: 'Album version', releasecountry: 'Release country',
  musicbrainz_workid: 'MusicBrainz work id', isrc: 'ISRC', asin: 'ASIN', barcode: 'Barcode',
}

const capitalize = (s) => {
  const words = s.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Fields that the editor shows first in the picker
const POPULAR = ['artist', 'albumartist', 'genre', 'album', 'title', 'year', 'loved', 'rating', 'playcount', 'lastplayed', 'dateadded']

/**
 * Builds the field list from the server catalog (GET /cisum/smart/fields). Tags and roles depend
 * on the server's mappings.yaml, so they are only known from it. Returns [{ name, label, group, type, nullable }].
 */
/**
 * Name shown for a custom tag (MediaMonkey Custom 1-10 or free tag of the admin page).
 * custom3 -> "Custom 3"; with the label "Energy": "Energy (Custom 3)"; free tag "energy" -> its label or "Energy".
 */
export function customTagLabel(name, label) {
  const n = /^custom(\d+)$/.exec(name)
  if (n) return label ? `${label} (Custom ${n[1]})` : `Custom ${n[1]}`
  return label || capitalize(name)
}

export function buildFields(serverFields = []) {
  const byName = new Map()
  for (const f of serverFields) {
    const known = KNOWN[f.name]
    let field
    if (known) {
      field = { name: f.name, label: known[0], group: known[1], type: known[2] }
    } else if (f.kind === 'role') {
      field = { name: f.name, label: NAMES[f.name] || capitalize(f.name), group: 'People', type: 'text', kind: 'role' }
    } else if (f.kind === 'tag' && f.custom) {
      field = { name: f.name, label: customTagLabel(f.name, f.label), group: 'Custom tags', type: f.numeric ? 'number' : 'text', kind: 'tag' }
    } else if (f.kind === 'tag') {
      field = { name: f.name, label: NAMES[f.name] || capitalize(f.name), group: 'Tags', type: f.numeric ? 'number' : 'text', kind: 'tag' }
    } else {
      field = { name: f.name, label: capitalize(f.name), group: 'File', type: f.boolean ? 'bool' : f.numeric ? 'number' : 'text' }
    }
    field.nullable = !!f.nullable
    byName.set(f.name, field)
  }
  // The playlist pseudo-field (inPlaylist / notInPlaylist) is not a criteria field on the server
  byName.set('playlist', { name: 'playlist', label: 'Playlist', group: 'Song', type: 'playlist' })
  const order = (f) => {
    const custom = /^custom(\d+)$/.exec(f.name)
    if (custom && f.group === 'Custom tags') return Number(custom[1]) // MediaMonkey Custom 1-10 in their order
    const p = POPULAR.indexOf(f.name)
    return p >= 0 ? p : 100
  }
  return [...byName.values()].sort(
    (a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || order(a) - order(b) || a.label.localeCompare(b.label, undefined, { numeric: true }),
  )
}

export const findField = (fields, name) =>
  fields.find((f) => f.name === name) || { name, label: capitalize(name), group: 'Tags', type: 'text' }

/** Fields that suggest existing values while typing (tags, artist roles, album). */
export const hasSuggestions = (field) => field.kind === 'tag' || field.kind === 'role' || field.name === 'album'

// ---------- Operators ----------

// op: editor operator; key: Navidrome operator; arity: number of values (0 = none)
export const OPERATORS = {
  contains: { label: 'contains', key: 'contains', arity: 1 },
  notContains: { label: 'does not contain', key: 'notContains', arity: 1 },
  is: { label: 'is', key: 'is', arity: 1 },
  isNot: { label: 'is not', key: 'isNot', arity: 1 },
  startsWith: { label: 'starts with', key: 'startsWith', arity: 1 },
  endsWith: { label: 'ends with', key: 'endsWith', arity: 1 },
  gt: { label: 'is greater than', key: 'gt', arity: 1 },
  lt: { label: 'is less than', key: 'lt', arity: 1 },
  inTheRange: { label: 'is between', key: 'inTheRange', arity: 2 },
  inTheLast: { label: 'in the last', key: 'inTheLast', arity: 1 },
  notInTheLast: { label: 'not in the last', key: 'notInTheLast', arity: 1 },
  after: { label: 'is after', key: 'after', arity: 1 },
  before: { label: 'is before', key: 'before', arity: 1 },
  isTrue: { label: 'is yes', key: 'is', arity: 0 },
  isFalse: { label: 'is no', key: 'is', arity: 0 },
  inPlaylist: { label: 'is in', key: 'inPlaylist', arity: 1 },
  notInPlaylist: { label: 'is not in', key: 'notInPlaylist', arity: 1 },
  isPresent: { label: 'is set', key: 'isPresent', arity: 0 },
  isMissing: { label: 'is not set', key: 'isMissing', arity: 0 },
}

const OPS_BY_TYPE = {
  text: ['contains', 'notContains', 'is', 'isNot', 'startsWith', 'endsWith'],
  number: ['is', 'isNot', 'gt', 'lt', 'inTheRange'],
  rating: ['is', 'isNot', 'gt', 'lt', 'inTheRange'],
  duration: ['gt', 'lt', 'inTheRange'],
  date: ['inTheLast', 'notInTheLast', 'after', 'before', 'inTheRange'],
  bool: ['isTrue', 'isFalse'],
  playlist: ['inPlaylist', 'notInPlaylist'],
}

export function operatorsFor(field) {
  const ops = [...OPS_BY_TYPE[field.type]]
  if (field.nullable) ops.push('isPresent', 'isMissing')
  // Tags and roles hold several values: ranges are not supported on them by the server
  if (field.kind) return ops.filter((o) => o !== 'inTheRange')
  return ops
}

// Units for "in the last" (values are stored in days)
export const PERIOD_UNITS = [
  { value: 1, label: 'days' },
  { value: 7, label: 'weeks' },
  { value: 30, label: 'months' },
  { value: 365, label: 'years' },
]

// ---------- Editor model ----------

let keySeq = 0
const nextKey = () => `r${++keySeq}`

export function newRule(fields, name = 'genre') {
  const field = findField(fields, fields.some((f) => f.name === name) ? name : 'title')
  return { key: nextKey(), field: field.name, op: operatorsFor(field)[0], value: '', value2: '', unit: 1 }
}

export const emptyModel = (fields) => ({
  match: 'all',
  rules: [newRule(fields)],
  sort: 'random',
  limitType: 'songs',
  limit: 100,
})

/** Changes a rule's field, keeping the operator and value when they still make sense. */
export function changeField(rule, field) {
  const ops = operatorsFor(field)
  const keep = ops.includes(rule.op)
  return { ...rule, field: field.name, op: keep ? rule.op : ops[0], value: keep ? rule.value : '', value2: keep ? rule.value2 : '', unit: 1 }
}

/** Returns an error message for an incomplete rule, or null. */
export function ruleError(rule, fields) {
  const field = findField(fields, rule.field)
  const op = OPERATORS[rule.op]
  if (!op || !operatorsFor(field).includes(rule.op)) return 'Choose an operator'
  if (op.arity === 0) return null
  const blank = (v) => v === '' || v === null || v === undefined
  if (blank(rule.value) || (op.arity === 2 && blank(rule.value2))) return 'Enter a value'
  const numeric = ['number', 'rating', 'duration'].includes(field.type) || ['inTheLast', 'notInTheLast'].includes(rule.op)
  if (numeric && (Number.isNaN(Number(rule.value)) || (op.arity === 2 && Number.isNaN(Number(rule.value2))))) return 'Enter a number'
  return null
}

function convertValue(field, op, v, unit) {
  if (op === 'inTheLast' || op === 'notInTheLast') return Math.round(Number(v) * unit)
  if (field.type === 'duration') return Math.round(Number(v) * 60)
  if (['number', 'rating'].includes(field.type)) return Number(v)
  return typeof v === 'string' ? v.trim() : v
}

/** Editor model -> Navidrome rules JSON. Incomplete rules are skipped. */
export function toCriteria(model, fields) {
  const expressions = []
  for (const r of model.rules) {
    if (ruleError(r, fields)) continue
    const field = findField(fields, r.field)
    const op = OPERATORS[r.op]
    let body
    if (field.type === 'playlist') body = { id: r.value }
    else if (r.op === 'isTrue' || r.op === 'isFalse') body = { [field.name]: r.op === 'isTrue' }
    else if (r.op === 'isPresent' || r.op === 'isMissing') body = { [field.name]: true }
    else if (op.arity === 2) body = { [field.name]: [convertValue(field, r.op, r.value, 1), convertValue(field, r.op, r.value2, 1)] }
    else body = { [field.name]: convertValue(field, r.op, r.value, r.unit || 1) }
    expressions.push({ [op.key]: body })
  }
  const criteria = { [model.match]: expressions }
  if (model.sort === 'random') criteria.sort = 'random'
  else if (model.sort?.length) criteria.sort = model.sort.map((s) => `${s.desc ? '-' : ''}${s.field}`).join(',')
  const limit = Math.floor(Number(model.limit))
  if (model.limitType === 'songs' && limit > 0) criteria.limit = limit
  if (model.limitType === 'percent' && limit > 0) criteria.limitPercent = Math.min(limit, 100)
  return criteria
}

const OP_BY_KEY = Object.fromEntries(
  ['contains', 'notContains', 'is', 'isNot', 'startsWith', 'endsWith', 'gt', 'lt', 'inTheRange', 'inTheLast',
    'notInTheLast', 'after', 'before', 'inPlaylist', 'notInPlaylist', 'isPresent', 'isMissing'].map((k) => [k.toLowerCase(), k]),
)

function bestUnit(days) {
  for (const u of [365, 30, 7]) if (days >= u && days % u === 0) return u
  return 1
}

function displayValue(field, op, v) {
  if (field.type === 'duration' && typeof v === 'number') return String(Math.round((v / 60) * 100) / 100)
  return v === undefined || v === null ? '' : String(v)
}

/**
 * Navidrome rules JSON -> editor model. Returns null when the rules cannot be shown in the
 * one-level editor (nested groups, unknown operators, several fields in one expression); they can
 * still be edited as JSON.
 */
export function fromCriteria(criteria, fields) {
  if (!criteria || typeof criteria !== 'object') return null
  const lower = Object.fromEntries(Object.entries(criteria).map(([k, v]) => [k.toLowerCase(), v]))
  const match = Array.isArray(lower.any) && lower.any.length ? 'any' : 'all'
  const list = lower[match]
  if (!Array.isArray(list)) return null
  // Offset and custom refresh delays are kept only by the JSON editor
  if (lower.offset || lower.refreshdelay) return null

  const rules = []
  for (const expr of list) {
    const entries = Object.entries(expr || {})
    if (entries.length !== 1) return null
    const [rawKey, body] = entries[0]
    const key = OP_BY_KEY[rawKey.toLowerCase()]
    if (!key || !body || typeof body !== 'object') return null

    if (key === 'inPlaylist' || key === 'notInPlaylist') {
      if (!body.id) return null // playlists referenced by path come from .nsp files: JSON editor
      rules.push({ key: nextKey(), field: 'playlist', op: key, value: body.id, value2: '', unit: 1 })
      continue
    }
    const fieldEntries = Object.entries(body)
    if (fieldEntries.length !== 1) return null
    const [name, value] = fieldEntries[0]
    const field = findField(fields, name.toLowerCase())
    let op = key
    if (field.type === 'bool' && key === 'is') op = value === true || value === 'true' ? 'isTrue' : 'isFalse'
    if (key === 'isPresent' || key === 'isMissing') {
      if (value === false || value === 'false') op = key === 'isPresent' ? 'isMissing' : 'isPresent'
    }
    if (!operatorsFor(field).includes(op)) return null

    const rule = { key: nextKey(), field: field.name, op, value: '', value2: '', unit: 1 }
    if (OPERATORS[op].arity === 2) {
      if (!Array.isArray(value) || value.length !== 2) return null
      rule.value = displayValue(field, op, value[0])
      rule.value2 = displayValue(field, op, value[1])
    } else if (op === 'inTheLast' || op === 'notInTheLast') {
      const days = Number(value)
      rule.unit = bestUnit(days)
      rule.value = String(days / rule.unit)
    } else if (OPERATORS[op].arity === 1) {
      rule.value = displayValue(field, op, value)
    }
    rules.push(rule)
  }

  let sort = []
  const rawSort = String(lower.sort || '').trim()
  const desc = String(lower.order || '').toLowerCase() === 'desc'
  if (rawSort.toLowerCase() === 'random') sort = 'random'
  else if (rawSort) {
    sort = rawSort.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
      const d = p.startsWith('-')
      const name = p.replace(/^[+-]/, '').trim().toLowerCase()
      return { field: name, desc: d !== desc }
    })
  }
  const limit = Number(lower.limit) || 0
  const percent = Number(lower.limitpercent) || 0
  return {
    match,
    rules: rules.length ? rules : [newRule(fields)],
    sort,
    limitType: limit > 0 ? 'songs' : percent > 0 ? 'percent' : 'none',
    limit: limit > 0 ? limit : percent > 0 ? percent : 100,
  }
}

// ---------- Readable summary ----------

/** One line describing rules, for the playlist page. */
export function describeCriteria(criteria, fields, playlistName = (id) => id) {
  const model = fromCriteria(criteria, fields)
  if (!model) return 'Advanced rules'
  const parts = model.rules
    .filter((r) => !ruleError(r, fields))
    .map((r) => {
      const field = findField(fields, r.field)
      const op = OPERATORS[r.op]
      if (field.type === 'playlist') return `${op.label === 'is in' ? 'in' : 'not in'} playlist "${playlistName(r.value)}"`
      const unit = field.type === 'duration' ? ' min' : ''
      if (op.arity === 0) return `${field.label} ${op.label}`
      if (op.arity === 2) return `${field.label} ${op.label} ${r.value} and ${r.value2}${unit}`
      if (r.op === 'inTheLast' || r.op === 'notInTheLast') {
        const u = PERIOD_UNITS.find((p) => p.value === r.unit)
        return `${field.label} ${op.label} ${r.value} ${Number(r.value) === 1 ? u.label.replace(/s$/, '') : u.label}`
      }
      return `${field.label} ${op.label} ${field.type === 'text' ? `"${r.value}"` : r.value}${unit}`
    })
  let text = parts.join(model.match === 'all' ? ' and ' : ' or ')
  if (model.sort === 'random') text += ', random order'
  else if (model.sort.length) text += `, sorted by ${model.sort.map((s) => `${findField(fields, s.field).label.toLowerCase()}${s.desc ? ' (descending)' : ''}`).join(', ')}`
  if (model.limitType === 'songs') text += `, at most ${model.limit} songs`
  if (model.limitType === 'percent') text += `, ${model.limit}% of the matching songs`
  return text
}

// ---------- Templates ----------

export const TEMPLATES = [
  {
    id: 'never-played',
    name: 'Never played',
    description: 'Songs you have never listened to, in random order',
    rules: { all: [{ is: { playcount: 0 } }, { is: { missing: false } }], sort: 'random', limit: 100 },
  },
  {
    id: 'recently-added',
    name: 'Recently added',
    description: 'Songs added in the last 30 days, newest first',
    rules: { all: [{ inTheLast: { dateadded: 30 } }], sort: '-dateadded', limit: 200 },
  },
  {
    id: 'top-50',
    name: 'Top 50',
    description: 'Your 50 most played songs',
    rules: { all: [{ gt: { playcount: 0 } }], sort: '-playcount,-lastplayed', limit: 50 },
  },
  {
    id: 'forgotten-favorites',
    name: 'Forgotten favorites',
    description: 'Favorites not played for 6 months',
    rules: { all: [{ is: { loved: true } }, { notInTheLast: { lastplayed: 180 } }], sort: 'random', limit: 50 },
  },
  {
    id: 'top-rated',
    name: 'Top rated',
    description: 'Songs rated 4 or 5 stars, in random order',
    rules: { all: [{ gt: { rating: 3 } }], sort: 'random', limit: 100 },
  },
  {
    id: 'genre-mix',
    name: 'Genre mix',
    description: 'One genre in random order: choose the genre',
    rules: { all: [{ is: { genre: '' } }], sort: 'random', limit: 100 },
  },
  {
    id: 'random-mix',
    name: 'Random mix',
    description: '100 random songs from the whole library',
    rules: { all: [{ is: { missing: false } }], sort: 'random', limit: 100 },
  },
]

// ---------- .nsp files (Navidrome smart playlist) ----------

/** Content of a .nsp file: the rules with the playlist name and comment. */
export function toNsp(playlist) {
  return JSON.stringify({ name: playlist.name, comment: playlist.comment || undefined, ...playlist.rules }, null, 2)
}

/** Parses a .nsp file. Returns { name, comment, rules }; throws on invalid content. */
export function parseNsp(text, fileName = 'Dynamic playlist') {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Not a valid .nsp file (invalid JSON)')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Not a valid .nsp file')
  const { name, comment, ...rules } = data
  const keys = Object.keys(rules).map((k) => k.toLowerCase())
  if (!keys.includes('all') && !keys.includes('any')) throw new Error('No rules found ("all" or "any")')
  return { name: (name || fileName.replace(/\.nsp$/i, '')).trim(), comment: comment || '', rules }
}

export const isNspFile = (file) => /\.nsp$/i.test(file.name)
