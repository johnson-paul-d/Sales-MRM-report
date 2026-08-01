import { Box, Paper, Typography, CircularProgress, Alert } from '@mui/material'
import ReactECharts from 'echarts-for-react'
import type { ColDef } from 'ag-grid-community'
import ReportShell from '../components/ReportShell'
import DataTable from '../components/DataTable'
import KpiCard from '../components/KpiCard'
import { col } from './reportConfigs'
import { useLeads } from '../api/hooks'
import { useReportFilters } from '../state/FiltersContext'
import { fmtInt } from '../components/formatters'

const userColumns: ColDef[] = [
  col('user_name', 'Salesperson', 'text', { minWidth: 180 }),
  col('total_leads', 'Total Leads', 'int'),
  col('converted_leads', 'Converted', 'int'),
  {
    headerName: 'Conversion %',
    type: 'numericColumn',
    valueGetter: (p) => {
      const t = Number(p.data?.total_leads || 0)
      const c = Number(p.data?.converted_leads || 0)
      return t ? Math.round((c / t) * 1000) / 10 : 0
    },
    valueFormatter: (p) => `${p.value}%`,
  },
]

export default function LeadsPage() {
  const { filters } = useReportFilters()
  const { data, isLoading, error } = useLeads(filters)

  const sources = (data?.by_source ?? []).filter((s) => s.lead_source)
  const donutOption = {
    tooltip: { trigger: 'item' },
    legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 11 } },
    series: [
      {
        type: 'pie',
        radius: ['42%', '70%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
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
            <KpiCard label="Total Leads" value={fmtInt(data?.overall.total_leads)} />
            <KpiCard label="Converted" value={fmtInt(data?.overall.converted_leads)} color="#15803d" />
            <KpiCard label="Conversion" value={`${data?.overall.conversion_ratio_pct ?? 0}%`} color="#1e3a8a" />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Leads by Source
              </Typography>
              <ReactECharts option={donutOption} style={{ height: 320 }} notMerge />
            </Paper>
            <Paper variant="outlined" sx={{ p: 0 }}>
              <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>
                By Salesperson
              </Typography>
              <DataTable rows={data?.by_user ?? []} columns={userColumns} height={320} />
            </Paper>
          </Box>
        </>
      )}
    </ReportShell>
  )
}
