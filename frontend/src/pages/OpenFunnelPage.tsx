import { useMemo, useState } from 'react'
import {
  Box, Paper, Typography, CircularProgress, Alert, Chip, FormControl, InputLabel,
  MenuItem, OutlinedInput, Select,
} from '@mui/material'
import type { ColDef } from 'ag-grid-community'
import ReportShell from '../components/ReportShell'
import DataTable from '../components/DataTable'
import ChartStrip from '../components/ChartStrip'
import { REPORTS, col } from './reportConfigs'
import { useOpenFunnel } from '../api/hooks'
import { useReportFilters } from '../state/FiltersContext'

// India financial year (Apr-Mar) labels, matching sieger_fy_label / sieger_fq_label
function fyQuarter(dateStr?: string | null): { fy: string; fq: string } | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  const fy = `FY${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`
  const fq = `Q${Math.floor(((d.getMonth() + 9) % 12) / 3) + 1}`
  return { fy, fq }
}

/** Pivot cells (rowKey x colKey -> sum) into DataTable rows + columns. */
function pivot(
  cells: { row: string; colKey: string; value: number }[],
  rowHeader: string,
): { rows: Record<string, any>[]; columns: ColDef[] } {
  const colKeys = [...new Set(cells.map((c) => c.colKey))].sort()
  const m = new Map<string, Record<string, any>>()
  for (const c of cells) {
    if (!m.has(c.row)) m.set(c.row, { user_name: c.row, total: 0 })
    const r = m.get(c.row)!
    r[c.colKey] = (r[c.colKey] ?? 0) + c.value
    r.total += c.value
  }
  const rows = [...m.values()].sort((a, b) => b.total - a.total)
  const columns: ColDef[] = [
    col('user_name', rowHeader, 'text', { minWidth: 160, pinned: 'left' }),
    ...colKeys.map((k) => col(k, k, 'inr', { minWidth: 110 })),
    col('total', 'Total', 'inr', { minWidth: 120 }),
  ]
  return { rows, columns }
}

// Target vs Achieved. Values are raw rupees; fmtINR renders them as "₹51.95 Cr"
// (the old column was hand-divided into millions). Achieved = Closed Won value
// inside the target's own period, computed server-side.
const targetColumns: ColDef[] = [
  col('owner', 'Owner', 'text', { minWidth: 160, flex: 1 }),
  col('target_amount', 'Target', 'inr'),
  col('achieved_amount', 'Achieved (Closed Won)', 'inr'),
  col('gap_amount', 'Gap', 'inr'),
  col('achieved_pct', '% of Target', 'int', {
    valueFormatter: (p) => (p.value == null ? '' : `${p.value}%`),
  }),
]

export default function OpenFunnelPage() {
  const cfg = REPORTS['open-funnel']
  const { filters } = useReportFilters()
  const { data, isLoading, error } = useOpenFunnel(filters)
  const allRows = data?.rows ?? []

  // Stage filter (client-side, same pattern as ReportTablePage)
  const [stages, setStages] = useState<string[]>([])
  const stageOptions = useMemo(
    () => [...new Set(allRows.map((r: any) => r.stage_name).filter(Boolean))].sort() as string[],
    [allRows],
  )
  const rows = useMemo(
    () => (stages.length ? allRows.filter((r: any) => stages.includes(r.stage_name)) : allRows),
    [allRows, stages],
  )

  // Target vs achieved, both in crore. Achieved is Closed Won value for the
  // target's own period, computed by the API -- it is not affected by the
  // page's stage/close-date slicers.
  const targetRows = useMemo(() => {
    return (data?.targets ?? []).map((t: any) => {
      const target = Number(t.target_amount) || 0
      const achieved = Number(t.achieved_amount) || 0
      return {
        owner: t.owner,
        target_amount: target,
        achieved_amount: achieved,
        gap_amount: achieved - target,
        achieved_pct: target > 0 ? Math.round((achieved / target) * 100) : null,
      }
    })
  }, [data])

  // PBI matrix 1: User Name x (Financial Year, Financial Quarter) -> Sum(TotalPrice)
  const fyMatrix = useMemo(() => {
    const cells = rows.flatMap((r: any) => {
      const q = fyQuarter(r.close_date)
      return q ? [{ row: r.user_name || '—', colKey: `${q.fy} ${q.fq}`, value: Number(r.quote_total_price || 0) }] : []
    })
    return pivot(cells, 'User Name')
  }, [rows])

  // PBI matrix 2: User Name x quote-created Year/Month -> Sum(TotalPrice)
  const quoteMatrix = useMemo(() => {
    const cells = (data?.by_quote_month ?? []).map((c) => ({
      row: c.user_name || '—', colKey: c.year_month, value: Number(c.total_price || 0),
    }))
    return pivot(cells, 'User Name')
  }, [data])

  return (
    <ReportShell title={cfg.title} subtitle={cfg.subtitle}>
      {error ? (
        <Alert severity="error">Failed to load Open Funnel data.</Alert>
      ) : isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : (
        <>
          <Box sx={{ mb: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel id="of-stage">Stage</InputLabel>
              <Select
                labelId="of-stage"
                multiple
                value={stages}
                onChange={(e) => setStages(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                input={<OutlinedInput label="Stage" />}
                renderValue={(sel) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {sel.map((s) => <Chip key={s} label={s} size="small" />)}
                  </Box>
                )}
              >
                {stageOptions.map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '460px 1fr' }, gap: 2, mb: 2 }}>
            <Paper variant="outlined" sx={{ p: 0 }}>
              <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>
                Target vs Achieved {targetRows.length === 0 && '— no active targets (Admin → Targets)'}
              </Typography>
              <DataTable rows={targetRows} columns={targetColumns} height={300} />
            </Paper>
            <Paper variant="outlined" sx={{ p: 0 }}>
              <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>
                Open value by Financial Year &amp; Quarter (close date)
              </Typography>
              <DataTable rows={fyMatrix.rows} columns={fyMatrix.columns} height={300} />
            </Paper>
          </Box>

          <Paper variant="outlined" sx={{ p: 0, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>Open opportunities</Typography>
            <DataTable rows={rows} columns={cfg.columns} height={380} />
          </Paper>

          <Paper variant="outlined" sx={{ p: 0, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>
              Open quote value by quote-created month
            </Typography>
            <DataTable rows={quoteMatrix.rows} columns={quoteMatrix.columns} height={340} />
          </Paper>

          {/* Charts last: the tables above are what this page is read for. */}
          {cfg.charts && rows.length > 0 && <ChartStrip rows={rows} specs={cfg.charts} />}
        </>
      )}
    </ReportShell>
  )
}
