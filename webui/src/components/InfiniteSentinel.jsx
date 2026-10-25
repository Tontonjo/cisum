// Cisum web player v0.11.3 - Calls onVisible when the end of an infinite list comes near.
// The distance to the end is measured on the element that actually scrolls (the app <main>, or the window).
// An IntersectionObserver was used before: with the window as root its margin did not reach past <main>,
// so the next page was requested only at the very bottom, and it did not always fire again after a page
// was appended while the user stayed at the bottom.
import { useEffect, useRef } from 'react'
import { Box, CircularProgress } from '@mui/material'

const DEFAULT_MARGIN_PX = 600

/** Nearest ancestor that scrolls, or null for the window. */
function scrollParent(el) {
  for (let p = el?.parentElement; p && p !== document.body; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if (overflowY === 'auto' || overflowY === 'scroll') return p
  }
  return null
}

/** Pixels left to scroll before reaching the end of the content. */
function distanceToEnd(root) {
  if (root) return root.scrollHeight - root.scrollTop - root.clientHeight
  return document.documentElement.scrollHeight - window.scrollY - window.innerHeight
}

/** ahead: how many screen heights before the end of the list the next page is requested (default 600 px). */
export default function InfiniteSentinel({ onVisible, loading, done, ahead }) {
  const ref = useRef()
  useEffect(() => {
    if (done || !ref.current) return
    const root = scrollParent(ref.current)
    const target = root || window
    let frame = 0
    const check = () => {
      frame = 0
      const height = root ? root.clientHeight : window.innerHeight
      const margin = ahead ? height * ahead : DEFAULT_MARGIN_PX
      if (distanceToEnd(root) <= margin) onVisible()
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    // Checked now too: a page just appended may still leave the end within the margin
    check()
    target.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      target.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [onVisible, done, ahead])
  return (
    <Box ref={ref} sx={{ display: 'grid', placeItems: 'center', minHeight: 48, py: 2 }}>
      {loading && <CircularProgress size={24} />}
    </Box>
  )
}
