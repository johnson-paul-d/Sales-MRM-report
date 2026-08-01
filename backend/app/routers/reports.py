"""Report endpoints -- one per Power BI page. All are visibility-scoped.

Region is joined from app.user_region (alias `ur`/`r`). The build_filters helper
injects owner-visibility + region/division/date/FY/month slicers.

Product-grain tables are aggregated to ONE ROW PER OPPORTUNITY + PRODUCT with
SUM(Qty)/SUM(TotalPrice) -- matching Power BI's Sum(...) tables and collapsing
duplicate quote line items.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db, rows_as_dicts
from ..reporting import common_filters, build_filters, CommonFilters
from ..security import get_visibility, Visibility

router = APIRouter(prefix="/api/reports", tags=["reports"])

# region enrichment used by every owner-keyed query (main view must be aliased `v`)
REGION_JOIN = """
LEFT JOIN app.user_region ur ON ur.salesforce_user_id = v.owner_id
LEFT JOIN app.region r        ON r.id = ur.region_id
"""


def _and(where: str, extra: str) -> str:
    """Append a static predicate to a WHERE produced by build_filters."""
    return f"{where} AND {extra}" if where else f"WHERE {extra}"


def _product_table(where: str, predicate: str, max_cols: list[str],
                   order: str = "MAX(v.close_date) DESC NULLS LAST, MAX(v.user_name)") -> str:
    """Aggregated product table: one row per opportunity + product, Qty/Value summed."""
    extra = ",\n               ".join(max_cols)
    return f"""
        SELECT v.owner_id, MAX(v.user_name) AS user_name, ur.region_id, MAX(r.name) AS region_name,
               v.opportunity_name, v.product_name,
               SUM(v.quantity) AS quantity, SUM(v.total_price) AS total_price,
               {extra}
        FROM vw_quote_line_item v
        {REGION_JOIN}
        {_and(where, predicate)}
        GROUP BY v.owner_id, ur.region_id, v.opportunity_id, v.opportunity_name, v.product_name
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
               SUM(v.open_quotes_value) AS open_quotes_value, SUM(v.live_quote_value) AS live_quote_value,
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
         "MAX(v.division) AS division", "MAX(v.remarks) AS remarks"])
    return {"rows": rows_as_dicts(db, sql, params)}


# ---------------------------------------------------------------------------
# CLOSED LOST  (product grain, aggregated)
# ---------------------------------------------------------------------------
@router.get("/closed-lost")
def closed_lost(vis: Visibility = Depends(get_visibility),
                f: CommonFilters = Depends(common_filters),
                db: Session = Depends(get_db)):
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                  date_col="v.close_date", fy_col="v.close_fy_label", month_col="v.close_date")
    sql = _product_table(where,
        "v.stage_name = 'Closed Lost' AND v.sync_quote IS TRUE",
        ["MAX(v.account_name) AS account_name", "MAX(v.stage_name) AS stage_name",
         "MAX(v.close_date) AS close_date", "MAX(v.division) AS division", "MAX(v.remarks) AS remarks"])
    return {"rows": rows_as_dicts(db, sql, params)}


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
        LEFT JOIN (
            SELECT opportunity_id, SUM(total_price) AS total_price, SUM(quantity) AS quantity
            FROM vw_quote_line_item GROUP BY opportunity_id
        ) ql ON ql.opportunity_id = v.opportunity_id
        {_and(where, "v.is_open IS TRUE AND v.has_synced_quote IS TRUE")}
        ORDER BY v.opportunity_amount DESC NULLS LAST
    """
    return {"rows": rows_as_dicts(db, sql, params)}


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
    predicate = ("v.is_open IS TRUE AND v.sync_quote IS TRUE AND v.stage_name <> 'Hold' AND "
                 "(v.days_since_last_activity >= :_min_days OR v.days_since_last_activity IS NULL)")
    sql = _product_table(where, predicate,
        ["MAX(v.account_name) AS account_name", "MAX(v.stage_name) AS stage_name",
         "MAX(v.latest_checkin_opp) AS latest_checkin_opp", "MAX(v.latest_checkin_acc) AS latest_checkin_acc",
         "MAX(v.close_date) AS close_date", "MAX(v.days_since_last_activity) AS days_since_last_activity"],
        order="MAX(v.days_since_last_activity) DESC NULLS FIRST, MAX(v.user_name)")
    return {"rows": rows_as_dicts(db, sql, params)}


# ---------------------------------------------------------------------------
# TOP ENQUIRIES  (opportunity grain, by value)
# ---------------------------------------------------------------------------
@router.get("/top-enquiries")
def top_enquiries(vis: Visibility = Depends(get_visibility),
                  f: CommonFilters = Depends(common_filters),
                  limit: int = Query(50, ge=1, le=1000),
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
        LEFT JOIN (
            SELECT opportunity_id, SUM(total_price) AS total_price, SUM(quantity) AS quantity
            FROM vw_quote_line_item GROUP BY opportunity_id
        ) ql ON ql.opportunity_id = v.opportunity_id
        {_and(where, "v.is_open IS TRUE AND COALESCE(ql.total_price, 0) > 50000000")}
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
                                  date_col="v.earliest_presented_date", fy_col="v.fy_label",
                                  month_col="v.earliest_presented_date")
    sql = f"""
        SELECT v.owner_id, v.user_name, ur.region_id, r.name AS region_name,
               v.opportunity_name, v.product_name, v.quantity, v.quote_value,
               v.opp_stage, v.earliest_presented_date
        FROM vw_earliest_quotes_by_month v
        {REGION_JOIN}
        {where}
        ORDER BY v.earliest_presented_date DESC NULLS LAST, v.user_name
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
            "AND v.is_open IS TRUE AND ur.region_id IS NOT NULL" + date_pred)
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
               db: Session = Depends(get_db)):
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                  month_col="v.close_date")
    date_pred = ("" if f.month else
                 " AND v.close_date >= date_trunc('month', CURRENT_DATE) - interval '1 month'"
                 " AND v.close_date < date_trunc('month', CURRENT_DATE)")
    # Same filters as the Power BI page (synced, not rejected, CPS team, PBI bad-opp exclusions).
    pred = ("v.sync_quote IS TRUE AND UPPER(v.quote_status) <> 'REJECTED' "
            "AND ur.region_id IS NOT NULL "
            "AND v.opportunity_name NOT IN "
            "('AIRFORCE ADMINSTRATIVE COLLEGE-','HTC GLOBAL @ GUINDY','LIFESTYLE BUILDING')"
            + date_pred)
    # Aggregate to opp+product, and join the latest Forecast snapshot per opportunity
    # (the two Salesforce reports) for Close Date (Historical) + Snapshot Date.
    sql = f"""
        SELECT v.owner_id, MAX(v.user_name) AS user_name, ur.region_id, MAX(r.name) AS region_name,
               v.opportunity_name, v.product_name,
               SUM(v.quantity) AS quantity, SUM(v.total_price) AS total_price,
               MAX(v.stage_name) AS stage_name, MAX(v.close_date) AS close_date,
               MAX(v.remarks) AS remarks, MAX(v.probability) AS probability,
               MAX(fl.close_date_historical) AS close_date_historical,
               MAX(fl.snapshot_date) AS snapshot_date
        FROM vw_quote_line_item v
        {REGION_JOIN}
        LEFT JOIN vw_forecast_latest fl ON fl.opportunity_name = v.opportunity_name
        {_and(where, pred)}
        GROUP BY v.owner_id, ur.region_id, v.opportunity_id, v.opportunity_name, v.product_name
        ORDER BY MAX(v.close_date) DESC, MAX(v.user_name)
    """
    return {"rows": rows_as_dicts(db, sql, params)}


