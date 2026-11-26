// Static contracts for the four owner-approved business definitions in the
// Databricks notebooks: census, length of stay, medication compliance/refusal,
// and incident priority. Reads notebook source only; needs no credentials.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { deriveIncidentPriority } from "../shared/incident-priority.mjs";

const read = (path) => readFileSync(path, "utf8");
const views = read("databricks/notebooks/tool_context_views.py");
const mar = read("databricks/notebooks/mar_gold_views.py");
const snapshot = read("databricks/notebooks/snapshot_publish.py");
const qa = read("databricks/notebooks/analyst_context_qa.py");
const audit = read("databricks/notebooks/census_quality_audit.py");
const transform = read("databricks/notebooks/eldermark_staged_transform.py");
const rebuild = read("databricks/notebooks/eldermark_census_rebuild.py");
const overview = read("databricks/notebooks/overview_report_extract.py");

const block = (source, name) => {
  const found = source.match(new RegExp(`"${name}",\\s*f"""[\\s\\S]*?"""`))?.[0];
  assert.ok(found, `expected view block ${name}`);
  return found;
};
const stripComments = (source) => source.replace(/^\s*#.*$/gm, "").replace(/--.*$/gm, "");

// 1. Census: one canonical daily census from countable admission episodes.
const daily = block(views, "v_tool_census_daily_by_community");
assert.match(daily, /FROM \{target\}\.v_tool_resident_episode_history/, "daily census reads governed admission episodes");
assert.match(
  daily,
  /e\.admit_date <= d\.census_date\s+AND d\.census_date < coalesce\(e\.discharge_date, DATE '9999-12-31'\)/,
  "daily census rule is admit_date <= day < coalesce(discharge_date, far future)"
);
assert.match(daily, /count\(DISTINCT e\.Res_Number\) AS census/, "daily census counts distinct residents");
assert.match(daily, /CENSUS_HISTORY_MONTHS/, "daily census uses the governed 52-month window");
assert.match(views, /CENSUS_HISTORY_MONTHS = 52/);

const monthly = block(views, "v_tool_census_monthly_by_community");
assert.match(monthly, /FROM \{target\}\.v_tool_census_daily_by_community/, "monthly census derives from the daily view");
assert.doesNotMatch(monthly, /v_census\b/, "monthly census must not read the Resident-table census");
assert.match(monthly, /max_by\(census, census_date\) AS census/, "month-end census = daily census on min(month end, as-of)");
assert.match(monthly, /avg\(cast\(census AS double\)\) AS average_daily_census/, "average daily census = mean of daily values");
for (const column of ["Facility", "month_bucket", "snapshot_date", "census", "prior_census", "census_delta", "average_daily_census"]) {
  assert.match(monthly, new RegExp(`AS ${column}\\b|^\\s*${column},`, "m"), `monthly census keeps/adds ${column}`);
}
const weekly = block(views, "v_tool_census_weekly_by_community");
assert.match(weekly, /JOIN \{target\}\.v_tool_census_daily_by_community d[\s\S]*?d\.census_date = o\.census_date/, "weekly census = daily census on census_date");
assert.doesNotMatch(weekly, /v_tool_resident_episode_history/, "weekly census must not recount episodes");

const episode = block(views, "v_tool_resident_episode_history");
assert.doesNotMatch(episode, /coalesce\(q\.is_countable_resident,\s*1\)/, "unmatched episodes must not default to countable");
assert.match(episode, /min\(coalesce\(is_countable_resident, 0\)\)[\s\S]*?cr\.is_countable_resident = 1/, "episodes require a countable audit match");

const order = ["create_resident_episode_history_view()", "create_census_daily_view()", "create_census_monthly_view()", "create_resident_episode_views()"]
  .map((call) => views.indexOf(`\n${call}`));
assert.ok(order.every((index) => index > 0) && order.every((index, i) => i === 0 || index > order[i - 1]), "census owner chain runs episodes -> daily -> monthly -> weekly");

for (const [label, source] of [["transform", transform], ["rebuild", rebuild]]) {
  assert.match(source, /def build_countable_episodes\(resident_df: DataFrame, admittance_df: DataFrame\)/, `${label}: silver census uses countable episodes`);
  assert.match(source, /F\.col\("m\.snapshot_date"\) < F\.coalesce\(F\.col\("r\.discharge_date"\), F\.lit\("9999-12-31"\)/, `${label}: silver census uses the daily rule`);
  assert.doesNotMatch(source, /eligible_residents/, `${label}: silver census no longer counts Resident rows`);
}

for (const checkId of ["census-monthly-equals-daily", "census-published-monthly-equals-daily", "census-weekly-equals-daily", "census-average-daily-equals-daily"]) {
  assert.match(qa, new RegExp(`"${checkId}",\\s*"census",\\s*"critical"`), `QA gate ${checkId} is critical (fails the publish)`);
}
assert.match(qa, /FROM \{target\}\.v_census[\s\S]*?v_tool_census_daily_by_community/, "QA compares gold.v_census with the daily census");
assert.match(qa, /census_definition_reconciliation[\s\S]*?old_resident_table_census[\s\S]*?new_episode_daily_census/, "QA writes the old-vs-new reconciliation report");
assert.match(qa, /critical_failures[\s\S]*?raise ValueError/, "critical QA failures stop the publish");
assert.match(audit, /census_recalc_mismatch_count = int\([\s\S]*?v_tool_census_daily_by_community/, "census audit gates gold census on the daily census");

// 2. Length of stay: two named measures, deprecated aliases kept.
assert.match(episode, /THEN datediff\(b\.discharge_date, b\.admit_date\)\s+END AS completed_stay_los_days/, "completed_stay_los_days = discharge - admit");
const profile = block(views, "v_tool_resident_profile");
assert.match(profile, /datediff\(\{WINDOW_AS_OF_SQL\}[\s\S]*?AS current_length_of_stay_days/, "current LOS = as_of - admit");
assert.match(profile, /AS int\) AS LOS_Days/, "LOS_Days alias kept on the profile");
const operating = block(views, "v_tool_community_operating_summary");
assert.match(operating, /avg\(cast\(p\.current_length_of_stay_days AS double\)\) AS average_current_length_of_stay_days/);
assert.match(operating, /r\.average_current_length_of_stay_days AS average_los_days/, "average_los_days is a documented alias");
assert.match(transform, /"current_length_of_stay_days"[\s\S]*?"completed_stay_los_days"[\s\S]*?DEPRECATED: LOS_Days/, "silver publishes both named measures");
assert.match(snapshot, /"average_current_length_of_stay_days": normalize_float/);
assert.doesNotMatch(stripComments(overview), /\bLOS_Days\b|average_completed_los_days/, "overview extract uses the named measures");

// 3. Medication compliance/refusal: one gold definition.
const compliance = block(mar, "v_mar_compliance_monthly_by_community");
assert.match(compliance, /sum\(CASE WHEN is_prn = 0 AND administration_outcome = 'given' THEN 1 ELSE 0 END\) \/\s*nullif\(sum\(CASE WHEN is_prn = 0 THEN 1 ELSE 0 END\), 0\)/, "compliance = given / scheduled non-PRN");
assert.match(compliance, /prn_given_count/, "PRN reported separately");
const refusal = block(mar, "v_mar_refusal_by_medication");
assert.match(refusal, /CASE WHEN is_prn = 0 THEN is_refusal ELSE 0 END/, "refusal uses the MAR not-given reason flag");
assert.match(mar, /AS is_refusal/);
assert.match(block(views, "v_tool_medication_compliance_monthly"), /FROM \{target\}\.v_mar_compliance_monthly_by_community/);
assert.match(block(views, "v_tool_medication_refusal_summary"), /FROM \{target\}\.v_mar_refusal_by_medication/);
for (const [label, source] of [["tool views", views], ["snapshot", snapshot], ["overview", overview]]) {
  assert.doesNotMatch(stripComments(source), /\.v_medication_compliance\b|\.v_refusal_by_medication\b/, `${label} must not read the external medication views`);
}
assert.match(views, /AND NOT \(\{medication_only\}\)/, "medication-refusal incidents stay excluded from incident counts");

// 4. Incident priority: the Python port matches shared/incident-priority.mjs.
assert.match(snapshot, /shared\/incident-priority\.mjs/, "Python port names the JS source of truth");
const values = [true, false, null];
const cases = [];
for (const sentinelEvent of values) for (const emergencyServicesNotified of values) for (const injuryOccurred of values) {
  cases.push({ sentinelEvent, emergencyServicesNotified, injuryOccurred, expected: deriveIncidentPriority({ sentinelEvent, emergencyServicesNotified, injuryOccurred }) });
}
const python = `
import ast, json, sys
source = open("databricks/notebooks/snapshot_publish.py").read()
ctx = {}
for node in ast.parse(source).body:
    if isinstance(node, ast.FunctionDef) and node.name in {"normalize_str", "_recorded_boolean", "derive_incident_priority", "priority_from_incident"}:
        exec(compile(ast.Module(body=[node], type_ignores=[]), "snapshot", "exec"), ctx)
cases = json.loads(sys.argv[1])
derived = [ctx["derive_incident_priority"](c["sentinelEvent"], c["emergencyServicesNotified"], c["injuryOccurred"]) for c in cases]
yn = {True: "Yes", False: "No", None: ""}
rows = [ctx["priority_from_incident"]({"Sentinel_Event_YN": yn[c["sentinelEvent"]], "Notify_EmergSrvs_YN": yn[c["emergencyServicesNotified"]], "Injuires_YN": yn[c["injuryOccurred"]], "Incident_Category": "Aggressive Behavior"}) for c in cases]
booleans = [ctx["_recorded_boolean"](v) for v in ["Yes", "y", "TRUE", "1", 1, True, "No", "n", "false", "0", 0, False, "", None, "maybe"]]
print(json.dumps({"derived": derived, "rows": rows, "booleans": booleans}))
`;
const result = JSON.parse(execFileSync("python3", ["-I", "-c", python, JSON.stringify(cases)], { encoding: "utf8" }));
assert.deepEqual(result.derived, cases.map((c) => c.expected), "derive_incident_priority matches deriveIncidentPriority for every input");
assert.deepEqual(result.rows, cases.map((c) => c.expected.toUpperCase()), "category text no longer changes priority");
assert.deepEqual(result.booleans, [true, true, true, true, true, true, false, false, false, false, false, false, null, null, null]);
assert.doesNotMatch(stripComments(snapshot.match(/def priority_from_incident[\s\S]*?\n\n\n/)?.[0] ?? ""), /aggression|mental health crisis|death/i);

console.log("Definitions contracts passed: daily census owner + QA gates, named LOS measures, gold MAR compliance/refusal, incident priority parity.");
