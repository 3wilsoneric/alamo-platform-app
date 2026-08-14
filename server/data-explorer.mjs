import { normalizeKnownCommunityNames } from "../shared/community-names.mjs";
import {
  formatDisplayDate,
  normalizeDisplayDateKey,
  normalizeDisplayTimestamp
} from "../shared/display-date.mjs";
import { createHttpError } from "./http-errors.mjs";

function normalizeString(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeFacilityId(value) {
  return normalizeString(value);
}

function normalizeInteger(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : 0;
  }
  return 0;
}

function normalizeNumberNullable(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeNullable(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function monthFromDate(value) {
  const normalized = normalizeDisplayDateKey(value);
  return normalized ? normalized.slice(0, 7) : "";
}

function formatResidentName(firstName, lastName) {
  return [normalizeString(firstName), normalizeString(lastName)].filter(Boolean).join(" ");
}

function getCommunityName(communities, facilityId, fallback = "") {
  const normalizedFacilityId = normalizeFacilityId(facilityId);
  return normalizeKnownCommunityNames(
    fallback ||
      communities?.facilities?.find((facility) => facility.facility_id === normalizedFacilityId)?.community_name ||
      normalizedFacilityId ||
      "Unknown community"
  );
}

function getExplorerDateLabel(value) {
  const normalized = normalizeDisplayDateKey(value);
  return normalized ? formatDisplayDate(normalized, { fallback: "" }) : "";
}

function getUniqueSorted(values) {
  return [...new Set(values.map((value) => normalizeString(value)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

export function normalizeExplorerKind(value) {
  const kind = normalizeString(value).toLowerCase();
  if (["incident", "incidents", "incident-detail", "incident-details"].includes(kind)) return "incidents";
  if (["census", "occupancy", "resident-count", "resident-counts"].includes(kind)) return "census";
  if (["resident", "residents", "roster", "census-search", "resident-search"].includes(kind)) return "residents";

  throw createHttpError(
    400,
    "data_explorer_kind_invalid",
    "Unsupported data explorer kind. Use incidents, census, or residents."
  );
}

function buildIncidentExplorerRows(snapshot) {
  const communities = snapshot.communities ?? {};
  const rows = communities.incidentDetails ??
    snapshot.reportsSummary?.toolContext?.incidentDetailHistory ??
    snapshot.reportsSummary?.toolContext?.tables?.incident_detail_history ??
    [];

  return rows.map((row, index) => {
    const incidentDate = normalizeDisplayDateKey(row.incident_date ?? row.Incident_Date_parsed ?? row.event_date);
    const receivedAt = normalizeDisplayTimestamp(row.received_at ?? row.__TIMESTAMP) || normalizeDisplayTimestamp(incidentDate);
    const facilityId = normalizeFacilityId(row.facility_id ?? row.Facility ?? row.facility);
    const description = normalizeString(
      row.email_body ?? row.description ?? row.incident_description ?? row.narrative ?? row.What_Staff_Saw
    );
    return {
      id: normalizeString(row.id ?? row.Unique_ID) ||
        `${facilityId}-${incidentDate ?? receivedAt ?? "unknown"}-${row.resident_id ?? row.Res_Number ?? index}`,
      incident_date: getExplorerDateLabel(incidentDate ?? receivedAt),
      received_at: receivedAt,
      month_bucket: normalizeString(row.month_bucket) || monthFromDate(incidentDate ?? receivedAt),
      facility_id: facilityId,
      community_name: getCommunityName(communities, facilityId, row.facility_name ?? row.Facility_Name),
      resident_id: normalizeString(row.resident_id ?? row.Res_Number ?? row.client_id),
      resident_name: normalizeString(row.client_name ?? row.resident_name) ||
        formatResidentName(row.First_Name, row.Last_Name) ||
        (row.resident_id || row.Res_Number ? `Resident ${row.resident_id ?? row.Res_Number}` : "Unknown resident"),
      unit: normalizeNullable(row.unit_number ?? row.unit ?? row.Unit_Number),
      category: normalizeString(row.category ?? row.incident_category ?? row.Incident_Category) || "Uncategorized",
      incident_type: normalizeString(row.incident_type ?? row.type ?? row.Type_of_Incident) || "—",
      location: normalizeString(
        row.location ?? [row.Location_of_Incident_General, row.Location_of_Incident_Specific].filter(Boolean).join(" · ")
      ),
      description: description || normalizeString(row.assistance_given ?? row.Assistance_Given),
      staff_name: normalizeNullable(row.staff_name ?? row.Person_Completing_Report_Name),
      flags: Array.isArray(row.flags) ? row.flags.join(", ") : normalizeString(row.flags),
      injury_occurred: Boolean(row.injury_occurred),
      police_called: Boolean(row.police_called),
      sentinel_event: Boolean(row.sentinel_event)
    };
  }).sort((left, right) =>
    String(right.received_at || right.incident_date).localeCompare(String(left.received_at || left.incident_date))
  );
}

function buildCensusExplorerRows(snapshot) {
  const communities = snapshot.communities ?? {};
  const rows = communities.census ?? snapshot.reportsSummary?.census ?? [];

  return rows.map((row) => {
    const facilityId = normalizeFacilityId(row.facility_id ?? row.Facility ?? row.facility);
    return {
      id: `${facilityId}-${normalizeString(row.month_bucket ?? row.reporting_month ?? row.month)}`,
      month_bucket: normalizeString(row.month_bucket ?? row.reporting_month ?? row.month),
      facility_id: facilityId,
      community_name: getCommunityName(communities, facilityId, row.facility_name ?? row.Facility_Name),
      census: normalizeInteger(row.census ?? row.resident_count ?? row.active_residents)
    };
  }).sort((left, right) =>
    String(right.month_bucket).localeCompare(String(left.month_bucket)) ||
    left.community_name.localeCompare(right.community_name)
  );
}

function buildResidentExplorerRows(snapshot) {
  const communities = snapshot.communities ?? {};
  const rows = communities.residents ??
    snapshot.reportsSummary?.toolContext?.residentProfiles ??
    snapshot.reportsSummary?.toolContext?.tables?.resident_profile_enriched ??
    snapshot.reportsSummary?.toolContext?.tables?.resident_profile ??
    [];
  const enrichedRows = snapshot.reportsSummary?.toolContext?.residentProfiles ??
    snapshot.reportsSummary?.toolContext?.tables?.resident_profile_enriched ??
    [];
  const marSummaryRows = snapshot.reportsSummary?.toolContext?.marResidentSummary ??
    snapshot.reportsSummary?.toolContext?.tables?.mar_resident_summary ??
    [];
  const residentIdForRow = (row) =>
    normalizeString(row.res_number ?? row.resident_id ?? row.Res_Number ?? row.client_id);
  const facilityIdForRow = (row) =>
    normalizeFacilityId(row.facility_id ?? row.Facility ?? row.facility);
  const residentFacilityKey = (row) => `${facilityIdForRow(row)}|${residentIdForRow(row)}`;
  const enrichedByResidentId = new Map(
    enrichedRows
      .map((row) => [residentIdForRow(row), row])
      .filter(([residentId]) => residentId)
  );
  const enrichedByResidentFacility = new Map(
    enrichedRows
      .map((row) => [residentFacilityKey(row), row])
      .filter(([key]) => !key.endsWith("|"))
  );
  const marByResidentId = new Map(
    marSummaryRows
      .map((row) => [residentIdForRow(row), row])
      .filter(([residentId]) => residentId)
  );
  const marByResidentFacility = new Map(
    marSummaryRows
      .map((row) => [residentFacilityKey(row), row])
      .filter(([key]) => !key.endsWith("|"))
  );

  return rows.map((row) => {
    const residentId = residentIdForRow(row);
    const residentKey = residentFacilityKey(row);
    const enrichedRow = enrichedByResidentFacility.get(residentKey) ??
      enrichedByResidentId.get(residentId) ??
      {};
    const marRow = marByResidentFacility.get(residentKey) ??
      marByResidentId.get(residentId) ??
      {};
    const mergedRow = { ...enrichedRow, ...row };
    const facilityId = normalizeFacilityId(mergedRow.facility_id ?? mergedRow.Facility ?? mergedRow.facility);
    const firstName = normalizeString(mergedRow.first_name ?? mergedRow.First_Name);
    const lastName = normalizeString(mergedRow.last_name ?? mergedRow.Last_Name);
    return {
      id: residentId,
      resident_name: normalizeString(mergedRow.resident_name ?? mergedRow.client_name) ||
        [firstName, lastName].filter(Boolean).join(" ") ||
        "Unknown resident",
      facility_id: facilityId,
      community_name: getCommunityName(communities, facilityId, mergedRow.facility_name ?? mergedRow.Facility_Name),
      unit: normalizeNullable(mergedRow.unit_number ?? mergedRow.unit ?? mergedRow.Unit_Number),
      age: normalizeInteger(mergedRow.age),
      admit_date: getExplorerDateLabel(mergedRow.admit_date ?? mergedRow.admission_date),
      los_days: normalizeInteger(mergedRow.los_days ?? mergedRow.length_of_stay),
      primary_diagnosis: normalizeNullable(mergedRow.primary_diagnosis ?? mergedRow.diagnosis),
      care_level: normalizeNullable(mergedRow.care_level),
      payor: normalizeNullable(mergedRow.payor ?? mergedRow.payer),
      physician: normalizeNullable(mergedRow.physician ?? mergedRow.attending_physician),
      diet: normalizeNullable(mergedRow.diet),
      incident_count_all_time: normalizeInteger(mergedRow.incident_count_all_time),
      incident_count_30d: normalizeInteger(mergedRow.incident_count_30d),
      incident_count_90d: normalizeInteger(mergedRow.incident_count_90d),
      incident_count_180d: normalizeInteger(mergedRow.incident_count_180d),
      last_incident_date: getExplorerDateLabel(mergedRow.last_incident_date),
      last_incident_category: normalizeNullable(mergedRow.last_incident_category),
      last_note_date: getExplorerDateLabel(mergedRow.last_note_date),
      days_since_last_note: normalizeInteger(mergedRow.days_since_last_note),
      active_medication_count: (marRow.active_medication_count ?? mergedRow.active_medication_count) == null
        ? null
        : normalizeInteger(marRow.active_medication_count ?? mergedRow.active_medication_count),
      active_psychotropic_count: (marRow.active_psychotropic_count ?? mergedRow.active_psychotropic_count) == null
        ? null
        : normalizeInteger(marRow.active_psychotropic_count ?? mergedRow.active_psychotropic_count),
      active_narcotic_count: (marRow.active_narcotic_count ?? mergedRow.active_narcotic_count) == null
        ? null
        : normalizeInteger(marRow.active_narcotic_count ?? mergedRow.active_narcotic_count),
      active_prn_count: (marRow.active_prn_count ?? mergedRow.active_prn_count) == null
        ? null
        : normalizeInteger(marRow.active_prn_count ?? mergedRow.active_prn_count),
      mar_scheduled_30d: (marRow.scheduled_30d ?? mergedRow.mar_scheduled_30d) == null
        ? null
        : normalizeInteger(marRow.scheduled_30d ?? mergedRow.mar_scheduled_30d),
      mar_given_30d: (marRow.given_30d ?? mergedRow.mar_given_30d) == null
        ? null
        : normalizeInteger(marRow.given_30d ?? mergedRow.mar_given_30d),
      mar_not_given_30d: (marRow.not_given_30d ?? mergedRow.mar_not_given_30d) == null
        ? null
        : normalizeInteger(marRow.not_given_30d ?? mergedRow.mar_not_given_30d),
      mar_refusals_7d: (marRow.refusals_7d ?? mergedRow.mar_refusals_7d) == null
        ? null
        : normalizeInteger(marRow.refusals_7d ?? mergedRow.mar_refusals_7d),
      mar_refusals_30d: (marRow.refusals_30d ?? mergedRow.mar_refusals_30d) == null
        ? null
        : normalizeInteger(marRow.refusals_30d ?? mergedRow.mar_refusals_30d),
      mar_refusals_90d: (marRow.refusals_90d ?? mergedRow.mar_refusals_90d) == null
        ? null
        : normalizeInteger(marRow.refusals_90d ?? mergedRow.mar_refusals_90d),
      mar_prn_given_30d: (marRow.prn_given_30d ?? mergedRow.mar_prn_given_30d) == null
        ? null
        : normalizeInteger(marRow.prn_given_30d ?? mergedRow.mar_prn_given_30d),
      mar_prn_followup_30d: (marRow.prn_followup_30d ?? mergedRow.mar_prn_followup_30d) == null
        ? null
        : normalizeInteger(marRow.prn_followup_30d ?? mergedRow.mar_prn_followup_30d),
      mar_compliance_pct_30d: normalizeNumberNullable(
        marRow.compliance_pct_30d ?? mergedRow.mar_compliance_pct_30d
      ),
      last_mar_recorded_date: getExplorerDateLabel(
        marRow.last_recorded_date ?? mergedRow.last_mar_recorded_date
      )
    };
  }).sort((left, right) =>
    left.community_name.localeCompare(right.community_name) || left.resident_name.localeCompare(right.resident_name)
  );
}

const EXPLORER_COLUMNS = Object.freeze({
  incidents: Object.freeze([
    { key: "incident_date", label: "Date", numeric: false },
    { key: "community_name", label: "Community", numeric: false },
    { key: "resident_name", label: "Resident", numeric: false },
    { key: "unit", label: "Unit", numeric: false },
    { key: "category", label: "Category", numeric: false },
    { key: "incident_type", label: "Incident type", numeric: false },
    { key: "description", label: "Description", numeric: false }
  ]),
  census: Object.freeze([
    { key: "month_bucket", label: "Month", numeric: false },
    { key: "community_name", label: "Community", numeric: false },
    { key: "census", label: "Census", numeric: true }
  ]),
  residents: Object.freeze([
    { key: "resident_name", label: "Resident", numeric: false },
    { key: "community_name", label: "Community", numeric: false },
    { key: "unit", label: "Unit", numeric: false },
    { key: "age", label: "Age", numeric: true },
    { key: "los_days", label: "LOS days", numeric: true },
    { key: "admit_date", label: "Admit date", numeric: false },
    { key: "primary_diagnosis", label: "Diagnosis", numeric: false },
    { key: "care_level", label: "Care level", numeric: false },
    { key: "payor", label: "Payor", numeric: false },
    { key: "physician", label: "Physician", numeric: false },
    { key: "diet", label: "Diet", numeric: false },
    { key: "incident_count_90d", label: "90d incidents", numeric: true },
    { key: "last_incident_date", label: "Last incident", numeric: false },
    { key: "last_note_date", label: "Last note", numeric: false },
    { key: "active_medication_count", label: "Active medications", numeric: true },
    { key: "mar_compliance_pct_30d", label: "MAR compliance, 30 days", numeric: true }
  ])
});

function buildExplorerFilters(kind, rows) {
  return {
    communities: getUniqueSorted(rows.map((row) => row.community_name)),
    months: getUniqueSorted(rows.map((row) => row.month_bucket)).reverse(),
    categories: kind === "incidents" ? getUniqueSorted(rows.map((row) => row.category)) : []
  };
}

export function buildDataExplorerPayload(snapshot, kindValue, snapshotStatus) {
  const kind = normalizeExplorerKind(kindValue);
  const rows = kind === "incidents"
    ? buildIncidentExplorerRows(snapshot)
    : kind === "census"
      ? buildCensusExplorerRows(snapshot)
      : buildResidentExplorerRows(snapshot);
  const generatedAt = snapshot.snapshot?.generated_at ?? snapshot.generated_at ?? new Date().toISOString();
  const metadata = {
    incidents: {
      title: "Incident Search",
      description: "Search loaded incident detail, inspect descriptions, and export the exact filtered set."
    },
    census: {
      title: "Census Search",
      description: "Search loaded monthly census points by community and month, then export the filtered set."
    },
    residents: {
      title: "Resident Search",
      description: "Search current residents and export the filtered directory."
    }
  };

  return {
    kind,
    ...metadata[kind],
    generated_at: generatedAt,
    snapshot_status: snapshotStatus,
    row_count: rows.length,
    columns: EXPLORER_COLUMNS[kind],
    filters: buildExplorerFilters(kind, rows),
    rows
  };
}
