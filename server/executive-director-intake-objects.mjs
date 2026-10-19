import { randomUUID } from "node:crypto";
import { link, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";

function missing(error) {
  return error && typeof error === "object" && (error.statusCode === 404 || error.code === "ENOENT");
}

/** Publish complete bytes create-only, including across local worker processes. */
async function publishLocal(filePath, bytes) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  let ownsTemporary = false;
  try {
    const file = await open(temporaryPath, "wx", 0o600);
    ownsTemporary = true;
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    await link(temporaryPath, filePath);
    const directory = await open(path.dirname(filePath), "r");
    try { await directory.sync(); } finally { await directory.close(); }
    return true;
  } catch (error) {
    if (ownsTemporary && error && typeof error === "object" && "code" in error && error.code === "EEXIST") return false;
    throw error;
  } finally {
    if (ownsTemporary) await unlink(temporaryPath);
  }
}

export function createLocalIntakeObjectStore(root, storageRoot) {
  const filePathFor = (name) => {
    if (typeof name !== "string" || !name.startsWith(`${storageRoot}/`) || name.includes("\\") || name.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Invalid private intake object name.");
    return path.join(root, name.slice(storageRoot.length + 1));
  };
  return {
    async read(name, maximumBytes) {
      try {
        const file = await open(filePathFor(name), "r");
        try {
          if ((await file.stat()).size > maximumBytes) throw new Error("Private intake object is oversized.");
          const bytes = await file.readFile();
          if (bytes.length > maximumBytes) throw new Error("Private intake object is oversized.");
          return bytes;
        } finally {
          await file.close();
        }
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
    async create(name, bytes, _contentType, _metadata = {}) {
      return publishLocal(filePathFor(name), bytes);
    }
  };
}

export function createAzureIntakeObjectStore(container) {
  return {
    async read(name, maximumBytes) {
      try {
        const download = await container.getBlobClient(name).download();
        const chunks = [];
        let length = 0;
        for await (const chunk of download.readableStreamBody ?? []) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          length += bytes.length;
          if (length > maximumBytes) throw new Error("Private intake object is oversized.");
          chunks.push(bytes);
        }
        return Buffer.concat(chunks);
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
    async create(name, bytes, contentType, metadata = {}) {
      try {
        await container.getBlockBlobClient(name).uploadData(bytes, {
          blobHTTPHeaders: { blobContentType: contentType }, metadata,
          conditions: { ifNoneMatch: "*" }
        });
        return true;
      } catch (error) {
        if (error && typeof error === "object" && (("statusCode" in error && error.statusCode === 412) || ("code" in error && error.code === "BlobAlreadyExists"))) return false;
        throw error;
      }
    }
  };
}
