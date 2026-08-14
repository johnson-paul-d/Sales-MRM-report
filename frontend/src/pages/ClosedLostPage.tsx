import { useMemo, type ReactNode } from 'react'
import { Box, Paper, Typography, CircularProgress, Alert } from '@mui/material'
import ReactECharts from 'echarts-for-react'
import ReportShell from '../components/ReportShell'
import DataTable from '../components/DataTable'
import KpiCard from '../components/KpiCard'
import { REPORTS } from './reportConfigs'
import { barLabel, colLabel, pieLabel, fmtMonthName, AXIS_FONT, LEGEND_FONT } from '../components/chartLabels'
import { gradV, gradH, DEPTH, BAR_EMPHASIS, PIE_EMPHASIS, ANIM, barWidth } from '../components/chartStyle'
import { useReport } from '../api/hooks'
import { useReportFilters } from '../state/FiltersContext'
import { fmtINR, fmtInt } from '../components/formatters'
import { CHART } from '../theme'

interface Row {
  user_name?: string
  region_name?: string
  division?: string
  loss_reason?: string
  close_date?: string
  total_price?: number
  opportunity_name?: string
}

type Datum = { name: string; value: number }

/** Sum total_price grouped by a key, sorted descending. */
function groupSum(rows: Row[], keyFn: (r: Row) => string): Datum[] {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = keyFn(r)
    m.set(k, (m.get(k) ?? 0) + Number(r.total_price || 0))
  }
  return [...m.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

const inr = (v: number) => fmtINR(v)

const hbar = (items: Datum[], color: string) => ({
  ...ANIM,
  grid: { left: 8, right: 92, top: 10, bottom: 8, containLabel: true },
  tooltip: { trigger: 'axis', valueFormatter: inr },
  xAxis: { type: 'value', axisLabel: { formatter: inr, ...AXIS_FONT } },
  yAxis: { type: 'category', data: items.map((i) => i.name).reverse(), axisLabel: AXIS_FONT },
  series: [{
    type: 'bar',
    data: items.map((i) => i.value).reverse(),
    label: barLabel(true),
    itemStyle: { color: gradH(color), borderRadius: [0, 5, 5, 0], ...DEPTH },
    emphasis: BAR_EMPHASIS,
    barMaxWidth: barWidth(items.length),
  }],
})

const donut = (items: Datum[]) => ({
  ...ANIM,
  color: CHART.palette,
  tooltip: { trigger: 'item', valueFormatter: inr },
  legend: { type: 'scroll', bottom: 0, textStyle: LEGEND_FONT },
  series: [{
    type: 'pie',
    radius: ['34%', '58%'],
    avoidLabelOverlap: true,
    itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2, ...DEPTH },
    emphasis: PIE_EMPHASIS,
    label: pieLabel(true),
    data: items,
  }],
})

const columns = (items: Datum[]) => ({
  ...ANIM,
  // Rotated value labels need full headroom above the tallest column.
  grid: { left: 8, right: 16, top: items.length > 8 ? 92 : 38, bottom: 24, containLabel: true },
  tooltip: { trigger: 'axis', valueFormatter: inr },
  xAxis: { type: 'category', data: items.map((i) => fmtMonthName(i.name)), axisLabel: AXIS_FONT },
  yAxis: { type: 'value', axisLabel: { formatter: inr, ...AXIS_FONT } },
  series: [{
    type: 'bar',
    data: items.map((i) => i.value),
    label: colLabel(true, items.length > 8 ? 90 : 0),
    itemStyle: { color: gradV(CHART.lost), borderRadius: [5, 5, 0, 0], ...DEPTH },
    emphasis: BAR_EMPHASIS,
    barMaxWidth: barWidth(items.length),
  }],
})

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{title}</Typography>
      {children}
    </Paper>
  )
}

export default function ClosedLostPage() {
  const { filters } = useReportFilters()
  const { data, isLoading, error } = useReport<Row>('closed-lost', filters)
  const rows: Row[] = data?.rows ?? []

  const totalValue = useMemo(() => rows.reduce((s, r) => s + Number(r.total_price || 0), 0), [rows])
  const oppCount = useMemo(() => new Set(rows.map((r) => r.opportunity_name)).size, [rows])

  const byReason = useMemo(
    () => groupSum(rows, (r) => r.loss_reason?.trim().replace(/\s+/g, ' ') || 'Not specified').slice(0, 8),
    [rows],
  )
  const bySalesperson = useMemo(() => groupSum(rows, (r) => r.user_name || '—').slice(0, 10), [rows])
  const byDivision = useMemo(() => groupSum(rows, (r) => r.division || 'Unspecified'), [rows])
  const byMonth = useMemo(
    () =>
      groupSum(rows, (r) => (r.close_date ? r.close_date.slice(0, 7) : ''))
        .filter((d) => d.name)
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(-15),
    [rows],
  )

  return (
    <ReportShell title="Closed Lost" subtitle="Lost opportunities — value, reasons, and trend">
      {error ? (
        <Alert severity="error">Failed to load Closed Lost data.</Alert>
      ) : isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 2, mb: 2, maxWidth: 640 }}>
            <KpiCard label="Lost Value" value={fmtINR(totalValue)} color="#b91c1c" />
            <KpiCard label="Opportunities" value={fmtInt(oppCount)} />
            <KpiCard label="Line Items" value={fmtInt(rows.length)} />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2 }}>
            <ChartCard title="Why we lose — by Loss Reason">
              <ReactECharts option={hbar(byReason, CHART.lost)} style={{ height: 300 }} notMerge />
            </ChartCard>
            <ChartCard title="Lost Value by Salesperson">
              <ReactECharts option={hbar(bySalesperson, CHART.open)} style={{ height: 300 }} notMerge />
            </ChartCard>
            <ChartCard title="By Division">
              <ReactECharts option={donut(byDivision)} style={{ height: 300 }} notMerge />
            </ChartCard>
            <ChartCard title="Monthly Trend (lost value)">
              <ReactECharts option={columns(byMonth)} style={{ height: 300 }} notMerge />
            </ChartCard>
          </Box>

          <Paper variant="outlined" sx={{ p: 0 }}>
            <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>Detail</Typography>
            <DataTable rows={rows} columns={REPORTS['closed-lost'].columns} height={420} />
          </Paper>
        </>
      )}
    </ReportShell>
  )
}
