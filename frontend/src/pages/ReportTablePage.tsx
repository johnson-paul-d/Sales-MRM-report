import { useMemo, useState } from 'react'
import { Alert, Box, Chip, FormControl, InputLabel, MenuItem, OutlinedInput, Select } from '@mui/material'
import ReportShell from '../components/ReportShell'
import DataTable from '../components/DataTable'
import ChartStrip from '../components/ChartStrip'
import { useReport } from '../api/hooks'
import { useReportFilters } from '../state/FiltersContext'
import type { ReportConfig } from './reportConfigs'

export default function ReportTablePage({ cfg }: { cfg: ReportConfig }) {
  const { filters } = useReportFilters()
  const { data, isLoading, error } = useReport(cfg.path, filters)
  const allRows = data?.rows ?? []

  const [stages, setStages] = useState<string[]>([])
  const stageOptions = useMemo(
    () => [...new Set(allRows.map((r: any) => r.stage_name).filter(Boolean))].sort() as string[],
    [allRows],
  )
  const rows = cfg.stageFilter && stages.length
    ? allRows.filter((r: any) => stages.includes(r.stage_name))
    : allRows

  return (
    <ReportShell title={cfg.title} subtitle={cfg.subtitle}>
      {error ? (
        <Alert severity="error">Failed to load data. Is the API running?</Alert>
      ) : (
        <>
          {cfg.stageFilter && !isLoading && (
            <Box sx={{ mb: 1.5 }}>
              <FormControl size="small" sx={{ minWidth: 240 }}>
                <InputLabel id={`${cfg.path}-stage`}>Stage</InputLabel>
                <Select
                  labelId={`${cfg.path}-stage`}
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
          )}
          {cfg.charts && !isLoading && rows.length > 0 && <ChartStrip rows={rows} specs={cfg.charts} />}
          <DataTable rows={rows} columns={cfg.columns} loading={isLoading} />
        </>
      )}
    </ReportShell>
  )
}
