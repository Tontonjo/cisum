// Cisum web player v0.6.0 - All songs, sorted by the server (remembered per user), loaded page by page.
import { useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getSongsPage, SONG_SORTS } from '../api/library'
import { useSort } from '../store/preferences'
import { PageTitle } from '../components/Cards'
import SortChips from '../components/SortChips'
import TrackList from '../components/TrackList'
import InfiniteSentinel from '../components/InfiniteSentinel'

const PAGE = 100

export default function Songs() {
  const [sort, setSort, loaded] = useSort('songs', SONG_SORTS, 'title')
  const q = useInfiniteQuery({
    queryKey: ['songs', sort.key, sort.dir],
    queryFn: ({ pageParam }) => getSongsPage({ sort: sort.key, dir: sort.dir, start: pageParam, count: PAGE }),
    enabled: loaded, // wait for the remembered sort to avoid loading the default one first
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loadedCount = pages.length * PAGE
      return loadedCount < last.total ? loadedCount : undefined
    },
  })
  const songs = q.data?.pages.flatMap((p) => p.items) || []
  const loadMore = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage()
  }, [q])
  const onSort = (v) => (v.key === sort.key && SONG_SORTS[v.key].random ? q.refetch() : setSort(v))

  return (
    <>
      <PageTitle>Songs</PageTitle>
      <SortChips options={SONG_SORTS} value={sort} onChange={onSort} />
      <TrackList tracks={songs} showCover showAlbum detail={SONG_SORTS[sort.key].detail} />
      <InfiniteSentinel onVisible={loadMore} loading={q.isFetching} done={!q.hasNextPage} />
    </>
  )
}
