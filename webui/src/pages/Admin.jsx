// Cisum web player v0.11.8 - Administration panel (administrators only).
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { Tabs, Tab, Box } from '@mui/material'
import { PageTitle } from '../components/Cards'
import OverviewTab from '../components/admin/OverviewTab'
import UsersTab from '../components/admin/UsersTab'
import LibrariesTab from '../components/admin/LibrariesTab'
import MaintenanceTab from '../components/admin/MaintenanceTab'
import ImportTab from '../components/admin/ImportTab'
import SharesTab from '../components/admin/SharesTab'
import PlaylistsTab from '../components/admin/PlaylistsTab'
import TagsTab from '../components/admin/TagsTab'

const TABS = [
  ['overview', 'Overview', OverviewTab],
  ['users', 'Users', UsersTab],
  ['libraries', 'Libraries', LibrariesTab],
  ['playlists', 'Playlists', PlaylistsTab],
  ['tags', 'Tags', TagsTab],
  ['maintenance', 'Maintenance', MaintenanceTab],
  ['import', 'Import', ImportTab],
  ['shares', 'Shares', SharesTab],
]

export default function Admin({ session }) {
  const { tab = 'overview' } = useParams()
  const navigate = useNavigate()
  if (!session.isAdmin) return <Navigate to="/" replace />
  const current = TABS.find(([key]) => key === tab) || TABS[0]
  const Content = current[2]
  return (
    <Box sx={{ maxWidth: 1100 }}>
      <PageTitle>Administration</PageTitle>
      <Tabs
        value={current[0]}
        onChange={(_, v) => navigate(`/admin/${v}`, { replace: true })}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ mb: 3, '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0' } }}
      >
        {TABS.map(([key, label]) => <Tab key={key} value={key} label={label} />)}
      </Tabs>
      <Content />
    </Box>
  )
}
