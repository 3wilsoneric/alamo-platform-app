import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCopilotTool } from "../server/copilot-tools.mjs";
import { getReportingDateKey } from "../shared/reporting-date.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, "../generated/analyst-qa");

const GOLDEN_ANALYST_QA_PROMPTS = [
  ["incident-current-snapshot", "incidents", "incident_breakdown"],
  ["incident-current-snapshot", "show current incidents", "incident_breakdown"],
  ["incident-current-snapshot", "april incidents san pablo", "incident_breakdown"],
  ["incident-category-breakdown", "JC Wallace House current incident category breakdown", "incident_breakdown"],
  ["incident-category-breakdown", "San Pablo incidents by category", "incident_breakdown"],
  ["incident-category-breakdown", "Santa Clarita medical emergency incident breakdown", "incident_breakdown"],
  ["incident-category-by-community", "give me february breakdown of AWOL incidents by community", "slice_metric"],
  ["incident-category-by-community", "AWOL incidents by community in June", "slice_metric"],
  ["incident-category-by-community", "medication refusal incidents by community in May", "slice_metric"],
  ["incident-top-category-by-community", "give me the top category of each community in incidents December of last year", "top_incident_category_by_community"],
  ["incident-top-category-by-community", "top incident category for each community in May", "top_incident_category_by_community"],
  ["incident-period-comparison", "compare San Pablo May incidents to June incidents by category", "incident_category_comparison"],
  ["incident-period-comparison", "compare portfolio April incidents to May by category", "incident_category_comparison"],
  ["incident-period-comparison", "what categories changed from May to June", "incident_category_comparison"],
  ["incident-rate", "incident rate by community", "incident_rate"],
  ["incident-rate", "which community has the highest incidents per 100 residents", "incident_rate"],
  ["incident-rate-change", "which community had the biggest incident rate change from April to May", "incident_rate_change"],
  ["incident-rate-change", "compare incident rates by community from May to June", "incident_rate_change"],
  ["incident-resident-drivers", "which residents are driving incidents", "slice_metric"],
  ["incident-resident-drivers", "top residents for San Pablo AWOL incidents in June", "slice_metric"],
  ["incident-detail-list", "list every AWOL incident from May through June by community including resident name date incident type and description", "incident_detail_list"],
  ["incident-detail-list", "all elopement rows in may with description", "incident_detail_list"],
  ["incident-detail-list", "show San Pablo medication refusal incident detail rows for June", "incident_detail_list"],
  ["incident-row-export", "export these AWOL incident rows to csv", "export_csv"],
  ["incident-row-export", "download San Pablo incident detail spreadsheet", "export_csv"],
  ["census-trend", "show Santa Clarita census trend", "census_trend"],
  ["census-trend", "show santa clartia censsus trend", "census_trend"],
  ["census-trend", "San Pablo census history", "census_trend"],
  ["census-trend", "Victoria's House population over time", "census_trend"],
  ["census-movement", "what changed in census this month", "census_movement"],
  ["census-movement", "community census movers", "census_movement"],
  ["census-movement", "which community added the most residents in June", "census_movement"],
  ["census-drop-history", "has any community had a drop in census over the last year month over month", "census_drop_history"],
  ["census-drop-history", "month over month census declines", "census_drop_history"],
  ["resident-profile", "give me Shannon Romero's full profile of data", "resident_lookup"],
  ["resident-profile", "show Shannon Romero resident profile", "resident_lookup"],
  ["resident-profile", "show jon smth resident profile", "clarification"],
  ["resident-search", "search census for John", "surface_module"],
  ["resident-search", "find residents named Smith", "resident_search"],
  ["resident-incident-history", "show Shannon Romero incident history", "resident_incident_history"],
  ["resident-incident-history", "what incidents does Tuesday Woo have", "resident_incident_history"],
  ["community-topline", "how is San Pablo", "community_profile"],
  ["community-topline", "Santa Clarita overview", "community_profile"],
  ["community-topline", "give me JC Wallace topline", "community_profile"],
  ["medication-refusal-detail", "medication refusals by community", "medication_refusals_by_community"],
  ["medication-refusal-detail", "top refused meds", "medication_refusals_by_community"],
  ["medication-compliance", "medication compliance this month", "medication_compliance"],
  ["medication-compliance", "emar compliance by community", "medication_compliance"],
  ["data-slice-catalog", "what data can you use", "tool_context_catalog"],
  ["data-slice-catalog", "show available analytical slices", "tool_context_catalog"],
  ["data-availability", "what is the latest incident date loaded", "data_availability"],
  ["data-availability", "show loaded data availability", "data_availability"],
  ["generic-detail-list", "list all census rows for May 2026", "detail_list"],
  ["generic-detail-list", "list every medication compliance row for May 2026", "detail_list"],
  ["generic-detail-list", "list all documentation gap rows", "detail_list"],
  ["operating-snapshot", "where are we operationally", "operating_snapshot"],
  ["operating-snapshot", "current operating picture", "operating_snapshot"]
];

