// Cisum web player v0.6.0 - Album page: header (with play count and options menu) and track list (grouped by disc).
import { Fragment, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Box, IconButton, Tooltip, Typography, CircularProgress, Menu, MenuItem, ListItemIcon,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button,
} from '@mui/material'
import MoreVertRounded from '@mui/icons-material/MoreVertRounded'
import RestartAltRounded from '@mui/icons-material/RestartAltRounded'
import PlaylistAddRounded from '@mui/icons-material/PlaylistAddRounded'
import ShareRounded from '@mui/icons-material/ShareRounded'
import { useCan } from '../store/me'
import ShareDialog from '../components/ShareDialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getAlbum, resetAlbumPlays } from '../api/library'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { formatLength, plural } from '../utils/format'
import DetailHeader from '../components/DetailHeader'
import TrackList from '../components/TrackList'
import StarButton from '../components/StarButton'

export default function AlbumDetail() {
  const { id } = useParams()
  const playTracks = usePlayer((s) => s.playTracks)
  const pickPlaylist = useUi((s) => s.pickPlaylist)
  const canShare = useCan('share')
  const [sharing, setSharing] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const { data: album, isLoading } = useQuery({ queryKey: ['album', id], queryFn: () => getAlbum(id) })

  const resetPlays = async () => {
    setResetting(true)
    try {
      await resetAlbumPlays(id)
      // Play counts appear in album, song, artist and favorite lists
      for (const key of ['album', 'albums', 'songs', 'artists', 'artist', 'starred', 'albumList', 'topSongs']) qc.invalidateQueries({ queryKey: [key] })
      notify('Play count reset to 0')
      setConfirmReset(false)
    } catch (e) {
      notify(`Could not reset the play count: ${e.message}`)
    } finally {
      setResetting(false)
    }
  }

  if (isLoading || !album) return <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}><CircularProgress /></Box>

  const discs = [...new Set(album.tracks.map((t) => t.disc || 1))]
  const multiDisc = discs.length > 1

  return (
    <>
      <DetailHeader
        coverId={album.coverArt}
        title={album.name}
        subtitle={album.artistId ? <Box component={Link} to={`/artists/${album.artistId}`} sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>{album.artist}</Box> : album.artist}
        meta={[album.year, album.genre, plural(album.tracks.length, 'song'), formatLength(album.duration), plural(album.playCount, 'play')].filter(Boolean).join(', ')}
        onPlay={() => playTracks(album.tracks)}
        onShuffle={() => playTracks(album.tracks, 0, { shuffle: true })}
        actions={
          <>
            <Tooltip title="Add album to playlist">
              <IconButton onClick={() => pickPlaylist(album.tracks)} aria-label="Add album to playlist"><PlaylistAddRounded /></IconButton>
            </Tooltip>
            {canShare && (
              <Tooltip title="Share">
                <IconButton onClick={() => setSharing(true)} aria-label="Share album"><ShareRounded /></IconButton>
              </Tooltip>
            )}
            <StarButton item={album} />
            <Tooltip title="More options">
              <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="More options for this album"><MoreVertRounded /></IconButton>
            </Tooltip>
          </>
        }
      />
      {discs.map((d) => {
        const tracks = album.tracks.filter((t) => (t.disc || 1) === d)
        return (
          <Fragment key={d}>
            {multiDisc && <Typography variant="h6" component="h2" sx={{ mt: 2, mb: 1, px: 1 }}>Disc {d}</Typography>}
            <TrackList
              tracks={tracks}
              numbering="track"
              onPlay={(i) => playTracks(album.tracks, album.tracks.indexOf(tracks[i]))}
            />
          </Fragment>
        )
      })}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => { setMenuAnchor(null); setConfirmReset(true) }} disabled={!album.playCount}>
          <ListItemIcon><RestartAltRounded fontSize="small" /></ListItemIcon>Reset play count
        </MenuItem>
      </Menu>
      <Dialog open={confirmReset} onClose={() => !resetting && setConfirmReset(false)}>
        <DialogTitle>Reset play count?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The play count of "{album.name}" ({plural(album.playCount, 'play')}) and of its songs goes back to 0, for your account only.
            The artist totals are updated accordingly. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReset(false)} disabled={resetting}>Cancel</Button>
          <Button onClick={resetPlays} variant="contained" color="error" disabled={resetting}>{resetting ? 'Resetting...' : 'Reset'}</Button>
        </DialogActions>
      </Dialog>
      {sharing && <ShareDialog open ids={[album.id]} title={`${album.name} - ${album.artist}`} onClose={() => setSharing(false)} />}
    </>
  )
}
