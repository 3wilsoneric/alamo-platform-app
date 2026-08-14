import {
  getCommunitiesDashboardData,
  getReportsSummaryData
} from "./platform-data.mjs";
import { normalizeQueryText, understandQuery } from "../shared/query-understanding.mjs";
import {
  findClosestMonthWindow,
  formatMonthLabel,
  parseRequestedMonthBuckets
} from "../shared/period-utils.mjs";
import {
  normalizeKnownCommunityNamesDeep as normalizeKnownNamesDeep
} from "../shared/community-names.mjs";
import {
  composeAdHocModules,
  planAdHocModule,
  shouldComposeAdHocModules
} from "../shared/ad-hoc-module-spec.mjs";
import {
  createEmptyAnalysisFrame,
  isAnalysisFrame,
  validateResultAgainstPlan
} from "../shared/analysis-session-state.mjs";
import { getAnalysisToolCapability, isCurrentStateOnlyTool, validatePlanToolCapability } from "../shared/analysis-tool-capabilities.mjs";
import {
  getCertifiedQuestionRouteById,
  matchCertifiedQuestion
} from "../shared/certified-analyst-questions.mjs";
import {
  buildCertifiedAnswerDataSignature,
  getCertifiedAnswerCacheEntry
} from "./certified-answer-cache.mjs";
import {
  formatDisplayDate
} from "../shared/display-date.mjs";
import { createCertifiedCachePolicy } from "./tools/cache-policy.mjs";
import {
  enforceCertifiedRouteResult,
  makeCapabilityCertifiedQuestionMeta,
  validateCertifiedRouteResult,
  withCertifiedGuidance
} from "./tools/certified-result-policy.mjs";
import {
  resetAnalysisSession,
  saveAnalysisSession
} from "./analysis-session-store.mjs";
import { createToolRegistry } from "./tools/registry.mjs";
import { createActionPolicyTools } from "./tools/action-policy.mjs";
import {
  createAvailabilityToolDefinitions,
  createAvailabilityTools
} from "./tools/availability.mjs";
import {
  createDatasetRowNormalizer,
  createGenericDetailListTools,
  isAdmissionIntent
} from "./tools/generic-detail-list.mjs";
import { createUnavailablePeriodRecoveryTools } from "./tools/recovery.mjs";
import {
  createCensusHistoryTools,
  createCensusMovementTools,
  createCensusToolDefinitions,
  createCensusTrendTools,
  createCensusVisualTools
} from "./tools/census.mjs";
import { createCommunityHistoryTools } from "./tools/community-history.mjs";
import {
  createIncidentBreakdownTools,
  createIncidentCategoryTools,
  createIncidentComparisonTools,
  createIncidentDetailTools,
  createIncidentResidentDriverTools,
  createIncidentRateTools,
  createIncidentToolDefinitions,
  createIncidentTopCategoryTools,
  createIncidentVisualTools
} from "./tools/incidents.mjs";
import {
  createResidentToolDefinitions,
  createResidentTools
} from "./tools/residents.mjs";
import { createMedicationQueryTools } from "./tools/medication-query.mjs";
import { createMedicationDomainDefinitions } from "./tools/medication-domain.mjs";
import {
  createMetricSliceToolDefinitions,
  createMetricSliceTools
} from "./tools/metric-slices.mjs";
import {
  createPlatformOverviewToolDefinitions,
  createPlatformOverviewTools
} from "./tools/platform-overview.mjs";
import {
  createCommunityTimeSeriesTools,
  createTrendToolDefinitions
} from "./tools/trends.mjs";
import { createAnswerFormattingTools } from "./tools/answer-formatting.mjs";
import { createAnalysisExecutionPlanner } from "./tools/execution-planning.mjs";
import { createResultFinalizationTools } from "./tools/result-finalization.mjs";
import { createStructuredToolResultRenderer } from "./tools/result-contracts.mjs";
import { attachToolResultSchemaValidation } from "./tools/result-schema.mjs";
import {
  displayValue,
  fingerprintRows,
  makePreviewTableVisual,
  rowsToCsv,
  wantsAllRows
} from "./tools/table-artifacts.mjs";
import { createSliceDiscoveryTools } from "./tools/slice-discovery.mjs";
import { createSurfaceTools } from "./tools/surfaces.mjs";
import { createToolDataAccess } from "./tools/tool-data-access.mjs";
import { createToolDetection } from "./tools/tool-detection.mjs";
import { attachAnalystTurnTrace } from "./tools/turn-trace.mjs";
import {
  TOOL_TRUTH_STATES,
  attachTrace,
  enforceAnswerInvariants,
  formatNumber,
  makeTrace,
  sanitizeDisplayString
} from "./tools/result-safety.mjs";
import { formatIncidentCategoryFilterLabel, formatPlanValidationErrorsForUser } from "./tool-result-formatters.mjs";

const DEFAULT_DETAIL_PREVIEW_ROWS = 5;
export { resetAnalysisSession };

