#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ALAMO_EXECUTIVE_DIRECTOR_ROLES } from "../shared/executive-director-access.mjs";
import { assertExecutiveDirectorAccess, resolveExecutiveDirectorFacility } from "../server/executive-director-access.mjs";
import { buildExecutiveDirectorIncidentsResponse, getExecutiveDirectorIncidents, normalizeExecutiveIncidentOptions } from "../server/executive-director-incidents.mjs";
import { buildExecutiveIncidentLiveSql } from "../server/executive-director-incidents-live.mjs";

const rows = [
  ...Array.from({ length: 75 }, (_, index) => ({
    id: `incident-${String(index).padStart(3, "0")}`, facility_id: "344", resident_id: `resident-${index}`,
    client_name: `Test resident ${index}`, incident_date: `2026-${String(10 - Math.floor(index / 25)).padStart(2, "0")}-${String(28 - index % 25).padStart(2, "0")}`,
    category: index % 2 ? "Fall" : "Other", email_body: "Synthetic incident", assistance_given: "Synthetic response",
    injury_occurred: "unknown", police_called: "yes"
  })),
  { id: "historic", facility_id: "344", incident_date: "2020-01-02", category: "Historical", email_body: "unique-old-offpage-search" },
  { id: "undated", facility_id: "344", received_at: "2026-10-01T12:00:00Z", category: "Uncategorized" },
  { id: "private-other-community", facility_id: "337", incident_date: "2026-10-30", category: "Foreign category", email_body: "Cross-community phrase" }
];
function snapshotFor(incidentRows) {
  const totals = new Map();
  for (const row of incidentRows) {
    if (!row.incident_date) continue;
    const key = `${row.facility_id}:${row.incident_date.slice(0, 7)}:${row.category}`;
    const existing = totals.get(key);
    totals.set(key, { facility_id: row.facility_id, month_bucket: row.incident_date.slice(0, 7), category: row.category, incident_count: (existing?.incident_count ?? 0) + 1 });
  }
  return {
    snapshot: { generated_at: "2026-10-09T12:00:00Z", as_of_date: "2026-10-09" },
    communities: { incidents: [...totals.values()] },
    reportsSummary: { toolContext: { tables: { incident_detail_history: incidentRows } } }
  };
}
const snapshot = snapshotFor(rows);
const options = { facilityId: "344" };
const first = buildExecutiveDirectorIncidentsResponse(snapshot, options);
assert.equal(first.totalIncidents, 77);
assert.equal(first.matchingIncidents, 77);
assert.equal(first.incidents.length, 25);
assert.equal(first.coverage.status, "partial");
assert.equal(first.coverage.startDate, "2020-01-02");
assert.equal(first.coverage.reportedTotal, 76);
assert.equal(first.incidents[0].injuryOccurred, null);
assert.equal(first.incidents[0].emergencyServicesNotified, true);
assert.equal("policeCalled" in first.incidents[0], false);
assert.equal(JSON.stringify(first).includes("Foreign category"), false);
const everyId = new Set(first.incidents.map((row) => row.id));
let cursor = first.nextCursor;
while (cursor) {
  const page = buildExecutiveDirectorIncidentsResponse(snapshot, { ...options, cursor });
  page.incidents.forEach((row) => { assert.equal(everyId.has(row.id), false); everyId.add(row.id); });
  cursor = page.nextCursor;
}
assert.equal(everyId.size, 77, "Every available record, not just the dashboard's 50-row preview, must be reachable.");
assert.equal(everyId.has("historic"), true);
assert.equal(everyId.has("undated"), true);
const search = buildExecutiveDirectorIncidentsResponse(snapshot, { ...options, query: "UNIQUE-OLD-OFFPAGE" });
assert.deepEqual(search.incidents.map((row) => row.id), ["historic"]);
assert.equal(search.totalIncidents, 77);
assert.equal(search.matchingIncidents, 1);
assert.equal(buildExecutiveDirectorIncidentsResponse(snapshot, { ...options, query: "Cross-community" }).matchingIncidents, 0);
const historic = buildExecutiveDirectorIncidentsResponse(snapshot, { ...options, from: "2020-01-02", to: "2020-01-02", category: "Historical" });
assert.deepEqual(historic.incidents.map((row) => row.id), ["historic"]);
assert.equal(buildExecutiveDirectorIncidentsResponse(snapshot, { ...options, query: "undated" }).incidents[0].date, null);
assert.equal(buildExecutiveDirectorIncidentsResponse(snapshot, { ...options, query: "undated", from: "2020-01-01" }).matchingIncidents, 0);
assert.equal(buildExecutiveDirectorIncidentsResponse(snapshotFor([]), options).totalIncidents, 0);
assert.equal(buildExecutiveDirectorIncidentsResponse(snapshotFor([]), options).status, "ready");
assert.equal(buildExecutiveDirectorIncidentsResponse({}, options).totalIncidents, null);
assert.equal(buildExecutiveDirectorIncidentsResponse({}, options).status, "unavailable");

