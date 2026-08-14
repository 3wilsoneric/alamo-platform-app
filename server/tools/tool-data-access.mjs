import { wantsAllRows } from "./table-artifacts.mjs";

export function createToolDataAccess({ normalizeText }) {
  function limitRowsForRequest(rows, content, defaultLimit, maximum = 500) {
    const limit = wantsAllRows(content) ? maximum : defaultLimit;
    return rows.slice(0, limit);
  }

  function getFacilityMaps(communities) {
    const byId = new Map();
    const aliases = new Map();

    communities.facilities.forEach((facility) => {
      byId.set(facility.facility_id, facility);

      const normalizedName = normalizeText(facility.community_name);
      aliases.set(normalizedName, facility);
      aliases.set(normalizeText(facility.community_code), facility);

      if (normalizedName.includes("san pablo")) {
        aliases.set("san pablo", facility);
        aliases.set("pablo", facility);
      }
      if (normalizedName.includes("santa clarita")) {
        aliases.set("santa clarita", facility);
        aliases.set("clarita", facility);
      }
      if (normalizedName.includes("victoria")) {
        aliases.set("victoria", facility);
        aliases.set("victoria house", facility);
        aliases.set("victorias house", facility);
      }
      if (normalizedName.includes("wallace")) {
        aliases.set("jc wallace", facility);
        aliases.set("wallace", facility);
      }
      if (normalizedName.includes("turlock")) aliases.set("turlock", facility);
    });

    return { byId, aliases };
  }

  function findFacility(content, communities) {
    const normalized = normalizeText(content);
    const { aliases } = getFacilityMaps(communities);
    const aliasEntries = [...aliases.entries()].sort((left, right) => right[0].length - left[0].length);
    return aliasEntries.find(([alias]) => alias && normalized.includes(alias))?.[1] ?? null;
  }

  function findResident(content, communities) {
    const normalized = normalizeText(content);
    const nameMatches = communities.residents
      .map((resident) => ({
        resident,
        fullName: normalizeText(`${resident.first_name} ${resident.last_name}`),
        reverseName: normalizeText(`${resident.last_name} ${resident.first_name}`)
      }))
      .filter(({ fullName, reverseName, resident }) => {
        const first = normalizeText(resident.first_name);
        const last = normalizeText(resident.last_name);
        return (
          (fullName && normalized.includes(fullName)) ||
          (reverseName && normalized.includes(reverseName)) ||
          (first && last && normalized.includes(first) && normalized.includes(last)) ||
          (resident.res_number && normalized.includes(normalizeText(resident.res_number)))
        );
      })
      .sort((left, right) => right.fullName.length - left.fullName.length);

    return nameMatches[0]?.resident ?? null;
  }

  function latestMonth(rows, key = "month_bucket") {
    return [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort().at(-1) ?? null;
  }

  function firstPresent(row, keys) {
    for (const key of keys) {
      if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
    }
    return null;
  }

  function normalizeMonthBucket(value) {
    if (!value) return null;
    const text = String(value);
    const match = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/);
    if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
    const dateParts = text.match(/\b(\d{1,4})[!/.](\d{1,2})[!/.](\d{1,4})\b/);
    if (dateParts) {
      const [, first, second, third] = dateParts;
      if (!first || !second || !third) return text.slice(0, 7);
      const isYearFirst = first.length === 4;
      const year = isYearFirst ? first : third;
      const month = second;
      if (/^20\d{2}$/.test(year) && Number(month) >= 1 && Number(month) <= 12) {
        return `${year}-${String(Number(month)).padStart(2, "0")}`;
      }
    }
    const monthFirstMatch = text.match(/\b(0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])[-/](20\d{2})\b/);
    if (monthFirstMatch) return `${monthFirstMatch[3]}-${String(Number(monthFirstMatch[1])).padStart(2, "0")}`;
    return text.slice(0, 7);
  }

  function filterByFacility(rows, facility) {
    if (!facility) return rows;
    return rows.filter((row) => row.facility_id === facility.facility_id);
  }

  function average(values) {
    const clean = values.map(Number).filter((value) => Number.isFinite(value));
    if (!clean.length) return 0;
    return clean.reduce((sum, value) => sum + value, 0) / clean.length;
  }

  function countBy(rows, getKey) {
    const counts = new Map();
    rows.forEach((row) => {
      const key = getKey(row) || "Unspecified";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }

  function countBySum(rows, getKey, getValue = (_row) => 1) {
    const counts = new Map();
    rows.forEach((row) => {
      const key = getKey(row) || "Unspecified";
      counts.set(key, (counts.get(key) ?? 0) + Number(getValue(row) || 0));
    });
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }

  function getScopedCensusSeries(rows, facility) {
    const scopedRows = filterByFacility(rows ?? [], facility);
    if (facility) {
      return [...scopedRows].sort((left, right) => String(left.month_bucket).localeCompare(String(right.month_bucket)));
    }

    return countBySum(scopedRows, (row) => row.month_bucket, (row) => row.census)
      .map(([month_bucket, census]) => ({ month_bucket, census }))
      .sort((left, right) => String(left.month_bucket).localeCompare(String(right.month_bucket)));
  }

  function sumIncidentCountsByKey(rows, getKey) {
    return countBySum(rows, getKey, (row) => row.incident_count);
  }

  function calculateWeightedCompliance(rows) {
    const scheduled = sum(rows, (row) => row.total_scheduled);
    const given = sum(rows, (row) => row.given);
    if (scheduled > 0) return { scheduled, given, compliancePct: (given / scheduled) * 100 };

    const percentages = rows
      .map((row) => Number(row.compliance_pct))
      .filter((value) => Number.isFinite(value));
    return {
      scheduled: 0,
      given: 0,
      compliancePct: percentages.length ? average(percentages) : null
    };
  }

  function groupRowsByKey(rows, getKey) {
    const groups = new Map();
    rows.forEach((row) => {
      const key = getKey(row) || "Unspecified";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return groups;
  }

  function sum(rows, getValue) {
    return rows.reduce((total, row) => total + Number(getValue(row) || 0), 0);
  }

  function getFacilityLabel(facility) {
    return facility?.community_name ?? facility?.facility_name ?? facility?.facility_id ?? "Portfolio";
  }

  function getLatestRows(rows, key = "month_bucket") {
    const month = latestMonth(rows, key);
    return {
      month,
      rows: rows.filter((row) => row[key] === month)
    };
  }

  function getCommunityMetrics(communities, reportsSummary, facility) {
    const preparedRows = reportsSummary.toolContext?.communityOperatingSummary ?? [];
    const preparedRow = facility
      ? preparedRows.find((row) => row.facility_id === facility.facility_id)
      : null;
    if (preparedRow) {
      return {
        facility,
        communityName: preparedRow.facility_name ?? getFacilityLabel(facility),
        residents: Number(preparedRow.resident_rows || 0),
        census: preparedRow.census == null ? null : Number(preparedRow.census),
        censusMonth: preparedRow.census_month ?? null,
        censusDelta: preparedRow.census_delta ?? null,
        incidents: Number(preparedRow.incidents || 0),
        incidentMonth: preparedRow.incident_month ?? null,
        incidentDelta: null,
        incidentsPer100:
          preparedRow.incidents_per_100_residents == null
            ? null
            : Number(preparedRow.incidents_per_100_residents),
        averageAge: Number(preparedRow.average_age || 0),
        averageLos: Number(preparedRow.average_los_days || 0),
        compliancePct: preparedRow.compliance_pct == null ? null : Number(preparedRow.compliance_pct),
        complianceMonth: preparedRow.medication_month ?? null
      };
    }

    const residents = filterByFacility(communities.residents ?? [], facility);
    const censusRows = getScopedCensusSeries(communities.census ?? [], facility);
    const incidentRows = filterByFacility(getIncidentRows(communities, reportsSummary), facility);
    const complianceRows = filterByFacility(reportsSummary.medicationCompliance ?? [], facility);
    const latestCensus = censusRows.at(-1) ?? null;
    const priorCensus = censusRows.at(-2) ?? null;
    const { latestMonth: incidentMonth, priorMonth: priorIncidentMonth } = getLatestAndPrior(incidentRows);
    const latestIncidents = sum(incidentRows.filter((row) => row.month_bucket === incidentMonth), (row) => row.incident_count);
    const priorIncidents = sum(incidentRows.filter((row) => row.month_bucket === priorIncidentMonth), (row) => row.incident_count);
    const { month: complianceMonth, rows: latestComplianceRows } = getLatestRows(complianceRows);
    const { compliancePct } = calculateWeightedCompliance(latestComplianceRows);

    const census = latestCensus?.census == null
      ? null
      : Number(latestCensus.census);

    return {
      facility,
      communityName: getFacilityLabel(facility),
      residents: residents.length,
      census,
      censusMonth: latestCensus?.month_bucket ?? null,
      censusDelta: latestCensus && priorCensus ? Number(latestCensus.census || 0) - Number(priorCensus.census || 0) : null,
      incidents: latestIncidents,
      incidentMonth,
      incidentDelta: priorIncidentMonth ? latestIncidents - priorIncidents : null,
      incidentsPer100:
        census && census > 0 ? (latestIncidents / census) * 100 : null,
      averageAge: average(residents.map((resident) => resident.age)),
      averageLos: average(residents.map((resident) => resident.los_days)),
      compliancePct,
      complianceMonth
    };
  }

  function getIncidentRows(communities, reportsSummary) {
    const prepared = reportsSummary.toolContext?.incidentMonthlyByCommunityCategory;
    if (Array.isArray(prepared) && prepared.length) {
      return prepared.map((row) => ({
        facility_id: String(firstPresent(row, ["facility_id", "Facility", "facility", "facilityId"]) ?? ""),
        facility_name: firstPresent(row, ["facility_name", "Facility_Name", "community_name", "Community", "facilityName"]),
        category: firstPresent(row, ["category", "Incident_Category", "incident_category", "incidentType", "incident_type"]),
        month_bucket: normalizeMonthBucket(firstPresent(row, ["month_bucket", "Month_Bucket", "month", "period", "reporting_month"])),
        incident_count: Number(firstPresent(row, ["incident_count", "Incident_Count", "incidents", "count", "total"]) || 0),
        resident_count: Number(firstPresent(row, ["resident_count", "Resident_Count", "residents"]) || 0),
        latest_incident_date: firstPresent(row, ["latest_incident_date", "Latest_Incident_Date", "incident_date"])
      }));
    }

    return (communities.incidents ?? []).map((row) => ({
      ...row,
      month_bucket: normalizeMonthBucket(row.month_bucket)
    }));
  }

  function getIncidentDetailRows(communities, reportsSummary) {
    const candidates = [
      reportsSummary.toolContext?.incidentDetailHistory,
      reportsSummary.toolContext?.tables?.incident_detail_history,
      reportsSummary.toolContext?.currentIncidentDetails,
      reportsSummary.toolContext?.tables?.incident_detail_current_month,
      communities.incidentDetails
    ].filter((rows) => Array.isArray(rows) && rows.length);
    if (!candidates.length) return [];
    return candidates.sort((left, right) => {
      const leftMonths = new Set(left.map((row) => normalizeMonthBucket(row.month_bucket)).filter(Boolean)).size;
      const rightMonths = new Set(right.map((row) => normalizeMonthBucket(row.month_bucket)).filter(Boolean)).size;
      return rightMonths - leftMonths || right.length - left.length;
    })[0];
  }

  function getResidentRows(communities, reportsSummary) {
    const prepared = [
      reportsSummary.toolContext?.residentProfiles,
      reportsSummary.toolContext?.tables?.resident_profile_enriched,
      reportsSummary.toolContext?.tables?.resident_profile
    ].find((rows) => Array.isArray(rows) && rows.length);
    if (Array.isArray(prepared) && prepared.length) {
      const incidentSummaryRows = reportsSummary.toolContext?.residentIncidentSummary ??
        reportsSummary.toolContext?.tables?.resident_incident_summary ?? [];
      const documentationRows = reportsSummary.toolContext?.documentationStatus ??
        reportsSummary.toolContext?.tables?.documentation_status ?? [];
      const marSummaryRows = reportsSummary.toolContext?.marResidentSummary ??
        reportsSummary.toolContext?.tables?.mar_resident_summary ?? [];
      const makeResidentKey = (row) => `${firstPresent(row, ["facility_id", "Facility", "facility"]) ?? ""}|${firstPresent(row, ["res_number", "resident_id", "Res_Number"]) ?? ""}`;
      const incidentByResident = new Map(incidentSummaryRows.map((row) => [makeResidentKey(row), row]));
      const documentationByResident = new Map(documentationRows.map((row) => [makeResidentKey(row), row]));
      const marByResident = new Map(marSummaryRows.map((row) => [makeResidentKey(row), row]));
      return prepared.map((row) => {
        const incidentSummary = incidentByResident.get(makeResidentKey(row)) ?? {};
        const documentation = documentationByResident.get(makeResidentKey(row)) ?? {};
        const mar = marByResident.get(makeResidentKey(row)) ?? {};
        return {
          res_number: row.res_number,
          first_name: row.first_name,
          last_name: row.last_name,
          age: row.age,
          admit_date: row.admit_date,
          los_days: row.los_days,
          facility_id: row.facility_id,
          facility_name: row.facility_name,
          unit_number: row.unit_number,
          care_level: row.care_level,
          payor: row.payor,
          primary_diagnosis: row.primary_diagnosis,
          physician: row.physician,
          diet: row.diet,
          incident_count_all_time: Number(row.incident_count_all_time ?? incidentSummary.incident_count_all_time ?? 0),
          incident_count_30d: Number(row.incident_count_30d ?? incidentSummary.incident_count_30d ?? 0),
          incident_count_90d: Number(row.incident_count_90d ?? incidentSummary.incident_count_90d ?? 0),
          incident_count_180d: Number(row.incident_count_180d ?? incidentSummary.incident_count_180d ?? 0),
          last_incident_date: row.last_incident_date ?? incidentSummary.last_incident_date ?? null,
          last_incident_category: row.last_incident_category ?? incidentSummary.last_incident_category ?? null,
          last_note_date: row.last_note_date ?? documentation.last_note_date ?? null,
          days_since_last_note: row.days_since_last_note == null && documentation.days_since_last_note == null
            ? null
            : Number(row.days_since_last_note ?? documentation.days_since_last_note),
          active_medication_count: Number(mar.active_medication_count ?? 0),
          active_psychotropic_count: Number(mar.active_psychotropic_count ?? 0),
          active_narcotic_count: Number(mar.active_narcotic_count ?? 0),
          active_prn_count: Number(mar.active_prn_count ?? 0),
          mar_scheduled_30d: Number(mar.scheduled_30d ?? 0),
          mar_given_30d: Number(mar.given_30d ?? 0),
          mar_not_given_30d: Number(mar.not_given_30d ?? 0),
          mar_refusals_7d: Number(mar.refusals_7d ?? 0),
          mar_refusals_30d: Number(mar.refusals_30d ?? 0),
          mar_refusals_90d: Number(mar.refusals_90d ?? 0),
          mar_prn_given_30d: Number(mar.prn_given_30d ?? 0),
          mar_prn_followup_30d: Number(mar.prn_followup_30d ?? 0),
          mar_compliance_pct_30d: mar.compliance_pct_30d == null ? null : Number(mar.compliance_pct_30d),
          last_mar_recorded_date: mar.last_recorded_date ?? null
        };
      });
    }

    return communities.residents ?? [];
  }

  function getToolContextTable(reportsSummary, tableName, fallbackRows = []) {
    const rows = reportsSummary.toolContext?.tables?.[tableName];
    return Array.isArray(rows) && rows.length ? rows : fallbackRows;
  }

  function getDocumentationRows(reportsSummary) {
    return getToolContextTable(
      reportsSummary,
      "documentation_status",
      reportsSummary.toolContext?.documentationStatus ?? reportsSummary.documentationGaps ?? []
    );
  }

  function getMarMonthlyRows(reportsSummary) {
    return getToolContextTable(
      reportsSummary,
      "mar_monthly_by_community_medication",
      reportsSummary.toolContext?.marMonthlyByCommunityMedication ?? []
    );
  }

  function getMarResidentSummaryRows(reportsSummary) {
    return getToolContextTable(
      reportsSummary,
      "mar_resident_summary",
      reportsSummary.toolContext?.marResidentSummary ?? []
    );
  }

  function getMarExceptionRows(reportsSummary) {
    return getToolContextTable(
      reportsSummary,
      "mar_exception_detail_90d",
      reportsSummary.toolContext?.marExceptionDetails ?? []
    );
  }

  function normalizeMarAdministrationRow(row, { defaultOutcome = "" } = {}) {
    return {
      administration_id: String(row.administration_id ?? ""),
      medication_order_id: String(row.medication_order_id ?? ""),
      resident_id: String(row.resident_id ?? ""),
      resident_name: row.resident_name ?? "",
      facility_id: String(row.facility_id ?? ""),
      facility_name: row.facility_name ?? "",
      medication: row.medication_name ?? row.medication ?? "",
      dosage: row.dosage ?? null,
      route: row.route ?? null,
      administration_date: row.administration_date ?? row.scheduled_date ?? null,
      scheduled_date: row.scheduled_date ?? null,
      recorded_date: row.recorded_date ?? null,
      administration_outcome: row.administration_outcome ?? defaultOutcome,
      outcome_category: row.outcome_category ?? "",
      month_bucket: normalizeMonthBucket(row.month_bucket ?? row.administration_date ?? row.scheduled_date)
    };
  }

  function getMarPrnEffectivenessRows(reportsSummary) {
    return getToolContextTable(
      reportsSummary,
      "mar_prn_effectiveness_90d",
      reportsSummary.toolContext?.marPrnEffectiveness ?? []
    ).map((row) => ({
      ...normalizeMarAdministrationRow(row, { defaultOutcome: "given" }),
      outcome_category: "prn",
      is_prn: true,
      prn_reason: row.prn_reason ?? null,
      prn_result: row.prn_result ?? null,
      prn_result_date: row.prn_result_date ?? null,
      prn_result_when: row.prn_result_when ?? null,
      has_effectiveness_followup: Boolean(row.has_effectiveness_followup)
    }));
  }

  function getMarMedicationOrderRows(reportsSummary) {
    return getToolContextTable(
      reportsSummary,
      "mar_medication_orders_current",
      reportsSummary.toolContext?.marMedicationOrders ?? []
    ).map((row) => ({
      ...row,
      medication_order_id: String(row.medication_order_id ?? ""),
      resident_id: String(row.resident_id ?? ""),
      facility_id: String(row.facility_id ?? ""),
      medication: row.medication_name ?? row.medication ?? "",
      is_narcotic: Boolean(row.is_narcotic),
      is_psychotropic: Boolean(row.is_psychotropic),
      is_prn: Boolean(row.is_prn),
      is_on_hold: Boolean(row.is_on_hold)
    }));
  }

  function getMedicationComplianceRows(reportsSummary) {
    const marRows = getMarMonthlyRows(reportsSummary);
    if (marRows.length) {
      return marRows.map((row) => ({
        facility_id: String(row.facility_id ?? ""),
        facility_name: row.facility_name,
        month_bucket: normalizeMonthBucket(row.month_bucket),
        medication: row.medication_name,
        total_scheduled: Number(row.scheduled_count || 0),
        given: Number(row.given_count || 0),
        not_given: Number(row.not_given_count || 0),
        compliance_pct: row.compliance_pct == null ? null : Number(row.compliance_pct),
        source: "governed_mar"
      }));
    }
    return getToolContextTable(
      reportsSummary,
      "medication_compliance_monthly",
      reportsSummary.toolContext?.medicationComplianceMonthly ?? reportsSummary.medicationCompliance ?? []
    );
  }

  function getMedicationRefusalRows(reportsSummary) {
    const marRows = getMarMonthlyRows(reportsSummary);
    if (marRows.length) {
      return marRows.map((row) => ({
        facility_id: String(row.facility_id ?? ""),
        facility_name: row.facility_name,
        month_bucket: normalizeMonthBucket(row.month_bucket),
        medication: row.medication_name,
        total_scheduled: Number(row.scheduled_count || 0),
        refusals: Number(row.refusal_count || 0),
        refusal_pct: Number(row.scheduled_count || 0) > 0
          ? (Number(row.refusal_count || 0) / Number(row.scheduled_count)) * 100
          : null,
        source: "governed_mar"
      }));
    }
    return getToolContextTable(
      reportsSummary,
      "medication_refusal_summary",
      reportsSummary.toolContext?.medicationRefusalSummary ?? reportsSummary.refusalByMedication ?? []
    );
  }

  function getMarExceptionDetailRows(reportsSummary) {
    return getMarExceptionRows(reportsSummary).map((row) => ({
      ...normalizeMarAdministrationRow(row),
      scheduled_time: row.scheduled_time ?? null,
      not_given_reason: row.not_given_reason ?? null,
      missed_or_held_reason: row.missed_or_held_reason ?? null,
      is_on_hold: Boolean(row.is_on_hold),
      is_prn: Boolean(row.is_prn),
      prn_reason: row.prn_reason ?? null,
      prn_result: row.prn_result ?? null,
      prn_result_date: row.prn_result_date ?? null,
      administration_note: row.administration_note ?? null,
      minutes_late: Number(row.minutes_late || 0),
      is_refusal: Boolean(row.is_refusal),
      is_over_60_minutes_late: Boolean(row.is_over_60_minutes_late)
    }));
  }

  function getLatestAndPrior(rows, key = "month_bucket") {
    const months = [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort();
    return {
      latestMonth: months.at(-1) ?? null,
      priorMonth: months.at(-2) ?? null
    };
  }

  return {
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
    getLatestRows,
    getLatestAndPrior,
    getCommunityMetrics,
    getIncidentRows,
    getIncidentDetailRows,
    getResidentRows,
    getToolContextTable,
    getDocumentationRows,
    getMarMonthlyRows,
    getMarResidentSummaryRows,
    getMarExceptionRows,
    getMarPrnEffectivenessRows,
    getMarMedicationOrderRows,
    getMedicationComplianceRows,
    getMedicationRefusalRows,
    getMarExceptionDetailRows
  };
}
