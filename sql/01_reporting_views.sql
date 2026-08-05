-- =====================================================================
-- Sieger Sales Intelligence Platform
-- 01_reporting_views.sql
-- Reporting layer over the Salesforce -> Postgres replica (salesforce_db_v2)
--
-- Rebuilds the datasets that lived inside the "MRM CPS - N2" Power BI model
-- as SQL so the React/FastAPI app can query them directly.
--
-- Conventions:
--   * Base tables are lowercase, quoted; columns keep Salesforce casing ("Id").
--   * Custom object Visit_Plan_Allocation__c -> table visit_plan_allocation.
--   * India financial year = April -> March.
--   * These views are PURE facts keyed by owner_id. They do NOT contain
--     Region or per-user security -- the API layer adds both:
--       - Region  : joined from app.user_region (maintained in the admin panel)
--       - Security: fn_subordinate_user_ids(<logged in user>) -> owner_id IN (...)
--
-- Idempotent: safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Clean slate (CASCADE so dependent views drop too)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS vw_sales_tracker            CASCADE;
DROP VIEW IF EXISTS vw_earliest_quotes_by_month CASCADE;
DROP VIEW IF EXISTS vw_lead_conversion          CASCADE;
DROP VIEW IF EXISTS vw_leads                     CASCADE;
DROP VIEW IF EXISTS vw_visit_plan_allocation     CASCADE;
DROP VIEW IF EXISTS vw_quote_line_item           CASCADE;
DROP VIEW IF EXISTS vw_quote                      CASCADE;
DROP VIEW IF EXISTS vw_opportunity                CASCADE;

-- =====================================================================
-- 1. INDIA FINANCIAL YEAR HELPERS  (FY runs Apr 1 -> Mar 31)
-- =====================================================================
CREATE OR REPLACE FUNCTION sieger_fy_start_year(d date) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN d IS NULL THEN NULL
                WHEN EXTRACT(MONTH FROM d) >= 4 THEN EXTRACT(YEAR FROM d)::int
                ELSE EXTRACT(YEAR FROM d)::int - 1 END
$$;

-- e.g. 2025-05-10 -> 'FY25-26'
CREATE OR REPLACE FUNCTION sieger_fy_label(d date) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN d IS NULL THEN NULL
        ELSE 'FY' || RIGHT(sieger_fy_start_year(d)::text, 2)
                  || '-' || RIGHT((sieger_fy_start_year(d) + 1)::text, 2) END
$$;

-- Financial quarter 1..4  (Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar)
CREATE OR REPLACE FUNCTION sieger_fq(d date) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN d IS NULL THEN NULL
        ELSE (((EXTRACT(MONTH FROM d)::int + 8) % 12) / 3) + 1 END
$$;

CREATE OR REPLACE FUNCTION sieger_fq_label(d date) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN d IS NULL THEN NULL ELSE 'Q' || sieger_fq(d) END
$$;

-- =====================================================================
-- 2. SECURITY: hierarchy resolution (self + all descendants)
--    Uses user.ManagerId. NOTE: only 131/184 users have a ManagerId, so
--    this tree is partial until the Salesforce UserRole hierarchy is
--    synced (recommended). The API layer adds a CEO/full-access override.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_subordinate_user_ids(p_user_id text)
RETURNS TABLE(user_id text) LANGUAGE sql STABLE AS $$
    WITH RECURSIVE t AS (
        SELECT "Id" FROM "user" WHERE "Id" = p_user_id
        UNION ALL
        SELECT u."Id" FROM "user" u JOIN t ON u."ManagerId" = t."Id"
    )
    SELECT "Id" FROM t
$$;

-- =====================================================================
-- 3. ENRICHED FACT VIEWS  (owner-keyed; Region added by the API)
-- =====================================================================

