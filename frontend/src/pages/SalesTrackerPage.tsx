import { useMemo, useState } from 'react'
import { Box, Paper, Typography, CircularProgress, Alert, Tabs, Tab } from '@mui/material'
import ReactECharts from 'echarts-for-react'
import type { ColDef } from 'ag-grid-community'
import ReportShell from '../components/ReportShell'
import SalesTrackerTree from '../components/SalesTrackerTree'
import DataTable from '../components/DataTable'
import KpiCard from '../components/KpiCard'
import { REPORTS, col } from './reportConfigs'
import { colLabel, AXIS_FONT, NO_OVERLAP, moneyAxis } from '../components/chartLabels'
import { gradByValue, DEPTH, BAR_EMPHASIS, ANIM, barWidth } from '../components/chartStyle'
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
  quotes_created: number
  open_quotes_value: number
  new_quotes_value: number
  closed_won_value: number
  closed_lost_value: number
  dropped_value: number
}
const N = (x: number | null | undefined) => Number(x || 0)

// Rows then Values exactly as the pbix Sales Tracker "new opportunities" pivotTable
const newOppColumns: ColDef[] = [
  col('user_name', 'User Name'),
  col('opportunity_name', 'Opp name', 'text', { flex: 2 }),
  col('created_date_only', 'Created Date Only', 'date'),
  col('stage_name', 'StageName'),
  col('latest_action_task', 'Next Action', 'text', { flex: 2 }),
  col('action_activity_date', 'Due date', 'date'),
  col('project_stage', 'Project_stage__c'),
  col('building_construction_stage', 'Building stage'),
]

function aggregate(rows: SalesTrackerRow[]): Agg[] {
  const m = new Map<string, Agg>()
  for (const r of rows) {
    let a = m.get(r.owner_id)
    if (!a) {
      a = {
        owner_id: r.owner_id, user_name: r.user_name, region_name: r.region_name,
        visits: 0, opportunities_created: 0, quotes_created: 0, open_quotes_value: 0,
        new_quotes_value: 0, closed_won_value: 0, closed_lost_value: 0, dropped_value: 0,
      }
      m.set(r.owner_id, a)
    }
    a.visits += N(r.visits)
    a.opportunities_created += N(r.opportunities_created)
    a.quotes_created += N(r.quotes_created)
    a.open_quotes_value += N(r.open_quotes_value)
    a.new_quotes_value += N(r.new_quotes_value)
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
          t.visits += a.visits; t.opps += a.opportunities_created; t.quotes += a.quotes_created
          t.open += a.open_quotes_value; t.newq += a.new_quotes_value
          t.won += a.closed_won_value; t.lost += a.closed_lost_value; t.dropped += a.dropped_value
          return t
        },
        { visits: 0, opps: 0, quotes: 0, open: 0, newq: 0, won: 0, lost: 0, dropped: 0 },
      ),
    [agg],
  )

  const topWon = [...agg].sort((a, b) => b.closed_won_value - a.closed_won_value).slice(0, 10)

  const wonChart = {
    ...ANIM,
    grid: { left: 8, right: 16, top: 34, bottom: 70, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => fmtINR(v) },
    xAxis: { type: 'category', data: topWon.map((t) => t.user_name), axisLabel: { rotate: 35, ...AXIS_FONT } },
    yAxis: { type: 'value', axisLabel: moneyAxis, splitLine: { lineStyle: { color: '#efe7d9' } } },
    series: [{
      type: 'bar', name: 'Closed Won',
      data: (() => { const max = Math.max(...topWon.map((t) => t.closed_won_value), 1); return topWon.map((t) => ({ value: t.closed_won_value, itemStyle: { color: gradByValue(CHART.won, t.closed_won_value / max), borderRadius: [5, 5, 0, 0], ...DEPTH } })) })(),
      label: colLabel(true), ...NO_OVERLAP, emphasis: BAR_EMPHASIS, barMaxWidth: barWidth(topWon.length),
    }],
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
    xAxis: { type: 'category', data: byUser.map((u) => u.user_name), axisLabel: { rotate: 35, ...AXIS_FONT } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: AXIS_FONT, splitLine: { lineStyle: { color: '#efe7d9' } } },
    series: [{
      type: 'bar', name: 'New Opportunities',
      data: (() => { const max = Math.max(...byUser.map((u) => u.count), 1); return byUser.map((u) => ({ value: u.count, itemStyle: { color: gradByValue(CHART.open, u.count / max), borderRadius: [5, 5, 0, 0], ...DEPTH } })) })(),
      label: colLabel(false), ...NO_OVERLAP, emphasis: BAR_EMPHASIS, barMaxWidth: barWidth(byUser.length),
    }],
  }

  return (
    <ReportShell subtitle="KPIs by salesperson — scoped to the data you can see">
      {error ? (
        <Alert severity="error">Failed to load. Is the API running on port 8001?</Alert>
      ) : isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(4,1fr)', lg: 'repeat(8,1fr)' }, gap: 2, mb: 2 }}>
            <KpiCard label="Visits" value={fmtInt(totals.visits)} color={CHART.neutral} />
            <KpiCard label="Opps Created" value={fmtInt(totals.opps)} color={CHART.open} />
            <KpiCard label="Quotes Created" value={fmtInt(totals.quotes)} color={CHART.live} />
            <KpiCard label="Open Quotes" value={fmtINR(totals.open)} color={CHART.live} />
            <KpiCard label="New Quotes" value={fmtINR(totals.newq)} color="#C99A2E" />
            <KpiCard label="Closed Won" value={fmtINR(totals.won)} color={CHART.won} />
            <KpiCard label="Closed Lost" value={fmtINR(totals.lost)} color={CHART.lost} />
            <KpiCard label="Dropped" value={fmtINR(totals.dropped)} color={CHART.dropped} />
          </Box>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Tab label="KPI Matrix" />
            <Tab label="New Opportunities" />
            <Tab label="Earliest Quotes" />
          </Tabs>

          {/* Matrix first, chart underneath: the tracker grid is the point of
              this page, and leading with a 280px chart pushed it below the fold. */}
          {tab === 0 && (
            <>
              <SalesTrackerTree rows={data?.rows ?? []} />
              <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Closed Won by Salesperson (top 10)</Typography>
                <ReactECharts option={wonChart} style={{ height: 280 }} notMerge />
              </Paper>
            </>
          )}

          {tab === 1 && (
            newOpp.isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 6 }}><CircularProgress /></Box>
            ) : (
              <>
                {/* Table first, and it reclaims the ~300px the chart used to take
                    above it (was calc(100vh - 720px), barely a few rows). */}
                <DataTable rows={newOpp.data?.rows ?? []} columns={newOppColumns} height="calc(100vh - 420px)" />
                <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>New Opportunities by Salesperson (last month)</Typography>
                  <ReactECharts option={oppChart} style={{ height: 300 }} notMerge />
                </Paper>
              </>
            )
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
