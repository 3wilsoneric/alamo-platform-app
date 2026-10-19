import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createGunzip, gzipSync } from "node:zlib";
import { createInterface } from "node:readline";
import path from "node:path";
import { AzureCliCredential, ClientSecretCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { assertPlatformClientDatabasePayload } from "../server/platform-snapshot.mjs";

const DEFAULT_EXPORT_DIR = "/Users/eric/Documents/Allo/outputs/databricks-searchable-database-20260818T234946Z";
const DEFAULT_CONTAINER = "alamo-platform-snapshots";
const RELEASE_POINTER_PATH = "snapshots/client-database/release-pointer.json";
const LATEST_SNAPSHOT_PATH = "snapshots/daily/latest.json";
const REQUIRED_EXPORTS = [
  "silver_allo_client_facts.jsonl.gz",
  "silver_allo_fact_evidence.jsonl.gz",
  "silver_allo_identity_crosswalk.jsonl.gz",
  "bronze_allo_document_pages.jsonl.gz"
];

const options = parseArguments(process.argv.slice(2));
const exportDirectory = path.resolve(options.input || process.env.ALLO_SEARCHABLE_DATABASE_EXPORT_DIR || DEFAULT_EXPORT_DIR);
await Promise.all(REQUIRED_EXPORTS.map((name) => access(path.join(exportDirectory, name))));

const storage = createStorageClient(options);
const releasePointerRead = await readJsonBlob(storage.container, RELEASE_POINTER_PATH, 2 * 1024 * 1024);
const currentPointer = releasePointerRead.value.clientDatabase ?? releasePointerRead.value;
const currentPath = requiredSafeBlobPath(currentPointer.path, "current client database");
const currentDatabaseRead = await readJsonBlob(storage.container, currentPath, 32 * 1024 * 1024);
const currentDatabase = assertPlatformClientDatabasePayload(
  currentDatabaseRead.value,
  "current published client database",
  currentPointer
);

const clients = new Set(currentDatabase.clients.map((client) => String(client.canonical_client_id)));
const documentsByClient = new Map();
const canonicalByDocument = new Map();
for (const document of currentDatabase.documents ?? []) {
  const canonicalClientId = String(document.canonical_client_id);
  const documentId = String(document.document_id);
  canonicalByDocument.set(documentId, canonicalClientId);
  const documentIds = documentsByClient.get(canonicalClientId) ?? [];
  documentIds.push(documentId);
  documentsByClient.set(canonicalClientId, documentIds);
}

const canonicalByResidentNumber = new Map();
let ambiguousIdentityRows = 0;
await readJsonLines(path.join(exportDirectory, "silver_allo_identity_crosswalk.jsonl.gz"), (row) => {
  const residentNumber = textValue(row.resident_number, 256);
  const canonicalClientId = textValue(row.canonical_client_id, 256);
  if (!residentNumber || !clients.has(canonicalClientId)) return;
  const existing = canonicalByResidentNumber.get(residentNumber);
  if (existing && existing !== canonicalClientId) {
    canonicalByResidentNumber.delete(residentNumber);
    ambiguousIdentityRows += 1;
    return;
  }
  canonicalByResidentNumber.set(residentNumber, canonicalClientId);
});

const rawFacts = [];
await readJsonLines(path.join(exportDirectory, "silver_allo_client_facts.jsonl.gz"), (row) => {
  const canonicalClientId = textValue(row.canonical_client_id, 256);
  const fieldName = textValue(row.field_name, 128);
  const fieldValue = textValue(row.field_value, 20_000);
  const completionStatus = textValue(row.completion_status, 64);
  if (
    !clients.has(canonicalClientId) || !/^[a-z][a-z0-9_]{0,127}$/.test(fieldName) || !fieldValue ||
    !["verified", "needs_review", "not_documented", "no_source_documents"].includes(completionStatus)
  ) return;
  rawFacts.push({
    canonical_client_id: canonicalClientId,
    field_name: fieldName,
    field_value: fieldValue,
    completion_status: completionStatus
  });
});

const evidenceByClient = new Map();
const evidenceStatsByFact = new Map();
let skippedEvidenceRows = 0;
await readJsonLines(path.join(exportDirectory, "silver_allo_fact_evidence.jsonl.gz"), (row) => {
  const documentId = textValue(row.document_id, 256);
  const residentNumber = textValue(row.resident_number, 256);
  const canonicalFromDocument = canonicalByDocument.get(documentId);
  const canonicalFromIdentity = canonicalByResidentNumber.get(residentNumber);
  const canonicalClientId = canonicalFromDocument || canonicalFromIdentity;
  const pageNumber = integerValue(row.page_number, 1, 10_000);
  const fieldName = textValue(row.field_name, 128);
  const evidenceText = textValue(row.evidence_text, 4_000);
  const candidateValue = textValue(row.candidate_value, 20_000);
  const confidence = numberValue(row.confidence, 0, 1);
  if (
    !canonicalClientId || !clients.has(canonicalClientId) || !canonicalFromDocument ||
    (canonicalFromIdentity && canonicalFromIdentity !== canonicalFromDocument) ||
    pageNumber === null || !/^[a-z][a-z0-9_]{0,127}$/.test(fieldName) ||
    !evidenceText || !candidateValue || confidence === null
  ) {
    skippedEvidenceRows += 1;
    return;
  }
  const status = row.acceptance_status === "accepted"
    ? "accepted"
    : row.acceptance_status === "needs_review" ? "needs_review" : "candidate";
  const evidence = evidenceByClient.get(canonicalClientId) ?? [];
  evidence.push({
    field_name: fieldName,
    document_id: documentId,
    page_number: pageNumber,
    evidence_text: evidenceText,
    candidate_value: candidateValue,
    confidence,
    status
  });
  evidenceByClient.set(canonicalClientId, evidence);
  const factKey = `${canonicalClientId}\u0000${fieldName}`;
  const stats = evidenceStatsByFact.get(factKey) ?? { count: 0, maximum: null };
  stats.count += 1;
  stats.maximum = stats.maximum === null ? confidence : Math.max(stats.maximum, confidence);
  evidenceStatsByFact.set(factKey, stats);
});

const pagesByClient = new Map();
let skippedPageRows = 0;
await readJsonLines(path.join(exportDirectory, "bronze_allo_document_pages.jsonl.gz"), (row) => {
  const documentId = textValue(row.document_id, 256);
  const canonicalClientId = canonicalByDocument.get(documentId);
  const pageNumber = integerValue(row.page_number, 1, 10_000);
  const pageText = typeof row.text === "string" ? row.text : "";
  if (!canonicalClientId || pageNumber === null || !pageText.trim() || pageText.length > 200_000) {
    skippedPageRows += 1;
    return;
  }
  const pages = pagesByClient.get(canonicalClientId) ?? [];
  pages.push({
    document_id: documentId,
    page_number: pageNumber,
    section: textValue(row.section, 256) || null,
    text: pageText
  });
  pagesByClient.set(canonicalClientId, pages);
});

const clientFacts = rawFacts
  .map((fact) => {
    const stats = evidenceStatsByFact.get(`${fact.canonical_client_id}\u0000${fact.field_name}`);
    return {
      ...fact,
      evidence_count: stats?.count ?? 0,
      max_confidence: stats?.maximum ?? null
    };
  })
  .sort((left, right) =>
    left.canonical_client_id.localeCompare(right.canonical_client_id, "en") ||
    left.field_name.localeCompare(right.field_name, "en")
  );

const releaseKey = new Date().toISOString().replace(/[-:.TZ]/g, "").toLowerCase();
const shards = [];
const clientIntelligence = [];
for (const canonicalClientId of [...documentsByClient.keys()].sort()) {
  const documentIds = [...new Set(documentsByClient.get(canonicalClientId) ?? [])].sort();
  const evidence = (evidenceByClient.get(canonicalClientId) ?? []).sort(compareEvidence);
  const pages = (pagesByClient.get(canonicalClientId) ?? []).sort(comparePages);
  const shardBody = gzipSync(Buffer.from(JSON.stringify({
    version: 1,
    canonical_client_id: canonicalClientId,
    document_ids: documentIds,
    evidence,
    pages
  })), { level: 6 });
  const hash = createHash("sha256").update(canonicalClientId).digest("hex");
  const shardPath = `snapshots/client-intelligence/shards/v1/${hash}.json.gz`;
  shards.push({ path: shardPath, body: shardBody });
  clientIntelligence.push({
    canonical_client_id: canonicalClientId,
    shard_path: shardPath,
    document_count: documentIds.length,
    page_count: pages.length,
    evidence_count: evidence.length,
    compressed_bytes: shardBody.byteLength
  });
}

const candidate = assertPlatformClientDatabasePayload({
  ...currentDatabase,
  version: 3,
  generated_at: new Date().toISOString(),
  client_fact_count: clientFacts.length,
  client_facts: clientFacts,
  client_intelligence_count: clientIntelligence.length,
  client_intelligence: clientIntelligence
}, "client-intelligence v3 candidate");
const candidateBody = Buffer.from(JSON.stringify(candidate));
const candidateHash = createHash("sha256").update(candidateBody).digest("hex");
const candidatePath = `snapshots/client-database/versions/${releaseKey}-client-intelligence-v3.json`;
const nextPointer = {
  ...currentPointer,
  path: candidatePath,
  version: 3,
  generated_at: candidate.generated_at,
  client_count: candidate.client_count,
  field_count: candidate.column_count,
  document_count: candidate.document_count,
  client_fact_count: candidate.client_fact_count,
  client_intelligence_count: candidate.client_intelligence_count,
  sha256: candidateHash,
  bytes: candidateBody.byteLength
};

printSummary({
  mode: options.activate ? "activate" : options.publish ? "publish-candidate" : "dry-run",
  current_version: currentPointer.version,
  candidate_version: candidate.version,
  clients: candidate.client_count,
  documents: candidate.document_count,
  facts: clientFacts.length,
  intelligence_shards: shards.length,
  indexed_pages: clientIntelligence.reduce((sum, entry) => sum + entry.page_count, 0),
  evidence_rows: clientIntelligence.reduce((sum, entry) => sum + entry.evidence_count, 0),
  candidate_bytes: candidateBody.byteLength,
  shard_compressed_bytes: shards.reduce((sum, shard) => sum + shard.body.byteLength, 0),
  skipped_page_rows: skippedPageRows,
  skipped_evidence_rows: skippedEvidenceRows,
  ambiguous_identity_rows: ambiguousIdentityRows
});

if (options.publish || options.activate) {
  await uploadShards(storage.container, shards);
  await uploadBuffer(storage.container, candidatePath, candidateBody, {
    contentType: "application/json; charset=utf-8"
  });
  process.stdout.write("Candidate client-intelligence release uploaded.\n");
}

if (options.activate) {
  const latestRead = await readJsonBlob(storage.container, LATEST_SNAPSHOT_PATH, 64 * 1024 * 1024);
  const historyPath = `snapshots/client-database/release-history/${releaseKey}-previous.json`;
  const previousPointerBody = Buffer.from(JSON.stringify({
    captured_at: new Date().toISOString(),
    release_pointer: releasePointerRead.value,
    latest_snapshot_client_database: latestRead.value.clientDatabase ?? null
  }));
  await uploadBuffer(storage.container, historyPath, previousPointerBody, {
    contentType: "application/json; charset=utf-8",
    ifNoneMatch: "*"
  });

  const releasePointer = releasePointerRead.value.clientDatabase
    ? { ...releasePointerRead.value, generated_at: new Date().toISOString(), clientDatabase: nextPointer }
    : nextPointer;
  await uploadBuffer(storage.container, RELEASE_POINTER_PATH, Buffer.from(JSON.stringify(releasePointer)), {
    contentType: "application/json; charset=utf-8",
    ifMatch: releasePointerRead.etag
  });
  const latestSnapshot = { ...latestRead.value, clientDatabase: nextPointer };
  await uploadBuffer(storage.container, LATEST_SNAPSHOT_PATH, Buffer.from(JSON.stringify(latestSnapshot)), {
    contentType: "application/json; charset=utf-8",
    ifMatch: latestRead.etag
  });
  process.stdout.write(`Activated v3. Rollback metadata: ${historyPath}\n`);
}

function createStorageClient(args) {
  const account = args.account || process.env.AZURE_STORAGE_ACCOUNT?.trim();
  const containerName = args.container || process.env.AZURE_STORAGE_CONTAINER?.trim() || DEFAULT_CONTAINER;
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  let service;
  if (connectionString) {
    service = BlobServiceClient.fromConnectionString(connectionString);
  } else {
    if (!account || !/^[a-z0-9]{3,24}$/.test(account)) {
      throw new Error("AZURE_STORAGE_ACCOUNT or --account is required.");
    }
    const tenantId = process.env.ENTRA_TENANT_ID?.trim();
    const clientId = process.env.ENTRA_CLIENT_ID?.trim();
    const clientSecret = process.env.ENTRA_CLIENT_SECRET?.trim();
    const credential = tenantId && clientId && clientSecret
      ? new ClientSecretCredential(tenantId, clientId, clientSecret)
      : new AzureCliCredential({ tenantId: tenantId || undefined });
    service = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential);
  }
  return { container: service.getContainerClient(containerName) };
}

