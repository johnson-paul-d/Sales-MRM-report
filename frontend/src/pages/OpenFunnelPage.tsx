import { useMemo } from 'react'
import { Box, Paper, Typography, CircularProgress, Alert } from '@mui/material'
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

// PBI Open Funnel target tableEx headers: Owner / Target Million / Amount
const targetColumns: ColDef[] = [
  col('owner', 'Owner', 'text', { minWidth: 160, flex: 1 }),
  col('target_million', 'Target Million', 'int'),
  col('amount', 'Amount', 'inr'),
]

export default function OpenFunnelPage() {
  const cfg = REPORTS['open-funnel']
  const { filters } = useReportFilters()
  const { data, isLoading, error } = useOpenFunnel(filters)
  const rows = data?.rows ?? []

  // Target vs achieved: Amount = the owner's open-funnel value under current filters
  const targetRows = useMemo(() => {
    const byOwnerId = new Map<string, number>()
    const byRegionId = new Map<number, number>()
    let grand = 0
    for (const r of rows) {
      const v = Number(r.quote_total_price || 0)
      grand += v
      if (r.owner_id) byOwnerId.set(r.owner_id, (byOwnerId.get(r.owner_id) ?? 0) + v)
      if (r.region_id != null) byRegionId.set(r.region_id, (byRegionId.get(r.region_id) ?? 0) + v)
    }
    return (data?.targets ?? []).map((t) => ({
      owner: t.owner,
      target_million: Math.round(Number(t.target_amount) / 1_000_000),
      amount: t.salesforce_user_id
        ? byOwnerId.get(t.salesforce_user_id) ?? 0
        : t.region_id != null
          ? byRegionId.get(t.region_id) ?? 0
          : grand,
    }))
  }, [data, rows])

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
          {cfg.charts && rows.length > 0 && <ChartStrip rows={rows} specs={cfg.charts} />}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '380px 1fr' }, gap: 2, mb: 2 }}>
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

          <Paper variant="outlined" sx={{ p: 0 }}>
            <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>
              Open quote value by quote-created month
            </Typography>
            <DataTable rows={quoteMatrix.rows} columns={quoteMatrix.columns} height={340} />
          </Paper>
        </>
      )}
    </ReportShell>
  )
}
