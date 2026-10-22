// Cisum web player v0.7.0 - Web radios: favorites first, then every station (remembered sort).
// Administrators add, edit, delete, find (directory) and import stations; everyone can export them.
import { useRef, useState } from 'react'
import {
  Box, Button, Typography, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import TravelExploreRounded from '@mui/icons-material/TravelExploreRounded'
import FileUploadRounded from '@mui/icons-material/FileUploadRounded'
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRadios, deleteRadio, createRadio, parseRadioPlaylist, exportRadios } from '../api/radio'
import { useMe } from '../store/me'
import { useUi } from '../store/ui'
import { useRadioFavorites } from '../store/preferences'
import { useClientSort } from '../utils/sort'
import { plural } from '../utils/format'
import { PageTitle, CardGrid, EmptyState } from '../components/Cards'
import SortChips from '../components/SortChips'
import { RadioCard } from '../components/Radio'
import RadioDialog from '../components/radio/RadioDialog'
import RadioDirectoryDialog from '../components/radio/RadioDirectoryDialog'

const RADIO_SORTS = {
  name: { label: 'Name', order: 'ASC', value: (r) => r.name },
  created: { label: 'Recently added', order: 'DESC', value: (r) => r.createdAt },
}

export default function Radios() {
  const qc = useQueryClient()
  const notify = useUi((s) => s.notify)
  const isAdmin = useMe((s) => s.isAdmin)
  const directoryEnabled = useMe((s) => s.radioDirectory !== false)
  const [isFavorite] = useRadioFavorites()
  const fileRef = useRef()
  const [editing, setEditing] = useState(null) // null | {} (new) | station
  const [deleting, setDeleting] = useState(null)
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const { data, isSuccess } = useQuery({ queryKey: ['radios'], queryFn: getRadios })
  const { sort, onSort, sorted } = useClientSort('radios', RADIO_SORTS, 'name', data)
  const favorites = sorted.filter((r) => isFavorite(r.id))

  const onImport = async (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    if (!files.length) return
    setImporting(true)
    const known = new Set((data || []).map((r) => r.streamUrl))
    let added = 0
    let skipped = 0
    try {
      for (const f of files) {
        for (const s of parseRadioPlaylist(await f.text(), f.name)) {
          if (known.has(s.streamUrl)) {
            skipped++
            continue
          }
          await createRadio(s)
          known.add(s.streamUrl)
          added++
        }
      }
      notify(`${plural(added, 'station')} added${skipped ? `, ${skipped} already present` : ''}`)
    } catch (err) {
      notify(`Import stopped after ${plural(added, 'station')}: ${err.message}`)
    } finally {
      setImporting(false)
      qc.invalidateQueries({ queryKey: ['radios'] })
    }
  }

  const onDelete = async () => {
    try {
      await deleteRadio(deleting.id)
      qc.invalidateQueries({ queryKey: ['radios'] })
    } catch (err) {
      notify(`Could not delete the station: ${err.message}`)
    }
    setDeleting(null)
  }

  const card = (r) => (
    <RadioCard key={r.id} radio={r} onEdit={isAdmin ? setEditing : undefined} onDelete={isAdmin ? setDeleting : undefined} />
  )

  return (
    <>
      <PageTitle
        actions={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {isAdmin && directoryEnabled && (
              <Button variant="contained" startIcon={<TravelExploreRounded />} onClick={() => setDirectoryOpen(true)}>Find stations</Button>
            )}
            {isAdmin && <Button variant="outlined" startIcon={<AddRounded />} onClick={() => setEditing({})}>Add</Button>}
            {isAdmin && (
              <Button variant="outlined" startIcon={<FileUploadRounded />} onClick={() => fileRef.current.click()} disabled={importing}>
                {importing ? 'Importing...' : 'Import'}
              </Button>
            )}
            {sorted.length > 0 && <Button startIcon={<FileDownloadRounded />} onClick={() => exportRadios(sorted)}>Export</Button>}
            <input ref={fileRef} type="file" accept=".m3u,.m3u8,.pls,audio/x-mpegurl,audio/x-scpls" multiple hidden onChange={onImport} />
          </Box>
        }
      >
        Radios
      </PageTitle>

      {isSuccess && !sorted.length && (
        <EmptyState title="No stations yet">
          {isAdmin ? 'Find stations in the directory, add one by its stream URL, or import .m3u / .pls files.' : 'An administrator can add web radio stations.'}
        </EmptyState>
      )}

      {favorites.length > 0 && (
        <Box component="section" sx={{ mb: 5 }}>
          <Typography variant="h4" component="h2" sx={{ mb: 2 }}>Favorites</Typography>
          <CardGrid>{favorites.map(card)}</CardGrid>
        </Box>
      )}

      {sorted.length > 0 && (
        <Box component="section">
          {favorites.length > 0 && <Typography variant="h4" component="h2" sx={{ mb: 2 }}>All stations</Typography>}
          {sorted.length > 1 && <SortChips options={RADIO_SORTS} value={sort} onChange={onSort} />}
          <CardGrid>{sorted.map(card)}</CardGrid>
        </Box>
      )}

      <RadioDialog open={!!editing} radio={editing?.id ? editing : null} onClose={() => setEditing(null)} />
      {directoryOpen && <RadioDirectoryDialog open onClose={() => setDirectoryOpen(false)} existing={data || []} />}
      <Dialog open={!!deleting} onClose={() => setDeleting(null)}>
        <DialogTitle>Delete station?</DialogTitle>
        <DialogContent>
          <DialogContentText>"{deleting?.name}" is removed for every user.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={onDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
