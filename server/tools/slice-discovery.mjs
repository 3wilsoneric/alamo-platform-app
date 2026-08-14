import {
  getAnalysisSlice,
  rankAnalysisSlicesForQuery
} from "../../shared/analysis-slice-catalog.mjs";

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function defaultFormatValue(value, precision = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("en-US", {
    maximumFractionDigits: precision,
    minimumFractionDigits: precision
  });
}

function firstPresent(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
  }
  return null;
}

function parseGrouping(content, slice) {
  const text = normalize(content);
  const groups = [];
  const add = (group) => {
    if (slice.dimensions.includes(group) && !groups.includes(group)) groups.push(group);
  };
  if (/\bby month\b|\bmonthly\b/.test(text)) add("month");
  if (/\bby community|by facility|each community|each facility|across communities|across facilities\b/.test(text)) add("community");
  if (/\bby category|by categories|by type|by types\b/.test(text)) add("category");
  if (/\bby resident|by client|by person|by people\b/.test(text)) add("resident");
  if (/\bby medication|by med\b/.test(text)) add("medication");
  if (/\bby outcome|by reason\b/.test(text)) add("outcome");
  if (/\bby week|weekly|week by week\b/.test(text)) add("week");
  if (/\bby service|service type|services? provided\b/.test(text)) add("service");
  if (/\bby assessment|assessment type\b/.test(text)) add("assessment");
  if (/\bby note|note type\b/.test(text)) add("note_type");
  if (/\bby status|by movement|intake versus discharge|admission versus discharge\b/.test(text)) add("movement");
  if (!groups.length && slice.defaultGrouping) add(slice.defaultGrouping);
  return groups.slice(0, 2);
}

function parseMode(content) {
  const text = normalize(content);
  if (/\b(resident countability|countability audit|fake patients?|fake residents?|test patients?|test residents?|placeholder patients?|placeholder residents?|excluded patients?|excluded residents?)\b/.test(text) || /\bnon[\s-]?countable\b/.test(text)) return "detail";
  if (/\b(list|every|detail|details|rows?|exact rows?|description|narrative|search)\b/.test(text)) return "detail";
  if (/\b(trends?|over time|history|historical|monthly|trajectory)\b/.test(text)) return "trend";
  if (/\b(compare|comparison|versus|\bvs\b|change|delta)\b/.test(text)) return "comparison";
  if (/\b(profile|who is)\b/.test(text)) return "profile";
  return "aggregate";
}

function selectSlice(content, frame = {}) {
  const mode = frame.mode ?? parseMode(content);
  const ranked = rankAnalysisSlicesForQuery(content, frame);
  if (!ranked.length) return null;
  const preferred = ranked.find((candidate) => (
    mode === "detail"
      ? candidate.slice.modes.includes("detail") && !candidate.slice.valueField
      : candidate.slice.modes.includes(mode) && candidate.slice.valueField
  ));
  return preferred ?? ranked[0];
}

function getRowMonth(row, slice) {
  return firstPresent(row, [slice.periodField, "month_bucket", "month", "period", "reporting_month"]);
}

