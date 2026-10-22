// Cisum web player v0.6.0 - All artists with a quick filter and a remembered sort.
import { useState } from 'react'
import { TextField, InputAdornment } from '@mui/material'
import FilterListRounded from '@mui/icons-material/FilterListRounded'
import { useQuery } from '@tanstack/react-query'
import { getArtists, ARTIST_SORTS, sortDetail } from '../api/library'
import { useClientSort } from '../utils/sort'
import { ArtistCard, CardGrid, PageTitle, EmptyState } from '../components/Cards'
import SortChips from '../components/SortChips'

export default function Artists() {
  const [filter, setFilter] = useState('')
  const { data, isSuccess } = useQuery({ queryKey: ['artists'], queryFn: getArtists })
  const { sort, onSort, sorted } = useClientSort('artists', ARTIST_SORTS, 'name', data)
  const f = filter.trim().toLowerCase()
  const shown = f ? sorted.filter((a) => a.name.toLowerCase().includes(f)) : sorted
  return (
    <>
      <PageTitle
        actions={
          <TextField
            size="small"
            placeholder="Filter artists"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            hiddenLabel
            InputProps={{ startAdornment: <InputAdornment position="start"><FilterListRounded /></InputAdornment>, disableUnderline: true, sx: { borderRadius: 999 } }}
            inputProps={{ 'aria-label': 'Filter artists' }}
          />
        }
      >
        Artists
      </PageTitle>
      <SortChips options={ARTIST_SORTS} value={sort} onChange={onSort} />
      {isSuccess && !shown.length && <EmptyState title="No artist found">Try another name.</EmptyState>}
      <CardGrid min={150}>
        {shown.map((a) => <ArtistCard key={a.id} artist={a} detail={sortDetail(ARTIST_SORTS, sort, a)} />)}
      </CardGrid>
    </>
  )
}