function makeMissingAnalysisContextResult(content) {
  return {
    handled: true,
    tool: "clarification",
    text: [
      "I need the full question first.",
      `“${content}” sounds like a follow-up, but this chat is blank.`,
      "Ask once with the subject and period, like “How many people went AWOL in May 2026.” After that, follow-ups like “do it for April” or “now San Pablo” will work."
    ].join("\n"),
    truthState: "plan_rejected",
    trace: makeTrace({
      tool: "clarification",
      dataSource: "analysis session state",
      rowCount: 0,
      note: "missing prior analysis context",
      truthState: "plan_rejected"
    }),
    actions: []
  };
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const {
  limitRowsForRequest,
  getFacilityMaps,
  findFacility,
  findResident,
  latestMonth,
  firstPresent,
  normalizeMonthBucket,
  filterByFacility,
  average,
  countBy,
  countBySum,
  getScopedCensusSeries,
  sumIncidentCountsByKey,
  calculateWeightedCompliance,
  groupRowsByKey,
  sum,
  getFacilityLabel,
  getLatestAndPrior,
  getCommunityMetrics,
  getIncidentRows,
  getIncidentDetailRows,
  getResidentRows,
  getDocumentationRows,
  getMarMonthlyRows,
  getMarResidentSummaryRows,
  getMarExceptionRows,
  getMarPrnEffectivenessRows,
  getMarMedicationOrderRows,
  getMedicationComplianceRows,
  getMedicationRefusalRows,
  getMarExceptionDetailRows
} = createToolDataAccess({ normalizeText });

const {
  medicationMatches,
  getRequestedMedicationName
} = createMedicationQueryTools({ normalizeText });

const {
  resolveSurfaceModule,
  buildSurfaceModuleTool,
  buildModuleCatalogTool
} = createSurfaceTools({
  normalizeText,
  findFacility,
  makeTrace,
  formatNumber
});

const {
  detectTool,
  isAnalysisIntent,
  isExportIntent,
} = createToolDetection({
  normalizeText,
  findFacility,
  findResident,
  getRequestedMonthBuckets,
  isDataAvailabilityIntent,
  isIncidentFreshnessIntent,
  isVisualIntent,
  resolveSurfaceModule
});

const {
  getIncidentCategoryFilter,
  filterIncidentsByCategory,
  formatIncidentBreakdownSubject
} = createIncidentCategoryTools({ normalizeText });

function understandPlatformQuery(content, communities) {
  const normalizedContent = normalizeQueryText(content);
  const hasResidentIntent = /\b(resident|client|profile|who is|find|lookup|person)\b/.test(normalizedContent);
  const residentTerms = hasResidentIntent
    ? (communities.residents ?? []).flatMap((resident) => [
        [normalizeQueryText(resident.first_name), normalizeQueryText(resident.first_name), "resident"],
        [normalizeQueryText(resident.last_name), normalizeQueryText(resident.last_name), "resident"]
      ]).filter(([token]) => token?.length >= 3)
    : [];
  const categoryTerms = [
    ["awol", "awol", "category"],
    ["elopement", "elopement", "category"],
    ["aggression", "aggression", "category"],
    ["behavior", "behavior", "category"],
    ["substance", "substance", "category"],
    ["hygiene", "hygiene", "category"]
  ];
  const sourceCategoryTerms = [...new Set([
    ...(communities.incidents ?? []).map((row) => row.category),
    ...(communities.incidentDetails ?? []).map((row) => row.category ?? row.incident_type)
  ].filter(Boolean))].flatMap((category) =>
    normalizeQueryText(category)
      .split(" ")
      .filter((token) => token.length >= 4)
      .map((token) => [token, token, "category"])
  );

  return understandQuery(content, {
    communities: communities.facilities ?? [],
    extraTerms: [...categoryTerms, ...sourceCategoryTerms, ...residentTerms]
  });
}

function makeClarificationResult(understanding) {
  const corrections = understanding.uncertainCorrections
    .map((correction) => {
      const choices = correction.alternatives?.length > 1
        ? correction.alternatives.map((choice) => `“${choice}”`).join(" or ")
        : `“${correction.suggestion}”`;
      return `“${correction.original}” as ${choices}`;
    })
    .join(", ");
  const ambiguousCorrection = understanding.uncertainCorrections.find((correction) => correction.alternatives?.length > 1);
  const clarificationActions = ambiguousCorrection
    ? ambiguousCorrection.alternatives.map((alternative) => {
        const prompt = understanding.correctedText.replace(ambiguousCorrection.suggestion, alternative);
        return {
          label: `Use “${prompt}”`,
          kind: "tool",
          tool: "run_analysis",
          prompt
        };
      })
    : [{
        label: `Use “${understanding.correctedText}”`,
        kind: "tool",
        tool: "run_analysis",
        prompt: understanding.correctedText
      }];
  return {
    handled: true,
    tool: "clarification",
    text: `Did you mean ${corrections}? I have not run the analysis yet.`,
    truthState: "plan_rejected",
    interpretation: understanding,
    trace: makeTrace({
      tool: "clarification",
      dataSource: "query interpretation",
      rowCount: 0,
      note: "confirmation required before execution",
      truthState: "plan_rejected"
    }),
    actions: clarificationActions
  };
}

const {
  buildRecoveryResult,
  normalizeToolActions,
  pruneActionNoise
} = createActionPolicyTools({
  findFacility,
  getFacilityLabel,
  isExportIntent,
  makeTrace,
  normalizeText,
  sanitizeDisplayString
});

const {
  buildUnavailablePeriodResult,
  getPortfolioFallbackScopes
} = createUnavailablePeriodRecoveryTools({
  findClosestMonthWindow,
  formatMonthLabel,
  formatNumber,
  makeTrace,
  normalizeMonthBucket
});

const normalizeDatasetRows = createDatasetRowNormalizer({
  firstPresent,
  getFacilityNameById,
  normalizeMonthBucket
});

const {
  buildDetailListTool,
  buildExportTool
} = createGenericDetailListTools({
  buildUnavailablePeriodResult,
  displayValue,
  filterByFacility,
  filterIncidentsByCategory,
  findFacility,
  fingerprintRows,
  firstPresent,
  formatDateLabel,
  formatIncidentCategoryFilterLabel,
  formatMonthLabel,
  getFacilityMaps,
  getFacilityNameById,
  getIncidentCategoryFilter,
  getIncidentDetailRows,
  getIncidentRows,
  getRequestedMonthBuckets,
  getResidentRows,
  makePreviewTableVisual,
  makeTrace,
  normalizeMonthBucket,
  normalizeText,
  rowsToCsv
});

function buildToolExceptionResult(error, { content, communities, tool }) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown tool error");
  console.error("Copilot tool execution failed", { tool, message });
  return buildRecoveryResult({
    content,
    communities,
    tool: tool ?? "data_recovery",
    result: { tool },
    reason: "I could not run that exact analysis safely.",
    detail: "I kept the result contained instead of returning a partial or mismatched answer.",
    trace: {
      dataSource: "tool exception",
      note: "Tool execution failed before a validated result was produced."
    }
  });
}

function isDataAvailabilityIntent(text) {
  return /\b(data availability|data freshness|coverage window|coverage|loaded dates?|latest loaded|latest incident date|how current|how fresh|what (?:data )?periods? (?:are|is) (?:available|loaded)|available (?:data )?periods?|date range|history available)\b/.test(text) ||
    /\b(snapshot|platform|data|incident|incidents|resident|residents|client|clients|roster|census|documentation|medication|meds)\b.*\b(stale|fresh|refresh|refreshed|last refresh|last updated|loaded|available|coverage)\b/.test(text) ||
    /\b(when|what time)\b.*\b(platform|snapshot|data|incident|incidents)\b.*\b(refresh|refreshed|updated|loaded)\b/.test(text) ||
    /\b(do we have|can you answer|is there|are there)\b.*\b(incident|incidents|census|resident|residents|client|clients|roster|documentation|medication|meds)\b.*\b(data|rows?|detail|coverage|loaded|available)\b/.test(text);
}

function isIncidentFreshnessIntent(text) {
  if (/\b(period|periods|coverage|range|date range|available periods|what data periods|what data|data is loaded|data loaded|rows loaded)\b/.test(text)) return false;
  if (/\b(category|categories|breakdown|break down|by community|by month|rate|rates|compare|comparison)\b/.test(text)) return false;
  return /\b(incident|incidents)\b/.test(text) &&
    (
      /\b(today|todays|fresh|freshness|stale|latest|showing up|not showing|why.*showing|received today|right now|behind|delayed|delay|synced|sync|updated|last updated|received|come in|came in|new incidents?|source feed|incident feed|feed|empty|zero)\b/.test(text) ||
      /\b(are|is|how|why|when|did|do)\b.*\b(current|load|loaded|received|updated|behind|delayed|synced|available|empty|zero)\b/.test(text)
    );
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0.0%";
  return `${number.toFixed(1)}%`;
}

function formatDateLabel(value) {
  return formatDisplayDate(value);
}

const {
  buildReadableAnswerText,
  buildStructuredToolResult
} = createStructuredToolResultRenderer({
  formatDateLabel,
  formatNumber,
  normalizeText
});

const { addAnalystTakeaway } = createAnswerFormattingTools({
  buildReadableAnswerText,
  buildStructuredToolResult,
  formatMonthLabel,
  formatNumber,
  normalizeText
});

const {
  finalizeCachedToolResult,
  finalizeToolResult,
  normalizeToolResultContract,
  normalizeTruthState
} = createResultFinalizationTools({
  addAnalystTakeaway,
  attachToolResultSchemaValidation,
  enforceAnswerInvariants,
  makeTrace,
  normalizeKnownNamesDeep,
  normalizeText,
  normalizeToolActions,
  planAdHocModule,
  pruneActionNoise,
  sanitizeDisplayString,
  toolTruthStates: TOOL_TRUTH_STATES
});

const certifiedCachePolicy = createCertifiedCachePolicy({
  normalizeText,
  findFacility,
  normalizeTruthState,
  validateResultAgainstPlan,
  getRequestedMedicationName,
  getMedicationRows: getMedicationRefusalRows
});
const { shouldBypassCertifiedCache } = certifiedCachePolicy;
export const { certifiedCacheEligible } = certifiedCachePolicy;

