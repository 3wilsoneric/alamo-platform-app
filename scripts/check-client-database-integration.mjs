import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  buildDataExplorerPayload,
  indexClientDatabaseClients
} from "../server/data-explorer.mjs";
import {
  assertPlatformClientDatabasePayload,
  decodeCompressedPlatformClientDatabase,
  readPlatformClientDocumentAsset
} from "../server/platform-snapshot.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");

const namedColumns = [
  "canonical_client_id",
  "resident_name",
  "name_variants",
  "platform_resident_names",
  "resident_numbers",
  "platform_resident_numbers",
  "medical_record_numbers_json",
  "facility_canonical",
  "communities",
  "current_status",
  "date_of_birth",
  "first_admit_date",
  "latest_admit_date",
  "latest_discharge_date",
  "referring_facility",
  "prior_setting_bucket",
  "county",
  "primary_diagnosis",
  "secondary_diagnoses",
  "substance_use",
  "conservatorship"
];
const columns = [
  ...namedColumns,
  ...Array.from({ length: 141 - namedColumns.length }, (_, index) => `sanitized_field_${String(index + 1).padStart(3, "0")}`)
];

function makeClient(overrides) {
  return Object.fromEntries(columns.map((column) => [column, overrides[column] ?? null]));
}

const clientDatabase = {
  version: 1,
  dataset: "platform_client_database",
  baseline_date: "2026-08-18",
  primary_key: "canonical_client_id",
  client_count: 2,
  column_count: columns.length,
  generated_at: "2026-08-18T16:00:00.000Z",
  columns,
  document_count: 1,
  documents: [
    {
      canonical_client_id: "client-001",
      document_id: "document-001",
      display_name: "Sanitized assessment packet.pdf",
      content_type: "application/pdf",
      page_count: 3,
      linked_at: "2026-08-18T15:00:00.000Z",
      link_source: "governed_client_document_link",
      thumbnail_path: "snapshots/client-documents/thumbnails/client-001/document-001.png",
      preview_path: null
    }
  ],
  clients: [
    makeClient({
      canonical_client_id: "client-001",
      resident_name: "Sanitized Current Client",
      name_variants: "[\"Current Alias\"]",
      resident_numbers: "[\"R-100\"]",
      facility_canonical: "San Pablo",
      current_status: "Current",
      primary_diagnosis: "Sanitized diagnosis"
    }),
    makeClient({
      canonical_client_id: "client-002",
      resident_name: "Sanitized Historical Client",
      name_variants: "[\"Historical Alias\"]",
      facility_canonical: "JC Wallace House",
      current_status: "Historical"
    })
  ]
};

const snapshot = {
  snapshot: { generated_at: "2026-08-19T16:00:00.000Z", as_of_date: "2026-08-19" },
  generated_at: "2026-08-19T16:00:00.000Z",
  communities: {
    facilities: [
      { facility_id: "337", community_name: "San Pablo" },
      { facility_id: "343", community_name: "JC Wallace House" }
    ],
    residents: [
      {
        res_number: "R-100",
        resident_name: "Sanitized Current Client",
        facility_id: "337",
        facility_name: "San Pablo",
        unit_number: "A-1",
        age: 51,
        los_days: 42,
        primary_diagnosis: "Sanitized diagnosis"
      },
      {
        res_number: "R-999",
        resident_name: "Sanitized Unmatched Client",
        facility_id: "343",
        facility_name: "JC Wallace House",
        unit_number: "B-2",
        age: 62,
        los_days: 8
      }
    ]
  },
  reportsSummary: {
    toolContext: {
      tables: {
        resident_profile: [
          {
            canonical_client_id: "client-001",
            resident_id: "R-100",
            resident_name: "Sanitized Current Client",
            facility_id: "337",
            facility_name: "San Pablo",
            unit_number: "A-1",
            age: 51,
            los_days: 42,
            primary_diagnosis: "Sanitized diagnosis"
          },
          {
            canonical_client_id: null,
            resident_id: "R-999",
            resident_name: "Sanitized Unmatched Client",
            facility_id: "343",
            facility_name: "JC Wallace House",
            unit_number: "B-2",
            age: 62,
            los_days: 8
          }
        ],
        resident_episode_history: [
          {
            canonical_client_id: "client-001",
            resident_id: "R-100",
            facility_id: "337",
            admit_date: "2026-07-01",
            discharge_date: null
          },
          {
            canonical_client_id: "client-001",
            resident_id: "R-100",
            facility_id: "337",
            admit_date: "2025-01-01",
            discharge_date: "2025-04-01"
          },
          {
            canonical_client_id: null,
            resident_id: "R-999",
            facility_id: "343",
            admit_date: "2026-08-01",
            discharge_date: null
          }
        ]
      }
    }
  }
};

assert.equal(columns.length, 141, "fixture must exercise the 141-field contract");
assert.equal(assertPlatformClientDatabasePayload(clientDatabase, "sanitized fixture"), clientDatabase);
assert.equal(assertPlatformClientDatabasePayload({
  ...clientDatabase,
  columns: clientDatabase.columns.map((name) => ({ name, type: "string" }))
}, "descriptor fixture").column_count, 141);
assert.equal(indexClientDatabaseClients(clientDatabase).size, 2);
const compressedClientDatabase = gzipSync(Buffer.from(JSON.stringify(clientDatabase)));
assert.deepEqual(
  await decodeCompressedPlatformClientDatabase(compressedClientDatabase, "compressed sanitized fixture"),
  clientDatabase
);
await assert.rejects(
  () => decodeCompressedPlatformClientDatabase(Buffer.from("not-gzip"), "invalid compressed fixture"),
  /incorrect header check|unexpected end of file/
);