# ---------------------------------------------------------------------------
# SIX MONTHS BOOKING PLAN  (open pipeline, next 6 months, aggregated)
# ---------------------------------------------------------------------------
@router.get("/six-month-plan")
def six_month_plan(vis: Visibility = Depends(get_visibility),
                   f: CommonFilters = Depends(common_filters),
                   db: Session = Depends(get_db)):
    where, params = build_filters(vis, f, owner_col="v.owner_id", division_col="v.division",
                                  month_col="v.close_date")
    date_pred = ("" if f.month else
                 " AND v.close_date >= date_trunc('month', CURRENT_DATE)"
                 " AND v.close_date < date_trunc('month', CURRENT_DATE) + interval '6 months'")
    pred = ("v.sync_quote IS TRUE AND UPPER(v.quote_status) NOT IN ('REJECTED','ACCEPTED') "
            "AND v.is_open IS TRUE AND ur.region_id IS NOT NULL" + date_pred)
    sql = _product_table(where, pred,
        ["to_char(MAX(v.close_date), 'YYYY-MM') AS close_month", "MAX(v.close_date) AS close_date",
         "MAX(v.stage_name) AS stage_name", "MAX(v.probability) AS probability",
         "MAX(v.project_stage) AS project_stage",
         "MAX(v.building_construction_stage) AS building_construction_stage",
         "MAX(v.latest_action_task) AS latest_action_task", "MAX(v.action_activity_date) AS action_activity_date"],
        order="MAX(v.close_date), MAX(v.user_name)")
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
    pred = "ur.region_id IS NOT NULL" + date_pred
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
    by_user = [{"user_name": k, "count": v} for k, v in sorted(counts.items(), key=lambda x: -x[1])]
    return {"rows": rows, "by_user": by_user}


# ---------------------------------------------------------------------------
# LEADS  (overall conversion + by-source + by-status + by-user)
# ---------------------------------------------------------------------------
@router.get("/leads")
def leads(vis: Visibility = Depends(get_visibility),
          f: CommonFilters = Depends(common_filters),
          db: Session = Depends(get_db)):
    where, params = build_filters(vis, f, owner_col="v.owner_id")

    overall = rows_as_dicts(db, f"""
        SELECT COALESCE(SUM(v.total_leads), 0)      AS total_leads,
               COALESCE(SUM(v.converted_leads), 0)  AS converted_leads,
               ROUND(COALESCE(SUM(v.converted_leads), 0)::numeric
                     / NULLIF(SUM(v.total_leads), 0) * 100, 2) AS conversion_ratio_pct
        FROM vw_lead_conversion v
        {REGION_JOIN}
        {where}
    """, params)

    by_source = rows_as_dicts(db, f"""
        SELECT v.lead_source, SUM(v.total_leads) AS total_leads, SUM(v.converted_leads) AS converted_leads
        FROM vw_lead_conversion v
        {REGION_JOIN}
        {where}
        GROUP BY v.lead_source ORDER BY total_leads DESC
    """, params)

    by_status = rows_as_dicts(db, f"""
        SELECT v.status, SUM(v.total_leads) AS total_leads
        FROM vw_lead_conversion v
        {REGION_JOIN}
        {where}
        GROUP BY v.status ORDER BY total_leads DESC
    """, params)

    by_user = rows_as_dicts(db, f"""
        SELECT v.user_name, SUM(v.total_leads) AS total_leads, SUM(v.converted_leads) AS converted_leads
        FROM vw_lead_conversion v
        {REGION_JOIN}
        {where}
        GROUP BY v.user_name ORDER BY total_leads DESC
    """, params)

    return {"overall": overall[0] if overall else {},
            "by_source": by_source, "by_status": by_status, "by_user": by_user}
