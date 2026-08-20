import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClientSecretCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import {
  getBoundedIntegerEnv,
  isProductionLikeRuntime
} from "./runtime-environment.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const snapshotDir = path.resolve(__dirname, "../generated/platform-snapshot");
const snapshotPath = path.join(snapshotDir, "latest.json");
const DEFAULT_SNAPSHOT_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_SNAPSHOT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_CLIENT_DATABASE_MAX_BYTES = 16 * 1024 * 1024;
const DEFAULT_CLIENT_DOCUMENT_MAX_BYTES = 32 * 1024 * 1024;
const DEFAULT_CLIENT_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

/**
 * @typedef {object} PlatformSnapshotCache
 * @property {string | null} key
 * @property {any | null} value
 * @property {number} expiresAt
 * @property {Promise<any | null> | null} promise
 */

/** @type {PlatformSnapshotCache} */
let platformSnapshotCache = {
  key: null,
  value: null,
  expiresAt: 0,
  promise: null
};

/** @type {{ key: string | null, value: any | null, promise: Promise<any | null> | null }} */
let platformClientDatabaseCache = {
  key: null,
  value: null,
  promise: null
};

function getSnapshotCacheTtlMs() {
  return getBoundedIntegerEnv(
    "PLATFORM_SNAPSHOT_CACHE_TTL_MS",
    DEFAULT_SNAPSHOT_CACHE_TTL_MS,
    1_000,
    60 * 60_000
  );
}

function requiresAzureSnapshot() {
  return isProductionLikeRuntime() || process.env.PLATFORM_SNAPSHOT_READ_SOURCE?.trim().toLowerCase() === "azure";
}

function isAzureSnapshotDeclared() {
  return Boolean(process.env.AZURE_STORAGE_CONTAINER?.trim());
}

export function getPlatformSnapshotMaxBytes() {
  return getBoundedIntegerEnv(
    "PLATFORM_SNAPSHOT_MAX_BYTES",
    DEFAULT_SNAPSHOT_MAX_BYTES,
    1024 * 1024,
    128 * 1024 * 1024
  );
}

export function getPlatformClientDatabaseMaxBytes() {
  return getBoundedIntegerEnv(
    "PLATFORM_CLIENT_DATABASE_MAX_BYTES",
    DEFAULT_CLIENT_DATABASE_MAX_BYTES,
    1024 * 1024,
    64 * 1024 * 1024
  );
}

function assertSnapshotSize(sizeBytes, source) {
  const maxBytes = getPlatformSnapshotMaxBytes();
  if (Number.isFinite(sizeBytes) && sizeBytes > maxBytes) {
    throw new Error(`Platform snapshot from ${source} exceeds the configured ${maxBytes}-byte limit.`);
  }
}

