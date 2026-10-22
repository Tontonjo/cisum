// Cisum web player v0.11.1 - Track list used by albums, playlists, songs, search and favorites.
// Missing tracks (file not found on disk) stay visible but greyed out and cannot be played.
import { useState, memo } from 'react'
import { Box, Typography, IconButton, Menu, MenuItem, ListItemIcon, Tooltip, Divider, useTheme, useMediaQuery } from '@mui/material'
import { Link, useNavigate } from 'react-router-dom'
import MoreVertRounded from '@mui/icons-material/MoreVertRounded'
import GraphicEqRounded from '@mui/icons-material/GraphicEqRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import LinkOffRounded from '@mui/icons-material/LinkOffRounded'
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded'
import QueuePlayNextRounded from '@mui/icons-material/QueuePlayNextRounded'
import AddToQueueRounded from '@mui/icons-material/AddToQueueRounded'
import PlaylistAddRounded from '@mui/icons-material/PlaylistAddRounded'
import AlbumRounded from '@mui/icons-material/AlbumRounded'
import PersonRounded from '@mui/icons-material/PersonRounded'
import DownloadRounded from '@mui/icons-material/DownloadRounded'
import ShareRounded from '@mui/icons-material/ShareRounded'
import { useCan } from '../store/me'
import ShareDialog from './ShareDialog'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { downloadUrl } from '../api/client'
import { formatTime } from '../utils/format'
import { intentProps } from '../api/preload'
import Cover from './Cover'
import StarButton from './StarButton'

/**
 * What a song row knows about its album (the album page header is drawn from it before loading).
 * The song artist is left out: it can differ from the album artist (compilations).
 * The cover is kept only when the song shows the album cover (same hash-suffixed id as the album page).
 */
const albumPreview = (t) => ({
  id: t.albumId, name: t.album, year: t.year,
  ...(t.coverArt?.startsWith(`al-${t.albumId}`) && { coverArt: t.coverArt }),
})

export function SongMenu({ track, anchor, onClose, extraItems = [] }) {
  const navigate = useNavigate()
  const { playNext, addToQueue } = usePlayer()
  const { pickPlaylist, notify } = useUi()
  const canDownload = useCan('download')
  const canShare = useCan('share')
  const [sharing, setSharing] = useState(false)
  const act = (fn) => () => {
    onClose()
    fn()
  }
  const playable = !track.missing
  return (
    <>
    <Menu anchorEl={anchor} open={!!anchor && !sharing} onClose={onClose}>
      {playable && (
        <MenuItem onClick={act(() => { playNext([track]); notify(`"${track.title}" plays next`) })}>
          <ListItemIcon><QueuePlayNextRounded fontSize="small" /></ListItemIcon>Play next
        </MenuItem>
      )}
      {playable && (
        <MenuItem onClick={act(() => { addToQueue([track]); notify(`"${track.title}" added to the queue`) })}>
          <ListItemIcon><AddToQueueRounded fontSize="small" /></ListItemIcon>Add to queue
        </MenuItem>
      )}
      {playable && (
        <MenuItem onClick={act(() => pickPlaylist([track]))}>
          <ListItemIcon><PlaylistAddRounded fontSize="small" /></ListItemIcon>Add to playlist
        </MenuItem>
      )}
      {playable && <Divider />}
      {track.albumId && (
        <MenuItem onClick={act(() => navigate(`/albums/${track.albumId}`))}>
          <ListItemIcon><AlbumRounded fontSize="small" /></ListItemIcon>Go to album
        </MenuItem>
      )}
      {track.artistId && (
        <MenuItem onClick={act(() => navigate(`/artists/${track.artistId}`))}>
          <ListItemIcon><PersonRounded fontSize="small" /></ListItemIcon>Go to artist
        </MenuItem>
      )}
      {playable && canDownload && (
        <MenuItem component="a" href={downloadUrl(track.id)} onClick={onClose}>
          <ListItemIcon><DownloadRounded fontSize="small" /></ListItemIcon>Download
        </MenuItem>
      )}
      {playable && canShare && (
        <MenuItem onClick={() => setSharing(true)}>
          <ListItemIcon><ShareRounded fontSize="small" /></ListItemIcon>Share
        </MenuItem>
      )}
      {extraItems.length > 0 && <Divider />}
      {extraItems.map((item) => (
        <MenuItem key={item.label} onClick={act(item.onClick)} sx={item.danger ? { color: 'error.main' } : undefined}>
          {item.icon && <ListItemIcon sx={item.danger ? { color: 'error.main' } : undefined}>{item.icon}</ListItemIcon>}
          {item.label}
        </MenuItem>
      ))}
    </Menu>
    {sharing && <ShareDialog open ids={[track.id]} title={`${track.title} - ${track.artist}`} onClose={() => { setSharing(false); onClose() }} />}
    </>
  )
}

