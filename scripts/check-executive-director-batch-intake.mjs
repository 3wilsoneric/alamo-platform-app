#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { handleExecutiveDirectorApiRequest } from "../server/executive-director-api.mjs";
import {
  createExecutiveDirectorIntakeSubmission,
  EXECUTIVE_DIRECTOR_INTAKE_MAX_BYTES,
  getExecutiveDirectorIntakeOverview,
  getExecutiveDirectorIntakeSource,
  getExecutiveDirectorIntakeSubmission,
  saveExecutiveDirectorIntakeReview,
  toExecutiveDirectorSubmissionDetail
} from "../server/executive-director-intake-storage.mjs";
import { extractLic624Report } from "../server/lic624-extraction.mjs";

// Every write in this check is restricted to one disposable, synthetic-only root.
// No Azure, Databricks, real licensing files or network requests are permitted.
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "alamo-batch-intake-qa-"));
const environmentBefore = Object.fromEntries(["EXECUTIVE_DIRECTOR_INTAKE_STORAGE", "EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT", "NODE_ENV", "VERCEL_ENV", "API_AUTH_REQUIRED"].map((key) => [key, process.env[key]]));
const fetchBefore = globalThis.fetch;
process.env.EXECUTIVE_DIRECTOR_INTAKE_STORAGE = "local";
process.env.EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT = temporaryRoot;
process.env.NODE_ENV = "test";
process.env.VERCEL_ENV = "";
process.env.API_AUTH_REQUIRED = "false";
globalThis.fetch = async () => { throw new Error("Network is prohibited in synthetic batch-intake QA."); };
const authContext = { authenticated: false };
const storagePrefix = "licensing/executive-director-intake-v1/";
const completed = [];

async function fixturePdf(label) {
  const document = await PDFDocument.create();
  document.addPage([612, 792]).drawText(`Synthetic batch QA: ${label}`, { x: 30, y: 730, size: 12 });
  const form = document.getForm();
  for (const [name, value] of Object.entries({
    Facility: "Synthetic Test Community",
    "Facility File Number": "123456789",
    "Name of client's residents involved1": "Synthetic Resident",
    "Date Occurred": "10/09/2026",
    "Describe event or incident. include time, date, perpetrator, nature of incident, any antecedents leading up to incident and how clients were affected including any injuries": `Synthetic narrative ${label}.`,
    "Explain what immediate action was taken, (include persons contacted)": "Synthetic safety check.",
    "Name and title section1": "Synthetic Submitter",
    "Name and Date1": "10/09/2026",
    "Name and Title section2": "Synthetic Reviewer",
    "Name and Date2": "10/09/2026"
  })) form.createTextField(name).setText(value);
  form.createCheckBox("Type of Incident").check();
  return Buffer.from(await document.save());
}

function requestFor(bytes, name = "synthetic-report.pdf", contentType = "application/pdf") {
  return { body: bytes, headers: { "content-type": contentType, "x-file-name": name } };
}

function upload(bytes, { facilityId = "344", name, contentType } = {}, dependencies) {
  return createExecutiveDirectorIntakeSubmission({ req: requestFor(bytes, name, contentType), facilityId, authContext }, dependencies);
}

