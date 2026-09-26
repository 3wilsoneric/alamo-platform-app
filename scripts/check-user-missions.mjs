import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCopilotTool } from "../server/copilot-tools.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, "../generated/user-mission-qa");
const outputPath = path.join(outputDir, "latest.json");

const MINIMUM_OVERALL_SCORE = 88;
const MINIMUM_MISSION_SCORE = 84;

const forbiddenPatterns = [
  /\bAnswer The\b/i,
  /\bThe clearest row\b/i,
  /\blargest row in this slice\b/i,
  /\bClosest Recovery Path\b/i,
  /\bObject object\b/i,
  /\bundefined\b/i,
  /\bT00:00:00\.000Z\b/i,
  /\bVictoria's Place\b/i,
  /\bfacility\s+(337|342|343|344|345)\b/i,
  /^source:/i
];

const missions = [
  {
    id: "awol-investigation",
    name: "AWOL Investigation",
    endGoal: "Determine May 2026 AWOL people count, drill into exact AWOL rows, then pivot to San Pablo totals without losing context.",
    targetEvidence: "May 2026 AWOL/Elopement unique-resident count and San Pablo AWOL follow-up context both resolve correctly.",
    turns: [
      turn("how many people went AWOL in May 2026", {
        tools: ["incident_breakdown"],
        period: "2026-05",
        category: "AWOL/Elopement",
        valueLabel: "Residents",
        textIncludes: ["unique resident"],
        critical: true
      }),
      turn("show current incident category breakdown", {
        tools: ["incident_breakdown"],
        period: "2026-06",
        visualType: "bar_chart",
        critical: true
      }),
      turn("List every AWOL incident from May through June by community, including resident name, date, incident type, and description", {
        tools: ["incident_detail_list"],
        periodIncludes: ["2026-05", "2026-06"],
        category: "AWOL/Elopement",
        artifact: true,
        visualType: "table",
        maxVisualRows: 50,
        textIncludes: ["CSV includes all"],
        critical: true
      }),
      turn("do that for April now", {
        tools: ["incident_detail_list"],
        period: "2026-04",
        category: "AWOL/Elopement",
        artifact: true,
        persistence: true,
        critical: true
      }),
      turn("now San Pablo", {
        tools: ["incident_detail_list"],
        facilityId: "337",
        category: "AWOL/Elopement",
        artifact: true,
        persistence: true,
        critical: true
      }),
      turn("just totals", {
        tools: ["incident_breakdown", "slice_metric"],
        facilityId: "337",
        category: "AWOL/Elopement",
        persistence: true,
        critical: true
      }),
      turn("compare San Pablo May incidents to June incidents by category", {
        tools: ["incident_category_comparison"],
        facilityId: "337",
        periodIncludes: ["2026-05", "2026-06"],
        visualType: "comparison_chart"
      }),
      turn("show San Pablo incidents module", {
        tools: ["surface_module"],
        route: "/communities/337?focus=incidents",
        maxActions: 1
      }),
      turn("what data periods are available for incident detail?", {
        tools: ["data_availability"],
        textIncludes: ["most recent incident detail"],
        visualType: "table"
      }),
      turn("open the incident center module", {
        tools: ["surface_module"],
        route: "/incidents",
        maxActions: 1
      })
    ]
  },
  {
    id: "community-pulse",
    name: "Community Pulse Check",
    endGoal: "Assess San Pablo quickly, then drill into census, population composition, resident search, and portfolio position.",
    targetEvidence: "San Pablo topline, census trend, diagnosis mix, LOS mix, resident search, and operating snapshot all resolve as separate useful surfaces.",
    turns: [
      turn("How is San Pablo?", {
        tools: ["community_history"],
        facilityId: "337",
        textIncludes: ["A & A Health Services San Pablo", "census"],
        visualType: "summary_card",
        critical: true
      }),
      turn("show San Pablo census trend", {
        tools: ["census_trend"],
        facilityId: "337",
        visualType: "line_chart",
        critical: true
      }),
      turn("which community added the most residents in June 2026", {
        tools: ["census_movement"],
        period: "2026-06",
        textIncludes: ["A & A Health Services San Pablo"],
        visualType: "bar_chart",
        critical: true
      }),
      turn("show San Pablo diagnosis mix", {
        tools: ["diagnosis_mix"],
        facilityId: "337",
        textIncludes: ["Diagnosis Mix"],
        visualType: "bar_chart"
      }),
      turn("show San Pablo length of stay mix", {
        tools: ["length_of_stay_mix"],
        facilityId: "337",
        textIncludes: ["Average LOS", "365+ days", "Longest stays"],
        visualType: "donut_chart"
      }),
      turn("show San Pablo resident search", {
        tools: ["surface_module"],
        route: "/communities/337?focus=search",
        maxActions: 1
      }),
      turn("search residents in San Pablo", {
        tools: ["resident_search"],
        facilityId: "337",
        visualType: "table"
      }),
      turn("open San Pablo community page", {
        tools: ["surface_module"],
        route: "/communities/337",
        maxActions: 1
      }),
      turn("open communities overview", {
        tools: ["surface_module"],
        route: "/communities",
        maxActions: 1
      }),
      turn("portfolio operating snapshot", {
        tools: ["operating_snapshot"],
        textIncludes: ["Portfolio census increased", "incidents totaled", "highest incident rate"],
        visualType: "table",
        critical: true
      })
    ]
  },
  {
    id: "freshness-and-recovery",
    name: "Freshness And Recovery",
    endGoal: "Figure out whether missing incidents are a platform issue or source-data freshness issue, then recover from unsupported and ambiguous requests.",
    targetEvidence: "Freshness diagnostics name the loaded incident window, unsupported November data fails closed, December data works, and resident ambiguity does not fabricate.",
    turns: [
      turn("why are today's incidents not showing up", {
        tools: ["data_availability"],
        textIncludes: ["most recent incident detail"],
        visualType: "table",
        critical: true
      }),
      turn("what data periods are available for incident detail?", {
        tools: ["data_availability"],
        textIncludes: ["most recent incident detail", "incident events"],
        visualType: "table",
        critical: true
      }),
      turn("give me the top category of each community in incidents November of last year", {
        tools: ["top_incident_category_by_community", "data_availability"],
        truthStates: ["not_loaded", "stale"],
        textIncludes: ["not available"],
        textExcludes: ["June 2026 incidents"],
        critical: true
      }),
      turn("give me the top category of each community in incidents December 2025", {
        tools: ["top_incident_category_by_community"],
        period: "2025-12",
        visualType: "table",
        critical: true
      }),
      turn("show available analytical slices", {
        tools: ["tool_context_catalog"]
      }),
      turn("show definitions", {
        tools: ["surface_module"],
        route: "/glossary",
        maxActions: 1,
        critical: true
      }),
      turn("show john smith resident profile", {
        tools: ["data_recovery", "resident_lookup"],
        truthStates: ["verified_zero", "not_loaded"],
        textIncludes: ["no verified exact match"],
        textExcludes: ["Audrey West", "Portfolio Longest Stay"],
        critical: true
      }),
      turn("show jon smth resident profile", {
        tools: ["clarification"],
        truthStates: ["plan_rejected", "needs_clarification"],
        textIncludes: ["Did you mean"],
        critical: true
      }),
      turn("resident search", {
        tools: ["surface_module"],
        route: "/resident-search",
        maxActions: 1
      })
    ]
  },
  {
    id: "resident-detail-drill",
    name: "Resident Detail Drill",
    endGoal: "Open one resident profile, inspect incident history, pivot to that community, then ask unrelated questions without stale resident context contaminating the answer.",
    targetEvidence: "Shannon Romero profile and incident history render correctly, Santa Clarita surfaces open, and later freshness/AWOL questions do not answer with Shannon context.",
    turns: [
      turn("show Shannon Romero resident profile", {
        tools: ["resident_lookup"],
        textIncludes: ["Shannon Romero", "Resident #", "Santa Clarita"],
        moduleId: "resident-profile",
        critical: true
      }),
      turn("show Shannon Romero incident history", {
        tools: ["resident_incident_history"],
        textIncludes: ["Shannon Romero"],
        visualType: "bar_chart",
        critical: true
      }),
      turn("open Santa Clarita community page", {
        tools: ["surface_module"],
        route: "/communities/345",
        maxActions: 1
      }),
      turn("show Santa Clarita incidents module", {
        tools: ["surface_module"],
        route: "/communities/345?focus=incidents",
        maxActions: 1
      }),
      turn("show Santa Clarita census trend", {
        tools: ["census_trend"],
        facilityId: "345",
        visualType: "line_chart",
        critical: true
      }),
      turn("How is Santa Clarita?", {
        tools: ["community_history"],
        facilityId: "345",
        textIncludes: ["Santa Clarita"],
        visualType: "table"
      }),
      turn("show Santa Clarita resident search", {
        tools: ["surface_module"],
        route: "/communities/345?focus=search",
        maxActions: 1
      }),
      turn("show me the resident search module", {
        tools: ["surface_module"],
        route: "/resident-search",
        maxActions: 1
      }),
      turn("why are today's incidents not showing up", {
        tools: ["data_availability"],
        textIncludes: ["most recent incident detail"],
        textExcludes: ["Shannon Romero", "Resident #"],
        visualType: "table",
        critical: true
      }),
      turn("how many people went AWOL in May 2026", {
        tools: ["incident_breakdown"],
        period: "2026-05",
        category: "AWOL/Elopement",
        valueLabel: "Residents",
        textIncludes: ["unique resident"],
        textExcludes: ["Shannon Romero"],
        critical: true
      })
    ]
  },
  {
    id: "medication-to-incident-cross-check",
    name: "Medication To Incident Cross-Check",
    endGoal: "Start with San Pablo medication signal, preserve community context for compliance follow-up, then pivot into incidents and resident composition.",
    targetEvidence: "Medication profile, compliance follow-up, refusal breakdown, incident comparison, diagnosis mix, and San Pablo incident surface all resolve without context drift.",
    turns: [
      turn("How is San Pablo doing with medications?", {
        tools: ["medication_profile"],
        facilityId: "337",
        textIncludes: ["A & A Health Services San Pablo", "Compliance"],
        critical: true
      }),
      turn("Show me its compliance for the latest month.", {
        tools: ["medication_compliance"],
        facilityId: "337",
        textIncludes: ["A & A Health Services San Pablo"],
        textExcludes: ["Portfolio medication compliance"],
        persistence: true,
        critical: true
      }),
      turn("What medications had the most refusals?", {
        tools: ["medication_refusals_by_community", "ad_hoc_medication_chart"],
        textIncludes: ["refus"],
        visualType: "bar_chart",
        critical: true
      }),
      turn("show San Pablo medication compliance", {
        tools: ["medication_compliance"],
        facilityId: "337",
        textIncludes: ["A & A Health Services San Pablo"],
        visualType: "table"
      }),
      turn("compare San Pablo May incidents to June incidents by category", {
        tools: ["incident_category_comparison"],
        facilityId: "337",
        periodIncludes: ["2026-05", "2026-06"],
        visualType: "comparison_chart"
      }),
      turn("show San Pablo diagnosis mix", {
        tools: ["diagnosis_mix"],
        facilityId: "337",
        visualType: "bar_chart"
      }),
      turn("show San Pablo incidents module", {
        tools: ["surface_module"],
        route: "/communities/337?focus=incidents",
        maxActions: 1
      }),
      turn("portfolio operating snapshot", {
        tools: ["operating_snapshot"],
        visualType: "table",
        textIncludes: ["Portfolio census increased", "incidents totaled"]
      })
    ]
  }
];

