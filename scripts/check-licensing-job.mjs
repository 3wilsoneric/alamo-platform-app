import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { LICENSING_SCHEDULE, isLicensingScheduledTime } from "./licensing/job-schedule.mjs";
import { withLicensingLease, readBlob } from "./licensing/cloud-storage.mjs";
import { validateLicensingUpdates } from "../shared/licensing-contracts.mjs";

for (const value of ["2026-09-28T16:00:00Z", "2026-11-02T17:00:00Z", "2027-03-15T16:00:00Z"]) {
  assert.ok(isLicensingScheduledTime(new Date(value)), `Pacific 9 a.m. must run: ${value}`);
}
for (const value of ["2026-09-28T17:00:00Z", "2026-11-02T16:00:00Z", "2026-09-29T16:00:00Z"]) {
  assert.ok(!isLicensingScheduledTime(new Date(value)), `Wrong slot must skip: ${value}`);
}
let held = false;
let releases = 0;
const client = { getBlobLeaseClient: () => ({ leaseId: "lease-test",
  acquireLease: async (seconds) => { assert.equal(seconds, 60); if (held) throw Object.assign(new Error("Busy"), { statusCode: 409 }); held = true; },
  renewLease: async () => { assert.ok(held); },
  releaseLease: async () => { held = false; releases += 1; }
}) };
await withLicensingLease(client, async (leaseId, signal) => {
  assert.equal(leaseId, "lease-test");
  assert.equal(signal.aborted, false);
  const concurrent = await withLicensingLease(client, () => { throw new Error("Overlapping collector ran"); });
  assert.equal(concurrent.status, "skipped");
});
assert.equal(releases, 1);
await assert.rejects(withLicensingLease(client, async () => { throw new Error("Collector failed"); }), /Collector failed/);
assert.equal(held, false);
assert.equal(releases, 2, "A failed scan must release the lease for a later retry");
const oversized = { download: async () => ({ contentLength: 20, readableStreamBody: Readable.from([Buffer.alloc(20)]) }) };
await assert.rejects(readBlob(oversized, 10), /size limit/);
const unbounded = { download: async () => ({ readableStreamBody: Readable.from([Buffer.alloc(6), Buffer.alloc(6)]) }) };
await assert.rejects(readBlob(unbounded, 10), /size limit/);
const valid = validateLicensingUpdates({ version: "licensing-updates-v1", status: "complete", alerts: [], schedule: LICENSING_SCHEDULE });
assert.equal(valid.schedule.timezone, "America/Los_Angeles");
assert.throws(() => validateLicensingUpdates({ ...valid, schedule: { ...LICENSING_SCHEDULE, hour: 8 } }));
console.log("Licensing job checks passed: Pacific DST schedule, overlap lock, failure unlock, bounded restore, and schedule validation.");
