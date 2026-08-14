import { useState } from 'react'
import { Alert, Box, FormControl, InputLabel, MenuItem, Select } from '@mui/material'
import ReportShell from '../components/ReportShell'
import DataTable from '../components/DataTable'
import ChartStrip from '../components/ChartStrip'
import { useLastMonth } from '../api/hooks'
import { useReportFilters } from '../state/FiltersContext'
import { fmtDate } from '../components/formatters'
import { REPORTS } from './reportConfigs'

// PBI Last Month page: the table joins the two Salesforce forecast reports at
// ONE snapshot date (a pinned filter in the pbix -- a selector here) and windows
// rows by the forecast's Close Date (Historical) within the snapshot's month.
export default function LastMonthPage() {
  const cfg = REPORTS['last-month']
  const { filters } = useReportFilters()
  const [snapshot, setSnapshot] = useState<string | undefined>(undefined)
  const { data, isLoading, error } = useLastMonth(filters, snapshot)
  const rows = data?.rows ?? []
  const snapshots = data?.snapshots ?? []
  const active = snapshot ?? data?.snapshot_date ?? ''

  return (
    <ReportShell title={cfg.title} subtitle="Forecast snapshot view — rows expected (as of the snapshot) to close in that month">
      {error ? (
        <Alert severity="error">Failed to load data. Is the API running?</Alert>
      ) : (
        <>
          <Box sx={{ mb: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="snapshot-select">Snapshot Date</InputLabel>
              <Select
                labelId="snapshot-select"
                value={snapshots.length ? active : ''}
                label="Snapshot Date"
                onChange={(e) => setSnapshot(e.target.value)}
              >
                {snapshots.map((s) => (
                  <MenuItem key={s} value={s}>{fmtDate(s)}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          {cfg.charts && !isLoading && rows.length > 0 && <ChartStrip rows={rows} specs={cfg.charts} />}
          <DataTable rows={rows} columns={cfg.columns} loading={isLoading} />
        </>
      )}
    </ReportShell>
  )
}