function turn(prompt, expect) {
  return { prompt, expect };
}

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

  const add = (category, message, severity = "major") => failures.push({ category, message, severity });

  if (!result?.handled) add("accuracy", "result was not handled");
  if (result?.handled && result.tool !== "clarification" && !result.runtimeSchema?.valid) {
    add("breakage", "missing or invalid runtime schema");
  }
  if (result?.handled && result.tool !== "clarification" && !result.turnTrace?.turnId) {
    add("breakage", "missing analyst turn trace");
  }

  const acceptedTools = asArray(expect.tools ?? expect.tool);
  if (acceptedTools.length && !acceptedTools.includes(result?.tool)) {
    add("accuracy", `expected tool ${acceptedTools.join(" or ")}, got ${result?.tool ?? "none"}`);
  }

  const expectedTruthStates = asArray(expect.truthStates ?? expect.truthState);
  if (expectedTruthStates.length && !expectedTruthStates.includes(resultTruthState(result))) {
    add("accuracy", `expected truthState ${expectedTruthStates.join(" or ")}, got ${resultTruthState(result) ?? "none"}`);
  }

  if (expect.period && !includesText(haystack, expect.period)) add("accuracy", `missing expected period ${expect.period}`);
  for (const period of asArray(expect.periodIncludes)) {
    if (!includesText(haystack, period)) add("accuracy", `missing expected period ${period}`);
  }
  if (expect.facilityId && !includesText(haystack, `"facilityId":"${expect.facilityId}"`) && !includesText(haystack, `"facility_id":"${expect.facilityId}"`)) {
    add(expect.persistence ? "persistence" : "accuracy", `missing facility scope ${expect.facilityId}`);
  }
  if (expect.category && !includesText(haystack, expect.category)) {
    add(expect.persistence ? "persistence" : "accuracy", `missing category ${expect.category}`);
  }
  if (expect.valueLabel && result?.visual?.valueLabel !== expect.valueLabel) {
    add("accuracy", `expected value label ${expect.valueLabel}, got ${result?.visual?.valueLabel ?? "none"}`);
  }
  if (expect.visualType && result?.visual?.type !== expect.visualType) {
    add("surface", `expected visual type ${expect.visualType}, got ${result?.visual?.type ?? "none"}`);
  }
  if (expect.maxVisualRows != null && (result?.visual?.rows?.length ?? 0) > expect.maxVisualRows) {
    add("surface", `visual has too many rows (${result.visual.rows.length}, max ${expect.maxVisualRows})`);
  }
  if (expect.artifact && !result?.artifact?.content && !result?.artifact?.href && !result?.artifact?.url) {
    add("surface", "expected export artifact");
  }
  if (expect.moduleId && !allModuleIds(result).includes(expect.moduleId)) {
    add("surface", `missing expected module ${expect.moduleId}`);
  }
  if (expect.route && !allActionRoutes(result).includes(expect.route)) {
    add("surface", `missing action route ${expect.route}`);
  }
  if (expect.maxActions != null && (result?.actions ?? []).length > expect.maxActions) {
    add("readability", `too many actions (${(result.actions ?? []).length}, max ${expect.maxActions})`, "minor");
  }
  if (expect.persistence && /not enough context|what would you like|could you clarify/i.test(text)) {
    add("persistence", "follow-up lost prior context");
  }

  for (const snippet of asArray(expect.textIncludes)) {
    if (!includesText(text, snippet) && !includesText(body, snippet)) add("accuracy", `missing ${JSON.stringify(snippet)}`);
  }
  for (const snippet of asArray(expect.textExcludes)) {
    if (includesText(text, snippet) || includesText(body, snippet)) add("accuracy", `included forbidden snippet ${JSON.stringify(snippet)}`);
  }
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(body) || pattern.test(text.trim())) add("readability", `matched forbidden pattern ${pattern}`, "minor");
  }

  if (!text.trim()) add("readability", "empty answer text");
  if (/^source:/i.test(text.trim())) add("readability", "answer starts with source metadata");
  if ((result?.actions ?? []).length > 2 && !expect.maxActions) add("readability", `action clutter (${result.actions.length} actions)`, "minor");

  return failures;
}

