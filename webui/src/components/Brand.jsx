// Cisum web player v0.1.0 - Brand mark: four waveform bars, tinted with the current theme.
import { useTheme } from '@mui/material'

export function BrandMark({ size = 32 }) {
  const { m3 } = useTheme()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill={m3.primary} style={{ transition: 'fill 600ms' }} />
      <g fill={m3.onPrimary}>
        <rect x="12" y="26" width="6" height="12" rx="3" />
        <rect x="22" y="18" width="6" height="28" rx="3" />
        <rect x="32" y="12" width="6" height="40" rx="3" />
        <rect x="42" y="22" width="6" height="20" rx="3" />
      </g>
    </svg>
  )
}
