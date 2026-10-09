import { createHash } from "node:crypto";
import { createHttpError } from "./http-errors.mjs";

// Inputs become UTF-8 hex expressions, never executable SQL fragments. LIKE is
// deliberately avoided so %, _, quotes and backslashes remain literal searches.
function sqlText(value) {
  return `decode(unhex('${Buffer.from(value, "utf8").toString("hex")}'), 'UTF-8')`;
}

function filterSignature(filters) {
  return createHash("sha256").update(JSON.stringify([filters.facilityId, filters.query, filters.category, filters.from, filters.to])).digest("hex");
}

/** Receives validated, already-authorized options from the ED API boundary. */
export function buildExecutiveIncidentLiveSql(filters) {
  const clauses = [];
  if (filters.category) clauses.push(`category = ${sqlText(filters.category)}`);
  if (filters.from) clauses.push(`incident_date >= cast(${sqlText(filters.from)} AS date)`);
  if (filters.to) clauses.push(`incident_date <= cast(${sqlText(filters.to)} AS date)`);
  if (filters.query) clauses.push(`instr(lower(concat_ws(' ', id, resident_id, client_name, cast(incident_date AS string), cast(received_at AS string), category, incident_type, location, email_body, assistance_given, staff_name)), lower(${sqlText(filters.query)})) > 0`);
  const condition = clauses.length ? clauses.join(" AND ") : "true";
  const offset = filters.page?.[3] ?? 0;
  const facility = sqlText(filters.facilityId);
  // One statement gives counts, facets, revision and page one consistent source
  // read. Only a bounded page crosses the server boundary; no 18-month/15k cap.
  return `WITH resident_names AS (
    SELECT cast(Facility AS string) AS facility_id, cast(Res_Number AS string) AS resident_id,
      max(resident_name) AS client_name
    FROM alamohealth.gold.v_tool_resident_countability_audit
    WHERE cast(Facility AS string) = ${facility} AND coalesce(is_countable_resident, 1) = 1
    GROUP BY cast(Facility AS string), cast(Res_Number AS string)
  ), source_rows AS (
    SELECT cast(i.Facility AS string) AS facility_id,
      nullif(trim(cast(i.Unique_ID AS string)), '') AS source_id,
      cast(i.Res_Number AS string) AS resident_id,
      coalesce(nullif(trim(r.client_name), ''), concat('Resident ', cast(i.Res_Number AS string)), 'Unknown resident') AS client_name,
      cast(i.Incident_Date_parsed AS date) AS incident_date,
      try_cast(i.__TIMESTAMP AS timestamp) AS received_at,
      coalesce(nullif(trim(i.Incident_Category), ''), 'Uncategorized') AS category,
      cast(i.Type_of_Incident AS string) AS incident_type,
      nullif(concat_ws(' · ', nullif(trim(i.Location_of_Incident_General), ''), nullif(trim(i.Location_of_Incident_Specific), '')), '') AS location,
      cast(i.What_Staff_Saw AS string) AS email_body,
      cast(i.Assistance_Given AS string) AS assistance_given,
      cast(i.Person_Completing_Report_Name AS string) AS staff_name,
      cast(i.Injuires_YN AS string) AS injury_occurred,
      cast(i.Notify_EmergSrvs_YN AS string) AS emergency_services_notified,
      cast(i.Sentinel_Event_YN AS string) AS sentinel_event
    FROM alamohealth.gold.v_incidents i
    LEFT JOIN resident_names r ON cast(i.Facility AS string) = r.facility_id AND cast(i.Res_Number AS string) = r.resident_id
    WHERE cast(i.Facility AS string) = ${facility}
  ), hashed AS (
    SELECT *, sha2(to_json(struct(*)), 256) AS record_hash FROM source_rows
  ), numbered AS (
    SELECT *, count(*) OVER (PARTITION BY source_id) AS id_count,
      row_number() OVER (PARTITION BY source_id ORDER BY record_hash) AS duplicate_number
    FROM hashed
  ), incidents AS (
    SELECT *, CASE WHEN source_id IS NULL OR id_count > 1
      THEN concat(coalesce(source_id, 'record'), '-', cast(duplicate_number AS string), '-', substring(record_hash, 1, 16))
      ELSE source_id END AS id
    FROM numbered
  ), matching AS (
    SELECT * FROM incidents WHERE ${condition}
  ), summary AS (
    SELECT count(*) AS total, (SELECT count(*) FROM matching) AS matching,
      cast(min(incident_date) AS string) AS start_date, cast(max(incident_date) AS string) AS end_date,
      sha2(concat(cast(count(*) AS string), ':', coalesce(cast(sum(cast(xxhash64(record_hash) AS decimal(38, 0))) AS string), '0')), 256) AS revision
    FROM incidents
  ), page_rows AS (
    SELECT *, row_number() OVER (ORDER BY incident_date DESC NULLS LAST, received_at DESC NULLS LAST, id ASC) AS page_order FROM matching
    ORDER BY incident_date DESC NULLS LAST, received_at DESC NULLS LAST, id ASC
    LIMIT ${filters.limit + 1} OFFSET ${offset}
  )
  SELECT 'summary' AS kind, to_json(struct(*)) AS payload FROM summary
  UNION ALL
  SELECT 'category' AS kind, to_json(named_struct('label', category, 'count', count(*))) AS payload FROM incidents GROUP BY category
  UNION ALL
  SELECT 'incident' AS kind, to_json(named_struct(
    'id', id, 'page_order', page_order, 'facility_id', facility_id, 'resident_id', resident_id, 'client_name', client_name,
    'incident_date', incident_date, 'received_at', received_at, 'category', category,
    'incident_type', incident_type, 'location', location, 'email_body', email_body,
    'assistance_given', assistance_given, 'staff_name', staff_name,
    'injury_occurred', injury_occurred, 'emergency_services_notified', emergency_services_notified, 'sentinel_event', sentinel_event
  )) AS payload FROM page_rows`;
}

