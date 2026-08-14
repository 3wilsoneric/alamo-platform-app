import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runCopilotTool, resetAnalysisSession } from "../server/copilot-tools.mjs";

function assertSnapshotPublishesFullHistory() {
  const source = readFileSync("databricks/notebooks/snapshot_publish.py", "utf8");
  const fullHistoryAssignments = [
    "incident_monthly_rows",
    "resident_episode_rows",
    "resident_flow_weekly_rows",
    "resident_flow_monthly_rows",
    "census_weekly_rows",
    "medication_compliance_rows"
  ];

  for (const assignment of fullHistoryAssignments) {
    const pattern = new RegExp(`${assignment}\\s*=\\s*(?:optional_rows|required_rows)\\([\\s\\S]*?\\n\\s*\\)`, "m");
    const block = source.match(pattern)?.[0] ?? "";
    assert.ok(block, `${assignment}: expected snapshot publish query block`);
    assert.doesNotMatch(block, /add_months\(current_date\(\),\s*-/i, `${assignment}: should publish full available history, not a rolling window`);
  }

  for (const assignment of ["resident_flow_weekly_rows", "census_weekly_rows"]) {
    const pattern = new RegExp(`${assignment}\\s*=\\s*(?:optional_rows|required_rows)\\([\\s\\S]*?\\n\\s*\\)`, "m");
    const block = source.match(pattern)?.[0] ?? "";
    assert.match(
      block,
      /week_start\s*>=\s*trunc\(add_months\(\{SNAPSHOT_AS_OF_SQL\},\s*-52\),\s*'MM'\)/i,
      `${assignment}: weekly transport should use the governed 52-month operating window`
    );
    assert.match(
      block,
      /week_start\s*<=\s*\{SNAPSHOT_AS_OF_SQL\}/i,
      `${assignment}: weekly transport should not extend past the governed business date`
    );
  }
}

assertSnapshotPublishesFullHistory();

function assertSnapshotTransportDedupe() {
  const source = readFileSync("databricks/notebooks/snapshot_publish.py", "utf8");
  const platformDataSource = readFileSync("server/platform-data.mjs", "utf8");
  const communitySnapshotBlock =
    source.match(/def build_community_snapshots\([\s\S]*?\n\s*return snapshots/)?.[0] ?? "";

  assert.ok(communitySnapshotBlock, "expected community snapshot builder");
  assert.match(
    communitySnapshotBlock,
    /"incidentDetails":\s*\[\]/,
    "community snapshots should hydrate incident details from the canonical tool-context collection"
  );
  assert.doesNotMatch(
    communitySnapshotBlock,
    /facility_incident_details/,
    "community snapshots must not duplicate canonical incident-detail narratives"
  );
  assert.match(
    platformDataSource,
    /canonicalIncidentDetails[\s\S]*?tables\?\.incident_detail_history[\s\S]*?incidentDetails:\s*canonicalIncidentDetails\.filter/,
    "the community endpoint should hydrate incident details from the canonical tool-context collection"
  );
  const communitiesBuilder =
    source.match(/def build_communities_dashboard\(\):[\s\S]*?\n\s*return \{[\s\S]*?\n\s*\}/)?.[0] ?? "";
  assert.match(
    communitiesBuilder,
    /"incidentDetails":\s*\[\]/,
    "the communities payload must not duplicate canonical incident-detail narratives"
  );
  assert.match(
    source,
    /def build_payload_size_report\([\s\S]*?"largest_tool_tables"/,
    "snapshot publishing should report the largest payload components"
  );
  assert.match(
    source,
    /"payload_headroom_bytes":\s*payload_size_limit_bytes\s*-\s*payload_size_bytes/,
    "successful snapshot publishing should report remaining contract headroom"
  );
}

assertSnapshotTransportDedupe();

function assertWorkflowCensusGate(workflowPath) {
  const workflow = JSON.parse(readFileSync(workflowPath, "utf8"));
  const tasks = new Map((workflow.tasks ?? []).map((task) => [task.task_key, task]));
  const censusTask = tasks.get("census_quality_audit");
  const snapshotTask = tasks.get("snapshot_publish");
  const toolContextTask = tasks.get("tool_context_views");
  const analystQaTask = tasks.get("analyst_context_qa");
  const marTask = tasks.get("mar_gold_views");
  assert.ok(censusTask, `${workflowPath}: expected census_quality_audit task`);
  assert.ok(snapshotTask, `${workflowPath}: expected snapshot_publish task`);
  assert.ok(toolContextTask, `${workflowPath}: expected tool_context_views task`);
  assert.ok(analystQaTask, `${workflowPath}: expected analyst_context_qa task`);
  assert.ok(marTask, `${workflowPath}: expected mar_gold_views task`);
  assert.equal(
    censusTask.notebook_task?.notebook_path,
    "/Workspace/Shared/alamo-platform/census_quality_audit",
    `${workflowPath}: census_quality_audit should point to the census audit notebook`
  );
  assert.ok(
    (censusTask.depends_on ?? []).some((dependency) => dependency.task_key === "analyst_context_qa"),
    `${workflowPath}: census_quality_audit should depend on analyst_context_qa`
  );
  assert.ok(
    (snapshotTask.depends_on ?? []).some((dependency) => dependency.task_key === "census_quality_audit"),
    `${workflowPath}: snapshot_publish should be gated by census_quality_audit`
  );
  assert.equal(
    marTask.notebook_task?.base_parameters?.date_partition,
    "<business-date-YYYY-MM-DD>",
    `${workflowPath}: mar_gold_views should receive the same business date as the source partition`
  );
  assert.equal(
    toolContextTask.notebook_task?.base_parameters?.date_partition,
    "<business-date-YYYY-MM-DD>",
    `${workflowPath}: tool_context_views should receive the same business date as the source partition`
  );
  assert.equal(
    analystQaTask.notebook_task?.base_parameters?.date_partition,
    "<business-date-YYYY-MM-DD>",
    `${workflowPath}: analyst_context_qa should receive the same business date as the source partition`
  );
  assert.equal(
    censusTask.notebook_task?.base_parameters?.date_partition,
    "<business-date-YYYY-MM-DD>",
    `${workflowPath}: census_quality_audit should receive the same business date as the source partition`
  );
  assert.equal(
    snapshotTask.notebook_task?.base_parameters?.date_partition,
    "<business-date-YYYY-MM-DD>",
    `${workflowPath}: snapshot_publish should receive the same business date as the source partition`
  );
  assert.ok(
    (toolContextTask.depends_on ?? []).some((dependency) => dependency.task_key === "mar_gold_views"),
    `${workflowPath}: tool_context_views should depend on governed gold/MAR data`
  );
  if (workflowPath.includes("daily_platform_publish")) {
    for (const retiredTask of ["report_publish", "report_analysis_publish", "briefing_publish"]) {
      assert.ok(!tasks.has(retiredTask), `${workflowPath}: retired ${retiredTask} task must not return`);
    }
  }
}

assertWorkflowCensusGate("databricks/workflows/daily_platform_publish.json");
assertWorkflowCensusGate("databricks/workflows/daily_snapshot_refresh.json");

function assertCensusTransformContracts() {
  const transformSource = readFileSync("databricks/notebooks/eldermark_staged_transform.py", "utf8");
  const censusRebuildSource = readFileSync("databricks/notebooks/eldermark_census_rebuild.py", "utf8");
  const censusFastCheckSource = readFileSync("databricks/notebooks/census_fast_check.py", "utf8");
  const toolContextSource = readFileSync("databricks/notebooks/tool_context_views.py", "utf8");
  const snapshotSource = readFileSync("databricks/notebooks/snapshot_publish.py", "utf8");
  const censusAuditSource = readFileSync("databricks/notebooks/census_quality_audit.py", "utf8");
  const platformDataSource = readFileSync("server/platform-data.mjs", "utf8");
  const platformOverviewSource = readFileSync("server/tools/platform-overview.mjs", "utf8");
  const residentToolsSource = readFileSync("server/tools/residents.mjs", "utf8");
  const snapshotStatusSource = readFileSync("server/snapshot-status.mjs", "utf8");
  const qaSource = readFileSync("databricks/notebooks/analyst_context_qa.py", "utf8");
  const marSource = readFileSync("databricks/notebooks/mar_gold_views.py", "utf8");

  assert.match(
    transformSource,
    /def build_leave_intervals\(\)[\s\S]*?From_Date_dt[\s\S]*?To_Date_dt/,
    "staged transform should normalize informational resident leave status"
  );
  assert.match(
    transformSource,
    /join\(loa_active,\s*on=\["Facility",\s*"Res_Number"\],\s*how="left"\)/,
    "resident leave status must match both facility and resident number"
  );
  assert.doesNotMatch(
    transformSource,
    /Facility[^\n]*(?:==|isin\()[^\n]*["']337["'][\s\S]{0,300}(?:leave|loa)|(?:leave|loa)[^\n]*Facility[^\n]*(?:==|isin\()[^\n]*["']337["']/i,
    "San Pablo must not have a facility-specific leave rule"
  );
  for (const [label, sourceText] of [
    ["staged transform", transformSource],
    ["census recovery", censusRebuildSource]
  ]) {
    assert.match(sourceText, /spark\.createDataFrame\([\s\S]*?month_bucket string, snapshot_date date/, `${label} should use one set-based monthly calendar`);
    assert.doesNotMatch(sourceText, /how="left_anti"/, `${label} should include admitted residents who are on temporary leave`);
    assert.doesNotMatch(sourceText, /reduce\(DataFrame\.unionByName,\s*snapshots\)/, `${label} should not build 52 separate census branches`);
  }
  const activeFinalBlock = transformSource.match(/"is_active_final",[\s\S]*?\.cast\("integer"\),/)?.[0] ?? "";
  assert.ok(activeFinalBlock, "expected is_active_final resident flag block");
  assert.doesNotMatch(
    activeFinalBlock,
    /is_on_loa|is_on_loa_flag/,
    "temporary leave must not remove an admitted resident from the active census roster"
  );
  assert.doesNotMatch(censusRebuildSource, /read_leave_silver/, "census recovery should not subtract leave rows");
  assert.doesNotMatch(censusAuditSource, /LEFT ANTI JOIN\s+leave_intervals/i, "census audit should include temporary leave residents");

  assert.match(
    marSource,
    /dbutils\.widgets\.text\("date_partition",\s*""\)[\s\S]*?Missing required widget: date_partition/,
    "MAR gold views should require the explicit business date"
  );
  assert.match(
    marSource,
    /GOVERNED_START_SQL[\s\S]*?AS_OF_SQL/,
    "MAR gold views should compile validated governed date bounds"
  );
  assert.doesNotMatch(
    marSource,
    /current_date\(\)|date\('2021-01-01'\)/,
    "MAR gold views should not leak wall-clock or hard-coded date bounds into published analytics"
  );
  for (const viewName of [
    "v_tool_mar_prn_effectiveness_90d",
    "v_tool_mar_medication_orders_current"
  ]) {
    assert.match(
      toolContextSource,
      new RegExp(`create_view\\(\\s*"${viewName}"`),
      `tool context views should publish ${viewName}`
    );
  }
  const marExceptionToolBlock = toolContextSource.match(/"v_tool_mar_exception_detail_90d",\s*f"""[\s\S]*?"""\s*\)/)?.[0] ?? "";
  assert.ok(marExceptionToolBlock, "expected v_tool_mar_exception_detail_90d block");
  assert.match(
    marExceptionToolBlock,
    /AND\s*\(administration_outcome\s*=\s*'not_given'\s+OR\s+is_over_60_minutes_late\s*=\s*1\)/i,
    "MAR exception detail should be limited to canonical not-given outcomes or administrations over 60 minutes late"
  );
  assert.doesNotMatch(
    marExceptionToolBlock,
    /unresolved schedule/i,
    "MAR exception detail should not classify unresolved schedules as true exceptions"
  );
  assert.match(
    snapshotSource,
    /"version":\s*8/,
    "snapshot publish should expose MAR contract version 8"
  );
  for (const assignment of [
    "mar_exception_rows",
    "mar_prn_effectiveness_rows",
    "mar_medication_order_rows"
  ]) {
    const block = snapshotSource.match(new RegExp(`${assignment}\\s*=\\s*(?:required|optional)_rows\\([\\s\\S]*?\\n\\s*\\)`))?.[0] ?? "";
    assert.ok(block, `expected ${assignment} snapshot query block`);
    assert.doesNotMatch(block, /LIMIT\s+10000/i, `${assignment} should not be silently capped at 10,000 rows`);
  }
  for (const manifestLabel of [
    "MAR exception detail",
    "MAR PRN effectiveness detail",
    "current MAR medication orders"
  ]) {
    assert.match(
      snapshotSource,
      new RegExp(`manifest_[a-z_]+", "${manifestLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      `snapshot validation should reconcile ${manifestLabel} against the tool-context manifest`
    );
  }
  assert.match(
    snapshotSource,
    /elif\s+audit\[audit_key\]\s*!=\s*expected_rows:[\s\S]*?payload is incomplete/,
    "snapshot validation should fail when a published MAR payload does not match its manifest count"
  );
  for (const qaCheck of ["mar-current-orders-present", "mar-prn-present"]) {
    assert.match(
      qaSource,
      new RegExp(qaCheck),
      `Databricks QA should include ${qaCheck}`
    );
  }

  assert.match(
    transformSource,
    /CENSUS_HISTORY_MONTHS\s*=\s*52/,
    "census transform should use the bounded 52-month operating window"
  );
  assert.doesNotMatch(
    transformSource,
    /dbutils\.widgets\.(?:text|dropdown)\("(?:catalog|silver_schema|census_history_months|run_mode)"/,
    "census transform should expose only the normal date_partition parameter"
  );
  assert.doesNotMatch(
    transformSource,
    /run_mode|census_only/,
    "the production transform should always run its normal full-publish path"
  );
  assert.match(
    censusRebuildSource,
    /dbutils\.widgets\.text\("date_partition",\s*""\)/,
    "census rebuild recovery notebook should only require the operator's normal date_partition widget"
  );
  assert.doesNotMatch(
    censusRebuildSource,
    /dbutils\.widgets\.(?:text|dropdown)\("(?:catalog|silver_schema|census_history_months|run_mode)"/,
    "census rebuild recovery notebook should not expose extra operator parameters"
  );
  assert.doesNotMatch(
    censusRebuildSource,
    /\.(?:cache|persist)\(/,
    "census rebuild recovery notebook must not use Spark cache/persist on serverless compute"
  );
  assert.match(
    censusRebuildSource,
    /CENSUS_HISTORY_MONTHS\s*=\s*52/,
    "census rebuild recovery notebook should use the bounded 52-month operating window"
  );
  assert.doesNotMatch(
    censusRebuildSource,
    /falling back to stable path|spark\.read\.parquet\(stable_table_path\("Resident"\)\)/,
    "census rebuild should not bypass an unreadable governed resident table"
  );
  assert.match(
    censusRebuildSource,
    /required_columns\s*=\s*\{[\s\S]*?is_countable_resident[\s\S]*?_transform_partition[\s\S]*?missing governed columns/,
    "census rebuild should require governed countability and exact-partition columns"
  );
  for (const [label, source] of [
    ["silver transform", transformSource],
    ["census rebuild", censusRebuildSource]
  ]) {
    assert.match(
      source,
      /eligible_residents\s*=\s*resident_df\.filter\(F\.col\("is_countable_resident"\)\s*==\s*1\)/,
      `${label} should count only explicitly governed residents`
    );
    assert.doesNotMatch(
      source,
      /eligible_residents\s*=\s*resident_df\.filter\(F\.coalesce\(F\.col\("is_countable_resident"\),\s*F\.lit\(1\)\)/,
      `${label} must not default missing countability governance to included`
    );
  }
  assert.match(
    transformSource,
    /AS_OF_DATE\s*=\s*datetime\.strptime\(date_partition,\s*"%Y-%m-%d"\)\.date\(\)/,
    "census transform should anchor all dated calculations to date_partition"
  );
  assert.doesNotMatch(
    transformSource,
    /date\.today\(\)|F\.current_date\(\)/,
    "census transform should not use wall-clock dates for resident/census logic"
  );
  assert.doesNotMatch(
    transformSource,
    /REFRESH\s+TABLE/i,
    "staged transform must not use REFRESH TABLE because the workflow runs on serverless compute"
  );
  assert.doesNotMatch(
    transformSource,
    /\.(?:cache|persist)\(/,
    "staged transform must not use Spark cache/persist because serverless compute rejects PERSIST TABLE"
  );
  assert.match(
    transformSource,
    /eligible_residents\s*=\s*resident_df\.filter\([\s\S]*?is_countable_resident[\s\S]*?\)/,
    "census snapshot should filter through is_countable_resident"
  );
  assert.match(
    transformSource,
    /\.agg\(F\.countDistinct\("Res_Number"\)\.alias\("census"\)\)/,
    "monthly census should count distinct residents, not resident rows"
  );
  assert.match(
    transformSource,
    /snapshot_date\s*=\s*min\(month_end,\s*AS_OF_DATE\)[\s\S]*?F\.col\("r\.Discharge_Date_dt"\)\s*>\s*F\.col\("m\.snapshot_date"\)/,
    "monthly census should exclude residents discharged on or before the governed snapshot date"
  );
  assert.match(
    transformSource,
    /NON_COUNTABLE_RESIDENT_PATTERN\s*=\s*r".*test\|fake\|dummy\|sample\|training\|demo/s,
    "resident transform should flag fake/test/training residents"
  );
  assert.match(
    transformSource,
    /Not_a_Resident[\s\S]*?source_not_a_resident[\s\S]*?is_countable_resident/s,
    "resident transform should exclude ElderMark Not_a_Resident rows before census is built"
  );
  assert.match(
    transformSource,
    /TRANSFORM_CENSUS_SUMMARY/,
    "resident transform should print a fast census summary before the full publish chain"
  );
  assert.match(
    transformSource,
    /"Res_Unit_History":\s*\["Move_In",\s*"Move_Out",\s*"Physical_Move_In_Date",\s*"Physical_Move_Out_Date",\s*"Create_Date"\]/,
    "unit history transform should parse actual ElderMark move date columns, not stale Start_Date/End_Date placeholders"
  );
  assert.doesNotMatch(
    transformSource,
    /"Res_Unit_History":\s*\["Start_Date",\s*"End_Date"\]/,
    "unit history transform should not reference nonexistent Start_Date/End_Date fields"
  );
  assert.match(
    transformSource,
    /def validate_silver_table_readable\(table_name: str\)[\s\S]*?spark\.table\(fqn\)\.limit\(1\)\.collect\(\)/,
    "silver transform should read back every registered table so Parquet/schema mismatches fail at the source"
  );
  assert.match(
    transformSource,
    /register_silver_table\(table_name\)[\s\S]*?validate_silver_table_readable\(table_name\)/,
    "silver transform should validate readability immediately after table registration"
  );
  for (const [label, source] of [
    ["silver transform", transformSource],
    ["census rebuild", censusRebuildSource]
  ]) {
    assert.match(
      source,
      /def move_path\([\s\S]*?dbutils\.fs\.mv\([\s\S]*?not path_exists\(target\)/,
      `${label} should verify every filesystem promotion move`
    );
    assert.match(
      source,
      /def validate_parquet_path\([\s\S]*?spark\.read\.parquet\(path\)\.limit\(1\)\.collect\(\)/,
      `${label} should prove staged and promoted Parquet is readable`
    );
    assert.match(
      source,
      /rollback_table_path[\s\S]*?rollback_promotion[\s\S]*?prior stable dataset and table were restored/,
      `${label} should retain and restore the prior stable dataset when publication fails`
    );
    assert.doesNotMatch(
      source,
      /dbutils\.fs\.rm\(stable_target,\s*recurse=True\)\s*\n\s*dbutils\.fs\.mv\(staging_target,\s*stable_target/,
      `${label} must not destroy stable data before an unchecked promotion move`
    );
    assert.match(
      source,
      /def is_missing_path_error\([\s\S]*?PATH_NOT_FOUND[\s\S]*?def path_exists\([\s\S]*?if is_missing_path_error\(exc\)[\s\S]*?raise RuntimeError/,
      `${label} should distinguish a missing path from storage or permission failures`
    );
  }
  for (const [label, source] of [
    ["tool context", toolContextSource],
    ["census fast check", censusFastCheckSource]
  ]) {
    assert.match(
      source,
      /def is_missing_table_error\([\s\S]*?TABLE_OR_VIEW_NOT_FOUND[\s\S]*?raise RuntimeError\(f"Could not inspect required table or view/,
      `${label} should not hide broken, forbidden, or incompatible tables as absent`
    );
  }
  assert.match(
    toolContextSource,
    /def sql_safe_date/,
    "tool context views should parse source dates through one safe SQL helper"
  );
  assert.match(
    toolContextSource,
    /day_month_date[\s\S]*?THEN \{day_month_date\}/,
    "tool context views should parse ElderMark bang dates as day!month!year"
  );
  assert.doesNotMatch(
    toolContextSource,
    /month_day_date|bang_first|bang_second/,
    "tool context views should not reinterpret ElderMark bang dates month-first"
  );
  assert.match(
    toolContextSource,
    /f"\{candidate\}_dt"/,
    "tool context views should prefer staged transform *_dt date columns"
  );
  assert.match(
    toolContextSource,
    /def refresh_incident_source_view\(\)[\s\S]*?create_view\([\s\S]*?"v_incidents"[\s\S]*?FROM \{source\}\.res_incident i[\s\S]*?refresh_incident_source_view\(\)/,
    "tool context views should rebind v_incidents after each silver schema replacement"
  );
  assert.doesNotMatch(
    toolContextSource,
    /ALTER TABLE|restore_legacy_transform_date_columns|ADD COLUMNS \(`_transform_date` STRING\)/,
    "tool context views must not mutate silver tables to repair legacy view schemas"
  );
  assert.match(
    toolContextSource,
    /def refresh_mar_source_view\(\)[\s\S]*?create_view\([\s\S]*?"v_mar"[\s\S]*?FROM \{source\}\.med_delivery d[\s\S]*?refresh_mar_source_view\(\)/,
    "tool context views should rebind v_mar after each silver schema replacement"
  );
  assert.match(
    toolContextSource,
    /def validate_required_source_views\(\)[\s\S]*?v_occupancy[\s\S]*?v_active_residents[\s\S]*?v_census[\s\S]*?v_incidents[\s\S]*?v_mar[\s\S]*?v_medication_compliance[\s\S]*?v_refusal_by_medication[\s\S]*?v_documentation_gaps[\s\S]*?validate_required_source_views\(\)/,
    "tool context views should validate every retained gold dependency before creating tool views"
  );
  assert.match(
    toolContextSource,
    /def rebind_existing_view\([\s\S]*?information_schema\.views[\s\S]*?CREATE OR REPLACE VIEW[\s\S]*?rebinding its stored definition/,
    "tool context source validation should rebind stale stored definitions without inventing replacement logic"
  );
  assert.match(
    toolContextSource,
    /try_cast\([\s\S]*? as date\)/,
    "tool context views should tolerate malformed ElderMark date strings"
  );
  assert.match(
    toolContextSource,
    /Not_a_Resident/,
    "tool context views should derive countability from legacy Not_a_Resident when explicit countability columns are absent"
  );
  assert.match(
    toolContextSource,
    /v_tool_resident_episode_history[\s\S]*?nullif\(trim\(q\.resident_name\), ''\)[\s\S]*?nullif\(trim\(p\.resident_name\), ''\)/,
    "resident episode history should resolve discharged resident names from the historical countability source before the current profile"
  );
  assert.match(
    toolContextSource,
    /cast_fn = "try_cast" if cast_type\.lower\(\) in \{[\s\S]*?"int"[\s\S]*?"double"[\s\S]*?\} else "cast"[\s\S]*?refs\.append\(f"\{cast_fn\}\(\{alias\}\.`\{column\}` as \{cast_type\}\)"\)/,
    "tool context dynamic numeric fields should use try_cast for source-schema compatibility"
  );
  assert.doesNotMatch(
    toolContextSource,
    /to_date\(\{alias\}\.`\{raw\}`\)/,
    "tool context views should not cast raw bang-delimited ElderMark date strings with to_date"
  );
  assert.doesNotMatch(
    toolContextSource,
    /WINDOW_AS_OF_SQL\s*=\s*"current_date\(\)"/,
    "tool context views should not use wall-clock current_date as the default analysis window"
  );
  const toolCensusMonthlyBlock = toolContextSource.match(/"v_tool_census_monthly_by_community",\s*f"""[\s\S]*?"""\s*\)/)?.[0] ?? "";
  assert.ok(toolCensusMonthlyBlock, "expected v_tool_census_monthly_by_community block");
  assert.match(
    toolCensusMonthlyBlock,
    /WHERE\s+c\.month_bucket\s*<=\s*date_format\(\{WINDOW_AS_OF_SQL\},\s*'yyyy-MM'\)/i,
    "tool census monthly view should not expose months after the requested as-of month"
  );
  assert.match(
    toolContextSource,
    /date_partition was not supplied and tool_context_views could not derive an as-of date/,
    "tool context views should fail if no explicit partition or governed census date is available"
  );
  assert.match(
    censusAuditSource,
    /resident_columns = table_columns\("resident"\)/,
    "census quality audit should inspect the resident schema before referencing optional columns"
  );
  assert.match(
    censusAuditSource,
    /dbutils\.widgets\.text\("date_partition",\s*""\)/,
    "census quality audit should accept the same date_partition used by the source transform"
  );
  assert.doesNotMatch(
    censusAuditSource,
    /current_date\(\)/,
    "census quality audit should use its as-of date instead of the Databricks wall clock"
  );
  assert.doesNotMatch(
    censusAuditSource,
    /date\.today\(\)/,
    "census quality audit should not use the notebook run date as a fallback"
  );
  assert.match(
    censusAuditSource,
    /latest_gold_census_month[\s\S]*?> AS_OF_MONTH[\s\S]*?gold census extends past as-of month/,
    "census quality audit should fail if gold census leaks past the requested as-of month"
  );
  assert.match(
    censusAuditSource,
    /Transform partition vs governed census month/,
    "census quality audit should display the source transform partition beside the governed census month"
  );
  assert.match(
    censusAuditSource,
    /resident_transform_partition[\s\S]*?census_transform_partition[\s\S]*?latest_silver_census_month/,
    "census quality audit should summarize resident/census transform partitions and latest silver census month"
  );
  assert.match(
    censusAuditSource,
    /gold census extends past resident transform partition month[\s\S]*?gold census extends past census transform partition month/,
    "census quality audit should fail if published census extends beyond the source transform partition"
  );
  assert.match(
    censusAuditSource,
    /WITH gold_census AS \([\s\S]*?bounds AS \([\s\S]*?min\(month_bucket\)[\s\S]*?max\(month_bucket\)[\s\S]*?FROM gold_census/,
    "census recalculation should compare only the month window actually published to gold"
  );
  assert.doesNotMatch(
    censusAuditSource,
    /bounds AS \([\s\S]{0,300}?trunc\(min\(Admit_Date_dt\)/,
    "census recalculation should not flag resident history outside the bounded gold window"
  );
  assert.match(
    censusAuditSource,
    /resident_not_resident_expr = sql_value\("r", resident_columns, \["Not_a_Resident"/,
    "census quality audit should support legacy Not_a_Resident countability"
  );
  assert.doesNotMatch(
    censusAuditSource,
    /coalesce\(is_countable_resident,\s*1\)/,
    "census quality audit should not directly reference optional is_countable_resident"
  );

  const profileBlock = toolContextSource.match(/"v_tool_resident_profile",\s*f"""[\s\S]*?"""\s*\)/)?.[0] ?? "";
  assert.ok(profileBlock, "expected v_tool_resident_profile block");
  assert.match(profileBlock, /v_tool_resident_countability_audit/, "resident profile should join countability audit");
  assert.match(profileBlock, /JOIN\s+countability\s+q/i, "resident profile should require a countability audit match");
  assert.doesNotMatch(profileBlock, /LEFT\s+JOIN\s+countability\s+q/i, "resident profile should not default missing countability matches to countable");
  assert.match(profileBlock, /WHERE\s+q\.is_countable_resident\s*=\s*1/i, "resident profile should exclude non-countable residents");
  const toolContextRawActiveReferences = toolContextSource.match(/FROM\s+\{target\}\.v_active_residents\b/gi) ?? [];
  assert.equal(toolContextRawActiveReferences.length, 1, "only the governed resident profile builder should read raw active residents");

  const episodeBlock = toolContextSource.match(/"v_tool_resident_episode_history",\s*f"""[\s\S]*?"""\s*\)/)?.[0] ?? "";
  assert.ok(episodeBlock, "expected v_tool_resident_episode_history block");
  assert.match(episodeBlock, /v_tool_resident_countability_audit/, "resident episode history should join countability audit");
  assert.match(episodeBlock, /coalesce\(q\.is_countable_resident,\s*1\)\s*=\s*1/i, "resident episode history should exclude non-countable residents");
  assert.match(
    episodeBlock,
    /AS discharge_destination/i,
    "resident episode history should preserve destination-only discharge evidence"
  );
  assert.match(
    snapshotSource,
    /"discharge_destination":\s*normalize_nullable\(row\["discharge_destination"\]\)/,
    "snapshot publishing should preserve destination-only discharge evidence"
  );

  const weeklyCensusBlock = toolContextSource.match(/"v_tool_census_weekly_by_community",\s*f"""[\s\S]*?"""\s*\)/)?.[0] ?? "";
  assert.ok(weeklyCensusBlock, "expected v_tool_census_weekly_by_community block");
  assert.match(weeklyCensusBlock, /coalesce\(\{DATE_PARTITION_AS_OF_SQL\},\s*max\(snapshot_date\)\) AS report_end_date/, "weekly census should stop at the explicit source partition when provided");
  assert.match(
    weeklyCensusBlock,
    /to_date\(concat\(min\(month_bucket\),\s*'-01'\)\)\s+AS history_start_date/,
    "weekly census should begin at the first governed census month, not an untrusted legacy episode date"
  );
  assert.match(weeklyCensusBlock, /date_sub\(max\(b\.report_end_date\),\s*pmod\(dayofweek\(max\(b\.report_end_date\)\) \+ 5,\s*7\)\) AS end_week/, "weekly census should derive the final Monday week start without rolling past the as-of date");
  assert.doesNotMatch(weeklyCensusBlock, /current_date\(\)/, "weekly census should not extend to the Databricks wall clock");
  assert.match(
    weeklyCensusBlock,
    /count\(\s*DISTINCT CASE[\s\S]*?\)\s+AS census/i,
    "weekly census should count distinct active residents at each observation date"
  );
  assert.match(weeklyCensusBlock, /prior_census_date/, "weekly census should publish its exact prior observation date");
  assert.doesNotMatch(weeklyCensusBlock, /res_leave_of_absence|current_leave|prior_leave/i, "weekly census should include temporary leave residents");
  assert.match(weeklyCensusBlock, /AS census_7d_prior/i, "weekly census should calculate the census exactly seven days earlier");
  assert.match(weeklyCensusBlock, /census - census_7d_prior AS census_change_7d/i, "weekly census should publish a reconciled seven-day change");

  for (const viewName of ["v_tool_resident_flow_weekly_by_community", "v_tool_resident_flow_monthly_by_community"]) {
    const flowBlock = toolContextSource.match(new RegExp(`"${viewName}",\\s*f"""[\\s\\S]*?"""\\s*\\)`))?.[0] ?? "";
    assert.ok(flowBlock, `expected ${viewName} block`);
    assert.match(
      flowBlock,
      /coalesce\(\{DATE_PARTITION_AS_OF_SQL\},\s*max\(snapshot_date\)\)/,
      `${viewName} should stop at the explicit source partition when provided`
    );
    assert.doesNotMatch(flowBlock, /current_date\(\)/, `${viewName} should not extend to the Databricks wall clock`);
  }
  const weeklyFlowBlock = toolContextSource.match(/"v_tool_resident_flow_weekly_by_community",\s*f"""[\s\S]*?"""\s*\)/)?.[0] ?? "";
  assert.match(
    weeklyFlowBlock,
    /to_date\(concat\(min\(month_bucket\),\s*'-01'\)\)\s+AS history_start_date/,
    "weekly resident flow should begin at the first governed census month, not an untrusted legacy episode date"
  );
  assert.match(weeklyFlowBlock, /CROSS JOIN weeks/i, "weekly resident flow should include quiet calendar weeks");
  assert.match(weeklyFlowBlock, /coalesce\(m\.admissions,\s*0\)/i, "weekly resident flow should publish zero admissions for quiet weeks");
  assert.match(weeklyFlowBlock, /coalesce\(m\.discharges,\s*0\)/i, "weekly resident flow should publish zero discharges for quiet weeks");
  assert.match(
    residentToolsSource,
    /preAggregatedDischargesValue\s*!==\s*null/,
    "weekly resident flow rendering should recognize a loaded zero-discharge column"
  );
  assert.doesNotMatch(
    residentToolsSource,
    /\.filter\(\(row\)\s*=>\s*Number\(row\.intakes\s*\|\|\s*0\)\s*\|\|\s*Number\(row\.discharges\s*\|\|\s*0\)\)/,
    "weekly resident flow rendering should not discard explicit quiet weeks"
  );

  assert.match(qaSource, /resident-profile-countable-only/, "Databricks QA should reject non-countable profile rows");
  assert.match(qaSource, /resident-profile-no-duplicates/, "Databricks QA should reject duplicate current resident profile rows");
  assert.match(qaSource, /resident-episodes-countable-only/, "Databricks QA should reject non-countable resident episode rows");
  assert.match(qaSource, /census-weekly-exact-seven-day-change/, "Databricks QA should reject invalid weekly census intervals");
  assert.match(qaSource, /resident-flow-weekly-contiguous/, "Databricks QA should reject omitted quiet resident-flow weeks");
  assert.match(
    qaSource,
    /dbutils\.widgets\.text\("date_partition",\s*""\)/,
    "Databricks QA should accept the same date_partition used by the source transform"
  );
  assert.match(
    qaSource,
    /QA_AS_OF_SQL/,
    "Databricks QA should anchor freshness windows to the source partition or governed census date"
  );
  assert.doesNotMatch(
    qaSource,
    /current_date\(\)/,
    "Databricks QA should not compare freshness against the notebook run date"
  );

  assert.match(
    snapshotSource,
    /FROM alamohealth\.gold\.v_tool_community_operating_summary/,
    "snapshot publish should build visible community totals from governed operating summary"
  );
  assert.match(
    snapshotSource,
    /dbutils\.widgets\.text\("date_partition",\s*""\)/,
    "snapshot publish should accept an optional date_partition guard"
  );
  assert.match(
    snapshotSource,
    /SNAPSHOT_AS_OF_SQL/,
    "snapshot publish should anchor detail windows to the source partition or governed census date"
  );
  assert.match(
    snapshotSource,
    /"as_of_date": expected_as_of_date/,
    "snapshot publish should expose the governed business date to every runtime path"
  );
  assert.doesNotMatch(
    snapshotSource,
    /current_date\(\)/,
    "snapshot publish should not filter snapshot rows with the notebook run date"
  );
  assert.match(
    snapshotSource,
    /latest governed census month exceeds requested snapshot month/,
    "snapshot publish should fail if census leaks past the requested snapshot month"
  );
  const fencedSnapshotCensusReads = snapshotSource.match(
    /FROM\s+alamohealth\.gold\.v_census\s+WHERE\s+month_bucket\s*<=\s*date_format\(\{SNAPSHOT_AS_OF_SQL\},\s*'yyyy-MM'\)/gi
  ) ?? [];
  assert.ok(
    fencedSnapshotCensusReads.length >= 2,
    "snapshot publish should cap direct census payload reads to the requested snapshot month"
  );
  assert.doesNotMatch(
    snapshotSource,
    /\b(?:FROM|JOIN)\s+alamohealth\.gold\.v_active_residents\b/,
    "snapshot publish should not use raw active residents for visible resident/community data"
  );
  assert.doesNotMatch(
    platformDataSource,
    /\b(?:FROM|JOIN)\s+alamohealth\.gold\.v_active_residents\b/,
    "live platform fallback should not use raw active residents for visible resident/community data"
  );
  assert.doesNotMatch(
    platformDataSource,
    /\bFROM\s+alamohealth\.gold\.v_occupancy\b/,
    "live occupancy endpoint should use governed resident profile counts, not raw occupancy"
  );
  assert.doesNotMatch(
    platformDataSource,
    /add_months\(current_date\(\),\s*-6\)/i,
    "live incident fallback should use the governed census as-of date instead of the Databricks wall clock"
  );
  assert.match(
    platformDataSource,
    /Incident_Date_parsed BETWEEN add_months\(as_of_date, -6\) AND as_of_date/,
    "live incident fallback should enforce both lower and upper governed date bounds"
  );
  assert.doesNotMatch(
    platformOverviewSource,
    /new Date\(\)\.toISOString\(\)\.slice\(0, 7\)/,
    "community profile wording should not infer month-to-date status from the wall clock"
  );
  assert.match(
    platformOverviewSource,
    /formatIncidentPeriodLabel\([\s\S]*?communities\.as_of_date/,
    "community profile wording should use the published data as-of date"
  );
  for (const field of [
    "latestCensusMonth",
    "censusWeeklyMinWeek",
    "censusWeeklyMaxWeek",
    "residentFlowMonthlyMaxMonth"
  ]) {
    assert.match(
      snapshotStatusSource,
      new RegExp(`\\b${field}\\b`),
      `snapshot diagnostics should expose ${field} so date drift is visible`
    );
  }

  const countabilityPublishBlock = snapshotSource.match(/resident_countability_rows\s*=\s*optional_rows\([\s\S]*?FROM alamohealth\.gold\.v_tool_resident_countability_audit[\s\S]*?\n\s*"""\n\s*\)/)?.[0] ?? "";
  assert.ok(countabilityPublishBlock, "snapshot publish should include resident countability audit rows");
  assert.doesNotMatch(
    countabilityPublishBlock,
    /WHERE\s+coalesce\(is_countable_resident,\s*1\)\s*=\s*0/i,
    "snapshot should publish the full countability audit, not only excluded residents"
  );

  assert.match(censusAuditSource, /"ok":\s*not failures/, "census quality audit should publish an explicit ok flag");
  assert.match(
    censusAuditSource,
    /invalid_weekly_change_rows/,
    "census quality audit should reject malformed seven-day census comparisons"
  );
  assert.match(
    snapshotSource,
    /weekly census rows do not represent a reconciled seven-day comparison/,
    "snapshot publish should reject malformed seven-day census comparisons"
  );
  assert.match(censusAuditSource, /CENSUS_QUALITY_SUMMARY=/, "census quality audit should print a machine-readable summary");
  assert.match(censusAuditSource, /raise ValueError\("Census quality audit failed:/, "census quality audit should hard-fail on critical census issues");
  assert.match(
    censusAuditSource,
    /governed_profile_non_countable_count\s*>\s*0[\s\S]*?failures\.append/,
    "census quality audit should fail when non-countable residents reach governed profile rows"
  );
  assert.match(
    censusAuditSource,
    /census_recalc_mismatch_count\s*>\s*0[\s\S]*?failures\.append/,
    "census quality audit should fail when gold census differs from recalculated month-end census"
  );
}

assertCensusTransformContracts();

function flattenActions(result) {
  return (result?.actions ?? []).map((action) => [
    action.label,
    action.route,
    action.url,
    action.prompt
  ].filter(Boolean).join(" "));
}

function assertNoExplorerActions(result, prompt) {
  const leaked = flattenActions(result).filter((text) => /\/explorer\//i.test(text));
  assert.equal(leaked.length, 0, `${prompt}: should not expose Data Explorer actions`);
}

async function run(prompt) {
  const sessionId = `data-depth-${Buffer.from(prompt).toString("hex").slice(0, 24)}`;
  await resetAnalysisSession(sessionId);
  const result = await runCopilotTool({ content: prompt, sessionId });
  assert.equal(result?.handled, true, `${prompt}: expected handled result`);
  assertNoExplorerActions(result, prompt);
  return result;
}

function assertPeriod(result, expectedPeriod, prompt) {
  assert.match(String(result?.trace?.period ?? result?.text ?? ""), new RegExp(expectedPeriod.replace("-", "[- ]?")), `${prompt}: expected period ${expectedPeriod}`);
}

const sanPabloJanuaryCensus = await run("how many clients at San Pablo in January 2026");
assert.equal(sanPabloJanuaryCensus.tool, "census_trend");
assert.equal(sanPabloJanuaryCensus.truthState, "valid_rows");
assert.equal(String(sanPabloJanuaryCensus.trace?.facilityId), "337");
assertPeriod(sanPabloJanuaryCensus, "2026-01", "San Pablo January census");
assert.match(sanPabloJanuaryCensus.text, /139 clients|139 census/i);

const awolPeopleMay = await run("how many people went AWOL in May 2026");
assert.equal(awolPeopleMay.tool, "incident_breakdown");
assert.equal(awolPeopleMay.truthState, "valid_rows");
assertPeriod(awolPeopleMay, "2026-05", "May AWOL people");
assert.match(awolPeopleMay.text, /63 unique residents/i);
assert.match(String(awolPeopleMay.visual?.valueLabel ?? ""), /residents/i);

const sanPabloJanuaryIncidents = await run("incidents San Pablo January 2026");
assert.equal(sanPabloJanuaryIncidents.tool, "incident_breakdown");
assert.equal(sanPabloJanuaryIncidents.truthState, "valid_rows");
assert.equal(String(sanPabloJanuaryIncidents.trace?.facilityId), "337");
assertPeriod(sanPabloJanuaryIncidents, "2026-01", "San Pablo January incidents");
assert.match(sanPabloJanuaryIncidents.text, /474 incidents in January 2026/i);

const santaClaritaAdmissions = await run("give me admissions from January through May 2026 for Santa Clarita");
assert.equal(santaClaritaAdmissions.tool, "detail_list");
assert.equal(santaClaritaAdmissions.truthState, "valid_rows");
assert.equal(String(santaClaritaAdmissions.trace?.facilityId), "345");
assert.match(String(santaClaritaAdmissions.trace?.period ?? ""), /2026-01/);
assert.match(String(santaClaritaAdmissions.trace?.period ?? ""), /2026-05/);
assert.match(String(santaClaritaAdmissions.trace?.dataSource ?? ""), /resident episode history|resident/i);
assert.ok(Number(santaClaritaAdmissions.trace?.rowCount ?? 0) > 0, "Santa Clarita admissions should return records when loaded");

const unavailableFutureDetail = await run("list every AWOL incident from January 2035 by community");
assert.equal(unavailableFutureDetail.tool, "incident_detail_list");
assert.equal(unavailableFutureDetail.truthState, "not_loaded");
assert.equal(unavailableFutureDetail.safeRefusal, true);
assertPeriod(unavailableFutureDetail, "2035-01", "future AWOL detail refusal");
assert.match(unavailableFutureDetail.text, /not available|available range|closest available/i);
assert.doesNotMatch(unavailableFutureDetail.text, /matching records are shown below/i);

const availability = await run("what data periods are available for incident detail?");
assert.equal(availability.tool, "data_availability");
assert.equal(availability.truthState, "valid_rows");
assert.match(availability.text, /incident events are available/i);

console.log("data depth contracts passed (6 prompts)");
