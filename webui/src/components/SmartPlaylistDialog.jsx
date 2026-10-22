// Cisum web player v0.10.0 - Dynamic playlist editor: templates, rules (all / any), sort, limit,
// live preview, and a JSON mode for rules the simple editor cannot show (nested groups from .nsp files).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded'
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded'
import DataObjectRounded from '@mui/icons-material/DataObjectRounded'
import TuneRounded from '@mui/icons-material/TuneRounded'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSmartPlaylist, getPlaylists, getSmartFields, getSmartValues, previewSmartPlaylist, updatePlaylist,
} from '../api/library'
import {
  buildFields, changeField, emptyModel, findField, fromCriteria, hasSuggestions, newRule, operatorsFor, OPERATORS,
  PERIOD_UNITS, ruleError, TEMPLATES, toCriteria,
} from '../utils/smartRules'
import { formatLength, formatTime, plural } from '../utils/format'
import { useUi } from '../store/ui'

const PREVIEW_SIZE = 50

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ---------- Field and value inputs ----------

function FieldPicker({ fields, value, onChange, label = 'Field', sx }) {
  const field = findField(fields, value)
  return (
    <Autocomplete
      size="small"
      disableClearable
      options={fields}
      groupBy={(f) => f.group}
      value={field}
      getOptionLabel={(f) => f.label}
      isOptionEqualToValue={(a, b) => a.name === b.name}
      onChange={(_, f) => f && onChange(f)}
      renderInput={(params) => <TextField {...params} label={label} />}
      sx={{ minWidth: 190, ...sx }}
    />
  )
}

function SuggestInput({ field, value, onChange, label }) {
  const q = useDebounced(value, 250)
  const { data: options = [] } = useQuery({
    queryKey: ['smartValues', field.name, q],
    queryFn: () => getSmartValues(field.name, q),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
  return (
    <Autocomplete
      size="small"
      freeSolo
      options={options}
      filterOptions={(x) => x}
      inputValue={value}
      onInputChange={(_, v) => onChange(v)}
      renderInput={(params) => <TextField {...params} label={label} />}
      sx={{ flex: 1, minWidth: 160 }}
    />
  )
}

function ValueInput({ rule, field, value, onChange, label, playlists }) {
  if (field.type === 'playlist') {
    return (
      <TextField select size="small" label="Playlist" value={value} onChange={(e) => onChange(e.target.value)} sx={{ flex: 1, minWidth: 160 }}>
        {playlists.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
      </TextField>
    )
  }
  if (field.type === 'date' && !['inTheLast', 'notInTheLast'].includes(rule.op)) {
    return (
      <TextField
        size="small" type="date" label={label} value={value} onChange={(e) => onChange(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1, minWidth: 150 }}
      />
    )
  }
  if (['number', 'rating', 'duration', 'date'].includes(field.type)) {
    const max = field.type === 'rating' ? 5 : undefined
    return (
      <TextField
        size="small" type="number" label={field.type === 'duration' ? `${label} (min)` : label} value={value}
        onChange={(e) => onChange(e.target.value)}
        slotProps={{ htmlInput: { min: 0, max, step: 'any' } }} sx={{ flex: 1, minWidth: 100 }}
      />
    )
  }
  if (hasSuggestions(field)) return <SuggestInput field={field} value={value} onChange={onChange} label={label} />
  return <TextField size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ flex: 1, minWidth: 160 }} />
}

function RuleRow({ rule, fields, playlists, onChange, onRemove, canRemove, showError }) {
  const field = findField(fields, rule.field)
  const op = OPERATORS[rule.op]
  const error = showError ? ruleError(rule, fields) : null
  const set = (patch) => onChange({ ...rule, ...patch })
  const period = rule.op === 'inTheLast' || rule.op === 'notInTheLast'
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1, py: 1 }}>
      <FieldPicker fields={fields} value={rule.field} onChange={(f) => onChange(changeField(rule, f))} sx={{ flex: '1 1 190px' }} />
      <TextField
        select size="small" label="Condition" value={rule.op} onChange={(e) => set({ op: e.target.value, value2: '' })}
        sx={{ flex: '0 1 170px', minWidth: 140 }}
      >
        {operatorsFor(field).map((o) => <MenuItem key={o} value={o}>{OPERATORS[o].label}</MenuItem>)}
      </TextField>
      {op.arity >= 1 && (
        <ValueInput rule={rule} field={field} value={rule.value} onChange={(v) => set({ value: v })} label={op.arity === 2 ? 'From' : 'Value'} playlists={playlists} />
      )}
      {op.arity === 2 && <ValueInput rule={rule} field={field} value={rule.value2} onChange={(v) => set({ value2: v })} label="To" playlists={playlists} />}
      {period && (
        <TextField select size="small" label="Unit" value={rule.unit} onChange={(e) => set({ unit: e.target.value })} sx={{ width: 110 }}>
          {PERIOD_UNITS.map((u) => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
        </TextField>
      )}
      <Tooltip title="Remove rule" describeChild>
        <span>
          <IconButton aria-label="Remove rule" onClick={onRemove} disabled={!canRemove} sx={{ mt: 0.25 }}>
            <CloseRounded fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      {error && <Typography variant="caption" color="error" sx={{ width: '100%', mt: -0.5 }}>{error}</Typography>}
    </Box>
  )
}

