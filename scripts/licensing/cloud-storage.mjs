import { BlobServiceClient } from "@azure/storage-blob";
import { AzureCliCredential, ManagedIdentityCredential } from "@azure/identity";

export function licensingContainer() {
  const account = process.env.AZURE_STORAGE_ACCOUNT || "alamodatalake";
  const container = process.env.AZURE_STORAGE_CONTAINER || "alamo-platform-snapshots";
  const credential = process.env.LICENSING_AUTH_MODE === "managed_identity"
    ? new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID)
    : new AzureCliCredential();
  return new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential, {
    retryOptions: { maxTries: 3, tryTimeoutInMs: 30_000 }
  }).getContainerClient(container);
}

export async function readBlob(client, maximum) {
  const response = await client.download(0, undefined, { abortSignal: AbortSignal.timeout(60_000) });
  if (response.contentLength > maximum) throw new Error("Licensing blob exceeds its size limit.");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.readableStreamBody ?? []) {
    size += chunk.length;
    if (size > maximum) throw new Error("Licensing blob exceeds its size limit.");
    chunks.push(Buffer.from(chunk));
  }
  return { bytes: Buffer.concat(chunks), etag: response.etag };
}

export async function uploadImmutable(client, bytes, contentType) {
  try {
    await client.uploadData(bytes, { conditions: { ifNoneMatch: "*" }, blobHTTPHeaders: { blobContentType: contentType } });
  } catch (error) {
    if (error.statusCode !== 409 && error.statusCode !== 412) throw error;
  }
}

// The library blob is both the publication pointer and the distributed lock.
// All writers (including local tools) must honor an active Azure lease.
export async function withLicensingLease(client, work) {
  const lease = client.getBlobLeaseClient();
  try { await lease.acquireLease(60); }
  catch (error) {
    if (error.statusCode === 409) return { status: "skipped", reason: "Another licensing check is running." };
    throw error;
  }
  const abort = new AbortController();
  let pending = Promise.resolve();
  const timer = setInterval(() => {
    pending = pending.then(() => lease.renewLease()).catch((error) => abort.abort(error));
  }, 20_000);
  try { return await work(lease.leaseId, abort.signal); }
  finally {
    clearInterval(timer);
    await pending;
    await lease.releaseLease().catch(() => {});
  }
}
