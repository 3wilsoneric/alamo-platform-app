import { ClientSecretCredential, ManagedIdentityCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { fail, hash } from "./model.mjs";

const MAX_BYTES = 16 * 1024 * 1024;

export function workflowBlobContainer(env = process.env) {
  const container = env.WORKFLOW_STORAGE_CONTAINER?.trim();
  if (!container || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(container)) fail(503, "workflow_storage_unconfigured", "A dedicated Workflow storage container must be configured.");
  let service;
  if (env.AZURE_STORAGE_CONNECTION_STRING) service = BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING);
  else {
    const account = env.AZURE_STORAGE_ACCOUNT?.trim();
    if (!account || !/^[a-z0-9]{3,24}$/.test(account)) fail(503, "workflow_storage_unconfigured", "Workflow Azure storage is not configured.");
    let credential;
    if (env.AZURE_STORAGE_AUTH_MODE === "managed-identity") credential = env.AZURE_CLIENT_ID ? new ManagedIdentityCredential(env.AZURE_CLIENT_ID) : new ManagedIdentityCredential();
    else {
      if (!env.ENTRA_TENANT_ID || !env.ENTRA_CLIENT_ID || !env.ENTRA_CLIENT_SECRET) fail(503, "workflow_storage_unconfigured", "Workflow storage credentials are missing.");
      credential = new ClientSecretCredential(env.ENTRA_TENANT_ID, env.ENTRA_CLIENT_ID, env.ENTRA_CLIENT_SECRET);
    }
    service = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential);
  }
  return service.getContainerClient(container);
}

// Write an immutable content-addressed revision first, then conditionally advance
// the head. A losing writer can leave an unreferenced revision, never accepted
// content. History remains recoverable even on accounts without blob versioning.
export function createWorkflowAzurePersistence(container) {
  function client(scope, suffix = "head.json") {
    if (!scope?.tenantId || scope.workspace !== "workflow") fail(403, "workflow_scope_required", "Workflow scope is required.");
    return container.getBlockBlobClient(`workflow/v1/${hash(scope.tenantId)}/${suffix}`);
  }
  async function download(blob, limit) {
    const response = await blob.download(0, undefined, { abortSignal: AbortSignal.timeout(15000) });
    if (!response.etag || !response.readableStreamBody || Number(response.contentLength) > limit) fail(503, "workflow_storage_invalid", "Workflow storage exceeded its size or integrity bounds.");
    const chunks = []; let bytes = 0;
    for await (const chunk of response.readableStreamBody) {
      const part = Buffer.from(chunk); bytes += part.length;
      if (bytes > limit) { response.readableStreamBody.destroy(); fail(503, "workflow_storage_limit", "Workflow storage exceeded its pilot size limit."); }
      chunks.push(part);
    }
    return { text: Buffer.concat(chunks).toString("utf8"), version: response.etag };
  }
  const conflict = error => error && typeof error === "object" && "statusCode" in error && [409, 412].includes(Number(error.statusCode));
  return {
    kind: "azure_blob",
    async read(scope) {
      let response;
      try { response = await download(client(scope), 4096); }
      catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "BlobNotFound") {
          for await (const _blob of container.listBlobsFlat({ prefix: `workflow/v1/${hash(scope.tenantId)}/revisions/` })) fail(503, "workflow_head_missing", "Workflow has archived revisions but no current head. Restore the head before continuing.");
          return { value: null, version: null };
        }
        throw error;
      }
      const head = JSON.parse(response.text);
      if (head.schemaVersion !== 1 || typeof head.snapshot !== "string" || !/^[a-f0-9]{64}$/.test(head.snapshot)) fail(503, "workflow_storage_invalid", "Workflow head failed its integrity check.");
      const snapshot = await download(client(scope, `revisions/${head.snapshot}.json`), MAX_BYTES);
      if (hash(snapshot.text) !== head.snapshot) fail(503, "workflow_storage_invalid", "Workflow revision failed its integrity check.");
      return { value: JSON.parse(snapshot.text), version: response.version };
    },
    async write(scope, value, version) {
      const bytes = Buffer.from(JSON.stringify(value));
      if (bytes.length > MAX_BYTES) fail(409, "workflow_capacity", "This pilot reached its storage limit. Existing records are retained.");
      const snapshot = hash(bytes.toString("utf8"));
      const headers = { blobContentType: "application/json; charset=utf-8", blobCacheControl: "private, no-store" };
      try { await client(scope, `revisions/${snapshot}.json`).uploadData(bytes, { abortSignal: AbortSignal.timeout(15000), conditions: { ifNoneMatch: "*" }, blobHTTPHeaders: headers }); }
      catch (error) { if (!conflict(error)) throw error; }
      try {
        await client(scope).uploadData(Buffer.from(JSON.stringify({ schemaVersion: 1, snapshot })), { abortSignal: AbortSignal.timeout(15000), conditions: version ? { ifMatch: version } : { ifNoneMatch: "*" }, blobHTTPHeaders: headers });
      } catch (error) {
        if (conflict(error)) fail(409, "revision_conflict", "Workflow changed during this request. Refresh before retrying.");
        throw error;
      }
    }
  };
}
