import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDataExplorerPayload } from "../server/data-explorer.mjs";
import { isCurrentPlatformSnapshot } from "../server/platform-snapshot.mjs";

const snapshot = JSON.parse(readFileSync(new URL("./fixtures/pipeline-clinical-snapshot.sanitized.json", import.meta.url)));
const database = {
  version: 1, dataset: "platform_client_database", baseline_date: "2026-08-18",
  generated_at: "2026-08-18T12:00:00Z", column_count: 3, client_count: 1,
  columns: ["canonical_client_id", "resident_name", "communities"],
  clients: [{ canonical_client_id: "fixture-1", resident_name: "Sanitized Example", communities: ["San Pablo"] }],
  documents: [], document_count: 0
};
assert.equal(isCurrentPlatformSnapshot(snapshot), false, "mutable fixtures must not qualify as published reads");
const build = (source, clientDatabase, status, cache = false, id = "") => buildDataExplorerPayload(source, "residents", status, {
  clientDatabase, cachePublishedProjection: cache, residentClientId: id
});
const baseline = build(snapshot, database, { status: "fresh" });
assert.deepEqual(build(snapshot, database, { status: "fresh" }, true), baseline);
assert.deepEqual(build(snapshot, database, { status: "fresh" }, true), baseline);
assert.equal(build(snapshot, database, { status: "stale" }, true).snapshot_status.status, "stale",
  "projection reuse must never cache freshness status");
assert.deepEqual(build(snapshot, database, {}, true, "fixture-1"), build(snapshot, database, {}, false, "fixture-1"));
assert.throws(() => build(snapshot, database, {}, true, "missing"), { statusCode: 404 });

database.clients[0].resident_name = "Updated Example";
assert.equal(build(snapshot, database, {}).rows.find(row => row.id === "fixture-1").resident_name, "Updated Example",
  "ordinary mutable callers must always see edits");
const replacement = structuredClone(database);
assert.deepEqual(build(snapshot, replacement, {}, true), build(snapshot, replacement, {}),
  "a replacement manifest must invalidate the published projection");
const nextSnapshot = structuredClone(snapshot);
assert.deepEqual(build(nextSnapshot, replacement, {}, true), build(nextSnapshot, replacement, {}),
  "a replacement snapshot must build its own projection");
console.log(JSON.stringify({ ok: true, checks: 9, scope: "published projection parity, replacement, freshness and mutable-input isolation" }));