async function readJsonBlob(container, blobPath, maximumBytes) {
  const client = container.getBlobClient(requiredSafeBlobPath(blobPath, "blob"));
  const download = await client.download();
  if (!download.etag) throw new Error("Blob read did not return an ETag.");
  if (Number(download.contentLength ?? 0) > maximumBytes) throw new Error("Blob exceeds its configured read limit.");
  const chunks = [];
  let total = 0;
  for await (const chunk of download.readableStreamBody ?? []) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maximumBytes) throw new Error("Blob exceeds its configured read limit.");
    chunks.push(buffer);
  }
  return { value: JSON.parse(Buffer.concat(chunks).toString("utf8")), etag: download.etag };
}

async function uploadShards(container, shards) {
  const concurrency = 8;
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < shards.length) {
      const index = cursor;
      cursor += 1;
      const shard = shards[index];
      await uploadBuffer(container, shard.path, shard.body, {
        contentType: "application/json",
        contentEncoding: "gzip"
      });
    }
  }));
}

async function uploadBuffer(container, blobPath, body, options = {}) {
  const client = container.getBlockBlobClient(requiredSafeBlobPath(blobPath, "upload"));
  const conditions = options.ifMatch
    ? { ifMatch: options.ifMatch }
    : options.ifNoneMatch ? { ifNoneMatch: options.ifNoneMatch } : undefined;
  await client.uploadData(body, {
    conditions,
    blobHTTPHeaders: {
      blobContentType: options.contentType,
      ...(options.contentEncoding ? { blobContentEncoding: options.contentEncoding } : {})
    }
  });
}

