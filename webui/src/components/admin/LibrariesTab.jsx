// Cisum web player v0.4.0 - Administration: music libraries (folders scanned by the server).
import { useState } from 'react'
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Switch,
  TextField, Tooltip, Typography, Alert,
} from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import EditRounded from '@mui/icons-material/EditRounded'
import DeleteRounded from '@mui/icons-material/DeleteRounded'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getLibraries, createLibrary, updateLibrary, deleteLibrary } from '../../api/admin'
import { useUi } from '../../store/ui'
import { formatBytes, formatDate, formatLength } from '../../utils/format'
import { Panel } from './Panel'

function LibraryDialog({ library, onClose, onSaved }) {
  const isNew = !library.id
  const [form, setForm] = useState({ name: library.name || '', path: library.path || '', defaultNewUsers: library.defaultNewUsers ?? true })
  const [error, setError] = useState(null)
  const save = async (e) => {
    e.preventDefault()
    try {
      if (isNew) await createLibrary(form)
      else await updateLibrary(library.id, { ...library, ...form })
      onSaved()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ component: 'form', onSubmit: save }}>
      <DialogTitle>{isNew ? 'Add a library' : `Edit ${library.name}`}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required sx={{ mt: 1 }} />
        <TextField
          label="Folder path"
          value={form.path}
          onChange={(e) => setForm({ ...form, path: e.target.value })}
          required
          helperText="Path as seen by the server. With Docker, mount the folder in docker-compose.yml first (for example /music2)."
        />
        <FormControlLabel
          control={<Switch checked={form.defaultNewUsers} onChange={(e) => setForm({ ...form, defaultNewUsers: e.target.checked })} />}
          label="Give access to new users automatically"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained">{isNew ? 'Add library' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  )
}

export default function LibrariesTab() {
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const [editing, setEditing] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const { data: libraries = [] } = useQuery({ queryKey: ['adminLibraries'], queryFn: getLibraries })
  const refresh = () => qc.invalidateQueries({ queryKey: ['adminLibraries'] })

  return (
    <Panel
      title="Libraries"
      description="Each library is a music folder scanned by the server. New libraries are scanned at the next scan."
      actions={<Button variant="contained" startIcon={<AddRounded />} onClick={() => setEditing({})}>Add library</Button>}
    >
      {libraries.map((l) => (
        <Box key={l.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.25, px: 1, borderRadius: 3, '&:hover': { bgcolor: 'action.hover' } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" noWrap>{l.name}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>{l.path}</Typography>
            <Typography variant="body2" color="text.secondary">
              {l.totalSongs} songs, {l.totalAlbums} albums, {formatLength(l.totalDuration)}, {formatBytes(l.totalSize)}
              {l.totalMissingFiles ? `, ${l.totalMissingFiles} missing` : ''}. Last scan: {formatDate(l.lastScanAt)}
            </Typography>
          </Box>
          <Tooltip title="Edit">
            <IconButton aria-label={`Edit ${l.name}`} onClick={() => setEditing(l)}><EditRounded /></IconButton>
          </Tooltip>
          {libraries.length > 1 && (
            <Tooltip title="Remove">
              <IconButton aria-label={`Remove ${l.name}`} onClick={() => setToDelete(l)}><DeleteRounded /></IconButton>
            </Tooltip>
          )}
        </Box>
      ))}
      {editing && <LibraryDialog library={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />}
      <Dialog open={!!toDelete} onClose={() => setToDelete(null)}>
        <DialogTitle>Remove {toDelete?.name}?</DialogTitle>
        <DialogContent>The library is removed from Cisum with its songs, albums and play data. The files on disk are not deleted.</DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              try {
                await deleteLibrary(toDelete.id)
                notify('Library removed')
                refresh()
              } catch (e) {
                notify(e.message)
              }
              setToDelete(null)
            }}
          >
            Remove library
          </Button>
        </DialogActions>
      </Dialog>
    </Panel>
  )
}
