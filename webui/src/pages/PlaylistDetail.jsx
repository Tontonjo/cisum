// Cisum web player v0.11.1 - Playlist page: play, edit, reorder, remove, export, delete.
// The header comes at once from the playlist list already loaded by the sidebar (or the link's preview);
// placeholder rows stand for the songs while they load.
// Dynamic playlists: rules summary, rules editor, .nsp export; songs are rebuilt by the server on each opening.
// Missing songs are listed greyed out at their position; they are never removed automatically.
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, FormControlLabel, Switch, Alert, Menu, MenuItem, ListItemIcon,
} from '@mui/material'
import MoreVertRounded from '@mui/icons-material/MoreVertRounded'
import EditRounded from '@mui/icons-material/EditRounded'
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded'
import DeleteRounded from '@mui/icons-material/DeleteRounded'
import RemoveCircleOutlineRounded from '@mui/icons-material/RemoveCircleOutlineRounded'
import AddToQueueRounded from '@mui/icons-material/AddToQueueRounded'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import DataObjectRounded from '@mui/icons-material/DataObjectRounded'
import SmartPlaylistDialog from '../components/SmartPlaylistDialog'
import { buildFields, describeCriteria, toNsp } from '../utils/smartRules'
import { useCan } from '../store/me'
import ShareDialog from '../components/ShareDialog'
import PlaylistAccessDialog from '../components/PlaylistAccessDialog'
import GroupRounded from '@mui/icons-material/GroupRounded'
import LinkRounded from '@mui/icons-material/LinkRounded'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getPlaylists, getPlaylistAccess, getSmartFields, updatePlaylist, deletePlaylist, removeFromPlaylist,
  moveInPlaylist, exportPlaylists,
  playlistCover,
} from '../api/library'
import { getSession } from '../api/client'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { formatLength, plural } from '../utils/format'
import DetailHeader from '../components/DetailHeader'
import TrackList from '../components/TrackList'
import { DetailHeaderSkeleton, TrackListSkeleton } from '../components/Skeletons'
import { getPreview, playlistInfoQuery, playlistTracksQuery } from '../api/preload'
import { EmptyState } from '../components/Cards'

function EditDialog({ playlist, open, onClose, onSaved }) {
  const [name, setName] = useState(playlist.name)
  const [comment, setComment] = useState(playlist.comment || '')
  const [isPublic, setIsPublic] = useState(!!playlist.public)
  const submit = async (e) => {
    e.preventDefault()
    await onSaved({ name: name.trim(), comment, public: isPublic })
    onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ component: 'form', onSubmit: submit }}>
      <DialogTitle>Edit playlist</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required sx={{ mt: 1 }} />
        <TextField label="Description" value={comment} onChange={(e) => setComment(e.target.value)} multiline minRows={2} />
        <FormControlLabel control={<Switch checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />} label="Visible to other users" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={!name.trim()}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}

