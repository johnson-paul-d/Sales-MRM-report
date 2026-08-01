"""Metadata for slicers/filters (users, regions, financial years) -- visibility-scoped."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db, rows_as_dicts
from ..security import get_visibility, Visibility

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("/filters")
def filters(vis: Visibility = Depends(get_visibility), db: Session = Depends(get_db)):
    """Slicer options the current user is allowed to see."""
    if vis.can_view_all:
        where, params = "", {}
    else:
        # bogus sentinel keeps the array non-empty (typed) when the user sees no one
        where = 'WHERE u."Id" = ANY(:ids)'
        params = {"ids": vis.owner_ids or ["__none__"]}

    users = rows_as_dicts(db, f'''
        SELECT u."Id"      AS id,
               u."Name"    AS name,
               u."IsActive" AS is_active,
               ur.region_id,
               r.name      AS region_name
        FROM "user" u
        LEFT JOIN app.user_region ur ON ur.salesforce_user_id = u."Id"
        LEFT JOIN app.region r       ON r.id = ur.region_id
        {where}
        ORDER BY u."Name"
    ''', params)

    regions = rows_as_dicts(db,
        "SELECT id, name, code FROM app.region WHERE is_active ORDER BY name")

    fys = rows_as_dicts(db,
        "SELECT DISTINCT fy_label FROM vw_sales_tracker WHERE fy_label IS NOT NULL ORDER BY fy_label DESC")

    divisions = rows_as_dicts(db,
        """SELECT DISTINCT "Division__c" AS name FROM opportunity
           WHERE "Division__c" IS NOT NULL AND "IsDeleted" IS NOT TRUE ORDER BY 1""")

    return {
        "users": users,
        "regions": regions,
        "financial_years": [f["fy_label"] for f in fys],
        "divisions": [d["name"] for d in divisions],
    }
