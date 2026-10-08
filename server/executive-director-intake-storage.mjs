import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BlobServiceClient } from "@azure/storage-blob";
import { ManagedIdentityCredential } from "@azure/identity";
import { createHttpError } from "./http-errors.mjs";
import { isProductionLikeRuntime } from "./runtime-environment.mjs";
import { extractLic624Report, summarizeLic624Extraction } from "./lic624-extraction.mjs";
import {
  assertLic624SubmissionId,
  getLic624ReviewIssues,
  validateLic624ReviewData
} from "./lic624-review.mjs";

export const EXECUTIVE_DIRECTOR_INTAKE_MAX_BYTES = 20 * 1024 * 1024;
export const EXECUTIVE_DIRECTOR_INTAKE_TYPES = Object.freeze([
  "application/pdf",
  "image/jpeg",
  "image/png"
]);

const STORAGE_ROOT = "licensing/executive-director-intake-v1";
const DEFAULT_LOCAL_ROOT = fileURLToPath(new URL("../generated/executive-director-intake", import.meta.url));
const EXTENSION_BY_TYPE = Object.freeze({
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png"
});

function normalizeFileName(value) {
  const baseName = Array.from(path.basename(String(value ?? "").trim()))
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
    })
    .join("");
  if (!baseName || baseName.length > 180) {
    throw createHttpError(400, "licensing_intake_filename_invalid", "Choose a file with a valid name.");
  }
  return baseName;
}

function normalizeContentType(value) {
  const contentType = (String(value ?? "").split(";", 1)[0] ?? "").trim().toLowerCase();
  if (!EXECUTIVE_DIRECTOR_INTAKE_TYPES.includes(contentType)) {
    throw createHttpError(415, "licensing_intake_type_invalid", "Upload a PDF, JPG, or PNG file.");
  }
  return contentType;
}

function assertFileSignature(bytes, contentType) {
  const matches = contentType === "application/pdf"
    ? bytes.subarray(0, 5).toString("ascii") === "%PDF-"
    : contentType === "image/png"
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.length >= 3 && bytes.at(0) === 0xff && bytes.at(1) === 0xd8 && bytes.at(2) === 0xff;
  if (!matches) {
    throw createHttpError(400, "licensing_intake_signature_invalid", "The file contents do not match its file type.");
  }
}

function getAzureContainer() {
  const account = process.env.AZURE_STORAGE_ACCOUNT?.trim();
  const containerName = process.env.AZURE_STORAGE_CONTAINER?.trim();
  const clientId = process.env.AZURE_CLIENT_ID?.trim();
  if (!account || !containerName || !clientId) {
    throw new Error("Executive Director intake storage is not configured.");
  }
  const service = new BlobServiceClient(
    `https://${account}.blob.core.windows.net`,
    new ManagedIdentityCredential(clientId),
    { retryOptions: { maxTries: 2, tryTimeoutInMs: 10_000 } }
  );
  return service.getContainerClient(containerName);
}

function shouldUseAzure() {
  const preference = String(process.env.EXECUTIVE_DIRECTOR_INTAKE_STORAGE ?? "").trim().toLowerCase();
  if (preference === "local") return false;
  if (preference === "azure") return true;
  return isProductionLikeRuntime();
}

function localRoot() {
  return process.env.EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT?.trim() || DEFAULT_LOCAL_ROOT;
}

function storagePaths(facilityId, submissionId, contentType) {
  const year = new Date().getUTCFullYear();
  const root = `${STORAGE_ROOT}/${facilityId}/${year}/${submissionId}`;
  return {
    source: `${root}/source${EXTENSION_BY_TYPE[contentType]}`,
    manifest: `${root}/manifest.json`
  };
}

async function readRequestBytes(req) {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.byteLength > EXECUTIVE_DIRECTOR_INTAKE_MAX_BYTES) {
      throw createHttpError(413, "licensing_intake_too_large", "The report must be 20 MB or smaller.");
    }
    return req.body;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > EXECUTIVE_DIRECTOR_INTAKE_MAX_BYTES) {
      throw createHttpError(413, "licensing_intake_too_large", "The report must be 20 MB or smaller.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function writeAzureSubmission(paths, bytes, manifest) {
  const container = getAzureContainer();
  await container.getBlockBlobClient(paths.source).uploadData(bytes, {
    blobHTTPHeaders: { blobContentType: manifest.contentType },
    metadata: {
      facilityId: manifest.facilityId,
      submissionId: manifest.submissionId,
      sha256: manifest.sha256
    },
    conditions: { ifNoneMatch: "*" }
  });
  await container.getBlockBlobClient(paths.manifest).uploadData(
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    {
      blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
      conditions: { ifNoneMatch: "*" }
    }
  );
}

async function writeLocalSubmission(paths, bytes, manifest) {
  const sourcePath = path.join(localRoot(), paths.source.replace(`${STORAGE_ROOT}/`, ""));
  const manifestPath = path.join(localRoot(), paths.manifest.replace(`${STORAGE_ROOT}/`, ""));
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, bytes, { flag: "wx" });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
}

