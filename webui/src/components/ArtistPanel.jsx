// Cisum web player v0.1.0 - Artist information for the playing track: picture, biography, similar artists.
import { useState } from 'react'
import { Box, Typography, Button, Chip, CircularProgress, useTheme } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getArtistInfo } from '../api/library'
import { useUi } from '../store/ui'
import Cover from './Cover'

const BIO_PREVIEW = 600

export default function ArtistPanel({ track }) {
  const { m3 } = useTheme()
  const close = useUi((s) => s.closeNowPlaying)
  const [expanded, setExpanded] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['artistInfo', track.artistId],
    queryFn: () => getArtistInfo(track.artistId),
    enabled: !!track.artistId,
    staleTime: 30 * 60_000,
  })

  if (isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    )
  }

  const bio = data?.biography || ''
  const longBio = bio.length > BIO_PREVIEW
  const shownBio = expanded || !longBio ? bio : `${bio.slice(0, BIO_PREVIEW).trimEnd()}...`

  return (
    <Box sx={{ py: 3 }}>
      <Cover id={`ar-${track.artistId}`} request={600} radius={6} alt="" sx={{ aspectRatio: '16 / 9', maxHeight: 320, mb: 3 }} />
      <Typography variant="h3" component="h2" sx={{ mb: 2 }}>{track.artist}</Typography>
      {bio ? (
        <>
          <Typography sx={{ whiteSpace: 'pre-line', color: m3.onSurfaceVariant, lineHeight: 1.65, maxWidth: '68ch' }}>{shownBio}</Typography>
          {longBio && (
            <Button onClick={() => setExpanded(!expanded)} sx={{ mt: 1, ml: -1.5 }}>
              {expanded ? 'Show less' : 'Read full biography'}
            </Button>
          )}
        </>
      ) : (
        <Typography color="text.secondary" variant="body2">
          No biography available. Artist details come from the info sources enabled on the server (Last.fm, Deezer).
        </Typography>
      )}
      {!!data?.similar?.length && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" component="h3" sx={{ mb: 1.5 }}>Similar artists in your library</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {data.similar.map((a) => (
              <Chip key={a.id} label={a.name} component={Link} to={`/artists/${a.id}`} onClick={close} clickable variant="outlined" />
            ))}
          </Box>
        </Box>
      )}
      <Button component={Link} to={`/artists/${track.artistId}`} onClick={close} variant="outlined" sx={{ mt: 4 }}>
        Open artist page
      </Button>
    </Box>
  )
}
