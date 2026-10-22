// Cisum web player v0.5.0 - Building blocks for the administration panel.
import { Box, Typography, LinearProgress, useTheme } from '@mui/material'

/** A titled block of settings or information. */
export function Panel({ title, description, actions, children }) {
  const { m3 } = useTheme()
  return (
    <Box component="section" sx={{ bgcolor: m3.surfaceContainerLow, borderRadius: 6, p: { xs: 2, md: 3 }, mb: 3 }}>
      {(title || actions) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: description ? 0.5 : 2 }}>
          <Typography variant="h5" component="h2" sx={{ flex: 1 }}>{title}</Typography>
          {actions}
        </Box>
      )}
      {description && <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: '75ch' }}>{description}</Typography>}
      {children}
    </Box>
  )
}

/** A big number with its label, used for library statistics. */
export function Stat({ value, label }) {
  return (
    <Box sx={{ minWidth: 120 }}>
      <Typography sx={{ fontFamily: '"Bricolage Grotesque Variable", sans-serif', fontSize: '2rem', fontWeight: 700, lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
    </Box>
  )
}

/** Label / value lines. */
export function InfoList({ items }) {
  return (
    <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(160px, auto) 1fr' }, columnGap: 3, rowGap: 1, m: 0 }}>
      {items.filter(Boolean).map(([label, value]) => (
        <Box key={label} sx={{ display: 'contents' }}>
          <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, wordBreak: 'break-all', fontWeight: 550 }}>{value}</Typography>
        </Box>
      ))}
    </Box>
  )
}

/**
 * Progress of a running task: a bar with its percentage, or an animated bar when the task
 * cannot measure its progress (value null or negative).
 */
export function TaskProgress({ label, value }) {
  const known = typeof value === 'number' && value >= 0
  const pct = known ? Math.min(Math.round(value), 100) : null
  return (
    <Box role="status" aria-live="polite" sx={{ my: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 0.75 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{known ? `${pct} %` : 'in progress'}</Typography>
      </Box>
      <LinearProgress variant={known ? 'determinate' : 'indeterminate'} value={pct ?? 0} sx={{ height: 8, borderRadius: 4 }} />
    </Box>
  )
}
