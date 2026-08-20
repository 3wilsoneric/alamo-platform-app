import { ALAMO_FACILITIES, normalizeKnownCommunityNames } from "../shared/community-names.mjs";
import {
  formatDisplayDate,
  normalizeDisplayDateKey,
  normalizeDisplayTimestamp
} from "../shared/display-date.mjs";
import { createHttpError } from "./http-errors.mjs";
import { getGovernedIncidentDetailRows } from "./governed-incident-details.mjs";

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

function normalizeIntegerNullable(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
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

function normalizeCommunityLookup(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeClientCommunityName(value) {
  const normalizedValue = normalizeCommunityLookup(normalizeKnownCommunityNames(value));
  const facility = ALAMO_FACILITIES.find((candidate) => [
    candidate.communityName,
    candidate.shortName,
    candidate.operatingSiteName,
    ...candidate.aliases
  ].some((alias) => normalizeCommunityLookup(alias) === normalizedValue));
  return facility?.shortName ?? normalizeKnownCommunityNames(normalizeString(value));
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
  const rows = getGovernedIncidentDetailRows(communities, snapshot.reportsSummary);

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

function buildLegacyResidentExplorerRows(snapshot) {
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
      age: normalizeIntegerNullable(mergedRow.age),
      admit_date: getExplorerDateLabel(mergedRow.admit_date ?? mergedRow.admission_date),
      los_days: normalizeIntegerNullable(mergedRow.los_days ?? mergedRow.length_of_stay),
      primary_diagnosis: normalizeNullable(mergedRow.primary_diagnosis ?? mergedRow.diagnosis),
      care_level: normalizeNullable(mergedRow.care_level),
      payor: normalizeNullable(mergedRow.payor ?? mergedRow.payer),
      physician: normalizeNullable(mergedRow.physician ?? mergedRow.attending_physician),
      diet: normalizeNullable(mergedRow.diet),
      incident_count_all_time: normalizeIntegerNullable(mergedRow.incident_count_all_time),
      incident_count_30d: normalizeIntegerNullable(mergedRow.incident_count_30d),
      incident_count_90d: normalizeIntegerNullable(mergedRow.incident_count_90d),
      incident_count_180d: normalizeIntegerNullable(mergedRow.incident_count_180d),
      last_incident_date: getExplorerDateLabel(mergedRow.last_incident_date),
      last_incident_category: normalizeNullable(mergedRow.last_incident_category),
      last_note_date: getExplorerDateLabel(mergedRow.last_note_date),
      days_since_last_note: normalizeIntegerNullable(mergedRow.days_since_last_note),
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

function canonicalClientId(row) {
  return normalizeString(row?.canonical_client_id);
}

function residentIdForRow(row) {
  return normalizeString(row?.res_number ?? row?.resident_id ?? row?.Res_Number ?? row?.client_id ?? row?.id);
}

function facilityIdForRow(row) {
  return normalizeFacilityId(row?.facility_id ?? row?.Facility ?? row?.facility);
}

function residentFacilityKey(row) {
  return `${facilityIdForRow(row)}|${residentIdForRow(row)}`;
}

function getFirstProfileValue(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = getFirstProfileValue(...value);
      if (nested) return nested;
      continue;
    }
    if (value && typeof value === "object") continue;
    const text = normalizeString(value);
    if (!text) continue;
    if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
      try {
        const parsed = JSON.parse(text);
        const nested = getFirstProfileValue(parsed);
        if (nested) return nested;
        continue;
      } catch {
        // Keep the source text when a source field only resembles JSON.
      }
    }
    return text;
  }
  return "";
}

function getProfileValues(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(getProfileValues);
  if (typeof value === "object") return Object.values(value).flatMap(getProfileValues);
  const text = normalizeString(value);
  if (!text) return [];
  if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
    try {
      return getProfileValues(JSON.parse(text));
    } catch {
      return [text];
    }
  }
  return [text];
}

function searchableProfileValue(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(searchableProfileValue).filter(Boolean).join(" ");
  if (typeof value === "object") return Object.values(value).map(searchableProfileValue).filter(Boolean).join(" ");
  return normalizeString(value);
}

