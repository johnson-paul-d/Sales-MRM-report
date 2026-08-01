import { Alert } from '@mui/material'
import ReportShell from '../components/ReportShell'
import DataTable from '../components/DataTable'
import { useReport } from '../api/hooks'
import { useReportFilters } from '../state/FiltersContext'
import type { ReportConfig } from './reportConfigs'

export default function ReportTablePage({ cfg }: { cfg: ReportConfig }) {
  const { filters } = useReportFilters()
  const { data, isLoading, error } = useReport(cfg.path, filters)

  return (
    <ReportShell title={cfg.title} subtitle={cfg.subtitle}>
      {error ? (
        <Alert severity="error">Failed to load data. Is the API running?</Alert>
      ) : (
        <DataTable rows={data?.rows ?? []} columns={cfg.columns} loading={isLoading} />
      )}
    </ReportShell>
  )
}
