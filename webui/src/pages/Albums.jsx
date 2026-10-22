// Cisum web player v0.7.0 - All albums, sorted by the server (remembered per user), loaded page by page.
// A ?sort= link (Home "Show all") selects that sort once.
import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getAlbumsPage, ALBUM_SORTS, sortDetail } from '../api/library'
import { useSort } from '../store/preferences'
import { AlbumCard, CardGrid, PageTitle } from '../components/Cards'
import SortChips from '../components/SortChips'
import InfiniteSentinel from '../components/InfiniteSentinel'

const PAGE = 60

export default function Albums() {
  const [sort, setSort, loaded] = useSort('albums', ALBUM_SORTS, 'recently_added')
  const [params, setParams] = useSearchParams()
  const linked = params.get('sort')
  useEffect(() => {
    if (!loaded || !linked) return
    if (ALBUM_SORTS[linked]) setSort({ key: linked, dir: ALBUM_SORTS[linked].order })
    setParams({}, { replace: true })
    // only when arriving with a ?sort= link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, linked])
  const q = useInfiniteQuery({
    queryKey: ['albums', sort.key, sort.dir],
    queryFn: ({ pageParam }) => getAlbumsPage({ sort: sort.key, dir: sort.dir, start: pageParam, count: PAGE }),
    enabled: loaded && !linked, // wait for the remembered (or linked) sort to avoid loading another one first
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loadedCount = pages.length * PAGE
      return loadedCount < last.total ? loadedCount : undefined
    },
  })
  const albums = q.data?.pages.flatMap((p) => p.items) || []
  const loadMore = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage()
  }, [q])
  // Selecting "Random" again draws a new random order
  const onSort = (v) => (v.key === sort.key && ALBUM_SORTS[v.key].random ? q.refetch() : setSort(v))

  return (
    <>
      <PageTitle>Albums</PageTitle>
      <SortChips options={ALBUM_SORTS} value={sort} onChange={onSort} />
      <CardGrid>
        {albums.map((a) => {
          const detail = sortDetail(ALBUM_SORTS, sort, a)
          return <AlbumCard key={a.id} album={a} subtitle={detail && [a.artist, detail].filter(Boolean).join(', ')} />
        })}
      </CardGrid>
      <InfiniteSentinel onVisible={loadMore} loading={q.isFetching} done={!q.hasNextPage} />
    </>
  )
}
