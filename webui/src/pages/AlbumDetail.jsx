// Cisum web player v0.11.0 - Album page: header (with play count and options menu) and track list (grouped by disc).
// The header is drawn at once from the link's preview (api/preload.js) while the songs load.
import { Fragment, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Box, IconButton, Tooltip, Typography, Menu, MenuItem, ListItemIcon,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button,
} from '@mui/material'
import MoreVertRounded from '@mui/icons-material/MoreVertRounded'
import RestartAltRounded from '@mui/icons-material/RestartAltRounded'
import PlaylistAddRounded from '@mui/icons-material/PlaylistAddRounded'
import ShareRounded from '@mui/icons-material/ShareRounded'
import { useCan } from '../store/me'
import ShareDialog from '../components/ShareDialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { resetAlbumPlays } from '../api/library'
import { albumQuery, getPreview, intentProps } from '../api/preload'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { formatLength, plural } from '../utils/format'
import DetailHeader from '../components/DetailHeader'
import TrackList from '../components/TrackList'
import StarButton from '../components/StarButton'
import { DetailHeaderSkeleton, TrackListSkeleton } from '../components/Skeletons'

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
  const { data: album } = useQuery(albumQuery(id))
  const preview = getPreview('album', id)
  // Full album once loaded, otherwise what the link already knew
  const shown = album || preview

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

  if (!shown) return <><DetailHeaderSkeleton /><TrackListSkeleton /></>

  // Play buttons work before the songs are displayed: they wait for the same request
  const withTracks = (fn) => async () => fn((album || (await qc.fetchQuery(albumQuery(id)))).tracks)
  const songCount = album ? album.tracks.length : shown.songCount
  const tracks = album?.tracks || []
  const discs = [...new Set(tracks.map((t) => t.disc || 1))]
  const multiDisc = discs.length > 1
  // Empty lines are drawn as a non-breaking space so their height is reserved until the data arrives
  const meta = [
    shown.year, album?.genre,
    songCount != null && plural(songCount, 'song'),
    shown.duration != null && formatLength(shown.duration),
    shown.playCount != null && plural(shown.playCount, 'play'),
  ].filter(Boolean).join(', ')

  return (
    <>
      <DetailHeader
        coverId={shown.coverArt}
        coverHint={preview?.coverPx}
        title={shown.name}
        subtitle={shown.artistId
          ? <Box component={Link} to={`/artists/${shown.artistId}`} {...intentProps('artist', { id: shown.artistId, name: shown.artist })} sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>{shown.artist}</Box>
          : shown.artist || '\u00a0'}
        meta={meta || '\u00a0'}
        onPlay={withTracks((t) => playTracks(t))}
        onShuffle={withTracks((t) => playTracks(t, 0, { shuffle: true }))}
        actions={
          <>
            <Tooltip title="Add album to playlist">
              <IconButton onClick={withTracks(pickPlaylist)} aria-label="Add album to playlist"><PlaylistAddRounded /></IconButton>
            </Tooltip>
            {canShare && (
              <Tooltip title="Share">
                <IconButton onClick={() => setSharing(true)} aria-label="Share album"><ShareRounded /></IconButton>
              </Tooltip>
            )}
            {'starred' in shown && <StarButton item={shown} />}
            <Tooltip title="More options">
              <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="More options for this album"><MoreVertRounded /></IconButton>
            </Tooltip>
          </>
        }
      />
      {!album && <TrackListSkeleton count={songCount} />}
      {discs.map((d) => {
        const discTracks = tracks.filter((t) => (t.disc || 1) === d)
        return (
          <Fragment key={d}>
            {multiDisc && <Typography variant="h6" component="h2" sx={{ mt: 2, mb: 1, px: 1 }}>Disc {d}</Typography>}
            <TrackList
              tracks={discTracks}
              numbering="track"
              onPlay={(i) => playTracks(tracks, tracks.indexOf(discTracks[i]))}
            />
          </Fragment>
        )
      })}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => { setMenuAnchor(null); setConfirmReset(true) }} disabled={!album?.playCount}>
          <ListItemIcon><RestartAltRounded fontSize="small" /></ListItemIcon>Reset play count
        </MenuItem>
      </Menu>
      <Dialog open={confirmReset} onClose={() => !resetting && setConfirmReset(false)}>
        <DialogTitle>Reset play count?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The play count of "{shown.name}" ({plural(shown.playCount || 0, 'play')}) and of its songs goes back to 0, for your account only.
            The artist totals are updated accordingly. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReset(false)} disabled={resetting}>Cancel</Button>
          <Button onClick={resetPlays} variant="contained" color="error" disabled={resetting}>{resetting ? 'Resetting...' : 'Reset'}</Button>
        </DialogActions>
      </Dialog>
      {sharing && <ShareDialog open ids={[shown.id]} title={[shown.name, shown.artist].filter(Boolean).join(' - ')} onClose={() => setSharing(false)} />}
    </>
  )
}
