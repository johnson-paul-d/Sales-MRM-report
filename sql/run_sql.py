"""Apply one or more .sql files to the database (reads root .env for credentials).

Usage:  python sql/run_sql.py sql/02_indexes.sql [more.sql ...]
"""
import sys
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
import os

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

engine = create_engine(URL.create(
    "postgresql+psycopg2",
    username=os.getenv("PG_USERNAME"), password=os.getenv("PG_PASSWORD"),
    host=os.getenv("PG_HOST", "localhost"), port=int(os.getenv("PG_PORT", "5432")),
    database=os.getenv("PG_DATABASE"),
))

if len(sys.argv) < 2:
    print("usage: python sql/run_sql.py <file.sql> [...]"); sys.exit(1)

for f in sys.argv[1:]:
    sql = Path(f).read_text(encoding="utf-8")
    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        cur.execute(sql)
        raw.commit()
        print(f"applied: {f}")
    except Exception as e:
        raw.rollback()
        print(f"FAILED {f}: {e}")
        sys.exit(1)
    finally:
        raw.close()
