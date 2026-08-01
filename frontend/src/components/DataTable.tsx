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
  return (
    <Paper variant="outlined" className="ag-theme-quartz" sx={{ width: '100%', height, mt: 1 }}>
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
      />
    </Paper>
  )
}
