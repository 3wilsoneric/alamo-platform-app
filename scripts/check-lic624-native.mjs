import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { handleExecutiveDirectorApiRequest } from "../server/executive-director-api.mjs";
import { assertExecutiveDirectorAccess, resolveExecutiveDirectorFacility } from "../server/executive-director-access.mjs";
import {
  createExecutiveDirectorNativeReport, getExecutiveDirectorIntakeSubmission,
  getExecutiveDirectorIntakeSource, queryExecutiveDirectorIntakeSubmissions,
  saveExecutiveDirectorIntakeReview, toExecutiveDirectorSubmissionDetail
} from "../server/executive-director-intake-storage.mjs";

const root = await mkdtemp(path.join(tmpdir(), "lic624-native-"));
const keys = ["EXECUTIVE_DIRECTOR_INTAKE_STORAGE", "EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT", "NODE_ENV", "VERCEL_ENV", "API_AUTH_REQUIRED"];
const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
Object.assign(process.env, { EXECUTIVE_DIRECTOR_INTAKE_STORAGE: "local", EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT: root, NODE_ENV: "development", API_AUTH_REQUIRED: "false" });
delete process.env.VERCEL_ENV;
const authContext = { authenticated: false };
const create = (creationId, facilityId = "337", options) => createExecutiveDirectorNativeReport({ creationId, facilityId, authContext }, options);
const isCode = (code) => (error) => error?.code === code;

