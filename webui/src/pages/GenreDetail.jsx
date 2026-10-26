// Cisum web player v0.11.6 - Genre page: albums, artists (album artists) and songs of one genre,
// in tabs (kept in the URL: ?tab=). Each tab has its own remembered sort.
import { useSearchParams, useParams } from 'react-router-dom'
import { Tabs, Tab, Typography } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { getAlbumsPage, getSongsPage, getArtists, ALBUM_SORTS, SONG_SORTS, ARTIST_SORTS, sortDetail } from '../api/library'
import { genreQuery } from '../api/genres'
import { usePagedList } from '../api/pagedList'
import { useSort } from '../store/preferences'
import { useClientSort } from '../utils/sort'
import { plural } from '../utils/format'
import { PageTitle, CardGrid, ArtistCard, EmptyState } from '../components/Cards'
import { AlbumPagedGrid, SongPagedList, ALBUM_PAGING, SONG_PAGING } from '../components/PagedLists'
import SortChips from '../components/SortChips'

const TABS = [
  { key: 'albums', label: 'Albums', count: 'albumCount' },
  { key: 'artists', label: 'Artists', count: 'artistCount' },
  { key: 'songs', label: 'Songs', count: 'songCount' },
]

function GenreAlbums({ id }) {
  const [sort, setSort, loaded] = useSort('genre.albums', ALBUM_SORTS, 'album_artist')
  const list = usePagedList({
    ...ALBUM_PAGING,
    queryKey: ['albums', 'genre', id, sort.key, sort.dir],
    fetchPage: (p) => getAlbumsPage({ sort: sort.key, dir: sort.dir, filter: { genre_id: id }, ...p }),
    enabled: loaded,
  })
  const onSort = (v) => (v.key === sort.key && ALBUM_SORTS[v.key].random ? list.query.refetch() : setSort(v))
  return (
    <>
      <SortChips options={ALBUM_SORTS} value={sort} onChange={onSort} />
      <AlbumPagedGrid list={list} sort={sort} />
    </>
  )
}

function GenreArtists({ id }) {
  const { data, isSuccess } = useQuery({ queryKey: ['artists', 'genre', id], queryFn: () => getArtists({ genre_id: id }) })
  const { sort, onSort, sorted } = useClientSort('genre.artists', ARTIST_SORTS, 'name', data)
  if (isSuccess && !sorted.length) return <EmptyState title="No artist">No album artist has an album of this genre.</EmptyState>
  return (
    <>
      <SortChips options={ARTIST_SORTS} value={sort} onChange={onSort} />
      <CardGrid min={150}>
        {sorted.map((a) => <ArtistCard key={a.id} artist={a} detail={sortDetail(ARTIST_SORTS, sort, a)} />)}
      </CardGrid>
    </>
  )
}

function GenreSongs({ id }) {
  const [sort, setSort, loaded] = useSort('genre.songs', SONG_SORTS, 'artist')
  const list = usePagedList({
    ...SONG_PAGING,
    queryKey: ['songs', 'genre', id, sort.key, sort.dir],
    fetchPage: (p) => getSongsPage({ sort: sort.key, dir: sort.dir, filter: { genre_id: id }, ...p }),
    enabled: loaded,
  })
  const onSort = (v) => (v.key === sort.key && SONG_SORTS[v.key].random ? list.query.refetch() : setSort(v))
  return (
    <>
      <SortChips options={SONG_SORTS} value={sort} onChange={onSort} />
      <SongPagedList list={list} sort={sort} />
    </>
  )
}

export default function GenreDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'albums'
  const { data: genre, isError } = useQuery(genreQuery(id))

  if (isError) return <EmptyState title="Genre not found">No album or song of this genre is left in the library.</EmptyState>
  return (
    <>
      <Typography variant="overline" color="text.secondary" component="p" sx={{ mt: { xs: 1, md: 2 }, mb: -1 }}>Genre</Typography>
      <PageTitle>{genre?.name || ' '}</PageTitle>
      <Typography variant="body2" color="text.secondary" sx={{ mt: -2, mb: 2 }}>
        {genre ? [plural(genre.albumCount, 'album'), plural(genre.artistCount, 'artist'), plural(genre.songCount, 'song')].join(', ') : ' '}
      </Typography>
      <Tabs value={tab} onChange={(_, v) => setParams({ tab: v }, { replace: true })} sx={{ mb: 2 }}>
        {TABS.map((t) => <Tab key={t.key} value={t.key} label={genre ? `${t.label} (${genre[t.count]})` : t.label} />)}
      </Tabs>
      {tab === 'albums' && <GenreAlbums id={id} />}
      {tab === 'artists' && <GenreArtists id={id} />}
      {tab === 'songs' && <GenreSongs id={id} />}
    </>
  )
}
