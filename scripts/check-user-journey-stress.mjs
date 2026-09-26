import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCopilotTool } from "../server/copilot-tools.mjs";
import { platformModuleRegistry } from "../shared/platform-module-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, "../generated/user-journey-stress");
const outputPath = path.join(outputDir, "latest.json");

const facilities = [
  { short: "San Pablo", full: "A & A Health Services San Pablo", id: "337" },
  { short: "Victoria's House", full: "Victoria's House", id: "342" },
  { short: "JC Wallace House", full: "JC Wallace House", id: "343" },
  { short: "Turlock", full: "AHS Turlock OP LLC", id: "344" },
  { short: "Santa Clarita", full: "Santa Clarita", id: "345" }
];

const forbiddenPatterns = [
  /\bAnswer The\b/i,
  /\bThe clearest row\b/i,
  /\blargest row in this slice\b/i,
  /\bClosest Recovery Path\b/i,
  /\bObject object\b/i,
  /\bundefined\b/i,
  /\bT00:00:00\.000Z\b/i,
  /\bVictoria's Place\b/i,
  /\bfacility\s+(337|342|343|344|345)\b/i
];

const genericSurfaceCases = [
  ["open communities overview", "/communities", "communities-overview"],
  ["show communities overview", "/communities", "communities-overview"],
  ["open community trends", "/communities", "communities-overview"],
  ["surface community trend module", "/communities", "communities-overview"],
  ["open the incident center module", "/incidents", "incident-center"],
  ["open incident workspace", "/incidents", "incident-center"],
  ["open incidents module", "/incidents", "incident-center"],
  ["show incident center", "/incidents", "incident-center"],
  ["open resident search", "/resident-search", "resident-census-search"],
  ["show me the resident search module", "/resident-search", "resident-census-search"],
  ["find a resident", "/resident-search", "resident-census-search"],
  ["can i just get the search census module", "/resident-search", "resident-census-search"],
  ["open command center", "/command-center", "command-center"],
  ["open system health", "/command-center", "command-center"],
  ["show command center", "/command-center", "command-center"],
  ["show glossary", "/glossary", "glossary"],
  ["open data dictionary", "/glossary", "glossary"],
  ["resident directory", "/resident-search", "resident-census-search"],
  ["open data glossary", "/glossary", "glossary"],
  ["show definitions", "/glossary", "glossary"],
  ["open admin screen", "/command-center", "command-center"]
].map(([prompt, route, surfaceId]) => ({
  phase: "surface-marathon",
  prompt,
  expect: {
    tools: ["surface_module"],
    route,
    surfaceId,
    maxActions: 1
  }
}));

const facilitySurfaceCases = facilities.flatMap((facility) => [
  [`open ${facility.short} community page`, `/communities/${facility.id}`, facility.full, "community-detail"],
  [`show ${facility.short} census module`, `/communities/${facility.id}?focus=census`, facility.full, "community-census"],
  [`show ${facility.short} incidents module`, `/communities/${facility.id}?focus=incidents`, facility.full, "community-incidents"],
  [`show ${facility.short} residents module`, `/communities/${facility.id}?focus=residents`, facility.full, "community-residents"],
  [`show ${facility.short} resident search`, `/communities/${facility.id}?focus=search`, facility.full, "resident-census-search"]
]).map(([prompt, route, text, surfaceId]) => ({
  phase: "surface-marathon",
  prompt,
  expect: {
    tools: ["surface_module"],
    route,
    surfaceId,
    textIncludes: [text],
    maxActions: 1
  }
}));

