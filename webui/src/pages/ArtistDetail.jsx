// Cisum web player v0.11.1 - Artist page: picture, biography, top songs and albums.
// The header is drawn at once from the link's preview (api/preload.js) while the albums load.
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Box, Typography, Button } from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getArtistInfo, getTopSongs, ARTIST_ALBUM_SORTS, sortDetail } from '../api/library'
import { queryClient } from '../api/queryClient'
import { albumQuery, artistQuery, getPreview } from '../api/preload'
import { useClientSort } from '../utils/sort'
import SortChips from '../components/SortChips'
import { usePlayer } from '../store/player'
import { plural } from '../utils/format'
import DetailHeader from '../components/DetailHeader'
import TrackList from '../components/TrackList'
import StarButton from '../components/StarButton'
import { AlbumCard, CardGrid, ArtistCard, Shelf } from '../components/Cards'
import { CardGridSkeleton, DetailHeaderSkeleton } from '../components/Skeletons'

async function allTracks(albums) {
  // Through the cache: albums already opened or preloaded are not requested again
  const full = await Promise.all(albums.map((a) => queryClient.fetchQuery(albumQuery(a.id))))
  return full.flatMap((a) => a.tracks)
}

export default function ArtistDetail() {
  const { id } = useParams()
  const playTracks = usePlayer((s) => s.playTracks)
  const [bioOpen, setBioOpen] = useState(false)
  const qc = useQueryClient()
  const { data: artist } = useQuery(artistQuery(id))
  const preview = getPreview('artist', id)
  // Full artist once loaded, otherwise what the link already knew
  const shown = artist || preview
  const { data: info } = useQuery({ queryKey: ['artistInfo', id], queryFn: () => getArtistInfo(id), staleTime: 30 * 60_000 })
  const { data: top = [] } = useQuery({
    queryKey: ['topSongs', shown?.name],
    queryFn: () => getTopSongs(shown.name),
    enabled: !!shown?.name,
  })
  const { sort, onSort, sorted: albums } = useClientSort('artist.albums', ARTIST_ALBUM_SORTS, 'year', artist?.albums)

  if (!shown) return <><DetailHeaderSkeleton round /><CardGridSkeleton round={false} /></>

  const bio = info?.biography
  const albumCount = artist ? artist.albums.length : shown.albumCount
  // Play buttons work before the albums are displayed: they wait for the same request
  const play = async (shuffle) => {
    const full = artist || (await qc.fetchQuery(artistQuery(id)))
    playTracks(await allTracks(full.albums), 0, { shuffle })
  }

  return (
    <>
      <DetailHeader
        coverId={shown.coverArt}
        coverHint={preview?.coverPx}
        round
        title={shown.name}
        meta={albumCount != null ? plural(albumCount, 'album') : '\u00a0'}
        onPlay={() => play(false)}
        onShuffle={() => play(true)}
        actions={'starred' in shown && <StarButton item={shown} />}
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
      {albumCount > 1 && <SortChips options={ARTIST_ALBUM_SORTS} value={sort} onChange={onSort} />}
      {artist ? (
        <CardGrid>
          {albums.map((a) => (
            <AlbumCard key={a.id} album={a} subtitle={[a.year, sortDetail(ARTIST_ALBUM_SORTS, sort, a)].filter(Boolean).join(', ')} />
          ))}
        </CardGrid>
      ) : (
        <CardGridSkeleton count={albumCount} />
      )}

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
