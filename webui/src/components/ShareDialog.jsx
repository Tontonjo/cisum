// Cisum web player v0.4.0 - Creates a public share link for an album, a playlist or songs.
import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, FormControlLabel, Switch, Alert, Box,
} from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import { createShare } from '../api/admin'
import { useMe } from '../store/me'
import { useUi } from '../store/ui'
import config from '../config'

export const shareUrl = (id) => `${window.location.origin}${config.baseURL}/share/${id}`

const EXPIRATIONS = [
  ['1', '1 day'],
  ['7', '1 week'],
  ['30', '1 month'],
  ['365', '1 year'],
  ['0', 'Never'],
]

/** ids: array of album, playlist or song ids (all the same kind). */
export default function ShareDialog({ open, onClose, ids, title }) {
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const downloadEnabled = useMe((s) => s.downloadEnabled && s.permissions.download)
  const [description, setDescription] = useState(title || '')
  const [days, setDays] = useState('30')
  const [downloadable, setDownloadable] = useState(false)
  const [link, setLink] = useState(null)
  const [error, setError] = useState(null)

  const create = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const expiresAt = days === '0' ? undefined : new Date(Date.now() + Number(days) * 86400000).toISOString()
      const { id } = await createShare({ resourceIds: ids.join(','), description, expiresAt, downloadable })
      setLink(shareUrl(id))
      qc.invalidateQueries({ queryKey: ['shares'] })
    } catch (err) {
      setError(err.message)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      notify('Link copied')
    } catch {
      /* the link stays visible in the field */
    }
  }

  const close = () => {
    setLink(null)
    onClose()
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs" PaperProps={{ component: 'form', onSubmit: create }}>
      <DialogTitle>{link ? 'Share link ready' : 'Share publicly'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {link ? (
          <TextField value={link} label="Anyone with this link can listen" InputProps={{ readOnly: true }} onFocus={(e) => e.target.select()} sx={{ mt: 1 }} />
        ) : (
          <>
            <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} sx={{ mt: 1 }} />
            <TextField select label="Link expires after" value={days} onChange={(e) => setDays(e.target.value)}>
              {EXPIRATIONS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </TextField>
            {downloadEnabled && (
              <FormControlLabel control={<Switch checked={downloadable} onChange={(e) => setDownloadable(e.target.checked)} />} label="Allow downloading" />
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {link ? (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={close}>Done</Button>
            <Button variant="contained" onClick={copy}>Copy link</Button>
          </Box>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" variant="contained">Create link</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
