import type { ColDef } from 'ag-grid-community'
import { fmtINR, fmtInt, fmtDate } from '../components/formatters'

type Kind = 'text' | 'int' | 'inr' | 'date'

export function col(field: string, headerName: string, kind: Kind = 'text', extra: Partial<ColDef> = {}): ColDef {
  const base: ColDef = { field, headerName, ...extra }
  if (kind === 'inr') {
    base.valueFormatter = (p) => fmtINR(p.value)
    base.type = 'numericColumn'
    base.filter = 'agNumberColumnFilter'
  } else if (kind === 'int') {
    base.valueFormatter = (p) => fmtInt(p.value)
    base.type = 'numericColumn'
    base.filter = 'agNumberColumnFilter'
  } else if (kind === 'date') {
    base.valueFormatter = (p) => fmtDate(p.value)
    base.filter = 'agDateColumnFilter'
  }
  return base
}

export interface ReportConfig {
  title: string
  subtitle?: string
  path: string
  columns: ColDef[]
}

export const REPORTS: Record<string, ReportConfig> = {
  'closed-won': {
    title: 'Closed Won',
    subtitle: 'Won opportunities and their quote line items',
    path: 'closed-won',
    columns: [
      col('user_name', 'Salesperson'),
      col('region_name', 'Region'),
      col('opportunity_name', 'Opportunity', 'text', { flex: 2 }),
      col('account_name', 'Account'),
      col('product_name', 'Product'),
      col('quantity', 'Qty', 'int'),
      col('total_price', 'Line Total', 'inr'),
      col('opportunity_amount', 'Opp Amount', 'inr'),
      col('stage_name', 'Stage'),
      col('division', 'Division'),
      col('close_date', 'Close Date', 'date'),
      col('remarks', 'Remarks', 'text', { flex: 2 }),
    ],
  },
  'closed-lost': {
    title: 'Closed Lost',
    subtitle: 'Opportunities marked Closed Lost',
    path: 'closed-lost',
    columns: [
      col('user_name', 'Salesperson'),
      col('region_name', 'Region'),
      col('opportunity_name', 'Opportunity', 'text', { flex: 2 }),
      col('account_name', 'Account'),
      col('product_name', 'Product'),
      col('quantity', 'Qty', 'int'),
      col('total_price', 'Line Total', 'inr'),
      col('stage_name', 'Stage'),
      col('close_date', 'Close Date', 'date'),
      col('loss_reason', 'Loss Reason', 'text', { flex: 1 }),
      col('remarks', 'Remarks', 'text', { flex: 2 }),
    ],
  },
  dropped: {
    title: 'Dropped Opportunities',
    subtitle: 'Opportunities in the Dropped stage',
    path: 'dropped',
    columns: [
      col('user_name', 'Salesperson'),
      col('region_name', 'Region'),
      col('opportunity_name', 'Opportunity', 'text', { flex: 2 }),
      col('account_name', 'Account'),
      col('product_name', 'Product'),
      col('quantity', 'Qty', 'int'),
      col('total_price', 'Line Total', 'inr'),
      col('opportunity_amount', 'Opp Amount', 'inr'),
      col('close_date', 'Close Date', 'date'),
      col('remarks', 'Remarks', 'text', { flex: 2 }),
    ],
  },
  'open-funnel': {
    title: 'Open Funnel',
    subtitle: 'Open opportunities (not closed) with quoted value',
    path: 'open-funnel',
    columns: [
      col('user_name', 'Salesperson'),
      col('region_name', 'Region'),
      col('opportunity_name', 'Opportunity', 'text', { flex: 2 }),
      col('stage_name', 'Stage'),
      col('opportunity_amount', 'Opp Amount', 'inr'),
      col('quote_total_price', 'Quoted Value', 'inr'),
      col('quantity', 'Qty', 'int'),
      col('division', 'Division'),
      col('close_date', 'Close Date', 'date'),
    ],
  },
  'top-enquiries': {
    title: 'Top Enquiries',
    subtitle: 'Highest-value open opportunities',
    path: 'top-enquiries',
    columns: [
      col('user_name', 'Salesperson'),
      col('region_name', 'Region'),
      col('opportunity_name', 'Opportunity', 'text', { flex: 2 }),
      col('stage_name', 'Stage'),
      col('quote_total_price', 'Quoted Value', 'inr'),
      col('quantity', 'Qty', 'int'),
      col('close_date', 'Close Date', 'date'),
      col('remarks', 'Remarks', 'text', { flex: 2 }),
    ],
  },
  'no-visits': {
    title: 'No Visit Opportunities',
    subtitle: 'Open opportunities with stale or no recent activity',
    path: 'no-visits',
    columns: [
      col('user_name', 'Salesperson'),
      col('region_name', 'Region'),
      col('account_name', 'Account'),
      col('opportunity_name', 'Opportunity', 'text', { flex: 2 }),
      col('product_name', 'Product'),
      col('quantity', 'Qty', 'int'),
      col('total_price', 'Line Total', 'inr'),
      col('stage_name', 'Stage'),
      col('days_since_last_activity', 'Days Idle', 'int'),
      col('latest_checkin_opp', 'Last Check-in (Opp)', 'date'),
      col('close_date', 'Close Date', 'date'),
    ],
  },
  'new-quotes': {
    title: 'New Quotes Released',
    subtitle: 'Earliest presented quote per opportunity',
    path: 'new-quotes',
    columns: [
      col('user_name', 'Salesperson'),
      col('region_name', 'Region'),
      col('opportunity_name', 'Opportunity', 'text', { flex: 2 }),
      col('product_name', 'Product'),
      col('quantity', 'Qty', 'int'),
      col('quote_value', 'Quote Value', 'inr'),
      col('opp_stage', 'Stage'),
      col('earliest_presented_date', 'Presented On', 'date'),
    ],
  },
  'this-month': {
    title: 'This Month',
    subtitle: 'Open opportunities closing this month (synced quotes)',
    path: 'this-month',
    columns: [
      col('user_name', 'Salesperson'),
      col('region_name', 'Region'),
      col('opportunity_name', 'Opportunity', 'text', { flex: 2 }),
      col('product_name', 'Product'),
      col('quantity', 'Qty', 'int'),
      col('total_price', 'Value', 'inr'),
      col('stage_name', 'Stage'),
      col('close_date', 'Close Date', 'date'),
      col('probability', 'Prob %', 'int'),
      col('project_stage', 'Project Stage'),
      col('building_construction_stage', 'Construction Stage'),
      col('latest_action_task', 'Latest Task', 'text', { flex: 2 }),
      col('action_activity_date', 'Task Date', 'date'),
    ],
  },
  'last-month': {
    title: 'Last Month',
    subtitle: 'Closed last month — one row per opportunity + product (Qty/Value summed)',
    path: 'last-month',
    columns: [
      col('user_name', 'Salesperson'),
      col('region_name', 'Region'),
      col('opportunity_name', 'Opportunity', 'text', { flex: 2 }),
      col('product_name', 'Product'),
      col('quantity', 'Qty', 'int'),
      col('total_price', 'Value', 'inr'),
      col('stage_name', 'Stage'),
      col('close_date', 'Close Date', 'date'),
      col('remarks', 'Remarks', 'text', { flex: 2 }),
      col('probability', 'Prob %', 'int'),
      col('close_date_historical', 'Close Date (Hist.)', 'date'),
      col('snapshot_date', 'Snapshot Date', 'date'),
    ],
  },
  'six-month-plan': {
    title: 'Six Months Booking Plan',
    subtitle: 'Open pipeline closing in the next 6 months',
    path: 'six-month-plan',
    columns: [
      col('close_month', 'Close Month'),
      col('user_name', 'Salesperson'),
      col('opportunity_name', 'Opportunity', 'text', { flex: 2 }),
      col('product_name', 'Product'),
      col('quantity', 'Qty', 'int'),
      col('total_price', 'Value', 'inr'),
      col('stage_name', 'Stage'),
      col('probability', 'Prob %', 'int'),
      col('project_stage', 'Project Stage'),
      col('building_construction_stage', 'Construction Stage'),
      col('latest_action_task', 'Latest Task', 'text', { flex: 2 }),
      col('action_activity_date', 'Task Date', 'date'),
    ],
  },
}
