import { useMemo } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import ReactECharts from 'echarts-for-react'
import { fmtINR } from './formatters'
import { barLabel, colLabel, pieLabel, funnelLabel, fmtMonthName, AXIS_FONT, LEGEND_FONT, NO_OVERLAP, moneyAxis } from './chartLabels'
import { gradByValue, paletteGradV, paletteGradH, DEPTH, BAR_EMPHASIS, PIE_EMPHASIS, ANIM, barWidth, CARD_HOVER } from './chartStyle'
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
  const axisVal = spec.money ? { axisLabel: moneyAxis } : { axisLabel: AXIS_FONT }
  const tt = { textStyle: { fontSize: 14 }, ...(spec.money ? { valueFormatter: fmt } : {}) }
  const color = spec.color ?? CHART.palette[0]

  if (spec.kind === 'donut') {
    return {
      ...ANIM,
      color: CHART.palette,
      tooltip: { trigger: 'item', ...tt },
      legend: { type: 'scroll', bottom: 0, textStyle: LEGEND_FONT },
      series: [{
        type: 'pie', radius: ['34%', '58%'],
        itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2, ...DEPTH },
        emphasis: PIE_EMPHASIS,
        label: pieLabel(spec.money), data,
      }],
    }
  }
  if (spec.kind === 'funnel') {
    return {
      ...ANIM,
      color: CHART.palette,
      tooltip: { trigger: 'item', ...tt },
      series: [{
        type: 'funnel', left: 8, right: 8, top: 10, bottom: 10, minSize: '22%', gap: 3,
        itemStyle: { borderRadius: 3, ...DEPTH },
        emphasis: BAR_EMPHASIS,
        label: funnelLabel(spec.money), data,
      }],
    }
  }
  if (spec.kind === 'columns') {
    const max = Math.max(...data.map((d) => d.value), 1)
    return {
      ...ANIM,
      grid: { left: 8, right: 16, top: 44, bottom: 24, containLabel: true },
      tooltip: { trigger: 'axis', ...tt },
      xAxis: { type: 'category', data: data.map((d) => d.name), axisLabel: AXIS_FONT },
      yAxis: { type: 'value', ...axisVal, splitLine: { lineStyle: { color: '#efe7d9' } } },
      series: [{
        type: 'bar',
        // Chronological series: colour depth ranks the value. Categorical: own palette colour.
        data: data.map((d, i) => ({
          value: d.value,
          itemStyle: {
            color: spec.chronological ? gradByValue(color, d.value / max) : paletteGradV(CHART.palette, i),
            borderRadius: [5, 5, 0, 0], ...DEPTH,
          },
        })),
        label: colLabel(spec.money),
        ...NO_OVERLAP,
        emphasis: BAR_EMPHASIS,
        barMaxWidth: barWidth(data.length),
      }],
    }
  }
  // horizontal bar
  return {
    ...ANIM,
    grid: { left: 8, right: 92, top: 10, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', ...tt },
    xAxis: { type: 'value', ...axisVal, splitLine: { lineStyle: { color: '#efe7d9' } } },
    yAxis: { type: 'category', data: data.map((d) => d.name).reverse(), axisLabel: AXIS_FONT },
    series: [{
      type: 'bar',
      data: data.map((d, i) => ({
        value: d.value,
        itemStyle: { color: paletteGradH(CHART.palette, data.length - 1 - i), borderRadius: [0, 5, 5, 0], ...DEPTH },
      })).reverse(),
      label: barLabel(spec.money),
      emphasis: BAR_EMPHASIS,
      barMaxWidth: barWidth(data.length),
    }],
  }
}

export default function ChartStrip({ rows, specs }: { rows: Row[]; specs: ChartSpec[] }) {
  const charts = useMemo(() => specs.map((s) => ({ spec: s, data: aggregate(rows, s) })), [rows, specs])
  const cols = specs.length >= 3 ? { xs: '1fr', md: 'repeat(3, 1fr)' }
    : specs.length === 2 ? { xs: '1fr', md: '1fr 1fr' } : { xs: '1fr' }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: cols, gap: 2, mb: 2 }}>
      {charts.map(({ spec, data }, i) => (
        <Paper key={i} variant="outlined" sx={{ p: 2, ...CARD_HOVER }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{spec.title}</Typography>
          <ReactECharts option={optionFor(spec, data)} style={{ height: 300 }} notMerge />
        </Paper>
      ))}
    </Box>
  )
}
