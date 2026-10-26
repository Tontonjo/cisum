// Cisum web player v0.11.6 - Lists sorted by the server and loaded page by page (albums, songs).
// Shared by the Albums and Songs pages and the genre page. The covers of each received page are
// preloaded at the size the list displays them.
import { useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { usePageCoverPreload } from './coverPreload'

const coverOf = (item) => item.coverArt

/**
 * queryKey: cache key (include the sort and the filter); fetchPage({ start, count }) -> { items, total }.
 * firstPage / page: sizes of the first and next pages; coverPx: cover size to preload (0 = none).
 * Returns { items, query, loadMore }.
 */
export function usePagedList({ queryKey, fetchPage, firstPage, page, coverPx = 0, enabled = true }) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage({ start: pageParam, count: pageParam ? page : firstPage }),
    enabled,
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loadedCount = pages.reduce((n, p) => n + p.items.length, 0)
      return last.items.length && loadedCount < last.total ? loadedCount : undefined
    },
  })
  const items = query.data?.pages.flatMap((p) => p.items) || []
  usePageCoverPreload(coverPx ? query.data?.pages : undefined, coverOf, coverPx)
  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage()
  }, [query])
  return { items, query, loadMore }
}