-- 3a. Opportunity ------------------------------------------------------
CREATE OR REPLACE VIEW vw_opportunity AS
SELECT
    o."Id"                                   AS opportunity_id,
    o."Name"                                 AS opportunity_name,
    o."OwnerId"                              AS owner_id,
    u."Name"                                 AS user_name,          -- Opportunity.UserName
    o."AccountId"                            AS account_id,
    COALESCE(a."Name", a."Site", a."Contact_Name__c")  AS account_name,  -- Opportunity.Acc name
    o."StageName"                            AS stage_name,
    o."IsClosed"                             AS is_closed,
    o."IsWon"                                AS is_won,
    (o."IsClosed" IS NOT TRUE)               AS is_open,
    (o."StageName" = 'Dropped')              AS is_dropped,
    (o."StageName" = 'Hold')                 AS is_hold,
    o."CloseDate"                            AS close_date,
    o."CreatedDate"                          AS created_date,
    (o."CreatedDate")::date                  AS created_date_only,  -- Opportunity.Created Date Only
    o."Opportunity_Amount__c"                AS opportunity_amount, -- Opportunity.Opportunity_Amount__c
    o."Amount"                               AS amount,
    o."Probability"                          AS probability,
    o."Division__c"                          AS division,
    o."building_construction_stage__c"       AS building_construction_stage,
    o."Project_stage__c"                     AS project_stage,
    o."Remarks__c"                           AS remarks,
    ck.checkin_opp                           AS latest_checkin_opp,  -- DAX: LatestCheckin - Opp
    ck.checkin_acc                           AS latest_checkin_acc,  -- DAX: LatestCheckin - Acc
    o."LastActivityDate"                     AS last_activity_date,
    -- DAX DaysSinceLastActivity = DATEDIFF(MAX(checkin opp, checkin acc), TODAY()).
    -- A blank date behaves as the 1899-12-30 epoch in DAX, so never-visited
    -- opportunities yield a huge day count and pass the "> 30" No Visits filter.
    (CURRENT_DATE - COALESCE(GREATEST(ck.checkin_opp, ck.checkin_acc)::date, DATE '1899-12-30'))
                                             AS days_since_last_activity,
    lt.subject                               AS latest_action_task,     -- Opportunity.Latest Action task
    lt.activity_date                         AS action_activity_date,   -- Opportunity.Action activity date
    EXISTS (SELECT 1 FROM quote q WHERE q."OpportunityId" = o."Id"
              AND q."Sync_Quote__c" IS TRUE) AS has_synced_quote,
    EXISTS (SELECT 1 FROM quote q WHERE q."OpportunityId" = o."Id"
              AND q."Sync_Quote__c" IS TRUE AND UPPER(q."Status") = 'ACCEPTED') AS has_accepted_quote,
    sieger_fy_label(o."CloseDate")           AS close_fy_label,
    sieger_fq_label(o."CloseDate")           AS close_fq_label,
    sieger_fy_label((o."CreatedDate")::date) AS created_fy_label
FROM opportunity o
JOIN "user" u          ON u."Id" = o."OwnerId"
LEFT JOIN account a    ON a."Id" = o."AccountId"
LEFT JOIN LATERAL (
    -- LatestCheckin - Opp / Acc (exact DAX: MAX VPA CheckInDate per opp / account)
    SELECT MAX(vp."CheckInDate__c") FILTER (WHERE vp."Opportunity__c" = o."Id")    AS checkin_opp,
           MAX(vp."CheckInDate__c") FILTER (WHERE vp."Account__c" = o."AccountId") AS checkin_acc
    FROM visit_plan_allocation vp
    WHERE (vp."Opportunity__c" = o."Id" OR vp."Account__c" = o."AccountId")
      AND vp."IsDeleted" IS NOT TRUE
) ck ON TRUE
LEFT JOIN LATERAL (
    -- Exact DAX: newest action PLAN by CreatedDate -> its newest TASK by
    -- CreatedDate -> that task's Next_Action__c; activity date = MAX(ActivityDate)
    -- among the plan's tasks sharing that Next_Action__c.
    SELECT t."Next_Action__c" AS subject,
           (SELECT MAX(t3."LabsActionPlans__ActivityDate__c")
              FROM labsactionplans__aptask t3
             WHERE t3."LabsActionPlans__Action_Plan__c" = t."LabsActionPlans__Action_Plan__c"
               AND t3."Next_Action__c" = t."Next_Action__c"
               AND t3."IsDeleted" IS NOT TRUE) AS activity_date
    FROM (SELECT ap."Id"
            FROM labsactionplans__actionplan ap
           WHERE ap."LabsActionPlans__Opportunity__c" = o."Id" AND ap."IsDeleted" IS NOT TRUE
           ORDER BY ap."CreatedDate" DESC LIMIT 1) p
    JOIN labsactionplans__aptask t
      ON t."LabsActionPlans__Action_Plan__c" = p."Id" AND t."IsDeleted" IS NOT TRUE
    ORDER BY t."CreatedDate" DESC
    LIMIT 1
) lt ON TRUE
WHERE o."IsDeleted" IS NOT TRUE;

