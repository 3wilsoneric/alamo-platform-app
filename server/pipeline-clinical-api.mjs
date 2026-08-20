import { ALAMO_FACILITIES, normalizeKnownCommunityNames } from "../shared/community-names.mjs";
import { normalizeDisplayDateKey } from "../shared/display-date.mjs";
import { requireApiUser } from "./api-auth.mjs";
import { createHttpError, getApiError, getRequestUrl } from "./http-errors.mjs";
import { applyProtectedApiHeaders } from "./http-response.mjs";
import { getBoundedIntegerEnv, getBoundedNumberEnv } from "./runtime-environment.mjs";
import { getSnapshotFreshness } from "./snapshot-status.mjs";
import { buildDataExplorerPayload } from "./data-explorer.mjs";
import {
  readPlatformClientDatabase,
  readPlatformClientDocumentAsset,
  readPlatformSnapshot
} from "./platform-snapshot.mjs";

export const PIPELINE_CLINICAL_API_PREFIX = "/api/integrations/pipeline/clinical";
export const PIPELINE_CLINICAL_CONTRACT_VERSION = "1.1";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const DEFAULT_MAX_AGE_HOURS = 24;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const facilityById = new Map(ALAMO_FACILITIES.map((facility) => [facility.facilityId, facility]));

/**
 * @param {number} statusCode
 * @param {string} code
 * @param {string} message
 * @param {unknown} [details]
 */
