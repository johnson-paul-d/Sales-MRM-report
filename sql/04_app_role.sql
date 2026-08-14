-- =====================================================================
-- 04_app_role.sql
-- Least-privilege login role for the backend API. Today the API connects
-- as the `postgres` superuser over the tailnet; this role can only read
-- the replicated Salesforce data and write the app's own schema.
--
-- Apply (idempotent), as postgres:
--     psql -d salesforce_db_v2 -f sql/04_app_role.sql
--
-- Then, OUT-OF-BAND (never commit a password to this public repo):
--     ALTER ROLE sieger_app PASSWORD '<strong generated password>';
--
-- To switch the API over:
--   1. Set PG_USERNAME=sieger_app / PG_PASSWORD=<password> in backend env
--      (Render env vars for prod; root .env stays postgres for the ETL).
--   2. Tighten pg_hba.conf: change the tailnet line to the app role only:
--        host salesforce_db_v2 sieger_app 100.64.0.0/10 scram-sha-256
--      (drops superuser-over-tailnet entirely), then reload Postgres.
--   3. The ETL keeps running locally as postgres and is unaffected.
-- =====================================================================

DO $$
BEGIN
    CREATE ROLE sieger_app LOGIN;
EXCEPTION WHEN duplicate_object THEN
    NULL;  -- role already exists; grants below re-apply harmlessly
END $$;

GRANT CONNECT ON DATABASE salesforce_db_v2 TO sieger_app;

-- Replicated Salesforce data + reporting views: read-only.
GRANT USAGE ON SCHEMA public TO sieger_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sieger_app;
-- ETL runs as postgres and drops/recreates tables each run; make sure the
-- recreated ones stay readable without re-running this script.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT SELECT ON TABLES TO sieger_app;

-- App-owned schema (logins, regions, targets): full DML.
GRANT USAGE, CREATE ON SCHEMA app TO sieger_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO sieger_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO sieger_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sieger_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app
    GRANT USAGE, SELECT ON SEQUENCES TO sieger_app;
