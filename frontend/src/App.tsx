import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { theme } from './theme'
import { AuthProvider } from './auth/AuthContext'
import { ReportFiltersProvider } from './state/FiltersContext'
import ProtectedRoute from './auth/ProtectedRoute'
import AppLayout from './components/AppLayout'
import LoginPage from './pages/LoginPage'
import SalesTrackerPage from './pages/SalesTrackerPage'
import ReportTablePage from './pages/ReportTablePage'
import LeadsPage from './pages/LeadsPage'
import NewOpportunityPage from './pages/NewOpportunityPage'
import ClosedLostPage from './pages/ClosedLostPage'
import AdminPage from './pages/AdminPage'
import { REPORTS } from './pages/reportConfigs'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <ReportFiltersProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route index element={<Navigate to="/sales-tracker" replace />} />
                    <Route path="/sales-tracker" element={<SalesTrackerPage />} />
                    <Route path="/closed-won" element={<ReportTablePage cfg={REPORTS['closed-won']} />} />
                    <Route path="/closed-lost" element={<ClosedLostPage />} />
                    <Route path="/dropped" element={<ReportTablePage cfg={REPORTS['dropped']} />} />
                    <Route path="/open-funnel" element={<ReportTablePage cfg={REPORTS['open-funnel']} />} />
                    <Route path="/top-enquiries" element={<ReportTablePage cfg={REPORTS['top-enquiries']} />} />
                    <Route path="/no-visits" element={<ReportTablePage cfg={REPORTS['no-visits']} />} />
                    <Route path="/new-quotes" element={<ReportTablePage cfg={REPORTS['new-quotes']} />} />
                    <Route path="/this-month" element={<ReportTablePage cfg={REPORTS['this-month']} />} />
                    <Route path="/last-month" element={<ReportTablePage cfg={REPORTS['last-month']} />} />
                    <Route path="/six-month-plan" element={<ReportTablePage cfg={REPORTS['six-month-plan']} />} />
                    <Route path="/new-opportunity" element={<NewOpportunityPage />} />
                    <Route path="/leads" element={<LeadsPage />} />
                    <Route path="/admin" element={<AdminPage />} />
                    <Route path="*" element={<Navigate to="/sales-tracker" replace />} />
                  </Route>
                </Route>
              </Routes>
            </BrowserRouter>
          </ReportFiltersProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
