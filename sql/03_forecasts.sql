-- =====================================================================
-- 03_forecasts.sql
-- Rebuilds the Power BI "Forecasts for BI MRM CPS" table from the two
-- Salesforce Historical-Trending reports already loaded into Postgres:
--   forecasts_bi_mrm_cps_south  (report 00Ofu000005vp1JEAQ)
--   forecasts_bi_mrm_cps_north  (report 00Ofu000006f1pVEAQ)
-- Power BI = Table.Combine({SOUTH, NORTH}) -> here a UNION ALL.
-- Source columns are all text: dates are DD/MM/YYYY, amounts "INR 1,60,00,000.00".
-- =====================================================================
DROP VIEW IF EXISTS vw_forecast_latest CASCADE;
DROP VIEW IF EXISTS vw_forecasts       CASCADE;

-- Combined Forecasts table (South + North), typed.
CREATE OR REPLACE VIEW vw_forecasts AS
SELECT
    'South'::text                                          AS forecast_region,
    "Opportunity Name"                                     AS opportunity_name,
    "Opportunity Owner"                                    AS owner_name,
    "Account Name: Account Name"                           AS account_name,
    to_date(NULLIF("Snapshot Date", ''), 'DD/MM/YYYY')     AS snapshot_date,
    to_date(NULLIF("Close Date", ''), 'DD/MM/YYYY')        AS close_date,
    to_date(NULLIF("Close Date (Historical)", ''), 'DD/MM/YYYY') AS close_date_historical,
    "Stage"                                                AS stage,
    "Stage (Historical)"                                   AS stage_historical,
    NULLIF(regexp_replace(COALESCE("Amount (Historical)", ''), '[^0-9.]', '', 'g'), '')::numeric AS amount_historical,
    NULLIF(regexp_replace(COALESCE("Opportunity Amount", ''), '[^0-9.]', '', 'g'), '')::numeric  AS opportunity_amount,
    "Probability (%) (Historical)"                         AS probability_historical,
    "Synced Quote: Quote Name"                             AS synced_quote_name
FROM forecasts_bi_mrm_cps_south
UNION ALL
SELECT
    'North'::text,
    "Opportunity Name", "Opportunity Owner", "Account Name: Account Name",
    to_date(NULLIF("Snapshot Date", ''), 'DD/MM/YYYY'),
    to_date(NULLIF("Close Date", ''), 'DD/MM/YYYY'),
    to_date(NULLIF("Close Date (Historical)", ''), 'DD/MM/YYYY'),
    "Stage", "Stage (Historical)",
    NULLIF(regexp_replace(COALESCE("Amount (Historical)", ''), '[^0-9.]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(COALESCE("Opportunity Amount", ''), '[^0-9.]', '', 'g'), '')::numeric,
    "Probability (%) (Historical)", "Synced Quote: Quote Name"
FROM forecasts_bi_mrm_cps_north;

-- Latest snapshot per opportunity -> the Power BI "Close Date (Historical)" value.
CREATE OR REPLACE VIEW vw_forecast_latest AS
SELECT DISTINCT ON (opportunity_name)
    opportunity_name,
    snapshot_date,
    close_date_historical,
    close_date,
    stage_historical,
    amount_historical,
    probability_historical,
    forecast_region
FROM vw_forecasts
WHERE snapshot_date IS NOT NULL
ORDER BY opportunity_name, snapshot_date DESC, close_date_historical DESC NULLS LAST;
