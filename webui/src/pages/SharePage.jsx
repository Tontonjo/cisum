// Cisum web player v0.4.0 - Public share page (no account needed), served at /share/{id}.
// Streams through the share's signed track links; nothing else of the library is reachable.
import { useEffect, useRef, useState } from 'react'
import { Box, Typography, IconButton, Button, Slider, useTheme } from '@mui/material'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import PauseRounded from '@mui/icons-material/PauseRounded'
import SkipNextRounded from '@mui/icons-material/SkipNextRounded'
import SkipPreviousRounded from '@mui/icons-material/SkipPreviousRounded'
import DownloadRounded from '@mui/icons-material/DownloadRounded'
import GraphicEqRounded from '@mui/icons-material/GraphicEqRounded'
import config from '../config'
import { formatTime, formatLength, plural } from '../utils/format'
import { BrandMark } from '../components/Brand'

const shareImage = () => document.querySelector('meta[property="og:image"]')?.getAttribute('content') || ''

export default function SharePage({ share }) {
  const { m3 } = useTheme()
  const audio = useRef(null)
  const [index, setIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const tracks = share.tracks || []
  const track = tracks[index]
  const image = shareImage()
  const total = tracks.reduce((s, t) => s + (t.duration || 0), 0)

  useEffect(() => {
    document.title = `${share.description || 'Shared music'} - Cisum`
  }, [share.description])

  useEffect(() => {
    const a = audio.current
    if (!a || !track) return
    a.src = `${config.baseURL}/share/s/${track.id}`
    a.play().catch(() => setPlaying(false))
  }, [index, track])

  const play = (i) => {
    if (i === index) {
      const a = audio.current
      a.paused ? a.play() : a.pause()
    } else setIndex(i)
  }
  const next = () => index + 1 < tracks.length && setIndex(index + 1)
  const prev = () => index > 0 && setIndex(index - 1)

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
              <Button variant="contained" startIcon={<PlayArrowRounded />} onClick={() => setIndex(0)} disabled={!tracks.length}>Play</Button>
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
                {current && playing ? <GraphicEqRounded fontSize="small" /> : i + 1}
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
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
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
                <Typography variant="body2" color="text.secondary" noWrap>{track.artist}</Typography>
              </Box>
              <IconButton onClick={prev} aria-label="Previous track"><SkipPreviousRounded /></IconButton>
              <IconButton onClick={() => play(index)} aria-label={playing ? 'Pause' : 'Play'} sx={{ bgcolor: m3.primary, color: m3.onPrimary, '&:hover': { bgcolor: m3.primary } }}>
                {playing ? <PauseRounded /> : <PlayArrowRounded />}
              </IconButton>
              <IconButton onClick={next} aria-label="Next track"><SkipNextRounded /></IconButton>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