-- 3b. Quote ------------------------------------------------------------
CREATE OR REPLACE VIEW vw_quote AS
SELECT
    q."Id"                AS quote_id,
    q."Name"              AS quote_name,
    q."QuoteNumber"       AS quote_number,
    q."Status"            AS status,
    q."OpportunityId"     AS opportunity_id,
    q."OwnerId"           AS owner_id,
    u."Name"              AS user_name,
    o."StageName"         AS opp_stage_name,
    o."Name"              AS opportunity_name,
    q."TotalPrice"        AS total_price,
    q."GrandTotal"        AS grand_total,
    q."CreatedDate"       AS created_date,
    (q."CreatedDate")::date AS created_date_only,
    q."Presented_Date__c" AS presented_date,
    (q."Status" IN ('In Review','Presented','Negotiation')) AS is_open_quote,
    (q."Status" IN ('Presented','Negotiation'))             AS is_live_quote,
    (q."Status" = 'Rejected')                               AS is_lost_quote,
    (q."Status" = 'Accepted')                               AS is_accepted_quote,
    sieger_fy_label((q."CreatedDate")::date) AS created_fy_label
FROM quote q
LEFT JOIN opportunity o ON o."Id" = q."OpportunityId"
LEFT JOIN "user" u      ON u."Id" = q."OwnerId"
WHERE q."IsDeleted" IS NOT TRUE;

-- 3c. Quote Line Item  (the money grain used by most report tables) -----
CREATE OR REPLACE VIEW vw_quote_line_item AS
SELECT
    qli."Id"              AS quote_line_item_id,
    qli."QuoteId"         AS quote_id,
    q."OpportunityId"     AS opportunity_id,
    o."Name"              AS opportunity_name,
    o."OwnerId"           AS owner_id,
    u."Name"              AS user_name,
    COALESCE(a."Name", a."Site", a."Contact_Name__c") AS account_name,
    a."BillingCity"       AS billing_city,
    qli."Product_Name__c" AS product_name,
    qli."Quantity"        AS quantity,
    qli."TotalPrice"      AS total_price,
    qli."UnitPrice"       AS unit_price,
    o."StageName"         AS stage_name,
    o."IsWon"             AS is_won,
    o."IsClosed"          AS is_closed,
    (o."IsClosed" IS NOT TRUE) AS is_open,
    (o."StageName" = 'Dropped') AS is_dropped,
    o."Division__c"       AS division,
    o."Opportunity_Amount__c" AS opportunity_amount,
    o."Remarks__c"        AS remarks,
    o."CloseDate"         AS close_date,
    sieger_fy_label(o."CloseDate") AS close_fy_label,
    o."Probability"       AS probability,          -- report's "Quote Line Item.Probability" = Opportunity.Probability
    ck.checkin_opp        AS latest_checkin_opp,
    ck.checkin_acc        AS latest_checkin_acc,
    o."LastActivityDate"  AS last_activity_date,
    -- DAX DaysSinceLastActivity: days since latest check-in; blank -> 1899 epoch
    (CURRENT_DATE - COALESCE(GREATEST(ck.checkin_opp, ck.checkin_acc)::date, DATE '1899-12-30'))
                          AS days_since_last_activity,
    o."Project_stage__c"  AS project_stage,
    o."building_construction_stage__c" AS building_construction_stage,
    lt.subject            AS latest_action_task,
    lt.activity_date      AS action_activity_date,
    q."Status"            AS quote_status,
    q."Sync_Quote__c"     AS sync_quote,
    q."Presented_Date__c" AS presented_date,
    o."Loss_Reason__c"    AS loss_reason
