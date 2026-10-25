// Cisum web player v0.11.3 - Background cover preloading for long infinite lists (Albums, Songs).
// Covers of a newly loaded page are requested at low priority, a few at a time, so they are already in the
// browser cache when their cards scroll into view. The URLs are exactly those the cards use (same id and
// size), and covers are immutable in the browser cache, so a cover is downloaded only once.
import { useEffect } from 'react'
import { coverUrl } from './client'

const MAX_PARALLEL = 4 // keeps connections free for the covers on screen
const MAX_REMEMBERED = 5000
// Delay before preloading the covers of the first page: its visible covers are loading through the page,
// and requesting the same URLs at the same time could download them twice (ms)
const FIRST_PAGE_DELAY_MS = 1000

const requested = new Set()
const queue = []
let running = 0

function pump() {
  while (running < MAX_PARALLEL && queue.length) {
    const url = queue.shift()
    running++
    const img = new Image()
    img.decoding = 'async'
    img.fetchPriority = 'low'
    img.onload = img.onerror = () => {
      running--
      pump()
    }
    img.src = url
  }
}

/** Queues the covers of ids (artwork ids, null skipped) at size px. */
export function preloadCovers(ids, px) {
  if (requested.size > MAX_REMEMBERED) requested.clear()
  for (const id of ids) {
    const url = coverUrl(id, px)
    if (!url || requested.has(url)) continue
    requested.add(url)
    queue.push(url)
  }
  pump()
}

/** Drops the covers not requested yet (the page using them was left). */
export function cancelCoverPreload() {
  for (const url of queue) requested.delete(url)
  queue.length = 0
}

/**
 * Preloads the covers of each page an infinite query receives (first page included, new sort too).
 * pages: useInfiniteQuery data.pages ({ items }); coverId(item) returns its artwork id; px: requested size.
 * Covers already requested are skipped, so a refetch of the same pages costs nothing.
 */
export function usePageCoverPreload(pages, coverId, px) {
  const pageCount = pages?.length || 0
  const lastPage = pages?.[pageCount - 1]
  useEffect(() => {
    if (!lastPage) return
    const run = () => preloadCovers(lastPage.items.map(coverId), px)
    if (pageCount > 1) return run()
    const t = setTimeout(run, FIRST_PAGE_DELAY_MS)
    return () => clearTimeout(t)
    // pageCount changes together with lastPage; coverId and px are fixed per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPage])
  useEffect(() => cancelCoverPreload, [])
}
