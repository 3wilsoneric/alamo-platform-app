import { CERTIFIED_ANALYST_QUESTIONS } from "./certified-analyst-questions.mjs";
import { getAnalysisToolCapability } from "./analysis-tool-capabilities.mjs";

export const ANALYST_EXECUTION_MODES = Object.freeze({
  deterministicOnly: "deterministic_only",
  verifiedSynthesisOptional: "verified_synthesis_optional",
  agenticSynthesis: "agentic_synthesis"
});

const SYNTHESIS_OPTIONAL_IDS = new Set([
  "resident-risk-summary",
  "length-of-stay",
  "community-comparison",
  "medication-watch",
  "medication-profile",
  "operating-snapshot"
]);

const AGENTIC_SYNTHESIS_IDS = new Set([
  "operating-snapshot"
]);

const DETERMINISTIC_ONLY_TOOLS = new Set([
  "data_availability",
  "detail_list",
  "export_csv",
  "incident_breakdown",
  "incident_category_comparison",
  "incident_detail_list",
  "incident_resident_drivers",
  "incident_rate",
  "incident_rate_change",
  "slice_discovery",
  "slice_metric",
  "top_incident_category_by_community",
  "community_time_series",
  "community_profile",
  "community_history",
  "census_trend",
  "census_movement",
  "census_drop_history",
  "diagnosis_mix",
  "length_of_stay_mix",
  "medication_compliance",
  "medication_orders_current",
  "medication_exception_detail",
  "medication_refusals_by_community",
  "medication_watch",
  "module_catalog",
  "resident_incident_history",
  "resident_flow_weekly",
  "resident_lookup",
  "resident_search",
  "surface_module",
  "tool_context_catalog"
]);

const SYNTHESIS_TRIGGER_PATTERN =
  /\b(why|how is|how are|what matters|what changed|what should|what would you|tell me what|summary|summarize|briefing|brief|report|narrative|recommend|next steps|plan|tasks?|workflow|compare across|operationally|operating picture)\b/i;

const ANALYST_ANSWER_FORMAT_CONTRACTS = Object.freeze({
  count: { tools: Object.freeze(["incident_breakdown", "slice_metric", "census_trend"]), maxFacts: 4, requiredSource: true },
  comparison: { tools: Object.freeze(["incident_category_comparison", "compare_periods", "community_compare"]), maxFacts: 5, requiredSource: true },
  profile: { tools: Object.freeze(["resident_lookup", "resident_incident_history", "community_profile", "community_history", "medication_profile", "resident_risk_summary", "length_of_stay_mix"]), maxFacts: 6, requiredSource: true },
  detail_list: { tools: Object.freeze(["incident_detail_list", "detail_list", "resident_search", "documentation_gaps"]), maxFacts: 4, requiredSource: true },
  resident_flow: { tools: Object.freeze(["resident_flow_weekly"]), maxFacts: 4, requiredSource: true },
  export: { tools: Object.freeze(["export_csv"]), maxFacts: 2, requiredSource: true },
  trend: { tools: Object.freeze(["census_trend", "census_movement", "census_drop_history", "community_time_series", "community_history"]), maxFacts: 5, requiredSource: true },
  availability: { tools: Object.freeze(["data_availability", "tool_context_catalog", "module_catalog", "surface_module"]), maxFacts: 5, requiredSource: false },
  medication: { tools: Object.freeze(["medication_compliance", "medication_orders_current", "medication_exception_detail", "medication_refusals_by_community", "medication_profile", "medication_watch"]), maxFacts: 5, requiredSource: true },
  composition: { tools: Object.freeze(["incident_breakdown", "incident_resident_drivers", "slice_discovery", "slice_metric", "diagnosis_mix", "top_incident_category_by_community", "resident_risk_summary"]), maxFacts: 5, requiredSource: true },
  rate: { tools: Object.freeze(["incident_rate", "incident_rate_change"]), maxFacts: 5, requiredSource: true },
  operating: { tools: Object.freeze(["operating_snapshot", "community_history"]), maxFacts: 6, requiredSource: true },
  generic: { tools: Object.freeze([]), maxFacts: 5, requiredSource: true }
});

function inferExecutionMode(question) {
  if (AGENTIC_SYNTHESIS_IDS.has(question.id)) return ANALYST_EXECUTION_MODES.agenticSynthesis;
  if (SYNTHESIS_OPTIONAL_IDS.has(question.id)) return ANALYST_EXECUTION_MODES.verifiedSynthesisOptional;
  if (DETERMINISTIC_ONLY_TOOLS.has(question.preferredTool)) return ANALYST_EXECUTION_MODES.deterministicOnly;
  return ANALYST_EXECUTION_MODES.verifiedSynthesisOptional;
}