function getCommunityName(row, dependencies, communities) {
  const direct = firstPresent(row, ["facility_name", "community_name", "Community", "facilityName"]);
  if (direct) return String(direct);
  return dependencies.getFacilityNameById(communities, firstPresent(row, ["facility_id", "facility", "Facility"]));
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildResidentIncidentSummaryRows(communities, reportsSummary, dependencies) {
  const prepared = reportsSummary.toolContext?.residentIncidentSummary ??
    reportsSummary.toolContext?.tables?.resident_incident_summary ??
    [];
  if (prepared.length) return prepared;
  const detailRows = dependencies.getIncidentDetailRows(communities, reportsSummary);
  if (!detailRows.length) return [];
  const datedRows = detailRows
    .map((row) => ({ row, date: toDate(firstPresent(row, ["incident_date", "received_at", "event_date", "date"])) }))
    .filter((entry) => entry.date);
  const latestDate = datedRows.reduce((latest, entry) => !latest || entry.date > latest ? entry.date : latest, null);
  const groups = new Map();
  for (const { row, date } of datedRows) {
    const resident = firstPresent(row, ["resident_name", "client_name", "resident_id", "res_number"]) ?? "Unknown resident";
    const facilityId = String(firstPresent(row, ["facility_id", "facility", "Facility"]) ?? "");
    const key = `${facilityId}|${resident}`;
    const current = groups.get(key) ?? {
      facility_id: facilityId,
      facility_name: getCommunityName(row, dependencies, communities),
      resident_name: resident,
      unit_number: firstPresent(row, ["unit_number", "unit"]),
      incident_count_all_time: 0,
      incident_count_30d: 0,
      incident_count_90d: 0,
      last_incident_date: null,
      last_incident_category: null
    };
    current.incident_count_all_time += 1;
    if (latestDate) {
      const ageDays = (latestDate.getTime() - date.getTime()) / 86400000;
      if (ageDays <= 30) current.incident_count_30d += 1;
      if (ageDays <= 90) current.incident_count_90d += 1;
    }
    const previousIncidentDate = toDate(current.last_incident_date);
    if (!previousIncidentDate || date > previousIncidentDate) {
      current.last_incident_date = date.toISOString();
      current.last_incident_category = firstPresent(row, ["category", "incident_category", "incident_type"]);
    }
    groups.set(key, current);
  }
  return [...groups.values()];
}

function getDimensionValue(row, dimension, slice, dependencies, communities) {
  if (dimension === "month") return dependencies.formatMonthLabel(getRowMonth(row, slice));
  if (dimension === "community") return getCommunityName(row, dependencies, communities);
  if (dimension === "category") return firstPresent(row, ["category", "incident_category", "Incident_Category", "incident_type"]) ?? "Uncategorized";
  if (dimension === "resident") return firstPresent(row, ["resident_name", "client_name", "resident_id", "res_number"]) ?? "Unknown resident";
  if (dimension === "type") return firstPresent(row, ["incident_type", "category", "administration_outcome"]) ?? "Unspecified";
  if (dimension === "date") return dependencies.formatDateLabel(firstPresent(row, [slice.dateField, "incident_date", "administration_date", "scheduled_date", "date"]));
  if (dimension === "week") return dependencies.formatDateLabel(firstPresent(row, ["week_start", "week_start_date", slice.dateField]));
  if (dimension === "medication") return firstPresent(row, ["medication", "medication_name"]) ?? "Unspecified medication";
  if (dimension === "outcome") return firstPresent(row, ["outcome_category", "administration_outcome", "not_given_reason"]) ?? "Unspecified";
  if (dimension === "diagnosis") return firstPresent(row, ["primary_diagnosis", "diagnosis"]) ?? "Unspecified";
  if (dimension === "service") return firstPresent(row, ["service_type", "service", "description"]) ?? "Unspecified service";
  if (dimension === "assessment") return firstPresent(row, ["assessment_type", "assessment"]) ?? "Unspecified assessment";
  if (dimension === "note_type") return firstPresent(row, ["note_type", "type", "category"]) ?? "Unspecified note";
  if (dimension === "movement") return firstPresent(row, ["episode_status", "movement_type", "status"]) ?? "Movement";
  if (dimension === "unit") return firstPresent(row, ["unit_number", "unit", "room"]) ?? "Unspecified unit";
  if (dimension === "reason") return firstPresent(row, ["resident_exclusion_reason", "exclusion_reason", "reason"]) ?? "Unspecified reason";
  return firstPresent(row, [dimension]) ?? "Unspecified";
}

function buildRowsForSlice(slice, communities, reportsSummary, dependencies) {
  if (slice.id === "community_operating_summary") {
    return reportsSummary.toolContext?.communityOperatingSummary ??
      reportsSummary.toolContext?.tables?.community_operating_summary ??
      [];
  }
  if (slice.id === "incident_detail_history") return dependencies.getIncidentDetailRows(communities, reportsSummary);
  if (slice.id === "incident_monthly_by_community_category") return dependencies.getIncidentRows(communities, reportsSummary);
  if (slice.id === "resident_incident_summary") return buildResidentIncidentSummaryRows(communities, reportsSummary, dependencies);
  if (slice.id === "census_monthly_by_community") return communities.census ?? [];
  if (slice.id === "census_weekly_by_community") {
    return reportsSummary.toolContext?.tables?.census_weekly_by_community ??
      reportsSummary.toolContext?.censusWeeklyByCommunity ??
      reportsSummary.censusWeeklyByCommunity ??
      [];
  }
  if (slice.id === "census_data_quality") {
    return reportsSummary.toolContext?.tables?.census_data_quality ??
      reportsSummary.toolContext?.censusDataQuality ??
      reportsSummary.censusDataQuality ??
      [];
  }
  if (slice.id === "resident_countability_audit") {
    return reportsSummary.toolContext?.tables?.resident_countability_audit ??
      reportsSummary.toolContext?.residentCountabilityAudit ??
      reportsSummary.residentCountabilityAudit ??
      [];
  }
  if (slice.id === "medication_compliance_monthly") return dependencies.getMedicationComplianceRows(reportsSummary);
  if (slice.id === "medication_refusal_summary") return dependencies.getMedicationRefusalRows(reportsSummary);
  if (slice.id === "mar_exception_detail_90d") return dependencies.getMarExceptionDetailRows(reportsSummary);
  if (slice.id === "mar_prn_effectiveness_90d") return dependencies.getMarPrnEffectivenessRows(reportsSummary);
  if (slice.id === "mar_medication_orders_current") return dependencies.getMarMedicationOrderRows(reportsSummary);
  if (slice.id === "mar_resident_summary") {
    const rows = dependencies.getMarResidentSummaryRows(reportsSummary);
    return rows.length ? rows : dependencies.getResidentRows(communities, reportsSummary);
  }
  if (slice.id === "resident_profile_enriched") return dependencies.getResidentRows(communities, reportsSummary);
  if (slice.id === "documentation_status") return dependencies.getDocumentationRows(reportsSummary);
  if (slice.id === "resident_episode_history") {
    return reportsSummary.toolContext?.tables?.resident_episode_history ??
      reportsSummary.toolContext?.residentEpisodeHistory ??
      reportsSummary.residentEpisodeHistory ??
      [];
  }
  if (slice.id === "resident_flow_weekly_by_community") {
    return reportsSummary.toolContext?.tables?.resident_flow_weekly_by_community ??
      reportsSummary.toolContext?.residentFlowWeeklyByCommunity ??
      reportsSummary.residentFlowWeeklyByCommunity ??
      [];
  }
  if (slice.id === "resident_flow_monthly_by_community") {
    return reportsSummary.toolContext?.tables?.resident_flow_monthly_by_community ??
      reportsSummary.toolContext?.residentFlowMonthlyByCommunity ??
      reportsSummary.residentFlowMonthlyByCommunity ??
      [];
  }
  if (slice.id === "resident_unit_history") {
    return reportsSummary.toolContext?.tables?.resident_unit_history ??
      reportsSummary.toolContext?.residentUnitHistory ??
      reportsSummary.residentUnitHistory ??
      [];
  }
  if (slice.id === "services_provided") {
    return reportsSummary.toolContext?.tables?.services_provided ??
      reportsSummary.toolContext?.servicesProvided ??
      reportsSummary.servicesProvided ??
      [];
  }
  if (slice.id === "assessment_summary") {
    return reportsSummary.toolContext?.tables?.assessment_summary ??
      reportsSummary.toolContext?.assessmentSummary ??
      reportsSummary.assessmentSummary ??
      [];
  }
  if (slice.id === "notes_summary") {
    return reportsSummary.toolContext?.tables?.notes_summary ??
      reportsSummary.toolContext?.notesSummary ??
      reportsSummary.notesSummary ??
      [];
  }
  return [];
}

const PUBLISHED_SOURCE_KEYS = Object.freeze({
  census_weekly_by_community: Object.freeze(["census_weekly_by_community", "censusWeeklyByCommunity"]),
  census_data_quality: Object.freeze(["census_data_quality", "censusDataQuality"]),
  resident_countability_audit: Object.freeze(["resident_countability_audit", "residentCountabilityAudit"]),
  resident_flow_monthly_by_community: Object.freeze(["resident_flow_monthly_by_community", "residentFlowMonthlyByCommunity"]),
  resident_flow_weekly_by_community: Object.freeze(["resident_flow_weekly_by_community", "residentFlowWeeklyByCommunity"]),
  resident_episode_history: Object.freeze(["resident_episode_history", "residentEpisodeHistory"]),
  resident_unit_history: Object.freeze(["resident_unit_history", "residentUnitHistory"]),
  services_provided: Object.freeze(["services_provided", "servicesProvided"]),
  assessment_summary: Object.freeze(["assessment_summary", "assessmentSummary"]),
  notes_summary: Object.freeze(["notes_summary", "notesSummary"])
});

function hasPublishedSliceSource(slice, reportsSummary) {
  if (!String(slice.source ?? "").startsWith("tool_context.")) return true;
  const keys = PUBLISHED_SOURCE_KEYS[slice.id] ?? [];
  if (!keys.length) return true;
  const tables = reportsSummary.toolContext?.tables ?? {};
  const toolContext = reportsSummary.toolContext ?? {};
  return keys.some((key) => Object.hasOwn(tables, key) || Object.hasOwn(toolContext, key) || Object.hasOwn(reportsSummary, key));
}

function filterByMedicationExceptionIntent(rows, content) {
  const text = normalize(content);
  if (/\bprn\b/.test(text)) return rows.filter((row) => row.is_prn);
  if (/\b(refusal|refusals|refused)\b/.test(text)) {
    return rows.filter((row) => row.is_refusal || /refus/i.test(String(row.outcome_category ?? row.administration_outcome ?? row.not_given_reason ?? "")));
  }
  if (/\blate\b/.test(text)) return rows.filter((row) => row.is_over_60_minutes_late || Number(row.minutes_late || 0) > 0);
  if (/\bheld|hold\b/.test(text)) return rows.filter((row) => row.is_on_hold || /hold|held/i.test(String(row.outcome_category ?? row.not_given_reason ?? "")));
  if (/\bnot given|missed\b/.test(text)) return rows.filter((row) => /not given|missed/i.test(String(row.outcome_category ?? row.administration_outcome ?? "")));
  return rows;
}

function isNonCountableAuditIntent(content) {
  return /\b(fake|test|dummy|sample|training|demo|placeholder|excluded|exclude|non[\s-]?countable|not countable|bad census|counting fake|fake patient|fake patients)\b/i.test(normalize(content));
}

function filterByCountabilityIntent(rows, content) {
  if (!isNonCountableAuditIntent(content)) return rows;
  return rows.filter((row) => {
    const countable = String(firstPresent(row, ["is_countable_resident"]) ?? "1").trim();
    const suspect = String(firstPresent(row, ["is_suspect_test_resident"]) ?? "0").trim();
    const reason = String(firstPresent(row, ["resident_exclusion_reason", "exclusion_reason", "reason"]) ?? "").trim();
    return countable === "0" || suspect === "1" || Boolean(reason);
  });
}

function getAvailableMonths(rows, slice) {
  if (!slice.periodField) return [];
  return [...new Set(rows.map((row) => getRowMonth(row, slice)).filter(Boolean))].sort();
}

function filterRows(content, rows, slice, communities, dependencies) {
  const facility = dependencies.findFacility(content, communities);
  let scoped = dependencies.filterByFacility(rows, facility);
  const availableMonths = getAvailableMonths(scoped, slice);
  const requestedMonths = slice.periodField ? dependencies.getRequestedMonthBuckets(content, availableMonths) : [];
  const missingMonths = requestedMonths.filter((month) => !availableMonths.includes(month));
  if (requestedMonths.length && !missingMonths.length) {
    scoped = scoped.filter((row) => requestedMonths.includes(getRowMonth(row, slice)));
  }
  if (slice.domain === "incidents") {
    const categoryFilter = dependencies.getIncidentCategoryFilter(content, scoped);
    scoped = dependencies.filterIncidentsByCategory(scoped, categoryFilter);
  }
  if (["mar_exception_detail_90d", "mar_prn_effectiveness_90d"].includes(slice.id)) scoped = filterByMedicationExceptionIntent(scoped, content);
  if (slice.id === "resident_countability_audit") scoped = filterByCountabilityIntent(scoped, content);
  return {
    facility,
    rows: scoped,
    availableMonths,
    requestedMonths,
    missingMonths
  };
}

function getValue(row, slice) {
  if (!slice.valueField) return 1;
  if (slice.id === "medication_compliance_monthly") {
    return Number(firstPresent(row, ["compliance_pct", "compliance"]) ?? 0);
  }
  if (slice.id === "community_operating_summary") return Number(firstPresent(row, ["incidents", "incident_count"]) ?? 0);
  if (slice.id === "resident_incident_summary") return Number(firstPresent(row, ["incident_count_90d", "incidents_90d", "incident_count_all_time", "incidents"]) ?? 0);
  if (slice.id === "mar_resident_summary") return Number(firstPresent(row, ["refusals_30d", "mar_refusals_30d", "not_given_30d", "mar_not_given_30d"]) ?? 0);
  if (slice.id === "documentation_status") return Number(firstPresent(row, ["days_since_last_note"]) ?? 0);
  if (slice.id === "census_weekly_by_community") return Number(firstPresent(row, ["census"]) ?? 0);
  if (slice.id === "census_data_quality") return Number(firstPresent(row, ["excluded_or_non_countable_rows", "suspected_test_rows", "monthly_census_minus_active_roster"]) ?? 0);
  if (slice.id === "resident_flow_weekly_by_community" || slice.id === "resident_flow_monthly_by_community") return Number(firstPresent(row, ["net_change", "admissions", "discharges"]) ?? 0);
  return Number(row[slice.valueField] ?? 0);
}

function aggregateRows(rows, slice, groups, dependencies, communities) {
  const grouped = new Map();
  for (const row of rows) {
    const cells = groups.map((group) => getDimensionValue(row, group, slice, dependencies, communities));
    const key = cells.join(" · ") || "Total";
    const current = grouped.get(key) ?? { cells, value: 0, weightedGiven: 0, weightedScheduled: 0 };
    if (slice.id === "medication_compliance_monthly") {
      const scheduled = Number(firstPresent(row, ["total_scheduled", "scheduled_count"]) || 0);
      const given = Number(firstPresent(row, ["given", "total_given", "given_count"]) || 0);
      current.weightedScheduled += scheduled;
      current.weightedGiven += given;
      current.value = current.weightedScheduled > 0 ? (current.weightedGiven / current.weightedScheduled) * 100 : getValue(row, slice);
    } else {
      current.value += getValue(row, slice);
    }
    grouped.set(key, current);
  }
  const aggregated = [...grouped.entries()]
    .map(([label, row]) => ({
      label,
      value: row.value,
      cells: [...row.cells, slice.id === "medication_compliance_monthly" ? `${defaultFormatValue(row.value, 1)}%` : defaultFormatValue(row.value)]
    }));

  return sortAggregatedRows(aggregated, slice, groups);
}

function parseGroupedPeriodCell(value, group) {
  if (group === "month") return Date.parse(`1 ${value}`);
  if (group === "week") return Date.parse(value);
  return NaN;
}

function sortAggregatedRows(rows, slice, groups) {
  const periodGroup = groups.find((group) => group === "month" || group === "week");
  const periodIndex = periodGroup ? groups.indexOf(periodGroup) : -1;
  const communityIndex = groups.indexOf("community");
  const shouldSortByPeriod =
    (slice.id === "census_monthly_by_community" || slice.id === "census_weekly_by_community") &&
    periodIndex >= 0;

  if (!shouldSortByPeriod) {
    return rows.sort((left, right) => Number(right.value || 0) - Number(left.value || 0));
  }

  return rows.sort((left, right) => {
    const leftTime = parseGroupedPeriodCell(left.cells?.[periodIndex], periodGroup);
    const rightTime = parseGroupedPeriodCell(right.cells?.[periodIndex], periodGroup);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
    if (communityIndex >= 0) {
      const communityComparison = String(left.cells?.[communityIndex] ?? "").localeCompare(String(right.cells?.[communityIndex] ?? ""));
      if (communityComparison !== 0) return communityComparison;
    }
    return String(left.label ?? "").localeCompare(String(right.label ?? ""));
  });
}

function preserveSnapshotPeriodGrouping(slice, groups, filtered) {
  if (slice.id === "census_monthly_by_community" && filtered.requestedMonths.length > 1) {
    return groups.includes("month") ? groups : ["month", ...groups];
  }
  if (slice.id === "census_weekly_by_community" && groups.includes("community")) {
    return ["week", ...groups.filter((group) => group !== "week")];
  }
  return groups;
}

function buildSliceSummary(slice, rows, groups) {
  if (!rows.length) return "No records matched this slice.";
  if ((slice.id === "census_monthly_by_community" || slice.id === "census_weekly_by_community") && groups.some((group) => group === "month" || group === "week")) {
    const unit = groups.includes("week") ? "Weekly" : "Monthly";
    return `${unit} census values are shown as point-in-time counts.`;
  }
  return `Top result: ${rows[0].label} at ${rows[0].cells.at(-1)}.`;
}

function detailCells(row, slice, dependencies, communities) {
  if (slice.id === "community_operating_summary") {
    return [
      getCommunityName(row, dependencies, communities),
      dependencies.formatMonthLabel(firstPresent(row, ["month_bucket", "census_month", "incident_month", "medication_month"])),
      firstPresent(row, ["resident_rows", "residents"]) ?? "—",
      firstPresent(row, ["census"]) ?? "—",
      firstPresent(row, ["census_delta"]) ?? "—",
      firstPresent(row, ["incidents", "incident_count"]) ?? "—",
      firstPresent(row, ["incidents_per_100_residents", "incidents_per_100"]) ?? "—",
      firstPresent(row, ["compliance_pct"]) ?? "—"
    ];
  }
  if (slice.id === "incident_detail_history") {
    return [
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["resident_name", "resident_id"]) ?? "Unknown resident",
      dependencies.formatDateLabel(firstPresent(row, ["incident_date", "date"])),
      firstPresent(row, ["category", "incident_type"]) ?? "Uncategorized",
      firstPresent(row, ["description", "email_body", "narrative"]) ?? "—"
    ];
  }
  if (["mar_exception_detail_90d", "mar_prn_effectiveness_90d"].includes(slice.id)) {
    return [
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["resident_name", "resident_id"]) ?? "Unknown resident",
      dependencies.formatDateLabel(firstPresent(row, ["administration_date", "scheduled_date"])),
      firstPresent(row, ["medication", "medication_name"]) ?? "Unspecified medication",
      firstPresent(row, ["outcome_category", "administration_outcome", "not_given_reason"]) ?? "—",
      firstPresent(row, ["not_given_reason", "missed_or_held_reason", "prn_result", "prn_reason", "administration_note"]) ?? "—"
    ];
  }
  if (slice.id === "mar_medication_orders_current") {
    return [
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["resident_name", "resident_id"]) ?? "Unknown resident",
      firstPresent(row, ["medication", "medication_name"]) ?? "Unspecified medication",
      firstPresent(row, ["dosage"]) ?? "—",
      firstPresent(row, ["route"]) ?? "—",
      firstPresent(row, ["schedule", "passing_times"]) ?? "—",
      firstPresent(row, ["indication"]) ?? "—",
      firstPresent(row, ["is_prn"]) ? "Yes" : "No",
      firstPresent(row, ["is_psychotropic"]) ? "Yes" : "No",
      firstPresent(row, ["is_narcotic"]) ? "Yes" : "No"
    ];
  }
  if (slice.id === "resident_incident_summary") {
    return [
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["resident_name", "client_name", "resident_id", "res_number"]) ?? "Unknown resident",
      firstPresent(row, ["unit_number", "unit"]) ?? "—",
      firstPresent(row, ["incident_count_all_time", "incidents_all_time"]) ?? 0,
      firstPresent(row, ["incident_count_30d", "incidents_30d"]) ?? 0,
      firstPresent(row, ["incident_count_90d", "incidents_90d"]) ?? 0,
      dependencies.formatDateLabel(firstPresent(row, ["last_incident_date"])),
      firstPresent(row, ["last_incident_category", "category"]) ?? "—"
    ];
  }
  if (slice.id === "mar_resident_summary") {
    return [
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["resident_name", "client_name", "resident_id", "res_number"]) ?? "Unknown resident",
      firstPresent(row, ["active_medication_count"]) ?? 0,
      firstPresent(row, ["active_psychotropic_count"]) ?? 0,
      firstPresent(row, ["refusals_7d", "mar_refusals_7d"]) ?? 0,
      firstPresent(row, ["refusals_30d", "mar_refusals_30d"]) ?? 0,
      firstPresent(row, ["compliance_pct_30d", "mar_compliance_pct_30d"]) ?? "—",
      dependencies.formatDateLabel(firstPresent(row, ["last_recorded_date"]))
    ];
  }
  if (slice.id === "documentation_status") {
    return [
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["resident_name", "client_name", "resident_id", "res_number"]) ?? "Unknown resident",
      dependencies.formatDateLabel(firstPresent(row, ["last_note_date"])),
      firstPresent(row, ["days_since_last_note"]) ?? "—"
    ];
  }
  if (slice.id === "resident_episode_history") {
    return [
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["resident_name", "resident_id"]) ?? "Unknown resident",
      dependencies.formatDateLabel(firstPresent(row, ["admit_date"])),
      dependencies.formatDateLabel(firstPresent(row, ["discharge_date"])),
      firstPresent(row, ["episode_status"]) ?? "—",
      firstPresent(row, ["discharge_reason", "discharge_destination"]) ?? "—"
    ];
  }
  if (slice.id === "census_weekly_by_community") {
    return [
      dependencies.formatDateLabel(firstPresent(row, ["week_start"])),
      dependencies.formatDateLabel(firstPresent(row, ["week_end"])),
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["census"]) ?? 0
    ];
  }
  if (slice.id === "census_data_quality") {
    return [
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["latest_census_month"]) ?? "—",
      firstPresent(row, ["latest_monthly_census"]) ?? 0,
      firstPresent(row, ["active_roster_residents"]) ?? 0,
      firstPresent(row, ["monthly_census_minus_active_roster"]) ?? 0,
      firstPresent(row, ["excluded_or_non_countable_rows"]) ?? 0,
      firstPresent(row, ["suspected_test_rows"]) ?? 0
    ];
  }
  if (slice.id === "resident_countability_audit") {
    return [
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["resident_name", "resident_id"]) ?? "Unknown resident",
      firstPresent(row, ["resident_id", "res_number", "Res_Number"]) ?? "—",
      dependencies.formatDateLabel(firstPresent(row, ["admit_date"])),
      dependencies.formatDateLabel(firstPresent(row, ["discharge_date"])),
      firstPresent(row, ["resident_exclusion_reason"]) ?? "—"
    ];
  }
  if (slice.id === "resident_flow_weekly_by_community") {
    return [
      dependencies.formatDateLabel(firstPresent(row, ["week_start"])),
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["admissions"]) ?? 0,
      firstPresent(row, ["discharges"]) ?? 0,
      firstPresent(row, ["net_change"]) ?? 0
    ];
  }
  if (slice.id === "resident_flow_monthly_by_community") {
    return [
      firstPresent(row, ["month_bucket"]) ?? "—",
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["admissions"]) ?? 0,
      firstPresent(row, ["discharges"]) ?? 0,
      firstPresent(row, ["net_change"]) ?? 0
    ];
  }
  if (slice.id === "resident_unit_history") {
    return [
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["resident_name", "resident_id"]) ?? "Unknown resident",
      firstPresent(row, ["unit_number", "unit"]) ?? "—",
      dependencies.formatDateLabel(firstPresent(row, ["start_date"])),
      dependencies.formatDateLabel(firstPresent(row, ["end_date"]))
    ];
  }
  if (slice.id === "services_provided") {
    return [
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["resident_name", "resident_id"]) ?? "Unknown resident",
      dependencies.formatDateLabel(firstPresent(row, ["service_date"])),
      firstPresent(row, ["service_type"]) ?? "Unspecified service",
      firstPresent(row, ["service_status"]) ?? "—",
      firstPresent(row, ["service_units"]) ?? "—"
    ];
  }
  if (slice.id === "assessment_summary") {
    return [
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["resident_name", "resident_id"]) ?? "Unknown resident",
      dependencies.formatDateLabel(firstPresent(row, ["assessment_date"])),
      firstPresent(row, ["assessment_type"]) ?? "Unspecified assessment",
      firstPresent(row, ["assessment_status"]) ?? "—",
      firstPresent(row, ["assessment_score"]) ?? "—"
    ];
  }
  if (slice.id === "notes_summary") {
    return [
      getCommunityName(row, dependencies, communities),
      firstPresent(row, ["resident_name", "resident_id"]) ?? "Unknown resident",
      dependencies.formatDateLabel(firstPresent(row, ["note_date"])),
      firstPresent(row, ["note_type"]) ?? "Unspecified note",
      firstPresent(row, ["note_text"]) ?? "—",
      dependencies.formatDateLabel(firstPresent(row, ["action_required_by_date"]))
    ];
  }
  return [
    getCommunityName(row, dependencies, communities),
    firstPresent(row, ["resident_name", "first_name", "res_number"]) ?? "Unknown resident",
    firstPresent(row, ["unit_number", "unit"]) ?? "—",
    firstPresent(row, ["age"]) ?? "—",
    dependencies.formatDateLabel(firstPresent(row, ["admit_date"])),
    firstPresent(row, ["primary_diagnosis", "diagnosis"]) ?? "—"
  ];
}

