import { createHash } from "node:crypto";
import {
  getCommunitiesDashboardData,
  getCommunitySnapshotData,
  getHomeDashboardData,
  getReportsSummaryData
} from "./platform-data.mjs";
import {
  getFullReportDefinition,
  normalizeFullReportRequest,
  renderFullReportHtml,
  validateFullReportDocument,
  FULL_REPORT_DEFINITIONS,
  FULL_REPORT_VERSION
} from "../shared/full-report.mjs";
import { ALAMO_FACILITIES } from "../shared/community-names.mjs";
import { formatDisplayDate, formatDisplayDateTime } from "../shared/display-date.mjs";
import { formatMonthLabel } from "../shared/period-utils.mjs";
import { getEffectivenessEvidencePlan } from "../shared/effectiveness-evidence.mjs";

const integerFormatter = new Intl.NumberFormat("en-US");
const decimalFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});
const OPERATIONAL_PLACEHOLDER_NAME =
  /\b(MHW|STAFF|TEST|DUMMY|SAMPLE|TRAINING|VACANT|VACANCY|PLACEHOLDER)\b/i;

function text(value) {
  return value == null ? "" : String(value).trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function integer(value) {
  return integerFormatter.format(Math.round(number(value)));
}

function percent(value) {
  return `${decimalFormatter.format(number(value))}%`;
}

function signed(value) {
  const amount = Math.round(number(value));
  return `${amount > 0 ? "+" : ""}${integer(amount)}`;
}

function capacityPercent(census, capacity) {
  return capacity > 0 ? number(census) / number(capacity) * 100 : null;
}

function capacityRowsForCensus(censusRows) {
  const censusByFacility = new Map(
    censusRows.map((row) => [text(row.facilityId), number(row.census)])
  );
  return ALAMO_FACILITIES
    .filter((facility) => censusByFacility.has(facility.facilityId))
    .map((facility) => {
      const census = censusByFacility.get(facility.facilityId);
      return {
        facilityId: facility.facilityId,
        community: facility.communityName,
        operatingSite: facility.operatingSiteName,
        census,
        operatingLimit: facility.operatingLimit,
        operationalUtilization: capacityPercent(census, facility.operatingLimit),
        licensedCapacity: facility.licensedCapacity,
        licensedUtilization: capacityPercent(census, facility.licensedCapacity),
        openToOperatingLimit: Math.max(0, facility.operatingLimit - census),
        capacityAsOf: facility.capacityAsOf
      };
    });
}

function capacityTotals(rows) {
  const totals = rows.reduce(
    (result, row) => ({
      census: result.census + number(row.census),
      operatingLimit: result.operatingLimit + number(row.operatingLimit),
      licensedCapacity: result.licensedCapacity + number(row.licensedCapacity)
    }),
    { census: 0, operatingLimit: 0, licensedCapacity: 0 }
  );
  return {
    ...totals,
    operationalUtilization: capacityPercent(totals.census, totals.operatingLimit),
    licensedUtilization: capacityPercent(totals.census, totals.licensedCapacity),
    openToOperatingLimit: Math.max(0, totals.operatingLimit - totals.census),
    openToLicensedCapacity: Math.max(0, totals.licensedCapacity - totals.census)
  };
}

function uniqueLatest(values) {
  return [...new Set(values.map(text).filter(Boolean))].sort().at(-1) ?? null;
}

function latestMonthRows(rows, requestedPeriod, key = "month_bucket") {
  const period = requestedPeriod ?? uniqueLatest(rows.map((row) => row?.[key]));
  return {
    period,
    rows: period ? rows.filter((row) => text(row?.[key]) === period) : []
  };
}

function incidentCommunitySummaries(rows, names) {
  const byFacility = new Map();
  for (const row of rows) {
    const facilityId = text(row.facility_id);
    if (!facilityId) continue;
    const category = text(row.category) || "Other";
    const current = byFacility.get(facilityId) ?? {
      facilityId,
      community: names.get(facilityId) ?? `Facility ${facilityId}`,
      incidents: 0,
      categories: new Map()
    };
    const count = number(row.incident_count);
    current.incidents += count;
    current.categories.set(category, (current.categories.get(category) ?? 0) + count);
    byFacility.set(facilityId, current);
  }

  return [...byFacility.values()]
    .map((row) => {
      const [largestCategory, largestCategoryCount] = [...row.categories.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] ?? [];
      return {
        facilityId: row.facilityId,
        community: row.community,
        incidents: row.incidents,
        largestCategory: largestCategory ?? "Not available",
        largestCategoryCount: largestCategoryCount ?? null
      };
    })
    .sort((left, right) => right.incidents - left.incidents || left.community.localeCompare(right.community));
}

function toolContextRows(summary, camelKey, tableKey) {
  return summary?.toolContext?.[camelKey] ??
    summary?.toolContext?.tables?.[tableKey] ??
    summary?.[camelKey] ??
    [];
}

function weightedCompliance(rows) {
  const scheduled = rows.reduce((total, row) => total + number(row.total_scheduled), 0);
  const given = rows.reduce((total, row) => total + number(row.given), 0);
  return {
    scheduled,
    given,
    notCompleted: Math.max(0, scheduled - given),
    percentage: scheduled > 0 ? given / scheduled * 100 : 0
  };
}

function refusalItemsForPeriod(summary, facilityId, period, limit = 12) {
  const monthlyRows = toolContextRows(
    summary,
    "marMonthlyByCommunityMedication",
    "mar_monthly_by_community_medication"
  ).filter(
    (row) =>
      (!facilityId || text(row.facility_id) === facilityId) &&
      (!period || text(row.month_bucket) === period)
  );

  if (monthlyRows.length) {
    const totals = new Map();
    monthlyRows.forEach((row) => {
      const label = text(row.medication_name) || "Unspecified medication";
      totals.set(label, (totals.get(label) ?? 0) + number(row.refusal_count));
    });
    return [...totals.entries()]
      .map(([label, value]) => ({ label, value, displayValue: integer(value) }))
      .filter((item) => item.value > 0)
      .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
      .slice(0, limit);
  }

  if (period) return [];
  return [...(summary.refusalByMedication ?? [])]
    .filter((row) => !facilityId || text(row.facility_id) === facilityId)
    .sort((left, right) => number(right.refusals) - number(left.refusals))
    .slice(0, limit)
    .map((row) => ({
      label: text(row.medication) || "Unspecified medication",
      value: number(row.refusals),
      displayValue: integer(row.refusals)
    }));
}

function facilityNameById(communities) {
  const names = new Map(
    ALAMO_FACILITIES.map((facility) => [facility.facilityId, facility.shortName])
  );
  for (const facility of communities.facilities ?? []) {
    const facilityId = text(facility.facility_id);
    if (!names.has(facilityId)) {
      names.set(
        facilityId,
        text(facility.community_name) || `Facility ${facility.facility_id}`
      );
    }
  }
  return names;
}

function facilityDisplayName(facilityId, fallback) {
  return ALAMO_FACILITIES.find((facility) => facility.facilityId === text(facilityId))
    ?.shortName || text(fallback) || `Facility ${facilityId}`;
}

function residentName(row) {
  return [text(row.first_name), text(row.last_name)].filter(Boolean).join(" ") ||
    (row.res_number ? `Resident ${row.res_number}` : "Resident");
}

function residentDisplayName(row) {
  return text(row?.resident_name) || text(row?.client_name) || residentName(row ?? {});
}

function isGovernedResidentRow(row) {
  return !OPERATIONAL_PLACEHOLDER_NAME.test(residentDisplayName(row));
}

function governedResidentRows(rows) {
  return (rows ?? []).filter(isGovernedResidentRow);
}

function average(values) {
  const finiteValues = values
    .filter((value) => value != null && text(value) !== "")
    .map(Number)
    .filter(Number.isFinite);
  return finiteValues.length
    ? finiteValues.reduce((total, value) => total + value, 0) / finiteValues.length
    : null;
}

function median(values) {
  const finiteValues = values
    .filter((value) => value != null && text(value) !== "")
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!finiteValues.length) return null;
  const middle = Math.floor(finiteValues.length / 2);
  return finiteValues.length % 2
    ? finiteValues[middle]
    : (finiteValues[middle - 1] + finiteValues[middle]) / 2;
}

function residentKey(row) {
  const facilityId = text(row?.facility_id);
  const residentId = text(row?.resident_id ?? row?.res_number);
  return facilityId && residentId ? `${facilityId}:${residentId}` : null;
}

function residentPopulationSummary(rows) {
  const residents = governedResidentRows(rows);
  const hasNumber = (value) => value != null && text(value) !== "" && Number.isFinite(Number(value));
  const hasNonNegativeNumber = (value) => hasNumber(value) && Number(value) >= 0;
  const completeStayData = residents.length > 0 && residents.every(
    (row) => hasNonNegativeNumber(row.los_days)
  );
  const completeAgeData = residents.length > 0 && residents.every(
    (row) => hasNonNegativeNumber(row.age)
  );
  const completeDiagnosisData = residents.length > 0 && residents.every(
    (row) => Boolean(text(row.primary_diagnosis))
  );
  const stayValues = completeStayData ? residents.map((row) => row.los_days) : [];
  const ageValues = completeAgeData ? residents.map((row) => row.age) : [];
  const overOneYear = residents.filter((row) => number(row.los_days) >= 365).length;
  const schizophreniaSpectrum = residents.filter((row) =>
    /schizophren|schizoaffective/i.test(text(row.primary_diagnosis))
  ).length;
  const diagnosisRecorded = residents.filter(
    (row) => Boolean(text(row.primary_diagnosis))
  ).length;
  return {
    residents,
    averageAge: average(ageValues),
    averageStay: average(stayValues),
    medianStay: median(stayValues),
    overOneYear,
    overOneYearPercentage: completeStayData ? overOneYear / residents.length * 100 : null,
    diagnosisRecorded,
    diagnosisRecordedPercentage: residents.length
      ? diagnosisRecorded / residents.length * 100
      : null,
    schizophreniaSpectrum,
    schizophreniaSpectrumPercentage: completeDiagnosisData
      ? schizophreniaSpectrum / residents.length * 100
      : null
  };
}

function residentPopulationItems(population, includeResidents = false) {
  return [
    ...(includeResidents ? [{
      label: "Current profile rows",
      value: integer(population.residents.length)
    }] : []),
    ...(population.averageAge == null ? [] : [{
      label: "Average age",
      value: `${decimalFormatter.format(population.averageAge)} years`
    }]),
    ...(population.averageStay == null ? [] : [{
      label: "Average stay",
      value: `${integer(population.averageStay)} days`
    }]),
    ...(population.medianStay == null ? [] : [{
      label: "Median stay",
      value: `${integer(population.medianStay)} days`
    }]),
    ...(population.overOneYearPercentage == null ? [] : [{
      label: "Stay over one year",
      value: percent(population.overOneYearPercentage)
    }]),
    ...(population.schizophreniaSpectrumPercentage == null ? [] : [{
      label: "Schizophrenia-spectrum",
      value: percent(population.schizophreniaSpectrumPercentage)
    }])
  ];
}

function lengthOfStayDistribution(population) {
  if (population.overOneYearPercentage == null || !population.residents.length) return [];
  const bands = [
    { label: "Under 90 days", minimum: 0, maximum: 89 },
    { label: "90 to 179 days", minimum: 90, maximum: 179 },
    { label: "180 to 364 days", minimum: 180, maximum: 364 },
    { label: "1 to 2 years", minimum: 365, maximum: 729 },
    { label: "2 years or longer", minimum: 730, maximum: Number.POSITIVE_INFINITY }
  ];
  return bands.map((band) => {
    const value = population.residents.filter((row) => {
      const days = number(row.los_days);
      return days >= band.minimum && days <= band.maximum;
    }).length;
    return {
      label: band.label,
      value,
      displayValue: `${integer(value)} (${percent(value / population.residents.length * 100)})`
    };
  });
}

function documentationRows(summary) {
  const fullRows = toolContextRows(summary, "documentationStatus", "documentation_status");
  return governedResidentRows(fullRows.length ? fullRows : summary.documentationGaps);
}

