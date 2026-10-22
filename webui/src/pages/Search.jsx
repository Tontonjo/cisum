// Cisum web player v0.4.0 - Search results: artists first, then albums, then songs.
import { useSearchParams } from 'react-router-dom'
import { Box, Typography, CircularProgress } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { search } from '../api/library'
import { Shelf, AlbumCard, ArtistCard, EmptyState } from '../components/Cards'
import TrackList from '../components/TrackList'

export default function Search() {
  const [params] = useSearchParams()
  const q = (params.get('q') || '').trim()
  const { data, isFetching } = useQuery({ queryKey: ['search', q], queryFn: () => search(q), enabled: q.length > 0 })

  if (!q) return <EmptyState title="Search your library">Type a song, album or artist name.</EmptyState>
  if (isFetching && !data) return <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}><CircularProgress /></Box>
  if (!data) return null
  const empty = !data.artists.length && !data.albums.length && !data.songs.length
  if (empty) return <EmptyState title={`Nothing found for "${q}"`}>Check the spelling or try fewer words.</EmptyState>

  return (
    <Box sx={{ pt: 2 }}>
      {data.artists.length > 0 && <Shelf title="Artists">{data.artists.map((a) => <ArtistCard key={a.id} artist={a} />)}</Shelf>}
      {data.albums.length > 0 && <Shelf title="Albums">{data.albums.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf>}
      {data.songs.length > 0 && (
        <Box component="section" sx={{ mb: 5 }}>
          <Typography variant="h4" component="h2" sx={{ mb: 1.5 }}>Songs</Typography>
          <TrackList tracks={data.songs} showCover showAlbum />
        </Box>
      )}
    </Box>
  )
}