function clinicalError(statusCode, code, message, details = null) {
  return createHttpError(statusCode, `api_pipeline_clinical_${code}`, message, details);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rows(value) {
  return Array.isArray(value) && value.every(isObject) ? value : null;
}

function requiredRows(value, label) {
  const valueRows = rows(value);
  if (!valueRows) {
    throw clinicalError(502, "snapshot_invalid", `The governed snapshot has an invalid ${label} contract.`);
  }
  return valueRows;
}

function requiredText(value, label, maximumLength = 256) {
  if (typeof value !== "string") {
    throw clinicalError(502, "snapshot_invalid", `The governed snapshot is missing ${label}.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) {
    throw clinicalError(502, "snapshot_invalid", `The governed snapshot has an invalid ${label}.`);
  }
  return normalized;
}

function nullableText(value, label, maximumLength = 1000) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (typeof value !== "string" && typeof value !== "number") {
    throw clinicalError(502, "snapshot_invalid", `The governed snapshot has an invalid ${label}.`);
  }
  const normalized = String(value).trim();
  if (normalized.length > maximumLength) {
    throw clinicalError(502, "snapshot_invalid", `The governed snapshot has an oversized ${label}.`);
  }
  return normalized;
}

function nullableInteger(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(normalized) || normalized < minimum || normalized > maximum) {
    throw clinicalError(502, "snapshot_invalid", `The governed snapshot has an invalid ${label}.`);
  }
  return normalized;
}

function isoDate(value, label, required = false) {
  if (value === null || value === undefined || String(value).trim() === "") {
    if (required) throw clinicalError(502, "snapshot_invalid", `The governed snapshot is missing ${label}.`);
    return null;
  }
  const normalized = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw clinicalError(502, "snapshot_invalid", `The governed snapshot has an invalid ${label}.`);
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw clinicalError(502, "snapshot_invalid", `The governed snapshot has an invalid ${label}.`);
  }
  return normalized;
}

function governedSourceDate(value, label) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(raw) && !/^\d{1,2}!\d{1,2}!\d{4}$/.test(raw)) {
    throw clinicalError(502, "snapshot_invalid", `The governed snapshot has an invalid ${label}.`);
  }
  const normalized = normalizeDisplayDateKey(raw);
  if (!normalized) {
    throw clinicalError(502, "snapshot_invalid", `The governed snapshot has an invalid ${label}.`);
  }
  return normalized;
}

function governedDisplayDate(value, label) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const normalized = normalizeDisplayDateKey(String(value).trim());
  if (!normalized) {
    throw clinicalError(502, "snapshot_invalid", `The governed snapshot has an invalid ${label}.`);
  }
  return normalized;
}

function facilityId(value, label) {
  const normalized = requiredText(value, label, 64);
  if (!facilityById.has(normalized)) {
    throw clinicalError(502, "invalid_facility", "The governed snapshot contains an unapproved facility identifier.");
  }
  return normalized;
}

function approvedFacility(id) {
  const facility = facilityById.get(id);
  if (!facility) {
    throw clinicalError(502, "invalid_facility", "The governed snapshot contains an unapproved facility identifier.");
  }
  return facility;
}

function residentId(value) {
  const normalized = requiredText(value, "resident identifier", 128);
  if (!/^[a-z0-9._-]+$/i.test(normalized)) {
    throw clinicalError(502, "snapshot_invalid", "The governed snapshot contains an invalid resident identifier.");
  }
  return normalized;
}

function getToolRows(snapshot, tableName, legacyName) {
  const toolContext = snapshot.reportsSummary?.toolContext;
  return rows(toolContext?.tables?.[tableName]) ?? rows(toolContext?.[legacyName]) ?? [];
}

function getPipelineFreshness(snapshot, now) {
  const maxAgeHours = getBoundedNumberEnv(
    "PIPELINE_CLINICAL_SNAPSHOT_MAX_AGE_HOURS",
    DEFAULT_MAX_AGE_HOURS,
    1,
    24 * 14
  );
  const freshness = getSnapshotFreshness(snapshot, { maxAgeHours, now });
  const ageHours = typeof freshness.ageHours === "number" && Number.isFinite(freshness.ageHours)
    ? Number(Math.max(0, freshness.ageHours).toFixed(2))
    : null;
  const generatedAt = snapshot.snapshot.generated_at;
  const calculatedAgeHours = Math.max(0, (now.getTime() - Date.parse(generatedAt)) / 36e5);

  return {
    status: freshness.generated_at ? (freshness.stale ? "stale" : "fresh") : "unknown",
    age_hours: ageHours ?? Number(calculatedAgeHours.toFixed(2)),
    max_age_hours: maxAgeHours,
    warning: freshness.warning
  };
}

function getQaSummary(snapshot) {
  const healthQa = isObject(snapshot.health?.analystDataQa) ? snapshot.health.analystDataQa : null;
  const qaRows = getToolRows(snapshot, "analyst_data_qa", "analystDataQa");
  const failed = healthQa
    ? nullableInteger(healthQa.failed, "analyst QA failed count")
    : qaRows.filter((row) => String(row.status ?? "").trim().toUpperCase() === "FAIL").length;
  const total = healthQa
    ? nullableInteger(healthQa.total, "analyst QA total count")
    : qaRows.length;
  const warnings = healthQa
    ? nullableInteger(healthQa.warnings, "analyst QA warning count")
    : qaRows.filter((row) => String(row.status ?? "").trim().toUpperCase() === "WARN").length;

  return {
    available: Boolean(total && total > 0),
    approved: Boolean(total && total > 0 && failed === 0),
    total,
    failed,
    warnings
  };
}

function validateSnapshot(snapshot) {
  if (!isObject(snapshot) || !isObject(snapshot.snapshot) || !isObject(snapshot.communities)) {
    throw clinicalError(502, "snapshot_invalid", "The published clinical snapshot is malformed.");
  }
  const snapshotId = requiredText(snapshot.snapshot.version ?? snapshot.snapshot.generated_at, "snapshot identifier");
  const generatedAt = requiredText(snapshot.snapshot.generated_at, "snapshot generated timestamp");
  if (snapshot.snapshot.source !== "published-snapshot") {
    throw clinicalError(502, "snapshot_invalid", "The clinical source is not a governed published snapshot.");
  }
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw clinicalError(502, "snapshot_invalid", "The governed snapshot has an invalid generated timestamp.");
  }
  const dataAsOf = isoDate(snapshot.snapshot.as_of_date ?? snapshot.communities.as_of_date, "data as-of date", true);
  if (snapshot.snapshot.as_of_date && snapshot.communities.as_of_date && snapshot.snapshot.as_of_date !== snapshot.communities.as_of_date) {
    throw clinicalError(502, "snapshot_invalid", "The governed snapshot has conflicting data as-of dates.");
  }
  if (snapshot.health?.ok !== true) {
    throw clinicalError(503, "source_unready", "The governed clinical source is not healthy.");
  }

  const facilities = requiredRows(snapshot.communities.facilities, "facility directory");
  const residentRows = requiredRows(snapshot.communities.residents, "resident roster");
  const censusRows = requiredRows(snapshot.communities.census, "census");
  const seenFacilities = new Set();
  for (const row of facilities) {
    const id = facilityId(row.facility_id, "facility identifier");
    if (seenFacilities.has(id)) {
      throw clinicalError(502, "invalid_facility", "The governed snapshot contains duplicate facility identifiers.");
    }
    seenFacilities.add(id);
  }
  if (!seenFacilities.size) {
    throw clinicalError(502, "snapshot_invalid", "The governed snapshot contains no approved facilities.");
  }

  const qa = getQaSummary(snapshot);
  if (!qa.approved) {
    throw clinicalError(502, "qa_not_approved", "The published clinical snapshot is not backed by a passing governed QA result.");
  }

  return { snapshotId, generatedAt, dataAsOf, facilities, residentRows, censusRows, qa, seenFacilities };
}

function buildMetadata(context, snapshot, now) {
  return {
    source: "alamo_platform",
    snapshot_id: context.snapshotId,
    generated_at: context.generatedAt,
    data_as_of: context.dataAsOf,
    retrieved_at: now.toISOString(),
    freshness: getPipelineFreshness(snapshot, now)
  };
}

function attachCanonicalClientIndex(snapshot, context, clientDatabase) {
  const canonicalByResidentKey = new Map();
  if (clientDatabase) {
    const explorer = getClientExplorer(snapshot, clientDatabase);
    for (const row of explorer.rows) {
      if (!row.current_resident || !row.canonical_client_id || !row.facility_id || !row.res_number) continue;
      const residentKey = `${row.facility_id}:${row.res_number}`;
      const existing = canonicalByResidentKey.get(residentKey);
      if (existing && existing !== row.canonical_client_id) {
        throw clinicalError(502, "canonical_identity_ambiguous", "A current resident maps to more than one canonical client identifier.");
      }
      canonicalByResidentKey.set(residentKey, row.canonical_client_id);
    }
  }
  return { ...context, canonicalByResidentKey };
}

function projectRoster(context) {
  const projected = [];
  const seenKeys = new Set();

  for (const row of context.residentRows) {
    const id = residentId(row.res_number ?? row.resident_id);
    const communityId = facilityId(row.facility_id, "resident facility identifier");
    if (!context.seenFacilities.has(communityId)) {
      throw clinicalError(502, "invalid_facility", "A resident references a facility missing from the governed directory.");
    }
    const residentKey = `${communityId}:${id}`;
    if (seenKeys.has(residentKey)) {
      throw clinicalError(502, "duplicate_resident_key", "The governed roster contains a duplicate community-qualified resident key.");
    }
    seenKeys.add(residentKey);

    const firstName = nullableText(row.first_name, "resident first name", 200);
    const lastName = nullableText(row.last_name, "resident last name", 200);
    const displayName = [firstName, lastName].filter(Boolean).join(" ");
    if (!displayName) {
      throw clinicalError(502, "snapshot_invalid", "A governed resident record is missing its display name.");
    }
    const admitDate = governedSourceDate(row.admit_date, "resident admit date");
    if (admitDate && admitDate > context.dataAsOf) {
      throw clinicalError(502, "snapshot_invalid", "A resident admit date is later than the snapshot as-of date.");
    }
    const facility = approvedFacility(communityId);

    projected.push({
      resident_id: id,
      resident_key: residentKey,
      canonical_client_id: nullableText(
        row.canonical_client_id ?? context.canonicalByResidentKey?.get(residentKey),
        "canonical client identifier",
        256
      ),
      resident_number: nullableText(row.res_number, "resident number", 128),
      display_name: displayName,
      first_name: firstName,
      last_name: lastName,
      community_id: communityId,
      community_name: facility.communityName,
      unit: nullableText(row.unit_number, "resident unit", 200),
      age: nullableInteger(row.age, "resident age", 0, 125),
      admit_date: admitDate,
      length_of_stay_days: nullableInteger(row.los_days, "resident length of stay", 0, 36500),
      care_level: nullableText(row.care_level, "resident care level"),
      payor: nullableText(row.payor, "resident payor"),
      primary_diagnosis: nullableText(row.primary_diagnosis, "resident primary diagnosis", 2000),
      physician: nullableText(row.physician, "resident physician"),
      diet: nullableText(row.diet, "resident diet", 2000)
    });
  }

  return projected.sort(compareResidents);
}

function compareResidents(left, right) {
  for (const [leftValue, rightValue] of [
    [left.community_id, right.community_id],
    [left.last_name ?? "", right.last_name ?? ""],
    [left.first_name ?? "", right.first_name ?? ""],
    [left.resident_id, right.resident_id]
  ]) {
    const comparison = leftValue.toLowerCase().localeCompare(rightValue.toLowerCase(), "en");
    if (comparison) return comparison;
  }
  return left.resident_key.localeCompare(right.resident_key, "en");
}

function latestCensusByFacility(context) {
  const latest = new Map();
  const seenRows = new Set();
  for (const row of context.censusRows) {
    const id = facilityId(row.facility_id, "census facility identifier");
    if (!context.seenFacilities.has(id)) {
      throw clinicalError(502, "invalid_facility", "A census row references a facility missing from the governed directory.");
    }
    const month = requiredText(row.month_bucket, "census month", 7);
    if (!/^\d{4}-\d{2}$/.test(month) || month > context.dataAsOf.slice(0, 7)) {
      throw clinicalError(502, "snapshot_invalid", "The governed snapshot contains an invalid census month.");
    }
    const rowKey = `${id}:${month}`;
    if (seenRows.has(rowKey)) {
      throw clinicalError(502, "snapshot_invalid", "The governed snapshot contains duplicate facility-month census rows.");
    }
    seenRows.add(rowKey);
    const facility = approvedFacility(id);
    const census = nullableInteger(row.census, "census count", 0, facility.licensedCapacity);
    if (census === null) continue;
    const current = latest.get(id);
    if (!current || month > current.month) latest.set(id, { month, census });
  }
  return latest;
}

function buildCensusResponse(snapshot, context, now) {
  const metadata = buildMetadata(context, snapshot, now);
  const roster = projectRoster(context);
  const latestCensus = latestCensusByFacility(context);
  const rosterCounts = new Map();
  for (const resident of roster) {
    rosterCounts.set(resident.community_id, (rosterCounts.get(resident.community_id) ?? 0) + 1);
  }

  const communities = [...context.seenFacilities]
    .sort()
    .map((id) => {
      const facility = approvedFacility(id);
      const currentCensus = latestCensus.get(id)?.census ?? null;
      const rosterCount = rosterCounts.get(id) ?? 0;
      const delta = currentCensus === null ? null : currentCensus - rosterCount;
      return {
        community_id: id,
        community_name: normalizeKnownCommunityNames(facility.communityName),
        city: facility.city,
        state: facility.state,
        current_census: currentCensus,
        roster_count: rosterCount,
        reconciliation_status: currentCensus === null ? "unavailable" : delta === 0 ? "matched" : "mismatch",
        delta
      };
    });
  const censusComplete = communities.every((community) => community.current_census !== null);
  const portfolioCensusTotal = censusComplete
    ? communities.reduce((total, community) => total + community.current_census, 0)
    : null;
  const rosterCount = roster.length;
  const delta = portfolioCensusTotal === null ? null : portfolioCensusTotal - rosterCount;

  return {
    ...metadata,
    communities,
    portfolio_census_total: portfolioCensusTotal,
    roster_count: rosterCount,
    reconciliation_status: portfolioCensusTotal === null ? "unavailable" : delta === 0 ? "matched" : "mismatch",
    delta
  };
}

function normalizeSearchParameter(value, name) {
  const normalized = String(value ?? "").trim();
  if (normalized.length > 128) {
    throw clinicalError(400, "query_invalid", `${name} must be 128 characters or fewer.`);
  }
  return normalized;
}

function parseLimit(value) {
  if (value === null || value === undefined || value === "") return DEFAULT_PAGE_SIZE;
  if (!/^\d+$/.test(value)) {
    throw clinicalError(400, "limit_invalid", "limit must be an integer between 1 and 200.");
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw clinicalError(400, "limit_invalid", "limit must be an integer between 1 and 200.");
  }
  return limit;
}

function encodeCursor(snapshotId, offset) {
  return Buffer.from(JSON.stringify({ version: 1, snapshot_id: snapshotId, offset }), "utf8").toString("base64url");
}

function decodeCursor(value, snapshotId) {
  if (!value) return 0;
  if (value.length > 1024) throw clinicalError(400, "cursor_invalid", "The roster cursor is invalid.");
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!isObject(parsed) || parsed.version !== 1 || !Number.isInteger(parsed.offset) || parsed.offset < 0) {
      throw new Error("invalid cursor");
    }
    if (parsed.snapshot_id !== snapshotId) {
      throw clinicalError(409, "cursor_snapshot_changed", "The clinical snapshot changed. Restart roster pagination.");
    }
    return parsed.offset;
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 409) throw error;
    throw clinicalError(400, "cursor_invalid", "The roster cursor is invalid.");
  }
}

function matchesCommunity(resident, query) {
  if (!query) return true;
  const normalized = query.toLowerCase();
  const facility = approvedFacility(resident.community_id);
  return resident.community_id.toLowerCase() === normalized || [
    resident.community_name,
    facility?.shortName,
    facility?.operatingSiteName,
    ...(facility?.aliases ?? [])
  ].some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

function matchesRosterQuery(resident, query) {
  if (!query) return true;
  const normalized = query.toLowerCase();
  return [
    resident.display_name,
    resident.first_name,
    resident.last_name,
    resident.resident_id,
    resident.resident_key,
    resident.canonical_client_id,
    resident.community_id,
    resident.community_name,
    resident.unit,
    resident.care_level
  ].some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

function requireClientDatabase(clientDatabase) {
  if (!clientDatabase) {
    throw clinicalError(
      503,
      "client_database_unavailable",
      "The governed enhanced client database is not available in this snapshot."
    );
  }
  return clientDatabase;
}

function getClientExplorer(snapshot, clientDatabase, residentClientId = "") {
  const explorer = buildDataExplorerPayload(snapshot, "residents", getSnapshotFreshness(snapshot), {
    clientDatabase: requireClientDatabase(clientDatabase),
    residentClientId
  });
  if (!explorer.client_database) {
    throw clinicalError(502, "client_database_invalid", "The governed client database metadata is missing.");
  }
  return explorer;
}

function boundedStringList(value, maximumItems = 100, maximumLength = 256) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item && item.length <= maximumLength))]
    .slice(0, maximumItems);
}

function projectClientDirectoryRow(row) {
  const canonicalClientId = requiredText(row.canonical_client_id, "canonical client identifier", 256);
  return {
    canonical_client_id: canonicalClientId,
    display_name: requiredText(row.resident_name, "client display name", 400),
    resident_numbers: boundedStringList(row.resident_numbers),
    current_resident: row.current_resident === true,
    community_names: boundedStringList(row.community_names, 25, 200),
    current_community: nullableText(row.community_name, "client community", 200),
    unit: nullableText(row.unit, "client unit", 200),
    admit_date: governedDisplayDate(row.admit_date, "client admit date"),
    care_level: nullableText(row.care_level, "client care level", 500),
    episode_count: nullableInteger(row.resident_episode_count, "client episode count") ?? 0
  };
}

function projectClientSourceDocuments(clientDatabase, canonicalClientId) {
  const documents = Array.isArray(clientDatabase?.documents) ? clientDatabase.documents : [];
  return documents
    .filter((document) => String(document.canonical_client_id ?? "").trim() === canonicalClientId)
    .map((document) => {
      const contentType = requiredText(document.content_type, "client document content type", 128).toLowerCase();
      if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(contentType)) {
        throw clinicalError(502, "client_database_invalid", "The governed client database contains an unapproved document content type.");
      }
      const linkedAt = nullableText(document.linked_at, "client document linked timestamp", 64);
      if (linkedAt && !Number.isFinite(Date.parse(linkedAt))) {
        throw clinicalError(502, "client_database_invalid", "The governed client database contains an invalid document timestamp.");
      }
      return {
        document_id: requiredText(document.document_id, "client document identifier", 256),
        display_name: requiredText(document.display_name, "client document display name", 500),
        content_type: contentType,
        page_count: nullableInteger(document.page_count, "client document page count", 1, 10_000),
        linked_at: linkedAt,
        link_source: nullableText(document.link_source, "client document link source", 128),
        thumbnail_available: Boolean(document.thumbnail_path),
        preview_available: Boolean(document.preview_path)
      };
    })
    .sort((left, right) =>
      String(right.linked_at ?? "").localeCompare(String(left.linked_at ?? "")) ||
      left.display_name.localeCompare(right.display_name) ||
      left.document_id.localeCompare(right.document_id)
    );
}

function matchesClientQuery(row, query) {
  if (!query) return true;
  const normalized = query.toLowerCase();
  return [
    row.client_name_search,
    row.resident_name,
    row.canonical_client_id,
    ...(Array.isArray(row.resident_numbers) ? row.resident_numbers : [])
  ].some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

function matchesClientCommunity(row, query) {
  if (!query) return true;
  const normalized = query.toLowerCase();
  return [row.community_name, ...(Array.isArray(row.community_names) ? row.community_names : [])]
    .some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

function buildClientDirectoryResponse(snapshot, context, clientDatabase, requestUrl, now) {
  const q = normalizeSearchParameter(requestUrl.searchParams.get("q"), "q");
  const community = normalizeSearchParameter(requestUrl.searchParams.get("community"), "community");
  const limit = parseLimit(requestUrl.searchParams.get("limit"));
  const offset = decodeCursor(requestUrl.searchParams.get("cursor"), context.snapshotId);
  const explorer = getClientExplorer(snapshot, clientDatabase);
  const clientDatabaseMetadata = explorer.client_database;
  if (!clientDatabaseMetadata) {
    throw clinicalError(502, "client_database_invalid", "The governed client database metadata is missing.");
  }
  const matching = explorer.rows
    .filter((row) => row.canonical_client_id && matchesClientQuery(row, q) && matchesClientCommunity(row, community));
  if (offset > matching.length) {
    throw clinicalError(400, "cursor_invalid", "The client-directory cursor is outside the current result set.");
  }
  const clients = matching.slice(offset, offset + limit).map(projectClientDirectoryRow);
  const nextOffset = offset + clients.length;
  return {
    ...buildMetadata(context, snapshot, now),
    clients,
    total: matching.length,
    limit,
    next_cursor: nextOffset < matching.length ? encodeCursor(context.snapshotId, nextOffset) : null,
    query: q,
    community: community || null,
    client_database: {
      dataset: clientDatabaseMetadata.dataset,
      version: clientDatabaseMetadata.version,
      baseline_date: clientDatabaseMetadata.baseline_date,
      generated_at: clientDatabaseMetadata.generated_at,
      client_count: clientDatabaseMetadata.client_count,
      field_count: clientDatabaseMetadata.field_count
    }
  };
}

function buildClientResponse(snapshot, context, clientDatabase, canonicalClientId, now) {
  const identifier = requiredText(canonicalClientId, "canonical client identifier", 256);
  const explorer = getClientExplorer(snapshot, clientDatabase, identifier);
  const clientDatabaseMetadata = explorer.client_database;
  if (!clientDatabaseMetadata) {
    throw clinicalError(502, "client_database_invalid", "The governed client database metadata is missing.");
  }
  const row = explorer.rows[0];
  if (!row || row.canonical_client_id !== identifier) {
    throw clinicalError(404, "client_not_found", "Client was not found in the governed client database.");
  }
  return {
    ...buildMetadata(context, snapshot, now),
    client: {
      ...projectClientDirectoryRow({
        ...row,
        resident_episode_count: Array.isArray(row.resident_episode_history)
          ? row.resident_episode_history.length
          : 0
      }),
      resident_profile: row.resident_profile ?? null,
      resident_profiles: Array.isArray(row.resident_profiles) ? row.resident_profiles : [],
      resident_episode_history: Array.isArray(row.resident_episode_history)
        ? row.resident_episode_history
        : [],
      enrichment: row.client_profile,
      source_documents: projectClientSourceDocuments(clientDatabase, identifier)
    },
    client_database: {
      dataset: clientDatabaseMetadata.dataset,
      version: clientDatabaseMetadata.version,
      baseline_date: clientDatabaseMetadata.baseline_date,
      generated_at: clientDatabaseMetadata.generated_at,
      field_count: clientDatabaseMetadata.field_count,
      fields: clientDatabaseMetadata.columns
    }
  };
}

function buildRosterResponse(snapshot, context, requestUrl, now) {
  const q = normalizeSearchParameter(requestUrl.searchParams.get("q"), "q");
  const community = normalizeSearchParameter(requestUrl.searchParams.get("community"), "community");
  const limit = parseLimit(requestUrl.searchParams.get("limit"));
  const offset = decodeCursor(requestUrl.searchParams.get("cursor"), context.snapshotId);
  const matching = projectRoster(context).filter(
    (resident) => matchesCommunity(resident, community) && matchesRosterQuery(resident, q)
  );
  if (offset > matching.length) {
    throw clinicalError(400, "cursor_invalid", "The roster cursor is outside the current result set.");
  }
  const residents = matching.slice(offset, offset + limit);
  const nextOffset = offset + residents.length;

  return {
    ...buildMetadata(context, snapshot, now),
    residents,
    total: matching.length,
    limit,
    next_cursor: nextOffset < matching.length ? encodeCursor(context.snapshotId, nextOffset) : null,
    query: q,
    community: community || null
  };
}

function buildResidentResponse(snapshot, context, residentIdentifier, now) {
  const identifier = requiredText(residentIdentifier, "resident lookup identifier", 256);
  const normalized = identifier.toLowerCase();
  const roster = projectRoster(context);
  const matches = identifier.includes(":")
    ? roster.filter((resident) => resident.resident_key.toLowerCase() === normalized)
    : roster.filter((resident) => resident.resident_id.toLowerCase() === normalized);

  if (!matches.length) {
    throw clinicalError(404, "resident_not_found", "Resident was not found in the current governed roster.");
  }
  if (matches.length > 1) {
    throw clinicalError(
      409,
      "resident_identifier_ambiguous",
      "More than one resident matched that identifier. Use a community-qualified resident key.",
      { matching_resident_keys: matches.map((resident) => resident.resident_key).sort() }
    );
  }

  return {
    ...buildMetadata(context, snapshot, now),
    resident: matches[0]
  };
}

function medicationSourceRows(snapshot) {
  const compliance = getToolRows(snapshot, "medication_compliance_monthly", "medicationComplianceMonthly");
  const mar = getToolRows(snapshot, "mar_monthly_by_community_medication", "marMonthlyByCommunityMedication");
  return { compliance, mar };
}

function latestSharedMedicationMonth(complianceRows, marRows, dataAsOf) {
  const maxMonth = dataAsOf.slice(0, 7);
  const complianceMonths = new Set(
    complianceRows.map((row) => String(row.month_bucket ?? "").trim()).filter((month) => /^\d{4}-\d{2}$/.test(month) && month <= maxMonth)
  );
  const marMonths = new Set(
    marRows.map((row) => String(row.month_bucket ?? "").trim()).filter((month) => /^\d{4}-\d{2}$/.test(month) && month <= maxMonth)
  );
  return [...complianceMonths].filter((month) => marMonths.has(month)).sort().at(-1) ?? null;
}

function sumMedicationRows(valueRows, field, label) {
  let total = 0;
  for (const row of valueRows) {
    const value = nullableInteger(row[field], label);
    if (value === null) return null;
    total += value;
  }
  return total;
}

function buildMedicationSummaryResponse(snapshot, context, now) {
  const { compliance, mar } = medicationSourceRows(snapshot);
  const month = latestSharedMedicationMonth(compliance, mar, context.dataAsOf);
  if (!month) {
    throw clinicalError(503, "medication_summary_unavailable", "The governed medication summary is not available in this snapshot.");
  }

  const communities = [...context.seenFacilities].sort().map((id) => {
    const facility = approvedFacility(id);
    const complianceRows = compliance.filter((row) => facilityId(row.facility_id, "medication facility identifier") === id && row.month_bucket === month);
    const marRows = mar.filter((row) => facilityId(row.facility_id, "MAR facility identifier") === id && row.month_bucket === month);
    if (!complianceRows.length || !marRows.length) {
      return {
        community_id: id,
        community_name: facility.communityName,
        scheduled_count: null,
        given_count: null,
        compliance_pct: null,
        refusal_count: null,
        held_or_not_given_count: null
      };
    }

    const scheduled = sumMedicationRows(complianceRows, "total_scheduled", "scheduled medication count");
    const given = sumMedicationRows(complianceRows, "given", "given medication count");
    const heldOrNotGiven = sumMedicationRows(complianceRows, "not_given", "held or not-given medication count");
    const refusals = sumMedicationRows(marRows, "refusal_count", "medication refusal count");
    return {
      community_id: id,
      community_name: facility.communityName,
      scheduled_count: scheduled,
      given_count: given,
      compliance_pct: scheduled === null || given === null || scheduled === 0
        ? null
        : Number(((given / scheduled) * 100).toFixed(2)),
      refusal_count: refusals,
      held_or_not_given_count: heldOrNotGiven
    };
  });
  const complete = communities.every((community) => [
    community.scheduled_count,
    community.given_count,
    community.refusal_count,
    community.held_or_not_given_count
  ].every((value) => value !== null));
  const portfolio = complete
    ? {
        scheduled_count: communities.reduce((sum, row) => sum + Number(row.scheduled_count), 0),
        given_count: communities.reduce((sum, row) => sum + Number(row.given_count), 0),
        refusal_count: communities.reduce((sum, row) => sum + Number(row.refusal_count), 0),
        held_or_not_given_count: communities.reduce((sum, row) => sum + Number(row.held_or_not_given_count), 0)
      }
    : {
        scheduled_count: null,
        given_count: null,
        refusal_count: null,
        held_or_not_given_count: null
      };

  return {
    ...buildMetadata(context, snapshot, now),
    period: month,
    portfolio: {
      ...portfolio,
      compliance_pct: portfolio.scheduled_count === null || portfolio.given_count === null || portfolio.scheduled_count === 0
        ? null
        : Number(((portfolio.given_count / portfolio.scheduled_count) * 100).toFixed(2))
    },
    communities,
    coverage: {
      complete,
      communities_expected: communities.length,
      communities_reported: communities.filter((community) => community.scheduled_count !== null).length
    },
    detail_policy: "governed_summary_only"
  };
}

function unavailableMetadata(now) {
  return {
    source: "alamo_platform",
    snapshot_id: null,
    generated_at: null,
    data_as_of: null,
    retrieved_at: now.toISOString(),
    freshness: {
      status: "unknown",
      age_hours: null,
      max_age_hours: getBoundedNumberEnv(
        "PIPELINE_CLINICAL_SNAPSHOT_MAX_AGE_HOURS",
        DEFAULT_MAX_AGE_HOURS,
        1,
        24 * 14
      ),
      warning: "No QA-approved governed clinical snapshot is available."
    }
  };
}

function medicationReady(snapshot, context) {
  const { compliance, mar } = medicationSourceRows(snapshot);
  return Boolean(latestSharedMedicationMonth(compliance, mar, context.dataAsOf));
}

function buildHealthResponse(snapshot, clientDatabase, now) {
  if (!snapshot) {
    return {
      statusCode: 503,
      body: {
        ...unavailableMetadata(now),
        ready: false,
        status: "unavailable",
        contract_version: PIPELINE_CLINICAL_CONTRACT_VERSION,
        checks: {
          snapshot_available: false,
          qa_approved: false,
          census_ready: false,
          roster_ready: false,
          client_database_ready: false,
          medication_summary_ready: false
        }
      }
    };
  }

  try {
    const context = attachCanonicalClientIndex(snapshot, validateSnapshot(snapshot), clientDatabase);
    projectRoster(context);
    latestCensusByFacility(context);
    const metadata = buildMetadata(context, snapshot, now);
    const medicationsReady = medicationReady(snapshot, context);
    const clientDatabaseReady = Boolean(clientDatabase);
    const ready = metadata.freshness.status === "fresh" && medicationsReady && clientDatabaseReady;
    return {
      statusCode: ready ? 200 : 503,
      body: {
        ...metadata,
        ready,
        status: ready ? "ready" : "degraded",
        contract_version: PIPELINE_CLINICAL_CONTRACT_VERSION,
        checks: {
          snapshot_available: true,
          qa_approved: context.qa.approved,
          census_ready: true,
          roster_ready: true,
          client_database_ready: clientDatabaseReady,
          medication_summary_ready: medicationsReady
        }
      }
    };
  } catch {
    return {
      statusCode: 503,
      body: {
        ...unavailableMetadata(now),
        ready: false,
        status: "unavailable",
        contract_version: PIPELINE_CLINICAL_CONTRACT_VERSION,
        checks: {
          snapshot_available: true,
          qa_approved: false,
          census_ready: false,
          roster_ready: false,
          client_database_ready: false,
          medication_summary_ready: false
        }
      }
    };
  }
}

export function isPipelineClinicalPath(pathname) {
  return pathname === PIPELINE_CLINICAL_API_PREFIX || pathname.startsWith(`${PIPELINE_CLINICAL_API_PREFIX}/`);
}

export function parsePipelineClinicalClientDocumentPath(pathname) {
  const prefix = `${PIPELINE_CLINICAL_API_PREFIX}/clients/`;
  if (!pathname.startsWith(prefix)) return null;
  const segments = pathname.slice(prefix.length).split("/");
  if (segments.length !== 4 || segments[1] !== "documents" || !["thumbnail", "preview"].includes(segments[3])) {
    return null;
  }
  try {
    return {
      canonicalClientId: requiredText(decodeURIComponent(segments[0]), "canonical client identifier", 256),
      documentId: requiredText(decodeURIComponent(segments[2]), "client document identifier", 256),
      variant: segments[3]
    };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) throw error;
    throw clinicalError(400, "client_document_identifier_invalid", "The client document identifier is invalid.");
  }
}

export function buildPipelineClinicalApiResponse(snapshot, requestUrl, now = new Date(), clientDatabase = null) {
  const pathname = requestUrl.pathname;
  if (pathname === `${PIPELINE_CLINICAL_API_PREFIX}/health`) {
    return buildHealthResponse(snapshot, clientDatabase, now);
  }
  const context = attachCanonicalClientIndex(snapshot, validateSnapshot(snapshot), clientDatabase);

  if (pathname === `${PIPELINE_CLINICAL_API_PREFIX}/census`) {
    return { statusCode: 200, body: buildCensusResponse(snapshot, context, now) };
  }
  if (pathname === `${PIPELINE_CLINICAL_API_PREFIX}/roster`) {
    return { statusCode: 200, body: buildRosterResponse(snapshot, context, requestUrl, now) };
  }
  if (pathname === `${PIPELINE_CLINICAL_API_PREFIX}/clients`) {
    return {
      statusCode: 200,
      body: buildClientDirectoryResponse(snapshot, context, clientDatabase, requestUrl, now)
    };
  }
  if (pathname === `${PIPELINE_CLINICAL_API_PREFIX}/medications/summary`) {
    return { statusCode: 200, body: buildMedicationSummaryResponse(snapshot, context, now) };
  }
  const residentPrefix = `${PIPELINE_CLINICAL_API_PREFIX}/residents/`;
  if (pathname.startsWith(residentPrefix)) {
    let identifier;
    try {
      identifier = decodeURIComponent(pathname.slice(residentPrefix.length));
    } catch {
      throw clinicalError(400, "resident_identifier_invalid", "The resident lookup identifier is invalid.");
    }
    return { statusCode: 200, body: buildResidentResponse(snapshot, context, identifier, now) };
  }
  const clientPrefix = `${PIPELINE_CLINICAL_API_PREFIX}/clients/`;
  if (pathname.startsWith(clientPrefix)) {
    let identifier;
    try {
      identifier = decodeURIComponent(pathname.slice(clientPrefix.length));
    } catch {
      throw clinicalError(400, "client_identifier_invalid", "The canonical client identifier is invalid.");
    }
    return {
      statusCode: 200,
      body: buildClientResponse(snapshot, context, clientDatabase, identifier, now)
    };
  }
  throw clinicalError(404, "route_not_found", "Clinical integration route not found.");
}

function applyClinicalFreshnessHeaders(res, body) {
  res.setHeader("X-Alamo-Clinical-Contract", PIPELINE_CLINICAL_CONTRACT_VERSION);
  res.setHeader("X-Alamo-Data-Freshness", body?.freshness?.status ?? "unknown");
  if (body?.freshness?.status === "stale") {
    res.setHeader("Warning", '110 - "Response is from a stale governed snapshot"');
  }
}

function assertResponseSize(body) {
  const maxBytes = getBoundedIntegerEnv(
    "PIPELINE_CLINICAL_API_MAX_RESPONSE_BYTES",
    DEFAULT_MAX_RESPONSE_BYTES,
    64 * 1024,
    8 * 1024 * 1024
  );
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > maxBytes) {
    throw clinicalError(502, "response_too_large", "The bounded clinical response exceeds its configured size limit.");
  }
}

export async function handlePipelineClinicalApiRequest(req, res) {
  applyProtectedApiHeaders(res);
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    await requireApiUser(req, {
      requiredScope: process.env.PIPELINE_CLINICAL_API_SCOPE?.trim() || "Pipeline.Clinical.Read",
      requiredRole: process.env.PIPELINE_CLINICAL_API_ROLE?.trim() || "Pipeline.Clinical.Read.All",
      permissionMode: "scope-or-role"
    });
    const requestUrl = getRequestUrl(req);
    let snapshot = null;
    try {
      snapshot = await readPlatformSnapshot();
    } catch (error) {
      if (requestUrl.pathname !== `${PIPELINE_CLINICAL_API_PREFIX}/health`) throw error;
    }
    if (!snapshot && requestUrl.pathname !== `${PIPELINE_CLINICAL_API_PREFIX}/health`) {
      throw clinicalError(503, "snapshot_unavailable", "No governed clinical snapshot is available.");
    }
    let clientDatabase = null;
    if (snapshot?.clientDatabase) {
      try {
        clientDatabase = await readPlatformClientDatabase(snapshot);
      } catch (error) {
        if (requestUrl.pathname !== `${PIPELINE_CLINICAL_API_PREFIX}/health`) throw error;
      }
    }
    const documentRequest = parsePipelineClinicalClientDocumentPath(requestUrl.pathname);
    if (documentRequest) {
      const context = attachCanonicalClientIndex(snapshot, validateSnapshot(snapshot), clientDatabase);
      const metadata = buildMetadata(context, snapshot, new Date());
      const asset = await readPlatformClientDocumentAsset(
        requireClientDatabase(clientDatabase),
        documentRequest.canonicalClientId,
        documentRequest.documentId,
        documentRequest.variant
      );
      if (!asset) {
        throw clinicalError(404, "client_document_not_found", "The governed client document is not available.");
      }
      res.setHeader("Content-Disposition", `inline; filename="client-document.${asset.contentType === "application/pdf" ? "pdf" : asset.contentType.split("/")[1]}"`);
      res.setHeader("Content-Length", String(asset.body.byteLength));
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
      res.setHeader("Content-Type", asset.contentType);
      res.setHeader("X-Alamo-Clinical-Contract", PIPELINE_CLINICAL_CONTRACT_VERSION);
      res.setHeader("X-Alamo-Data-As-Of", metadata.data_as_of);
      res.setHeader("X-Alamo-Data-Freshness", metadata.freshness.status);
      res.setHeader("X-Alamo-Snapshot-Id", metadata.snapshot_id);
      res.status(200).send(asset.body);
      return;
    }
    const response = buildPipelineClinicalApiResponse(snapshot, requestUrl, new Date(), clientDatabase);
    assertResponseSize(response.body);
    applyClinicalFreshnessHeaders(res, response.body);
    res.status(response.statusCode).json(response.body);
  } catch (error) {
    const response = getApiError(error, "The Pipeline clinical integration is unavailable.");
    res.status(response.statusCode).json(response.body);
  }
}
