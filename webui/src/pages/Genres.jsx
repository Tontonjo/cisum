// Cisum web player v0.11.6 - All genres with a quick filter and a remembered sort.
// Each genre opens its page (albums, artists and songs of that genre).
import { useState } from 'react'
import { Box, TextField, InputAdornment, Typography, useTheme } from '@mui/material'
import { Link } from 'react-router-dom'
import FilterListRounded from '@mui/icons-material/FilterListRounded'
import { useQuery } from '@tanstack/react-query'
import { GENRE_SORTS, sortDetail } from '../api/library'
import { genresQuery } from '../api/genres'
import { useClientSort } from '../utils/sort'
import { plural } from '../utils/format'
import { CardGrid, PageTitle, EmptyState } from '../components/Cards'
import SortChips from '../components/SortChips'

function GenreCard({ genre, detail }) {
  const { m3 } = useTheme()
  return (
    <Box
      component={Link}
      to={`/genres/${genre.id}`}
      sx={{
        display: 'block', minWidth: 0, p: 2, borderRadius: 4, textDecoration: 'none',
        bgcolor: m3.surfaceContainerHigh, color: m3.onSurface,
        '&:hover, &:focus-visible': { bgcolor: m3.secondaryContainer, color: m3.onSecondaryContainer },
      }}
    >
      <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600 }}>{genre.name}</Typography>
      <Typography variant="body2" noWrap sx={{ opacity: 0.75 }}>
        {detail || `${plural(genre.albumCount, 'album')}, ${plural(genre.songCount, 'song')}`}
      </Typography>
    </Box>
  )
}

export default function Genres() {
  const [filter, setFilter] = useState('')
  const { data, isSuccess } = useQuery(genresQuery)
  const { sort, onSort, sorted } = useClientSort('genres', GENRE_SORTS, 'name', data)
  const f = filter.trim().toLowerCase()
  const shown = f ? sorted.filter((g) => g.name.toLowerCase().includes(f)) : sorted
  return (
    <>
      <PageTitle
        actions={
          <TextField
            size="small"
            placeholder="Filter genres"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            hiddenLabel
            InputProps={{ startAdornment: <InputAdornment position="start"><FilterListRounded /></InputAdornment>, disableUnderline: true, sx: { borderRadius: 999 } }}
            inputProps={{ 'aria-label': 'Filter genres' }}
          />
        }
      >
        Genres
      </PageTitle>
      <SortChips options={GENRE_SORTS} value={sort} onChange={onSort} />
      {isSuccess && !shown.length && (
        <EmptyState title="No genre found">{f ? 'Try another name.' : 'Genres come from the tags of your music files.'}</EmptyState>
      )}
      <CardGrid min={190}>
        {shown.map((g) => <GenreCard key={g.id} genre={g} detail={sort.key !== 'name' && sortDetail(GENRE_SORTS, sort, g)} />)}
      </CardGrid>
    </>
  )
}
