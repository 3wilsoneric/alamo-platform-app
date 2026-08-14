import { createHash, randomUUID } from "node:crypto";
import { platformModuleRegistry } from "../../shared/platform-module-registry.mjs";
import { scoreAnalystResultQuality } from "./answer-quality.mjs";
import { getBoundedIntegerEnv } from "../runtime-environment.mjs";

const MAX_ANALYST_TRACE_RECORDS = getBoundedIntegerEnv("ANALYST_TRACE_MAX_RECORDS", 1000, 10, 10_000);
const SLOW_ANALYST_TURN_MS = getBoundedIntegerEnv("ANALYST_TRACE_SLOW_MS", 2500, 100, 60_000);
const traceJournal = new Map();
const RESIDENT_SCOPED_TOOLS = new Set(["resident_lookup", "resident_incident_history"]);

/**
 * @typedef {object} AnalystTurnTraceInput
 * @property {unknown} [content]
 * @property {string | null} [tool]
 * @property {any} [executionPlan]
 * @property {any} [result]
 * @property {{ valid?: boolean, errors?: unknown[] } | null} [planValidation]
 * @property {{ eligible?: boolean, reason?: string } | null} [cacheEligibility]
 * @property {boolean} [cached]
 * @property {string} [stage]
 * @property {number | null} [executionMs]
 * @property {string} [turnId]
 */

function hashPrompt(prompt) {
  return createHash("sha256")
    .update(String(prompt ?? ""))
    .digest("hex")
    .slice(0, 16);
}

function normalizeErrors(errors) {
  return Array.isArray(errors) ? errors.map((error) => String(error)).slice(0, 8) : [];
}

function normalizeString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeStringArray(values, limit = 8) {
  return Array.isArray(values)
    ? values.map((value) => normalizeString(value)).filter(Boolean).slice(0, limit)
    : [];
}

function normalizeBoolean(value) {
  return value === undefined ? null : Boolean(value);
}

function normalizePlanSummary(executionPlan) {
  if (!executionPlan || typeof executionPlan !== "object") return null;
  const expected = executionPlan.expected && typeof executionPlan.expected === "object" ? executionPlan.expected : {};
  const capability = executionPlan.capability && typeof executionPlan.capability === "object" ? executionPlan.capability : null;
  const decision = executionPlan.decision && typeof executionPlan.decision === "object" ? executionPlan.decision : null;
  const periods = normalizeStringArray(expected.periods, 12);
  const fields = normalizeStringArray(expected.fields, 12);
  const canonicalPrompt = normalizeString(executionPlan.canonicalPrompt);
  const canonicalPromptHash = normalizeString(executionPlan.canonicalPromptHash);
  const canonicalPromptLength = Number.isFinite(Number(executionPlan.canonicalPromptLength))
    ? Math.max(0, Number(executionPlan.canonicalPromptLength))
    : null;
  const facilityId = normalizeString(expected.facilityId);
  const communityName = normalizeString(expected.communityName);
  const tool = normalizeString(executionPlan.tool);

  return {
    tool,
    canonicalPromptHash: canonicalPrompt ? hashPrompt(canonicalPrompt) : canonicalPromptHash,
    canonicalPromptLength: canonicalPrompt ? canonicalPrompt.length : canonicalPromptLength,
    capability: capability
      ? {
          temporalScope: normalizeString(capability.temporalScope),
          supportsExplicitPeriods: normalizeBoolean(capability.supportsExplicitPeriods),
          historicalAlternative: normalizeString(capability.historicalAlternative)
        }
      : null,
    decision: decision
      ? {
          family: normalizeString(decision.family),
          answerShape: normalizeString(decision.answerShape),
          confidence: normalizeString(decision.confidence),
          moduleFamilies: normalizeStringArray(decision.moduleFamilies, 8),
          riskFlags: normalizeStringArray(decision.riskFlags, 12),
          exactRows: Boolean(decision.exactRows),
          expectsArtifact: Boolean(decision.expectsArtifact),
          expectsModule: Boolean(decision.expectsModule),
          shouldComposeSupportingModules: Boolean(decision.shouldComposeSupportingModules)
        }
      : null,
    expected: {
      metric: normalizeString(expected.metric),
      metricGrain: normalizeString(expected.metricGrain),
      category: normalizeString(expected.category),
      mode: normalizeString(expected.mode),
      periods,
      periodCount: periods.length,
      grouping: normalizeString(expected.grouping),
      fields,
      fieldCount: fields.length,
      export: Boolean(expected.export),
      facilityId,
      communityName,
      hasCommunityScope: Boolean(facilityId || communityName),
      hasResidentScope: Boolean(normalizeString(expected.residentName)) || Boolean(tool && RESIDENT_SCOPED_TOOLS.has(tool)),
      presentation: normalizeString(expected.presentation)
    }
  };
}