function inferAnswerFormatId(question) {
  if (/csv-export/.test(question.answerStyle)) return "export";
  if (/medication-exception/.test(question.answerStyle)) return "medication";
  if (/direct-count/.test(question.answerStyle)) return "count";
  if (/exact-row|rows|search-results/.test(question.answerStyle)) return "detail_list";
  if (/weekly-flow|resident-flow/.test(question.answerStyle)) return "resident_flow";
  if (/medication|compliance|refusal/.test(question.answerStyle)) return "medication";
  if (/rate/.test(question.answerStyle)) return "rate";
  if (/count/.test(question.answerStyle)) return "count";
  if (/comparison|delta|rate-change/.test(question.answerStyle)) return "comparison";
  if (/community-month|operating|brief/.test(question.answerStyle)) return "operating";
  if (/breakdown|ranked|composition|mix|category/.test(question.answerStyle)) return "composition";
  if (/profile|summary|topline|resident-history|resident-tenure/.test(question.answerStyle)) return "profile";
  if (/trend|movement|history/.test(question.answerStyle)) return "trend";
  if (/catalog|availability|freshness/.test(question.answerStyle)) return "availability";
  const direct = Object.entries(ANALYST_ANSWER_FORMAT_CONTRACTS)
    .find(([, contract]) => contract.tools.includes(question.preferredTool));
  if (direct) return direct[0];
  return "generic";
}

function getClaudeRole(executionMode) {
  if (executionMode === ANALYST_EXECUTION_MODES.deterministicOnly) {
    return "Do not invoke Claude for the base answer. Use deterministic rows, formatter, and module only.";
  }
  if (executionMode === ANALYST_EXECUTION_MODES.agenticSynthesis) {
    return "Use Claude only after verified evidence is gathered; produce synthesis, plan, briefing, or workflow recommendations without adding unsupported facts.";
  }
  return "Claude may synthesize verified tool evidence for broad how/why/comparison prompts, but deterministic output remains the source of truth.";
}

export const ANALYST_CAPABILITY_REGISTRY = Object.freeze(
  CERTIFIED_ANALYST_QUESTIONS.map((question) => {
    const executionMode = inferExecutionMode(question);
    return Object.freeze({
      id: question.id,
      title: question.title,
      description: question.description,
      preferredTool: question.preferredTool,
      answerStyle: question.answerStyle,
      cacheFamily: question.cacheFamily,
      examples: Object.freeze([...(question.examples ?? [])]),
      executionMode,
      claudeRole: getClaudeRole(executionMode),
      answerFormat: inferAnswerFormatId(question),
      dataContract: Object.freeze(getAnalysisToolCapability(question.preferredTool))
    });
  })
);

const capabilityById = new Map(ANALYST_CAPABILITY_REGISTRY.map((capability) => [capability.id, capability]));
const capabilityByTool = new Map();
for (const capability of ANALYST_CAPABILITY_REGISTRY) {
  const current = capabilityByTool.get(capability.preferredTool) ?? [];
  current.push(capability);
  capabilityByTool.set(capability.preferredTool, current);
}

export function getAnalystCapability(id) {
  return capabilityById.get(id) ?? null;
}

export function getAnalystCapabilitiesForTool(tool) {
  return [...(capabilityByTool.get(tool) ?? [])];
}

export function isDeterministicOnlyCapability(capabilityOrId) {
  const capability = typeof capabilityOrId === "string" ? getAnalystCapability(capabilityOrId) : capabilityOrId;
  return capability?.executionMode === ANALYST_EXECUTION_MODES.deterministicOnly;
}

export function shouldEscalateCapabilityToClaude(capabilityOrId, options = {}) {
  const capability = typeof capabilityOrId === "string" ? getAnalystCapability(capabilityOrId) : capabilityOrId;
  if (!capability) return false;
  if (capability.executionMode === ANALYST_EXECUTION_MODES.deterministicOnly) return false;
  if (capability.executionMode === ANALYST_EXECUTION_MODES.agenticSynthesis) return true;
  return SYNTHESIS_TRIGGER_PATTERN.test(String(options.content ?? ""));
}

export function getAnswerFormatContractById(id) {
  const contract = ANALYST_ANSWER_FORMAT_CONTRACTS[id] ?? ANALYST_ANSWER_FORMAT_CONTRACTS.generic;
  return { id: ANALYST_ANSWER_FORMAT_CONTRACTS[id] ? id : "generic", ...contract };
}

export function getAnswerFormatContractForTool(tool) {
  const matches = Object.entries(ANALYST_ANSWER_FORMAT_CONTRACTS)
    .filter(([, contract]) => contract.tools.includes(tool));
  return matches.length === 1 ? getAnswerFormatContractById(matches[0][0]) : null;
}

export function summarizeCapabilityModes() {
  return ANALYST_CAPABILITY_REGISTRY.reduce((summary, capability) => {
    summary[capability.executionMode] = (summary[capability.executionMode] ?? 0) + 1;
    return summary;
  }, {});
}
