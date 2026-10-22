// Cisum web player v0.1.0 - Play queue: drag to reorder, click to jump, remove items.
import { Box, Typography, IconButton, Button, useTheme } from '@mui/material'
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import GraphicEqRounded from '@mui/icons-material/GraphicEqRounded'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { usePlayer } from '../store/player'
import { formatTime, formatLength, plural } from '../utils/format'
import Cover from './Cover'

function QueueRow({ track, index, isCurrent }) {
  const { m3 } = useTheme()
  const { jumpTo, removeFromQueue } = usePlayer()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.qkey })
  return (
    <Box
      ref={setNodeRef}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1, pr: 0.5, py: 0.5, borderRadius: 3,
        transform: CSS.Transform.toString(transform), transition,
        bgcolor: isDragging ? m3.surfaceContainerHighest : isCurrent ? m3.secondaryContainer : 'transparent',
        color: isCurrent ? m3.onSecondaryContainer : undefined,
        zIndex: isDragging ? 2 : undefined, position: 'relative',
        '&:hover .q-remove': { opacity: 1 },
      }}
    >
      <Box {...attributes} {...listeners} aria-label={`Move ${track.title}`} sx={{ cursor: 'grab', display: 'flex', color: m3.onSurfaceVariant, touchAction: 'none', pl: 0.5 }}>
        <DragIndicatorRounded fontSize="small" />
      </Box>
      <Box component="button" onClick={() => jumpTo(index)} sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.5, border: 0, bgcolor: 'transparent', color: 'inherit', p: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
        <Box sx={{ position: 'relative' }}>
          <Cover id={track.coverArt} size={44} radius={1.5} />
          {isCurrent && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,.45)', borderRadius: 1.5, color: '#fff' }}>
              <GraphicEqRounded fontSize="small" />
            </Box>
          )}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{track.title}</Typography>
          <Typography variant="caption" noWrap component="div" sx={{ opacity: 0.75 }}>{track.artist}</Typography>
        </Box>
        <Typography variant="caption" sx={{ opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>{formatTime(track.duration)}</Typography>
      </Box>
      <IconButton className="q-remove" size="small" aria-label={`Remove ${track.title} from queue`} onClick={() => removeFromQueue(track.qkey)} sx={{ opacity: { xs: 1, md: 0 }, transition: 'opacity 150ms', '&:focus-visible': { opacity: 1 } }}>
        <CloseRounded fontSize="small" />
      </IconButton>
    </Box>
  )
}

export default function QueuePanel() {
  const { queue, index, moveInQueue, clearQueue } = usePlayer()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const remaining = queue.slice(index + 1).reduce((sum, t) => sum + (t.duration || 0), 0)

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const from = queue.findIndex((t) => t.qkey === active.id)
    const to = queue.findIndex((t) => t.qkey === over.id)
    moveInQueue(from, to)
  }

  if (!queue.length) {
    return <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>The queue is empty. Play an album or a song to fill it.</Typography>
  }

  return (
    <Box sx={{ py: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, px: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {plural(queue.length, 'song')}, {formatLength(remaining)} left
        </Typography>
        <Button size="small" onClick={clearQueue}>Clear queue</Button>
      </Box>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={queue.map((t) => t.qkey)} strategy={verticalListSortingStrategy}>
          {queue.map((t, i) => (
            <QueueRow key={t.qkey} track={t} index={i} isCurrent={i === index} />
          ))}
        </SortableContext>
      </DndContext>
    </Box>
  )
}
