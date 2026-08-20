-- =====================================================================
-- 05_attendance.sql
-- vw_attendance: one row per user per day, replicating the Power BI
-- "ActivitySummary" calculated table.
--
-- Sources
--   activity_tracker        Start Work / End Work stamps + travel distance
--   visit_plan_allocation   check-in/out, purpose, customer, co-visits
--
-- Notes on fidelity to the DAX
--   * Times are stored UTC and converted with AT TIME ZONE 'Asia/Kolkata'
--     (the DAX used pre-converted *_IST columns).
--   * Co-visit credit ("User_Name = X OR Visiting_With = X") matches on
--     Salesforce Id: Visiting_With__c holds Ids, not names.
--   * Distance__c is free text. Measured shapes: "54.3 km" (25,186),
--     "58 m" (3,712 -- METRES), "1,244 km" (66 -- thousands separator),
--     bare "93" (29). Naive parsing totals 700,206 km vs 772,558 correct,
--     which would move people across the 150/1000 km speed thresholds.
--   * Remarks1: the DAX counted purposes with YEAR = 2025 while selecting
--     YEAR IN {2025, 2026}, so every 2026 row rendered "0 - <purpose>".
--     Fixed here to count within the same day being reported.
-- =====================================================================

-- Company holidays, seeded from the hardcoded list in the DAX. Editable so
-- future holidays do not silently show up as "Mismatch" for everyone.
CREATE TABLE IF NOT EXISTS app.holiday (
    holiday_date date PRIMARY KEY,
    name         text,
    created_at   timestamptz DEFAULT now()
);
INSERT INTO app.holiday (holiday_date, name) VALUES
    (DATE '2025-10-01', 'Holiday'),
    (DATE '2025-10-02', 'Holiday'),
    (DATE '2025-10-20', 'Holiday'),
    (DATE '2025-10-21', 'Holiday'),
    (DATE '2025-10-22', 'Holiday'),
    (DATE '2026-01-14', 'Holiday'),
    (DATE '2026-01-15', 'Holiday')
ON CONFLICT (holiday_date) DO NOTHING;

DROP VIEW IF EXISTS vw_attendance CASCADE;

