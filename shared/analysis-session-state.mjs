import {
  deriveAnalysisPatch,
  selectToolForFrame
} from "./query-intent-compiler.mjs";
import { getMetricGrainDefinition } from "./metric-definitions.mjs";
import {
  getAnalysisToolCapability,
  validatePlanToolCapability
} from "./analysis-tool-capabilities.mjs";
import { buildAnalystDecisionIntelligence } from "./analyst-decision-intelligence.mjs";
import { formatMonthLabel } from "./period-utils.mjs";

export { deriveAnalysisPatch };

const ANALYSIS_FRAME_VERSION = "1.0";
const MAX_ANALYSIS_FRAME_REVISION = 1_000_000;
const MAX_ANALYSIS_FRAME_PERIODS = 600;
const MAX_ANALYSIS_FRAME_FIELDS = 32;
const MAX_ANALYSIS_FRAME_VALUE_LENGTH = 512;
const MAX_ANALYSIS_FRAME_PROMPT_LENGTH = 12_000;

const ANALYSIS_FRAME_NULLABLE_STRING_FIELDS = [
  "metric",
  "metricGrain",
  "category",
  "mode",
  "grouping",
  "facilityId",
  "communityName",
  "residentName",
  "calculation",
  "presentation"
];

function isBoundedString(value, maximumLength = MAX_ANALYSIS_FRAME_VALUE_LENGTH) {
  return typeof value === "string" && value.length <= maximumLength;
}

function isNullableBoundedString(value, maximumLength = MAX_ANALYSIS_FRAME_VALUE_LENGTH) {
  return value === null || isBoundedString(value, maximumLength);
}

