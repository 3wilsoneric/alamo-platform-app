import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCopilotTool } from "../server/copilot-tools.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(__dirname, "user-journey-scenarios.json");
const outputDir = path.resolve(__dirname, "../generated/user-journey-qa");
const outputPath = path.join(outputDir, "latest.json");

const CATEGORY_WEIGHTS = {
  intent: 24,
  data: 20,
  answer: 18,
  surface: 14,
  display: 14,
  recovery: 10
};

const AWKWARD_PATTERNS = [
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

const RECOMMENDATIONS = {
  intent: "Tighten intent compilation, tool selection, or follow-up state inheritance.",
  data: "Check period/category/community extraction and post-execution scope validation.",
  answer: "Improve the shared answer formatter so direct answers land early and awkward phrasing is removed.",
  surface: "Audit moduleSpec/visual composition so the right surface is attached to the answer.",
  display: "Trim action clutter, stale labels, oversized visuals, or hard-to-read table/chart output.",
  recovery: "Make unsupported/no-match paths name the missing data, closest valid slice, and safe next action."
};

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

function allModuleIds(result) {
  return [
    result?.moduleSpec?.moduleId ?? result?.moduleSpec?.id,
    ...(result?.moduleSpecs ?? []).map((moduleSpec) => moduleSpec?.moduleId ?? moduleSpec?.id)
  ].filter(Boolean);
}

function allActionRoutes(result) {
  return (result?.actions ?? []).map((action) => action?.route ?? action?.url).filter(Boolean);
}

function allActionPrompts(result) {
  return (result?.actions ?? []).map((action) => action?.prompt).filter(Boolean);
}

function expandScenario(scenario) {
  const turns = scenario.turns ?? [];
  const expanded = [{ ...scenario, expandedFrom: scenario.id, turns: turns.map(stripPromptVariants) }];

  turns.forEach((turn, turnIndex) => {
    for (const prompt of turn.promptVariants ?? []) {
      expanded.push({
        ...scenario,
        id: `${scenario.id}::variant-${turnIndex + 1}-${slug(prompt)}`,
        expandedFrom: scenario.id,
        variantOfPrompt: turn.prompt,
        variantPrompt: prompt,
        turns: turns.map((candidate, index) =>
          stripPromptVariants(index === turnIndex ? { ...candidate, prompt } : candidate)
        )
      });
    }
  });

  return expanded;
}

function stripPromptVariants(turn) {
  const { promptVariants: _promptVariants, ...rest } = turn;
  return rest;
}

function slug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
}

function makeCategoryScore(weight, failures) {
  if (!failures.length) {
    return {
      score: weight,
      failures: []
    };
  }

  const penalty = Math.min(weight, failures.reduce((total, failure) => total + (failure.severity === "major" ? weight * 0.55 : weight * 0.28), 0));
  return {
    score: Math.max(0, weight - penalty),
    failures: failures.map((failure) => failure.message)
  };
}

function addFailure(bucket, message, severity = "major") {
  bucket.push({ message, severity });
}

