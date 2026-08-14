# Power BI "MRM CPS - N2" — Exact Definitions (reverse-engineered from the .pbix)

Extracted from the DataModel via `pbixray`. This is the source of truth for
faithful replication. The whole report is a **CPS = Sieger Parking** report,
scoped to **synced quotes** and the **CPS sales team**.

## Measures (DAX → SQL, all in `vw_sales_tracker`)

| Measure | Rule |
|---|---|
| Visits | count(VPA) where `Purpose_of_Travel__c` NOT IN {HO Visit, Branch Office Visit, Review meeting, Exhibition, Travel, Work From Home, Training}, dated by `Check_In_Time__c` |
| Opportunities Created | count(opp) by `CreatedDate` |
| Open Quotes Value | SUM(QLI.TotalPrice) where Quote.Status ∉ {Rejected,Accepted}, `Sync_Quote__c`=TRUE, Div=Sieger Parking, Stage ∉ {Closed Lost,Won,Dropped}; by `Quote.Created_Date__c` |
| Live Quote Value | SUM(EarliestQuotesByMonth.QuoteValue) for opps with a live synced quote; by earliest date |
| Closed Won Value | SUM(Opp.Opportunity_Amount__c) where Stage=Closed Won, Div=Sieger Parking, has ACCEPTED synced quote; by CloseDate |
| Closed Lost Value | SUM(Opp.Opportunity_Amount__c) where Stage=Closed Lost, has synced quote; by CloseDate |
| Dropped Value | SUM(Opp.Opportunity_Amount__c) where Stage=Dropped, has synced quote; by CloseDate |
| Conversion Ratio | count(Lead Status='Qualified') / count(Lead) |

Validated totals: Visits 18,271 · Closed Won ₹168.07 Cr · Closed Lost ₹402.46 Cr · Dropped ₹278.95 Cr · Open Quotes ₹857.85 Cr · Live Quotes ₹1,259.82 Cr · Conversion 8.19%.

## EarliestQuotesByMonth (`vw_earliest_quotes_by_month`) — one row / Sieger-Parking opp
- `earliest_presented_date` = MIN(Quote.Created_Date__c) — the "newly created quote" date the tracker drills on
- value / owner / product / qty = the opp's earliest quote by `Presented_Date__c` (TOPN 1 ASC)

## Region (hardcoded SWITCH on User name → now app-maintained)
- **EAST:** Amitava Sarkar
- **WEST:** Amit, Chitre Nachiket, Harshit Verma, Nitin Panchal, Uday Singh, Kiran (+ Vaishnav)
- **SOUTH:** Bharathi Kanna, Prakash G, Subash, Suresh J, Veeraragavan

## Per-page visual filters (all also scoped to CPS team + Region≠null)

| Page | Filters |
|---|---|
| Sales Tracker | Quote.Status ∉ {null,Accepted,Rejected}; FY ∈ {2025-26,2026-27}; drill User→FY→Year→Month |
| This Month | Sync=true, Status ∉ {Rejected,Accepted}, Stage=open, Date ≤ today |
| Last Month | Sync=true, Status ∉ {Rejected}, Div=Sieger Parking, close date last month |
| Closed Won | Sync=true, Div=Sieger Parking, Quote=Accepted, Stage=Closed Won, CloseDate ≥ ? |
| Closed Lost | Sync=true, Div=Sieger Parking, Stage=Closed Lost |
| Open Funnel | Sync=true, Div=Sieger Parking, open stages; + Target vs actual (Closed Won) |
| Six-Month Plan | Sync=true, Status ∉ {Rejected,Accepted}, Div=Sieger Parking, open, Date Between (6 mo) |
| No Visits | Sync=true, open (excl Hold), DaysSinceLastActivity > 30, quote value > ₹1 Cr |
| Top Enquiries | Div=Sieger Parking, open, quote value > ₹5 Cr |
| Leads | Lead.User ∈ team, Region≠null, CreatedDate ≥ ? |
| New Opportunity (Last Month) | Opp.CreatedDate Between last-month (bar chart by user) |
| New Quote Released | EarliestQuotesByMonth by EarliestPresentedDate Between |

## Status: implemented vs remaining
- ✅ Sales Tracker measures, EarliestQuotesByMonth, Conversion, Region mapping
- ✅ Detail endpoints (Closed Won/Lost, Dropped, Open Funnel, No Visits, Top Enquiries) apply the Sieger-Parking + Sync + stage/value filters
- ✅ Sales Tracker frontend: month drill-down (User → FY → Month tree), KPI cards, Closed Won / New Opportunities bar charts, Earliest Quotes tab
- ✅ All pages built: This Month, Last Month, Six-Month Booking Plan, New Opportunity, New Quote Released, Leads + Executive Overview (routes in `frontend/src/App.tsx` ↔ endpoints in `backend/app/routers/reports.py`)
- ✅ Forecast snapshots: the two SF Historical-Trending reports sync in the ETL; `sql/03_forecasts.sql` builds `vw_forecasts` / `vw_forecast_latest`, joined by Last Month for Close Date (Historical) + Snapshot Date
- ✅ Every page's detail table matches its pbix visual exactly — fields, order AND display names (extracted from the pbix `Report/Layout`; unrenamed pbix fields keep raw names like `StageName`)
- ✅ Open Funnel: all four pbix visuals — Target vs Achieved table (Owner / Target Million / Amount, fed by `app.sales_target` since the pbix's own `Target` table is orphaned/empty in the model), User × FY-Quarter matrix, opp detail table, User × quote-created-month matrix
- ✅ Sales Tracker: new-opportunities detail pivot added beside the bar chart (pbix parity)
- ⏳ Deployment ("online") — in progress: Render Docker backend (`backend/Dockerfile`) + Tailscale to local Postgres

Not replicated (deliberately): the pbix's unnamed scratch pages "Page 1" (User phone list)
and "Page 2" (Account/Contact billing pivot); the Six-Month page's second matrix (same
data as the first, reordered — covered by column sorting in the app).
