import os
import sys
import time
import logging
import json
import requests
import pandas as pd
from dotenv import load_dotenv
from simple_salesforce import Salesforce
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.engine import URL
from datetime import datetime, timezone
from functools import wraps

# ============================================================
# 1. LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)

# ============================================================
# 2. RETRY DECORATOR
# ============================================================

def retry(max_attempts=5, delay=1, backoff=2, exceptions=(Exception,)):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            attempt = 0
            current_delay = delay
            while attempt < max_attempts:
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    attempt += 1
                    if attempt == max_attempts:
                        raise
                    logger.warning(
                        "Retry %d/%d for %s after error: %s",
                        attempt, max_attempts, func.__name__, e
                    )
                    time.sleep(current_delay)
                    current_delay *= backoff
            return None
        return wrapper
    return decorator

# ============================================================
# 3. LOAD ENVIRONMENT
# ============================================================

load_dotenv()

SF_USERNAME = os.getenv("SF_USERNAME")
SF_PASSWORD = os.getenv("SF_PASSWORD")
SF_SECURITY_TOKEN = os.getenv("SF_SECURITY_TOKEN")
SF_INCREMENTAL = os.getenv("SF_INCREMENTAL", "true").lower() == "true"
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "50000"))
SYNC_MODE = os.getenv("SYNC_MODE", "CORE").upper()  # CORE or ALL
SF_VALIDATE_COUNTS = os.getenv("SF_VALIDATE_COUNTS", "false").lower() == "true"

PG_HOST = os.getenv("PG_HOST", "localhost")
PG_PORT = os.getenv("PG_PORT", "5432")
PG_DATABASE = os.getenv("PG_DATABASE")
PG_USERNAME = os.getenv("PG_USERNAME")
PG_PASSWORD = os.getenv("PG_PASSWORD")

# ============================================================
# 4. VALIDATE
# ============================================================

required = {
    "SF_USERNAME": SF_USERNAME,
    "SF_PASSWORD": SF_PASSWORD,
    "SF_SECURITY_TOKEN": SF_SECURITY_TOKEN,
    "PG_DATABASE": PG_DATABASE,
    "PG_USERNAME": PG_USERNAME,
    "PG_PASSWORD": PG_PASSWORD,
}
missing = [k for k, v in required.items() if not v]
if missing:
    logger.error("Missing environment variables: %s", ", ".join(missing))
    sys.exit(1)

# ============================================================
# 5. CORE OBJECTS (Step 1)
# ============================================================

CORE_OBJECTS = [
    "Account",
    "Contact",
    "Lead",
    "Opportunity",
    "Quote",
    "QuoteLineItem",
    "OpportunityLineItem",
    "Product2",
    "User",
    "Task",
    "Event",
    "Visit_Plan_Allocation__c",
    # Action plans live in the Labs Action Plans managed package -- the standard
    # ActionPlan object is empty in this org (verified 2026-08-05: 0 rows vs 3,450/4,003).
    "LabsActionPlans__ActionPlan__c",
    "LabsActionPlans__APTask__c",
    # Start Work / End Work stamps + travel distance, per user per day. Source
    # for the attendance report (IN/OUT times and KM travelled); Visit Plan
    # Allocation's own Distance_Travel_KM__c is empty across all 27k rows.
    "Activity_Tracker__c",
]

# ============================================================
# 6. CONNECTIONS
# ============================================================

@retry()
def connect_salesforce():
    logger.info("Connecting to Salesforce...")
    sf = Salesforce(
        username=SF_USERNAME,
        password=SF_PASSWORD,
        security_token=SF_SECURITY_TOKEN
    )
    logger.info("Salesforce connected.")
    return sf

@retry()
def connect_postgresql():
    logger.info("Connecting to PostgreSQL...")
    db_url = URL.create(
        drivername="postgresql+psycopg2",
        username=PG_USERNAME,
        password=PG_PASSWORD,
        host=PG_HOST,
        port=int(PG_PORT),
        database=PG_DATABASE,
    )
    engine = create_engine(db_url)
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    logger.info("PostgreSQL connected.")
    return engine

# ============================================================
# 7. TYPE MAPPING
# ============================================================

def map_sf_type_to_pg(field):
    sf_type = field.get("type")
    if sf_type in ("id", "reference", "owner", "lookup", "string", "textarea",
                   "phone", "url", "email", "picklist", "encryptedstring",
                   "multipicklist", "combobox", "anyType"):
        return "TEXT", False
    elif sf_type in ("int", "integer"):
        return "INTEGER", False
    elif sf_type in ("double", "currency", "percent"):
        return "NUMERIC", False
    elif sf_type == "date":
        return "DATE", False
    elif sf_type == "datetime":
        return "TIMESTAMPTZ", True
    elif sf_type == "boolean":
        return "BOOLEAN", False
    elif sf_type == "time":
        return "TIME", False
    elif sf_type in ("base64", "blob", "address", "location"):
        return None, False
    else:
        return "TEXT", False

# ============================================================
# 8. SCHEMA MANAGEMENT (Step 14 – auto‑discover fields)
# ============================================================

def ensure_table_schema(engine, table_name, fields):
    create_sql = generate_create_table_sql(table_name, fields)
    with engine.begin() as conn:
        conn.execute(text(create_sql))

    inspector = inspect(engine)
    existing_cols = {col["name"] for col in inspector.get_columns(table_name)}

    alter_statements = []
    for f in fields:
        col_name = f["name"]
        if col_name in existing_cols:
            continue
        pg_type, _ = map_sf_type_to_pg(f)
        if pg_type is None:
            continue
        alter_statements.append(f'ALTER TABLE "{table_name}" ADD COLUMN "{col_name}" {pg_type};')

    if alter_statements:
        logger.info("Adding %d new columns to %s", len(alter_statements), table_name)
        with engine.begin() as conn:
            for stmt in alter_statements:
                conn.execute(text(stmt))

