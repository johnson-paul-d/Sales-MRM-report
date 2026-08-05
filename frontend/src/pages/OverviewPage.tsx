import { useMemo } from 'react'
import { Box, Paper, Typography, CircularProgress, Alert } from '@mui/material'
import ReactECharts from 'echarts-for-react'
import ReportShell from '../components/ReportShell'
import KpiCard from '../components/KpiCard'
import { useReport, useLeads } from '../api/hooks'
import { useReportFilters } from '../state/FiltersContext'
import { fmtINR, fmtInt } from '../components/formatters'
import { CHART } from '../theme'

interface TrackerRow {
  owner_id: string
  user_name: string
  year_month: string
  visits?: number
  opportunities_created?: number
  open_quotes_value?: number
  new_quotes_value?: number
  closed_won_value?: number
  closed_lost_value?: number
  dropped_value?: number
}
interface LostRow { loss_reason?: string; total_price?: number }

const N = (x: unknown) => Number(x || 0)
const inr = (v: number) => fmtINR(v)

export default function OverviewPage() {
  const { filters } = useReportFilters()
  const tracker = useReport<TrackerRow>('sales-tracker', filters)
  const leads = useLeads(filters)
  const lost = useReport<LostRow>('closed-lost', filters)
  const rows = tracker.data?.rows ?? []

  const totals = useMemo(() => {
    const t = { visits: 0, opps: 0, open: 0, live: 0, won: 0, lost: 0, dropped: 0 }
    for (const r of rows) {
      t.visits += N(r.visits); t.opps += N(r.opportunities_created)
      t.open += N(r.open_quotes_value); t.live += N(r.new_quotes_value)
      t.won += N(r.closed_won_value); t.lost += N(r.closed_lost_value); t.dropped += N(r.dropped_value)
    }
    return t
  }, [rows])

  const winRate = totals.won + totals.lost > 0
    ? Math.round((totals.won / (totals.won + totals.lost)) * 100) : 0

  const byMonth = useMemo(() => {
    const m = new Map<string, { won: number; lost: number; dropped: number }>()
    for (const r of rows) {
      if (!r.year_month) continue
      const e = m.get(r.year_month) ?? { won: 0, lost: 0, dropped: 0 }
      e.won += N(r.closed_won_value); e.lost += N(r.closed_lost_value); e.dropped += N(r.dropped_value)
      m.set(r.year_month, e)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
  }, [rows])

  const topReps = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.user_name, (m.get(r.user_name) ?? 0) + N(r.closed_won_value))
    return [...m.entries()].map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8)
  }, [rows])

  const lossReasons = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of lost.data?.rows ?? []) {
      const k = r.loss_reason?.trim().replace(/\s+/g, ' ') || 'Not specified'
      m.set(k, (m.get(k) ?? 0) + N(r.total_price))
    }
    return [...m.entries()].map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 6)
  }, [lost.data])

  const busy = tracker.isLoading || leads.isLoading || lost.isLoading

  const outcomeTrend = {
    grid: { left: 8, right: 16, top: 30, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: inr },
    legend: { top: 0, textStyle: { fontSize: 11 } },
    xAxis: { type: 'category', data: byMonth.map((m) => m[0]), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { formatter: inr } },
    series: [
      { name: 'Won', type: 'bar', data: byMonth.map((m) => m[1].won), itemStyle: { color: CHART.won, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 15 },
      { name: 'Lost', type: 'bar', data: byMonth.map((m) => m[1].lost), itemStyle: { color: CHART.lost, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 15 },
      { name: 'Dropped', type: 'bar', data: byMonth.map((m) => m[1].dropped), itemStyle: { color: CHART.dropped, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 15 },
    ],
  }
  const pipelineChart = {
    grid: { left: 8, right: 16, top: 10, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: inr },
    xAxis: { type: 'category', data: ['Open Quotes', 'New Quotes', 'Closed Won'] },
    yAxis: { type: 'value', axisLabel: { formatter: inr } },
    series: [{
      type: 'bar', barMaxWidth: 56,
      data: [
        { value: totals.open, itemStyle: { color: CHART.open, borderRadius: [4, 4, 0, 0] } },
        { value: totals.live, itemStyle: { color: CHART.live, borderRadius: [4, 4, 0, 0] } },
        { value: totals.won, itemStyle: { color: CHART.won, borderRadius: [4, 4, 0, 0] } },
      ],
    }],
  }
  const repsChart = {
    grid: { left: 8, right: 24, top: 10, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: inr },
    xAxis: { type: 'value', axisLabel: { formatter: inr } },
    yAxis: { type: 'category', data: topReps.map((t) => t.name).reverse(), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar', data: topReps.map((t) => t.value).reverse(), itemStyle: { color: CHART.won, borderRadius: [0, 4, 4, 0] }, barMaxWidth: 18 }],
  }
  const reasonChart = {
    color: CHART.palette,
    tooltip: { trigger: 'item', valueFormatter: inr },
    legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 11 } },
    series: [{ type: 'pie', radius: ['42%', '70%'], itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 }, label: { show: false }, data: lossReasons }],
  }

  return (
    <ReportShell subtitle="Executive summary — scoped to the data you can see">
      {tracker.error ? (
        <Alert severity="error">Failed to load overview data.</Alert>
      ) : busy ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(4,1fr)' }, gap: 2, mb: 2 }}>
            <KpiCard label="Closed Won" value={fmtINR(totals.won)} color={CHART.won} sub={`${winRate}% win rate`} />
            <KpiCard label="Closed Lost" value={fmtINR(totals.lost)} color={CHART.lost} />
            <KpiCard label="Dropped" value={fmtINR(totals.dropped)} color={CHART.dropped} />
            <KpiCard label="Open Pipeline" value={fmtINR(totals.open)} color={CHART.open} />
            <KpiCard label="New Quotes" value={fmtINR(totals.live)} color={CHART.live} />
            <KpiCard label="Conversion" value={`${leads.data?.overall.conversion_ratio_pct ?? 0}%`} sub={`${fmtInt(leads.data?.overall.total_leads)} leads`} />
            <KpiCard label="Visits" value={fmtInt(totals.visits)} color={CHART.neutral} />
            <KpiCard label="Opps Created" value={fmtInt(totals.opps)} color={CHART.open} />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 2, mb: 2 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Won · Lost · Dropped — last 12 months</Typography>
              <ReactECharts option={outcomeTrend} style={{ height: 320 }} notMerge />
            </Paper>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Pipeline snapshot</Typography>
              <ReactECharts option={pipelineChart} style={{ height: 320 }} notMerge />
            </Paper>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Top performers — Closed Won</Typography>
              <ReactECharts option={repsChart} style={{ height: 300 }} notMerge />
            </Paper>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Why we lose — top reasons</Typography>
              <ReactECharts option={reasonChart} style={{ height: 300 }} notMerge />
            </Paper>
          </Box>
        </>
      )}
    </ReportShell>
  )
}