function formatSigned(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${formatNumber(number)}`;
}

function isVisualIntent(content) {
  return /\b(chart|graph|plot|visual|visualize|little graph|module|show)\b/i.test(content);
}

function buildZeroIncidentCategoryBreakdown({ tool = "incident_breakdown", label, facility, categoryLabel, month, peopleCountIntent = false, dataSource = "incident rows" }) {
  const valueLabel = peopleCountIntent ? "Residents" : "Incidents";
  return {
    handled: true,
    tool,
    truthState: "verified_zero",
    text: [
      peopleCountIntent
        ? `${formatMonthLabel(month)} ${categoryLabel}: ${label} had no unique residents involved.`
        : `${formatMonthLabel(month)} ${categoryLabel} incidents: ${label} had 0 incidents.`,
      "The requested month is loaded for this scope; the requested category had no matching incidents."
    ].join("\n"),
    trace: makeTrace({
      tool,
      dataSource,
      rowCount: 0,
      facility,
      period: month,
      note: `category=${categoryLabel}; ${peopleCountIntent ? "metricGrain=distinct_residents; " : ""}verified zero`,
      truthState: "verified_zero"
    }),
    visual: {
      type: "bar_chart",
      title: `${label} ${formatIncidentBreakdownSubject(categoryLabel)}`,
      subtitle: `${formatMonthLabel(month)} · verified zero`,
      valueLabel,
      rows: [{ label: categoryLabel, value: 0 }]
    },
    actions: [
      { label: `Open ${facility ? `${label} incidents` : "Incident Center"}`, kind: "route", route: facility ? `/communities/${facility.facility_id}?focus=incidents` : "/incidents" }
    ]
  };
}

function getRequestedMonthBuckets(content, availableMonths) {
  return parseRequestedMonthBuckets(content, availableMonths);
}

function getFacilityNameById(communities, facilityId) {
  return getFacilityMaps(communities).byId.get(facilityId)?.community_name ?? facilityId ?? "Unknown community";
}

const copilotToolRegistry = createToolRegistry();

function registerCopilotTool(name, domain, handler) {
  copilotToolRegistry.register(name, handler, {
    domain,
    capability: getAnalysisToolCapability(name)
  });
}

const incidentRateTools = createIncidentRateTools({
  buildUnavailablePeriodResult,
  filterByFacility,
  findFacility,
  formatMonthLabel,
  formatNumber,
  formatSigned,
  getCommunityMetrics,
  getIncidentRows,
  getPortfolioFallbackScopes,
  getRequestedMonthBuckets,
  latestMonth,
  makeTrace,
  sum,
  sumIncidentCountsByKey
});

const incidentBreakdownTools = createIncidentBreakdownTools({
  buildUnavailablePeriodResult,
  buildZeroIncidentCategoryBreakdown,
  countBy,
  countBySum,
  filterByFacility,
  filterIncidentsByCategory,
  findFacility,
  formatIncidentBreakdownSubject,
  formatIncidentCategoryFilterLabel,
  formatMonthLabel,
  formatNumber,
  formatPercent,
  getIncidentCategoryFilter,
  getIncidentDetailRows,
  getIncidentRows,
  getPortfolioFallbackScopes,
  getRequestedMonthBuckets,
  latestMonth,
  makeTrace,
  sum
});

const incidentComparisonTools = createIncidentComparisonTools({
  buildUnavailablePeriodResult,
  filterIncidentsByCategory,
  filterByFacility,
  findFacility,
  formatIncidentCategoryFilterLabel,
  formatMonthLabel,
  formatNumber,
  formatSigned,
  getIncidentRows,
  getIncidentCategoryFilter,
  getPortfolioFallbackScopes,
  getRequestedMonthBuckets,
  makeTrace,
  sum,
  sumIncidentCountsByKey
});

const metricSliceTools = createMetricSliceTools({
  average,
  buildIncidentCategoryComparisonTool: incidentComparisonTools.buildIncidentCategoryComparisonTool,
  buildUnavailablePeriodResult,
  calculateWeightedCompliance,
  countBySum,
  filterByFacility,
  filterIncidentsByCategory,
  findFacility,
  formatIncidentBreakdownSubject,
  formatIncidentCategoryFilterLabel,
  formatMonthLabel,
  formatNumber,
  formatSigned,
  getDocumentationRows,
  getFacilityNameById,
  getIncidentCategoryFilter,
  getIncidentRows,
  getMedicationComplianceRows,
  getMedicationRefusalRows,
  getPortfolioFallbackScopes,
  getRequestedMonthBuckets,
  getResidentRows,
  groupRowsByKey,
  isAdmissionIntent,
  latestMonth,
  limitRowsForRequest,
  makePreviewTableVisual,
  makeTrace,
  normalizeText,
  sum,
  wantsAllRows
});

const metricSliceToolDefinitions = createMetricSliceToolDefinitions({
  compare_periods: ({ content }, { communities, reportsSummary }) => metricSliceTools.buildComparePeriodsTool(content, communities, reportsSummary),
  slice_metric: ({ content }, { communities, reportsSummary }) => metricSliceTools.buildSliceMetricTool(content, communities, reportsSummary)
});

const incidentVisualTools = createIncidentVisualTools({
  buildUnavailablePeriodResult,
  countBySum,
  filterByFacility,
  filterIncidentsByCategory,
  findFacility,
  formatIncidentCategoryFilterLabel,
  formatMonthLabel,
  getFacilityMaps,
  getIncidentCategoryFilter,
  getIncidentRows,
  getPortfolioFallbackScopes,
  getRequestedMonthBuckets,
  makeTrace
});

const incidentDetailTools = createIncidentDetailTools({
  buildUnavailablePeriodResult,
  defaultDetailPreviewRows: DEFAULT_DETAIL_PREVIEW_ROWS,
  filterByFacility,
  filterIncidentsByCategory,
  findFacility,
  fingerprintRows,
  formatDateLabel,
  formatIncidentCategoryFilterLabel,
  formatMonthLabel,
  formatNumber,
  getFacilityNameById,
  getIncidentCategoryFilter,
  getIncidentDetailRows,
  getIncidentRows,
  getPortfolioFallbackScopes,
  getRequestedMonthBuckets,
  latestMonth,
  makePreviewTableVisual,
  makeTrace,
  normalizeDatasetRows,
  rowsToCsv,
  sum
});

const incidentResidentDriverTools = createIncidentResidentDriverTools({
  buildUnavailablePeriodResult,
  filterByFacility,
  filterIncidentsByCategory,
  findFacility,
  formatDateLabel,
  formatIncidentCategoryFilterLabel,
  formatMonthLabel,
  formatNumber,
  getFacilityNameById,
  getIncidentCategoryFilter,
  getIncidentDetailRows,
  getIncidentRows,
  getPortfolioFallbackScopes,
  getRequestedMonthBuckets,
  latestMonth,
  makeTrace
});

const incidentTopCategoryTools = createIncidentTopCategoryTools({
  buildUnavailablePeriodResult,
  formatMonthLabel,
  formatNumber,
  formatPercent,
  getFacilityNameById,
  getIncidentRows,
  getRequestedMonthBuckets,
  makeTrace
});

const incidentToolDefinitions = createIncidentToolDefinitions({
  ad_hoc_incident_chart: ({ content }, { communities, reportsSummary }) => incidentVisualTools.buildAdHocIncidentVisual(content, communities, reportsSummary),
  incident_breakdown: ({ content }, { communities, reportsSummary }) => incidentBreakdownTools.buildIncidentBreakdownTool(content, communities, reportsSummary),
  incident_detail_list: ({ content }, { communities, reportsSummary }) => incidentDetailTools.buildIncidentDetailListTool(content, communities, reportsSummary),
  incident_resident_drivers: ({ content }, { communities, reportsSummary }) => incidentResidentDriverTools.buildIncidentResidentDriversTool(content, communities, reportsSummary),
  incident_category_comparison: ({ content }, { communities, reportsSummary }) => incidentComparisonTools.buildIncidentCategoryComparisonTool(content, communities, reportsSummary),
  top_incident_category_by_community: ({ content }, { communities, reportsSummary }) => incidentTopCategoryTools.buildTopIncidentCategoryByCommunityTool(content, communities, reportsSummary),
  incident_rate: ({ content }, { communities, reportsSummary }) => incidentRateTools.buildIncidentRateTool(content, communities, reportsSummary),
  incident_rate_change: ({ content }, { communities, reportsSummary }) => incidentRateTools.buildIncidentRateChangeTool(content, communities, reportsSummary)
});

const censusVisualTools = createCensusVisualTools({
  buildUnavailablePeriodResult,
  filterByFacility,
  findFacility,
  formatMonthLabel,
  getPortfolioFallbackScopes,
  getRequestedMonthBuckets
});

const censusTrendTools = createCensusTrendTools({
  buildUnavailablePeriodResult,
  findFacility,
  formatMonthLabel,
  formatNumber,
  formatSigned,
  getPortfolioFallbackScopes,
  getRequestedMonthBuckets,
  getScopedCensusSeries,
  makeTrace
});

const censusMovementTools = createCensusMovementTools({
  buildUnavailablePeriodResult,
  findFacility,
  formatMonthLabel,
  formatNumber,
  formatSigned,
  getFacilityMaps,
  getPortfolioFallbackScopes,
  getRequestedMonthBuckets,
  makeTrace,
  sum
});

const censusHistoryTools = createCensusHistoryTools({
  filterByFacility,
  findFacility,
  formatMonthLabel,
  formatNumber,
  formatSigned,
  getFacilityLabel,
  getFacilityMaps,
  makeTrace
});

const censusToolDefinitions = createCensusToolDefinitions({
  ad_hoc_census_chart: ({ content }, { communities }) => censusVisualTools.buildAdHocCensusVisual(content, communities),
  census_trend: ({ content }, { communities }) => censusTrendTools.buildCensusTrendTool(content, communities),
  census_movement: ({ content }, { communities }) => censusMovementTools.buildCensusMovementTool(content, communities),
  census_drop_history: ({ content }, { communities }) => censusHistoryTools.buildCensusDropHistoryTool(content, communities)
});

const residentTools = createResidentTools({
  average,
  countBy,
  countBySum,
  displayValue,
  filterByFacility,
  findFacility,
  findResident,
  formatDateLabel,
  formatMonthLabel,
  formatNumber,
  formatPercent,
  getFacilityLabel,
  getIncidentDetailRows,
  getMarMedicationOrderRows,
  getRequestedMonthBuckets,
  getResidentRows,
  limitRowsForRequest,
  makeTrace,
  normalizeMonthBucket,
  normalizeText
});

const residentToolDefinitions = createResidentToolDefinitions({
  ad_hoc_resident_list: ({ content }, { communities }) => residentTools.buildAdHocResidentVisual(content, communities),
  resident_lookup: ({ content }, { communities, reportsSummary }) => residentTools.buildResidentLookupTool(content, communities, reportsSummary),
  resident_search: ({ content }, { communities, reportsSummary }) => residentTools.buildResidentSearchTool(content, communities, reportsSummary),
  resident_flow_weekly: ({ content }, { communities, reportsSummary }) => residentTools.buildResidentFlowWeeklyTool(content, communities, reportsSummary),
  resident_incident_history: ({ content }, { communities, reportsSummary }) => residentTools.buildResidentIncidentHistoryTool(content, communities, reportsSummary),
  resident_risk_summary: ({ content }, { communities, reportsSummary }) => residentTools.buildResidentRiskSummaryTool(content, communities, reportsSummary),
  resident_demographics: ({ content }, { communities }) => residentTools.buildResidentDemographicsTool(content, communities),
  diagnosis_mix: ({ content }, { communities }) => residentTools.buildDiagnosisMixTool(content, communities),
  length_of_stay_mix: ({ content }, { communities }) => residentTools.buildLengthOfStayMixTool(content, communities),
  documentation_gaps: ({ content }, { communities, reportsSummary }) => residentTools.buildDocumentationGapsTool(content, communities, reportsSummary)
});

const communityTimeSeriesTools = createCommunityTimeSeriesTools({
  buildUnavailablePeriodResult,
  formatMonthLabel,
  getIncidentRows,
  getRequestedMonthBuckets,
  makeTrace,
  normalizeText
});

const trendToolDefinitions = createTrendToolDefinitions({
  community_time_series: ({ content }, { communities, reportsSummary }) => communityTimeSeriesTools.buildCommunityTimeSeriesTool(content, communities, reportsSummary)
});

const availabilityTools = createAvailabilityTools({
  fingerprintRows,
  firstPresent,
  formatDateLabel,
  formatMonthLabel,
  formatNumber,
  getDocumentationRows,
  getIncidentDetailRows,
  getIncidentRows,
  getMarExceptionRows,
  getMarMonthlyRows,
  getMarResidentSummaryRows,
  getMedicationComplianceRows,
  getMedicationRefusalRows,
  getResidentRows,
  isIncidentFreshnessIntent,
  makeTrace,
  normalizeMonthBucket,
  normalizeText,
  rowsToCsv,
  sum
});

const availabilityToolDefinitions = createAvailabilityToolDefinitions({
  data_availability: ({ content }, { communities, reportsSummary }) => availabilityTools.buildDataAvailabilityTool(content, communities, reportsSummary)
});

const medicationToolDefinitions = createMedicationDomainDefinitions({
  buildUnavailablePeriodResult,
  calculateWeightedCompliance,
  countBy,
  countBySum,
  displayValue,
  filterByFacility,
  findFacility,
  findResident,
  fingerprintRows,
  formatDateLabel,
  formatMonthLabel,
  formatNumber,
  formatPercent,
  getDocumentationRows,
  getFacilityLabel,
  getFacilityMaps,
  getFacilityNameById,
  getMarExceptionDetailRows,
  getMarMedicationOrderRows,
  getMarMonthlyRows,
  getMarPrnEffectivenessRows,
  getMarResidentSummaryRows,
  getMedicationComplianceRows,
  getMedicationRefusalRows,
  getPortfolioFallbackScopes,
  getRequestedMedicationName,
  getRequestedMonthBuckets,
  getResidentRows,
  makePreviewTableVisual,
  makeTrace,
  medicationMatches,
  normalizeMonthBucket,
  normalizeText,
  groupRowsByKey,
  latestMonth,
  limitRowsForRequest,
  rowsToCsv,
  sum
});

const platformOverviewTools = createPlatformOverviewTools({
  average,
  countBy,
  filterByFacility,
  findFacility,
  formatMonthLabel,
  formatNumber,
  formatSigned,
  getCommunityMetrics,
  getIncidentRows,
  getLatestAndPrior,
  getResidentRows,
  getScopedCensusSeries,
  latestMonth,
  makeTrace,
  sum,
  sumIncidentCountsByKey
});

const platformOverviewToolDefinitions = createPlatformOverviewToolDefinitions({
  tool_context_catalog: ({ content }, { communities, reportsSummary }) => platformOverviewTools.buildToolContextCatalogTool(content, communities, reportsSummary),
  operating_snapshot: ({ content }, { communities, reportsSummary }) => platformOverviewTools.buildOperatingSnapshotTool(content, communities, reportsSummary),
  community_profile: ({ content }, { communities, reportsSummary }) => platformOverviewTools.buildCommunityProfileTool(content, communities, reportsSummary),
  community_compare: ({ content }, { communities, reportsSummary }) => platformOverviewTools.buildCommunityCompareTool(content, communities, reportsSummary)
});

const communityHistoryTools = createCommunityHistoryTools({
  buildUnavailablePeriodResult,
  calculateWeightedCompliance,
  filterByFacility,
  findClosestMonthWindow,
  findFacility,
  formatMonthLabel,
  formatNumber,
  formatSigned,
  getIncidentRows,
  getMedicationComplianceRows,
  getPortfolioFallbackScopes,
  getRequestedMonthBuckets,
  getScopedCensusSeries,
  groupRowsByKey,
  makeTrace,
  sum,
  sumIncidentCountsByKey
});

const sliceDiscoveryTools = createSliceDiscoveryTools({
  buildUnavailablePeriodResult, filterByFacility, filterIncidentsByCategory, findFacility, fingerprintRows, formatDateLabel, formatMonthLabel, getFacilityNameById,
  getDocumentationRows, getIncidentCategoryFilter, getIncidentDetailRows, getIncidentRows, getMarExceptionDetailRows, getMarMedicationOrderRows, getMarPrnEffectivenessRows, getMarResidentSummaryRows, getMedicationComplianceRows,
  getMedicationRefusalRows, getPortfolioFallbackScopes, getRequestedMonthBuckets, getResidentRows, makePreviewTableVisual, makeTrace, rowsToCsv, wantsAllRows
});

registerCopilotTool("module_catalog", "platform", () => buildModuleCatalogTool());
registerCopilotTool("surface_module", "platform", ({ content }, { communities }) => buildSurfaceModuleTool(content, communities));
registerCopilotTool("community_history", "platform", ({ content }, { communities, reportsSummary }) => communityHistoryTools.buildCommunityHistoryTool(content, communities, reportsSummary));
registerCopilotTool("slice_discovery", "platform", ({ content }, { communities, reportsSummary }) => sliceDiscoveryTools.buildSliceDiscoveryTool(content, communities, reportsSummary));
registerCopilotTool("detail_list", "exports", ({ content }, { communities, reportsSummary }) => buildDetailListTool(content, communities, reportsSummary));
registerCopilotTool("export_csv", "exports", ({ content }, { communities, reportsSummary }) => buildExportTool(content, communities, reportsSummary));
incidentToolDefinitions.forEach(({ name, domain, handler }) => registerCopilotTool(name, domain, handler));
censusToolDefinitions.forEach(({ name, domain, handler }) => registerCopilotTool(name, domain, handler));
residentToolDefinitions.forEach(({ name, domain, handler }) => registerCopilotTool(name, domain, handler));
trendToolDefinitions.forEach(({ name, domain, handler }) => registerCopilotTool(name, domain, handler));
availabilityToolDefinitions.forEach(({ name, domain, handler }) => registerCopilotTool(name, domain, handler));
medicationToolDefinitions.forEach(({ name, domain, handler }) => registerCopilotTool(name, domain, handler));
platformOverviewToolDefinitions.forEach(({ name, domain, handler }) => registerCopilotTool(name, domain, handler));
metricSliceToolDefinitions.forEach(({ name, domain, handler }) => registerCopilotTool(name, domain, handler));

export function getRegisteredCopilotTools() {
  return copilotToolRegistry.list();
}

function runToolByName(tool, content, communities, reportsSummary) {
  return copilotToolRegistry.dispatch(tool, { content }, { communities, reportsSummary });
}

function buildExactDetailUnavailableResult({ content, communities, frame }) {
  const facility = frame?.facilityId
    ? (communities.facilities ?? []).find((item) => String(item.facility_id) === String(frame.facilityId))
    : findFacility(content, communities);
  const label = facility?.community_name ?? "Portfolio";
  const periods = frame?.periods?.length ? frame.periods : [];
  const categoryLabel = frame?.category ?? getIncidentCategoryFilter(content, []) ?? "incident";
  const portfolioDetailRows = getIncidentDetailRows(communities, {});
  const categoryFilter = getIncidentCategoryFilter(content, portfolioDetailRows);
  const detailRows = filterByFacility(portfolioDetailRows, facility);
  const loadedDetailMonths = [...new Set(detailRows.map((row) => row.month_bucket).filter(Boolean))].sort();
  const missingPeriods = periods.filter((period) => !loadedDetailMonths.includes(period));
  const recoveryPeriods = missingPeriods.length ? missingPeriods : periods;
  const recovery = buildUnavailablePeriodResult({
    tool: "incident_detail_list",
    label,
    subject: `${categoryLabel} exact incident rows`,
    dataSource: "detail incident rows unavailable",
    availableMonths: loadedDetailMonths,
    missingMonths: missingPeriods,
    requestedMonths: recoveryPeriods,
    fallbackScopes: getPortfolioFallbackScopes(facility, filterIncidentsByCategory(portfolioDetailRows, categoryFilter)),
    requiredFields: ["resident", "date", "incident type", "description"],
    facility,
    note: frame?.category ? `category=${frame.category}; exact rows unavailable` : "exact rows unavailable"
  });
  return {
    ...recovery,
    actions: [
      recovery.actions[0],
      { label: `Open ${facility ? `${label} incidents` : "Incident Center"}`, kind: "route", route: facility ? `/communities/${facility.facility_id}?focus=incidents` : "/incidents" }
    ].filter(Boolean)
  };
}

function validateScopedToolResult(content, result, communities, reportsSummary) {
  if (!result?.handled) return result;

  const incidentRows = getIncidentRows(communities, reportsSummary);
  const detailRows = getIncidentDetailRows(communities, reportsSummary);
  const medicationRows = getMedicationComplianceRows(reportsSummary);
  const medicationExceptionRows = getMarExceptionDetailRows(reportsSummary);
  const availableMonths = [...new Set([
    ...incidentRows.map((row) => row.month_bucket).filter(Boolean),
    ...detailRows.map((row) => row.month_bucket).filter(Boolean),
    ...(communities.census ?? []).map((row) => row.month_bucket).filter(Boolean),
    ...medicationRows.map((row) => row.month_bucket).filter(Boolean),
    ...medicationExceptionRows.map((row) => row.month_bucket).filter(Boolean),
    ...(reportsSummary.medicationCompliance ?? []).map((row) => row.month_bucket).filter(Boolean)
  ])].sort();
  const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
  if (requestedMonths.length && isCurrentStateOnlyTool(result.tool)) {
    const facility = findFacility(content, communities);
    const label = getFacilityLabel(facility);
    return buildRecoveryResult({
      content,
      communities,
      result,
      reason: `${label} ${result.tool.replace(/_/g, " ")} is current-state data.`,
      detail: `I cannot answer it for ${requestedMonths.map((month) => formatMonthLabel(month)).join(", ")} without a historical snapshot at that grain.`,
      trace: {
        dataSource: "current-state scope validation",
        period: requestedMonths.join(", "),
        note: "historical slice unavailable"
      },
      actions: result.actions
    });
  }

  if (!["incident_breakdown", "incident_detail_list"].includes(result.tool)) return result;
  const categoryFilter = getIncidentCategoryFilter(content, [...incidentRows, ...detailRows]);
  const expectedCategory = formatIncidentCategoryFilterLabel(categoryFilter);
  const periodText = String(result.trace?.period ?? "");
  const noteText = String(result.trace?.note ?? "");
  const monthMismatch = requestedMonths.some((month) => !periodText.includes(month));
  const categoryMismatch = expectedCategory && !noteText.toLowerCase().includes(expectedCategory.toLowerCase());

  if (!monthMismatch && !categoryMismatch) return result;

  return buildRecoveryResult({
    content,
    communities,
    result,
    reason: `The tool scope did not match the request. Requested ${[
      requestedMonths.length ? requestedMonths.map((month) => formatMonthLabel(month)).join(", ") : null,
      expectedCategory
    ].filter(Boolean).join(" / ")}.`,
    detail: `The candidate result returned ${[
      result.trace?.period ? formatMonthLabel(result.trace.period) : null,
      result.trace?.note ?? null
    ].filter(Boolean).join(" / ") || "a different scope"}.`,
    trace: {
      dataSource: "scope validation",
      period: requestedMonths.join(", "),
      note: expectedCategory ? `category=${expectedCategory}` : null
    },
    actions: result.actions
  });
}

async function loadToolData() {
  return Promise.all([
    getCommunitiesDashboardData(),
    getReportsSummaryData()
  ]);
}

function buildAnalysisFrameOptions(communities, reportsSummary) {
  const incidentRows = getIncidentRows(communities, reportsSummary);
  const detailRows = getIncidentDetailRows(communities, reportsSummary);
  const medicationRows = getMedicationComplianceRows(reportsSummary);
  const medicationExceptionRows = getMarExceptionDetailRows(reportsSummary);
  return {
    facilities: communities.facilities ?? [],
    residents: communities.residents ?? [],
    availableMonths: [...new Set([
      ...(communities.census ?? []).map((row) => row.month_bucket),
      ...incidentRows.map((row) => row.month_bucket),
      ...detailRows.map((row) => row.month_bucket),
      ...medicationRows.map((row) => row.month_bucket),
      ...medicationExceptionRows.map((row) => row.month_bucket),
      ...(reportsSummary.medicationCompliance ?? []).map((row) => row.month_bucket)
    ].filter(Boolean))].sort(),
    categories: [...new Set([...incidentRows, ...detailRows].map((row) => row.category ?? row.incident_type).filter(Boolean))]
  };
}

const { prepareAnalysisExecution } = createAnalysisExecutionPlanner({
  buildAnalysisFrameOptions,
  detectTool
});

function canBypassQueryConfirmation({ content, understanding, certifiedQuestion }) {
  if (!certifiedQuestion) return false;
  if (certifiedQuestion.id === "resident-profile") return /\bexact match\b/i.test(content);
  const uncertainCorrections = understanding.uncertainCorrections ?? [];
  if (!uncertainCorrections.length) return true;
  const certifiedVocabulary = new Set([
    certifiedQuestion.title,
    certifiedQuestion.description,
    certifiedQuestion.displayPrompt,
    ...(certifiedQuestion.examples ?? [])
  ].flatMap((value) => String(value ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? []));
  return uncertainCorrections.every((correction) => {
    const originalTokens = String(correction.original ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
    return originalTokens.length > 0 && originalTokens.every((token) => certifiedVocabulary.has(token));
  });
}

/**
 * @param {string} content
 * @param {any} communities
 * @param {import("../shared/certified-analyst-questions.mjs").CertifiedQuestionRoute | null} [certifiedQuestionRoute]
 */
function interpretCopilotRequest(content, communities, certifiedQuestionRoute = null) {
  const understanding = understandPlatformQuery(content, communities);
  const originalCertifiedQuestion = certifiedQuestionRoute?.question ?? matchCertifiedQuestion(content, {
    analysisFrame: createEmptyAnalysisFrame(),
    facilities: communities.facilities ?? [],
    residents: communities.residents ?? []
  });
  const canBypassConfirmation = Boolean(certifiedQuestionRoute) || canBypassQueryConfirmation({
    content,
    understanding,
    certifiedQuestion: originalCertifiedQuestion
  });
  const interpretedContent = certifiedQuestionRoute
    ? content
    : understanding.requiresConfirmation && canBypassConfirmation
    ? content
    : understanding.changed ? understanding.correctedText : content;

  return {
    understanding,
    canBypassConfirmation,
    interpretedContent
  };
}

export async function compileCopilotIntent(payload = {}) {
  const content = String(payload.content ?? "").trim();

  if (!content) {
    return {
      handled: false,
      reason: "empty"
    };
  }

  const certifiedQuestionRoute = getCertifiedQuestionRouteById(payload.certifiedQuestionRouteId);
  if (payload.certifiedQuestionRouteId && !certifiedQuestionRoute) {
    return {
      handled: false,
      reason: "unknown-certified-question-route"
    };
  }
  const [communities, reportsSummary] = await loadToolData();
  const { understanding, interpretedContent } = interpretCopilotRequest(content, communities, certifiedQuestionRoute);
  const prepared = prepareAnalysisExecution({ payload, interpretedContent, communities, reportsSummary });
  if (prepared.missingPriorContext) {
    return {
      handled: false,
      reason: "missing-prior-analysis-context",
      originalContent: content,
      interpretedContent,
      interpretation: understanding.changed ? understanding : undefined,
      derivedFrame: prepared.derivedFrame,
      analysisFrame: createEmptyAnalysisFrame(),
      detectedTool: prepared.detectedTool,
      certifiedQuestion: null,
      executionPlan: null,
      compiler: {
        frameFirst: false,
        fallbackTool: null,
        isModuleSurfaceIntent: false,
        hasExplicitAnalyticalShape: false,
        inherited: true,
        missingPriorContext: true
      }
    };
  }

  return {
    handled: true,
    originalContent: content,
    interpretedContent,
    interpretation: understanding.changed ? understanding : undefined,
    derivedFrame: prepared.derivedFrame,
    analysisFrame: prepared.effectiveAnalysisFrame,
    detectedTool: prepared.detectedTool,
    certifiedQuestion: makeCapabilityCertifiedQuestionMeta(
      prepared.certifiedQuestion,
      prepared.effectiveAnalysisFrame,
      prepared.certifiedQuestionRoute?.id
    ),
    executionPlan: prepared.executionPlan,
    compiler: {
      frameFirst: prepared.executionPlan.tool !== prepared.fallbackTool,
      fallbackTool: prepared.fallbackTool,
      isModuleSurfaceIntent: prepared.isModuleSurfaceIntent,
      hasExplicitAnalyticalShape: prepared.hasExplicitAnalyticalShape,
      inherited: prepared.contextualFollowUp
    }
  };
}

export async function runCopilotTool(payload = {}) {
  const turnStartedAt = Date.now();
  const content = String(payload.content ?? "").trim();

  if (!content) {
    return {
      handled: false,
      reason: "empty"
    };
  }

  const certifiedQuestionRoute = getCertifiedQuestionRouteById(payload.certifiedQuestionRouteId);
  if (payload.certifiedQuestionRouteId && !certifiedQuestionRoute) {
    return {
      handled: true,
      tool: "clarification",
      text: "This question route is no longer available. Choose the question again from the menu.",
      truthState: "plan_rejected",
      trace: makeTrace({
        tool: "clarification",
        dataSource: "guided question registry",
        rowCount: 0,
        note: "unknown guided question route",
        truthState: "plan_rejected"
      }),
      planValidation: {
        valid: false,
        errors: ["unknown guided question route"]
      }
    };
  }
  const [communities, reportsSummary] = await loadToolData();
  const {
    understanding,
    canBypassConfirmation,
    interpretedContent
  } = interpretCopilotRequest(content, communities, certifiedQuestionRoute);
  if (understanding.requiresConfirmation && !canBypassConfirmation) {
    const clarification = normalizeToolResultContract(makeClarificationResult(understanding), {
      tool: "clarification",
      content
    });
    return attachAnalystTurnTrace(clarification, {
      content,
      tool: "clarification",
      planValidation: { valid: true, errors: [] },
      cacheEligibility: { eligible: false, reason: "clarification required" },
      cached: false,
      stage: "clarification",
      executionMs: Date.now() - turnStartedAt
    });
  }
  const hasDirectEntityMatch = Boolean(findResident(interpretedContent, communities) || findFacility(interpretedContent, communities));
  const prepared = prepareAnalysisExecution({ payload, interpretedContent, communities, reportsSummary });
  if (prepared.missingPriorContext) {
    const missingContext = {
      ...normalizeToolResultContract(makeMissingAnalysisContextResult(interpretedContent), {
        tool: "clarification",
        content: interpretedContent
      }),
      interpretation: understanding.changed ? understanding : undefined,
      analysisFrame: createEmptyAnalysisFrame(),
      planValidation: { valid: true, errors: [] }
    };
    return attachAnalystTurnTrace(missingContext, {
      content: interpretedContent,
      tool: "clarification",
      executionPlan: null,
      planValidation: missingContext.planValidation,
      cacheEligibility: { eligible: false, reason: "missing prior analysis context" },
      cached: false,
      stage: "missing-context",
      executionMs: Date.now() - turnStartedAt
    });
  }
  const plannedUtilityTool = ["data_availability", "tool_context_catalog", "module_catalog", "surface_module"].includes(String(prepared.executionPlan?.tool ?? prepared.fallbackTool ?? ""));
  if (!isExportIntent(interpretedContent) && !isAnalysisIntent(interpretedContent) && !hasDirectEntityMatch && !(prepared.previousFrame && prepared.derivedFrame.inherit) && !plannedUtilityTool) {
    return {
      handled: false,
      reason: "no-tool-intent",
      analysisFrame: prepared.previousFrame
    };
  }
  const executionContent = prepared.contextualFollowUp ? prepared.executionPlan.canonicalPrompt : interpretedContent;
  const tool = prepared.executionPlan.tool ?? prepared.fallbackTool;
  const capabilityValidation = validatePlanToolCapability(prepared.executionPlan);
  if (!capabilityValidation.valid) {
    const violation = capabilityValidation.errors[0] ?? {
      code: "temporal_scope_mismatch",
      requestedPeriods: prepared.executionPlan.expected.periods,
      historicalAlternative: null
    };
    const recovery = buildRecoveryResult({
      content: executionContent,
      communities,
      tool,
      reason: `${tool.replace(/_/g, " ")} is current-state data and cannot answer a dated historical slice.`,
      detail: `Requested ${violation.requestedPeriods.map(formatMonthLabel).join(", ")}. I did not substitute today's roster or current profile for historical data.`,
      trace: {
        dataSource: "analysis capability preflight",
        period: violation.requestedPeriods.join(", "),
        note: violation.historicalAlternative
          ? `historical slice unavailable; temporal_scope_mismatch; historical alternative=${violation.historicalAlternative}`
          : "historical slice unavailable; temporal_scope_mismatch",
        truthState: "not_loaded"
      }
    });
    const formattedRecovery = {
      ...recovery,
      text: recovery.text
    };
    const normalizedRecovery = {
      ...pruneActionNoise(
        normalizeToolResultContract(
          enforceAnswerInvariants(formattedRecovery),
          { tool, content: executionContent }
        ),
        executionContent
      ),
      interpretation: understanding.changed ? understanding : undefined,
      analysisFrame: prepared.previousFrame,
      executionPlan: prepared.executionPlan,
      planValidation: {
        valid: true,
        errors: [],
        preflightRejected: true,
        code: violation.code
      }
    };
    return attachAnalystTurnTrace(normalizedRecovery, {
      content: executionContent,
      tool,
      executionPlan: prepared.executionPlan,
      planValidation: normalizedRecovery.planValidation,
      cacheEligibility: { eligible: false, reason: "capability preflight rejected" },
      cached: false,
      stage: "capability-preflight",
      executionMs: Date.now() - turnStartedAt
    });
  }
  const certifiedMeta = makeCapabilityCertifiedQuestionMeta(
    prepared.certifiedQuestion,
    prepared.effectiveAnalysisFrame,
    prepared.certifiedQuestionRoute?.id
  );
  const certifiedCacheBypassed = shouldBypassCertifiedCache({
    content: executionContent,
    certifiedQuestion: prepared.certifiedQuestion,
    reportsSummary
  });
  const certifiedCacheKey = typeof certifiedMeta?.cacheKey === "string" ? certifiedMeta.cacheKey : null;
  const cachedEntry = certifiedCacheKey && !certifiedCacheBypassed && !prepared.contextualFollowUp && !prepared.hasExplicitAnalyticalShape && !prepared.isUtilityIntent
    ? await getCertifiedAnswerCacheEntry(certifiedCacheKey, {
        dataSignature: buildCertifiedAnswerDataSignature(communities, reportsSummary)
      })
    : null;

  const cachedContractValidation = cachedEntry?.result && prepared.certifiedQuestionRoute
    ? validateCertifiedRouteResult(executionContent, cachedEntry.result, prepared.certifiedQuestionRoute)
    : { valid: true, failures: [] };
  const cacheEligibility = cachedContractValidation.valid ? certifiedCacheEligible({
    cachedResult: cachedEntry?.result,
    content: executionContent,
    communities,
    executionPlan: prepared.executionPlan,
    expectedTool: tool,
    reportsSummary,
    certifiedQuestion: prepared.certifiedQuestion
  }) : {
    eligible: false,
    reason: `guided contract mismatch: ${cachedContractValidation.failures.join("; ")}`
  };

  if (cacheEligibility.eligible) {
    const cachedResult = {
      ...cachedEntry.result,
      certifiedQuestion: cachedEntry.certifiedQuestion ?? certifiedMeta,
      trace: cachedEntry.result.trace
        ? {
            ...cachedEntry.result.trace,
            note: [cachedEntry.result.trace.note, "certified cache hit"].filter(Boolean).join("; ")
          }
        : makeTrace({
            tool: cachedEntry.result.tool ?? tool,
            dataSource: "certified answer cache",
            rowCount: cachedEntry.result.visual?.rows?.length ?? null,
            facility: findFacility(executionContent, communities),
            period: prepared.effectiveAnalysisFrame.periods.join(", ") || null,
            note: "certified cache hit"
          }),
      analysisFrame: prepared.effectiveAnalysisFrame,
      executionPlan: prepared.executionPlan,
      planValidation: { valid: true, errors: [] },
      cached: true
    };
    // The answer body is safe to reuse, but actions are product navigation and
    // must follow the current visible-question allowlist on every request.
    const guidedCachedResult = withCertifiedGuidance(
      cachedResult,
      prepared.certifiedQuestion,
      prepared.effectiveAnalysisFrame,
      executionContent,
      prepared.certifiedQuestionRoute?.id
    );
    const formattedCachedResult = enforceCertifiedRouteResult(
      executionContent,
      finalizeCachedToolResult(executionContent, guidedCachedResult, { tool }),
      prepared.certifiedQuestionRoute
    );
    const tracedCachedResult = attachAnalystTurnTrace(formattedCachedResult, {
      content: executionContent,
      tool,
      executionPlan: prepared.executionPlan,
      planValidation: { valid: true, errors: [] },
      cacheEligibility,
      cached: true,
      stage: "certified-cache",
      executionMs: Date.now() - turnStartedAt
    });
    if (prepared.sessionId) saveAnalysisSession(prepared.sessionId, prepared.effectiveAnalysisFrame, tracedCachedResult, prepared.executionPlan, prepared.sessionOwnerKey);
    return tracedCachedResult;
  }

  let result;
  try {
    result = attachTrace(runToolByName(tool, executionContent, communities, reportsSummary), { tool });
  } catch (error) {
    result = buildToolExceptionResult(error, { content: executionContent, communities, tool });
  }
  const validated = validateScopedToolResult(executionContent, result, communities, reportsSummary);
  const certifiedValidated = certifiedMeta ? { ...validated, certifiedQuestion: certifiedMeta } : validated;
  const finalized = finalizeToolResult(executionContent, certifiedValidated);
  const planValidation = prepared.isUtilityIntent
    ? { valid: true, errors: [] }
    : validateResultAgainstPlan(prepared.executionPlan, finalized);
  const exactDetailSafeRefusal = !planValidation.valid && tool === "incident_detail_list" && prepared.effectiveAnalysisFrame.mode === "detail"
    ? buildExactDetailUnavailableResult({
        content: executionContent,
        communities,
        frame: prepared.effectiveAnalysisFrame
      })
    : null;
  const safeFinalized = planValidation.valid
    ? finalized
    : exactDetailSafeRefusal
    ? exactDetailSafeRefusal
    : buildRecoveryResult({
        content: executionContent,
        communities,
        result: finalized,
        tool,
        reason: "The returned data did not match the requested scope.",
        detail: formatPlanValidationErrorsForUser(planValidation.errors),
        trace: {
          dataSource: "analysis plan validation",
          period: prepared.effectiveAnalysisFrame.periods.join(", ") || null,
          note: "execution plan rejected"
        },
        actions: finalized.actions
      });
  const finalPlanValidation = planValidation.valid || exactDetailSafeRefusal
    ? { valid: true, errors: [] }
    : planValidation;
  const guidedFinalized = pruneActionNoise(
    normalizeToolResultContract(
      enforceAnswerInvariants(withCertifiedGuidance(
        safeFinalized,
        prepared.certifiedQuestion,
        prepared.effectiveAnalysisFrame,
        executionContent,
        prepared.certifiedQuestionRoute?.id
      )),
      { tool, content: executionContent }
    ),
    executionContent
  );
  const tracedGuidedFinalized = attachAnalystTurnTrace(guidedFinalized, {
    content: executionContent,
    tool,
    executionPlan: prepared.executionPlan,
    planValidation: finalPlanValidation,
    cacheEligibility,
    cached: false,
    stage: "tool-result",
    executionMs: Date.now() - turnStartedAt
  });
  if (planValidation.valid && prepared.sessionId && !prepared.isUtilityIntent) {
    saveAnalysisSession(prepared.sessionId, prepared.effectiveAnalysisFrame, tracedGuidedFinalized, prepared.executionPlan, prepared.sessionOwnerKey);
  }
  const allowModuleComposition = !prepared.certifiedQuestionRoute && shouldComposeAdHocModules(executionContent, {
    primaryTool: tool,
    result: tracedGuidedFinalized,
    executionPlan: prepared.executionPlan
  });
  const hasExactSupportingVisuals = Array.isArray(tracedGuidedFinalized.supportingVisuals) && tracedGuidedFinalized.supportingVisuals.length > 0;
  const compositionResults = allowModuleComposition && !hasExactSupportingVisuals
    ? getCompositionToolPlan(executionContent, communities, tool)
        .filter((plannedTool) => plannedTool !== tool && !["surface_module", "module_catalog", "export_csv", "clarification"].includes(plannedTool))
        .slice(0, 5)
        .map((plannedTool) => {
          try {
            const planned = attachTrace(runToolByName(plannedTool, executionContent, communities, reportsSummary), { tool: plannedTool });
            const scoped = validateScopedToolResult(executionContent, planned, communities, reportsSummary);
            return normalizeToolResultContract(finalizeToolResult(executionContent, scoped), {
              tool: plannedTool,
              content: executionContent
            });
          } catch (error) {
            return buildToolExceptionResult(error, { content: executionContent, communities, tool: plannedTool });
          }
        })
    : [];
  const moduleSpecs = composeAdHocModules(
    executionContent,
    allowModuleComposition ? [tracedGuidedFinalized, ...compositionResults] : [tracedGuidedFinalized],
    3,
    { primaryTool: tool, executionPlan: prepared.executionPlan }
  );
  const responseResult = {
    ...tracedGuidedFinalized,
    moduleSpecs: moduleSpecs.length > 1 ? moduleSpecs : undefined,
    interpretation: understanding.changed ? understanding : undefined,
    analysisFrame: planValidation.valid ? prepared.effectiveAnalysisFrame : prepared.previousFrame,
    executionPlan: prepared.executionPlan,
    planValidation: finalPlanValidation
  };
  const responseWithModuleSchema = normalizeToolResultContract(
    enforceCertifiedRouteResult(executionContent, responseResult, prepared.certifiedQuestionRoute),
    { tool, content: executionContent }
  );
  return attachAnalystTurnTrace(responseWithModuleSchema, {
    content: executionContent,
    tool,
    executionPlan: prepared.executionPlan,
    planValidation: finalPlanValidation,
    cacheEligibility,
    cached: false,
    stage: "tool-result",
    executionMs: Date.now() - turnStartedAt
  });
}

