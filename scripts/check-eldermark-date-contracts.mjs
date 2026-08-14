import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  cleanDisplayDateText,
  formatDisplayDate,
  formatDisplayDateTime,
  normalizeDisplayDateKey,
  normalizeDisplayTimestamp
} from "../shared/display-date.mjs";
import { formatMonthLabel } from "../shared/period-utils.mjs";

function assert(condition, message, context = null) {
  if (condition) return;
  console.error(`FAILED: ${message}`);
  if (context) console.error(JSON.stringify(context, null, 2));
  process.exit(1);
}

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const displayCases = [
  ["2!1!2026", "2 January 2026"],
  ["1!7!2026", "1 July 2026"],
  ["22!1!2021", "22 January 2021"],
  ["13!2!2026", "13 February 2026"],
  ["2026-02-01T00:00:00.000Z", "1 February 2026"]
];

for (const [input, expected] of displayCases) {
  assert(
    formatDisplayDate(input) === expected,
    "ElderMark/display date parsing changed unexpectedly",
    { input, expected, actual: formatDisplayDate(input) }
  );
}

assert(
  formatMonthLabel("2026-02") === "February 2026",
  "Month-only labels must use the platform's full month-year format"
);
assert(
  formatMonthLabel("February 2026") === "February 2026",
  "Month labels must remain stable when formatted more than once"
);
assert(
  formatMonthLabel("Feb 2026") === "February 2026",
  "Abbreviated input month labels must render with the full English month name"
);
assert(
  formatMonthLabel("not-a-month", { fallback: "unknown month" }) === "unknown month",
  "Malformed month keys must not leak into the interface"
);

assert(
  cleanDisplayDateText("Admitted 1!7!2026.") === "Admitted 1 July 2026.",
  "Raw ElderMark bang dates should be cleaned from rendered answer text"
);
assert(
  cleanDisplayDateText("Admitted 2026-07-01 and reviewed in 2026-07.") ===
    "Admitted 1 July 2026 and reviewed in July 2026.",
  "Internal date and month keys should be cleaned from rendered answer text"
);
assert(
  cleanDisplayDateText("Census Jun 2026; prior month Feb 2026.") ===
    "Census June 2026; prior month February 2026.",
  "Abbreviated month-year labels must be expanded in every rendered result"
);
assert(
  cleanDisplayDateText("Received 2026-07-20 06:30:00.") === "Received 20 July 2026.",
  "Space-separated warehouse timestamps should be cleaned from rendered answer text"
);
assert(
  formatDisplayDate("2!13!2026", { month: "long" }) === "—",
  "Impossible ElderMark bang dates must not be reinterpreted month-first"
);
assert(
  formatDisplayDate("2!1!26", { month: "long" }) === "—",
  "Ambiguous two-digit ElderMark years must not be assigned to a guessed century"
);
assert(
  normalizeDisplayDateKey("2!1!2026") === "2026-01-02",
  "Governed date keys must preserve ElderMark day-month-year semantics"
);
assert(
  normalizeDisplayTimestamp("2026-07-20T06:30:00.000Z") === "2026-07-20T06:30:00.000Z",
  "Incident timestamps must retain their actual time instead of being reduced to a date"
);
assert(
  formatDisplayDateTime("2026-07-20T06:30:00.000Z", { month: "long" }).startsWith("19 July 2026"),
  "Timestamp display must use the shared California reporting timezone"
);

const stagedTransform = readRepoFile("databricks/notebooks/eldermark_staged_transform.py");
assert(
  stagedTransform.includes("day_month_candidate") && !stagedTransform.includes("month_day_candidate"),
  "silver transform must implement one day!month!year parse candidate"
);
assert(
  stagedTransform.includes("THEN {day_month_candidate}") &&
    !stagedTransform.includes("bang_first") &&
    !stagedTransform.includes("bang_second"),
  "silver transform must not infer an alternate order from token ranges"
);
assert(
  stagedTransform.includes("\\\\d{{4}}") && !stagedTransform.includes("concat('20', split("),
  "silver transform must require four-digit ElderMark years instead of guessing a century"
);
assert(
  stagedTransform.includes("ELSE try_cast({text_value} as date)") &&
    stagedTransform.includes("try_cast(concat("),
  "silver transform must use try_cast date parsing so malformed ElderMark dates do not raise under ANSI mode"
);
assert(
  !stagedTransform.includes("F.to_date("),
  "silver transform appears to have reverted to unsafe date parsing"
);

const toolContextViews = readRepoFile("databricks/notebooks/tool_context_views.py");
assert(
  toolContextViews.includes("day_month_date") && !toolContextViews.includes("month_day_date"),
  "tool context views must implement one day!month!year parse candidate"
);
assert(
  toolContextViews.includes("THEN {day_month_date}") &&
    !toolContextViews.includes("bang_first") &&
    !toolContextViews.includes("bang_second"),
  "tool context views must not infer an alternate order from token ranges"
);
assert(
  toolContextViews.includes("\\\\d{{4}}") && !toolContextViews.includes("concat('20', split("),
  "tool context views must require four-digit ElderMark years instead of guessing a century"
);
assert(
  toolContextViews.includes('dbutils.widgets.text("date_partition", "")') &&
    toolContextViews.includes("WINDOW_AS_OF_SQL") &&
    toolContextViews.includes("DATE_PARTITION_AS_OF_SQL"),
  "tool context views must anchor rolling windows to the explicit publish date partition when supplied"
);

const censusQualityAudit = readRepoFile("databricks/notebooks/census_quality_audit.py");
assert(
  censusQualityAudit.includes("minimum_reasonable_admit_date") &&
    censusQualityAudit.includes("MIN_REASONABLE_ADMIT_SQL_DATE"),
  "census quality audit must expose a historical admit-date floor"
);
assert(
  censusQualityAudit.includes("def resolve_default_as_of_date") &&
    censusQualityAudit.includes("max(snapshot_date)") &&
    censusQualityAudit.includes("max(month_bucket)") &&
    censusQualityAudit.includes("has no snapshot_date or month_bucket to anchor the audit"),
  "census quality audit must derive from the latest governed census date or fail instead of using wall-clock today"
);
assert(
  !censusQualityAudit.includes("date.today()"),
  "census quality audit must not use the notebook run date as a fallback"
);
assert(
  censusQualityAudit.includes("Countable resident rows before the configured historical floor") &&
    censusQualityAudit.includes("old_countable_admit_rows"),
  "census quality audit must show and summarize countable rows before the historical floor"
);
assert(
  censusQualityAudit.includes("Transform partition vs governed census month") &&
    censusQualityAudit.includes("resident_transform_partition") &&
    censusQualityAudit.includes("census_transform_partition"),
  "census quality audit must expose transform partitions so source/date drift is visible"
);
assert(
  censusQualityAudit.includes("configured historical floor"),
  "census quality audit must fail loudly when countable admit dates predate the configured floor"
);

const dailyPlatformPublish = readRepoFile("databricks/workflows/daily_platform_publish.json");
const workflow = JSON.parse(dailyPlatformPublish);
const toolContextTask = workflow.tasks.find((task) => task.task_key === "tool_context_views");
assert(
  toolContextTask?.notebook_task?.base_parameters?.date_partition === "<business-date-YYYY-MM-DD>",
  "daily platform publish workflow must pass the explicit business date into tool_context_views"
);

console.log("ElderMark date contracts passed.");
