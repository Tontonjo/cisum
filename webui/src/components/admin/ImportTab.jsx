// Cisum web player v0.5.0 - Administration: import playlists, favorites, ratings and play counts
// from another Subsonic-compatible server (Navidrome, Cisum, Airsonic, Gonic...).
import { useState } from 'react'
import {
  Box, Button, Checkbox, FormControlLabel, FormGroup, MenuItem, TextField, Typography, Alert,
} from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getUsers, testImportSource, startImport, getImportStatus } from '../../api/admin'
import { formatDate } from '../../utils/format'
import { Panel, TaskProgress } from './Panel'

const DATA = [
  ['playlists', 'Playlists', 'Copied as new playlists of the chosen user.'],
  ['favorites', 'Favorites', 'Songs, albums and artists.'],
  ['ratings', 'Ratings', 'Stars on songs, albums and artists.'],
  ['playCounts', 'Play counts', 'The highest count is kept, so importing twice never doubles them.'],
]

const CATEGORY_LABELS = { playlists: 'Playlists', favorites: 'Favorites', ratings: 'Ratings', playCounts: 'Play counts' }

function Report({ report }) {
  if (!report || report.status === 'idle') return null
  return (
    <Panel title="Last import" description={`From ${report.server || '?'} to ${report.targetUser}, started ${formatDate(report.startedAt)}`}>
      {report.status === 'running' && <TaskProgress label={report.step || 'Working...'} value={report.progress} />}
      {report.status === 'failed' && <Alert severity="error">{report.error}</Alert>}
      {report.status === 'done' && <Alert severity="success" sx={{ mb: 2 }}>Import finished {formatDate(report.finishedAt)}.</Alert>}
      {Object.entries(report.categories || {}).map(([key, c]) => (
        <Box key={key} sx={{ mb: 2 }}>
          <Typography variant="subtitle1">{CATEGORY_LABELS[key] || key}: {c.imported} of {c.total} imported</Typography>
          {c.notes?.map((n) => <Typography key={n} variant="body2" color="text.secondary">{n}</Typography>)}
          {c.unmatched?.length > 0 && (
            <Box component="details" sx={{ mt: 0.5 }}>
              <Typography component="summary" variant="body2" sx={{ cursor: 'pointer', fontWeight: 600 }}>
                {c.total - c.imported} not found in this library
              </Typography>
              {c.unmatched.map((u) => <Typography key={u} variant="body2" color="text.secondary">{u}</Typography>)}
            </Box>
          )}
        </Box>
      ))}
    </Panel>
  )
}

export default function ImportTab() {
  const qc = useQueryClient()
  const [source, setSource] = useState({ url: '', username: '', password: '' })
  const [target, setTarget] = useState('')
  const [what, setWhat] = useState({ playlists: true, favorites: true, ratings: true, playCounts: true })
  const [test, setTest] = useState(null) // { ok, message }
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const { data: users = [] } = useQuery({ queryKey: ['adminUsers'], queryFn: getUsers })
  const { data: report } = useQuery({
    queryKey: ['importStatus'],
    queryFn: getImportStatus,
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 1000 : false),
  })
  const running = report?.status === 'running'
  const setSrc = (k) => (e) => {
    setSource({ ...source, [k]: e.target.value })
    setTest(null)
  }

  const runTest = async () => {
    setBusy(true)
    try {
      const { server } = await testImportSource(source)
      setTest({ ok: true, message: `Connected: ${server}` })
    } catch (e) {
      setTest({ ok: false, message: e.message })
    } finally {
      setBusy(false)
    }
  }

  const start = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await startImport({ source, targetUserId: target, ...what })
      qc.invalidateQueries({ queryKey: ['importStatus'] })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Panel
        title="Import from another server"
        description="Copies the data of one account on another Subsonic-compatible server (Navidrome, Cisum, Airsonic, Gonic...) to a user here. Songs are matched by MusicBrainz ID, file path, then artist, title, album and duration. Nothing is changed on the other server."
      >
        <Box component="form" onSubmit={start} sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 640 }}>
          <TextField label="Server address" placeholder="https://music.example.com" value={source.url} onChange={setSrc('url')} required />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField label="Username on that server" value={source.username} onChange={setSrc('username')} required autoComplete="off" />
            <TextField label="Password" type="password" value={source.password} onChange={setSrc('password')} required autoComplete="new-password" />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button variant="outlined" onClick={runTest} disabled={busy || !source.url || !source.username}>Test connection</Button>
            {test && <Typography variant="body2" color={test.ok ? 'success.main' : 'error.main'}>{test.message}</Typography>}
          </Box>
          <TextField select label="Import into this Cisum user" value={target} onChange={(e) => setTarget(e.target.value)} required>
            {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.name || u.userName} ({u.userName})</MenuItem>)}
          </TextField>
          <FormGroup>
            {DATA.map(([key, label, help]) => (
              <FormControlLabel
                key={key}
                control={<Checkbox checked={what[key]} onChange={(e) => setWhat({ ...what, [key]: e.target.checked })} />}
                label={<Box><Typography variant="body1">{label}</Typography><Typography variant="caption" color="text.secondary">{help}</Typography></Box>}
                sx={{ alignItems: 'flex-start', '& .MuiCheckbox-root': { pt: 0.5 } }}
              />
            ))}
          </FormGroup>
          {error && <Alert severity="error">{error}</Alert>}
          <Box>
            <Button type="submit" variant="contained" disabled={busy || running || !Object.values(what).some(Boolean)}>
              {running ? 'Import running...' : 'Start import'}
            </Button>
          </Box>
        </Box>
      </Panel>
      <Report report={report} />
    </>
  )
}