function buildClientNameSearch(client, profile) {
  return [
    client?.resident_name,
    client?.name_variants,
    client?.platform_resident_names,
    client?.resident_numbers,
    client?.platform_resident_numbers,
    client?.medical_record_numbers_json,
    client?.canonical_client_id,
    profile?.resident_name,
    profile?.client_name,
    profile?.first_name,
    profile?.last_name,
    profile?.First_Name,
    profile?.Last_Name,
    residentIdForRow(profile)
  ].map(searchableProfileValue).filter(Boolean).join(" ");
}

function groupRowsBy(rows, keyForRow) {
  return rows.reduce((groups, row) => {
    const key = keyForRow(row);
    if (!key) return groups;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
    return groups;
  }, new Map());
}

function sortLatestFirst(rows) {
  const dateKeys = [
    "latest_admit_date",
    "admit_date",
    "admission_date",
    "episode_start_date",
    "latest_discharge_date",
    "discharge_date"
  ];
  return [...rows].sort((left, right) => {
    const leftDate = getFirstProfileValue(...dateKeys.map((key) => left?.[key]));
    const rightDate = getFirstProfileValue(...dateKeys.map((key) => right?.[key]));
    return rightDate.localeCompare(leftDate) || residentFacilityKey(left).localeCompare(residentFacilityKey(right));
  });
}

export function indexClientDatabaseClients(clientDatabase) {
  if (!clientDatabase) return new Map();
  return new Map(clientDatabase.clients.map((client) => [canonicalClientId(client), client]));
}

function getBaseResidentRow(snapshot, currentProfile, staticClient, legacyByResidentFacility) {
  const communities = snapshot.communities ?? {};
  const residentKey = currentProfile ? residentFacilityKey(currentProfile) : "";
  const clientCommunities = getUniqueSorted(
    getProfileValues(staticClient?.communities).map(normalizeClientCommunityName)
  );
  const legacyRow = legacyByResidentFacility.get(residentKey);
  if (legacyRow) {
    return {
      ...legacyRow,
      community_name: normalizeClientCommunityName(legacyRow.community_name),
      community_names: clientCommunities
    };
  }

  const facilityId = facilityIdForRow(currentProfile) || normalizeFacilityId(
    staticClient?.current_facility_id ?? staticClient?.facility_id
  );
  const firstName = normalizeString(currentProfile?.first_name ?? currentProfile?.First_Name);
  const lastName = normalizeString(currentProfile?.last_name ?? currentProfile?.Last_Name);
  const fallbackCommunity = getFirstProfileValue(
    currentProfile?.facility_name,
    currentProfile?.Facility_Name,
    clientCommunities
  );

  return {
    resident_name: normalizeString(currentProfile?.resident_name ?? currentProfile?.client_name) ||
      [firstName, lastName].filter(Boolean).join(" ") ||
      normalizeString(staticClient?.resident_name) ||
      "Unknown resident",
    facility_id: facilityId,
    community_name: currentProfile
      ? normalizeClientCommunityName(getCommunityName(communities, facilityId, fallbackCommunity || "Unknown community"))
      : clientCommunities.join(" · ") || "Historical client",
    community_names: clientCommunities,
    unit: normalizeNullable(currentProfile?.unit_number ?? currentProfile?.unit ?? staticClient?.unit_number),
    age: normalizeIntegerNullable(currentProfile?.age ?? staticClient?.age),
    admit_date: getExplorerDateLabel(
      currentProfile?.admit_date ?? currentProfile?.admission_date ?? staticClient?.latest_admit_date
    ) || null,
    los_days: normalizeIntegerNullable(currentProfile?.los_days ?? currentProfile?.length_of_stay ?? staticClient?.length_of_stay),
    primary_diagnosis: normalizeNullable(getFirstProfileValue(
      currentProfile?.primary_diagnosis,
      currentProfile?.diagnosis,
      staticClient?.primary_diagnosis
    )),
    care_level: normalizeNullable(currentProfile?.care_level ?? staticClient?.care_level),
    payor: normalizeNullable(currentProfile?.payor ?? currentProfile?.payer ?? staticClient?.payor ?? staticClient?.payer),
    physician: normalizeNullable(
      currentProfile?.physician ?? currentProfile?.attending_physician ?? staticClient?.physician
    ),
    diet: normalizeNullable(currentProfile?.diet ?? staticClient?.diet),
    incident_count_all_time: normalizeIntegerNullable(currentProfile?.incident_count_all_time),
    incident_count_30d: normalizeIntegerNullable(currentProfile?.incident_count_30d),
    incident_count_90d: normalizeIntegerNullable(currentProfile?.incident_count_90d),
    incident_count_180d: normalizeIntegerNullable(currentProfile?.incident_count_180d),
    last_incident_date: getExplorerDateLabel(currentProfile?.last_incident_date) || null,
    last_incident_category: normalizeNullable(currentProfile?.last_incident_category),
    last_note_date: getExplorerDateLabel(currentProfile?.last_note_date) || null,
    days_since_last_note: normalizeIntegerNullable(currentProfile?.days_since_last_note),
    active_medication_count: null,
    active_psychotropic_count: null,
    active_narcotic_count: null,
    active_prn_count: null,
    mar_scheduled_30d: null,
    mar_given_30d: null,
    mar_not_given_30d: null,
    mar_refusals_7d: null,
    mar_refusals_30d: null,
    mar_refusals_90d: null,
    mar_prn_given_30d: null,
    mar_prn_followup_30d: null,
    mar_compliance_pct_30d: null,
    last_mar_recorded_date: null
  };
}