export default function PlaylistDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { playTracks, addToQueue } = usePlayer()
  const notify = useUi((s) => s.notify)
  const [menu, setMenu] = useState(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [accessOpen, setAccessOpen] = useState(false)
  const canShare = useCan('share')
  const canExport = useCan('playlistImportExport')

  const [rulesOpen, setRulesOpen] = useState(false)

  // Dynamic playlists are rebuilt by the server when their songs are read: always reload on opening
  const isSmart = () =>
    !!(qc.getQueryData(['playlist', id, 'info'])?.rules || qc.getQueryData(['playlists'])?.find((p) => p.id === id)?.rules)
  const staleTime = () => (isSmart() ? 0 : 60_000)
  const preview = getPreview('playlist', id)
  const { data: playlist } = useQuery({
    ...playlistInfoQuery(id),
    staleTime,
    // Same fields as the playlist list (sidebar), so the whole header is ready before the request ends
    placeholderData: () => qc.getQueryData(['playlists'])?.find((p) => p.id === id) || preview,
  })
  const { data: tracks = [], isLoading } = useQuery({ ...playlistTracksQuery(id), staleTime })
  const smart = !!playlist?.rules
  const { data: smartFields } = useQuery({ queryKey: ['smartFields'], queryFn: getSmartFields, staleTime: Infinity, enabled: smart })
  const { data: allPlaylists = [] } = useQuery({ queryKey: ['playlists'], queryFn: getPlaylists, enabled: smart })
  const { data: access } = useQuery({ queryKey: ['playlistAccess', id], queryFn: () => getPlaylistAccess(id) })

  if (!playlist) return <><DetailHeaderSkeleton /><TrackListSkeleton showCover /></>

  const session = getSession()
  // Cisum: rights come from the server (owner, editors, administrators)
  const owner = access ? access.canManage : playlist.ownerId === session.userId || session.isAdmin
  const editable = access ? access.canEdit : owner && !playlist.rules && !playlist.sync
  const playable = tracks.filter((t) => !t.missing)
  const rulesText = smart && smartFields
    ? describeCriteria(playlist.rules, buildFields(smartFields), (pid) => allPlaylists.find((p) => p.id === pid)?.name || 'unknown')
    : ''

  const exportNsp = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([toNsp(playlist)], { type: 'application/json' }))
    a.download = `${playlist.name.replace(/[\\/:*?"<>|]/g, '_')}.nsp`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const missingCount = tracks.length - playable.length
  // While the songs load, the header uses the totals of the playlist list and Play waits for the songs
  const songCount = isLoading ? playlist.songCount : tracks.length
  const duration = isLoading ? playlist.duration : playable.reduce((s, t) => s + t.duration, 0)
  const loadPlayable = async () =>
    isLoading ? (await qc.fetchQuery({ ...playlistTracksQuery(id), staleTime: staleTime() })).filter((t) => !t.missing) : playable
  const canPlay = isLoading ? playlist.songCount > 0 : playable.length > 0

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['playlist', id] })
    qc.invalidateQueries({ queryKey: ['playlists'] })
  }

  const run = async (fn, message) => {
    try {
      await fn()
      if (message) notify(message)
    } catch (e) {
      notify(e.message)
    }
    refresh()
  }

  const onMove = (from, to) => {
    // Optimistic reorder, then persist (positions are 1-based)
    const next = [...tracks]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    qc.setQueryData(['playlist', id], next.map((t, i) => ({ ...t, position: i + 1 })))
    run(() => moveInPlaylist(id, tracks[from].position, to + 1))
  }

  const menuItems = editable
    ? (t) => [{
        label: 'Remove from playlist',
        icon: <RemoveCircleOutlineRounded fontSize="small" />,
        danger: true,
        onClick: () => run(() => removeFromPlaylist(id, [t.position]), `"${t.title}" removed`),
      }]
    : undefined

  return (
    <>
      <DetailHeader
        coverId={playlistCover(playlist)}
        coverHint={preview?.coverPx}
        title={playlist.name}
        subtitle={playlist.comment || undefined}
        meta={[plural(songCount || 0, 'song'), formatLength(duration), `by ${playlist.ownerName}`].join(', ')}
        onPlay={canPlay ? async () => playTracks(await loadPlayable()) : undefined}
        onShuffle={canPlay ? async () => playTracks(await loadPlayable(), 0, { shuffle: true }) : undefined}
        actions={
          <>
            <Tooltip title="More actions">
              <IconButton aria-label="More playlist actions" onClick={(e) => setMenu(e.currentTarget)}><MoreVertRounded /></IconButton>
            </Tooltip>
            <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
              <MenuItem onClick={async () => { setMenu(null); addToQueue(await loadPlayable()); notify('Playlist added to the queue') }}>
                <ListItemIcon><AddToQueueRounded fontSize="small" /></ListItemIcon>Add to queue
              </MenuItem>
              {owner && smart && (
                <MenuItem onClick={() => { setMenu(null); setRulesOpen(true) }}>
                  <ListItemIcon><AutoAwesomeRounded fontSize="small" /></ListItemIcon>Edit rules
                </MenuItem>
              )}
              {owner && (
                <MenuItem onClick={() => { setMenu(null); setEditing(true) }}>
                  <ListItemIcon><EditRounded fontSize="small" /></ListItemIcon>Edit details
                </MenuItem>
              )}
              {owner && (
                <MenuItem onClick={() => { setMenu(null); setAccessOpen(true) }}>
                  <ListItemIcon><GroupRounded fontSize="small" /></ListItemIcon>Share with people
                </MenuItem>
              )}
              {owner && canShare && (
                <MenuItem onClick={() => { setMenu(null); setSharing(true) }}>
                  <ListItemIcon><LinkRounded fontSize="small" /></ListItemIcon>Public link
                </MenuItem>
              )}
              {canExport && (
                <MenuItem onClick={() => { setMenu(null); exportPlaylists([id]).catch((e) => notify(e.message)) }}>
                  <ListItemIcon><FileDownloadRounded fontSize="small" /></ListItemIcon>Export M3U8
                </MenuItem>
              )}
              {canExport && smart && (
                <MenuItem onClick={() => { setMenu(null); exportNsp() }}>
                  <ListItemIcon><DataObjectRounded fontSize="small" /></ListItemIcon>Export rules (.nsp)
                </MenuItem>
              )}
              {owner && (
                <MenuItem onClick={() => { setMenu(null); setConfirmDelete(true) }} sx={{ color: 'error.main' }}>
                  <ListItemIcon sx={{ color: 'error.main' }}><DeleteRounded fontSize="small" /></ListItemIcon>Delete playlist
                </MenuItem>
              )}
            </Menu>
          </>
        }
      />

      {smart && (
        <Alert
          severity="info"
          icon={<AutoAwesomeRounded fontSize="inherit" />}
          sx={{ mb: 2, borderRadius: 4 }}
          action={owner ? <Button color="inherit" size="small" onClick={() => setRulesOpen(true)}>Edit rules</Button> : undefined}
        >
          <strong>Dynamic playlist.</strong>{' '}
          {playlist.ownerId === session.userId
            ? 'Rebuilt from its rules each time you open it.'
            : 'Rebuilt from its rules each time its owner opens it.'}
          {rulesText && <Box component="span" sx={{ display: 'block', mt: 0.5, opacity: 0.85 }}>{rulesText}</Box>}
        </Alert>
      )}
      {missingCount > 0 && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 4 }}>
          {plural(missingCount, 'song')} cannot be found on disk. {missingCount === 1 ? 'It stays' : 'They stay'} in the playlist and
          {missingCount === 1 ? ' plays' : ' play'} again automatically once the file is back in the library, even at a new location.
        </Alert>
      )}
      {!isLoading && !tracks.length && (
        <EmptyState title={smart ? 'No song matches the rules' : 'This playlist is empty'}>
          {smart ? 'Change the rules to include more songs.' : 'Use "Add to playlist" from any song, album or the player.'}
        </EmptyState>
      )}

      {isLoading
        ? <TrackListSkeleton count={playlist.songCount} showCover />
        : <TrackList tracks={tracks} showCover showAlbum menuItems={menuItems} onMove={editable ? onMove : undefined} />}

      {owner && (
        <EditDialog
          key={playlist.updatedAt}
          playlist={playlist}
          open={editing}
          onClose={() => setEditing(false)}
          onSaved={(fields) => run(() => updatePlaylist(id, fields), 'Playlist saved')}
        />
      )}
      {rulesOpen && <SmartPlaylistDialog key={playlist.updatedAt} open playlist={playlist} onClose={() => setRulesOpen(false)} />}
      {sharing && <ShareDialog open ids={[playlist.id]} title={playlist.name} onClose={() => setSharing(false)} />}
      {accessOpen && <PlaylistAccessDialog open playlist={playlist} isAdmin={session.isAdmin} onClose={() => setAccessOpen(false)} />}
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>Delete "{playlist.name}"?</DialogTitle>
        <DialogContent>The playlist is removed for everyone. The songs stay in the library.</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              try {
                await deletePlaylist(id)
                qc.invalidateQueries({ queryKey: ['playlists'] })
                notify('Playlist deleted')
                navigate('/playlists')
              } catch (e) {
                notify(e.message)
              }
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
