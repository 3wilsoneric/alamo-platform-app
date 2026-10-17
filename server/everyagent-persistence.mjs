import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { BlobServiceClient } from "@azure/storage-blob";
import { ManagedIdentityCredential } from "@azure/identity";
import { isProductionLikeRuntime } from "./runtime-environment.mjs";

const MAX_BYTES = 8 * 1024 * 1024;
const conflict = () => Object.assign(new Error("EveryAgent state changed. Refresh and try again."), { code: "EVERYAGENT_CONFLICT" });
function decode(bytes) {
  if (bytes.length > MAX_BYTES) throw new Error("EveryAgent state exceeds its storage limit.");
  return JSON.parse(bytes.toString("utf8"));
}
function encode(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > MAX_BYTES) throw new Error("EveryAgent state exceeds its storage limit.");
  return bytes;
}

export function createEveryAgentPersistence({ localPath = path.resolve("generated/everyagent/state-v1.json"), azure = isProductionLikeRuntime() } = {}) {
  if (azure) {
    const account = process.env.AZURE_STORAGE_ACCOUNT?.trim();
    const container = process.env.AZURE_STORAGE_CONTAINER?.trim();
    const identity = process.env.AZURE_CLIENT_ID?.trim();
    if (!account || !container || !identity) throw new Error("EveryAgent durable storage is not configured.");
    const blob = new BlobServiceClient(`https://${account}.blob.core.windows.net`, new ManagedIdentityCredential(identity),
      { retryOptions: { maxTries: 2, tryTimeoutInMs: 10_000 } }).getContainerClient(container).getBlockBlobClient("everyagent/state-v1.json");
    return {
      async read() {
        try {
          const download = await blob.download(0, undefined, { abortSignal: AbortSignal.timeout(20_000) });
          if ((download.contentLength ?? 0) > MAX_BYTES) throw new Error("EveryAgent state exceeds its storage limit.");
          const chunks = [];
          let size = 0;
          for await (const chunk of download.readableStreamBody ?? []) {
            size += chunk.length;
            if (size > MAX_BYTES) throw new Error("EveryAgent state exceeds its storage limit.");
            chunks.push(Buffer.from(chunk));
          }
          return { value: decode(Buffer.concat(chunks)), version: download.etag ?? null };
        } catch (error) {
          if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 404) return { value: null, version: null };
          throw error;
        }
      },
      async write(value, version) {
        try {
          await blob.uploadData(encode(value), { conditions: version ? { ifMatch: version } : { ifNoneMatch: "*" },
            blobHTTPHeaders: { blobContentType: "application/json" }, abortSignal: AbortSignal.timeout(20_000) });
        } catch (error) {
          if (error && typeof error === "object" && "statusCode" in error && [409, 412].includes(Number(error.statusCode))) throw conflict();
          throw error;
        }
      }
    };
  }
  async function readLocal() {
    try {
      if ((await stat(localPath)).size > MAX_BYTES) throw new Error("EveryAgent state exceeds its storage limit.");
      const value = decode(await readFile(localPath));
      return { value, version: String(value.revision) };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return { value: null, version: null };
      throw error;
    }
  }
  return {
    read: readLocal,
    async write(value, version) {
      await mkdir(path.dirname(localPath), { recursive: true });
      const lockPath = `${localPath}.lock`;
      let lock;
      try { lock = await open(lockPath, "wx", 0o600); }
      catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") throw conflict(); throw error; }
      const temporary = `${localPath}.${randomUUID()}.tmp`;
      try {
        if ((await readLocal()).version !== version) throw conflict();
        await writeFile(temporary, encode(value), { mode: 0o600 });
        await rename(temporary, localPath);
      } finally {
        await lock.close();
        await unlink(lockPath);
        await unlink(temporary).catch(() => {});
      }
    }
  };
}