const questionMarathonCases = [
  {
    prompt: "how many people went AWOL in May 2026",
    expect: {
      tools: ["incident_breakdown"],
      period: "2026-05",
      category: "AWOL/Elopement",
      valueLabel: "Residents",
      textIncludes: ["unique resident"]
    }
  },
  {
    prompt: "how many AWOL events were there in May 2026",
    expect: {
      tools: ["incident_breakdown"],
      period: "2026-05",
      category: "AWOL/Elopement",
      valueLabel: "Incidents"
    }
  },
  {
    prompt: "show Santa Clarita census trend",
    expect: {
      tools: ["census_trend"],
      facilityId: "345",
      textIncludes: ["Santa Clarita"],
      visualType: "line_chart"
    }
  },
  {
    prompt: "show santa clartia censsus trend",
    expect: {
      tools: ["census_trend"],
      facilityId: "345",
      interpretationChanged: true,
      textIncludes: ["Santa Clarita"]
    }
  },
  {
    prompt: "How is San Pablo?",
    expect: {
      tools: ["community_history"],
      facilityId: "337",
      textIncludes: ["A & A Health Services San Pablo"],
      visualType: "summary_card"
    }
  },
  {
    prompt: "show San Pablo incidents module",
    expect: {
      tools: ["surface_module"],
      route: "/communities/337?focus=incidents",
      maxActions: 1
    }
  },
  {
    prompt: "JC Wallace House current incident category breakdown",
    expect: {
      tools: ["incident_breakdown"],
      facilityId: "343",
      period: "2026-06",
      textIncludes: ["JC Wallace House"],
      visualType: "bar_chart"
    }
  },
  {
    prompt: "Between April and May 2026, which community had the largest increase in incidents per 100 residents?",
    expect: {
      tools: ["incident_rate_change"],
      periodIncludes: ["2026-04", "2026-05"],
      textIncludes: ["per 100"],
      visualType: "table"
    }
  },
  {
    prompt: "Compare San Pablo May incidents to June incidents by category",
    expect: {
      tools: ["incident_category_comparison"],
      facilityId: "337",
      periodIncludes: ["2026-05", "2026-06"],
      visualType: "comparison_chart"
    }
  },
  {
    prompt: "List every AWOL incident from May through June by community, including resident name, date, incident type, and description",
    expect: {
      tools: ["incident_detail_list"],
      periodIncludes: ["2026-05", "2026-06"],
      category: "AWOL/Elopement",
      artifact: true,
      visualType: "table",
      maxVisualRows: 50
    }
  },
  {
    prompt: "do that for April now",
    expect: {
      tools: ["incident_detail_list"],
      period: "2026-04",
      category: "AWOL/Elopement",
      artifact: true,
      visualType: "table",
      persistence: "detail-list-period-patch"
    }
  },
  {
    prompt: "now San Pablo",
    expect: {
      tools: ["incident_detail_list"],
      facilityId: "337",
      category: "AWOL/Elopement",
      artifact: true,
      persistence: "detail-list-community-patch"
    }
  },
  {
    prompt: "just totals",
    expect: {
      tools: ["incident_breakdown", "slice_metric"],
      facilityId: "337",
      category: "AWOL/Elopement",
      persistence: "detail-list-to-total-patch"
    }
  },
  {
    prompt: "show Shannon Romero resident profile",
    expect: {
      tools: ["resident_lookup"],
      textIncludes: ["Shannon Romero", "Resident #"],
      moduleId: "resident-profile"
    }
  },
  {
    prompt: "show Shannon Romero incident history",
    expect: {
      tools: ["resident_incident_history"],
      textIncludes: ["Shannon Romero"],
      visualType: "bar_chart"
    }
  },
  {
    prompt: "show John Smith resident profile",
    expect: {
      tools: ["data_recovery", "resident_lookup"],
      truthStates: ["verified_zero", "not_loaded"],
      textIncludes: ["no verified exact match"],
      textExcludes: ["Audrey West", "Portfolio Longest Stay"]
    }
  },
  {
    prompt: "show jon smth resident profile",
    expect: {
      tools: ["clarification"],
      truthStates: ["plan_rejected", "needs_clarification"],
      textIncludes: ["Did you mean"]
    }
  },
  {
    prompt: "what data periods are available for incident detail?",
    expect: {
      tools: ["data_availability"],
      textIncludes: ["most recent incident detail"],
      visualType: "table"
    }
  },
  {
    prompt: "give me the top category of each community in incidents November of last year",
    expect: {
      tools: ["top_incident_category_by_community", "data_availability"],
      truthStates: ["not_loaded", "stale"],
      textIncludes: ["not available"]
    }
  },
  {
    prompt: "show San Pablo diagnosis mix",
    expect: {
      tools: ["diagnosis_mix"],
      facilityId: "337",
      textIncludes: ["Diagnosis Mix"],
      visualType: "bar_chart"
    }
  },
  {
    prompt: "show San Pablo length of stay mix",
    expect: {
      tools: ["length_of_stay_mix"],
      facilityId: "337",
      textIncludes: ["Average LOS", "365+ days", "Longest stays"],
      visualType: "donut_chart"
    }
  },
  {
    prompt: "How is San Pablo doing with medications?",
    expect: {
      tools: ["medication_profile"],
      facilityId: "337",
      textIncludes: ["A & A Health Services San Pablo", "Compliance"]
    }
  },
  {
    prompt: "Show me its compliance for the latest month.",
    expect: {
      tools: ["medication_compliance"],
      facilityId: "337",
      textIncludes: ["A & A Health Services San Pablo"],
      textExcludes: ["Portfolio medication compliance"],
      persistence: "medication-community-followup"
    }
  },
  {
    prompt: "What medications had the most refusals?",
    expect: {
      tools: ["medication_refusals_by_community", "ad_hoc_medication_chart"],
      textIncludes: ["refus"],
      visualType: "bar_chart"
    }
  },
  {
    prompt: "portfolio operating snapshot",
    expect: {
      tools: ["operating_snapshot"],
      textIncludes: ["Portfolio census increased", "incidents totaled", "highest incident rate"],
      visualType: "table"
    }
  }
].map((turn) => ({
  phase: "question-marathon",
  ...turn
}));

