import { gzipSync, gunzipSync } from "node:zlib";
import { ClientSecretCredential, ManagedIdentityCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { isProductionLikeRuntime } from "./runtime-environment.mjs";

const DEFAULT_ROOT = "acquisition-intelligence";
const RESEARCH_STORE_PATH = "research/store-v1.json.gz";
const MAX_RESEARCH_STORE_BYTES = 20_000_000;
const OPERATOR_SELECTION_STORE_PATH = "research/operator-selections-v1.json.gz";
const MAX_OPERATOR_SELECTION_STORE_BYTES = 10_000_000;
const OPERATOR_SELECTION_REVISION_ROOT = "research/operator-selection-revisions";

function normalizedRoot() {
  const value = String(process.env.ACQUISITION_STORAGE_ROOT || DEFAULT_ROOT).trim().replace(/^\/+|\/+$/g, "");
  return value || DEFAULT_ROOT;
}

function safeRelativePath(value) {
  const normalized = String(value ?? "").trim().replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.includes("\\")) {
    throw new Error("Acquisition blob path is invalid.");
  }
  return normalized;
}

export function shouldUseAzureAcquisitionStorage() {
  const preference = String(process.env.ACQUISITION_STORAGE_READ_SOURCE ?? "").trim().toLowerCase();
  if (preference === "local") return false;
  if (preference === "azure") return true;
  return isProductionLikeRuntime();
}

export function getAcquisitionAzureConfig() {
  const container = (
    process.env.ACQUISITION_STORAGE_CONTAINER || process.env.AZURE_STORAGE_CONTAINER
  )?.trim();
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  const requestedAuthMode = process.env.AZURE_STORAGE_AUTH_MODE?.trim().toLowerCase();
  if (!container) return null;
  if (connectionString) {
    return {
      authMode: "connection-string",
      connectionString,
      container,
      root: normalizedRoot()
    };
  }
  if (requestedAuthMode === "managed-identity") {
    const account = process.env.AZURE_STORAGE_ACCOUNT?.trim();
    const managedIdentityClientId = process.env.AZURE_CLIENT_ID?.trim();
    if (!account || !managedIdentityClientId) return null;
    return {
      authMode: "managed-identity",
      account,
      managedIdentityClientId,
      container,
      root: normalizedRoot()
    };
  }
  const account = process.env.AZURE_STORAGE_ACCOUNT?.trim();
  const tenantId = process.env.ENTRA_TENANT_ID?.trim();
  const clientId = process.env.ENTRA_CLIENT_ID?.trim();
  const clientSecret = process.env.ENTRA_CLIENT_SECRET?.trim();
  if (!account || !tenantId || !clientId || !clientSecret) return null;
  return {
    authMode: "entra-client-secret",
    account,
    tenantId,
    clientId,
    clientSecret,
    container,
    root: normalizedRoot()
  };
}

function requireConfig() {
  const config = getAcquisitionAzureConfig();
  if (!config) {
    throw new Error("Azure acquisition storage is required but its container or server credentials are incomplete.");
  }
  return config;
}

function createService(config) {
  if (config.authMode === "connection-string") {
    return BlobServiceClient.fromConnectionString(config.connectionString);
  }
  if (config.authMode === "managed-identity") {
    return new BlobServiceClient(
      `https://${config.account}.blob.core.windows.net`,
      new ManagedIdentityCredential(config.managedIdentityClientId)
    );
  }
  const credential = new ClientSecretCredential(config.tenantId, config.clientId, config.clientSecret);
  return new BlobServiceClient(`https://${config.account}.blob.core.windows.net`, credential);
}

function blobClient(relativePath) {
  const config = requireConfig();
  const service = createService(config);
  const container = service.getContainerClient(config.container);
  return container.getBlobClient(`${config.root}/${safeRelativePath(relativePath)}`);
}

