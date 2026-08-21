"""Report endpoints -- one per Power BI page. All are visibility-scoped.

Region is joined from app.user_region (alias `ur`/`r`). The build_filters helper
injects owner-visibility + region/division/date/FY/month slicers.

Product-grain tables are aggregated to ONE ROW PER OPPORTUNITY + PRODUCT with
SUM(Qty)/SUM(TotalPrice) -- matching Power BI's Sum(...) tables and collapsing
duplicate quote line items.
"""
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db, rows_as_dicts
from ..reporting import common_filters, build_filters, CommonFilters
from ..security import get_visibility, require_manager, Visibility

router = APIRouter(prefix="/api/reports", tags=["reports"])

# region enrichment used by every owner-keyed query (main view must be aliased `v`)
REGION_JOIN = """
LEFT JOIN app.user_region ur ON ur.salesforce_user_id = v.owner_id
LEFT JOIN app.region r        ON r.id = ur.region_id
"""

# Per-opportunity quote value. Counts ONLY live quotes -- synced, and neither
# Rejected nor Accepted -- the same rule vw_sales_tracker.open_quotes_value uses,
# so the pages agree. Summing every line item instead (the old behaviour) added
# rejected quotes and every superseded revision: 38 of 87 Top Enquiries rows were
# overstated, several showing crores of "value" with nothing live behind them.
LIVE_QUOTE_VALUE = """
LEFT JOIN (
    SELECT opportunity_id,
           SUM(total_price) AS total_price,
           SUM(quantity)    AS quantity
    FROM vw_quote_line_item
    WHERE sync_quote IS TRUE
      AND UPPER(quote_status) NOT IN ('REJECTED', 'ACCEPTED')
    GROUP BY opportunity_id
) ql ON ql.opportunity_id = v.opportunity_id
"""


def _and(where: str, extra: str) -> str:
    """Append a static predicate to a WHERE produced by build_filters."""
    return f"{where} AND {extra}" if where else f"WHERE {extra}"


def _product_table(where: str, predicate: str, max_cols: list[str],
                   order: str = "MAX(v.close_date) DESC NULLS LAST, MAX(v.user_name)",
                   having: str = "") -> str:
    """Aggregated product table: one row per opportunity + product, Qty/Value summed."""
    extra = ",\n               ".join(max_cols)
    having_sql = f"HAVING {having}" if having else ""
    return f"""
        SELECT v.owner_id, MAX(v.user_name) AS user_name, ur.region_id, MAX(r.name) AS region_name,
               v.opportunity_name, v.product_name,
               MAX(v.product_family) AS product_family,
               SUM(v.quantity) AS quantity, SUM(v.total_price) AS total_price,
               {extra}
        FROM vw_quote_line_item v
        {REGION_JOIN}
        {_and(where, predicate)}
        GROUP BY v.owner_id, ur.region_id, v.opportunity_id, v.opportunity_name, v.product_name
        {having_sql}
        ORDER BY {order}
    """


# ---------------------------------------------------------------------------
# SALES TRACKER  (hero KPI matrix: owner x month; division summed away / filtered)
# ---------------------------------------------------------------------------
@router.get("/sales-tracker")
def sales_tracker(vis: Visibility = Depends(get_visibility),
                  f: CommonFilters = Depends(common_filters),
                  db: Session = Depends(get_db)):
    where, params = build_filters(vis, f, owner_col="v.owner_id",
                                  fy_col="v.fy_label", year_month_col="v.year_month",
                                  division_col="v.division")
    sql = f"""
        SELECT v.owner_id, MAX(v.user_name) AS user_name, ur.region_id, MAX(r.name) AS region_name,
               v.year_month, MAX(v.month_start) AS month_start,
               MAX(v.fy_label) AS fy_label, MAX(v.fq_label) AS fq_label,
               SUM(v.visits) AS visits, SUM(v.opportunities_created) AS opportunities_created,
               SUM(v.quotes_created) AS quotes_created,
               SUM(v.open_quotes_value) AS open_quotes_value, SUM(v.new_quotes_value) AS new_quotes_value,
               SUM(v.closed_won_value) AS closed_won_value, SUM(v.closed_lost_value) AS closed_lost_value,
               SUM(v.dropped_value) AS dropped_value
        FROM vw_sales_tracker v
        {REGION_JOIN}
        {where}
        GROUP BY v.owner_id, ur.region_id, v.year_month
        ORDER BY MAX(v.user_name), MAX(v.month_start)
    """
    return {"rows": rows_as_dicts(db, sql, params)}