const freshSessionCases = [
  {
    phase: "fresh-session-reset",
    prompt: "why are today's incidents not showing up",
    expect: {
      tools: ["data_availability"],
      textIncludes: ["most recent incident detail"],
      textExcludes: ["Shannon Romero", "Resident #"],
      visualType: "table"
    }
  },
  {
    phase: "fresh-session-reset",
    prompt: "how many people went AWOL in May 2026",
    expect: {
      tools: ["incident_breakdown"],
      period: "2026-05",
      category: "AWOL/Elopement",
      valueLabel: "Residents",
      textIncludes: ["unique resident"],
      textExcludes: ["medication", "Shannon Romero"]
    }
  }
];

const inevitabilityCases = [
  {
    phase: "inevitability-thread",
    prompt: "San Pablo, how has it been the last three months",
    expect: {
      tools: ["community_history"],
      facilityId: "337",
      periodIncludes: ["2026-04", "2026-05", "2026-06"],
      textIncludes: ["A & A Health Services San Pablo"],
      visualType: "table",
      decisionFamily: "profile",
      answerShape: "profile_summary",
      decisionRiskFlags: ["multi_period", "community_scope"]
    }
  },
  {
    phase: "inevitability-thread",
    prompt: "i want March April May June detail",
    expect: {
      tools: ["community_history"],
      facilityId: "337",
      periodIncludes: ["2026-03", "2026-04", "2026-05", "2026-06"],
      visualType: "table",
      decisionFamily: "profile",
      decisionRiskFlags: ["multi_period", "community_scope", "context_sensitive"]
    }
  },
  {
    phase: "inevitability-thread",
    prompt: "now show incidents by category",
    expect: {
      tools: ["slice_discovery"],
      facilityId: "337",
      periodIncludes: ["2026-03", "2026-04", "2026-05", "2026-06"],
      visualType: "table",
      decisionFamily: "slice",
      answerShape: "compiled_slice_module",
      decisionRiskFlags: ["multi_period", "community_scope", "context_sensitive"]
    }
  },
  {
    phase: "inevitability-thread",
    prompt: "just San Pablo AWOL incidents in May",
    expect: {
      tools: ["incident_breakdown"],
      facilityId: "337",
      period: "2026-05",
      category: "AWOL/Elopement",
      valueLabel: "Incidents",
      decisionFamily: "count",
      answerShape: "direct_count"
    }
  },
  {
    phase: "inevitability-thread",
    prompt: "list those rows with resident date and description",
    expect: {
      tools: ["incident_detail_list"],
      facilityId: "337",
      period: "2026-05",
      category: "AWOL/Elopement",
      artifact: true,
      visualType: "table",
      decisionFamily: "detail_list",
      answerShape: "exact_rows_preview",
      exactRows: true,
      decisionRiskFlags: ["exact_rows", "context_sensitive"]
    }
  },
  {
    phase: "inevitability-thread",
    prompt: "export that",
    expect: {
      tools: ["export_csv"],
      facilityId: "337",
      period: "2026-05",
      category: "AWOL/Elopement",
      artifact: true,
      decisionFamily: "export",
      answerShape: "csv_artifact",
      exactRows: true,
      decisionRiskFlags: ["exact_export", "context_sensitive"]
    }
  },
  {
    phase: "inevitability-thread",
    prompt: "why are today's incidents not showing up",
    expect: {
      tools: ["data_availability"],
      textIncludes: ["most recent incident detail"],
      textExcludes: ["A & A Health Services San Pablo", "Shannon Romero", "Resident #"],
      visualType: "table",
      decisionFamily: "availability",
      answerShape: "data_coverage_diagnostic"
    }
  },
  {
    phase: "inevitability-thread",
    prompt: "show Shannon Romero resident profile",
    expect: {
      tools: ["resident_lookup"],
      textIncludes: ["Shannon Romero", "Resident #"],
      moduleId: "resident-profile",
      decisionFamily: "profile",
      answerShape: "resident_profile_card"
    }
  },
  {
    phase: "inevitability-thread",
    prompt: "now incident history",
    expect: {
      tools: ["resident_incident_history"],
      textIncludes: ["Shannon Romero"],
      visualType: "bar_chart",
      decisionFamily: "trend",
      decisionRiskFlags: ["resident_scope", "context_sensitive"]
    }
  },
  {
    phase: "inevitability-thread",
    prompt: "open resident search",
    expect: {
      tools: ["surface_module"],
      route: "/resident-search",
      maxActions: 1,
      decisionFamily: "surface",
      answerShape: "surface_module"
    }
  }
];

