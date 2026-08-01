import { useState } from 'react'
import {
  Box, Button, Table, TableHead, TableRow, TableCell, TableBody, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, Switch, FormControlLabel,
  MenuItem, Paper, Chip, Autocomplete, Snackbar,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import KeyIcon from '@mui/icons-material/Key'
import { useAppUsers, useUserMutations, useUserRegions, type AdminAppUser } from '../../api/admin'

const ROLES = ['SALESPERSON', 'MANAGER', 'HIGH_MANAGER', 'CEO', 'ADMIN']

export default function AccountsTab() {
  const { data: users = [] } = useAppUsers()
  const { data: sfUsers = [] } = useUserRegions()
  const { create, update, resetPw } = useUserMutations()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AdminAppUser | null>(null)
  const [form, setForm] = useState<any>({})
  const [pwFor, setPwFor] = useState<AdminAppUser | null>(null)
  const [pw, setPw] = useState('')
  const [snack, setSnack] = useState('')

  const sfOptions = sfUsers.map((u) => ({ id: u.salesforce_user_id, label: u.user_name || u.salesforce_user_id }))

  const openNew = () => { setEditing(null); setForm({ role: 'SALESPERSON', can_view_all: false, is_admin: false, is_active: true }); setOpen(true) }
  const openEdit = (u: AdminAppUser) => { setEditing(u); setForm({ ...u }); setOpen(true) }

  const save = async () => {
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id, full_name: form.full_name, role: form.role, can_view_all: form.can_view_all,
          is_admin: form.is_admin, is_active: form.is_active, salesforce_user_id: form.salesforce_user_id,
        })
      } else {
        await create.mutateAsync({
          email: form.email, full_name: form.full_name, salesforce_user_id: form.salesforce_user_id,
          password: form.password, role: form.role, can_view_all: form.can_view_all, is_admin: form.is_admin,
        })
      }
      setOpen(false); setSnack('Saved')
    } catch (e: any) {
      setSnack(e?.response?.data?.detail || 'Error saving')
    }
  }

  const doReset = async () => {
    if (!pwFor) return
    try { await resetPw.mutateAsync({ id: pwFor.id, pw }); setPwFor(null); setPw(''); setSnack('Password updated') }
    catch { setSnack('Error') }
  }

  return (
    <Box>
      <Button startIcon={<AddIcon />} variant="contained" onClick={openNew} sx={{ mb: 2 }}>Add Account</Button>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Email</TableCell><TableCell>Name</TableCell><TableCell>Role</TableCell>
              <TableCell>Scope</TableCell><TableCell>Admin</TableCell><TableCell>Active</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} hover>
                <TableCell>{u.email}</TableCell>
                <TableCell>{u.full_name || '—'}</TableCell>
                <TableCell>{u.role}</TableCell>
                <TableCell>{u.can_view_all ? <Chip size="small" color="primary" label="All data" /> : 'Team'}</TableCell>
                <TableCell>{u.is_admin ? '✓' : ''}</TableCell>
                <TableCell>{u.is_active ? '✓' : <Chip size="small" label="off" />}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => openEdit(u)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => { setPwFor(u); setPw('') }}><KeyIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Account' : 'Add Account'}</DialogTitle>
        <DialogContent>
          <TextField label="Email" fullWidth margin="normal" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editing} />
          <TextField label="Full name" fullWidth margin="normal" value={form.full_name || ''} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Autocomplete
            options={sfOptions}
            getOptionLabel={(o) => o.label}
            value={sfOptions.find((o) => o.id === form.salesforce_user_id) || null}
            onChange={(_, v) => setForm({ ...form, salesforce_user_id: v?.id ?? null })}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            renderInput={(p) => <TextField {...p} label="Salesforce user (owner mapping)" margin="normal" />}
          />
          {!editing && (
            <TextField label="Password" fullWidth margin="normal" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          )}
          <TextField select label="Role" fullWidth margin="normal" value={form.role || 'SALESPERSON'} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
          </TextField>
          <FormControlLabel control={<Switch checked={!!form.can_view_all} onChange={(e) => setForm({ ...form, can_view_all: e.target.checked })} />} label="Can view ALL data (CEO / exec)" />
          <FormControlLabel control={<Switch checked={!!form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} />} label="Admin (access this panel)" />
          {editing && (
            <FormControlLabel control={<Switch checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />} label="Active" />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={!editing && (!form.email || !form.password)}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!pwFor} onClose={() => setPwFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Reset password</DialogTitle>
        <DialogContent>
          <TextField label={`New password for ${pwFor?.email || ''}`} fullWidth margin="normal" value={pw} onChange={(e) => setPw(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwFor(null)}>Cancel</Button>
          <Button variant="contained" onClick={doReset} disabled={!pw}>Update</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack} />
    </Box>
  )
}
