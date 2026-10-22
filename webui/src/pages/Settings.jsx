// Cisum web player v0.8.1 - Personal settings (appearance, player, home lists), library scan, links and versions.
import { Box, Typography, ToggleButtonGroup, ToggleButton, Switch, Button, Divider, useTheme } from '@mui/material'
import LightModeRounded from '@mui/icons-material/LightModeRounded'
import DarkModeRounded from '@mui/icons-material/DarkModeRounded'
import BrightnessAutoRounded from '@mui/icons-material/BrightnessAutoRounded'
import CheckRounded from '@mui/icons-material/CheckRounded'
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSettings } from '../store/settings'
import { useUi } from '../store/ui'
import { usePreferences, useHomeShelves } from '../store/preferences'
import { Link } from 'react-router-dom'
import config, { APP_VERSION } from '../config'
import { PageTitle } from '../components/Cards'

const ACCENTS = ['#3F5F90', '#6750A4', '#006A6A', '#8A5100', '#B3261E', '#3B6939', '#7D5260']

function Row({ title, description, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2, flexWrap: 'wrap' }}>
      <Box sx={{ flex: 1, minWidth: 220 }}>
        <Typography variant="subtitle1">{title}</Typography>
        {description && <Typography variant="body2" color="text.secondary">{description}</Typography>}
      </Box>
      {children}
    </Box>
  )
}

/** One home list row: drag handle, visibility switch and title. */
function ShelfRow({ shelf, onToggle }) {
  const { m3 } = useTheme()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: shelf.id })
  return (
    <Box
      component="li"
      ref={setNodeRef}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1, py: 0.5, pr: 1, borderRadius: 3,
        transform: CSS.Transform.toString(transform), transition,
        position: 'relative', zIndex: isDragging ? 1 : 'auto',
        bgcolor: isDragging ? m3.surfaceContainerHigh : 'transparent',
        boxShadow: isDragging ? 3 : 'none',
      }}
    >
      <Box {...attributes} {...listeners} aria-label={`Move ${shelf.title}`}
        sx={{ cursor: isDragging ? 'grabbing' : 'grab', display: 'flex', p: 1, color: m3.onSurfaceVariant, touchAction: 'none' }}>
        <DragIndicatorRounded />
      </Box>
      <Switch checked={shelf.visible} onChange={(e) => onToggle(e.target.checked)} inputProps={{ 'aria-label': `Show ${shelf.title}` }} />
      <Typography sx={{ flex: 1 }} color={shelf.visible ? 'text.primary' : 'text.secondary'}>{shelf.title}</Typography>
    </Box>
  )
}

/** Home lists: switch to show or hide each one, drag the handle (or Space + arrow keys) to change the order. */
function HomeShelvesSettings({ onError }) {
  const [shelves, setShelves] = useHomeShelves()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const save = (next) => setShelves(next).catch(onError)
  const toggle = (id, visible) => save(shelves.map((s) => (s.id === id ? { ...s, visible } : s)))
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const from = shelves.findIndex((s) => s.id === active.id)
    const to = shelves.findIndex((s) => s.id === over.id)
    save(arrayMove(shelves, from, to))
  }
  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shelves.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Home lists">
            {shelves.map((s) => <ShelfRow key={s.id} shelf={s} onToggle={(visible) => toggle(s.id, visible)} />)}
          </Box>
        </SortableContext>
      </DndContext>
      <Button sx={{ mt: 1 }} onClick={() => save([])}>Restore default</Button>
    </>
  )
}

