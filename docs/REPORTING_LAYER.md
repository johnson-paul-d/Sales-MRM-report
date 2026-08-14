# Reporting Layer — Sieger Sales Intelligence Platform

This is Step 1 of the app build: the SQL views that rebuild the datasets from the
**MRM CPS - N2** Power BI model directly on `salesforce_db_v2`. The FastAPI backend
queries these views (adding the per-user security filter); the React app renders them.

- **Definition:** [`sql/01_reporting_views.sql`](../sql/01_reporting_views.sql)
- **Apply + validate:** `python sql/apply_reporting_views.py` (idempotent, re-runnable)

## What got built

| Object | Type | Purpose |
|---|---|---|
| `sieger_fy_start_year / _fy_label / _fq / _fq_label` | functions | India financial year (Apr–Mar), e.g. `FY25-26`, `Q1..Q4` |
| `fn_subordinate_user_ids(user_id)` | function | Security: self + all descendants via `user.ManagerId` (recursive) |
| `app.region` / `app.user_region` | tables | Region lookup, maintained in the Admin panel (User→Region); the API joins it per owner. Replaces the old provisional `dim_region` view |
| `vw_opportunity` | view | Opportunity + owner name + region + account + latest task + FY helpers |
| `vw_quote` | view | Quote + owner + region + open/live/lost/accepted flags |
| `vw_quote_line_item` | view | The money grain (product, qty, total price) joined to opp/owner/region |
| `vw_leads` | view | Lead + owner name |
| `vw_visit_plan_allocation` | view | Visits + owner |
| `vw_earliest_quotes_by_month` | view | Earliest *presented* quote's line items per opportunity |
| `vw_sales_tracker` | view | Hero KPI matrix: owner × month → 7 measures |
| `vw_lead_conversion` | view | Lead totals + converted + conversion % by source/status |

**Latest Action Task:** the `latest_action_task` / `action_activity_date` columns in
`vw_opportunity` and `vw_quote_line_item` come from the **Labs Action Plans** managed package —
the latest `labsactionplans__aptask` per opportunity, joined via
`labsactionplans__actionplan."LabsActionPlans__Opportunity__c"`. Both package objects sync in the
ETL (since 2026-08-05). The standard `ActionPlan` object is empty in this org
(0 rows vs 3,450 plans / 4,003 tasks in the package).

## Measure definitions (validated against your data)

| Measure | Rule | Source |
|---|---|---|
| Opportunities Created | count of opportunities by `CreatedDate` month | `opportunity` |
| Closed Won Value | `SUM(Opportunity_Amount__c)` where `IsWon`, by `CloseDate` month | `opportunity` |
| Dropped Value | `SUM(Opportunity_Amount__c)` where `StageName='Dropped'`, by `CloseDate` | `opportunity` |
| Open Funnel | `IsClosed = false` (⚠ excludes `Hold`, which is IsClosed=true) | `opportunity` |
| Open Quotes Value | `SUM(TotalPrice)` where status ∈ In Review/Presented/Negotiation | `quote` |
| Live Quote Value | `SUM(TotalPrice)` where status ∈ Presented/Negotiation | `quote` |
| Closed Lost Value (quote) | `SUM(TotalPrice)` where status = Rejected | `quote` |
| Visits | count of VPA by `VisitDateTime__c` month | `visit_plan_allocation` |
| Conversion Ratio | `IsConverted` / total leads (currently 8.19%) | `lead` |

Reconciliation at build time: won=249, dropped=537, open=1,876, won value=₹4,302,111,845,
conversion=8.19% — all match column profiling.

## ⚠ Assumptions & open questions (updated 2026-08-05)

1. **Region — DECIDED.** ✅ App-maintained: `app.region` + `app.user_region`, edited in the
   Admin panel (User→Region). Not derived from UserRole or `account.CPS_Region__c`; it stays
   centralized — the API joins it per owner.
2. **UserRole is not synced** — and no longer needs to be: Region is app-maintained (above) and
   security uses the `user.ManagerId` hierarchy (`fn_subordinate_user_ids`). Sync it only if a
   future report needs SF role names.
3. **Quote status → open/live/lost mapping** is inferred from picklist values. Confirm business rules.
4. **Missing columns — FIXED** (2026-08-05). The ETL keeps the needed compound components via a
   per-object keep-list (`KEEP_COMPOUND_FIELDS` in `salesforce_to_postgres.py`: `account.Name`,
   `BillingCity`, `BillingState`; `lead.City`, `State`); backfill done. "Acc name" now prefers
   the real name: `COALESCE(account.Name, Site, Contact_Name__c)`.
5. **Forecast/Snapshot history — SYNCING.** ✅ The two SF Historical-Trending reports
   (North `00Ofu000006f1pVEAQ`, South `00Ofu000005vp1JEAQ`) load in the ETL →
   `forecasts_bi_mrm_cps_*`; [`sql/03_forecasts.sql`](../sql/03_forecasts.sql) builds
   `vw_forecasts` + `vw_forecast_latest` (joined by the Last Month page). History from before
   the reports' snapshot window still can't be rebuilt retroactively.

## Security model (how "one app" replaces many reports)

Views deliberately do **not** embed user security. The API resolves the logged-in user's
visible owners with `fn_subordinate_user_ids(:me)` and filters every query
`WHERE owner_id IN (...)` (CEO/full-access = skip the filter). One code path, enforced centrally.
