const INCIDENT_KEYWORDS = Object.freeze([
  "incident",
  "incidents",
  "awol",
  "elopement",
  "fall",
  "police",
  "sentinel",
  "aggressive",
  "substance",
  "medical emergency"
]);

const MEDICATION_KEYWORDS = Object.freeze([
  "medication",
  "medications",
  "meds",
  "emar",
  "mar",
  "compliance",
  "refusal",
  "refusals",
  "not given",
  "missed",
  "held",
  "late",
  "prn"
]);

const DOCUMENTATION_KEYWORDS = Object.freeze([
  "documentation",
  "doc",
  "docs",
  "note",
  "notes",
  "last note",
  "documentation gap",
  "doc gap",
  "charting"
]);

const OPERATIONS_KEYWORDS = Object.freeze([
  "operating",
  "operations",
  "topline",
  "summary",
  "snapshot",
  "overview",
  "how is",
  "community profile",
  "community summary"
]);

const RESIDENT_LIFECYCLE_KEYWORDS = Object.freeze([
  "admission",
  "admissions",
  "admit",
  "admitted",
  "intake",
  "intakes",
  "move in",
  "move ins",
  "move out",
  "move outs",
  "discharge",
  "discharges",
  "discharged",
  "resident flow",
  "throughput",
  "turnover"
]);

const CENSUS_QUALITY_KEYWORDS = Object.freeze([
  "census data quality",
  "census quality",
  "census audit",
  "countability",
  "countability audit",
  "resident countability",
  "fake patients",
  "fake residents",
  "test patients",
  "test residents",
  "placeholder patients",
  "placeholder residents",
  "excluded patients",
  "excluded residents",
  "non countable",
  "non-countable",
  "bad census",
  "counting fake"
]);

const SERVICE_KEYWORDS = Object.freeze([
  "service",
  "services",
  "services provided",
  "provided to clients",
  "billable service",
  "service archive",
  "scheduled service",
  "service units"
]);

const ASSESSMENT_KEYWORDS = Object.freeze([
  "assessment",
  "assessments",
  "assessment type",
  "assessment score",
  "assessment status"
]);

const NOTES_KEYWORDS = Object.freeze([
  "note",
  "notes",
  "progress note",
  "care note",
  "resident note",
  "documentation note",
  "narrative"
]);

export const ANALYSIS_SLICE_CATALOG_VERSION = "slice-catalog-v1";

