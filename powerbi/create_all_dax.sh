#!/usr/bin/env bash
# =============================================================================
# Recreate every MRM CPS - N2 measure in a live Power BI model via pbi-cli.
#
# Prereqi:  pipx install pbi-cli-tool && pbi-cli skills install && pbi connect
# Run:      bash powerbi/create_all_dax.sh
#
# Multi-line DAX is piped on stdin ( -e - ) so VAR/CALCULATE keep their line
# breaks (see the power-bi-dax skill). Home table given with -t.
# Calculated COLUMNS + the EarliestQuotesByMonth calculated TABLE are listed in
# docs/DAX_MEASURES.md -- those need `pbi column/table create` (power-bi-modeling).
# =============================================================================
set -euo pipefail

echo 'CALCULATE(
    COUNT('"'"'Visit Plan Allocation'"'"'[Id]),
    USERELATIONSHIP(Calendar[Date], '"'"'Visit Plan Allocation'"'"'[CheckIn Date]),
    NOT('"'"'Visit Plan Allocation'"'"'[Purpose_of_Travel__c] IN
        {"HO VISIT","BRANCH OFFICE VISIT","REVIEW MEETING","EXHIBITION","TRAVEL","WORK FROM HOME","Training"})
)' | pbi measure create "Visits" -e - -t "Visit Plan Allocation"

echo 'CALCULATE(
    COUNT(Opportunity[Id]),
    USERELATIONSHIP(Calendar[Date], Opportunity[Created Date Only]),
    USERELATIONSHIP(User[Id], Opportunity[OwnerId])
)' | pbi measure create "Opportunities Created" -e - -t "Opportunity"

echo 'CALCULATE(
    SUM('"'"'Quote Line Item'"'"'[TotalPrice]),
    Quote[Status] <> "Rejected", Quote[Status] <> "Accepted",
    Quote[Sync_Quote__c] = TRUE(),
    Opportunity[Division__c] = "Sieger Parking",
    Opportunity[StageName] <> "Closed lost",
    Opportunity[StageName] <> "Closed Won",
    Opportunity[StageName] <> "Dropped",
    USERELATIONSHIP(Calendar[Date], Quote[Created_Date__c]),
    USERELATIONSHIP(User[Id], Quote[OwnerId])
)' | pbi measure create "Open Quotes Value" -e - -t "Quote"

echo 'CALCULATE(
    SUM(EarliestQuotesByMonth[Quote Value]),
    Quote[Status] <> "REJECTED", Quote[Status] <> "ACCEPTED",
    Quote[Sync_Quote__c] = TRUE(),
    Opportunity[Division__c] = "Sieger Parking",
    USERELATIONSHIP(Calendar[Date], EarliestQuotesByMonth[EarliestPresentedDateONLY]),
    USERELATIONSHIP(User[Id], EarliestQuotesByMonth[User Id])
)' | pbi measure create "Live Quote Value" -e - -t "Quote"

echo 'CALCULATE(
    SUM(Opportunity[Opportunity_Amount__c]),
    Opportunity[StageName] = "Closed Won",
    Opportunity[Division__c] = "Sieger Parking",
    Quote[Status] = "ACCEPTED", Quote[Sync_Quote__c] = TRUE(),
    USERELATIONSHIP(Calendar[Date], Opportunity[CloseDate]),
    USERELATIONSHIP(User[Id], Opportunity[OwnerId])
)' | pbi measure create "Closed Won Value" -e - -t "Opportunity"

echo 'CALCULATE(
    SUM(Opportunity[Opportunity_Amount__c]),
    Quote[Sync_Quote__c] = TRUE(),
    Opportunity[StageName] = "Closed Lost",
    USERELATIONSHIP(Calendar[Date], Opportunity[CloseDate]),
    USERELATIONSHIP(User[Id], Opportunity[OwnerId])
)' | pbi measure create "Closed Lost Value" -e - -t "Quote"

echo 'CALCULATE(
    SUM(Opportunity[Opportunity_Amount__c]),
    Quote[Sync_Quote__c] = TRUE(),
    Opportunity[StageName] = "Dropped",
    USERELATIONSHIP(Calendar[Date], Opportunity[CloseDate]),
    USERELATIONSHIP(User[Id], Opportunity[OwnerId])
)' | pbi measure create "Dropped Value" -e - -t "Opportunity"

echo 'DIVIDE(CALCULATE(COUNT('"'"'Lead'"'"'[LastName]), '"'"'Lead'"'"'[Status] = "Qualified"), COUNT('"'"'Lead'"'"'[LastName]))' \
  | pbi measure create "Conversion Ratio" -e - -t "Lead" --format-string "0.0%"

echo 'CALCULATE(
    MAX('"'"'Visit Plan Allocation'"'"'[CheckInDate__c]),
    FILTER('"'"'Visit Plan Allocation'"'"', '"'"'Visit Plan Allocation'"'"'[Opportunity__c] = RELATED(Opportunity[Id]))
)' | pbi measure create "LatestCheckin - Opp" -e - -t "Opportunity"

echo 'CALCULATE(
    MAX('"'"'Visit Plan Allocation'"'"'[CheckInDate__c]),
    FILTER('"'"'Visit Plan Allocation'"'"', '"'"'Visit Plan Allocation'"'"'[Account__c] = RELATED(Opportunity[AccountId]))
)' | pbi measure create "LatestCheckin - Acc" -e - -t "Opportunity"

echo "All 10 measures created. Calculated columns + EarliestQuotesByMonth table -> see docs/DAX_MEASURES.md"
