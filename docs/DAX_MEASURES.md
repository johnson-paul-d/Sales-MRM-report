# Power BI DAX — Complete Reference & Page Mapping

Every DAX object in the **MRM CPS - N2** model, mapped to the report page(s) that use it
and to how the app reproduces it. Extracted from the `.pbix` DataModel with `pbixray`.

> To load these into a live Power BI model, run the commands in
> [`powerbi/create_all_dax.sh`](../powerbi/create_all_dax.sh) after `pbi connect`.
> In the app they're already implemented in SQL (`sql/01_reporting_views.sql`) — the app
> uses a **Division slicer** instead of the measures' hard-coded `Division = "Sieger Parking"`,
> so app numbers equal the DAX when you pick Sieger Parking.

---

## 1. Measures (10)

### `Visits`  — table: *Visit Plan Allocation*   ·   page: **Sales Tracker**
```dax
CALCULATE(
    COUNT('Visit Plan Allocation'[Id]),
    USERELATIONSHIP(Calendar[Date], 'Visit Plan Allocation'[CheckIn Date]),
    NOT('Visit Plan Allocation'[Purpose_of_Travel__c] IN {
        "HO VISIT","BRANCH OFFICE VISIT","REVIEW MEETING","EXHIBITION",
        "TRAVEL","WORK FROM HOME","Training" })
)
```
**App:** `vw_sales_tracker.visits` → `/api/reports/sales-tracker`. ✅ exact.

### `Opportunities Created`  — table: *Opportunity*   ·   page: **Sales Tracker**
```dax
CALCULATE(
    COUNT(Opportunity[Id]),
    USERELATIONSHIP(Calendar[Date], Opportunity[Created Date Only]),
    USERELATIONSHIP(User[Id], Opportunity[OwnerId])
)
```
**App:** `vw_sales_tracker.opportunities_created`. ✅ exact.

### `Open Quotes Value`  — table: *Quote*   ·   page: **Sales Tracker**
```dax
CALCULATE(
    SUM('Quote Line Item'[TotalPrice]),
    Quote[Status] <> "Rejected", Quote[Status] <> "Accepted",
    Quote[Sync_Quote__c] = TRUE(),
    Opportunity[Division__c] = "Sieger Parking",
    Opportunity[StageName] <> "Closed lost",
    Opportunity[StageName] <> "Closed Won",
    Opportunity[StageName] <> "Dropped",
    USERELATIONSHIP(Calendar[Date], Quote[Created_Date__c]),
    USERELATIONSHIP(User[Id], Quote[OwnerId])
)
```
**App:** `vw_sales_tracker.open_quotes_value` (division via slicer). ✅

### `Live Quote Value`  — table: *Quote*   ·   page: **Sales Tracker**
```dax
CALCULATE(
    SUM(EarliestQuotesByMonth[Quote Value]),
    Quote[Status] <> "REJECTED", Quote[Status] <> "ACCEPTED",
    Quote[Sync_Quote__c] = TRUE(),
    Opportunity[Division__c] = "Sieger Parking",
    USERELATIONSHIP(Calendar[Date], EarliestQuotesByMonth[EarliestPresentedDateONLY]),
    USERELATIONSHIP(User[Id], EarliestQuotesByMonth[User Id])
)
```
**App:** `vw_sales_tracker.live_quote_value` (from `vw_earliest_quotes_by_month`). ✅

### `Closed Won Value`  — table: *Opportunity*   ·   page: **Sales Tracker**
```dax
CALCULATE(
    SUM(Opportunity[Opportunity_Amount__c]),
    Opportunity[StageName] = "Closed Won",
    Opportunity[Division__c] = "Sieger Parking",
    Quote[Status] = "ACCEPTED", Quote[Sync_Quote__c] = TRUE(),
    USERELATIONSHIP('Calendar'[Date], Opportunity[CloseDate]),
    USERELATIONSHIP(User[Id], Opportunity[OwnerId])
)
```
**App:** `vw_sales_tracker.closed_won_value`. ✅ (Sieger Parking → ₹169 Cr; all divisions → ₹368 Cr)

