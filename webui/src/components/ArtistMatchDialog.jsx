// Cisum web player v0.11.4 - Admin dialog: choose which Deezer / Last.fm artist is the right one for a
// local artist, when the automatic match by name picked a homonym (wrong picture or biography).
import { useEffect, useState } from 'react'
import {
  Alert, Avatar, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  InputAdornment, List, ListItemAvatar, ListItemButton, ListItemText, Radio, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import SearchRounded from '@mui/icons-material/SearchRounded'
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded'
import AutoModeRounded from '@mui/icons-material/AutoModeRounded'
import BlockRounded from '@mui/icons-material/BlockRounded'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getArtistMatch, setArtistMatch } from '../api/admin'
import { useUi } from '../store/ui'

// Times (ms) at which the artist page reloads after saving: the server fetches the new picture and info meanwhile
const RELOAD_AFTER_MS = [3000, 10000]

const AUTO = 'auto'
const NONE = 'none'
// Deezer candidates have an id, Last.fm ones are identified by their exact name
const candidateKey = (c) => (c.id ? `id:${c.id}` : `name:${c.name}`)
const pinKey = (pin) => (!pin ? AUTO : pin.none ? NONE : pin.id ? `id:${pin.id}` : `name:${pin.name}`)

function formatCount(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`
  return String(n)
}

function candidateDetails(c, agent) {
  const fans = agent === 'lastfm' ? 'listeners' : 'fans'
  const albums = c.albums ? `${c.albums} ${c.albums === 1 ? 'album' : 'albums'}` : null
  return [c.fans ? `${formatCount(c.fans)} ${fans}` : null, albums].filter(Boolean).join(', ')
}

function Option({ selected, onSelect, avatar, primary, secondary, href }) {
  return (
    <ListItemButton selected={selected} onClick={onSelect} sx={{ borderRadius: 3, pr: href ? 7 : 2, position: 'relative' }}>
      <Radio checked={selected} tabIndex={-1} size="small" sx={{ mr: 0.5, ml: -1 }} />
      <ListItemAvatar>{avatar}</ListItemAvatar>
      <ListItemText primary={primary} secondary={secondary} primaryTypographyProps={{ noWrap: true }} />
      {href && (
        <IconButton component="a" href={href} target="_blank" rel="noopener noreferrer" size="small" aria-label="Open on the provider site"
          onClick={(e) => e.stopPropagation()} sx={{ position: 'absolute', right: 12 }}>
          <OpenInNewRounded fontSize="small" />
        </IconButton>
      )}
    </ListItemButton>
  )
}

function ProviderSection({ provider, value, onChange }) {
  const { agent, label, candidates, pin, error } = provider
  // The current choice stays selectable even when the new search does not return it
  const pinned = pin && !pin.none && !candidates.some((c) => candidateKey(c) === pinKey(pin))
  const shown = pinned ? [{ id: pin.id, name: pin.name, mbid: pin.mbid, current: true }, ...candidates] : candidates
  return (
    <Box component="section" sx={{ mb: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 650, mb: 0.5 }}>{label}</Typography>
      {error && <Alert severity="warning" sx={{ mb: 1 }}>{error}</Alert>}
      <List dense disablePadding>
        <Option selected={value === AUTO} onSelect={() => onChange(AUTO)} avatar={<Avatar><AutoModeRounded /></Avatar>}
          primary="Automatic" secondary="Best match by name (default)" />
        {shown.map((c) => (
          <Option key={candidateKey(c)} selected={value === candidateKey(c)} onSelect={() => onChange(candidateKey(c))}
            avatar={<Avatar src={c.imageUrl} alt="">{c.name.slice(0, 1)}</Avatar>}
            primary={c.name}
            secondary={c.current ? 'Current choice' : candidateDetails(c, agent) || (c.mbid ? 'MusicBrainz id known' : null)}
            href={c.url} />
        ))}
        {!shown.length && !error && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>No artist found for this search.</Typography>
        )}
        <Option selected={value === NONE} onSelect={() => onChange(NONE)} avatar={<Avatar><BlockRounded /></Avatar>}
          primary={`Not on ${label}`} secondary={`Never use ${label} for this artist`} />
      </List>
    </Box>
  )
}

/** artist: { id, name }. Opened by admins from the artist page. */
export default function ArtistMatchDialog({ artist, open, onClose }) {
  const theme = useTheme()
  const fullScreen = !useMediaQuery(theme.breakpoints.up('md'))
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const [search, setSearch] = useState(artist.name)
  const [query, setQuery] = useState(artist.name)
  const [values, setValues] = useState({})
  const [saving, setSaving] = useState(false)

  const { data, isFetching, error } = useQuery({
    queryKey: ['artistMatch', artist.id, query],
    queryFn: () => getArtistMatch(artist.id, query),
    enabled: open,
    staleTime: 0,
  })
  // Selection starts from the saved choice, once per opening
  useEffect(() => {
    if (open && data) setValues((v) => (Object.keys(v).length ? v : Object.fromEntries(data.providers.map((p) => [p.agent, pinKey(p.pin)]))))
  }, [open, data])
  useEffect(() => {
    if (!open) {
      setValues({})
      setSearch(artist.name)
      setQuery(artist.name)
    }
  }, [open, artist.name])

  const providers = data?.providers || []
  // Lists are shown once the saved choice is applied, so the selection does not jump
  const ready = Object.keys(values).length > 0 || !providers.length
  const save = async () => {
    const pins = {}
    for (const p of providers) {
      const v = values[p.agent] || AUTO
      if (v === NONE) pins[p.agent] = { none: true }
      else if (v !== AUTO) {
        const c = [...p.candidates, ...(p.pin ? [p.pin] : [])].find((x) => !x.none && candidateKey(x) === v)
        if (c) pins[p.agent] = { id: c.id || '', name: c.name, mbid: c.mbid || '' }
      }
    }
    setSaving(true)
    try {
      await setArtistMatch(artist.id, pins)
      // Next opening starts from the new choice, not from the cached search
      qc.removeQueries({ queryKey: ['artistMatch', artist.id] })
      notify('Saved. The picture and information update in a few seconds.')
      onClose()
      for (const ms of RELOAD_AFTER_MS) {
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: ['artist', artist.id] })
          qc.invalidateQueries({ queryKey: ['artistInfo', artist.id] })
          qc.invalidateQueries({ queryKey: ['artists'] })
        }, ms)
      }
    } catch (e) {
      notify(`Failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle>Choose the right artist</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The picture, biography and similar artists of {artist.name} come from these services, matched by name.
          If a namesake was picked, select the right entry. A picture file in the artist folder (artist.jpg) still wins.
        </Typography>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); setQuery(search.trim() || artist.name) }} sx={{ mb: 2 }}>
          <TextField
            fullWidth size="small" label="Search" value={search} onChange={(e) => setSearch(e.target.value)}
            InputProps={{ endAdornment: <InputAdornment position="end"><IconButton type="submit" aria-label="Search" edge="end"><SearchRounded /></IconButton></InputAdornment> }}
          />
        </Box>
        {(!data || !ready) && !error && <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}><CircularProgress /></Box>}
        {error && <Alert severity="error">{error.message}</Alert>}
        {data && !providers.length && (
          <Alert severity="info">No online service supporting this is enabled (Deezer or Last.fm).</Alert>
        )}
        {ready && providers.map((p) => (
          <ProviderSection key={p.agent} provider={p} value={values[p.agent] || AUTO}
            onChange={(v) => setValues((s) => ({ ...s, [p.agent]: v }))} />
        ))}
        {isFetching && data && <Typography variant="body2" color="text.secondary">Searching...</Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!providers.length || saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  )
}