function normalizeTraceRecord(turnTrace) {
  if (!turnTrace?.turnId) return null;
  const executionMs = Number.isFinite(Number(turnTrace.executionMs)) ? Math.max(0, Math.round(Number(turnTrace.executionMs))) : null;
  return {
    version: turnTrace.version,
    turnId: turnTrace.turnId,
    stage: turnTrace.stage ?? null,
    promptHash: turnTrace.promptHash ?? null,
    promptLength: Number.isFinite(Number(turnTrace.promptLength)) ? Number(turnTrace.promptLength) : null,
    requestedTool: turnTrace.requestedTool ?? null,
    selectedTool: turnTrace.selectedTool ?? null,
    expectedTool: turnTrace.expectedTool ?? null,
    answerFamily: turnTrace.answerFamily ?? null,
    truthState: turnTrace.truthState ?? null,
    rowCount: Number.isFinite(Number(turnTrace.rowCount)) ? Number(turnTrace.rowCount) : turnTrace.rowCount ?? null,
    plan: normalizePlanSummary(turnTrace.plan),
    performance: {
      executionMs,
      slow: executionMs != null && executionMs >= SLOW_ANALYST_TURN_MS
    },
    volume: turnTrace.volume
      ? {
          visualRows: Number.isFinite(Number(turnTrace.volume.visualRows)) ? Number(turnTrace.volume.visualRows) : null,
          originalRows: Number.isFinite(Number(turnTrace.volume.originalRows)) ? Number(turnTrace.volume.originalRows) : null,
          artifactRows: Number.isFinite(Number(turnTrace.volume.artifactRows)) ? Number(turnTrace.volume.artifactRows) : null,
          previewed: Boolean(turnTrace.volume.previewed)
        }
      : null,
    cache: turnTrace.cache
      ? {
          used: Boolean(turnTrace.cache.used),
          eligible: turnTrace.cache.eligible ?? null,
          reason: turnTrace.cache.reason ?? null
      }
      : null,
    outcome: turnTrace.outcome
      ? {
          safeRefusal: Boolean(turnTrace.outcome.safeRefusal),
          contractViolation: Boolean(turnTrace.outcome.contractViolation),
          recovery: Boolean(turnTrace.outcome.recovery),
          degraded: Boolean(turnTrace.outcome.degraded)
        }
      : null,
    validation: turnTrace.validation
      ? {
          valid: turnTrace.validation.valid ?? null,
          errors: normalizeErrors(turnTrace.validation.errors)
        }
      : null,
    schema: turnTrace.schema
      ? {
          valid: turnTrace.schema.valid ?? null,
          errorCount: Number.isFinite(Number(turnTrace.schema.errorCount)) ? Number(turnTrace.schema.errorCount) : 0,
          warningCount: Number.isFinite(Number(turnTrace.schema.warningCount)) ? Number(turnTrace.schema.warningCount) : 0
        }
      : null,
    quality: turnTrace.quality
      ? {
          version: normalizeString(turnTrace.quality.version),
          score: Number.isFinite(Number(turnTrace.quality.score)) ? Number(turnTrace.quality.score) : 0,
          grade: normalizeString(turnTrace.quality.grade),
          flags: normalizeStringArray(turnTrace.quality.flags, 12),
          dimensions: turnTrace.quality.dimensions && typeof turnTrace.quality.dimensions === "object"
            ? Object.fromEntries(
                Object.entries(turnTrace.quality.dimensions)
                  .map(([key, value]) => [key, normalizeString(value)])
                  .filter(([, value]) => value)
              )
            : {}
        }
      : null,
    module: turnTrace.module
      ? {
          id: turnTrace.module.id ?? null,
          templateId: turnTrace.module.templateId ?? null,
          family: turnTrace.module.family ?? null,
          scope: turnTrace.module.scope ?? null,
          count: Number.isFinite(Number(turnTrace.module.count)) ? Number(turnTrace.module.count) : null,
          ids: Array.isArray(turnTrace.module.ids) ? turnTrace.module.ids.map(String).slice(0, 5) : [],
          reasonCodes: Array.isArray(turnTrace.module.reasonCodes) ? turnTrace.module.reasonCodes.map(String).slice(0, 5) : []
        }
      : null
  };
}

