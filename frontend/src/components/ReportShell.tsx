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
    <Box>
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
