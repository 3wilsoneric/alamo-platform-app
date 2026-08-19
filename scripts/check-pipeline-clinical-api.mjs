import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertApiClaimsPermission } from "../server/api-auth.mjs";
import {
  buildPipelineClinicalApiResponse,
  PIPELINE_CLINICAL_API_PREFIX
} from "../server/pipeline-clinical-api.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(
  await readFile(path.join(root, "scripts/fixtures/pipeline-clinical-snapshot.sanitized.json"), "utf8")
);
const now = new Date("2026-08-07T13:00:00.000Z");
const clientDatabase = {
  dataset: "platform_client_database",
  version: 1,
  primary_key: "canonical_client_id",
  baseline_date: "2026-08-18",
  generated_at: "2026-08-18T12:00:00.000Z",
  client_count: 3,
  column_count: 6,
  columns: [
    "canonical_client_id",
    "resident_name",
    "resident_numbers",
    "communities",
    "prior_placements",
    "assessment_notes"
  ],
  clients: [
    {
      canonical_client_id: "client-avery",
      resident_name: "Avery Example",
      resident_numbers: ["R-100"],
      communities: ["San Pablo"],
      prior_placements: "Sanitized prior placement",
      assessment_notes: null
    },
    {
      canonical_client_id: "client-jordan",
      resident_name: "Jordan Fixture",
      resident_numbers: ["R-101"],
      communities: ["San Pablo"],
      prior_placements: null,
      assessment_notes: "Sanitized baseline note"
    },
    {
      canonical_client_id: "client-history",
      resident_name: "Casey Historical",
      resident_numbers: ["R-090"],
      communities: ["JC Wallace House"],
      prior_placements: "Sanitized historical placement",
      assessment_notes: null
    }
  ]
};
fixture.reportsSummary.toolContext.tables.resident_profile = [
  {
    canonical_client_id: "client-avery",
    res_number: "R-100",
    resident_name: "Avery Example",
    first_name: "Avery",
    last_name: "Example",
    facility_id: "337",
    facility_name: "San Pablo",
    unit_number: "A-1",
    age: 41,
    admit_date: "2026-01-10",
    los_days: 209,
    care_level: "Level 2"
  },
  {
    canonical_client_id: "client-jordan",
    res_number: "R-101",
    resident_name: "Jordan Fixture",
    first_name: "Jordan",
    last_name: "Fixture",
    facility_id: "337",
    facility_name: "San Pablo",
    unit_number: "B-2",
    age: 52,
    admit_date: "2025-11-01",
    los_days: 279,
    care_level: "Level 1"
  }
];
fixture.reportsSummary.toolContext.tables.resident_episode_history = [
  {
    canonical_client_id: "client-history",
    resident_id: "R-090",
    resident_name: "Casey Historical",
    facility_id: "343",
    facility_name: "JC Wallace House",
    admit_date: "2024-01-01",
    discharge_date: "2025-01-01",
    episode_status: "discharged"
  }
];
fixture.communities.residents[0].canonical_client_id = "client-avery";
fixture.communities.residents[1].canonical_client_id = "client-jordan";
const checks = [];

check("census preserves reconciliation and source metadata", () => {
  const response = request("/census");
  equal(response.statusCode, 200);
  equal(response.body.source, "alamo_platform");
  equal(response.body.snapshot_id, "fixture-2026-08-07T12:00:00.000Z");
  equal(response.body.portfolio_census_total, 5);
  equal(response.body.roster_count, 4);
  equal(response.body.delta, 1);
  equal(response.body.reconciliation_status, "mismatch");
  equal(response.body.communities[0].city, "San Pablo");
});

check("missing census remains unavailable instead of becoming zero", () => {
  const missing = structuredClone(fixture);
  missing.communities.census = missing.communities.census.filter((row) => row.facility_id !== "343");
  const response = request("/census", missing);
  equal(response.body.communities.find((row) => row.community_id === "343").current_census, null);
  equal(response.body.portfolio_census_total, null);
  equal(response.body.reconciliation_status, "unavailable");
});

check("roster search is deterministic, bounded, and cursor based", () => {
  const first = request("/roster?q=level&limit=1");
  equal(first.body.total, 3);
  equal(first.body.residents.length, 1);
  equal(first.body.residents[0].resident_number, first.body.residents[0].resident_id);
  assert(first.body.next_cursor && first.body.next_cursor !== "1", "Expected an opaque cursor");
  const second = request(`/roster?q=level&limit=1&cursor=${encodeURIComponent(first.body.next_cursor)}`);
  assert(second.body.residents[0].resident_key !== first.body.residents[0].resident_key, "Cursor should advance");
  const invalid = capture(() => request("/roster?limit=201"));
  equal(invalid.statusCode, 400);
});

check("missing resident numbers remain null instead of being inferred", () => {
  const missing = structuredClone(fixture);
  missing.communities.residents[0].resident_id = "internal-only-100";
  delete missing.communities.residents[0].res_number;
  const response = request("/roster", missing);
  const resident = response.body.residents.find((row) => row.resident_id === "internal-only-100");
  equal(resident.resident_number, null);
});

