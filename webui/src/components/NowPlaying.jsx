// Cisum web player v0.7.0 - Full screen "now playing" view.
// Left: cover, titles, large waveform and controls. Right: Lyrics / Artist / Queue tabs.
// On phones the player is the first tab and the panels follow. A web radio shows Station / Queue.
import { forwardRef, useEffect } from 'react'
import { Dialog, Slide, Box, Typography, IconButton, Tabs, Tab, Tooltip, useMediaQuery, useTheme, alpha } from '@mui/material'
import { Link } from 'react-router-dom'
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded'
import PlaylistAddRounded from '@mui/icons-material/PlaylistAddRounded'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import Waveform from './Waveform'
import Cover from './Cover'
import StarButton from './StarButton'
import LyricsPanel, { CompactLyrics, useLyrics } from './LyricsPanel'
import { usePreferences } from '../store/preferences'
import ArtistPanel from './ArtistPanel'
import QueuePanel from './QueuePanel'
import { TransportControls, VolumeControl } from './PlayerBar'
import RadioRounded from '@mui/icons-material/RadioRounded'
import { useDisplayTrack, RadioFavoriteButton, RadioPanel, LiveBar } from './Radio'

const SlideUp = forwardRef(function SlideUp(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />
})

function PlayerColumn({ track: queued, showLyrics }) {
  const { m3 } = useTheme()
  const { pickPlaylist, closeNowPlaying, setNowPlayingTab } = useUi()
  const lyricsUnderCover = usePreferences((s) => s.lyricsUnderCover)
  const track = useDisplayTrack(queued)
  const radio = !!track.isRadio
  const { data: lyrics } = useLyrics(radio ? null : track.id)
  const compactLyrics = showLyrics && lyricsUnderCover && !!lyrics?.synced
  // Leave room for the compact lyrics (about 96 px) on short screens
  const reserved = compactLyrics ? 520 : 420
  const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 520, mx: 'auto' }}>
      {/* Cover shrinks on short screens so title, waveform and controls stay visible */}
      <Box sx={{ width: { xs: '100%', md: `min(100%, calc(100dvh - ${reserved}px))` }, minWidth: { md: 220 } }}>
        <Cover id={track.coverArt} version={track.coverVersion} icon={radio ? RadioRounded : undefined} request={800} radius={6} alt={radio ? `${queued.title} logo` : `${track.album} cover`} sx={{ boxShadow: `0 24px 64px ${alpha('#000', 0.35)}` }} />
      </Box>
      {compactLyrics && <CompactLyrics track={track} onOpen={() => setNowPlayingTab('lyrics')} />}
      <Box sx={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 1, mt: compactLyrics ? 2 : 3 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h3" component="h2" sx={{ fontSize: { xs: '1.6rem', md: '2.1rem' } }}>{track.title}</Typography>
          <Typography variant="subtitle1" sx={{ color: m3.onSurfaceVariant, mt: 0.5 }}>
            {track.artistId ? <Box component={Link} to={`/artists/${track.artistId}`} onClick={closeNowPlaying} sx={linkSx}>{track.artist}</Box> : track.artist}
            {track.album && (
              <>
                {', '}
                {track.albumId ? <Box component={Link} to={`/albums/${track.albumId}`} onClick={closeNowPlaying} sx={linkSx}>{track.album}</Box> : track.album}
              </>
            )}
          </Typography>
        </Box>
        {radio ? (
          <RadioFavoriteButton radio={queued} />
        ) : (
          <>
            <Tooltip title="Add to playlist">
              <IconButton onClick={() => pickPlaylist([track])} aria-label="Add to playlist">
                <PlaylistAddRounded />
              </IconButton>
            </Tooltip>
            <StarButton track={track} />
          </>
        )}
      </Box>
      <Box sx={{ width: '100%', mt: 3 }}>
        {radio ? <LiveBar height={72} showTimes /> : <Waveform trackId={track.id} height={72} bar={4} gap={2} showTimes />}
      </Box>
      <Box sx={{ mt: 2 }}>
        <TransportControls big />
      </Box>
      <Box sx={{ mt: 1, display: { xs: 'none', md: 'block' } }}>
        <VolumeControl />
      </Box>
    </Box>
  )
}

