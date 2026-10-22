// Cisum web player v0.1.0 - Waveform progress bar.
// Draws the track's peaks on a canvas: played part in the primary color, the rest muted, and a
// preview of the hovered position. Click or drag to seek; arrow keys move 5 s (Shift: 30 s).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, useTheme, alpha } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { getWaveform } from '../api/library'
import { usePlayer, useProgress } from '../store/player'
import { formatTime } from '../utils/format'
import config from '../config'

const FLAT = 0.18 // bar height used while loading or when no waveform is available

function bucket(peaks, count) {
  if (!peaks?.length) return null
  const out = new Array(count)
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * peaks.length) / count)
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / count))
    let m = 0
    for (let j = start; j < end && j < peaks.length; j++) m = Math.max(m, peaks[j])
    out[i] = m
  }
  return out
}

export default function Waveform({ trackId, height = 40, bar = 3, gap = 2, showTimes = false }) {
  const { m3 } = useTheme()
  const canvasRef = useRef()
  const wrapRef = useRef()
  const hoverRef = useRef(null) // 0-1 or null
  const dragRef = useRef(false)
  const growRef = useRef(1) // entrance animation progress
  const [hoverLabel, setHoverLabel] = useState(null)
  const seek = usePlayer((s) => s.seek)

  const { data: peaks } = useQuery({
    queryKey: ['waveform', trackId],
    queryFn: () => getWaveform(trackId),
    enabled: !!trackId && config.waveformEnabled !== false,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(h * dpr)
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, h)

    const count = Math.max(1, Math.floor((width + gap) / (bar + gap)))
    const values = bucket(peaks, count)
    const { time, duration } = useProgress.getState()
    const progress = duration > 0 ? Math.min(time / duration, 1) : 0
    const hover = hoverRef.current
    const grow = growRef.current

    const played = m3.primary
    const rest = alpha(m3.onSurfaceVariant, 0.32)
    const preview = alpha(m3.primary, 0.55)
    const radius = bar / 2

    for (let i = 0; i < count; i++) {
      const x = i * (bar + gap)
      const pos = (i + 0.5) / count
      const v = values ? Math.max(values[i] * grow, FLAT * 0.5) : FLAT
      const bh = Math.max(bar, v * h)
      const y = (h - bh) / 2
      if (pos <= progress) ctx.fillStyle = played
      else if (hover !== null && pos <= hover) ctx.fillStyle = preview
      else ctx.fillStyle = rest
      ctx.beginPath()
      ctx.roundRect ? ctx.roundRect(x, y, bar, bh, radius) : ctx.rect(x, y, bar, bh)
      ctx.fill()
    }
  }, [peaks, m3, bar, gap])

  // Entrance: bars grow from the center line once peaks arrive
  useEffect(() => {
    if (!peaks) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      growRef.current = 1
      draw()
      return
    }
    let raf
    const start = performance.now()
    const step = (now) => {
      const t = Math.min((now - start) / 450, 1)
      growRef.current = 1 - Math.pow(1 - t, 3)
      draw()
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [peaks, draw])

  // Redraw on progress, theme and size changes without re-rendering React
  useEffect(() => {
    draw()
    const unsub = useProgress.subscribe(draw)
    const ro = new ResizeObserver(draw)
    if (canvasRef.current) ro.observe(canvasRef.current)
    return () => {
      unsub()
      ro.disconnect()
    }
  }, [draw])

  const ratioAt = (e) => {
    const rect = wrapRef.current.getBoundingClientRect()
    return Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
  }

  const onPointerDown = (e) => {
    dragRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    hoverRef.current = ratioAt(e)
    draw()
  }
  const onPointerMove = (e) => {
    const r = ratioAt(e)
    hoverRef.current = r
    const { duration } = useProgress.getState()
    setHoverLabel({ x: r, text: formatTime(r * duration) })
    draw()
  }
  const onPointerUp = (e) => {
    if (!dragRef.current) return
    dragRef.current = false
    seek(ratioAt(e) * useProgress.getState().duration)
  }
  const onLeave = () => {
    if (dragRef.current) return
    hoverRef.current = null
    setHoverLabel(null)
    draw()
  }
  const onKeyDown = (e) => {
    const { time, duration } = useProgress.getState()
    const step = e.shiftKey ? 30 : 5
    if (e.key === 'ArrowRight') seek(Math.min(time + step, duration))
    else if (e.key === 'ArrowLeft') seek(Math.max(time - step, 0))
    else if (e.key === 'Home') seek(0)
    else return
    e.preventDefault()
  }

  const { time, duration } = useProgress()

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
      {showTimes && <TimeLabel value={time} />}
      <Box
        ref={wrapRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onLeave}
        onKeyDown={onKeyDown}
        sx={{ position: 'relative', flex: 1, height, cursor: 'pointer', touchAction: 'none', borderRadius: 1, '&:focus-visible': { outlineOffset: 4 } }}
      >
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        {hoverLabel && (
          <Box
            sx={{
              position: 'absolute', bottom: '100%', mb: 0.75, left: `${hoverLabel.x * 100}%`, transform: 'translateX(-50%)',
              px: 0.75, py: 0.25, borderRadius: 1, fontSize: '0.7rem', fontWeight: 600, pointerEvents: 'none',
              bgcolor: m3.inverseSurface, color: m3.inverseOnSurface, fontVariantNumeric: 'tabular-nums',
            }}
          >
            {hoverLabel.text}
          </Box>
        )}
      </Box>
      {showTimes && <TimeLabel value={duration} />}
    </Box>
  )
}

function TimeLabel({ value }) {
  return (
    <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'center' }}>
      {formatTime(value)}
    </Box>
  )
}
