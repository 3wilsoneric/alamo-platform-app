# Platform Daily Publish Runbook

- purpose: provide the exact operator run order for rebuilding and publishing the Alamo Platform snapshot, with the business date handled explicitly so partition/date mismatches do not corrupt the daily publish
- status: active operator runbook
- owners: engineering, data platform
- updated: 2026-07-18
- tags: runbook, databricks, eldermark, snapshot, publish, operations
- labels: operator-guide, daily-run, current-state
- related files:
  - [alamo-platform-app/databricks/notebooks/eldermark_staged_transform.py](/Users/eric/CareEngineMain/alamo-platform-app/databricks/notebooks/eldermark_staged_transform.py)
  - [alamo-platform-app/databricks/notebooks/snapshot_publish.py](/Users/eric/CareEngineMain/alamo-platform-app/databricks/notebooks/snapshot_publish.py)
  - [alamo-platform-app/databricks/workflows/daily_platform_publish.json](/Users/eric/CareEngineMain/alamo-platform-app/databricks/workflows/daily_platform_publish.json)
  - [data-publishing.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/data-publishing.md)

## Purpose

Run the existing Alamo Platform daily pipeline safely for a specific business date.

This runbook assumes the architecture is:

1. VM/source pull lands raw ElderMark files in the lake
2. Databricks stages/cleans those raw files into silver
3. Databricks refreshes the approved gold views
4. Databricks publishes the app snapshot
5. the platform reads the published Azure snapshot

## Critical Rule

The most important field in the run is:

- `date_partition`

It must represent the **raw business date that actually landed in the lake**, not merely “today” on the clock.

If the wrong `date_partition` is used:

- the silver transform will read the wrong raw partition
- downstream view refreshes may rebuild from stale or partial data
- the platform snapshot may publish a believable but wrong day

## Business Date Rule

Before running Databricks, answer this exact question:

> Which raw lake partition from the VM pull is the one we intend to publish today?

Use that exact date as:

- `date_partition=YYYY-MM-DD`

Example:

- Sunday run using Friday’s landed raw data:
  - `date_partition=2026-06-05`

Do not infer this from:

- current wall clock time
- Databricks job start time
- operator memory

## Sunday Operator Sequence

### Step 1. Confirm raw pull landed

Verify that the VM/source pull produced the expected raw partition in the lake for the intended business date.

Required outcome:

- raw ElderMark partition exists for the intended `date_partition`
- files are complete enough to process

Do not continue if the raw partition is missing.

### Step 2. Record the business date

Write down the date explicitly before running anything:

- `date_partition=YYYY-MM-DD`

This should be treated as a run input, not an assumption.

### Step 3. Run ElderMark staged transform

Run:

- `eldermark_staged_transform`

Parameters:

- `date_partition=YYYY-MM-DD`

The transform intentionally exposes no other parameters. It always publishes to
`alamohealth.silver` and rebuilds the bounded 52-month census window.

Success means:

- silver datasets are rebuilt for the chosen partition
- `Census_Snapshot` is also rebuilt
- ElderMark bang dates are normalized only as `day!month!year`; malformed or impossible values become null instead of being reinterpreted

If the 32 source tables completed but the run failed, was canceled, or stalled
during `Census_Snapshot`, import and run `eldermark_census_rebuild` instead.
It only asks for:

- the same `date_partition`

This recovery notebook reads `alamohealth.silver.resident`, verifies rows exist
for the selected `_transform_partition`, uses a 52-month census window, and
writes only `Census_Snapshot`. It does not run the expensive pre-write census
summary; `census_quality_audit` remains the validation gate after the tool-context views are refreshed.

### Step 4. Run MAR gold views

Run `mar_gold_views` if MAR/medication views need to be refreshed.

Parameters:

- `catalog=alamohealth`
- `silver_schema=silver`
- `gold_schema=gold`
- `governed_start_date=2021-01-01`
- `date_partition=<business-date-YYYY-MM-DD>`

The notebook uses `date_partition` for active-order status, rolling 7/30/90-day
resident summaries, future-row QA, and the upper bound of governed MAR detail.
It must not use the Databricks notebook run date for those calculations.

The gold layer used by the app and its audit gates must be refreshed for:

- `v_occupancy` as an audit/support input, not as the visible census source
- `v_active_residents` as an audit/support input, not as the visible resident-count source
- `v_incidents`
- `v_census`
- `v_medication_compliance`
- `v_refusal_by_medication`
- `v_documentation_gaps`

Do not publish the app snapshot until this step is complete.

Visible app counts should come from governed tool/context views after
countability filtering, not directly from raw active-resident or occupancy
views.

### Step 5. Build analyst context views

Run:

- `tool_context_views`

Parameters:

- `catalog=alamohealth`
- `gold_schema=gold`
- `date_partition=<business-date-YYYY-MM-DD>`

Success means the governed `v_tool_*` views exist for analyst answers,
historical census, resident flow, countability audit, and snapshot payloads.