export const ANALYSIS_SLICE_CATALOG = Object.freeze([
  Object.freeze({
    id: "community_operating_summary",
    title: "Community Operating Summary",
    domain: "operations",
    grain: "community_current",
    source: "tool_context.communityOperatingSummary",
    metrics: Object.freeze(["operations", "community_profile", "topline"]),
    modes: Object.freeze(["aggregate", "profile"]),
    defaultMeasure: "incidents",
    valueField: "incidents",
    periodField: "month_bucket",
    dateField: null,
    dimensions: Object.freeze(["community", "month"]),
    fields: Object.freeze(["community", "month", "residents", "census", "census_delta", "incidents", "incidents_per_100", "compliance"]),
    keywords: OPERATIONS_KEYWORDS,
    defaultGrouping: "community",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "incident_detail_history",
    title: "Incident Detail History",
    domain: "incidents",
    grain: "incident_detail",
    source: "tool_context.incidentDetailHistory",
    metrics: Object.freeze(["incidents", "incident_events"]),
    modes: Object.freeze(["detail", "aggregate"]),
    defaultMeasure: "rows",
    valueField: null,
    periodField: "month_bucket",
    dateField: "incident_date",
    dimensions: Object.freeze(["community", "month", "date", "category", "resident", "type"]),
    fields: Object.freeze(["community", "resident", "date", "type", "description", "location", "unit"]),
    keywords: INCIDENT_KEYWORDS,
    defaultGrouping: "category",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "incident_monthly_by_community_category",
    title: "Monthly Incidents by Community and Category",
    domain: "incidents",
    grain: "community_month_category",
    source: "tool_context.incidentMonthlyByCommunityCategory",
    metrics: Object.freeze(["incidents", "incident_events"]),
    modes: Object.freeze(["aggregate", "comparison", "trend"]),
    defaultMeasure: "incident_count",
    valueField: "incident_count",
    periodField: "month_bucket",
    dateField: "latest_incident_date",
    dimensions: Object.freeze(["community", "month", "category"]),
    fields: Object.freeze(["community", "month", "category", "incidents"]),
    keywords: INCIDENT_KEYWORDS,
    defaultGrouping: "category",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "resident_incident_summary",
    title: "Resident Incident Summary",
    domain: "incidents",
    grain: "resident_rollup",
    source: "tool_context.residentIncidentSummary",
    metrics: Object.freeze(["incidents", "resident_incidents", "resident_risk"]),
    modes: Object.freeze(["aggregate", "detail", "profile"]),
    defaultMeasure: "incident_count_90d",
    valueField: "incident_count_90d",
    periodField: null,
    dateField: "last_incident_date",
    dimensions: Object.freeze(["community", "resident", "category"]),
    fields: Object.freeze(["community", "resident", "unit", "incident_count_all_time", "incident_count_30d", "incident_count_90d", "last_incident_date", "last_incident_category"]),
    keywords: Object.freeze([...INCIDENT_KEYWORDS, "resident incidents", "repeat", "frequent", "drivers", "high utilizers", "history"]),
    defaultGrouping: "resident",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "census_monthly_by_community",
    title: "Monthly Census by Community",
    domain: "census",
    grain: "community_month",
    source: "snapshot.census",
    metrics: Object.freeze(["census", "residents", "resident_count"]),
    modes: Object.freeze(["aggregate", "comparison", "trend"]),
    defaultMeasure: "census",
    valueField: "census",
    periodField: "month_bucket",
    dateField: null,
    dimensions: Object.freeze(["community", "month"]),
    fields: Object.freeze(["community", "month", "census"]),
    keywords: Object.freeze(["census", "occupancy", "headcount", "population", "resident count", "clients", "residents"]),
    defaultGrouping: "month",
    defaultVisual: "line_chart"
  }),
  Object.freeze({
    id: "census_weekly_by_community",
    title: "Weekly Census by Community",
    domain: "census",
    grain: "community_week_census",
    source: "tool_context.censusWeeklyByCommunity",
    metrics: Object.freeze(["census", "residents", "resident_count"]),
    modes: Object.freeze(["aggregate", "comparison", "trend"]),
    defaultMeasure: "census",
    valueField: "census",
    periodField: "month_bucket",
    dateField: "week_start",
    dimensions: Object.freeze(["community", "month", "week"]),
    fields: Object.freeze(["community", "week", "week_end", "census"]),
    keywords: Object.freeze(["weekly census", "census by week", "week by week census", "weekly headcount", "weekly residents", "weekly clients", "census", "occupancy", "headcount"]),
    defaultGrouping: "week",
    defaultVisual: "line_chart"
  }),
  Object.freeze({
    id: "medication_compliance_monthly",
    title: "Medication Compliance by Community and Medication",
    domain: "medications",
    grain: "community_month_medication",
    source: "tool_context.marMonthlyByCommunityMedication",
    metrics: Object.freeze(["medications", "medication_compliance"]),
    modes: Object.freeze(["aggregate", "comparison", "trend"]),
    defaultMeasure: "compliance_pct",
    valueField: "compliance_pct",
    periodField: "month_bucket",
    dateField: null,
    dimensions: Object.freeze(["community", "month", "medication"]),
    fields: Object.freeze(["community", "month", "medication", "scheduled", "given", "not_given", "compliance"]),
    keywords: MEDICATION_KEYWORDS,
    defaultGrouping: "community",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "medication_refusal_summary",
    title: "Medication Refusals by Community and Medication",
    domain: "medications",
    grain: "community_medication",
    source: "tool_context.medicationRefusalSummary",
    metrics: Object.freeze(["medications", "medication_refusals"]),
    modes: Object.freeze(["aggregate"]),
    defaultMeasure: "refusals",
    valueField: "refusals",
    periodField: "month_bucket",
    dateField: null,
    dimensions: Object.freeze(["community", "month", "medication"]),
    fields: Object.freeze(["community", "medication", "scheduled", "refusals", "refusal_pct"]),
    keywords: MEDICATION_KEYWORDS,
    defaultGrouping: "medication",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "mar_exception_detail_90d",
    title: "MAR Exception Detail",
    domain: "medications",
    grain: "medication_exception_detail",
    source: "tool_context.marExceptionDetails",
    metrics: Object.freeze(["medications", "medication_exceptions", "mar_exception", "mar_exceptions"]),
    modes: Object.freeze(["detail", "aggregate"]),
    defaultMeasure: "rows",
    valueField: null,
    periodField: "month_bucket",
    dateField: "administration_date",
    dimensions: Object.freeze(["community", "month", "resident", "medication", "outcome"]),
    fields: Object.freeze(["community", "resident", "date", "medication", "outcome", "reason", "note"]),
    keywords: Object.freeze([...MEDICATION_KEYWORDS, "exception", "exceptions", "mar exception", "exception rows"]),
    defaultGrouping: "medication",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "mar_resident_summary",
    title: "Resident MAR Summary",
    domain: "medications",
    grain: "resident_current_medication",
    source: "tool_context.marResidentSummary",
    metrics: Object.freeze(["medications", "resident_medications", "mar", "medication_refusals"]),
    modes: Object.freeze(["aggregate", "detail", "profile"]),
    defaultMeasure: "refusals_30d",
    valueField: "refusals_30d",
    periodField: null,
    dateField: "last_recorded_date",
    dimensions: Object.freeze(["community", "resident", "medication"]),
    fields: Object.freeze(["community", "resident", "active_medication_count", "active_psychotropic_count", "refusals_7d", "refusals_30d", "compliance_pct_30d", "last_recorded_date"]),
    keywords: MEDICATION_KEYWORDS,
    defaultGrouping: "resident",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "mar_prn_effectiveness_90d",
    title: "PRN Administration and Effectiveness Detail",
    domain: "medications",
    grain: "medication_prn_detail",
    source: "tool_context.marPrnEffectiveness",
    metrics: Object.freeze(["medications", "prn", "prn_effectiveness"]),
    modes: Object.freeze(["detail", "aggregate"]),
    defaultMeasure: "rows",
    valueField: null,
    periodField: "month_bucket",
    dateField: "administration_date",
    dimensions: Object.freeze(["community", "month", "resident", "medication"]),
    fields: Object.freeze(["community", "resident", "date", "medication", "reason", "result", "followup"]),
    keywords: Object.freeze([...MEDICATION_KEYWORDS, "prn", "effectiveness", "follow-up", "followup"]),
    defaultGrouping: "medication",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "mar_medication_orders_current",
    title: "Current Medication Orders",
    domain: "medications",
    grain: "resident_current_medication_order",
    source: "tool_context.marMedicationOrders",
    metrics: Object.freeze(["medications", "medication_orders", "current_medications"]),
    modes: Object.freeze(["detail", "aggregate", "profile"]),
    defaultMeasure: "rows",
    valueField: null,
    periodField: null,
    dateField: "effective_date",
    dimensions: Object.freeze(["community", "resident", "medication"]),
    fields: Object.freeze(["community", "resident", "medication", "dosage", "route", "schedule", "indication", "prn", "psychotropic", "narcotic", "on_hold"]),
    keywords: Object.freeze([...MEDICATION_KEYWORDS, "current medications", "active medications", "medication orders", "dose", "dosage", "route", "schedule"]),
    defaultGrouping: "medication",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "resident_profile_enriched",
    title: "Resident Profile",
    domain: "residents",
    grain: "resident_current",
    source: "tool_context.residentProfiles",
    metrics: Object.freeze(["residents", "resident_profile", "length_of_stay", "resident_demographics"]),
    modes: Object.freeze(["detail", "profile", "aggregate"]),
    defaultMeasure: "rows",
    valueField: null,
    periodField: null,
    dateField: "admit_date",
    dimensions: Object.freeze(["community", "resident", "diagnosis", "payor", "care_level"]),
    fields: Object.freeze(["community", "resident", "unit", "age", "admit_date", "los", "diagnosis", "payor", "care_level"]),
    keywords: Object.freeze(["resident", "residents", "client", "clients", "profile", "roster", "age", "los", "diagnosis", "admit", "admission", "intake", "move in"]),
    defaultGrouping: "community",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "resident_episode_history",
    title: "Resident Admission and Discharge History",
    domain: "residents",
    grain: "resident_episode",
    source: "tool_context.residentEpisodeHistory",
    metrics: Object.freeze(["residents", "admissions", "discharges", "resident_flow"]),
    modes: Object.freeze(["detail", "aggregate", "trend"]),
    defaultMeasure: "episodes",
    valueField: null,
    periodField: "month_bucket",
    dateField: "admit_date",
    dimensions: Object.freeze(["community", "month", "resident", "movement"]),
    fields: Object.freeze(["community", "resident", "admit_date", "discharge_date", "status", "reason"]),
    keywords: RESIDENT_LIFECYCLE_KEYWORDS,
    defaultGrouping: "month",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "resident_flow_weekly_by_community",
    title: "Weekly Resident Intake and Discharge",
    domain: "residents",
    grain: "community_week_movement",
    source: "tool_context.residentFlowWeeklyByCommunity",
    metrics: Object.freeze(["residents", "resident_flow", "admissions", "discharges", "intakes"]),
    modes: Object.freeze(["aggregate", "comparison", "trend"]),
    defaultMeasure: "net_change",
    valueField: "net_change",
    periodField: "month_bucket",
    dateField: "week_start",
    dimensions: Object.freeze(["community", "month", "week", "movement"]),
    fields: Object.freeze(["community", "week", "admissions", "discharges", "net_change"]),
    keywords: RESIDENT_LIFECYCLE_KEYWORDS,
    defaultGrouping: "week",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "resident_flow_monthly_by_community",
    title: "Monthly Resident Intake and Discharge",
    domain: "residents",
    grain: "community_month_movement",
    source: "tool_context.residentFlowMonthlyByCommunity",
    metrics: Object.freeze(["residents", "resident_flow", "admissions", "discharges", "intakes"]),
    modes: Object.freeze(["aggregate", "comparison", "trend"]),
    defaultMeasure: "net_change",
    valueField: "net_change",
    periodField: "month_bucket",
    dateField: null,
    dimensions: Object.freeze(["community", "month", "movement"]),
    fields: Object.freeze(["community", "month", "admissions", "discharges", "net_change"]),
    keywords: RESIDENT_LIFECYCLE_KEYWORDS,
    defaultGrouping: "month",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "census_data_quality",
    title: "Census Data Quality",
    domain: "census",
    grain: "community_census_quality",
    source: "tool_context.censusDataQuality",
    metrics: Object.freeze(["census", "data_quality", "countability"]),
    modes: Object.freeze(["aggregate", "detail"]),
    defaultMeasure: "excluded_or_non_countable_rows",
    valueField: "excluded_or_non_countable_rows",
    periodField: "latest_census_month",
    dateField: null,
    dimensions: Object.freeze(["community", "month"]),
    fields: Object.freeze(["community", "latest_monthly_census", "active_roster_residents", "difference", "excluded_rows", "suspected_test_rows"]),
    keywords: CENSUS_QUALITY_KEYWORDS,
    defaultGrouping: "community",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "resident_countability_audit",
    title: "Resident Countability Audit",
    domain: "census",
    grain: "resident_countability",
    source: "tool_context.residentCountabilityAudit",
    metrics: Object.freeze(["census", "data_quality", "residents", "countability"]),
    modes: Object.freeze(["detail", "aggregate"]),
    defaultMeasure: "rows",
    valueField: null,
    periodField: null,
    dateField: "admit_date",
    dimensions: Object.freeze(["community", "resident", "reason"]),
    fields: Object.freeze(["community", "resident", "admit_date", "discharge_date", "reason"]),
    keywords: CENSUS_QUALITY_KEYWORDS,
    defaultGrouping: "community",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "resident_unit_history",
    title: "Resident Unit History",
    domain: "residents",
    grain: "resident_unit_history",
    source: "tool_context.residentUnitHistory",
    metrics: Object.freeze(["residents", "unit_history", "room_history"]),
    modes: Object.freeze(["detail", "aggregate"]),
    defaultMeasure: "rows",
    valueField: null,
    periodField: "month_bucket",
    dateField: "start_date",
    dimensions: Object.freeze(["community", "month", "resident", "unit"]),
    fields: Object.freeze(["community", "resident", "unit", "start_date", "end_date"]),
    keywords: Object.freeze(["unit history", "room history", "unit", "room", "bed", "move rooms"]),
    defaultGrouping: "resident",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "services_provided",
    title: "Services Provided",
    domain: "services",
    grain: "resident_service_detail",
    source: "tool_context.servicesProvided",
    metrics: Object.freeze(["services", "services_provided", "service_units"]),
    modes: Object.freeze(["detail", "aggregate", "trend"]),
    defaultMeasure: "rows",
    valueField: null,
    periodField: "month_bucket",
    dateField: "service_date",
    dimensions: Object.freeze(["community", "month", "resident", "service"]),
    fields: Object.freeze(["community", "resident", "date", "service", "status", "units"]),
    keywords: SERVICE_KEYWORDS,
    defaultGrouping: "service",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "assessment_summary",
    title: "Assessment Detail",
    domain: "assessments",
    grain: "resident_assessment_detail",
    source: "tool_context.assessmentSummary",
    metrics: Object.freeze(["assessments", "assessment_detail"]),
    modes: Object.freeze(["detail", "aggregate", "trend"]),
    defaultMeasure: "rows",
    valueField: null,
    periodField: "month_bucket",
    dateField: "assessment_date",
    dimensions: Object.freeze(["community", "month", "resident", "assessment"]),
    fields: Object.freeze(["community", "resident", "date", "assessment", "status", "score"]),
    keywords: ASSESSMENT_KEYWORDS,
    defaultGrouping: "assessment",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "notes_summary",
    title: "Resident Notes",
    domain: "notes",
    grain: "resident_note_detail",
    source: "tool_context.notesSummary",
    metrics: Object.freeze(["notes", "resident_notes", "documentation_notes"]),
    modes: Object.freeze(["detail", "aggregate", "trend"]),
    defaultMeasure: "rows",
    valueField: null,
    periodField: "month_bucket",
    dateField: "note_date",
    dimensions: Object.freeze(["community", "month", "resident", "note_type"]),
    fields: Object.freeze(["community", "resident", "date", "note_type", "note", "action_required_by_date"]),
    keywords: Object.freeze([...DOCUMENTATION_KEYWORDS, ...NOTES_KEYWORDS]),
    defaultGrouping: "note_type",
    defaultVisual: "table"
  }),
  Object.freeze({
    id: "documentation_status",
    title: "Documentation Status",
    domain: "documentation",
    grain: "resident_documentation",
    source: "tool_context.documentationStatus",
    metrics: Object.freeze(["documentation", "documentation_gaps"]),
    modes: Object.freeze(["aggregate", "detail"]),
    defaultMeasure: "days_since_last_note",
    valueField: "days_since_last_note",
    periodField: null,
    dateField: "last_note_date",
    dimensions: Object.freeze(["community", "resident"]),
    fields: Object.freeze(["community", "resident", "last_note_date", "days_since_last_note"]),
    keywords: DOCUMENTATION_KEYWORDS,
    defaultGrouping: "resident",
    defaultVisual: "table"
  })
]);

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, values) {
  return values.some((value) => {
    const normalized = normalize(value);
    if (!normalized) return false;
    if (normalized.includes(" ")) return text.includes(normalized);
    return new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);
  });
}

