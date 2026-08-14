import { useMemo } from 'react'
import { Box, Paper, Typography, CircularProgress, Alert } from '@mui/material'
import ReactECharts from 'echarts-for-react'
import ReportShell from '../components/ReportShell'
import KpiCard from '../components/KpiCard'
import { useReport, useLeads } from '../api/hooks'
import { useReportFilters } from '../state/FiltersContext'
import { fmtINR, fmtINRShort, fmtInt } from '../components/formatters'
import { barLabel, colLabel, pieLabel, fmtMonthName, AXIS_FONT, LEGEND_FONT, NO_OVERLAP, moneyAxis } from '../components/chartLabels'
import { gradV, DEPTH, BAR_EMPHASIS, PIE_EMPHASIS, ANIM, barWidth, paletteGradH } from '../components/chartStyle'
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
    // Only months up to the current one -- close dates extend into the future,
    // and "recent trend" means the trailing 8 real months, not empty future ones.
    const cur = new Date().toISOString().slice(0, 7)
    return [...m.entries()].filter(([ym]) => ym <= cur)
      .sort((a, b) => a[0].localeCompare(b[0])).slice(-8)
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

  // Grouped monthly bars: horizontal compact labels; sub-₹50 L stays silent
  // and hideOverlap drops any label that would collide with a neighbour.
  const trendLabel = {
    ...colLabel(true),
    fontSize: 12,
    formatter: (p: any) => (Number(p.value) >= 5e6 ? fmtINRShort(p.value) : ''),
  }
  const outcomeTrend = {
    ...ANIM,
    grid: { left: 8, right: 16, top: 56, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: inr },
    legend: { top: 0, textStyle: LEGEND_FONT },
    xAxis: { type: 'category', data: byMonth.map((m) => fmtMonthName(m[0])), axisLabel: AXIS_FONT },
    yAxis: { type: 'value', axisLabel: moneyAxis, splitLine: { lineStyle: { color: '#efe7d9' } } },
    series: [
      { name: 'Won', type: 'bar', data: byMonth.map((m) => m[1].won), label: trendLabel, ...NO_OVERLAP, itemStyle: { color: gradV(CHART.won), borderRadius: [4, 4, 0, 0], ...DEPTH }, emphasis: BAR_EMPHASIS, barMaxWidth: 20 },
      { name: 'Lost', type: 'bar', data: byMonth.map((m) => m[1].lost), label: trendLabel, ...NO_OVERLAP, itemStyle: { color: gradV(CHART.lost), borderRadius: [4, 4, 0, 0], ...DEPTH }, emphasis: BAR_EMPHASIS, barMaxWidth: 20 },
      { name: 'Dropped', type: 'bar', data: byMonth.map((m) => m[1].dropped), label: trendLabel, ...NO_OVERLAP, itemStyle: { color: gradV(CHART.dropped), borderRadius: [4, 4, 0, 0], ...DEPTH }, emphasis: BAR_EMPHASIS, barMaxWidth: 20 },
    ],
  }
  const pipelineChart = {
    ...ANIM,
    grid: { left: 8, right: 16, top: 40, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: inr },
    xAxis: { type: 'category', data: ['Open Quotes', 'New Quotes', 'Closed Won'], axisLabel: AXIS_FONT },
    yAxis: { type: 'value', axisLabel: moneyAxis, splitLine: { lineStyle: { color: '#efe7d9' } } },
    series: [{
      type: 'bar', barMaxWidth: barWidth(3), label: colLabel(true), emphasis: BAR_EMPHASIS,
      data: [
        { value: totals.open, itemStyle: { color: gradV(CHART.open), borderRadius: [5, 5, 0, 0], ...DEPTH } },
        { value: totals.live, itemStyle: { color: gradV(CHART.live), borderRadius: [5, 5, 0, 0], ...DEPTH } },
        { value: totals.won, itemStyle: { color: gradV(CHART.won), borderRadius: [5, 5, 0, 0], ...DEPTH } },
      ],
    }],
  }
  const repsChart = {
    ...ANIM,
    grid: { left: 8, right: 92, top: 10, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: inr },
    xAxis: { type: 'value', axisLabel: moneyAxis, splitLine: { lineStyle: { color: '#efe7d9' } } },
    yAxis: { type: 'category', data: topReps.map((t) => t.name).reverse(), axisLabel: AXIS_FONT },
    series: [{
      type: 'bar',
      data: topReps.map((t, i) => ({ value: t.value, itemStyle: { color: paletteGradH(CHART.palette, i), borderRadius: [0, 5, 5, 0], ...DEPTH } })).reverse(),
      label: barLabel(true), emphasis: BAR_EMPHASIS, barMaxWidth: barWidth(topReps.length),
    }],
  }
  const reasonChart = {
    ...ANIM,
    color: CHART.palette,
    tooltip: { trigger: 'item', valueFormatter: inr },
    legend: { type: 'scroll', bottom: 0, textStyle: LEGEND_FONT },
    series: [{ type: 'pie', radius: ['34%', '58%'], itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2, ...DEPTH }, emphasis: PIE_EMPHASIS, label: pieLabel(true), data: lossReasons }],
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
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Won · Lost · Dropped — last 8 months</Typography>
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
