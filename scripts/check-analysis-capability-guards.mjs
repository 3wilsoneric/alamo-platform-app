import { runCopilotTool } from "../server/copilot-tools.mjs";
import { listAnalysisToolCapabilities } from "../shared/analysis-tool-capabilities.mjs";

function assert(condition, message, context = null) {
  if (condition) return;
  console.error(`FAILED: ${message}`);
  if (context) console.error(JSON.stringify(context, null, 2));
  process.exit(1);
}

const periods = [
  { bucket: "2026-01", label: "January 2026" },
  { bucket: "2026-05", label: "May 2026" }
];

const currentStateGuardCases = [
  {
    tool: "resident_lookup",
    prompt: (period) => `show Shannon Romero resident profile for ${period.label}`,
    mustNotInclude: ["Incident rollup"]
  },
  {
    tool: "resident_search",
    prompt: (period) => `search residents for ${period.label}`,
    mustNotInclude: ["Top matches", "Resident Search"]
  },
  {
    tool: "resident_risk_summary",
    prompt: (period) => `resident risk watchlist for ${period.label}`,
    mustNotInclude: ["Risk score", "Resident Risk"]
  },
  {
    tool: "diagnosis_mix",
    prompt: (period) => `show diagnosis mix for ${period.label}`,
    mustNotInclude: ["Top diagnoses"]
  },
  {
    tool: "length_of_stay_mix",
    prompt: (period) => `show length of stay mix for ${period.label}`,
    mustNotInclude: ["Longest stay"]
  },
  {
    tool: "resident_demographics",
    prompt: (period) => `show resident demographics for ${period.label}`,
    mustNotInclude: ["Average age"]
  },
  {
    tool: "documentation_gaps",
    prompt: (period) => `show documentation gaps for ${period.label}`,
    mustNotInclude: ["Largest gaps"]
  },
  {
    tool: "community_profile",
    expectedResultTool: "community_history",
    shouldFailClosed: false,
    prompt: (period) => `show San Pablo community profile for ${period.label}`,
    mustInclude: ["census", "incidents"],
    mustNotInclude: ["Active roster", "Average age"]
  },
  {
    tool: "community_compare",
    prompt: (period) => `show community compare for ${period.label}`,
    mustNotInclude: ["Highest incident rate"]
  },
  {
    tool: "operating_snapshot",
    prompt: (period) => `show operating snapshot ${period.label}`,
    mustNotInclude: ["Current roster rows", "Latest incident total"]
  },
  {
    tool: "medication_profile",
    prompt: (period) => `San Pablo meds overview for ${period.label}`,
    mustNotInclude: ["Compliance:", "Scheduled:"]
  },
  {
    tool: "medication_orders_current",
    prompt: (period) => `show active medication orders at San Pablo for ${period.label}`,
    mustNotInclude: ["current medication orders", "PRN orders"]
  },
  {
    tool: "medication_watch",
    prompt: (period) => `who needs medication attention at San Pablo for ${period.label}`,
    mustNotInclude: ["top watch row", "Medication Watch"]
  }
];

const declaredCurrentStateTools = listAnalysisToolCapabilities()
  .filter(({ capability }) => capability.temporalScope === "current_state" && capability.supportsExplicitPeriods === false)
  .map(({ tool }) => tool)
  .sort();
const guardedTools = currentStateGuardCases.map((testCase) => testCase.tool).sort();

assert(
  JSON.stringify(declaredCurrentStateTools) === JSON.stringify(guardedTools),
  "current-state capability guard cases must cover every current-state-only tool",
  { declaredCurrentStateTools, guardedTools }
);

for (const testCase of currentStateGuardCases) {
  for (const period of periods) {
    const prompt = testCase.prompt(period);
    const result = await runCopilotTool({
      content: prompt,
      sessionId: `capability-guard-${testCase.tool}-${period.bucket}-${Math.random().toString(36).slice(2)}`
    });
    const text = String(result.text ?? "");
    const context = { prompt, expectedTool: testCase.tool, period: period.bucket, result };

    assert(result.handled === true, `${testCase.tool}: prompt was not handled`, context);
    assert(result.tool === (testCase.expectedResultTool ?? testCase.tool), `${testCase.tool}: prompt routed to the wrong tool`, context);
    if (testCase.shouldFailClosed === false) {
      assert(result.safeRefusal !== true, `${testCase.tool}: historical alternative should not fail closed`, context);
      assert(result.planValidation?.valid !== false, `${testCase.tool}: historical alternative failed plan validation`, context);
      assert((result.truthState ?? result.trace?.truthState) === "valid_rows", `${testCase.tool}: historical alternative did not return valid rows`, context);
    } else {
      assert(result.safeRefusal === true, `${testCase.tool}: historical current-state request did not fail closed`, context);
      assert(result.planValidation?.preflightRejected === true, `${testCase.tool}: request was not rejected before execution`, context);
      assert(result.planValidation?.code === "temporal_scope_mismatch", `${testCase.tool}: missing temporal_scope_mismatch code`, context);
      assert((result.truthState ?? result.trace?.truthState) === "not_loaded", `${testCase.tool}: missing not_loaded truth state`, context);
      assert(/current-state data/i.test(text), `${testCase.tool}: answer did not explain current-state limitation`, context);
      assert(/did not substitute today's roster or current profile/i.test(text), `${testCase.tool}: answer did not block current-state substitution`, context);
    }
    assert(result.trace?.period === period.bucket, `${testCase.tool}: requested period was not preserved`, context);
    assert(!/I need the analysis subject first/i.test(text), `${testCase.tool}: prompt was misclassified as a dangling follow-up`, context);
    for (const required of testCase.mustInclude ?? []) {
      assert(text.includes(required), `${testCase.tool}: answer missed expected content: ${required}`, context);
    }
    for (const forbidden of testCase.mustNotInclude ?? []) {
      assert(!text.includes(forbidden), `${testCase.tool}: answer leaked current-state content: ${forbidden}`, context);
    }
  }
}

console.log(`analysis capability guard checks passed (${currentStateGuardCases.length} tools x ${periods.length} periods)`);
