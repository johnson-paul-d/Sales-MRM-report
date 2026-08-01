import { useState } from 'react'
import { Box, Typography, Tabs, Tab } from '@mui/material'
import RegionsTab from './admin/RegionsTab'
import UserRegionsTab from './admin/UserRegionsTab'
import AccountsTab from './admin/AccountsTab'
import TargetsTab from './admin/TargetsTab'

export default function AdminPage() {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Typography variant="h5">Administration</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 1, mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Regions" />
        <Tab label="User → Region" />
        <Tab label="Login Accounts" />
        <Tab label="Targets" />
      </Tabs>
      {tab === 0 && <RegionsTab />}
      {tab === 1 && <UserRegionsTab />}
      {tab === 2 && <AccountsTab />}
      {tab === 3 && <TargetsTab />}
    </Box>
  )
}