const GENERATED_PROMPTS = [
  ...["San Pablo", "Santa Clarita", "JC Wallace", "Turlock", "Victoria's House"].flatMap((community) => [
    [`incident-current-snapshot:${community}`, `${community} incidents`, "incident_breakdown"],
    [`incident-category-breakdown:${community}`, `${community} incident category breakdown`, "incident_breakdown"],
    [`incident-breakdown-latest:${community}`, `${community} June incident breakdown`, "incident_breakdown"],
    [`census-trend:${community}`, `${community} census trend`, "census_trend"],
    [`community-topline:${community}`, `how is ${community}`, "community_profile"],
    [`resident-drivers:${community}`, `top residents driving ${community} incidents`, "slice_metric"]
  ]),
  ...["December", "January", "February", "March", "April", "May", "June"].flatMap((month) => [
    [`incident-category-by-community:${month}`, `${month} AWOL incidents by community`, "slice_metric"],
    [`incident-breakdown:${month}`, `${month} incidents by category`, "incident_breakdown"],
    [`incident-rate-change:${month}`, month === "December"
      ? "compare December 2025 incident rates by community to January 2026"
      : `compare ${month} 2026 incident rates by community to May 2026`, "incident_rate_change"]
  ]),
  ["follow-up-base", "list every AWOL incident from May through June by community including resident name date incident type and description", "incident_detail_list"],
  ["follow-up-april", "do it for April", "incident_detail_list"],
  ["follow-up-export", "export that", "export_csv"],
  ["follow-up-san-pablo", "now San Pablo", "export_csv"]
];

const QA_CASES = [...GOLDEN_ANALYST_QA_PROMPTS, ...GENERATED_PROMPTS].slice(0, 104).map(
  ([id, prompt, expectedTool], index) => ({
    id: `${String(index + 1).padStart(3, "0")}-${id}`,
    prompt,
    expectedTool
  })
);

function currentBusinessDate() {
  return getReportingDateKey();
}

function summarizeResult(result) {
  return {
    handled: Boolean(result.handled),
    tool: result.tool ?? null,
    certifiedQuestionId: result.certifiedQuestion?.id ?? null,
    cached: Boolean(result.cached),
    rowCount: result.trace?.rowCount ?? result.visual?.rows?.length ?? 0,
    period: result.trace?.period ?? result.analysisFrame?.periods?.join(",") ?? null,
    community: result.trace?.facility ?? result.analysisFrame?.communityName ?? null,
    category: result.analysisFrame?.category ?? null,
    valid: result.planValidation?.valid ?? null,
    validationErrors: result.planValidation?.errors ?? [],
    title: result.visual?.title ?? null,
    actions: (result.actions ?? []).map((action) => action.label).slice(0, 4)
  };
}

function validateResult(testCase, result) {
  const failures = [];
  const addFailure = (stage, reason) => failures.push({ stage, reason });

  if (!result.handled) {
    addFailure("tool_execution", "Tool did not handle the prompt.");
  }

  if (testCase.expectedTool && result.tool !== testCase.expectedTool) {
    addFailure("compiler", `Expected tool ${testCase.expectedTool}, got ${result.tool ?? "none"}.`);
  }

  if (result.planValidation && result.planValidation.valid === false) {
    const reasons = result.planValidation.errors?.length
      ? result.planValidation.errors
      : ["Plan validation failed without a detailed reason."];
    reasons.forEach((reason) => addFailure("plan_validation", reason));
  }

  if (
    result.tool !== "clarification" &&
    result.tool !== "export_csv" &&
    !result.certifiedQuestion?.id
  ) {
    addFailure("formatting", "Missing certified question metadata.");
  }

  if (
    result.tool !== "clarification" &&
    result.tool !== "export_csv" &&
    result.tool !== "tool_context_catalog" &&
    !(result.actions ?? []).length
  ) {
    addFailure("formatting", "Missing follow-up actions.");
  }

  return failures;
}

