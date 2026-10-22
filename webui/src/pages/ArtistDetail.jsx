// Cisum web player v0.6.0 - Artist page: picture, biography, top songs and albums.
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Box, Typography, Button, CircularProgress } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { getArtist, getArtistInfo, getTopSongs, getAlbum, ARTIST_ALBUM_SORTS, sortDetail } from '../api/library'
import { useClientSort } from '../utils/sort'
import SortChips from '../components/SortChips'
import { usePlayer } from '../store/player'
import { plural } from '../utils/format'
import DetailHeader from '../components/DetailHeader'
import TrackList from '../components/TrackList'
import StarButton from '../components/StarButton'
import { AlbumCard, CardGrid, ArtistCard, Shelf } from '../components/Cards'

async function allTracks(albums) {
  const full = await Promise.all(albums.map((a) => getAlbum(a.id)))
  return full.flatMap((a) => a.tracks)
}

export default function ArtistDetail() {
  const { id } = useParams()
  const playTracks = usePlayer((s) => s.playTracks)
  const [bioOpen, setBioOpen] = useState(false)
  const { data: artist, isLoading } = useQuery({ queryKey: ['artist', id], queryFn: () => getArtist(id) })
  const { data: info } = useQuery({ queryKey: ['artistInfo', id], queryFn: () => getArtistInfo(id), staleTime: 30 * 60_000 })
  const { data: top = [] } = useQuery({
    queryKey: ['topSongs', artist?.name],
    queryFn: () => getTopSongs(artist.name),
    enabled: !!artist?.name,
  })
  const { sort, onSort, sorted: albums } = useClientSort('artist.albums', ARTIST_ALBUM_SORTS, 'year', artist?.albums)

  if (isLoading || !artist) return <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}><CircularProgress /></Box>

  const bio = info?.biography
  const play = async (shuffle) => playTracks(await allTracks(artist.albums), 0, { shuffle })

  return (
    <>
      <DetailHeader
        coverId={artist.coverArt}
        round
        title={artist.name}
        meta={plural(artist.albums.length, 'album')}
        onPlay={() => play(false)}
        onShuffle={() => play(true)}
        actions={<StarButton item={artist} />}
      >
        {bio && (
          <Box sx={{ mt: 1.5, maxWidth: '72ch' }}>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: bioOpen ? 'none' : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {bio}
            </Typography>
            <Button size="small" onClick={() => setBioOpen(!bioOpen)} sx={{ ml: -1.5 }}>{bioOpen ? 'Show less' : 'Read more'}</Button>
          </Box>
        )}
      </DetailHeader>

      {top.length > 0 && (
        <Box component="section" sx={{ mb: 5 }}>
          <Typography variant="h4" component="h2" sx={{ mb: 1.5 }}>Popular</Typography>
          <TrackList tracks={top.slice(0, 5)} showCover showAlbum />
        </Box>
      )}

      <Typography variant="h4" component="h2" sx={{ mb: 2 }}>Albums</Typography>
      {albums.length > 1 && <SortChips options={ARTIST_ALBUM_SORTS} value={sort} onChange={onSort} />}
      <CardGrid>
        {albums.map((a) => (
          <AlbumCard key={a.id} album={a} subtitle={[a.year, sortDetail(ARTIST_ALBUM_SORTS, sort, a)].filter(Boolean).join(', ')} />
        ))}
      </CardGrid>

      {!!info?.similar?.length && (
        <Box sx={{ mt: 6 }}>
          <Shelf title="Similar artists">
            {info.similar.map((a) => <ArtistCard key={a.id} artist={a} />)}
          </Shelf>
        </Box>
      )}
    </>
  )
}