# ---------------------------------------------------------------------------
# CLOSED WON  (product grain, aggregated)
# ---------------------------------------------------------------------------
@router.get("/closed-won")
def closed_won(vis: Visibility = Depends(get_visibility),
               f: CommonFilters = Depends(common_filters),
               db: Session = Depends(get_db)):
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                  date_col="v.close_date", fy_col="v.close_fy_label", month_col="v.close_date")
    sql = _product_table(where,
        "v.stage_name = 'Closed Won' AND v.sync_quote IS TRUE AND UPPER(v.quote_status) = 'ACCEPTED'",
        ["MAX(v.account_name) AS account_name", "MAX(v.stage_name) AS stage_name",
         "MAX(v.close_date) AS close_date", "MAX(v.opportunity_amount) AS opportunity_amount",
         "MAX(v.division) AS division", "MAX(v.remarks) AS remarks",
         # PBI Closed Won table also shows CurrencyIsoCode + BillingCity
         "MAX(v.currency_iso_code) AS currency_iso_code", "MAX(v.billing_city) AS billing_city"])
    return {"rows": rows_as_dicts(db, sql, params)}


# ---------------------------------------------------------------------------
# CLOSED LOST  (product grain, aggregated)
# ---------------------------------------------------------------------------
@router.get("/closed-lost")
def closed_lost(vis: Visibility = Depends(get_visibility),
                f: CommonFilters = Depends(common_filters),
                db: Session = Depends(get_db)):
    """Every Closed Lost opportunity, quoted or not.

    Opportunities with a synced quote keep the product+value detail from the
    quote line items. Those without a quote were previously absent altogether
    (389 opportunities, ~292 Cr); they now appear with their Opportunity Line
    Item products where they exist, or as a single name-only row where they do
    not -- always with the loss reason. `has_quote` drives the page filter.
    """
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                  date_col="v.close_date", fy_col="v.close_fy_label", month_col="v.close_date")
    quoted = _product_table(where,
        "v.stage_name = 'Closed Lost' AND v.sync_quote IS TRUE",
        ["MAX(v.account_name) AS account_name", "MAX(v.stage_name) AS stage_name",
         "MAX(v.close_date) AS close_date", "MAX(v.division) AS division", "MAX(v.remarks) AS remarks",
         "MAX(v.loss_reason) AS loss_reason", "TRUE AS has_quote"])

    # Same filters, re-bound against vw_opportunity for the unquoted side.
    where2, params2 = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                    date_col="v.close_date", fy_col="v.close_fy_label",
                                    month_col="v.close_date")
    unquoted = f"""
        SELECT v.owner_id, v.user_name, ur.region_id, r.name AS region_name,
               v.opportunity_name,
               oli.product_name, oli.product_family,
               -- Deliberately no quantity/value on the unquoted side: these
               -- opportunities were never quoted, so their Opportunity Line Item
               -- prices are not comparable to quoted value and would inflate the
               -- page's Amount total (~+557 Cr) against a figure that has always
               -- meant quoted value.
               NULL::numeric AS quantity, NULL::numeric AS total_price,
               v.account_name, v.stage_name, v.close_date, v.division, v.remarks,
               v.loss_reason, FALSE AS has_quote
        FROM vw_opportunity v
        {REGION_JOIN}
        LEFT JOIN LATERAL (
            -- OpportunityLineItem carries no product name of its own, so both
            -- the name and the family come from the linked Product2.
            SELECT p2."Name" AS product_name,
                   COALESCE(NULLIF(TRIM(p2."Family"), ''), 'Unclassified') AS product_family,
                   l."Quantity" AS quantity, l."TotalPrice" AS total_price
            FROM opportunitylineitem l
            LEFT JOIN product2 p2 ON p2."Id" = l."Product2Id"
            WHERE l."OpportunityId" = v.opportunity_id AND l."IsDeleted" IS NOT TRUE
        ) oli ON TRUE
        {_and(where2, "v.stage_name = 'Closed Lost' AND v.has_synced_quote IS NOT TRUE")}
    """
    sql = f"SELECT * FROM ({quoted}) q UNION ALL SELECT * FROM ({unquoted}) n" \
          " ORDER BY close_date DESC NULLS LAST, opportunity_name"
    return {"rows": rows_as_dicts(db, sql, {**params, **params2})}


