import { ALAMO_FACILITIES } from "../shared/community-names.mjs";

// This is deliberately narrower than the client-directory join. Admissions
// receives aggregate county counts only, and only after an exact resident
// number + known Alamo community match to one unique client record.

function textValue(value) {
  return value == null ? "" : String(value).trim();
}

function values(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(values);
  if (typeof value === "object") return Object.values(value).flatMap(values);
  const text = textValue(value);
  if (!text) return [];
  if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
    try {
      return values(JSON.parse(text));
    } catch {
      return [text];
    }
  }
  return [text];
}

function unique(valuesToDedupe) {
  return [...new Set(valuesToDedupe.filter(Boolean))];
}

function normalizeResidentNumber(value) {
  return textValue(value).toUpperCase().replace(/\.0$/, "");
}

function normalizeCommunity(value) {
  return textValue(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const FACILITY_ID_BY_ALIAS = new Map(
  ALAMO_FACILITIES.flatMap((facility) => unique([
    facility.facilityId,
    facility.communityName,
    facility.shortName,
    facility.operatingSiteName,
    facility.code,
    ...facility.aliases
  ].map(normalizeCommunity)).map((alias) => [alias, facility.facilityId]))
);

function facilityIdsForClient(client) {
  // facility_canonical describes a source/prior facility in this dataset; it
  // is not an Alamo destination-community key and must not qualify the join.
  return unique([
    ...values(client?.communities),
    ...values(client?.current_facility_id),
    ...values(client?.facility_id)
  ].map((value) => FACILITY_ID_BY_ALIAS.get(normalizeCommunity(value))));
}

function residentNumbersForClient(client) {
  return unique([
    ...values(client?.resident_numbers),
    ...values(client?.platform_resident_numbers),
    ...values(client?.medical_record_numbers_json)
  ].map(normalizeResidentNumber));
}

function residentNumberForProfile(profile) {
  return normalizeResidentNumber(
    profile?.res_number ?? profile?.resident_id ?? profile?.Res_Number ?? profile?.client_id
  );
}

function facilityIdForProfile(profile) {
  return textValue(profile?.facility_id ?? profile?.Facility ?? profile?.facility);
}

function verifiedCountyForClient(client) {
  if (textValue(client?.county__completion_status).toLowerCase() !== "verified") return null;
  const counties = new Map();
  for (const value of values(client?.county)) {
    const county = textValue(value).replace(/\s+county$/i, "").trim();
    if (county) counties.set(county.toLowerCase(), county);
  }
  return counties.size === 1 ? [...counties.values()][0] : null;
}

/**
 * Build roster-reconciling aggregate rows without returning client identity or
 * resident-level source data.
 *
 * @param {any[]} residentProfiles
 * @param {any | null} clientDatabase
 * @param {string} asOfDate
 */
export function buildVerifiedClientCountyRows(residentProfiles, clientDatabase, asOfDate) {
  if (!Array.isArray(residentProfiles) || !Array.isArray(clientDatabase?.clients)) return [];

  const clientsByExactKey = new Map();
  clientDatabase.clients.forEach((client) => {
    const identity = textValue(client?.canonical_client_id);
    if (!identity) return;
    for (const id of facilityIdsForClient(client)) {
      for (const residentNumber of residentNumbersForClient(client)) {
        const key = `${id}|${residentNumber}`;
        const candidates = clientsByExactKey.get(key) ?? new Map();
        candidates.set(identity, client);
        clientsByExactKey.set(key, candidates);
      }
    }
  });

  const counts = new Map();
  for (const profile of residentProfiles) {
    const id = facilityIdForProfile(profile);
    if (!id) continue;
    const residentNumber = residentNumberForProfile(profile);
    const candidates = residentNumber ? clientsByExactKey.get(`${id}|${residentNumber}`) : null;
    const client = candidates?.size === 1 ? [...candidates.values()][0] : null;
    const county = client ? verifiedCountyForClient(client) : null;
    const key = `${id}|${county ?? ""}`;
    counts.set(key, {
      facility_id: id,
      client_county: county,
      resident_count: (counts.get(key)?.resident_count ?? 0) + 1,
      as_of_date: asOfDate,
      source_as_of_date: textValue(clientDatabase.baseline_date).slice(0, 10) || null,
      source_field: "client_database.county:verified_exact_resident_number_and_community"
    });
  }

  return [...counts.values()].sort((left, right) =>
    left.facility_id.localeCompare(right.facility_id) ||
    textValue(left.client_county).localeCompare(textValue(right.client_county))
  );
}
