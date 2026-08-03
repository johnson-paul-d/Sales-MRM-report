import { useState } from 'react'
import {
  AppBar, Toolbar, Typography, Drawer, List, ListItemButton, ListItemIcon,
  ListItemText, Box, Menu, MenuItem, IconButton, Chip, Divider, Avatar, Tooltip,
} from '@mui/material'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import InsightsIcon from '@mui/icons-material/Insights'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import CancelIcon from '@mui/icons-material/Cancel'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import StarIcon from '@mui/icons-material/Star'
import EventBusyIcon from '@mui/icons-material/EventBusy'
import RequestQuoteIcon from '@mui/icons-material/RequestQuote'
import PersonSearchIcon from '@mui/icons-material/PersonSearch'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import HistoryIcon from '@mui/icons-material/History'
import EventNoteIcon from '@mui/icons-material/EventNote'
import FiberNewIcon from '@mui/icons-material/FiberNew'
import SettingsIcon from '@mui/icons-material/Settings'
import LogoutIcon from '@mui/icons-material/Logout'
import BarChartIcon from '@mui/icons-material/BarChart'
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard'
import { useAuth } from '../auth/AuthContext'
import { BRAND } from '../theme'

const DRAWER_WIDTH = 244

interface NavItem { path: string; label: string; icon: JSX.Element; adminOnly?: boolean }
interface NavGroup { heading: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    heading: 'Overview',
    items: [
      { path: '/overview', label: 'Overview', icon: <SpaceDashboardIcon /> },
      { path: '/sales-tracker', label: 'Sales Tracker', icon: <InsightsIcon /> },
    ],
  },
  {
    heading: 'Pipeline',
    items: [
      { path: '/this-month', label: 'This Month', icon: <CalendarMonthIcon /> },
      { path: '/last-month', label: 'Last Month', icon: <HistoryIcon /> },
      { path: '/new-opportunity', label: 'New Opportunity', icon: <FiberNewIcon /> },
      { path: '/new-quotes', label: 'New Quotes', icon: <RequestQuoteIcon /> },
      { path: '/open-funnel', label: 'Open Funnel', icon: <FilterAltIcon /> },
      { path: '/six-month-plan', label: 'Six-Month Plan', icon: <EventNoteIcon /> },
      { path: '/top-enquiries', label: 'Top Enquiries', icon: <StarIcon /> },
      { path: '/no-visits', label: 'No Visits', icon: <EventBusyIcon /> },
    ],
  },
  {
    heading: 'Outcomes',
    items: [
      { path: '/closed-won', label: 'Closed Won', icon: <EmojiEventsIcon /> },
      { path: '/closed-lost', label: 'Closed Lost', icon: <CancelIcon /> },
      { path: '/dropped', label: 'Dropped', icon: <RemoveCircleOutlineIcon /> },
    ],
  },
  {
    heading: 'Demand',
    items: [
      { path: '/leads', label: 'Leads', icon: <PersonSearchIcon /> },
      { path: '/admin', label: 'Administration', icon: <SettingsIcon />, adminOnly: true },
    ],
  },
]

const ALL_ITEMS = NAV.flatMap((g) => g.items)

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [anchor, setAnchor] = useState<null | HTMLElement>(null)

  const current = ALL_ITEMS.find((n) => n.path === location.pathname)

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        elevation={0}
        color="default"
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          bgcolor: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ pl: `${DRAWER_WIDTH + 24}px` }}>
          <Typography variant="h6" sx={{ flexGrow: 1, color: 'text.primary', fontWeight: 700 }}>
            {current?.label ?? 'Dashboard'}
          </Typography>
          {user && (
            <Chip
              label={user.can_view_all ? 'All data' : `${user.visible_user_count} users`}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ mr: 1.5 }}
            />
          )}
          <Tooltip title={user?.email ?? ''}>
            <IconButton onClick={(e) => setAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
              <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 15, fontWeight: 700 }}>
                {(user?.full_name || user?.email || '?').charAt(0).toUpperCase()}
              </Avatar>
            </IconButton>
          </Tooltip>
          <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
            <MenuItem disabled>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{user?.full_name || user?.email}</Typography>
                <Typography variant="caption" color="text.secondary">{user?.role}</Typography>
              </Box>
            </MenuItem>
            <Divider />
            <MenuItem onClick={logout}>
              <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: BRAND.black,
            color: '#cbd5e1',
            borderRight: 'none',
          },
        }}
      >
        {/* Brand */}
        <Box sx={{ px: 2.5, py: 2, display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChartIcon sx={{ color: '#fff', fontSize: 20 }} />
          </Box>
          <Box>
            <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>Sieger</Typography>
            <Typography sx={{ color: '#64748b', fontSize: 11 }}>Sales Intelligence</Typography>
          </Box>
        </Box>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

        <Box sx={{ overflow: 'auto', py: 1 }}>
          {NAV.map((group) => {
            const items = group.items.filter((n) => !n.adminOnly || user?.is_admin)
            if (!items.length) return null
            return (
              <Box key={group.heading} sx={{ mb: 0.5 }}>
                <Typography sx={{ px: 2.5, pt: 1.5, pb: 0.5, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: '#475569', textTransform: 'uppercase' }}>
                  {group.heading}
                </Typography>
                <List dense disablePadding>
                  {items.map((n) => {
                    const active = location.pathname === n.path
                    return (
                      <ListItemButton
                        key={n.path}
                        onClick={() => navigate(n.path)}
                        sx={{
                          mx: 1, my: 0.25, borderRadius: 2, py: 0.6,
                          color: active ? '#fff' : '#cbd5e1',
                          bgcolor: active ? 'rgba(155,36,35,0.32)' : 'transparent',
                          '&:hover': { bgcolor: active ? 'rgba(155,36,35,0.42)' : 'rgba(255,255,255,0.06)' },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 34, color: active ? '#e08b87' : '#857c70' }}>
                          {n.icon}
                        </ListItemIcon>
                        <ListItemText primary={n.label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: active ? 700 : 500 }} />
                      </ListItemButton>
                    )
                  })}
                </List>
              </Box>
            )
          })}
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3, bgcolor: 'background.default', minHeight: '100vh' }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  )
}
