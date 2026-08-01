import { useState, useMemo } from 'react'
import {
  Box, TextField, FormControlLabel, Switch, Table, TableHead, TableRow, TableCell,
  TableBody, Select, MenuItem, Paper, Chip,
} from '@mui/material'
import { useUserRegions, useAssignRegion, useRegions } from '../../api/admin'

export default function UserRegionsTab() {
  const { data: users = [] } = useUserRegions()
  const { data: regions = [] } = useRegions()
  const assign = useAssignRegion()
  const [q, setQ] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)

  const filtered = useMemo(
    () =>
      users.filter(
        (u) => (!activeOnly || u.is_active) && (u.user_name || '').toLowerCase().includes(q.toLowerCase()),
      ),
    [users, q, activeOnly],
  )

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
        <TextField size="small" label="Search salesperson" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 280 }} />
        <FormControlLabel control={<Switch checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />} label="Active only" />
        <Box sx={{ flexGrow: 1 }} />
        <Chip label={`${filtered.length} users`} />
      </Box>
      <Paper variant="outlined" sx={{ maxHeight: 'calc(100vh - 280px)', overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Salesperson</TableCell>
              <TableCell>Status</TableCell>
              <TableCell width={260}>Region</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.salesforce_user_id} hover>
                <TableCell>{u.user_name || u.salesforce_user_id}</TableCell>
                <TableCell>{u.is_active ? 'Active' : <Chip size="small" label="Inactive" />}</TableCell>
                <TableCell>
                  <Select
                    size="small"
                    fullWidth
                    value={u.region_id ?? ''}
                    displayEmpty
                    onChange={(e) =>
                      assign.mutate({
                        sfId: u.salesforce_user_id,
                        regionId: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  >
                    <MenuItem value=""><em>— none —</em></MenuItem>
                    {regions.filter((r) => r.is_active).map((r) => (
                      <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>
                    ))}
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  )
}