FROM quotelineitem qli
JOIN quote q            ON q."Id" = qli."QuoteId"
LEFT JOIN opportunity o ON o."Id" = q."OpportunityId"
LEFT JOIN "user" u      ON u."Id" = o."OwnerId"
LEFT JOIN account a     ON a."Id" = o."AccountId"
LEFT JOIN LATERAL (
    -- LatestCheckin - Opp / Acc (exact DAX)
    SELECT MAX(vp."CheckInDate__c") FILTER (WHERE vp."Opportunity__c" = o."Id")    AS checkin_opp,
           MAX(vp."CheckInDate__c") FILTER (WHERE vp."Account__c" = o."AccountId") AS checkin_acc
    FROM visit_plan_allocation vp
    WHERE (vp."Opportunity__c" = o."Id" OR vp."Account__c" = o."AccountId")
      AND vp."IsDeleted" IS NOT TRUE
) ck ON TRUE
LEFT JOIN LATERAL (
    -- Exact DAX: newest plan -> newest task -> Next_Action__c + its MAX ActivityDate
    SELECT t."Next_Action__c" AS subject,
           (SELECT MAX(t3."LabsActionPlans__ActivityDate__c")
              FROM labsactionplans__aptask t3
             WHERE t3."LabsActionPlans__Action_Plan__c" = t."LabsActionPlans__Action_Plan__c"
               AND t3."Next_Action__c" = t."Next_Action__c"
               AND t3."IsDeleted" IS NOT TRUE) AS activity_date
    FROM (SELECT ap."Id"
            FROM labsactionplans__actionplan ap
           WHERE ap."LabsActionPlans__Opportunity__c" = o."Id" AND ap."IsDeleted" IS NOT TRUE
           ORDER BY ap."CreatedDate" DESC LIMIT 1) p
    JOIN labsactionplans__aptask t
      ON t."LabsActionPlans__Action_Plan__c" = p."Id" AND t."IsDeleted" IS NOT TRUE
    ORDER BY t."CreatedDate" DESC
    LIMIT 1
) lt ON TRUE
WHERE qli."IsDeleted" IS NOT TRUE;

-- 3d. Lead -------------------------------------------------------------
--     lead."City"/"State" are synced via the ETL's KEEP_COMPOUND_FIELDS keep-list.
CREATE OR REPLACE VIEW vw_leads AS
SELECT
    l."Id"           AS lead_id,
    l."Name"         AS lead_name,
    l."Company"      AS company,
    l."City"         AS city,
    l."Email"        AS email,
    l."MobilePhone"  AS mobile_phone,
    l."LeadSource"   AS lead_source,
    l."Status"       AS status,
    l."IsConverted"  AS is_converted,
    l."ConvertedDate" AS converted_date,
    l."OwnerId"      AS owner_id,
    u."Name"         AS user_name,
    l."CreatedDate"  AS created_date
FROM lead l
LEFT JOIN "user" u ON u."Id" = l."OwnerId"
WHERE l."IsDeleted" IS NOT TRUE;

