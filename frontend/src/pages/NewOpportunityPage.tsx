import { Box, Paper, Typography, CircularProgress, Alert } from '@mui/material'
import ReactECharts from 'echarts-for-react'
import type { ColDef } from 'ag-grid-community'
import ReportShell from '../components/ReportShell'
import DataTable from '../components/DataTable'
import KpiCard from '../components/KpiCard'
import { col } from './reportConfigs'
import { useNewOpportunity } from '../api/hooks'
import { useReportFilters } from '../state/FiltersContext'
import { fmtInt } from '../components/formatters'
import { CHART } from '../theme'

const columns: ColDef[] = [
  col('user_name', 'Salesperson'),
  col('region_name', 'Region'),
  col('opportunity_name', 'Opportunity', 'text', { flex: 2 }),
  col('stage_name', 'Stage'),
  col('created_date_only', 'Created', 'date'),
  col('quantity', 'Qty', 'int'),
  col('quote_total_price', 'Quoted Value', 'inr'),
  col('project_stage', 'Project Stage'),
  col('building_construction_stage', 'Construction Stage'),
  col('latest_action_task', 'Latest Task', 'text', { flex: 2 }),
  col('action_activity_date', 'Task Date', 'date'),
]

export default function NewOpportunityPage() {
  const { filters } = useReportFilters()
  const { data, isLoading, error } = useNewOpportunity(filters)

  const byUser = data?.by_user ?? []
  const total = byUser.reduce((s, u) => s + u.count, 0)
  const chartOption = {
    grid: { left: 8, right: 16, top: 20, bottom: 70, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: byUser.map((u) => u.user_name), axisLabel: { rotate: 35, fontSize: 10 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        type: 'bar',
        name: 'New Opportunities',
        data: byUser.map((u) => u.count),
        itemStyle: { color: CHART.open, borderRadius: [4, 4, 0, 0] },
      },
    ],
  }

  return (
    <ReportShell title="New Opportunity — Last Month" subtitle="Opportunities created last month, by salesperson">
      {error ? (
        <Alert severity="error">Failed to load.</Alert>
      ) : isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, mb: 2, maxWidth: 420 }}>
            <KpiCard label="New Opportunities" value={fmtInt(total)} color={CHART.open} />
            <KpiCard label="Salespeople" value={fmtInt(byUser.length)} />
          </Box>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              New Opportunities by Salesperson
            </Typography>
            <ReactECharts option={chartOption} style={{ height: 280 }} notMerge />
          </Paper>
          <DataTable rows={data?.rows ?? []} columns={columns} height="calc(100vh - 560px)" />
        </>
      )}
    </ReportShell>
  )
}
