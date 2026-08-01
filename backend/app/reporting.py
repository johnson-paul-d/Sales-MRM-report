"""Shared reporting helpers: common query filters + the security-aware WHERE builder.

Every report query goes through `build_filters`, which injects the visibility
(owner_id) restriction plus optional region/user/date/FY filters. Region is
joined from app.user_region (aliased `ur`) in each report SQL.
"""
from dataclasses import dataclass
from datetime import date

from fastapi import Query

from .security import Visibility


@dataclass
class CommonFilters:
    user_ids: list[str] | None = None
    region_ids: list[int] | None = None
    division: list[str] | None = None
    date_from: date | None = None
    date_to: date | None = None
    fy: str | None = None
    month: str | None = None  # 'YYYY-MM'


def common_filters(
    user_ids: list[str] | None = Query(None, description="Restrict to these owner (Salesforce user) ids"),
    region_ids: list[int] | None = Query(None, description="Restrict to these region ids"),
    division: list[str] | None = Query(None, description="Restrict to these divisions"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    fy: str | None = Query(None, description="Financial year label, e.g. FY25-26"),
    month: str | None = Query(None, description="Month as YYYY-MM"),
) -> CommonFilters:
    return CommonFilters(user_ids=user_ids, region_ids=region_ids, division=division,
                         date_from=date_from, date_to=date_to, fy=fy, month=month)


def build_filters(
    vis: Visibility,
    f: CommonFilters,
    *,
    owner_col: str = "owner_id",
    region_col: str = "ur.region_id",
    division_col: str | None = None,
    date_col: str | None = None,
    fy_col: str | None = None,
    year_month_col: str | None = None,
    month_col: str | None = None,
) -> tuple[str, dict]:
    """Return (where_sql, params).

    `where_sql` always starts with WHERE (or 'WHERE false' when the user may
    see nothing). Bind params use `= ANY(:list)` so psycopg2 sends arrays.
    """
    clauses: list[str] = []
    params: dict = {}

    # --- security: owner visibility ---
    if not vis.can_view_all:
        if not vis.owner_ids:
            return "WHERE false", {}
        clauses.append(f"{owner_col} = ANY(:_owner_ids)")
        params["_owner_ids"] = vis.owner_ids

    # --- optional explicit user subset (slicer) ---
    if f.user_ids:
        clauses.append(f"{owner_col} = ANY(:_user_ids)")
        params["_user_ids"] = f.user_ids

    # --- region slicer ---
    if f.region_ids:
        clauses.append(f"{region_col} = ANY(:_region_ids)")
        params["_region_ids"] = f.region_ids

    # --- division slicer ---
    if division_col and f.division:
        clauses.append(f"{division_col} = ANY(:_divisions)")
        params["_divisions"] = f.division

    # --- date range ---
    if date_col and f.date_from:
        clauses.append(f"{date_col} >= :_date_from")
        params["_date_from"] = f.date_from
    if date_col and f.date_to:
        clauses.append(f"{date_col} <= :_date_to")
        params["_date_to"] = f.date_to

    # --- financial year ---
    if fy_col and f.fy:
        clauses.append(f"{fy_col} = :_fy")
        params["_fy"] = f.fy

    # --- specific month (YYYY-MM): precomputed column, else derive from a date ---
    if f.month:
        if year_month_col:
            clauses.append(f"{year_month_col} = :_month")
            params["_month"] = f.month
        elif month_col:
            clauses.append(f"to_char({month_col}, 'YYYY-MM') = :_month")
            params["_month"] = f.month

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params