async function readPreviousArtifact() {
  try {
    return JSON.parse(await readFile(path.join(outputDir, "latest.json"), "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn("Previous analyst QA artifact could not be read.", error);
    return null;
  }
}

function summarizeRun(artifact) {
  if (!artifact?.generatedAt || !artifact?.summary) return null;
  return {
    generatedAt: artifact.generatedAt,
    businessDate: artifact.businessDate ?? null,
    status: artifact.status ?? "unknown",
    total: artifact.summary.total ?? 0,
    passed: artifact.summary.passed ?? 0,
    failed: artifact.summary.failed ?? 0
  };
}

async function main() {
  const previousArtifact = await readPreviousArtifact();
  const generatedAt = new Date().toISOString();
  const businessDate = currentBusinessDate();
  const results = [];
  let sharedFollowUpSessionId = null;

  for (let index = 0; index < QA_CASES.length; index += 1) {
    const testCase = QA_CASES[index];
    const isFollowUpCase = testCase.id.includes("follow-up-");
    if (testCase.id.includes("follow-up-base")) {
      sharedFollowUpSessionId = `analyst-qa-follow-up-${Date.now()}`;
    }
    const input = {
      content: testCase.prompt,
      sessionId: isFollowUpCase
        ? sharedFollowUpSessionId ?? `analyst-qa-follow-up-${Date.now()}`
        : `analyst-qa-${index}-${Date.now()}`
    };

    try {
      const result = await runCopilotTool(input);
      const failures = validateResult(testCase, result);

      results.push({
        ...testCase,
        passed: failures.length === 0,
        failures: failures.map((failure) => failure.reason),
        failureDetails: failures,
        expected: result.executionPlan?.expected ?? null,
        actual: summarizeResult(result)
      });

    } catch (error) {
      console.error("Analyst QA tool execution failed.", {
        caseId: testCase.id,
        error
      });
      const safeFailure = "Tool execution failed unexpectedly. Review the QA runner logs.";
      results.push({
        ...testCase,
        passed: false,
        failures: [safeFailure],
        failureDetails: [{
          stage: "tool_execution",
          reason: safeFailure
        }],
        expected: null,
        actual: null
      });
    }
  }

  const failed = results.filter((result) => !result.passed);
  const warningCount = results.filter((result) => result.actual?.tool === "clarification").length;
  const payload = {
    version: "analyst-qa-v2",
    generatedAt,
    businessDate,
    status: failed.length === 0 ? "pass" : failed.length <= 3 ? "warning" : "fail",
    summary: {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      warnings: warningCount,
      certifiedCoverage: results.filter((result) => result.actual?.certifiedQuestionId).length,
      cachedHits: results.filter((result) => result.actual?.cached).length
    },
    history: [
      summarizeRun(previousArtifact),
      ...(previousArtifact?.history ?? [])
    ].filter(Boolean).filter((run, index, runs) =>
      runs.findIndex((candidate) => candidate.generatedAt === run.generatedAt) === index
    ).slice(0, 7),
    failures: failed.map((result) => ({
      id: result.id,
      prompt: result.prompt,
      expectedTool: result.expectedTool,
      failures: result.failures,
      failureDetails: result.failureDetails,
      expected: result.expected,
      actual: result.actual
    })),
    results
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "latest.json"), JSON.stringify(payload, null, 2));
  await writeFile(path.join(outputDir, `${businessDate}.json`), JSON.stringify(payload, null, 2));

  console.log(
    `Analyst QA ${payload.status}: ${payload.summary.passed}/${payload.summary.total} passed; ${payload.summary.failed} failed.`
  );

  if (payload.status === "fail") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Analyst QA generation failed:", error);
  process.exit(1);
});
