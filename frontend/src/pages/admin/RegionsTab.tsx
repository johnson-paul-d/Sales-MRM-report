import { useState } from 'react'
import {
  Box, Button, Table, TableHead, TableRow, TableCell, TableBody, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, Switch, FormControlLabel,
  Paper, Chip, Snackbar,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { useRegions, useRegionMutations, type AdminRegion } from '../../api/admin'

export default function RegionsTab() {
  const { data: regions = [], isLoading } = useRegions()
  const { create, update, remove } = useRegionMutations()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AdminRegion | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [active, setActive] = useState(true)
  const [snack, setSnack] = useState('')

  const openNew = () => { setEditing(null); setName(''); setCode(''); setActive(true); setOpen(true) }
  const openEdit = (r: AdminRegion) => { setEditing(r); setName(r.name); setCode(r.code || ''); setActive(r.is_active); setOpen(true) }

  const save = async () => {
    try {
      if (editing) await update.mutateAsync({ id: editing.id, name, code: code || null, is_active: active })
      else await create.mutateAsync({ name, code: code || null, is_active: active })
      setOpen(false); setSnack('Saved')
    } catch (e: any) {
      setSnack(e?.response?.data?.detail || 'Error saving')
    }
  }

  const del = async (r: AdminRegion) => {
    if (!window.confirm(`Delete region "${r.name}"? Assigned users will be unassigned.`)) return
    await remove.mutateAsync(r.id); setSnack('Deleted')
  }

  return (
    <Box>
      <Button startIcon={<AddIcon />} variant="contained" onClick={openNew} sx={{ mb: 2 }}>
        Add Region
      </Button>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Code</TableCell>
              <TableCell>Active</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {regions.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.code || '—'}</TableCell>
                <TableCell>
                  {r.is_active ? <Chip size="small" label="Active" color="success" /> : <Chip size="small" label="Inactive" />}
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => openEdit(r)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => del(r)}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && regions.length === 0 && (
              <TableRow><TableCell colSpan={4}>No regions yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? 'Edit Region' : 'Add Region'}</DialogTitle>
        <DialogContent>
          <TextField label="Name" fullWidth margin="normal" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <TextField label="Code (optional)" fullWidth margin="normal" value={code} onChange={(e) => setCode(e.target.value)} />
          <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={!name.trim()}>Save</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack} />
    </Box>
  )
}
