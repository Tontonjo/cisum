// Cisum web player v0.11.2 - Public share page (no account needed), served at /share/{id}.
// Streams through the share's signed track links; nothing else of the library is reachable.
// Playback starts inside the click handler (browser autoplay rules), shows a loading state and
// retries a failed stream (server busy transcoding answers 429) before reporting an error.
import { useEffect, useRef, useState } from 'react'
import { Box, Typography, IconButton, Button, Slider, CircularProgress, useTheme } from '@mui/material'
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import PauseRounded from '@mui/icons-material/PauseRounded'
import SkipNextRounded from '@mui/icons-material/SkipNextRounded'
import SkipPreviousRounded from '@mui/icons-material/SkipPreviousRounded'
import DownloadRounded from '@mui/icons-material/DownloadRounded'
import GraphicEqRounded from '@mui/icons-material/GraphicEqRounded'
import config from '../config'
import { formatTime, formatLength, plural } from '../utils/format'
import { BrandMark } from '../components/Brand'

const RETRY_DELAYS = [1500, 5000] // ms between automatic retries of a failed stream

const shareImage = () => document.querySelector('meta[property="og:image"]')?.getAttribute('content') || ''

export default function SharePage({ share }) {
  const { m3 } = useTheme()
  const audio = useRef(null)
  const indexRef = useRef(-1) // current track for audio event handlers and retry timers
  const retries = useRef(0)
  const retryTimer = useRef(null)
  const [index, setIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [time, setTime] = useState(0)
  const tracks = share.tracks || []
  const track = tracks[index]
  const image = shareImage()
  const total = tracks.reduce((s, t) => s + (t.duration || 0), 0)

  useEffect(() => {
    document.title = `${share.description || 'Shared music'} - Cisum`
  }, [share.description])

  useEffect(() => () => clearTimeout(retryTimer.current), [])

  // Points the audio element at track i and plays it. Called synchronously from clicks.
  const load = (i) => {
    const a = audio.current
    a.src = `${config.baseURL}/share/s/${tracks[i].id}`
    setLoading(true)
    a.play().catch((e) => {
      if (e.name === 'AbortError') return // replaced by a newer load
      if (e.name === 'NotAllowedError') { setLoading(false); setPlaying(false) } // browser wants a click
      // Stream errors are handled by onError (retry)
    })
  }

  const start = (i) => {
    if (i < 0 || i >= tracks.length) return
    clearTimeout(retryTimer.current)
    retries.current = 0
    indexRef.current = i
    setIndex(i)
    setFailed(false)
    setTime(0)
    load(i)
  }

  const onError = () => {
    const i = indexRef.current
    if (i < 0) return
    if (retries.current < RETRY_DELAYS.length) {
      retryTimer.current = setTimeout(() => indexRef.current === i && load(i), RETRY_DELAYS[retries.current++])
      return
    }
    setLoading(false)
    setPlaying(false)
    setFailed(true)
  }

  // Click on a song: start it, or toggle play/pause when it is already the current one.
  // While the current song is still loading a click is ignored, so it cannot pause it by mistake.
  const play = (i) => {
    if (i !== index || failed) return start(i)
    if (loading) return
    const a = audio.current
    if (a.paused) a.play().catch(() => setPlaying(false))
    else a.pause()
  }
  const next = () => start(index + 1)
  const prev = () => start(index - 1)

  const rowIcon = (i) => {
    if (i !== index) return i + 1
    if (failed) return <ErrorOutlineRounded fontSize="small" color="error" />
    if (loading) return <CircularProgress size={18} />
    return playing ? <GraphicEqRounded fontSize="small" /> : i + 1
  }

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: m3.surface, pb: track ? 14 : 4 }}>
      <Box sx={{ maxWidth: 820, mx: 'auto', px: 2, pt: { xs: 3, md: 6 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 4, color: m3.onSurfaceVariant }}>
          <BrandMark size={28} />
          <Typography variant="subtitle2">Shared with Cisum</Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 3, alignItems: { sm: 'flex-end' }, mb: 4 }}>
          {image && <Box component="img" src={image} alt="" sx={{ width: { xs: '60%', sm: 200 }, aspectRatio: '1', borderRadius: 5, objectFit: 'cover', alignSelf: { xs: 'center', sm: 'auto' } }} />}
          <Box>
            <Typography variant="h2" component="h1" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' } }}>{share.description || 'Shared music'}</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>{plural(tracks.length, 'song')}, {formatLength(total)}</Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
              <Button variant="contained" startIcon={<PlayArrowRounded />} onClick={() => start(0)} disabled={!tracks.length}>Play</Button>
              {share.downloadable && (
                <Button variant="outlined" startIcon={<DownloadRounded />} component="a" href={`${config.baseURL}/share/d/${share.id}`}>Download</Button>
              )}
            </Box>
          </Box>
        </Box>
        {tracks.map((t, i) => {
          const current = i === index
          return (
            <Box
              key={t.id}
              onClick={() => play(i)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 2, px: 1.5, minHeight: 56, borderRadius: 3, cursor: 'pointer',
                bgcolor: current ? m3.secondaryContainer : 'transparent', color: current ? m3.onSecondaryContainer : undefined,
                '&:hover': { bgcolor: current ? m3.secondaryContainer : 'action.hover' },
              }}
            >
              <Box sx={{ width: 24, textAlign: 'center', color: current ? m3.primary : m3.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
                {rowIcon(i)}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 550 }}>{t.title}</Typography>
                <Typography variant="body2" noWrap color={current ? 'inherit' : 'text.secondary'}>{[t.artist, t.album].filter(Boolean).join(', ')}</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatTime(t.duration)}</Typography>
            </Box>
          )
        })}
      </Box>

      <audio
        ref={audio}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => { setLoading(false); retries.current = 0 }}
        onError={onError}
        onEnded={next}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
      />

      {track && (
        <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, bgcolor: m3.surfaceContainer, px: 2, pt: 1, pb: 'calc(12px + env(safe-area-inset-bottom))' }}>
          <Box sx={{ maxWidth: 820, mx: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatTime(time)}</Typography>
              <Slider size="small" value={time} max={track.duration || 1} onChange={(_, v) => (audio.current.currentTime = v)} aria-label="Seek" />
              <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatTime(track.duration)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" noWrap>{track.title}</Typography>
                {failed
                  ? <Typography variant="body2" color="error" noWrap>Could not be played, tap to retry</Typography>
                  : <Typography variant="body2" color="text.secondary" noWrap>{track.artist}</Typography>}
              </Box>
              <IconButton onClick={prev} aria-label="Previous track"><SkipPreviousRounded /></IconButton>
              <IconButton onClick={() => play(index)} aria-label={playing ? 'Pause' : 'Play'} sx={{ bgcolor: m3.primary, color: m3.onPrimary, '&:hover': { bgcolor: m3.primary } }}>
                {loading ? <CircularProgress size={24} color="inherit" /> : playing ? <PauseRounded /> : <PlayArrowRounded />}
              </IconButton>
              <IconButton onClick={next} aria-label="Next track"><SkipNextRounded /></IconButton>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
