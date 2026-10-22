// Cisum web player v0.5.0 - Who can see and edit a playlist. Used by the owner and by administrators
// (who can also change the owner).
import { useEffect, useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, RadioGroup, Radio, FormControlLabel, Autocomplete,
  TextField, Typography, Alert, Box, MenuItem, CircularProgress,
} from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPlaylistAccess, setPlaylistAccess, getUserNames } from '../api/library'
import { useUi } from '../store/ui'

const VISIBILITY = [
  ['private', 'Private', 'Only the owner and the editors below.'],
  ['users', 'Selected people', 'You choose who can listen to it.'],
  ['all', 'Everyone on this server', 'All users can find and play it.'],
]

function UserPicker({ label, users, value, onChange, exclude }) {
  const options = users.filter((u) => !exclude.includes(u.id))
  return (
    <Autocomplete
      multiple
      options={options}
      value={users.filter((u) => value.includes(u.id))}
      getOptionLabel={(u) => `${u.name || u.userName} (${u.userName})`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, v) => onChange(v.map((u) => u.id))}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  )
}

export default function PlaylistAccessDialog({ playlist, open, onClose, isAdmin }) {
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const { data: users = [] } = useQuery({ queryKey: ['userNames'], queryFn: getUserNames, enabled: open })
  const { data: access, isLoading } = useQuery({
    queryKey: ['playlistAccess', playlist.id],
    queryFn: () => getPlaylistAccess(playlist.id),
    enabled: open,
  })
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (access) setForm({ visibility: access.visibility, viewers: access.viewers, editors: access.editors, ownerId: access.ownerId })
  }, [access])

  const save = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      await setPlaylistAccess(playlist.id, form)
      notify('Sharing settings saved')
      qc.invalidateQueries({ queryKey: ['playlistAccess', playlist.id] })
      qc.invalidateQueries({ queryKey: ['playlists'] })
      qc.invalidateQueries({ queryKey: ['adminPlaylists'] })
      qc.invalidateQueries({ queryKey: ['playlist', playlist.id] })
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }

  const owner = form?.ownerId
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ component: 'form', onSubmit: save }}>
      <DialogTitle>Share "{playlist.name}"</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {(isLoading || !form) && <CircularProgress size={24} sx={{ alignSelf: 'center' }} />}
        {form && (
          <>
            {isAdmin && (
              <TextField select label="Owner" value={owner} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} sx={{ mt: 1 }}
                helperText="The owner manages sharing and can rename or delete the playlist.">
                {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.name || u.userName} ({u.userName})</MenuItem>)}
              </TextField>
            )}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Who can listen</Typography>
              <RadioGroup value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
                {VISIBILITY.map(([v, label, help]) => (
                  <FormControlLabel
                    key={v}
                    value={v}
                    control={<Radio />}
                    label={<Box><Typography>{label}</Typography><Typography variant="caption" color="text.secondary">{help}</Typography></Box>}
                    sx={{ alignItems: 'flex-start', '& .MuiRadio-root': { pt: 0.5 } }}
                  />
                ))}
              </RadioGroup>
            </Box>
            {form.visibility === 'users' && (
              <UserPicker label="People who can listen" users={users} value={form.viewers} exclude={[owner, ...form.editors]}
                onChange={(viewers) => setForm({ ...form, viewers })} />
            )}
            <Box>
              <UserPicker label="Editors" users={users} value={form.editors} exclude={[owner]}
                onChange={(editors) => setForm({ ...form, editors, viewers: form.viewers.filter((v) => !editors.includes(v)) })} />
              <Typography variant="caption" color="text.secondary">
                Editors can add, remove and reorder songs, from this player and from their apps. Only the owner renames, shares or deletes it.
              </Typography>
            </Box>
            {access?.readOnly && <Alert severity="info">This playlist is generated (smart or synced from a file): its songs cannot be edited.</Alert>}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={!form}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}