// ---------- Sort and limit ----------

function SortEditor({ fields, sort, onChange }) {
  const random = sort === 'random'
  const keys = random ? [] : sort
  const sortFields = useMemo(() => fields.filter((f) => f.type !== 'playlist'), [fields])
  const setKey = (i, patch) => onChange(keys.map((k, j) => (j === i ? { ...k, ...patch } : k)))
  return (
    <Box>
      <TextField
        select size="small" label="Order" value={random ? 'random' : 'custom'} sx={{ minWidth: 190 }}
        onChange={(e) => onChange(e.target.value === 'random' ? 'random' : [{ field: 'title', desc: false }])}
      >
        <MenuItem value="random">Random (new mix each time)</MenuItem>
        <MenuItem value="custom">Sorted by fields</MenuItem>
      </TextField>
      {keys.map((k, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <FieldPicker fields={sortFields} value={k.field} label={i ? 'Then by' : 'Sort by'} onChange={(f) => setKey(i, { field: f.name })} sx={{ flex: 1 }} />
          <Tooltip title={k.desc ? 'Descending' : 'Ascending'}>
            <IconButton aria-label={k.desc ? 'Descending, switch to ascending' : 'Ascending, switch to descending'} onClick={() => setKey(i, { desc: !k.desc })}>
              {k.desc ? <ArrowDownwardRounded /> : <ArrowUpwardRounded />}
            </IconButton>
          </Tooltip>
          <IconButton aria-label="Remove sort field" disabled={keys.length === 1} onClick={() => onChange(keys.filter((_, j) => j !== i))}>
            <CloseRounded fontSize="small" />
          </IconButton>
        </Box>
      ))}
      {!random && keys.length < 3 && (
        <Button size="small" startIcon={<AddRounded />} sx={{ mt: 0.5 }} onClick={() => onChange([...keys, { field: 'title', desc: false }])}>
          Add sort field
        </Button>
      )}
    </Box>
  )
}

function LimitEditor({ model, onChange }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      <TextField select size="small" label="Limit" value={model.limitType} onChange={(e) => onChange({ limitType: e.target.value })} sx={{ minWidth: 190 }}>
        <MenuItem value="none">No limit</MenuItem>
        <MenuItem value="songs">Number of songs</MenuItem>
        <MenuItem value="percent">Percent of matching songs</MenuItem>
      </TextField>
      {model.limitType !== 'none' && (
        <TextField
          size="small" type="number" label={model.limitType === 'percent' ? 'Percent' : 'Songs'} value={model.limit}
          onChange={(e) => onChange({ limit: e.target.value })}
          slotProps={{ htmlInput: { min: 1, max: model.limitType === 'percent' ? 100 : undefined } }} sx={{ width: 120 }}
        />
      )}
    </Box>
  )
}

// ---------- Preview ----------