async function api(body, facilityId = "337") {
  const headers = new Map();
  const req = { method: "POST", url: "/api/platform/executive-director/licensing-intake/drafts", body, headers: { host: "localhost", "content-type": "application/json", "x-facility-id": facilityId } };
  const res = { setHeader: (key, value) => headers.set(key, value), getHeader: (key) => headers.get(key), status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await handleExecutiveDirectorApiRequest(req, res);
  assert.match(headers.get("Cache-Control"), /private, no-store/);
  return res;
}

try {
  const creationId = randomUUID();
  const response = await api({ creationId });
  assert.equal(response.statusCode, 201);
  const detail = response.body.submission;
  assert.equal(detail.origin, "native");
  assert.equal(detail.status, "draft");
  assert.equal(detail.sourceData, null);
  assert.equal(detail.extractionSummary, null);
  assert.equal(detail.sha256, null);
  assert.equal(detail.contentType, null);
  assert.equal(detail.draftData.residents[0].name, "");
  assert.equal(detail.draftData.eventNarrative, "");
  assert.equal(detail.draftData.treatment.necessary, null);
  assert.equal(detail.draftData.submission.reviewedBy, "");
  assert.equal(detail.draftData.notifications.some((item) => item.selected), false);
  assert.ok(detail.draftData.facility.name);
  assert.ok(detail.reviewIssues.length);
  assert.equal((await api({ creationId })).statusCode, 200);
  assert.equal((await api({ creationId, facilityId: "344" })).statusCode, 400);
  assert.equal((await api({ creationId: "../../escape" })).statusCode, 400);
  assert.equal((await api({ creationId: "x".repeat(1500) })).statusCode, 413);
  assert.equal((await api({ creationId: randomUUID() }, "invalid")).statusCode, 400);
  process.env.API_AUTH_REQUIRED = "true";
  assert.equal((await api({ creationId: randomUUID() })).statusCode, 401);
  process.env.API_AUTH_REQUIRED = "false";
  const restricted = assertExecutiveDirectorAccess({ authenticated: true, claims: { roles: ["Alamo.ExecutiveDirector.SanPablo"] } });
  assert.equal(resolveExecutiveDirectorFacility(restricted, "337"), "337");
  assert.throws(() => resolveExecutiveDirectorFacility(restricted, "344"), isCode("executive_director_facility_denied"));
  await assert.rejects(getExecutiveDirectorIntakeSubmission("344", creationId), isCode("licensing_intake_not_found"));
  await assert.rejects(getExecutiveDirectorIntakeSource("337", creationId), isCode("licensing_source_not_found"));
  await assert.rejects(createExecutiveDirectorNativeReport({ facilityId: "337", creationId, authContext: { authenticated: true, claims: { tid: "synthetic-tenant", oid: "other-author" } } }), isCode("lic624_create_conflict"));

  const data = structuredClone(detail.draftData);
  data.eventNarrative = "Synthetic native-report draft: no real incident.";
  const request = { facilityId: "337", submissionId: creationId, data, expectedRevision: 0, confirm: false, authContext };
  const concurrentSaves = await Promise.allSettled([saveExecutiveDirectorIntakeReview(request), saveExecutiveDirectorIntakeReview(request)]);
  assert.equal(concurrentSaves.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(concurrentSaves.find((item) => item.status === "rejected").reason.code, "lic624_review_conflict");
  const replay = await create(creationId);
  assert.equal(replay.reviewRevision, 1);
  assert.equal(replay.review.data.eventNarrative, data.eventNarrative);
  await assert.rejects(saveExecutiveDirectorIntakeReview({ ...request, expectedRevision: 1, confirm: true }), isCode("lic624_review_incomplete"));
  data.facility.fileNumber = "SYNTHETIC-ONLY";
  data.residents[0] = { name: "Synthetic Resident", dateOccurred: "10/13/2026", age: "", sex: "", admissionDate: "" };
  data.incidentTypes = [{ key: "other", label: "Other" }];
  data.immediateAction = "Synthetic demonstration only.";
  data.submission = { submittedBy: "Synthetic Author", submittedDate: "10/13/2026", reviewedBy: "Synthetic Reviewer", reviewedDate: "10/13/2026" };
  const confirmed = await saveExecutiveDirectorIntakeReview({ ...request, data, expectedRevision: 1, confirm: true });
  assert.equal(confirmed.status, "ready_to_file");
  assert.equal(confirmed.filedAt, null);
  assert.equal(toExecutiveDirectorSubmissionDetail(await getExecutiveDirectorIntakeSubmission("337", creationId)).confirmedAt, confirmed.review.confirmedAt);
  const revised = await saveExecutiveDirectorIntakeReview({ ...request, data: { ...data, plannedAction: "Synthetic correction" }, expectedRevision: 2 });
  assert.equal(revised.status, "draft");
  assert.equal(revised.review.confirmedAt, null);
  const creationRecord = JSON.parse(await readFile(path.join(root, "337", "native", creationId, "creation.json"), "utf8"));
  assert.equal(creationRecord.review.data.eventNarrative, "");
  assert.equal((await readdir(path.join(root, "337", "native", creationId, "reviews"))).length, 3);

  const repeatedId = randomUUID();
  const simultaneous = await Promise.all(Array.from({ length: 8 }, () => create(repeatedId)));
  assert.equal(new Set(simultaneous.map((item) => item.submissionId)).size, 1);
  for (const stage of ["creation", "manifest", "catalog"]) {
    const id = randomUUID();
    await assert.rejects(create(id, "337", { afterPersist: async (current) => { if (current === stage) throw new Error("synthetic interruption"); } }), /synthetic interruption/);
    assert.equal((await create(id)).submissionId, id);
  }
  const catalog = await queryExecutiveDirectorIntakeSubmissions({ facilityId: "337", status: "draft" });
  assert.equal(catalog.summary.drafts, 5);
  assert.equal(catalog.filteredTotal, 5);
  assert.ok(catalog.submissions.every((item) => !item.storage && item.origin === "native"));
  const found = await queryExecutiveDirectorIntakeSubmissions({ facilityId: "337", query: creationId.slice(0, 8) });
  assert.equal(found.filteredTotal, 1);
  assert.equal((await queryExecutiveDirectorIntakeSubmissions({ facilityId: "344" })).summary.total, 0);
  const files = await readdir(path.join(root, "337"), { recursive: true });
  assert.equal(files.some((name) => /source\.(pdf|png|jpg)$/.test(name)), false);
  console.log("Native LIC 624 checks passed: create/retry/reopen, scope/auth, incomplete drafts, confirmation, immutable creation audit, concurrent saves and creates, and interrupted-write recovery; local synthetic storage only.");
} finally {
  for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await rm(root, { recursive: true, force: true });
}
