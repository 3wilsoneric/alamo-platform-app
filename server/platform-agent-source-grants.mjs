import { createHash } from "node:crypto";
import { BlobServiceClient } from "@azure/storage-blob";
import { ManagedIdentityCredential } from "@azure/identity";
import { EVERYAGENT_TENANT, hasEveryAgentAccess } from "../shared/everyagent-identity.mjs";
import { LICENSING_COMMUNITIES } from "../shared/licensing-communities.mjs";
import { hasLicensingAccess } from "../shared/licensing-access.mjs";
import { hasPlatformOwnerAccess } from "../shared/platform-owner-access.mjs";
import { createHttpError } from "./http-error-contract.mjs";

const deny = () => { throw createHttpError(403, "source_grant_denied", "Source access is unavailable for this assignment."); };
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
const fields = ["id", "clientId", "principalId", "subjectId", "skillId", "communityIds", "expiresAt", "revoked"];

export function authorizePlatformAgentSource(identity, request, document, now = Date.now()) {
  if (!document || document.version !== 1 || !Array.isArray(document.grants) || document.grants.length > 100) throw new Error("Invalid source grant registry.");
  const ids = new Set();
  for (const grant of document.grants) {
    if (!grant || Object.keys(grant).length !== fields.length || Object.keys(grant).some(key => !fields.includes(key)) ||
        typeof grant.id !== "string" || !/^[a-z0-9-]{1,80}$/.test(grant.id) || ids.has(grant.id) ||
        ![grant.clientId, grant.principalId, grant.subjectId].every(uuid) || !["licensing", "admissions-watch"].includes(grant.skillId) ||
        typeof grant.revoked !== "boolean" || typeof grant.expiresAt !== "string" || !Number.isFinite(Date.parse(grant.expiresAt)) ||
        !Array.isArray(grant.communityIds) || new Set(grant.communityIds).size !== grant.communityIds.length ||
        grant.communityIds.some(id => !LICENSING_COMMUNITIES.some(c => c.facilityId === id)) ||
        (grant.skillId === "licensing" ? !grant.communityIds.length : grant.communityIds.length !== 0)) throw new Error("Invalid source grant registry.");
    ids.add(grant.id);
  }
  const claims = { tid: identity.tenantId, oid: request.subjectId };
  if (identity.tenantId !== EVERYAGENT_TENANT || !hasEveryAgentAccess(claims) ||
      (request.skillId === "licensing" ? !hasLicensingAccess(claims) : !hasPlatformOwnerAccess(claims))) deny();
  const matches = document.grants.filter(grant => grant.clientId === identity.clientId && grant.principalId === identity.principalId &&
    grant.subjectId === request.subjectId && grant.skillId === request.skillId);
  if (matches.length !== 1) deny();
  const grant = matches[0];
  if (!grant || grant.revoked || Date.parse(grant.expiresAt) <= now || request.communityIds.some(id => !grant.communityIds.includes(id))) deny();
  const canonical = fields.map(field => field === "communityIds" ? [...grant[field]].sort() : grant[field]);
  return { application: "platform", id: grant.id, revision: createHash("sha256").update(JSON.stringify(canonical)).digest("hex"), expiresAt: grant.expiresAt };
}

// Source-owned registry. The report source serves its first authorization from
// a validated copy no older than GRANT_CACHE_MAX_AGE_MS, then revalidates with an
// ETag conditional GET before any data leaves Platform (see the report handler).
// EveryAgent keeps strict per-call revalidation. Neither path ever falls back to
// a previously downloaded registry when storage is unavailable.
export async function readPlatformAgentSourceGrants() {
  return readSourceGrantBlob('agent-source/grants-v1.json', { revalidate: true });
}

/** @param {{revalidate?:boolean}} [options] */
export async function readPlatformReportSourceGrants(options = {}) {
  return readSourceGrantBlob('agent-source/report-grants-v1.json', options);
}

export const GRANT_CACHE_MAX_AGE_MS = 30_000;

