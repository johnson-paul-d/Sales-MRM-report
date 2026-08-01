"""
Apply the reporting views to salesforce_db_v2 and validate the numbers.
Usage:  python sql/apply_reporting_views.py
Reads DB credentials from the project .env (same as the ETL).
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

url = URL.create(
    drivername="postgresql+psycopg2",
    username=os.getenv("PG_USERNAME"),
    password=os.getenv("PG_PASSWORD"),
    host=os.getenv("PG_HOST", "localhost"),
    port=int(os.getenv("PG_PORT", "5432")),
    database=os.getenv("PG_DATABASE"),
)
engine = create_engine(url)

sql_file = ROOT / "sql" / "01_reporting_views.sql"
script = sql_file.read_text(encoding="utf-8")

print(f"Applying {sql_file.name} ...")
raw = engine.raw_connection()
try:
    cur = raw.cursor()
    cur.execute(script)      # psycopg2 executes the whole multi-statement script
    raw.commit()
    print("  -> views + functions created OK\n")
except Exception as e:
    raw.rollback()
    print("  !! FAILED:", e)
    sys.exit(1)
finally:
    raw.close()

def show(title, sql):
    print("=" * 68); print(title); print("=" * 68)
    with engine.connect() as c:
        rows = c.execute(text(sql)).fetchall()
        for r in rows:
            print("   ", *[str(x) for x in r], sep="  ")
    print()

# ---- FY helper sanity ----
show("FY helpers (2025-05-10 -> FY25-26 Q1 ; 2026-02-01 -> FY25-26 Q4)",
    """SELECT sieger_fy_label(d), sieger_fq_label(d), d FROM (VALUES
        (DATE '2025-05-10'),(DATE '2026-02-01'),(DATE '2025-01-15'),(DATE '2025-10-05')) v(d)""")

# ---- View row counts ----
show("View row counts",
    """SELECT 'vw_opportunity', COUNT(*) FROM vw_opportunity
       UNION ALL SELECT 'vw_quote', COUNT(*) FROM vw_quote
       UNION ALL SELECT 'vw_quote_line_item', COUNT(*) FROM vw_quote_line_item
       UNION ALL SELECT 'vw_leads', COUNT(*) FROM vw_leads
       UNION ALL SELECT 'vw_visit_plan_allocation', COUNT(*) FROM vw_visit_plan_allocation
       UNION ALL SELECT 'vw_earliest_quotes_by_month', COUNT(*) FROM vw_earliest_quotes_by_month
       UNION ALL SELECT 'vw_sales_tracker', COUNT(*) FROM vw_sales_tracker""")

# ---- Opportunity measures reconcile to profiling ----
show("Opportunity check: won=249, dropped=537, open=1876 (should match profiling)",
    """SELECT
         COUNT(*) FILTER (WHERE is_won)     AS won,
         COUNT(*) FILTER (WHERE is_dropped) AS dropped,
         COUNT(*) FILTER (WHERE is_open)    AS open,
         ROUND(SUM(opportunity_amount) FILTER (WHERE is_won))::bigint AS won_value
       FROM vw_opportunity""")

# ---- Sales tracker: top owners by closed won value ----
show("Sales Tracker: top 8 (owner, FY) by closed won value",
    """SELECT user_name, fy_label,
              ROUND(SUM(closed_won_value))::bigint won,
              SUM(opportunities_created)::int opps,
              SUM(visits)::int visits
       FROM vw_sales_tracker
       GROUP BY user_name, fy_label
       ORDER BY won DESC NULLS LAST LIMIT 8""")

# ---- Lead conversion overall ----
show("Lead conversion overall (expect ~1945 converted / 23749 = ~8.2%)",
    """SELECT SUM(total_leads) total, SUM(converted_leads) converted,
              ROUND(SUM(converted_leads)::numeric / NULLIF(SUM(total_leads),0) * 100, 2) pct
       FROM vw_lead_conversion""")

# ---- Security function spot check ----
show("Security fn: pick a manager and count their visible subordinates",
    """WITH mgr AS (
         SELECT "ManagerId" AS id FROM "user"
         WHERE "ManagerId" IS NOT NULL GROUP BY "ManagerId"
         ORDER BY COUNT(*) DESC LIMIT 1)
       SELECT (SELECT "Name" FROM "user" WHERE "Id"=(SELECT id FROM mgr)) AS manager,
              (SELECT COUNT(*) FROM fn_subordinate_user_ids((SELECT id FROM mgr))) AS visible_users""")

print("All checks complete.")