-- 3e. Visit Plan Allocation (visits) -----------------------------------
CREATE OR REPLACE VIEW vw_visit_plan_allocation AS
SELECT
    v."Id"                 AS vpa_id,
    v."OwnerId"            AS owner_id,
    u."Name"              AS user_name,
    v."Account__c"         AS account_id,
    v."Opportunity__c"     AS opportunity_id,
    v."Lead__c"            AS lead_id,
    v."VisitDateTime__c"   AS visit_datetime,
    (v."VisitDateTime__c")::date AS visit_date_only,
    v."Status__c"          AS status,
    v."CheckInDate__c"     AS checkin_date
FROM visit_plan_allocation v
LEFT JOIN "user" u ON u."Id" = v."OwnerId"
WHERE v."IsDeleted" IS NOT TRUE;

-- =====================================================================
-- 4. EARLIEST QUOTES BY MONTH  (per user decision 2026-08-05: STRICT created
--    date -- the pbix DAX picked the quote by Presented_Date; the app picks
--    the FIRST-CREATED quote per opportunity and dates it by that month).
--      * earliest_quote_date = MIN(Quote.Created_Date__c)
--      * value / owner / product / qty come from the first-created quote
-- =====================================================================
CREATE OR REPLACE VIEW vw_earliest_quotes_by_month AS
WITH sp_quotes AS (   -- quotes whose opportunity is in the Sieger Parking division
    SELECT q."Id", q."OpportunityId", q."OwnerId", q."TotalPrice",
           q."Created_Date__c", q."Presented_Date__c",
           o."Name" AS opp_name, o."StageName" AS opp_stage, o."Division__c" AS opp_division
    FROM quote q
    JOIN opportunity o ON o."Id" = q."OpportunityId"
    WHERE q."IsDeleted" IS NOT TRUE AND o."IsDeleted" IS NOT TRUE
      AND q."OpportunityId" IS NOT NULL),
per_opp AS (          -- one row per opp: earliest CREATED date (the drill date)
    SELECT "OpportunityId",
           MIN("Created_Date__c") AS earliest_created,
           MAX(opp_name)  AS opp_name,
           MAX(opp_stage) AS opp_stage,
           MAX(opp_division) AS opp_division
    FROM sp_quotes GROUP BY "OpportunityId"
),
first_created AS (    -- the FIRST quote per opp, strictly by Created_Date__c
    SELECT DISTINCT ON ("OpportunityId")
           "OpportunityId", "Id" AS quote_id, "OwnerId", "TotalPrice"
    FROM sp_quotes
    ORDER BY "OpportunityId", "Created_Date__c" ASC NULLS LAST, "Id"
)
SELECT
    po."OpportunityId"           AS opportunity_id,
    po.opp_name                  AS opportunity_name,
    po.opp_stage                 AS opp_stage,
    po.opp_division              AS division,
    ep."OwnerId"                 AS owner_id,
    u."Name"                     AS user_name,
    ep."TotalPrice"              AS quote_value,
    ql.product_name,
    ql.quantity,
    po.earliest_created          AS earliest_quote_date,
    sieger_fy_label(po.earliest_created) AS fy_label
FROM per_opp po
JOIN first_created ep ON ep."OpportunityId" = po."OpportunityId"
LEFT JOIN "user" u ON u."Id" = ep."OwnerId"
LEFT JOIN LATERAL (
    SELECT MAX(qli."Product_Name__c") AS product_name, SUM(qli."Quantity") AS quantity
    FROM quotelineitem qli
    WHERE qli."QuoteId" = ep.quote_id AND qli."IsDeleted" IS NOT TRUE
) ql ON TRUE;

