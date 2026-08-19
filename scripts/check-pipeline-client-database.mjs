import assert from "node:assert/strict";
import {
  buildPipelineClientExplorer,
  indexPipelineClients
} from "../server/pipeline-client-database.mjs";
import {
  assertPlatformClientDatabasePayload,
  assertPlatformSnapshotPayload
} from "../server/platform-snapshot.mjs";

const requiredColumns = [
  "canonical_client_id",
  "resident_name",
  "resident_numbers",
  "communities",
  "name_variants",
  "platform_resident_names"
];
const columns = [
  ...requiredColumns,
  ...Array.from(
    { length: 141 - requiredColumns.length },
    (_, index) => `sanitized_field_${String(index + 1).padStart(3, "0")}`
  )
];
const client = Object.fromEntries(columns.map((column) => [column, null]));
Object.assign(client, {
  canonical_client_id: "client-sanitized-001",
  resident_name: "Sanitized Client",
  resident_numbers: "[\"R-100\"]",
  communities: "[\"San Pablo\"]",
  name_variants: "[\"Sanitized Alias\"]",
  platform_resident_names: "[]"
});
const clientDatabase = {
  dataset: "platform_client_database",
  version: 1,
  baseline_date: "2026-08-18",
  primary_key: "canonical_client_id",
  client_count: 1,
  column_count: columns.length,
  generated_at: "2026-08-19T06:00:00.000Z",
  columns,
  clients: [client]
};
const snapshot = {
  snapshot: {
    version: "sanitized-2026-08-19",
    generated_at: "2026-08-19T12:00:00.000Z",
    source: "published-snapshot",
    as_of_date: "2026-08-19"
  },
  health: { ok: true },
  communities: {
    as_of_date: "2026-08-19",
    facilities: [{ facility_id: "337" }],
    residents: [],
    census: [],
    incidents: []
  },
  incidents: { incidents: [] },
  reportsSummary: {
    toolContext: {
      tables: {
        resident_profile: [
          {
            canonical_client_id: "client-sanitized-001",
            res_number: "R-100",
            resident_name: "Sanitized Client",
            facility_id: "337",
            facility_name: "San Pablo",
            admit_date: "2026-01-10",
            unit_number: "A-1",
            care_level: "Level 2"
          },
          {
            canonical_client_id: null,
            res_number: "R-999",
            resident_name: "Sanitized Client",
            facility_id: "337"
          }
        ],
        resident_episode_history: [
          {
            canonical_client_id: "client-sanitized-001",
            res_number: "R-090",
            facility_id: "337",
            admit_date: "2025-01-01",
            discharge_date: "2025-04-01"
          }
        ]
      }
    }
  },
  clientDatabase: {
    dataset: "platform_client_database",
    version: 1,
    baseline_date: "2026-08-18",
    primary_key: "canonical_client_id",
    client_count: 1,
    path: "snapshots/client-database/latest.json"
  }
};

assert.equal(columns.length, 141);
assert.equal(assertPlatformClientDatabasePayload(clientDatabase, "sanitized fixture"), clientDatabase);
assert.equal(assertPlatformSnapshotPayload(snapshot, "sanitized fixture"), snapshot);
assert.equal(indexPipelineClients(clientDatabase), indexPipelineClients(clientDatabase), "index must be reused");

const explorer = buildPipelineClientExplorer(snapshot, clientDatabase);
assert.equal(explorer, buildPipelineClientExplorer(snapshot, clientDatabase), "joined directory must be reused");
assert.equal(explorer.client_database.field_count, 141);
assert.equal(explorer.rows.length, 1);
assert.equal(explorer.rows[0].canonical_client_id, "client-sanitized-001");
assert.deepEqual(explorer.rows[0].resident_numbers, ["R-090", "R-100"]);
assert.equal(explorer.rows[0].resident_profiles.length, 1, "name-only matches must not join");
assert.equal(explorer.rows[0].resident_episode_history.length, 1);
assert.equal(Object.keys(explorer.rows[0].client_profile).length, 141);
assert.match(explorer.rows[0].client_name_search, /Sanitized Alias/);

const internalOnlyIdentifier = structuredClone(snapshot);
internalOnlyIdentifier.reportsSummary.toolContext.tables.resident_episode_history[0].resident_id = "internal-episode-id";
delete internalOnlyIdentifier.reportsSummary.toolContext.tables.resident_episode_history[0].res_number;
assert.deepEqual(
  buildPipelineClientExplorer(internalOnlyIdentifier, structuredClone(clientDatabase)).rows[0].resident_numbers,
  ["R-100"],
  "internal resident identifiers must not become resident-number search aliases"
);

assert.throws(
  () => assertPlatformSnapshotPayload({
    ...snapshot,
    clientDatabase: { ...snapshot.clientDatabase, path: "../private.json" }
  }, "invalid pointer"),
  /invalid clientDatabase\.path/
);
assert.throws(
  () => assertPlatformClientDatabasePayload({
    ...clientDatabase,
    client_count: 2,
    clients: [client, client]
  }, "duplicate fixture"),
  /duplicate canonical client identifiers/
);
assert.throws(
  () => assertPlatformClientDatabasePayload({
    ...clientDatabase,
    clients: [{ ...client, undeclared_private_field: "must not publish" }]
  }, "extra-column fixture"),
  /undeclared column/
);

console.log("Pipeline client database checks passed");