async function streamToBuffer(readableStream) {
  if (!readableStream) return Buffer.alloc(0);
  const chunks = [];
  for await (const chunk of readableStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function isMissing(error) {
  return Boolean(error && typeof error === "object" && (
    error.statusCode === 404 || error.code === "BlobNotFound" || error.details?.errorCode === "BlobNotFound"
  ));
}

function isConflict(error) {
  return Boolean(error && typeof error === "object" && (
    error.statusCode === 409 || error.statusCode === 412 ||
    error.code === "BlobAlreadyExists" || error.code === "ConditionNotMet" ||
    error.details?.errorCode === "ConditionNotMet"
  ));
}

export async function readAcquisitionAzureJson(relativePath, maximumBytes, { compressed = false } = {}) {
  const client = blobClient(relativePath);
  try {
    const download = await client.download();
    const contentLength = download.contentLength;
    if (typeof contentLength === "number" && Number.isFinite(contentLength) && contentLength > maximumBytes) {
      throw new Error(`${relativePath} exceeds its Azure download size limit.`);
    }
    const downloaded = await streamToBuffer(download.readableStreamBody);
    if (downloaded.byteLength > maximumBytes) throw new Error(`${relativePath} exceeds its Azure download size limit.`);
    const bytes = compressed ? gunzipSync(downloaded) : downloaded;
    if (bytes.byteLength > maximumBytes) throw new Error(`${relativePath} exceeds its uncompressed size limit.`);
    return {
      value: JSON.parse(bytes.toString("utf8")),
      signature: download.etag ?? `${download.lastModified?.toISOString() ?? "unknown"}:${download.contentLength ?? bytes.byteLength}`,
      size: bytes.byteLength
    };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export function createAzureAcquisitionResearchPersistence() {
  return {
    kind: "azure_blob",
    async read() {
      const result = await readAcquisitionAzureJson(RESEARCH_STORE_PATH, MAX_RESEARCH_STORE_BYTES, { compressed: true });
      return result ? { value: result.value, version: result.signature } : { value: null, version: null };
    },
    async write(value, version) {
      const config = requireConfig();
      const service = createService(config);
      const container = service.getContainerClient(config.container);
      const client = container.getBlockBlobClient(`${config.root}/${RESEARCH_STORE_PATH}`);
      const serialized = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      if (serialized.byteLength > MAX_RESEARCH_STORE_BYTES) {
        throw new Error("Acquisition research store exceeds its size limit.");
      }
      const compressed = gzipSync(serialized, { level: 9 });
      try {
        await client.uploadData(compressed, {
          blobHTTPHeaders: {
            blobContentType: "application/json; charset=utf-8",
            blobContentEncoding: "gzip"
          },
          conditions: version ? { ifMatch: version } : { ifNoneMatch: "*" }
        });
      } catch (error) {
        if (isConflict(error)) {
          const conflict = Object.assign(
            new Error("Acquisition research state changed during this update."),
            { code: "ACQUISITION_RESEARCH_CONFLICT" }
          );
          throw conflict;
        }
        throw error;
      }
      const revisionClient = container.getBlockBlobClient(
        `${config.root}/research/revisions/${String(value.revision).padStart(8, "0")}.json.gz`
      );
      try {
        await revisionClient.uploadData(compressed, {
          blobHTTPHeaders: {
            blobContentType: "application/json; charset=utf-8",
            blobContentEncoding: "gzip"
          },
          conditions: { ifNoneMatch: "*" }
        });
      } catch (error) {
        if (!isConflict(error)) console.warn("Acquisition research revision archive failed.", error);
      }
    }
  };
}

export function createAzureAcquisitionOperatorSelectionPersistence() {
  return {
    kind: "azure_blob",
    async read() {
      const result = await readAcquisitionAzureJson(
        OPERATOR_SELECTION_STORE_PATH,
        MAX_OPERATOR_SELECTION_STORE_BYTES,
        { compressed: true }
      );
      return result ? { value: result.value, version: result.signature } : { value: null, version: null };
    },
    async write(value, version) {
      const config = requireConfig();
      const service = createService(config);
      const container = service.getContainerClient(config.container);
      const client = container.getBlockBlobClient(`${config.root}/${OPERATOR_SELECTION_STORE_PATH}`);
      const serialized = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      if (serialized.byteLength > MAX_OPERATOR_SELECTION_STORE_BYTES) {
        throw new Error("Acquisition operator selection store exceeds its size limit.");
      }
      const compressed = gzipSync(serialized, { level: 9 });
      try {
        await client.uploadData(compressed, {
          blobHTTPHeaders: {
            blobContentType: "application/json; charset=utf-8",
            blobContentEncoding: "gzip"
          },
          conditions: version ? { ifMatch: version } : { ifNoneMatch: "*" }
        });
      } catch (error) {
        if (isConflict(error)) {
          throw Object.assign(
            new Error("Acquisition operator selections changed during this update."),
            { code: "ACQUISITION_OPERATOR_SELECTION_CONFLICT" }
          );
        }
        throw error;
      }
      const revisionClient = container.getBlockBlobClient(
        `${config.root}/${OPERATOR_SELECTION_REVISION_ROOT}/${String(value.revision).padStart(8, "0")}.json.gz`
      );
      try {
        await revisionClient.uploadData(compressed, {
          blobHTTPHeaders: {
            blobContentType: "application/json; charset=utf-8",
            blobContentEncoding: "gzip"
          },
          conditions: { ifNoneMatch: "*" }
        });
      } catch (error) {
        if (!isConflict(error)) console.warn("Acquisition operator selection revision archive failed.", error);
      }
    }
  };
}

export function getAcquisitionAzureStorageSummary() {
  const config = getAcquisitionAzureConfig();
  if (!config) return null;
  return {
    account: config.account ?? null,
    authMode: config.authMode,
    container: config.container,
    root: config.root,
    discoveryManifestPath: `${config.root}/derived/manifest.json`,
    discoveryDirectoryPath: `${config.root}/derived/facility-directory.json.gz`,
    operatorProposalPath: `${config.root}/derived/operator-proposals.json.gz`,
    researchStorePath: `${config.root}/${RESEARCH_STORE_PATH}`,
    operatorSelectionStorePath: `${config.root}/${OPERATOR_SELECTION_STORE_PATH}`
  };
}