function buildEnhancedResidentExplorer(snapshot, clientDatabase) {
  const tables = snapshot.reportsSummary?.toolContext?.tables ?? {};
  const currentProfiles = tables.resident_profile ??
    snapshot.reportsSummary?.toolContext?.residentProfiles ??
    snapshot.communities?.residents ??
    [];
  const episodeRows = tables.resident_episode_history ??
    snapshot.reportsSummary?.toolContext?.residentEpisodeHistory ??
    [];
  const clientByCanonicalId = indexClientDatabaseClients(clientDatabase);
  const clientDatabaseColumns = clientDatabase.columns.map((column) =>
    typeof column === "string" ? column : normalizeString(column?.name)
  );
  const profilesByCanonicalId = groupRowsBy(currentProfiles, canonicalClientId);
  const episodesByCanonicalId = groupRowsBy(episodeRows, canonicalClientId);
  const episodesByResidentFacility = groupRowsBy(episodeRows, residentFacilityKey);
  const legacyByResidentFacility = new Map(
    buildLegacyResidentExplorerRows(snapshot).map((row) => [residentFacilityKey(row), row])
  );

  let matchedCurrentProfiles = 0;
  let unmatchedCurrentProfiles = 0;
  const rows = clientDatabase.clients.map((client) => {
    const canonicalId = canonicalClientId(client);
    const residentProfiles = sortLatestFirst(profilesByCanonicalId.get(canonicalId) ?? []);
    const currentProfile = residentProfiles[0] ?? null;
    matchedCurrentProfiles += residentProfiles.length;
    const residentId = residentIdForRow(currentProfile);
    const base = getBaseResidentRow(snapshot, currentProfile, client, legacyByResidentFacility);
    const episodeHistory = sortLatestFirst(episodesByCanonicalId.get(canonicalId) ?? []);
    const residentNumbers = getUniqueSorted([
      ...getProfileValues(client.resident_numbers),
      ...getProfileValues(client.platform_resident_numbers),
      ...getProfileValues(client.medical_record_numbers_json),
      ...(residentId ? [residentId] : [])
    ]);
    return {
      ...base,
      id: canonicalId,
      canonical_client_id: canonicalId,
      resident_id: residentId || null,
      res_number: residentId || null,
      resident_numbers: residentNumbers,
      resident_name: normalizeString(currentProfile?.resident_name ?? currentProfile?.client_name) ||
        normalizeString(client.resident_name) || base.resident_name,
      client_name_search: buildClientNameSearch(client, currentProfile),
      current_resident: Boolean(currentProfile),
      client_database_match_status: "matched",
      client_profile: client,
      resident_profile: currentProfile,
      resident_profiles: residentProfiles,
      resident_profile_match_count: residentProfiles.length,
      resident_episode_history: episodeHistory
    };
  });

  currentProfiles.forEach((currentProfile, index) => {
    const canonicalId = canonicalClientId(currentProfile);
    if (canonicalId && clientByCanonicalId.has(canonicalId)) return;
    unmatchedCurrentProfiles += 1;
    const residentKey = residentFacilityKey(currentProfile);
    const residentId = residentIdForRow(currentProfile);
    const base = getBaseResidentRow(snapshot, currentProfile, null, legacyByResidentFacility);
    rows.push({
      ...base,
      id: `unmatched:${residentKey || index}`,
      canonical_client_id: null,
      resident_id: residentId || null,
      res_number: residentId || null,
      resident_numbers: residentId ? [residentId] : [],
      client_name_search: buildClientNameSearch(null, currentProfile),
      current_resident: true,
      client_database_match_status: "unmatched",
      client_profile: null,
      resident_profile: currentProfile,
      resident_profiles: [currentProfile],
      resident_profile_match_count: 1,
      resident_episode_history: sortLatestFirst(episodesByResidentFacility.get(residentKey) ?? [])
    });
  });

  const unmatchedEpisodeRows = episodeRows.filter((episode) => {
    const canonicalId = canonicalClientId(episode);
    return !canonicalId || !clientByCanonicalId.has(canonicalId);
  }).length;

  rows.sort((left, right) =>
    Number(Boolean(right.current_resident)) - Number(Boolean(left.current_resident)) ||
    String(left.community_name).localeCompare(String(right.community_name)) ||
    String(left.resident_name).localeCompare(String(right.resident_name)) ||
    String(left.id).localeCompare(String(right.id))
  );

  return {
    rows,
    metadata: {
      available: true,
      dataset: normalizeString(clientDatabase.dataset) || "platform_client_database",
      version: clientDatabase.version ?? null,
      baseline_date: clientDatabase.baseline_date ?? null,
      generated_at: clientDatabase.generated_at,
      client_count: clientDatabase.client_count,
      field_count: clientDatabase.column_count,
      columns: clientDatabaseColumns,
      matched_current_profiles: matchedCurrentProfiles,
      unmatched_current_profiles: unmatchedCurrentProfiles,
      unmatched_episode_rows: unmatchedEpisodeRows
    }
  };
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
  const communityValues = kind === "residents"
    ? rows.flatMap((row) => Array.isArray(row.community_names) && row.community_names.length
      ? row.community_names
      : [row.community_name])
    : rows.map((row) => row.community_name);
  return {
    communities: getUniqueSorted(communityValues),
    months: getUniqueSorted(rows.map((row) => row.month_bucket)).reverse(),
    categories: kind === "incidents" ? getUniqueSorted(rows.map((row) => row.category)) : []
  };
}

