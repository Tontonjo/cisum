// Cisum web player v0.11.3 - Administration: database, backups, caches (image cache size) and missing files.
import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, LinearProgress, TextField, Typography, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getStatus, runMaintenance, getMissingFiles, getMaintenanceStatus, setImageCacheSize } from '../../api/admin'
import { useUi } from '../../store/ui'
import { formatBytes, formatDate } from '../../utils/format'
import { Panel, InfoList, TaskProgress } from './Panel'

const ACTION_LABELS = {
  backup: 'Backing up the database',
  optimize: 'Optimizing the database',
  vacuum: 'Compacting the database',
  'purge-missing': 'Removing missing files',
  'clear-waveforms': 'Clearing waveforms',
  'clear-lyrics': 'Clearing online lyrics',
}

const CACHE_LABELS = {
  waveforms: ['Waveforms', 'clear-waveforms'],
  lyrics: ['Online lyrics', 'clear-lyrics'],
  images: ['Resized images', null],
  transcoding: ['Transcoded audio', null],
}

/** Size limit of the resized images cache, in MB. 0 = unlimited. Applied at once by the server. */
function ImageCacheSize({ info }) {
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const current = info.unlimited ? 0 : info.mb
  const [value, setValue] = useState(String(current))
  const [saving, setSaving] = useState(false)
  useEffect(() => setValue(String(current)), [current])

  const mb = Number(value)
  const valid = value.trim() !== '' && Number.isInteger(mb) && (mb === 0 || mb >= info.minMB)
  const save = async () => {
    setSaving(true)
    try {
      const res = await setImageCacheSize(mb)
      qc.setQueryData(['adminStatus'], (s) => (s ? { ...s, imageCache: res } : s))
      notify(res.restartRequired ? 'Saved, applied after a restart' : 'Image cache size changed')
    } catch (e) {
      notify(`Failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const effective = info.disabled ? 'disabled' : info.unlimited ? 'unlimited' : `${info.mb} MB`
  const origin = info.fromEnv ? `set by the ${info.envVar} variable`
    : info.fromAdmin ? 'set here' : `from the configuration (${info.configValue || 'default'})`
  return (
    <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
      <Typography variant="body1" sx={{ fontWeight: 550 }}>Resized images size limit</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Current: {effective}, {origin}.
        {info.unlimited ? ' Nothing is removed.' : ' The least recently used images are removed every 10 minutes when the limit is exceeded.'}
        {info.fromAdmin && ` This value replaces the configuration file one; a ${info.envVar} variable would replace it.`}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <TextField
          size="small" type="number" label="Size (MB)" value={value} onChange={(e) => setValue(e.target.value)}
          disabled={info.fromEnv} error={!valid} helperText={valid ? '0 = unlimited' : `0 (unlimited) or at least ${info.minMB} MB`}
          inputProps={{ min: 0, step: 100 }} sx={{ width: 180 }}
        />
        <Button variant="outlined" onClick={save} disabled={info.fromEnv || !valid || saving || mb === current} sx={{ mt: 0.25 }}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Box>
      {info.fromEnv && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          The size is fixed by the {info.envVar} environment variable. Remove it from the container and restart Cisum to manage it here.
        </Alert>
      )}
      {!info.fromEnv && mb === 0 && valid && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          Unlimited: nothing is ever removed. The folder grows with the library and with every image size requested
          by apps, and keeps old versions after a cover or format change. Check the disk space from time to time.
        </Alert>
      )}
      {info.restartRequired && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>The image cache was disabled at startup: restart Cisum to apply the new size.</Alert>
      )}
    </Box>
  )
}

export default function MaintenanceTab() {
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const [confirmPurge, setConfirmPurge] = useState(false)
  const { data: task } = useQuery({
    queryKey: ['maintenanceTask'],
    queryFn: getMaintenanceStatus,
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 500 : false),
  })
  const busy = task?.status === 'running' ? task.action : null

  // When a task ends: show its result and refresh the figures
  const lastStatus = useRef(task?.status)
  useEffect(() => {
    if (lastStatus.current === 'running' && task?.status !== 'running') {
      notify(task?.status === 'failed' ? `Failed: ${task.error}` : task?.message)
      qc.invalidateQueries({ queryKey: ['adminStatus'] })
      qc.invalidateQueries({ queryKey: ['adminMissing'] })
    }
    lastStatus.current = task?.status
  }, [task, notify, qc])
  const { data: s } = useQuery({ queryKey: ['adminStatus'], queryFn: getStatus })
  const { data: missing } = useQuery({ queryKey: ['adminMissing'], queryFn: () => getMissingFiles(0, 100) })

  const run = async (action) => {
    try {
      const state = await runMaintenance(action)
      qc.setQueryData(['maintenanceTask'], state)
    } catch (e) {
      notify(`Failed: ${e.message}`)
    }
  }

  if (!s) return <LinearProgress />
  const btn = (action, label, variant = 'outlined') => (
    <Button variant={variant} onClick={() => run(action)} disabled={!!busy}>{busy === action ? 'Working...' : label}</Button>
  )

  return (
    <>
      {busy && (
        <Panel title="Task in progress">
          <TaskProgress label={ACTION_LABELS[busy] || busy} value={task.progress} />
        </Panel>
      )}
      <Panel title="Database" description="Back up before big changes. Optimizing refreshes query statistics; compacting reclaims free space (can take a minute on big libraries).">
        <InfoList items={[['Size', formatBytes(s.database.bytes)], ['Location', s.database.path], ['Backups folder', s.backupDir],
          ['Automatic backups', s.features.backupSchedule ? `${s.features.backupSchedule}, keep ${s.features.backupCount}` : 'off (CISUM_BACKUP_SCHEDULE and CISUM_BACKUP_COUNT)']]} />
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
          {btn('backup', 'Back up now', 'contained')}
          {btn('optimize', 'Optimize')}
          {btn('vacuum', 'Compact')}
        </Box>
        {s.backups?.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Existing backups</Typography>
            {s.backups.slice(0, 10).map((b) => (
              <Typography key={b.name} variant="body2" color="text.secondary">{formatDate(b.date)}, {formatBytes(b.bytes)}, {b.name}</Typography>
            ))}
          </Box>
        )}
      </Panel>

      <Panel title="Caches" description="Caches are rebuilt automatically when needed. Clearing one frees disk space or forces fresh data.">
        {(s.cache || []).filter((c) => CACHE_LABELS[c.name]).map((c) => (
          <Box key={c.name} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 0.75 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body1" sx={{ fontWeight: 550 }}>{CACHE_LABELS[c.name][0]}</Typography>
              <Typography variant="body2" color="text.secondary">{formatBytes(c.bytes)}, {c.files} files</Typography>
            </Box>
            {CACHE_LABELS[c.name][1] && btn(CACHE_LABELS[c.name][1], 'Clear')}
          </Box>
        ))}
        {s.imageCache && <ImageCacheSize info={s.imageCache} />}
      </Panel>

      <Panel
        title={`Missing files (${missing?.total ?? 0})`}
        description="Files that disappeared from disk. They come back by themselves if the file is found again, even moved. Removing them keeps the ones used by a playlist."
        actions={missing?.total > 0 && <Button color="error" variant="outlined" onClick={() => setConfirmPurge(true)} disabled={!!busy}>Remove missing files</Button>}
      >
        {missing?.items?.map((m) => (
          <Box key={m.id} sx={{ py: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 550 }}>{m.title} <Typography component="span" variant="body2" color="text.secondary">{m.artist}</Typography></Typography>
            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>{m.path}, missing since {formatDate(m.updatedAt)}</Typography>
          </Box>
        ))}
        {missing?.total > 100 && <Typography variant="body2" color="text.secondary">And {missing.total - 100} more.</Typography>}
      </Panel>

      <Dialog open={confirmPurge} onClose={() => setConfirmPurge(false)}>
        <DialogTitle>Remove missing files?</DialogTitle>
        <DialogContent>Their play counts, ratings and favorites are lost. Files still used by a playlist are kept.</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmPurge(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => { setConfirmPurge(false); run('purge-missing') }}>Remove</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