function inferRequestedDomain(text) {
  if (includesAny(text, CENSUS_QUALITY_KEYWORDS)) return "census";
  if (includesAny(text, INCIDENT_KEYWORDS)) return "incidents";
  if (includesAny(text, MEDICATION_KEYWORDS)) return "medications";
  if (includesAny(text, SERVICE_KEYWORDS)) return "services";
  if (includesAny(text, ASSESSMENT_KEYWORDS)) return "assessments";
  if (includesAny(text, NOTES_KEYWORDS)) return "notes";
  if (includesAny(text, DOCUMENTATION_KEYWORDS)) return "documentation";
  if (includesAny(text, OPERATIONS_KEYWORDS)) return "operations";
  if (/\b(census|occupancy|headcount|population|resident count)\b/.test(text)) return "census";
  if (includesAny(text, RESIDENT_LIFECYCLE_KEYWORDS)) return "residents";
  if (/\b(resident|residents|client|clients|roster|profile|age|los|diagnosis)\b/.test(text)) return "residents";
  return null;
}

function inferRequestedMode(text) {
  if (/\b(resident countability|countability audit|fake patients?|fake residents?|test patients?|test residents?|placeholder patients?|placeholder residents?|excluded patients?|excluded residents?)\b/.test(text) || /\bnon[\s-]?countable\b/.test(text)) return "detail";
  if (/\b(list|every|detail|details|rows?|exact rows?|description|narrative|search)\b/.test(text)) return "detail";
  if (/\b(trends?|over time|history|historical|monthly|trajectory)\b/.test(text)) return "trend";
  if (/\b(compare|comparison|versus|\bvs\b|change|delta)\b/.test(text)) return "comparison";
  if (/\b(profile|who is)\b/.test(text)) return "profile";
  return "aggregate";
}