export function buildDataExplorerPayload(snapshot, kindValue, snapshotStatus, options = {}) {
  const kind = normalizeExplorerKind(kindValue);
  const residentExplorer = kind === "residents" && options.clientDatabase
    ? buildEnhancedResidentExplorer(snapshot, options.clientDatabase)
    : null;
  const completeRows = kind === "incidents"
    ? buildIncidentExplorerRows(snapshot)
    : kind === "census"
      ? buildCensusExplorerRows(snapshot)
      : residentExplorer?.rows ?? buildLegacyResidentExplorerRows(snapshot);
  const residentClientId = normalizeString(options.residentClientId);
  let rows = completeRows;
  if (residentExplorer && residentClientId) {
    const selectedRow = completeRows.find((row) => String(row.id) === residentClientId);
    if (!selectedRow) {
      throw createHttpError(404, "client_profile_not_found", "Client profile not found.");
    }
    rows = [selectedRow];
  } else if (residentExplorer) {
    rows = completeRows.map((row) => {
      const {
        client_profile: _clientProfile,
        resident_profile: _residentProfile,
        resident_profiles: _residentProfiles,
        resident_episode_history: residentEpisodeHistory,
        ...directoryRow
      } = row;
      return {
        ...directoryRow,
        resident_episode_count: Array.isArray(residentEpisodeHistory) ? residentEpisodeHistory.length : 0
      };
    });
  }
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
      title: residentExplorer ? "Client Search" : "Resident Search",
      description: residentExplorer
        ? "Search the canonical client database and inspect current resident and episode history."
        : "Search current residents and export the filtered directory."
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
    ...(residentExplorer ? { client_database: residentExplorer.metadata } : {}),
    rows
  };
}
