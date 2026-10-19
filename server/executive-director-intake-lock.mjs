import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { createHttpError } from "./http-errors.mjs";

function errorCode(error) {
  return error && typeof error === "object" && "code" in error ? error.code : null;
}

async function removeOwner(directory, ownerName) {
  try { await unlink(path.join(directory, ownerName)); } catch (error) {
    if (errorCode(error) === "ENOENT") return;
    throw error;
  }
  // Only the process that removed this exact owner's file may remove the empty
  // directory. A newly acquired, populated lock fails rmdir and stays untouched.
  try { await rmdir(directory); } catch (error) {
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(String(errorCode(error)))) throw error;
  }
}

async function recoverDeadOwner(directory) {
  try {
    const files = await readdir(directory);
    const ownerName = files[0];
    if (files.length !== 1 || !ownerName || !/^\d+-[a-f0-9-]{36}\.json$/.test(ownerName)) return;
    const owner = JSON.parse(await readFile(path.join(directory, ownerName), "utf8"));
    if (owner.host !== hostname() || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || !ownerName.startsWith(`${owner.pid}-`)) return;
    try { process.kill(owner.pid, 0); } catch (error) {
      if (errorCode(error) === "ESRCH") await removeOwner(directory, ownerName);
    }
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}

/** Local storage is single-host. Never steal a live PID's lock on a timeout. */
export async function withLocalIntakeCatalogLock(root, facilityId, action) {
  const facilityRoot = path.join(root, facilityId);
  await mkdir(facilityRoot, { recursive: true });
  const directory = path.join(facilityRoot, ".catalog-lock");
  const token = randomUUID();
  const candidate = path.join(facilityRoot, `.catalog-lock-${token}`);
  const ownerName = `${process.pid}-${token}.json`;
  await mkdir(candidate, { mode: 0o700 });
  await writeFile(path.join(candidate, ownerName), JSON.stringify({ pid: process.pid, host: hostname() }), { flag: "wx", mode: 0o600 });
  let acquired = false;
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        // A fully populated directory appears atomically. POSIX rename cannot
        // replace another nonempty owner directory; a crash-empty one is safe.
        await rename(candidate, directory);
        acquired = true;
        return await action();
      } catch (error) {
        if (acquired || !["ENOTEMPTY", "EEXIST"].includes(String(errorCode(error)))) throw error;
      }
      await recoverDeadOwner(directory);
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.floor(Math.random() * 20)));
    }
    throw createHttpError(503, "licensing_catalog_busy", "The licensing queue is busy in another local process. Retry the upload.");
  } finally {
    await removeOwner(acquired ? directory : candidate, ownerName);
  }
}