function isBoundedStringArray(value, maximumItems, maximumItemLength = MAX_ANALYSIS_FRAME_VALUE_LENGTH) {
  return (
    Array.isArray(value) &&
    value.length <= maximumItems &&
    value.every((item) => isBoundedString(item, maximumItemLength))
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function createEmptyAnalysisFrame() {
  return {
    version: ANALYSIS_FRAME_VERSION,
    revision: 0,
    metric: null,
    metricGrain: null,
    category: null,
    mode: null,
    periods: [],
    grouping: null,
    fields: [],
    export: false,
    facilityId: null,
    communityName: null,
    residentName: null,
    calculation: null,
    presentation: null,
    sourcePrompt: null
  };
}

export function isAnalysisFrame(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.version === ANALYSIS_FRAME_VERSION &&
      Number.isSafeInteger(value.revision) &&
      value.revision >= 0 &&
      value.revision <= MAX_ANALYSIS_FRAME_REVISION &&
      ANALYSIS_FRAME_NULLABLE_STRING_FIELDS.every((field) => isNullableBoundedString(value[field])) &&
      isBoundedStringArray(value.periods, MAX_ANALYSIS_FRAME_PERIODS, 64) &&
      isBoundedStringArray(value.fields, MAX_ANALYSIS_FRAME_FIELDS, 128) &&
      typeof value.export === "boolean" &&
      isNullableBoundedString(value.sourcePrompt, MAX_ANALYSIS_FRAME_PROMPT_LENGTH)
  );
}

export function sanitizeAnalysisFrame(value) {
  if (!isAnalysisFrame(value)) return null;
  return {
    version: ANALYSIS_FRAME_VERSION,
    revision: value.revision,
    metric: value.metric,
    metricGrain: value.metricGrain,
    category: value.category,
    mode: value.mode,
    periods: [...value.periods],
    grouping: value.grouping,
    fields: [...value.fields],
    export: value.export,
    facilityId: value.facilityId,
    communityName: value.communityName,
    residentName: value.residentName,
    calculation: value.calculation,
    presentation: value.presentation,
    sourcePrompt: value.sourcePrompt
  };
}

export function hasMeaningfulAnalysisFrame(frame) {
  return Boolean(
    isAnalysisFrame(frame) &&
      (
        frame.metric ||
        frame.metricGrain ||
        frame.category ||
        frame.facilityId ||
        frame.communityName ||
        frame.residentName ||
        frame.calculation
      )
  );
}

export function applyAnalysisPatch(previousFrame, derived) {
  const inheritedBase = derived.inherit && isAnalysisFrame(previousFrame) ? previousFrame : createEmptyAnalysisFrame();
  const inheritedIncidentCategory = derived.inherit && inheritedBase.metric === "incidents" && derived.patch.category && derived.patch.metric === "medications";
  const effectivePatchMetric = inheritedIncidentCategory ? "incidents" : derived.patch.metric;
  const domainChanged = Boolean(
    derived.inherit &&
    inheritedBase.metric &&
    effectivePatchMetric &&
    inheritedBase.metric !== effectivePatchMetric
  );
  const base = domainChanged
    ? {
        ...inheritedBase,
        metricGrain: null,
        category: null,
        mode: ["trend", "comparison"].includes(inheritedBase.mode) ? inheritedBase.mode : null,
        fields: [],
        export: false,
        residentName: null,
        calculation: null
      }
    : inheritedBase;
  const nextPeriods = derived.inherit && derived.patch.mode === "comparison" && derived.patch.periods?.length === 1 && base.periods?.length
    ? unique([base.periods.at(-1), derived.patch.periods[0]]).sort()
    : derived.patch.periods ?? base.periods ?? [];
  const frame = {
    ...base,
    ...derived.patch,
    ...(inheritedIncidentCategory ? { metric: "incidents" } : {}),
    periods: nextPeriods,
    fields: derived.patch.fields ?? base.fields ?? [],
    export: derived.patch.export ?? (derived.inherit ? base.export : false),
    revision: Number(base.revision || 0) + 1,
    version: ANALYSIS_FRAME_VERSION
  };
  if (derived.inherit && derived.patch.export === undefined) frame.export = false;
  return frame;
}

export function analysisFrameToPrompt(frame) {
  const scope = frame.residentName ?? frame.communityName ?? "portfolio";
  const periods = frame.periods.length ? frame.periods.join(" and ") : "";
  const category = frame.category ? `${frame.category} ` : "";
  const grouping = frame.grouping ? ` by ${frame.grouping}` : "";
  const fields = frame.fields.length ? ` including ${frame.fields.join(", ")}` : "";
  const periodPhrase = periods ? ` for ${periods}` : "";
  const metric = frame.metricGrain === "distinct_residents"
    ? getMetricGrainDefinition("distinct_residents").promptNoun
    : frame.metricGrain === "incident_events"
      ? getMetricGrainDefinition("incident_events").promptNoun
      : frame.metric ?? "analysis";
  const presentation = frame.presentation === "heatmap"
    ? " as a heatmap"
    : frame.presentation === "multi_series"
      ? " as a multi-series line chart"
      : frame.presentation === "table"
        ? " as exact rows"
        : "";
  if (frame.export) return `export all ${scope} ${category}${metric}${periodPhrase}${grouping}${fields} to csv`;
  if (frame.mode === "detail") return `list every ${scope} ${category}${metric}${periodPhrase}${grouping}${fields}${presentation}`;
  if (frame.mode === "comparison") return `compare ${scope} ${category}${metric}${periodPhrase}${grouping}${presentation}`;
  if (frame.mode === "trend") return `show ${scope} ${category}${metric} trend${periodPhrase}${grouping}${presentation}`;
  if (frame.mode === "profile") return `show ${scope} ${metric} profile${periodPhrase}`;
  return `show ${scope} ${category}${metric}${periodPhrase}${grouping}`;
}

export function createExecutionPlan(frame, fallbackTool = null, options = {}) {
  const tool = options.preferFallback && fallbackTool ? fallbackTool : selectToolForFrame(frame, fallbackTool);
  const decision = buildAnalystDecisionIntelligence(frame, {
    tool,
    fallbackTool,
    content: frame.sourcePrompt
  });
  const plan = {
    version: "1.0",
    tool,
    decision,
    capability: getAnalysisToolCapability(tool),
    canonicalPrompt: analysisFrameToPrompt(frame),
    expected: {
      metric: frame.metric,
      metricGrain: frame.metricGrain,
      category: frame.category,
      mode: frame.mode,
      periods: frame.periods,
      grouping: frame.grouping,
      fields: frame.fields,
      export: frame.export,
      facilityId: frame.facilityId,
      communityName: frame.communityName,
      residentName: frame.residentName,
      presentation: frame.presentation
    }
  };
  return { ...plan, preflight: validatePlanToolCapability(plan) };
}

function categoryMatchesText(category, text) {
  const normalizedCategory = String(category ?? "").toLowerCase();
  const normalizedText = String(text ?? "").toLowerCase();
  const aliases = {
    "awol/elopement": ["awol/elopement", "awol", "elopement"],
    "medication refusal": ["medication refusal", "med refusal", "refusal", "refused meds"],
    "substance use": ["substance use", "substance", "drug", "alcohol"],
    "aggressive behavior": ["aggressive behavior", "aggressive", "aggression"],
    "medical emergency": ["medical emergency"],
    "mental health crisis": ["mental health crisis"],
    fall: ["fall", "falls"]
  }[normalizedCategory] ?? [normalizedCategory];
  return aliases.some((alias) => alias && normalizedText.includes(alias));
}

export function validateResultAgainstPlan(plan, result) {
  const errors = [];
  if (result?.contractViolation && !result?.safeRefusal) errors.push(String(result.contractViolation));
  if (!result?.handled) errors.push("tool did not handle the request");
  const acceptedRecovery = plan.tool === "resident_lookup" && result?.tool === "data_recovery";
  if (plan.tool && result?.tool !== plan.tool && !acceptedRecovery) errors.push(`expected tool ${plan.tool}, received ${result?.tool ?? "none"}`);
  const visualText = [
    result?.visual?.title,
    result?.visual?.subtitle,
    ...(result?.visual?.columns ?? []),
    ...((result?.visual?.rows ?? []).slice(0, 10).flatMap((row) => [row.label, ...(row.cells ?? [])]))
  ].filter(Boolean).join(" ");
  const periodText = [result?.trace?.period, result?.text, visualText].filter(Boolean).join(" ");
  const unavailableRelativeWindowAcknowledged =
    String(result?.truthState ?? result?.trace?.truthState ?? "") === "not_loaded" &&
    /\b(?:last|past)\s+90\s+days\b/i.test(periodText);
  for (const period of plan.expected.periods ?? []) {
    const displayPeriod = formatMonthLabel(period, { fallback: "", month: "long" });
    if (!unavailableRelativeWindowAcknowledged && !periodText.includes(period) && !periodText.includes(displayPeriod)) {
      errors.push(`missing requested period ${period}`);
    }
  }
  const medicationRefusalExceptionAccepted =
    plan.tool === "medication_exception_detail" &&
    result?.tool === "medication_exception_detail" &&
    String(plan.expected.category ?? "").toLowerCase() === "medication refusal";
  const unavailableMedicationWatchCategoryAccepted =
    plan.tool === "medication_watch" &&
    result?.tool === "medication_watch" &&
    String(result?.truthState ?? result?.trace?.truthState ?? "") === "not_loaded";
  if (
    plan.expected.category &&
    !medicationRefusalExceptionAccepted &&
    !unavailableMedicationWatchCategoryAccepted &&
    !categoryMatchesText(plan.expected.category, [result?.trace?.note, result?.text, visualText].filter(Boolean).join(" "))
  ) {
    errors.push(`missing requested category ${plan.expected.category}`);
  }
  if (plan.expected.facilityId && String(result?.trace?.facilityId ?? "") !== String(plan.expected.facilityId)) {
    errors.push(`facility scope did not match ${plan.expected.communityName ?? plan.expected.facilityId}`);
  }
  if (result?.safeRefusal) return { valid: errors.length === 0, errors };
  if (plan.expected.export && !result?.artifact?.content) errors.push("requested export artifact was not produced");
  if (plan.expected.metricGrain === "distinct_residents" && result?.visual?.valueLabel && !/resident/i.test(String(result.visual.valueLabel))) {
    errors.push("distinct resident request returned a non-resident measure");
  }
  if (plan.expected.metricGrain === "incident_events" && result?.visual?.valueLabel && !/incident/i.test(String(result.visual.valueLabel))) {
    errors.push("incident event request returned a non-incident measure");
  }
  const acceptedDetailTool = ["resident_search", "documentation_gaps"].includes(String(result?.tool ?? ""));
  const acceptedDetailSource = /\b(detail|roster|rows?|audit|history|directory)\b/i.test(String(result?.trace?.dataSource ?? ""));
  const unavailableDetailSource = String(result?.truthState ?? result?.trace?.truthState ?? "") === "not_loaded";
  if (plan.expected.mode === "detail" && !result?.artifact?.content && !acceptedDetailTool && !acceptedDetailSource && !unavailableDetailSource) {
    errors.push("detail request returned a non-detail source");
  }
  const visibleSchema = result?.artifact?.content
    ? String(result.artifact.content).split("\n", 1)[0].toLowerCase()
    : [
        result?.visual?.title,
        result?.visual?.subtitle,
        ...(result?.visual?.columns ?? []),
        result?.trace?.note
      ].filter(Boolean).join(" ").toLowerCase();
  const fieldAliases = {
    resident: ["resident", "client"],
    date: ["date"],
    type: ["type"],
    description: ["description", "narrative", "email_body"],
    reason: ["reason", "note", "missed", "held", "not_given_reason", "administration_note"],
    community: ["community", "facility"],
    unit: ["unit", "room"]
  };
  if (plan.expected.mode === "detail" || plan.expected.export) {
    for (const field of plan.expected.fields ?? []) {
      if (!(fieldAliases[field] ?? [field]).some((alias) => visibleSchema.includes(alias))) errors.push(`requested field ${field} is missing`);
    }
  }
  const monthGroupingVisible = plan.expected.grouping === "month" &&
    (result?.visual?.rows ?? []).some((row) => /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+20\d{2}\b/i.test(String(row.label ?? "")));
  if (plan.expected.grouping && result?.visual && !visibleSchema.includes(plan.expected.grouping) && !monthGroupingVisible) {
    errors.push(`requested grouping ${plan.expected.grouping} is missing`);
  }
  const expectedVisualType = plan.expected.presentation === "heatmap"
    ? "heatmap"
    : plan.expected.presentation === "multi_series"
      ? "multi_line_chart"
      : plan.expected.presentation === "table" && plan.expected.mode === "detail"
        ? "table"
        : null;
  if (expectedVisualType && result?.visual?.type !== expectedVisualType) errors.push(`requested presentation ${plan.expected.presentation} returned ${result?.visual?.type ?? "no visual"}`);
  if (plan.expected.category && result?.visual?.columns?.length) {
    const categoryIndex = result.visual.columns.findIndex((column) => String(column).toLowerCase() === "category");
    if (categoryIndex >= 0) {
      const mismatchedRows = (result.visual.rows ?? []).filter((row) => {
        const actual = String(row.cells?.[categoryIndex] ?? "");
        return !categoryMatchesText(plan.expected.category, actual);
      });
      if (mismatchedRows.length) errors.push(`${mismatchedRows.length} detail rows do not match category ${plan.expected.category}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
