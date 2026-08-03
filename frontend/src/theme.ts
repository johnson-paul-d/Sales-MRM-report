import { createTheme } from '@mui/material/styles'

// ============================================================
//  Sieger brand — "Partnering Progress"
//  Signal Red #9B2423 · Standard Black #000 · Cream #F3ECE0
// ============================================================
export const BRAND = {
  red: '#9B2423',       // Signal Red (Pantone 1807C)
  redDark: '#7d1c1b',
  redLight: '#b83533',
  black: '#141414',
  cream: '#F3ECE0',
  creamSoft: '#F7F3EC',
  ink: '#1a1a1a',
  line: '#ece3d5',
}

// Chart colours — semantic (won/lost/…) + a brand-harmonious categorical ramp.
export const CHART = {
  won: '#2E7D45',
  lost: BRAND.red,
  dropped: '#B0762A',
  open: '#3E5C76',
  live: '#6B4E8C',
  neutral: '#8a7f6f',
  palette: ['#9B2423', '#3E5C76', '#B0762A', '#2E7D45', '#6B4E8C', '#C99A2E', '#4B6858', '#8a7f6f'],
}

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: BRAND.red, dark: BRAND.redDark, light: BRAND.redLight, contrastText: '#ffffff' },
    secondary: { main: '#3E5C76' },
    success: { main: '#2E7D45' },
    error: { main: '#b3261e' },
    warning: { main: '#B0762A' },
    info: { main: '#3E5C76' },
    background: { default: BRAND.creamSoft, paper: '#ffffff' },
    text: { primary: BRAND.ink, secondary: '#6b6257' },
    divider: BRAND.line,
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Effra", "Inter", "Segoe UI", Roboto, system-ui, sans-serif',
    h4: { fontWeight: 800, letterSpacing: -0.5 },
    h5: { fontWeight: 800, letterSpacing: -0.3 },
    h6: { fontWeight: 700 },
    subtitle2: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 8 } } },
    MuiPaper: { styleOverrides: { outlined: { borderColor: BRAND.line } } },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: { border: `1px solid ${BRAND.line}`, boxShadow: '0 1px 2px rgba(60,40,20,0.05)' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: '#f2ece1' },
        head: { fontWeight: 700, color: '#6b6257', backgroundColor: '#faf6ef', fontSize: 12, letterSpacing: 0.2 },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
  },
})
