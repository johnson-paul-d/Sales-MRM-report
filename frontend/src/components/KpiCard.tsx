import { Card, CardContent, Typography, Box } from '@mui/material'

interface Props {
  label: string
  value: string
  sub?: string
  color?: string
}

export default function KpiCard({ label, value, sub, color = '#9B2423' }: Props) {
  return (
    <Card
      sx={{
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        transition: 'box-shadow .2s ease, transform .2s ease',
        '&:hover': { boxShadow: '0 10px 26px rgba(16,24,40,0.10)', transform: 'translateY(-2px)' },
      }}
    >
      <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: color }} />
      <CardContent sx={{ py: 1.75, pl: 2.5, '&:last-child': { pb: 1.75 } }}>
        <Typography
          variant="caption"
          sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, color: 'text.secondary' }}
        >
          {label}
        </Typography>
        <Typography sx={{ fontSize: 26, fontWeight: 800, color: 'text.primary', mt: 0.25, lineHeight: 1.15 }}>
          {value}
        </Typography>
        {sub && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