# ---------------------------------------------------------------------------
# DROPPED  (product grain, aggregated)
# ---------------------------------------------------------------------------
@router.get("/dropped")
def dropped(vis: Visibility = Depends(get_visibility),
            f: CommonFilters = Depends(common_filters),
            db: Session = Depends(get_db)):
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                  date_col="v.close_date", fy_col="v.close_fy_label", month_col="v.close_date")
    sql = _product_table(where,
        "v.is_dropped IS TRUE AND v.sync_quote IS TRUE",
        ["MAX(v.account_name) AS account_name", "MAX(v.stage_name) AS stage_name",
         "MAX(v.close_date) AS close_date", "MAX(v.opportunity_amount) AS opportunity_amount",
         "MAX(v.division) AS division", "MAX(v.remarks) AS remarks"])
    return {"rows": rows_as_dicts(db, sql, params)}


# ---------------------------------------------------------------------------
# OPEN FUNNEL  (opportunity grain, with summed quote line totals)
# ---------------------------------------------------------------------------
@router.get("/open-funnel")
def open_funnel(vis: Visibility = Depends(get_visibility),
                f: CommonFilters = Depends(common_filters),
                db: Session = Depends(get_db)):
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                  date_col="v.close_date", fy_col="v.close_fy_label", month_col="v.close_date")
    sql = f"""
        SELECT v.owner_id, v.user_name, ur.region_id, r.name AS region_name,
               v.opportunity_name, v.stage_name, v.close_date,
               v.opportunity_amount, v.division,
               COALESCE(ql.total_price, 0) AS quote_total_price,
               COALESCE(ql.quantity, 0)    AS quantity
        FROM vw_opportunity v
        {REGION_JOIN}
        {LIVE_QUOTE_VALUE}
        {_and(where, "v.is_open IS TRUE AND v.has_synced_quote IS TRUE")}
        ORDER BY v.opportunity_amount DESC NULLS LAST
    """
    rows = rows_as_dicts(db, sql, params)

    # PBI Open Funnel target tableEx (Owner / Target Million / Amount). The pbix's
    # `Target` table no longer exists in the model, so targets come from
    # app.sales_target (admin-maintained). Only periods covering today count.
    tgt_params: dict = {}
    tgt_vis = ""
    if not vis.can_view_all:
        tgt_vis = ("AND (t.salesforce_user_id = ANY(:_tgt_owners) "
                   "OR t.salesforce_user_id IS NULL)")
        tgt_params["_tgt_owners"] = vis.owner_ids or []
    # Target vs Achieved. "Achieved" is Closed Won value inside the target's own
    # period and scope (owner target -> that owner; region target -> that region;
    # neither -> everyone). It deliberately ignores the page's close-date slicers,
    # because a target is bound to its own period, not to whatever the user is
    # currently filtering the funnel by.
    targets = rows_as_dicts(db, f"""
        WITH t AS (
            SELECT t.salesforce_user_id, t.region_id,
                   MIN(t.period_start) AS period_start,
                   MIN(t.period_type)  AS period_type,
                   SUM(t.target_amount) AS target_amount
            FROM app.sales_target t
            WHERE CURRENT_DATE >= t.period_start
              AND CURRENT_DATE < t.period_start + CASE t.period_type
                    WHEN 'MONTH'   THEN interval '1 month'
                    WHEN 'QUARTER' THEN interval '3 months'
                    ELSE                interval '1 year' END
              {tgt_vis}
            GROUP BY t.salesforce_user_id, t.region_id
        )
        SELECT t.salesforce_user_id, t.region_id,
               COALESCE(u."Name", rg.name, 'All') AS owner,
               t.target_amount,
               COALESCE(w.achieved_amount, 0) AS achieved_amount
        FROM t
        LEFT JOIN "user" u      ON u."Id" = t.salesforce_user_id
        LEFT JOIN app.region rg ON rg.id = t.region_id
        LEFT JOIN LATERAL (
            SELECT SUM(COALESCE(o."Opportunity_Amount__c", 0)) AS achieved_amount
            FROM opportunity o
            LEFT JOIN app.user_region our ON our.salesforce_user_id = o."OwnerId"
            WHERE o."IsDeleted" IS NOT TRUE
              AND UPPER(o."StageName") = 'CLOSED WON'
              AND o."CloseDate" >= t.period_start
              AND o."CloseDate" <  t.period_start + CASE t.period_type
                    WHEN 'MONTH'   THEN interval '1 month'
                    WHEN 'QUARTER' THEN interval '3 months'
                    ELSE                interval '1 year' END
              AND (t.salesforce_user_id IS NULL OR o."OwnerId" = t.salesforce_user_id)
              AND (t.region_id IS NULL OR our.region_id = t.region_id)
        ) w ON TRUE
        ORDER BY 3
    """, tgt_params)

    # PBI Open Funnel matrix: owner x quote-created month -> Sum(TotalPrice)
    # (quote grain; same open + synced scope, ignoring the close-date slicers).
    qm_where, qm_params = build_filters(vis, f, owner_col="v.owner_id",
                                        division_col="v.division")
    by_quote_month = rows_as_dicts(db, f"""
        SELECT v.user_name, to_char(v.quote_created_date, 'YYYY-MM') AS year_month,
               SUM(v.total_price) AS total_price
        FROM vw_quote_line_item v
        {REGION_JOIN}
        {_and(qm_where, "v.is_open IS TRUE AND v.sync_quote IS TRUE "
                        "AND v.quote_created_date IS NOT NULL")}
        GROUP BY v.user_name, 2
        ORDER BY v.user_name, 2
    """, qm_params)

    return {"rows": rows, "targets": targets, "by_quote_month": by_quote_month}