const Row = memo(function Row({ track, number, showCover, showAlbum, detail, isCurrent, playing, onPlay, menuItems, sortable }) {
  const { m3 } = useTheme()
  const wide = useMediaQuery((t) => t.breakpoints.up('md'))
  const [anchor, setAnchor] = useState(null)
  const sort = useSortable({ id: track.rowKey, disabled: !sortable })
  const missing = track.missing

  const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }
  return (
    <Box
      ref={sort.setNodeRef}
      onClick={missing ? undefined : onPlay}
      onKeyDown={(e) => {
        if (!missing && e.key === 'Enter' && e.target === e.currentTarget) onPlay()
      }}
      tabIndex={missing ? -1 : 0}
      role="row"
      aria-disabled={missing || undefined}
      sx={{
        display: 'grid', alignItems: 'center', columnGap: 2, minHeight: 56, px: 1, borderRadius: 3,
        gridTemplateColumns: `${sortable ? '24px ' : ''}36px minmax(0, 2fr) ${showAlbum && wide ? 'minmax(0, 1.2fr) ' : ''}${detail ? 'auto ' : ''}auto 52px 40px`,
        cursor: missing ? 'default' : 'pointer',
        transform: CSS.Transform.toString(sort.transform), transition: sort.transition,
        position: 'relative', zIndex: sort.isDragging ? 2 : undefined,
        bgcolor: sort.isDragging ? m3.surfaceContainerHighest : isCurrent ? m3.secondaryContainer : 'transparent',
        color: isCurrent ? m3.onSecondaryContainer : undefined,
        '&:hover': { bgcolor: sort.isDragging ? undefined : isCurrent ? m3.secondaryContainer : 'action.hover' },
        '&:hover .tl-num': { display: missing ? undefined : 'none' },
        '&:hover .tl-play': { display: missing ? 'none' : 'inline-flex' },
      }}
    >
      {sortable && (
        <Box {...sort.attributes} {...sort.listeners} onClick={(e) => e.stopPropagation()} aria-label={`Move ${track.title}`} sx={{ cursor: 'grab', display: 'flex', color: m3.onSurfaceVariant, touchAction: 'none' }}>
          <DragIndicatorRounded fontSize="small" />
        </Box>
      )}
      <Box sx={{ display: 'grid', placeItems: 'center', color: isCurrent ? m3.primary : m3.onSurfaceVariant, fontVariantNumeric: 'tabular-nums', fontSize: '0.875rem' }}>
        {showCover ? (
          <Cover id={track.coverArt} size={40} radius={1.5} sx={{ opacity: missing ? 0.4 : 1 }} />
        ) : missing ? (
          <Tooltip title="File missing on disk. It stays in the playlist and reconnects when the file is found again.">
            <LinkOffRounded fontSize="small" />
          </Tooltip>
        ) : isCurrent && playing ? (
          <GraphicEqRounded fontSize="small" />
        ) : (
          <>
            <span className="tl-num">{number}</span>
            <PlayArrowRounded className="tl-play" fontSize="small" sx={{ display: 'none' }} />
          </>
        )}
      </Box>
      <Box sx={{ minWidth: 0, opacity: missing ? 0.45 : 1 }}>
        <Typography variant="body1" noWrap sx={{ fontWeight: 550, color: isCurrent ? m3.primary : undefined, fontStyle: missing ? 'italic' : undefined }}>
          {track.title}
        </Typography>
        <Typography variant="body2" noWrap color={isCurrent ? 'inherit' : 'text.secondary'} component="div" onClick={(e) => e.stopPropagation()}>
          {missing && 'Missing file. '}
          {track.artistId ? <Box component={Link} to={`/artists/${track.artistId}`} {...intentProps('artist', { id: track.artistId, name: track.artist })} sx={linkSx}>{track.artist}</Box> : track.artist}
        </Typography>
      </Box>
      {showAlbum && wide && (
        <Typography variant="body2" noWrap color="text.secondary" onClick={(e) => e.stopPropagation()} sx={{ opacity: missing ? 0.45 : 1 }}>
          {track.albumId ? <Box component={Link} to={`/albums/${track.albumId}`} {...intentProps('album', albumPreview(track))} sx={linkSx}>{track.album}</Box> : track.album}
        </Typography>
      )}
      {detail && (
        <Typography variant="body2" color="text.secondary" noWrap sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {detail(track)}
        </Typography>
      )}
      <Box sx={{ visibility: missing ? 'hidden' : 'visible' }}>
        <StarButton track={track} size="small" />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: missing ? 0.45 : 1 }}>
        {formatTime(track.duration)}
      </Typography>
      <IconButton size="small" aria-label={`More options for ${track.title}`} onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget) }}>
        <MoreVertRounded fontSize="small" />
      </IconButton>
      {anchor && <SongMenu track={track} anchor={anchor} onClose={() => setAnchor(null)} extraItems={menuItems?.(track) || []} />}
    </Box>
  )
})

