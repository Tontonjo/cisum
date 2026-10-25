// Cisum web player v0.11.3 - Playlists: list with a remembered sort, multi-select export (M3U8 / ZIP), multi-file import
// (M3U / M3U8 / ZIP on the server, .nsp dynamic playlists here) and dynamic playlist creation.
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Box, Button, Checkbox, Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItem, ListItemText, useTheme,
} from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import FileUploadRounded from '@mui/icons-material/FileUploadRounded'
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getPlaylists, importPlaylists, exportPlaylists, createSmartPlaylist, previewSmartPlaylist, PLAYLIST_SORTS,
  playlistCover,
} from '../api/library'
import { isNspFile, parseNsp } from '../utils/smartRules'
import { useClientSort } from '../utils/sort'
import SortChips from '../components/SortChips'
import { useUi } from '../store/ui'
import { useCan } from '../store/me'
import { formatLength, plural } from '../utils/format'
import { PageTitle, EmptyState } from '../components/Cards'
import { TaskProgress } from '../components/admin/Panel'
import Cover, { coverRequestPx } from '../components/Cover'
import NewPlaylistDialog from '../components/NewPlaylistDialog'
import SmartPlaylistDialog from '../components/SmartPlaylistDialog'
import { intentProps } from '../api/preload'

function ImportReport({ reports, onClose }) {
  return (
    <Dialog open={!!reports} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Import finished</DialogTitle>
      <DialogContent>
        <List dense>
          {(reports || []).map((r, i) => (
            <ListItem key={i} alignItems="flex-start" disableGutters>
              <ListItemText
                primary={
                  r.error ? `${r.file}: not imported`
                    : r.dynamic ? `${r.name}: dynamic playlist created`
                      : `${r.name}: ${r.matched} of ${r.total} songs found`
                }
                secondary={
                  r.error ||
                  (r.dynamic && `${plural(r.count, 'song')} match its rules today.`) ||
                  (r.unmatched?.length ? `Not found in the library: ${r.unmatched.join('; ')}${r.total - r.matched > r.unmatched.length ? '; ...' : ''}` : 'All songs were found.')
                }
                primaryTypographyProps={{ fontWeight: 600, color: r.error ? 'error' : undefined }}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">Done</Button>
      </DialogActions>
    </Dialog>
  )
}

export default function Playlists() {
  const { m3 } = useTheme()
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const fileRef = useRef()
  const [selected, setSelected] = useState([])
  const [newOpen, setNewOpen] = useState(false)
  const [smartOpen, setSmartOpen] = useState(false)
  const [reports, setReports] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const canImportExport = useCan('playlistImportExport')
  const { data, isSuccess } = useQuery({ queryKey: ['playlists'], queryFn: getPlaylists })
  const { sort, onSort, sorted: playlists } = useClientSort('playlists', PLAYLIST_SORTS, 'name', data)

  const allSelected = playlists.length > 0 && selected.length === playlists.length
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const onImport = async (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    setUploadPct(0)
    try {
      const nsp = files.filter(isNspFile)
      const others = files.filter((f) => !isNspFile(f))
      const results = await Promise.all(nsp.map(importNsp))
      if (others.length) results.push(...(await importPlaylists(others, setUploadPct)))
      setReports(results)
      qc.invalidateQueries({ queryKey: ['playlists'] })
    } catch (err) {
      notify(`Import failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // .nsp files (Navidrome smart playlists) are read here and created with their rules
  const importNsp = async (file) => {
    try {
      const { name, comment, rules } = parseNsp(await file.text(), file.name)
      const { count } = await previewSmartPlaylist(rules, 1) // validates the rules on the server
      await createSmartPlaylist({ name, comment, rules })
      return { file: file.name, name, dynamic: true, count }
    } catch (err) {
      return { file: file.name, error: err.message }
    }
  }

  const onExport = async () => {
    try {
      await exportPlaylists(selected)
    } catch (err) {
      notify(`Export failed: ${err.message}`)
    }
  }

  return (
    <>
      <PageTitle
        actions={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setNewOpen(true)}>New playlist</Button>
            <Button variant="outlined" startIcon={<AutoAwesomeRounded />} onClick={() => setSmartOpen(true)}>New dynamic playlist</Button>
            {canImportExport && (
              <Button variant="outlined" startIcon={<FileUploadRounded />} onClick={() => fileRef.current.click()} disabled={busy}>
                {busy ? 'Importing...' : 'Import'}
              </Button>
            )}
            <input ref={fileRef} type="file" accept=".m3u,.m3u8,.zip,.nsp,audio/x-mpegurl" multiple hidden onChange={onImport} />
          </Box>
        }
      >
        Playlists
      </PageTitle>

      {playlists.length > 1 && <SortChips options={PLAYLIST_SORTS} value={sort} onChange={onSort} sx={{ mb: 2 }} />}

      {playlists.length > 0 && canImportExport && (
        <Box
          sx={{
            position: 'sticky', top: 76, zIndex: 4, display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: 1, py: 0.5,
            borderRadius: 999, bgcolor: selected.length ? m3.secondaryContainer : 'transparent', transition: 'background-color 200ms',
          }}
        >
          <Checkbox
            checked={allSelected}
            indeterminate={selected.length > 0 && !allSelected}
            onChange={() => setSelected(allSelected ? [] : playlists.map((p) => p.id))}
            inputProps={{ 'aria-label': 'Select all playlists' }}
          />
          <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
            {selected.length ? `${plural(selected.length, 'playlist')} selected` : 'Select playlists to export them'}
          </Typography>
          {selected.length > 0 && (
            <Button startIcon={<FileDownloadRounded />} onClick={onExport}>
              {selected.length > 1 ? 'Export as ZIP' : 'Export M3U8'}
            </Button>
          )}
        </Box>
      )}

      {busy && (
        // Upload has a real percentage; matching songs on the server does not
        <TaskProgress label={uploadPct < 100 ? 'Uploading playlist files' : 'Matching songs with the library'} value={uploadPct < 100 ? uploadPct : null} />
      )}
      {isSuccess && !playlists.length && (
        <EmptyState title="No playlists yet">
          Create one, a dynamic one built from rules, or import .m3u / .m3u8 files (several at once, or a ZIP of them) and .nsp dynamic playlists.
        </EmptyState>
      )}

      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {playlists.map((p) => {
          const isSelected = selected.includes(p.id)
          return (
            <Box
              component="li"
              key={p.id}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, borderRadius: 4, '&:hover': { bgcolor: 'action.hover' } }}
            >
              {canImportExport && <Checkbox checked={isSelected} onChange={() => toggle(p.id)} inputProps={{ 'aria-label': `Select ${p.name}` }} />}
              <Box component={Link} to={`/playlists/${p.id}`} {...intentProps('playlist', p, coverRequestPx(64))} sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 2, color: 'inherit', textDecoration: 'none' }}>
                <Cover id={playlistCover(p)} size={64} radius={3} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {p.name}
                    {p.rules && <AutoAwesomeRounded fontSize="inherit" titleAccess="Dynamic playlist" sx={{ color: m3.tertiary }} />}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {[plural(p.songCount, 'song'), formatLength(p.duration), p.ownerName].filter(Boolean).join(', ')}
                  </Typography>
                </Box>
              </Box>
            </Box>
          )
        })}
      </Box>

      <NewPlaylistDialog open={newOpen} onClose={() => setNewOpen(false)} />
      {smartOpen && <SmartPlaylistDialog open onClose={() => setSmartOpen(false)} />}
      <ImportReport reports={reports} onClose={() => setReports(null)} />
    </>
  )
}