function summarizeToolForClaude(result) {
  if (!result?.handled) return null;
  return {
    tool: result.tool,
    text: result.text,
    trace: result.trace,
    visual: result.visual
      ? {
          type: result.visual.type,
          title: result.visual.title,
          subtitle: result.visual.subtitle,
          valueLabel: result.visual.valueLabel,
          rows: result.visual.rows?.slice(0, 12) ?? []
        }
      : null,
    actions: (result.actions ?? []).map((action) => ({
      label: action.label,
      kind: action.kind,
      route: action.route ?? null,
      tool: action.tool ?? null,
      prompt: action.prompt ?? null
    })),
    moduleSpec: result.moduleSpec
      ? {
          id: result.moduleSpec.id,
          moduleId: result.moduleSpec.moduleId,
          templateId: result.moduleSpec.templateId,
          family: result.moduleSpec.family,
          scope: result.moduleSpec.scope,
          filters: result.moduleSpec.filters,
          provenance: result.moduleSpec.provenance,
          interactions: result.moduleSpec.interactions
      }
      : null,
    certifiedQuestion: result.certifiedQuestion ?? null,
    interpretation: result.interpretation ?? null,
    analysisFrame: result.analysisFrame ?? null,
    executionPlan: result.executionPlan ?? null,
    planValidation: result.planValidation ?? null
  };
}

