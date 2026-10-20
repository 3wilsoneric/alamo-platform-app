#!/usr/bin/env node
// One-off, fail-closed archive of the three known San Pablo LIC 624 submissions.
// Copies and verifies every original blob before changing the active catalog.
import { createHash, randomUUID } from "node:crypto";
import { AzureCliCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";

const facilityId = "337";
const account = "alamodatalake";
const containerName = "alamo-platform-snapshots";
const activePrefix = `licensing/executive-director-intake-v1/${facilityId}/`;
const catalogName = `${activePrefix}catalog.json`;
const expectedIds = new Set([
  "3109df11-d3c4-4cc1-8316-0c5500c2c966",
  "00a4b8f7-8af1-443c-8341-73c0444cb2e1",
  "6a20a3cc-ac61-446e-aca7-d97456226449"
]);
const apply = process.argv.includes("--apply");
const container = new BlobServiceClient(
  `https://${account}.blob.core.windows.net`,
  new AzureCliCredential()
).getContainerClient(containerName);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function etagValue(value) {
  return String(value ?? "").replace(/^"|"$/g, "");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const listed = [];
for await (const blob of container.listBlobsFlat({ prefix: activePrefix })) {
  listed.push({ name: blob.name, etag: blob.properties.etag, length: blob.properties.contentLength });
}
const catalogListed = listed.find((blob) => blob.name === catalogName);
assert(catalogListed, "Active catalog is missing; no changes made.");
const catalogBlob = container.getBlobClient(catalogName);
const catalogDownload = await catalogBlob.download();
const catalogBytes = await catalogBlob.downloadToBuffer();
const catalog = JSON.parse(catalogBytes.toString("utf8"));
assert(catalog.version === "executive-director-intake-catalog-v1" && catalog.facilityId === facilityId, "Catalog format changed.");
assert(catalog.submissions.length === expectedIds.size, "Active queue no longer contains exactly three submissions.");
assert(catalog.submissions.every((item) => expectedIds.has(item.submissionId)), "Active queue IDs changed.");
assert(etagValue(catalogDownload.etag) === etagValue(catalogListed.etag), "Catalog changed during preflight.");

const dataBlobs = listed.filter((blob) => /\.(json|pdf|jpg|png)$/i.test(blob.name));
const recordBlobs = dataBlobs.filter((blob) => {
  if (blob.name === catalogName) return false;
  return [...expectedIds].some((id) => blob.name.includes(`/${id}`));
});
const otherBlobs = dataBlobs.filter((blob) => !recordBlobs.includes(blob) && blob.name !== catalogName);
assert(otherBlobs.length === 0, "Unexpected active blobs found; no changes made.");
assert(recordBlobs.length >= expectedIds.size * 2, "Some record blobs are missing; no changes made.");
assert([...expectedIds].every((id) => recordBlobs.some((blob) => blob.name.endsWith(`/${id}/manifest.json`))), "A record manifest is missing.");

console.log(JSON.stringify({ facilityId, activeRecords: catalog.submissions.length, recordBlobs: recordBlobs.length, mode: apply ? "archive-and-clear" : "dry-run" }));
if (!apply) process.exit(0);

const archivePrefix = `licensing/executive-director-intake-archive-v1/${facilityId}/${new Date().toISOString().slice(0, 10)}-${randomUUID()}`;
const copies = [];
for (const source of [catalogListed, ...recordBlobs]) {
  const sourceBlob = container.getBlobClient(source.name);
  const downloaded = await sourceBlob.download();
  assert(etagValue(downloaded.etag) === etagValue(source.etag), `Source changed before archive: ${source.name}`);
  const bytes = await sourceBlob.downloadToBuffer();
  assert(bytes.length === source.length, `Source length changed: ${source.name}`);
  const destinationName = `${archivePrefix}/${source.name.slice(activePrefix.length)}`;
  const destinationBlob = container.getBlockBlobClient(destinationName);
  await destinationBlob.uploadData(bytes, {
    blobHTTPHeaders: { blobContentType: source.name.endsWith(".pdf") ? "application/pdf" : "application/json; charset=utf-8" },
    conditions: { ifNoneMatch: "*" }
  });
  const check = await destinationBlob.downloadToBuffer();
  assert(check.length === bytes.length && sha256(check) === sha256(bytes), `Archive verification failed: ${destinationName}`);
  copies.push({ originalName: source.name, archivedName: destinationName, etag: source.etag, length: bytes.length, sha256: sha256(bytes) });
}

const archiveManifest = {
  version: "lic624-demo-queue-archive-v1",
  facilityId,
  archivedAt: new Date().toISOString(),
  originalCatalogRevision: catalog.revision,
  submissionIds: [...expectedIds],
  blobs: copies
};
await container.getBlockBlobClient(`${archivePrefix}/archive-manifest.json`).uploadData(
  Buffer.from(`${JSON.stringify(archiveManifest, null, 2)}\n`),
  { blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" }, conditions: { ifNoneMatch: "*" } }
);

const currentCatalog = await catalogBlob.download();
assert(etagValue(currentCatalog.etag) === etagValue(catalogDownload.etag), "Catalog changed after archival; originals and archive left intact.");
const clearedCatalog = {
  ...catalog,
  revision: Number(catalog.revision) + 1,
  updatedAt: new Date().toISOString(),
  submissions: []
};
const upload = await container.getBlockBlobClient(catalogName).uploadData(
  Buffer.from(`${JSON.stringify(clearedCatalog, null, 2)}\n`),
  { blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" }, conditions: { ifMatch: catalogDownload.etag } }
);

let deleted = 0;
try {
  for (const source of recordBlobs) {
    await container.getBlobClient(source.name).delete({ conditions: { ifMatch: `"${etagValue(source.etag)}"` } });
    deleted += 1;
  }
} catch (error) {
  // Restore only missing original blobs from their verified archive copy. Do
  // not overwrite a concurrent write or a catalog modified by another user.
  for (const source of recordBlobs) {
    const original = container.getBlobClient(source.name);
    if (await original.exists()) continue;
    const archived = copies.find((copy) => copy.originalName === source.name);
    assert(archived, `Missing archive mapping for ${source.name}`);
    const bytes = await container.getBlobClient(archived.archivedName).downloadToBuffer();
    assert(sha256(bytes) === archived.sha256, `Archive changed before rollback: ${archived.archivedName}`);
    await container.getBlockBlobClient(source.name).uploadData(bytes, { conditions: { ifNoneMatch: "*" } });
  }
  await container.getBlockBlobClient(catalogName).uploadData(catalogBytes, { conditions: { ifMatch: upload.etag } });
  throw error;
}

const finalCatalog = JSON.parse((await catalogBlob.downloadToBuffer()).toString("utf8"));
assert(finalCatalog.submissions.length === 0, "Archive cutover did not clear the active queue.");
console.log(JSON.stringify({ archivedRecords: catalog.submissions.length, verifiedBlobs: copies.length, removedActiveRecordBlobs: deleted, archivePrefix, activeQueue: finalCatalog.submissions.length }));