function isTraceIssue(record) {
  return (
    record?.validation?.valid === false ||
    record?.schema?.valid === false ||
    ["review", "poor"].includes(String(record?.quality?.grade ?? "")) ||
    ["plan_rejected", "not_loaded", "stale"].includes(String(record?.truthState ?? ""))
  );
}

function summarizeTraceTools(records) {
  const byTool = new Map();
  for (const record of records) {
    const tool = record.selectedTool ?? record.requestedTool ?? "unknown";
    const existing = byTool.get(tool) ?? {
      tool,
      count: 0,
      validationIssues: 0,
      schemaIssues: 0,
      certifiedTurns: 0,
      uncertifiedTurns: 0,
      cacheHits: 0,
      slowTurns: 0,
      previewedTurns: 0,
      lastSeenAt: null
    };
    existing.count += 1;
    if (record.validation?.valid === false) existing.validationIssues += 1;
    if (record.schema?.valid === false) existing.schemaIssues += 1;
    if (record.answerFamily) existing.certifiedTurns += 1;
    if (!record.answerFamily) existing.uncertifiedTurns += 1;
    if (record.cache?.used) existing.cacheHits += 1;
    if (record.performance?.slow) existing.slowTurns += 1;
    if (record.volume?.previewed) existing.previewedTurns += 1;
    existing.lastSeenAt = record.updatedAt ?? record.observedAt ?? existing.lastSeenAt;
    byTool.set(tool, existing);
  }
  return [...byTool.values()]
    .sort((left, right) => right.count - left.count || String(left.tool).localeCompare(String(right.tool)))
    .slice(0, 12);
}

function summarizeTraceFamilies(records) {
  const byFamily = new Map();
  for (const record of records) {
    const family = record.answerFamily ?? record.selectedTool ?? record.requestedTool ?? record.stage ?? "unknown";
    const existing = byFamily.get(family) ?? {
      family,
      count: 0,
      recoveryTurns: 0,
      staleTurns: 0,
      notLoadedTurns: 0,
      planRejectedTurns: 0,
      validationIssues: 0,
      schemaIssues: 0,
      slowTurns: 0,
      previewedTurns: 0
    };
    existing.count += 1;
    if (record.outcome?.recovery) existing.recoveryTurns += 1;
    if (record.truthState === "stale") existing.staleTurns += 1;
    if (record.truthState === "not_loaded") existing.notLoadedTurns += 1;
    if (record.truthState === "plan_rejected") existing.planRejectedTurns += 1;
    if (record.validation?.valid === false) existing.validationIssues += 1;
    if (record.schema?.valid === false) existing.schemaIssues += 1;
    if (record.performance?.slow) existing.slowTurns += 1;
    if (record.volume?.previewed) existing.previewedTurns += 1;
    byFamily.set(family, existing);
  }
  return [...byFamily.values()]
    .sort((left, right) => (
      right.recoveryTurns - left.recoveryTurns ||
      right.staleTurns - left.staleTurns ||
      right.count - left.count ||
      String(left.family).localeCompare(String(right.family))
    ))
    .slice(0, 12);
}

