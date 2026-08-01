import { useState } from 'react'
import {
  Box, Button, Table, TableHead, TableRow, TableCell, TableBody, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Paper, Autocomplete, Snackbar,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { useTargets, useTargetMutations, useUserRegions, useRegions } from '../../api/admin'
import { fmtINR, fmtDate } from '../../components/formatters'

const PERIODS = ['MONTH', 'QUARTER', 'FY']

export default function TargetsTab() {
  const { data: targets = [] } = useTargets()
  const { data: sfUsers = [] } = useUserRegions()
  const { data: regions = [] } = useRegions()
  const { create, remove } = useTargetMutations()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<any>({ period_type: 'MONTH' })
  const [snack, setSnack] = useState('')

  const userName = (id?: string | null) => sfUsers.find((u) => u.salesforce_user_id === id)?.user_name || (id ? id : '—')
  const regionName = (id?: number | null) => regions.find((r) => r.id === id)?.name || '—'
  const sfOptions = sfUsers.map((u) => ({ id: u.salesforce_user_id, label: u.user_name || u.salesforce_user_id }))

  const save = async () => {
    try {
      await create.mutateAsync({
        salesforce_user_id: form.salesforce_user_id ?? null,
        region_id: form.region_id ?? null,
        period_type: form.period_type,
        period_start: form.period_start,
        target_amount: Number(form.target_amount || 0),
      })
      setOpen(false); setForm({ period_type: 'MONTH' }); setSnack('Target added')
    } catch (e: any) {
      setSnack(e?.response?.data?.detail || 'Error')
    }
  }

  return (
    <Box>
      <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)} sx={{ mb: 2 }}>Add Target</Button>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Owner</TableCell><TableCell>Region</TableCell><TableCell>Period</TableCell>
              <TableCell>Start</TableCell><TableCell align="right">Target</TableCell><TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {targets.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>{userName(t.salesforce_user_id)}</TableCell>
                <TableCell>{regionName(t.region_id)}</TableCell>
                <TableCell>{t.period_type}</TableCell>
                <TableCell>{fmtDate(t.period_start)}</TableCell>
                <TableCell align="right">{fmtINR(t.target_amount)}</TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={async () => { if (window.confirm('Delete target?')) { await remove.mutateAsync(t.id); setSnack('Deleted') } }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {targets.length === 0 && <TableRow><TableCell colSpan={6}>No targets yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Target</DialogTitle>
        <DialogContent>
          <Autocomplete
            options={sfOptions}
            getOptionLabel={(o) => o.label}
            value={sfOptions.find((o) => o.id === form.salesforce_user_id) || null}
            onChange={(_, v) => setForm({ ...form, salesforce_user_id: v?.id ?? null })}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            renderInput={(p) => <TextField {...p} label="Salesperson (optional)" margin="normal" />}
          />
          <TextField select label="Region (optional)" fullWidth margin="normal" value={form.region_id ?? ''} onChange={(e) => setForm({ ...form, region_id: e.target.value === '' ? null : Number(e.target.value) })}>
            <MenuItem value=""><em>—</em></MenuItem>
            {regions.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
          </TextField>
          <TextField select label="Period type" fullWidth margin="normal" value={form.period_type} onChange={(e) => setForm({ ...form, period_type: e.target.value })}>
            {PERIODS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </TextField>
          <TextField type="date" label="Period start" fullWidth margin="normal" InputLabelProps={{ shrink: true }} value={form.period_start || ''} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
          <TextField type="number" label="Target amount (₹)" fullWidth margin="normal" value={form.target_amount || ''} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={!form.period_start || !form.target_amount}>Save</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack} />
    </Box>
  )
}
