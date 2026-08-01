-- =====================================================================
-- 02_indexes.sql  -- performance indexes the reporting views rely on.
-- These are NOT created by the ETL (task.WhatId, quotelineitem.QuoteId are
-- the notable gaps). Safe & idempotent; survive ETL re-runs (CREATE IF NOT EXISTS).
-- =====================================================================

-- vw_opportunity's LATERAL "latest action task" lookup (task WhatId -> opp Id)
CREATE INDEX IF NOT EXISTS idx_task_whatid_activity
    ON task ("WhatId", "ActivityDate" DESC);

-- quote line item -> quote join (the money grain)
CREATE INDEX IF NOT EXISTS idx_qli_quoteid
    ON quotelineitem ("QuoteId");

-- Visit Plan Allocation -> opportunity / account (LatestCheckin measures + tracker visits)
CREATE INDEX IF NOT EXISTS idx_vpa_opportunity ON visit_plan_allocation ("Opportunity__c");
CREATE INDEX IF NOT EXISTS idx_vpa_account     ON visit_plan_allocation ("Account__c");

-- opportunity filters used by nearly every report page
CREATE INDEX IF NOT EXISTS idx_opp_closedate  ON opportunity ("CloseDate");
CREATE INDEX IF NOT EXISTS idx_opp_stagename  ON opportunity ("StageName");
CREATE INDEX IF NOT EXISTS idx_opp_iswon      ON opportunity ("IsWon");

-- refresh planner stats
ANALYZE task;
ANALYZE quotelineitem;
ANALYZE opportunity;