function summarizeTraceDecisionFamilies(records) {
  const byFamily = new Map();
  for (const record of records) {
    const family = record.plan?.decision?.family ?? "unknown";
    const existing = byFamily.get(family) ?? {
      family,
      count: 0,
      avgQualityScore: 0,
      reviewTurns: 0,
      moduleTurns: 0,
      recoveryTurns: 0,
      artifactTurns: 0
    };
    existing.count += 1;
    existing.avgQualityScore += Number(record.quality?.score ?? 0);
    if (["review", "poor"].includes(String(record.quality?.grade ?? ""))) existing.reviewTurns += 1;
    if (record.module?.count) existing.moduleTurns += 1;
    if (record.outcome?.recovery) existing.recoveryTurns += 1;
    if (record.volume?.artifactRows) existing.artifactTurns += 1;
    byFamily.set(family, existing);
  }

  return [...byFamily.values()]
    .map((row) => ({
      ...row,
      avgQualityScore: row.count ? Math.round(row.avgQualityScore / row.count) : 0
    }))
    .sort((left, right) => right.reviewTurns - left.reviewTurns || right.count - left.count || String(left.family).localeCompare(String(right.family)))
    .slice(0, 12);
}

function summarizeQualityFlags(records) {
  const counts = new Map();
  for (const record of records) {
    for (const flag of record.quality?.flags ?? []) {
      counts.set(flag, (counts.get(flag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([flag, count]) => ({ flag, count }))
    .sort((left, right) => right.count - left.count || left.flag.localeCompare(right.flag))
    .slice(0, 12);
}

function summarizeModuleCoverage(records) {
  const observedModuleIds = new Set(records.flatMap((record) => record.module?.ids ?? []).filter(Boolean));
  const observedTools = new Set(records.map((record) => record.selectedTool ?? record.requestedTool).filter(Boolean));
  const surfaceModules = platformModuleRegistry.filter((module) => module.kind === "surface");
  const analysisModules = platformModuleRegistry.filter((module) => module.kind === "analysis");
  const analysisWithObservedTool = analysisModules.filter((module) => observedTools.has(module.tool));
  const analysisWithObservedModule = analysisModules.filter((module) => observedModuleIds.has(module.id));
  const familyMap = new Map();

  for (const module of platformModuleRegistry) {
    const existing = familyMap.get(module.family) ?? {
      family: module.family,
      total: 0,
      surfaces: 0,
      analyses: 0,
      observedModules: 0,
      observedTools: 0
    };
    existing.total += 1;
    if (module.kind === "surface") existing.surfaces += 1;
    if (module.kind === "analysis") existing.analyses += 1;
    if (observedModuleIds.has(module.id)) existing.observedModules += 1;
    if (module.kind === "analysis" && observedTools.has(module.tool)) existing.observedTools += 1;
    familyMap.set(module.family, existing);
  }

  return {
    version: "platform-module-coverage-v1",
    totalModules: platformModuleRegistry.length,
    surfaceModules: surfaceModules.length,
    analysisModules: analysisModules.length,
    observedModuleIds: observedModuleIds.size,
    observedAnalysisTools: observedTools.size,
    analysisModulesWithObservedTool: analysisWithObservedTool.length,
    analysisModulesWithObservedModule: analysisWithObservedModule.length,
    uncoveredAnalysisModules: analysisModules
      .filter((module) => !observedTools.has(module.tool) && !observedModuleIds.has(module.id))
      .slice(0, 12)
      .map((module) => ({
        id: module.id,
        title: module.title,
        tool: module.tool,
        family: module.family,
        visualType: module.visualType ?? null
      })),
    families: [...familyMap.values()]
      .sort((left, right) => right.total - left.total || left.family.localeCompare(right.family))
  };
}

function recordAnalystTurnTrace(turnTrace) {
  const normalized = normalizeTraceRecord(turnTrace);
  if (!normalized) return null;

  const now = new Date().toISOString();
  const previous = traceJournal.get(normalized.turnId);
  const record = {
    ...normalized,
    observedAt: previous?.observedAt ?? now,
    updatedAt: now
  };

  traceJournal.delete(record.turnId);
  traceJournal.set(record.turnId, record);

  while (traceJournal.size > MAX_ANALYST_TRACE_RECORDS) {
    traceJournal.delete(traceJournal.keys().next().value);
  }

  return record;
}

export function getAnalystTraceTelemetry({ limit = 25 } = {}) {
  const records = [...traceJournal.values()];
  const boundedLimit = Number.isSafeInteger(limit) ? Math.min(100, Math.max(1, limit)) : 25;
  const recent = records.slice(-boundedLimit).reverse();
  const issues = records.filter(isTraceIssue);
  const schemaIssues = records.filter((record) => record.schema?.valid === false);
  const validationIssues = records.filter((record) => record.validation?.valid === false);
  const recoveryTurns = records.filter((record) => record.outcome?.recovery).length;
  const staleTurns = records.filter((record) => record.truthState === "stale").length;
  const notLoadedTurns = records.filter((record) => record.truthState === "not_loaded").length;
  const planRejectedTurns = records.filter((record) => record.truthState === "plan_rejected").length;
  const certifiedTurns = records.filter((record) => record.answerFamily).length;
  const uncertifiedTurns = records.filter((record) => !record.answerFamily).length;
  const cacheHits = records.filter((record) => record.cache?.used).length;
  const moduleTurns = records.filter((record) => record.module?.count).length;
  const slowTurns = records.filter((record) => record.performance?.slow).length;
  const previewedTurns = records.filter((record) => record.volume?.previewed).length;
  const qualityScoredRecords = records.filter((record) => record.quality?.score != null);
  const averageQualityScore = qualityScoredRecords.length
    ? Math.round(qualityScoredRecords.reduce((total, record) => total + Number(record.quality.score ?? 0), 0) / qualityScoredRecords.length)
    : 0;
  const lowQualityTurns = records.filter((record) => ["review", "poor"].includes(String(record.quality?.grade ?? ""))).length;
  return {
    version: "analyst-trace-telemetry-v1",
    generatedAt: new Date().toISOString(),
    retention: {
      maxRecords: MAX_ANALYST_TRACE_RECORDS,
      currentRecords: records.length
    },
    summary: {
      totalTurns: records.length,
      issueTurns: issues.length,
      schemaIssues: schemaIssues.length,
      validationIssues: validationIssues.length,
      recoveryTurns,
      staleTurns,
      notLoadedTurns,
      planRejectedTurns,
      certifiedTurns,
      uncertifiedTurns,
      cacheHits,
      moduleTurns,
      slowTurns,
      previewedTurns,
      qualityScoredTurns: qualityScoredRecords.length,
      averageQualityScore,
      lowQualityTurns,
      toolsObserved: new Set(records.map((record) => record.selectedTool ?? record.requestedTool).filter(Boolean)).size
    },
    tools: summarizeTraceTools(records),
    families: summarizeTraceFamilies(records),
    decisionFamilies: summarizeTraceDecisionFamilies(records),
    qualityFlags: summarizeQualityFlags(records),
    moduleCoverage: summarizeModuleCoverage(records),
    recentIssues: issues.slice(-boundedLimit).reverse(),
    recent
  };
}

export function resetAnalystTraceTelemetry() {
  traceJournal.clear();
  return { ok: true, cleared: true };
}

/** @param {AnalystTurnTraceInput} [input] */
function createAnalystTurnTrace(input = {}) {
  const {
    content,
    tool,
    executionPlan,
    result,
    planValidation,
    cacheEligibility,
    cached = false,
    stage = "tool-result",
    executionMs = null,
    turnId
  } = input;
  const moduleSpecs = Array.isArray(result?.moduleSpecs) && result.moduleSpecs.length
    ? result.moduleSpecs
    : result?.moduleSpec
      ? [result.moduleSpec]
      : [];
  const primaryModule = moduleSpecs[0] ?? null;
  const truthState = result?.truthState ?? result?.trace?.truthState ?? null;
  const safeRefusal = Boolean(result?.safeRefusal);
  const contractViolation = Boolean(result?.contractViolation);
  const recovery = safeRefusal || ["not_loaded", "plan_rejected", "summary_not_shown"].includes(String(truthState ?? ""));
  const degraded = ["stale", "summary_not_shown"].includes(String(truthState ?? ""));
  const visualRows = result?.visual?.rows?.length ?? null;
  const originalRows = Number.isFinite(Number(result?.visual?.originalRowCount)) ? Number(result.visual.originalRowCount) : visualRows;
  const artifactRows = Number.isFinite(Number(result?.artifact?.rowCount)) ? Number(result.artifact.rowCount) : null;
  const previewed = Boolean(
    artifactRows != null && visualRows != null && artifactRows > visualRows ||
    originalRows != null && visualRows != null && originalRows > visualRows
  );
  const quality = scoreAnalystResultQuality(result, executionPlan);
  return {
    version: "analyst-turn-trace-v1",
    turnId: turnId ?? randomUUID(),
    stage,
    promptHash: hashPrompt(content),
    promptLength: String(content ?? "").length,
    requestedTool: tool ?? null,
    selectedTool: result?.tool ?? tool ?? executionPlan?.tool ?? null,
    expectedTool: executionPlan?.tool ?? null,
    answerFamily: result?.certifiedQuestion?.id ?? null,
    truthState,
    rowCount: result?.trace?.rowCount ?? result?.visual?.rows?.length ?? null,
    plan: normalizePlanSummary(executionPlan),
    executionMs: Number.isFinite(Number(executionMs)) ? Math.max(0, Math.round(Number(executionMs))) : null,
    volume: {
      visualRows,
      originalRows,
      artifactRows,
      previewed
    },
    cache: {
      used: Boolean(cached),
      eligible: cacheEligibility?.eligible ?? null,
      reason: cacheEligibility?.reason ?? null
    },
    outcome: {
      safeRefusal,
      contractViolation,
      recovery,
      degraded
    },
    validation: {
      valid: planValidation?.valid ?? null,
      errors: normalizeErrors(planValidation?.errors)
    },
    schema: result?.runtimeSchema
      ? {
          valid: result.runtimeSchema.valid,
          errorCount: result.runtimeSchema.errorCount,
          warningCount: result.runtimeSchema.warningCount
        }
      : null,
    quality,
    module: primaryModule
      ? {
          id: primaryModule.id,
          templateId: primaryModule.templateId,
          family: primaryModule.family,
          scope: primaryModule.scope,
          count: moduleSpecs.length,
          ids: moduleSpecs.map((spec) => spec.id).slice(0, 5),
          reasonCodes: moduleSpecs.map((spec) => spec.selectionReason?.code).filter(Boolean).slice(0, 5)
        }
      : null
  };
}

/**
 * @param {any} result
 * @param {AnalystTurnTraceInput} [traceInput]
 */
export function attachAnalystTurnTrace(result, traceInput = {}) {
  const turnTrace = createAnalystTurnTrace({
    ...traceInput,
    result,
    turnId: traceInput.turnId ?? result?.turnTrace?.turnId
  });
  recordAnalystTurnTrace(turnTrace);
  return {
    ...result,
    turnTrace,
    trace: {
      ...(result?.trace ?? {}),
      turnId: turnTrace.turnId,
      promptHash: turnTrace.promptHash
    }
  };
}
