import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import FilterBar from './FilterBar'

interface Props {
  title?: string
  subtitle?: string
  children: ReactNode
  showFilters?: boolean
}

export default function ReportShell({ subtitle, children, showFilters = true }: Props) {
  return (
    <Box
      sx={{
        // Smooth page entrance: content fades in and settles upward.
        '@keyframes pageIn': {
          from: { opacity: 0, transform: 'translateY(10px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        animation: 'pageIn .35s ease-out',
      }}
    >
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {subtitle}
        </Typography>
      )}
      {showFilters && <FilterBar />}
      {children}
    </Box>
  )
}
