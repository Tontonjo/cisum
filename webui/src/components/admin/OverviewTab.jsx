// Cisum web player v0.5.0 - Administration: library statistics, scan, server information.
import { useEffect } from 'react'
import { Box, Button, Chip, LinearProgress, Typography } from '@mui/material'
import RefreshRounded from '@mui/icons-material/RefreshRounded'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getStatus, getScanStatus, startScan } from '../../api/admin'
import { useUi } from '../../store/ui'
import { formatBytes, formatDate, formatLength } from '../../utils/format'
import { Panel, Stat, InfoList, TaskProgress } from './Panel'

function ScanPanel({ libraries, features }) {
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const { data: scan } = useQuery({
    queryKey: ['scanStatus'],
    queryFn: getScanStatus,
    refetchInterval: (q) => (q.state.data?.scanning ? 1500 : 15000),
  })
  const scanning = !!scan?.scanning

  // Refresh statistics when a scan finishes
  useEffect(() => {
    if (!scanning) qc.invalidateQueries({ queryKey: ['adminStatus'] })
  }, [scanning, qc])

  const run = async (full) => {
    try {
      await startScan(full)
      notify(full ? 'Full scan started' : 'Scan started')
      qc.invalidateQueries({ queryKey: ['scanStatus'] })
    } catch (e) {
      notify(e.message)
    }
  }

  const lastScan = libraries?.map((l) => l.lastScanAt).filter(Boolean).sort().pop()
  const knownSongs = (libraries || []).reduce((sum, l) => sum + (l.totalSongs || 0) + (l.totalMissingFiles || 0), 0)
  return (
    <Panel
      title="Library scan"
      description="A scan finds new, changed, moved and missing files. A full scan also re-reads the tags of every file, which takes longer."
      actions={
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" onClick={() => run(false)} disabled={scanning}>Scan now</Button>
          <Button variant="outlined" onClick={() => run(true)} disabled={scanning}>Full scan</Button>
        </Box>
      }
    >
      {scanning ? (
        // Percentage estimated from the number of songs found by the previous scan (none on the first scan)
        <TaskProgress
          label={`Scanning: ${scan.count ?? 0} files checked${scan.folderCount ? ` in ${scan.folderCount} folders` : ''}`}
          value={knownSongs > 0 ? Math.min(99, (100 * (scan.count || 0)) / knownSongs) : null}
        />
      ) : (
        <Typography variant="body2" color="text.secondary">Last scan: {formatDate(scan?.lastScan || lastScan)}</Typography>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {features?.watcher
          ? `Automatic scan: on. Changes in the music folder are picked up ${features.watcherWait} s after they stop.`
          : 'Automatic scan on changes: off (CISUM_SCANNER_WATCHERWAIT).'}
        {features?.scanSchedule ? ` Scheduled scan: ${features.scanSchedule}.` : ''}
      </Typography>
    </Panel>
  )
}

export default function OverviewTab() {
  const { data: s, refetch, isFetching } = useQuery({ queryKey: ['adminStatus'], queryFn: getStatus })
  if (!s) return <LinearProgress />
  const lib = s.library
  const f = s.features
  const feature = (on, label) => <Chip key={label} label={label} color={on ? 'success' : 'default'} variant={on ? 'filled' : 'outlined'} size="small" />

  return (
    <>
      <Panel
        title="Library"
        actions={<Button startIcon={<RefreshRounded />} onClick={() => refetch()} disabled={isFetching}>Refresh</Button>}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 3, md: 5 } }}>
          <Stat value={lib.songs.toLocaleString()} label="songs" />
          <Stat value={lib.albums.toLocaleString()} label="albums" />
          <Stat value={lib.artists.toLocaleString()} label="artists" />
          <Stat value={formatLength(lib.duration)} label="of music" />
          <Stat value={formatBytes(lib.bytes)} label="on disk" />
          <Stat value={s.playlists} label="playlists" />
          <Stat value={s.users} label="users" />
          {lib.missing > 0 && <Stat value={lib.missing} label="missing files" />}
        </Box>
      </Panel>

      <ScanPanel libraries={s.libraries} features={s.features} />

      <Panel title="Server">
        <InfoList
          items={[
            ['Cisum', s.version.cisum],
            ['Based on Navidrome', s.version.navidrome],
            ['FFmpeg', f.ffmpeg ? s.version.ffmpeg || 'available' : 'not found (needed for transcoding and waveforms)'],
            ['Running since', formatDate(s.startedAt)],
            ['Music folder', f.musicFolder],
            ['Data folder', f.dataFolder],
            ['Database', `${formatBytes(s.database.bytes)}, ${s.database.path}`],
            ['Automatic scan', f.scanSchedule || 'off'],
          ]}
        />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
          {feature(f.sharing, 'Public sharing')}
          {feature(f.downloads, 'Downloads')}
          {feature(f.lrclib, 'Online lyrics (LRCLIB)')}
          {feature(f.waveform, 'Waveforms')}
          {feature(f.lastfm, 'Last.fm biographies')}
          {feature(f.deezer, 'Deezer artist images')}
        </Box>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
          These options are set with CISUM_ environment variables in docker-compose.yml.
        </Typography>
      </Panel>
    </>
  )
}
