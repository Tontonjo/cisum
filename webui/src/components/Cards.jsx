// Cisum web player v0.11.1 - Album and artist cards, grids and horizontal shelves.
// Cards start loading their detail page when pressed or focused (api/preload.js).
import { Box, Typography, IconButton, useTheme } from '@mui/material'
import { Link } from 'react-router-dom'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import { queryClient } from '../api/queryClient'
import { albumQuery, intentProps } from '../api/preload'
import { usePlayer } from '../store/player'
import Cover from './Cover'

export async function playAlbum(id, shuffle = false) {
  // Same cache as the album page: no second request when the album was already loaded
  const album = await queryClient.fetchQuery(albumQuery(id))
  usePlayer.getState().playTracks(album.tracks, 0, { shuffle })
}

// Size requested by a card cover (Cover default when it fills its parent)
const CARD_COVER_PX = 400

export function AlbumCard({ album, subtitle }) {
  const { m3 } = useTheme()
  const to = `/albums/${album.id}`
  return (
    <Box {...intentProps('album', album, CARD_COVER_PX)} sx={{ minWidth: 0, '&:hover .card-play, &:focus-within .card-play': { opacity: 1, transform: 'translateY(0)' } }}>
      <Box sx={{ position: 'relative' }}>
        <Box component={Link} to={to} tabIndex={-1} aria-hidden="true" sx={{ display: 'block', borderRadius: 4 }}>
          <Cover id={album.coverArt} radius={4} alt="" />
        </Box>
        <IconButton
          className="card-play"
          aria-label={`Play ${album.name}`}
          onClick={() => playAlbum(album.id)}
          sx={{
            position: 'absolute', right: { xs: 8, md: 10 }, bottom: { xs: 8, md: 10 }, width: { xs: 40, md: 52 }, height: { xs: 40, md: 52 },
            bgcolor: m3.primaryContainer, color: m3.onPrimaryContainer, borderRadius: 4,
            opacity: { xs: 1, md: 0 }, transform: { md: 'translateY(6px)' }, transition: 'opacity 150ms, transform 150ms',
            '&:hover': { bgcolor: m3.primaryContainer, filter: 'brightness(1.08)' },
          }}
        >
          <PlayArrowRounded />
        </IconButton>
      </Box>
      <Box component={Link} to={to} sx={{ display: 'block', textDecoration: 'none', color: 'inherit', mt: 1.25 }}>
        <Typography variant="subtitle2" noWrap sx={{ fontSize: '0.95rem' }}>{album.name}</Typography>
        <Typography variant="body2" color="text.secondary" noWrap>{subtitle ?? [album.artist, album.year].filter(Boolean).join(', ')}</Typography>
      </Box>
    </Box>
  )
}

/** detail replaces the album count line (e.g. "42 plays" while sorting by plays). */
export function ArtistCard({ artist, detail }) {
  return (
    <Box component={Link} to={`/artists/${artist.id}`} {...intentProps('artist', artist, CARD_COVER_PX)} sx={{ display: 'block', textDecoration: 'none', color: 'inherit', textAlign: 'center', minWidth: 0 }}>
      <Cover id={artist.coverArt} round alt="" />
      <Typography variant="subtitle2" noWrap sx={{ mt: 1.25, fontSize: '0.95rem' }}>{artist.name}</Typography>
      {(detail || artist.albumCount !== undefined) && (
        <Typography variant="body2" color="text.secondary" noWrap>
          {detail || `${artist.albumCount} ${artist.albumCount === 1 ? 'album' : 'albums'}`}
        </Typography>
      )}
    </Box>
  )
}

export function CardGrid({ children, min = 168 }) {
  return (
    <Box sx={{ display: 'grid', gap: { xs: 2, md: 3 }, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: `repeat(auto-fill, minmax(${min}px, 1fr))` } }}>
      {children}
    </Box>
  )
}

/** Horizontally scrolling row of cards with a heading. */
export function Shelf({ title, action, children }) {
  return (
    <Box component="section" sx={{ mb: 5 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 2 }}>
        <Typography variant="h4" component="h2" sx={{ flex: 1 }}>{title}</Typography>
        {action}
      </Box>
      <Box
        sx={{
          display: 'grid', gridAutoFlow: 'column', gridAutoColumns: { xs: '42%', sm: '200px' }, gap: { xs: 2, md: 3 },
          overflowX: 'auto', pb: 1, scrollSnapType: 'x mandatory', '& > *': { scrollSnapAlign: 'start' },
          scrollbarWidth: 'thin',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

export function PageTitle({ children, actions }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mt: { xs: 1, md: 2 }, mb: 3 }}>
      <Typography variant="h2" component="h1" sx={{ flex: 1, fontSize: { xs: '2rem', md: '2.75rem' } }}>{children}</Typography>
      {actions}
    </Box>
  )
}

export function EmptyState({ title, children }) {
  return (
    <Box sx={{ py: 8, textAlign: 'center' }}>
      <Typography variant="h5" component="p" sx={{ mb: 1 }}>{title}</Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 420, mx: 'auto' }}>{children}</Typography>
    </Box>
  )
}