function documentationCoverage(residentRows, statusRows) {
  const residents = governedResidentRows(residentRows);
  if (!residents.length || !statusRows.length) return null;
  const uniqueResidentKeys = [...new Set(residents.map(residentKey).filter(Boolean))];
  const statusByResident = new Map(
    statusRows.map((row) => [residentKey(row), row]).filter(([key]) => Boolean(key))
  );
  if (!uniqueResidentKeys.length || uniqueResidentKeys.some((key) => !statusByResident.has(key))) {
    return null;
  }
  const matchedRows = uniqueResidentKeys.map((key) => statusByResident.get(key));
  const within7Days = matchedRows.filter(
    (row) => row.last_note_date && number(row.days_since_last_note) <= 7
  ).length;
  const within30Days = matchedRows.filter(
    (row) => row.last_note_date && number(row.days_since_last_note) <= 30
  ).length;
  return {
    residentCount: matchedRows.length,
    within7Days,
    within30Days,
    within7DaysPercentage: within7Days / matchedRows.length * 100,
    within30DaysPercentage: within30Days / matchedRows.length * 100
  };
}

function medicationBurden(summary, facilityId, residentRows) {
  const rows = governedResidentRows(
    toolContextRows(summary, "marResidentSummary", "mar_resident_summary")
  ).filter((row) => !facilityId || text(row.facility_id) === facilityId);
  if (!rows.length) return null;
  const expectedResidentKeys = [...new Set(
    governedResidentRows(residentRows).map(residentKey).filter(Boolean)
  )];
  const medicationResidentKeys = new Set(rows.map(residentKey).filter(Boolean));
  if (
    !expectedResidentKeys.length ||
    expectedResidentKeys.some((key) => !medicationResidentKeys.has(key))
  ) return null;
  const completeAverage = (key) => rows.every(
    (row) => row[key] != null && text(row[key]) !== "" && Number.isFinite(Number(row[key]))
  ) ? average(rows.map((row) => row[key])) : null;
  const completePrn = rows.every((row) =>
    ["prn_given_30d", "prn_followup_30d"].every(
      (key) => row[key] != null && text(row[key]) !== "" && Number.isFinite(Number(row[key]))
    )
  );
  const prnGiven = completePrn
    ? rows.reduce((total, row) => total + number(row.prn_given_30d), 0)
    : null;
  const prnFollowup = completePrn
    ? rows.reduce((total, row) => total + number(row.prn_followup_30d), 0)
    : null;
  const averageActiveMedications = completeAverage("active_medication_count");
  const averagePsychotropics = completeAverage("active_psychotropic_count");
  const averageResidentCompliance = completeAverage("compliance_pct_30d");
  const prnFollowupPercentage = prnGiven > 0 ? prnFollowup / prnGiven * 100 : null;
  if (
    averageActiveMedications == null &&
    averagePsychotropics == null &&
    averageResidentCompliance == null &&
    prnFollowupPercentage == null
  ) return null;
  return {
    rows,
    averageActiveMedications,
    averagePsychotropics,
    averageResidentCompliance,
    prnGiven,
    prnFollowup,
    prnFollowupPercentage
  };
}

function medicationBurdenItems(burden, includeResidents = false) {
  return [
    ...(includeResidents ? [{ label: "Residents", value: integer(burden.rows.length) }] : []),
    ...(burden.averageActiveMedications == null ? [] : [{
      label: "Average active medications",
      value: decimalFormatter.format(burden.averageActiveMedications)
    }]),
    ...(burden.averagePsychotropics == null ? [] : [{
      label: "Average psychotropics",
      value: decimalFormatter.format(burden.averagePsychotropics)
    }]),
    ...(burden.averageResidentCompliance == null ? [] : [{
      label: "Average resident compliance",
      value: percent(burden.averageResidentCompliance)
    }]),
    ...(burden.prnFollowupPercentage == null ? [] : [{
      label: "PRN follow-up within 30 days",
      value: percent(burden.prnFollowupPercentage)
    }])
  ];
}

function annualFlowRows(rows, requestedPeriod) {
  const totalsByYear = new Map();
  rows
    .filter((row) => !requestedPeriod || text(row.month_bucket) <= requestedPeriod)
    .forEach((row) => {
      const year = text(row.month_bucket).slice(0, 4);
      if (!/^\d{4}$/.test(year)) return;
      const current = totalsByYear.get(year) ?? {
        admissions: 0,
        discharges: 0,
        net: 0,
        facilityIds: new Set()
      };
      current.admissions += number(row.admissions);
      current.discharges += number(row.discharges);
      current.net += number(row.net_change);
      const facilityId = text(row.facility_id);
      if (facilityId) current.facilityIds.add(facilityId);
      totalsByYear.set(year, current);
    });
  const annualRows = [...totalsByYear.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([year, totals]) => ({
      year,
      admissions: totals.admissions,
      discharges: totals.discharges,
      net: totals.net,
      communities: totals.facilityIds.size
    }));
  let contiguousStart = annualRows.length - 1;
  while (
    contiguousStart > 0 &&
    Number(annualRows[contiguousStart]?.year) - Number(annualRows[contiguousStart - 1]?.year) === 1
  ) {
    contiguousStart -= 1;
  }
  return annualRows.slice(Math.max(0, contiguousStart));
}

function incidentSeverityForPeriod(detailRows, period, facilityId, expectedTotal) {
  const rows = (detailRows ?? []).filter(
    (row) =>
      (!period || text(row.month_bucket) === period) &&
      (!facilityId || text(row.facility_id) === facilityId)
  );
  const severityFields = ["injury_occurred", "police_called", "sentinel_event"];
  const complete = rows.length > 0 &&
    rows.length === expectedTotal &&
    rows.every((row) => severityFields.every((field) => Object.hasOwn(row, field)));
  if (!complete) return null;
  const count = (field) => rows.filter((row) => Boolean(row[field])).length;
  return {
    rows,
    injuries: count("injury_occurred"),
    policeCalled: count("police_called"),
    sentinelEvents: count("sentinel_event"),
    residents: new Set(rows.map(residentKey).filter(Boolean)).size
  };
}

