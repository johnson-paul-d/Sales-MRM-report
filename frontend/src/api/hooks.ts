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

export interface NewOppResponse {
  rows: any[]
  by_user: { user_name: string; count: number }[]
}
export const useNewOpportunity = (f?: ReportFilters) =>
  useQuery({
    queryKey: ['new-opportunity', f],
    queryFn: async () => (await api.get<NewOppResponse>(`/reports/new-opportunity?${toParams(f)}`)).data,
  })
