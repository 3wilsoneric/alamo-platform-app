import { ALAMO_FACILITIES, normalizeKnownCommunityNames } from "../shared/community-names.mjs";
import { normalizeDisplayDateKey } from "../shared/display-date.mjs";

const clientIndexCache = new WeakMap();
const clientExplorerCache = new WeakMap();
const facilityById = new Map(ALAMO_FACILITIES.map((facility) => [facility.facilityId, facility]));

function normalizeString(value) {
  return value == null ? "" : String(value).trim();
}

function canonicalClientId(row) {
  return normalizeString(row?.canonical_client_id);
}

function residentNumber(row) {
  return normalizeString(row?.res_number ?? row?.resident_number ?? row?.Res_Number);
}

function facilityId(row) {
  return normalizeString(row?.facility_id ?? row?.Facility ?? row?.facility);
}

function residentKey(row) {
  const facility = facilityId(row);
  const resident = residentNumber(row);
  return facility && resident ? `${facility}:${resident}` : "";
}

function sourceValues(value) {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(sourceValues);
  if (typeof value === "object") return Object.values(value).flatMap(sourceValues);

  const text = normalizeString(value);
  if (!text) return [];
  if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
    try {
      return sourceValues(JSON.parse(text));
    } catch {
      return [text];
    }
  }
  return [text];
}

