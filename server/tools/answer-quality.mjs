/** @type {ReadonlyArray<readonly [string, RegExp]>} */
const AWKWARD_ANSWER_PATTERNS = [
  ["awkward_answer_prefix", /\bAnswer The\b/i],
  ["raw_source_opening", /^\s*Source:/i],
  ["returned_slice_language", /\bclearest row\b|\blargest row in this slice\b/i],
  ["object_leak", /\[object Object\]/i],
  ["undefined_leak", /\bundefined\b/i],
  ["raw_iso_timestamp", /\bT00:00:00\.000Z\b/i],
  ["stale_facility_label", /\bVictoria's Place\b/i],
  ["facility_id_language", /\bfacility\s+(337|342|343|344|345)\b/i]
];

const QUALITY_WEIGHTS = Object.freeze({
  intent: 24,
  data: 20,
  answer: 20,
  surface: 16,
  display: 12,
  recovery: 8
});

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function addFlag(flags, dimensions, dimension, code, severity = "major") {
  flags.push(code);
  dimensions[dimension] = Math.max(dimensions[dimension] ?? 0, severity === "major" ? 2 : 1);
}

function scoreFromDimensions(dimensions) {
  return Object.entries(QUALITY_WEIGHTS).reduce((total, [dimension, weight]) => {
    const penaltyLevel = dimensions[dimension] ?? 0;
    if (penaltyLevel <= 0) return total + weight;
    if (penaltyLevel === 1) return total + Math.round(weight * 0.72);
    return total + Math.round(weight * 0.38);
  }, 0);
}

function gradeFromScore(score) {
  if (score >= 94) return "excellent";
  if (score >= 86) return "good";
  if (score >= 74) return "review";
  return "poor";
}

function getModuleSpecs(result) {
  if (Array.isArray(result?.moduleSpecs) && result.moduleSpecs.length) return result.moduleSpecs;
  return result?.moduleSpec ? [result.moduleSpec] : [];
}

function getTracePeriodText(result) {
  return String(result?.trace?.period ?? "");
}

function getTruthState(result) {
  return String(result?.truthState ?? result?.trace?.truthState ?? "");
}

function getPlanDecision(executionPlan) {
  return executionPlan?.decision && typeof executionPlan.decision === "object" ? executionPlan.decision : null;
}

function getPlanExpected(executionPlan) {
  return executionPlan?.expected && typeof executionPlan.expected === "object" ? executionPlan.expected : {};
}

function hasAnyPeriodCoverage(result, expectedPeriods) {
  if (!expectedPeriods.length) return true;
  const tracePeriod = getTracePeriodText(result);
  const text = String(result?.text ?? "");
  return expectedPeriods.some((period) => tracePeriod.includes(period) || text.includes(period));
}

function hasAllPeriodCoverage(result, expectedPeriods) {
  if (!expectedPeriods.length) return true;
  const tracePeriod = getTracePeriodText(result);
  const text = String(result?.text ?? "");
  return expectedPeriods.every((period) => tracePeriod.includes(period) || text.includes(period));
}

/**
 * @param {any} [result]
 * @param {any | null} [executionPlan]
 */
export function scoreAnalystResultQuality(result = {}, executionPlan = null) {
  const flags = [];
  const dimensions = {
    intent: 0,
    data: 0,
    answer: 0,
    surface: 0,
    display: 0,
    recovery: 0
  };

  const text = String(result?.text ?? "").trim();
  const decision = getPlanDecision(executionPlan);
  const expected = getPlanExpected(executionPlan);
  const moduleSpecs = getModuleSpecs(result);
  const truthState = getTruthState(result);
  const expectedPeriods = asArray(expected.periods).map(String).filter(Boolean);
  const visualRows = Array.isArray(result?.visual?.rows) ? result.visual.rows.length : 0;
  const artifactRows = Number(result?.artifact?.rowCount ?? 0);
  const rowCount = Number(result?.trace?.rowCount ?? visualRows ?? 0);

  if (result?.handled === false) addFlag(flags, dimensions, "intent", "not_handled");
  if (result?.planValidation?.valid === false) addFlag(flags, dimensions, "intent", "plan_validation_failed");
  if (result?.runtimeSchema?.valid === false) addFlag(flags, dimensions, "intent", "runtime_schema_failed");
  if (!executionPlan?.tool) addFlag(flags, dimensions, "intent", "missing_execution_plan_tool", "minor");
  if (!decision) addFlag(flags, dimensions, "intent", "missing_decision_summary", "minor");

  if (!text) addFlag(flags, dimensions, "answer", "empty_answer");
  if (text.length > 2200 && !result?.artifact) addFlag(flags, dimensions, "answer", "long_answer_without_artifact", "minor");
  for (const [code, pattern] of AWKWARD_ANSWER_PATTERNS) {
    if (pattern.test(text)) addFlag(flags, dimensions, "display", code);
  }

  if (!hasAnyPeriodCoverage(result, expectedPeriods)) {
    addFlag(flags, dimensions, "data", "missing_requested_period");
  } else if (!hasAllPeriodCoverage(result, expectedPeriods)) {
    addFlag(flags, dimensions, "data", "partial_requested_period_coverage", "minor");
  }

  if (decision?.expectsModule && !moduleSpecs.length && !result?.visual) {
    addFlag(flags, dimensions, "surface", "expected_module_missing");
  }

  if (decision?.expectsArtifact && !result?.artifact) {
    addFlag(flags, dimensions, "surface", "expected_artifact_missing");
  }

  if (decision?.exactRows && !result?.artifact && !visualRows) {
    addFlag(flags, dimensions, "surface", "exact_rows_missing");
  }

  if (decision?.answerShape === "csv_artifact" && !result?.artifact) {
    addFlag(flags, dimensions, "surface", "csv_artifact_missing");
  }

  if (result?.artifact && artifactRows > 0 && visualRows > artifactRows) {
    addFlag(flags, dimensions, "surface", "preview_exceeds_artifact", "minor");
  }

  if (["not_loaded", "plan_rejected", "stale"].includes(truthState)) {
    const actions = Array.isArray(result?.actions) ? result.actions : [];
    const recoveryText = /not loaded|available|loaded|latest|closest|try|open|stale|behind|missing/i.test(text);
    if (!recoveryText) addFlag(flags, dimensions, "recovery", "unclear_recovery_explanation");
    if (!actions.length && truthState !== "stale") addFlag(flags, dimensions, "recovery", "recovery_without_next_step", "minor");
  }

  if (rowCount === 0 && !["not_loaded", "plan_rejected", "verified_zero"].includes(truthState) && decision?.family !== "surface") {
    addFlag(flags, dimensions, "data", "zero_rows_without_recovery", "minor");
  }

  const score = Math.max(0, Math.min(100, scoreFromDimensions(dimensions)));
  return {
    version: "analyst-answer-quality-v1",
    score,
    grade: gradeFromScore(score),
    flags: [...new Set(flags)].slice(0, 12),
    dimensions: Object.fromEntries(
      Object.entries(dimensions).map(([dimension, level]) => [dimension, level === 0 ? "pass" : level === 1 ? "watch" : "review"])
    )
  };
}