# ---------------------------------------------------------------------------
# NO VISITS  (open opps with stale / no activity, aggregated)
# ---------------------------------------------------------------------------
@router.get("/no-visits")
def no_visits(vis: Visibility = Depends(get_visibility),
              f: CommonFilters = Depends(common_filters),
              min_days: int = Query(30, description="Minimum days since last activity"),
              db: Session = Depends(get_db)):
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                  date_col="v.close_date", fy_col="v.close_fy_label", month_col="v.close_date")
    params["_min_days"] = min_days
    # PBI No Visits filters: synced, stage not closed (Hold INCLUDED), strict
    # DaysSinceLastActivity > 30, and Sum(TotalPrice) per row > 1 Cr.
    predicate = ("v.sync_quote IS TRUE "
                 "AND v.stage_name NOT IN ('Closed Lost', 'Closed Won', 'Dropped') "
                 "AND v.days_since_last_activity > :_min_days")
    sql = _product_table(where, predicate,
        ["MAX(v.account_name) AS account_name", "MAX(v.billing_city) AS billing_city",
         "MAX(v.stage_name) AS stage_name",
         "MAX(v.latest_checkin_opp) AS latest_checkin_opp", "MAX(v.latest_checkin_acc) AS latest_checkin_acc",
         "MAX(v.close_date) AS close_date", "MAX(v.days_since_last_activity) AS days_since_last_activity"],
        order="MAX(v.days_since_last_activity) DESC NULLS FIRST, MAX(v.user_name)",
        having="SUM(v.total_price) > 10000000")
    return {"rows": rows_as_dicts(db, sql, params)}


# ---------------------------------------------------------------------------
# TOP ENQUIRIES  (opportunity grain, by value)
# ---------------------------------------------------------------------------
@router.get("/top-enquiries")
def top_enquiries(vis: Visibility = Depends(get_visibility),
                  f: CommonFilters = Depends(common_filters),
                  limit: int = Query(10, ge=1, le=1000),
                  db: Session = Depends(get_db)):
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                  date_col="v.close_date", fy_col="v.close_fy_label", month_col="v.close_date")
    params["_limit"] = limit
    sql = f"""
        SELECT v.owner_id, v.user_name, ur.region_id, r.name AS region_name,
               v.opportunity_name, v.stage_name, v.close_date, v.remarks, v.division,
               COALESCE(ql.total_price, 0) AS quote_total_price,
               COALESCE(ql.quantity, 0)    AS quantity
        FROM vw_opportunity v
        {REGION_JOIN}
        {LIVE_QUOTE_VALUE}
        {_and(where, "v.is_open IS TRUE AND COALESCE(ql.total_price, 0) > 0")}
        ORDER BY quote_total_price DESC NULLS LAST
        LIMIT :_limit
    """
    return {"rows": rows_as_dicts(db, sql, params)}


# ---------------------------------------------------------------------------
# NEW QUOTE RELEASED  (earliest presented quote per opportunity)
# ---------------------------------------------------------------------------
@router.get("/new-quotes")
def new_quotes(vis: Visibility = Depends(get_visibility),
               f: CommonFilters = Depends(common_filters),
               db: Session = Depends(get_db)):
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                  date_col="v.earliest_quote_date", fy_col="v.fy_label",
                                  month_col="v.earliest_quote_date")
    sql = f"""
        SELECT v.owner_id, v.user_name, ur.region_id, r.name AS region_name,
               v.opportunity_name, v.product_name, v.quantity, v.quote_value,
               v.opp_stage, v.earliest_quote_date
        FROM vw_earliest_quotes_by_month v
        {REGION_JOIN}
        {where}
        ORDER BY v.earliest_quote_date DESC NULLS LAST, v.user_name
    """
    return {"rows": rows_as_dicts(db, sql, params)}


