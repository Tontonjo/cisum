// Cisum web player v0.11.1 - App shell: navigation drawer (desktop), bottom bar (mobile), player.
import { useEffect, useRef, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Typography, IconButton, InputBase, Tooltip, useMediaQuery, useTheme,
  BottomNavigation, BottomNavigationAction, Snackbar, Divider,
} from '@mui/material'
import HomeRounded from '@mui/icons-material/HomeRounded'
import AlbumRounded from '@mui/icons-material/AlbumRounded'
import PersonRounded from '@mui/icons-material/PersonRounded'
import MusicNoteRounded from '@mui/icons-material/MusicNoteRounded'
import FavoriteRounded from '@mui/icons-material/FavoriteRounded'
import RadioRounded from '@mui/icons-material/RadioRounded'
import QueueMusicRounded from '@mui/icons-material/QueueMusicRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import SettingsRounded from '@mui/icons-material/SettingsRounded'
import AddRounded from '@mui/icons-material/AddRounded'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import AdminPanelSettingsRounded from '@mui/icons-material/AdminPanelSettingsRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import { useQuery } from '@tanstack/react-query'
import { getPlaylists, playlistCover } from '../api/library'
import { coverUrl } from '../api/client'
import { useUi } from '../store/ui'
import { usePlayer } from '../store/player'
import { BrandMark } from './Brand'
import PlayerBar from './PlayerBar'
import NowPlaying from './NowPlaying'
import QueueDrawer from './QueueDrawer'
import AddToPlaylistDialog from './AddToPlaylistDialog'
import NewPlaylistDialog from './NewPlaylistDialog'
import SmartPlaylistDialog from './SmartPlaylistDialog'
import { intentProps } from '../api/preload'

const DRAWER_WIDTH = 280

const LIBRARY = [
  { to: '/', label: 'Home', icon: HomeRounded, end: true },
  { to: '/albums', label: 'Albums', icon: AlbumRounded },
  { to: '/artists', label: 'Artists', icon: PersonRounded },
  { to: '/songs', label: 'Songs', icon: MusicNoteRounded },
  { to: '/favorites', label: 'Favorites', icon: FavoriteRounded },
  { to: '/radios', label: 'Radios', icon: RadioRounded },
]

const MOBILE_NAV = [
  { to: '/', label: 'Home', icon: HomeRounded },
  { to: '/search', label: 'Search', icon: SearchRounded },
  { to: '/albums', label: 'Albums', icon: AlbumRounded },
  { to: '/artists', label: 'Artists', icon: PersonRounded },
  { to: '/playlists', label: 'Playlists', icon: QueueMusicRounded },
]

/** linkProps: extra link attributes (preloading handlers for playlists). */
function NavItem({ to, label, icon: Icon, end, image, missing, linkProps }) {
  const { m3 } = useTheme()
  return (
    <Box
      component={NavLink}
      to={to}
      end={end}
      {...linkProps}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, height: 48, px: 2, borderRadius: 999,
        color: m3.onSurfaceVariant, textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem',
        '&:hover': { bgcolor: 'action.hover' },
        '&.active': { bgcolor: m3.secondaryContainer, color: m3.onSecondaryContainer },
      }}
    >
      {image ? (
        <Box component="img" src={image} alt="" loading="lazy" sx={{ width: 28, height: 28, borderRadius: 1.5, objectFit: 'cover', bgcolor: m3.surfaceContainerHighest, opacity: missing ? 0.5 : 1 }} />
      ) : (
        <Icon fontSize="small" />
      )}
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </Box>
    </Box>
  )
}

function SearchBox({ autoFocus }) {
  const { m3 } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [value, setValue] = useState(params.get('q') || '')
  const timer = useRef()

  useEffect(() => {
    if (location.pathname !== '/search') setValue('')
  }, [location.pathname])

  const onChange = (v) => {
    setValue(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      navigate(`/search?q=${encodeURIComponent(v)}`, { replace: location.pathname === '/search' })
    }, 300)
  }

  return (
    <Box
      role="search"
      sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 52, px: 2, borderRadius: 999, bgcolor: m3.surfaceContainerHigh, flex: 1, maxWidth: 640 }}
    >
      <SearchRounded sx={{ color: m3.onSurfaceVariant }} />
      <InputBase
        placeholder="Search songs, albums, artists"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        inputProps={{ 'aria-label': 'Search the library' }}
        sx={{ flex: 1, fontSize: '1rem' }}
      />
      {value && (
        <IconButton size="small" aria-label="Clear search" onClick={() => onChange('')}>
          <CloseRounded fontSize="small" />
        </IconButton>
      )}
    </Box>
  )
}

