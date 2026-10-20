#!/usr/bin/env node
// Seed the explicitly authorized San Pablo production demo queue using the
// same immutable receipt, AcroForm extraction and Azure object-store modules
// as the live upload API. Safe to rerun: SHA-256 receipts deduplicate each PDF.
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { AzureCliCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { createAzureIntakeObjectStore } from "../server/executive-director-intake-objects.mjs";
import { persistIdempotentIntakeUpload } from "../server/executive-director-intake-receipts.mjs";
import { extractLic624Report } from "../server/lic624-extraction.mjs";
import { toExecutiveDirectorSubmissionSummary } from "../server/executive-director-intake-storage.mjs";

const apply = process.argv.includes("--apply");
const facilityId = "337";
const sourceDirectory = path.resolve("output/pdf/lic624-demo-100");
const prefix = `licensing/executive-director-intake-v1/${facilityId}`;
const catalogName = `${prefix}/catalog.json`;
const container = new BlobServiceClient(
  "https://alamodatalake.blob.core.windows.net",
  new AzureCliCredential()
).getContainerClient("alamo-platform-snapshots");
const objects = createAzureIntakeObjectStore(container);
const catalogBlob = container.getBlockBlobClient(catalogName);
const files = (await readdir(sourceDirectory)).filter((name) => /^SYNTHETIC-LIC624-San-Pablo-\d{3}\.pdf$/.test(name)).sort();
if (files.length !== 100) throw new Error(`Expected exactly 100 synthetic PDFs, found ${files.length}.`);

async function readCatalog() {
  const download = await catalogBlob.download();
  const catalog = JSON.parse((await catalogBlob.downloadToBuffer()).toString("utf8"));
  if (catalog.version !== "executive-director-intake-catalog-v1" || catalog.facilityId !== facilityId) throw new Error("Production catalog shape changed.");
  if (catalog.submissions.some((item) => !/^SYNTHETIC-LIC624-San-Pablo-\d{3}\.pdf$/.test(item.originalFileName))) throw new Error("Real or unrelated records appeared in the demo queue; stopping.");
  return { catalog, etag: download.etag };
}

async function upsertCatalog(manifest) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { catalog, etag } = await readCatalog();
    const record = {
      ...toExecutiveDirectorSubmissionSummary(manifest),
      updatedAt: manifest.createdAt,
      reviewRevision: 0,
      storage: manifest.storage
    };
    if (catalog.submissions.some((item) => item.submissionId === record.submissionId)) return catalog;
    const submissions = [...catalog.submissions, record].sort((left, right) =>
      String(right.createdAt).localeCompare(String(left.createdAt)) || String(right.submissionId).localeCompare(String(left.submissionId)));
    if (submissions.length > 100) throw new Error("Demo queue would exceed 100 reports.");
    const next = { ...catalog, revision: Number(catalog.revision) + 1, updatedAt: new Date().toISOString(), submissions };
    const bytes = Buffer.from(`${JSON.stringify(next, null, 2)}\n`);
    if (bytes.length > 8 * 1024 * 1024) throw new Error("Demo catalog exceeds platform capacity.");
    try {
      await catalogBlob.uploadData(bytes, {
        blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
        conditions: { ifMatch: etag }
      });
      return next;
    } catch (error) {
      if (error?.statusCode !== 412) throw error;
    }
  }
  throw new Error("Production catalog remained busy; retry the idempotent seed.");
}

const initial = await readCatalog();
console.log(JSON.stringify({ mode: apply ? "seed" : "dry-run", files: files.length, existingDemoRecords: initial.catalog.submissions.length }));
if (!apply) process.exit(0);

let created = 0;
let duplicates = 0;
for (const [index, name] of files.entries()) {
  const bytes = await readFile(path.join(sourceDirectory, name));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const submissionId = randomUUID();
  const createdAt = new Date().toISOString();
  const root = `${prefix}/${new Date().getUTCFullYear()}/${submissionId}`;
  const metadata = {
    submissionId, facilityId, originalFileName: name,
    contentType: "application/pdf", byteLength: bytes.length, sha256, createdAt,
    submittedBy: { tenantId: null, objectId: "synthetic-demo-seed" },
    storage: { sourceObject: `${root}/source.pdf`, manifestObject: `${root}/manifest.json` }
  };
  const result = await persistIdempotentIntakeUpload({ facilityId, sha256, bytes, metadata }, {
    objects,
    findLegacy: async () => null,
    async buildManifest(initialMetadata) {
      const extraction = await extractLic624Report(bytes, "application/pdf");
      if (extraction.status !== "needs_review" || extraction.method !== "pdf_acroform" || extraction.reviewIssues.length
        || extraction.data?.facility?.name !== "San Pablo Synthetic Demo Facility"
        || extraction.data?.residents?.[0]?.name !== `Demo Resident ${String(index + 1).padStart(3, "0")}`) {
        throw new Error(`Synthetic extraction did not match expected fields for ${name}.`);
      }
      const { version: _receiptVersion, ...fields } = initialMetadata;
      return {
        version: "executive-director-licensing-intake-v1",
        ...fields,
        status: extraction.status,
        extraction,
        review: null,
        reviewRevision: 0,
        reviewedAt: null,
        filedAt: null
      };
    },
    async assertCapacity() {
      const { catalog } = await readCatalog();
      if (catalog.submissions.length >= 100 && !catalog.submissions.some((item) => item.sha256 === sha256)) throw new Error("Demo queue is at capacity.");
    },
    indexManifest: upsertCatalog,
    afterPersist: async () => {}
  });
  if (result.duplicate) duplicates += 1;
  else created += 1;
  if ((index + 1) % 10 === 0) console.log(JSON.stringify({ processed: index + 1, created, duplicates }));
}

const final = await readCatalog();
if (final.catalog.submissions.length !== 100 || new Set(final.catalog.submissions.map((item) => item.sha256)).size !== 100) {
  throw new Error("Final production queue did not contain 100 unique synthetic reports.");
}
console.log(JSON.stringify({ complete: true, created, duplicates, productionQueue: final.catalog.submissions.length, needsReview: final.catalog.submissions.filter((item) => item.status === "needs_review").length }));
