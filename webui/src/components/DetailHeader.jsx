// Cisum web player v0.11.0 - Header for album, artist and playlist pages.
// coverHint: size (px) of the cover shown by the link that opened the page (see Cover hint).
import { Box, Typography, Button, useTheme } from '@mui/material'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import ShuffleRounded from '@mui/icons-material/ShuffleRounded'
import Cover from './Cover'

export default function DetailHeader({ coverId, coverHint, round, title, subtitle, meta, onPlay, onShuffle, actions, children }) {
  const { m3 } = useTheme()
  return (
    <Box
      component="header"
      sx={{
        display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'flex-end' },
        gap: { xs: 2.5, sm: 4 }, mt: { xs: 1, md: 2 }, mb: 3, p: { xs: 2, md: 3 }, borderRadius: 7,
        bgcolor: m3.surfaceContainerLow, transition: 'background-color 600ms',
      }}
    >
      <Box sx={{ width: { xs: '62%', sm: 200, md: 232 }, maxWidth: 260, flexShrink: 0, alignSelf: { xs: 'center', sm: 'auto' } }}>
        <Cover id={coverId} hint={coverHint} round={round} radius={5} request={600} alt="" />
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="h2" component="h1" sx={{ fontSize: { xs: '1.9rem', md: '2.9rem' }, wordBreak: 'break-word' }}>
          {title}
        </Typography>
        {subtitle && <Typography variant="h6" component="div" sx={{ mt: 1, color: m3.onSurfaceVariant, fontWeight: 600 }}>{subtitle}</Typography>}
        {meta && <Typography variant="body2" sx={{ mt: 0.5, color: m3.onSurfaceVariant }}>{meta}</Typography>}
        {children}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 2.5 }}>
          {onPlay && <Button variant="contained" startIcon={<PlayArrowRounded />} onClick={onPlay}>Play</Button>}
          {onShuffle && (
            <Button
              startIcon={<ShuffleRounded />}
              onClick={onShuffle}
              sx={{ bgcolor: m3.secondaryContainer, color: m3.onSecondaryContainer, '&:hover': { bgcolor: m3.secondaryContainer, filter: 'brightness(1.06)' } }}
            >
              Shuffle
            </Button>
          )}
          {actions}
        </Box>
      </Box>
    </Box>
  )
}
