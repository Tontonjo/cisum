// Cisum web player v0.11.5 - Application root: theme, data cache, authentication and routes.
import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './api/queryClient'
import { startLibraryEvents } from './api/events'
import { buildTheme, seedFromImage } from './theme/theme'
import { useSettings } from './store/settings'
import { usePlayer } from './store/player'
import { usePreferences } from './store/preferences'
import { useMe } from './store/me'
import { coverUrl, getSession, clearSession, setUnauthorizedHandler } from './api/client'
import { WEB_ROOT, SHARE_INFO, COVER_PX } from './config'
import Layout from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import Albums from './pages/Albums'
import AlbumDetail from './pages/AlbumDetail'
import Artists from './pages/Artists'
import ArtistDetail from './pages/ArtistDetail'
import Songs from './pages/Songs'
import Favorites from './pages/Favorites'
import Radios from './pages/Radios'
import Playlists from './pages/Playlists'
import PlaylistDetail from './pages/PlaylistDetail'
import Search from './pages/Search'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import SharePage from './pages/SharePage'

/** Follows the playing track's cover to derive the dynamic accent color. */
function useCoverSeed() {
  const coverArt = usePlayer((s) => s.queue[s.index]?.coverArt)
  const dynamicColor = useSettings((s) => s.dynamicColor)
  const setCoverSeed = useSettings((s) => s.setCoverSeed)
  useEffect(() => {
    if (!dynamicColor || !coverArt) {
      setCoverSeed(null)
      return
    }
    let cancelled = false
    seedFromImage(coverUrl(coverArt, COVER_PX)).then((seed) => {
      if (!cancelled) setCoverSeed(seed)
    })
    return () => {
      cancelled = true
    }
  }, [coverArt, dynamicColor, setCoverSeed])
}

export default function App() {
  const [session, setSession] = useState(getSession)
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  const { mode, accent, coverSeed, dynamicColor } = useSettings()
  const resolvedMode = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode
  const seed = (dynamicColor && coverSeed) || accent
  const theme = useMemo(() => buildTheme(seed, resolvedMode), [seed, resolvedMode])

  useCoverSeed()

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession()
      setSession(getSession())
    })
  }, [])

  // Per-user preferences are loaded from the server after each login
  useEffect(() => {
    if (session.loggedIn) {
      usePreferences.getState().load()
      useMe.getState().load()
    }
  }, [session.loggedIn, session.username])

  // Library changes pushed by the server (scan): lists and pages reload, deleted items disappear
  useEffect(() => {
    if (session.loggedIn && !SHARE_INFO) return startLibraryEvents()
  }, [session.loggedIn, session.username])

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.m3.surfaceContainer)
  }, [theme])

  const logout = () => {
    usePlayer.getState().clearQueue()
    clearSession()
    queryClient.clear()
    setSession(getSession())
  }

  const basename = new URL(WEB_ROOT, window.location.origin).pathname

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        {SHARE_INFO ? (
          <SharePage share={SHARE_INFO} />
        ) : !session.loggedIn ? (
          <Login onLogin={setSession} />
        ) : (
          <BrowserRouter basename={basename}>
            <Routes>
              <Route element={<Layout session={session} onLogout={logout} />}>
                <Route index element={<Home />} />
                <Route path="albums" element={<Albums />} />
                <Route path="albums/:id" element={<AlbumDetail />} />
                <Route path="artists" element={<Artists />} />
                <Route path="artists/:id" element={<ArtistDetail />} />
                <Route path="songs" element={<Songs />} />
                <Route path="favorites" element={<Favorites />} />
                <Route path="radios" element={<Radios />} />
                <Route path="playlists" element={<Playlists />} />
                <Route path="playlists/:id" element={<PlaylistDetail />} />
                <Route path="search" element={<Search />} />
                <Route path="settings" element={<Settings session={session} onLogout={logout} />} />
                <Route path="admin" element={<Admin session={session} />} />
                <Route path="admin/:tab" element={<Admin session={session} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        )}
      </QueryClientProvider>
    </ThemeProvider>
  )
}
