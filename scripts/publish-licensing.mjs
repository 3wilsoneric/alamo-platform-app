import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { BlobServiceClient } from "@azure/storage-blob";
import { AzureCliCredential } from "@azure/identity";
import { validateLicensingBundle } from "../server/licensing-library.mjs";
import { LICENSING_BLOB_PATH, LICENSING_MAX_BYTES } from "../server/licensing-storage.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const exec = promisify(execFile);
const baseline = JSON.parse(await readFile(path.join(root, "generated/licensing/baseline.json"), "utf8"));
const updates = JSON.parse(await readFile(path.join(root, "generated/licensing/updates.json"), "utf8"));
const bundle = validateLicensingBundle({ version: "licensing-bundle-v1", baseline, updates });
const bytes = Buffer.from(JSON.stringify(bundle));
if (bytes.length > LICENSING_MAX_BYTES) throw new Error("Licensing collection exceeds storage limit.");
const service = new BlobServiceClient("https://alamodatalake.blob.core.windows.net", new AzureCliCredential(), {
  retryOptions: { maxTries: 3, tryTimeoutInMs: 30_000 }
});
const container = service.getContainerClient("alamo-platform-snapshots");
const current = container.getBlockBlobClient(LICENSING_BLOB_PATH);
let previous;
try {
  const response = await current.download();
  if (response.contentLength > LICENSING_MAX_BYTES) throw new Error("Published licensing collection is oversized.");
  const chunks = [];
  for await (const chunk of response.readableStreamBody ?? []) chunks.push(Buffer.from(chunk));
  previous = { etag: response.etag, value: validateLicensingBundle(JSON.parse(Buffer.concat(chunks).toString("utf8"))) };
} catch (error) {
  if (error.statusCode !== 404) throw error;
}
const checkedAt = updates.lastChecked ?? baseline.collectedAt;
if (previous && (Date.parse(previous.value.baseline.collectedAt) > Date.parse(baseline.collectedAt) ||
  Date.parse(previous.value.updates.lastChecked ?? previous.value.baseline.collectedAt) > Date.parse(checkedAt))) {
  throw new Error("A newer licensing collection is already published. Refusing to replace it.");
}
const hash = createHash("sha256").update(bytes).digest("hex");
const archivePath = `licensing/versions/${hash}.json`;
async function uploadOnce(client, content, type) {
  try {
    await client.uploadData(content, { conditions: { ifNoneMatch: "*" }, blobHTTPHeaders: { blobContentType: type } });
  } catch (error) {
    if (error.statusCode !== 409 && error.statusCode !== 412) throw error;
  }
}
// Preserve the source ledger, original responses, and extracted text before publishing.
const archiveDir = path.join(root, "generated/licensing");
await mkdir(archiveDir, { recursive: true });
const evidencePath = path.join(archiveDir, "evidence.tar.gz");
await exec("tar", ["-czf", evidencePath, "--exclude=*.lock", "-C", path.join(root, "output/ccld-baseline"), "data"], { timeout: 60_000 });
const evidence = await readFile(evidencePath);
const evidenceHash = createHash("sha256").update(evidence).digest("hex");
await uploadOnce(container.getBlockBlobClient(`licensing/evidence/${evidenceHash}.tar.gz`), evidence, "application/gzip");
await uploadOnce(container.getBlockBlobClient(archivePath), bytes, "application/json");
await current.uploadData(bytes, {
  conditions: previous ? { ifMatch: previous.etag } : { ifNoneMatch: "*" },
  blobHTTPHeaders: { blobContentType: "application/json", blobCacheControl: "no-cache" }
});
const receipt = { publishedAt: new Date().toISOString(), runId: baseline.runId, reports: baseline.totalReports,
  status: updates.status, sha256: hash, blob: LICENSING_BLOB_PATH, archivePath, evidenceHash };
await writeFile(path.join(archiveDir, "published.json"), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