function getToolPlan(content, communities) {
  const text = normalizeText(content);
  const plan = [detectTool(content, communities)];
  const add = (tool) => {
    if (!plan.includes(tool)) plan.push(tool);
  };

  if (findFacility(content, communities)) add("community_profile");
  if (/\b(operating snapshot|snapshot|current state|where are we|overview|portfolio picture)\b/.test(text)) {
    add("operating_snapshot");
    add("community_compare");
  }
  if (/\b(available data|data slices|analytical slices|tool context|manifest|fields|what data)\b/.test(text)) {
    add("tool_context_catalog");
  }
  if (/\b(slice|dice|break out|breakdown|break down|group by|by community|by category|by month|rank|top)\b/.test(text)) {
    add("slice_metric");
  }
  if (/\b(compare|comparison|versus| vs |rank communities|community compare)\b/.test(text)) {
    if (/\b(incident|incidents)\b/.test(text) && /\b(category|categories|type|types|breakdown)\b/.test(text)) add("incident_category_comparison");
    add("compare_periods");
    add("community_compare");
    add("incident_rate");
  }
  if (/\b(incident|incidents|awol|elopement|sentinel|police|injury|category|categories)\b/.test(text)) {
    add("incident_breakdown");
    if (/\b(driv(?:e|es|ing|er|ers)|account(?:s|ed)? for|top residents?|top clients?|most frequent|repeat residents?|repeat clients?|high frequency|highest volume)\b/.test(text)) add("incident_resident_drivers");
    if (/\b(rate|per 100|per resident)\b/.test(text)) add("incident_rate");
    if (/\b(detail|details|list|resident|residents|client|clients|who)\b/.test(text)) add("incident_detail_list");
  }
  if (findResident(content, communities) && /\b(incident|incidents|history|awol|elopement|injury|police|sentinel)\b/.test(text)) {
    add("resident_incident_history");
  }
  if (/\b(resident|residents|client|clients)\b/.test(text)) {
    if (/\b(search|find|lookup)\b/.test(text)) add("resident_search");
    if (/\b(risk|watchlist|watch list|who needs attention)\b/.test(text)) add("resident_risk_summary");
    if (/\b(diagnosis|diagnoses|clinical mix|condition|conditions)\b/.test(text)) add("diagnosis_mix");
    if (/\b(age|ages|demographic|demographics|oldest|younger|older)\b/.test(text)) add("resident_demographics");
    if (/\b(los|length of stay|longest stay|tenure|admitted)\b/.test(text)) add("length_of_stay_mix");
  }
  if (/\b(census|occupancy|headcount|population|resident count|movement|mover|change|trends?)\b/.test(text)) {
    if (/\b(drop|decline|decrease|down|fell|lower)\b/.test(text)) add("census_drop_history");
    add(/\b(movement|mover|change|delta|month over month|mom)\b/.test(text) ? "census_movement" : "census_trend");
  }
  if (/\b(documentation|doc gap|note gap|last note|care note)\b/.test(text)) {
    add("documentation_gaps");
  }
  if (/\b(medication|medications|meds|emar|mar|compliance|refusal|refusals|refused|not given|missed|held|late|prn)\b/.test(text)) {
    const medicationDetailIntent = /\b(exception|exceptions|detail|details|list|every|all|rows?|who|resident|residents|client|clients|reason|reasons|recent|last 90|not given|missed|held|late|prn)\b/.test(text);
    if (/\b(compliance|given|scheduled)\b/.test(text) && !/\bnot given\b/.test(text)) add("medication_compliance");
    if (medicationDetailIntent) add("medication_exception_detail");
    add(/\b(refusal|refusals|refused|not given)\b/.test(text) ? "medication_refusals_by_community" : "medication_profile");
  }
  if (/\b(compare|analysis|analyze|why|what stands out|what matters|overall|operating picture)\b/.test(text)) {
    add("operating_snapshot");
    add("community_compare");
    add("community_profile");
    add("census_movement");
    add("incident_breakdown");
    add("medication_refusals_by_community");
  }

  return plan.slice(0, 8);
}