export function getAnalysisSlice(id) {
  return ANALYSIS_SLICE_CATALOG.find((slice) => slice.id === id) ?? null;
}

export function isSliceDiscoveryIntent(content) {
  const text = normalize(content);
  return /\b(slice|dice|pivot|group by|break out|custom view|ad hoc|by month and|by community and|by category and|fields?|columns?)\b/.test(text) ||
    includesAny(text, CENSUS_QUALITY_KEYWORDS) ||
    /\b(weekly census|census by week|week by week census|weekly headcount|monthly intake|monthly discharge|monthly admissions?|monthly resident flow)\b/.test(text) ||
    /\bgroup\b.+\bby\b/.test(text);
}

export function rankAnalysisSlicesForQuery(content, frame = {}) {
  const text = normalize(content);
  const metricDomains = {
    incidents: "incidents",
    census: "census",
    medications: "medications",
    residents: "residents",
    documentation: "documentation",
    operations: "operations",
    services: "services",
    assessments: "assessments",
    notes: "notes"
  };
  const requestedDomain = metricDomains[frame.metric] ?? inferRequestedDomain(text);
  const requestedMode = frame.mode ?? inferRequestedMode(text);
  const grouping = frame.grouping ?? (/\bby month\b|\bmonthly\b/.test(text)
    ? "month"
    : /\bby week\b|\bweekly\b|\bweek by week\b/.test(text)
      ? "week"
    : /\bby community|by facility|each community|each facility\b/.test(text)
      ? "community"
      : /\bby category|by type\b/.test(text)
        ? "category"
        : /\bby resident|by client|by person|by people\b/.test(text)
          ? "resident"
          : /\bby service|service type|services? provided\b/.test(text)
            ? "service"
            : /\bby assessment|assessment type\b/.test(text)
              ? "assessment"
              : /\bby note|note type\b/.test(text)
                ? "note_type"
          : null);

  return ANALYSIS_SLICE_CATALOG
    .map((slice) => {
      let score = 0;
      if (requestedDomain && slice.domain === requestedDomain) score += 8;
      if (requestedMode && slice.modes.includes(requestedMode)) score += 3;
      if (grouping && slice.dimensions.includes(grouping)) score += 3;
      if (includesAny(text, slice.metrics)) score += 4;
      if (includesAny(text, [slice.defaultMeasure, ...slice.fields])) score += 2;
      if (includesAny(text, slice.keywords)) score += 2;
      if (frame.periods?.length && slice.periodField) score += 2;
      if (frame.category && slice.dimensions.includes("category")) score += 2;
      if (frame.residentName && slice.dimensions.includes("resident")) score += 2;
      if (isSliceDiscoveryIntent(text)) score += 1;
      if (includesAny(text, CENSUS_QUALITY_KEYWORDS) && slice.id === "census_data_quality") score += 8;
      if ((/\b(resident countability|countability audit)\b/.test(text) || /\b(fake|test|placeholder|excluded|non[\s-]?countable)\b/.test(text)) && slice.id === "resident_countability_audit") score += 8;
      if (/\b(weekly census|census by week|week by week census|weekly headcount|weekly residents?|weekly clients?)\b/.test(text) && slice.id === "census_weekly_by_community") score += 8;
      if (/\b(monthly intake|monthly discharge|monthly admissions?|monthly resident flow|intake and discharge by community)\b/.test(text) && slice.id === "resident_flow_monthly_by_community") score += 8;
      return {
        slice,
        score,
        confidence: score >= 11 ? "high" : score >= 7 ? "medium" : "low",
        reason: [
          requestedDomain ? `domain=${requestedDomain}` : null,
          requestedMode ? `mode=${requestedMode}` : null,
          grouping ? `grouping=${grouping}` : null
        ].filter(Boolean).join("; ")
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta) return scoreDelta;
      if (requestedMode === "detail") {
        const leftDetailScore = left.slice.modes.includes("detail") && !left.slice.valueField ? 1 : 0;
        const rightDetailScore = right.slice.modes.includes("detail") && !right.slice.valueField ? 1 : 0;
        if (leftDetailScore !== rightDetailScore) return rightDetailScore - leftDetailScore;
      } else {
        const leftAggregateScore = left.slice.valueField ? 1 : 0;
        const rightAggregateScore = right.slice.valueField ? 1 : 0;
        if (leftAggregateScore !== rightAggregateScore) return rightAggregateScore - leftAggregateScore;
      }
      return left.slice.id.localeCompare(right.slice.id);
    });
}
