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
| `dim_region` | view | Provisional region lookup from `account.CPS_Region__c` |
| `vw_opportunity` | view | Opportunity + owner name + region + account + latest task + FY helpers |
| `vw_quote` | view | Quote + owner + region + open/live/lost/accepted flags |
| `vw_quote_line_item` | view | The money grain (product, qty, total price) joined to opp/owner/region |
| `vw_leads` | view | Lead + owner name |
| `vw_visit_plan_allocation` | view | Visits + owner |
| `vw_earliest_quotes_by_month` | view | Earliest *presented* quote's line items per opportunity |
| `vw_sales_tracker` | view | Hero KPI matrix: owner × month → 7 measures |
| `vw_lead_conversion` | view | Lead totals + converted + conversion % by source/status |

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

## ⚠ Assumptions & open questions (confirm these)

1. **Region is PROVISIONAL.** `user.DB_Region__c` is empty and `account.CPS_Region__c` is
   null for ~88% of opportunities. Region is likely derived from **Salesforce UserRole**.
   → Confirm the true source; it's centralized so it swaps in one place.
2. **UserRole is not synced.** Needed for the chosen role-based security *and* probably Region.
   → Add `UserRole` (+`ParentRoleId`) to the ETL. Highest-value next infra step.
3. **Quote status → open/live/lost mapping** is inferred from picklist values. Confirm business rules.
4. **Missing columns** (ETL skips compound/address fields): `account.Name`, `account.BillingCity`,
   `lead.City`. "Acc name" uses `COALESCE(account.Site, account.Contact_Name__c)` as a stopgap.
   → Enhance ETL to pull these flat.
5. **Forecast/Snapshot history** (Last Month page) can't be rebuilt retroactively — needs a
   forward-going nightly snapshot job (phase 2).

## Security model (how "one app" replaces many reports)

Views deliberately do **not** embed user security. The API resolves the logged-in user's
visible owners with `fn_subordinate_user_ids(:me)` and filters every query
`WHERE owner_id IN (...)` (CEO/full-access = skip the filter). One code path, enforced centrally.