export default function NowPlaying() {
  const theme = useTheme()
  const { m3 } = theme
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const track = usePlayer((s) => s.queue[s.index])
  const { nowPlayingOpen, closeNowPlaying, nowPlayingTab, setNowPlayingTab } = useUi()

  const radio = !!track?.isRadio
  // On desktop the "player" tab does not exist: fall back to lyrics (station for a web radio).
  // Lyrics and artist do not apply to a station, and the station tab only to one.
  let tab = desktop && nowPlayingTab === 'player' ? 'lyrics' : nowPlayingTab
  if (radio && (tab === 'lyrics' || tab === 'artist')) tab = 'station'
  if (!radio && tab === 'station') tab = 'lyrics'
  useEffect(() => {
    if (!desktop && nowPlayingOpen && (nowPlayingTab === 'lyrics' || nowPlayingTab === 'station')) setNowPlayingTab('player')
    // only when opening on mobile
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlayingOpen])

  useEffect(() => {
    if (!track && nowPlayingOpen) closeNowPlaying()
  }, [track, nowPlayingOpen, closeNowPlaying])

  if (!track) return null

  const panel = {
    lyrics: <LyricsPanel track={track} />,
    artist: <ArtistPanel track={track} />,
    queue: <QueuePanel />,
    station: radio ? <RadioPanel track={track} /> : null,
    player: <PlayerColumn track={track} showLyrics />,
  }[tab]

  return (
    <Dialog
      fullScreen
      open={nowPlayingOpen}
      onClose={closeNowPlaying}
      TransitionComponent={SlideUp}
      aria-label="Now playing"
      PaperProps={{
        sx: {
          borderRadius: 0, p: 0,
          background: `radial-gradient(120% 80% at 0% 0%, ${alpha(m3.primaryContainer, 0.85)} 0%, ${m3.surface} 60%)`,
          bgcolor: m3.surface, transition: 'background 600ms',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: { xs: 1, md: 3 }, pt: { xs: 1, md: 2 } }}>
        <IconButton onClick={closeNowPlaying} aria-label="Close now playing" size="large">
          <KeyboardArrowDownRounded fontSize="large" />
        </IconButton>
        <Tabs
          value={tab}
          onChange={(_, v) => setNowPlayingTab(v)}
          variant={desktop ? 'standard' : 'fullWidth'}
          sx={{ flex: 1, ml: desktop ? 'auto' : 0, '& .MuiTabs-flexContainer': { justifyContent: desktop ? 'flex-end' : 'stretch' }, '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0' }, '& .MuiTab-root': { minWidth: 0, px: { xs: 1, md: 2 } } }}
        >
          {!desktop && <Tab value="player" label="Player" />}
          {radio ? <Tab value="station" label="Station" /> : <Tab value="lyrics" label="Lyrics" />}
          {!radio && <Tab value="artist" label="Artist" />}
          <Tab value="queue" label="Queue" />
        </Tabs>
      </Box>
      {desktop ? (
        <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(360px, 1fr) minmax(360px, 1fr)', gap: 6, px: 6, pb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', overflowY: 'auto', py: 2 }}>
            <PlayerColumn track={track} showLyrics={tab !== 'lyrics'} />
          </Box>
          <Box sx={{ overflowY: 'auto', pr: 2, maskImage: 'linear-gradient(transparent, #000 6%, #000 90%, transparent)' }}>{panel}</Box>
        </Box>
      ) : (
        <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, pt: 2, pb: 4 }}>{panel}</Box>
      )}
    </Dialog>
  )
}
