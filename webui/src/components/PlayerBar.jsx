// Cisum web player v0.7.0 - Persistent player bar (full on desktop, mini player on mobile).
import { Box, IconButton, Slider, Tooltip, Typography, useTheme } from '@mui/material'
import { Link } from 'react-router-dom'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import PauseRounded from '@mui/icons-material/PauseRounded'
import SkipNextRounded from '@mui/icons-material/SkipNextRounded'
import SkipPreviousRounded from '@mui/icons-material/SkipPreviousRounded'
import ShuffleRounded from '@mui/icons-material/ShuffleRounded'
import RepeatRounded from '@mui/icons-material/RepeatRounded'
import RepeatOneRounded from '@mui/icons-material/RepeatOneRounded'
import LyricsRounded from '@mui/icons-material/LyricsRounded'
import QueueMusicRounded from '@mui/icons-material/QueueMusicRounded'
import VolumeUpRounded from '@mui/icons-material/VolumeUpRounded'
import VolumeOffRounded from '@mui/icons-material/VolumeOffRounded'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import Waveform from './Waveform'
import Cover from './Cover'
import StarButton from './StarButton'
import { LyricLine } from './LyricsPanel'
import { usePreferences } from '../store/preferences'
import RadioRounded from '@mui/icons-material/RadioRounded'
import { useDisplayTrack, RadioFavoriteButton, LiveBar } from './Radio'

export function PlayPauseButton({ size = 'large', filled = true }) {
  const { m3 } = useTheme()
  const playing = usePlayer((s) => s.playing)
  const toggle = usePlayer((s) => s.toggle)
  const Icon = playing ? PauseRounded : PlayArrowRounded
  return (
    <IconButton
      onClick={toggle}
      aria-label={playing ? 'Pause' : 'Play'}
      size={size}
      sx={filled ? {
        bgcolor: m3.primary, color: m3.onPrimary, borderRadius: playing ? 4 : 999,
        transition: 'border-radius 200ms, background-color 600ms',
        '&:hover': { bgcolor: m3.primary, filter: 'brightness(1.08)' },
      } : undefined}
    >
      <Icon fontSize="inherit" />
    </IconButton>
  )
}

export function TransportControls({ big = false }) {
  const { m3 } = useTheme()
  const { shuffle, repeat, toggleShuffle, cycleRepeat, prev, next } = usePlayer()
  const RepeatIcon = repeat === 'one' ? RepeatOneRounded : RepeatRounded
  const activeSx = (on) => ({ color: on ? m3.primary : m3.onSurfaceVariant })
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: big ? 2 : 0.5 }}>
      <Tooltip title={shuffle ? 'Shuffle on' : 'Shuffle off'}>
        <IconButton onClick={toggleShuffle} aria-pressed={shuffle} aria-label="Shuffle" sx={activeSx(shuffle)}>
          <ShuffleRounded />
        </IconButton>
      </Tooltip>
      <IconButton onClick={prev} aria-label="Previous track" size={big ? 'large' : 'medium'}>
        <SkipPreviousRounded fontSize={big ? 'large' : 'medium'} />
      </IconButton>
      <PlayPauseButton size="large" />
      <IconButton onClick={() => next()} aria-label="Next track" size={big ? 'large' : 'medium'}>
        <SkipNextRounded fontSize={big ? 'large' : 'medium'} />
      </IconButton>
      <Tooltip title={{ off: 'Repeat off', all: 'Repeat queue', one: 'Repeat track' }[repeat]}>
        <IconButton onClick={cycleRepeat} aria-label="Repeat" sx={activeSx(repeat !== 'off')}>
          <RepeatIcon />
        </IconButton>
      </Tooltip>
    </Box>
  )
}

export function VolumeControl() {
  const { volume, muted, setVolume, toggleMute } = usePlayer()
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: 150 }}>
      <IconButton onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} size="small">
        {muted || volume === 0 ? <VolumeOffRounded fontSize="small" /> : <VolumeUpRounded fontSize="small" />}
      </IconButton>
      <Slider size="small" value={muted ? 0 : volume} min={0} max={1} step={0.01} onChange={(_, v) => setVolume(v)} aria-label="Volume" />
    </Box>
  )
}

function TrackInfo({ track: queued, onOpen }) {
  const track = useDisplayTrack(queued)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
      <Box component="button" onClick={onOpen} aria-label="Open now playing" sx={{ p: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer', borderRadius: 2 }}>
        <Cover id={track.coverArt} version={track.coverVersion} icon={track.isRadio ? RadioRounded : undefined} size={56} radius={2} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" noWrap component="div" sx={{ fontSize: '0.95rem' }}>{track.title}</Typography>
        <Typography variant="body2" color="text.secondary" noWrap component="div">
          {track.artistId ? (
            <Box component={Link} to={`/artists/${track.artistId}`} sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
              {track.artist}
            </Box>
          ) : track.artist}
        </Typography>
      </Box>
    </Box>
  )
}

export default function PlayerBar({ compact }) {
  const { m3 } = useTheme()
  const track = usePlayer((s) => s.queue[s.index])
  const next = usePlayer((s) => s.next)
  const { openNowPlaying, toggleQueue } = useUi()
  const lyricsPref = usePreferences((s) => s.lyricsUnderCover)
  if (!track) return null
  const radio = !!track.isRadio
  const showLyric = lyricsPref && !radio

  if (compact) {
    return (
      <Box sx={{ flexShrink: 0, bgcolor: m3.surfaceContainerHigh, transition: 'background-color 600ms' }}>
        {showLyric && <LyricLine track={track} sx={{ px: 2, pt: 0.75, fontSize: '0.85rem' }} />}
        <Box sx={{ px: 1 }}>
          {radio ? <LiveBar height={14} /> : <Waveform trackId={track.id} height={14} bar={2} gap={1} />}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, pb: 1 }}>
          <Box onClick={() => openNowPlaying()} sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
            <TrackInfo track={track} onOpen={() => openNowPlaying()} />
          </Box>
          <PlayPauseButton size="medium" filled={false} />
          <IconButton onClick={() => next()} aria-label="Next track">
            <SkipNextRounded />
          </IconButton>
        </Box>
      </Box>
    )
  }

  return (
    <Box
      component="section"
      aria-label="Player"
      sx={{
        flexShrink: 0, height: 96, display: 'grid', alignItems: 'center', gap: 3, px: 2,
        gridTemplateColumns: 'minmax(200px, 1fr) auto minmax(240px, 2.2fr) auto',
        bgcolor: m3.surfaceContainer, transition: 'background-color 600ms',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <TrackInfo track={track} onOpen={() => openNowPlaying()} />
        {radio ? <RadioFavoriteButton radio={track} size="small" /> : <StarButton track={track} size="small" />}
      </Box>
      <TransportControls />
      <Box sx={{ minWidth: 0 }}>
        {showLyric && <LyricLine track={track} sx={{ px: 6, mb: 0.25 }} />}
        {radio ? <LiveBar height={44} showTimes /> : <Waveform trackId={track.id} height={showLyric ? 36 : 44} showTimes />}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {radio ? (
          <Tooltip title="Station">
            <IconButton onClick={() => openNowPlaying('station')} aria-label="Station details">
              <RadioRounded />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Lyrics and artist">
            <IconButton onClick={() => openNowPlaying('lyrics')} aria-label="Lyrics and artist">
              <LyricsRounded />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Queue">
          <IconButton onClick={toggleQueue} aria-label="Queue">
            <QueueMusicRounded />
          </IconButton>
        </Tooltip>
        <VolumeControl />
      </Box>
    </Box>
  )
}
