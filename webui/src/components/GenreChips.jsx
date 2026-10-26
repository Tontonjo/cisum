// Cisum web player v0.11.6 - Genre names shown as chips linking to their genre page.
// A name not (yet) found in the genre list is shown as a plain chip.
import { Box, Chip } from '@mui/material'
import { Link } from 'react-router-dom'
import { useGenreIds } from '../api/genres'

export default function GenreChips({ genres, sx }) {
  const idOf = useGenreIds()
  if (!genres?.length) return null
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.25, ...sx }}>
      {genres.map((name) => {
        const id = idOf(name)
        return id
          ? <Chip key={name} label={name} size="small" clickable component={Link} to={`/genres/${id}`} />
          : <Chip key={name} label={name} size="small" />
      })}
    </Box>
  )
}
