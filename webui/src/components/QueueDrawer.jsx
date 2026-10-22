// Cisum web player v0.1.0 - Side sheet showing the play queue (desktop).
import { Drawer, Box, Typography, IconButton, useTheme } from '@mui/material'
import CloseRounded from '@mui/icons-material/CloseRounded'
import { useUi } from '../store/ui'
import QueuePanel from './QueuePanel'

export default function QueueDrawer() {
  const { m3 } = useTheme()
  const { queueOpen, toggleQueue } = useUi()
  return (
    <Drawer
      anchor="right"
      open={queueOpen}
      onClose={toggleQueue}
      PaperProps={{ sx: { width: { xs: '100%', sm: 400 }, bgcolor: m3.surfaceContainerLow, borderTopLeftRadius: { sm: 16 }, borderBottomLeftRadius: { sm: 16 } } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pt: 2 }}>
        <Typography variant="h4" component="h2" sx={{ flex: 1, pl: 1 }}>Queue</Typography>
        <IconButton onClick={toggleQueue} aria-label="Close queue">
          <CloseRounded />
        </IconButton>
      </Box>
      <Box sx={{ px: 1, overflowY: 'auto' }}>
        <QueuePanel />
      </Box>
    </Drawer>
  )
}