# ---------------------------------------------------------------------------
# THIS MONTH  (open opps closing this month; synced open quotes, aggregated)
# ---------------------------------------------------------------------------
@router.get("/this-month")
def this_month(vis: Visibility = Depends(get_visibility),
               f: CommonFilters = Depends(common_filters),
               db: Session = Depends(get_db)):
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                  month_col="v.close_date")
    date_pred = ("" if f.month else
                 " AND v.close_date >= date_trunc('month', CURRENT_DATE)"
                 " AND v.close_date < date_trunc('month', CURRENT_DATE) + interval '1 month'")
    pred = ("v.sync_quote IS TRUE AND UPPER(v.quote_status) NOT IN ('REJECTED','ACCEPTED') "
            "AND v.is_open IS TRUE" + date_pred)
    sql = _product_table(where, pred,
        ["MAX(v.stage_name) AS stage_name", "MAX(v.close_date) AS close_date",
         "MAX(v.probability) AS probability", "MAX(v.project_stage) AS project_stage",
         "MAX(v.building_construction_stage) AS building_construction_stage",
         "MAX(v.latest_action_task) AS latest_action_task", "MAX(v.action_activity_date) AS action_activity_date"],
        order="MAX(v.close_date), MAX(v.user_name)")
    return {"rows": rows_as_dicts(db, sql, params)}


# ---------------------------------------------------------------------------
# LAST MONTH  (closed last month; synced, not rejected, aggregated) -- matches PBI
# ---------------------------------------------------------------------------
@router.get("/last-month")
def last_month(vis: Visibility = Depends(get_visibility),
               f: CommonFilters = Depends(common_filters),
               snapshot: date | None = Query(None, description="Forecast snapshot date (default: latest)"),
               db: Session = Depends(get_db)):
    """PBI Last Month page: quote line items joined to the two Salesforce
    Historical-Trending reports (vw_forecasts) AT ONE SNAPSHOT DATE, windowed
    by the forecast's Close Date (Historical). The pbix pinned one snapshot
    (2026-03-06) and a hand-picked window; here the snapshot is selectable and
    the window = the selected snapshot's calendar month (FilterBar month
    overrides it)."""
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division")

    snapshots = [r["snapshot_date"] for r in rows_as_dicts(db, """
        SELECT DISTINCT snapshot_date FROM vw_forecasts
        WHERE snapshot_date IS NOT NULL ORDER BY snapshot_date DESC
    """, {})]
    snap = snapshot if snapshot in snapshots else (snapshots[0] if snapshots else None)
    if snap is None:
        return {"rows": [], "snapshots": [], "snapshot_date": None}
    params["_snap"] = snap

    if f.month:
        hist_window = "to_char(fc.close_date_historical, 'YYYY-MM') = :_month"
        params["_month"] = f.month
    else:
        hist_window = ("fc.close_date_historical >= date_trunc('month', CAST(:_snap AS date)) "
                       "AND fc.close_date_historical < date_trunc('month', CAST(:_snap AS date)) + interval '1 month'")

    # Same filters as the Power BI page (synced, not rejected, PBI bad-opp
    # exclusions). Region is a slicer, not a gate (user decision 2026-08-21).
    pred = ("v.sync_quote IS TRUE AND UPPER(v.quote_status) <> 'REJECTED' "
            "AND v.opportunity_name NOT IN "
            "('AIRFORCE ADMINSTRATIVE COLLEGE-','HTC GLOBAL @ GUINDY','LIFESTYLE BUILDING') "
            "AND " + hist_window)
    sql = f"""
        SELECT v.owner_id, MAX(v.user_name) AS user_name, ur.region_id, MAX(r.name) AS region_name,
               v.opportunity_name, v.product_name,
               MAX(v.product_family) AS product_family,
               SUM(v.quantity) AS quantity, SUM(v.total_price) AS total_price,
               MAX(v.stage_name) AS stage_name, MAX(v.close_date) AS close_date,
               MAX(v.remarks) AS remarks, MAX(v.probability) AS probability,
               MAX(fc.close_date_historical) AS close_date_historical,
               MAX(fc.snapshot_date) AS snapshot_date
        FROM vw_quote_line_item v
        {REGION_JOIN}
        JOIN vw_forecasts fc ON fc.opportunity_name = v.opportunity_name
                            AND fc.snapshot_date = :_snap
        {_and(where, pred)}
        GROUP BY v.owner_id, ur.region_id, v.opportunity_id, v.opportunity_name, v.product_name
        ORDER BY MAX(v.close_date) DESC, MAX(v.user_name)
    """
    return {"rows": rows_as_dicts(db, sql, params),
            "snapshots": snapshots, "snapshot_date": snap}