function getCompositionToolPlan(content, communities, primaryTool) {
  const text = normalizeText(content);
  const plan = [];
  const add = (tool) => {
    if (tool && !plan.includes(tool)) plan.push(tool);
  };

  if (/\b(census|occupancy|headcount|population|resident count)\b/.test(text)) {
    add(/\b(movement|change|delta|month over month|mom)\b/.test(text) ? "census_movement" : "census_trend");
  }
  if (/\b(incident|incidents|awol|elopement|category|categories|fall|police|sentinel)\b/.test(text)) {
    if (/\b(rate|per 100|per resident)\b/.test(text)) add("incident_rate_change");
    if (/\b(driv(?:e|es|ing|er|ers)|account(?:s|ed)? for|top residents?|top clients?|most frequent|repeat residents?|repeat clients?|high frequency|highest volume)\b/.test(text)) add("incident_resident_drivers");
    add("incident_breakdown");
  }
  if (/\b(medication|medications|meds|emar|mar|compliance|refusal|refused|not given|missed|held|late|prn)\b/.test(text)) {
    if (/\b(exception|exceptions|detail|details|list|every|all|rows?|who|reason|reasons|recent|not given|missed|held|late|prn)\b/.test(text)) add("medication_exception_detail");
    add(/\b(refusal|refused|not given)\b/.test(text) ? "medication_refusals_by_community" : "medication_compliance");
  }
  if (/\b(documentation|doc gap|note gap|last note)\b/.test(text)) add("documentation_gaps");
  if (/\b(diagnosis|diagnoses|clinical mix)\b/.test(text)) add("diagnosis_mix");
  if (/\b(age|ages|demographic|demographics)\b/.test(text)) add("resident_demographics");
  if (/\b(los|length of stay|tenure)\b/.test(text)) add("length_of_stay_mix");
  if (findResident(content, communities)) add("resident_lookup");
  add(primaryTool);
  return plan.slice(0, 5);
}

