import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface AdminRegion { id: number; name: string; code?: string | null; is_active: boolean }
export interface UserRegionRow {
  salesforce_user_id: string
  user_name: string | null
  is_active: boolean | null
  region_id: number | null
  region_name: string | null
}
export interface AdminAppUser {
  id: number
  email: string
  full_name?: string | null
  salesforce_user_id?: string | null
  role: string
  can_view_all: boolean
  is_active: boolean
  is_admin: boolean
  last_login?: string | null
}
export interface AdminTarget {
  id: number
  salesforce_user_id?: string | null
  region_id?: number | null
  period_type: string
  period_start: string
  target_amount: number
}

// ---------------- Regions ----------------
export const useRegions = () =>
  useQuery({ queryKey: ['admin', 'regions'], queryFn: async () => (await api.get<AdminRegion[]>('/admin/regions')).data })

export function useRegionMutations() {
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: ['admin', 'regions'] })
  return {
    create: useMutation({ mutationFn: (b: Partial<AdminRegion>) => api.post('/admin/regions', b), onSuccess: () => { inv(); qc.invalidateQueries({ queryKey: ['filters'] }) } }),
    update: useMutation({ mutationFn: ({ id, ...b }: AdminRegion) => api.put(`/admin/regions/${id}`, b), onSuccess: () => { inv(); qc.invalidateQueries({ queryKey: ['filters'] }) } }),
    remove: useMutation({ mutationFn: (id: number) => api.delete(`/admin/regions/${id}`), onSuccess: () => { inv(); qc.invalidateQueries({ queryKey: ['admin', 'user-regions'] }); qc.invalidateQueries({ queryKey: ['filters'] }) } }),
  }
}

// ------------- User -> Region -------------
export const useUserRegions = () =>
  useQuery({ queryKey: ['admin', 'user-regions'], queryFn: async () => (await api.get<UserRegionRow[]>('/admin/user-regions?active_only=false')).data })

export function useAssignRegion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sfId, regionId }: { sfId: string; regionId: number | null }) =>
      api.put(`/admin/user-regions/${sfId}`, { region_id: regionId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'user-regions'] })
      qc.invalidateQueries({ queryKey: ['filters'] })
    },
  })
}

// -------------- Login accounts --------------
export const useAppUsers = () =>
  useQuery({ queryKey: ['admin', 'users'], queryFn: async () => (await api.get<AdminAppUser[]>('/admin/users')).data })

export function useUserMutations() {
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] })
  return {
    create: useMutation({ mutationFn: (b: any) => api.post('/admin/users', b), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, ...b }: any) => api.put(`/admin/users/${id}`, b), onSuccess: inv }),
    resetPw: useMutation({ mutationFn: ({ id, pw }: { id: number; pw: string }) => api.post(`/admin/users/${id}/reset-password`, { new_password: pw }) }),
  }
}

// ----------------- Targets -----------------
export const useTargets = () =>
  useQuery({ queryKey: ['admin', 'targets'], queryFn: async () => (await api.get<AdminTarget[]>('/admin/targets')).data })

export function useTargetMutations() {
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: ['admin', 'targets'] })
  return {
    create: useMutation({ mutationFn: (b: any) => api.post('/admin/targets', b), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: number) => api.delete(`/admin/targets/${id}`), onSuccess: inv }),
  }
}