function detailColumns(slice) {
  if (slice.id === "community_operating_summary") return ["Community", "Month", "Residents", "Census", "Census delta", "Incidents", "Incidents / 100", "Compliance %"];
  if (slice.id === "incident_detail_history") return ["Community", "Resident", "Date", "Category", "Description"];
  if (slice.id === "mar_exception_detail_90d") return ["Community", "Resident", "Date", "Medication", "Outcome", "Reason / note"];
  if (slice.id === "mar_prn_effectiveness_90d") return ["Community", "Resident", "Date", "Medication", "Outcome", "Reason / result"];
  if (slice.id === "mar_medication_orders_current") return ["Community", "Resident", "Medication", "Dose", "Route", "Schedule", "Indication", "PRN", "Psychotropic", "Narcotic"];
  if (slice.id === "resident_incident_summary") return ["Community", "Resident", "Unit", "All-time", "30 days", "90 days", "Last incident", "Last category"];
  if (slice.id === "mar_resident_summary") return ["Community", "Resident", "Active meds", "Psychotropics", "Refusals 7d", "Refusals 30d", "Compliance 30d", "Last MAR date"];
  if (slice.id === "documentation_status") return ["Community", "Resident", "Last note", "Days since note"];
  if (slice.id === "resident_episode_history") return ["Community", "Resident", "Admitted", "Discharged", "Status", "Outcome"];
  if (slice.id === "census_weekly_by_community") return ["Week start", "Week end", "Community", "Census"];
  if (slice.id === "census_data_quality") return ["Community", "Latest month", "Monthly census", "Active roster", "Difference", "Excluded rows", "Suspected test rows"];
  if (slice.id === "resident_countability_audit") return ["Community", "Resident", "Resident #", "Admitted", "Discharged", "Reason"];
  if (slice.id === "resident_flow_weekly_by_community") return ["Week", "Community", "Admissions", "Discharges", "Net"];
  if (slice.id === "resident_flow_monthly_by_community") return ["Month", "Community", "Admissions", "Discharges", "Net"];
  if (slice.id === "resident_unit_history") return ["Community", "Resident", "Unit", "Start", "End"];
  if (slice.id === "services_provided") return ["Community", "Resident", "Date", "Service", "Status", "Units"];
  if (slice.id === "assessment_summary") return ["Community", "Resident", "Date", "Assessment", "Status", "Score"];
  if (slice.id === "notes_summary") return ["Community", "Resident", "Date", "Note type", "Note", "Action due"];
  return ["Community", "Resident", "Unit", "Age", "Admitted", "Diagnosis"];
}