### `Closed Lost Value`  — table: *Quote*   ·   page: **Sales Tracker**
```dax
CALCULATE(
    SUM(Opportunity[Opportunity_Amount__c]),
    'Quote'[Sync_Quote__c] = TRUE(),
    Opportunity[StageName] = "Closed Lost",
    USERELATIONSHIP(Calendar[Date], Opportunity[CloseDate]),
    USERELATIONSHIP(User[Id], Opportunity[OwnerId])
)
```
**App:** `vw_sales_tracker.closed_lost_value`. ✅

### `Dropped Value`  — table: *Opportunity*   ·   page: **Sales Tracker**
```dax
CALCULATE(
    SUM(Opportunity[Opportunity_Amount__c]),
    'Quote'[Sync_Quote__c] = TRUE(),
    Opportunity[StageName] = "Dropped",
    USERELATIONSHIP(Calendar[Date], Opportunity[CloseDate]),
    USERELATIONSHIP(User[Id], Opportunity[OwnerId])
)
```
**App:** `vw_sales_tracker.dropped_value`. ✅

### `Conversion Ratio`  — table: *Lead*   ·   page: **Leads**
```dax
DIVIDE(CALCULATE(COUNT('Lead'[LastName]), 'Lead'[Status] = "Qualified"), COUNT('Lead'[LastName]))
```
**App:** `vw_lead_conversion.conversion_ratio_pct` → `/api/reports/leads`. ✅ (8.19%)

### `LatestCheckin - Opp`  — table: *Opportunity*   ·   page: **No Visits**
```dax
CALCULATE(
    MAX('Visit Plan Allocation'[CheckInDate__c]),
    FILTER('Visit Plan Allocation',
        'Visit Plan Allocation'[Opportunity__c] = RELATED(Opportunity[Id]))
)
```
**App:** `vw_quote_line_item.latest_checkin_opp` → `/api/reports/no-visits`. ⚠ currently the
Salesforce rollup field `Opportunity.Latest_Checkin__c`, not recomputed from VPA (offer: exact parity).

### `LatestCheckin - Acc`  — table: *Opportunity*   ·   page: **No Visits**
```dax
CALCULATE(
    MAX('Visit Plan Allocation'[CheckInDate__c]),
    FILTER('Visit Plan Allocation',
        'Visit Plan Allocation'[Account__c] = RELATED(Opportunity[AccountId]))
)
```
**App:** `vw_quote_line_item.latest_checkin_acc`. ⚠ SF rollup (`Account.Latest_Checkin__c`).

*(An empty stub measure `Opportunity[Measure]` also exists — ignored.)*

---

## 2. Calculated columns

| Column (table) | DAX | App implementation |
|---|---|---|
| `CheckIn Date` (Visit Plan Allocation) | `DATE(YEAR([Check_In_Time__c]), MONTH([Check_In_Time__c]), DAY([Check_In_Time__c]))` | date-trunc of `Check_In_Time__c` in `vw_sales_tracker` (visits date) |
| `Created Date Only` (Opportunity) | `DATE(YEAR([CreatedDate]), MONTH([CreatedDate]), DAY([CreatedDate]))` | `vw_opportunity.created_date_only` |
| `REGION` (User) | `SWITCH(TRUE(), User[Name] IN {"AMITAVA SARKAR"},"EAST", User[Name] IN {"AMIT","CHITRE NACHIKET","HARSHIT VERMA","NITIN PANCHAL","UDAY SINGH","KIRAN"},"WEST", User[Name] IN {"BHARATHI KANNA","PRAKASH G","SUBASH","SURESH J","VEERARAGAVAN"},"SOUTH")` | **app-maintained**: `app.region` + `app.user_region` (Admin → User→Region) |
| `User name` (EarliestQuotesByMonth) | `LOOKUPVALUE(User[Name], User[Id], [User Id])` | `vw_earliest_quotes_by_month.user_name` |
| `Opp name` (EarliestQuotesByMonth) | `LOOKUPVALUE(Opportunity[Name], Opportunity[Id], [OpportunityId])` | `.opportunity_name` |
| `Opp stage` (EarliestQuotesByMonth) | `LOOKUPVALUE(Opportunity[StageName], Opportunity[Id], [OpportunityId])` | `.opp_stage` |
| `Region` (EarliestQuotesByMonth) | `SWITCH(TRUE(), [User name] IN {"Veeraragavan","subash","suresh j","prakash G","Bharathi kanna"},"South", [User name] IN {"Amitava Sarkar"},"East", [User name] IN {"Nitin Panchal","kiran","Vaishnav","Harshit Verma","amit","Uday singh","Chitre nachiket"},"West")` | via `app.user_region` |

