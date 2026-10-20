#!/usr/bin/env node
// Read-only integrity audit of the authorized San Pablo synthetic queue.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AzureCliCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";

const container = new BlobServiceClient(
  "https://alamodatalake.blob.core.windows.net",
  new AzureCliCredential()
).getContainerClient("alamo-platform-snapshots");
const root = "licensing/executive-director-intake-v1/337";
const catalog = JSON.parse((await container.getBlobClient(`${root}/catalog.json`).downloadToBuffer()).toString("utf8"));
assert.equal(catalog.submissions.length, 100);
assert.equal(new Set(catalog.submissions.map((item) => item.sha256)).size, 100);
const oldIds = new Set([
  "3109df11-d3c4-4cc1-8316-0c5500c2c966",
  "00a4b8f7-8af1-443c-8341-73c0444cb2e1",
  "6a20a3cc-ac61-446e-aca7-d97456226449"
]);
assert(catalog.submissions.every((item) => !oldIds.has(item.submissionId)));
const scenarios = new Map();
let verified = 0;
for (const record of catalog.submissions) {
  assert.match(record.originalFileName, /^SYNTHETIC-LIC624-San-Pablo-\d{3}\.pdf$/);
  assert.equal(record.status, "needs_review");
  const local = await readFile(path.resolve("output/pdf/lic624-demo-100", record.originalFileName));
  const localHash = createHash("sha256").update(local).digest("hex");
  assert.equal(record.sha256, localHash);
  const manifest = JSON.parse((await container.getBlobClient(record.storage.manifestObject).downloadToBuffer()).toString("utf8"));
  assert.equal(manifest.submissionId, record.submissionId);
  assert.equal(manifest.extraction?.method, "pdf_acroform");
  assert.deepEqual(manifest.extraction?.reviewIssues, []);
  assert.equal(manifest.extraction?.data?.facility?.name, "San Pablo Synthetic Demo Facility");
  assert.equal(manifest.extraction?.data?.residents?.[0]?.name, `Demo Resident ${record.originalFileName.match(/(\d{3})\.pdf$/)[1]}`);
  for (const type of manifest.extraction.data.incidentTypes) scenarios.set(type.key, (scenarios.get(type.key) ?? 0) + 1);
  const receiptName = `${root}/receipts/sha256/${record.sha256}.json`;
  const receipt = JSON.parse((await container.getBlobClient(receiptName).downloadToBuffer()).toString("utf8"));
  assert.equal(receipt.submissionId, record.submissionId);
  const source = await container.getBlobClient(record.storage.sourceObject).downloadToBuffer();
  assert.deepEqual(source, local);
  verified += 1;
}
let activeManifests = 0;
for await (const blob of container.listBlobsFlat({ prefix: `${root}/` })) {
  if (blob.name.endsWith("/manifest.json")) activeManifests += 1;
}
assert.equal(activeManifests, 100);
assert.deepEqual(Object.fromEntries([...scenarios].sort()), {
  hospitalization: 20,
  injury_accident: 20,
  medical_emergency: 20,
  property_damage: 20,
  unauthorized_absence: 20
});
console.log(JSON.stringify({ catalog: catalog.submissions.length, verifiedOriginalsAndReceipts: verified, activeManifests, scenarios: Object.fromEntries([...scenarios].sort()) }));
