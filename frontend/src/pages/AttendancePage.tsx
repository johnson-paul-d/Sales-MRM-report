import { useMemo, useState } from 'react'
import {
  Alert, Box, Chip, FormControl, FormControlLabel, InputLabel, MenuItem,
  OutlinedInput, Paper, Select, Switch, Typography,
} from '@mui/material'
import type { ColDef } from 'ag-grid-community'
import ReportShell from '../components/ReportShell'
import DataTable from '../components/DataTable'
import { useAttendance } from '../api/hooks'
import { useReportFilters } from '../state/FiltersContext'
import { col } from './reportConfigs'
import { fmtDate } from '../components/formatters'

const STATUS_COLOURS: Record<string, string> = {
  Present: '#1b7f3b',
  HD: '#b8860b',
  Leave: '#5b6b7a',
  Sunday: '#8a8a8a',
  Holiday: '#8a8a8a',
  // Work on a rest day -- highlighted rather than hidden behind "Sunday".
  'Sunday (Worked)': '#0b6bb3',
  'Holiday (Worked)': '#0b6bb3',
  Mismatch: '#c0392b',
  'No Data': '#b0b0b0',
}

const time = (v: string | null) => (v ? String(v).slice(11, 16) : '')

const columns: ColDef[] = [
  col('user_name', 'User', 'text', { pinned: 'left', minWidth: 150 }),
  col('activity_date', 'Date', 'date', { pinned: 'left', minWidth: 120 }),
  {
    field: 'activity_status',
    headerName: 'Status',
    minWidth: 110,
    cellStyle: (p: any) => ({ color: STATUS_COLOURS[p.value] ?? 'inherit', fontWeight: 700 }),
  },
  col('in_time', 'IN', 'text', { valueFormatter: (p) => time(p.value), minWidth: 90 }),
  col('out_time', 'OUT', 'text', { valueFormatter: (p) => time(p.value), minWidth: 90 }),
  col('working_hours', 'Working Hours', 'text', { minWidth: 130 }),
  col('total_working_hours', 'Total Working Hours', 'text', { minWidth: 160 }),
  col('meeting_time', 'Meeting Time', 'text', { minWidth: 120 }),
  col('number_visits', 'Visits', 'int', { minWidth: 100 }),
  col('km_travelled', 'KM', 'int', { minWidth: 100 }),
  col('first_checkin', 'First Check-In', 'text', { valueFormatter: (p) => time(p.value), minWidth: 130 }),
  col('last_checkout', 'Last Check-Out', 'text', { valueFormatter: (p) => time(p.value), minWidth: 140 }),
  col('work_from_home', 'WFH', 'text', { minWidth: 90 }),
  col('ho_or_bo', 'HO / BO', 'text', { minWidth: 100 }),
  col('remarks', 'Remarks', 'text', { flex: 2, minWidth: 220 }),
  col('unique_customers', 'Customers', 'text', { flex: 2, minWidth: 220 }),
  col('working_shift', 'Shift', 'text', { minWidth: 160 }),
]

const summaryColumns: ColDef[] = [
  col('user_name', 'User', 'text', { pinned: 'left', minWidth: 150 }),
  col('region_name', 'Region'),
  col('present', 'Present', 'int'),
  col('hd', 'Half Day', 'int'),
  col('leave', 'Leave', 'int'),
  col('mismatch', 'Mismatch', 'int'),
  col('visits', 'Visits', 'int'),
  col('km', 'KM', 'int'),
  col('hours', 'Hours', 'int'),
]

/** Last 12 months as YYYY-MM, newest first. */
function recentMonths(): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < 12; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

export default function AttendancePage() {
  const { filters } = useReportFilters()
  const months = useMemo(recentMonths, [])
  const [month, setMonth] = useState<string>(months[0])
  const [includeEmpty, setIncludeEmpty] = useState(false)
  const [statuses, setStatuses] = useState<string[]>([])

  const { data, isLoading, error } = useAttendance({ ...filters, month, include_empty: includeEmpty })
  const allRows = data?.rows ?? []
  const rows = statuses.length
    ? allRows.filter((r: any) => statuses.includes(r.activity_status))
    : allRows

  const statusOptions = useMemo(
    () => [...new Set(allRows.map((r: any) => r.activity_status).filter(Boolean))].sort() as string[],
    [allRows],
  )

  return (
    <ReportShell
      title="Attendance"
      subtitle="Daily attendance from Start/End Work stamps and visit check-ins"
    >
      {error ? (
        <Alert severity="error">Failed to load attendance. Is the API running?</Alert>
      ) : (
        <>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="att-month">Month</InputLabel>
              <Select
                labelId="att-month"
                value={month}
                label="Month"
                onChange={(e) => setMonth(e.target.value)}
              >
                {months.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel id="att-status">Status</InputLabel>
              <Select
                labelId="att-status"
                multiple
                value={statuses}
                onChange={(e) =>
                  setStatuses(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)
                }
                input={<OutlinedInput label="Status" />}
                renderValue={(sel) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {sel.map((s) => <Chip key={s} label={s} size="small" />)}
                  </Box>
                )}
              >
                {statusOptions.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControlLabel
              control={<Switch checked={includeEmpty} onChange={(e) => setIncludeEmpty(e.target.checked)} />}
              label="Show days with no activity"
            />
          </Box>

          <DataTable rows={rows} columns={columns} loading={isLoading} height="calc(100vh - 430px)" />

          <Paper variant="outlined" sx={{ p: 0, mt: 2 }}>
            <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>
              Summary for {month} — {fmtDate(new Date().toISOString())}
            </Typography>
            <DataTable rows={data?.summary ?? []} columns={summaryColumns} height={300} />
          </Paper>
        </>
      )}
    </ReportShell>
  )
}