---

## 3. Calculated table: `EarliestQuotesByMonth`

One row per opportunity: earliest quote by presented date, dated by the earliest **created** date.
```dax
ADDCOLUMNS(
    SUMMARIZE(
        FILTER('Quote', RELATED(Opportunity[Division__c]) = "SIEGER PARKING"),
        'Quote'[OpportunityId],
        "EarliestPresentedDate", CALCULATE(MIN('Quote'[Created_Date__c]))
    ),
    "Quote Value", CALCULATE(MAX('Quote'[TotalPrice]),
        TOPN(1, FILTER('Quote', 'Quote'[OpportunityId] = EARLIER('Quote'[OpportunityId]) &&
            RELATED(Opportunity[Division__c]) = "SIEGER PARKING"), 'Quote'[Presented_Date__c], ASC)),
    "EarliestPresentedDateONLY", DATE(YEAR([EarliestPresentedDate]), MONTH([EarliestPresentedDate]), DAY([EarliestPresentedDate])),
    "User Id", CALCULATE(MAX('Quote'[OwnerId]), TOPN(1, FILTER('Quote', ...), 'Quote'[Presented_Date__c], ASC)),
    "Product Name", <earliest quote's line-item product>,
    "Quantity",     <earliest quote's line-item qty sum>
)
```
**App:** `vw_earliest_quotes_by_month` → `/api/reports/new-quotes` + Sales Tracker "Earliest Quotes" tab.
(Division filter removed in the app so it covers all divisions; use the slicer for Sieger Parking.)

**Recreate in Power BI:** paste [`powerbi/EarliestQuotesByMonth.dax`](../powerbi/EarliestQuotesByMonth.dax)
into *Modeling → New table*, **or** run [`powerbi/create_earliest_quotes.sh`](../powerbi/create_earliest_quotes.sh)
after `pbi connect` — it also creates the 4 calculated columns (`User name`, `Opp name`, `Opp stage`, `Region`).

---

## 4. Page → DAX matrix

| Page | DAX measures / objects used | App page |
|---|---|---|
| **Sales Tracker** | Visits, Opportunities Created, Open Quotes Value, Live Quote Value, Closed Won Value, Closed Lost Value, Dropped Value; `EarliestQuotesByMonth`; `User[REGION]` | `/sales-tracker` |
| **Leads** | Conversion Ratio | `/leads` |
| **No Visits** | LatestCheckin - Opp, LatestCheckin - Acc | `/no-visits` |
| **New Quote Released** | `EarliestQuotesByMonth` (Quote Value, Qty) | `/new-quotes` |
| **New Opportunity** | `EarliestQuotesByMonth[Region]`; count of Opportunity[Id] | `/new-opportunity` |
| **Last Month / This Month / Closed Won / Closed Lost / Dropped / Open Funnel / Six-Month / Top Enquiries** | implicit `SUM(Qty)`, `SUM(TotalPrice)`, `SUM(Opportunity_Amount__c)` (no named measures) + `User[REGION]` slicer | respective pages |

All calculation logic lives in `sql/01_reporting_views.sql`; see `docs/POWERBI_SPEC.md` for the
page-level filters that go with each.
