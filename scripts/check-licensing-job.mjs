import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { LICENSING_SCHEDULE, isLicensingScheduledTime } from "./licensing/job-schedule.mjs";
import { withLicensingLease, readBlob } from "./licensing/cloud-storage.mjs";
import { validateLicensingUpdates } from "../shared/licensing-contracts.mjs";
import {
  buildLicensingChangeEmail,
  deliverPendingLicensingNotifications,
  LICENSING_ALERT_RECIPIENTS,
  licensingAlertDeliveryEnabled,
  queueLicensingChangeNotification
} from "./licensing/update-notifications.mjs";

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

const notificationInput = {
  runId: "20261005T160021Z-2fb72799",
  checkedAt: "2026-10-05T16:02:23.460Z",
  alerts: [{ community: "Santa Clarita <test>", title: "Updated facility profile & owner", at: "2026-10-05T16:02:23.460Z", reportId: null, reportDate: null }]
};
const email = buildLicensingChangeEmail(notificationInput);
assert.deepEqual(email.to, LICENSING_ALERT_RECIPIENTS);
assert.equal(email.subject, "Licensing update: Santa Clarita <test>");
assert.match(email.html, /Santa Clarita &lt;test&gt;/);
assert.match(email.html, /Updated facility profile &amp; owner/);
assert.doesNotMatch(email.html, /Santa Clarita <test>/);
assert.equal(email.idempotencyKey, `licensing:${notificationInput.runId}`);
assert.equal(licensingAlertDeliveryEnabled(), false, "Delivery must fail closed without an explicit enable flag");
assert.equal(licensingAlertDeliveryEnabled("false"), false);
assert.equal(licensingAlertDeliveryEnabled("true"), true);

const blobs = new Map();
function blobClient(name) {
  return {
    name,
    async exists() { return blobs.has(name); },
    async uploadData(bytes, options = {}) {
      if (options.conditions?.ifNoneMatch === "*" && blobs.has(name)) throw Object.assign(new Error("Exists"), { statusCode: 409 });
      blobs.set(name, Buffer.from(bytes));
    },
    async download() {
      const bytes = blobs.get(name);
      if (!bytes) throw Object.assign(new Error("Missing"), { statusCode: 404 });
      return { contentLength: bytes.length, readableStreamBody: Readable.from([bytes]) };
    }
  };
}
const notificationContainer = {
  getBlockBlobClient: blobClient,
  async *listBlobsFlat({ prefix }) {
    for (const name of [...blobs.keys()].filter((candidate) => candidate.startsWith(prefix))) yield { name };
  }
};
assert.equal((await queueLicensingChangeNotification(notificationContainer, { ...notificationInput, alerts: [] })).status, "skipped");
assert.equal((await queueLicensingChangeNotification(notificationContainer, notificationInput)).status, "queued");
const paused = await deliverPendingLicensingNotifications(notificationContainer);
assert.deepEqual(paused, [{ status: "paused", pendingCount: 1 }]);
let deliveryCalls = 0;
const delivery = await deliverPendingLicensingNotifications(notificationContainer, {
  enabled: true,
  webhookUrl: "https://prod-00.westus.logic.azure.com/workflows/test/triggers/manual/paths/invoke?sig=test",
  fetchImpl: async (_url, request) => {
    deliveryCalls += 1;
    const body = JSON.parse(request.body);
    assert.deepEqual(body.to, LICENSING_ALERT_RECIPIENTS);
    assert.equal(request.headers["Idempotency-Key"], email.idempotencyKey);
    return { ok: true, status: 200, body: null };
  }
});
assert.equal(delivery[0].status, "sent");
assert.equal(deliveryCalls, 1);
const repeated = await deliverPendingLicensingNotifications(notificationContainer, {
  enabled: true,
  webhookUrl: "https://prod-00.westus.logic.azure.com/workflows/test/triggers/manual/paths/invoke?sig=test",
  fetchImpl: async () => { throw new Error("A sent notification must not be delivered twice."); }
});
assert.equal(repeated[0].status, "already_sent");
assert.equal(deliveryCalls, 1);
blobs.delete(`licensing/notifications/sent/${notificationInput.runId}.json`);
await assert.rejects(deliverPendingLicensingNotifications({ ...notificationContainer, listBlobsFlat: async function* () { yield { name: "licensing/notifications/pending/20261005T160021Z-2fb72799.json" }; } }, {
  enabled: true,
  webhookUrl: "http://example.com/insecure",
  fetchImpl: async () => ({ ok: true, status: 200, body: null })
}), /Azure Logic Apps HTTPS/);

const workflow = JSON.parse(await readFile(new URL("./azure/licensing-alert-workflow.json", import.meta.url), "utf8"));
assert.equal(workflow.properties.state, "Disabled");
assert.equal(workflow.properties.definition.actions.send_licensing_change_email.inputs.body.To, LICENSING_ALERT_RECIPIENTS.slice().reverse().join(";"));
assert.match(workflow.properties.definition.actions.send_licensing_change_email.inputs.host.connection.name, /office365/);
const job = JSON.parse(await readFile(new URL("./azure/licensing-job.json", import.meta.url), "utf8"));
assert.equal(job.properties.configuration.secrets[0].keyVaultUrl, "https://alamo-platform-kv-6jtpmf.vault.azure.net/secrets/licensing-alert-webhook-url");
assert.equal(job.properties.template.containers[0].env.find((entry) => entry.name === "LICENSING_ALERT_NOTIFICATIONS_ENABLED")?.value, "false");
assert.equal(job.properties.template.containers[0].env.find((entry) => entry.name === "LICENSING_ALERT_WEBHOOK_URL")?.secretRef, "licensing-alert-webhook-url");

console.log("Licensing job checks passed: Pacific DST schedule, overlap lock, failure unlock, bounded restore, paused-by-default change email, recipient lock, delivery receipt, and schedule validation.");
