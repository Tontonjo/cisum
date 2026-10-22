// Cisum web player v0.1.0 - Creates an empty playlist and opens it.
import { useState } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { createPlaylist } from '../api/library'
import { useUi } from '../store/ui'

export default function NewPlaylistDialog({ open, onClose }) {
  const [name, setName] = useState('')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)

  const submit = async (e) => {
    e.preventDefault()
    try {
      const p = await createPlaylist(name.trim())
      qc.invalidateQueries({ queryKey: ['playlists'] })
      setName('')
      onClose()
      navigate(`/playlists/${p.id}`)
    } catch (err) {
      notify(err.message)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ component: 'form', onSubmit: submit }}>
      <DialogTitle>New playlist</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth label="Name" value={name} onChange={(e) => setName(e.target.value)} sx={{ mt: 1 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={!name.trim()}>Create</Button>
      </DialogActions>
    </Dialog>
  )
}
