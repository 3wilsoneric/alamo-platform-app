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
const CATALOG_VERSION = "executive-director-intake-catalog-v1";
const DEFAULT_PAGE_LIMIT = 25;
const MAX_PAGE_LIMIT = 100;
const MAX_CATALOG_BYTES = 8 * 1024 * 1024;
const DEFAULT_LOCAL_ROOT = fileURLToPath(new URL("../generated/executive-director-intake", import.meta.url));
const EXTENSION_BY_TYPE = Object.freeze({
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png"
});
let cachedAzureContainer = null;
let cachedAzureContainerKey = null;

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
  const cacheKey = `${account}\u0000${containerName}\u0000${clientId}`;
  if (cachedAzureContainer && cachedAzureContainerKey === cacheKey) return cachedAzureContainer;
  const service = new BlobServiceClient(
    `https://${account}.blob.core.windows.net`,
    new ManagedIdentityCredential(clientId),
    { retryOptions: { maxTries: 2, tryTimeoutInMs: 10_000 } }
  );
  cachedAzureContainer = service.getContainerClient(containerName);
  cachedAzureContainerKey = cacheKey;
  return cachedAzureContainer;
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

function catalogObjectName(facilityId) {
  return `${STORAGE_ROOT}/${facilityId}/catalog.json`;
}

function emptyCatalog(facilityId) {
  return {
    version: CATALOG_VERSION,
    facilityId,
    revision: 0,
    updatedAt: null,
    submissions: []
  };
}

function isMissingStorageObject(error) {
  return Boolean(error && typeof error === "object" && (
    ("statusCode" in error && error.statusCode === 404)
    || ("code" in error && error.code === "ENOENT")
  ));
}

function isStorageConflict(error) {
  return Boolean(error && typeof error === "object" && "statusCode" in error && error.statusCode === 412);
}

function normalizeCatalog(catalog, facilityId) {
  if (!catalog || catalog.version !== CATALOG_VERSION || catalog.facilityId !== facilityId || !Array.isArray(catalog.submissions)) {
    throw new Error("Executive Director intake catalog is invalid.");
  }
  return catalog;
}

function serializeCatalog(catalog) {
  const bytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  if (bytes.byteLength > MAX_CATALOG_BYTES) {
    throw createHttpError(507, "licensing_catalog_capacity", "The licensing queue index reached its configured capacity.");
  }
  return bytes;
}

function toCatalogRecord(manifest) {
  return {
    ...toExecutiveDirectorSubmissionSummary(manifest),
    updatedAt: manifest.review?.updatedAt ?? manifest.createdAt,
    storage: manifest.storage ?? null
  };
}

function catalogRecordForResponse(record) {
  const { storage: _storage, updatedAt: _updatedAt, ...summary } = record;
  return summary;
}

