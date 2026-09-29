import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateLicensingBundle } from "../server/licensing-validation.mjs";
import { LICENSING_BLOB_PATH, LICENSING_MAX_BYTES } from "../server/licensing-storage.mjs";
import { licensingContainer, readBlob, uploadImmutable } from "./licensing/cloud-storage.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const exec = promisify(execFile);
const baseline = JSON.parse(await readFile(path.join(root, "generated/licensing/baseline.json"), "utf8"));
const updates = JSON.parse(await readFile(path.join(root, "generated/licensing/updates.json"), "utf8"));
const container = licensingContainer();
const current = container.getBlockBlobClient(LICENSING_BLOB_PATH);
let previous;
try {
  const response = await readBlob(current, LICENSING_MAX_BYTES);
  previous = { etag: response.etag, value: validateLicensingBundle(JSON.parse(response.bytes)) };
} catch (error) {
  if (error.statusCode !== 404) throw error;
}
const checkedAt = updates.lastChecked ?? baseline.collectedAt;
if (previous && (Date.parse(previous.value.baseline.collectedAt) > Date.parse(baseline.collectedAt) ||
  Date.parse(previous.value.updates.lastChecked ?? previous.value.baseline.collectedAt) > Date.parse(checkedAt))) {
  throw new Error("A newer licensing collection is already published. Refusing to replace it.");
}
if (process.env.LICENSING_EXPECTED_ETAG && previous?.etag !== process.env.LICENSING_EXPECTED_ETAG) {
  throw new Error("Licensing history changed after restore; refusing publication.");
}
const archiveDir = path.join(root, "generated/licensing");
await mkdir(archiveDir, { recursive: true });
const evidencePath = path.join(archiveDir, "evidence.tar.gz");
await exec("tar", ["--exclude=*.lock", "-czf", evidencePath, "-C", path.join(root, "output/ccld-baseline"), "data"], { timeout: 60_000 });
const evidence = await readFile(evidencePath);
const evidenceHash = createHash("sha256").update(evidence).digest("hex");
const bundle = validateLicensingBundle({ version: "licensing-bundle-v1", baseline, updates,
  collector: { version: "licensing-collector-v1", evidenceSha256: evidenceHash } });
const bytes = Buffer.from(JSON.stringify(bundle));
if (bytes.length > LICENSING_MAX_BYTES) throw new Error("Licensing collection exceeds storage limit.");
const hash = createHash("sha256").update(bytes).digest("hex");
const archivePath = `licensing/versions/${hash}.json`;
// Upload immutable objects first, then advance reports, status, and restart state
// together in one conditional write. A failed upload never replaces the library.
await uploadImmutable(container.getBlockBlobClient(`licensing/evidence/${evidenceHash}.tar.gz`), evidence, "application/gzip");
await uploadImmutable(container.getBlockBlobClient(archivePath), bytes, "application/json");
await current.uploadData(bytes, {
  conditions: { ...(previous ? { ifMatch: previous.etag } : { ifNoneMatch: "*" }),
    ...(process.env.LICENSING_LEASE_ID ? { leaseId: process.env.LICENSING_LEASE_ID } : {}) },
  blobHTTPHeaders: { blobContentType: "application/json", blobCacheControl: "no-cache" }
});
const receipt = { publishedAt: new Date().toISOString(), runId: baseline.runId, reports: baseline.totalReports,
  status: updates.status, sha256: hash, blob: LICENSING_BLOB_PATH, archivePath, evidenceHash };
await writeFile(path.join(archiveDir, "published.json"), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
