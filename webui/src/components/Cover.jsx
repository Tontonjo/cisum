// Cisum web player v0.11.3 - Cover art image with a neutral placeholder.
import { useEffect, useState } from 'react'
import { Box, useTheme } from '@mui/material'
import MusicNoteRounded from '@mui/icons-material/MusicNoteRounded'
import { coverUrl } from '../api/client'
import { COVER_PX } from '../config'

/**
 * Size (px) to request for a cover displayed at size (CSS px, undefined = fills its parent).
 * Anything up to the server prepared size uses that size: it is already resized and cached on the
 * server, and the browser downscales it for free. Larger displays ask for 2x, rounded, max 600.
 */
export function coverRequestPx(size) {
  if (typeof size !== 'number') return COVER_PX
  const needed = Math.min(Math.ceil(size * 2 / 100) * 100, 600)
  return needed <= COVER_PX ? COVER_PX : needed
}

/**
 * size: number (px) for fixed covers, or undefined to fill the parent width (square).
 * icon: placeholder icon component (default music note); version: cache buster for replaced images.
 * hint: size (px) of the same cover already displayed elsewhere; that copy is in the browser cache and
 * is shown at once underneath while the requested size loads.
 */
export default function Cover({ id, size, radius = 3, request, alt = '', sx, round = false, icon: Icon = MusicNoteRounded, version, hint }) {
  const { m3 } = useTheme()
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [id, version])
  const px = request || coverRequestPx(size)
  const src = id && !failed ? coverUrl(id, px, version) : null
  const hintSrc = src && hint && hint !== px ? coverUrl(id, hint, version) : null
  const dims = typeof size === 'number' ? { width: size, height: size } : { width: '100%', aspectRatio: '1 / 1' }
  return (
    <Box
      sx={{
        ...dims, flexShrink: 0, borderRadius: round ? '50%' : radius, overflow: 'hidden', position: 'relative',
        bgcolor: m3.surfaceContainerHighest, color: m3.onSurfaceVariant, display: 'grid', placeItems: 'center',
        ...(hintSrc && { backgroundImage: `url("${hintSrc}")`, backgroundSize: 'cover', backgroundPosition: 'center' }),
        ...sx,
      }}
    >
      {src ? (
        <Box component="img" src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <Icon sx={{ fontSize: typeof size === 'number' ? size * 0.4 : 48, opacity: 0.6 }} />
      )}
    </Box>
  )
}