const thumbnailPath = path.join(appRoot, "generated/client-documents/thumbnails/client-001/document-001.png");
await mkdir(path.dirname(thumbnailPath), { recursive: true });
await writeFile(thumbnailPath, Buffer.from("sanitized-thumbnail"));
try {
  const thumbnail = await readPlatformClientDocumentAsset(clientDatabase, "client-001", "document-001", "thumbnail");
  assert.equal(thumbnail?.contentType, "image/png");
  assert.equal(thumbnail?.body.toString("utf8"), "sanitized-thumbnail");
  assert.equal(await readPlatformClientDocumentAsset(clientDatabase, "client-002", "document-001", "thumbnail"), null);
  assert.equal(await readPlatformClientDocumentAsset(clientDatabase, "client-001", "document-001", "preview"), null);
} finally {
  await rm(thumbnailPath, { force: true });
}

const payload = buildDataExplorerPayload(snapshot, "residents", { status: "fresh" }, { clientDatabase });
assert.equal(payload.title, "Client Search");
assert.equal(payload.client_database.field_count, 141);
assert.equal(payload.client_database.client_count, 2);
assert.equal(payload.client_database.matched_current_profiles, 1);
assert.equal(payload.client_database.unmatched_current_profiles, 1);
assert.equal(payload.client_database.unmatched_episode_rows, 1);
assert.equal(payload.rows.length, 3, "canonical clients and unmatched current profiles must all remain visible");

const current = payload.rows.find((row) => row.id === "client-001");
assert.ok(current);
assert.equal(current.current_resident, true);
assert.equal(current.resident_id, "R-100");
assert.equal(current.client_profile, undefined, "directory rows must not transport full client profiles");
assert.equal(current.resident_episode_count, 2);
assert.match(current.client_name_search, /Current Alias/);

const historical = payload.rows.find((row) => row.id === "client-002");
assert.ok(historical);
assert.equal(historical.current_resident, false);
assert.match(historical.client_name_search, /Historical Alias/);

const unmatched = payload.rows.find((row) => row.client_database_match_status === "unmatched");
assert.ok(unmatched);
assert.equal(unmatched.canonical_client_id, null);
assert.equal(unmatched.client_profile, undefined);
assert.equal(unmatched.resident_episode_count, 1);

const detailPayload = buildDataExplorerPayload(snapshot, "residents", { status: "fresh" }, {
  clientDatabase,
  residentClientId: "client-001"
});
assert.equal(detailPayload.rows.length, 1);
assert.equal(Object.keys(detailPayload.rows[0].client_profile).length, 141);
assert.equal(detailPayload.rows[0].resident_episode_history.length, 2);
assert.throws(
  () => buildDataExplorerPayload(snapshot, "residents", { status: "fresh" }, {
    clientDatabase,
    residentClientId: "missing-client"
  }),
  /Client profile not found/
);

assert.throws(
  () => assertPlatformClientDatabasePayload({
    ...clientDatabase,
    client_count: 3,
    clients: [...clientDatabase.clients, clientDatabase.clients[0]]
  }, "duplicate fixture"),
  /duplicate canonical client identifiers/
);
const missingColumnClient = { ...clientDatabase.clients[0] };
delete missingColumnClient.sanitized_field_001;
assert.throws(
  () => assertPlatformClientDatabasePayload({
    ...clientDatabase,
    clients: [missingColumnClient, clientDatabase.clients[1]]
  }, "missing column fixture"),
  /missing a published column/
);
assert.throws(
  () => assertPlatformClientDatabasePayload({
    ...clientDatabase,
    documents: [{ ...clientDatabase.documents[0], thumbnail_path: "snapshots/client-documents/thumbnails/../../private.png" }]
  }, "unsafe document fixture"),
  /invalid thumbnail asset path/
);
assert.throws(
  () => assertPlatformClientDatabasePayload({
    ...clientDatabase,
    documents: [{ ...clientDatabase.documents[0], canonical_client_id: "client-missing" }]
  }, "unknown client document fixture"),
  /invalid client document metadata/
);
assert.throws(
  () => assertPlatformClientDatabasePayload({
    ...clientDatabase,
    documents: undefined,
    document_count: 1
  }, "missing document manifest fixture"),
  /document-count mismatch/
);
assert.throws(
  () => assertPlatformClientDatabasePayload({
    ...clientDatabase,
    document_count: 2,
    documents: [clientDatabase.documents[0], clientDatabase.documents[0]]
  }, "duplicate client document fixture"),
  /invalid client document metadata/
);

const snapshotSource = await readFile(path.join(appRoot, "server/platform-snapshot.mjs"), "utf8");
const profileSource = await readFile(path.join(appRoot, "src/shared/modules/ResidentSearchModule.tsx"), "utf8");
assert.match(snapshotSource, /platformClientDatabaseCache\.key === cacheKey/);
assert.match(snapshotSource, /getBlobClient\(`\$\{pointer\.path\}\.gz`\)/);
assert.match(snapshotSource, /compressedDatabaseIsCurrent\(compressedProperties, sourceProperties\)/);
assert.match(profileSource, /selectedResidentFacts/);
assert.match(profileSource, /rowMatchesQuery/);

console.log("client database integration checks passed");
