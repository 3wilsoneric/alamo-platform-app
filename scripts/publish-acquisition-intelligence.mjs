#!/usr/bin/env node
import { gzipSync } from "node:zlib";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClientSecretCredential, ManagedIdentityCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import {
  getAcquisitionAzureConfig,
  getAcquisitionAzureStorageSummary
} from "../server/acquisition-azure-storage.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(
  process.env.ACQUISITION_INTELLIGENCE_ROOT || path.join(repositoryRoot, "generated/acquisition-intelligence")
);
const allowedRoot = path.join(repositoryRoot, "generated/acquisition-intelligence");
const includeResearch = process.env.ACQUISITION_PUBLISH_RESEARCH_INITIALIZE === "true";

if (sourceRoot !== allowedRoot && !sourceRoot.startsWith(`${allowedRoot}${path.sep}`)) {
  throw new Error("Acquisition publish source must stay under generated/acquisition-intelligence.");
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
  return new BlobServiceClient(
    `https://${config.account}.blob.core.windows.net`,
    new ClientSecretCredential(config.tenantId, config.clientId, config.clientSecret)
  );
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolutePath));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".csv") return "text/csv; charset=utf-8";
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".zip") return "application/zip";
  return "application/octet-stream";
}

const config = getAcquisitionAzureConfig();
if (!config) throw new Error("Azure acquisition storage configuration is incomplete.");
const storageSummary = getAcquisitionAzureStorageSummary();
const container = createService(config).getContainerClient(config.container);
if (!(await container.exists())) throw new Error(`Azure container ${config.container} does not exist.`);

const rawRoot = path.join(sourceRoot, "raw");
const rawFiles = await walk(rawRoot);
const manifestPath = path.join(sourceRoot, "derived/manifest.json");
const directoryPath = path.join(sourceRoot, "derived/facility-directory.json");
const operatorIndexPath = path.join(sourceRoot, "derived/operator-proposals.json");
const researchPath = path.join(sourceRoot, "research/store-v1.json");
const required = [manifestPath, directoryPath, operatorIndexPath, ...(includeResearch ? [researchPath] : [])];
for (const filePath of required) await stat(filePath);

let uploadedBytes = 0;
let uploadedFiles = 0;
for (const filePath of rawFiles) {
  const relativePath = path.relative(sourceRoot, filePath).split(path.sep).join("/");
  const destination = `${config.root}/${relativePath}`;
  const details = await stat(filePath);
  await container.getBlockBlobClient(destination).uploadFile(filePath, {
    blobHTTPHeaders: { blobContentType: contentType(filePath) }
  });
  uploadedBytes += details.size;
  uploadedFiles += 1;
}

const manifest = await readFile(manifestPath);
await container.getBlockBlobClient(`${config.root}/derived/manifest.json`).uploadData(manifest, {
  blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" }
});
uploadedBytes += manifest.byteLength;
uploadedFiles += 1;

const directory = await readFile(directoryPath);
const compressedDirectory = gzipSync(directory, { level: 9 });
await container.getBlockBlobClient(`${config.root}/derived/facility-directory.json.gz`).uploadData(compressedDirectory, {
  blobHTTPHeaders: {
    blobContentType: "application/json; charset=utf-8",
    blobContentEncoding: "gzip"
  }
});
uploadedBytes += compressedDirectory.byteLength;
uploadedFiles += 1;

const operatorIndex = await readFile(operatorIndexPath);
JSON.parse(operatorIndex.toString("utf8"));
const compressedOperatorIndex = gzipSync(operatorIndex, { level: 9 });
await container.getBlockBlobClient(`${config.root}/derived/operator-proposals.json.gz`).uploadData(compressedOperatorIndex, {
  blobHTTPHeaders: {
    blobContentType: "application/json; charset=utf-8",
    blobContentEncoding: "gzip"
  }
});
uploadedBytes += compressedOperatorIndex.byteLength;
uploadedFiles += 1;

if (includeResearch) {
  const research = await readFile(researchPath);
  JSON.parse(research.toString("utf8"));
  const compressedResearch = gzipSync(research, { level: 9 });
  const client = container.getBlockBlobClient(`${config.root}/research/store-v1.json.gz`);
  await client.uploadData(compressedResearch, {
    blobHTTPHeaders: {
      blobContentType: "application/json; charset=utf-8",
      blobContentEncoding: "gzip"
    },
    conditions: { ifNoneMatch: "*" }
  });
  uploadedBytes += compressedResearch.byteLength;
  uploadedFiles += 1;
}

console.log(JSON.stringify({
  status: "published",
  account: storageSummary?.account ?? "connection-string",
  container: storageSummary?.container ?? config.container,
  root: storageSummary?.root ?? config.root,
  includeResearch,
  uploadedFiles,
  uploadedBytes
}, null, 2));