function lower(value) {
  return String(value ?? "").toLowerCase();
}

function includesText(haystack, needle) {
  return lower(haystack).includes(lower(needle));
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function resultTruthState(result) {
  return result?.truthState ?? result?.trace?.truthState ?? result?.runtimeSchema?.truthState ?? null;
}

function allActionRoutes(result) {
  return (result?.actions ?? []).map((action) => action?.route ?? action?.url).filter(Boolean);
}

function allModuleIds(result) {
  return [
    result?.moduleSpec?.moduleId,
    ...(result?.moduleSpecs ?? []).map((moduleSpec) => moduleSpec?.moduleId)
  ].filter(Boolean);
}

function resultHaystack(result) {
  return [
    result?.text,
    result?.trace,
    result?.analysisFrame,
    result?.executionPlan,
    result?.planValidation,
    result?.interpretation,
    result?.visual,
    result?.moduleSpec,
    result?.moduleSpecs,
    result?.actions,
    result?.artifact
  ]
    .map((value) => (typeof value === "string" ? value : JSON.stringify(value ?? "")))
    .join("\n");
}

function renderedText(result) {
  return JSON.stringify({
    text: result?.text,
    visual: result?.visual,
    actions: result?.actions,
    moduleSpec: result?.moduleSpec,
    moduleSpecs: result?.moduleSpecs
  });
}

function validateTurn(testCase, result) {
  const failures = [];
  const expect = testCase.expect ?? {};
  const text = String(result?.text ?? "");
  const body = renderedText(result);
  const haystack = resultHaystack(result);

  if (!result?.handled) failures.push("result was not handled");
  if (result?.handled && result.tool !== "clarification" && !result.runtimeSchema?.valid) {
    failures.push("missing or invalid runtime schema");
  }
  if (result?.handled && result.tool !== "clarification" && !result.turnTrace?.turnId) {
    failures.push("missing analyst turn trace");
  }
  if (result?.handled && result.tool !== "clarification" && !result.executionPlan?.decision) {
    failures.push("missing analyst decision intelligence");
  }

  const acceptedTools = asArray(expect.tools ?? expect.tool);
  if (acceptedTools.length && !acceptedTools.includes(result?.tool)) {
    failures.push(`expected tool ${acceptedTools.join(" or ")}, got ${result?.tool ?? "none"}`);
  }

  const expectedTruthStates = asArray(expect.truthStates ?? expect.truthState);
  if (expectedTruthStates.length && !expectedTruthStates.includes(resultTruthState(result))) {
    failures.push(`expected truthState ${expectedTruthStates.join(" or ")}, got ${resultTruthState(result) ?? "none"}`);
  }

  if (expect.period && !includesText(haystack, expect.period)) {
    failures.push(`missing expected period ${expect.period}`);
  }
  for (const period of asArray(expect.periodIncludes)) {
    if (!includesText(haystack, period)) failures.push(`missing expected period ${period}`);
  }
  if (expect.facilityId && !includesText(haystack, `"facilityId":"${expect.facilityId}"`) && !includesText(haystack, `"facility_id":"${expect.facilityId}"`)) {
    failures.push(`missing facility scope ${expect.facilityId}`);
  }
  if (expect.category && !includesText(haystack, expect.category)) {
    failures.push(`missing category ${expect.category}`);
  }
  if (expect.valueLabel && result?.visual?.valueLabel !== expect.valueLabel) {
    failures.push(`expected value label ${expect.valueLabel}, got ${result?.visual?.valueLabel ?? "none"}`);
  }
  if (expect.visualType && result?.visual?.type !== expect.visualType) {
    failures.push(`expected visual type ${expect.visualType}, got ${result?.visual?.type ?? "none"}`);
  }
  if (expect.maxVisualRows != null && (result?.visual?.rows?.length ?? 0) > expect.maxVisualRows) {
    failures.push(`visual has too many rows (${result.visual.rows.length}, max ${expect.maxVisualRows})`);
  }
  if (expect.artifact && !result?.artifact?.content && !result?.artifact?.href && !result?.artifact?.url) {
    failures.push("expected export artifact");
  }
  if (expect.moduleId && !allModuleIds(result).includes(expect.moduleId)) {
    failures.push(`missing expected module ${expect.moduleId}`);
  }
  if (expect.route && !allActionRoutes(result).includes(expect.route)) {
    failures.push(`missing action route ${expect.route}`);
  }
  if (expect.surfaceId && !includesText(result?.trace?.note, `module=${expect.surfaceId}`)) {
    failures.push(`expected surface ${expect.surfaceId}, got ${result?.trace?.note ?? "none"}`);
  }
  if (expect.maxActions != null && (result?.actions ?? []).length > expect.maxActions) {
    failures.push(`too many actions (${(result.actions ?? []).length}, max ${expect.maxActions})`);
  }
  if (expect.interpretationChanged === true && result?.interpretation?.changed !== true) {
    failures.push("expected query interpretation correction");
  }
  if (expect.decisionFamily && result?.executionPlan?.decision?.family !== expect.decisionFamily) {
    failures.push(`expected decision family ${expect.decisionFamily}, got ${result?.executionPlan?.decision?.family ?? "none"}`);
  }
  if (expect.answerShape && result?.executionPlan?.decision?.answerShape !== expect.answerShape) {
    failures.push(`expected answer shape ${expect.answerShape}, got ${result?.executionPlan?.decision?.answerShape ?? "none"}`);
  }
  if (expect.exactRows != null && Boolean(result?.executionPlan?.decision?.exactRows) !== Boolean(expect.exactRows)) {
    failures.push(`expected exactRows ${Boolean(expect.exactRows)}, got ${Boolean(result?.executionPlan?.decision?.exactRows)}`);
  }
  for (const flag of asArray(expect.decisionRiskFlags)) {
    if (!asArray(result?.executionPlan?.decision?.riskFlags).includes(flag)) {
      failures.push(`missing decision risk flag ${flag}`);
    }
  }

  for (const snippet of asArray(expect.textIncludes)) {
    if (!includesText(text, snippet) && !includesText(body, snippet)) {
      failures.push(`missing ${JSON.stringify(snippet)}`);
    }
  }
  for (const snippet of asArray(expect.textExcludes)) {
    if (includesText(text, snippet) || includesText(body, snippet)) {
      failures.push(`included forbidden snippet ${JSON.stringify(snippet)}`);
    }
  }
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(body)) failures.push(`matched forbidden pattern ${pattern}`);
  }

  return failures;
}

