// Cisum web player v0.11.6 - All albums, sorted by the server (remembered per user), loaded page by page.
// The next page is requested 3 screens ahead (in the app scroll container) and its covers are preloaded.
// A ?sort= link (Home "Show all") selects that sort once.
// v0.11.6: paging moved to api/pagedList.js (shared with the genre page).
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getAlbumsPage, ALBUM_SORTS } from '../api/library'
import { usePagedList } from '../api/pagedList'
import { useSort } from '../store/preferences'
import { PageTitle } from '../components/Cards'
import { AlbumPagedGrid, ALBUM_PAGING } from '../components/PagedLists'
import SortChips from '../components/SortChips'

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
  const list = usePagedList({
    ...ALBUM_PAGING,
    queryKey: ['albums', sort.key, sort.dir],
    fetchPage: (p) => getAlbumsPage({ sort: sort.key, dir: sort.dir, ...p }),
    enabled: loaded && !linked, // wait for the remembered (or linked) sort to avoid loading another one first
  })
  // Selecting "Random" again draws a new random order
  const onSort = (v) => (v.key === sort.key && ALBUM_SORTS[v.key].random ? list.query.refetch() : setSort(v))

  return (
    <>
      <PageTitle>Albums</PageTitle>
      <SortChips options={ALBUM_SORTS} value={sort} onChange={onSort} />
      <AlbumPagedGrid list={list} sort={sort} />
    </>
  )
}
