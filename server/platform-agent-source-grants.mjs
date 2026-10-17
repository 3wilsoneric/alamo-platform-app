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
  const account = process.env.PLATFORM_AGENT_SOURCE_STORAGE_ACCOUNT;
  const container = process.env.PLATFORM_AGENT_SOURCE_STORAGE_CONTAINER;
  const clientId = process.env.AZURE_CLIENT_ID;
  if (!account || !container || !clientId) throw new Error("Configure source-owned grant storage.");
  if (account === process.env.AZURE_STORAGE_ACCOUNT && container === process.env.AZURE_STORAGE_CONTAINER) throw new Error("Source grants require a separate private container from agent work state.");
  const client = new BlobServiceClient(`https://${account}.blob.core.windows.net`, new ManagedIdentityCredential(clientId),
    { retryOptions: { maxTries: 1 } }).getContainerClient(container).getBlobClient("agent-source/grants-v1.json");
  // A fixed-size ranged read bounds allocation even if the registry is corrupt.
  const bytes = await client.downloadToBuffer(0, 65_537, { abortSignal: AbortSignal.timeout(5000) });
  if (bytes.length > 65_536) throw new Error("Source grant registry is too large.");
  return JSON.parse(bytes.toString("utf8"));
}