# ---------------------------------------------------------------------------
# SIX MONTHS BOOKING PLAN  (open pipeline, next 6 months, aggregated)
# ---------------------------------------------------------------------------
@router.get("/six-month-plan")
def six_month_plan(vis: Visibility = Depends(get_visibility),
                   f: CommonFilters = Depends(common_filters),
                   db: Session = Depends(get_db)):
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                  month_col="v.close_date")
    # PBI window: NEXT month through +6 months (current month excluded);
    # stage filter keeps Hold (only the three closed stages are excluded).
    date_pred = ("" if f.month else
                 " AND v.close_date >= date_trunc('month', CURRENT_DATE) + interval '1 month'"
                 " AND v.close_date < date_trunc('month', CURRENT_DATE) + interval '7 months'")
    pred = ("v.sync_quote IS TRUE AND UPPER(v.quote_status) NOT IN ('REJECTED','ACCEPTED') "
            "AND v.stage_name NOT IN ('Closed Lost', 'Closed Won', 'Dropped')" + date_pred)
    sql = _product_table(where, pred,
        ["to_char(MAX(v.close_date), 'YYYY-MM') AS close_month", "MAX(v.close_date) AS close_date",
         "MAX(v.stage_name) AS stage_name", "MAX(v.probability) AS probability",
         "MAX(v.project_stage) AS project_stage",
         "MAX(v.building_construction_stage) AS building_construction_stage",
         "MAX(v.latest_action_task) AS latest_action_task", "MAX(v.action_activity_date) AS action_activity_date"],
        order="MAX(v.close_date), MAX(v.user_name)")
    return {"rows": rows_as_dicts(db, sql, params)}


# ---------------------------------------------------------------------------
# ATTENDANCE  (per user per day: in/out, hours, visits, status)
# ---------------------------------------------------------------------------
@router.get("/attendance")
def attendance(vis: Visibility = Depends(get_visibility),
               f: CommonFilters = Depends(common_filters),
               month: str | None = Query(None, description="YYYY-MM (default: current month)"),
               include_empty: bool = Query(False, description="include days with no activity at all"),
               db: Session = Depends(get_db)):
    """Daily attendance per user, replicating the Power BI ActivitySummary table.

    Always windowed to one month -- the underlying view spans every user x every
    day since Oct 2024, so an unbounded query would return ~80k rows.
    Visibility-scoped like every other report: a salesperson sees their own days,
    a manager sees their team, can_view_all sees everyone.
    """
    where, params = build_filters(vis, f, owner_col="v.owner_id")
    params["_month"] = month or f.month  # FilterBar month wins if the caller sent one
    month_pred = ("to_char(v.activity_date, 'YYYY-MM') = :_month" if params["_month"]
                  else "date_trunc('month', v.activity_date) = date_trunc('month', CURRENT_DATE)")
    if not params["_month"]:
        params.pop("_month")
    if not include_empty:
        month_pred += " AND v.has_any_activity IS TRUE"

    sql = f"""
        SELECT v.owner_id, v.user_name, v.activity_date,
               v.in_time, v.out_time, v.first_checkin, v.last_checkout,
               v.km_travelled, v.travel_hours, v.working_shift, v.shift_hours,
               v.working_hours, v.total_working_hours, v.total_working_hours_dec,
               v.meeting_time, v.work_from_home, v.ho_or_bo,
               v.number_visits, v.checkout_missed, v.remarks, v.unique_customers,
               v.activity_status, v.has_any_activity,
               ur.region_id, r.name AS region_name
        FROM vw_attendance v
        LEFT JOIN app.user_region ur ON ur.salesforce_user_id = v.owner_id
        LEFT JOIN app.region r        ON r.id = ur.region_id
        {_and(where, month_pred)}
        ORDER BY v.activity_date DESC, v.user_name
    """
    rows = rows_as_dicts(db, sql, params)

    # Per-person totals for the summary strip above the table.
    summary: dict = {}
    for r in rows:
        s = summary.setdefault(r["user_name"], {
            "user_name": r["user_name"], "region_name": r["region_name"],
            "present": 0, "hd": 0, "leave": 0, "mismatch": 0,
            "visits": 0, "km": 0.0, "hours": 0.0, "checkout_missed": 0,
        })
        st = (r["activity_status"] or "").lower()
        if st in ("present", "hd", "leave", "mismatch"):
            s[st] += 1
        s["visits"] += r["number_visits"] or 0
        s["checkout_missed"] += r["checkout_missed"] or 0
        s["km"] += float(r["km_travelled"] or 0)
        s["hours"] += float(r["total_working_hours_dec"] or 0)
    for s in summary.values():
        s["km"] = round(s["km"], 1)
        s["hours"] = round(s["hours"], 1)

    return {"rows": rows, "summary": sorted(summary.values(), key=lambda x: x["user_name"])}


