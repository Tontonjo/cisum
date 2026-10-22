// Cisum web player v0.11.1 - Picks a playlist (or creates one) for the selected tracks.
import { useState } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItemButton, ListItemAvatar, ListItemText, TextField, Box } from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPlaylists, addToPlaylist, createPlaylist, getEditablePlaylistIds, playlistCover } from '../api/library'
import { useUi } from '../store/ui'
import { plural } from '../utils/format'
import Cover from './Cover'

export default function AddToPlaylistDialog() {
  const { playlistPicker: tracks, closePlaylistPicker, notify } = useUi()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const { data: playlists = [] } = useQuery({ queryKey: ['playlists'], queryFn: getPlaylists, enabled: !!tracks })
  // Own playlists and playlists where the user is an editor
  const { data: editableIds = [] } = useQuery({ queryKey: ['editablePlaylists'], queryFn: getEditablePlaylistIds, enabled: !!tracks })
  const editable = playlists.filter((p) => editableIds.includes(p.id))
  const ids = (tracks || []).filter((t) => !t.missing).map((t) => t.id)

  const done = (message, playlistId) => {
    qc.invalidateQueries({ queryKey: ['playlists'] })
    qc.invalidateQueries({ queryKey: ['editablePlaylists'] })
    if (playlistId) qc.invalidateQueries({ queryKey: ['playlist', playlistId] })
    notify(message)
    setName('')
    closePlaylistPicker()
  }

  const addTo = async (p) => {
    setBusy(true)
    try {
      await addToPlaylist(p.id, ids)
      done(`${plural(ids.length, 'song')} added to "${p.name}"`, p.id)
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy(false)
    }
  }

  const createAndAdd = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const p = await createPlaylist(name.trim(), ids)
      done(`Playlist "${p.name}" created`, p.id)
    } catch (err) {
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!tracks} onClose={closePlaylistPicker} fullWidth maxWidth="xs">
      <DialogTitle>Add {plural(ids.length, 'song')} to a playlist</DialogTitle>
      <DialogContent sx={{ px: 1 }}>
        <Box component="form" onSubmit={createAndAdd} sx={{ display: 'flex', gap: 1, px: 2, mb: 1, alignItems: 'center' }}>
          <TextField size="small" label="New playlist" value={name} onChange={(e) => setName(e.target.value)} sx={{ flex: 1 }} />
          <Button type="submit" variant="contained" disabled={busy || !name.trim()}>Create</Button>
        </Box>
        <List>
          {editable.map((p) => (
            <ListItemButton key={p.id} onClick={() => addTo(p)} disabled={busy} sx={{ borderRadius: 3 }}>
              <ListItemAvatar>
                <Cover id={playlistCover(p)} size={40} radius={1.5} />
              </ListItemAvatar>
              <ListItemText primary={p.name} secondary={plural(p.songCount, 'song')} />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={closePlaylistPicker}>Cancel</Button>
      </DialogActions>
    </Dialog>
  )
}
