import {
  applyAnalysisPatch,
  createExecutionPlan,
  deriveAnalysisPatch
} from "../shared/analysis-session-state.mjs";
import {
  ANALYST_DECISION_INTELLIGENCE_VERSION,
  ANALYST_REQUEST_FAMILIES,
  buildAnalystDecisionIntelligence
} from "../shared/analyst-decision-intelligence.mjs";
import { runCopilotTool } from "../server/copilot-tools.mjs";

function assert(condition, message, context = null) {
  if (condition) return;
  console.error(`FAILED: ${message}`);
  if (context) console.error(JSON.stringify(context, null, 2));
  process.exit(1);
}

const facilities = [
  { facility_id: "337", community_name: "A & A Health Services San Pablo" },
  { facility_id: "342", community_name: "Victoria's House" },
  { facility_id: "343", community_name: "JC Wallace House" },
  { facility_id: "344", community_name: "AHS Turlock OP LLC" },
  { facility_id: "345", community_name: "Santa Clarita" }
];

const frameOptions = {
  facilities,
  residents: [{ res_number: "9513755", first_name: "Shannon", last_name: "Romero" }],
  categories: ["AWOL/Elopement", "Medication Refusal", "Medical Emergency"],
  availableMonths: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]
};

const cases = [
  {
    prompt: "how many people went AWOL in May 2026",
    expectedTool: "incident_breakdown",
    family: ANALYST_REQUEST_FAMILIES.count,
    shape: "direct_count",
    riskFlags: ["grain_sensitive", "category_sensitive", "period_sensitive"],
    exactRows: false
  },
  {
    prompt: "List every AWOL incident from May through June by community, including resident name, date, type, and description",
    expectedTool: "incident_detail_list",
    family: ANALYST_REQUEST_FAMILIES.detailList,
    shape: "exact_rows_preview",
    riskFlags: ["multi_period", "exact_rows"],
    exactRows: true,
    expectsArtifact: true
  },
  {
    prompt: "compare San Pablo March April May June incidents by category",
    expectedTool: "slice_discovery",
    family: ANALYST_REQUEST_FAMILIES.slice,
    shape: "compiled_slice_module",
    riskFlags: ["multi_period", "community_scope"]
  },
  {
    prompt: "open incident center",
    expectedTool: "surface_module",
    family: ANALYST_REQUEST_FAMILIES.surface,
    shape: "surface_module",
    shouldResetContext: true
  },
  {
    prompt: "what data periods are available for incident detail?",
    expectedTool: "data_availability",
    family: ANALYST_REQUEST_FAMILIES.availability,
    shape: "data_coverage_diagnostic",
    shouldResetContext: true
  },
  {
    prompt: "show Shannon Romero resident profile",
    expectedTool: "resident_lookup",
    family: ANALYST_REQUEST_FAMILIES.profile,
    shape: "resident_profile_card",
    moduleFamilies: ["residents"]
  }
];

for (const testCase of cases) {
  const frame = applyAnalysisPatch(null, deriveAnalysisPatch(testCase.prompt, frameOptions));
  const plan = createExecutionPlan(frame, testCase.expectedTool, {
    preferFallback: [ANALYST_REQUEST_FAMILIES.surface, ANALYST_REQUEST_FAMILIES.availability].includes(testCase.family)
  });
  const decision = buildAnalystDecisionIntelligence(frame, {
    tool: plan.tool,
    fallbackTool: testCase.expectedTool,
    content: testCase.prompt
  });

  assert(decision.version === ANALYST_DECISION_INTELLIGENCE_VERSION, "unexpected decision intelligence version", decision);
  assert(plan.decision?.version === ANALYST_DECISION_INTELLIGENCE_VERSION, "execution plan is missing decision intelligence", {
    prompt: testCase.prompt,
    plan
  });
  assert(decision.family === testCase.family, "decision classified the wrong family", {
    prompt: testCase.prompt,
    expected: testCase.family,
    decision,
    frame,
    plan
  });
  assert(decision.answerShape === testCase.shape, "decision selected the wrong answer shape", {
    prompt: testCase.prompt,
    expected: testCase.shape,
    decision
  });
  assert(decision.exactRows === Boolean(testCase.exactRows), "decision exact-row flag mismatch", {
    prompt: testCase.prompt,
    decision
  });
  if (testCase.expectsArtifact != null) {
    assert(decision.expectsArtifact === testCase.expectsArtifact, "decision artifact expectation mismatch", {
      prompt: testCase.prompt,
      decision
    });
  }
  if (testCase.shouldResetContext != null) {
    assert(decision.shouldResetContext === testCase.shouldResetContext, "decision reset-context flag mismatch", {
      prompt: testCase.prompt,
      decision
    });
  }
  for (const flag of testCase.riskFlags ?? []) {
    assert(decision.riskFlags.includes(flag), "decision omitted expected risk flag", {
      prompt: testCase.prompt,
      flag,
      decision
    });
  }
  for (const family of testCase.moduleFamilies ?? []) {
    assert(decision.moduleFamilies.includes(family), "decision omitted expected module family", {
      prompt: testCase.prompt,
      family,
      decision
    });
  }
}

const liveResult = await runCopilotTool({
  content: "how many people went AWOL in May 2026",
  sessionId: "decision-intelligence-live-count"
});
assert(liveResult.executionPlan?.decision?.family === ANALYST_REQUEST_FAMILIES.count, "live result omitted count decision", liveResult.executionPlan);
assert(liveResult.turnTrace?.plan?.decision?.family === ANALYST_REQUEST_FAMILIES.count, "turn trace omitted decision summary", liveResult.turnTrace);
assert(liveResult.turnTrace?.plan?.decision?.riskFlags?.includes("grain_sensitive"), "turn trace omitted grain risk flag", liveResult.turnTrace?.plan?.decision);

console.log(`analyst decision intelligence checks passed (${cases.length} static cases + 1 live turn)`);