export async function runRelevantCopilotTools(payload = {}) {
  const content = String(payload.content ?? "").trim();
  if (!content) return [];

  if (isAnalysisFrame(payload.analysisFrame)) {
    const result = await runCopilotTool(payload);
    return [summarizeToolForClaude(result)].filter(Boolean);
  }

  const [communities, reportsSummary] = await loadToolData();
  const understanding = understandPlatformQuery(content, communities);
  if (understanding.requiresConfirmation) {
    return [summarizeToolForClaude(normalizeToolResultContract(makeClarificationResult(understanding), {
      tool: "clarification",
      content
    }))];
  }
  const interpretedContent = understanding.changed ? understanding.correctedText : content;
  const hasDirectEntityMatch = Boolean(findResident(interpretedContent, communities) || findFacility(interpretedContent, communities));
  if (!isExportIntent(interpretedContent) && !isAnalysisIntent(interpretedContent) && !hasDirectEntityMatch) return [];

  const plan = getToolPlan(interpretedContent, communities);
  const results = plan.map((tool) => {
    try {
      const result = attachTrace(runToolByName(tool, interpretedContent, communities, reportsSummary), { tool });
      return validateScopedToolResult(interpretedContent, result, communities, reportsSummary);
    } catch (error) {
      return buildToolExceptionResult(error, { content: interpretedContent, communities, tool });
    }
  });
  return results
    .map((result) => ({
      ...finalizeToolResult(interpretedContent, result),
      interpretation: understanding.changed ? understanding : undefined
    }))
    .map(summarizeToolForClaude)
    .filter(Boolean);
}