check("resident lookup never guesses between duplicate source identifiers", () => {
  const ambiguous = capture(() => request("/residents/R-100"));
  equal(ambiguous.statusCode, 409);
  deepEqual(ambiguous.details.matching_resident_keys, ["337:R-100", "343:R-100"]);
  const qualified = request("/residents/337%3AR-100");
  equal(qualified.body.resident.resident_key, "337:R-100");
  equal(capture(() => request("/residents/R-999")).statusCode, 404);
});

check("canonical client search covers names and resident numbers and returns enrichment", () => {
  const byName = request("/clients?q=casey&limit=10");
  equal(byName.body.total, 1);
  equal(byName.body.clients[0].canonical_client_id, "client-history");
  equal(byName.body.clients[0].current_resident, false);
  const byNumber = request("/clients?q=R-100&limit=10");
  equal(byNumber.body.clients[0].canonical_client_id, "client-avery");
  const detail = request("/clients/client-history");
  equal(detail.body.client.enrichment.prior_placements, "Sanitized historical placement");
  equal(detail.body.client.resident_episode_history.length, 1);
  equal(detail.body.client_database.client_count, 3);
  equal(detail.body.client_database.baseline_date, "2026-08-18");
  equal(capture(() => request("/clients?limit=201")).statusCode, 400);
  equal(capture(() => request("/clients/client-missing")).statusCode, 404);
});

check("client database endpoints and readiness fail closed when the pointer cannot be loaded", () => {
  const health = request("/health", fixture, now, null);
  equal(health.statusCode, 503);
  equal(health.body.ready, false);
  equal(health.body.checks.client_database_ready, false);
  equal(capture(() => request("/clients", fixture, now, null)).statusCode, 503);
});

check("duplicate community-qualified keys and failed QA fail closed", () => {
  const duplicate = structuredClone(fixture);
  duplicate.communities.residents.push(structuredClone(duplicate.communities.residents[0]));
  equal(capture(() => request("/roster", duplicate)).statusCode, 502);

  const failedQa = structuredClone(fixture);
  failedQa.health.analystDataQa.failed = 1;
  failedQa.health.analystDataQa.status = "fail";
  equal(capture(() => request("/census", failedQa)).statusCode, 502);
});

check("medication endpoint exposes aggregates without medication names or raw MAR", () => {
  const response = request("/medications/summary");
  equal(response.body.portfolio.scheduled_count, 180);
  equal(response.body.portfolio.refusal_count, 3);
  equal(response.body.portfolio.held_or_not_given_count, 8);
  equal(response.body.detail_policy, "governed_summary_only");
  const serialized = JSON.stringify(response.body).toLowerCase();
  assert(!serialized.includes("medication_name"), "Medication names must not be exposed");
  assert(!serialized.includes("sanitized medication"), "Medication values must not be exposed");
});

check("health marks the last known good snapshot stale", () => {
  const response = request("/health", fixture, new Date("2026-08-08T13:01:00.000Z"));
  equal(response.statusCode, 503);
  equal(response.body.status, "degraded");
  equal(response.body.freshness.status, "stale");
  assert(response.body.freshness.warning, "Expected a stale warning");
});

check("delegated scope or service app role satisfies the dedicated policy", () => {
  const policy = {
    requiredScope: "Pipeline.Clinical.Read",
    requiredRole: "Pipeline.Clinical.Read.All",
    permissionMode: "scope-or-role"
  };
  assertApiClaimsPermission({ scp: "Pipeline.Clinical.Read" }, policy);
  assertApiClaimsPermission({ roles: ["Pipeline.Clinical.Read.All"] }, policy);
  equal(capture(() => assertApiClaimsPermission({ scp: "access_as_user" }, policy)).statusCode, 403);
});

check("production route is narrow and does not reference Eldermark credentials", async () => {
  const source = await readFile(path.join(root, "server/pipeline-clinical-api.mjs"), "utf8");
  assert(!/eldermark.*(?:secret|token|password)/i.test(source), "Integration route must not use Eldermark credentials");
  assert(source.includes("MAX_PAGE_SIZE = 200"), "Roster must remain capped at 200 rows");
  assert(source.includes("PIPELINE_CLINICAL_API_MAX_RESPONSE_BYTES"), "Responses must be byte bounded");
});

for (const pending of checks.filter((entry) => entry.promise)) {
  await pending.promise;
}

const failures = checks.filter((entry) => entry.ok === false);
console.log(JSON.stringify({ ok: failures.length === 0, checks }, null, 2));
if (failures.length) process.exit(1);

function request(suffix, snapshot = fixture, requestNow = now, database = clientDatabase) {
  const url = new URL(`${PIPELINE_CLINICAL_API_PREFIX}${suffix}`, "https://www.alamoplatform.com");
  return buildPipelineClinicalApiResponse(snapshot, url, requestNow, database);
}

function check(name, run) {
  const entry = { name, ok: null };
  checks.push(entry);
  try {
    const result = run();
    if (result && typeof result.then === "function") {
      entry.promise = result.then(
        () => { entry.ok = true; delete entry.promise; },
        (error) => { entry.ok = false; entry.error = message(error); delete entry.promise; }
      );
    } else {
      entry.ok = true;
    }
  } catch (error) {
    entry.ok = false;
    entry.error = message(error);
  }
}

function capture(run) {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to fail");
}

function assert(condition, messageValue) {
  if (!condition) throw new Error(messageValue);
}

function equal(actual, expected) {
  if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

function deepEqual(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}