# ---------------------------------------------------------------------------
# POST-ORDER VISITS  (visits made AFTER an order was won) -- managers only
# ---------------------------------------------------------------------------
@router.get("/post-order-visits")
def post_order_visits(vis: Visibility = Depends(require_manager),
                      f: CommonFilters = Depends(common_filters),
                      db: Session = Depends(get_db)):
    """Visit Plan Allocations linked to a Closed Won opportunity, where the
    visit happened after the close date -- i.e. servicing after the order.

    Scoped to the opportunity owner (so a manager sees their own team's won
    business) and gated to managers by require_manager.
    """
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                  date_col="v.close_date", fy_col="v.close_fy_label",
                                  month_col="v.close_date")
    sql = f"""
        SELECT v.owner_id, v.user_name, ur.region_id, r.name AS region_name,
               v.opportunity_name, v.account_name, v.close_date,
               v.opportunity_amount, v.division,
               vp.visit_date, vp.days_after_close, vp.visited_by,
               vp.purpose, vp.visit_notes, vp.visit_status,
               COUNT(*) OVER (PARTITION BY v.opportunity_id) AS visits_for_opportunity
        FROM vw_opportunity v
        {REGION_JOIN}
        JOIN LATERAL (
            SELECT vpa."CheckInDate__c"                        AS visit_date,
                   (vpa."CheckInDate__c" - v.close_date)       AS days_after_close,
                   vu."Name"                                   AS visited_by,
                   vpa."Purpose_of_Travel__c"                  AS purpose,
                   NULLIF(TRIM(COALESCE(vpa."Notes__c", vpa."Description__c", '')), '') AS visit_notes,
                   vpa."Status__c"                             AS visit_status
            FROM visit_plan_allocation vpa
            LEFT JOIN "user" vu ON vu."Id" = vpa."OwnerId"
            WHERE vpa."Opportunity__c" = v.opportunity_id
              AND vpa."IsDeleted" IS NOT TRUE
              AND vpa."CheckInDate__c" IS NOT NULL
              AND vpa."CheckInDate__c" > v.close_date
        ) vp ON TRUE
        {_and(where, "v.is_won IS TRUE")}
        ORDER BY vp.visit_date DESC, v.opportunity_name
    """
    return {"rows": rows_as_dicts(db, sql, params)}


# ---------------------------------------------------------------------------
# NEW OPPORTUNITY - LAST MONTH  (opps created last month: bar chart + detail)
# ---------------------------------------------------------------------------
@router.get("/new-opportunity")
def new_opportunity(vis: Visibility = Depends(get_visibility),
                    f: CommonFilters = Depends(common_filters),
                    db: Session = Depends(get_db)):
    from collections import Counter
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                  month_col="v.created_date_only")
    date_pred = ("" if f.month else
                 " AND v.created_date_only >= date_trunc('month', CURRENT_DATE) - interval '1 month'"
                 " AND v.created_date_only < date_trunc('month', CURRENT_DATE)")
    # Region is a slicer, not a gate (user decision 2026-08-21); TRUE keeps the
    # predicate non-empty when the month filter suppresses date_pred.
    pred = "TRUE" + date_pred
    sql = f"""
        SELECT v.owner_id, v.user_name, ur.region_id, r.name AS region_name,
               v.opportunity_name, v.stage_name, v.created_date_only, v.division,
               v.latest_action_task, v.action_activity_date, v.project_stage,
               v.building_construction_stage,
               COALESCE(ql.total_price, 0) AS quote_total_price,
               COALESCE(ql.quantity, 0)    AS quantity
        FROM vw_opportunity v
        {REGION_JOIN}
        LEFT JOIN (
            SELECT opportunity_id, SUM(total_price) AS total_price, SUM(quantity) AS quantity
            FROM vw_quote_line_item GROUP BY opportunity_id
        ) ql ON ql.opportunity_id = v.opportunity_id
        {_and(where, pred)}
        ORDER BY v.user_name, v.opportunity_name
    """
    rows = rows_as_dicts(db, sql, params)
    counts = Counter(r["user_name"] for r in rows)
    # PBI bar chart tooltip: Min(Opportunity.building_construction_stage__c) per user
    min_stage: dict[str, str] = {}
    for r in rows:
        stage = r.get("building_construction_stage")
        if stage and (r["user_name"] not in min_stage or stage < min_stage[r["user_name"]]):
            min_stage[r["user_name"]] = stage
    by_user = [{"user_name": k, "count": v, "min_construction_stage": min_stage.get(k)}
               for k, v in sorted(counts.items(), key=lambda x: -x[1])]
    return {"rows": rows, "by_user": by_user}


