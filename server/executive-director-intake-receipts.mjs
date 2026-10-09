import { createHash } from "node:crypto";
import { ALAMO_FACILITIES } from "../shared/community-names.mjs";
import { createHttpError } from "./http-errors.mjs";
import { assertLic624SubmissionId } from "./lic624-review.mjs";

const VERSION = "executive-director-intake-receipt-v1";
const ROOT = "licensing/executive-director-intake-v1";
const TYPES = new Map([["application/pdf", "pdf"], ["image/jpeg", "jpg"], ["image/png", "png"]]);
const FACILITIES = new Set(ALAMO_FACILITIES.map((facility) => facility.facilityId));
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

function assertReceipt(receipt, facilityId, sha256) {
  if (!receipt || receipt.version !== VERSION || receipt.facilityId !== facilityId || receipt.sha256 !== sha256) throw new Error("Invalid private intake receipt.");
  assertLic624SubmissionId(receipt.submissionId);
  const extension = TYPES.get(receipt.contentType);
  const manifest = String(receipt.storage?.manifestObject ?? "");
  const pattern = new RegExp(`^${ROOT}/${facilityId}/[0-9]{4}/${receipt.submissionId}/manifest\\.json$`);
  if (!extension || !pattern.test(manifest) || receipt.storage?.sourceObject !== manifest.replace("manifest.json", `source.${extension}`)) throw new Error("Invalid private intake receipt references.");
  if (!Number.isSafeInteger(receipt.byteLength) || receipt.byteLength < 1 || receipt.byteLength > 20 * 1024 * 1024 || typeof receipt.originalFileName !== "string" || !receipt.originalFileName || receipt.originalFileName.length > 180 || typeof receipt.createdAt !== "string" || !Number.isFinite(Date.parse(receipt.createdAt))) throw new Error("Invalid private intake receipt metadata.");
  return receipt;
}

function receiptFor(manifest) {
  const { facilityId, sha256, submissionId, createdAt, originalFileName, contentType, byteLength, submittedBy, storage } = manifest;
  return { version: VERSION, facilityId, sha256, submissionId, createdAt, originalFileName, contentType, byteLength, submittedBy, storage };
}

function assertManifest(manifest, receipt) {
  if (!manifest || manifest.facilityId !== receipt.facilityId || manifest.submissionId !== receipt.submissionId || manifest.sha256 !== receipt.sha256 || manifest.byteLength !== receipt.byteLength || manifest.contentType !== receipt.contentType) throw new Error("Stored report does not match its private intake receipt.");
  if (manifest.storage && (manifest.storage.sourceObject !== receipt.storage.sourceObject || manifest.storage.manifestObject !== receipt.storage.manifestObject)) throw new Error("Stored report references do not match its private intake receipt.");
  return manifest;
}

/**
 * Immutable hash receipts are reservations, not leases: any exact-file retry can
 * finish missing objects after a crash, using the first UUID and metadata. All
 * object creation is atomic/create-only. Mutable reviewed manifests are read,
 * never replaced. afterPersist is an injected local-test seam, not an API option.
 */
export async function persistIdempotentIntakeUpload({ facilityId, sha256, bytes, metadata }, repository) {
  if (!FACILITIES.has(facilityId) || !/^[a-f0-9]{64}$/.test(sha256)) throw createHttpError(400, "licensing_intake_scope_invalid", "The licensing community or file checksum is invalid.");
  const { objects, buildManifest, findLegacy, assertCapacity, indexManifest, afterPersist } = repository;
  const receiptName = `${ROOT}/${facilityId}/receipts/sha256/${sha256}.json`;
  const readReceipt = async () => {
    const stored = await objects.read(receiptName, 16 * 1024);
    return stored ? assertReceipt(JSON.parse(stored.toString("utf8")), facilityId, sha256) : null;
  };
  let receipt = await readReceipt();
  let prepared = null;
  let duplicate = true;
  if (!receipt) {
    const legacy = await findLegacy(facilityId, sha256);
    prepared = legacy ?? await buildManifest(metadata);
    const proposed = assertReceipt(receiptFor(prepared), facilityId, sha256);
    // Best-effort preflight: the catalog's conditional update remains definitive
    // when different files arrive concurrently near the existing 8 MiB limit.
    await assertCapacity(prepared);
    const reserved = await objects.create(receiptName, jsonBytes(proposed), "application/json; charset=utf-8");
    receipt = reserved ? proposed : await readReceipt();
    if (!receipt) throw new Error("The private intake receipt could not be read.");
    duplicate = !reserved || Boolean(legacy);
    await afterPersist("receipt", receipt);
  }
  if (bytes.length !== receipt.byteLength || createHash("sha256").update(bytes).digest("hex") !== receipt.sha256) throw new Error("Uploaded bytes do not match the private intake receipt.");
  let stored = await objects.read(receipt.storage.manifestObject, 512 * 1024);
  let manifest = stored ? assertManifest(JSON.parse(stored.toString("utf8")), receipt) : null;
  if (!manifest) {
    if (!prepared || prepared.submissionId !== receipt.submissionId) prepared = await buildManifest(receipt);
    assertManifest(prepared, receipt);
    await assertCapacity(prepared);
    await objects.create(receipt.storage.sourceObject, bytes, receipt.contentType, { facilityId, submissionId: receipt.submissionId, sha256 });
    await afterPersist("source", receipt);
  }
  const source = await objects.read(receipt.storage.sourceObject, 20 * 1024 * 1024);
  if (!source || source.length !== receipt.byteLength || createHash("sha256").update(source).digest("hex") !== receipt.sha256) throw createHttpError(500, "licensing_source_integrity_failed", "The original licensing report did not pass its integrity check. No copy was replaced.");
  if (!manifest) {
    await objects.create(receipt.storage.manifestObject, jsonBytes(prepared), "application/json; charset=utf-8");
    await afterPersist("manifest", prepared);
    stored = await objects.read(receipt.storage.manifestObject, 512 * 1024);
    if (!stored) throw new Error("The stored licensing report could not be read.");
    manifest = assertManifest(JSON.parse(stored.toString("utf8")), receipt);
  }
  // A concurrent review wins over the initial upload projection. Catalog upserts
  // also reject older review revisions, so retries cannot regress the queue.
  await indexManifest({ ...manifest, storage: receipt.storage });
  await afterPersist("catalog", manifest);
  return { manifest, duplicate };
}