export function createSliceDiscoveryTools(dependencies) {
  function buildSliceDiscoveryTool(content, communities, reportsSummary) {
    const selected = selectSlice(content);
    if (!selected) {
      return {
        handled: true,
        tool: "slice_discovery",
        text: "I could not map that request to a loaded data slice. Try asking for incidents, census, residents, medication compliance, refusals, or MAR exceptions.",
        truthState: "not_loaded",
        trace: dependencies.makeTrace({
          tool: "slice_discovery",
          dataSource: "analysis slice catalog",
          rowCount: 0,
          note: "no slice match",
          truthState: "not_loaded"
        }),
        actions: [{ label: "Show available analytical slices", kind: "tool", tool: "tool_context_catalog", prompt: "show available analytical slices" }]
      };
    }

    const slice = getAnalysisSlice(selected.slice.id);
    if (!slice) {
      return {
        handled: true,
        tool: "slice_discovery",
        safeRefusal: true,
        truthState: "not_loaded",
        text: "That analytical slice is no longer registered. Reload the app and choose another question.",
        trace: dependencies.makeTrace({
          tool: "slice_discovery",
          dataSource: "analysis slice catalog",
          rowCount: 0,
          note: `missing registered slice=${selected.slice.id}`,
          truthState: "not_loaded"
        }),
        actions: []
      };
    }
    const sourceRows = buildRowsForSlice(slice, communities, reportsSummary, dependencies);
    if (!sourceRows.length && !hasPublishedSliceSource(slice, reportsSummary)) {
      return {
        handled: true,
        tool: "slice_discovery",
        safeRefusal: true,
        truthState: "not_loaded",
        text: [
          `${slice.title} is not in the active snapshot yet.`,
          "Run tool_context_views, analyst_context_qa, and snapshot_publish, then reload the app."
        ].join("\n"),
        trace: dependencies.makeTrace({
          tool: "slice_discovery",
          dataSource: slice.title,
          rowCount: 0,
          note: `slice=${slice.id}; source not published in active snapshot`,
          truthState: "not_loaded"
        }),
        actions: [{ label: "Show available analytical slices", kind: "tool", tool: "tool_context_catalog", prompt: "show available analytical slices" }]
      };
    }
    const filtered = filterRows(content, sourceRows, slice, communities, dependencies);
    const label = filtered.facility?.community_name ?? "Portfolio";
    if (filtered.missingMonths.length) {
      return dependencies.buildUnavailablePeriodResult({
        tool: "slice_discovery",
        label,
        subject: slice.title.toLowerCase(),
        dataSource: slice.title,
        availableMonths: filtered.availableMonths,
        missingMonths: filtered.missingMonths,
        requestedMonths: filtered.requestedMonths,
        fallbackScopes: dependencies.getPortfolioFallbackScopes(filtered.facility, sourceRows),
        facility: filtered.facility,
        note: `slice=${slice.id}; confidence=${selected.confidence}`
      });
    }

    const mode = parseMode(content);
    const detailMode = mode === "detail" && slice.modes.includes("detail") && !slice.valueField;
    const groups = preserveSnapshotPeriodGrouping(slice, parseGrouping(content, slice), filtered);
    const periodLabel = filtered.requestedMonths.length
      ? filtered.requestedMonths.map(dependencies.formatMonthLabel).join(" to ")
      : filtered.availableMonths.at(-1)
        ? dependencies.formatMonthLabel(filtered.availableMonths.at(-1))
        : "loaded data";
    const rows = detailMode
      ? filtered.rows.slice(0, dependencies.wantsAllRows(content) ? 250 : 25).map((row, index) => ({
          label: String(detailCells(row, slice, dependencies, communities)[1] ?? `Record ${index + 1}`),
          value: 0,
          cells: detailCells(row, slice, dependencies, communities)
        }))
      : aggregateRows(filtered.rows, slice, groups, dependencies, communities).slice(0, dependencies.wantsAllRows(content) ? 250 : 25);
    const columns = detailMode ? detailColumns(slice) : [...groups.map((group) => group[0].toUpperCase() + group.slice(1)), slice.id === "medication_compliance_monthly" ? "Compliance %" : slice.defaultMeasure.replace(/_/g, " ")];
    const title = `${label} ${slice.title}`;
    const summary = buildSliceSummary(slice, rows, groups);
    const rowSetId = detailMode && filtered.rows.length ? dependencies.fingerprintRows(filtered.rows) : null;
    const artifactFilename = `${slice.id}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "portfolio"}.csv`;

    return {
      handled: true,
      tool: "slice_discovery",
      text: [
        `${title}`,
        summary,
        `Slice: ${slice.grain}; ${filtered.rows.length.toLocaleString("en-US")} source records checked${filtered.requestedMonths.length ? ` for ${periodLabel}` : ""}.`
      ].join("\n"),
      trace: dependencies.makeTrace({
        tool: "slice_discovery",
        dataSource: slice.title,
        rowCount: filtered.rows.length,
        facility: filtered.facility,
        period: filtered.requestedMonths.join(", ") || null,
        note: `slice=${slice.id}; confidence=${selected.confidence}; grouping=${groups.join("+") || "none"}`
      }),
      visual: dependencies.makePreviewTableVisual({
        title,
        subtitle: `${periodLabel} · ${slice.grain}`,
        columns,
        rows,
        valueLabel: detailMode ? "Records" : columns.at(-1),
        totalRows: detailMode ? filtered.rows.length : rows.length
      }),
      artifact: rowSetId ? {
        type: "csv",
        filename: artifactFilename,
        mimeType: "text/csv",
        content: dependencies.rowsToCsv(filtered.rows),
        rowSetId,
        rowCount: filtered.rows.length
      } : undefined,
      provenance: rowSetId ? {
        rowSetId,
        rowCount: filtered.rows.length,
        dataset: slice.source,
        tool: "slice_discovery"
      } : undefined,
      actions: [{ label: "Show available analytical slices", kind: "tool", tool: "tool_context_catalog", prompt: "show available analytical slices" }]
    };
  }

  return {
    buildSliceDiscoveryTool
  };
}