### Step 6. Run analyst context QA

Run:

- `analyst_context_qa`

Parameters:

- `catalog=alamohealth`
- `gold_schema=gold`
- `date_partition=<business-date-YYYY-MM-DD>`

Paste the final `ANALYST_CONTEXT_COUNTS=...` line if any analyst slice still
looks missing in the app.

### Step 7. Run census quality audit

Run:

- `census_quality_audit`

Parameters:

- `catalog=alamohealth`
- `silver_schema=silver`
- `gold_schema=gold`
- `minimum_reasonable_admit_date=2000-01-01`
- `date_partition=<business-date-YYYY-MM-DD>` when running the full daily publish

This is the census gate. Do not publish the app snapshot if the audit shows
unexplained census differences, duplicate active residents, non-countable
residents reaching governed profile rows, countable admit dates before the
configured historical floor, missing weekly/monthly coverage, or a governed
census month that extends beyond the silver resident/census transform partition.

If `date_partition` is omitted during a snapshot-only refresh, the audit derives
its as-of date from the latest governed census `snapshot_date`, then from the
latest governed census month. If neither exists, the audit must raise instead
of comparing a prior business-date snapshot against the wall-clock date of the
notebook run.

Paste the final `CENSUS_QUALITY_SUMMARY=...` line for review.
The summary must include `"ok": true`. If it does not, the notebook should
raise and `snapshot_publish` should not run.

### Step 8. Sanity-check gold outputs

Before publishing the snapshot, check:

- all 5 facilities are present:
  - `337`
  - `342`
  - `343`
  - `344`
  - `345`
- active resident counts look sane
- latest incident month exists
- compliance data exists for the latest reporting month
- documentation gaps query is not empty because of a schema failure

If any of these fail, stop and fix upstream data first.

### Step 9. Run snapshot publish

Run:

- `snapshot_publish`

Parameters:

- `storage_account=alamodatalake`
- `container=alamo-platform-snapshots`
- `snapshot_root=snapshots/daily`
- `entra_tenant_id=<entra-tenant-id>`
- `entra_client_id=<entra-client-id>`
- `entra_client_secret=<entra-client-secret>`

Success means both of these are overwritten:

- `snapshots/daily/latest.json`
- `snapshots/daily/YYYY-MM-DD.json`

## Post-Publish Verification

After publish, verify in the signed-in app or use an API client with a delegated
Entra bearer token. These endpoints intentionally return `401` to anonymous
requests.

1. `GET /api/platform/snapshot-health`
2. `GET /api/platform/bootstrap`
3. `GET /api/home-dashboard`
4. one or two `GET /api/communities/snapshot?facilityId=...` checks

What should look right:

- `generated_at` is fresh
- `snapshot.as_of_date` equals the selected business `date_partition`
- `communities.as_of_date` matches `snapshot.as_of_date`
- `source` is `published-snapshot`
- `azurePath` is populated
- `azureContainer` is populated
- resident counts and incident summaries match the expected day

## Never-Again Date Controls

These are the controls we should enforce so the date stops being a recurring problem.

### Control 1. Never derive `date_partition` from job start time

The business date must be an explicit run parameter or come from a preflight step that reads the actual raw partition.

It should not be derived from:

- scheduler clock
- notebook execution timestamp

### Control 2. Add a preflight raw-partition check

Before `eldermark_staged_transform`, add a preflight step that:

- checks the intended raw partition exists
- counts files
- records the selected partition date
- fails fast if nothing landed

### Control 3. Persist run metadata

Each daily publish should record:

- business date
- raw partition path
- transform completion time
- downstream view refresh completion time
- snapshot publish version

### Control 4. Block publish on partition mismatch

If the operator-selected business date does not match the landed raw partition being used, stop before silver rebuild.

### Control 5. Keep the last-good snapshot

If the intended date run fails:

- do not overwrite `latest.json` with bad or partial output
- keep serving the last-good snapshot with freshness warning

## Operator Checklist

Use this exact sequence on run day:

1. confirm raw lake partition exists
2. write down explicit `date_partition`
3. run `eldermark_staged_transform`
4. run `mar_gold_views` if MAR/medication views need to be refreshed
5. run `tool_context_views`
6. run `analyst_context_qa`
7. run `census_quality_audit`
8. sanity-check gold/tool-context outputs
9. run `snapshot_publish`
10. verify `/api/platform/snapshot-health`
11. verify `/api/platform/bootstrap`

## Current Repo Notes

The repo now reflects this date rule in both workflow scaffolds:

- [daily_platform_publish.json](/Users/eric/CareEngineMain/alamo-platform-app/databricks/workflows/daily_platform_publish.json)
- [daily_snapshot_refresh.json](/Users/eric/CareEngineMain/alamo-platform-app/databricks/workflows/daily_snapshot_refresh.json)

They intentionally use:

- `date_partition=<business-date-YYYY-MM-DD>`

instead of assuming scheduler time is the correct partition.
