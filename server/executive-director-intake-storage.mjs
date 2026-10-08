import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BlobServiceClient } from "@azure/storage-blob";
import { ManagedIdentityCredential } from "@azure/identity";
import { createHttpError } from "./http-errors.mjs";
import { isProductionLikeRuntime } from "./runtime-environment.mjs";
import { extractLic624Report, summarizeLic624Extraction } from "./lic624-extraction.mjs";

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
    reviewedAt: null,
    filedAt: null
  };
  const paths = storagePaths(facilityId, submissionId, contentType);
  if (shouldUseAzure()) await writeAzureSubmission(paths, bytes, manifest);
  else await writeLocalSubmission(paths, bytes, manifest);
  return manifest;
}

export function toExecutiveDirectorSubmissionSummary(manifest) {
  return {
    submissionId: manifest.submissionId,
    facilityId: manifest.facilityId,
    originalFileName: manifest.originalFileName,
    contentType: manifest.contentType,
    byteLength: manifest.byteLength,
    sha256: manifest.sha256,
    createdAt: manifest.createdAt,
    status: manifest.status,
    extractionSummary: manifest.extraction ? summarizeLic624Extraction(manifest.extraction) : null,
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
