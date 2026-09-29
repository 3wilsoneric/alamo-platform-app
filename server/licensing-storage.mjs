import { BlobServiceClient } from "@azure/storage-blob";
import { ManagedIdentityCredential } from "@azure/identity";
import { isProductionLikeRuntime } from "./runtime-environment.mjs";

export const LICENSING_BLOB_PATH = "licensing/library-v1.json";
export const LICENSING_MAX_BYTES = 21 * 1024 * 1024;

export function usesLicensingAzureStorage() {
  return isProductionLikeRuntime() || process.env.LICENSING_STORAGE_READ_SOURCE === "azure";
}

export async function readLicensingAzureBundle() {
  const account = process.env.AZURE_STORAGE_ACCOUNT?.trim();
  const container = process.env.AZURE_STORAGE_CONTAINER?.trim();
  const clientId = process.env.AZURE_CLIENT_ID?.trim();
  if (!account || !container || !clientId) throw new Error("Licensing storage is not configured.");
  const service = new BlobServiceClient(`https://${account}.blob.core.windows.net`, new ManagedIdentityCredential(clientId), {
    retryOptions: { maxTries: 2, tryTimeoutInMs: 10_000 }
  });
  const download = await service.getContainerClient(container).getBlobClient(LICENSING_BLOB_PATH).download(0, undefined, {
    abortSignal: AbortSignal.timeout(20_000)
  });
  if (typeof download.contentLength === "number" && download.contentLength > LICENSING_MAX_BYTES) throw new Error("Oversized licensing collection.");
  let size = 0;
  const chunks = [];
  for await (const chunk of download.readableStreamBody ?? []) {
    size += chunk.length;
    if (size > LICENSING_MAX_BYTES) throw new Error("Oversized licensing collection.");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