function Preview({ rules, valid }) {
  const { m3 } = useTheme()
  const key = useDebounced(valid ? JSON.stringify(rules) : null, 500)
  const { data, error, isFetching } = useQuery({
    queryKey: ['smartPreview', key],
    queryFn: () => previewSmartPlaylist(JSON.parse(key), PREVIEW_SIZE),
    enabled: !!key,
    retry: false,
    staleTime: 0,
    placeholderData: keepPreviousData,
  })
  const duration = (data?.songs || []).reduce((s, t) => s + t.duration, 0)
  return (
    <Box sx={{ bgcolor: m3.surfaceContainer, borderRadius: 4, p: 2, minHeight: 200, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 700 }}>
          {!valid ? 'Preview' : data ? plural(data.count, 'song') : 'Preview'}
        </Typography>
        {isFetching && <CircularProgress size={18} />}
      </Box>
      {!valid && <Typography variant="body2" color="text.secondary">Complete at least one rule to see the matching songs.</Typography>}
      {valid && error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error.message}</Alert>}
      {valid && data && !error && (
        <>
          {data.count > data.songs.length && (
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
              First {data.songs.length} songs ({formatLength(duration)}).
            </Typography>
          )}
          {!data.count && <Typography variant="body2" color="text.secondary">No song matches these rules.</Typography>}
          <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, overflowY: 'auto', maxHeight: { xs: 320, md: 460 } }}>
            {data.songs.map((t, i) => (
              <Box component="li" key={`${t.id}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, opacity: t.missing ? 0.5 : 1 }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{t.title}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap component="div">{[t.artist, t.album].filter(Boolean).join(', ')}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">{formatTime(t.duration)}</Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  )
}

// ---------- Dialog ----------

/**
 * Creates (no playlist) or edits (playlist with rules) a dynamic playlist.
 * Rules are evaluated by the server each time the playlist is opened.
 */
export default function SmartPlaylistDialog({ open, onClose, playlist }) {
  const theme = useTheme()
  const fullScreen = !useMediaQuery(theme.breakpoints.up('md'))
  const navigate = useNavigate()
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const editing = !!playlist

  const { data: serverFields, isError: fieldsError } = useQuery({ queryKey: ['smartFields'], queryFn: getSmartFields, staleTime: Infinity, enabled: open })
  const { data: allPlaylists = [] } = useQuery({ queryKey: ['playlists'], queryFn: getPlaylists, enabled: open })
  const fields = useMemo(() => (serverFields ? buildFields(serverFields) : null), [serverFields])
  const playlists = allPlaylists.filter((p) => p.id !== playlist?.id)

  const [name, setName] = useState(playlist?.name || '')
  const [comment, setComment] = useState(playlist?.comment || '')
  const [model, setModel] = useState(null)
  const [json, setJson] = useState(null) // string while in JSON mode
  const [template, setTemplate] = useState(null)
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)

  // Initial state, once the field catalog is known
  useEffect(() => {
    if (!fields || model || json !== null) return
    if (editing) {
      const m = fromCriteria(playlist.rules, fields)
      if (m) setModel(m)
      else setJson(JSON.stringify(playlist.rules, null, 2))
    } else {
      setModel(emptyModel(fields))
    }
  }, [fields, model, json, editing, playlist])

  const jsonRules = useMemo(() => {
    if (json === null) return null
    try {
      return JSON.parse(json)
    } catch {
      return undefined
    }
  }, [json])
  const rules = json !== null ? jsonRules : model && fields ? toCriteria(model, fields) : null
  const ruleCount = rules ? (rules.all || rules.any || []).length : 0
  const valid = json !== null ? !!rules && typeof rules === 'object' : ruleCount > 0

  const update = (patch) => setModel((m) => ({ ...m, ...patch }))
  const setRule = (key, rule) => update({ rules: model.rules.map((r) => (r.key === key ? rule : r)) })

  const applyTemplate = (t) => {
    const m = fromCriteria(t.rules, fields)
    if (!m) return
    setJson(null)
    setModel(m)
    if (!name.trim() || TEMPLATES.some((x) => x.name === name)) setName(t.name)
    setTemplate(t.id)
  }

  const toggleJson = () => {
    if (json === null) {
      setJson(JSON.stringify(rules, null, 2))
      return
    }
    const m = jsonRules ? fromCriteria(jsonRules, fields) : null
    if (!m) {
      notify('These rules cannot be shown in the simple editor (nested groups or advanced options). Keep editing them as JSON.')
      return
    }
    setModel(m)
    setJson(null)
  }

  const save = async (e) => {
    e.preventDefault()
    setShowErrors(true)
    if (!name.trim()) return
    if (json === null && model.rules.some((r) => ruleError(r, fields))) return
    if (!valid) {
      notify(json !== null ? 'The JSON is not valid' : 'Add at least one complete rule')
      return
    }
    setSaving(true)
    try {
      // Validate on the server first: unknown fields or bad values are only detected when evaluating
      await previewSmartPlaylist(rules, 1)
      if (editing) {
        await updatePlaylist(playlist.id, { name: name.trim(), comment, rules })
        qc.invalidateQueries({ queryKey: ['playlist', playlist.id] })
        qc.invalidateQueries({ queryKey: ['playlists'] })
        notify('Dynamic playlist saved')
        onClose()
      } else {
        const p = await createSmartPlaylist({ name: name.trim(), comment, rules })
        qc.invalidateQueries({ queryKey: ['playlists'] })
        onClose()
        navigate(`/playlists/${p.id}`)
      }
    } catch (err) {
      notify(err.message)
    } finally {
      setSaving(false)
    }
  }

  const loading = !fields || (!model && json === null)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="lg"
      PaperProps={{ component: 'form', onSubmit: save, noValidate: true }}
    >
      <DialogTitle>{editing ? 'Edit dynamic playlist' : 'New dynamic playlist'}</DialogTitle>
      <DialogContent dividers>
        {fieldsError && <Alert severity="error">The list of criteria could not be loaded from the server.</Alert>}
        {!fieldsError && loading && <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress /></Box>}
        {!loading && (
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 3fr) minmax(0, 2fr)' }, alignItems: 'start' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              {playlist?.path && (
                <Alert severity="warning" sx={{ borderRadius: 3 }}>
                  This playlist comes from a .nsp file in the library ({playlist.path}). The file's rules replace your changes at the next library scan.
                </Alert>
              )}
              {!editing && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Start from a template</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {TEMPLATES.map((t) => (
                      <Tooltip key={t.id} title={t.description} describeChild>
                        <Chip label={t.name} onClick={() => applyTemplate(t)} color={template === t.id ? 'primary' : 'default'} variant={template === t.id ? 'filled' : 'outlined'} />
                      </Tooltip>
                    ))}
                  </Box>
                </Box>
              )}
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <TextField
                  label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus={!editing}
                  error={showErrors && !name.trim()} helperText={showErrors && !name.trim() ? 'Enter a name' : undefined}
                  sx={{ flex: '1 1 220px' }}
                />
                <TextField label="Description" value={comment} onChange={(e) => setComment(e.target.value)} sx={{ flex: '2 1 260px' }} />
              </Box>

              {json === null ? (
                <>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="subtitle2">Songs that match</Typography>
                      <ToggleButtonGroup size="small" exclusive value={model.match} onChange={(_, v) => v && update({ match: v })} aria-label="Match">
                        <ToggleButton value="all">all rules</ToggleButton>
                        <ToggleButton value="any">any rule</ToggleButton>
                      </ToggleButtonGroup>
                    </Box>
                    {model.rules.map((r) => (
                      <RuleRow
                        key={r.key}
                        rule={r}
                        fields={fields}
                        playlists={playlists}
                        showError={showErrors}
                        canRemove={model.rules.length > 1}
                        onChange={(rule) => setRule(r.key, rule)}
                        onRemove={() => update({ rules: model.rules.filter((x) => x.key !== r.key) })}
                      />
                    ))}
                    <Button startIcon={<AddRounded />} onClick={() => update({ rules: [...model.rules, newRule(fields, model.rules.at(-1)?.field)] })}>
                      Add rule
                    </Button>
                  </Box>
                  <SortEditor fields={fields} sort={model.sort} onChange={(sort) => update({ sort })} />
                  <LimitEditor model={model} onChange={update} />
                </>
              ) : (
                <TextField
                  label="Rules (JSON, same format as .nsp files)"
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  multiline
                  minRows={12}
                  error={jsonRules === undefined}
                  helperText={jsonRules === undefined ? 'Invalid JSON' : 'Groups can be nested: {"all": [{"any": [...]}, ...]}'}
                  slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'monospace', fontSize: '0.85rem' } } }}
                />
              )}
              <Typography variant="body2" color="text.secondary">
                The playlist is rebuilt from these rules each time it is opened.
              </Typography>
            </Box>
            <Preview rules={rules} valid={valid} />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: { xs: 2, md: 3 } }}>
        <Button
          startIcon={json === null ? <DataObjectRounded /> : <TuneRounded />}
          onClick={toggleJson}
          disabled={loading}
          sx={{ mr: 'auto' }}
        >
          {json === null ? (fullScreen ? 'JSON' : 'Edit as JSON') : (fullScreen ? 'Simple' : 'Simple editor')}
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={loading || saving}>
          {saving ? 'Saving...' : editing ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
