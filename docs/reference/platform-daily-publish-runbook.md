# Platform Daily Publish Runbook

- purpose: provide the exact operator run order for rebuilding and publishing the Alamo Platform snapshot, with the business date handled explicitly so partition/date mismatches do not corrupt the daily publish
- status: active operator runbook
- owners: engineering, data platform
- updated: 2026-08-16
- tags: runbook, databricks, eldermark, snapshot, publish, operations
- labels: operator-guide, daily-run, current-state
- related files:
  - [alamo-platform-app/databricks/notebooks/eldermark_staged_transform.py](/Users/eric/CareEngineMain/alamo-platform-app/databricks/notebooks/eldermark_staged_transform.py)
  - [alamo-platform-app/databricks/notebooks/select_latest_raw_partition.py](/Users/eric/CareEngineMain/alamo-platform-app/databricks/notebooks/select_latest_raw_partition.py)
  - [alamo-platform-app/databricks/notebooks/snapshot_publish.py](/Users/eric/CareEngineMain/alamo-platform-app/databricks/notebooks/snapshot_publish.py)
  - [alamo-platform-app/databricks/workflows/daily_platform_publish.json](/Users/eric/CareEngineMain/alamo-platform-app/databricks/workflows/daily_platform_publish.json)
  - [alamo-platform-app/scripts/windows/Run-ElderMarkPull.ps1](/Users/eric/CareEngineMain/alamo-platform-app/scripts/windows/Run-ElderMarkPull.ps1)
  - [alamo-platform-app/scripts/azure/eldermark-managed-vm-workflow.json](/Users/eric/CareEngineMain/alamo-platform-app/scripts/azure/eldermark-managed-vm-workflow.json)
  - [data-publishing.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/data-publishing.md)

## Purpose

Run the existing Alamo Platform daily pipeline safely for a specific business date.

This runbook assumes the architecture is:

1. VM/source pull lands raw ElderMark files in the lake
2. Databricks stages/cleans those raw files into silver
3. Databricks refreshes the approved gold views
4. Databricks publishes the app snapshot
5. the platform reads the published Azure snapshot

## Production Automation

- Azure VM lifecycle workflow: `EldermarkDailyPullManaged`
- Azure VM start: daily at 02:00 `Mountain Standard Time`
- Windows scheduled task: `Alamo ElderMark Daily Pull Automated`
- ElderMark raw pull: daily at 02:15 Mountain time, with `StartWhenAvailable`
- Azure VM deallocation: four hours after the managed start action
- Databricks job: `alamo_daily_platform_publish_automated`
- job ID: `15217456536962`
- schedule: daily at 05:15 `America/Los_Angeles`
- failure email: `ericwilsonalamo@outlook.com`
- downstream NetSuite census sync: daily at 09:00 in the NetSuite account timezone
- legacy Databricks job: `1090336537239329` (`eldermark_staged_transform_nightly`), intentionally unchanged and unscheduled

The managed Logic App starts VM `adf-ir-rg` using its system-assigned identity;
it does not depend on an operator's Azure connector session. The Windows task
runs the existing `eldermark_pull.py` as `SYSTEM`. Its wrapper loads the eight
existing `alamoadmin` user-level configuration values only into the child
process, forces `ELDERMARK_TRIGGER_DATABRICKS=0`, writes only status messages to
`C:\ProgramData\Alamo\logs\eldermark-automation.log`, clears the process
environment, and unloads the profile hive after the pull. No ElderMark,
Databricks, or Azure credential is copied into the repository or task command.

Databricks begins after the raw pull window. If the upstream pull does not land
a newer complete partition, the job performs a clean no-op and leaves the
last-good snapshot untouched so freshness warnings remain truthful. If the
newest complete raw partition becomes more than two days old, preflight fails
and sends the Databricks failure notification.

The automation order is therefore:

1. 02:00 Mountain: managed Logic App starts the Azure VM.
2. 02:15 Mountain: Windows runs the existing ElderMark extraction.
3. 05:15 Pacific / 06:15 Mountain: Databricks selects and validates the latest complete raw partition, transforms it, runs QA, and publishes the snapshot.
4. 09:00 NetSuite account time: the NetSuite census sync reads the governed Databricks view.

## Automation Rollback

All new automation is additive and can be disabled without deleting it:

1. Pause Databricks job `15217456536962`.
2. Disable Logic App `EldermarkDailyPullManaged`.
3. Disable Windows task `Alamo ElderMark Daily Pull Automated`.
4. Return temporarily to the prior manual process: start the VM, sign into Windows App, and run the existing `C:\Users\alamoadmin\Desktop\eldermark_pull.py`.
5. Use legacy Databricks job `1090336537239329` only as the manual downstream fallback. Do not run both publish jobs concurrently.

The prior Windows task XML is retained at
`C:\ProgramData\Alamo\rollback\Eldermark Daily Pull-20260816.xml`. It points to a
stale script path and requires an interactive login, so restoring it is forensic
rollback only, not a working automation path. The two prior Logic Apps also
remain available but their VM and email connectors return `Unauthorized`; they
must be reauthorized and their daylight-saving schedules corrected before reuse.

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
- `entra_secret_scope=alamo-platform-production`
- `entra_client_secret_key=snapshot-entra-client-secret`

For a one-time attended recovery only, `entra_client_secret` remains accepted as
a direct widget value. Production jobs must use the Databricks secret scope and
must never put the secret in workflow JSON, notebook source, or logs.

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

The business date must be an explicit run parameter or come from a preflight step that reads the actual raw partition. The automated full publish uses `select_latest_raw_partition`, which selects the newest date present across all 32 required ElderMark tables, verifies parquet files for every table, and publishes that exact date as a Databricks task value.

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

The full daily workflow uses:

- `{{tasks.select_latest_raw_partition.values.date_partition}}`

This value comes from raw storage, not scheduler time. An operator can still pass
`date_partition_override=YYYY-MM-DD`; the same preflight verifies that the override
exists for all required tables before any transform runs.

If the selected partition is not newer than the current governed snapshot, the
`new_partition_available` condition excludes the transform and every downstream
task. This preserves the last-good snapshot timestamp and prevents an old source
date from appearing freshly published. An explicit operator override intentionally
bypasses this no-op check for a controlled same-date rebuild.

The shorter manual snapshot refresh intentionally uses:

- `date_partition=<business-date-YYYY-MM-DD>`

Both paths avoid assuming scheduler time is the correct partition.

The automated snapshot publisher reads its Azure client credential from the
Databricks secret scope `alamo-platform-production`, key
`snapshot-entra-client-secret`. Do not place that secret in workflow JSON,
notebook defaults, task parameters, source control, or run logs.
