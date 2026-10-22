// Cisum web player v0.6.0 - Filter chips used to sort lists.
// Clicking the selected chip again reverses the direction; an arrow shows the current direction.
import { Box, Chip } from '@mui/material'
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded'
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded'
import ShuffleRounded from '@mui/icons-material/ShuffleRounded'

// Selected chip keeps its tonal colors on hover and focus (MUI would switch to secondary.dark)
const selectedSx = {
  bgcolor: (t) => t.m3.secondaryContainer,
  color: (t) => t.m3.onSecondaryContainer,
  '&:hover, &.Mui-focusVisible': { bgcolor: (t) => t.m3.secondaryContainer, filter: 'brightness(0.96)' },
  '& .MuiChip-icon': { color: 'inherit' },
}

/**
 * options: { [key]: { label, order: default direction, random?: true } }
 * value: { key, dir }; onChange({ key, dir })
 */
export default function SortChips({ options, value, onChange, sx }) {
  const select = (key) => {
    const o = options[key]
    if (key !== value.key) onChange({ key, dir: o.order })
    else if (!o.random) onChange({ key, dir: value.dir === 'ASC' ? 'DESC' : 'ASC' })
    else onChange({ key, dir: value.dir }) // same random sort: lets the page reshuffle
  }
  return (
    <Box role="radiogroup" aria-label="Sort by" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3, ...sx }}>
      {Object.entries(options).map(([key, o]) => {
        const selected = key === value.key
        const ascending = value.dir === 'ASC'
        let icon
        if (selected) icon = o.random ? <ShuffleRounded /> : ascending ? <ArrowUpwardRounded /> : <ArrowDownwardRounded />
        return (
          <Chip
            key={key}
            role="radio"
            aria-checked={selected}
            aria-label={selected && !o.random ? `${o.label}, ${ascending ? 'ascending' : 'descending'}. Click to reverse.` : o.label}
            title={selected && !o.random ? (ascending ? 'Ascending, click to reverse' : 'Descending, click to reverse') : undefined}
            label={o.label}
            icon={icon}
            onClick={() => select(key)}
            variant={selected ? 'filled' : 'outlined'}
            color={selected ? 'secondary' : 'default'}
            sx={selected ? selectedSx : undefined}
          />
        )
      })}
    </Box>
  )
}
