// Cisum web player v0.5.0 - Administration: every playlist of the server, with owner, sharing and deletion.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Box, Chip, IconButton, Tooltip, Typography, TextField, InputAdornment, Dialog, DialogTitle, DialogContent,
  DialogActions, Button, LinearProgress,
} from '@mui/material'
import FilterListRounded from '@mui/icons-material/FilterListRounded'
import GroupRounded from '@mui/icons-material/GroupRounded'
import EditNoteRounded from '@mui/icons-material/EditNoteRounded'
import DeleteRounded from '@mui/icons-material/DeleteRounded'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getAllPlaylists } from '../../api/admin'
import { deletePlaylist } from '../../api/library'
import { useUi } from '../../store/ui'
import { formatLength, plural } from '../../utils/format'
import PlaylistAccessDialog from '../PlaylistAccessDialog'
import Cover from '../Cover'
import { Panel } from './Panel'

export default function PlaylistsTab() {
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const [filter, setFilter] = useState('')
  const [settings, setSettings] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const { data: playlists = [], isLoading } = useQuery({ queryKey: ['adminPlaylists'], queryFn: getAllPlaylists })
  const f = filter.trim().toLowerCase()
  const shown = f ? playlists.filter((p) => `${p.name} ${p.ownerName}`.toLowerCase().includes(f)) : playlists

  return (
    <Panel
      title={`Playlists (${playlists.length})`}
      description="A playlist belongs to the user who created it or to the user it was imported for. You can change its owner, who can listen to it and who can edit it, edit its songs or delete it."
      actions={
        <TextField size="small" hiddenLabel placeholder="Filter by name or owner" value={filter} onChange={(e) => setFilter(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><FilterListRounded /></InputAdornment>, disableUnderline: true, sx: { borderRadius: 999 } }}
          inputProps={{ 'aria-label': 'Filter playlists' }} />
      }
    >
      {isLoading && <LinearProgress />}
      {shown.map((p) => (
        <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1, px: 1, borderRadius: 3, '&:hover': { bgcolor: 'action.hover' } }}>
          <Cover id={`pl-${p.id}`} size={48} radius={2} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {p.name}
              {p.public && <Chip size="small" label="Everyone" />}
              {p.rules && <Chip size="small" label="Smart" variant="outlined" />}
              {p.sync && <Chip size="small" label="Synced file" variant="outlined" />}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              Owner: {p.ownerName}, {plural(p.songCount, 'song')}, {formatLength(p.duration)}
            </Typography>
          </Box>
          <Tooltip title="Owner and sharing">
            <IconButton aria-label={`Sharing of ${p.name}`} onClick={() => setSettings(p)}><GroupRounded /></IconButton>
          </Tooltip>
          <Tooltip title="Open and edit songs">
            <IconButton aria-label={`Open ${p.name}`} component={Link} to={`/playlists/${p.id}`}><EditNoteRounded /></IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton aria-label={`Delete ${p.name}`} onClick={() => setToDelete(p)}><DeleteRounded /></IconButton>
          </Tooltip>
        </Box>
      ))}
      {settings && <PlaylistAccessDialog open isAdmin playlist={settings} onClose={() => setSettings(null)} />}
      <Dialog open={!!toDelete} onClose={() => setToDelete(null)}>
        <DialogTitle>Delete "{toDelete?.name}"?</DialogTitle>
        <DialogContent>It is removed for its owner ({toDelete?.ownerName}) and everyone it is shared with. Songs stay in the library.</DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={async () => {
            try {
              await deletePlaylist(toDelete.id)
              notify('Playlist deleted')
              qc.invalidateQueries({ queryKey: ['adminPlaylists'] })
              qc.invalidateQueries({ queryKey: ['playlists'] })
            } catch (e) {
              notify(e.message)
            }
            setToDelete(null)
          }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Panel>
  )
}