function Drawer({ session }) {
  const { m3 } = useTheme()
  const [newOpen, setNewOpen] = useState(false)
  const [smartOpen, setSmartOpen] = useState(false)
  const { data: playlists = [] } = useQuery({ queryKey: ['playlists'], queryFn: getPlaylists })
  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{
        width: DRAWER_WIDTH, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column',
        bgcolor: m3.surfaceContainerLow, px: 1.5, pt: 2, transition: 'background-color 600ms',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, mb: 2 }}>
        <BrandMark size={34} />
        <Typography variant="h4" component="div">Cisum</Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {LIBRARY.map((item) => <NavItem key={item.to} {...item} />)}
      </Box>
      <Divider sx={{ my: 1.5, mx: 2 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', pl: 2, pr: 0.5, mb: 0.5 }}>
        <Typography
          component={NavLink}
          to="/playlists"
          end
          variant="subtitle2"
          sx={{ flex: 1, color: m3.onSurfaceVariant, textDecoration: 'none', '&:hover': { color: m3.onSurface } }}
        >
          Playlists
        </Typography>
        <Tooltip title="New dynamic playlist">
          <IconButton size="small" onClick={() => setSmartOpen(true)} aria-label="New dynamic playlist">
            <AutoAwesomeRounded fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="New playlist">
          <IconButton size="small" onClick={() => setNewOpen(true)} aria-label="New playlist">
            <AddRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.25, pb: 1 }}>
        {playlists.map((p) => (
          <NavItem key={p.id} to={`/playlists/${p.id}`} label={p.name} image={coverUrl(playlistCover(p) || `pl-${p.id}`, 64)} linkProps={intentProps('playlist', p, 64)} />
        ))}
        {!playlists.length && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
            No playlists yet.
          </Typography>
        )}
      </Box>
      <Divider sx={{ mx: 2 }} />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, py: 1 }}>
        <NavItem to="/settings" label="Settings" icon={SettingsRounded} />
        {session.isAdmin && <NavItem to="/admin" label="Administration" icon={AdminPanelSettingsRounded} />}
      </Box>
      <NewPlaylistDialog open={newOpen} onClose={() => setNewOpen(false)} />
      {smartOpen && <SmartPlaylistDialog open onClose={() => setSmartOpen(false)} />}
    </Box>
  )
}

export default function Layout({ session }) {
  const theme = useTheme()
  const { m3 } = theme
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const location = useLocation()
  const navigate = useNavigate()
  const hasTrack = usePlayer((s) => s.index >= 0)
  const { toast, closeToast } = useUi()
  const scrollRef = useRef()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [location.pathname])

  const mobileValue = MOBILE_NAV.findIndex((n) =>
    n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to),
  )

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {desktop && <Drawer session={session} />}
        <Box component="main" ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', minWidth: 0, position: 'relative' }}>
          <Box
            sx={{
              position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 1.5,
              px: { xs: 2, md: 4 }, py: 1.5, bgcolor: m3.surface, transition: 'background-color 600ms',
            }}
          >
            {desktop ? (
              <SearchBox />
            ) : location.pathname === '/search' ? (
              <SearchBox autoFocus />
            ) : (
              <>
                <BrandMark size={30} />
                <Typography variant="h5" component="div" sx={{ flex: 1 }}>Cisum</Typography>
                <IconButton aria-label="Radios" onClick={() => navigate('/radios')}>
                  <RadioRounded />
                </IconButton>
                <IconButton aria-label="Settings" onClick={() => navigate('/settings')}>
                  <SettingsRounded />
                </IconButton>
              </>
            )}
          </Box>
          <Box sx={{ px: { xs: 2, md: 4 }, pb: 4 }}>
            <Outlet />
          </Box>
        </Box>
      </Box>

      {hasTrack && <PlayerBar compact={!desktop} />}

      {!desktop && (
        <BottomNavigation
          value={mobileValue}
          showLabels
          sx={{ bgcolor: m3.surfaceContainer, height: 72, pb: 'env(safe-area-inset-bottom)', flexShrink: 0 }}
        >
          {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
            <BottomNavigationAction
              key={to}
              label={label}
              icon={<Icon />}
              onClick={() => navigate(to)}
              sx={{
                minWidth: 0,
                '& .MuiSvgIcon-root': { width: 56, height: 30, px: 2, py: 0.5, borderRadius: 999, boxSizing: 'border-box' },
                '&.Mui-selected': { color: m3.onSurface },
                '&.Mui-selected .MuiSvgIcon-root': { bgcolor: m3.secondaryContainer, color: m3.onSecondaryContainer },
                '& .MuiBottomNavigationAction-label': { fontWeight: 600, fontSize: '0.75rem !important', mt: 0.5 },
              }}
            />
          ))}
        </BottomNavigation>
      )}

      <NowPlaying />
      <QueueDrawer />
      <AddToPlaylistDialog />
      <Snackbar
        open={!!toast}
        key={toast?.key}
        message={toast?.message}
        autoHideDuration={3500}
        onClose={closeToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 160, md: 112 } }}
      />
    </Box>
  )
}
