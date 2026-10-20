import { ALAMO_FACILITIES } from "../shared/community-names.mjs";
import { createHttpError } from "./http-errors.mjs";
import { assertLic624SubmissionId, validateLic624ReviewData } from "./lic624-review.mjs";

const ROOT = "licensing/executive-director-intake-v1";
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

export function validateLic624CreateRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => key !== "creationId")) {
    throw createHttpError(400, "lic624_create_invalid", "The new report request is invalid.");
  }
  return { creationId: assertLic624SubmissionId(value.creationId).toLowerCase() };
}

export function createBlankLic624Report(facilityId) {
  const facility = ALAMO_FACILITIES.find((item) => item.facilityId === facilityId);
  if (!facility) throw createHttpError(400, "lic624_create_scope_invalid", "Choose a listed Alamo community.");
  return validateLic624ReviewData({
    facility: { name: facility.communityName, cityStateZip: `${facility.city}, ${facility.state}` },
    residents: [{ name: "", dateOccurred: "", age: "", sex: "", admissionDate: "" }],
    incidentTypes: [], treatment: {}, submission: {}, notifications: []
  });
}

/** Native drafts have an immutable creation record, never a fabricated upload or extraction. */
export async function persistNativeLic624Draft({ facilityId, creationId, actor }, repository) {
  const facility = ALAMO_FACILITIES.find((item) => item.facilityId === facilityId);
  if (!facility) throw createHttpError(400, "lic624_create_scope_invalid", "Choose a listed Alamo community.");
  const submissionId = assertLic624SubmissionId(creationId).toLowerCase();
  const root = `${ROOT}/${facilityId}/native/${submissionId}`;
  const creationObject = `${root}/creation.json`;
  const manifestObject = `${root}/manifest.json`;
  const { objects, assertCapacity, indexManifest, afterPersist } = repository;
  const read = async (name) => {
    const bytes = await objects.read(name, 512 * 1024);
    if (!bytes) return null;
    const record = JSON.parse(bytes.toString("utf8"));
    if (record.origin !== "native" || record.facilityId !== facilityId || record.submissionId !== submissionId
      || record.storage?.manifestObject !== manifestObject || record.storage?.creationObject !== creationObject) {
      throw new Error("Invalid native licensing report.");
    }
    if (record.submittedBy?.tenantId !== actor.tenantId || record.submittedBy?.objectId !== actor.objectId) {
      throw createHttpError(409, "lic624_create_conflict", "This new-report request belongs to another session. Refresh Licensing.");
    }
    return record;
  };
  let creation = await read(creationObject);
  let duplicate = true;
  if (!creation) {
    const createdAt = new Date().toISOString();
    const proposed = {
      version: "executive-director-licensing-intake-v1",
      origin: "native", submissionId, facilityId,
      originalFileName: `LIC 624 - ${facility.shortName} - ${submissionId.slice(0, 8)}`,
      contentType: null, byteLength: 0, sha256: null,
      createdAt, submittedBy: actor, status: "draft",
      storage: { manifestObject, creationObject, sourceObject: null },
      extraction: null, reviewRevision: 0, reviewedAt: null, filedAt: null,
      review: {
        version: "lic624-review-v1", revision: 0, data: createBlankLic624Report(facilityId),
        updatedAt: createdAt, updatedBy: actor, confirmedAt: null, confirmedBy: null
      }
    };
    await assertCapacity(proposed);
    duplicate = !await objects.create(creationObject, jsonBytes(proposed), "application/json; charset=utf-8");
    creation = await read(creationObject);
    if (!creation) throw new Error("The new licensing report could not be read.");
    await afterPersist("creation", creation);
  }
  let manifest = await read(manifestObject);
  if (!manifest) {
    await assertCapacity(creation);
    await objects.create(manifestObject, jsonBytes(creation), "application/json; charset=utf-8");
    await afterPersist("manifest", creation);
    manifest = await read(manifestObject);
    if (!manifest) throw new Error("The new licensing draft could not be read.");
  }
  // Replayed or concurrent creates never replace a subsequently saved review.
  await indexManifest(manifest);
  await afterPersist("catalog", manifest);
  return { ...manifest, duplicate };
}