function scoreMission(turns) {
  const failureCounts = {
    accuracy: 0,
    persistence: 0,
    surface: 0,
    readability: 0,
    breakage: 0
  };
  let criticalFailures = 0;
  let persistenceTurns = 0;
  let persistencePasses = 0;
  let surfaceTurns = 0;
  let surfacePasses = 0;

  for (const turn of turns) {
    for (const failure of turn.failures) {
      failureCounts[failure.category] = (failureCounts[failure.category] ?? 0) + (failure.severity === "major" ? 1 : 0.45);
    }
    if (turn.critical && turn.failures.some((failure) => failure.severity === "major")) criticalFailures += 1;
    if (turn.persistence) {
      persistenceTurns += 1;
      if (!turn.failures.some((failure) => failure.category === "persistence" || failure.category === "accuracy")) persistencePasses += 1;
    }
    if (turn.expectedRoute || turn.visualType || turn.artifactRows != null) {
      surfaceTurns += 1;
      if (!turn.failures.some((failure) => failure.category === "surface")) surfacePasses += 1;
    }
  }

  const majorFailures = turns.flatMap((turn) => turn.failures).filter((failure) => failure.severity === "major").length;
  const averageElapsed = Math.round(turns.reduce((total, turn) => total + turn.elapsedMs, 0) / Math.max(1, turns.length));
  const maxElapsed = Math.max(...turns.map((turn) => turn.elapsedMs));

  const accuracy = clamp(100 - failureCounts.accuracy * 18 - criticalFailures * 6 - failureCounts.breakage * 30);
  const persistence = persistenceTurns ? Math.round(persistencePasses / persistenceTurns * 100) : 100;
  const surface = surfaceTurns ? Math.round(surfacePasses / surfaceTurns * 100) : 100;
  const readability = clamp(100 - failureCounts.readability * 12 - turns.filter((turn) => turn.actionCount > 2).length * 8);
  const speed = clamp(100 - Math.max(0, averageElapsed - 650) / 18 - Math.max(0, maxElapsed - 2500) / 35);
  const score = Math.round(accuracy * 0.35 + persistence * 0.2 + surface * 0.15 + readability * 0.15 + speed * 0.15);

  return {
    score,
    dimensions: {
      accuracy: Math.round(accuracy),
      persistence,
      surface,
      readability: Math.round(readability),
      speed: Math.round(speed)
    },
    majorFailures,
    criticalFailures,
    averageElapsed,
    maxElapsed,
    verdict: score >= 92 ? "strong" : score >= 84 ? "usable with friction" : "needs work"
  };
}

