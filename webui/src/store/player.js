// Cisum web player v0.11.2 - Playback engine and play queue.
// A single <audio> element drives playback. Web radios are queue entries with isRadio: they play
// through the server relay (direct URL as fallback), are never scrobbled and show the live title. Queue state lives in `usePlayer`; the fast-changing
// position lives in `useProgress` so only progress widgets re-render 4 times per second.
import { create } from 'zustand'
import { streamUrl, coverUrl } from '../api/client'
import { scrobble } from '../api/library'
import { radioStreamUrl, getRadioNowPlaying } from '../api/radio'
import { useUi } from './ui'
import config from '../config'

const QUEUE_KEY = 'cisum-queue'
const SCROBBLE_MIN_SECONDS = 240 // Last.fm rule: half the track or 4 minutes

const audio = new Audio()
audio.preload = 'auto'

export const useProgress = create(() => ({ time: 0, duration: 0, buffering: false }))

function shuffleArray(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Queue entries get a unique key so the same song can appear twice
let keySeq = 0
const withKeys = (tracks) => tracks.filter((t) => !t.missing).map((t) => ({ ...t, qkey: `q${++keySeq}` }))

function loadQueue() {
  try {
    const saved = JSON.parse(localStorage.getItem(QUEUE_KEY))
    if (saved?.queue?.length) return { ...saved, queue: withKeys(saved.queue) }
  } catch {
    /* no saved queue */
  }
  return null
}

let saveTimer
function persist(state) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const { queue, index, volume, repeat, shuffle } = state
      localStorage.setItem(
        QUEUE_KEY,
        JSON.stringify({ queue: queue.slice(0, 1000), index, volume, repeat, shuffle, time: audio.currentTime }),
      )
    } catch {
      /* queue not persisted */
    }
  }, 500)
}

const saved = loadQueue()

export const usePlayer = create((set, get) => ({
  queue: saved?.queue || [],
  index: saved?.index ?? -1,
  playing: false,
  volume: saved?.volume ?? (config.defaultUIVolume ?? 100) / 100,
  muted: false,
  repeat: saved?.repeat || 'off', // 'off' | 'all' | 'one'
  shuffle: !!saved?.shuffle,
  error: null,
  radioInfo: null, // { title, name, genre, bitrate } of the station playing now
  radioHistory: [], // titles heard on the current station during this session, newest first

  current: () => get().queue[get().index] || null,

  /** Replaces the queue and starts playing at `start`. */
  playTracks: (tracks, start = 0, { shuffle = false } = {}) => {
    let list = withKeys(tracks)
    if (!list.length) return
    let index = Math.min(start, list.length - 1)
    if (shuffle) {
      list = shuffleArray(list)
      index = 0
    }
    set({ queue: list, index, shuffle })
    loadCurrent(true)
  },

  playNext: (tracks) => {
    const { queue, index } = get()
    const items = withKeys(tracks)
    if (index < 0) return get().playTracks(tracks)
    set({ queue: [...queue.slice(0, index + 1), ...items, ...queue.slice(index + 1)] })
  },

  addToQueue: (tracks) => {
    const { queue, index } = get()
    set({ queue: [...queue, ...withKeys(tracks)] })
    if (index < 0) {
      set({ index: 0 })
      loadCurrent(true)
    }
  },

  removeFromQueue: (qkey) => {
    const { queue, index } = get()
    const pos = queue.findIndex((t) => t.qkey === qkey)
    if (pos < 0) return
    const next = queue.filter((t) => t.qkey !== qkey)
    if (pos < index) set({ queue: next, index: index - 1 })
    else if (pos === index) {
      set({ queue: next, index: Math.min(index, next.length - 1) })
      loadCurrent(get().playing)
    } else set({ queue: next })
  },

  moveInQueue: (from, to) => {
    const { queue, index } = get()
    const next = [...queue]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    let newIndex = index
    if (from === index) newIndex = to
    else if (from < index && to >= index) newIndex--
    else if (from > index && to <= index) newIndex++
    set({ queue: next, index: newIndex })
  },

  clearQueue: () => {
    audio.pause()
    audio.removeAttribute('src')
    set({ queue: [], index: -1, playing: false })
    useProgress.setState({ time: 0, duration: 0 })
  },

  jumpTo: (i) => {
    set({ index: i })
    loadCurrent(true)
  },

  toggle: () => {
    const track = get().current()
    if (!track) return
    if (audio.paused) {
      // A live stream resumes at the live point, not where the buffer stopped
      if (!audio.src || track.isRadio) loadCurrent(true)
      else audio.play().catch(() => {})
    } else audio.pause()
  },

  next: (auto = false) => {
    const { queue, index, repeat } = get()
    if (auto && repeat === 'one') {
      audio.currentTime = 0
      audio.play().catch(() => {})
      return
    }
    if (index + 1 < queue.length) set({ index: index + 1 })
    else if (repeat === 'all' && queue.length) set({ index: 0 })
    else {
      set({ playing: false })
      return
    }
    loadCurrent(true)
  },

  prev: () => {
    const { index } = get()
    if (get().current()?.isRadio && index > 0) {
      set({ index: index - 1 })
      return loadCurrent(true)
    }
    if (audio.currentTime > 4 || index === 0) {
      audio.currentTime = 0
      return
    }
    set({ index: index - 1 })
    loadCurrent(true)
  },

  seek: (seconds) => {
    if (!Number.isFinite(seconds) || get().current()?.isRadio) return
    audio.currentTime = Math.max(0, seconds)
    useProgress.setState({ time: audio.currentTime })
  },

  setVolume: (volume) => {
    audio.volume = volume
    set({ volume, muted: false })
    audio.muted = false
  },

  toggleMute: () => {
    audio.muted = !audio.muted
    set({ muted: audio.muted })
  },

  cycleRepeat: () => set({ repeat: { off: 'all', all: 'one', one: 'off' }[get().repeat] }),

  toggleShuffle: () => {
    const { shuffle, queue, index } = get()
    if (!shuffle && queue.length > 1) {
      // Keep the current track first, shuffle the rest
      const current = queue[index]
      const rest = shuffleArray(queue.filter((_, i) => i !== index))
      set({ shuffle: true, queue: [current, ...rest], index: 0 })
    } else set({ shuffle: !shuffle })
  },

  /** Updates a track's starred flag wherever it appears in the queue. */
  markStarred: (id, starred) =>
    set({ queue: get().queue.map((t) => (t.id === id ? { ...t, starred } : t)) }),
}))

