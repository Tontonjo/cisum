// Cisum web player v0.7.0 - Web radio building blocks: cover, card, favorite button, live bar,
// station panel (now playing view) and the display title of the current queue entry.
import { useState } from 'react'
import { Box, IconButton, Tooltip, Typography, Menu, MenuItem, ListItemIcon, Link as MuiLink, useTheme } from '@mui/material'
import RadioRounded from '@mui/icons-material/RadioRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import FavoriteRounded from '@mui/icons-material/FavoriteRounded'
import FavoriteBorderRounded from '@mui/icons-material/FavoriteBorderRounded'
import MoreVertRounded from '@mui/icons-material/MoreVertRounded'
import EditRounded from '@mui/icons-material/EditRounded'
import DeleteRounded from '@mui/icons-material/DeleteRounded'
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded'
import GraphicEqRounded from '@mui/icons-material/GraphicEqRounded'
import { usePlayer, useProgress } from '../store/player'
import { useRadioFavorites } from '../store/preferences'
import { useUi } from '../store/ui'
import { radioToTrack, hostName } from '../api/radio'
import { formatTime } from '../utils/format'
import Cover from './Cover'

export const playRadio = (radio) => usePlayer.getState().playTracks([radioToTrack(radio)])

/** Title and subtitle to show for a queue entry: for a station, the live song then the station. */
export function useDisplayTrack(track) {
  const info = usePlayer((s) => s.radioInfo)
  if (!track?.isRadio) return track
  const live = info?.stationId === track.id ? info.title : ''
  return { ...track, title: live || track.title, artist: live ? track.title : 'Web radio', artistId: null, album: '' }
}

export function RadioCover({ radio, size, radius = 4, request }) {
  return <Cover id={radio.coverArt} version={radio.coverVersion} size={size} radius={radius} request={request} icon={RadioRounded} alt="" />
}

export function RadioFavoriteButton({ radio, size = 'medium' }) {
  const { m3 } = useTheme()
  const notify = useUi((s) => s.notify)
  const [isFavorite, toggle] = useRadioFavorites()
  const on = isFavorite(radio.id)
  return (
    <Tooltip title={on ? 'Remove from favorite radios' : 'Add to favorite radios'}>
      <IconButton
        size={size}
        aria-pressed={on}
        aria-label="Favorite radio"
        onClick={(e) => {
          e.stopPropagation()
          toggle(radio.id).catch((err) => notify(err.message))
        }}
        sx={{ color: on ? m3.primary : m3.onSurfaceVariant }}
      >
        {on ? <FavoriteRounded fontSize="inherit" /> : <FavoriteBorderRounded fontSize="inherit" />}
      </IconButton>
    </Tooltip>
  )
}

/** Station card: logo with play button, name, live title when it is the station playing. */
export function RadioCard({ radio, onEdit, onDelete }) {
  const { m3 } = useTheme()
  const [anchor, setAnchor] = useState(null)
  const current = usePlayer((s) => s.queue[s.index])
  const playing = usePlayer((s) => s.playing)
  const live = usePlayer((s) => (s.radioInfo?.stationId === radio.id ? s.radioInfo.title : ''))
  const isCurrent = current?.isRadio && current.id === radio.id
  const close = (fn) => () => {
    setAnchor(null)
    fn?.()
  }
  return (
    <Box sx={{ minWidth: 0, '&:hover .card-play, &:focus-within .card-play': { opacity: 1, transform: 'translateY(0)' } }}>
      <Box sx={{ position: 'relative' }}>
        <Box onClick={() => playRadio(radio)} sx={{ cursor: 'pointer', borderRadius: 4, outline: isCurrent ? `3px solid ${m3.primary}` : 'none', outlineOffset: 2 }}>
          <RadioCover radio={radio} />
        </Box>
        <IconButton
          className="card-play"
          aria-label={`Play ${radio.name}`}
          onClick={() => playRadio(radio)}
          sx={{
            position: 'absolute', right: { xs: 8, md: 10 }, bottom: { xs: 8, md: 10 }, width: { xs: 40, md: 52 }, height: { xs: 40, md: 52 },
            bgcolor: m3.primaryContainer, color: m3.onPrimaryContainer, borderRadius: 4,
            opacity: { xs: 1, md: isCurrent ? 1 : 0 }, transform: { md: 'translateY(6px)' }, transition: 'opacity 150ms, transform 150ms',
            '&:hover': { bgcolor: m3.primaryContainer, filter: 'brightness(1.08)' },
          }}
        >
          {isCurrent && playing ? <GraphicEqRounded /> : <PlayArrowRounded />}
        </IconButton>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', mt: 1.25, gap: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap sx={{ fontSize: '0.95rem' }}>{radio.name}</Typography>
          <Typography variant="body2" color={live ? 'primary' : 'text.secondary'} noWrap title={live || undefined}>
            {live || (radio.homePageUrl ? hostName(radio.homePageUrl) : hostName(radio.streamUrl))}
          </Typography>
        </Box>
        <RadioFavoriteButton radio={radio} size="small" />
        {(onEdit || radio.homePageUrl) && (
          <IconButton size="small" aria-label={`More options for ${radio.name}`} onClick={(e) => setAnchor(e.currentTarget)}>
            <MoreVertRounded fontSize="small" />
          </IconButton>
        )}
      </Box>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close()}>
        {radio.homePageUrl && (
          <MenuItem component="a" href={radio.homePageUrl} target="_blank" rel="noopener noreferrer" onClick={close()}>
            <ListItemIcon><OpenInNewRounded fontSize="small" /></ListItemIcon>Open website
          </MenuItem>
        )}
        {onEdit && (
          <MenuItem onClick={close(() => onEdit(radio))}>
            <ListItemIcon><EditRounded fontSize="small" /></ListItemIcon>Edit
          </MenuItem>
        )}
        {onDelete && (
          <MenuItem onClick={close(() => onDelete(radio))} sx={{ color: 'error.main' }}>
            <ListItemIcon sx={{ color: 'error.main' }}><DeleteRounded fontSize="small" /></ListItemIcon>Delete
          </MenuItem>
        )}
      </Menu>
    </Box>
  )
}

