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

// Source-owned registry: no cache, fallback grant, or agent-side write path.
// Grant storage must be inaccessible to the agent's workload identity.
export async function readPlatformAgentSourceGrants() {
  return readSourceGrantBlob('agent-source/grants-v1.json');
}

export async function readPlatformReportSourceGrants() {
  return readSourceGrantBlob('agent-source/report-grants-v1.json');
}

// Reuse the SDK connection and its expiring workload token, never the registry.
// Each read still downloads the current document; configuration changes replace
// the connection before any request can use a previous storage identity.
export function createSourceGrantReader({ env = process.env, createContainer = (account, container, clientId) =>
  new BlobServiceClient(`https://${account}.blob.core.windows.net`, new ManagedIdentityCredential(clientId),
    { retryOptions: { maxTries: 1 } }).getContainerClient(container) } = {}) {
  let connection = null, connectionKey = null;
  return async blobName => {
    const account = env.PLATFORM_AGENT_SOURCE_STORAGE_ACCOUNT;
    const container = env.PLATFORM_AGENT_SOURCE_STORAGE_CONTAINER;
    const clientId = env.AZURE_CLIENT_ID;
    if (!account || !container || !clientId) throw new Error("Configure source-owned grant storage.");
    if (account === env.AZURE_STORAGE_ACCOUNT && container === env.AZURE_STORAGE_CONTAINER) throw new Error("Source grants require a separate private container from agent work state.");
    const key = JSON.stringify([account, container, clientId]);
    if (key !== connectionKey) {
      connection = createContainer(account, container, clientId);
      connectionKey = key;
    }
    return readSourceGrantDocument(connection.getBlobClient(blobName));
  };
}
const readSourceGrantBlob = createSourceGrantReader();

export async function readSourceGrantDocument(client) {
  // downloadToBuffer requires the exact requested byte count, not an upper
  // bound. A ranged stream accepts small documents and still bounds allocation.
  const response = await client.download(0, 65_537, { abortSignal: AbortSignal.timeout(5000) });
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
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { stream.destroy(); }
}