# ============================================================
# 8b. GENERATE CREATE TABLE (Step 12 – preserve casing)
# ============================================================

def generate_create_table_sql(table_name, fields, primary_key="Id"):
    """
    Build a CREATE TABLE statement with a clean, explicit primary key.
    Salesforce Ids are always TEXT and should be PRIMARY KEY.
    """
    columns = []
    for f in fields:
        name = f["name"]
        pg_type, _ = map_sf_type_to_pg(f)
        if pg_type is None:
            continue

        if name == primary_key:
            columns.append(f'"{name}" TEXT PRIMARY KEY')
        else:
            nullable = "NULL" if f.get("nillable", True) else "NOT NULL"
            columns.append(f'"{name}" {pg_type} {nullable}')

    return f'CREATE TABLE IF NOT EXISTS "{table_name}" (\n  ' + ',\n  '.join(columns) + '\n);'

# ============================================================
# 9. INDEXES (Step 4 + extra foreign‑key indexes)
# ============================================================

def create_indexes(engine, table_name, fields):
    """Add indexes on LastModifiedDate, SystemModstamp, and common FK fields."""
    index_objects = {"Account", "Contact", "Lead", "Opportunity", "Quote", "Task", "Event"}
    if table_name not in [o.lower() for o in index_objects]:
        return

    field_names = {f["name"] for f in fields}
    with engine.begin() as conn:
        # Date/Mod stamp indexes
        if "LastModifiedDate" in field_names:
            conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_lastmodifieddate ON "{table_name}" ("LastModifiedDate")'))
        if "SystemModstamp" in field_names:
            conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_systemmodstamp ON "{table_name}" ("SystemModstamp")'))

        # Common foreign key fields – these dramatically speed up joins in Power BI
        fk_fields = ["AccountId", "OwnerId", "OpportunityId", "QuoteId", "Product2Id"]
        for fk in fk_fields:
            if fk in field_names:
                conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_{fk.lower()} ON "{table_name}" ("{fk}")'))

# ============================================================
# 10. METADATA TABLES (Steps 5 & 6, enhanced)
# ============================================================

