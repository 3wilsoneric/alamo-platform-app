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

function assertSnapshotSize(sizeBytes, source) {
  const maxBytes = getPlatformSnapshotMaxBytes();
  if (Number.isFinite(sizeBytes) && sizeBytes > maxBytes) {
    throw new Error(`Platform snapshot from ${source} exceeds the configured ${maxBytes}-byte limit.`);
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
