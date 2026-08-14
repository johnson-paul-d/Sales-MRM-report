import { useMemo } from 'react'
import { Box, Paper, Typography, CircularProgress, Alert } from '@mui/material'
import ReactECharts from 'echarts-for-react'
import type { ColDef } from 'ag-grid-community'
import ReportShell from '../components/ReportShell'
import DataTable from '../components/DataTable'
import KpiCard from '../components/KpiCard'
import { col } from './reportConfigs'
import { pieLabel } from '../components/chartLabels'
import { useLeads } from '../api/hooks'
import { useReportFilters } from '../state/FiltersContext'
import { fmtInt } from '../components/formatters'
import { CHART } from '../theme'

// Columns, order + headers exactly as the pbix Leads detail tableEx (raw field names)
const detailColumns: ColDef[] = [
  col('company', 'Company', 'text', { flex: 2 }),
  col('city', 'City'),
  col('email', 'Email', 'text', { minWidth: 180 }),
  col('lead_name', 'LastName', 'text', { minWidth: 160 }),
  col('lead_source', 'LeadSource'),
  col('mobile_phone', 'MobilePhone'),
  col('user_name', 'User name', 'text', { minWidth: 160 }),
]

// PBI pivot column order: known statuses first, anything new appended
const STATUS_ORDER = ['New', 'Working', 'Qualified', 'Unqualified', 'Dropped', 'Dormant']

export default function LeadsPage() {
  const { filters } = useReportFilters()
  const { data, isLoading, error } = useLeads(filters)

  // Pivot user x status counts into one row per salesperson (PBI Leads pivot)
  const { pivotRows, pivotColumns } = useMemo(() => {
    const cells = data?.by_user_status ?? []
    const present = new Set(cells.map((c) => c.status || 'Unknown'))
    const statuses = [
      ...STATUS_ORDER.filter((s) => present.has(s)),
      ...[...present].filter((s) => !STATUS_ORDER.includes(s)).sort(),
    ]
    const m = new Map<string, Record<string, any>>()
    for (const c of cells) {
      const key = c.user_name || '—'
      if (!m.has(key)) m.set(key, { user_name: key, total: 0 })
      const row = m.get(key)!
      row[c.status || 'Unknown'] = Number(c.total_leads)
      row.total += Number(c.total_leads)
    }
    const rows = [...m.values()].sort((a, b) => b.total - a.total)
    const columns: ColDef[] = [
      col('user_name', 'User name', 'text', { minWidth: 160 }),   // pbix pivot row header
      ...statuses.map((s) => col(s, s, 'int')),
      col('total', 'Total', 'int'),
    ]
    return { pivotRows: rows, pivotColumns: columns }
  }, [data])

  const sources = (data?.by_source ?? []).filter((s) => s.lead_source)
  const donutOption = {
    color: CHART.palette,
    tooltip: { trigger: 'item' },
    legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 11 } },
    series: [
      {
        type: 'pie',
        radius: ['36%', '60%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: pieLabel(false),
        data: sources.map((s) => ({ name: s.lead_source, value: Number(s.total_leads) })),
      },
    ],
  }

  return (
    <ReportShell title="Leads" subtitle="Lead volume and conversion — scoped to your team">
      {error ? (
        <Alert severity="error">Failed to load leads.</Alert>
      ) : isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(3,1fr)' },
              gap: 2,
              mb: 2,
              maxWidth: 640,
            }}
          >
            <KpiCard label="Total Leads" value={fmtInt(data?.overall.total_leads)} color={CHART.open} />
            <KpiCard label="Converted" value={fmtInt(data?.overall.converted_leads)} color={CHART.won} />
            <KpiCard label="Conversion" value={`${data?.overall.conversion_ratio_pct ?? 0}%`} color="#9B2423" />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Leads by Source — CPS team, current + previous FY
              </Typography>
              <ReactECharts option={donutOption} style={{ height: 320 }} notMerge />
            </Paper>
            <Paper variant="outlined" sx={{ p: 0 }}>
              <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>
                By Salesperson — CPS team, current + previous FY
              </Typography>
              <DataTable rows={pivotRows} columns={pivotColumns} height={320} />
            </Paper>
          </Box>

          <Paper variant="outlined" sx={{ p: 0, mt: 2 }}>
            <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>
              All Leads
            </Typography>
            <DataTable rows={data?.rows ?? []} columns={detailColumns} height={420} />
          </Paper>
        </>
      )}
    </ReportShell>
  )
}