export default function Settings({ session, onLogout }) {
  const { m3 } = useTheme()
  const { mode, setMode, dynamicColor, setDynamicColor, accent, setAccent } = useSettings()
  const notify = useUi((s) => s.notify)
  const { lyricsUnderCover, update: updatePreference } = usePreferences()
  const setPreference = (key, value) => updatePreference(key, value).catch((e) => notify(`Not saved: ${e.message}`))

  return (
    <Box sx={{ maxWidth: 760 }}>
      <PageTitle>Settings</PageTitle>
      <Typography variant="h5" component="h2" sx={{ mb: 1 }}>Appearance</Typography>
      <Row title="Theme">
        <ToggleButtonGroup exclusive value={mode} onChange={(_, v) => v && setMode(v)} aria-label="Theme" size="small"
          sx={{ '& .MuiToggleButton-root': { px: 2, borderRadius: 999, textTransform: 'none', gap: 1 } }}>
          <ToggleButton value="light"><LightModeRounded fontSize="small" />Light</ToggleButton>
          <ToggleButton value="dark"><DarkModeRounded fontSize="small" />Dark</ToggleButton>
          <ToggleButton value="system"><BrightnessAutoRounded fontSize="small" />System</ToggleButton>
        </ToggleButtonGroup>
      </Row>
      <Row title="Colors from album art" description="The interface takes its colors from the cover of the song playing.">
        <Switch checked={dynamicColor} onChange={(e) => setDynamicColor(e.target.checked)} inputProps={{ 'aria-label': 'Colors from album art' }} />
      </Row>
      <Row title="Accent color" description={dynamicColor ? 'Used when nothing is playing.' : undefined}>
        <Box sx={{ display: 'flex', gap: 1 }} role="radiogroup" aria-label="Accent color">
          {ACCENTS.map((c) => (
            <Box
              key={c}
              component="button"
              role="radio"
              aria-checked={accent === c}
              aria-label={`Accent ${c}`}
              onClick={() => setAccent(c)}
              sx={{ width: 36, height: 36, borderRadius: '50%', border: 0, bgcolor: c, cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#fff', outline: accent === c ? `2px solid ${m3.onSurface}` : 'none', outlineOffset: 2 }}
            >
              {accent === c && <CheckRounded fontSize="small" />}
            </Box>
          ))}
        </Box>
      </Row>

      <Divider sx={{ my: 2 }} />
      <Typography variant="h5" component="h2" sx={{ mb: 1 }}>Player</Typography>
      <Typography variant="body2" color="text.secondary">Saved to your account, on every device.</Typography>
      <Row title="Lyrics under the cover" description="Show the current lines of synced lyrics below the album cover in the now playing view, and the current line above the progress bar of the player.">
        <Switch checked={lyricsUnderCover} onChange={(e) => setPreference('lyricsUnderCover', e.target.checked)} inputProps={{ 'aria-label': 'Lyrics under the cover' }} />
      </Row>

      <Divider sx={{ my: 2 }} />
      <Typography variant="h5" component="h2" sx={{ mb: 1 }}>Home page</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Lists shown on the home page. Drag a list by its handle to change the order. Saved to your account, on every device.</Typography>
      <HomeShelvesSettings onError={(e) => notify(`Not saved: ${e.message}`)} />

      <Divider sx={{ my: 2 }} />
      <Typography variant="h5" component="h2" sx={{ mb: 1 }}>Library</Typography>
      {session.isAdmin && (
        <Row title="Administration" description="Library scan, users and rights, maintenance, import from another server, shares.">
          <Button variant="outlined" component={Link} to="/admin">Open</Button>
        </Row>
      )}
      <Row title="Mobile apps" description="Any Subsonic app (Symfonium, DSub, Substreamer, play:Sub...) works with this server address and your account." />

      <Divider sx={{ my: 2 }} />
      <Typography variant="h5" component="h2" sx={{ mb: 1 }}>Account</Typography>
      <Row title={session.name || session.username} description={`Signed in as ${session.username}${session.isAdmin ? ', administrator' : ''}`}>
        <Button variant="outlined" color="error" onClick={onLogout}>Sign out</Button>
      </Row>

      <Divider sx={{ my: 2 }} />
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        Cisum {config.cisumVersion || APP_VERSION}, based on Navidrome {config.version}
      </Typography>
    </Box>
  )
}
