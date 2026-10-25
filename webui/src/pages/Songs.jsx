// Cisum web player v0.11.3 - All songs, sorted by the server (remembered per user), loaded page by page.
// The next page is requested 3 screens ahead (in the app scroll container) and its covers are preloaded.
import { useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getSongsPage, SONG_SORTS } from '../api/library'
import { useSort } from '../store/preferences'
import { PageTitle } from '../components/Cards'
import SortChips from '../components/SortChips'
import TrackList from '../components/TrackList'
import InfiniteSentinel from '../components/InfiniteSentinel'
import { coverRequestPx } from '../components/Cover'
import { usePageCoverPreload } from '../api/coverPreload'

const PAGE = 100
// Screen heights before the end of the list at which the next page is requested
const AHEAD_SCREENS = 3
// Track list cover size (TrackList showCover) and the artwork id it shows
const ROW_COVER_PX = coverRequestPx(40)
const songCover = (s) => s.coverArt

export default function Songs() {
  const [sort, setSort, loaded] = useSort('songs', SONG_SORTS, 'title')
  const q = useInfiniteQuery({
    queryKey: ['songs', sort.key, sort.dir],
    queryFn: ({ pageParam }) => getSongsPage({ sort: sort.key, dir: sort.dir, start: pageParam, count: PAGE }),
    enabled: loaded, // wait for the remembered sort to avoid loading the default one first
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loadedCount = pages.reduce((n, p) => n + p.items.length, 0)
      return last.items.length && loadedCount < last.total ? loadedCount : undefined
    },
  })
  const songs = q.data?.pages.flatMap((p) => p.items) || []
  usePageCoverPreload(q.data?.pages, songCover, ROW_COVER_PX)
  const loadMore = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage()
  }, [q])
  const onSort = (v) => (v.key === sort.key && SONG_SORTS[v.key].random ? q.refetch() : setSort(v))

  return (
    <>
      <PageTitle>Songs</PageTitle>
      <SortChips options={SONG_SORTS} value={sort} onChange={onSort} />
      <TrackList tracks={songs} showCover showAlbum detail={SONG_SORTS[sort.key].detail} />
      <InfiniteSentinel onVisible={loadMore} loading={q.isFetching} done={!q.hasNextPage} ahead={AHEAD_SCREENS} />
    </>
  )
}
