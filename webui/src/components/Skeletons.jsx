// Cisum web player v0.11.0 - Placeholders drawn while page content loads.
// They keep the final layout in place, so nothing jumps when the data arrives.
import { useEffect, useState } from 'react'
import { Box, Skeleton } from '@mui/material'

/** True after `delay` ms: fast loads finish before any placeholder is drawn (no flash). */
export function useDelayed(delay = 200) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return ready
}

/** Track rows with the same height as TrackList rows. */
export function TrackListSkeleton({ count = 8, showCover = false }) {
  const visible = useDelayed()
  const rows = Math.max(1, Math.min(count || 8, 12))
  return (
    <Box aria-busy="true" aria-label="Loading songs" sx={{ visibility: visible ? 'visible' : 'hidden' }}>
      {Array.from({ length: rows }, (_, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, height: 56, px: 1 }}>
          {showCover ? <Skeleton variant="rounded" width={40} height={40} /> : <Skeleton width={24} />}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Skeleton width={`${40 + ((i * 37) % 35)}%`} />
            <Skeleton width={`${20 + ((i * 23) % 20)}%`} sx={{ fontSize: '0.8rem' }} />
          </Box>
          <Skeleton width={36} />
        </Box>
      ))}
    </Box>
  )
}

/** Square cards in the same grid as CardGrid. */
export function CardGridSkeleton({ count = 6, round = false, min = 168 }) {
  const visible = useDelayed()
  const cards = Math.max(1, Math.min(count || 6, 12))
  return (
    <Box
      aria-busy="true"
      sx={{
        visibility: visible ? 'visible' : 'hidden',
        display: 'grid', gap: { xs: 2, md: 3 }, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: `repeat(auto-fill, minmax(${min}px, 1fr))` },
      }}
    >
      {Array.from({ length: cards }, (_, i) => (
        <Box key={i} sx={{ minWidth: 0 }}>
          <Skeleton variant={round ? 'circular' : 'rounded'} sx={{ width: '100%', height: 'auto', aspectRatio: '1 / 1', borderRadius: round ? '50%' : 4 }} />
          <Skeleton width="70%" sx={{ mt: 1 }} />
          <Skeleton width="45%" />
        </Box>
      ))}
    </Box>
  )
}

/** Header placeholder for a page opened without any preview (direct link, page reload). */
export function DetailHeaderSkeleton({ round = false }) {
  const visible = useDelayed()
  return (
    <Box
      aria-busy="true"
      sx={{
        visibility: visible ? 'visible' : 'hidden',
        display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'flex-end' },
        gap: { xs: 2.5, sm: 4 }, mt: { xs: 1, md: 2 }, mb: 3, p: { xs: 2, md: 3 },
      }}
    >
      <Box sx={{ width: { xs: '62%', sm: 200, md: 232 }, maxWidth: 260, flexShrink: 0, alignSelf: { xs: 'center', sm: 'auto' } }}>
        <Skeleton variant={round ? 'circular' : 'rounded'} sx={{ width: '100%', height: 'auto', aspectRatio: '1 / 1', borderRadius: round ? '50%' : 5 }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
        <Skeleton sx={{ fontSize: { xs: '1.9rem', md: '2.9rem' }, width: '60%' }} />
        <Skeleton sx={{ fontSize: '1.25rem', width: '35%' }} />
        <Skeleton width="45%" />
        <Box sx={{ display: 'flex', gap: 1, mt: 2.5 }}>
          <Skeleton variant="rounded" width={96} height={40} sx={{ borderRadius: 999 }} />
          <Skeleton variant="rounded" width={112} height={40} sx={{ borderRadius: 999 }} />
        </Box>
      </Box>
    </Box>
  )
}
