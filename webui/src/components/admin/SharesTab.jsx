// Cisum web player v0.4.0 - Administration: public share links.
import { Box, IconButton, Tooltip, Typography, Alert, LinearProgress } from '@mui/material'
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded'
import DeleteRounded from '@mui/icons-material/DeleteRounded'
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getShares, deleteShare } from '../../api/admin'
import { useMe } from '../../store/me'
import { useUi } from '../../store/ui'
import { formatDate } from '../../utils/format'
import { shareUrl } from '../ShareDialog'
import { Panel } from './Panel'

export default function SharesTab() {
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const sharingEnabled = useMe((s) => s.sharingEnabled)
  const { data: shares = [], isLoading } = useQuery({ queryKey: ['shares'], queryFn: getShares, enabled: sharingEnabled })

  if (!sharingEnabled) {
    return (
      <Panel title="Public sharing">
        <Alert severity="info">
          Public sharing is off. Add CISUM_ENABLESHARING: "true" to the environment section of docker-compose.yml, then restart
          Cisum. Users also need the "Share publicly" right.
        </Alert>
      </Panel>
    )
  }

  const copy = async (s) => {
    try {
      await navigator.clipboard.writeText(shareUrl(s.id))
      notify('Link copied')
    } catch {
      notify(shareUrl(s.id))
    }
  }

  return (
    <Panel title="Public shares" description="Anyone with one of these links can listen without an account until it expires. Delete a link to stop sharing.">
      {isLoading && <LinearProgress />}
      {!isLoading && !shares.length && <Typography color="text.secondary">No shares yet. Use "Share" on an album, a playlist or a song.</Typography>}
      {shares.map((s) => (
        <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.25, px: 1, borderRadius: 3, '&:hover': { bgcolor: 'action.hover' } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" noWrap>{s.description || s.contents || s.id}</Typography>
            <Typography variant="body2" color="text.secondary">
              By {s.username || '?'}, {s.visitCount || 0} visits, expires {s.expiresAt ? formatDate(s.expiresAt) : 'never'}
              {s.downloadable ? ', downloadable' : ''}
            </Typography>
          </Box>
          <Tooltip title="Copy link"><IconButton aria-label="Copy link" onClick={() => copy(s)}><ContentCopyRounded /></IconButton></Tooltip>
          <Tooltip title="Open"><IconButton aria-label="Open share" component="a" href={shareUrl(s.id)} target="_blank" rel="noopener"><OpenInNewRounded /></IconButton></Tooltip>
          <Tooltip title="Delete">
            <IconButton
              aria-label="Delete share"
              onClick={async () => {
                try {
                  await deleteShare(s.id)
                  notify('Share deleted')
                  qc.invalidateQueries({ queryKey: ['shares'] })
                } catch (e) {
                  notify(e.message)
                }
              }}
            >
              <DeleteRounded />
            </IconButton>
          </Tooltip>
        </Box>
      ))}
    </Panel>
  )
}
