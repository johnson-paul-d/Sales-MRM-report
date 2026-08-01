#!/usr/bin/env bash
# =============================================================================
# Create the EarliestQuotesByMonth calculated table + its calculated columns
# in a live Power BI model. Prereq: pbi connect (see power-bi-modeling skill).
# Run AFTER the base tables (Quote, Opportunity, Quote Line Item, User) exist.
# =============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

# 1) The calculated TABLE (multi-line DAX read from file; // comments stripped)
DAX="$(grep -v '^[[:space:]]*//' "$HERE/EarliestQuotesByMonth.dax")"
pbi table create EarliestQuotesByMonth --dax-expression "$DAX"

# 2) Calculated COLUMNS on the new table
pbi column create "User name" --table EarliestQuotesByMonth \
  --expression "LOOKUPVALUE(User[Name], User[Id], EarliestQuotesByMonth[User Id])"

pbi column create "Opp name" --table EarliestQuotesByMonth \
  --expression "LOOKUPVALUE(Opportunity[Name], Opportunity[Id], EarliestQuotesByMonth[OpportunityId])"

pbi column create "Opp stage" --table EarliestQuotesByMonth \
  --expression "LOOKUPVALUE(Opportunity[StageName], Opportunity[Id], EarliestQuotesByMonth[OpportunityId])"

pbi column create "Region" --table EarliestQuotesByMonth \
  --expression 'SWITCH(TRUE(), EarliestQuotesByMonth[User name] IN {"Veeraragavan","subash","suresh j","prakash G","Bharathi kanna"},"South", EarliestQuotesByMonth[User name] IN {"Amitava Sarkar"},"East", EarliestQuotesByMonth[User name] IN {"Nitin Panchal","kiran","Vaishnav","Harshit Verma","amit","Uday singh","Chitre nachiket"},"West")'

echo "EarliestQuotesByMonth table + 4 calculated columns created."
echo "Tip: if 'pbi table create --dax-expression' rejects the VAR/RETURN columns,"
echo "paste powerbi/EarliestQuotesByMonth.dax into Power BI Desktop -> Modeling -> New table."