def create_metadata_tables(engine):
    """Create tables for storing Salesforce metadata and relationships."""
    with engine.begin() as conn:
        # sf_objects
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sf_objects (
                object_name TEXT PRIMARY KEY,
                label TEXT,
                custom BOOLEAN,
                queryable BOOLEAN,
                createable BOOLEAN,
                updateable BOOLEAN,
                searchable BOOLEAN,
                key_prefix TEXT
            )
        """))
        # sf_fields
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sf_fields (
                id SERIAL PRIMARY KEY,
                object_name TEXT,
                field_name TEXT,
                label TEXT,
                type TEXT,
                length INTEGER,
                precision INTEGER,
                scale INTEGER,
                nullable BOOLEAN,
                unique_field BOOLEAN,
                external_id BOOLEAN,
                reference_to TEXT,
                UNIQUE(object_name, field_name)
            )
        """))
        # sf_relationships – enhanced with relationship name and cascade delete
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sf_relationships (
                id SERIAL PRIMARY KEY,
                from_object TEXT,
                from_field TEXT,
                to_object TEXT,
                relationship_name TEXT,
                cascade_delete BOOLEAN,
                relationship_type TEXT,   -- 'lookup', 'masterdetail', 'child_relationship'
                UNIQUE(from_object, from_field, to_object, relationship_name)
            )
        """))
        # etl_log (Step 10) – enhanced with extra columns
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS etl_log (
                id SERIAL PRIMARY KEY,
                run_time TIMESTAMPTZ DEFAULT NOW(),
                object_name TEXT,
                rows_read INTEGER,
                rows_loaded INTEGER,
                rows_inserted INTEGER,
                rows_updated INTEGER,
                duration_sec NUMERIC,
                api_calls INTEGER,
                sync_mode TEXT,
                batch_size INTEGER,
                status TEXT,
                error_message TEXT
            )
        """))

        # Reconciliation table (optional)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS etl_reconciliation (
                id SERIAL PRIMARY KEY,
                object_name TEXT,
                sf_count BIGINT,
                pg_count BIGINT,
                is_match BOOLEAN,
                run_time TIMESTAMPTZ DEFAULT NOW()
            )
        """))

def sync_objects_metadata(sf, engine):
    """Populate sf_objects using UPSERT with executemany."""
    describe_all = sf.describe()["sobjects"]
    rows = []
    for obj in describe_all:
        rows.append({
            "object_name": obj["name"],
            "label": obj["label"],
            "custom": obj["custom"],
            "queryable": obj["queryable"],
            "createable": obj["createable"],
            "updateable": obj["updateable"],
            "searchable": obj["searchable"],
            "key_prefix": obj.get("keyPrefix")
        })
    with engine.begin() as conn:
        # Using executemany for speed
        sql = """
            INSERT INTO sf_objects (object_name, label, custom, queryable, createable,
                                     updateable, searchable, key_prefix)
            VALUES (:object_name, :label, :custom, :queryable, :createable,
                    :updateable, :searchable, :key_prefix)
            ON CONFLICT (object_name) DO UPDATE SET
                label = EXCLUDED.label,
                custom = EXCLUDED.custom,
                queryable = EXCLUDED.queryable,
                createable = EXCLUDED.createable,
                updateable = EXCLUDED.updateable,
                searchable = EXCLUDED.searchable,
                key_prefix = EXCLUDED.key_prefix
        """
        conn.execute(text(sql), rows)
    logger.info("Metadata for %d objects stored.", len(rows))

def sync_fields_metadata(sf, engine, object_names):
    """Populate sf_fields using UPSERT with executemany."""
    all_fields = []
    for obj_name in object_names:
        try:
            obj_desc = getattr(sf, obj_name).describe()
            for f in obj_desc["fields"]:
                all_fields.append({
                    "object_name": obj_name,
                    "field_name": f["name"],
                    "label": f["label"],
                    "type": f["type"],
                    "length": f.get("length"),
                    "precision": f.get("precision"),
                    "scale": f.get("scale"),
                    "nullable": f.get("nillable", True),
                    "unique_field": f.get("unique", False),
                    "external_id": f.get("externalId", False),
                    "reference_to": f["referenceTo"][0] if f.get("referenceTo") else None
                })
        except Exception as e:
            logger.warning("Could not describe %s: %s", obj_name, e)
    with engine.begin() as conn:
        sql = """
            INSERT INTO sf_fields (object_name, field_name, label, type, length,
                                   precision, scale, nullable, unique_field,
                                   external_id, reference_to)
            VALUES (:object_name, :field_name, :label, :type, :length,
                    :precision, :scale, :nullable, :unique_field,
                    :external_id, :reference_to)
            ON CONFLICT (object_name, field_name) DO UPDATE SET
                label = EXCLUDED.label,
                type = EXCLUDED.type,
                length = EXCLUDED.length,
                precision = EXCLUDED.precision,
                scale = EXCLUDED.scale,
                nullable = EXCLUDED.nullable,
                unique_field = EXCLUDED.unique_field,
                external_id = EXCLUDED.external_id,
                reference_to = EXCLUDED.reference_to
        """
        conn.execute(text(sql), all_fields)
    logger.info("Field metadata for %d fields stored.", len(all_fields))

def sync_relationships(sf, engine, object_names):
    """
    Populate sf_relationships.
    Includes field-level lookups AND child relationships (with cascade delete info).
    """
    rels = []
    # Field-level relationships
    for obj_name in object_names:
        try:
            obj_desc = getattr(sf, obj_name).describe()
            for f in obj_desc["fields"]:
                if f["type"] in ("reference", "lookup") and f.get("referenceTo"):
                    for ref in f["referenceTo"]:
                        rel_type = "masterdetail" if f.get("relationshipName") and f.get("cascadeDelete") else "lookup"
                        rels.append({
                            "from_object": obj_name,
                            "from_field": f["name"],
                            "to_object": ref,
                            "relationship_name": f.get("relationshipName"),
                            "cascade_delete": f.get("cascadeDelete", False),
                            "relationship_type": rel_type
                        })
        except Exception as e:
            logger.warning("Could not describe %s for relationships: %s", obj_name, e)

    # Child relationships (from the parent object's perspective)
    for obj_name in object_names:
        try:
            obj_desc = getattr(sf, obj_name).describe()
            for child_rel in obj_desc.get("childRelationships", []):
                rels.append({
                    "from_object": obj_name,                     # parent
                    "from_field": None,                          # no direct field on parent
                    "to_object": child_rel["childSObject"],      # child
                    "relationship_name": child_rel.get("relationshipName"),
                    "cascade_delete": child_rel.get("cascadeDelete", False),
                    "relationship_type": "child_relationship"
                })
        except Exception as e:
            logger.warning("Could not get child relationships for %s: %s", obj_name, e)

    with engine.begin() as conn:
        sql = """
            INSERT INTO sf_relationships (from_object, from_field, to_object,
                                          relationship_name, cascade_delete,
                                          relationship_type)
            VALUES (:from_object, :from_field, :to_object,
                    :relationship_name, :cascade_delete,
                    :relationship_type)
            ON CONFLICT (from_object, from_field, to_object, relationship_name)
            DO UPDATE SET
                cascade_delete = EXCLUDED.cascade_delete,
                relationship_type = EXCLUDED.relationship_type
        """
        conn.execute(text(sql), rels)
    logger.info("Relationships stored for %d entries.", len(rels))

# ============================================================
# 11. SOQL HELPERS
# ============================================================

def sf_date_format(dt):
    return "'" + dt.strftime("%Y-%m-%dT%H:%M:%SZ") + "'"

def chunk_fields(field_names, max_chars=18000):
    chunks = []
    current_chunk = []
    current_length = 0
    for f in field_names:
        added = len(f) + 3
        if current_length + added > max_chars and current_chunk:
            chunks.append(current_chunk)
            current_chunk = []
            current_length = 0
        current_chunk.append(f)
        current_length += added
    if current_chunk:
        chunks.append(current_chunk)
    return chunks

# ============================================================
# 12. DATA CLEANING (Step 12 – preserve Salesforce casing)
# ============================================================

def clean_dataframe(df, fields):
    if df.empty:
        return df
    if "attributes" in df.columns:
        df.drop(columns=["attributes"], inplace=True)

    for f in fields:
        name = f["name"]
        if name not in df.columns:
            continue
        sf_type = f["type"]
        if sf_type == "datetime":
            df[name] = pd.to_datetime(df[name], errors="coerce", utc=True)
        elif sf_type == "date":
            df[name] = pd.to_datetime(df[name], errors="coerce").dt.date
        elif sf_type == "time":
            df[name] = pd.to_datetime(df[name], errors="coerce").dt.time
        elif sf_type == "boolean":
            df[name] = df[name].map(lambda x: x.lower() == "true" if isinstance(x, str) else x)
    return df

# ============================================================
# 13. INCREMENTAL CONTROL
# ============================================================

def ensure_control_table(engine):
    sql = """
    CREATE TABLE IF NOT EXISTS salesforce_sync_control (
        object_name TEXT PRIMARY KEY,
        last_sync_timestamp TIMESTAMPTZ NOT NULL
    );
    """
    with engine.begin() as conn:
        conn.execute(text(sql))

@retry()
def get_last_sync(engine, object_name):
    sql = "SELECT last_sync_timestamp FROM salesforce_sync_control WHERE object_name = :obj"
    with engine.connect() as conn:
        row = conn.execute(text(sql), {"obj": object_name}).fetchone()
        return row[0] if row else None

@retry()
def update_last_sync(engine, object_name, timestamp):
    sql = """
    INSERT INTO salesforce_sync_control (object_name, last_sync_timestamp)
    VALUES (:obj, :ts)
    ON CONFLICT (object_name) DO UPDATE SET last_sync_timestamp = EXCLUDED.last_sync_timestamp;
    """
    with engine.begin() as conn:
        conn.execute(text(sql), {"obj": object_name, "ts": timestamp})

# ============================================================
# 14. SAFE API CALLS WITH RETRY
# ============================================================

@retry()
def safe_query(sf, soql):
    return sf.query(soql)

@retry()
def safe_query_more(sf, next_url):
    if next_url.startswith("/"):
        return sf.query_more(next_url, identifier_is_url=True)
    else:
        return sf.query_more(next_url, identifier_is_url=False)

# ============================================================
# 15. UPSERT BATCH TO STAGING (Step 2 – engine.begin(), using df.to_sql)
# ============================================================

def upsert_batch_to_staging(engine, staging_name, temp_table_name, df_batch):
    """Upsert batch into staging, preserving existing non‑NULL values."""
    if df_batch.empty:
        return

    with engine.begin() as conn:
        # 1. Create temp table with same schema as staging
        conn.execute(text(f'DROP TABLE IF EXISTS "{temp_table_name}"'))
        conn.execute(text(f'CREATE TEMP TABLE "{temp_table_name}" (LIKE "{staging_name}" INCLUDING ALL)'))

        # 2. Insert batch into temp table using pandas to_sql (stable, no COPY for now)
        df_batch.to_sql(temp_table_name, con=conn, if_exists='append', index=False)

        # 3. Get columns from staging
        inspector = inspect(engine)
        staging_cols = [c["name"] for c in inspector.get_columns(staging_name)]
        if "Id" not in staging_cols:
            logger.error("Staging table missing 'Id' column, cannot upsert.")
            conn.execute(text(f'DROP TABLE IF EXISTS "{temp_table_name}"'))
            return

        # 4. Build UPSERT with COALESCE to avoid overwriting with NULL
        insert_cols = ', '.join(f'"{c}"' for c in staging_cols)
        select_cols = ', '.join(f'"{c}"' for c in staging_cols)
        update_clauses = ', '.join(
            f'"{c}" = COALESCE(EXCLUDED."{c}", "{staging_name}"."{c}")'
            for c in staging_cols if c != "Id"
        )
        upsert_sql = f"""
        INSERT INTO "{staging_name}" ({insert_cols})
        SELECT {select_cols}
        FROM "{temp_table_name}"
        ON CONFLICT ("Id")
        DO UPDATE SET {update_clauses};
        """
        conn.execute(text(upsert_sql))

        # 5. Drop temp table
        conn.execute(text(f'DROP TABLE IF EXISTS "{temp_table_name}"'))

# ============================================================
# 16. ETL LOGGING (Step 10 – enhanced)
# ============================================================

def log_etl_run(engine, object_name, rows_read, rows_loaded, rows_inserted, rows_updated,
                duration_sec, api_calls, sync_mode, batch_size, status, error_msg=None):
    sql = """
    INSERT INTO etl_log (object_name, rows_read, rows_loaded, rows_inserted, rows_updated,
                         duration_sec, api_calls, sync_mode, batch_size, status, error_message)
    VALUES (:obj, :rr, :rl, :ri, :ru, :dur, :api, :sm, :bs, :status, :err)
    """
    with engine.begin() as conn:
        conn.execute(text(sql), {
            "obj": object_name,
            "rr": rows_read,
            "rl": rows_loaded,
            "ri": rows_inserted,
            "ru": rows_updated,
            "dur": duration_sec,
            "api": api_calls,
            "sm": sync_mode,
            "bs": batch_size,
            "status": status,
            "err": error_msg
        })

# ============================================================
# 17. RECONCILIATION (optional)
# ============================================================

def log_reconciliation(engine, object_name, sf_count, pg_count):
    """Insert a reconciliation record."""
    is_match = (sf_count == pg_count)
    sql = """
    INSERT INTO etl_reconciliation (object_name, sf_count, pg_count, is_match)
    VALUES (:obj, :sf, :pg, :match)
    """
    with engine.begin() as conn:
        conn.execute(text(sql), {
            "obj": object_name,
            "sf": sf_count,
            "pg": pg_count,
            "match": is_match
        })

# ============================================================
# 18. SYNC ONE OBJECT (Steps 3, 4, 7, 8, 9)
# ============================================================

# Salesforce reports some genuinely useful scalar fields as "compound" components
# (Person-Account Name; address parts like BillingCity/City), so the generic
# compound-field skip below drops them. The reporting layer needs a few of these,
# and each is directly queryable in SOQL, so allow a per-object keep-list to
# survive that skip. Keyed by destination table name (lowercased, __c stripped).
KEEP_COMPOUND_FIELDS = {
    "account": frozenset({"Name", "BillingCity", "BillingState"}),
    "lead": frozenset({"City", "State"}),
}


# Refuse the soft-delete sweep if it would hit more than this fraction of the
# table -- a truncated/partial fetch must never mass-hide live records.
DELETE_SWEEP_MAX_FRACTION = float(os.getenv("SF_DELETE_SWEEP_MAX_FRACTION", "0.10"))

# Objects the delete sweep must never touch. Salesforce AUTO-ARCHIVES old
# Activities, and archived rows are excluded from query() exactly like deleted
# ones -- so "missing from this run" does not mean deleted for these. Measured
# 2026-08-18: of the rows query() no longer returned, 1214/1241 Tasks and
# 742/744 Events had ActivityDate older than a year, i.e. archived and still
# live in Salesforce. Sweeping them would have hidden ~1,956 real historical
# activities from the visit/activity reports.
DELETE_SWEEP_EXCLUDE = {"Task", "Event"}


def mark_deleted_rows(engine, obj_name, table_name, staging_name, has_is_deleted,
                      incremental, where_clause, total_processed):
    """Mark rows that Salesforce no longer returns as IsDeleted = true.

    Salesforce's query() never returns deleted records, so a deleted row simply
    stops appearing; because the ETL only ever upserts, it would otherwise linger
    in Postgres forever with IsDeleted = false and keep showing up in every
    report. Staging holds exactly what this run fetched (it is truncated at the
    start of each object), so main-minus-staging is the deleted set.

    Only safe for a FULL sync: an incremental/filtered run fetches a subset by
    design, so everything outside the window would look deleted. Guarded further
    by a fraction cap, so a partial fetch cannot mass-hide live data.
    Soft-marks only -- rows are never removed, and the reporting views already
    filter on `IsDeleted IS NOT TRUE`.
    """
    if not has_is_deleted:
        return 0

    # Restore FIRST -- ahead of every sweep guard below. This only un-marks rows
    # Salesforce returned in this run, so it is correct in every mode: on an
    # excluded object staging holds the full fetch, on an incremental/filtered
    # run it holds a live subset, and when nothing was fetched it is empty and
    # this matches no rows.
    #
    # It must not sit behind the guards, because the guards are exactly what an
    # operator reaches for after a bad sweep (add the object to
    # DELETE_SWEEP_EXCLUDE, or switch back to incremental) -- that would disable
    # the only code in the repo that can undo it. The normal upsert cannot heal
    # these rows either: its UPDATE only fires when SystemModstamp differs, and a
    # row marked in error has an unchanged SystemModstamp by construction.
    with engine.begin() as conn:
        restored = conn.execute(text(
            f'UPDATE "{table_name}" AS m SET "IsDeleted" = FALSE '
            f'FROM "{staging_name}" AS s WHERE m."Id" = s."Id" AND m."IsDeleted" IS TRUE'
        )).rowcount
    if restored:
        logger.info("  Delete sweep %s: restored %d row(s) that reappeared in Salesforce",
                    obj_name, restored)

    if obj_name in DELETE_SWEEP_EXCLUDE:
        logger.info("  Skipping delete sweep for %s (auto-archived object, see DELETE_SWEEP_EXCLUDE)", obj_name)
        return 0
    if incremental or where_clause:
        logger.info("  Skipping delete sweep for %s (incremental/filtered run)", obj_name)
        return 0
    if total_processed <= 0:
        logger.warning("  Skipping delete sweep for %s (nothing fetched this run)", obj_name)
        return 0

    with engine.begin() as conn:
        live = conn.execute(text(
            f'SELECT count(*) FROM "{table_name}" WHERE "IsDeleted" IS NOT TRUE')).scalar() or 0
        candidates = conn.execute(text(
            f'SELECT count(*) FROM "{table_name}" AS m WHERE m."IsDeleted" IS NOT TRUE '
            f'AND NOT EXISTS (SELECT 1 FROM "{staging_name}" AS s WHERE s."Id" = m."Id")')).scalar() or 0

        if candidates == 0:
            return 0

        fraction = candidates / live if live else 1.0
        if fraction > DELETE_SWEEP_MAX_FRACTION:
            logger.error(
                "  ⚠️ Delete sweep ABORTED for %s: %d of %d rows (%.1f%%) missing from this "
                "run, above the %.0f%% cap -- suspected partial fetch, nothing marked.",
                obj_name, candidates, live, fraction * 100, DELETE_SWEEP_MAX_FRACTION * 100)
            return 0

        marked = conn.execute(text(
            f'UPDATE "{table_name}" AS m SET "IsDeleted" = TRUE '
            f'WHERE m."IsDeleted" IS NOT TRUE '
            f'AND NOT EXISTS (SELECT 1 FROM "{staging_name}" AS s WHERE s."Id" = m."Id")'
        )).rowcount

    logger.info("  Delete sweep %s: marked %d deleted (%.2f%% of %d live)",
                obj_name, marked, fraction * 100, live)
    return marked


def sync_object(sf, engine, obj_name, fields, incremental=True, sync_mode="CORE", batch_size=50000):
    logger.info("Syncing %s...", obj_name)
    start_time = time.time()
    rows_read = 0
    rows_inserted = 0
    rows_updated = 0
    api_calls = 0

    # Determine table name – keep lowercase for consistency (but quoted)
    table_name = obj_name[:-3].lower() if obj_name.endswith("__c") else obj_name.lower()
    staging_name = f"{table_name}_staging"

    # ---- Filter usable fields ----
    keep_compound = KEEP_COMPOUND_FIELDS.get(table_name, frozenset())
    usable_fields = []
    for f in fields:
        sf_type = f["type"]
        if sf_type in ("base64", "blob", "address", "location"):
            continue
        if f.get("deprecatedAndHidden", False):
            continue
        if f.get("compoundFieldName") and f["name"] not in keep_compound:
            continue
        usable_fields.append(f)

    if not usable_fields:
        logger.warning("No usable fields for %s, skipping.", obj_name)
        return

    # ---- Ensure main table and staging exist ----
    # Run ensure_table_schema on BOTH tables so newly-added Salesforce fields are
    # applied to the staging table too. The batch temp table is created LIKE staging,
    # so a column missing from staging fails the insert ("column ... does not exist").
    ensure_table_schema(engine, table_name, usable_fields)
    ensure_table_schema(engine, staging_name, usable_fields)
    with engine.begin() as conn:
        conn.execute(text(f'TRUNCATE TABLE "{staging_name}"'))  # clear staging

    # ---- Create indexes (Step 4 + extra FK indexes) ----
    create_indexes(engine, table_name, usable_fields)

    # ---- Add is_deleted column if object has IsDeleted (Step 8) ----
    has_is_deleted = any(f["name"] == "IsDeleted" for f in fields)
    if has_is_deleted:
        with engine.begin() as conn:
            conn.execute(text(f'ALTER TABLE "{table_name}" ADD COLUMN IF NOT EXISTS "IsDeleted" BOOLEAN'))
            conn.execute(text(f'ALTER TABLE "{staging_name}" ADD COLUMN IF NOT EXISTS "IsDeleted" BOOLEAN'))

    # ---- Field chunking ----
    field_names = [f["name"] for f in usable_fields]
    if "Id" not in field_names:
        field_names.append("Id")
    chunks = chunk_fields(field_names, max_chars=18000)

    # ---- Incremental WHERE (Step 7: prefer SystemModstamp) ----
    where_clause = ""
    last_sync = None
    if incremental:
        has_system_mod = any(f["name"] == "SystemModstamp" for f in fields)
        has_last_mod = any(f["name"] == "LastModifiedDate" for f in fields)
        if has_system_mod:
            last_sync = get_last_sync(engine, obj_name)
            if last_sync:
                date_str = sf_date_format(last_sync)
                where_clause = f" WHERE SystemModstamp >= {date_str}"
        elif has_last_mod:
            last_sync = get_last_sync(engine, obj_name)
            if last_sync:
                date_str = sf_date_format(last_sync)
                where_clause = f" WHERE LastModifiedDate >= {date_str}"

    # ---- Determine the timestamp column for change detection (UPDATE optimization) ----
    timestamp_col = None
    if any(f["name"] == "SystemModstamp" for f in fields):
        timestamp_col = "SystemModstamp"
    elif any(f["name"] == "LastModifiedDate" for f in fields):
        timestamp_col = "LastModifiedDate"

    # ---- Buffer and temp table for batched upserts ----
    record_buffer = {}
    total_processed = 0
    max_last_modified = None
    temp_table_name = f"{table_name}_batch_temp"

    def flush_buffer():
        nonlocal record_buffer, total_processed, max_last_modified
        if not record_buffer:
            return
        df_batch = pd.DataFrame.from_dict(record_buffer, orient="index")
        df_batch.reset_index(drop=True, inplace=True)
        if "Id" not in df_batch.columns:
            logger.error("Buffer missing 'Id' column, cannot flush.")
            record_buffer.clear()
            return
        # Track max LastModifiedDate / SystemModstamp for control table
        if timestamp_col and timestamp_col in df_batch.columns:
            max_date = df_batch[timestamp_col].max()
            if max_date and (max_last_modified is None or max_date > max_last_modified):
                max_last_modified = max_date
        # Upsert batch to staging (preserving non‑nulls)
        upsert_batch_to_staging(engine, staging_name, temp_table_name, df_batch)
        total_processed += len(df_batch)
        record_buffer.clear()

    # ---- Process chunks ----
    for chunk in chunks:
        select_clause = ", ".join(chunk)
        soql = f"SELECT {select_clause} FROM {obj_name}{where_clause}"
        if where_clause:
            if "SystemModstamp" in select_clause:
                soql += " ORDER BY SystemModstamp"
            elif "LastModifiedDate" in select_clause:
                soql += " ORDER BY LastModifiedDate"

        logger.info("  Querying chunk of %d fields...", len(chunk))
        result = safe_query(sf, soql)
        api_calls += 1
        records = result["records"]

        while True:
            if records:
                df = pd.DataFrame(records)
                df = clean_dataframe(df, usable_fields)
                if "Id" not in df.columns:
                    logger.warning("    No Id column in this page, skipping.")
                    if result.get("done"):
                        break
                    result = safe_query_more(sf, result["nextRecordsUrl"])
                    api_calls += 1
                    records = result["records"]
                    continue

                # Merge into buffer
                for row in df.itertuples(index=False):
                    rec_id = getattr(row, "Id")
                    if rec_id not in record_buffer:
                        record_buffer[rec_id] = row._asdict()
                    else:
                        for col, val in row._asdict().items():
                            if col != "Id" and val is not None:
                                record_buffer[rec_id][col] = val
                    if len(record_buffer) >= batch_size:
                        flush_buffer()
                        rows_read += batch_size

            if result.get("done"):
                break
            result = safe_query_more(sf, result["nextRecordsUrl"])
            api_calls += 1
            records = result["records"]

    # Final flush
    flush_buffer()
    rows_read = total_processed

    logger.info("  Total records processed: %d", total_processed)

    # ---- UPSERT from staging to main with INSERT / UPDATE split ----
    if total_processed > 0:
        # Create inspector once and reuse
        inspector = inspect(engine)
        staging_cols = [c["name"] for c in inspector.get_columns(staging_name)]

        with engine.begin() as conn:
            # Step 1: Insert new records (where Id not already in main)
            insert_sql = f"""
            INSERT INTO "{table_name}" ("Id", {', '.join(f'"{c}"' for c in staging_cols if c != "Id")})
            SELECT "Id", {', '.join(f'"{c}"' for c in staging_cols if c != "Id")}
            FROM "{staging_name}"
            ON CONFLICT ("Id") DO NOTHING
            """
            result_insert = conn.execute(text(insert_sql))
            rows_inserted = result_insert.rowcount

            # Step 2: Update existing records, but only if timestamp has changed
            update_set_clause = ', '.join(f'"{c}" = staging."{c}"' for c in staging_cols if c != "Id")
            # Build WHERE condition to avoid unnecessary updates
            where_condition = f'main."Id" = staging."Id"'
            if timestamp_col:
                # Only update if the timestamp column differs
                where_condition += f' AND (main."{timestamp_col}" IS DISTINCT FROM staging."{timestamp_col}")'

            update_sql = f"""
            UPDATE "{table_name}" AS main
            SET {update_set_clause}
            FROM "{staging_name}" AS staging
            WHERE {where_condition}
            """
            result_update = conn.execute(text(update_sql))
            rows_updated = result_update.rowcount

            # Count rows in main (optional)
            count = conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar()
            logger.info("Rows in %s after UPSERT = %s", table_name, count)

            # Update last sync timestamp
            if incremental and where_clause and max_last_modified:
                update_last_sync(engine, obj_name, max_last_modified)
                logger.info("  Updated last_sync to %s", max_last_modified)

            # ---- Optional reconciliation ----
            if SF_VALIDATE_COUNTS:
                # Query Salesforce total count
                count_soql = f"SELECT COUNT(Id) FROM {obj_name}"
                sf_count_result = safe_query(sf, count_soql)
                sf_count = sf_count_result["totalSize"] if sf_count_result else 0
                api_calls += 1
                # PostgreSQL count already fetched
                pg_count = count
                log_reconciliation(engine, obj_name, sf_count, pg_count)
                if sf_count == pg_count:
                    logger.info("  ✅ Reconciliation: Salesforce (%d) == PostgreSQL (%d)", sf_count, pg_count)
                else:
                    logger.warning("  ⚠️ Reconciliation: Salesforce (%d) != PostgreSQL (%d)", sf_count, pg_count)

        # Records deleted in Salesforce stop appearing in query() results, so flag
        # anything this full run didn't return. Deliberately OUTSIDE the upsert
        # transaction above -- it opens its own connection and would otherwise
        # block on that transaction's row locks.
        mark_deleted_rows(engine, obj_name, table_name, staging_name, has_is_deleted,
                          incremental, where_clause, total_processed)

    # ---- Do NOT truncate staging at the end – keep it for debugging ----
    # (We truncated at the beginning, so it's empty for the next run)

    # ---- Log ETL run (Step 10) ----
    duration = time.time() - start_time
    log_etl_run(engine, obj_name, rows_read, total_processed, rows_inserted, rows_updated,
                duration, api_calls, sync_mode, batch_size, "SUCCESS")
    logger.info("✅ %s done. Read: %d, Inserted: %d, Updated: %d, Time: %.2f sec, API calls: %d",
                obj_name, rows_read, rows_inserted, rows_updated, duration, api_calls)


# ============================================================
# 19. SALESFORCE REPORT SYNC FUNCTIONS (Historical Trending)
# ============================================================

def get_salesforce_report(sf, report_id):
    """Retrieve a Salesforce report as JSON using the Analytics API."""
    url = f"{sf.base_url}analytics/reports/{report_id}"
    headers = {
        "Authorization": f"Bearer {sf.session_id}",
        "Content-Type": "application/json"
    }
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()

def flatten_report(report):
    """
    Flatten a Historical Trending report into a pandas DataFrame.
    NOTE: This parser assumes a specific structure for Historical Trending reports.
    If your report has a different grouping layout, adjust the parsing logic accordingly.
    """
    detail_columns = report["reportMetadata"]["detailColumns"]
    column_info = report["reportExtendedMetadata"]["detailColumnInfo"]

    labels = []
    for c in detail_columns:
        if c in column_info:
            labels.append(column_info[c]["label"])
        else:
            labels.append(c)

    rows = []
    factmap = report["factMap"]

    for key, value in factmap.items():
        if "rows" not in value:
            continue

        snapshot_date = None
        owner = None

        # Parse grouping values
        parts = key.split("!")

        if len(parts) >= 2:
            g1 = report["groupingsDown"]["groupings"]
            try:
                idx = int(parts[0])
                snapshot_date = g1[idx]["label"]
                if len(parts) > 1:
                    g2 = g1[idx]["groupings"]
                    owner = g2[int(parts[1])]["label"]
            except Exception:
                pass

        for r in value["rows"]:
            record = {}
            record["Snapshot Date"] = snapshot_date
            record["Opportunity Owner"] = owner

            for i, cell in enumerate(r["dataCells"]):
                if i < len(labels):
                    record[labels[i]] = cell.get("label")

            rows.append(record)

    return pd.DataFrame(rows)

def sync_salesforce_report(sf, engine, report_id, table_name):
    """
    Download a Salesforce Historical Trending report and load it into PostgreSQL.
    The table will be replaced (if_exists='replace') on each run.
    """
    logger.info(f"Downloading {table_name} (Report ID: {report_id})")
    try:
        report = get_salesforce_report(sf, report_id)
        df = flatten_report(report)
        logger.info(f"{len(df)} rows retrieved for {table_name}")

        # vw_forecasts / vw_forecast_latest read this table, and to_sql's
        # DROP TABLE has no CASCADE, so the views must go first. Dropped here
        # (not at run start) to keep the views live during the object sync;
        # run_etl.ps1 re-applies sql\03_forecasts.sql after every run.
        with engine.begin() as conn:
            conn.execute(text("DROP VIEW IF EXISTS vw_forecast_latest CASCADE"))
            conn.execute(text("DROP VIEW IF EXISTS vw_forecasts CASCADE"))

        # Replace the table content
        df.to_sql(
            table_name,
            engine,
            if_exists="replace",
            index=False,
            chunksize=5000
        )
        logger.info(f"{table_name} completed successfully.")
    except Exception as e:
        logger.error(f"Error syncing report {table_name}: {e}", exc_info=True)
        raise


FORECAST_VIEWS_SQL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sql", "03_forecasts.sql")


def rebuild_forecast_views(engine):
    """Recreate vw_forecasts / vw_forecast_latest from sql/03_forecasts.sql.

    sync_salesforce_report() drops these views before replacing the report
    tables, so this must run afterwards -- and it must not depend on anything
    outside this process (run_etl.ps1 re-applies the same file via psql as a
    second line of defence, but psql may be missing or fail silently).
    The SQL file is idempotent (DROP VIEW IF EXISTS first).
    """
    with open(FORECAST_VIEWS_SQL, encoding="utf-8") as fh:
        sql = fh.read()
    with engine.begin() as conn:
        # Raw DBAPI cursor with NO parameters: psycopg2 then runs the whole
        # multi-statement script verbatim (no '%' interpolation -- the file
        # has a literal '%' in "Probability (%) (Historical)", and no bind
        # parsing of '::' casts). exec_driver_sql/text() would mangle it.
        with conn.connection.cursor() as cur:
            cur.execute(sql)
    logger.info("Forecast views rebuilt from %s", FORECAST_VIEWS_SQL)

# ============================================================
# 20. MAIN (Steps 1, 15, 16) + REPORT SYNC
# ============================================================

def main():
    logger.info("="*50)
    logger.info(" SALESFORCE -> POSTGRESQL")
    logger.info("="*50)

    sf = connect_salesforce()
    engine = connect_postgresql()

    # Create control and metadata tables
    if SF_INCREMENTAL:
        ensure_control_table(engine)
    create_metadata_tables(engine)

    # Determine which objects to sync (Step 16)
    if SYNC_MODE == "CORE":
        objects = CORE_OBJECTS
    else:  # ALL
        logger.info("Retrieving all queryable objects...")
        describe_all = sf.describe()["sobjects"]
        objects = [o["name"] for o in describe_all if o["queryable"]]
        logger.info("Found %d objects.", len(objects))

    # Sync metadata once (Steps 5 & 6)
    sync_objects_metadata(sf, engine)
    sync_fields_metadata(sf, engine, objects)
    sync_relationships(sf, engine, objects)

    # Sync order (Step 15)
    order = [
        "User",
        "Account",
        "Contact",
        "Lead",
        "Product2",
        "Opportunity",
        "Quote",
        "QuoteLineItem",
        "OpportunityLineItem",
        "Task",
        "Event",
    ]
    custom_objs = [o for o in objects if o.endswith("__c") and o not in order]
    ordered_objects = [o for o in order if o in objects] + custom_objs + [o for o in objects if o not in order and o not in custom_objs]

    success = 0
    failed = 0
    for obj_name in ordered_objects:
        try:
            logger.info("Processing %s...", obj_name)
            obj_describe = getattr(sf, obj_name).describe()
            fields = obj_describe["fields"]
            sync_object(sf, engine, obj_name, fields, incremental=SF_INCREMENTAL,
                        sync_mode=SYNC_MODE, batch_size=BATCH_SIZE)
            success += 1
        except Exception as e:
            logger.error("❌ ERROR processing %s: %s", obj_name, e, exc_info=True)
            # Log error in etl_log
            log_etl_run(engine, obj_name, 0, 0, 0, 0, 0, 0, SYNC_MODE, BATCH_SIZE, "FAILED", str(e))
            failed += 1

    # ---- Sync Historical Trending Reports after all objects ----
    logger.info("="*50)
    logger.info(" SYNCING HISTORICAL TRENDING REPORTS")
    logger.info("="*50)
    try:
        try:
            sync_salesforce_report(sf, engine, "00Ofu000006f1pVEAQ", "forecasts_bi_mrm_cps_north")
        except Exception as e:
            logger.error("Failed to sync north report: %s", e)
            failed += 1

        try:
            sync_salesforce_report(sf, engine, "00Ofu000005vp1JEAQ", "forecasts_bi_mrm_cps_south")
        except Exception as e:
            logger.error("Failed to sync south report: %s", e)
            failed += 1
    finally:
        # The report syncs drop the forecast views; put them back no matter
        # what happened above (the app's Last Month page 500s without them).
        try:
            rebuild_forecast_views(engine)
        except Exception as e:
            logger.error("Failed to rebuild forecast views: %s", e, exc_info=True)
            failed += 1

    logger.info("="*50)
    logger.info("ETL finished: %d succeeded, %d failed.", success, failed)
    logger.info("="*50)


if __name__ == "__main__":
    main()