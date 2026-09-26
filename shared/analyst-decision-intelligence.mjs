export const ANALYST_DECISION_INTELLIGENCE_VERSION = "decision-intelligence-v1";

export const ANALYST_REQUEST_FAMILIES = Object.freeze({
  availability: "availability",
  comparison: "comparison",
  count: "count",
  detailList: "detail_list",
  export: "export",
  profile: "profile",
  slice: "slice",
  surface: "surface",
  trend: "trend",
  broadAnalysis: "broad_analysis",
  unknown: "unknown"
});

const SURFACE_TOOLS = new Set(["module_catalog", "surface_module"]);
const AVAILABILITY_TOOLS = new Set(["data_availability", "tool_context_catalog"]);
const DETAIL_TOOLS = new Set(["detail_list", "incident_detail_list", "medication_exception_detail", "resident_search"]);
const PROFILE_TOOLS = new Set(["resident_lookup", "community_profile", "community_history", "medication_profile"]);
const TREND_TOOLS = new Set(["census_trend", "census_movement", "census_drop_history", "community_time_series", "resident_incident_history"]);
const COMPARISON_TOOLS = new Set(["compare_periods", "community_compare", "incident_category_comparison", "incident_rate_change"]);
const COUNT_TOOLS = new Set(["incident_breakdown", "slice_metric"]);
/** @type {ReadonlySet<string>} */
const MODULE_OPTIONAL_FAMILIES = new Set([
  ANALYST_REQUEST_FAMILIES.export,
  ANALYST_REQUEST_FAMILIES.availability
]);
/** @type {ReadonlySet<string>} */
const COMPOSITE_FAMILIES = new Set([
  ANALYST_REQUEST_FAMILIES.comparison,
  ANALYST_REQUEST_FAMILIES.trend,
  ANALYST_REQUEST_FAMILIES.broadAnalysis
]);
/** @type {ReadonlySet<string>} */
const CONTEXT_RESET_FAMILIES = new Set([
  ANALYST_REQUEST_FAMILIES.surface,
  ANALYST_REQUEST_FAMILIES.availability
]);

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function inferFamilyFromTool(tool) {
  if (SURFACE_TOOLS.has(tool)) return ANALYST_REQUEST_FAMILIES.surface;
  if (AVAILABILITY_TOOLS.has(tool)) return ANALYST_REQUEST_FAMILIES.availability;
  if (DETAIL_TOOLS.has(tool)) return ANALYST_REQUEST_FAMILIES.detailList;
  if (PROFILE_TOOLS.has(tool)) return ANALYST_REQUEST_FAMILIES.profile;
  if (TREND_TOOLS.has(tool)) return ANALYST_REQUEST_FAMILIES.trend;
  if (COMPARISON_TOOLS.has(tool)) return ANALYST_REQUEST_FAMILIES.comparison;
  if (COUNT_TOOLS.has(tool)) return ANALYST_REQUEST_FAMILIES.count;
  if (tool === "slice_discovery") return ANALYST_REQUEST_FAMILIES.slice;
  if (tool === "export_csv") return ANALYST_REQUEST_FAMILIES.export;
  return null;
}

function inferFamilyFromFrame(frame, prompt) {
  const text = normalize(prompt);
  if (frame?.export || /\b(export|download|csv|spreadsheet)\b/.test(text)) return ANALYST_REQUEST_FAMILIES.export;
  if (/\b(open|surface|bring up|take me|module|screen|page|view)\b/.test(text)) return ANALYST_REQUEST_FAMILIES.surface;
  if (/\b(available data|data periods?|coverage|freshness|latest loaded|why.*not showing|stale|loaded)\b/.test(text)) return ANALYST_REQUEST_FAMILIES.availability;
  if (frame?.mode === "detail" || /\b(list|every|all rows?|exact rows?|detail|details|description|narrative)\b/.test(text)) return ANALYST_REQUEST_FAMILIES.detailList;
  if (frame?.mode === "profile" || frame?.residentName || /\b(profile|who is|lookup)\b/.test(text)) return ANALYST_REQUEST_FAMILIES.profile;
  if (frame?.mode === "trend" || frame?.presentation === "heatmap" || frame?.presentation === "multi_series") return ANALYST_REQUEST_FAMILIES.trend;
  if (frame?.mode === "comparison" || /\b(compare|comparison|versus|\bvs\b|delta|change|changed)\b/.test(text)) return ANALYST_REQUEST_FAMILIES.comparison;
  if (/\b(slice|dice|pivot|group by|break out|custom view|columns?|fields?)\b/.test(text) || /\bgroup\b.+\bby\b/.test(text)) return ANALYST_REQUEST_FAMILIES.slice;
  if (/\b(how many|count|total|number of)\b/.test(text)) return ANALYST_REQUEST_FAMILIES.count;
  if (/\b(how is|how are|how was|what happened|what changed|what should|read on|operating picture|summary)\b/.test(text)) return ANALYST_REQUEST_FAMILIES.broadAnalysis;
  return ANALYST_REQUEST_FAMILIES.unknown;
}