function withCatalogRecord(catalog, manifest) {
  const nextRecord = toCatalogRecord(manifest);
  const submissions = catalog.submissions.filter((item) => item.submissionId !== nextRecord.submissionId);
  submissions.push(nextRecord);
  submissions.sort((left, right) => {
    const byDate = String(right.createdAt).localeCompare(String(left.createdAt));
    return byDate || String(right.submissionId).localeCompare(String(left.submissionId));
  });
  return {
    ...catalog,
    revision: Number(catalog.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    submissions
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

async function readAzureCatalog(facilityId) {
  const blob = getAzureContainer().getBlobClient(catalogObjectName(facilityId));
  try {
    const download = await blob.download();
    const catalog = JSON.parse((await streamToBuffer(download.readableStreamBody, MAX_CATALOG_BYTES)).toString("utf8"));
    return { catalog: normalizeCatalog(catalog, facilityId), etag: download.etag ?? null };
  } catch (error) {
    if (isMissingStorageObject(error)) return { catalog: null, etag: null };
    throw error;
  }
}

async function readLocalCatalog(facilityId) {
  const catalogPath = path.join(localRoot(), facilityId, "catalog.json");
  try {
    return {
      catalog: normalizeCatalog(JSON.parse(await readFile(catalogPath, "utf8")), facilityId),
      catalogPath
    };
  } catch (error) {
    if (isMissingStorageObject(error)) return { catalog: null, catalogPath };
    throw error;
  }
}

async function mutateAzureCatalog(facilityId, update) {
  const blob = getAzureContainer().getBlockBlobClient(catalogObjectName(facilityId));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await readAzureCatalog(facilityId);
    const next = update(structuredClone(current.catalog ?? emptyCatalog(facilityId)));
    try {
      await blob.uploadData(serializeCatalog(next), {
        blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
        conditions: current.etag ? { ifMatch: current.etag } : { ifNoneMatch: "*" }
      });
      return next;
    } catch (error) {
      if (isStorageConflict(error)) {
        const delay = Math.min(15 * (2 ** attempt), 250) + Math.floor(Math.random() * 30);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw createHttpError(503, "licensing_catalog_busy", "The licensing queue changed repeatedly. Try again.");
}

const localCatalogUpdates = new Map();

async function mutateLocalCatalog(facilityId, update) {
  const previous = localCatalogUpdates.get(facilityId) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    const current = await readLocalCatalog(facilityId);
    const next = update(structuredClone(current.catalog ?? emptyCatalog(facilityId)));
    await mkdir(path.dirname(current.catalogPath), { recursive: true });
    const temporaryPath = `${current.catalogPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, serializeCatalog(next), { flag: "wx" });
    await rename(temporaryPath, current.catalogPath);
    return next;
  });
  localCatalogUpdates.set(facilityId, pending);
  try {
    return await pending;
  } finally {
    if (localCatalogUpdates.get(facilityId) === pending) localCatalogUpdates.delete(facilityId);
  }
}

function mutateCatalog(facilityId, update) {
  return shouldUseAzure()
    ? mutateAzureCatalog(facilityId, update)
    : mutateLocalCatalog(facilityId, update);
}

function readCatalog(facilityId) {
  return shouldUseAzure()
    ? readAzureCatalog(facilityId).then((result) => result.catalog)
    : readLocalCatalog(facilityId).then((result) => result.catalog);
}

async function findLocalManifest(facilityId, submissionId) {
  const catalog = await readCatalog(facilityId);
  const indexed = catalog?.submissions.find((item) => item.submissionId === submissionId);
  if (indexed?.storage?.manifestObject) {
    const manifestPath = path.join(localRoot(), indexed.storage.manifestObject.replace(`${STORAGE_ROOT}/`, ""));
    try {
      return {
        manifest: JSON.parse(await readFile(manifestPath, "utf8")),
        location: { kind: "local", manifestPath }
      };
    } catch (error) {
      if (!isMissingStorageObject(error)) throw error;
    }
  }
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
  const catalog = await readCatalog(facilityId);
  const indexed = catalog?.submissions.find((item) => item.submissionId === submissionId);
  if (indexed?.storage?.manifestObject) {
    const directBlob = container.getBlobClient(indexed.storage.manifestObject);
    try {
      const download = await directBlob.download();
      return {
        manifest: JSON.parse((await streamToBuffer(download.readableStreamBody, 256 * 1024)).toString("utf8")),
        location: { kind: "azure", blobName: indexed.storage.manifestObject, etag: download.etag }
      };
    } catch (error) {
      if (!isMissingStorageObject(error)) throw error;
    }
  }
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
    results.push(JSON.parse((await streamToBuffer(download.readableStreamBody, 512 * 1024)).toString("utf8")));
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
  const paths = storagePaths(facilityId, submissionId, contentType);
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
    filedAt: null,
    storage: {
      sourceObject: paths.source,
      manifestObject: paths.manifest
    }
  };
  if (shouldUseAzure()) await writeAzureSubmission(paths, bytes, manifest);
  else await writeLocalSubmission(paths, bytes, manifest);
  await mutateCatalog(facilityId, (catalog) => withCatalogRecord(catalog, manifest));
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
  await mutateCatalog(facilityId, (catalog) => withCatalogRecord(catalog, manifest));
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

function summarizeCatalogRecords(records) {
  return {
    total: records.length,
    ocrRequired: records.filter((item) => item.status === "ocr_required").length,
    needsReview: records.filter((item) => item.status === "needs_review").length,
    readyToFile: records.filter((item) => item.status === "ready_to_file").length,
    filed: records.filter((item) => item.status === "filed").length,
    failed: records.filter((item) => item.status === "failed").length
  };
}

async function ensureCatalog(facilityId) {
  const existing = await readCatalog(facilityId);
  if (existing) return existing;
  const manifests = shouldUseAzure()
    ? await listAzureManifests(facilityId)
    : await listLocalManifests(facilityId);
  return mutateCatalog(facilityId, (catalog) => manifests
    .filter((manifest) => manifest?.facilityId === facilityId)
    .reduce((next, manifest) => withCatalogRecord(next, manifest), catalog));
}

function parsePageLimit(value) {
  if (value == null || value === "") return DEFAULT_PAGE_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    throw createHttpError(400, "licensing_page_limit_invalid", `Choose a page size from 1 to ${MAX_PAGE_LIMIT}.`);
  }
  return limit;
}

function encodePageCursor(record) {
  return Buffer.from(JSON.stringify([record.createdAt, record.submissionId]), "utf8").toString("base64url");
}

function decodePageCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2 || parsed.some((item) => typeof item !== "string" || !item)) throw new Error("invalid");
    return { createdAt: parsed[0], submissionId: parsed[1] };
  } catch {
    throw createHttpError(400, "licensing_page_cursor_invalid", "The licensing queue cursor is invalid.");
  }
}

/**
 * @param {{
 *   facilityId: string;
 *   limit?: string | number | null;
 *   cursor?: string | null;
 *   status?: string | null;
 *   query?: string | null;
 * }} options
 */
export async function queryExecutiveDirectorIntakeSubmissions({
  facilityId,
  limit = DEFAULT_PAGE_LIMIT,
  cursor = null,
  status = null,
  query = null
}) {
  const catalog = await ensureCatalog(facilityId);
  const pageLimit = parsePageLimit(limit);
  const pageCursor = decodePageCursor(cursor);
  const normalizedStatus = String(status ?? "").trim().toLowerCase();
  const normalizedQuery = String(query ?? "").trim().toLowerCase().slice(0, 120);
  const allowedStatuses = new Set(["awaiting_form_definition", "ocr_required", "needs_review", "ready_to_file", "filed", "failed"]);
  if (normalizedStatus && !allowedStatuses.has(normalizedStatus)) {
    throw createHttpError(400, "licensing_status_invalid", "Choose a valid licensing queue status.");
  }
  const filtered = catalog.submissions.filter((record) => (
    (!normalizedStatus || record.status === normalizedStatus)
    && (!normalizedQuery || String(record.originalFileName).toLowerCase().includes(normalizedQuery))
  ));
  let startIndex = 0;
  if (pageCursor) {
    const cursorIndex = filtered.findIndex((record) => (
      record.createdAt === pageCursor.createdAt && record.submissionId === pageCursor.submissionId
    ));
    if (cursorIndex < 0) {
      throw createHttpError(400, "licensing_page_cursor_stale", "The licensing queue changed. Refresh the list.");
    }
    startIndex = cursorIndex + 1;
  }
  const page = filtered.slice(startIndex, startIndex + pageLimit);
  const hasMore = startIndex + page.length < filtered.length;
  return {
    version: CATALOG_VERSION,
    facilityId,
    catalogRevision: catalog.revision,
    updatedAt: catalog.updatedAt,
    summary: summarizeCatalogRecords(catalog.submissions),
    filteredTotal: filtered.length,
    submissions: page.map(catalogRecordForResponse),
    nextCursor: hasMore && page.length ? encodePageCursor(page.at(-1)) : null
  };
}

export async function getExecutiveDirectorIntakeOverview(facilityId) {
  return queryExecutiveDirectorIntakeSubmissions({ facilityId, limit: DEFAULT_PAGE_LIMIT });
}

export async function listExecutiveDirectorIntakeSubmissions(facilityId) {
  return (await getExecutiveDirectorIntakeOverview(facilityId)).submissions;
}

async function resolveSourceObject(stored) {
  if (stored.manifest.storage?.sourceObject) return stored.manifest.storage.sourceObject;
  if (stored.location.kind === "azure") {
    const prefix = stored.location.blobName.slice(0, -("manifest.json".length));
    for await (const blob of getAzureContainer().listBlobsFlat({ prefix })) {
      if (/\/source\.(pdf|jpg|png)$/i.test(blob.name)) return blob.name;
    }
    return null;
  }
  const directory = path.dirname(stored.location.manifestPath);
  const entries = await readdir(directory, { withFileTypes: true });
  const source = entries.find((entry) => entry.isFile() && /^source\.(pdf|jpg|png)$/i.test(entry.name));
  return source ? path.join(directory, source.name) : null;
}

export async function getExecutiveDirectorIntakeSource(facilityId, submissionId) {
  const stored = await findStoredManifest(facilityId, submissionId);
  const sourceObject = await resolveSourceObject(stored);
  if (!sourceObject) {
    throw createHttpError(404, "licensing_source_not_found", "The original licensing report was not found.");
  }
  let bytes;
  if (stored.location.kind === "azure") {
    const download = await getAzureContainer().getBlobClient(sourceObject).download();
    bytes = await streamToBuffer(download.readableStreamBody, EXECUTIVE_DIRECTOR_INTAKE_MAX_BYTES);
  } else {
    const sourcePath = sourceObject.startsWith(`${STORAGE_ROOT}/`)
      ? path.join(localRoot(), sourceObject.replace(`${STORAGE_ROOT}/`, ""))
      : sourceObject;
    bytes = await readFile(sourcePath);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== stored.manifest.sha256) {
    throw createHttpError(500, "licensing_source_integrity_failed", "The original licensing report did not pass its integrity check.");
  }
  return {
    bytes,
    contentType: stored.manifest.contentType,
    originalFileName: stored.manifest.originalFileName,
    byteLength: stored.manifest.byteLength,
    sha256
  };
}