// Reuse the SDK connection and its expiring workload token. The registry copy is
// bounded: a cached document is served only while younger than maxAgeMs and only
// for the same storage identity; revalidate:true always asks storage (If-None-Match,
// so an unchanged registry costs a 304 and no body). Configuration changes replace
// the connection and discard every cached registry before any request can use it.
export function createSourceGrantReader({ env = process.env, now = Date.now, maxAgeMs = GRANT_CACHE_MAX_AGE_MS, createContainer = (account, container, clientId) =>
  new BlobServiceClient(`https://${account}.blob.core.windows.net`, new ManagedIdentityCredential(clientId),
    { retryOptions: { maxTries: 1 } }).getContainerClient(container) } = {}) {
  let connection = null, connectionKey = null;
  /** @type {Map<string,{etag:string|null,document:any,validatedAt:number}>} */
  let cache = new Map();
  /** @type {Map<string,Promise<any>>} */
  let inflight = new Map();
  /** @param {string} blobName @param {{revalidate?:boolean}} [options] */
  return async (blobName, { revalidate = false } = {}) => {
    const account = env.PLATFORM_AGENT_SOURCE_STORAGE_ACCOUNT;
    const container = env.PLATFORM_AGENT_SOURCE_STORAGE_CONTAINER;
    const clientId = env.AZURE_CLIENT_ID;
    if (!account || !container || !clientId) throw new Error("Configure source-owned grant storage.");
    if (account === env.AZURE_STORAGE_ACCOUNT && container === env.AZURE_STORAGE_CONTAINER) throw new Error("Source grants require a separate private container from agent work state.");
    const key = JSON.stringify([account, container, clientId]);
    if (key !== connectionKey) {
      connection = createContainer(account, container, clientId);
      connectionKey = key;
      cache = new Map(); inflight = new Map();
    }
    const cached = cache.get(blobName);
    const age = cached ? now() - cached.validatedAt : Infinity;
    if (!revalidate && cached && age >= 0 && age < maxAgeMs) return structuredClone(cached.document);
    // Concurrent requests share one storage round trip; each still gets a copy.
    const selectedCache = cache, selectedInflight = inflight;
    let pending = selectedInflight.get(blobName);
    if (!pending) {
      pending = (async () => {
        try {
          const prior = selectedCache.get(blobName);
          const result = await readSourceGrantBlobConditional(connection.getBlobClient(blobName), prior?.etag ?? null);
          const entry = result.notModified && prior ? { ...prior, validatedAt: now() } : { etag: result.etag, document: result.document, validatedAt: now() };
          if (result.notModified && !prior) throw new Error("Source grant registry revalidation had no cached copy.");
          selectedCache.set(blobName, entry);
          return entry.document;
        } catch (error) {
          selectedCache.delete(blobName); // An outage never leaves a reusable copy.
          throw error;
        } finally { selectedInflight.delete(blobName); }
      })();
      selectedInflight.set(blobName, pending);
    }
    return structuredClone(await pending);
  };
}
const readSourceGrantBlob = createSourceGrantReader();

export async function readSourceGrantDocument(client) {
  return (await readSourceGrantBlobConditional(client, null)).document;
}

/** @param {any} client @param {string|null} etag */
export async function readSourceGrantBlobConditional(client, etag) {
  // downloadToBuffer requires the exact requested byte count, not an upper
  // bound. A ranged stream accepts small documents and still bounds allocation.
  let response;
  try {
    response = await client.download(0, 65_537, { abortSignal: AbortSignal.timeout(5000), ...(etag ? { conditions: { ifNoneMatch: etag } } : {}) });
  } catch (error) {
    if (etag && error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 304) return { notModified: true, etag, document: null };
    throw error;
  }
  if (etag && Number(response?._response?.status) === 304) { response.readableStreamBody?.destroy(); return { notModified: true, etag, document: null }; }
  const stream = response.readableStreamBody;
  if (!stream) throw new Error("Source grant registry has no response body.");
  try {
    if (Number(response.contentLength) > 65_536) throw new Error("Source grant registry is too large.");
    const chunks = []; let size = 0;
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > 65_536) throw new Error("Source grant registry is too large.");
      chunks.push(Buffer.from(chunk));
    }
    return { notModified: false, etag: typeof response.etag === 'string' && response.etag ? response.etag : null, document: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } finally { stream.destroy(); }
}