// ---------- Engine ----------

let scrobbled = false
let reportedNowPlaying = false
let radioDirect = false // the relay failed for this station: the direct URL is being tried
// A failed song stream is retried before showing an error (server busy transcoding answers 429, Retry-After 5 s)
const STREAM_RETRY_DELAYS = [1500, 5000] // ms
let streamRetries = 0
let retryTimer = null

function loadCurrent(autoplay, startAt = 0) {
  const track = usePlayer.getState().current()
  scrobbled = false
  reportedNowPlaying = false
  radioDirect = false
  streamRetries = 0
  clearTimeout(retryTimer)
  if (!track) {
    audio.pause()
    audio.removeAttribute('src')
    return
  }
  if (track.isRadio) {
    audio.src = radioStreamUrl(track.id)
    useProgress.setState({ time: 0, duration: 0 })
    const sameStation = usePlayer.getState().radioInfo?.stationId === track.id
    usePlayer.setState({ error: null, ...(sameStation ? {} : { radioInfo: null, radioHistory: [] }) })
    updateMediaSession(track)
    if (autoplay) audio.play().catch(() => usePlayer.setState({ playing: false }))
    pollRadio(1500)
    return
  }
  usePlayer.setState({ radioInfo: null, radioHistory: [] })
  audio.src = streamUrl(track.id)
  audio.currentTime = startAt
  useProgress.setState({ time: startAt, duration: track.duration || 0 })
  usePlayer.setState({ error: null })
  updateMediaSession(track)
  if (autoplay) audio.play().catch(() => usePlayer.setState({ playing: false }))
}

audio.volume = usePlayer.getState().volume
audio.addEventListener('play', () => usePlayer.setState({ playing: true }))
audio.addEventListener('pause', () => usePlayer.setState({ playing: false }))
audio.addEventListener('waiting', () => useProgress.setState({ buffering: true }))
audio.addEventListener('playing', () => {
  useProgress.setState({ buffering: false })
  streamRetries = 0
  const track = usePlayer.getState().current()
  if (track && !track.isRadio && !reportedNowPlaying) {
    reportedNowPlaying = true
    scrobble(track.id, false)
  }
})
audio.addEventListener('loadedmetadata', () => {
  if (Number.isFinite(audio.duration)) useProgress.setState({ duration: audio.duration })
})
audio.addEventListener('ended', () => usePlayer.getState().next(true))
audio.addEventListener('error', () => {
  if (!audio.src) return
  const track = usePlayer.getState().current()
  if (track?.isRadio && !radioDirect && track.streamUrl) {
    // Relay refused the stream (HLS) or the station blocked the server: try it from the browser
    radioDirect = true
    audio.src = track.streamUrl
    audio.play().catch(() => usePlayer.setState({ playing: false }))
    return
  }
  if (track && !track.isRadio && streamRetries < STREAM_RETRY_DELAYS.length) {
    const qkey = track.qkey
    const position = audio.currentTime || 0
    useProgress.setState({ buffering: true })
    retryTimer = setTimeout(() => {
      if (usePlayer.getState().current()?.qkey !== qkey) return // another song was chosen meanwhile
      audio.src = streamUrl(track.id)
      audio.currentTime = position
      audio.play().catch(() => {})
    }, STREAM_RETRY_DELAYS[streamRetries++])
    return
  }
  useProgress.setState({ buffering: false })
  const error = track?.isRadio ? `${track.title} cannot be played right now` : 'This track could not be played'
  usePlayer.setState({ playing: false, error })
  useUi.getState().notify(error)
})