function parseDate(value) {
  const date = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function reportAsOfTimestamp(requestedPeriod, home, communities, generatedAt) {
  if (requestedPeriod && /^\d{4}-\d{2}$/.test(requestedPeriod)) {
    const [year, month] = requestedPeriod.split("-").map(Number);
    return Date.UTC(year, month, 0);
  }
  return parseDate(
    home.operational?.latestCensusWeek ?? communities.as_of_date ?? generatedAt
  );
}

function internalReadmissionSummary(rows, facilityId, asOfTimestamp) {
  if (!rows.length || !Number.isFinite(asOfTimestamp)) return null;
  const episodesByResident = new Map();
  rows.forEach((row) => {
    const residentId = text(row.resident_id);
    const admitTimestamp = parseDate(row.admit_date);
    if (!residentId || admitTimestamp == null || admitTimestamp > asOfTimestamp) return;
    const episodes = episodesByResident.get(residentId) ?? [];
    episodes.push({ row, admitTimestamp, dischargeTimestamp: parseDate(row.discharge_date) });
    episodesByResident.set(residentId, episodes);
  });
  const windows = [30, 90, 180].map((days) => ({ days, eligible: 0, readmitted: 0 }));
  episodesByResident.forEach((episodes) => {
    episodes.sort((left, right) => left.admitTimestamp - right.admitTimestamp);
    episodes.forEach((episode, index) => {
      if (
        episode.dischargeTimestamp == null ||
        (facilityId && text(episode.row.facility_id) !== facilityId)
      ) return;
      const nextEpisode = episodes.slice(index + 1).find(
        (candidate) => candidate.admitTimestamp > episode.dischargeTimestamp
      );
      windows.forEach((window) => {
        const maturityTimestamp = episode.dischargeTimestamp + window.days * 24 * 60 * 60 * 1000;
        if (maturityTimestamp > asOfTimestamp) return;
        window.eligible += 1;
        if (
          nextEpisode &&
          nextEpisode.admitTimestamp <= maturityTimestamp
        ) window.readmitted += 1;
      });
    });
  });
  return windows.some((window) => window.eligible > 0)
    ? windows.map((window) => ({
        ...window,
        percentage: window.eligible ? window.readmitted / window.eligible * 100 : null
      }))
    : null;
}

function scheduledNotCompleted(row) {
  return Math.max(0, number(row?.total_scheduled) - number(row?.given));
}

function documentationAge(row) {
  return row?.last_note_date ? integer(row.days_since_last_note) : "Not calculated";
}

function availableMonths(rows, facilityId) {
  return [...new Set(
    (rows ?? [])
      .filter((row) => !facilityId || text(row?.facility_id) === facilityId)
      .map((row) => text(row?.month_bucket))
      .filter((period) => /^\d{4}-\d{2}$/.test(period))
  )].sort().reverse();
}

function intersectPeriods(...periodGroups) {
  const [first = [], ...rest] = periodGroups;
  return first.filter((period) => rest.every((group) => group.includes(period)));
}

export function getAvailableFullReportPeriods(requestValue, inputs) {
  const request = normalizeFullReportRequest(requestValue);
  const { summary, communities } = inputs;
  if (!summary || !communities) {
    throw new Error("Full report period discovery requires summary and community dashboard inputs.");
  }

  if (
    request.reportId === "residents"
  ) return [];

  const censusPeriods = availableMonths(summary.census, request.facilityId);
  const incidentPeriods = availableMonths(communities.incidents, request.facilityId);
  const medicationPeriods = availableMonths(summary.medicationCompliance, request.facilityId);

  if (request.reportId === "census") return censusPeriods;
  if (request.reportId === "incidents") return incidentPeriods;
  if (request.reportId === "medications") return medicationPeriods;

  return intersectPeriods(censusPeriods, incidentPeriods, medicationPeriods);
}

function evidence(slice, rows, detail) {
  return {
    slice,
    rowCount: Array.isArray(rows) ? rows.length : Math.max(0, Number(rows) || 0),
    ...(detail ? { detail } : {})
  };
}

function table(columns, rows) {
  return { type: "table", columns, rows };
}

function barList(items) {
  return { type: "bar_list", items };
}

function trend(items) {
  return { type: "trend", items };
}

function topCounts(rows, key, limit = 8) {
  const counts = new Map();
  rows.forEach((row) => {
    const label = text(row?.[key]) || "Unknown";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value, displayValue: integer(value) }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function buildBaseReport({ request, definition, title, summary, scope, period, generatedAt, dataThrough, freshness, metrics, sections, sources }) {
  const stableKey = JSON.stringify({
    version: FULL_REPORT_VERSION,
    reportId: request.reportId,
    facilityId: request.facilityId,
    period: period.value,
    generatedAt
  });
  const id = createHash("sha256").update(stableKey).digest("hex").slice(0, 16);
  return validateFullReportDocument({
    version: FULL_REPORT_VERSION,
    id,
    reportId: request.reportId,
    definitionId: definition.id,
    title,
    summary,
    scope,
    period,
    generatedAt,
    generatedAtLabel: formatDisplayDateTime(freshness?.generatedAt ?? generatedAt, {
      fallback: "now"
    }),
    dataThrough,
    freshness,
    metrics,
    sections,
    evidence: {
      compiledAt: generatedAt,
      sources
    }
  });
}

function portfolioCensusModel(home, summary, requestedPeriod, names) {
  const monthly = latestMonthRows(summary.census ?? [], requestedPeriod);
  const monthlyTotal = monthly.rows.reduce((total, row) => total + number(row.census), 0);
  const hasWeekly = home.operational.currentWeeklyCensus != null && !requestedPeriod;
  return {
    period: requestedPeriod ?? home.operational.latestCensusWeek ?? monthly.period,
    label: hasWeekly
      ? formatDisplayDate(home.operational.latestCensusWeek, { fallback: "Latest week" })
      : formatMonthLabel(monthly.period, { fallback: "Latest month" }),
    total: hasWeekly ? number(home.operational.currentWeeklyCensus) : monthlyTotal,
    change: hasWeekly ? home.operational.censusChange7d : null,
    rows: hasWeekly
      ? home.communities.map((community) => ({
          facilityId: text(community.facility_id),
          community: names.get(text(community.facility_id)) ?? community.community_name,
          census: community.currentWeeklyCensus,
          prior: community.priorWeeklyCensus,
          change: community.censusChange7d,
          averageStay: Math.round(number(community.averageLengthOfStay))
        }))
      : monthly.rows.map((row) => ({
          facilityId: text(row.facility_id),
          community: names.get(text(row.facility_id)) ?? `Facility ${row.facility_id}`,
          census: number(row.census),
          prior: null,
          change: null,
          averageStay: null
        }))
  };
}

function buildOverviewReport(context) {
  const { request, definition, home, summary, communities, generatedAt, dataThrough, freshness } = context;
  const names = facilityNameById(communities);
  const census = portfolioCensusModel(home, summary, request.period, names);
  const incidentRows = latestMonthRows(communities.incidents ?? [], request.period);
  const incidentTotal = incidentRows.rows.reduce((total, row) => total + number(row.incident_count), 0);
  const complianceRows = latestMonthRows(summary.medicationCompliance ?? [], request.period);
  const compliance = weightedCompliance(complianceRows.rows);
  const flowSourceRows = toolContextRows(
    summary,
    "residentFlowMonthlyByCommunity",
    "resident_flow_monthly_by_community"
  );
  const flowRows = latestMonthRows(flowSourceRows, request.period);
  const flowTotals = flowRows.rows.reduce(
    (result, row) => ({
      admissions: result.admissions + number(row.admissions),
      discharges: result.discharges + number(row.discharges),
      net: result.net + number(row.net_change)
    }),
    { admissions: 0, discharges: 0, net: 0 }
  );
  const topCommunities = [...census.rows]
    .filter((row) => row.census != null)
    .sort((left, right) => number(right.census) - number(left.census));
  const topCommunity = topCommunities[0];
  const documentation = request.period ? [] : documentationRows(summary);
  const population = request.period
    ? null
    : residentPopulationSummary(communities.residents ?? []);
  const documentationSummary = population
    ? documentationCoverage(population.residents, documentation)
    : null;
  const populationByCommunity = population
    ? [...new Set(population.residents.map((row) => text(row.facility_id)).filter(Boolean))]
        .map((facilityId) => {
          const profile = residentPopulationSummary(
            population.residents.filter((row) => text(row.facility_id) === facilityId)
          );
          return {
            facilityId,
            community: names.get(facilityId) ?? `Facility ${facilityId}`,
            profile
          };
        })
        .sort((left, right) => left.community.localeCompare(right.community))
    : [];
  const hasWeeklyCensusDetail = census.rows.some(
    (row) => row.prior != null || row.change != null || row.averageStay != null
  );
  const capacityRows = request.period ? [] : capacityRowsForCensus(census.rows);
  const capacity = capacityRows.length ? capacityTotals(capacityRows) : null;
  const capacityByFacility = new Map(capacityRows.map((row) => [row.facilityId, row]));
  const incidentByFacility = new Map(
    incidentCommunitySummaries(incidentRows.rows, names).map((row) => [row.facilityId, row])
  );
  const complianceByFacility = new Map(
    complianceRows.rows.map((row) => [text(row.facility_id), row])
  );
  const flowByFacility = new Map(
    flowRows.rows.map((row) => [text(row.facility_id), row])
  );
  const hasIncidentData = incidentRows.rows.length > 0;
  const hasComplianceData = complianceRows.rows.length > 0 && compliance.scheduled > 0;
  const censusFacilityIds = new Set(census.rows.map((row) => text(row.facilityId)).filter(Boolean));
  const flowCoveredCommunities = [...censusFacilityIds].filter(
    (facilityId) => flowByFacility.has(facilityId)
  ).length;
  const flowComplete = flowRows.rows.length > 0 &&
    flowCoveredCommunities === censusFacilityIds.size;
  const flowCoverage = `${integer(flowCoveredCommunities)} of ${integer(censusFacilityIds.size)} communities`;
  const operatingColumns = [
    { key: "community", label: "Community" },
    { key: "census", label: "Census" },
    ...(capacity ? [
      { key: "operatingLimit", label: "Operating limit" },
      { key: "utilization", label: "Utilization to limit" },
      { key: "open", label: "Open to limit" }
    ] : []),
    ...(hasIncidentData ? [{ key: "incidents", label: "Incidents" }] : []),
    ...(hasComplianceData ? [{ key: "compliance", label: "Medication completion" }] : []),
    ...(flowRows.rows.length ? [
      { key: "admissions", label: "Admissions" },
      { key: "discharges", label: "Discharges" },
      { key: "net", label: "Net flow" }
    ] : [])
  ];
  const operatingRows = census.rows.map((row) => {
    const facilityId = text(row.facilityId);
    const capacityRow = capacityByFacility.get(facilityId);
    const incidentRow = incidentByFacility.get(facilityId);
    const complianceRow = complianceByFacility.get(facilityId);
    const flowRow = flowByFacility.get(facilityId);
    return {
      community: row.community,
      census: integer(row.census),
      operatingLimit: capacityRow ? integer(capacityRow.operatingLimit) : "Not available",
      utilization: capacityRow ? percent(capacityRow.operationalUtilization) : "Not available",
      open: capacityRow ? integer(capacityRow.openToOperatingLimit) : "Not available",
      incidents: incidentRow ? integer(incidentRow.incidents) : "Not reported",
      compliance: complianceRow ? percent(complianceRow.compliance_pct) : "Not reported",
      admissions: flowRow ? integer(flowRow.admissions) : "Not reported",
      discharges: flowRow ? integer(flowRow.discharges) : "Not reported",
      net: flowRow ? signed(flowRow.net_change) : "Not reported"
    };
  });
  const hasMissingCommunityMeasures = operatingRows.some((row) =>
    (capacity && row.operatingLimit === "Not available") ||
    (hasIncidentData && row.incidents === "Not reported") ||
    (hasComplianceData && row.compliance === "Not reported") ||
    (flowRows.rows.length && row.net === "Not reported")
  );
  const operatingContext = [
    `Census is shown for ${census.label}.`,
    ...(hasIncidentData ? [`Incident counts use ${formatMonthLabel(incidentRows.period, { fallback: "the latest incident month" })}.`] : []),
    ...(hasComplianceData ? [`Medication completion uses ${formatMonthLabel(complianceRows.period, { fallback: "the latest medication month" })}.`] : []),
    ...(flowRows.rows.length ? [`Resident flow uses ${formatMonthLabel(flowRows.period, { fallback: "the latest flow month" })}${flowComplete ? "." : ` and covers ${flowCoverage}.`}`] : []),
    ...(capacity ? ["Current operating limits appear only on the latest report."] : []),
    ...(hasMissingCommunityMeasures ? ["Missing community measures are labeled as not reported rather than zero."] : [])
  ].join(" ");

  const summaryText = [
    `The governed ${hasWeeklyCensusDetail ? "weekly" : "monthly"} census is ${integer(census.total)} across ${integer(census.rows.length)} communities for ${census.label}.`,
    `${topCommunity?.community ?? "The largest community"} has the largest census at ${integer(topCommunity?.census)}.`,
    ...(hasIncidentData ? [`${formatMonthLabel(incidentRows.period, { fallback: "The latest incident month" })} recorded ${integer(incidentTotal)} incidents.`] : []),
    ...(hasComplianceData ? [`Weighted medication completion was ${percent(compliance.percentage)} for ${formatMonthLabel(complianceRows.period, { fallback: "the latest medication month" })}.`] : []),
    ...(flowRows.rows.length ? [flowComplete
      ? `Resident flow for ${formatMonthLabel(flowRows.period, { fallback: "the latest month" })} was ${signed(flowTotals.net)}, with ${integer(flowTotals.admissions)} admissions and ${integer(flowTotals.discharges)} discharges.`
      : `Resident flow records for ${formatMonthLabel(flowRows.period, { fallback: "the latest month" })} cover ${flowCoverage} and contain net movement of ${signed(flowTotals.net)}, with ${integer(flowTotals.admissions)} admissions and ${integer(flowTotals.discharges)} discharges.`
    ] : []),
    ...(capacity ? [`The latest governed census uses ${percent(capacity.operationalUtilization)} of the portfolio's ${integer(capacity.operatingLimit)}-resident current operating limit.`] : [])
  ].join(" ");

  return buildBaseReport({
    request,
    definition,
    title: definition.title,
    summary: summaryText,
    scope: { kind: "portfolio", label: "Alamo portfolio" },
    period: {
      value: census.period,
      label: request.period
        ? formatMonthLabel(request.period, { fallback: request.period })
        : `Latest governed data through ${census.label}`
    },
    generatedAt,
    dataThrough,
    freshness,
    metrics: [
      { label: "Census", value: integer(census.total), detail: census.label },
      ...(capacity ? [{
        label: "Operating utilization",
        value: percent(capacity.operationalUtilization),
        detail: `${census.label}; ${integer(capacity.openToOperatingLimit)} open to current operating limits`
      }] : []),
      ...(hasIncidentData ? [{
        label: "Incidents",
        value: integer(incidentTotal),
        detail: formatMonthLabel(incidentRows.period, { fallback: "Latest month" })
      }] : []),
      ...(hasComplianceData ? [{
        label: "Medication completion",
        value: percent(compliance.percentage),
        detail: formatMonthLabel(complianceRows.period, { fallback: "Latest month" })
      }] : []),
      ...(flowRows.rows.length ? [{
        label: flowComplete ? "Net resident flow" : "Reported net flow",
        value: signed(flowTotals.net),
        detail: `${flowComplete ? "" : `${flowCoverage}; `}${integer(flowTotals.admissions)} admissions and ${integer(flowTotals.discharges)} discharges`
      }] : []),
      ...(population?.averageAge == null ? [] : [{
        label: "Average age",
        value: `${decimalFormatter.format(population.averageAge)} years`,
        detail: "Current resident profiles"
      }])
    ],
    sections: [
      {
        id: "community-operating-position",
        title: "Community operating position",
        intro: operatingContext,
        blocks: [table(operatingColumns, operatingRows)]
      },
      ...(population?.residents.length ? [{
        id: "current-resident-context",
        title: "Current resident context",
        intro: `The current resident-profile extract contains ${integer(population.residents.length)} countable rows. These rows support age comparisons and length-of-stay measures where every source value is nonnegative; profile rows are not treated as census.`,
        blocks: [
          table(
            [
              { key: "community", label: "Community" },
              { key: "profiles", label: "Profile rows" },
              { key: "averageAge", label: "Average age" },
              { key: "medianStay", label: "Median current stay" },
              { key: "overOneYear", label: "Stays over one year" }
            ],
            populationByCommunity.map((row) => ({
              community: row.community,
              profiles: integer(row.profile.residents.length),
              averageAge: row.profile.averageAge == null
                ? "Not available"
                : `${decimalFormatter.format(row.profile.averageAge)} years`,
              medianStay: row.profile.medianStay == null
                ? "Not available"
                : `${integer(row.profile.medianStay)} days`,
              overOneYear: row.profile.overOneYearPercentage == null
                ? "Not available"
                : percent(row.profile.overOneYearPercentage)
            }))
          )
        ]
      }] : []),
      ...(documentationSummary ? [{
        id: "care-delivery-coverage",
        title: "Care delivery coverage",
        intro: `Documentation status is complete for all ${integer(documentationSummary.residentCount)} current governed resident profiles in this report scope.`,
        blocks: [{
          type: "metric_grid",
          items: [
            { label: "Documented within 7 days", value: percent(documentationSummary.within7DaysPercentage) },
            { label: "Documented within 30 days", value: percent(documentationSummary.within30DaysPercentage) }
          ]
        }]
      }] : []),
    ],
    sources: [
      ...(!request.period ? [evidence("home_dashboard", 1, "Current portfolio operating totals")] : []),
      evidence("census_monthly_by_community", census.rows),
      ...(hasIncidentData ? [evidence("incident_monthly_by_community_category", incidentRows.rows)] : []),
      ...(hasComplianceData ? [evidence("medication_compliance_monthly", complianceRows.rows)] : []),
      ...(flowRows.rows.length ? [evidence("resident_flow_monthly_by_community", flowSourceRows)] : []),
      ...(documentationSummary ? [
        evidence("documentation_status", documentation, "Operational placeholder profiles excluded")
      ] : []),
      ...(population?.residents.length ? [
        evidence("resident_profile", population.residents, "Current profile; operational placeholders excluded")
      ] : []),
      ...(capacity ? [
        evidence(
          "community_capacity_registry",
          capacityRows,
          "Current licensed capacity and operating limits; not historical"
        )
      ] : [])
    ]
  });
}

function buildCommunityReport(context) {
  const { request, definition, home, summary, communities, community, generatedAt, dataThrough, freshness } = context;
  const facilityId = request.facilityId;
  const facilityName = facilityDisplayName(
    community.facility.facility_id,
    community.facility.community_name
  );
  const censusRows = latestMonthRows(
    (community.census ?? []).filter((row) => text(row.facility_id) === facilityId),
    request.period
  );
  const censusTrend = [...(community.census ?? [])]
    .filter(
      (row) =>
        !request.period ||
        !text(row.month_bucket) ||
        text(row.month_bucket) <= request.period
    )
    .sort((left, right) => text(left.month_bucket).localeCompare(text(right.month_bucket)))
    .slice(-12)
    .map((row) => ({
      label: formatMonthLabel(row.month_bucket, { fallback: row.month_bucket }),
      value: integer(row.census)
    }));
  const incidentPeriod = request.period ?? community.reporting_month;
  const incidentRows = incidentPeriod
    ? (community.incidentDetails ?? []).filter((row) => text(row.month_bucket) === incidentPeriod)
    : community.incidentDetails ?? [];
  const complianceRows = latestMonthRows(
    (summary.medicationCompliance ?? []).filter((row) => text(row.facility_id) === facilityId),
    request.period
  );
  const compliance = complianceRows.rows[0];
  const flowSourceRows = toolContextRows(
    summary,
    "residentFlowMonthlyByCommunity",
    "resident_flow_monthly_by_community"
  );
  const flowRows = latestMonthRows(
    flowSourceRows.filter((row) => text(row.facility_id) === facilityId),
    request.period
  );
  const flowTotals = flowRows.rows.reduce(
    (result, row) => ({
      admissions: result.admissions + number(row.admissions),
      discharges: result.discharges + number(row.discharges),
      net: result.net + number(row.net_change)
    }),
    { admissions: 0, discharges: 0, net: 0 }
  );
  const sourceCommunityResidents = (communities.residents ?? []).filter(
    (row) => text(row.facility_id) === facilityId
  );
  const population = residentPopulationSummary(sourceCommunityResidents);
  const communityResidents = population.residents;
  const averageAge = population.averageAge;
  const averageStay = population.averageStay;
  const refusals = refusalItemsForPeriod(summary, facilityId, complianceRows.period, 8);
  const documentation = (request.period ? [] : documentationRows(summary))
    .filter((row) => text(row.facility_id) === facilityId)
    .sort((left, right) => number(right.days_since_last_note) - number(left.days_since_last_note));
  const documentationSummary = request.period
    ? null
    : documentationCoverage(communityResidents, documentation);
  const burden = request.period
    ? null
    : medicationBurden(summary, facilityId, communityResidents);
  const latestCensus = censusRows.rows.at(-1)?.census;
  const incidentCount = incidentRows.length;
  const expectedIncidentTotal = (communities.incidents ?? [])
    .filter(
      (row) =>
        text(row.facility_id) === facilityId &&
        text(row.month_bucket) === incidentPeriod
    )
    .reduce((total, row) => total + number(row.incident_count), 0);
  const incidentSeverity = incidentSeverityForPeriod(
    community.incidentDetails,
    incidentPeriod,
    facilityId,
    expectedIncidentTotal
  );
  const incidentCategories = topCounts(incidentRows, "category", 10);
  const diagnosisMix = topCounts(communityResidents, "primary_diagnosis", 10);
  const longestStayResidents = governedResidentRows(community.longestStayResidents)
    .sort((left, right) => number(right.los_days) - number(left.los_days))
    .slice(0, 12);
  const facilityCapacity = request.period
    ? null
    : ALAMO_FACILITIES.find((facility) => facility.facilityId === facilityId) ?? null;
  const currentCommunity = facilityCapacity
    ? (home.communities ?? []).find((entry) => text(entry.facility_id) === facilityId)
    : null;
  const currentCapacity = facilityCapacity && currentCommunity?.currentWeeklyCensus != null
    ? {
        census: number(currentCommunity.currentWeeklyCensus),
        operatingLimit: facilityCapacity.operatingLimit,
        licensedCapacity: facilityCapacity.licensedCapacity,
        operationalUtilization: capacityPercent(
          currentCommunity.currentWeeklyCensus,
          facilityCapacity.operatingLimit
        ),
        licensedUtilization: capacityPercent(
          currentCommunity.currentWeeklyCensus,
          facilityCapacity.licensedCapacity
        ),
        capacityAsOf: facilityCapacity.capacityAsOf,
        operatingSiteName: facilityCapacity.operatingSiteName,
        openToOperatingLimit: Math.max(
          0,
          facilityCapacity.operatingLimit - number(currentCommunity.currentWeeklyCensus)
        )
      }
    : null;

  const censusStatement = latestCensus == null
    ? `A census point is not available for ${formatMonthLabel(censusRows.period ?? request.period, { fallback: "the selected period" })}.`
    : `${facilityName} reported a census of ${integer(latestCensus)} for ${formatMonthLabel(censusRows.period, { fallback: "the latest census period" })}.`;
  const profileStatement = averageAge == null || averageStay == null
    ? "A current resident profile is not available."
    : `The separate current resident-profile extract contains ${integer(communityResidents.length)} countable rows, with an average age of ${decimalFormatter.format(averageAge)} years and an average stay of ${integer(averageStay)} days.`;
  const summaryText = `${censusStatement} ${profileStatement}${flowRows.rows.length ? ` ${formatMonthLabel(flowRows.period, { fallback: "The latest flow month" })} had ${integer(flowTotals.admissions)} admissions and ${integer(flowTotals.discharges)} discharges, for net movement of ${signed(flowTotals.net)} residents.` : ""} ${formatMonthLabel(incidentPeriod, { fallback: "The latest incident period" })} contains ${integer(incidentCount)} incidents.${currentCapacity ? ` Weekly operating census uses ${percent(currentCapacity.operationalUtilization)} of the current operating limit.` : ""}`;

  return buildBaseReport({
    request,
    definition,
    title: `${facilityName} performance report`,
    summary: summaryText,
    scope: { kind: "community", label: facilityName, facilityId },
    period: {
      value: request.period ?? censusRows.period ?? community.reporting_month,
      label: formatMonthLabel(request.period ?? censusRows.period ?? community.reporting_month, {
        fallback: "Latest governed period"
      })
    },
    generatedAt,
    dataThrough,
    freshness,
    metrics: [
      {
        label: "Census",
        value: latestCensus == null ? "Not available" : integer(latestCensus),
        detail: formatMonthLabel(censusRows.period ?? request.period, { fallback: "Selected period" })
      },
      { label: "Incidents", value: integer(incidentCount), detail: formatMonthLabel(incidentPeriod, { fallback: "Latest month" }) },
      ...(flowRows.rows.length ? [{
        label: "Net resident flow",
        value: signed(flowTotals.net),
        detail: `${integer(flowTotals.admissions)} admissions and ${integer(flowTotals.discharges)} discharges`
      }] : []),
      { label: "Average stay", value: averageStay == null ? "Not available" : `${integer(averageStay)} days`, detail: "Current governed profile" },
      ...(population.medianStay == null ? [] : [{
        label: "Median stay",
        value: `${integer(population.medianStay)} days`,
        detail: "Current governed profile"
      }]),
      ...(population.overOneYearPercentage == null ? [] : [{
        label: "Stays over one year",
        value: percent(population.overOneYearPercentage),
        detail: `${integer(population.overOneYear)} current residents`
      }]),
      {
        label: "Medication compliance",
        value: compliance ? percent(compliance.compliance_pct) : "Not available",
        detail: formatMonthLabel(complianceRows.period ?? request.period, { fallback: "Selected period" })
      },
      ...(currentCapacity ? [{
        label: "Weekly operating utilization",
        value: percent(currentCapacity.operationalUtilization),
        detail: `${integer(currentCapacity.openToOperatingLimit)} open to current limit`
      }] : [])
    ],
    sections: [
      ...(currentCapacity ? [{
        id: "capacity-position",
        title: "Capacity position",
        intro: `${facilityName} is using ${percent(currentCapacity.operationalUtilization)} of its ${integer(currentCapacity.operatingLimit)}-resident operating limit based on the weekly operating census of ${integer(currentCapacity.census)}. This point-in-time limit is effective ${formatDisplayDate(currentCapacity.capacityAsOf, { fallback: "for the current period" })} and is not applied to historical census periods.`,
        blocks: [{
          type: "metric_grid",
          items: [
            { label: "Weekly operating census", value: integer(currentCapacity.census) },
            { label: "Operating limit", value: integer(currentCapacity.operatingLimit) },
            { label: "Open to operating limit", value: integer(currentCapacity.openToOperatingLimit) },
            { label: "Licensed capacity", value: integer(currentCapacity.licensedCapacity) },
            { label: "Licensed utilization", value: percent(currentCapacity.licensedUtilization) }
          ]
        }]
      }] : []),
      {
        id: "census-and-residents",
        title: "Census and resident profile",
        intro: latestCensus == null
          ? `No governed census point was substituted for the selected period. Current resident profiles are shown only as supporting clinical context.`
          : `${facilityName} has ${integer(latestCensus)} residents in the selected census period. The separate current resident-profile extract supplies age, length of stay, and diagnosis context and is not substituted for census.`,
        blocks: [
          ...(communityResidents.length ? [{
            type: "metric_grid",
            items: residentPopulationItems(population, true)
          }] : []),
          ...(censusTrend.length ? [trend(censusTrend)] : []),
          barList(diagnosisMix)
        ]
      },
      ...(flowRows.rows.length ? [{
        id: "resident-flow",
        title: "Admissions and discharges",
        intro: `${formatMonthLabel(flowRows.period, { fallback: "The latest month" })} resident movement is shown separately from the census point and current resident profile.`,
        blocks: [{
          type: "metric_grid",
          items: [
            { label: "Admissions", value: integer(flowTotals.admissions) },
            { label: "Discharges", value: integer(flowTotals.discharges) },
            { label: "Net movement", value: signed(flowTotals.net) }
          ]
        }]
      }] : []),
      {
        id: "incident-pattern",
        title: "Incident pattern",
        intro: `${integer(incidentCount)} incidents are represented for ${formatMonthLabel(incidentPeriod, { fallback: "the selected period" })}.`,
        blocks: [
          barList(incidentCategories),
          table(
            [
              { key: "date", label: "Date" },
              { key: "resident", label: "Resident" },
              { key: "category", label: "Category" },
              { key: "location", label: "Location" }
            ],
            [...incidentRows]
              .sort((left, right) => text(right.incident_date).localeCompare(text(left.incident_date)))
              .slice(0, 12)
              .map((row) => ({
                date: formatDisplayDate(row.incident_date, { fallback: "Undated" }),
                resident: text(row.client_name) || `Resident ${row.resident_id}`,
                category: text(row.category) || "Other",
                location: text(row.location) || "Not specified"
              }))
          )
        ]
      },
      ...(incidentSeverity ? [{
        id: "incident-severity",
        title: "Incident severity indicators",
        intro: `All ${integer(incidentSeverity.rows.length)} incident details reconcile to the governed incident total for ${formatMonthLabel(incidentPeriod, { fallback: "the selected period" })}.`,
        blocks: [{
          type: "metric_grid",
          items: [
            { label: "Incidents with injury", value: integer(incidentSeverity.injuries) },
            { label: "Police called", value: integer(incidentSeverity.policeCalled) },
            { label: "Sentinel events", value: integer(incidentSeverity.sentinelEvents) },
            { label: "Residents represented", value: integer(incidentSeverity.residents) }
          ]
        }]
      }] : []),
      {
        id: "medication-performance",
        title: "Medication performance",
        intro: compliance
          ? `${facilityName} recorded ${percent(compliance.compliance_pct)} scheduled administration compliance in ${formatMonthLabel(complianceRows.period, { fallback: "the latest month" })}.`
          : `Medication performance is summarized from the latest governed community records.`,
        blocks: [
          ...(compliance ? [{
            type: "metric_grid",
            items: [
              { label: "Scheduled", value: integer(compliance.total_scheduled) },
              { label: "Given", value: integer(compliance.given) },
              { label: "Not completed", value: integer(scheduledNotCompleted(compliance)) },
              { label: "Compliance", value: percent(compliance.compliance_pct) }
            ]
          }] : []),
          ...(refusals.length ? [barList(refusals)] : [])
        ]
      },
      ...(documentationSummary ? [{
        id: "care-delivery-coverage",
        title: "Care delivery coverage",
        intro: `Documentation status is complete for all ${integer(documentationSummary.residentCount)} current governed resident profiles in this community.`,
        blocks: [{
          type: "metric_grid",
          items: [
            { label: "Documented within 7 days", value: percent(documentationSummary.within7DaysPercentage) },
            { label: "Documented within 30 days", value: percent(documentationSummary.within30DaysPercentage) }
          ]
        }]
      }] : []),
      ...(burden ? [{
        id: "medication-burden",
        title: "Current medication burden",
        intro: "Resident-level 30-day measures are shown separately from monthly scheduled-administration compliance.",
        blocks: [{
          type: "metric_grid",
          items: medicationBurdenItems(burden)
        }]
      }] : []),
      ...(documentation.length || longestStayResidents.length ? [{
        id: "resident-watch",
        title: "Resident watch",
        intro: "Long stays and documentation gaps are shown together so operating and clinical leaders can move directly from the community result to the residents driving it.",
        blocks: [
          table(
            [
              { key: "resident", label: "Longest stays" },
              { key: "unit", label: "Unit" },
              { key: "admitted", label: "Admitted" },
              { key: "stay", label: "Length of stay" }
            ],
            longestStayResidents.map((row) => ({
              resident: residentName(row),
              unit: text(row.unit_number) || "",
              admitted: formatDisplayDate(row.admit_date, { fallback: "Not dated" }),
              stay: `${integer(row.los_days)} days`
            }))
          ),
          table(
            [
              { key: "resident", label: "Documentation watch" },
              { key: "lastNote", label: "Last note" },
              { key: "days", label: "Days since note" }
            ],
            documentation.slice(0, 12).map((row) => ({
              resident: text(row.resident_name) || `Resident ${row.resident_id}`,
              lastNote: formatDisplayDate(row.last_note_date, { fallback: "No dated note" }),
              days: documentationAge(row)
            }))
          )
        ]
      }] : [])
    ],
    sources: [
      evidence("community_snapshot", 1, facilityName),
      evidence("census_monthly_by_community", community.census ?? []),
      evidence("incident_detail_history", community.incidentDetails ?? []),
      evidence("resident_profile", communityResidents, "Operational placeholder profiles excluded"),
      evidence("medication_compliance_monthly", complianceRows.rows),
      ...(flowRows.rows.length ? [evidence("resident_flow_monthly_by_community", flowSourceRows)] : []),
      ...(refusals.length ? [evidence("mar_monthly_by_community_medication", refusals)] : []),
      ...(documentation.length ? [evidence("documentation_status", documentation)] : []),
      ...(burden ? [evidence("mar_resident_summary", burden.rows)] : []),
      ...(currentCapacity ? [
        evidence(
          "community_capacity_registry",
          1,
          `Current capacity for ${currentCapacity.operatingSiteName}; not historical`
        )
      ] : [])
    ]
  });
}

function buildEffectivenessReport(context) {
  const { request, definition, home, summary, communities, generatedAt, dataThrough, freshness } = context;
  const names = facilityNameById(communities);
  const facilityId = request.facilityId;
  const scopeLabel = facilityId
    ? names.get(facilityId) ?? `Facility ${facilityId}`
    : "Alamo portfolio";
  const audiencePlan = getEffectivenessEvidencePlan(request.audience);
  const availablePeriods = getAvailableFullReportPeriods(request, { summary, communities });
  const evidencePeriod = request.period ?? availablePeriods[0] ?? null;
  const inScope = (row) => !facilityId || text(row?.facility_id) === facilityId;
  const throughRequestedPeriod = (value) =>
    !request.period || !value || text(value).slice(0, 7) <= request.period;

  const censusSourceRows = (summary.census ?? []).filter(inScope);
  const monthlyCensus = latestMonthRows(censusSourceRows, request.period ?? evidencePeriod);
  const currentCommunity = facilityId
    ? (home.communities ?? []).find((row) => text(row.facility_id) === facilityId)
    : null;
  const currentCensusCandidate = request.period
    ? monthlyCensus.rows.length
      ? monthlyCensus.rows.reduce((total, row) => total + number(row.census), 0)
      : null
    : facilityId
      ? currentCommunity?.currentWeeklyCensus ?? monthlyCensus.rows[0]?.census ?? null
      : home.operational?.currentWeeklyCensus ?? (monthlyCensus.rows.length
          ? monthlyCensus.rows.reduce((total, row) => total + number(row.census), 0)
          : null);
  const currentCensus = currentCensusCandidate == null || !Number.isFinite(Number(currentCensusCandidate))
    ? null
    : Number(currentCensusCandidate);
  const censusLabel = request.period
    ? formatMonthLabel(request.period, { fallback: request.period })
    : formatDisplayDate(home.operational?.latestCensusWeek, {
        fallback: formatMonthLabel(monthlyCensus.period, { fallback: "Latest governed period" })
      });

  const incidentSourceRows = (communities.incidents ?? []).filter(inScope);
  const incidentRows = latestMonthRows(incidentSourceRows, evidencePeriod);
  const incidentAvailable = incidentRows.rows.length > 0;
  const incidentTotal = incidentRows.rows.reduce(
    (total, row) => total + number(row.incident_count),
    0
  );
  const incidentRate = incidentAvailable && currentCensus != null && currentCensus > 0
    ? incidentTotal / currentCensus * 100
    : null;
  const incidentByMonth = new Map();
  incidentSourceRows.forEach((row) => {
    const month = text(row.month_bucket);
    if (!month || (evidencePeriod && month > evidencePeriod)) return;
    incidentByMonth.set(month, (incidentByMonth.get(month) ?? 0) + number(row.incident_count));
  });
  const censusByMonth = new Map();
  censusSourceRows.forEach((row) => {
    const month = text(row.month_bucket);
    if (!month || (evidencePeriod && month > evidencePeriod)) return;
    censusByMonth.set(month, (censusByMonth.get(month) ?? 0) + number(row.census));
  });
  const incidentRateTrend = [...incidentByMonth.keys()]
    .filter((month) => number(censusByMonth.get(month)) > 0)
    .sort()
    .slice(-6)
    .map((month) => {
      const rate = number(incidentByMonth.get(month)) / number(censusByMonth.get(month)) * 100;
      return {
        label: formatMonthLabel(month, { fallback: month }),
        value: rate,
        displayValue: decimalFormatter.format(rate)
      };
    });

  const medicationSourceRows = (summary.medicationCompliance ?? []).filter(inScope);
  const complianceRows = latestMonthRows(medicationSourceRows, evidencePeriod);
  const compliance = weightedCompliance(complianceRows.rows);
  const complianceAvailable = complianceRows.rows.length > 0 && compliance.scheduled > 0;
  const complianceByMonth = new Map();
  medicationSourceRows.forEach((row) => {
    const month = text(row.month_bucket);
    if (!month || (evidencePeriod && month > evidencePeriod)) return;
    const current = complianceByMonth.get(month) ?? { scheduled: 0, given: 0 };
    current.scheduled += number(row.total_scheduled);
    current.given += number(row.given);
    complianceByMonth.set(month, current);
  });
  const complianceTrend = [...complianceByMonth.entries()]
    .filter(([, totals]) => totals.scheduled > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-6)
    .map(([month, totals]) => {
      const percentage = totals.given / totals.scheduled * 100;
      return {
        label: formatMonthLabel(month, { fallback: month }),
        value: percentage,
        displayValue: percent(percentage)
      };
    });

  const flowSourceRows = toolContextRows(
    summary,
    "residentFlowMonthlyByCommunity",
    "resident_flow_monthly_by_community"
  ).filter(inScope);
  const flowRows = latestMonthRows(flowSourceRows, evidencePeriod);
  const flowAvailable = flowRows.rows.length > 0;
  const flowTotals = flowRows.rows.reduce(
    (result, row) => ({
      admissions: result.admissions + number(row.admissions),
      discharges: result.discharges + number(row.discharges),
      net: result.net + number(row.net_change)
    }),
    { admissions: 0, discharges: 0, net: 0 }
  );

  const sourceResidentRows = (communities.residents ?? []).filter(inScope);
  const residentRows = request.period ? [] : governedResidentRows(sourceResidentRows);
  const averageAge = residentRows.length
    ? residentRows.reduce((total, row) => total + number(row.age), 0) / residentRows.length
    : null;
  const averageStay = residentRows.length
    ? residentRows.reduce((total, row) => total + number(row.los_days), 0) / residentRows.length
    : null;
  const diagnosisMix = topCounts(residentRows, "primary_diagnosis", 8);

  const allEpisodeSourceRows = toolContextRows(
    summary,
    "residentEpisodeHistory",
    "resident_episode_history"
  );
  const episodeSourceRows = allEpisodeSourceRows.filter(inScope);
  const episodeRows = episodeSourceRows.filter(
    (row) => throughRequestedPeriod(row.admit_date ?? row.discharge_date)
  );
  const episodesAvailable = episodeRows.length > 0;
  const episodesByResident = new Map();
  episodeRows.forEach((row) => {
    const residentId = text(row.resident_id);
    if (!residentId) return;
    episodesByResident.set(residentId, (episodesByResident.get(residentId) ?? 0) + 1);
  });
  const repeatResidents = [...episodesByResident.values()].filter((count) => count > 1).length;
  const internalReturnEpisodes = [...episodesByResident.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0
  );
  const dischargedEpisodes = episodeRows.filter(
    (row) => row.discharge_date && throughRequestedPeriod(row.discharge_date)
  );
  const documentedOutcomes = dischargedEpisodes.filter(
    (row) => text(row.discharge_reason) || text(row.discharge_destination)
  ).length;
  const outcomeCoverage = dischargedEpisodes.length
    ? documentedOutcomes / dischargedEpisodes.length * 100
    : null;
  const readmissionWindows = internalReadmissionSummary(
    allEpisodeSourceRows,
    facilityId,
    reportAsOfTimestamp(request.period, home, communities, generatedAt)
  ) ?? [];
  const availableReadmissionWindows = readmissionWindows.filter(
    (window) => window.percentage != null
  );

  const capacityRows = request.period || currentCensus == null
    ? []
    : capacityRowsForCensus(
        facilityId
          ? [{ facilityId, census: currentCensus }]
          : (home.communities ?? []).map((row) => ({
              facilityId: text(row.facility_id),
              census: row.currentWeeklyCensus
            }))
      );
  const capacity = capacityRows.length ? capacityTotals(capacityRows) : null;
  const periodLabel = formatMonthLabel(evidencePeriod, { fallback: "the latest shared month" });
  const evidenceBoundary = `These are observed operating signals, not a causal outcome study. External acute-care use, complete post-discharge outcomes, and comparative cost are not yet loaded and are not estimated here.`;
  const summaryText = [
    currentCensus == null
      ? `A governed census point is not available for ${scopeLabel} in ${censusLabel}.`
      : `${scopeLabel} reported a governed census of ${integer(currentCensus)} for ${censusLabel}.`,
    incidentAvailable
      ? `${periodLabel} recorded ${integer(incidentTotal)} incidents${incidentRate == null ? "" : `, or ${decimalFormatter.format(incidentRate)} per 100 census`}.`
      : `Incident volume is not available for ${periodLabel}.`,
    complianceAvailable
      ? `Weighted medication compliance was ${percent(compliance.percentage)}.`
      : `Medication compliance is not available for ${periodLabel}.`,
    episodesAvailable
      ? `The episode record contains ${integer(internalReturnEpisodes)} return admissions among ${integer(repeatResidents)} residents with multiple Alamo episodes.`
      : `Episode history is not available for this scope.`,
    evidenceBoundary
  ].join(" ");

  return buildBaseReport({
    request,
    definition,
    title: facilityId
      ? `${scopeLabel} effectiveness evidence`
      : "Portfolio effectiveness evidence",
    summary: summaryText,
    scope: facilityId
      ? { kind: "community", label: scopeLabel, facilityId }
      : { kind: "portfolio", label: "Alamo portfolio" },
    period: {
      value: request.period ?? evidencePeriod,
      label: request.period
        ? formatMonthLabel(request.period, { fallback: request.period })
        : `Latest governed data through ${censusLabel}`
    },
    generatedAt,
    dataThrough,
    freshness,
    metrics: [
      {
        label: "Census",
        value: currentCensus == null ? "Not available" : integer(currentCensus),
        detail: censusLabel
      },
      {
        label: "Incidents per 100 census",
        value: incidentRate == null ? "Not available" : decimalFormatter.format(incidentRate),
        detail: periodLabel
      },
      {
        label: "Medication compliance",
        value: complianceAvailable ? percent(compliance.percentage) : "Not available",
        detail: periodLabel
      },
      ...(flowAvailable ? [{
        label: "Resident movement",
        value: signed(flowTotals.net),
        detail: `${integer(flowTotals.admissions)} admissions and ${integer(flowTotals.discharges)} discharges`
      }] : []),
      ...(averageStay == null ? [] : [{
        label: "Average current stay",
        value: `${integer(averageStay)} days`,
        detail: `${integer(residentRows.length)} current profile rows`
      }]),
      {
        label: "Internal return admissions",
        value: episodesAvailable ? integer(internalReturnEpisodes) : "Not available",
        detail: episodesAvailable
          ? `${integer(repeatResidents)} residents with multiple episodes`
          : "No governed episode rows in scope"
      },
      {
        label: "Documented discharge outcomes",
        value: outcomeCoverage == null ? "Not available" : percent(outcomeCoverage),
        detail: `${integer(documentedOutcomes)} of ${integer(dischargedEpisodes.length)} discharge episodes`
      },
      ...availableReadmissionWindows.map((window) => ({
        label: `${window.days}-day internal readmission`,
        value: percent(window.percentage),
        detail: `${integer(window.readmitted)} of ${integer(window.eligible)} mature discharges`
      }))
    ],
    sections: [
      {
        id: "audience-decision",
        title: `Evidence for ${audiencePlan.audience.label}`,
        intro: `This version is organized around ${audiencePlan.audience.decision.toLowerCase()}.`,
        blocks: [{
          type: "bullets",
          items: audiencePlan.evidence.map((item) => `${item.label}: ${item.claim}`)
        }]
      },
      {
        id: "reach-and-acuity",
        title: "Reach and population complexity",
        intro: capacity
          ? `${scopeLabel} is using ${percent(capacity.operationalUtilization)} of the current operating limit represented in this scope. Current resident profiles provide acuity context and are not substituted for census.`
          : `The selected historical period uses governed census. Current operating limits and current resident profiles are not backfilled into historical periods.`,
        blocks: [
          ...(capacity ? [{
            type: "metric_grid",
            items: [
              { label: "Operating limit", value: integer(capacity.operatingLimit) },
              { label: "Operating utilization", value: percent(capacity.operationalUtilization) },
              { label: "Open to operating limit", value: integer(capacity.openToOperatingLimit) },
              { label: "Licensed capacity", value: integer(capacity.licensedCapacity) }
            ]
          }] : []),
          ...(residentRows.length ? [{
            type: "metric_grid",
            items: [
              { label: "Current profile rows", value: integer(residentRows.length) },
              { label: "Average age", value: `${decimalFormatter.format(number(averageAge))} years` },
              { label: "Average stay", value: `${integer(averageStay)} days` }
            ]
          }, barList(diagnosisMix)] : [{ type: "paragraph", text: "Current resident acuity is intentionally omitted from this historical view." }])
        ]
      },
      {
        id: "stabilization-signals",
        title: "Observed stabilization signals",
        intro: `Incident rates are normalized to monthly census so volume can be compared across periods. Medication completion is weighted from scheduled and given administrations. Direction is descriptive and does not establish that the program caused the change.`,
        blocks: [
          ...(incidentRateTrend.length >= 2 ? [{
            type: "line_chart",
            label: "Incidents per 100 census",
            items: incidentRateTrend
          }] : [{ type: "paragraph", text: "A multi-month normalized incident trend is not available in this scope." }]),
          ...(complianceTrend.length >= 2 ? [{
            type: "line_chart",
            label: "Weighted medication compliance",
            items: complianceTrend
          }] : [{ type: "paragraph", text: "A multi-month medication trend is not available in this scope." }])
        ]
      },
      {
        id: "continuity-and-outcomes",
        title: "Continuity and outcome coverage",
        intro: `${flowAvailable
          ? `${periodLabel} had ${integer(flowTotals.admissions)} admissions and ${integer(flowTotals.discharges)} discharges.`
          : `Resident flow is not available for ${periodLabel}.`} Internal return admissions and readmission rates count only subsequent admissions inside Alamo and are not external hospital readmission or recidivism measures. ${episodesAvailable
          ? `${integer(documentedOutcomes)} of ${integer(dischargedEpisodes.length)} discharge episodes have a structured reason or destination in the loaded episode history.`
          : `Episode history is not available for this scope.`}`,
        blocks: [{
          type: "metric_grid",
          items: [
            { label: "Admissions", value: flowAvailable ? integer(flowTotals.admissions) : "Not available", detail: periodLabel },
            { label: "Discharges", value: flowAvailable ? integer(flowTotals.discharges) : "Not available", detail: periodLabel },
            { label: "Internal return admissions", value: episodesAvailable ? integer(internalReturnEpisodes) : "Not available" },
            { label: "Outcome documentation", value: outcomeCoverage == null ? "Not available" : percent(outcomeCoverage) },
            ...availableReadmissionWindows.map((window) => ({
              label: `${window.days}-day internal readmission`,
              value: percent(window.percentage),
              detail: `${integer(window.readmitted)} of ${integer(window.eligible)} mature discharges`
            }))
          ]
        }]
      },
      {
        id: "evidence-boundary",
        title: "What this report does not claim",
        intro: evidenceBoundary,
        blocks: [{ type: "bullets", items: audiencePlan.gaps }]
      }
    ],
    sources: [
      evidence("census_monthly_by_community", censusSourceRows),
      evidence("incident_monthly_by_community_category", incidentSourceRows),
      evidence("medication_compliance_monthly", medicationSourceRows),
      evidence("resident_flow_monthly_by_community", flowSourceRows),
      evidence("resident_episode_history", episodeRows),
      ...(residentRows.length ? [
        evidence("resident_profile", residentRows, "Current acuity context; operational placeholders excluded")
      ] : []),
      ...(capacity ? [
        evidence("community_capacity_registry", capacityRows, "Current point-in-time limits; not historical")
      ] : [])
    ]
  });
}

function buildFocusedReport(context) {
  const { request, definition, home, summary, communities, generatedAt, dataThrough, freshness } = context;
  const names = facilityNameById(communities);
  const sourceScopeRows = request.facilityId
    ? (communities.residents ?? []).filter((row) => text(row.facility_id) === request.facilityId)
    : communities.residents ?? [];
  const scopeRows = governedResidentRows(sourceScopeRows);
  const scopeLabel = request.facilityId
    ? names.get(request.facilityId) ?? `Facility ${request.facilityId}`
    : "Alamo portfolio";
  const scope = request.facilityId
    ? { kind: "community", label: scopeLabel, facilityId: request.facilityId }
    : { kind: "portfolio", label: scopeLabel };

  if (request.reportId === "census") {
    const rows = latestMonthRows(
      (summary.census ?? []).filter((row) => !request.facilityId || text(row.facility_id) === request.facilityId),
      request.period
    );
    const history = (summary.census ?? [])
      .filter(
        (row) =>
          (!request.facilityId || text(row.facility_id) === request.facilityId) &&
          (!request.period || text(row.month_bucket) <= request.period)
      )
      .sort((left, right) => text(left.month_bucket).localeCompare(text(right.month_bucket)));
    const censusByMonth = new Map();
    for (const row of history) {
      const month = text(row.month_bucket);
      if (!month) continue;
      const current = censusByMonth.get(month) ?? { census: 0, facilityIds: new Set() };
      current.census += number(row.census);
      const facilityId = text(row.facility_id);
      if (facilityId) current.facilityIds.add(facilityId);
      censusByMonth.set(month, current);
    }
    const monthlyCensus = [...censusByMonth.entries()]
      .map(([month, entry]) => {
        const facilityIds = [...entry.facilityIds].sort();
        return {
          month,
          census: entry.census,
          communities: facilityIds.length,
          facilityKey: facilityIds.join(",")
        };
      })
      .sort((left, right) => left.month.localeCompare(right.month));
    const latestFacilityKey = monthlyCensus.at(-1)?.facilityKey;
    let comparableStart = monthlyCensus.length - 1;
    while (
      comparableStart > 0 &&
      monthlyCensus[comparableStart - 1]?.facilityKey === latestFacilityKey
    ) {
      comparableStart -= 1;
    }
    const comparableCensus = monthlyCensus.slice(Math.max(0, comparableStart));
    const recentCensusTrend = comparableCensus.slice(-12).map((row) => ({
      label: formatMonthLabel(row.month, { fallback: row.month, month: "short" }),
      value: row.census,
      displayValue: integer(row.census)
    }));
    const hasCoverageChanges = new Set(monthlyCensus.map((row) => row.facilityKey)).size > 1;
    const annualCensusByYear = new Map();
    for (const row of monthlyCensus) {
      const year = row.month.slice(0, 4);
      const current = annualCensusByYear.get(year) ?? [];
      current.push(row);
      annualCensusByYear.set(year, current);
    }
    const annualCensus = [...annualCensusByYear.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([year, yearRows]) => {
        const first = yearRows[0];
        const last = yearRows.at(-1);
        const stableCommunitySet = yearRows.every(
          (row) => row.facilityKey === first?.facilityKey
        );
        const communityCounts = yearRows.map((row) => row.communities);
        const minimumCommunities = Math.min(...communityCounts);
        const maximumCommunities = Math.max(...communityCounts);
        return {
          year,
          months: yearRows.length,
          communities: minimumCommunities === maximumCommunities
            ? integer(minimumCommunities)
            : `${integer(minimumCommunities)} to ${integer(maximumCommunities)}`,
          average: average(yearRows.map((row) => row.census)),
          first: first?.census ?? 0,
          last: last?.census ?? 0,
          change: stableCommunitySet
            ? number(last?.census) - number(first?.census)
            : null
        };
      });
    const flowSourceRows = toolContextRows(
      summary,
      "residentFlowMonthlyByCommunity",
      "resident_flow_monthly_by_community"
    ).filter((row) => !request.facilityId || text(row.facility_id) === request.facilityId);
    const flow = latestMonthRows(flowSourceRows, request.period);
    const annualFlow = annualFlowRows(flowSourceRows, request.period);
    const flowTotals = flow.rows.reduce(
      (result, row) => ({
        admissions: result.admissions + number(row.admissions),
        discharges: result.discharges + number(row.discharges),
        net: result.net + number(row.net_change)
      }),
      { admissions: 0, discharges: 0, net: 0 }
    );
    const censusFacilityIds = new Set(rows.rows.map((row) => text(row.facility_id)).filter(Boolean));
    const flowFacilityIds = new Set(flow.rows.map((row) => text(row.facility_id)).filter(Boolean));
    const flowCoveredCommunities = [...censusFacilityIds].filter(
      (facilityId) => flowFacilityIds.has(facilityId)
    ).length;
    const flowComplete = flow.rows.length > 0 &&
      flowCoveredCommunities === censusFacilityIds.size;
    const flowCoverage = `${integer(flowCoveredCommunities)} of ${integer(censusFacilityIds.size)} communities`;
    const flowSummaryText = !flow.rows.length
      ? ""
      : flowComplete
        ? ` That month had ${integer(flowTotals.admissions)} admissions and ${integer(flowTotals.discharges)} discharges, for net movement of ${signed(flowTotals.net)} residents.`
        : ` Resident flow records cover ${flowCoverage} and contain ${integer(flowTotals.admissions)} admissions and ${integer(flowTotals.discharges)} discharges, for reported net movement of ${signed(flowTotals.net)} residents.`;
    const total = rows.rows.reduce((sum, row) => sum + number(row.census), 0);
    return buildBaseReport({
      request,
      definition,
      title: request.facilityId ? `${scopeLabel} census and resident flow` : definition.title,
      summary: `${scopeLabel} reported a census of ${integer(total)} for ${formatMonthLabel(rows.period, { fallback: "the latest month" })}.${flowSummaryText} The historical series uses governed census records rather than current resident-roster rows.`,
      scope,
      period: { value: rows.period, label: formatMonthLabel(rows.period, { fallback: "Latest month" }) },
      generatedAt,
      dataThrough,
      freshness,
      metrics: [
        { label: "Census", value: integer(total), detail: formatMonthLabel(rows.period, { fallback: "Latest month" }) },
        { label: "Communities", value: integer(rows.rows.length), detail: request.facilityId ? "Selected community" : "Reporting this month" },
        ...(flow.rows.length ? [
          {
            label: flowComplete ? "Admissions" : "Reported admissions",
            value: integer(flowTotals.admissions),
            detail: `${formatMonthLabel(flow.period, { fallback: "Latest month" })}${flowComplete ? "" : `; ${flowCoverage}`}`
          },
          {
            label: flowComplete ? "Discharges" : "Reported discharges",
            value: integer(flowTotals.discharges),
            detail: `${flowComplete ? "Net" : "Reported net"} movement ${signed(flowTotals.net)}`
          }
        ] : []),
        {
          label: "History loaded",
          value: `${integer(monthlyCensus.length)} months`,
          detail: monthlyCensus[0]
            ? `Since ${formatMonthLabel(monthlyCensus[0].month, { fallback: monthlyCensus[0].month })}${hasCoverageChanges ? "; community coverage varies" : ""}`
            : "No historical census loaded"
        }
      ],
      sections: [
        {
          id: "census-trend",
          title: "Census trend",
          intro: `The chart shows the latest ${integer(recentCensusTrend.length)} consecutive months with the same reporting-community set through ${formatMonthLabel(rows.period, { fallback: "the selected period" })}. Annual context below retains all ${integer(monthlyCensus.length)} loaded months and identifies coverage changes.`,
          blocks: [{
            type: "line_chart",
            label: request.facilityId ? `${scopeLabel} monthly census` : "Portfolio monthly census",
            items: recentCensusTrend
          }]
        },
        ...(!request.facilityId ? [{
          id: "selected-community-position",
          title: "Selected month by community",
          intro: `${formatMonthLabel(rows.period, { fallback: "The selected month" })} census is shown for each reporting community.`,
          blocks: [barList(rows.rows.map((row) => ({
            label: names.get(text(row.facility_id)) ?? scopeLabel,
            value: number(row.census),
            displayValue: integer(row.census)
          })))]
        }] : []),
        {
          id: "annual-census-summary",
          title: "Annual census context",
          intro: `Each row summarizes the loaded monthly ${request.facilityId ? scopeLabel : "portfolio"} census within that calendar year. Partial years remain partial and are not annualized. First-to-last change is marked not comparable when the reporting-community set changed during the year.`,
          blocks: [table(
            [
              { key: "year", label: "Year" },
              { key: "months", label: "Months loaded" },
              { key: "communities", label: "Communities reporting" },
              { key: "average", label: "Average reported census" },
              { key: "first", label: "First-month census" },
              { key: "last", label: "Last-month census" },
              { key: "change", label: "First-to-last change" }
            ],
            annualCensus.map((row) => ({
              year: row.year,
              months: integer(row.months),
              communities: row.communities,
              average: integer(row.average),
              first: integer(row.first),
              last: integer(row.last),
              change: row.change == null ? "Not comparable" : signed(row.change)
            }))
          )]
        },
        ...(flow.rows.length ? [{
          id: "resident-flow",
          title: "Admissions and discharges",
          intro: `${formatMonthLabel(flow.period, { fallback: "The latest month" })} resident movement is shown for ${flowComplete ? "every reporting community" : flowCoverage}. Missing community records are not treated as zero.`,
          blocks: [table(
            [
              { key: "community", label: "Community" },
              { key: "admissions", label: "Admissions" },
              { key: "discharges", label: "Discharges" },
              { key: "net", label: "Net change" }
            ],
            [...flow.rows]
              .sort((left, right) => number(right.net_change) - number(left.net_change))
              .map((row) => ({
                community: names.get(text(row.facility_id)) || text(row.facility_name) || scopeLabel,
                admissions: integer(row.admissions),
                discharges: integer(row.discharges),
                net: signed(row.net_change)
              }))
          )]
        }] : []),
        ...(annualFlow.length ? [{
          id: "annual-resident-flow",
          title: "Annual reported resident flow",
          intro: `Annual totals use the latest contiguous series of loaded resident-flow years through ${formatMonthLabel(rows.period, { fallback: "the selected period" })}. Communities represented identifies scope but does not imply every community-month is present. Disconnected legacy years are excluded, missing records are not treated as zero, and the latest year is year-to-date when fewer than 12 months are loaded.`,
          blocks: [table(
            [
              { key: "year", label: "Year" },
              { key: "communities", label: "Communities represented" },
              { key: "admissions", label: "Admissions" },
              { key: "discharges", label: "Discharges" },
              { key: "net", label: "Net movement" }
            ],
            annualFlow.map((row) => ({
              year: row.year,
              communities: integer(row.communities),
              admissions: integer(row.admissions),
              discharges: integer(row.discharges),
              net: signed(row.net)
            }))
          )]
        }] : [])
      ],
      sources: [
        evidence("census_monthly_by_community", history),
        ...(flow.rows.length ? [evidence("resident_flow_monthly_by_community", flowSourceRows)] : [])
      ]
    });
  }

  if (request.reportId === "incidents") {
    const allRows = (communities.incidents ?? []).filter(
      (row) => !request.facilityId || text(row.facility_id) === request.facilityId
    );
    const historyRows = allRows.filter(
      (row) => !request.period || text(row.month_bucket) <= request.period
    );
    const rows = latestMonthRows(allRows, request.period);
    const total = rows.rows.reduce((sum, row) => sum + number(row.incident_count), 0);
    const categoryTotals = new Map();
    rows.rows.forEach((row) => {
      const label = text(row.category) || "Other";
      categoryTotals.set(label, (categoryTotals.get(label) ?? 0) + number(row.incident_count));
    });
    const categories = [...categoryTotals.entries()]
      .map(([label, value]) => ({ label, value, displayValue: integer(value) }))
      .sort((left, right) => right.value - left.value);
    const top = categories[0];
    const incidentsByMonth = new Map();
    for (const row of historyRows) {
      const month = text(row.month_bucket);
      if (!month) continue;
      const current = incidentsByMonth.get(month) ?? { incidents: 0, facilityIds: new Set() };
      current.incidents += number(row.incident_count);
      const facilityId = text(row.facility_id);
      if (facilityId) current.facilityIds.add(facilityId);
      incidentsByMonth.set(month, current);
    }
    const incidentMonths = [...incidentsByMonth.entries()]
      .map(([month, entry]) => ({
        month,
        incidents: entry.incidents,
        facilityKey: [...entry.facilityIds].sort().join(",")
      }))
      .sort((left, right) => left.month.localeCompare(right.month));
    const latestIncidentFacilityKey = incidentMonths.at(-1)?.facilityKey;
    let comparableIncidentStart = incidentMonths.length - 1;
    while (
      comparableIncidentStart > 0 &&
      incidentMonths[comparableIncidentStart - 1]?.facilityKey === latestIncidentFacilityKey
    ) {
      comparableIncidentStart -= 1;
    }
    const comparableIncidentMonths = incidentMonths
      .slice(Math.max(0, comparableIncidentStart))
      .slice(-12);
    const incidentCoverageChanged = new Set(
      incidentMonths.map((row) => row.facilityKey)
    ).size > 1;
    const communitySummaries = incidentCommunitySummaries(rows.rows, names);
    const incidentTrend = comparableIncidentMonths.map((row) => ({
      label: formatMonthLabel(row.month, { fallback: row.month }),
      value: row.incidents,
      displayValue: integer(row.incidents)
    }));
    const severity = incidentSeverityForPeriod(
      communities.incidentDetails,
      rows.period,
      request.facilityId,
      total
    );
    return buildBaseReport({
      request,
      definition,
      title: request.facilityId ? `${scopeLabel} incident report` : definition.title,
      summary: `${scopeLabel} recorded ${integer(total)} incidents in ${formatMonthLabel(rows.period, { fallback: "the latest month" })}. ${top ? `${top.label} was the largest category with ${top.displayValue}.` : "The report keeps the available category and community detail together."}`,
      scope,
      period: { value: rows.period, label: formatMonthLabel(rows.period, { fallback: "Latest month" }) },
      generatedAt,
      dataThrough,
      freshness,
      metrics: [
        { label: "Incidents", value: integer(total), detail: formatMonthLabel(rows.period, { fallback: "Latest month" }) },
        { label: "Categories", value: integer(categories.length), detail: "Categories represented" },
        { label: "Largest category", value: top?.displayValue ?? "0", detail: top?.label ?? "No category" },
        {
          label: "History loaded",
          value: `${integer(incidentMonths.length)} months`,
          detail: incidentCoverageChanged
            ? "Reporting-community coverage varies"
            : "Monthly incident trend"
        }
      ],
      sections: [
        ...(incidentTrend.length > 1 ? [{
          id: "incident-trend",
          title: "Incident trend",
          intro: `The chart shows the latest ${integer(incidentTrend.length)} consecutive months with the same reporting-community set through ${formatMonthLabel(rows.period, { fallback: "the selected period" })}. ${integer(incidentMonths.length)} total incident months are loaded.`,
          blocks: [{ type: "line_chart", label: "Monthly incidents", items: incidentTrend }]
        }] : []),
        {
          id: "category-mix",
          title: "Incident category mix",
          blocks: [barList(categories.slice(0, 12))]
        },
        ...(!request.facilityId ? [{
          id: "community-comparison",
          title: "Community comparison",
          intro: `Community totals and largest categories are aggregated for ${formatMonthLabel(rows.period, { fallback: "the selected month" })}; repeated source rows are not presented as separate findings.`,
          blocks: [table(
            [
              { key: "community", label: "Community" },
              { key: "incidents", label: "Incidents" },
              { key: "largestCategory", label: "Largest category" },
              { key: "largestCategoryCount", label: "Category incidents" }
            ],
            communitySummaries.map((row) => ({
              community: row.community,
              incidents: integer(row.incidents),
              largestCategory: row.largestCategory,
              largestCategoryCount: row.largestCategoryCount == null
                ? "Not available"
                : integer(row.largestCategoryCount)
            }))
          )]
        }] : []),
        ...(severity ? [{
          id: "incident-severity",
          title: "Incident severity indicators",
          intro: `All ${integer(severity.rows.length)} incident details reconcile to the governed total for ${formatMonthLabel(rows.period, { fallback: "the selected period" })}.`,
          blocks: [{
            type: "metric_grid",
            items: [
              { label: "Incidents with injury", value: integer(severity.injuries) },
              { label: "Police called", value: integer(severity.policeCalled) },
              { label: "Sentinel events", value: integer(severity.sentinelEvents) },
              { label: "Residents represented", value: integer(severity.residents) }
            ]
          }]
        }] : [])
      ],
      sources: [
        evidence("incident_monthly_by_community_category", historyRows),
        ...(severity ? [evidence("incident_detail_history", severity.rows)] : [])
      ]
    });
  }

  if (request.reportId === "medications") {
    const complianceSourceRows = (summary.medicationCompliance ?? []).filter(
      (row) =>
        (!request.facilityId || text(row.facility_id) === request.facilityId) &&
        (!request.period || text(row.month_bucket) <= request.period)
    );
    const compliance = latestMonthRows(complianceSourceRows, request.period);
    const weighted = weightedCompliance(compliance.rows);
    const complianceByMonth = new Map();
    for (const row of complianceSourceRows) {
      const month = text(row.month_bucket);
      if (!month) continue;
      const current = complianceByMonth.get(month) ?? { rows: [], facilityIds: new Set() };
      current.rows.push(row);
      const facilityId = text(row.facility_id);
      if (facilityId) current.facilityIds.add(facilityId);
      complianceByMonth.set(month, current);
    }
    const complianceMonths = [...complianceByMonth.entries()]
      .map(([month, entry]) => ({
        month,
        rows: entry.rows,
        facilityKey: [...entry.facilityIds].sort().join(",")
      }))
      .sort((left, right) => left.month.localeCompare(right.month));
    const latestComplianceFacilityKey = complianceMonths.at(-1)?.facilityKey;
    let comparableComplianceStart = complianceMonths.length - 1;
    while (
      comparableComplianceStart > 0 &&
      complianceMonths[comparableComplianceStart - 1]?.facilityKey === latestComplianceFacilityKey
    ) {
      comparableComplianceStart -= 1;
    }
    const comparableComplianceMonths = complianceMonths
      .slice(Math.max(0, comparableComplianceStart))
      .slice(-12);
    const complianceTrend = comparableComplianceMonths.map((entry) => {
      const monthWeighted = weightedCompliance(entry.rows);
      return {
        label: formatMonthLabel(entry.month, { fallback: entry.month, month: "short" }),
        value: monthWeighted.percentage,
        displayValue: percent(monthWeighted.percentage)
      };
    });
    const refusalItems = refusalItemsForPeriod(
      summary,
      request.facilityId,
      compliance.period,
      12
    );
    const burden = request.period
      ? null
      : medicationBurden(summary, request.facilityId, scopeRows);
    const burdenByCommunity = burden && !request.facilityId
      ? [...new Set(burden.rows.map((row) => text(row.facility_id)).filter(Boolean))]
          .flatMap((facilityId) => {
            const communityBurden = medicationBurden(
              summary,
              facilityId,
              scopeRows.filter((row) => text(row.facility_id) === facilityId)
            );
            return communityBurden ? [{
              facilityId,
              community: names.get(facilityId) ?? `Facility ${facilityId}`,
              burden: communityBurden
            }] : [];
          })
          .sort((left, right) => left.community.localeCompare(right.community))
      : [];
    return buildBaseReport({
      request,
      definition,
      title: request.facilityId ? `${scopeLabel} medication performance report` : definition.title,
      summary: `${scopeLabel} recorded ${percent(weighted.percentage)} scheduled medication completion in ${formatMonthLabel(compliance.period, { fallback: "the latest month" })}, with ${integer(weighted.notCompleted)} scheduled administrations not completed.`,
      scope,
      period: { value: compliance.period, label: formatMonthLabel(compliance.period, { fallback: "Latest month" }) },
      generatedAt,
      dataThrough,
      freshness,
      metrics: [
        { label: "Completion", value: percent(weighted.percentage), detail: formatMonthLabel(compliance.period, { fallback: "Latest month" }) },
        { label: "Scheduled", value: integer(weighted.scheduled), detail: "Governed scheduled administrations" },
        { label: "Given", value: integer(weighted.given), detail: "Recorded as given" },
        { label: "Not completed", value: integer(weighted.notCompleted), detail: "Scheduled minus given" }
      ],
      sections: [
        ...(complianceTrend.length > 1 ? [{
          id: "compliance-trend",
          title: "Monthly completion trend",
          intro: `${scopeLabel} completion is weighted from scheduled and given administrations for the latest ${integer(complianceTrend.length)} consecutive months with the same reporting-community set through ${formatMonthLabel(compliance.period, { fallback: "the selected month" })}.`,
          blocks: [{
            type: "line_chart",
            label: "Weighted scheduled-administration completion",
            items: complianceTrend
          }]
        }] : []),
        {
          id: "administration-detail",
          title: "Community administration performance",
          intro: `Community totals and weighted completion rates are shown for ${formatMonthLabel(compliance.period, { fallback: "the selected month" })}.`,
          blocks: [table(
            [
              { key: "community", label: "Community" },
              { key: "scheduled", label: "Scheduled" },
              { key: "given", label: "Given" },
              { key: "notGiven", label: "Not completed" },
              { key: "compliance", label: "Completion" }
            ],
            [...compliance.rows]
              .sort((left, right) => number(left.compliance_pct) - number(right.compliance_pct))
              .map((row) => ({
                community: names.get(text(row.facility_id)) || text(row.facility_name),
                scheduled: integer(row.total_scheduled),
                given: integer(row.given),
                notGiven: integer(scheduledNotCompleted(row)),
                compliance: percent(row.compliance_pct)
              }))
          )]
        },
        ...(refusalItems.length ? [{
          id: "refusal-concentration",
          title: "Refusal concentration",
          blocks: [barList(refusalItems)]
        }] : []),
        ...(burden ? [{
          id: "current-medication-burden",
          title: "Current resident medication burden",
          intro: "These current resident-level 30-day measures are separate from the monthly weighted scheduled-administration rate above.",
          blocks: [
            {
              type: "metric_grid",
              items: medicationBurdenItems(burden, true)
            },
            ...(burdenByCommunity.length ? [table(
              [
                { key: "community", label: "Community" },
                { key: "residents", label: "Residents" },
                { key: "active", label: "Average active medications" },
                { key: "psychotropics", label: "Average psychotropics" },
                { key: "compliance", label: "Average resident compliance" },
                { key: "prn", label: "PRN follow-up" }
              ],
              burdenByCommunity.map((row) => ({
                community: row.community,
                residents: integer(row.burden.rows.length),
                active: row.burden.averageActiveMedications == null
                  ? "Not available"
                  : decimalFormatter.format(row.burden.averageActiveMedications),
                psychotropics: row.burden.averagePsychotropics == null
                  ? "Not available"
                  : decimalFormatter.format(row.burden.averagePsychotropics),
                compliance: row.burden.averageResidentCompliance == null
                  ? "Not available"
                  : percent(row.burden.averageResidentCompliance),
                prn: row.burden.prnFollowupPercentage == null
                  ? "Not available"
                  : percent(row.burden.prnFollowupPercentage)
              }))
            )] : [])
          ]
        }] : [])
      ],
      sources: [
        evidence("medication_compliance_monthly", complianceSourceRows),
        ...(refusalItems.length ? [evidence("mar_monthly_by_community_medication", refusalItems)] : []),
        ...(burden ? [evidence("mar_resident_summary", burden.rows)] : [])
      ]
    });
  }

  const population = residentPopulationSummary(scopeRows);
  const diagnoses = topCounts(population.residents, "primary_diagnosis", 12);
  const stayDistribution = lengthOfStayDistribution(population);
  const currentCensus = latestMonthRows(
    (summary.census ?? []).filter(
      (row) => !request.facilityId || text(row.facility_id) === request.facilityId
    )
  );
  const censusByFacility = currentCensus.rows.reduce((map, row) => {
    const facilityId = text(row.facility_id);
    if (!facilityId) return map;
    map.set(facilityId, (map.get(facilityId) ?? 0) + number(row.census));
    return map;
  }, new Map());
  const communityProfiles = request.facilityId
    ? []
    : [...new Set(population.residents.map((row) => text(row.facility_id)).filter(Boolean))]
        .map((facilityId) => {
          const profile = residentPopulationSummary(
            population.residents.filter((row) => text(row.facility_id) === facilityId)
          );
          return {
            community: names.get(facilityId) ?? `Facility ${facilityId}`,
            census: censusByFacility.get(facilityId),
            profile
          };
        })
        .sort((left, right) => left.community.localeCompare(right.community));
  const hasCommunityCensus = communityProfiles.some((row) => row.census != null);
  const hasSpectrumProfile = communityProfiles.length > 0 && communityProfiles.every(
    (row) => row.profile.schizophreniaSpectrumPercentage != null
  );
  const communityProfileColumns = [
    { key: "community", label: "Community" },
    { key: "profiles", label: "Profile rows" },
    ...(hasCommunityCensus ? [{ key: "census", label: "Latest governed census" }] : []),
    { key: "averageAge", label: "Average age" },
    { key: "medianStay", label: "Median stay" },
    { key: "overOneYear", label: "Stays over one year" },
    ...(hasSpectrumProfile ? [{ key: "spectrum", label: "Schizophrenia-spectrum" }] : [])
  ];
  const populationSummaryText = [
    `${scopeLabel} has ${integer(population.residents.length)} current resident profile rows.`,
    ...(population.averageAge == null
      ? []
      : [`Average age is ${decimalFormatter.format(population.averageAge)} years.`]),
    ...(population.medianStay == null
      ? []
      : [`Median length of stay is ${integer(population.medianStay)} days.`]),
    ...(population.overOneYearPercentage == null
      ? []
      : [`${percent(population.overOneYearPercentage)} of current profiles have a stay longer than one year.`])
  ].join(" ");
  return buildBaseReport({
    request,
    definition,
    title: request.facilityId ? `${scopeLabel} resident population` : definition.title,
    summary: populationSummaryText,
    scope,
    period: { value: request.period ?? home.reporting_month, label: "Current resident population" },
    generatedAt,
    dataThrough,
    freshness,
    metrics: [
      { label: "Profile rows", value: integer(population.residents.length), detail: "Current governed extract" },
      ...residentPopulationItems(population).map((item) => ({
        ...item,
        label: item.label === "Stay over one year" ? "Stays over one year" : item.label,
        detail: item.label === "Stay over one year"
          ? `${integer(population.overOneYear)} current residents`
          : "Current profile"
      })),
      ...(population.diagnosisRecordedPercentage == null ? [] : [{
        label: "Primary diagnosis populated",
        value: percent(population.diagnosisRecordedPercentage),
        detail: `${integer(population.diagnosisRecorded)} of ${integer(population.residents.length)} profile rows`
      }])
    ],
    sections: [
      {
        id: "diagnosis-mix",
        title: "Primary diagnosis labels",
        intro: `The ${integer(diagnoses.length)} most common nonblank primary-diagnosis labels are shown exactly as recorded in the current profile extract. Similar source labels are not clinically combined in this report.`,
        blocks: [barList(diagnoses)]
      },
      ...(communityProfiles.length ? [{
        id: "community-profile",
        title: "Community population profile",
        intro: `Current resident-profile rows support age measures and length-of-stay measures where every source value is nonnegative. ${hasCommunityCensus ? `Governed census for ${formatMonthLabel(currentCensus.period, { fallback: "the latest loaded month" })} is shown separately and is not derived from profile-row counts.` : "Profile-row counts are not treated as census."}`,
        blocks: [table(
          communityProfileColumns,
          communityProfiles.map((row) => ({
            community: row.community,
            profiles: integer(row.profile.residents.length),
            census: row.census == null ? "Not available" : integer(row.census),
            averageAge: row.profile.averageAge == null
              ? "Not available"
              : `${decimalFormatter.format(row.profile.averageAge)} years`,
            medianStay: row.profile.medianStay == null
              ? "Not available"
              : `${integer(row.profile.medianStay)} days`,
            overOneYear: row.profile.overOneYearPercentage == null
              ? "Not available"
              : percent(row.profile.overOneYearPercentage),
            spectrum: row.profile.schizophreniaSpectrumPercentage == null
              ? "Not available"
              : percent(row.profile.schizophreniaSpectrumPercentage)
          }))
        )]
      }] : []),
      ...(stayDistribution.length ? [{
        id: "length-of-stay-distribution",
        title: "Length-of-stay distribution",
        intro: "Current profile rows are grouped into non-overlapping length-of-stay bands; no resident-level names are included.",
        blocks: [barList(stayDistribution)]
      }] : [])
    ],
    sources: [evidence("resident_profile", population.residents, "Operational placeholder profiles excluded")]
  });
}

export function compileFullReportFromContext(requestValue, inputs) {
  const request = normalizeFullReportRequest(requestValue);
  const definition = getFullReportDefinition(request.reportId);
  const { home, summary, communities, community = null } = inputs;
  if (!home || !summary || !communities) {
    throw new Error("Full report compilation requires home, summary, and community dashboard inputs.");
  }
  if (request.reportId === "community" && !community) {
    throw new Error("Full community report compilation requires a community snapshot.");
  }
  if (request.period) {
    const availablePeriods = getAvailableFullReportPeriods(request, { summary, communities });
    if (!availablePeriods.includes(request.period)) {
      throw new Error(
        `${formatMonthLabel(request.period, { fallback: request.period })} is not available for this report and scope.`
      );
    }
  }
  const generatedAt = text(home.generated_at) || new Date().toISOString();
  const dataThrough = request.period
    ? formatMonthLabel(request.period, { fallback: request.period })
    : formatDisplayDate(
        home.operational?.latestCensusWeek ?? communities.as_of_date ?? generatedAt,
        { fallback: formatMonthLabel(home.reporting_month, { fallback: "latest governed data" }) }
      );
  const snapshotStatus = home.snapshot_status;
  const snapshotGeneratedAt = text(snapshotStatus?.generated_at);
  const missingFreshnessContract = !snapshotStatus || !snapshotGeneratedAt;
  const freshness = {
    status: snapshotStatus?.stale || missingFreshnessContract ? "stale" : "current",
    generatedAt: snapshotGeneratedAt || generatedAt,
    ...(snapshotStatus?.warning
      ? { warning: text(snapshotStatus.warning) }
      : missingFreshnessContract
        ? { warning: "Snapshot freshness metadata is unavailable. Confirm the latest publish completed before using this report." }
        : {}),
    ...(Number.isFinite(snapshotStatus?.ageHours) ? { ageHours: snapshotStatus.ageHours } : {})
  };
  const context = {
    request,
    definition,
    home,
    summary,
    communities,
    community,
    generatedAt,
    dataThrough,
    freshness
  };
  return request.reportId === "overview"
    ? buildOverviewReport(context)
    : request.reportId === "community"
      ? buildCommunityReport(context)
      : request.reportId === "effectiveness"
        ? buildEffectivenessReport(context)
      : buildFocusedReport(context);
}

export async function createFullReport(requestValue) {
  const request = normalizeFullReportRequest(requestValue);
  const [home, summary, communities] = await Promise.all([
    getHomeDashboardData(),
    getReportsSummaryData({ includeAnalystHistory: false }),
    getCommunitiesDashboardData()
  ]);
  const community = request.reportId === "community"
    ? await getCommunitySnapshotData(request.facilityId)
    : null;
  const report = compileFullReportFromContext(request, {
    home,
    summary,
    communities,
    community
  });
  const availablePeriods = getAvailableFullReportPeriods(request, {
    summary,
    communities
  });
  const html = renderFullReportHtml(report);
  const filename = `${request.reportId}-${request.facilityId ?? "portfolio"}-${request.period ?? "latest"}.html`;
  return { report, html, filename, availablePeriods };
}

export function getFullReportDefinitions() {
  return {
    version: FULL_REPORT_VERSION,
    reports: FULL_REPORT_DEFINITIONS.map((definition) => ({ ...definition }))
  };
}