CREATE OR REPLACE VIEW vw_attendance AS
WITH
-- ---------- Activity Tracker, normalised to IST + parsed kilometres ----------
tracker AS (
    SELECT a."OwnerId"                                              AS owner_id,
           a."Activity_Type__c"                                     AS activity_type,
           (a."DateTime__c"  AT TIME ZONE 'Asia/Kolkata')           AS dt_ist,
           (a."DateTime__c"  AT TIME ZONE 'Asia/Kolkata')::date     AS dt_date,
           (a."CreatedDate"  AT TIME ZONE 'Asia/Kolkata')::date     AS created_date_ist,
           CASE
               -- metres -> km (e.g. "58 m"); must not match "58 km"
               WHEN a."Distance__c" ~* '^[0-9,.]+\s*m$'
                   THEN NULLIF(replace(regexp_replace(a."Distance__c", '[^0-9,.].*$', '', 'g'), ',', ''), '')::numeric / 1000.0
               -- "54.3 km", "1,244 km", or a bare number -> km
               WHEN a."Distance__c" ~ '^[0-9,.]+'
                   THEN NULLIF(replace(regexp_replace(a."Distance__c", '[^0-9,.].*$', '', 'g'), ',', ''), '')::numeric
               ELSE NULL
           END                                                      AS km
    FROM activity_tracker a
    WHERE a."IsDeleted" IS NOT TRUE
),
-- ---------- Visit Plan Allocation, normalised to IST ----------
vpa AS (
    SELECT v."OwnerId"                                              AS owner_id,
           NULLIF(TRIM(v."Visiting_With__c"), '')                   AS visiting_with_id,
           v."Purpose_of_Travel__c"                                 AS purpose,
           NULLIF(TRIM(v."Unique_Customer__c"), '')                 AS unique_customer,
           v."Check_In_Time__c"  AT TIME ZONE 'Asia/Kolkata'        AS checkin_ist,
           v."Check_Out_Time__c" AT TIME ZONE 'Asia/Kolkata'        AS checkout_ist,
           (v."Check_In_Time__c"  AT TIME ZONE 'Asia/Kolkata')::date AS checkin_date,
           (v."Check_Out_Time__c" AT TIME ZONE 'Asia/Kolkata')::date AS checkout_date,
           (v."VisitDateTime__c"  AT TIME ZONE 'Asia/Kolkata')::date AS visit_date,
           (v."CreatedDate"       AT TIME ZONE 'Asia/Kolkata')::date AS created_date
    FROM visit_plan_allocation v
    WHERE v."IsDeleted" IS NOT TRUE
),
-- Credit a row to its owner AND to whoever they visited with (the DAX's
-- "User_Name = X OR Visiting_With = X"), so both people get the day counted.
vpa_credited AS (
    SELECT owner_id AS user_id, * FROM vpa
    UNION ALL
    SELECT visiting_with_id AS user_id, * FROM vpa WHERE visiting_with_id IS NOT NULL
),
-- ---------- the user x date grid ----------
people AS (
    SELECT DISTINCT user_id FROM (
        SELECT user_id FROM vpa_credited WHERE user_id IS NOT NULL
        UNION SELECT owner_id FROM tracker WHERE owner_id IS NOT NULL
    ) s
),
span AS (
    SELECT LEAST(
             COALESCE((SELECT min(LEAST(checkin_date, visit_date, created_date)) FROM vpa), CURRENT_DATE),
             COALESCE((SELECT min(dt_date) FROM tracker), CURRENT_DATE)
           ) AS first_day
),
grid AS (
    SELECT p.user_id, d::date AS activity_date
    FROM people p
    CROSS JOIN LATERAL generate_series((SELECT first_day FROM span), CURRENT_DATE, interval '1 day') d
),
-- ---------- per-day aggregates ----------
work_stamps AS (
    SELECT owner_id, dt_date,
           min(dt_ist) FILTER (WHERE activity_type = 'Start Work') AS in_time,
           max(dt_ist) FILTER (WHERE activity_type = 'End Work')   AS out_time
    FROM tracker GROUP BY 1, 2
),
km_by_day AS (
    SELECT owner_id, created_date_ist, sum(km) AS km
    FROM tracker WHERE km IS NOT NULL GROUP BY 1, 2
),
-- Anything logged for the day, by any of the three date fields the DAX checks.
day_plans AS (
    SELECT user_id, d AS activity_date, purpose, unique_customer, checkin_ist, checkout_ist,
           checkin_date, checkout_date, visit_date
    FROM vpa_credited
    CROSS JOIN LATERAL (VALUES (checkin_date), (visit_date), (created_date)) AS t(d)
    WHERE user_id IS NOT NULL AND d IS NOT NULL
),
day_flags AS (
    SELECT user_id, activity_date,
           count(DISTINCT (checkin_ist, checkout_ist, purpose))                       AS total_plans,
           count(*) FILTER (WHERE purpose NOT IN ('HO Visit','Branch Office Visit','Leave','Permission')
                               OR purpose IS NULL)                                    AS non_hobo_count,
           bool_or(purpose = 'Permission')                                            AS is_permission_day,
           bool_or(purpose = 'Leave' AND visit_date = activity_date)                  AS is_leave_day
    FROM day_plans GROUP BY 1, 2
),
visit_pairs AS (
    SELECT user_id, checkin_date AS activity_date,
           sum(EXTRACT(EPOCH FROM (checkout_ist - checkin_ist)) / 60.0)               AS visit_minutes,
           sum(EXTRACT(EPOCH FROM (checkout_ist - checkin_ist)) / 60.0)
               FILTER (WHERE purpose IS NULL OR purpose NOT IN
                       ('Work From Home','HO Visit','Branch Office Visit','Travel'))  AS meeting_minutes,
           min(checkin_ist)                                                           AS first_checkin,
           max(checkout_ist)                                                          AS last_checkout,
           min(checkin_ist)  FILTER (WHERE purpose = 'Work From Home')                AS wfh_in,
           max(checkout_ist) FILTER (WHERE purpose = 'Work From Home')                AS wfh_out,
           min(checkin_ist)  FILTER (WHERE purpose IN ('HO Visit','Branch Office Visit')) AS hobo_in,
           max(checkout_ist) FILTER (WHERE purpose IN ('HO Visit','Branch Office Visit')) AS hobo_out
    FROM vpa_credited
    WHERE user_id IS NOT NULL AND checkin_ist IS NOT NULL AND checkout_ist IS NOT NULL
      AND checkin_date = checkout_date
    GROUP BY 1, 2
),
-- Number of visits: real customer calls only (DAX excludes WFH/Travel/BO/HO,
-- requires a check-in, and either a Unique Customer or purpose = Scouting).
visit_counts AS (
    SELECT user_id, visit_date AS activity_date, count(*) AS number_visits
    FROM vpa_credited
    WHERE user_id IS NOT NULL AND visit_date IS NOT NULL AND checkin_ist IS NOT NULL
      AND (unique_customer IS NOT NULL OR purpose = 'Scouting')
      AND (purpose IS NULL OR purpose NOT IN ('Work From Home','Travel','Branch Office Visit','HO Visit'))
    GROUP BY 1, 2
),
customers AS (
    SELECT user_id, checkin_date AS activity_date,
           string_agg(DISTINCT unique_customer, ', ' ORDER BY unique_customer) AS unique_customers
    FROM vpa_credited
    WHERE user_id IS NOT NULL AND checkin_date IS NOT NULL AND unique_customer IS NOT NULL
    GROUP BY 1, 2
),
-- Remarks: "<n> - <purpose>" per purpose for the day (DAX Remarks1).
remarks AS (
    SELECT user_id, activity_date,
           string_agg(purpose_count || ' - ' || purpose, ', ' ORDER BY purpose) AS remarks,
           count(*) AS purpose_rows,
           min(purpose) AS single_purpose
    FROM (
        SELECT user_id, visit_date AS activity_date, purpose, count(*) AS purpose_count
        FROM vpa_credited
        WHERE user_id IS NOT NULL AND visit_date IS NOT NULL AND purpose IS NOT NULL
        GROUP BY 1, 2, 3
    ) s GROUP BY 1, 2
),
-- ---------- assemble ----------
calc AS (
    SELECT g.user_id                                               AS owner_id,
           u."Name"                                                AS user_name,
           g.activity_date,
           ws.in_time, ws.out_time,
           vp.first_checkin, vp.last_checkout,
           COALESCE(k.km, 0)                                       AS km_travelled,
           COALESCE(vp.visit_minutes, 0) / 60.0                    AS visit_hours,
           CASE
               WHEN COALESCE(k.km, 0) > 1000 THEN COALESCE(k.km, 0) / 300.0
               WHEN COALESCE(k.km, 0) > 150  THEN COALESCE(k.km, 0) / 45.0
               ELSE COALESCE(k.km, 0) / 20.0
           END                                                     AS travel_hours,
           COALESCE(df.total_plans, 0) > 0
               AND COALESCE(df.non_hobo_count, 0) = 0              AS is_hobo_only,
           COALESCE(df.is_permission_day, FALSE)                   AS is_permission_day,
           COALESCE(df.is_leave_day, FALSE)                        AS is_leave_day,
           COALESCE(vc.number_visits, 0)                           AS number_visits,
           COALESCE(vp.meeting_minutes, 0) / 60.0                  AS meeting_hours,
           vp.wfh_in, vp.wfh_out, vp.hobo_in, vp.hobo_out,
           cu.unique_customers,
           CASE WHEN r.purpose_rows = 1 THEN r.single_purpose ELSE r.remarks END AS remarks,
           (h.holiday_date IS NOT NULL)                            AS is_holiday,
           COALESCE(df.total_plans, 0) + COALESCE(vc.number_visits, 0) > 0
               OR ws.in_time IS NOT NULL OR ws.out_time IS NOT NULL
               OR COALESCE(k.km, 0) > 0                            AS has_any_activity
    FROM grid g
    JOIN "user" u              ON u."Id" = g.user_id
    LEFT JOIN work_stamps ws   ON ws.owner_id = g.user_id AND ws.dt_date = g.activity_date
    LEFT JOIN km_by_day k      ON k.owner_id = g.user_id AND k.created_date_ist = g.activity_date
    LEFT JOIN day_flags df     ON df.user_id = g.user_id AND df.activity_date = g.activity_date
    LEFT JOIN visit_pairs vp   ON vp.user_id = g.user_id AND vp.activity_date = g.activity_date
    LEFT JOIN visit_counts vc  ON vc.user_id = g.user_id AND vc.activity_date = g.activity_date
    LEFT JOIN customers cu     ON cu.user_id = g.user_id AND cu.activity_date = g.activity_date
    LEFT JOIN remarks r        ON r.user_id = g.user_id AND r.activity_date = g.activity_date
    LEFT JOIN app.holiday h    ON h.holiday_date = g.activity_date
),
totals AS (
    SELECT c.*,
           -- HO/BO-only days exclude travel; Permission adds two hours.
           (CASE WHEN c.is_hobo_only THEN c.visit_hours ELSE c.visit_hours + c.travel_hours END)
             + CASE WHEN c.is_permission_day THEN 2 ELSE 0 END     AS total_working_hours,
           CASE WHEN c.in_time IS NOT NULL AND c.out_time IS NOT NULL
                THEN EXTRACT(EPOCH FROM (c.out_time - c.in_time)) / 3600.0 END AS raw_work_hours
    FROM calc c
)
SELECT owner_id,
       user_name,
       activity_date,
       in_time,
       out_time,
       first_checkin,
       last_checkout,
       round(km_travelled, 1)                                      AS km_travelled,
       round(travel_hours::numeric, 2)                             AS travel_hours,
       '09:00:00 to 17:30:00'::text                                AS working_shift,
       '08:30'::text                                               AS shift_hours,
       -- Working Hours = Out - In, +2h on a Permission day under 8h
       CASE WHEN raw_work_hours IS NULL THEN NULL ELSE
            to_char(make_interval(mins => (round((raw_work_hours
                 + CASE WHEN is_permission_day AND raw_work_hours < 8 THEN 2 ELSE 0 END) * 60))::int),
                 'HH24:MI') END                                    AS working_hours,
       round(total_working_hours::numeric, 2)                      AS total_working_hours_dec,
       CASE WHEN total_working_hours > 0 THEN
            to_char(make_interval(mins => (round(total_working_hours * 60))::int), 'HH24:MI') END
                                                                   AS total_working_hours,
       CASE WHEN meeting_hours > 0 THEN
            to_char(make_interval(mins => (round(meeting_hours * 60))::int), 'HH24:MI') END
                                                                   AS meeting_time,
       CASE WHEN wfh_in IS NOT NULL AND wfh_out IS NOT NULL THEN
            to_char(make_interval(mins => (round(EXTRACT(EPOCH FROM (wfh_out - wfh_in)) / 60))::int), 'HH24:MI') END
                                                                   AS work_from_home,
       CASE WHEN hobo_in IS NOT NULL AND hobo_out IS NOT NULL THEN
            to_char(make_interval(mins => (round(EXTRACT(EPOCH FROM (hobo_out - hobo_in)) / 60))::int), 'HH24:MI') END
                                                                   AS ho_or_bo,
       number_visits,
       remarks,
       unique_customers,
       -- Status. Order matters, exactly as the DAX SWITCH.
       CASE
           WHEN is_leave_day AND total_working_hours = 0 THEN 'Leave'
           WHEN EXTRACT(ISODOW FROM activity_date) = 7  THEN 'Sunday'
           WHEN is_holiday                              THEN 'Holiday'
           WHEN total_working_hours >= 6                THEN 'Present'
           WHEN total_working_hours >= 4                THEN 'HD'
           WHEN has_any_activity                        THEN 'Mismatch'
           ELSE 'No Data'   -- nothing logged at all; the DAX called this "Mismatch" too
       END                                                         AS activity_status,
       has_any_activity
FROM totals;
