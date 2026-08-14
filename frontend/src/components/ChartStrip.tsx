import { useMemo } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import ReactECharts from 'echarts-for-react'
import { fmtINR } from './formatters'
import { barLabel, colLabel, pieLabel, funnelLabel, fmtMonthName } from './chartLabels'
import { CHART } from '../theme'
import type { ChartSpec } from '../pages/reportConfigs'

type Row = Record<string, any>
type Datum = { name: string; value: number }

function aggregate(rows: Row[], spec: ChartSpec): Datum[] {
  const keyFn = typeof spec.groupBy === 'function'
    ? spec.groupBy
    : (r: Row) => r[spec.groupBy as string]
  const m = new Map<string, number>()
  for (const r of rows) {
    const raw = keyFn(r)
    const k = raw === null || raw === undefined || raw === '' ? '—' : String(raw)
    const v = spec.value ? Number(r[spec.value] || 0) : 1
    m.set(k, (m.get(k) ?? 0) + v)
  }
  let arr = [...m.entries()].map(([name, value]) => ({ name, value }))
  if (spec.chronological) {
    arr = arr.filter((d) => d.name !== '—').sort((a, b) => a.name.localeCompare(b.name))
    if (spec.top) arr = arr.slice(-spec.top)
    // Display 'YYYY-MM' buckets as month names (sorting stays on the raw key)
    arr = arr.map((d) => ({ ...d, name: fmtMonthName(d.name) }))
  } else {
    arr = arr.sort((a, b) => b.value - a.value)
    if (spec.top) arr = arr.slice(0, spec.top)
  }
  return arr
}

const fmt = (v: number) => fmtINR(v)

function optionFor(spec: ChartSpec, data: Datum[]) {
  const axisVal = spec.money ? { axisLabel: { formatter: fmt } } : {}
  const tt = spec.money ? { valueFormatter: fmt } : {}
  const color = spec.color ?? CHART.palette[0]

  if (spec.kind === 'donut') {
    return {
      color: CHART.palette,
      tooltip: { trigger: 'item', ...tt },
      legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 11 } },
      series: [{ type: 'pie', radius: ['36%', '60%'], itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 }, label: pieLabel(spec.money), data }],
    }
  }
  if (spec.kind === 'funnel') {
    return {
      color: CHART.palette,
      tooltip: { trigger: 'item', ...tt },
      series: [{ type: 'funnel', left: 8, right: 8, top: 10, bottom: 10, minSize: '18%', gap: 2, label: funnelLabel(spec.money), data }],
    }
  }
  if (spec.kind === 'columns') {
    return {
      grid: { left: 8, right: 16, top: 34, bottom: 24, containLabel: true },
      tooltip: { trigger: 'axis', ...tt },
      xAxis: { type: 'category', data: data.map((d) => d.name), axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', ...axisVal },
      series: [{ type: 'bar', data: data.map((d) => d.value), label: colLabel(spec.money, data.length > 8 ? 90 : 0), itemStyle: { color, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 26 }],
    }
  }
  // horizontal bar
  return {
    grid: { left: 8, right: 76, top: 10, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', ...tt },
    xAxis: { type: 'value', ...axisVal },
    yAxis: { type: 'category', data: data.map((d) => d.name).reverse(), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar', data: data.map((d) => d.value).reverse(), label: barLabel(spec.money), itemStyle: { color, borderRadius: [0, 4, 4, 0] }, barMaxWidth: 20 }],
  }
}

export default function ChartStrip({ rows, specs }: { rows: Row[]; specs: ChartSpec[] }) {
  const charts = useMemo(() => specs.map((s) => ({ spec: s, data: aggregate(rows, s) })), [rows, specs])
  const cols = specs.length >= 3 ? { xs: '1fr', md: 'repeat(3, 1fr)' }
    : specs.length === 2 ? { xs: '1fr', md: '1fr 1fr' } : { xs: '1fr' }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: cols, gap: 2, mb: 2 }}>
      {charts.map(({ spec, data }, i) => (
        <Paper key={i} variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{spec.title}</Typography>
          <ReactECharts option={optionFor(spec, data)} style={{ height: 280 }} notMerge />
        </Paper>
      ))}
    </Box>
  )
}
