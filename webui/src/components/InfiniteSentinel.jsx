// Cisum web player v0.1.0 - Calls onVisible when scrolled into view (infinite lists).
import { useEffect, useRef } from 'react'
import { Box, CircularProgress } from '@mui/material'

export default function InfiniteSentinel({ onVisible, loading, done }) {
  const ref = useRef()
  useEffect(() => {
    if (done) return
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && onVisible(), { rootMargin: '600px' })
    if (ref.current) io.observe(ref.current)
    return () => io.disconnect()
  }, [onVisible, done])
  return (
    <Box ref={ref} sx={{ display: 'grid', placeItems: 'center', minHeight: 48, py: 2 }}>
      {loading && <CircularProgress size={24} />}
    </Box>
  )
}