-- =====================================================================
-- 5. SALES TRACKER  (hero KPI matrix: owner x month) -- FAITHFUL to the DAX.
--    Every measure filters Quote.Sync_Quote__c = TRUE and (mostly)
--    Opportunity.Division__c = 'Sieger Parking', and is dated by its own field.
--      visits                count(VPA) excl. non-selling purposes, by Check_In_Time__c
--      opportunities_created count(opp) by CreatedDate
--      quotes_created        count(quote) by Created_Date__c
--      open_quotes_value     SUM(QLI.TotalPrice) synced+open on live Sieger Parking opps, by Quote.Created_Date__c
--      new_quotes_value      SUM(first-created-quote value per opp), by that quote's created month
--      closed_won_value      SUM(Opp Amount) Closed Won + Sieger Parking + ACCEPTED synced quote, by CloseDate
--      closed_lost_value     SUM(Opp Amount) Closed Lost + synced quote, by CloseDate
--      dropped_value         SUM(Opp Amount) Dropped + synced quote, by CloseDate
-- =====================================================================
CREATE OR REPLACE VIEW vw_sales_tracker AS
WITH facts AS (
    -- Visits: real customer visits (has check-in, purpose is not internal/admin)
    SELECT v."OwnerId" AS owner_id,
           date_trunc('month', v."Check_In_Time__c")::date AS ym,
           ov."Division__c" AS division,
           'visits'::text AS m, 1::numeric AS v
    FROM visit_plan_allocation v
    LEFT JOIN opportunity ov ON ov."Id" = v."Opportunity__c"
    WHERE v."IsDeleted" IS NOT TRUE AND v."Check_In_Time__c" IS NOT NULL
      AND UPPER(COALESCE(v."Purpose_of_Travel__c", '')) NOT IN
          ('HO VISIT','BRANCH OFFICE VISIT','REVIEW MEETING','EXHIBITION',
           'TRAVEL','WORK FROM HOME','TRAINING')

    UNION ALL
    -- Opportunities created
    SELECT o."OwnerId", date_trunc('month', o."CreatedDate")::date, o."Division__c",
           'opportunities_created', 1
    FROM opportunity o
    WHERE o."IsDeleted" IS NOT TRUE AND o."CreatedDate" IS NOT NULL

    UNION ALL
    -- Open Quotes Value: QLI TotalPrice for open, synced quotes on live Sieger Parking opps
    SELECT q."OwnerId", date_trunc('month', q."Created_Date__c")::date, o."Division__c",
           'open_quotes_value', COALESCE(qli."TotalPrice", 0)
    FROM quotelineitem qli
    JOIN quote q       ON q."Id" = qli."QuoteId"
    JOIN opportunity o ON o."Id" = q."OpportunityId"
    WHERE qli."IsDeleted" IS NOT TRUE AND q."IsDeleted" IS NOT TRUE
      AND q."Sync_Quote__c" IS TRUE
      AND UPPER(q."Status") NOT IN ('REJECTED','ACCEPTED')      AND UPPER(o."StageName") NOT IN ('CLOSED LOST','CLOSED WON','DROPPED')
      AND q."Created_Date__c" IS NOT NULL

    UNION ALL
    -- New Quotes Value: the FIRST-created quote's value per opportunity, in the
    -- month that quote was created (user decision 2026-08-05: replaces the pbix
    -- "Live Quote Value" -- no live/synced status condition).
    SELECT e.owner_id, date_trunc('month', e.earliest_quote_date)::date, e.division,
           'new_quotes_value', COALESCE(e.quote_value, 0)
    FROM vw_earliest_quotes_by_month e
    WHERE e.earliest_quote_date IS NOT NULL

    UNION ALL
    -- Quotes Created: count of quotes by their created month (like opps created)
    SELECT q."OwnerId", date_trunc('month', q."Created_Date__c")::date, o."Division__c",
           'quotes_created', 1
    FROM quote q
    LEFT JOIN opportunity o ON o."Id" = q."OpportunityId"
    WHERE q."IsDeleted" IS NOT TRUE AND q."Created_Date__c" IS NOT NULL

    UNION ALL
    -- Closed Won Value: Sieger Parking won opps with an ACCEPTED synced quote
    SELECT o."OwnerId", date_trunc('month', o."CloseDate")::date, o."Division__c",
           'closed_won_value', COALESCE(o."Opportunity_Amount__c", 0)
    FROM opportunity o
    WHERE o."IsDeleted" IS NOT TRUE AND o."CloseDate" IS NOT NULL
      AND o."StageName" = 'Closed Won'      AND EXISTS (SELECT 1 FROM quote q WHERE q."OpportunityId" = o."Id"
                    AND UPPER(q."Status") = 'ACCEPTED' AND q."Sync_Quote__c" IS TRUE)

    UNION ALL
    -- Closed Lost Value: Closed Lost opps that have a synced quote
    SELECT o."OwnerId", date_trunc('month', o."CloseDate")::date, o."Division__c",
           'closed_lost_value', COALESCE(o."Opportunity_Amount__c", 0)
    FROM opportunity o
    WHERE o."IsDeleted" IS NOT TRUE AND o."CloseDate" IS NOT NULL
      AND o."StageName" = 'Closed Lost'
      AND EXISTS (SELECT 1 FROM quote q WHERE q."OpportunityId" = o."Id" AND q."Sync_Quote__c" IS TRUE)

    UNION ALL
    -- Dropped Value: Dropped opps that have a synced quote
    SELECT o."OwnerId", date_trunc('month', o."CloseDate")::date, o."Division__c",
           'dropped_value', COALESCE(o."Opportunity_Amount__c", 0)
    FROM opportunity o
    WHERE o."IsDeleted" IS NOT TRUE AND o."CloseDate" IS NOT NULL
      AND o."StageName" = 'Dropped'
      AND EXISTS (SELECT 1 FROM quote q WHERE q."OpportunityId" = o."Id" AND q."Sync_Quote__c" IS TRUE)
)
SELECT
    f.owner_id,
    u."Name"                     AS user_name,
    f.ym                         AS month_start,
    f.division                   AS division,
    sieger_fy_label(f.ym)        AS fy_label,
    sieger_fq_label(f.ym)        AS fq_label,
    to_char(f.ym, 'YYYY-MM')     AS year_month,
    SUM(f.v) FILTER (WHERE f.m = 'visits')                AS visits,
    SUM(f.v) FILTER (WHERE f.m = 'opportunities_created') AS opportunities_created,
    SUM(f.v) FILTER (WHERE f.m = 'quotes_created')        AS quotes_created,
    SUM(f.v) FILTER (WHERE f.m = 'open_quotes_value')     AS open_quotes_value,
    SUM(f.v) FILTER (WHERE f.m = 'new_quotes_value')      AS new_quotes_value,
    SUM(f.v) FILTER (WHERE f.m = 'closed_won_value')      AS closed_won_value,
    SUM(f.v) FILTER (WHERE f.m = 'closed_lost_value')     AS closed_lost_value,
    SUM(f.v) FILTER (WHERE f.m = 'dropped_value')         AS dropped_value
FROM facts f
JOIN "user" u ON u."Id" = f.owner_id
WHERE f.ym IS NOT NULL
GROUP BY f.owner_id, u."Name", f.ym, f.division;

-- =====================================================================
-- 6. LEAD CONVERSION  (card + by-source donut on the Leads page)
-- =====================================================================
CREATE OR REPLACE VIEW vw_lead_conversion AS
SELECT
    l."OwnerId"                                    AS owner_id,
    u."Name"                                       AS user_name,
    l."LeadSource"                                 AS lead_source,
    l."Status"                                     AS status,
    COUNT(*)                                       AS total_leads,
    COUNT(*) FILTER (WHERE UPPER(l."Status") = 'QUALIFIED') AS converted_leads,
    ROUND(
        COUNT(*) FILTER (WHERE UPPER(l."Status") = 'QUALIFIED')::numeric
        / NULLIF(COUNT(*), 0) * 100, 2)            AS conversion_ratio_pct
FROM lead l
LEFT JOIN "user" u ON u."Id" = l."OwnerId"
WHERE l."IsDeleted" IS NOT TRUE
GROUP BY l."OwnerId", u."Name", l."LeadSource", l."Status";