function uniqueSorted(values) {
  return [...new Set(values.map(normalizeString).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

function firstValue(...values) {
  for (const value of values) {
    const first = sourceValues(value)[0];
    if (first) return first;
  }
  return "";
}

function normalizedDate(value) {
  const normalized = normalizeDisplayDateKey(normalizeString(value));
  return normalized || null;
}

function profileDate(row) {
  return normalizedDate(
    row?.latest_admit_date ?? row?.admit_date ?? row?.admission_date ?? row?.episode_start_date
  ) ?? "";
}

function sortLatestFirst(rows) {
  return [...rows].sort((left, right) =>
    profileDate(right).localeCompare(profileDate(left), "en") ||
    residentKey(left).localeCompare(residentKey(right), "en")
  );
}

function groupByCanonicalId(rows) {
  const groups = new Map();
  for (const row of rows) {
    const id = canonicalClientId(row);
    if (!id) continue;
    const group = groups.get(id) ?? [];
    group.push(row);
    groups.set(id, group);
  }
  return groups;
}

function communityName(row) {
  const sourceName = firstValue(row?.facility_name, row?.Facility_Name, row?.community_name);
  if (sourceName) return normalizeKnownCommunityNames(sourceName);
  const facility = facilityById.get(facilityId(row));
  return facility ? normalizeKnownCommunityNames(facility.communityName) : "";
}

function clientCommunities(client, profiles, episodes) {
  return uniqueSorted([
    ...sourceValues(client?.communities),
    ...sourceValues(client?.platform_facilities),
    ...sourceValues(client?.facility_canonical),
    ...profiles.map(communityName),
    ...episodes.map(communityName)
  ].map(normalizeKnownCommunityNames));
}

function clientResidentNumbers(client, profiles, episodes) {
  return uniqueSorted([
    ...sourceValues(client?.resident_numbers),
    ...sourceValues(client?.platform_resident_numbers),
    ...sourceValues(client?.medical_record_numbers_json),
    ...profiles.map(residentNumber),
    ...episodes.map(residentNumber)
  ]);
}

function clientDisplayName(client, currentProfile) {
  return firstValue(
    currentProfile?.resident_name,
    currentProfile?.client_name,
    [currentProfile?.first_name, currentProfile?.last_name].filter(Boolean).join(" "),
    client?.resident_name,
    client?.platform_resident_names,
    client?.name_variants
  );
}

function buildSearchText(client, currentProfile, displayName, residentNumbers) {
  return uniqueSorted([
    displayName,
    canonicalClientId(client),
    ...residentNumbers,
    ...sourceValues(client?.resident_name),
    ...sourceValues(client?.name_variants),
    ...sourceValues(client?.platform_resident_names),
    currentProfile?.resident_name,
    currentProfile?.client_name,
    currentProfile?.first_name,
    currentProfile?.last_name
  ]).join(" ");
}

export function indexPipelineClients(clientDatabase) {
  if (!clientDatabase || typeof clientDatabase !== "object") return new Map();
  const cached = clientIndexCache.get(clientDatabase);
  if (cached) return cached;

  const index = new Map();
  for (const client of clientDatabase.clients ?? []) {
    const id = canonicalClientId(client);
    if (!id || index.has(id)) {
      throw new Error("The governed client database has missing or duplicate canonical client identifiers.");
    }
    index.set(id, client);
  }
  clientIndexCache.set(clientDatabase, index);
  return index;
}

function clientDatabaseMetadata(clientDatabase) {
  return {
    available: true,
    dataset: normalizeString(clientDatabase.dataset) || "platform_client_database",
    version: clientDatabase.version,
    baseline_date: clientDatabase.baseline_date,
    generated_at: clientDatabase.generated_at,
    client_count: clientDatabase.client_count,
    field_count: clientDatabase.column_count,
    columns: clientDatabase.columns.map((column) =>
      typeof column === "string" ? column : normalizeString(column?.name)
    )
  };
}

function buildFullPipelineClientExplorer(snapshot, clientDatabase) {
  const tables = snapshot?.reportsSummary?.toolContext?.tables ?? {};
  const profiles = Array.isArray(tables.resident_profile)
    ? tables.resident_profile
    : Array.isArray(snapshot?.reportsSummary?.toolContext?.residentProfiles)
      ? snapshot.reportsSummary.toolContext.residentProfiles
      : [];
  const episodes = Array.isArray(tables.resident_episode_history)
    ? tables.resident_episode_history
    : Array.isArray(snapshot?.reportsSummary?.toolContext?.residentEpisodeHistory)
      ? snapshot.reportsSummary.toolContext.residentEpisodeHistory
      : [];
  const profilesByCanonicalId = groupByCanonicalId(profiles);
  const episodesByCanonicalId = groupByCanonicalId(episodes);
  const clientIndex = indexPipelineClients(clientDatabase);
  const clients = [...clientIndex.values()];

  const rows = clients.map((client) => {
    const id = canonicalClientId(client);
    const residentProfiles = sortLatestFirst(profilesByCanonicalId.get(id) ?? []);
    const currentProfile = residentProfiles[0] ?? null;
    const episodeHistory = sortLatestFirst(episodesByCanonicalId.get(id) ?? []);
    const residentNumbers = clientResidentNumbers(client, residentProfiles, episodeHistory);
    const communityNames = clientCommunities(client, residentProfiles, episodeHistory);
    const displayName = clientDisplayName(client, currentProfile);
    if (!displayName) {
      throw new Error("The governed client database contains a client without a display name.");
    }
    const currentCommunity = currentProfile ? communityName(currentProfile) || null : null;

    return {
      canonical_client_id: id,
      resident_name: displayName,
      resident_numbers: residentNumbers,
      current_resident: Boolean(currentProfile),
      community_names: communityNames,
      community_name: currentCommunity,
      facility_id: currentProfile ? facilityId(currentProfile) || null : null,
      res_number: currentProfile ? residentNumber(currentProfile) || null : null,
      unit: currentProfile
        ? firstValue(currentProfile.unit_number, currentProfile.unit, currentProfile.Unit_Number) || null
        : null,
      admit_date: currentProfile ? normalizedDate(
        currentProfile.admit_date ?? currentProfile.admission_date ?? currentProfile.latest_admit_date
      ) : null,
      care_level: currentProfile ? firstValue(currentProfile.care_level) || null : null,
      resident_episode_count: episodeHistory.length,
      client_name_search: buildSearchText(client, currentProfile, displayName, residentNumbers),
      client_profile: client,
      resident_profile: currentProfile,
      resident_profiles: residentProfiles,
      resident_episode_history: episodeHistory
    };
  }).sort((left, right) =>
    Number(right.current_resident) - Number(left.current_resident) ||
    String(left.community_name ?? "").localeCompare(String(right.community_name ?? ""), "en") ||
    left.resident_name.localeCompare(right.resident_name, "en") ||
    left.canonical_client_id.localeCompare(right.canonical_client_id, "en")
  );

  return {
    rows,
    client_database: clientDatabaseMetadata(clientDatabase)
  };
}

export function buildPipelineClientExplorer(snapshot, clientDatabase, selectedCanonicalClientId = "") {
  let databaseCache = clientExplorerCache.get(snapshot);
  if (!databaseCache) {
    databaseCache = new WeakMap();
    clientExplorerCache.set(snapshot, databaseCache);
  }

  let explorer = databaseCache.get(clientDatabase);
  if (!explorer) {
    explorer = buildFullPipelineClientExplorer(snapshot, clientDatabase);
    databaseCache.set(clientDatabase, explorer);
  }

  const selectedId = normalizeString(selectedCanonicalClientId);
  if (!selectedId) return explorer;
  return {
    ...explorer,
    rows: explorer.rows.filter((row) => row.canonical_client_id === selectedId)
  };
}