function clamp(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function makeJudgeNotes(mission, turns, score) {
  const notes = [];
  const firstCriticalFailure = turns.find((turn) => turn.critical && turn.failures.length);
  const failedTurns = turns.filter((turn) => turn.failures.length);
  const persisted = turns.filter((turn) => turn.persistence);
  const surfaceTurns = turns.filter((turn) => turn.expectedRoute || turn.visualType);

  if (!firstCriticalFailure) {
    notes.push(`Reached the mission goal: ${mission.targetEvidence}`);
  } else {
    notes.push(`Mission goal was blocked at turn ${firstCriticalFailure.index}: ${firstCriticalFailure.prompt}`);
  }
  if (persisted.length) {
    const failedPersistence = persisted.filter((turn) => turn.failures.some((failure) => failure.category === "persistence" || failure.category === "accuracy"));
    notes.push(failedPersistence.length ? `${failedPersistence.length}/${persisted.length} follow-ups lost or weakened context.` : `Follow-up context held across ${persisted.length} persistence turns.`);
  }
  if (surfaceTurns.length) {
    const failedSurface = surfaceTurns.filter((turn) => turn.failures.some((failure) => failure.category === "surface"));
    notes.push(failedSurface.length ? `${failedSurface.length}/${surfaceTurns.length} surface/visual turns were wrong or missing.` : `${surfaceTurns.length} surface/visual turns rendered the expected object.`);
  }
  if (failedTurns.length) {
    notes.push(`Reviewer friction: ${failedTurns.length} turns need attention (${failedTurns.slice(0, 3).map((turn) => `#${turn.index}`).join(", ")}${failedTurns.length > 3 ? ", ..." : ""}).`);
  } else {
    notes.push("No breakage, stale-name leakage, source-metadata starts, or context-loss wording appeared.");
  }
  notes.push(`Judge verdict: ${score.verdict}.`);
  return notes;
}

async function runMission(mission) {
  const sessionId = `mission-${mission.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const turns = [];

  for (const [index, testCase] of mission.turns.entries()) {
    const startedAt = Date.now();
    const result = await runCopilotTool({
      content: testCase.prompt,
      sessionId
    });
    const failures = validateTurn(testCase, result);
    turns.push({
      index: index + 1,
      prompt: testCase.prompt,
      critical: Boolean(testCase.expect?.critical),
      persistence: Boolean(testCase.expect?.persistence),
      expectedTools: asArray(testCase.expect?.tools ?? testCase.expect?.tool),
      expectedRoute: testCase.expect?.route ?? null,
      tool: result?.tool ?? null,
      truthState: resultTruthState(result),
      period: result?.trace?.period ?? null,
      facilityId: result?.trace?.facilityId ?? null,
      rowCount: result?.trace?.rowCount ?? null,
      visualType: result?.visual?.type ?? null,
      visualRows: result?.visual?.rows?.length ?? null,
      artifactRows: result?.artifact?.rowCount ?? null,
      actionCount: result?.actions?.length ?? 0,
      elapsedMs: Date.now() - startedAt,
      failures
    });
  }

  const score = scoreMission(turns);
  return {
    id: mission.id,
    name: mission.name,
    endGoal: mission.endGoal,
    targetEvidence: mission.targetEvidence,
    score: score.score,
    verdict: score.verdict,
    dimensions: score.dimensions,
    majorFailures: score.majorFailures,
    criticalFailures: score.criticalFailures,
    averageElapsed: score.averageElapsed,
    maxElapsed: score.maxElapsed,
    judgeNotes: makeJudgeNotes(mission, turns, score),
    turns
  };
}

const startedAt = Date.now();
const results = [];
for (const mission of missions) {
  results.push(await runMission(mission));
}

const averageScore = Math.round(results.reduce((total, mission) => total + mission.score, 0) / Math.max(1, results.length));
const failedMissions = results.filter((mission) => mission.score < MINIMUM_MISSION_SCORE || mission.criticalFailures > 0);
const allTurns = results.flatMap((mission) => mission.turns);
const report = {
  summary: {
    generatedAt: new Date().toISOString(),
    status: averageScore >= MINIMUM_OVERALL_SCORE && failedMissions.length === 0 ? "pass" : "fail",
    elapsedMs: Date.now() - startedAt,
    missions: results.length,
    turns: allTurns.length,
    averageScore,
    minimumOverallScore: MINIMUM_OVERALL_SCORE,
    minimumMissionScore: MINIMUM_MISSION_SCORE,
    failedMissions: failedMissions.length,
    totalMajorFailures: results.reduce((total, mission) => total + mission.majorFailures, 0),
    totalCriticalFailures: results.reduce((total, mission) => total + mission.criticalFailures, 0),
    averageTurnMs: Math.round(allTurns.reduce((total, turn) => total + turn.elapsedMs, 0) / Math.max(1, allTurns.length)),
    maxTurnMs: Math.max(...allTurns.map((turn) => turn.elapsedMs))
  },
  missions: results,
  failedMissions: failedMissions.map((mission) => ({
    id: mission.id,
    name: mission.name,
    score: mission.score,
    verdict: mission.verdict,
    dimensions: mission.dimensions,
    judgeNotes: mission.judgeNotes,
    failedTurns: mission.turns.filter((turn) => turn.failures.length)
  }))
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2));

if (report.summary.status !== "pass") {
  console.error(`FAILED: user mission QA scored ${averageScore}/100 across ${results.length} missions`);
  console.error(`Report: ${outputPath}`);
  console.error(report.failedMissions.map((mission) => `- ${mission.name}: ${mission.score}/100 ${mission.verdict}; ${mission.judgeNotes.join(" ")}`).join("\n"));
  process.exit(1);
}

console.log(
  [
    `user mission QA passed (${results.length} missions, ${allTurns.length} turns, average ${averageScore}/100)`,
    `mission scores: ${results.map((mission) => `${mission.name} ${mission.score}`).join(", ")}`,
    `average turn ${report.summary.averageTurnMs}ms, max turn ${report.summary.maxTurnMs}ms`,
    `report -> ${outputPath}`
  ].join("\n")
);