/**
 * tracks: Track[]; numbering: 'track' (album numbers) | 'index'
 * menuItems(track): extra menu entries; onMove(from, to): enables drag and drop reorder.
 * detail(track): optional text column (e.g. "42 plays" while sorting by plays).
 */
export default function TrackList({ tracks, numbering = 'index', showCover = false, showAlbum = false, detail, menuItems, onMove, onPlay }) {
  const currentId = usePlayer((s) => s.queue[s.index]?.id)
  const playing = usePlayer((s) => s.playing)
  const playTracks = usePlayer((s) => s.playTracks)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const rows = tracks.map((t, i) => ({ ...t, rowKey: t.position ? `p${t.position}` : `${t.id}-${i}` }))

  const play = (i) => {
    if (onPlay) return onPlay(i)
    // Missing tracks are skipped by the queue, so compute the index among playable tracks
    const playable = tracks.filter((t) => !t.missing)
    const start = playable.indexOf(tracks[i])
    playTracks(playable, Math.max(start, 0))
  }

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const from = rows.findIndex((r) => r.rowKey === active.id)
    const to = rows.findIndex((r) => r.rowKey === over.id)
    onMove?.(from, to)
  }

  const list = rows.map((t, i) => (
    <Row
      key={t.rowKey}
      track={t}
      number={numbering === 'track' ? t.track || i + 1 : i + 1}
      showCover={showCover}
      showAlbum={showAlbum}
      detail={detail}
      isCurrent={t.id === currentId && !t.missing}
      playing={playing}
      onPlay={() => play(i)}
      menuItems={menuItems}
      sortable={!!onMove}
    />
  ))

  return (
    <Box role="table" aria-label="Songs">
      {onMove ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.rowKey)} strategy={verticalListSortingStrategy}>
            {list}
          </SortableContext>
        </DndContext>
      ) : (
        <DndContext>
          <SortableContext items={[]}>{list}</SortableContext>
        </DndContext>
      )}
    </Box>
  )
}
