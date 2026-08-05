import { useMemo } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import { Paper } from '@mui/material'

interface Props {
  rows: any[]
  columns: ColDef[]
  loading?: boolean
  height?: number | string
}

export default function DataTable({ rows, columns, loading, height = 'calc(100vh - 300px)' }: Props) {
  // Grand-total pinned row: sums every column tagged context.sum (via col()).
  const totalRow = useMemo(() => {
    const sumCols = columns.filter((c) => (c.context as any)?.sum && c.field)
    if (!sumCols.length || !rows.length) return undefined
    const t: Record<string, any> = {}
    for (const c of sumCols) {
      t[c.field!] = rows.reduce((s, r) => s + Number(r?.[c.field!] || 0), 0)
    }
    const labelCol = columns.find((c) => c.field && !(c.context as any)?.sum)
    if (labelCol?.field) t[labelCol.field] = 'Total'
    return [t]
  }, [rows, columns])

  return (
    <Paper
      variant="outlined"
      className="ag-theme-quartz"
      sx={{
        width: '100%', height, mt: 1,
        '& .ag-floating-bottom .ag-cell': { fontWeight: 700 },
      }}
    >
      <AgGridReact
        rowData={rows}
        columnDefs={columns}
        defaultColDef={{ sortable: true, filter: true, resizable: true, minWidth: 110, flex: 1 }}
        pagination
        paginationPageSize={50}
        paginationPageSizeSelector={[25, 50, 100, 200]}
        loading={loading}
        enableCellTextSelection
        suppressCellFocus
        pinnedBottomRowData={totalRow}
      />
    </Paper>
  )
}