async function listLocalManifests(facilityId) {
  const facilityRoot = path.join(localRoot(), facilityId);
  let files;
  try {
    files = await readdir(facilityRoot, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const manifests = await Promise.all(
    files
      .filter((entry) => entry.isFile() && entry.name === "manifest.json")
      .map(async (entry) => JSON.parse(await readFile(path.join(entry.parentPath, entry.name), "utf8")))
  );
  return manifests;
}

async function streamToBuffer(stream, maximumBytes = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream ?? []) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maximumBytes) throw new Error("Executive Director intake manifest is oversized.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

async function findLocalManifest(facilityId, submissionId) {
  const facilityRoot = path.join(localRoot(), facilityId);
  let files;
  try {
    files = await readdir(facilityRoot, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const entry = files.find((item) => item.isFile() && item.name === "manifest.json" && item.parentPath.endsWith(submissionId));
  if (!entry) return null;
  const manifestPath = path.join(entry.parentPath, entry.name);
  return {
    manifest: JSON.parse(await readFile(manifestPath, "utf8")),
    location: { kind: "local", manifestPath }
  };
}

async function findAzureManifest(facilityId, submissionId) {
  const container = getAzureContainer();
  const prefix = `${STORAGE_ROOT}/${facilityId}/`;
  const suffix = `/${submissionId}/manifest.json`;
  for await (const blob of container.listBlobsFlat({ prefix })) {
    if (!blob.name.endsWith(suffix)) continue;
    const download = await container.getBlobClient(blob.name).download();
    return {
      manifest: JSON.parse((await streamToBuffer(download.readableStreamBody, 256 * 1024)).toString("utf8")),
      location: { kind: "azure", blobName: blob.name, etag: download.etag }
    };
  }
  return null;
}

async function findStoredManifest(facilityId, submissionId) {
  const validSubmissionId = assertLic624SubmissionId(submissionId);
  const stored = shouldUseAzure()
    ? await findAzureManifest(facilityId, validSubmissionId)
    : await findLocalManifest(facilityId, validSubmissionId);
  if (!stored || stored.manifest?.facilityId !== facilityId || stored.manifest?.submissionId !== validSubmissionId) {
    throw createHttpError(404, "licensing_intake_not_found", "The licensing submission was not found.");
  }
  return stored;
}

function reviewIdentity(authContext) {
  return authContext?.authenticated
    ? {
        tenantId: String(authContext.claims?.tid ?? "").trim() || null,
        objectId: String(authContext.claims?.oid ?? authContext.claims?.sub ?? "").trim() || null
      }
    : { tenantId: null, objectId: "development-bypass" };
}

async function writeReview(stored, manifest, audit) {
  if (stored.location.kind === "azure") {
    const container = getAzureContainer();
    const reviewName = `${stored.location.blobName.slice(0, -("manifest.json".length))}reviews/${String(audit.revision).padStart(4, "0")}-${randomUUID()}.json`;
    await container.getBlockBlobClient(reviewName).uploadData(
      Buffer.from(`${JSON.stringify(audit, null, 2)}\n`, "utf8"),
      {
        blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
        conditions: { ifNoneMatch: "*" }
      }
    );
    try {
      await container.getBlockBlobClient(stored.location.blobName).uploadData(
        Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
        {
          blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
          ...(stored.location.etag ? { conditions: { ifMatch: stored.location.etag } } : {})
        }
      );
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 412) {
        throw createHttpError(409, "lic624_review_conflict", "This review changed in another session. Reload it before saving again.");
      }
      throw error;
    }
    return;
  }

  const reviewDirectory = path.join(path.dirname(stored.location.manifestPath), "reviews");
  await mkdir(reviewDirectory, { recursive: true });
  await writeFile(
    path.join(reviewDirectory, `${String(audit.revision).padStart(4, "0")}-${randomUUID()}.json`),
    `${JSON.stringify(audit, null, 2)}\n`,
    { flag: "wx" }
  );
  const temporaryPath = `${stored.location.manifestPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  await rename(temporaryPath, stored.location.manifestPath);
}

async function listAzureManifests(facilityId) {
  const container = getAzureContainer();
  const prefix = `${STORAGE_ROOT}/${facilityId}/`;
  const results = [];
  for await (const blob of container.listBlobsFlat({ prefix })) {
    if (!blob.name.endsWith("/manifest.json")) continue;
    const download = await container.getBlobClient(blob.name).download();
    results.push(JSON.parse((await streamToBuffer(download.readableStreamBody)).toString("utf8")));
  }
  return results;
}

export async function createExecutiveDirectorIntakeSubmission({ req, facilityId, authContext }) {
  const contentType = normalizeContentType(req.headers?.["content-type"]);
  const originalFileName = normalizeFileName(req.headers?.["x-file-name"]);
  const bytes = await readRequestBytes(req);
  if (!bytes.byteLength) {
    throw createHttpError(400, "licensing_intake_empty", "Choose a report to upload.");
  }
  assertFileSignature(bytes, contentType);

  const submissionId = randomUUID();
  const createdAt = new Date().toISOString();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const extraction = await extractLic624Report(bytes, contentType);
  const manifest = {
    version: "executive-director-licensing-intake-v1",
    submissionId,
    facilityId,
    originalFileName,
    contentType,
    byteLength: bytes.byteLength,
    sha256,
    createdAt,
    submittedBy: authContext?.authenticated
      ? {
          tenantId: String(authContext.claims?.tid ?? "").trim() || null,
          objectId: String(authContext.claims?.oid ?? authContext.claims?.sub ?? "").trim() || null
        }
      : { tenantId: null, objectId: "development-bypass" },
    status: extraction.status,
    extraction,
    review: null,
    reviewRevision: 0,
    reviewedAt: null,
    filedAt: null
  };
  const paths = storagePaths(facilityId, submissionId, contentType);
  if (shouldUseAzure()) await writeAzureSubmission(paths, bytes, manifest);
  else await writeLocalSubmission(paths, bytes, manifest);
  return manifest;
}

export function toExecutiveDirectorSubmissionDetail(manifest) {
  const sourceData = manifest.extraction?.data
    ? validateLic624ReviewData(manifest.extraction.data)
    : null;
  const draftData = manifest.review?.data
    ? validateLic624ReviewData(manifest.review.data)
    : sourceData;
  return {
    ...toExecutiveDirectorSubmissionSummary(manifest),
    sourceData,
    draftData,
    reviewIssues: draftData ? getLic624ReviewIssues(draftData) : (manifest.extraction?.reviewIssues ?? []),
    reviewRevision: Number.isInteger(manifest.reviewRevision) ? manifest.reviewRevision : 0,
    reviewUpdatedAt: manifest.review?.updatedAt ?? null,
    confirmedAt: manifest.review?.confirmedAt ?? null
  };
}

export async function getExecutiveDirectorIntakeSubmission(facilityId, submissionId) {
  const { manifest } = await findStoredManifest(facilityId, submissionId);
  return manifest;
}

export async function saveExecutiveDirectorIntakeReview({
  facilityId,
  submissionId,
  expectedRevision,
  data,
  confirm,
  authContext
}) {
  const stored = await findStoredManifest(facilityId, submissionId);
  const currentRevision = Number.isInteger(stored.manifest.reviewRevision)
    ? stored.manifest.reviewRevision
    : 0;
  if (currentRevision !== expectedRevision) {
    throw createHttpError(409, "lic624_review_conflict", "This review changed in another session. Reload it before saving again.");
  }
  if (stored.manifest.extraction?.method !== "pdf_acroform" || !stored.manifest.extraction?.data) {
    throw createHttpError(409, "lic624_review_unavailable", "This report requires OCR before its fields can be reviewed.");
  }

  const reviewIssues = getLic624ReviewIssues(data);
  if (confirm && reviewIssues.length) {
    throw createHttpError(422, "lic624_review_incomplete", "Complete the required review fields before marking this report reviewed.");
  }

  const updatedAt = new Date().toISOString();
  const revision = currentRevision + 1;
  const actor = reviewIdentity(authContext);
  const review = {
    version: "lic624-review-v1",
    revision,
    data,
    reviewIssues,
    updatedAt,
    updatedBy: actor,
    confirmedAt: confirm ? updatedAt : null,
    confirmedBy: confirm ? actor : null
  };
  const manifest = {
    ...stored.manifest,
    status: confirm ? "ready_to_file" : "needs_review",
    review,
    reviewRevision: revision,
    reviewedAt: confirm ? updatedAt : null
  };
  const audit = {
    version: "lic624-review-audit-v1",
    submissionId,
    facilityId,
    sourceSha256: manifest.sha256,
    revision,
    status: manifest.status,
    updatedAt,
    updatedBy: actor,
    confirmed: confirm,
    reviewIssues,
    data
  };
  await writeReview(stored, manifest, audit);
  return manifest;
}

export function toExecutiveDirectorSubmissionSummary(manifest) {
  const extractionSummary = manifest.extraction ? summarizeLic624Extraction(manifest.extraction) : null;
  if (extractionSummary && manifest.review?.reviewIssues) {
    extractionSummary.reviewIssueCount = manifest.review.reviewIssues.length;
  }
  return {
    submissionId: manifest.submissionId,
    facilityId: manifest.facilityId,
    originalFileName: manifest.originalFileName,
    contentType: manifest.contentType,
    byteLength: manifest.byteLength,
    sha256: manifest.sha256,
    createdAt: manifest.createdAt,
    status: manifest.status,
    extractionSummary,
    reviewedAt: manifest.reviewedAt,
    filedAt: manifest.filedAt
  };
}

export async function listExecutiveDirectorIntakeSubmissions(facilityId) {
  const manifests = shouldUseAzure()
    ? await listAzureManifests(facilityId)
    : await listLocalManifests(facilityId);
  return manifests
    .filter((manifest) => manifest?.facilityId === facilityId)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, 25);
}