function count(value) {
  const result = Number(value);
  if (value == null || !Number.isSafeInteger(result) || result < 0) throw new Error("Invalid live incident count.");
  return result;
}

export async function queryExecutiveDirectorIncidentsLive(filters, { query, normalizeIncident }) {
  const signature = filterSignature(filters);
  const page = filters.page;
  if (page && (page[0] !== 2 || page[1] !== signature)) throw createHttpError(409, "executive_incidents_cursor_stale", "Incident filters or source changed. Refresh the list.");
  const result = await query(buildExecutiveIncidentLiveSql(filters));
  if (!Array.isArray(result)) throw new Error("Live incident source is unavailable.");
  const summaries = [];
  const categories = [];
  const rows = [];
  for (const item of result) {
    const payload = typeof item.payload === "string" ? JSON.parse(item.payload) : item.payload;
    if (!payload || typeof payload !== "object") throw new Error("Invalid live incident source response.");
    if (item.kind === "summary") summaries.push(payload);
    else if (item.kind === "category") categories.push({ label: String(payload.label), count: count(payload.count) });
    else if (item.kind === "incident") {
      if (String(payload.facility_id) !== filters.facilityId) throw new Error("Incident source returned an out-of-scope record.");
      const order = count(payload.page_order);
      if (order < 1) throw new Error("Invalid live incident order.");
      rows.push({ incident: normalizeIncident(payload, rows.length), order });
    } else throw new Error("Invalid live incident source response.");
  }
  const summary = summaries[0];
  if (summaries.length !== 1 || !/^[a-f0-9]{64}$/.test(summary?.revision)) throw new Error("Invalid live incident summary.");
  const total = count(summary.total);
  const matching = count(summary.matching);
  if (matching > total || categories.reduce((sum, item) => sum + item.count, 0) !== total || rows.length > filters.limit + 1) throw new Error("Inconsistent live incident source response.");
  if (page && page[2] !== summary.revision) throw createHttpError(409, "executive_incidents_cursor_stale", "Incident records changed. Refresh the list.");
  const offset = page?.[3] ?? 0;
  if (offset > matching) throw createHttpError(400, "executive_incidents_cursor_invalid", "The incident page cursor is invalid.");
  // UNION ordering is not guaranteed; restore the same deterministic page order.
  rows.sort((left, right) => left.order - right.order);
  if (rows.some((row, index) => row.order !== offset + index + 1)) throw new Error("Invalid live incident order.");
  const incidents = rows.slice(0, filters.limit).map((row) => row.incident);
  if (incidents.length !== Math.min(filters.limit, matching - offset)) throw new Error("Incomplete live incident page.");
  const generatedAt = new Date().toISOString();
  return {
    version: "executive-director-incidents-v1", status: "ready", facilityId: filters.facilityId,
    generatedAt, asOfDate: generatedAt.slice(0, 10), totalIncidents: total, matchingIncidents: matching,
    incidents, categories: categories.sort((left, right) => left.label.localeCompare(right.label)),
    nextCursor: offset + incidents.length < matching ? Buffer.from(JSON.stringify([2, signature, summary.revision, offset + incidents.length])).toString("base64url") : null,
    coverage: { status: "complete", startDate: summary.start_date ?? null, endDate: summary.end_date ?? null, reportedTotal: total, note: "All incident records in the current community source are searchable, including undated incidents. No history cutoff is applied; date filters exclude undated records." },
    freshness: { stale: false, warning: null }
  };
}
