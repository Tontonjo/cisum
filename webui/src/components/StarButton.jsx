// Cisum web player v0.1.0 - Favorite toggle for songs, albums and artists.
import { useState, useEffect } from 'react'
import { IconButton, Tooltip, useTheme } from '@mui/material'
import FavoriteRounded from '@mui/icons-material/FavoriteRounded'
import FavoriteBorderRounded from '@mui/icons-material/FavoriteBorderRounded'
import { useQueryClient } from '@tanstack/react-query'
import { setStarred } from '../api/library'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'

export default function StarButton({ track, item, size = 'medium' }) {
  const { m3 } = useTheme()
  const target = track || item
  const [on, setOn] = useState(!!target?.starred)
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  useEffect(() => setOn(!!target?.starred), [target?.id, target?.starred])
  if (!target) return null

  const toggle = async (e) => {
    e.stopPropagation()
    const value = !on
    setOn(value)
    try {
      await setStarred(target.id, value)
      if (track) usePlayer.getState().markStarred(track.id, value)
      qc.invalidateQueries({ queryKey: ['starred'] })
    } catch (err) {
      setOn(!value)
      notify(err.message)
    }
  }

  return (
    <Tooltip title={on ? 'Remove from favorites' : 'Add to favorites'}>
      <IconButton size={size} onClick={toggle} aria-pressed={on} aria-label="Favorite" sx={{ color: on ? m3.primary : m3.onSurfaceVariant }}>
        {on ? <FavoriteRounded fontSize="inherit" /> : <FavoriteBorderRounded fontSize="inherit" />}
      </IconButton>
    </Tooltip>
  )
}
