import { createHash } from "node:crypto";
import { ALAMO_FACILITIES } from "../shared/community-names.mjs";
import { normalizeDisplayDateKey, normalizeDisplayTimestamp } from "../shared/display-date.mjs";
import { getGovernedIncidentDetailRows } from "./governed-incident-details.mjs";
import { createHttpError, HttpError } from "./http-errors.mjs";
import { readPlatformSnapshot } from "./platform-snapshot.mjs";
import { getSnapshotFreshness } from "./snapshot-status.mjs";
import { queryDatabricks } from "./databricks.mjs";
import { queryExecutiveDirectorIncidentsLive } from "./executive-director-incidents-live.mjs";

const VERSION = "executive-director-incidents-v1";
const FACILITY_IDS = new Set(ALAMO_FACILITIES.map((facility) => facility.facilityId));

function text(value) {
  return value == null ? "" : String(value).trim();
}

function nullableText(value) {
  return text(value) || null;
}

function recordedBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === 1 || /^(yes|true|y|1)$/i.test(text(value))) return true;
  if (value === 0 || /^(no|false|n|0)$/i.test(text(value))) return false;
  return null;
}

function queryText(value, name, maximum) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > maximum || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw createHttpError(400, "executive_incidents_query_invalid", `${name} is invalid.`);
  }
  return value.trim();
}

function dateFilter(value, name) {
  const date = queryText(value, name, 10);
  const parsed = new Date(`${date}T12:00:00Z`);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)) {
    throw createHttpError(400, "executive_incidents_date_invalid", `${name} must be a valid YYYY-MM-DD date.`);
  }
  return date;
}

export function normalizeExecutiveIncidentOptions(options) {
  const facilityId = queryText(options.facilityId, "Community", 20);
  if (!FACILITY_IDS.has(facilityId)) throw createHttpError(400, "executive_director_facility_invalid", "Choose a listed Alamo community.");
  const query = queryText(options.query, "Search", 160);
  const category = queryText(options.category, "Category", 160);
  const from = dateFilter(options.from, "Start date");
  const to = dateFilter(options.to, "End date");
  if (from && to && from > to) throw createHttpError(400, "executive_incidents_date_invalid", "Start date must be on or before end date.");
  const rawLimit = options.limit == null || options.limit === "" ? "25" : String(options.limit);
  const limit = Number(rawLimit);
  if (!/^\d+$/.test(rawLimit) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw createHttpError(400, "executive_incidents_limit_invalid", "Choose a page size from 1 to 100.");
  }
  const cursor = queryText(options.cursor, "Page cursor", 512);
  let page = null;
  if (cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("invalid");
      page = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (!Array.isArray(page) || ![1, 2].includes(page[0]) || !/^[a-f0-9]{64}$/.test(page[1])) throw new Error("invalid");
      const offset = page[0] === 1 ? page[2] : page[3];
      if (page.length !== (page[0] === 1 ? 3 : 4) || !Number.isSafeInteger(offset) || offset < 1 || offset > 2_147_483_647) throw new Error("invalid");
      if (page[0] === 2 && !/^[a-f0-9]{64}$/.test(page[2])) throw new Error("invalid");
    } catch {
      throw createHttpError(400, "executive_incidents_cursor_invalid", "The incident page cursor is invalid.");
    }
  }
  return { facilityId, query, category, from, to, limit, page };
}

