// Cisum web player v0.7.0 - Add or edit a web radio station (administrators).
// Name, stream URL (direct stream or .pls / .m3u link), website and logo (image file or URL).
// "Check" connects to the stream through the server and fills the name when it is empty.
import { useEffect, useRef, useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Typography, Alert, CircularProgress,
} from '@mui/material'
import WifiTetheringRounded from '@mui/icons-material/WifiTetheringRounded'
import ImageRounded from '@mui/icons-material/ImageRounded'
import { useQueryClient } from '@tanstack/react-query'
import {
  createRadio, updateRadio, probeRadio, uploadRadioLogo, setRadioLogoFromUrl, deleteRadioLogo,
} from '../../api/radio'
import { useUi } from '../../store/ui'
import { RadioCover } from '../Radio'

const EMPTY = { name: '', streamUrl: '', homePageUrl: '', logoUrl: '' }
const isHttp = (v) => /^https?:\/\/\S+$/i.test(v.trim())

export default function RadioDialog({ open, radio, onClose }) {
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const fileRef = useRef()
  const [form, setForm] = useState(EMPTY)
  const [file, setFile] = useState(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [check, setCheck] = useState(null) // null | 'busy' | probe result
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(radio ? { name: radio.name, streamUrl: radio.streamUrl, homePageUrl: radio.homePageUrl, logoUrl: '' } : EMPTY)
    setFile(null)
    setRemoveLogo(false)
    setCheck(null)
  }, [open, radio])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const urlError = form.streamUrl && !isHttp(form.streamUrl)
  const valid = form.name.trim() && isHttp(form.streamUrl) && (!form.homePageUrl || isHttp(form.homePageUrl)) && (!form.logoUrl || isHttp(form.logoUrl))

  const onCheck = async () => {
    setCheck('busy')
    try {
      const r = await probeRadio(form.streamUrl.trim())
      setCheck(r)
      if (r.ok && r.info?.name && !form.name.trim()) setForm((f) => ({ ...f, name: r.info.name }))
    } catch (e) {
      setCheck({ ok: false, error: e.message })
    }
  }

  const onSave = async () => {
    setSaving(true)
    const fields = { name: form.name.trim(), streamUrl: form.streamUrl.trim(), homePageUrl: form.homePageUrl.trim() }
    try {
      let id = radio?.id
      if (id) await updateRadio(id, fields)
      else id = await createRadio(fields)
      // The station is saved: a logo problem is reported but does not cancel it
      try {
        if (file) await uploadRadioLogo(id, file)
        else if (form.logoUrl.trim()) await setRadioLogoFromUrl(id, form.logoUrl.trim())
        else if (removeLogo && radio?.coverArt) await deleteRadioLogo(id)
      } catch (e) {
        notify(`Station saved, but the logo was not: ${e.message}`)
      }
      qc.invalidateQueries({ queryKey: ['radios'] })
      onClose(true)
    } catch (e) {
      notify(`Could not save the station: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const showCurrentLogo = radio?.coverArt && !removeLogo && !file && !form.logoUrl
  return (
    <Dialog open={open} onClose={() => !saving && onClose(false)} fullWidth maxWidth="sm">
      <DialogTitle>{radio ? 'Edit station' : 'Add a station'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <TextField label="Name" value={form.name} onChange={set('name')} required autoFocus={!radio} />
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            label="Stream URL"
            value={form.streamUrl}
            onChange={(e) => { set('streamUrl')(e); setCheck(null) }}
            required
            fullWidth
            error={!!urlError}
            helperText={urlError ? 'Must start with http:// or https://' : 'Direct stream, or a .pls / .m3u link'}
          />
          <Button
            onClick={onCheck}
            disabled={!isHttp(form.streamUrl) || check === 'busy'}
            startIcon={check === 'busy' ? <CircularProgress size={16} /> : <WifiTetheringRounded />}
            sx={{ mt: 1, flexShrink: 0 }}
          >
            Check
          </Button>
        </Box>
        {check && check !== 'busy' && (
          check.ok ? (
            <Alert severity="success">
              {check.hls
                ? 'HLS stream: it plays directly in the browser (not through the server) where the browser supports it.'
                : <>Stream reachable{check.info?.name ? `: ${check.info.name}` : ''}{check.info?.bitrate ? `, ${check.info.bitrate} kbps` : ''}.
                  {check.info?.title ? ` Now playing: ${check.info.title}.` : ' The station sends no song titles.'}</>}
            </Alert>
          ) : (
            <Alert severity="error">Stream not reachable from the server: {check.error}</Alert>
          )
        )}
        <TextField label="Website" value={form.homePageUrl} onChange={set('homePageUrl')} placeholder="https://" error={!!form.homePageUrl && !isHttp(form.homePageUrl)} />
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Logo</Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box sx={{ width: 72, flexShrink: 0 }}>
              {file ? (
                <Box component="img" src={URL.createObjectURL(file)} alt="" sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 3 }} />
              ) : (
                <RadioCover radio={showCurrentLogo ? radio : { coverArt: null }} size={72} radius={3} />
              )}
            </Box>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <TextField
                size="small"
                label="Logo URL"
                value={form.logoUrl}
                onChange={(e) => { set('logoUrl')(e); setFile(null) }}
                placeholder="https://.../logo.png"
                error={!!form.logoUrl && !isHttp(form.logoUrl)}
                helperText="JPEG, PNG, GIF or WebP"
              />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button size="small" startIcon={<ImageRounded />} onClick={() => fileRef.current.click()}>Choose image</Button>
                {(radio?.coverArt || file) && !removeLogo && (
                  <Button size="small" color="error" onClick={() => { setFile(null); setForm((f) => ({ ...f, logoUrl: '' })); setRemoveLogo(true) }}>
                    Remove logo
                  </Button>
                )}
              </Box>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                hidden
                onChange={(e) => { setFile(e.target.files[0] || null); setRemoveLogo(false); setForm((f) => ({ ...f, logoUrl: '' })); e.target.value = '' }}
              />
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={onSave} disabled={!valid || saving}>{saving ? 'Saving...' : radio ? 'Save' : 'Add'}</Button>
      </DialogActions>
    </Dialog>
  )
}
