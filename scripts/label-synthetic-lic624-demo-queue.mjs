#!/usr/bin/env node
// One-time, recoverable projection update for the 100 user-approved demo PDFs.
// Originals and per-submission manifests are never modified.
import { AzureCliCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";

const apply = process.argv.includes("--apply");
const facilityId = "337";
const root = `licensing/executive-director-intake-v1/${facilityId}`;
const container = new BlobServiceClient(
  "https://alamodatalake.blob.core.windows.net",
  new AzureCliCredential()
).getContainerClient("alamo-platform-snapshots");
const catalogBlob = container.getBlockBlobClient(`${root}/catalog.json`);
const catalogDownload = await catalogBlob.download();
const original = await catalogBlob.downloadToBuffer();
const catalog = JSON.parse(original.toString("utf8"));
if (catalog.version !== "executive-director-intake-catalog-v1" || catalog.facilityId !== facilityId) {
  throw new Error("Unexpected production licensing catalog; no change made.");
}
const candidates = catalog.submissions.filter((record) => /^SYNTHETIC-LIC624-San-Pablo-\d{3}\.pdf$/.test(record.originalFileName));
if (candidates.length !== 100 || new Set(candidates.map((record) => record.sha256)).size !== 100) {
  throw new Error(`Expected exactly 100 distinct demo candidates, found ${candidates.length}; no change made.`);
}
for (const record of candidates) {
  if (record.facilityId !== facilityId || !record.storage?.manifestObject?.startsWith(`${root}/`)) {
    throw new Error(`Unexpected candidate storage for ${record.submissionId}; no change made.`);
  }
  const bytes = await container.getBlobClient(record.storage.manifestObject).downloadToBuffer();
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (manifest.submissionId !== record.submissionId || manifest.sha256 !== record.sha256 ||
      manifest.originalFileName !== record.originalFileName || manifest.submittedBy?.objectId !== "synthetic-demo-seed") {
    throw new Error(`Candidate ${record.submissionId} is not a verified synthetic seed; no change made.`);
  }
}
const alreadyLabeled = candidates.filter((record) => record.demo === true).length;
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", facilityId, candidates: candidates.length, alreadyLabeled, liveRecords: catalog.submissions.length - candidates.length }));
if (!apply || alreadyLabeled === candidates.length) process.exit(0);

const backupName = `licensing/executive-director-intake-archive-v1/${facilityId}/catalog-before-demo-label-${new Date().toISOString().replaceAll(":", "-")}.json`;
await container.getBlockBlobClient(backupName).uploadData(original, {
  blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  conditions: { ifNoneMatch: "*" }
});
const demoIds = new Set(candidates.map((record) => record.submissionId));
const next = {
  ...catalog,
  revision: Number(catalog.revision) + 1,
  updatedAt: new Date().toISOString(),
  submissions: catalog.submissions.map((record) => demoIds.has(record.submissionId) ? { ...record, demo: true } : record)
};
await catalogBlob.uploadData(Buffer.from(`${JSON.stringify(next, null, 2)}\n`), {
  blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  conditions: { ifMatch: catalogDownload.etag }
});
const persisted = JSON.parse((await catalogBlob.downloadToBuffer()).toString("utf8"));
if (persisted.submissions.filter((record) => record.demo === true).length !== 100) {
  throw new Error("Demo labeling did not verify; restore from the private backup before continuing.");
}
console.log(JSON.stringify({ verified: true, demoRecords: 100, backupName, catalogRevision: persisted.revision }));