let lastTick = 0
audio.addEventListener('timeupdate', () => {
  const now = performance.now()
  if (now - lastTick < 250) return
  lastTick = now
  useProgress.setState({ time: audio.currentTime })
  const track = usePlayer.getState().current()
  if (track?.isRadio) return
  const duration = audio.duration || track?.duration || 0
  if (track && !scrobbled && duration > 30 && (audio.currentTime > duration / 2 || audio.currentTime > SCROBBLE_MIN_SECONDS)) {
    scrobbled = true
    scrobble(track.id, true)
  }
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && Number.isFinite(audio.duration)) {
    try {
      navigator.mediaSession.setPositionState({ duration: audio.duration, position: audio.currentTime, playbackRate: 1 })
    } catch {
      /* unsupported */
    }
  }
})

usePlayer.subscribe((state) => persist(state))

// Restore the saved track (paused) so the player shows where the user left off.
// A saved station is only shown: its stream starts when the user presses play.
if (saved && usePlayer.getState().current() && !usePlayer.getState().current().isRadio) {
  const t = usePlayer.getState().current()
  audio.src = streamUrl(t.id)
  audio.preload = 'metadata'
  const restoreAt = saved.time || 0
  audio.addEventListener('loadedmetadata', function restore() {
    audio.removeEventListener('loadedmetadata', restore)
    audio.currentTime = restoreAt
    audio.preload = 'auto'
  })
  useProgress.setState({ time: restoreAt, duration: t.duration || 0 })
}

// ---------- OS media controls ----------

function updateMediaSession(track) {
  const live = track.isRadio ? usePlayer.getState().radioInfo?.title : null
  const title = track.isRadio ? live || track.title : track.title
  const artist = track.isRadio ? (live ? track.title : 'Web radio') : track.artist
  document.title = `${title} - ${artist}`
  if (!('mediaSession' in navigator)) return
  const art = coverUrl(track.coverArt, 512, track.coverVersion)
  navigator.mediaSession.metadata = new window.MediaMetadata({
    title,
    artist,
    album: track.isRadio ? '' : track.album,
    artwork: art ? [{ src: art, sizes: '512x512' }] : [],
  })
}

// ---------- Web radio title ----------

const RADIO_POLL_MS = 15000
let radioTimer

/** Asks the server what the current station plays, then again every 15 s while it plays. */
function pollRadio(delay = RADIO_POLL_MS) {
  clearTimeout(radioTimer)
  radioTimer = setTimeout(async () => {
    const track = usePlayer.getState().current()
    if (!track?.isRadio) return
    if (!usePlayer.getState().playing) return pollRadio(2000) // paused or buffering: check again soon
    try {
      const info = await getRadioNowPlaying(track.id)
      if (usePlayer.getState().current()?.id !== track.id) return // station changed meanwhile
      const { radioInfo, radioHistory } = usePlayer.getState()
      const changed = info.title && info.title !== radioInfo?.title
      usePlayer.setState({
        radioInfo: { ...info, stationId: track.id },
        radioHistory: changed ? [{ title: info.title, at: Date.now() }, ...radioHistory].slice(0, 30) : radioHistory,
      })
      if (changed || !radioInfo) updateMediaSession(track)
    } catch {
      /* title unavailable, keep the last one */
    }
    pollRadio()
  }, delay)
}

if ('mediaSession' in navigator) {
  const p = () => usePlayer.getState()
  const handlers = {
    play: () => p().toggle(),
    pause: () => p().toggle(),
    previoustrack: () => p().prev(),
    nexttrack: () => p().next(),
    seekto: (e) => p().seek(e.seekTime),
  }
  for (const [action, fn] of Object.entries(handlers)) {
    try {
      navigator.mediaSession.setActionHandler(action, fn)
    } catch {
      /* action unsupported */
    }
  }
}
