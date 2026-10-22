// Cisum web player v0.1.0 - Material 3 theme built from a seed color.
// Tones come from Google's material-color-utilities (SchemeTonalSpot), then mapped onto MUI.
// The full M3 role set is exposed as theme.m3 for components that need container/surface roles.
import { createTheme, alpha } from '@mui/material/styles'
import {
  Hct,
  SchemeTonalSpot,
  MaterialDynamicColors as C,
  hexFromArgb,
  argbFromHex,
  sourceColorFromImage,
} from '@material/material-color-utilities'

export const DEFAULT_SEED = '#3F5F90'

const ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'onSurface', 'onSurfaceVariant', 'surfaceDim', 'surfaceBright',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
  'surfaceContainerHigh', 'surfaceContainerHighest',
  'outline', 'outlineVariant', 'inverseSurface', 'inverseOnSurface', 'inversePrimary',
]

export function schemeFromSeed(seedHex, dark) {
  const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seedHex)), dark, 0)
  const roles = {}
  for (const r of ROLES) roles[r] = hexFromArgb(C[r].getArgb(scheme))
  return roles
}

/** Extracts the most representative color of an image URL (same-origin). Returns hex or null. */
export async function seedFromImage(url) {
  if (!url) return null
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return hexFromArgb(await sourceColorFromImage(img))
  } catch {
    return null
  }
}

const displayFont = '"Bricolage Grotesque Variable", "Figtree Variable", system-ui, sans-serif'
const bodyFont = '"Figtree Variable", system-ui, -apple-system, "Segoe UI", sans-serif'

export function buildTheme(seedHex, mode) {
  const dark = mode === 'dark'
  const m3 = schemeFromSeed(seedHex || DEFAULT_SEED, dark)

  return createTheme({
    m3,
    palette: {
      mode,
      primary: { main: m3.primary, contrastText: m3.onPrimary },
      secondary: { main: m3.secondary, contrastText: m3.onSecondary },
      error: { main: m3.error, contrastText: m3.onError },
      background: { default: m3.surface, paper: m3.surfaceContainer },
      text: { primary: m3.onSurface, secondary: m3.onSurfaceVariant },
      divider: m3.outlineVariant,
      action: { hover: alpha(m3.onSurface, 0.08), selected: alpha(m3.onSurface, 0.12) },
    },
    shape: { borderRadius: 4 }, // sx radius units: 3 = 12px, 4 = 16px, 7 = 28px
    typography: {
      fontFamily: bodyFont,
      // Type scale based on M3, display/headline roles use the display face
      h1: { fontFamily: displayFont, fontSize: '3.5rem', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em' },
      h2: { fontFamily: displayFont, fontSize: '2.75rem', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.015em' },
      h3: { fontFamily: displayFont, fontSize: '2rem', fontWeight: 650, lineHeight: 1.15, letterSpacing: '-0.01em' },
      h4: { fontFamily: displayFont, fontSize: '1.5rem', fontWeight: 650, lineHeight: 1.2 },
      h5: { fontFamily: displayFont, fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.25 },
      h6: { fontSize: '1rem', fontWeight: 650, lineHeight: 1.4 },
      subtitle1: { fontSize: '1rem', fontWeight: 550 },
      subtitle2: { fontSize: '0.875rem', fontWeight: 600 },
      body1: { fontSize: '1rem', lineHeight: 1.5 },
      body2: { fontSize: '0.875rem', lineHeight: 1.45 },
      caption: { fontSize: '0.75rem', lineHeight: 1.35 },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.01em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: m3.surface,
            transition: 'background-color 600ms ease, color 600ms ease',
            scrollbarColor: `${m3.outlineVariant} transparent`,
          },
          '::selection': { background: m3.primaryContainer, color: m3.onPrimaryContainer },
          ':focus-visible': { outline: `2px solid ${m3.primary}`, outlineOffset: 2 },
          '@media (prefers-reduced-motion: reduce)': {
            '*': { transitionDuration: '0ms !important', animationDuration: '0ms !important' },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 999, paddingInline: 20, minHeight: 40 } },
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: 999 } } },
      MuiFab: { styleOverrides: { root: { borderRadius: 16, boxShadow: 'none', textTransform: 'none' } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: 28, backgroundColor: m3.surfaceContainerHigh, padding: 8 } },
      },
      MuiMenu: {
        styleOverrides: { paper: { borderRadius: 12, backgroundColor: m3.surfaceContainer, minWidth: 200 } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { backgroundColor: m3.inverseSurface, color: m3.inverseOnSurface, fontSize: '0.75rem', borderRadius: 6 },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 550 } } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 48 } } },
      MuiTextField: { defaultProps: { variant: 'filled' } },
      MuiFilledInput: {
        styleOverrides: {
          root: { borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: m3.surfaceContainerHighest },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: { root: { backgroundColor: m3.inverseSurface, color: m3.inverseOnSurface, borderRadius: 8 } },
      },
      MuiSlider: { styleOverrides: { thumb: { boxShadow: 'none' } } },
    },
  })
}
