// Cisum web player v0.5.0 - Lyrics: full panel (Lyrics tab), compact view (under the cover) and
// one-line view (above the progress bar).
// Synced lyrics follow playback; click a line to jump to it.
import { useEffect, useRef } from 'react'
import { Box, Typography, CircularProgress, useTheme, alpha } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { getLyrics } from '../api/library'
import { usePlayer, useProgress } from '../store/player'

const MANUAL_SCROLL_PAUSE = 4000 // ms without auto-scroll after the user scrolls

export function activeIndex(lines, ms) {
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= ms) idx = i
    else break
  }
  return idx
}

// Highlight lands slightly ahead of the voice
const LEAD_MS = 300

export function useLyrics(id) {
  return useQuery({ queryKey: ['lyrics', id], queryFn: () => getLyrics(id), staleTime: Infinity, enabled: !!id })
}

export default function LyricsPanel({ track }) {
  const { m3 } = useTheme()
  const seek = usePlayer((s) => s.seek)
  const containerRef = useRef()
  const lastManual = useRef(0)
  const { data, isLoading } = useLyrics(track.id)
  const lines = data?.lines || []
  const synced = !!data?.synced
  const current = useProgress((s) => (synced ? activeIndex(lines, s.time * 1000 + LEAD_MS) : -1))

  useEffect(() => {
    if (current < 0 || Date.now() - lastManual.current < MANUAL_SCROLL_PAUSE) return
    const el = containerRef.current?.querySelector(`[data-line="${current}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [current])

  if (isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    )
  }

  if (!lines.length) {
    return (
      <Box sx={{ py: 8, px: 2, textAlign: 'center' }}>
        <Typography variant="h5" component="p" sx={{ mb: 1 }}>No lyrics for this song</Typography>
        <Typography color="text.secondary" variant="body2" sx={{ maxWidth: 360, mx: 'auto' }}>
          Add a .lrc file next to the audio file, with the same name, or embed lyrics in the tags.
        </Typography>
      </Box>
    )
  }

  return (
    <Box
      ref={containerRef}
      onWheel={() => (lastManual.current = Date.now())}
      onTouchMove={() => (lastManual.current = Date.now())}
      sx={{ py: { xs: 2, md: 6 }, px: { xs: 1, md: 2 } }}
    >
      {lines.map((line, i) => {
        const isActive = i === current
        const isPast = synced && i < current
        return (
          <Box
            key={i}
            data-line={i}
            component={synced ? 'button' : 'p'}
            onClick={synced ? () => seek(line.time / 1000) : undefined}
            sx={{
              display: 'block', width: '100%', textAlign: 'left', border: 0, bgcolor: 'transparent', p: 0, m: 0,
              py: 0.75, font: 'inherit', cursor: synced ? 'pointer' : 'default',
              fontFamily: '"Bricolage Grotesque Variable", sans-serif',
              fontSize: { xs: '1.35rem', md: '1.75rem' }, fontWeight: 650, lineHeight: 1.3,
              color: !synced || isActive ? m3.onSurface : alpha(m3.onSurface, isPast ? 0.42 : 0.3),
              transition: 'color 250ms',
              '&:hover': synced ? { color: alpha(m3.onSurface, 0.75) } : undefined,
              minHeight: line.text ? undefined : '1.2em',
            }}
          >
            {line.text}
          </Box>
        )
      })}
    </Box>
  )
}

/**
 * Compact synced lyrics: previous, current and next line. Renders nothing when the song has no
 * synced lyrics. Clicking a line jumps to it; `onOpen` opens the full lyrics.
 */
export function CompactLyrics({ track, onOpen }) {
  const { m3 } = useTheme()
  const seek = usePlayer((s) => s.seek)
  const { data } = useLyrics(track.id)
  const lines = data?.synced ? data.lines.filter((l) => l.text.trim()) : []
  const current = useProgress((s) => (lines.length ? activeIndex(lines, s.time * 1000 + LEAD_MS) : -1))
  if (!lines.length) return null

  // Before the first line: preview the first two lines
  const center = Math.max(current, 0)
  const rows = [center - 1, center, center + 1].map((i) => (i >= 0 && i < lines.length ? i : null))

  return (
    <Box
      role="region"
      aria-label="Lyrics"
      aria-live="off"
      sx={{ width: '100%', mt: 2.5, px: 0.5, textAlign: { xs: 'left', md: 'center' }, cursor: onOpen ? 'pointer' : 'default' }}
      onClick={onOpen}
    >
      {rows.map((i, pos) => {
        const isActive = i !== null && i === current
        return (
          <Box
            key={pos}
            component="p"
            onClick={i !== null ? (e) => { e.stopPropagation(); seek(lines[i].time / 1000) } : undefined}
            sx={{
              m: 0, py: 0.25, minHeight: '1.5em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontFamily: '"Bricolage Grotesque Variable", sans-serif', fontWeight: 650,
              fontSize: pos === 1 ? '1.15rem' : '0.95rem', lineHeight: 1.35,
              color: isActive ? m3.onSurface : alpha(m3.onSurface, pos === 1 ? 0.55 : 0.32),
              cursor: i !== null ? 'pointer' : 'default', transition: 'color 250ms, font-size 250ms',
            }}
          >
            {i !== null ? lines[i].text : ''}
          </Box>
        )
      })}
    </Box>
  )
}

/**
 * Current synced line shown above the progress bar of the player (Cisum v0.5.0). Renders nothing
 * without synced lyrics. Same setting as the lyrics under the cover.
 */
export function LyricLine({ track, sx }) {
  const { m3 } = useTheme()
  const { data } = useLyrics(track.id)
  const lines = data?.synced ? data.lines.filter((l) => l.text.trim()) : []
  const current = useProgress((s) => (lines.length ? activeIndex(lines, s.time * 1000 + LEAD_MS) : -1))
  if (!lines.length) return null
  const text = current >= 0 ? lines[current].text : ''
  return (
    <Box
      aria-label="Current lyrics line"
      sx={{
        minHeight: '1.4em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center',
        fontFamily: '"Bricolage Grotesque Variable", sans-serif', fontWeight: 650, fontSize: '0.9rem', lineHeight: 1.4,
        color: m3.onSurface, ...sx,
      }}
    >
      <Box key={current} component="span" sx={{ display: 'inline-block', animation: 'cisumLyricIn 250ms ease-out',
        '@keyframes cisumLyricIn': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } } }}>
        {text}
      </Box>
    </Box>
  )
}