# ---------------------------------------------------------------------------
# LEADS  (overall conversion + by-source + by-status + by-user)
# ---------------------------------------------------------------------------
# PBI Leads page template: the donut + salesperson pivot are filtered to the CPS
# team (app convention: region assigned) and to leads created within the current
# + previous financial year (the pbix hardcoded its then-window start 2025-04-01;
# we derive it so it rolls forward each April). The Conversion Ratio card is
# UNfiltered.
LEADS_PAGE_DATE_FLOOR = "make_date(sieger_fy_start_year(CURRENT_DATE) - 1, 4, 1)"


@router.get("/leads")
def leads(vis: Visibility = Depends(get_visibility),
          f: CommonFilters = Depends(common_filters),
          db: Session = Depends(get_db)):
    where, params = build_filters(vis, f, owner_col="v.owner_id")

    # Card: global conversion ratio (no page filters in PBI)
    overall = rows_as_dicts(db, f"""
        SELECT COALESCE(SUM(v.total_leads), 0)      AS total_leads,
               COALESCE(SUM(v.converted_leads), 0)  AS converted_leads,
               ROUND(COALESCE(SUM(v.converted_leads), 0)::numeric
                     / NULLIF(SUM(v.total_leads), 0) * 100, 2) AS conversion_ratio_pct
        FROM vw_lead_conversion v
        {REGION_JOIN}
        {where}
    """, params)

    # Donut + pivots: created >= FY start. Region is a slicer, not a gate
    # (user decision 2026-08-21 -- the old team gate hid region-less owners).
    scoped = _and(where, f"v.created_date >= {LEADS_PAGE_DATE_FLOOR}")
    counts = ("COUNT(*) AS total_leads, "
              "COUNT(*) FILTER (WHERE UPPER(v.status) = 'QUALIFIED') AS converted_leads")

    by_source = rows_as_dicts(db, f"""
        SELECT v.lead_source, {counts}
        FROM vw_leads v
        {REGION_JOIN}
        {scoped}
        GROUP BY v.lead_source ORDER BY total_leads DESC
    """, params)

    by_status = rows_as_dicts(db, f"""
        SELECT v.status, COUNT(*) AS total_leads
        FROM vw_leads v
        {REGION_JOIN}
        {scoped}
        GROUP BY v.status ORDER BY total_leads DESC
    """, params)

    by_user = rows_as_dicts(db, f"""
        SELECT v.user_name, {counts}
        FROM vw_leads v
        {REGION_JOIN}
        {scoped}
        GROUP BY v.user_name ORDER BY total_leads DESC
    """, params)

    # PBI pivot: salesperson rows x lead-Status columns (incl. Dropped/Dormant)
    by_user_status = rows_as_dicts(db, f"""
        SELECT v.user_name, v.status, COUNT(*) AS total_leads
        FROM vw_leads v
        {REGION_JOIN}
        {scoped}
        GROUP BY v.user_name, v.status
    """, params)

    # Lead detail table (PBI shows it unfiltered -- visibility/slicers only)
    rows = rows_as_dicts(db, f"""
        SELECT v.lead_name, v.company, v.city, v.email, v.mobile_phone,
               v.lead_source, v.status, v.user_name, v.created_date
        FROM vw_leads v
        {REGION_JOIN}
        {where}
        ORDER BY v.created_date DESC NULLS LAST
    """, params)

    return {"overall": overall[0] if overall else {},
            "by_source": by_source, "by_status": by_status, "by_user": by_user,
            "by_user_status": by_user_status, "rows": rows}
