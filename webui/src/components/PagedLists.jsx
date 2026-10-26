// Cisum web player v0.11.6 - Album grid and song list loaded page by page (see api/pagedList.js).
// Used by the Albums and Songs pages and the genre page.
import { ALBUM_SORTS, SONG_SORTS, sortDetail } from '../api/library'
import { AlbumCard, CardGrid } from './Cards'
import TrackList from './TrackList'
import InfiniteSentinel from './InfiniteSentinel'
import { coverRequestPx } from './Cover'

// Screen heights before the end of the list at which the next page is requested
const AHEAD_SCREENS = 3

// Albums: first page small (fast first display), next ones larger so fast scrolling does not catch up
export const ALBUM_PAGING = { firstPage: 60, page: 120, coverPx: coverRequestPx() }
// Songs: covers at the track list row size (TrackList showCover)
export const SONG_PAGING = { firstPage: 100, page: 100, coverPx: coverRequestPx(40) }

/** list: usePagedList result; sort: { key, dir } of ALBUM_SORTS (adds the sorted value under each album). */
export function AlbumPagedGrid({ list, sort }) {
  return (
    <>
      <CardGrid>
        {list.items.map((a) => {
          const detail = sortDetail(ALBUM_SORTS, sort, a)
          return <AlbumCard key={a.id} album={a} subtitle={detail && [a.artist, detail].filter(Boolean).join(', ')} />
        })}
      </CardGrid>
      <InfiniteSentinel onVisible={list.loadMore} loading={list.query.isFetching} done={!list.query.hasNextPage} ahead={AHEAD_SCREENS} />
    </>
  )
}

/** list: usePagedList result; sort: { key, dir } of SONG_SORTS. */
export function SongPagedList({ list, sort }) {
  return (
    <>
      <TrackList tracks={list.items} showCover showAlbum detail={SONG_SORTS[sort.key].detail} />
      <InfiniteSentinel onVisible={list.loadMore} loading={list.query.isFetching} done={!list.query.hasNextPage} ahead={AHEAD_SCREENS} />
    </>
  )
}
