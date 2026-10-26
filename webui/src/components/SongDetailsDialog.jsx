// Cisum web player v0.11.8 - Song details: file, audio properties and listening data of one song.
// Opened from the song menu ("...") and from the now playing view. Empty values are hidden.
import { Fragment } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, IconButton, Tooltip, Rating,
  CircularProgress, Alert,
} from '@mui/material'
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded'
import { useQuery } from '@tanstack/react-query'
import { getSongDetails } from '../api/library'
import { useUi } from '../store/ui'
import { formatTime, formatBytes, formatDate } from '../utils/format'

const CHANNELS = { 1: 'Mono', 2: 'Stereo' }
const gain = (g, peak) => (g == null ? null : `${g > 0 ? '+' : ''}${g.toFixed(2)} dB${peak != null ? ` (peak ${peak.toFixed(3)})` : ''}`)
const dateOrNull = (v) => (formatDate(v) === '-' ? null : formatDate(v))

/** Full path on the server: library folder + path inside the library. */
function fullPath(s) {
  if (!s.libraryPath) return s.path
  return `${s.libraryPath.replace(/[\\/]+$/, '')}/${s.path}`
}

/** Sections of [label, value] rows; rows without a value are dropped. */
function sections(s) {
  const format = (s.suffix || '').toUpperCase()
  const codec = s.codec && s.codec.toUpperCase() !== format ? ` (${s.codec})` : ''
  return [
    ['File', [
      ['Path', fullPath(s), { copy: true }],
      ['Library', s.libraryName],
      ['Format', format ? format + codec : s.codec],
      ['Size', s.size ? formatBytes(s.size) : null],
      ['Added', dateOrNull(s.createdAt)],
      ['Modified', dateOrNull(s.updatedAt)],
    ]],
    ['Audio', [
      ['Duration', s.duration ? formatTime(s.duration) : null],
      ['Bitrate', s.bitRate ? `${s.bitRate} kbps` : null],
      ['Sample rate', s.sampleRate ? `${(s.sampleRate / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kHz` : null],
      ['Bit depth', s.bitDepth ? `${s.bitDepth} bit` : null],
      ['Channels', s.channels ? CHANNELS[s.channels] || `${s.channels} channels` : null],
      ['ReplayGain track', gain(s.rgTrackGain, s.rgTrackPeak)],
      ['ReplayGain album', gain(s.rgAlbumGain, s.rgAlbumPeak)],
    ]],
    ['Listening', [
      ['Plays', String(s.playCount || 0)],
      ['Last played', dateOrNull(s.playDate)],
      ['Rating', s.rating ? <Rating value={s.rating} readOnly size="small" /> : null],
      ['Favorite', s.starred ? (dateOrNull(s.starredAt) ? `Yes, since ${dateOrNull(s.starredAt)}` : 'Yes') : 'No'],
    ]],
  ].map(([title, rows]) => [title, rows.filter(([, value]) => value != null && value !== '')])
}

/** track: any normalized Track (only id and title are used). */
export default function SongDetailsDialog({ track, onClose }) {
  const notify = useUi((s) => s.notify)
  const { data, error, isLoading } = useQuery({
    queryKey: ['songDetails', track.id],
    queryFn: () => getSongDetails(track.id),
    staleTime: 0,
  })

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      notify('Path copied')
    } catch {
      /* the path stays selectable in the dialog */
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 0.5 }}>
        {track.title}
        {track.artist && <Typography variant="body2" color="text.secondary">{track.artist}</Typography>}
      </DialogTitle>
      <DialogContent>
        {isLoading && <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}><CircularProgress /></Box>}
        {error && <Alert severity="error">{error.message}</Alert>}
        {data && sections(data).map(([title, rows]) => rows.length > 0 && (
          <Box key={title} component="section" sx={{ mt: 2 }}>
            <Typography variant="overline" color="primary" component="h3">{title}</Typography>
            <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '150px minmax(0, 1fr)' }, columnGap: 2, rowGap: { xs: 0, sm: 0.75 }, m: 0 }}>
              {rows.map(([label, value, opts]) => (
                <Fragment key={label}>
                  <Typography component="dt" variant="body2" color="text.secondary" sx={{ mt: { xs: 1, sm: 0 } }}>{label}</Typography>
                  <Typography component="dd" variant="body2" sx={{ m: 0, display: 'flex', alignItems: 'flex-start', gap: 0.5, minWidth: 0 }}>
                    <Box component="span" sx={{ overflowWrap: 'anywhere', userSelect: 'text', flex: 1, minWidth: 0 }}>{value}</Box>
                    {opts?.copy && (
                      <Tooltip title="Copy path">
                        <IconButton size="small" onClick={() => copy(value)} aria-label="Copy path" sx={{ mt: -0.75 }}>
                          <ContentCopyRounded fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Typography>
                </Fragment>
              ))}
            </Box>
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
