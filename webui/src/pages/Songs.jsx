// Cisum web player v0.11.6 - All songs, sorted by the server (remembered per user), loaded page by page.
// The next page is requested 3 screens ahead (in the app scroll container) and its covers are preloaded.
// v0.11.6: paging moved to api/pagedList.js (shared with the genre page).
import { getSongsPage, SONG_SORTS } from '../api/library'
import { usePagedList } from '../api/pagedList'
import { useSort } from '../store/preferences'
import { PageTitle } from '../components/Cards'
import { SongPagedList, SONG_PAGING } from '../components/PagedLists'
import SortChips from '../components/SortChips'

export default function Songs() {
  const [sort, setSort, loaded] = useSort('songs', SONG_SORTS, 'title')
  const list = usePagedList({
    ...SONG_PAGING,
    queryKey: ['songs', sort.key, sort.dir],
    fetchPage: (p) => getSongsPage({ sort: sort.key, dir: sort.dir, ...p }),
    enabled: loaded, // wait for the remembered sort to avoid loading the default one first
  })
  const onSort = (v) => (v.key === sort.key && SONG_SORTS[v.key].random ? list.query.refetch() : setSort(v))

  return (
    <>
      <PageTitle>Songs</PageTitle>
      <SortChips options={SONG_SORTS} value={sort} onChange={onSort} />
      <SongPagedList list={list} sort={sort} />
    </>
  )
}