for (const invalid of [
  { facilityId: "999" }, { query: "x".repeat(161) }, { query: "line\nbreak" }, { query: 2 },
  { category: "x".repeat(161) }, { from: "2026-02-30" }, { to: "invalid" },
  { from: "2026-10-09", to: "2026-10-08" }, { limit: "2x" }, { limit: 0 }, { limit: 101 }, { limit: -1 }, { limit: 1.5 },
  { cursor: "not-a-cursor" }, { cursor: Buffer.from(JSON.stringify([1, "a".repeat(64), -2])).toString("base64url") },
  { cursor: Buffer.from(JSON.stringify([2, "a".repeat(64), "b".repeat(64), 2_147_483_648])).toString("base64url") }
]) assert.throws(() => normalizeExecutiveIncidentOptions({ ...options, ...invalid }), (error) => error.statusCode === 400);
for (const changed of [{ facilityId: "337" }, { query: "fall" }, { category: "Fall" }, { to: "2026-10-01" }]) {
  assert.throws(() => buildExecutiveDirectorIncidentsResponse(snapshot, { ...options, ...changed, cursor: first.nextCursor }), (error) => error.statusCode === 409);
}
assert.throws(() => buildExecutiveDirectorIncidentsResponse(snapshotFor(rows.slice(1)), { ...options, cursor: first.nextCursor }), (error) => error.statusCode === 409);
const forged = JSON.parse(Buffer.from(first.nextCursor, "base64url").toString());
forged[2] = 999;
assert.throws(() => buildExecutiveDirectorIncidentsResponse(snapshot, { ...options, cursor: Buffer.from(JSON.stringify(forged)).toString("base64url") }), (error) => error.statusCode === 400);

const access = assertExecutiveDirectorAccess({ authenticated: true, claims: { roles: [ALAMO_EXECUTIVE_DIRECTOR_ROLES["344"]] } });
assert.equal(resolveExecutiveDirectorFacility(access, null), "344");
assert.equal(resolveExecutiveDirectorFacility(access, "344"), "344");
assert.throws(() => resolveExecutiveDirectorFacility(access, "337"), (error) => error.statusCode === 403);