function inferRiskFlags(frame, family, prompt) {
  const text = normalize(prompt);
  return unique([
    frame?.periods?.length > 1 ? "multi_period" : null,
    frame?.periods?.length && ["profile", "residents", "documentation"].includes(frame?.metric) ? "historical_current_state_collision" : null,
    frame?.metricGrain ? "grain_sensitive" : null,
    frame?.category ? "category_sensitive" : null,
    frame?.residentName ? "resident_scope" : null,
    frame?.facilityId ? "community_scope" : null,
    Number(frame?.revision ?? 0) > 1 ? "context_sensitive" : null,
    family === ANALYST_REQUEST_FAMILIES.detailList ? "exact_rows" : null,
    family === ANALYST_REQUEST_FAMILIES.export ? "exact_export" : null,
    /\b(today|current|latest|right now|fresh|feed)\b/.test(text) ? "freshness_sensitive" : null,
    /\b(last year|november|december|january|february|march|april|may|june|july|august|september|october)\b/.test(text) ? "period_sensitive" : null,
    /\b(same|that|it|those|do it|again|now)\b/.test(text) ? "context_sensitive" : null
  ]);
}

function inferModuleFamilies(frame, family, tool) {
  const families = [];
  if (frame?.metric === "incidents" || /incident/.test(String(tool ?? ""))) families.push("incidents");
  if (frame?.metric === "census" || /census/.test(String(tool ?? ""))) families.push("census");
  if (frame?.metric === "medications" || /medication|mar/.test(String(tool ?? ""))) families.push("medications");
  if (frame?.metric === "documentation" || /documentation/.test(String(tool ?? ""))) families.push("documentation");
  if (frame?.metric === "residents" || frame?.residentName || /resident/.test(String(tool ?? ""))) families.push("residents");
  if (family === ANALYST_REQUEST_FAMILIES.broadAnalysis || /operating|community_profile|community_history/.test(String(tool ?? ""))) families.push("operating");
  return unique(families);
}

function inferAnswerShape(family, frame) {
  if (family === ANALYST_REQUEST_FAMILIES.count) return "direct_count";
  if (family === ANALYST_REQUEST_FAMILIES.detailList) return "exact_rows_preview";
  if (family === ANALYST_REQUEST_FAMILIES.export) return "csv_artifact";
  if (family === ANALYST_REQUEST_FAMILIES.profile) return frame?.residentName ? "resident_profile_card" : "profile_summary";
  if (family === ANALYST_REQUEST_FAMILIES.trend) return "trend_module";
  if (family === ANALYST_REQUEST_FAMILIES.comparison) return "comparison_module";
  if (family === ANALYST_REQUEST_FAMILIES.slice) return "compiled_slice_module";
  if (family === ANALYST_REQUEST_FAMILIES.surface) return "surface_module";
  if (family === ANALYST_REQUEST_FAMILIES.availability) return "data_coverage_diagnostic";
  if (family === ANALYST_REQUEST_FAMILIES.broadAnalysis) return "compact_operating_read";
  return "direct_answer";
}

export function buildAnalystDecisionIntelligence(frame, options = {}) {
  const tool = options.tool ?? options.fallbackTool ?? null;
  const prompt = options.content ?? frame?.sourcePrompt ?? "";
  const family = inferFamilyFromTool(tool) ?? inferFamilyFromFrame(frame, prompt);
  const riskFlags = inferRiskFlags(frame, family, prompt);
  const exactRows = family === ANALYST_REQUEST_FAMILIES.detailList || family === ANALYST_REQUEST_FAMILIES.export;
  const expectsArtifact = family === ANALYST_REQUEST_FAMILIES.export || (exactRows && !["resident_search"].includes(tool));
  const moduleFamilies = inferModuleFamilies(frame, family, tool);
  const decision = {
    version: ANALYST_DECISION_INTELLIGENCE_VERSION,
    family,
    answerShape: inferAnswerShape(family, frame),
    moduleFamilies,
    riskFlags,
    exactRows,
    expectsArtifact,
    expectsModule: !MODULE_OPTIONAL_FAMILIES.has(family),
    shouldComposeSupportingModules: COMPOSITE_FAMILIES.has(family),
    shouldPreserveContext: riskFlags.includes("context_sensitive"),
    shouldResetContext: CONTEXT_RESET_FAMILIES.has(family),
    confidence: family === ANALYST_REQUEST_FAMILIES.unknown ? "low" : riskFlags.length >= 3 ? "guarded" : "high"
  };
  return Object.freeze(decision);
}

export function shouldComposeModulesForDecision(decision, content = "") {
  const text = normalize(content);
  if (!decision || decision.shouldComposeSupportingModules) return Boolean(decision?.shouldComposeSupportingModules);
  if (decision.family === ANALYST_REQUEST_FAMILIES.slice) return true;
  if (decision.exactRows || decision.family === ANALYST_REQUEST_FAMILIES.surface || decision.family === ANALYST_REQUEST_FAMILIES.availability) return false;
  return /\b(compare|comparison|versus|\bvs\b|relationship|alongside|together|and also|both|across)\b/.test(text);
}