function scoreTurn({ scenario, turn, turnIndex, result }) {
  const expect = turn.expect ?? {};
  const text = String(result?.text ?? "");
  const haystack = resultHaystack(result);
  const categories = {
    intent: [],
    data: [],
    answer: [],
    surface: [],
    display: [],
    recovery: []
  };

  if (result?.handled !== true) addFailure(categories.intent, `result was not handled (${result?.reason ?? "no reason"})`);

  const expectedTools = asArray(expect.tools ?? expect.tool);
  if (expectedTools.length && !expectedTools.includes(result?.tool)) {
    addFailure(categories.intent, `expected tool ${expectedTools.join(" or ")}, got ${result?.tool ?? "none"}`);
  }

  if (expect.interpretationChanged === true && result?.interpretation?.changed !== true) {
    addFailure(categories.intent, "expected typo/interpretation correction");
  }

  if (expect.interpretationChanged === false && result?.interpretation?.changed === true) {
    addFailure(categories.intent, "unexpected query interpretation correction", "minor");
  }

  if (result?.planValidation?.valid === false && !expect.planValidationCanFail) {
    addFailure(categories.intent, `plan validation failed: ${(result.planValidation.errors ?? []).join("; ")}`);
  }

  if (expect.period && !includesText(haystack, expect.period)) {
    addFailure(categories.data, `missing expected period ${expect.period}`);
  }

  for (const period of asArray(expect.periodIncludes)) {
    if (!includesText(haystack, period)) addFailure(categories.data, `missing expected period ${period}`);
  }

  if (expect.facilityId && !includesText(haystack, `"facilityId":"${expect.facilityId}"`) && !includesText(haystack, `"facility_id":"${expect.facilityId}"`)) {
    addFailure(categories.data, `missing facility scope ${expect.facilityId}`);
  }

  if (expect.categoryIncludes && !includesText(haystack, expect.categoryIncludes)) {
    addFailure(categories.data, `missing category ${expect.categoryIncludes}`);
  }

  if (expect.valueLabel && !includesText(result?.visual?.valueLabel ?? "", expect.valueLabel)) {
    addFailure(categories.data, `expected visual value label ${expect.valueLabel}, got ${result?.visual?.valueLabel ?? "none"}`);
  }

  const expectedTruthStates = asArray(expect.truthStates ?? expect.truthState);
  if (expectedTruthStates.length && !expectedTruthStates.includes(resultTruthState(result))) {
    addFailure(categories.data, `expected truth state ${expectedTruthStates.join(" or ")}, got ${resultTruthState(result) ?? "none"}`);
  }

  for (const snippet of asArray(expect.textIncludes)) {
    if (!includesText(text, snippet)) addFailure(categories.answer, `answer missing ${JSON.stringify(snippet)}`);
  }

  for (const snippet of asArray(expect.softTextIncludes)) {
    if (!includesText(text, snippet)) addFailure(categories.answer, `answer could be clearer if it included ${JSON.stringify(snippet)}`, "minor");
  }

  for (const snippet of asArray(expect.textExcludes)) {
    if (includesText(text, snippet)) addFailure(categories.display, `answer included forbidden snippet ${JSON.stringify(snippet)}`);
  }

  for (const snippet of asArray(expect.globalExcludes)) {
    if (includesText(haystack, snippet)) addFailure(categories.display, `output included forbidden snippet ${JSON.stringify(snippet)}`);
  }

  if (expect.direct && text.trim().length > 0) {
    const firstChunk = text.trim().slice(0, 420);
    const directSignals = [
      /\bshort answer\b/i,
      /\banswer\b/i,
      /\bhad\b/i,
      /\bwas\b/i,
      /\bis\b/i,
      /\bopened\b/i,
      /\bopening\b/i,
      /\bprofile\b/i,
      /\bcompliance\b/i,
      /\bincidents?\b/i,
      /\bcensus\b/i
    ];
    if (!directSignals.some((pattern) => pattern.test(firstChunk))) {
      addFailure(categories.answer, "answer does not appear to provide a direct response early", "minor");
    }
  }

  if (!text.trim()) addFailure(categories.answer, "empty answer text");
  if (/^source:/i.test(text.trim())) addFailure(categories.answer, "answer starts with raw source metadata");

  for (const pattern of AWKWARD_PATTERNS) {
    if (pattern.test(haystack)) addFailure(categories.display, `matched awkward/stale pattern ${pattern}`);
  }

  if (expect.moduleId && !allModuleIds(result).includes(expect.moduleId)) {
    addFailure(categories.surface, `missing expected module ${expect.moduleId}`, "minor");
  }

  for (const moduleId of asArray(expect.moduleIdsInclude)) {
    if (!allModuleIds(result).includes(moduleId)) {
      addFailure(categories.surface, `missing expected module ${moduleId}`);
    }
  }

  if (expect.moduleCountMax != null && (result?.moduleSpecs ?? []).length > expect.moduleCountMax) {
    addFailure(categories.surface, `too many composed modules (${result.moduleSpecs.length})`);
  }

  if (expect.actionsIncludeRoute && !allActionRoutes(result).includes(expect.actionsIncludeRoute)) {
    addFailure(categories.surface, `missing action route ${expect.actionsIncludeRoute}`);
  }

  if (expect.actionsIncludePrompt && !allActionPrompts(result).some((prompt) => includesText(prompt, expect.actionsIncludePrompt))) {
    addFailure(categories.surface, `missing action prompt containing ${expect.actionsIncludePrompt}`);
  }

  if (expect.artifact && !result?.artifact?.content) {
    addFailure(categories.surface, "expected CSV/artifact output");
  }

  if (expect.visual) {
    if (!result?.visual) {
      addFailure(categories.surface, "expected visual module");
    } else {
      if (expect.visual.type && result.visual.type !== expect.visual.type) {
        addFailure(categories.surface, `expected visual type ${expect.visual.type}, got ${result.visual.type ?? "none"}`);
      }
      if (expect.visual.titleIncludes && !includesText(result.visual.title, expect.visual.titleIncludes)) {
        addFailure(categories.surface, `visual title missing ${expect.visual.titleIncludes}`);
      }
      if (expect.visual.valueLabel && !includesText(result.visual.valueLabel, expect.visual.valueLabel)) {
        addFailure(categories.surface, `visual value label missing ${expect.visual.valueLabel}`);
      }
      if (expect.visual.minRows != null && (result.visual.rows?.length ?? 0) < expect.visual.minRows) {
        addFailure(categories.surface, `visual has too few rows (${result.visual.rows?.length ?? 0})`);
      }
      if (expect.visual.maxRows != null && (result.visual.rows?.length ?? 0) > expect.visual.maxRows) {
        addFailure(categories.display, `visual has too many rows (${result.visual.rows?.length ?? 0})`);
      }
      if (expect.visual.requiresOriginalRowCount && !result.visual.originalRowCount) {
        addFailure(categories.display, "preview visual missing original row count");
      }
      const numericCommunityLabels = (result.visual.rows ?? [])
        .map((row) => String(row?.label ?? ""))
        .filter((label) => /^(337|342|343|344|345)$/.test(label));
      if (numericCommunityLabels.length) {
        addFailure(categories.display, `visual exposes facility IDs as labels (${numericCommunityLabels.join(", ")})`);
      }
    }
  }

  const maxActions = expect.maxActions ?? (expect.artifact ? 3 : 2);
  if ((result?.actions ?? []).length > maxActions) {
    addFailure(categories.display, `too many action chips (${(result.actions ?? []).length}, max ${maxActions})`);
  }

  if (expect.safeRefusal && result?.safeRefusal !== true) {
    addFailure(categories.recovery, "expected safe refusal flag");
  }

  if (expect.recovery) {
    const recoveryTextPattern = /did you mean|not available|unavailable|no verified exact match|could not verify|closest|available range|not loaded/i;
    if (!recoveryTextPattern.test(text)) {
      addFailure(categories.recovery, "recovery answer did not explain ambiguity/missing data");
    }
    if (!expect.safeRefusal && resultTruthState(result) === "not_loaded" && !/closest|loaded|not available/i.test(text)) {
      addFailure(categories.recovery, "not-loaded result did not name loaded/closest alternatives");
    }
  } else {
    if (result?.safeRefusal === true) addFailure(categories.recovery, "unexpected safe refusal");
    if (/not enough context|what would you like|i cannot answer that exact slice safely/i.test(text)) {
      addFailure(categories.recovery, "unexpected generic fallback language");
    }
  }

  const categoryScores = Object.fromEntries(
    Object.entries(CATEGORY_WEIGHTS).map(([category, weight]) => [category, makeCategoryScore(weight, categories[category] ?? [])])
  );
  const score = Math.round(Object.values(categoryScores).reduce((total, category) => total + category.score, 0));
  const failures = Object.entries(categoryScores).flatMap(([category, value]) =>
    value.failures.map((message) => ({ category, message }))
  );

  return {
    id: `${scenario.id}#${turnIndex + 1}`,
    prompt: turn.prompt,
    tool: result?.tool ?? null,
    score,
    categoryScores,
    failures,
    trace: {
      truthState: resultTruthState(result),
      period: result?.trace?.period ?? null,
      facilityId: result?.trace?.facilityId ?? result?.analysisFrame?.facilityId ?? null,
      rowCount: result?.trace?.rowCount ?? null,
      visualType: result?.visual?.type ?? null,
      visualRows: result?.visual?.rows?.length ?? null,
      artifactRows: result?.artifact?.rowCount ?? null,
      actionCount: result?.actions?.length ?? 0,
      moduleIds: allModuleIds(result)
    }
  };
}