const revision = "a".repeat(64);
const generatedSql = [];
function liveFixture(sql, revisionValue = revision, total = 77) {
  generatedSql.push(sql);
  const offset = Number(sql.match(/OFFSET (\d+)/)?.[1] ?? 0);
  const requested = Number(sql.match(/LIMIT (\d+) OFFSET/)?.[1]);
  return [
    { kind: "summary", payload: JSON.stringify({ total, matching: total, start_date: total ? "2020-01-02" : null, end_date: total ? "2026-10-28" : null, revision: revisionValue }) },
    ...(total ? [{ kind: "category", payload: JSON.stringify({ label: "Other", count: total }) }] : []),
    ...Array.from({ length: Math.min(requested, Math.max(0, total - offset)) }, (_, index) => ({ kind: "incident", payload: JSON.stringify({ id: `live-${offset + index}`, facility_id: "344", incident_date: "2026-10-01", category: "Other", emergency_services_notified: "no", page_order: offset + index + 1 }) })).reverse()
  ];
}
let fallbackReads = 0;
const liveDependencies = { query: async (sql) => liveFixture(sql), readSnapshot: async () => { fallbackReads += 1; return snapshot; } };
const liveFirst = await getExecutiveDirectorIncidents(options, liveDependencies);
assert.equal(liveFirst.totalIncidents, 77);
assert.equal(liveFirst.coverage.reportedTotal, 77);
assert.equal(liveFirst.coverage.status, "complete");
assert.equal(liveFirst.freshness.warning, null);
assert.equal(liveFirst.incidents[0].id, "live-0");
assert.equal(liveFirst.incidents[0].emergencyServicesNotified, false);
assert.equal(fallbackReads, 0);
const liveSecond = await getExecutiveDirectorIncidents({ ...options, cursor: liveFirst.nextCursor }, liveDependencies);
assert.equal(liveSecond.incidents[0].id, "live-25");
assert.equal(liveSecond.incidents.length, 25);
assert.match(generatedSql[0], /FROM alamohealth\.gold\.v_incidents i/);
assert.match(generatedSql[0], /LEFT JOIN resident_names r ON cast\(i\.Facility AS string\) = r\.facility_id AND cast\(i\.Res_Number AS string\) = r\.resident_id/);
assert.equal((generatedSql[0].match(/= decode\(unhex\('333434'\)/g) ?? []).length, 2, "Both incident and resident-name queries must be scoped.");
assert.doesNotMatch(generatedSql[0], /add_months|LIMIT (50|250|15000)\b|WHERE i\.Incident_Date_parsed IS NOT NULL/);
const literal = "' OR true -- %_\\";
const literalSql = buildExecutiveIncidentLiveSql(normalizeExecutiveIncidentOptions({ ...options, query: literal, category: literal, from: "2020-01-01", to: "2026-10-09" }));
assert.equal(literalSql.includes(literal), false);
assert.match(literalSql, /instr\(lower\(concat_ws/);
assert.equal(literalSql.includes(Buffer.from(literal).toString("hex")), true);
assert.match(literalSql, /incident_date >= cast\(decode\(unhex/);
assert.match(literalSql, /incident_date <= cast\(decode\(unhex/);
const queryCount = generatedSql.length;
await assert.rejects(() => getExecutiveDirectorIncidents({ ...options, cursor: liveFirst.nextCursor, query: "changed" }, liveDependencies), (error) => error.statusCode === 409);
assert.equal(generatedSql.length, queryCount, "A changed-filter cursor must fail before a warehouse query.");
await assert.rejects(() => getExecutiveDirectorIncidents({ ...options, cursor: liveFirst.nextCursor }, { ...liveDependencies, query: async (sql) => liveFixture(sql, "b".repeat(64)) }), (error) => error.statusCode === 409);
await assert.rejects(() => getExecutiveDirectorIncidents({ ...options, cursor: liveFirst.nextCursor }, { ...liveDependencies, query: async () => { throw new Error("unavailable"); } }), (error) => error.statusCode === 503);
assert.equal(fallbackReads, 0, "A failed live page must never silently continue with a different snapshot dataset.");
const emptyLive = await getExecutiveDirectorIncidents(options, { query: async (sql) => liveFixture(sql, revision, 0) });
assert.equal(emptyLive.status, "ready");
assert.equal(emptyLive.totalIncidents, 0);
assert.equal(emptyLive.coverage.status, "complete");
const fallback = await getExecutiveDirectorIncidents(options, { ...liveDependencies, query: async () => { throw new Error("unavailable"); } });
assert.equal(fallback.coverage.status, "partial");
assert.match(fallback.coverage.note, /Live incident history is unavailable/);
let snapshotCursorQueriedLive = false;
await getExecutiveDirectorIncidents({ ...options, cursor: fallback.nextCursor }, { ...liveDependencies, query: async () => { snapshotCursorQueriedLive = true; return []; } });
assert.equal(snapshotCursorQueriedLive, false);
const unavailable = await getExecutiveDirectorIncidents(options, { query: async () => { throw new Error("unavailable"); }, readSnapshot: async () => { throw new Error("unavailable"); } });
assert.equal(unavailable.status, "unavailable");
assert.equal(unavailable.totalIncidents, null);
assert.doesNotMatch(unavailable.freshness.warning, /Showing the published snapshot/);
const leakedRows = await getExecutiveDirectorIncidents(options, { ...liveDependencies, query: async (sql) => liveFixture(sql).map((row) => row.kind === "incident" ? { ...row, payload: row.payload.replace('"facility_id":"344"', '"facility_id":"337"') } : row) });
assert.equal(leakedRows.coverage.status, "partial");
assert.equal(leakedRows.incidents.some((row) => row.id.startsWith("live-")), false);

const api = await readFile(new URL("../server/executive-director-api.mjs", import.meta.url), "utf8");
const liveSource = await readFile(new URL("../server/executive-director-incidents-live.mjs", import.meta.url), "utf8");
assert.doesNotMatch(liveSource, /from ["']\.\/executive-director-incidents\.mjs["']/, "The live query must not import its orchestration module and create a circular dependency.");
assert.match(api, /applyProtectedApiHeaders\(res\)/);
assert.match(api, /requireApiUser\(req, \{ workspace: "executive-director" \}\)/);
assert.match(api, /resolveExecutiveDirectorFacility\(access, requestUrl\.searchParams\.get\("facilityId"\)\)/);
assert.match(api, /requestUrl\.searchParams\.getAll\(key\)\.length !== 1/);
assert.match(api, /!allowedParameters\.has\(key\)/);

// Optional read-only warehouse syntax/semantics check: synthetic inline data only,
// no incident permissions or real resident data required, no writes or temp tables.
if (process.argv.includes("--live-sql-fixture")) {
  const { queryDatabricks } = await import("../server/databricks.mjs");
  const namesSource = `(SELECT '344' AS Facility, 'fixture-resident' AS Res_Number, 'Synthetic Resident' AS resident_name, 1 AS is_countable_resident)`;
  const incidentSource = `(SELECT CASE WHEN id < 77 THEN '344' ELSE '337' END AS Facility,
    concat('fixture-', lpad(cast(id AS string), 3, '0')) AS Unique_ID, 'fixture-resident' AS Res_Number,
    CASE WHEN id = 76 THEN cast(NULL AS date) WHEN id = 70 THEN DATE '2020-01-02' ELSE date_sub(DATE '2026-10-01', cast(id AS int)) END AS Incident_Date_parsed,
    TIMESTAMP '2026-10-01 12:00:00' AS __TIMESTAMP, 'Other' AS Incident_Category, 'Other' AS Type_of_Incident,
    'Common area' AS Location_of_Incident_General, cast(NULL AS string) AS Location_of_Incident_Specific,
    CASE WHEN id = 70 THEN 'unique-old-offpage-search' WHEN id >= 77 THEN 'foreign-community-secret' ELSE 'Synthetic narrative' END AS What_Staff_Saw,
    'Synthetic response' AS Assistance_Given, 'Synthetic staff' AS Person_Completing_Report_Name,
    'no' AS Injuires_YN, 'yes' AS Notify_EmergSrvs_YN, 'no' AS Sentinel_Event_YN FROM range(80))`;
  const fixtureQuery = async (sql) => queryDatabricks(sql.replace("alamohealth.gold.v_tool_resident_countability_audit", namesSource).replace("alamohealth.gold.v_incidents", incidentSource));
  const noFallback = async () => { throw new Error("Live SQL fixture must not fall back."); };
  const warehouse = await getExecutiveDirectorIncidents(options, { query: fixtureQuery, readSnapshot: noFallback });
  assert.equal(warehouse.coverage.status, "complete");
  assert.equal(warehouse.totalIncidents, 77);
  assert.equal(warehouse.incidents.length, 25);
  const warehouseSecond = await getExecutiveDirectorIncidents({ ...options, cursor: warehouse.nextCursor }, { query: fixtureQuery, readSnapshot: noFallback });
  assert.equal(warehouseSecond.incidents.length, 25);
  assert.equal(warehouseSecond.incidents.some((row) => warehouse.incidents.some((firstRow) => firstRow.id === row.id)), false);
  const warehouseOld = await getExecutiveDirectorIncidents({ ...options, query: "unique-old-offpage-search", from: "2020-01-02", to: "2020-01-02" }, { query: fixtureQuery, readSnapshot: noFallback });
  assert.equal(warehouseOld.matchingIncidents, 1);
  assert.equal(warehouseOld.incidents[0].id, "fixture-070");
  const warehouseForeign = await getExecutiveDirectorIncidents({ ...options, query: "foreign-community-secret" }, { query: fixtureQuery, readSnapshot: noFallback });
  assert.equal(warehouseForeign.matchingIncidents, 0);
  const warehouseUndated = await getExecutiveDirectorIncidents({ ...options, query: "fixture-076" }, { query: fixtureQuery, readSnapshot: noFallback });
  assert.equal(warehouseUndated.matchingIncidents, 1);
  assert.equal(warehouseUndated.incidents[0].date, null);
  console.log("executive director incident warehouse fixture checks passed");
}
console.log("executive director incident checks passed");
