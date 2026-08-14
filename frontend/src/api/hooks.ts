import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type {
  Me, FiltersResponse, RowsResponse, LeadsResponse, ReportFilters,
} from './types'

function toParams(f?: ReportFilters): string {
  const p = new URLSearchParams()
  f?.user_ids?.forEach((u) => p.append('user_ids', u))
  f?.region_ids?.forEach((r) => p.append('region_ids', String(r)))
  f?.division?.forEach((d) => p.append('division', d))
  if (f?.fy) p.append('fy', f.fy)
  if (f?.date_from) p.append('date_from', f.date_from)
  if (f?.date_to) p.append('date_to', f.date_to)
  if (f?.month) p.append('month', f.month)
  return p.toString()
}

export const useMe = () =>
  useQuery({ queryKey: ['me'], queryFn: async () => (await api.get<Me>('/auth/me')).data })

export const useFilterOptions = () =>
  useQuery({
    queryKey: ['filters'],
    queryFn: async () => (await api.get<FiltersResponse>('/meta/filters')).data,
    staleTime: 5 * 60 * 1000,
  })

export function useReport<T = any>(path: string, f?: ReportFilters) {
  return useQuery({
    queryKey: [path, f],
    queryFn: async () => (await api.get<RowsResponse<T>>(`/reports/${path}?${toParams(f)}`)).data,
  })
}

export const useLeads = (f?: ReportFilters) =>
  useQuery({
    queryKey: ['leads', f],
    queryFn: async () => (await api.get<LeadsResponse>(`/reports/leads?${toParams(f)}`)).data,
  })

export interface LastMonthResponse {
  rows: any[]
  snapshots: string[]      // available forecast snapshot dates, newest first
  snapshot_date: string | null
}
export const useLastMonth = (f?: ReportFilters, snapshot?: string) =>
  useQuery({
    queryKey: ['last-month', f, snapshot],
    queryFn: async () => {
      const params = toParams(f)
      const qs = snapshot ? `${params}&snapshot=${snapshot}` : `${params}`
      return (await api.get<LastMonthResponse>(`/reports/last-month?${qs}`)).data
    },
  })

export interface OpenFunnelResponse {
  rows: any[]
  // Active targets (period covers today) from app.sales_target, owner-resolved
  targets: { salesforce_user_id: string | null; region_id: number | null; owner: string; target_amount: number }[]
  // Owner x quote-created-month cells for the PBI matrix
  by_quote_month: { user_name: string; year_month: string; total_price: number }[]
}
export const useOpenFunnel = (f?: ReportFilters) =>
  useQuery({
    queryKey: ['open-funnel-full', f],
    queryFn: async () => (await api.get<OpenFunnelResponse>(`/reports/open-funnel?${toParams(f)}`)).data,
  })

export interface NewOppResponse {
  rows: any[]
  by_user: { user_name: string; count: number; min_construction_stage: string | null }[]
}
export const useNewOpportunity = (f?: ReportFilters) =>
  useQuery({
    queryKey: ['new-opportunity', f],
    queryFn: async () => (await api.get<NewOppResponse>(`/reports/new-opportunity?${toParams(f)}`)).data,
  })
