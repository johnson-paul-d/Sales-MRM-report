import type { ColDef } from 'ag-grid-community'
import { fmtINR, fmtInt, fmtDate } from '../components/formatters'
import { fmtMonthName } from '../components/chartLabels'
import { CHART } from '../theme'

type Kind = 'text' | 'int' | 'inr' | 'date'

// numeric fields where a grand total makes no sense
const NO_TOTAL = new Set(['probability', 'days_since_last_activity'])

export function col(field: string, headerName: string, kind: Kind = 'text', extra: Partial<ColDef> = {}): ColDef {
  const base: ColDef = { field, headerName, ...extra }
  if (kind === 'inr') {
    base.valueFormatter = (p) => fmtINR(p.value)
    base.type = 'numericColumn'
    base.filter = 'agNumberColumnFilter'
    if (!NO_TOTAL.has(field)) base.context = { ...base.context, sum: true }
  } else if (kind === 'int') {
    base.valueFormatter = (p) => fmtInt(p.value)
    base.type = 'numericColumn'
    base.filter = 'agNumberColumnFilter'
    if (!NO_TOTAL.has(field)) base.context = { ...base.context, sum: true }
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
  stageFilter?: boolean   // show a Stage multi-select that filters the page client-side
  defaultStages?: string[] // stages pre-selected in that multi-select (empty = all)
}

// Product column: shows the short Product Family, with the full product name
// (e.g. "CPS - OverGround Puz-000COG6205") revealed on hover. Row grain is
// unchanged -- still one row per product -- so quantities and values are
// unaffected; only the label is shorter.
const productCol = (headerName = 'Product') =>
  col('product_family', headerName, 'text', { tooltipField: 'product_name' })

const month = (r: Record<string, any>) => String(r.close_date ?? '').slice(0, 7)
const quoteMonth = (r: Record<string, any>) => String(r.earliest_quote_date ?? '').slice(0, 7)

export const REPORTS: Record<string, ReportConfig> = {
  'closed-won': {
    title: 'Closed Won',
    subtitle: 'Won opportunities and their quote line items',
    path: 'closed-won',
    columns: [
      // Columns, order + headers exactly as the pbix Closed Won tableEx
      col('user_name', 'User Name'),
      col('opportunity_name', 'Opp name', 'text', { flex: 2 }),
      productCol('Product name'),
      col('quantity', 'Car Spaces', 'int'),
      col('total_price', 'Amount', 'inr'),
      col('stage_name', 'StageName'),
      col('close_date', 'CloseDate', 'date'),
      col('opportunity_amount', 'Opp amount', 'inr'),
      col('currency_iso_code', 'CurrencyIsoCode'),
      col('division', 'Division__c'),
      col('billing_city', 'BillingCity'),
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
      // Columns, order + headers exactly as the pbix Closed Lost tableEx
      col('user_name', 'User Name'),
      col('opportunity_name', 'Opp name', 'text', { flex: 2 }),
      productCol(),
      col('quantity', 'Car Spaces', 'int'),
      col('total_price', 'Amount', 'inr'),
      // Quoted vs never-quoted: filterable from the column header, since
      // unquoted opportunities carry no product value.
      col('has_quote', 'Has Quote', 'text', {
        valueFormatter: (p) => (p.value ? 'Yes' : 'No'),
        width: 120,
      }),
      col('loss_reason', 'Loss Reason', 'text', { flex: 2 }),
      col('stage_name', 'StageName'),
      col('close_date', 'CloseDate', 'date'),
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
      productCol(),
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
      // Columns, order + headers exactly as the pbix Open Funnel opp-detail tableEx
      // (unrenamed pbix fields keep raw names; the page's user split lives in the charts)
      col('opportunity_name', 'Name', 'text', { flex: 2 }),
      col('opportunity_amount', 'Opportunity_Amount__c', 'inr'),
      col('close_date', 'Date', 'date'),
      col('stage_name', 'StageName'),
      col('quote_total_price', 'TotalPrice', 'inr'),
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
      // Columns, order + headers exactly as the pbix Top Enquiries tableEx
      col('user_name', 'User Name'),
      col('opportunity_name', 'Opp name', 'text', { flex: 2 }),
      col('quantity', 'Car Spaces', 'int'),
      col('quote_total_price', 'Amount', 'inr'),
      col('stage_name', 'StageName'),
      col('close_date', 'CloseDate', 'date'),
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
    stageFilter: true,
    columns: [
      // Columns, order + headers exactly as the pbix No Visits tableEx
      col('user_name', 'User Name'),
      col('account_name', 'Acc name'),
      col('opportunity_name', 'Opp name', 'text', { flex: 2 }),
      productCol(),
      col('quantity', 'Car Spaces', 'int'),
      col('total_price', 'Amount', 'inr'),
      col('stage_name', 'StageName'),
      col('latest_checkin_opp', 'Latest Checkin - Opp', 'date'),
      col('latest_checkin_acc', 'LatestCheckin - Acc', 'date'),
      col('close_date', 'CloseDate', 'date'),
      col('days_since_last_activity', 'Days Since Last Activity', 'int'),
      col('billing_city', 'BillingCity'),
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
      // Columns, order + headers exactly as the pbix New Quote Released tableEx
      col('user_name', 'User name'),
      col('opportunity_name', 'Opp name', 'text', { flex: 2 }),
      col('product_name', 'Product Name'),
      col('quantity', 'Quantity', 'int'),
      col('quote_value', 'Quote Value', 'inr'),
      col('opp_stage', 'Opp stage'),
      col('earliest_quote_date', 'Created date', 'date'),
    ],
    charts: [
      { title: 'Quote value by Salesperson', kind: 'bar', groupBy: 'user_name', value: 'quote_value', money: true, color: CHART.live, top: 10 },
      { title: 'Monthly quote value', kind: 'columns', groupBy: quoteMonth, value: 'quote_value', money: true, color: CHART.live, chronological: true, top: 12 },
    ],
  },
  'this-month': {
    title: 'This Month',
    subtitle: 'Open opportunities closing this month (synced quotes)',
    path: 'this-month',
    columns: [
      // Columns, order + headers exactly as the pbix This Month tableEx
      col('user_name', 'User Name'),
      col('opportunity_name', 'Opp name', 'text', { flex: 2 }),
      productCol(),
      col('quantity', 'Car spaces', 'int'),
      col('total_price', 'Amount', 'inr'),
      col('stage_name', 'StageName'),
      col('close_date', 'Date', 'date'),
      col('probability', 'Probability', 'int'),
      col('latest_action_task', 'Next Action', 'text', { flex: 2 }),
      col('action_activity_date', 'Due date', 'date'),
      col('project_stage', 'Project stage'),
      col('building_construction_stage', 'Building stage'),
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
      // Columns, order AND headers exactly as the pbix Last Month tableEx
      // (the selector picks the snapshot; unrenamed pbix fields keep raw names)
      col('user_name', 'User Name'),
      col('opportunity_name', 'Opp name', 'text', { flex: 2 }),
      productCol(),
      col('quantity', 'Car Spaces', 'int'),
      col('total_price', 'Amount', 'inr'),
      col('stage_name', 'StageName'),
      col('close_date', 'CloseDate', 'date'),
      col('remarks', 'Remarks', 'text', { flex: 2 }),
      col('probability', 'Probability', 'int'),
      col('close_date_historical', 'Close Date (Historical)', 'date'),
      col('snapshot_date', 'Snapshot Date', 'date'),
    ],
    charts: [
      { title: 'Value by Salesperson', kind: 'bar', groupBy: 'user_name', value: 'total_price', money: true, color: CHART.palette[1], top: 10 },
    ],
  },
  'post-order-visits': {
    title: 'Post-Order Visits',
    subtitle: 'Visits made after an order was won (managers only)',
    path: 'post-order-visits',
    columns: [
      col('user_name', 'Opp Owner'),
      col('opportunity_name', 'Opp name', 'text', { flex: 2 }),
      col('account_name', 'Acc name'),
      col('close_date', 'Order Closed', 'date'),
      col('visit_date', 'Visit Date', 'date'),
      col('days_after_close', 'Days After Close', 'int'),
      col('visited_by', 'Visited By'),
      col('purpose', 'Purpose', 'text', { flex: 2 }),
      col('visit_notes', 'Notes', 'text', { flex: 2 }),
      col('visits_for_opportunity', 'Visits (this opp)', 'int'),
      col('opportunity_amount', 'Opp amount', 'inr'),
    ],
    charts: [
      { title: 'Post-order visits by Salesperson', kind: 'bar', groupBy: 'visited_by', color: CHART.won, top: 10 },
      { title: 'Visits by Purpose', kind: 'donut', groupBy: 'purpose' },
    ],
  },
  'six-month-plan': {
    title: 'Six Months Booking Plan',
    subtitle: 'Open pipeline closing in the next 6 months',
    path: 'six-month-plan',
    // Defaults to Proposal only (Hold excluded); the Stage filter above the
    // table can bring Hold/Design/etc. back in on demand.
    stageFilter: true,
    defaultStages: ['Proposal'],
    columns: [
      // Rows then Values exactly as the pbix Six Months Booking Plan matrix
      col('close_month', 'Month', 'text', { valueFormatter: (p) => fmtMonthName(p.value, true) }),
      col('user_name', 'User Name'),
      col('opportunity_name', 'Opp name', 'text', { flex: 2 }),
      productCol(),
      col('stage_name', 'StageName'),
      col('probability', 'Probability', 'int'),
      col('latest_action_task', 'Next Action', 'text', { flex: 2 }),
      col('action_activity_date', 'Due date', 'date'),
      col('project_stage', 'Project_stage__c'),
      col('building_construction_stage', 'Building stage'),
      col('quantity', 'Car spaces', 'int'),
      col('total_price', 'Amount', 'inr'),
    ],
    charts: [
      { title: 'Booking plan by Month', kind: 'columns', groupBy: 'close_month', value: 'total_price', money: true, color: CHART.open, chronological: true },
      { title: 'Value by Salesperson', kind: 'bar', groupBy: 'user_name', value: 'total_price', money: true, color: CHART.open, top: 10 },
    ],
  },
}
