// Cisum web player v0.4.0 - Administration: users, their libraries and their rights.
import { useState } from 'react'
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  LinearProgress, Switch, TextField, Tooltip, Typography, Checkbox, FormGroup, Alert,
} from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import EditRounded from '@mui/icons-material/EditRounded'
import DeleteRounded from '@mui/icons-material/DeleteRounded'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getUsers, createUser, updateUser, deleteUser, getLibraries, getUserLibraries, setUserLibraries,
  getUserPermissions, setUserPermissions,
} from '../../api/admin'
import { getSession } from '../../api/client'
import { useUi } from '../../store/ui'
import { formatDate } from '../../utils/format'
import { Panel } from './Panel'

const RIGHTS = [
  ['download', 'Download files', 'Download songs and albums, from the web player and from apps.'],
  ['share', 'Share publicly', 'Create public links to albums, playlists and songs.'],
  ['playlistImportExport', 'Import and export playlists', 'Upload and download M3U playlist files.'],
]

const DEFAULT_RIGHTS = { download: true, share: true, playlistImportExport: true }

function UserDialog({ user, libraries, onClose, onSaved }) {
  const isNew = !user.id
  const notify = useUi((s) => s.notify)
  const [form, setForm] = useState({
    userName: user.userName || '', name: user.name || '', email: user.email || '', password: '', isAdmin: !!user.isAdmin,
  })
  const [libs, setLibs] = useState(user.libraryIds || libraries.map((l) => l.id))
  const [rights, setRights] = useState(user.permissions || DEFAULT_RIGHTS)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const payload = { ...form }
      if (!payload.password) delete payload.password
      const saved = isNew ? await createUser(payload) : await updateUser(user.id, payload)
      const id = saved?.id || user.id
      if (!form.isAdmin) {
        await setUserLibraries(id, libs)
        await setUserPermissions(id, rights)
      }
      notify(isNew ? `User ${form.userName} created` : `User ${form.userName} saved`)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ component: 'form', onSubmit: save }}>
      <DialogTitle>{isNew ? 'New user' : `Edit ${user.userName}`}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 1 }}>
          <TextField label="Username" value={form.userName} onChange={set('userName')} required autoComplete="off" />
          <TextField label="Display name" value={form.name} onChange={set('name')} required />
          <TextField label="Email" type="email" value={form.email} onChange={set('email')} />
          <TextField
            label={isNew ? 'Password' : 'New password'}
            type="password"
            value={form.password}
            onChange={set('password')}
            required={isNew}
            autoComplete="new-password"
            helperText={isNew ? undefined : 'Leave empty to keep the current one'}
          />
        </Box>
        <FormControlLabel control={<Switch checked={form.isAdmin} onChange={set('isAdmin')} />} label="Administrator (all libraries and all rights)" />
        {!form.isAdmin && (
          <>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Libraries</Typography>
              <FormGroup row>
                {libraries.map((l) => (
                  <FormControlLabel
                    key={l.id}
                    label={l.name}
                    control={<Checkbox checked={libs.includes(l.id)} onChange={(e) => setLibs(e.target.checked ? [...libs, l.id] : libs.filter((x) => x !== l.id))} />}
                  />
                ))}
              </FormGroup>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Rights</Typography>
              {RIGHTS.map(([key, label, help]) => (
                <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Switch checked={!!rights[key]} onChange={(e) => setRights({ ...rights, [key]: e.target.checked })} inputProps={{ 'aria-label': label }} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
                    <Typography variant="caption" color="text.secondary">{help}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={busy}>{isNew ? 'Create user' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  )
}

export default function UsersTab() {
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const [editing, setEditing] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const me = getSession()
  const { data: users = [], isLoading } = useQuery({ queryKey: ['adminUsers'], queryFn: getUsers })
  const { data: libraries = [] } = useQuery({ queryKey: ['adminLibraries'], queryFn: getLibraries })

  const openEditor = async (user) => {
    if (!user.id) return setEditing({})
    try {
      const [libs, permissions] = await Promise.all([getUserLibraries(user.id), getUserPermissions(user.id)])
      setEditing({ ...user, libraryIds: libs.map((l) => l.id), permissions })
    } catch (e) {
      notify(e.message)
    }
  }

  const remove = async () => {
    try {
      await deleteUser(toDelete.id)
      notify(`User ${toDelete.userName} deleted`)
      qc.invalidateQueries({ queryKey: ['adminUsers'] })
    } catch (e) {
      notify(e.message)
    }
    setToDelete(null)
  }

  return (
    <Panel
      title="Users"
      description="Administrators manage the server and have every right. Other users only see the libraries you give them."
      actions={<Button variant="contained" startIcon={<AddRounded />} onClick={() => openEditor({})}>New user</Button>}
    >
      {isLoading && <LinearProgress />}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {users.map((u) => (
          <Box component="li" key={u.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.25, px: 1, borderRadius: 3, '&:hover': { bgcolor: 'action.hover' } }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {u.name || u.userName}
                {u.isAdmin && <Chip size="small" label="Admin" color="primary" />}
                {u.id === me.userId && <Chip size="small" label="You" variant="outlined" />}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {u.userName}{u.email ? `, ${u.email}` : ''}. Last seen: {formatDate(u.lastAccessAt)}
              </Typography>
            </Box>
            <Tooltip title="Edit">
              <IconButton aria-label={`Edit ${u.userName}`} onClick={() => openEditor(u)}><EditRounded /></IconButton>
            </Tooltip>
            {u.id !== me.userId && (
              <Tooltip title="Delete">
                <IconButton aria-label={`Delete ${u.userName}`} onClick={() => setToDelete(u)}><DeleteRounded /></IconButton>
              </Tooltip>
            )}
          </Box>
        ))}
      </Box>

      {editing && (
        <UserDialog
          user={editing}
          libraries={libraries}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            qc.invalidateQueries({ queryKey: ['adminUsers'] })
          }}
        />
      )}
      <Dialog open={!!toDelete} onClose={() => setToDelete(null)}>
        <DialogTitle>Delete {toDelete?.userName}?</DialogTitle>
        <DialogContent>Their playlists, favorites, ratings and play history are deleted too. Music files are not touched.</DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={remove}>Delete user</Button>
        </DialogActions>
      </Dialog>
    </Panel>
  )
}