async function runScenario(scenario) {
  const sessionId = `user-journey-${scenario.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let analysisFrame = null;
  const turns = [];

  for (const [turnIndex, turn] of scenario.turns.entries()) {
    const startedAt = Date.now();
    const result = await runCopilotTool({
      content: turn.prompt,
      sessionId,
      analysisFrame
    });
    if (result?.analysisFrame) analysisFrame = result.analysisFrame;

    turns.push({
      ...scoreTurn({ scenario, turn, turnIndex, result }),
      elapsedMs: Date.now() - startedAt
    });
  }

  const score = Math.round(turns.reduce((total, turn) => total + turn.score, 0) / Math.max(1, turns.length));
  return {
    id: scenario.id,
    expandedFrom: scenario.expandedFrom,
    persona: scenario.persona,
    category: scenario.category,
    journeyName: scenario.journeyName ?? findJourneyName(catalogCache, scenario.expandedFrom ?? scenario.id),
    surface: scenario.surface ?? null,
    mode: scenario.mode ?? null,
    description: scenario.description,
    score,
    turns
  };
}

let catalogCache = null;

function findJourneyName(catalog, scenarioId) {
  if (!catalog || !scenarioId) return null;
  return (catalog.journeys ?? []).find((journey) => (journey.scenarioIds ?? []).includes(scenarioId))?.name ?? null;
}

function summarize(results, catalog) {
  const turns = results.flatMap((scenario) => scenario.turns);
  const categoryFailureCounts = {};
  const categoryScores = {};
  const journeySummaries = (catalog.journeys ?? []).map((journey) => {
    const scenarioIds = new Set(journey.scenarioIds ?? []);
    const journeyResults = results.filter((scenario) => scenarioIds.has(scenario.expandedFrom ?? scenario.id));
    const journeyTurns = journeyResults.flatMap((scenario) => scenario.turns);
    const averageScore = journeyTurns.length
      ? Math.round(journeyTurns.reduce((total, turn) => total + turn.score, 0) / journeyTurns.length)
      : 0;
    return {
      name: journey.name,
      intent: journey.intent,
      surfaces: journey.surfaces ?? [],
      modes: journey.modes ?? [],
      scenarioCount: new Set(journeyResults.map((scenario) => scenario.expandedFrom ?? scenario.id)).size,
      turnCount: journeyTurns.length,
      averageScore,
      failingTurns: journeyTurns.filter((turn) => turn.score < catalog.minimumTurnScore).length
    };
  });

  for (const turn of turns) {
    for (const [category, value] of Object.entries(turn.categoryScores)) {
      categoryScores[category] ??= [];
      categoryScores[category].push(value.score / CATEGORY_WEIGHTS[category] * 100);
    }
    for (const failure of turn.failures) {
      categoryFailureCounts[failure.category] = (categoryFailureCounts[failure.category] ?? 0) + 1;
    }
  }

  const averageScore = Math.round(turns.reduce((total, turn) => total + turn.score, 0) / Math.max(1, turns.length));
  const categoryAverages = Object.fromEntries(
    Object.entries(categoryScores).map(([category, values]) => [
      category,
      Math.round(values.reduce((total, value) => total + value, 0) / Math.max(1, values.length))
    ])
  );
  const failingTurns = turns.filter((turn) => turn.score < catalog.minimumTurnScore);
  const warningTurns = turns.filter((turn) => turn.score >= catalog.minimumTurnScore && turn.score < 92);
  const recommendations = Object.entries(categoryFailureCounts)
    .sort((left, right) => right[1] - left[1])
    .map(([category, count]) => ({
      category,
      count,
      recommendation: RECOMMENDATIONS[category] ?? "Inspect this failure class and add a focused regression."
    }));

  return {
    generatedAt: new Date().toISOString(),
    version: catalog.version,
    scenarios: results.length,
    turns: turns.length,
    averageScore,
    minimumOverallScore: catalog.minimumOverallScore,
    minimumTurnScore: catalog.minimumTurnScore,
    failingTurns: failingTurns.length,
    warningTurns: warningTurns.length,
    categoryAverages,
    journeys: journeySummaries,
    recommendations,
    status: averageScore >= catalog.minimumOverallScore && failingTurns.length === 0 ? "pass" : "fail"
  };
}

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
catalogCache = catalog;
const expandedScenarios = (catalog.scenarios ?? []).flatMap(expandScenario);
const results = [];

for (const scenario of expandedScenarios) {
  results.push(await runScenario(scenario));
}

const summary = summarize(results, catalog);
const report = {
  summary,
  scenarios: results,
  failedTurns: results.flatMap((scenario) =>
    scenario.turns
      .filter((turn) => turn.score < catalog.minimumTurnScore)
      .map((turn) => ({
        scenarioId: scenario.id,
        prompt: turn.prompt,
        score: turn.score,
        failures: turn.failures,
        trace: turn.trace
      }))
  ),
  warningTurns: results.flatMap((scenario) =>
    scenario.turns
      .filter((turn) => turn.score >= catalog.minimumTurnScore && turn.score < 92)
      .map((turn) => ({
        scenarioId: scenario.id,
        prompt: turn.prompt,
        score: turn.score,
        failures: turn.failures,
        trace: turn.trace
      }))
  )
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2));

const failedSummary = report.failedTurns
  .slice(0, 12)
  .map((turn) => `- ${turn.scenarioId}: ${turn.score}/100 "${turn.prompt}" :: ${turn.failures.map((failure) => `${failure.category}: ${failure.message}`).join("; ")}`)
  .join("\n");

if (summary.status !== "pass") {
  console.error(
    [
      `FAILED: user journey QA scored ${summary.averageScore}/100 across ${summary.turns} turns`,
      `Report: ${outputPath}`,
      failedSummary
    ]
      .filter(Boolean)
      .join("\n")
  );
  process.exit(1);
}

console.log(
  [
    `user journey QA passed (${summary.scenarios} scenarios, ${summary.turns} turns, average ${summary.averageScore}/100)`,
    `category averages: ${Object.entries(summary.categoryAverages).map(([category, score]) => `${category} ${score}`).join(", ")}`,
    `journeys: ${summary.journeys.map((journey) => `${journey.name} ${journey.averageScore || "n/a"}`).join(", ")}`,
    `report -> ${outputPath}`
  ].join("\n")
);
