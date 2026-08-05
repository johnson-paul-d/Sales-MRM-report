export interface Me {
  id: number
  email: string
  full_name?: string | null
  role: string
  is_admin: boolean
  can_view_all: boolean
  salesforce_user_id?: string | null
  visible_user_count: number
}

export interface FilterUser {
  id: string
  name: string
  is_active: boolean | null
  region_id: number | null
  region_name: string | null
}

export interface FilterRegion {
  id: number
  name: string
  code?: string | null
}

export interface FiltersResponse {
  users: FilterUser[]
  regions: FilterRegion[]
  financial_years: string[]
  divisions: string[]
}

export interface ReportFilters {
  user_ids?: string[]
  region_ids?: number[]
  division?: string[]
  fy?: string | null
  date_from?: string
  date_to?: string
  month?: string
}

export interface SalesTrackerRow {
  owner_id: string
  user_name: string
  region_id: number | null
  region_name: string | null
  year_month: string
  month_start: string
  fy_label: string
  fq_label: string
  visits: number | null
  opportunities_created: number | null
  open_quotes_value: number | null
  live_quote_value: number | null
  closed_won_value: number | null
  closed_lost_value: number | null
  dropped_value: number | null
}

export interface RowsResponse<T = Record<string, any>> {
  rows: T[]
}

export interface LeadsResponse {
  overall: { total_leads: number; converted_leads: number; conversion_ratio_pct: number }
  by_source: { lead_source: string; total_leads: number; converted_leads: number }[]
  by_status: { status: string; total_leads: number }[]
  by_user: { user_name: string; total_leads: number; converted_leads: number }[]
  by_user_status: { user_name: string | null; status: string | null; total_leads: number }[]
  rows: {
    lead_name: string; company: string | null; city: string | null; email: string | null
    mobile_phone: string | null; lead_source: string | null; status: string | null
    user_name: string | null; created_date: string | null
  }[]
}