function uploadInFreshProcess(bytes, index) {
  const code = `import { createExecutiveDirectorIntakeSubmission } from './server/executive-director-intake-storage.mjs';
globalThis.fetch = async () => { throw new Error('Network prohibited'); };
const result = await createExecutiveDirectorIntakeSubmission({ req: { body: Buffer.from(${JSON.stringify(bytes.toString("base64"))}, 'base64'), headers: { 'content-type': 'application/pdf', 'x-file-name': 'process-${index}.pdf' } }, facilityId: '345', authContext: { authenticated: false } });
console.log(JSON.stringify({submissionId:result.submissionId,duplicate:result.duplicate}));`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
      cwd: process.cwd(),
      env: { NODE_ENV: "test", EXECUTIVE_DIRECTOR_INTAKE_STORAGE: "local", EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT: temporaryRoot },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Synthetic subprocess upload failed (${code}): ${stderr}`));
      else { try { resolve(JSON.parse(stdout.trim())); } catch (error) { reject(error); } }
    });
  });
}

async function fileInventory(root = temporaryRoot) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
    const fileName = path.join(entry.parentPath, entry.name);
    return [path.relative(root, fileName), createHash("sha256").update(await readFile(fileName)).digest("hex")];
  })).then((items) => items.sort(([left], [right]) => left.localeCompare(right)));
}

async function apiUpload(bytes, name, facilityId = "344") {
  const req = { ...requestFor(bytes, name), method: "POST", url: "/api/platform/executive-director/licensing-intake" };
  req.headers["x-facility-id"] = facilityId;
  const headers = new Map();
  const res = { setHeader: (key, value) => headers.set(key, value), getHeader: (key) => headers.get(key), status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handleExecutiveDirectorApiRequest(req, res);
  assert.match(headers.get("Cache-Control"), /private, no-store/);
  return res;
}

try {
  const pdf = await fixturePdf("sequential");
  const first = await upload(pdf);
  assert.equal(first.duplicate, false);
  assert.equal(first.status, "needs_review");
  const originalInventory = await fileInventory();
  const duplicate = await upload(pdf, { name: "renamed-identical-report.pdf" });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.submissionId, first.submissionId);
  assert.equal(duplicate.originalFileName, first.originalFileName, "Duplicate attempts must preserve the first receipt metadata.");
  assert.equal((await getExecutiveDirectorIntakeOverview("344")).summary.total, 1);
  assert.deepEqual(await fileInventory(), originalInventory, "A completed duplicate must not rewrite its original, manifest, receipt, or catalog.");
  completed.push("sequential exact-byte duplicate preserves receipt and catalog");

  const concurrentPdf = await fixturePdf("concurrent");
  const concurrent = await Promise.all(Array.from({ length: 12 }, (_, index) => upload(concurrentPdf, { name: `concurrent-${index}.pdf` })));
  assert.equal(new Set(concurrent.map((item) => item.submissionId)).size, 1);
  assert.equal(concurrent.filter((item) => !item.duplicate).length, 1);
  assert.equal((await getExecutiveDirectorIntakeOverview("344")).summary.total, 2);
  const concurrentId = concurrent[0].submissionId;
  const concurrentFiles = (await fileInventory()).filter(([fileName]) => fileName.includes(concurrentId));
  assert.equal(concurrentFiles.filter(([fileName]) => fileName.endsWith("manifest.json")).length, 1);
  assert.equal(concurrentFiles.filter(([fileName]) => fileName.endsWith("source.pdf")).length, 1);
  completed.push("12 concurrent duplicate requests create one original and one manifest");

  const processPdf = await fixturePdf("multi-process");
  const processResults = await Promise.all(Array.from({ length: 4 }, (_, index) => uploadInFreshProcess(processPdf, index)));
  assert.equal(new Set(processResults.map((item) => item.submissionId)).size, 1, "Independent processes must use the same durable receipt, not process-local deduplication.");
  assert.equal(processResults.filter((item) => !item.duplicate).length, 1);
  assert.equal((await getExecutiveDirectorIntakeOverview("345")).summary.total, 1);
  completed.push("four independent processes converge on one durable receipt");
  const distinctProcessPdfs = await Promise.all(Array.from({ length: 4 }, (_, index) => fixturePdf(`distinct-process-${index}`)));
  const distinctProcessResults = await Promise.all(distinctProcessPdfs.map((bytes, index) => uploadInFreshProcess(bytes, index + 10)));
  assert.equal(new Set(distinctProcessResults.map((item) => item.submissionId)).size, 4);
  assert.equal(distinctProcessResults.every((item) => !item.duplicate), true);
  const distinctCatalog = await getExecutiveDirectorIntakeOverview("345");
  assert.equal(distinctCatalog.summary.total, 5, "Concurrent different-file uploads must not lose another process's catalog update.");
  for (const result of distinctProcessResults) assert.ok(distinctCatalog.submissions.some((item) => item.submissionId === result.submissionId));
  completed.push("independent different-file uploads preserve every catalog record");

  const deadPid = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(child.pid) : reject(new Error("Synthetic lock-owner process failed.")));
  });
  assert.throws(() => process.kill(deadPid, 0), (error) => error.code === "ESRCH");
  const lockDirectory = path.join(temporaryRoot, "345", ".catalog-lock");
  await mkdir(lockDirectory);
  await writeFile(path.join(lockDirectory, `${deadPid}-${randomUUID()}.json`), JSON.stringify({ pid: deadPid, host: hostname() }), { flag: "wx" });
  await upload(await fixturePdf("dead-owner-recovery"), { facilityId: "345" });
  assert.equal((await getExecutiveDirectorIntakeOverview("345")).summary.total, 6);
  assert.equal((await readdir(path.join(temporaryRoot, "345"))).some((name) => name.startsWith(".catalog-lock")), false);
  await mkdir(lockDirectory);
  await upload(await fixturePdf("empty-lock-recovery"), { facilityId: "345" });
  assert.equal((await getExecutiveDirectorIntakeOverview("345")).summary.total, 7);
  completed.push("dead process and crash-empty catalog locks recover safely");

  await mkdir(lockDirectory);
  const liveOwnerFile = path.join(lockDirectory, `${process.pid}-${randomUUID()}.json`);
  const liveOwner = JSON.stringify({ pid: process.pid, host: hostname() });
  await writeFile(liveOwnerFile, liveOwner, { flag: "wx" });
  const beforeBusy = Date.now();
  await assert.rejects(() => upload(processPdf, { facilityId: "345" }), (error) => error.statusCode === 503 && error.code === "licensing_catalog_busy");
  assert.ok(Date.now() - beforeBusy < 10_000, "A live lock must yield a bounded retryable response.");
  assert.equal(await readFile(liveOwnerFile, "utf8"), liveOwner, "A timeout must never steal a live process's lock.");
  await rm(lockDirectory, { recursive: true });
  completed.push("live catalog locks time out without stealing the owner");

  const otherFacility = await upload(pdf, { facilityId: "337" });
  assert.equal(otherFacility.duplicate, false);
  assert.notEqual(otherFacility.submissionId, first.submissionId);
  assert.equal(otherFacility.sha256, first.sha256);
  assert.equal((await getExecutiveDirectorIntakeOverview("337")).summary.total, 1);
  await assert.rejects(() => getExecutiveDirectorIntakeSource("337", first.submissionId), (error) => error.statusCode === 404);
  completed.push("same hash in another facility creates an independent scoped receipt");

  const draft = toExecutiveDirectorSubmissionDetail(first).draftData;
  draft.facility.telephone = "209-555-0199";
  draft.incidentTypes = [{ key: "unauthorized_absence", label: "Unauthorized absence" }];
  await saveExecutiveDirectorIntakeReview({ facilityId: "344", submissionId: first.submissionId, expectedRevision: 0, data: draft, confirm: false, authContext });
  const skewedCatalogPath = path.join(temporaryRoot, "344", "catalog.json");
  const skewedCatalog = JSON.parse(await readFile(skewedCatalogPath, "utf8"));
  const skewedRecord = skewedCatalog.submissions.find((item) => item.submissionId === first.submissionId);
  assert.equal(skewedRecord.reviewRevision, 1);
  skewedRecord.updatedAt = "2099-01-01T00:00:00.000Z";
  await writeFile(skewedCatalogPath, `${JSON.stringify(skewedCatalog, null, 2)}\n`);
  await saveExecutiveDirectorIntakeReview({ facilityId: "344", submissionId: first.submissionId, expectedRevision: 1, data: draft, confirm: true, authContext });
  const projectedReview = JSON.parse(await readFile(skewedCatalogPath, "utf8")).submissions.find((item) => item.submissionId === first.submissionId);
  assert.equal(projectedReview.reviewRevision, 2, "A higher logical review revision must supersede a future timestamp on an older catalog record.");
  assert.equal(projectedReview.status, "ready_to_file");
  assert.notEqual(projectedReview.updatedAt, skewedRecord.updatedAt);
  completed.push("newer review revisions supersede clock-skewed catalog timestamps");
  const reviewedManifest = await getExecutiveDirectorIntakeSubmission("344", first.submissionId);
  const reviewedInventory = await fileInventory();
  const reviewedDuplicate = await upload(pdf, { name: "renamed-reviewed-report.pdf" });
  assert.equal(reviewedDuplicate.duplicate, true);
  assert.equal(reviewedDuplicate.status, "ready_to_file");
  assert.equal(reviewedDuplicate.reviewRevision, 2);
  assert.deepEqual(reviewedDuplicate.review, reviewedManifest.review);
  assert.deepEqual(await fileInventory(), reviewedInventory, "Re-uploading reviewed bytes must preserve both review audits and the saved manifest byte-for-byte.");
  assert.deepEqual((await getExecutiveDirectorIntakeSource("344", first.submissionId)).bytes, pdf);
  completed.push("reviewed duplicates preserve draft, confirmation, immutable original, and audit history");

  const legacyPdf = await fixturePdf("legacy");
  const legacyId = randomUUID();
  const legacyPath = `343/2025/${legacyId}`;
  const legacyDirectory = path.join(temporaryRoot, legacyPath);
  const legacyManifest = {
    version: "executive-director-licensing-intake-v1", submissionId: legacyId, facilityId: "343",
    originalFileName: "legacy-original.pdf", contentType: "application/pdf", byteLength: legacyPdf.byteLength,
    sha256: createHash("sha256").update(legacyPdf).digest("hex"), createdAt: "2025-01-02T12:00:00.000Z",
    submittedBy: { tenantId: null, objectId: "synthetic-legacy-actor" }, status: "needs_review",
    extraction: await extractLic624Report(legacyPdf, "application/pdf"), review: null, reviewRevision: 0, reviewedAt: null, filedAt: null,
    storage: { sourceObject: `${storagePrefix}${legacyPath}/source.pdf`, manifestObject: `${storagePrefix}${legacyPath}/manifest.json` }
  };
  await mkdir(legacyDirectory, { recursive: true });
  await writeFile(path.join(legacyDirectory, "source.pdf"), legacyPdf, { flag: "wx" });
  await writeFile(path.join(legacyDirectory, "manifest.json"), `${JSON.stringify(legacyManifest, null, 2)}\n`, { flag: "wx" });
  const legacyDraft = toExecutiveDirectorSubmissionDetail(legacyManifest).draftData;
  legacyDraft.facility.telephone = "555-0101";
  await saveExecutiveDirectorIntakeReview({ facilityId: "343", submissionId: legacyId, expectedRevision: 0, data: legacyDraft, confirm: false, authContext });
  const legacyBefore = await fileInventory(legacyDirectory);
  const legacyDuplicate = await upload(legacyPdf, { facilityId: "343", name: "legacy-renamed.pdf" });
  assert.equal(legacyDuplicate.duplicate, true);
  assert.equal(legacyDuplicate.submissionId, legacyId);
  assert.equal(legacyDuplicate.originalFileName, "legacy-original.pdf");
  assert.equal(legacyDuplicate.reviewRevision, 1);
  assert.equal(legacyDuplicate.review.data.facility.telephone, "555-0101");
  assert.deepEqual(await fileInventory(legacyDirectory), legacyBefore);
  assert.equal((await getExecutiveDirectorIntakeOverview("343")).summary.total, 1);
  completed.push("legacy receipt adoption preserves existing reviewed manifest and original");

  const beforeInvalid = await fileInventory();
  for (const [bytes, options, status] of [
    [Buffer.from("not a PDF"), {}, 400],
    [Buffer.alloc(0), {}, 400],
    [Buffer.alloc(EXECUTIVE_DIRECTOR_INTAKE_MAX_BYTES + 1), {}, 413],
    [pdf, { contentType: "text/plain" }, 415],
    [pdf, { name: "" }, 400]
  ]) await assert.rejects(() => upload(bytes, options), (error) => error.statusCode === status);
  assert.deepEqual(await fileInventory(), beforeInvalid, "Rejected input must not create any source, receipt, manifest, or catalog entry.");
  completed.push("invalid signatures, empty/oversized files, unsupported types and names are not stored");

  for (const stage of ["receipt", "source", "manifest", "catalog"]) {
    const recoveryPdf = await fixturePdf(`recover-after-${stage}`);
    const hash = createHash("sha256").update(recoveryPdf).digest("hex");
    const receiptPath = path.join(temporaryRoot, "344", "receipts", "sha256", `${hash}.json`);
    const totalBefore = (await getExecutiveDirectorIntakeOverview("344")).summary.total;
    let interruptedId = null;
    await assert.rejects(() => upload(recoveryPdf, { name: `first-${stage}.pdf` }, {
      afterPersist: async (completedStage, record) => {
        if (completedStage === stage) { interruptedId = record.submissionId; throw new Error(`Synthetic stop after ${stage}`); }
      }
    }), new RegExp(`Synthetic stop after ${stage}`));
    const receiptBefore = await readFile(receiptPath);
    const receipt = JSON.parse(receiptBefore.toString("utf8"));
    assert.equal(receipt.submissionId, interruptedId);
    assert.equal(receipt.originalFileName, `first-${stage}.pdf`);
    if (stage === "manifest") {
      const catalog = JSON.parse(await readFile(path.join(temporaryRoot, "344", "catalog.json"), "utf8"));
      assert.equal(catalog.submissions.some((item) => item.submissionId === interruptedId), false, "This fixture must really stop after the durable manifest and before catalog publication.");
    }
    const recovered = await upload(recoveryPdf, { name: `retry-${stage}.pdf` });
    assert.equal(recovered.duplicate, true);
    assert.equal(recovered.submissionId, interruptedId);
    assert.equal(recovered.originalFileName, `first-${stage}.pdf`);
    assert.deepEqual(await readFile(receiptPath), receiptBefore, "Recovery must reuse the original durable reservation.");
    assert.deepEqual((await getExecutiveDirectorIntakeSource("344", interruptedId)).bytes, recoveryPdf);
    assert.equal((await getExecutiveDirectorIntakeOverview("344")).summary.total, totalBefore + 1);
    const recoveryFiles = (await fileInventory()).filter(([fileName]) => fileName.includes(interruptedId));
    assert.equal(recoveryFiles.filter(([fileName]) => fileName.endsWith("manifest.json")).length, 1);
    assert.equal(recoveryFiles.filter(([fileName]) => fileName.endsWith("source.pdf")).length, 1);
    completed.push(`retry recovers interrupted ${stage} step without a second receipt`);
  }

  const apiPdf = await fixturePdf("http-contract");
  const created = await apiUpload(apiPdf, "http-first.pdf");
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.duplicate, false);
  const repeated = await apiUpload(apiPdf, "http-duplicate.pdf");
  assert.equal(repeated.statusCode, 200);
  assert.equal(repeated.body.duplicate, true);
  assert.equal(repeated.body.submission.submissionId, created.body.submission.submissionId);
  assert.equal("duplicate" in repeated.body.submission, false, "Duplicate is response receipt metadata, not persisted review data.");
  completed.push("HTTP201 new / HTTP200 duplicate contract");

  const ambiguousPdf = await fixturePdf("ambiguous-legacy");
  for (const index of [1, 2]) {
    const submissionId = randomUUID();
    const location = `342/2025/${submissionId}`;
    const directory = path.join(temporaryRoot, location);
    const manifest = {
      ...legacyManifest,
      facilityId: "342", submissionId, originalFileName: `ambiguous-legacy-${index}.pdf`,
      sha256: createHash("sha256").update(ambiguousPdf).digest("hex"), byteLength: ambiguousPdf.byteLength,
      extraction: await extractLic624Report(ambiguousPdf, "application/pdf"),
      storage: { sourceObject: `${storagePrefix}${location}/source.pdf`, manifestObject: `${storagePrefix}${location}/manifest.json` }
    };
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "source.pdf"), ambiguousPdf, { flag: "wx" });
    await writeFile(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  }
  assert.equal((await getExecutiveDirectorIntakeOverview("342")).summary.total, 2);
  const ambiguousBefore = await fileInventory();
  await assert.rejects(() => upload(ambiguousPdf, { facilityId: "342" }), (error) => error.statusCode === 409 && error.code === "licensing_duplicate_ambiguous");
  assert.deepEqual(await fileInventory(), ambiguousBefore, "Ambiguous legacy matches must not choose, merge, overwrite, or create another copy.");
  completed.push("ambiguous legacy duplicates fail closed without changing stored records");

  const rebuildBefore = await getExecutiveDirectorIntakeOverview("345");
  const sourceInventoryBeforeRebuild = (await fileInventory()).filter(([name]) => name !== "345/catalog.json");
  await rm(path.join(temporaryRoot, "345", "catalog.json"));
  const repair = await upload(processPdf, { facilityId: "345" });
  assert.equal(repair.duplicate, true);
  const rebuilt = await getExecutiveDirectorIntakeOverview("345");
  assert.equal(rebuilt.summary.total, rebuildBefore.summary.total);
  assert.deepEqual(rebuilt.submissions.map((item) => item.submissionId).sort(), rebuildBefore.submissions.map((item) => item.submissionId).sort(), "Repairing one receipt must rebuild every existing submission, not hide unrelated reports.");
  assert.deepEqual((await fileInventory()).filter(([name]) => name !== "345/catalog.json"), sourceInventoryBeforeRebuild);
  completed.push("missing catalog recovery retains every unrelated stored report");

  const scopedReceiptPath = path.join(temporaryRoot, "337", "receipts", "sha256", `${first.sha256}.json`);
  const scopedReceiptBytes = await readFile(scopedReceiptPath);
  const tamperedReceipt = { ...JSON.parse(scopedReceiptBytes.toString("utf8")), storage: first.storage };
  await writeFile(scopedReceiptPath, JSON.stringify(tamperedReceipt));
  const tamperedInventory = await fileInventory();
  await assert.rejects(() => upload(pdf, { facilityId: "337" }), /Invalid private intake receipt references/);
  assert.deepEqual(await fileInventory(), tamperedInventory, "A receipt pointing into another facility must not read-repair or overwrite either facility's objects.");
  await writeFile(scopedReceiptPath, scopedReceiptBytes);
  completed.push("cross-facility receipt references are rejected before recovery");

  const sourcePath = path.join(temporaryRoot, first.storage.sourceObject.replace(storagePrefix, ""));
  await writeFile(sourcePath, Buffer.concat([pdf, Buffer.from("\n% simulated stored-source corruption\n")]));
  const corruptBefore = await fileInventory();
  await assert.rejects(() => upload(pdf), (error) => error.statusCode === 500 && error.code === "licensing_source_integrity_failed");
  assert.deepEqual(await fileInventory(), corruptBefore, "A duplicate must not silently replace a failed-integrity original or its reviewed manifest.");
  completed.push("failed-integrity originals are not replaced by duplicate retries");

  console.log(JSON.stringify({ passed: true, syntheticOnly: true, networkRequests: 0, checks: completed }, null, 2));
} finally {
  try {
    assert.ok(temporaryRoot.startsWith(path.join(tmpdir(), "alamo-batch-intake-qa-")));
    await rm(temporaryRoot, { recursive: true, force: true });
  } finally {
    for (const [key, value] of Object.entries(environmentBefore)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.fetch = fetchBefore;
  }
}