export function normalizeExecutiveIncident(row, index) {
  const residentId = nullableText(row.resident_id ?? row.Res_Number ?? row.client_id);
  const date = normalizeDisplayDateKey(row.incident_date ?? row.Incident_Date_parsed ?? row.event_date);
  const receivedAt = normalizeDisplayTimestamp(row.received_at ?? row.__TIMESTAMP);
  const sourceId = text(row.id ?? row.incident_id ?? row.Unique_ID);
  return {
    id: sourceId || `record-${createHash("sha256").update(JSON.stringify(row)).digest("hex").slice(0, 20)}-${index}`,
    residentId,
    residentName: text(row.client_name ?? row.resident_name) || [text(row.First_Name), text(row.Last_Name)].filter(Boolean).join(" ") || (residentId ? `Resident ${residentId}` : "Unknown resident"),
    // Receipt time is not an occurrence date. Undated incidents remain searchable
    // in the default all-history register, but do not match occurrence-date filters.
    date,
    receivedAt,
    category: text(row.category ?? row.incident_category ?? row.Incident_Category) || "Uncategorized",
    incidentType: nullableText(row.incident_type ?? row.type ?? row.Type_of_Incident),
    location: nullableText(row.location) || nullableText([row.Location_of_Incident_General, row.Location_of_Incident_Specific].filter(Boolean).join(" · ")),
    description: nullableText(row.email_body ?? row.description ?? row.incident_description ?? row.narrative ?? row.What_Staff_Saw),
    response: nullableText(row.assistance_given ?? row.Assistance_Given),
    staffName: nullableText(row.staff_name ?? row.Person_Completing_Report_Name),
    injuryOccurred: recordedBoolean(row.injury_occurred ?? row.Injuires_YN),
    // The publisher's legacy police_called field came from Notify_EmergSrvs_YN;
    // it does not establish that police specifically were called.
    emergencyServicesNotified: recordedBoolean(row.emergency_services_notified ?? row.Notify_EmergSrvs_YN ?? row.police_called),
    sentinelEvent: recordedBoolean(row.sentinel_event ?? row.Sentinel_Event_YN)
  };
}

function facilityIdFor(row) {
  return text(row?.facility_id ?? row?.Facility ?? row?.facility);
}

function sourceRows(snapshot) {
  const context = snapshot?.reportsSummary?.toolContext;
  const candidates = [context?.incidentDetailHistory, context?.tables?.incident_detail_history, context?.currentIncidentDetails, context?.tables?.incident_detail_current_month, snapshot?.communities?.incidentDetails];
  if (!candidates.some(Array.isArray)) return null;
  return getGovernedIncidentDetailRows(snapshot?.communities, snapshot?.reportsSummary);
}

function aggregateCoverage(snapshot, facilityId) {
  const context = snapshot?.reportsSummary?.toolContext;
  const candidates = [context?.incidentMonthlyByCommunityCategory, context?.tables?.incident_monthly_by_community_category, snapshot?.communities?.incidents].filter(Array.isArray);
  const source = candidates.find((rows) => rows.length > 0) ?? candidates[0];
  if (!source) return null;
  const months = new Map();
  for (const row of source) {
    if (facilityIdFor(row) !== facilityId) continue;
    const month = text(row.month_bucket);
    const count = row.incident_count == null || row.incident_count === "" ? NaN : Number(row.incident_count);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isSafeInteger(count) || count < 0) return null;
    months.set(month, (months.get(month) ?? 0) + count);
  }
  return months;
}