async function runCases(cases, { sessionId, preserveSession = true }) {
  const turns = [];
  for (const [index, testCase] of cases.entries()) {
    const startedAt = Date.now();
    const result = await runCopilotTool({
      content: testCase.prompt,
      sessionId: preserveSession ? sessionId : `${sessionId}-${index}`
    });
    const failures = validateTurn(testCase, result);
    turns.push({
      index: index + 1,
      phase: testCase.phase,
      prompt: testCase.prompt,
      expectedTools: asArray(testCase.expect?.tools ?? testCase.expect?.tool),
      tool: result?.tool ?? null,
      truthState: resultTruthState(result),
      rowCount: result?.trace?.rowCount ?? null,
      visualType: result?.visual?.type ?? null,
      visualRows: result?.visual?.rows?.length ?? null,
      artifactRows: result?.artifact?.rowCount ?? null,
      decisionFamily: result?.executionPlan?.decision?.family ?? null,
      answerShape: result?.executionPlan?.decision?.answerShape ?? null,
      riskFlags: result?.executionPlan?.decision?.riskFlags ?? [],
      actionRoutes: allActionRoutes(result),
      persistence: testCase.expect?.persistence ?? null,
      elapsedMs: Date.now() - startedAt,
      passed: failures.length === 0,
      failures
    });
  }
  return turns;
}

