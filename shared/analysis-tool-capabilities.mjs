const DEFAULT_CAPABILITY = Object.freeze({
  temporalScope: "mixed",
  supportsExplicitPeriods: true,
  historicalAlternative: null
});

const TOOL_CAPABILITIES = Object.freeze({
  data_availability: { temporalScope: "mixed", supportsExplicitPeriods: true, historicalAlternative: null },
  tool_context_catalog: { temporalScope: "mixed", supportsExplicitPeriods: true, historicalAlternative: null },
  module_catalog: { temporalScope: "mixed", supportsExplicitPeriods: true, historicalAlternative: null },
  surface_module: { temporalScope: "mixed", supportsExplicitPeriods: true, historicalAlternative: null },
  incident_breakdown: { temporalScope: "monthly_history", supportsExplicitPeriods: true, historicalAlternative: null },
  incident_category_comparison: { temporalScope: "monthly_history", supportsExplicitPeriods: true, historicalAlternative: null },
  incident_detail_list: { temporalScope: "bounded_history", supportsExplicitPeriods: true, historicalAlternative: null },
  incident_resident_drivers: { temporalScope: "monthly_history", supportsExplicitPeriods: true, historicalAlternative: null },
  incident_rate: { temporalScope: "monthly_history", supportsExplicitPeriods: true, historicalAlternative: null },
  incident_rate_change: { temporalScope: "monthly_history", supportsExplicitPeriods: true, historicalAlternative: null },
  top_incident_category_by_community: { temporalScope: "monthly_history", supportsExplicitPeriods: true, historicalAlternative: null },
  compare_periods: { temporalScope: "monthly_history", supportsExplicitPeriods: true, historicalAlternative: null },
  detail_list: { temporalScope: "bounded_history", supportsExplicitPeriods: true, historicalAlternative: null },
  export_csv: { temporalScope: "bounded_history", supportsExplicitPeriods: true, historicalAlternative: null },
  census_trend: { temporalScope: "monthly_history", supportsExplicitPeriods: true, historicalAlternative: null },
  census_movement: { temporalScope: "monthly_history", supportsExplicitPeriods: true, historicalAlternative: null },
  census_drop_history: { temporalScope: "monthly_history", supportsExplicitPeriods: true, historicalAlternative: null },
  community_time_series: { temporalScope: "monthly_history", supportsExplicitPeriods: true, historicalAlternative: null },
  slice_metric: { temporalScope: "bounded_history", supportsExplicitPeriods: true, historicalAlternative: null },
  slice_discovery: { temporalScope: "bounded_history", supportsExplicitPeriods: true, historicalAlternative: null },
  resident_lookup: { temporalScope: "current_state", supportsExplicitPeriods: false, historicalAlternative: null },
  resident_search: { temporalScope: "current_state", supportsExplicitPeriods: false, historicalAlternative: null },
  resident_flow_weekly: { temporalScope: "bounded_history", supportsExplicitPeriods: true, historicalAlternative: null },
  resident_incident_history: { temporalScope: "bounded_history", supportsExplicitPeriods: true, historicalAlternative: null },
  resident_risk_summary: { temporalScope: "current_state", supportsExplicitPeriods: false, historicalAlternative: null },
  diagnosis_mix: { temporalScope: "current_state", supportsExplicitPeriods: false, historicalAlternative: null },
  length_of_stay_mix: { temporalScope: "current_state", supportsExplicitPeriods: false, historicalAlternative: null },
  resident_demographics: { temporalScope: "current_state", supportsExplicitPeriods: false, historicalAlternative: null },
  documentation_gaps: { temporalScope: "current_state", supportsExplicitPeriods: false, historicalAlternative: null },
  community_profile: { temporalScope: "current_state", supportsExplicitPeriods: false, historicalAlternative: "census_trend" },
  community_history: { temporalScope: "monthly_history", supportsExplicitPeriods: true, historicalAlternative: null },
  community_compare: { temporalScope: "current_state", supportsExplicitPeriods: false, historicalAlternative: "slice_metric" },
  operating_snapshot: { temporalScope: "current_state", supportsExplicitPeriods: false, historicalAlternative: "community_time_series" },
  medication_compliance: { temporalScope: "monthly_history", supportsExplicitPeriods: true, historicalAlternative: null },
  medication_orders_current: { temporalScope: "current_state", supportsExplicitPeriods: false, historicalAlternative: null },
  medication_exception_detail: { temporalScope: "bounded_history", supportsExplicitPeriods: true, historicalAlternative: null },
  medication_refusals_by_community: { temporalScope: "monthly_history", supportsExplicitPeriods: true, historicalAlternative: null },
  medication_profile: { temporalScope: "current_state", supportsExplicitPeriods: false, historicalAlternative: "medication_compliance" },
  medication_watch: { temporalScope: "current_state", supportsExplicitPeriods: false, historicalAlternative: "medication_exception_detail" }
});

export function getAnalysisToolCapability(tool) {
  return { ...DEFAULT_CAPABILITY, ...(TOOL_CAPABILITIES[tool] ?? {}) };
}

export function listAnalysisToolCapabilities() {
  return Object.entries(TOOL_CAPABILITIES).map(([tool, capability]) => ({
    tool,
    capability: { ...DEFAULT_CAPABILITY, ...capability }
  }));
}

export function validatePlanToolCapability(plan) {
  const capability = getAnalysisToolCapability(plan?.tool);
  const periods = Array.isArray(plan?.expected?.periods) ? plan.expected.periods.filter(Boolean) : [];
  const errors = [];

  if (periods.length && !capability.supportsExplicitPeriods) {
    errors.push({
      code: "temporal_scope_mismatch",
      message: `${plan.tool} is current-state only and cannot answer explicit historical periods`,
      tool: plan.tool,
      requestedPeriods: periods,
      temporalScope: capability.temporalScope,
      historicalAlternative: capability.historicalAlternative
    });
  }

  return { valid: errors.length === 0, capability, errors };
}

export function isCurrentStateOnlyTool(tool) {
  return getAnalysisToolCapability(tool).temporalScope === "current_state";
}
