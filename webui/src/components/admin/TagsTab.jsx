// Cisum web player v0.11.8 - Administration: extra tags usable in dynamic playlist rules.
// MediaMonkey Custom 1-10 are always read (only their label is edited here); free tags are added by name.
// Labels apply at once; new or changed free tags need a restart of Cisum, then a full scan.
import { useEffect, useState } from 'react'
import { Alert, Box, Button, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCisumTags, saveCisumTags, startScan } from '../../api/admin'
import { useUi } from '../../store/ui'
import { Panel } from './Panel'

const LABEL_MAX = 40
const emptyTag = () => ({ name: '', aliases: '', type: '', label: '' })

/** Server tags + labels -> editable rows (aliases as a comma-separated text). */
const toRows = (data) =>
  data.tags.map((t) => ({
    name: t.name,
    aliases: (t.aliases || []).filter((a) => a !== t.name).join(', '),
    type: t.type || '',
    label: data.labels[t.name] || '',
  }))

export default function TagsTab() {
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const { data, error: loadError } = useQuery({ queryKey: ['adminTags'], queryFn: getCisumTags })
  const [labels, setLabels] = useState({})
  const [rows, setRows] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!data) return
    setLabels(data.labels)
    setRows(toRows(data))
  }, [data])

  if (loadError) return <Alert severity="error">{loadError.message}</Alert>
  if (!data) return null

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const save = async () => {
    setError(null)
    setSaving(true)
    const allLabels = { ...labels }
    const tags = rows
      .filter((r) => r.name.trim())
      .map((r) => {
        const name = r.name.trim().toLowerCase()
        allLabels[name] = r.label
        const aliases = r.aliases.split(',').map((a) => a.trim()).filter(Boolean)
        return { name, aliases: aliases.length ? [name, ...aliases] : [], type: r.type }
      })
    try {
      const saved = await saveCisumTags(tags, allLabels)
      qc.setQueryData(['adminTags'], saved)
      qc.invalidateQueries({ queryKey: ['smartFields'] })
      notify(saved.restartRequired ? 'Tags saved. Restart Cisum to load them.' : 'Tags saved')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const fullScan = async () => {
    try {
      await startScan(true)
      notify('Full scan started')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      {data.restartRequired && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          The free tags changed since Cisum started. Restart Cisum to load them, then run a full scan to read them from the files.
        </Alert>
      )}

      <Panel
        title="MediaMonkey custom fields"
        description="Custom 1 to 10 are always read (MP3: comment Songs-DB_Custom1 to 10; FLAC, M4A and others: CUSTOM1 to 10). Name them as in MediaMonkey to find them easily in the dynamic playlist rules. Names apply at once."
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {data.builtIn.map((t, i) => (
            <TextField
              key={t.name} size="small" label={`Custom ${i + 1}`} placeholder={`Custom ${i + 1}`}
              value={labels[t.name] || ''} onChange={(e) => setLabels({ ...labels, [t.name]: e.target.value })}
              slotProps={{ htmlInput: { maxLength: LABEL_MAX } }}
            />
          ))}
        </Box>
      </Panel>

      <Panel
        title="Free tags"
        description={
          'Any other tag of your files. Name: used in the rules (lowercase letters, digits, _). File tag names: other names to read, '
          + 'separated by commas (the name itself is always read). For a TXXX, Vorbis or MP4 field, use its name (ENERGY); for an MP3 '
          + 'comment with a description, use comment:description (comment:songs-db_energy). Number: compares values as numbers.'
        }
        actions={(
          <Button startIcon={<AddRounded />} onClick={() => setRows([...rows, emptyTag()])} disabled={rows.length >= data.max}>
            Add a tag
          </Button>
        )}
      >
        {rows.length === 0 && <Typography variant="body2" color="text.secondary">No free tag.</Typography>}
        {rows.map((r, i) => {
          const active = data.active.some((a) => a.name === r.name.trim().toLowerCase())
          return (
            <Box key={i} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-start', mb: 2 }}>
              <TextField
                size="small" label="Name" value={r.name} required sx={{ flex: '1 1 140px' }}
                onChange={(e) => setRow(i, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                slotProps={{ htmlInput: { maxLength: 40 } }}
                helperText={r.name && !active ? 'Not loaded yet' : ' '}
              />
              <TextField size="small" label="File tag names" value={r.aliases} onChange={(e) => setRow(i, { aliases: e.target.value })} sx={{ flex: '2 1 220px' }} helperText=" " />
              <TextField select size="small" label="Type" value={r.type} onChange={(e) => setRow(i, { type: e.target.value })} sx={{ width: 120 }} helperText=" ">
                <MenuItem value="">Text</MenuItem>
                <MenuItem value="float">Number</MenuItem>
              </TextField>
              <TextField
                size="small" label="Label" value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} sx={{ flex: '1 1 140px' }}
                slotProps={{ htmlInput: { maxLength: LABEL_MAX } }} helperText=" "
              />
              <Tooltip title="Remove">
                <IconButton aria-label={`Remove tag ${r.name}`} onClick={() => setRows(rows.filter((_, j) => j !== i))} sx={{ mt: 0.25 }}>
                  <DeleteOutlineRounded />
                </IconButton>
              </Tooltip>
            </Box>
          )
        })}
      </Panel>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="contained" onClick={save} disabled={saving}>Save</Button>
        <Button onClick={fullScan}>Start a full scan</Button>
        <Typography variant="body2" color="text.secondary" sx={{ flex: '1 1 260px' }}>
          Tags are read during a full scan: run one after updating Cisum, and after each restart that loads new tags.
        </Typography>
      </Box>
    </>
  )
}