const publicSurfaceIds = new Set(
  platformModuleRegistry
    .filter((module) => module.kind === "surface" && module.aliases.some((alias) => !String(alias).startsWith("__internal_")))
    .map((module) => module.id)
);
const surfaceCases = [...genericSurfaceCases, ...facilitySurfaceCases];
const surfaceCaseCounts = surfaceCases.reduce((counts, testCase) => {
  const surfaceId = testCase.expect.surfaceId;
  counts.set(surfaceId, (counts.get(surfaceId) ?? 0) + 1);
  return counts;
}, new Map());
for (const surfaceId of publicSurfaceIds) {
  const caseCount = surfaceCaseCounts.get(surfaceId) ?? 0;
  if (caseCount < 4) {
    throw new Error(`Stress surface suite must exercise ${surfaceId} at least 4 times, found ${caseCount}.`);
  }
}
if (questionMarathonCases.length !== 25) {
  throw new Error(`Stress question suite must contain exactly 25 analytical turns, found ${questionMarathonCases.length}.`);
}

const startedAt = Date.now();
const surfaceTurns = await runCases(surfaceCases, {
  sessionId: `stress-surfaces-${Date.now()}`,
  preserveSession: false
});
const questionTurns = await runCases(questionMarathonCases, {
  sessionId: `stress-questions-${Date.now()}`,
  preserveSession: true
});
const freshSessionTurns = await runCases(freshSessionCases, {
  sessionId: `stress-fresh-${Date.now()}`,
  preserveSession: true
});
const inevitabilityTurns = await runCases(inevitabilityCases, {
  sessionId: `stress-inevitability-${Date.now()}`,
  preserveSession: true
});

const allTurns = [...surfaceTurns, ...questionTurns, ...freshSessionTurns, ...inevitabilityTurns];
const failedTurns = allTurns.filter((turn) => !turn.passed);
const persistenceTurns = questionTurns.filter((turn) => turn.persistence);
const surfacePassRate = Math.round(surfaceTurns.filter((turn) => turn.passed).length / surfaceTurns.length * 100);
const questionPassRate = Math.round(questionTurns.filter((turn) => turn.passed).length / questionTurns.length * 100);
const summary = {
  generatedAt: new Date().toISOString(),
  status: failedTurns.length ? "fail" : "pass",
  elapsedMs: Date.now() - startedAt,
  surfaceTurns: surfaceTurns.length,
  questionTurns: questionTurns.length,
  freshSessionTurns: freshSessionTurns.length,
  inevitabilityTurns: inevitabilityTurns.length,
  totalTurns: allTurns.length,
  failedTurns: failedTurns.length,
  surfacePassRate,
  questionPassRate,
  persistenceTurns: persistenceTurns.length,
  persistenceFailures: persistenceTurns.filter((turn) => !turn.passed).length,
  artifactTurns: allTurns.filter((turn) => Number(turn.artifactRows ?? 0) > 0).length,
  maxElapsedMs: Math.max(...allTurns.map((turn) => turn.elapsedMs))
};

const report = {
  summary,
  failedTurns,
  phases: {
    surfaceMarathon: surfaceTurns,
    questionMarathon: questionTurns,
    freshSessionReset: freshSessionTurns,
    inevitabilityThread: inevitabilityTurns
  }
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2));

if (failedTurns.length) {
  console.error(`FAILED: user journey stress (${failedTurns.length}/${allTurns.length} failed)`);
  console.error(`Report: ${outputPath}`);
  console.error(failedTurns.slice(0, 20).map((turn) => `- [${turn.phase} #${turn.index}] ${turn.prompt}: ${turn.failures.join("; ")}`).join("\n"));
  process.exit(1);
}

console.log(
  [
    `user journey stress passed (${summary.totalTurns} turns: ${summary.surfaceTurns} surfaces, ${summary.questionTurns} questions, ${summary.freshSessionTurns} fresh-session checks, ${summary.inevitabilityTurns} inevitability turns)`,
    `surface pass rate ${summary.surfacePassRate}%, question pass rate ${summary.questionPassRate}%, persistence failures ${summary.persistenceFailures}`,
    `report -> ${outputPath}`
  ].join("\n")
);