function assertClientDatabaseSize(sizeBytes, source) {
  const maxBytes = getPlatformClientDatabaseMaxBytes();
  if (Number.isFinite(sizeBytes) && sizeBytes > maxBytes) {
    throw new Error(`Platform client database from ${source} exceeds the configured ${maxBytes}-byte limit.`);
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertObjectRows(value, pathLabel, source) {
  if (!Array.isArray(value) || !value.every(isObject)) {
    throw new Error(`Platform snapshot from ${source} has an invalid ${pathLabel} row set.`);
  }
}

function assertOptionalIsoCalendarDate(value, pathLabel, source) {
  if (value === undefined) return;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Platform snapshot from ${source} has an invalid ${pathLabel}.`);
  }
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error(`Platform snapshot from ${source} has an invalid ${pathLabel}.`);
  }
}

function assertClientDatabasePath(value, source) {
  const clientDatabasePath = typeof value === "string" ? value.trim() : "";
  if (
    !clientDatabasePath ||
    clientDatabasePath.startsWith("/") ||
    clientDatabasePath.includes("\\") ||
    clientDatabasePath.split("/").includes("..") ||
    !/^snapshots\/[a-z0-9][a-z0-9/_-]*\.json$/i.test(clientDatabasePath)
  ) {
    throw new Error(`Platform snapshot from ${source} has an invalid clientDatabase.path.`);
  }
  return clientDatabasePath;
}

function assertClientDocumentAssetPath(value, kind, source) {
  if (value === null || value === undefined || value === "") return null;
  const assetPath = typeof value === "string" ? value.trim() : "";
  const extension = kind === "thumbnail" ? "(?:png|jpe?g|webp)" : "(?:pdf|png|jpe?g|webp)";
  const pattern = new RegExp(`^snapshots/client-documents/${kind === "thumbnail" ? "thumbnails" : "files"}/[a-z0-9][a-z0-9/_-]*\\.${extension}$`, "i");
  if (
    !assetPath ||
    assetPath.startsWith("/") ||
    assetPath.includes("\\") ||
    assetPath.split("/").includes("..") ||
    !pattern.test(assetPath)
  ) {
    throw new Error(`Platform client database from ${source} has an invalid ${kind} asset path.`);
  }
  return assetPath;
}

function assertClientDatabasePointer(value, source) {
  if (!isObject(value)) {
    throw new Error(`Platform snapshot from ${source} has an invalid clientDatabase pointer.`);
  }
  const clientDatabasePath = assertClientDatabasePath(value.path, source);
  if (value.primary_key !== "canonical_client_id") {
    throw new Error(`Platform snapshot from ${source} must use canonical_client_id as the client database primary key.`);
  }
  if (!Number.isInteger(value.client_count) || value.client_count < 1) {
    throw new Error(`Platform snapshot from ${source} has an invalid clientDatabase.client_count.`);
  }
  assertOptionalIsoCalendarDate(value.baseline_date, "clientDatabase.baseline_date", source);
  return {
    ...value,
    path: clientDatabasePath
  };
}

/**
 * @param {any} payload
 * @param {string} [source]
 * @param {any | null} [pointer]
 */
export function assertPlatformClientDatabasePayload(payload, source = "unknown source", pointer = null) {
  if (!isObject(payload)) {
    throw new Error(`Platform client database from ${source} is not a JSON object.`);
  }
  if (payload.primary_key !== "canonical_client_id") {
    throw new Error(`Platform client database from ${source} must use canonical_client_id as its primary key.`);
  }
  if (!Array.isArray(payload.columns)) {
    throw new Error(`Platform client database from ${source} has an invalid columns list.`);
  }
  const columnNames = payload.columns.map((column) => {
    if (typeof column === "string") return column.trim();
    if (isObject(column) && typeof column.name === "string" && typeof column.type === "string") {
      return column.name.trim();
    }
    return "";
  });
  if (columnNames.some((column) => !column)) {
    throw new Error(`Platform client database from ${source} has an invalid column descriptor.`);
  }
  if (new Set(columnNames).size !== columnNames.length || !columnNames.includes("canonical_client_id")) {
    throw new Error(`Platform client database from ${source} has duplicate columns or no canonical_client_id column.`);
  }
  if (!Number.isInteger(payload.column_count) || payload.column_count !== payload.columns.length) {
    throw new Error(`Platform client database from ${source} has a column-count mismatch.`);
  }
  assertObjectRows(payload.clients, "clients", source);
  if (!Number.isInteger(payload.client_count) || payload.client_count !== payload.clients.length) {
    throw new Error(`Platform client database from ${source} has a client-count mismatch.`);
  }
  assertOptionalIsoCalendarDate(payload.baseline_date, "baseline_date", source);
  if (typeof payload.generated_at !== "string" || !Number.isFinite(Date.parse(payload.generated_at))) {
    throw new Error(`Platform client database from ${source} has no valid generated timestamp.`);
  }

  const canonicalIds = payload.clients.map((client) => String(client.canonical_client_id ?? "").trim());
  if (canonicalIds.some((canonicalId) => !canonicalId) || new Set(canonicalIds).size !== canonicalIds.length) {
    throw new Error(`Platform client database from ${source} has missing or duplicate canonical client identifiers.`);
  }
  if (payload.clients.some((client) => columnNames.some((column) => !Object.hasOwn(client, column)))) {
    throw new Error(`Platform client database from ${source} has a client row missing a published column.`);
  }
  const documents = payload.documents ?? [];
  if (!Array.isArray(documents) || !documents.every(isObject)) {
    throw new Error(`Platform client database from ${source} has an invalid documents list.`);
  }
  if (
    (payload.documents !== undefined || payload.document_count !== undefined) &&
    (!Number.isInteger(payload.document_count) || payload.document_count !== documents.length)
  ) {
    throw new Error(`Platform client database from ${source} has a document-count mismatch.`);
  }
  const canonicalIdSet = new Set(canonicalIds);
  const documentKeys = new Set();
  for (const document of documents) {
    const canonicalId = String(document.canonical_client_id ?? "").trim();
    const documentId = String(document.document_id ?? "").trim();
    const displayName = String(document.display_name ?? "").trim();
    const contentType = String(document.content_type ?? "").trim().toLowerCase();
    const documentKey = `${canonicalId}:${documentId}`;
    if (
      !canonicalIdSet.has(canonicalId) ||
      !documentId || documentId.length > 256 ||
      !displayName || displayName.length > 500 ||
      !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(contentType) ||
      documentKeys.has(documentKey)
    ) {
      throw new Error(`Platform client database from ${source} has invalid client document metadata.`);
    }
    if (document.page_count !== null && (!Number.isInteger(document.page_count) || document.page_count < 1 || document.page_count > 10_000)) {
      throw new Error(`Platform client database from ${source} has an invalid client document page count.`);
    }
    if (document.linked_at !== null && document.linked_at !== undefined && !Number.isFinite(Date.parse(String(document.linked_at)))) {
      throw new Error(`Platform client database from ${source} has an invalid client document timestamp.`);
    }
    if (document.link_source !== null && document.link_source !== undefined && (typeof document.link_source !== "string" || document.link_source.length > 128)) {
      throw new Error(`Platform client database from ${source} has an invalid client document link source.`);
    }
    assertClientDocumentAssetPath(document.thumbnail_path, "thumbnail", source);
    assertClientDocumentAssetPath(document.preview_path, "preview", source);
    documentKeys.add(documentKey);
  }
  if (pointer && pointer.client_count !== payload.client_count) {
    throw new Error(`Platform client database from ${source} does not match the published pointer client count.`);
  }
  if (pointer?.baseline_date && payload.baseline_date !== pointer.baseline_date) {
    throw new Error(`Platform client database from ${source} does not match the published pointer baseline date.`);
  }
  if (pointer?.dataset && payload.dataset !== pointer.dataset) {
    throw new Error(`Platform client database from ${source} does not match the published pointer dataset.`);
  }
  if (pointer?.version != null && payload.version !== pointer.version) {
    throw new Error(`Platform client database from ${source} does not match the published pointer version.`);
  }
  return payload;
}

export function assertPlatformSnapshotPayload(payload, source = "unknown source", options = {}) {
  if (!isObject(payload)) {
    throw new Error(`Platform snapshot from ${source} is not a JSON object.`);
  }
  const generatedAt = payload.snapshot?.generated_at ?? payload.generated_at;
  if (typeof generatedAt !== "string" || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error(`Platform snapshot from ${source} has no valid generated timestamp.`);
  }
  if (!isObject(payload.snapshot) || !isObject(payload.health) || !isObject(payload.communities) || !isObject(payload.incidents) || !isObject(payload.reportsSummary)) {
    throw new Error(`Platform snapshot from ${source} is missing a required top-level section.`);
  }
  assertOptionalIsoCalendarDate(payload.snapshot.as_of_date, "snapshot.as_of_date", source);
  assertOptionalIsoCalendarDate(payload.communities.as_of_date, "communities.as_of_date", source);
  if (
    payload.snapshot.as_of_date !== undefined &&
    payload.communities.as_of_date !== undefined &&
    payload.snapshot.as_of_date !== payload.communities.as_of_date
  ) {
    throw new Error(`Platform snapshot from ${source} has conflicting data as-of dates.`);
  }
  if (
    options.requireAsOfDate === true &&
    (!payload.snapshot.as_of_date || !payload.communities.as_of_date)
  ) {
    throw new Error(`Platform snapshot from ${source} must include matching governed data as-of dates.`);
  }

  for (const [key, rows] of [
    ["communities.facilities", payload.communities.facilities],
    ["communities.residents", payload.communities.residents],
    ["communities.incidents", payload.communities.incidents],
    ["communities.census", payload.communities.census],
    ["incidents.incidents", payload.incidents.incidents]
  ]) {
    assertObjectRows(rows, key, source);
  }
  if (payload.communities.incidentDetails !== undefined) {
    assertObjectRows(payload.communities.incidentDetails, "communities.incidentDetails", source);
  }
  if (payload.homeDashboard !== undefined && !isObject(payload.homeDashboard)) {
    throw new Error(`Platform snapshot from ${source} has an invalid homeDashboard section.`);
  }
  if (payload.communitySnapshots !== undefined && !isObject(payload.communitySnapshots)) {
    throw new Error(`Platform snapshot from ${source} has an invalid communitySnapshots section.`);
  }
  if (payload.clientDatabase !== undefined) {
    assertClientDatabasePointer(payload.clientDatabase, source);
  }

  const facilityIds = payload.communities.facilities.map((facility) => String(facility.facility_id ?? "").trim());
  if (facilityIds.some((facilityId) => !facilityId) || new Set(facilityIds).size !== facilityIds.length) {
    throw new Error(`Platform snapshot from ${source} has missing or duplicate facility identifiers.`);
  }
  return payload;
}

function shouldPreferLocalSnapshot() {
  const preference = process.env.PLATFORM_SNAPSHOT_READ_SOURCE?.trim().toLowerCase();
  if (preference === "local") return true;
  if (preference === "azure") return false;
  return !isProductionLikeRuntime();
}

function normalizeSnapshotRoot() {
  const root = (process.env.SNAPSHOT_ROOT || "snapshots/daily").trim().replace(/^\/+|\/+$/g, "");
  return root || "snapshots/daily";
}

function getSnapshotDateKey(payload) {
  return payload.snapshot.as_of_date;
}

function getAzureSnapshotConfig() {
  const account = process.env.AZURE_STORAGE_ACCOUNT?.trim();
  const container = process.env.AZURE_STORAGE_CONTAINER?.trim();
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();

  if (!container) {
    return null;
  }

  if (connectionString) {
    return {
      authMode: "connection-string",
      connectionString,
      container,
      root: normalizeSnapshotRoot()
    };
  }

  const tenantId = process.env.ENTRA_TENANT_ID?.trim();
  const clientId = process.env.ENTRA_CLIENT_ID?.trim();
  const clientSecret = process.env.ENTRA_CLIENT_SECRET?.trim();

  if (!account || !tenantId || !clientId || !clientSecret) {
    return null;
  }

  return {
    authMode: "entra-client-secret",
    account,
    tenantId,
    clientId,
    clientSecret,
    container,
    root: normalizeSnapshotRoot()
  };
}

export function getAzureSnapshotStorageSummary() {
  const config = getAzureSnapshotConfig();
  if (!config) return null;
  const root = normalizeSnapshotRoot();

  return {
    authMode: config.authMode,
    account: config.account ?? null,
    container: config.container,
    root,
    latestPath: `${root}/latest.json`,
    datedPathPattern: `${root}/YYYY-MM-DD.json`
  };
}

function createBlobServiceClient(config) {
  if (config.authMode === "connection-string") {
    return BlobServiceClient.fromConnectionString(config.connectionString);
  }

  const credential = new ClientSecretCredential(
    config.tenantId,
    config.clientId,
    config.clientSecret
  );

  return new BlobServiceClient(`https://${config.account}.blob.core.windows.net`, credential);
}

function getAzureBlobNames(payload) {
  const root = normalizeSnapshotRoot();
  const dateKey = getSnapshotDateKey(payload);

  return {
    latest: `${root}/latest.json`,
    dated: `${root}/${dateKey}.json`
  };
}

async function readLocalSnapshot() {
  try {
    const file = await stat(snapshotPath);
    assertSnapshotSize(file.size, "local storage");
    const raw = await readFile(snapshotPath, "utf8");
    return assertPlatformSnapshotPayload(JSON.parse(raw), "local storage");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function writeLocalSnapshot(payload) {
  await mkdir(snapshotDir, { recursive: true });
  const serialized = JSON.stringify(payload, null, 2);
  assertSnapshotSize(Buffer.byteLength(serialized, "utf8"), "local publish payload");
  await writeFile(snapshotPath, serialized);
  return snapshotPath;
}

async function readAzureSnapshot() {
  const config = getAzureSnapshotConfig();
  if (!config) return null;

  const service = createBlobServiceClient(config);
  const containerClient = service.getContainerClient(config.container);
  const blobClient = containerClient.getBlobClient(`${config.root}/latest.json`);

  if (!(await blobClient.exists())) {
    return null;
  }

  const download = await blobClient.download();
  assertSnapshotSize(download.contentLength, "Azure storage");
  const raw = await streamToString(download.readableStreamBody);
  assertSnapshotSize(Buffer.byteLength(raw, "utf8"), "Azure storage");
  return assertPlatformSnapshotPayload(JSON.parse(raw), "Azure storage");
}

function getLocalClientDatabasePath(clientDatabasePath) {
  return path.resolve(__dirname, "../generated", clientDatabasePath.replace(/^snapshots\//, ""));
}

async function readLocalClientDatabase(pointer) {
  const localPath = getLocalClientDatabasePath(pointer.path);
  try {
    const file = await stat(localPath);
    assertClientDatabaseSize(file.size, "local storage");
    const raw = await readFile(localPath, "utf8");
    assertClientDatabaseSize(Buffer.byteLength(raw, "utf8"), "local storage");
    return assertPlatformClientDatabasePayload(JSON.parse(raw), "local storage", pointer);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readAzureClientDatabase(pointer) {
  const config = getAzureSnapshotConfig();
  if (!config) return null;

  const service = createBlobServiceClient(config);
  const containerClient = service.getContainerClient(config.container);
  const blobClient = containerClient.getBlobClient(pointer.path);
  if (!(await blobClient.exists())) return null;

  const download = await blobClient.download();
  assertClientDatabaseSize(download.contentLength, "Azure storage");
  const raw = await streamToString(download.readableStreamBody);
  assertClientDatabaseSize(Buffer.byteLength(raw, "utf8"), "Azure storage");
  return assertPlatformClientDatabasePayload(JSON.parse(raw), "Azure storage", pointer);
}

async function writeAzureSnapshot(payload) {
  const config = getAzureSnapshotConfig();
  if (!config) return null;

  const service = createBlobServiceClient(config);
  const containerClient = service.getContainerClient(config.container);
  const { latest, dated } = getAzureBlobNames(payload);
  const serialized = JSON.stringify(payload, null, 2);
  assertSnapshotSize(Buffer.byteLength(serialized, "utf8"), "Azure publish payload");

  await containerClient.createIfNotExists();

  await Promise.all(
    [latest, dated].map(async (blobName) => {
      const blockBlob = containerClient.getBlockBlobClient(blobName);
      await blockBlob.upload(serialized, Buffer.byteLength(serialized), {
        blobHTTPHeaders: {
          blobContentType: "application/json; charset=utf-8"
        }
      });
    })
  );

  return {
    latest,
    dated
  };
}

async function streamToString(readableStream) {
  if (!readableStream) return "";

  const chunks = [];
  for await (const chunk of readableStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function getPlatformSnapshotTargets(payload) {
  return {
    local: snapshotPath,
    azure: getAzureSnapshotConfig() ? getAzureBlobNames(payload) : null
  };
}

export async function readPlatformSnapshot() {
  const azureConfigured = Boolean(getAzureSnapshotConfig());
  if (requiresAzureSnapshot() && isAzureSnapshotDeclared() && !azureConfigured) {
    throw new Error("Azure snapshot storage is declared but its server credentials are incomplete.");
  }
  if (requiresAzureSnapshot() && !azureConfigured) {
    throw new Error("Azure snapshot storage is required in this runtime but is not configured.");
  }
  const preferLocal = shouldPreferLocalSnapshot();
  const cacheKey = azureConfigured && !preferLocal ? "azure:platform-snapshot:latest" : "local:platform-snapshot:latest";
  const now = Date.now();

  if (platformSnapshotCache.key === cacheKey && platformSnapshotCache.value && platformSnapshotCache.expiresAt > now) {
    return platformSnapshotCache.value;
  }

  if (platformSnapshotCache.key === cacheKey && platformSnapshotCache.promise) {
    return platformSnapshotCache.promise;
  }

  const promise = (async () => {
    if (preferLocal) {
      const localSnapshot = await readLocalSnapshot();
      if (localSnapshot) return localSnapshot;
    }

    if (azureConfigured) {
      try {
        const azureSnapshot = await readAzureSnapshot();
        if (azureSnapshot) return azureSnapshot;
      } catch (error) {
        if (requiresAzureSnapshot()) throw error;
        console.warn("Azure snapshot read failed; local development fallback remains available.", error);
      }
      if (requiresAzureSnapshot()) return null;
    }

    return readLocalSnapshot();
  })()
    .then((value) => {
      platformSnapshotCache = {
        key: cacheKey,
        value,
        expiresAt: Date.now() + getSnapshotCacheTtlMs(),
        promise: null
      };
      return value;
    })
    .catch((error) => {
      platformSnapshotCache = {
        key: null,
        value: null,
        expiresAt: 0,
        promise: null
      };
      throw error;
    });

  platformSnapshotCache = {
    key: cacheKey,
    value: null,
    expiresAt: 0,
    promise
  };

  return promise;
}

export async function readPlatformClientDatabase(snapshot) {
  if (!snapshot?.clientDatabase) return null;
  const pointer = assertClientDatabasePointer(snapshot.clientDatabase, "loaded platform snapshot");
  const preferLocal = shouldPreferLocalSnapshot();
  const sourceKey = preferLocal ? "local-first" : "azure";
  const cacheKey = [
    sourceKey,
    pointer.path,
    pointer.version ?? "",
    pointer.baseline_date ?? "",
    pointer.client_count
  ].join(":");

  if (platformClientDatabaseCache.key === cacheKey && platformClientDatabaseCache.value) {
    return platformClientDatabaseCache.value;
  }
  if (platformClientDatabaseCache.key === cacheKey && platformClientDatabaseCache.promise) {
    return platformClientDatabaseCache.promise;
  }

  const promise = (async () => {
    if (preferLocal) {
      const localDatabase = await readLocalClientDatabase(pointer);
      if (localDatabase) return localDatabase;
    }
    const azureDatabase = await readAzureClientDatabase(pointer);
    if (azureDatabase) return azureDatabase;
    if (!preferLocal) {
      const localDatabase = await readLocalClientDatabase(pointer);
      if (localDatabase) return localDatabase;
    }
    throw new Error(`Published platform client database ${pointer.path} is unavailable.`);
  })()
    .then((value) => {
      platformClientDatabaseCache = { key: cacheKey, value, promise: null };
      return value;
    })
    .catch((error) => {
      platformClientDatabaseCache = { key: null, value: null, promise: null };
      throw error;
    });

  platformClientDatabaseCache = { key: cacheKey, value: null, promise };
  return promise;
}

export async function readPlatformClientDocumentAsset(clientDatabase, canonicalClientId, documentId, variant) {
  if (!clientDatabase || !["thumbnail", "preview"].includes(variant)) return null;
  const document = (clientDatabase.documents ?? []).find((entry) =>
    String(entry.canonical_client_id) === canonicalClientId && String(entry.document_id) === documentId
  );
  if (!document) return null;
  const assetPath = assertClientDocumentAssetPath(
    variant === "thumbnail" ? document.thumbnail_path : document.preview_path,
    variant,
    "loaded platform client database"
  );
  if (!assetPath) return null;
  const maximumBytes = variant === "thumbnail"
    ? getBoundedIntegerEnv(
        "PLATFORM_CLIENT_THUMBNAIL_MAX_BYTES",
        DEFAULT_CLIENT_THUMBNAIL_MAX_BYTES,
        64 * 1024,
        4 * 1024 * 1024
      )
    : getBoundedIntegerEnv(
        "PLATFORM_CLIENT_DOCUMENT_MAX_BYTES",
        DEFAULT_CLIENT_DOCUMENT_MAX_BYTES,
        1024 * 1024,
        64 * 1024 * 1024
      );

  const preferLocal = shouldPreferLocalSnapshot();
  if (preferLocal) {
    const local = await readLocalClientDocumentAsset(assetPath, maximumBytes);
    if (local) return { ...local, document };
  }
  const azure = await readAzureClientDocumentAsset(assetPath, maximumBytes);
  if (azure) return { ...azure, document };
  if (!preferLocal) {
    const local = await readLocalClientDocumentAsset(assetPath, maximumBytes);
    if (local) return { ...local, document };
  }
  return null;
}

async function readLocalClientDocumentAsset(assetPath, maximumBytes) {
  const localPath = path.resolve(__dirname, "../generated", assetPath.replace(/^snapshots\//, ""));
  try {
    const file = await stat(localPath);
    if (file.size < 1) throw new Error("Platform client document asset is empty.");
    if (file.size > maximumBytes) throw new Error("Platform client document asset exceeds its configured size limit.");
    const body = await readFile(localPath);
    return { body, contentType: contentTypeForAssetPath(assetPath) };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function readAzureClientDocumentAsset(assetPath, maximumBytes) {
  const config = getAzureSnapshotConfig();
  if (!config) return null;
  const service = createBlobServiceClient(config);
  const blobClient = service.getContainerClient(config.container).getBlobClient(assetPath);
  if (!(await blobClient.exists())) return null;
  const download = await blobClient.download();
  if (Number(download.contentLength ?? 0) < 1) {
    throw new Error("Platform client document asset is empty.");
  }
  if (Number(download.contentLength ?? 0) > maximumBytes) {
    throw new Error("Platform client document asset exceeds its configured size limit.");
  }
  const body = await streamToBuffer(download.readableStreamBody, maximumBytes);
  return {
    body,
    contentType: contentTypeForAssetPath(assetPath)
  };
}

async function streamToBuffer(readableStream, maximumBytes) {
  if (!readableStream) return Buffer.alloc(0);
  const chunks = [];
  let received = 0;
  for await (const chunk of readableStream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.byteLength;
    if (received > maximumBytes) throw new Error("Platform client document asset exceeds its configured size limit.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function contentTypeForAssetPath(assetPath) {
  const extension = path.extname(assetPath).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

export async function writePlatformSnapshot(payload, options = {}) {
  const publishAzure = options.publishAzure ?? true;
  const validatedPayload = assertPlatformSnapshotPayload(payload, "publish payload", { requireAsOfDate: true });
  const local = await writeLocalSnapshot(validatedPayload);
  const azure = publishAzure ? await writeAzureSnapshot(validatedPayload) : null;
  const expiresAt = Date.now() + getSnapshotCacheTtlMs();

  platformSnapshotCache = {
    key: shouldPreferLocalSnapshot() ? "local:platform-snapshot:latest" : "azure:platform-snapshot:latest",
    value: validatedPayload,
    expiresAt,
    promise: null
  };

  return {
    local,
    azure
  };
}
