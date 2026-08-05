import type { ColDef } from 'ag-grid-community'
import { fmtINR, fmtInt, fmtDate } from '../components/formatters'
import { CHART } from '../theme'

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

export interface ChartSpec {
  title: string
  kind: 'bar' | 'columns' | 'donut' | 'funnel'
  groupBy: string | ((r: Record<string, any>) => string | number | null | undefined)
  value?: string          // numeric field to sum; omit to count rows
  money?: boolean         // format as INR
  color?: string
  top?: number
  chronological?: boolean // sort by group name ascending (time series)
}

export interface ReportConfig {
  title: string
  subtitle?: string
  path: string
  columns: ColDef[]
  charts?: ChartSpec[]
}

const month = (r: Record<string, any>) => String(r.close_date ?? '').slice(0, 7)
const presentedMonth = (r: Record<string, any>) => String(r.earliest_presented_date ?? '').slice(0, 7)

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
    charts: [
      { title: 'Won value by Salesperson', kind: 'bar', groupBy: 'user_name', value: 'total_price', money: true, color: CHART.won, top: 10 },
      { title: 'By Division', kind: 'donut', groupBy: 'division', value: 'total_price', money: true },
      { title: 'Monthly won value', kind: 'columns', groupBy: month, value: 'total_price', money: true, color: CHART.won, chronological: true, top: 12 },
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
    charts: [
      { title: 'Dropped value by Salesperson', kind: 'bar', groupBy: 'user_name', value: 'total_price', money: true, color: CHART.dropped, top: 10 },
      { title: 'By Division', kind: 'donut', groupBy: 'division', value: 'total_price', money: true },
      { title: 'Monthly dropped value', kind: 'columns', groupBy: month, value: 'total_price', money: true, color: CHART.dropped, chronological: true, top: 12 },
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
    charts: [
      { title: 'Pipeline by Stage', kind: 'funnel', groupBy: 'stage_name', value: 'quote_total_price', money: true },
      { title: 'Open value by Salesperson', kind: 'bar', groupBy: 'user_name', value: 'quote_total_price', money: true, color: CHART.open, top: 10 },
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
    charts: [
      { title: 'Top opportunities by quoted value', kind: 'bar', groupBy: 'opportunity_name', value: 'quote_total_price', money: true, color: CHART.open, top: 10 },
    ],
  },
  'no-visits': {
    title: 'No Visit Opportunities',
    subtitle: 'Open opportunities with stale or no recent activity',
    path: 'no-visits',
    columns: [
      // Same columns + order as the PBI No Visits table
      col('user_name', 'Salesperson'),
      col('account_name', 'Account'),
      col('opportunity_name', 'Opportunity', 'text', { flex: 2 }),
      col('product_name', 'Product'),
      col('quantity', 'Qty', 'int'),
      col('total_price', 'Line Total', 'inr'),
      col('stage_name', 'Stage'),
      col('latest_checkin_opp', 'Last Check-in (Opp)', 'date'),
      col('latest_checkin_acc', 'Last Check-in (Acc)', 'date'),
      col('close_date', 'Close Date', 'date'),
      col('days_since_last_activity', 'Days Idle', 'int'),
      col('billing_city', 'City'),
    ],
    charts: [
      { title: 'Stale value by Salesperson', kind: 'bar', groupBy: 'user_name', value: 'total_price', money: true, color: CHART.dropped, top: 10 },
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
    charts: [
      { title: 'Quote value by Salesperson', kind: 'bar', groupBy: 'user_name', value: 'quote_value', money: true, color: CHART.live, top: 10 },
      { title: 'Monthly quote value', kind: 'columns', groupBy: presentedMonth, value: 'quote_value', money: true, color: CHART.live, chronological: true, top: 12 },
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
    charts: [
      { title: 'This month value by Salesperson', kind: 'bar', groupBy: 'user_name', value: 'total_price', money: true, color: CHART.open, top: 10 },
      { title: 'By Stage', kind: 'donut', groupBy: 'stage_name', value: 'total_price', money: true },
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
    charts: [
      { title: 'Value by Salesperson', kind: 'bar', groupBy: 'user_name', value: 'total_price', money: true, color: CHART.palette[1], top: 10 },
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
    charts: [
      { title: 'Booking plan by Month', kind: 'columns', groupBy: 'close_month', value: 'total_price', money: true, color: CHART.open, chronological: true },
      { title: 'Value by Salesperson', kind: 'bar', groupBy: 'user_name', value: 'total_price', money: true, color: CHART.open, top: 10 },
    ],
  },
}
