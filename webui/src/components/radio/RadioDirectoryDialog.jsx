// Cisum web player v0.7.0 - Find stations in the radio-browser.info directory and add them
// (administrators). The search runs on the server; the logo is copied when the format allows it.
import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, Box, Typography,
  CircularProgress, Alert, Chip, InputAdornment, useMediaQuery, useTheme,
} from '@mui/material'
import SearchRounded from '@mui/icons-material/SearchRounded'
import AddRounded from '@mui/icons-material/AddRounded'
import CheckRounded from '@mui/icons-material/CheckRounded'
import RadioRounded from '@mui/icons-material/RadioRounded'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { searchRadioDirectory, getRadioCountries, createRadio, setRadioLogoFromUrl } from '../../api/radio'
import { useUi } from '../../store/ui'

function Logo({ src }) {
  const { m3 } = useTheme()
  const [failed, setFailed] = useState(false)
  return (
    <Box sx={{ width: 48, height: 48, borderRadius: 2, flexShrink: 0, overflow: 'hidden', display: 'grid', placeItems: 'center', bgcolor: m3.surfaceContainerHighest, color: m3.onSurfaceVariant }}>
      {src && !failed ? (
        <Box component="img" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <RadioRounded />
      )}
    </Box>
  )
}

export default function RadioDirectoryDialog({ open, onClose, existing = [] }) {
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const fullScreen = useMediaQuery((t) => t.breakpoints.down('sm'))
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [country, setCountry] = useState('')
  const [query, setQuery] = useState({}) // submitted search; empty = most listened stations
  const [adding, setAdding] = useState({}) // id -> 'busy' | 'done'

  const { data: countries = [] } = useQuery({ queryKey: ['radioCountries'], queryFn: getRadioCountries, enabled: open, staleTime: Infinity })
  const results = useQuery({ queryKey: ['radioDirectory', query], queryFn: () => searchRadioDirectory(query), enabled: open, staleTime: 5 * 60_000 })
  const known = new Set(existing.map((r) => r.streamUrl))

  const search = (e) => {
    e?.preventDefault()
    setQuery({ name: name.trim(), tag: tag.trim(), country })
  }

  const add = async (s) => {
    setAdding((a) => ({ ...a, [s.id]: 'busy' }))
    try {
      const id = await createRadio({ name: s.name, streamUrl: s.url, homePageUrl: s.homepage || '' })
      if (s.favicon) await setRadioLogoFromUrl(id, s.favicon).catch(() => {}) // .ico and broken logos are skipped
      setAdding((a) => ({ ...a, [s.id]: 'done' }))
      qc.invalidateQueries({ queryKey: ['radios'] })
    } catch (err) {
      setAdding((a) => ({ ...a, [s.id]: undefined }))
      notify(`Could not add ${s.name}: ${err.message}`)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
      <DialogTitle>Find stations</DialogTitle>
      <DialogContent>
        <Box component="form" onSubmit={search} sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '2fr 1.2fr 1.4fr auto' }, alignItems: 'center', pt: 1, mb: 2 }}>
          <TextField
            size="small" label="Station name" value={name} onChange={(e) => setName(e.target.value)} autoFocus
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> }}
          />
          <TextField size="small" label="Genre" placeholder="jazz, news..." value={tag} onChange={(e) => setTag(e.target.value)} />
          <TextField size="small" select label="Country" value={country} onChange={(e) => setCountry(e.target.value)}>
            <MenuItem value="">All countries</MenuItem>
            {countries.map((c) => <MenuItem key={c.code} value={c.code}>{c.name} ({c.stations})</MenuItem>)}
          </TextField>
          <Button type="submit" variant="contained">Search</Button>
        </Box>
        {!query.name && !query.tag && !query.country && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Most listened stations. Search by name, genre or country.</Typography>
        )}
        {results.isFetching && <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>}
        {results.isError && <Alert severity="error">The directory could not be reached: {results.error.message}</Alert>}
        {results.isSuccess && !results.isFetching && !results.data.length && <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No station found.</Typography>}
        {results.isSuccess && !results.isFetching && (
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {results.data.map((s) => {
              const state = known.has(s.url) ? 'done' : adding[s.id]
              const facts = [s.country, s.codec && `${s.codec}${s.bitrate ? ` ${s.bitrate} kbps` : ''}`, s.hls && 'HLS'].filter(Boolean).join(', ')
              return (
                <Box component="li" key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1, px: 1, borderRadius: 3, '&:hover': { bgcolor: 'action.hover' } }}>
                  <Logo src={s.favicon} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>{s.name}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>{facts}</Typography>
                    {s.tags?.length > 0 && (
                      <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                        {s.tags.slice(0, 4).map((t) => <Chip key={t} label={t} size="small" variant="outlined" onClick={() => { setTag(t); setQuery({ ...query, tag: t }) }} />)}
                      </Box>
                    )}
                  </Box>
                  <Button
                    onClick={() => add(s)}
                    disabled={!!state}
                    startIcon={state === 'done' ? <CheckRounded /> : state === 'busy' ? <CircularProgress size={16} /> : <AddRounded />}
                    sx={{ flexShrink: 0 }}
                  >
                    {state === 'done' ? 'Added' : 'Add'}
                  </Button>
                </Box>
              )
            })}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, pl: 2 }}>Directory: radio-browser.info</Typography>
        <Button onClick={onClose} variant="contained">Done</Button>
      </DialogActions>
    </Dialog>
  )
}
