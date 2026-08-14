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

// Rows then Values exactly as the pbix New Opportunity - Last Month pivotTable
const columns: ColDef[] = [
  col('user_name', 'User Name'),
  col('opportunity_name', 'Opp name', 'text', { flex: 2 }),
  col('stage_name', 'StageName'),
  col('latest_action_task', 'Next Action', 'text', { flex: 2 }),
  col('action_activity_date', 'Due date', 'date'),
  col('project_stage', 'Project_stage__c'),
  col('quantity', 'Car spaces', 'int'),
  col('quote_total_price', 'Amount', 'inr'),
  col('building_construction_stage', 'Building stage'),
]

export default function NewOpportunityPage() {
  const { filters } = useReportFilters()
  const { data, isLoading, error } = useNewOpportunity(filters)

  const byUser = data?.by_user ?? []
  const total = byUser.reduce((s, u) => s + u.count, 0)
  const chartOption = {
    grid: { left: 8, right: 16, top: 20, bottom: 70, containLabel: true },
    tooltip: {
      trigger: 'axis',
      // PBI tooltip: Min of building_construction_stage__c
      formatter: (ps: any[]) => {
        const u = byUser[ps[0]?.dataIndex]
        return `<b>${ps[0]?.name}</b><br/>New Opportunities: ${ps[0]?.value}` +
          (u?.min_construction_stage ? `<br/>Min Construction Stage: ${u.min_construction_stage}` : '')
      },
    },
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