/** Replaces the waveform for a live stream: LIVE badge, animated bars, listening time. */
export function LiveBar({ height = 40, showTimes = false }) {
  const { m3 } = useTheme()
  const playing = usePlayer((s) => s.playing)
  const time = useProgress((s) => s.time)
  const bars = 40
  return (
    <Box aria-label="Live stream" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, height, px: showTimes ? 0 : 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.25, borderRadius: 999, bgcolor: m3.errorContainer, color: m3.onErrorContainer, fontSize: '0.7rem', fontWeight: 800, letterSpacing: 1, flexShrink: 0 }}>
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: m3.error, animation: playing ? 'cisumBlink 1.6s infinite' : 'none', '@keyframes cisumBlink': { '50%': { opacity: 0.25 } } }} />
        LIVE
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, height: '70%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2px', overflow: 'hidden' }}>
        {Array.from({ length: bars }, (_, i) => (
          <Box
            key={i}
            sx={{
              flex: '0 1 4px', minWidth: 2, borderRadius: 1, bgcolor: m3.primary, opacity: playing ? 0.75 : 0.25, height: '18%',
              animation: playing ? `cisumEq 1.${(i * 7) % 10}s ease-in-out ${(i % 5) * 0.12}s infinite alternate` : 'none',
              '@keyframes cisumEq': { from: { height: '15%' }, to: { height: '100%' } },
            }}
          />
        ))}
      </Box>
      {showTimes && (
        <Typography variant="caption" sx={{ color: m3.onSurfaceVariant, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {formatTime(time)}
        </Typography>
      )}
    </Box>
  )
}

/** Station details and the titles heard during this session (now playing view). */
export function RadioPanel({ track }) {
  const { m3 } = useTheme()
  const info = usePlayer((s) => (s.radioInfo?.stationId === track.id ? s.radioInfo : null))
  const history = usePlayer((s) => s.radioHistory)
  const codec = { 'audio/mpeg': 'MP3', 'audio/aac': 'AAC', 'audio/aacp': 'AAC+', 'audio/ogg': 'Ogg', 'audio/flac': 'FLAC' }[info?.contentType]
  const facts = [info?.genre, codec, info?.bitrate ? `${info.bitrate} kbps` : ''].filter(Boolean)
  return (
    <Box sx={{ py: 2 }}>
      <Typography variant="overline" sx={{ color: m3.onSurfaceVariant }}>Station</Typography>
      <Typography variant="h4" component="h3">{track.title}</Typography>
      {info?.name && info.name !== track.title && <Typography color="text.secondary">{info.name}</Typography>}
      {facts.length > 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{facts.join(', ')}</Typography>}
      {track.homePageUrl && (
        <MuiLink href={track.homePageUrl} target="_blank" rel="noopener noreferrer" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
          {hostName(track.homePageUrl)} <OpenInNewRounded fontSize="inherit" />
        </MuiLink>
      )}
      <Typography variant="overline" component="h4" sx={{ display: 'block', color: m3.onSurfaceVariant, mt: 4 }}>Heard on this station</Typography>
      {history.length ? (
        <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {history.map((h, i) => (
            <Box component="li" key={h.at} sx={{ display: 'flex', gap: 2, py: 1, borderBottom: `1px solid ${m3.outlineVariant}`, opacity: i ? 0.75 : 1 }}>
              <Typography variant="body2" noWrap sx={{ color: m3.onSurfaceVariant, fontVariantNumeric: 'tabular-nums', minWidth: 72, flexShrink: 0 }}>
                {new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: i ? 400 : 650 }}>{h.title}</Typography>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography color="text.secondary">
          {info && !info.title ? 'This station does not send song titles.' : 'Song titles appear here while the station plays.'}
        </Typography>
      )}
    </Box>
  )
}