/** Snapshot fallback only. Published detail history has a time window and row cap. */
export function buildExecutiveDirectorIncidentsResponse(snapshot, options) {
  const filters = normalizeExecutiveIncidentOptions(options);
  const { facilityId, query, category, from, to, limit, page } = filters;
  if (page && page[0] !== 1) throw createHttpError(409, "executive_incidents_cursor_stale", "Incident source changed. Refresh the list.");
  const source = sourceRows(snapshot);
  const freshness = getSnapshotFreshness(snapshot);
  const aggregateMonths = aggregateCoverage(snapshot, facilityId);
  const reportedTotal = aggregateMonths ? [...aggregateMonths.values()].reduce((sum, count) => sum + count, 0) : null;
  const base = {
    version: VERSION,
    facilityId,
    generatedAt: freshness.generated_at,
    asOfDate: normalizeDisplayDateKey(snapshot?.snapshot?.as_of_date ?? snapshot?.communities?.as_of_date),
    freshness: { stale: freshness.stale, warning: freshness.warning }
  };
  if (!source) return {
    ...base, status: "unavailable", totalIncidents: null, matchingIncidents: null,
    incidents: [], categories: [], nextCursor: null,
    coverage: { status: "unavailable", startDate: null, endDate: null, reportedTotal, note: "Individual incident records are unavailable. Retry when the governed incident snapshot is available." }
  };
  // Scope before normalization, indexing, search, counts, facets, and cursor construction.
  const scoped = source.filter((row) => facilityIdFor(row) === facilityId).map(normalizeExecutiveIncident);
  scoped.sort((left, right) => text(right.date).localeCompare(text(left.date)) || text(right.receivedAt).localeCompare(text(left.receivedAt)) || left.id.localeCompare(right.id));
  const byId = new Map();
  for (const row of scoped) if (!byId.has(row.id)) byId.set(row.id, row);
  const incidents = [...byId.values()];
  const monthCounts = new Map();
  const categoryCounts = new Map();
  for (const row of incidents) {
    const month = row.date?.slice(0, 7) ?? "unknown";
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
    categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + 1);
  }
  const months = new Set([...monthCounts.keys(), ...(aggregateMonths?.keys() ?? [])]);
  const complete = aggregateMonths !== null && [...months].every((month) => (monthCounts.get(month) ?? 0) === (aggregateMonths.get(month) ?? 0));
  const dates = incidents.map((row) => row.date).filter(Boolean).sort();
  const normalizedQuery = query.toLocaleLowerCase("en-US");
  const matching = incidents.filter((row) => (
    (!category || row.category === category)
    && (!from || (row.date && row.date >= from))
    && (!to || (row.date && row.date <= to))
    && (!normalizedQuery || [row.id, row.residentId, row.residentName, row.date, row.receivedAt, row.category, row.incidentType, row.location, row.description, row.response, row.staffName].filter(Boolean).join(" ").toLocaleLowerCase("en-US").includes(normalizedQuery))
  ));
  const signature = createHash("sha256").update(JSON.stringify([facilityId, base.generatedAt, query, category, from, to, reportedTotal, incidents])).digest("hex");
  const offset = page?.[2] ?? 0;
  if (page && page[1] !== signature) throw createHttpError(409, "executive_incidents_cursor_stale", "Incident records or filters changed. Refresh the list.");
  if (offset > matching.length) throw createHttpError(400, "executive_incidents_cursor_invalid", "The incident page cursor is invalid.");
  const rows = matching.slice(offset, offset + limit);
  return {
    ...base,
    status: "ready",
    totalIncidents: incidents.length,
    matchingIncidents: matching.length,
    incidents: rows,
    categories: [...categoryCounts].map(([label, count]) => ({ label, count })).sort((left, right) => left.label.localeCompare(right.label)),
    nextCursor: offset + rows.length < matching.length ? Buffer.from(JSON.stringify([1, signature, offset + rows.length])).toString("base64url") : null,
    coverage: {
      status: "partial",
      startDate: dates[0] ?? null,
      endDate: dates.at(-1) ?? null,
      reportedTotal,
      note: complete
        ? "Available records reconcile with published monthly totals, but snapshot history can omit older or undated incidents."
        : reportedTotal === null
          ? "All available individual records are searchable. Monthly totals are unavailable, so full incident coverage cannot be confirmed."
          : `${incidents.length} individual records are available against ${reportedTotal} incidents in the published monthly totals. The published detail history may cover a shorter period.`
    }
  };
}

export async function getExecutiveDirectorIncidents(options, { readSnapshot = readPlatformSnapshot, query = queryDatabricks } = {}) {
  const filters = normalizeExecutiveIncidentOptions(options);
  // Never mix snapshot and live pages in the same result set.
  if (filters.page?.[0] !== 1) {
    try {
      return await queryExecutiveDirectorIncidentsLive(filters, { query, normalizeIncident: normalizeExecutiveIncident });
    } catch (error) {
      if (error instanceof HttpError && (error.statusCode === 400 || error.statusCode === 409)) throw error;
      if (filters.page) throw createHttpError(503, "executive_incidents_live_unavailable", "Live incident history is temporarily unavailable. Refresh the list to retry.");
    }
  }
  let snapshot;
  try { snapshot = await readSnapshot(); } catch { snapshot = null; }
  const response = buildExecutiveDirectorIncidentsResponse(snapshot, options);
  const warning = response.status === "ready"
    ? "Live incident history is unavailable. Showing the published snapshot only; older, undated, or newly recorded incidents may be missing."
    : "Live and published individual incident records are unavailable. Retry to check the source again.";
  return {
    ...response,
    coverage: { ...response.coverage, note: response.status === "ready" ? `${warning} ${response.coverage.note}` : warning },
    freshness: { ...response.freshness, warning: [warning, response.freshness.warning].filter(Boolean).join(" ") }
  };
}
