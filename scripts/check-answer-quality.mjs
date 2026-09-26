import { runCopilotTool } from "../server/copilot-tools.mjs";
import {
  getAnalystTraceTelemetry,
  resetAnalystTraceTelemetry
} from "../server/tools/turn-trace.mjs";

const failures = [];

const cases = [
  {
    id: "resident-profile",
    prompt: "show Shannon Romero resident profile",
    expectedTool: "resident_lookup",
    minScore: 82,
    textIncludes: ["Shannon Romero", "Resident #"],
    moduleRequired: true
  },
  {
    id: "people-count",
    prompt: "how many people went AWOL in May 2026",
    expectedTool: "incident_breakdown",
    minScore: 84,
    textIncludes: ["unique resident", "May 2026"],
    moduleRequired: true
  },
  {
    id: "multi-period-detail",
    prompt: "List every AWOL incident from May through June by community, including resident name, date, incident type, and description",
    expectedTool: "incident_detail_list",
    minScore: 82,
    textIncludes: ["The CSV includes all 375 exact matches"],
    moduleRequired: true,
    artifactRequired: true
  },
  {
    id: "freshness",
    prompt: "why are today's incidents not showing up",
    expectedTool: "data_availability",
    minScore: 78,
    textIncludes: ["most recent incident detail"],
    moduleRequired: true
  },
  {
    id: "unsupported-period-recovery",
    prompt: "show incidents for November 2020",
    expectedTool: "incident_breakdown",
    minScore: 62,
    recoveryExpected: true
  },
  {
    id: "community-history",
    prompt: "San Pablo March April May June detail",
    minScore: 76,
    textIncludes: ["A & A Health Services San Pablo"],
    moduleRequired: true
  }
];

const awkwardPatterns = [
  /\bAnswer The\b/i,
  /^\s*Source:/i,
  /\bclearest row\b/i,
  /\blargest row in this slice\b/i,
  /\[object Object\]/i,
  /\bundefined\b/i,
  /\bT00:00:00\.000Z\b/i,
  /\bVictoria's Place\b/i,
  /\bfacility\s+(337|342|343|344|345)\b/i
];

function resultText(result) {
  return String(result?.text ?? "");
}

function resultModules(result) {
  return [
    ...(result?.moduleSpec ? [result.moduleSpec] : []),
    ...(Array.isArray(result?.moduleSpecs) ? result.moduleSpecs : [])
  ];
}

function lower(value) {
  return String(value ?? "").toLowerCase();
}

function assertCase(condition, message) {
  if (!condition) failures.push(message);
}

resetAnalystTraceTelemetry();

for (const scenario of cases) {
  const result = await runCopilotTool({
    content: scenario.prompt,
    sessionId: `answer-quality-${scenario.id}-${Date.now()}`
  });
  const text = resultText(result);
  const quality = result?.turnTrace?.quality;
  const modules = resultModules(result);

  assertCase(result?.handled === true, `${scenario.id}: prompt was not handled`);
  if (scenario.expectedTool) {
    assertCase(result?.tool === scenario.expectedTool, `${scenario.id}: expected ${scenario.expectedTool}, got ${result?.tool ?? "none"}`);
  }
  assertCase(quality && Number.isFinite(Number(quality.score)), `${scenario.id}: missing turnTrace quality score`);
  assertCase(Number(quality?.score ?? 0) >= scenario.minScore, `${scenario.id}: quality score ${quality?.score ?? "none"} below ${scenario.minScore}; flags=${(quality?.flags ?? []).join(",")}`);
  assertCase(!["poor"].includes(String(quality?.grade ?? "")), `${scenario.id}: answer quality grade was poor`);

  for (const snippet of scenario.textIncludes ?? []) {
    assertCase(lower(text).includes(lower(snippet)), `${scenario.id}: answer missing ${JSON.stringify(snippet)}`);
  }

  for (const pattern of awkwardPatterns) {
    assertCase(!pattern.test(text), `${scenario.id}: answer matched awkward pattern ${pattern}`);
  }

  if (scenario.moduleRequired) {
    assertCase(modules.length > 0 || result?.visual, `${scenario.id}: expected a rendered module or visual`);
  }

  if (scenario.artifactRequired) {
    assertCase(Boolean(result?.artifact?.content), `${scenario.id}: expected exact-row artifact`);
  }

  if (scenario.recoveryExpected) {
    assertCase(
      result?.safeRefusal === true || ["not_loaded", "plan_rejected", "stale"].includes(String(result?.truthState ?? result?.trace?.truthState ?? "")),
      `${scenario.id}: expected a safe recovery truth state`
    );
  }
}

const telemetry = getAnalystTraceTelemetry();

assertCase(telemetry.summary.totalTurns === cases.length, `trace telemetry retained ${telemetry.summary.totalTurns} turns, expected ${cases.length}`);
assertCase(telemetry.summary.qualityScoredTurns === cases.length, `trace telemetry scored ${telemetry.summary.qualityScoredTurns} turns, expected ${cases.length}`);
assertCase(telemetry.summary.averageQualityScore >= 70, `average quality score was low: ${telemetry.summary.averageQualityScore}`);
assertCase(Array.isArray(telemetry.decisionFamilies) && telemetry.decisionFamilies.length > 0, "missing decision-family quality telemetry");
assertCase(Array.isArray(telemetry.qualityFlags), "missing quality flag telemetry");
assertCase(telemetry.moduleCoverage?.version === "platform-module-coverage-v1", "missing module coverage telemetry");
assertCase(Number(telemetry.moduleCoverage?.totalModules ?? 0) > 0, "module coverage has no registered modules");

if (failures.length) {
  console.error(`FAILED: answer quality gate (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  console.error(`Telemetry summary: ${JSON.stringify(telemetry.summary, null, 2)}`);
  process.exit(1);
}

console.log(`answer quality checks passed (${cases.length} prompts, ${telemetry.summary.averageQualityScore}/100 avg quality, ${telemetry.moduleCoverage.totalModules} modules covered by registry)`);
