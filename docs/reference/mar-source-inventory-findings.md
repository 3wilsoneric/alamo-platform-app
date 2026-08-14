# MAR Source Inventory Findings

- purpose: record verified ElderMark medication-order and MAR administration coverage
- status: validated and ready for daily publication
- owners: data platform, product
- updated: 2026-07-22
- tags: eldermark, mar, medication-administration, medications, databricks
- labels: source-inventory, verified
- related files:
  - [alamo-platform-app/databricks/notebooks/mar_source_inventory.py](/Users/eric/CareEngineMain/alamo-platform-app/databricks/notebooks/mar_source_inventory.py)
  - [alamo-platform-app/databricks/notebooks/mar_gold_views.py](/Users/eric/CareEngineMain/alamo-platform-app/databricks/notebooks/mar_gold_views.py)

## Verified Sources

### Medication orders

- table: `alamohealth.silver.res_medications`
- rows: 29,245
- residents: 1,314
- communities: 5
- active rows: 9,607
- medication name, resident, and facility coverage: 100%
- route coverage: 98.8%
- dosage coverage: 37.43%
- psychotropic rows: 9,337
- narcotic rows: 195

### Medication administrations

- table: `alamohealth.silver.med_delivery`
- rows: 1,708,475
- residents: 558
- communities: 5
- given rows: 1,463,594
- explicit not-given rows: 60,317
- unresolved outcome rows: 184,564
- PRN rows: 76,965
- resident, facility, administration ID, medication, schedule, and outcome coverage: 100%

## Data Decisions

- Govern administration analytics by `Scheduled_Date_dt` from `2021-01-01` through `current_date()`.
- Do not treat all not-given events as refusals.
- Normalize not-given reasons into refused, AWOL, hospital, offsite-with-meds, held, other, and unknown.
- Keep administration detail in Databricks.
- Publish monthly aggregates, current-resident summaries, current medication orders, and complete governed rows inside the bounded 90-day exception and PRN windows.
- Keep unresolved scheduled outcomes out of the exception slice so they cannot crowd real refusals, held medications, not-given events, or late administrations out of the snapshot.
- Keep resident-level medication order, exception, and PRN tables server-side; send only scoped tool results to the browser.
- Treat unresolved outcomes as an explicit data-quality measure.
- Do not infer dosage when the order row is blank.

## Validated Gold Result

- all contract checks passed on 2026-06-20
- governed administration rows: 1,525,095
- distinct administration IDs: 1,525,095
- given rows: 1,463,668
- not-given rows: 52,002
- unknown rows: 9,425 (0.62%)
- governed date range: 2021-01-30 through 2026-06-20
- active medication orders: 4,892 across 505 active residents
- PRN source rows: 76,964
- PRN effectiveness rows: 76,943
- future, missing-resident, and missing-medication rows: 0

## Remaining Control

Add role-level authorization before resident-level MAR exception detail is made
available beyond the currently approved audience.