async function readJsonLines(filePath, consume) {
  const input = createReadStream(filePath).pipe(createGunzip());
  const reader = createInterface({ input, crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line.trim()) continue;
    consume(JSON.parse(line));
  }
}

function compareEvidence(left, right) {
  return left.field_name.localeCompare(right.field_name, "en") ||
    left.document_id.localeCompare(right.document_id, "en") ||
    left.page_number - right.page_number ||
    left.evidence_text.localeCompare(right.evidence_text, "en");
}

function comparePages(left, right) {
  return left.document_id.localeCompare(right.document_id, "en") || left.page_number - right.page_number;
}

function textValue(value, maximum) {
  if (value === null || value === undefined) return "";
  const normalized = String(value).trim();
  return normalized.length <= maximum ? normalized : normalized.slice(0, maximum);
}

function integerValue(value, minimum, maximum) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= minimum && normalized <= maximum ? normalized : null;
}

function numberValue(value, minimum, maximum) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= minimum && normalized <= maximum ? normalized : null;
}

function requiredSafeBlobPath(value, label) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.startsWith("/") || normalized.includes("\\") || normalized.split("/").includes("..")) {
    throw new Error(`${label} has an invalid blob path.`);
  }
  return normalized;
}

function parseArguments(argv) {
  const parsed = { publish: false, activate: false, input: "", account: "", container: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--publish") parsed.publish = true;
    else if (argument === "--activate") {
      parsed.activate = true;
      parsed.publish = true;
    } else if (["--input", "--account", "--container"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      parsed[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return parsed;
}

function printSummary(summary) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
