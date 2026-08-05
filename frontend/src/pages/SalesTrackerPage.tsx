import { useMemo, useState } from 'react'
import { Box, Paper, Typography, CircularProgress, Alert, Tabs, Tab } from '@mui/material'
import ReactECharts from 'echarts-for-react'
import ReportShell from '../components/ReportShell'
import SalesTrackerTree from '../components/SalesTrackerTree'
import DataTable from '../components/DataTable'
import KpiCard from '../components/KpiCard'
import { REPORTS } from './reportConfigs'
import { useReport, useNewOpportunity } from '../api/hooks'
import { useReportFilters } from '../state/FiltersContext'
import { fmtINR, fmtInt } from '../components/formatters'
import { CHART } from '../theme'
import type { SalesTrackerRow } from '../api/types'

interface Agg {
  owner_id: string
  user_name: string
  region_name: string | null
  visits: number
  opportunities_created: number
  open_quotes_value: number
  live_quote_value: number
  closed_won_value: number
  closed_lost_value: number
  dropped_value: number
}
const N = (x: number | null | undefined) => Number(x || 0)

function aggregate(rows: SalesTrackerRow[]): Agg[] {
  const m = new Map<string, Agg>()
  for (const r of rows) {
    let a = m.get(r.owner_id)
    if (!a) {
      a = {
        owner_id: r.owner_id, user_name: r.user_name, region_name: r.region_name,
        visits: 0, opportunities_created: 0, open_quotes_value: 0, live_quote_value: 0,
        closed_won_value: 0, closed_lost_value: 0, dropped_value: 0,
      }
      m.set(r.owner_id, a)
    }
    a.visits += N(r.visits)
    a.opportunities_created += N(r.opportunities_created)
    a.open_quotes_value += N(r.open_quotes_value)
    a.live_quote_value += N(r.live_quote_value)
    a.closed_won_value += N(r.closed_won_value)
    a.closed_lost_value += N(r.closed_lost_value)
    a.dropped_value += N(r.dropped_value)
    if (!a.region_name && r.region_name) a.region_name = r.region_name
  }
  return Array.from(m.values())
}

export default function SalesTrackerPage() {
  const { filters } = useReportFilters()
  const { data, isLoading, error } = useReport<SalesTrackerRow>('sales-tracker', filters)
  const eq = useReport('new-quotes', filters)
  const newOpp = useNewOpportunity(filters)
  const [tab, setTab] = useState(0)

  const agg = useMemo(() => aggregate(data?.rows ?? []), [data])
  const totals = useMemo(
    () =>
      agg.reduce(
        (t, a) => {
          t.visits += a.visits; t.opps += a.opportunities_created
          t.open += a.open_quotes_value; t.live += a.live_quote_value
          t.won += a.closed_won_value; t.lost += a.closed_lost_value; t.dropped += a.dropped_value
          return t
        },
        { visits: 0, opps: 0, open: 0, live: 0, won: 0, lost: 0, dropped: 0 },
      ),
    [agg],
  )

  const topWon = [...agg].sort((a, b) => b.closed_won_value - a.closed_won_value).slice(0, 10)

  const wonChart = {
    grid: { left: 8, right: 16, top: 20, bottom: 70, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => fmtINR(v) },
    xAxis: { type: 'category', data: topWon.map((t) => t.user_name), axisLabel: { rotate: 35, fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtINR(v) } },
    series: [{ type: 'bar', name: 'Closed Won', data: topWon.map((t) => t.closed_won_value), itemStyle: { color: CHART.won, borderRadius: [4, 4, 0, 0] } }],
  }
  // Same visual as the New Opportunity page (the PBI report repeats it here):
  // opportunities created last month by salesperson, with Min construction-stage tooltip.
  const byUser = newOpp.data?.by_user ?? []
  const oppChart = {
    grid: { left: 8, right: 16, top: 20, bottom: 70, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (ps: any[]) => {
        const u = byUser[ps[0]?.dataIndex]
        return `<b>${ps[0]?.name}</b><br/>New Opportunities: ${ps[0]?.value}` +
          (u?.min_construction_stage ? `<br/>Min Construction Stage: ${u.min_construction_stage}` : '')
      },
    },
    xAxis: { type: 'category', data: byUser.map((u) => u.user_name), axisLabel: { rotate: 35, fontSize: 10 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{ type: 'bar', name: 'New Opportunities', data: byUser.map((u) => u.count), itemStyle: { color: CHART.open, borderRadius: [4, 4, 0, 0] } }],
  }

  return (
    <ReportShell subtitle="KPIs by salesperson — scoped to the data you can see">
      {error ? (
        <Alert severity="error">Failed to load. Is the API running on port 8000?</Alert>
      ) : isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(3,1fr)', lg: 'repeat(7,1fr)' }, gap: 2, mb: 2 }}>
            <KpiCard label="Visits" value={fmtInt(totals.visits)} color={CHART.neutral} />
            <KpiCard label="Opps Created" value={fmtInt(totals.opps)} color={CHART.open} />
            <KpiCard label="Open Quotes" value={fmtINR(totals.open)} color={CHART.live} />
            <KpiCard label="Live Quotes" value={fmtINR(totals.live)} color="#C99A2E" />
            <KpiCard label="Closed Won" value={fmtINR(totals.won)} color={CHART.won} />
            <KpiCard label="Closed Lost" value={fmtINR(totals.lost)} color={CHART.lost} />
            <KpiCard label="Dropped" value={fmtINR(totals.dropped)} color={CHART.dropped} />
          </Box>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Tab label="KPI Matrix" />
            <Tab label="New Opportunities" />
            <Tab label="Earliest Quotes" />
          </Tabs>

          {tab === 0 && (
            <>
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Closed Won by Salesperson (top 10)</Typography>
                <ReactECharts option={wonChart} style={{ height: 280 }} notMerge />
              </Paper>
              <SalesTrackerTree rows={data?.rows ?? []} />
            </>
          )}

          {tab === 1 && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>New Opportunities by Salesperson (last month)</Typography>
              {newOpp.isLoading
                ? <Box sx={{ display: 'flex', justifyContent: 'center', my: 6 }}><CircularProgress /></Box>
                : <ReactECharts option={oppChart} style={{ height: 360 }} notMerge />}
            </Paper>
          )}

          {tab === 2 && (
            eq.isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
            ) : (
              <DataTable rows={eq.data?.rows ?? []} columns={REPORTS['new-quotes'].columns} height="calc(100vh - 420px)" />
            )
          )}
        </>
      )}
    </ReportShell>
  )
}
