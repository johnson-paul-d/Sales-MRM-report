import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#4f46e5', dark: '#3730a3', light: '#6366f1' },
    secondary: { main: '#0891b2' },
    success: { main: '#059669' },
    error: { main: '#dc2626' },
    warning: { main: '#d97706' },
    info: { main: '#0284c7' },
    background: { default: '#f1f5f9', paper: '#ffffff' },
    text: { primary: '#1e293b', secondary: '#64748b' },
    divider: '#e2e8f0',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'Inter, "Segoe UI", Roboto, system-ui, sans-serif',
    h4: { fontWeight: 800, letterSpacing: -0.5 },
    h5: { fontWeight: 800, letterSpacing: -0.3 },
    h6: { fontWeight: 700 },
    subtitle2: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 8 } } },
    MuiPaper: { styleOverrides: { outlined: { borderColor: '#e2e8f0' } } },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: { border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: '#eef2f6' },
        head: { fontWeight: 700, color: '#475569', backgroundColor: '#f8fafc', fontSize: 12, letterSpacing: 0.2 },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
  },
})
