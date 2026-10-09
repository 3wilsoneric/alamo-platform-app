#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import {
  LIC624_FORM_DEFINITION,
  LIC624_INCIDENT_TYPE_FIELDS,
  LIC624_NOTIFICATION_FIELDS
} from "../shared/lic624-contracts.mjs";
import { extractLic624Report, summarizeLic624Extraction } from "../server/lic624-extraction.mjs";
import { getLic624ReviewIssues, validateLic624ReviewData, validateLic624ReviewRequest } from "../server/lic624-review.mjs";
import { BASE_URL, attachPageDiagnostics, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";

const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-executive-director-licensing");
const auditFindings = [];
const auditMeasurements = [];
const API_PREFIX = "/api/platform/executive-director";
const FIXTURE_TIME = "2026-10-09T16:00:00.000Z";
const UPLOAD_NAME = "uploaded-incident-review.pdf";
const REPORT_NAMES = ["community-incident-october-08.pdf", "community-follow-up-october-07.pdf", "scanned-report-awaiting-ocr.png"];
const FORM = {
  ...LIC624_FORM_DEFINITION,
  incidentTypes: LIC624_INCIDENT_TYPE_FIELDS.map(({ key, label }) => ({ key, label })),
  notifications: LIC624_NOTIFICATION_FIELDS
};
const FACILITY = { facilityId: "337", communityName: "Alamo San Pablo", shortName: "San Pablo", city: "San Pablo", state: "CA" };

async function createFixturePdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  page.drawText("Synthetic LIC 624 browser QA fixture", { x: 40, y: 740, size: 16 });
  const form = document.getForm();
  const values = {
    Facility: "Alamo San Pablo",
    "Facility File Number": "079201030",
    Phone: "510-555-0100",
    Address: "100 Fixture Way",
    "City State": "San Pablo, CA 94806",
    "Name of client's residents involved1": "Test Resident",
    "Date Occurred": "10/08/2026",
    Age: "42",
    Sex: "Not recorded",
    "Date of Admission": "04/12/2026",
    "Describe event or incident. include time, date, perpetrator, nature of incident, any antecedents leading up to incident and how clients were affected including any injuries": "Synthetic incident narrative for browser verification.",
    "Explain what immediate action was taken, (include persons contacted)": "Staff completed the documented safety check.",
    "Name and title section1": "Test Submitter",
    "Name and Date1": "10/08/2026"
  };
  for (const [name, value] of Object.entries(values)) form.createTextField(name).setText(value);
  const incidentType = form.createCheckBox("Type of Incident");
  incidentType.addToPage(page, { x: 40, y: 700, width: 16, height: 16 });
  incidentType.check();
  return Buffer.from(await document.save());
}

const sourceBytes = await createFixturePdf();
const extraction = await extractLic624Report(sourceBytes, "application/pdf");
assert.equal(extraction.status, "needs_review");
const sourceData = validateLic624ReviewData(extraction.data);
assert.deepEqual(sourceData.incidentTypes, [{ key: "unauthorized_absence", label: "Unauthorized absence" }]);

function createSubmission(index, originalFileName, status = "needs_review") {
  const reviewable = status !== "ocr_required";
  return {
    submissionId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    facilityId: FACILITY.facilityId,
    originalFileName,
    contentType: reviewable ? "application/pdf" : "image/png",
    byteLength: sourceBytes.byteLength,
    sha256: createHash("sha256").update(sourceBytes).digest("hex"),
    createdAt: new Date(Date.UTC(2026, 9, 10 - index, 16)).toISOString(),
    status,
    extractionSummary: reviewable ? summarizeLic624Extraction(extraction) : { form: "LIC624", method: "ocr_required", status, confidence: null, extractedFieldCount: 0, reviewIssueCount: 1 },
    reviewedAt: null,
    filedAt: null,
    sourceData: reviewable ? structuredClone(sourceData) : null,
    draftData: reviewable ? structuredClone(sourceData) : null,
    reviewIssues: reviewable ? getLic624ReviewIssues(sourceData) : ["Image uploads require the server-side OCR stage."],
    reviewRevision: 0,
    reviewUpdatedAt: null,
    confirmedAt: null
  };
}

function summarizeSubmission({ sourceData: _source, draftData: _draft, reviewIssues: _issues, reviewRevision: _revision, reviewUpdatedAt: _updated, confirmedAt: _confirmed, ...summary }) {
  return summary;
}

function createFixtureState() {
  const submissions = new Map(REPORT_NAMES.map((name, index) => {
    const submission = createSubmission(index + 1, name, index === 2 ? "ocr_required" : "needs_review");
    return [submission.submissionId, submission];
  }));
  for (let index = 5; index <= 27; index += 1) {
    const submission = createSubmission(index, `additional-report-${String(index).padStart(2, "0")}.pdf`);
    submissions.set(submission.submissionId, submission);
  }
  return { submissions, uploads: [], uploadPlans: new Map(), uploadAttempts: new Map(), activeUploads: 0, maxActiveUploads: 0, reviews: [], sources: [], listRequests: [], unexpectedRequests: [], catalogRevision: 1, bootstrapUnavailable: false, reviewGate: null, uploadGate: null, openGate: null };
}

function intakeSummary(submissions) {
  const rows = [...submissions.values()];
  return {
    total: rows.length,
    ocrRequired: rows.filter((row) => row.status === "ocr_required").length,
    needsReview: rows.filter((row) => row.status === "needs_review").length,
    readyToFile: rows.filter((row) => row.status === "ready_to_file").length,
    filed: rows.filter((row) => row.status === "filed").length,
    failed: rows.filter((row) => row.status === "failed").length
  };
}

function sortedSubmissions(state) {
  return [...state.submissions.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function installFixtures(context, state) {
  await context.route("**/api/**", async (route) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
      state.unexpectedRequests.push(`${route.request().method()} ${route.request().url()}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  await context.route(`**${API_PREFIX}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    try {
      assert.equal(url.searchParams.get("facilityId") ?? request.headers()["x-facility-id"], FACILITY.facilityId);
      if (method === "GET" && url.pathname === `${API_PREFIX}/bootstrap`) {
        if (state.bootstrapUnavailable) return json({ error: "Fixture bootstrap temporarily unavailable." }, 503);
        return json({
          version: "executive-director-workspace-v1", facility: FACILITY,
          dashboard: { status: "ready", generatedAt: FIXTURE_TIME, residents: 153, reportingMonth: "2026-10" },
          intake: { summary: intakeSummary(state.submissions), submissions: sortedSubmissions(state).map(summarizeSubmission) }, form: FORM
        });
      }
      if (method === "GET" && url.pathname === `${API_PREFIX}/licensing-intake/submissions`) {
        const status = url.searchParams.get("status") ?? "";
        const query = (url.searchParams.get("q") ?? "").toLowerCase();
        const filtered = sortedSubmissions(state).filter((row) => (!status || row.status === status) && row.originalFileName.toLowerCase().includes(query));
        const start = Number(url.searchParams.get("cursor") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? 25);
        const rows = filtered.slice(start, start + limit);
        state.listRequests.push({ status, query, cursor: url.searchParams.get("cursor"), catalogRevision: state.catalogRevision });
        return json({ version: "executive-director-intake-catalog-v1", facilityId: FACILITY.facilityId, catalogRevision: state.catalogRevision, updatedAt: FIXTURE_TIME, summary: intakeSummary(state.submissions), filteredTotal: filtered.length, submissions: rows.map(summarizeSubmission), nextCursor: start + rows.length < filtered.length ? String(start + rows.length) : null });
      }
      if (method === "POST" && url.pathname === `${API_PREFIX}/licensing-intake`) {
        const fileName = request.headers()["x-file-name"];
        const plan = state.uploadPlans.get(fileName) ?? (fileName === UPLOAD_NAME ? { index: 4, bytes: sourceBytes, contentType: "application/pdf" } : null);
        assert.ok(plan, "Only explicitly configured synthetic files may be uploaded.");
        assert.equal(request.headers()["content-type"], plan.contentType);
        assert.deepEqual(request.postDataBuffer(), plan.bytes);
        const attempt = (state.uploadAttempts.get(fileName) ?? 0) + 1;
        state.uploadAttempts.set(fileName, attempt);
        const duplicate = Boolean(plan.duplicateOf);
        const submission = duplicate ? state.submissions.get(plan.duplicateOf) : { ...createSubmission(plan.index, fileName, plan.status), createdAt: FIXTURE_TIME, contentType: plan.contentType, byteLength: plan.bytes.byteLength, sha256: createHash("sha256").update(plan.bytes).digest("hex") };
        assert.ok(submission, "A duplicate must refer to an existing fixture report.");
        state.uploads.push({ submissionId: submission.submissionId, fileName, bytes: request.postDataBuffer().byteLength, attempt, duplicate });
        state.activeUploads += 1;
        state.maxActiveUploads = Math.max(state.maxActiveUploads, state.activeUploads);
        try {
          if (state.uploadGate) await state.uploadGate;
          if (attempt <= (plan.failures ?? 0)) return await json({ error: "Synthetic upload temporarily unavailable." }, 503);
          if (!duplicate) {
            state.submissions.set(submission.submissionId, submission);
            state.catalogRevision += 1;
          }
          return await json({ version: "executive-director-licensing-intake-v1", submission, form: FORM, duplicate }, duplicate ? 200 : 201);
        } finally {
          state.activeUploads -= 1;
        }
      }
      if (method === "GET" && url.pathname === `${API_PREFIX}/licensing-intake`) {
        const submission = state.submissions.get(url.searchParams.get("submissionId"));
        assert.ok(submission, "Only fixture reports may be opened.");
        if (state.openGate) await state.openGate;
        return json({ version: "executive-director-licensing-review-v1", submission, form: FORM });
      }
      if (method === "GET" && url.pathname === `${API_PREFIX}/licensing-intake/source`) {
        const submission = state.submissions.get(url.searchParams.get("submissionId"));
        assert.ok(submission, "Only fixture originals may be opened.");
        state.sources.push(submission.submissionId);
        return route.fulfill({ status: 200, contentType: submission.contentType, headers: { "X-Content-SHA256": submission.sha256, "Content-Disposition": `inline; filename="${submission.originalFileName}"` }, body: sourceBytes });
      }
      if (method === "PUT" && url.pathname === `${API_PREFIX}/licensing-intake/review`) {
        const review = validateLic624ReviewRequest(request.postDataJSON());
        const previous = state.submissions.get(review.submissionId);
        assert.ok(previous, "Only fixture reviews may be saved.");
        assert.equal(review.expectedRevision, previous.reviewRevision, "The browser must submit the latest review revision.");
        const reviewIssues = getLic624ReviewIssues(review.data);
        if (review.confirm) assert.equal(reviewIssues.length, 0, "Incomplete forms must not be marked reviewed.");
        const submission = { ...previous, draftData: review.data, reviewIssues, reviewRevision: previous.reviewRevision + 1, reviewUpdatedAt: FIXTURE_TIME, confirmedAt: review.confirm ? FIXTURE_TIME : null, reviewedAt: review.confirm ? FIXTURE_TIME : null, status: review.confirm ? "ready_to_file" : "needs_review" };
        state.submissions.set(submission.submissionId, submission);
        state.reviews.push(structuredClone(review));
        if (state.reviewGate) await state.reviewGate;
        return json({ version: "executive-director-licensing-review-v1", submission, form: FORM });
      }
      state.unexpectedRequests.push(`${method} ${url.pathname}`);
      return json({ error: "No browser fixture is configured for this request." }, 404);
    } catch (error) {
      state.unexpectedRequests.push(`${method} ${url.pathname}: ${error.message}`);
      return json({ error: error.message }, 400);
    }
  });
}

async function verifyView(page, name) {
  const tabs = page.getByRole("tablist", { name: "Licensing views", exact: true });
  assert.equal(await tabs.getByRole("tab", { name, exact: true }).getAttribute("aria-selected"), "true", `${name} must be the active Licensing view.`);
  assert.equal(await tabs.locator('[role="tab"][aria-selected="true"]').count(), 1);
}

async function waitForReportNames(page, names) {
  await page.waitForFunction((expected) => JSON.stringify([...document.querySelectorAll("[data-licensing-report] h3")].map((heading) => heading.textContent)) === JSON.stringify(expected), names);
}

async function waitForReviewRevision(page, revision) {
  await page.waitForFunction((expected) => document.querySelector('[data-lic624-review-workspace="true"] .lic624-review__revision strong')?.textContent === String(expected), revision);
}

async function chooseDiscardResponse(page, action, accept) {
  const dialogPromise = page.waitForEvent("dialog");
  const actionPromise = action();
  const dialog = await dialogPromise;
  assert.equal(dialog.type(), "confirm");
  assert.equal(dialog.message(), "Discard unsaved changes to this report?");
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await actionPromise;
}

async function measureAndCapture(page, label, view) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const metrics = await page.locator('[data-executive-director-workspace="true"]').evaluate((workspace) => ({
    viewport: window.innerWidth,
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    workspaceOverflow: workspace.scrollWidth - workspace.clientWidth,
    workspaceWidth: workspace.getBoundingClientRect().width,
    workspaceLeft: workspace.getBoundingClientRect().left,
    reviewOverflow: (() => { const review = document.querySelector('[data-lic624-review-workspace="true"]'); return review ? review.scrollWidth - review.clientWidth : null; })()
  }));
  if (metrics.documentOverflow > 2 || metrics.workspaceOverflow > 2 || (metrics.reviewOverflow ?? 0) > 2) auditFindings.push({ label, view, issue: "The workspace must not clip content or overflow horizontally.", ...metrics });
  assert.ok(metrics.workspaceLeft >= -1 && metrics.workspaceWidth <= metrics.viewport + 2, `${label} ${view} exceeded its viewport.`);
  const controls = await page.locator('[data-executive-director-workspace="true"]').evaluate((root) => [...root.querySelectorAll("button, a[href], select, input:not([type='file']):not([type='hidden']), label[for]")].filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden").map((element) => {
    const target = element.closest("label") ?? element;
    const rect = target.getBoundingClientRect();
    return { name: (element.getAttribute("aria-label") || element.textContent || element.getAttribute("placeholder") || element.tagName).trim().slice(0, 85), width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10 };
  }));
  const smallTargets = controls.filter(({ width, height }) => width < 43.5 || height < 43.5);
  auditMeasurements.push({ label, view, smallTargets, ...metrics });
  if (smallTargets.length) auditFindings.push({ label, view, issue: "Primary controls must provide at least a 44px touch target.", targets: smallTargets });
  await page.screenshot({ path: `${screenshotDir}/${label}-${view}.png`, fullPage: false });
  return { view, ...metrics };
}

async function checkBatchFacilityReset(context, page) {
  // The ED preview has no facility switcher. Mount the real upload hook with a
  // controllable facility prop to verify an identity change during a request.
  const requests = [];
  let releaseOldRequest;
  let finishOldResponse;
  const oldGate = new Promise((resolve) => { releaseOldRequest = resolve; });
  const oldResponseFinished = new Promise((resolve) => { finishOldResponse = resolve; });
  await context.route(`**${API_PREFIX}/licensing-intake`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const facilityId = route.request().headers()["x-facility-id"];
    assert.ok(["337", "342"].includes(facilityId));
    assert.deepEqual(route.request().postDataBuffer(), sourceBytes);
    requests.push({ facilityId, fileName: route.request().headers()["x-file-name"] });
    if (facilityId === "337") await oldGate;
    const submission = { ...createSubmission(facilityId === "337" ? 71 : 72, route.request().headers()["x-file-name"]), facilityId };
    try { await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ version: "executive-director-licensing-intake-v1", submission, duplicate: false, form: FORM }) }); }
    finally { if (facilityId === "337") finishOldResponse(); }
  });
  await page.evaluate(async () => {
    const resources = performance.getEntriesByType("resource").map((entry) => entry.name);
    const reactUrl = resources.find((url) => /\/react\.js(?:\?|$)/.test(url));
    const domUrl = resources.find((url) => /\/react-dom_client\.js(?:\?|$)/.test(url));
    if (!reactUrl || !domUrl) throw new Error("The local React browser runtime was not available for the facility-reset fixture.");
    const reactModule = await import(reactUrl);
    const React = reactModule.default ?? reactModule;
    const domModule = await import(domUrl);
    const { createRoot } = domModule.default ?? domModule;
    const hookModuleUrl = new URL("/src/features/executive/components/useLicensingUploadBatch.ts", window.location.origin);
    const { useLicensingUploadBatch } = await import(hookModuleUrl.href);
    const host = document.createElement("div");
    host.hidden = true;
    document.body.append(host);
    const probe = { current: null, switchFacility: null, run: null, host, root: createRoot(host) };
    function Probe() {
      const [facility, setFacility] = React.useState("337");
      probe.current = useLicensingUploadBatch(facility);
      probe.switchFacility = setFacility;
      return React.createElement("span", null, facility);
    }
    window.__licensingBatchQa = probe;
    probe.root.render(React.createElement(Probe));
  });
  await page.waitForFunction(() => window.__licensingBatchQa?.current?.facilityId === "337");
  const oldRequestStarted = page.waitForRequest((request) => request.method() === "POST" && request.headers()["x-file-name"] === "old-community-active.pdf");
  await page.evaluate((bytes) => {
    const probe = window.__licensingBatchQa;
    probe.current.addFiles(["old-community-active.pdf", "old-community-queued.pdf"].map((name) => new File([new Uint8Array(bytes)], name, { type: "application/pdf" })));
    probe.run = probe.current.upload(false, new AbortController().signal);
  }, [...sourceBytes]);
  await oldRequestStarted;
  await page.waitForFunction(() => window.__licensingBatchQa?.current?.entries.some((entry) => entry.status === "uploading"));
  assert.equal(requests.length, 1);
  await page.evaluate(() => window.__licensingBatchQa.switchFacility("342"));
  await page.waitForFunction(() => window.__licensingBatchQa?.current?.facilityId === "342" && window.__licensingBatchQa.current.entries.length === 0 && !window.__licensingBatchQa.current.uploading);
  assert.equal(await page.evaluate(() => window.__licensingBatchQa.run), null, "Facility changes must abort the prior upload run.");
  releaseOldRequest();
  await oldResponseFinished;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.__licensingBatchQa.current.entries.length), 0, "A late receipt from the prior facility must not repopulate the new facility queue.");
  assert.equal(requests.length, 1, "Aborting the active file must not send any queued files from the old facility.");
  const fresh = await page.evaluate(async (bytes) => {
    const probe = window.__licensingBatchQa;
    probe.current.addFiles([new File([new Uint8Array(bytes)], "new-community-file.pdf", { type: "application/pdf" })]);
    return probe.current.upload(false, new AbortController().signal);
  }, [...sourceBytes]);
  assert.equal(fresh.singleResult.submission.facilityId, "342");
  await page.waitForFunction(() => window.__licensingBatchQa.current.entries[0]?.status === "received");
  assert.deepEqual(requests, [{ facilityId: "337", fileName: "old-community-active.pdf" }, { facilityId: "342", fileName: "new-community-file.pdf" }]);
  await page.evaluate(() => { const probe = window.__licensingBatchQa; probe.root.unmount(); probe.host.remove(); delete window.__licensingBatchQa; });
  return { oldRunAborted: true, oldQueuedFilesNotSent: true, lateResponseIgnored: true, newFacilityReceiptScoped: true };
}

async function checkBatchIntake(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const state = createFixtureState();
  const existingId = "00000000-0000-4000-8000-000000000001";
  const existing = state.submissions.get(existingId);
  existing.status = "ready_to_file";
  existing.reviewRevision = 3;
  existing.draftData.facility.telephone = "510-555-0142";
  existing.reviewedAt = FIXTURE_TIME;
  const preservedExisting = structuredClone(existing);
  const files = [
    { name: "batch-fillable-report-with-a-deliberately-long-unbroken-filename-for-mobile-layout-verification-2026-10-09.pdf", mimeType: "application/pdf", buffer: Buffer.concat([sourceBytes, Buffer.from("\n% synthetic batch fillable\n")]) },
    { name: "batch-scanned-awaiting-ocr.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cRZkAAAAASUVORK5CYII=", "base64") },
    { name: "batch-duplicate-renamed-original.pdf", mimeType: "application/pdf", buffer: sourceBytes },
    { name: "batch-retry-only-this-file.pdf", mimeType: "application/pdf", buffer: Buffer.concat([sourceBytes, Buffer.from("\n% synthetic batch retry\n")]) },
    { name: "batch-invalid.txt", mimeType: "text/plain", buffer: Buffer.from("Synthetic invalid file") }
  ];
  for (const [index, file] of files.slice(0, 4).entries()) state.uploadPlans.set(file.name, {
    index: 31 + index,
    bytes: file.buffer,
    contentType: file.mimeType,
    status: index === 1 ? "ocr_required" : "needs_review",
    duplicateOf: index === 2 ? existingId : null,
    failures: index === 3 ? 1 : 0
  });
  await installFixtures(context, state);
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  attachPageDiagnostics(page, { consoleErrors, requestFailures });
  await page.goto(`${BASE_URL}/executive/licensing`, { waitUntil: "domcontentloaded" });
  const tabs = page.getByRole("tablist", { name: "Licensing views", exact: true });
  const upload = page.locator(".licensing-bulk-upload");
  const picker = upload.locator('input[type="file"]');
  const entry = (name) => upload.locator("[data-licensing-batch-entry]").filter({ has: page.getByRole("heading", { name, exact: true }) });
  await tabs.getByRole("tab", { name: "Upload report", exact: true }).click();
  assert.equal(await picker.getAttribute("multiple"), "");

  await picker.setInputFiles(Array.from({ length: 101 }, (_, index) => ({ name: `cap-fixture-${index}.pdf`, mimeType: "application/pdf", buffer: sourceBytes })));
  await upload.getByRole("alert").filter({ hasText: "Choose up to 100 files per batch." }).waitFor({ state: "visible" });
  assert.equal(await upload.locator("[data-licensing-batch-entry]").count(), 0, "An over-limit selection must not silently truncate or partly add files.");
  assert.equal(state.uploads.length, 0);
  await picker.setInputFiles([
    { name: "oversized-synthetic.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(20 * 1024 * 1024 + 1) },
    { name: "empty-synthetic.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) },
    files[4]
  ]);
  assert.equal(await upload.locator('[data-upload-status="failed"]').count(), 3);
  await upload.getByText("The report must be 20 MB or smaller.", { exact: true }).waitFor({ state: "visible" });
  await upload.getByText("The selected file is empty.", { exact: true }).waitFor({ state: "visible" });
  assert.equal(await upload.getByRole("button", { name: /^Retry failed files/ }).count(), 0, "Client-rejected files must not be offered as retryable requests.");
  await upload.getByRole("button", { name: "Clear batch", exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.matches('input[type="file"]'));
  assert.equal(await picker.evaluate((element) => document.activeElement === element), true, "Clearing the batch must restore keyboard focus to the picker.");
  await picker.setInputFiles(Array.from({ length: 100 }, (_, index) => ({ name: `allowed-cap-fixture-${index}.pdf`, mimeType: "application/pdf", buffer: sourceBytes })));
  assert.equal(await upload.locator("[data-licensing-batch-entry]").count(), 100);
  assert.equal(await picker.isDisabled(), true);
  await upload.getByRole("button", { name: "Remove allowed-cap-fixture-0.pdf from batch", exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.matches('input[type="file"]'));
  assert.equal(await upload.locator("[data-licensing-batch-entry]").count(), 99);
  assert.equal(await picker.isDisabled(), false);
  await upload.getByRole("button", { name: "Clear batch", exact: true }).click();
  await picker.setInputFiles(files);
  assert.equal(await upload.locator("[data-licensing-batch-entry]").count(), 5);
  assert.equal(await upload.locator('[data-upload-status="queued"]').count(), 4);
  assert.equal(await entry(files[4].name).getAttribute("data-upload-status"), "failed");
  const viewportResults = [];
  for (const viewport of [{ label: "desktop-1440", width: 1440, height: 900 }, { label: "mobile-390", width: 390, height: 844 }, { label: "compact-320", width: 320, height: 568 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    viewportResults.push(await measureAndCapture(page, viewport.label, "batch-queued"));
    await upload.locator('[data-licensing-upload-summary="true"]').evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: `${screenshotDir}/${viewport.label}-batch-queue-detail.png`, fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  let releaseBatch;
  state.uploadGate = new Promise((resolve) => { releaseBatch = resolve; });
  const started = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === `${API_PREFIX}/licensing-intake`);
  await upload.getByRole("button", { name: "Upload queued files", exact: true }).click();
  await started;
  try {
    await upload.locator('[data-upload-status="uploading"]').waitFor({ state: "visible" });
    assert.equal(await entry(files[0].name).getAttribute("data-upload-status"), "uploading");
    assert.equal(await upload.locator('[data-upload-status="queued"]').count(), 3);
    assert.equal(state.uploads.length, 1, "Queued requests must not fan out while the current file is pending.");
    assert.equal(state.maxActiveUploads, 1);
    assert.equal(await picker.isDisabled(), true);
    assert.equal(await upload.getByRole("button", { name: "Clear batch", exact: true }).isDisabled(), true);
    assert.equal(await tabs.getByRole("tab").evaluateAll((elements) => elements.every((element) => element.disabled)), true);
    await upload.getByRole("progressbar", { name: "Batch upload progress", exact: true }).waitFor({ state: "visible" });
    await page.getByRole("link", { name: "Community", exact: true }).click();
    assert.equal(new URL(page.url()).pathname, "/executive/licensing");
    await page.getByRole("alert").filter({ hasText: "Wait for the current report action to finish before leaving Licensing." }).waitFor({ state: "visible" });
  } finally {
    state.uploadGate = null;
    releaseBatch();
  }
  await page.waitForFunction(() => document.querySelector('[data-licensing-upload-summary="true"]')?.textContent === "0 queued · 0 uploading · 2 received · 1 duplicate · 2 failed");
  await page.waitForFunction(() => document.activeElement?.matches('[data-licensing-upload-summary="true"]'));
  await verifyView(page, "Upload report");
  assert.equal(state.uploads.length, 4);
  assert.equal(state.maxActiveUploads, 1);
  assert.equal(await entry(files[1].name).getByRole("button", { name: "Review form", exact: true }).count(), 0, "Scans must remain Awaiting OCR, not claim an extracted digital form.");
  await entry(files[1].name).getByText(/Awaiting OCR/).waitFor({ state: "visible" });
  await entry(files[2].name).getByText("Already received; existing report retained.", { exact: true }).waitFor({ state: "visible" });
  assert.equal(await entry(files[2].name).getByRole("heading", { name: files[2].name, exact: true }).isVisible(), true, "A duplicate row must retain the selected filename so its result can be matched to the batch.");
  assert.deepEqual(state.submissions.get(existingId), preservedExisting);
  await page.getByRole("alert").filter({ hasText: "Wait for the current report action to finish before leaving Licensing." }).waitFor({ state: "hidden" });
  const retry = upload.getByRole("button", { name: "Retry failed files", exact: true });
  await retry.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector('[data-licensing-upload-summary="true"]')?.textContent === "0 queued · 0 uploading · 3 received · 1 duplicate · 1 failed");
  await page.waitForFunction(() => document.activeElement?.matches('[data-licensing-upload-summary="true"]'));
  assert.deepEqual(state.uploads.map(({ fileName }) => fileName), [...files.slice(0, 4).map(({ name }) => name), files[3].name], "Retry must send only the failed request, not repeat successful or duplicate receipts.");
  assert.equal(await upload.getByRole("button", { name: /^Retry failed files/ }).count(), 0);
  assert.equal(state.submissions.size, 29);
  assert.deepEqual(state.submissions.get(existingId), preservedExisting);
  for (const viewport of [{ label: "desktop-1440", width: 1440, height: 900 }, { label: "mobile-390", width: 390, height: 844 }, { label: "compact-320", width: 320, height: 568 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    viewportResults.push(await measureAndCapture(page, viewport.label, "batch-received"));
    await entry(files[2].name).evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: `${screenshotDir}/${viewport.label}-batch-receipt-detail.png`, fullPage: false });
  }
  await entry(files[2].name).getByRole("button", { name: "Review form", exact: true }).click();
  const review = page.locator('[data-lic624-review-workspace="true"]');
  await review.getByRole("heading", { name: REPORT_NAMES[0], exact: true }).waitFor({ state: "visible" });
  assert.equal(await review.getByRole("textbox", { name: /^Telephone/ }).inputValue(), "510-555-0142");
  assert.equal(await tabs.getByRole("tab", { name: "Review form", exact: true }).evaluate((element) => document.activeElement === element), true);
  await review.getByRole("textbox", { name: /^Telephone/ }).fill("510-555-0166");
  await tabs.getByRole("tab", { name: "Upload report", exact: true }).click();
  await chooseDiscardResponse(page, () => entry(files[0].name).getByRole("button", { name: "Review form", exact: true }).click(), false);
  await tabs.getByRole("tab", { name: /^Review form/ }).click();
  assert.equal(await review.getByRole("textbox", { name: /^Telephone/ }).inputValue(), "510-555-0166");
  await tabs.getByRole("tab", { name: "Upload report", exact: true }).click();
  await upload.getByRole("button", { name: "Clear batch", exact: true }).click();
  assert.equal(await upload.locator("[data-licensing-batch-entry]").count(), 0);
  await page.waitForFunction(() => document.activeElement?.matches('input[type="file"]'));
  assert.equal(await picker.evaluate((element) => document.activeElement === element), true);
  await picker.setInputFiles(files[3]);
  await chooseDiscardResponse(page, () => upload.getByRole("button", { name: "Upload securely", exact: true }).click(), false);
  assert.equal(state.uploads.length, 5, "Canceling a batch that would replace the dirty form must make no request.");
  await tabs.getByRole("tab", { name: /^Review form/ }).click();
  assert.equal(await review.getByRole("textbox", { name: /^Telephone/ }).inputValue(), "510-555-0166");
  await review.getByRole("button", { name: "Reset", exact: true }).click();
  await tabs.getByRole("tab", { name: "Upload report", exact: true }).click();
  const persisted = await page.evaluate(() => [localStorage, sessionStorage].flatMap((storage) => Object.keys(storage).map((key) => storage.getItem(key) ?? "")));
  for (const file of files) assert.equal(persisted.some((value) => value.includes(file.name)), false, "Batch filenames and report bytes must not persist in browser storage.");
  await page.reload({ waitUntil: "domcontentloaded" });
  await tabs.getByRole("tab", { name: "Upload report", exact: true }).click();
  assert.equal(await upload.locator("[data-licensing-batch-entry]").count(), 0, "Reloading must discard the in-memory queue, not resurrect local report data.");
  assert.deepEqual(state.unexpectedRequests, []);
  assert.deepEqual(requestFailures, []);
  assert.deepEqual(consoleErrors.filter((message) => !/^Failed to load resource: the server responded with a status of 503\b/.test(message)), []);
  const facilityReset = await checkBatchFacilityReset(context, page);
  assert.deepEqual(state.unexpectedRequests, []);
  assert.deepEqual(requestFailures, []);
  assert.deepEqual(consoleErrors.filter((message) => !/^Failed to load resource: the server responded with a status of 503\b/.test(message)), []);
  const result = { uploads: state.uploads, maxConcurrentRequests: state.maxActiveUploads, invalidFilesBlocked: true, over100FilesRejected: true, retryOnlyFailed: true, duplicatePreservedReview: true, canceledDirtyBatchMadeNoRequest: true, memoryOnlyQueue: true, facilityReset, viewportResults };
  await context.close();
  return result;
}

await withBrowserQa(async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const state = createFixtureState();
  await installFixtures(context, state);
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  attachPageDiagnostics(page, { consoleErrors, requestFailures });
  await page.goto(`${BASE_URL}/executive/licensing`, { waitUntil: "domcontentloaded" });
  const workspace = page.locator('[data-executive-director-workspace="true"]');
  const tabs = page.getByRole("tablist", { name: "Licensing views", exact: true });
  const reports = page.locator('[data-executive-director-submissions="true"]');
  const review = page.locator('[data-lic624-review-workspace="true"]');
  await workspace.waitFor({ state: "visible" });
  await reports.getByText(REPORT_NAMES[0], { exact: true }).waitFor({ state: "visible" });
  assert.match(await workspace.getAttribute("class"), /executive-licensing/);
  assert.deepEqual(await tabs.getByRole("tab").allTextContents(), ["Reports", "Upload report"]);
  await verifyView(page, "Reports");
  await tabs.getByRole("tab", { name: "Reports", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await verifyView(page, "Upload report");
  assert.equal(await tabs.getByRole("tab", { name: "Upload report", exact: true }).evaluate((element) => document.activeElement === element), true, "Keyboard tab navigation must move focus with selection.");
  await page.keyboard.press("Home");
  await verifyView(page, "Reports");
  assert.equal(await tabs.locator('[role="tab"][tabindex="0"]').count(), 1);
  const viewportResults = [{ label: "desktop-1440", views: [await measureAndCapture(page, "desktop-1440", "reports")] }];
  const initialNames = sortedSubmissions(state).map((submission) => submission.originalFileName);
  await waitForReportNames(page, initialNames.slice(0, 25));
  await reports.getByRole("button", { name: "Load more reports", exact: true }).click();
  await waitForReportNames(page, initialNames);
  assert.equal(await reports.getByRole("button", { name: "Load more reports", exact: true }).count(), 0);
  const search = reports.getByRole("searchbox", { name: "Search reports", exact: true });
  const statusFilter = reports.getByRole("combobox", { name: "Report status", exact: true });
  await search.fill("follow-up");
  await waitForReportNames(page, [REPORT_NAMES[1]]);
  await search.fill("missing-report-name");
  await reports.getByRole("heading", { name: "No matching reports", exact: true }).waitFor({ state: "visible" });
  await search.fill("");
  await statusFilter.selectOption("ocr_required");
  await waitForReportNames(page, [REPORT_NAMES[2]]);
  assert.equal(await reports.getByRole("button", { name: "Review form", exact: true }).count(), 0, "An OCR-only record must not claim to have a digital review form.");
  await statusFilter.selectOption("");
  await waitForReportNames(page, initialNames.slice(0, 25));
  state.catalogRevision += 1;
  const revisionRefreshPromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === `${API_PREFIX}/licensing-intake/submissions` && !url.searchParams.has("cursor");
  });
  await reports.getByRole("button", { name: "Load more reports", exact: true }).click();
  await revisionRefreshPromise;
  await waitForReportNames(page, initialNames.slice(0, 25));
  assert.deepEqual(state.listRequests.slice(-2).map(({ cursor, catalogRevision }) => ({ cursor, catalogRevision })), [{ cursor: "25", catalogRevision: 2 }, { cursor: null, catalogRevision: 2 }], "A changed catalog revision must refresh the first page instead of appending mismatched rows.");

  await tabs.getByRole("tab", { name: "Upload report", exact: true }).click();
  await verifyView(page, "Upload report");
  const upload = page.locator(".licensing-bulk-upload");
  await upload.waitFor({ state: "visible" });
  await upload.locator('input[type="file"]').setInputFiles({ name: "unsupported.txt", mimeType: "text/plain", buffer: Buffer.from("Unsupported fixture") });
  await upload.getByText("Choose a PDF, JPG, or PNG scan.", { exact: true }).waitFor({ state: "visible" });
  assert.equal(state.uploads.length, 0, "Invalid files must not be sent to the intake API.");
  await upload.getByRole("button", { name: "Clear batch", exact: true }).click();
  await upload.locator('input[type="file"]').setInputFiles({ name: UPLOAD_NAME, mimeType: "application/pdf", buffer: sourceBytes });
  viewportResults[0].views.push(await measureAndCapture(page, "desktop-1440", "upload"));
  let releaseUpload;
  state.uploadGate = new Promise((resolve) => { releaseUpload = resolve; });
  const pendingUpload = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === `${API_PREFIX}/licensing-intake`);
  await workspace.getByRole("button", { name: "Upload securely", exact: true }).click();
  await pendingUpload;
  try {
    assert.equal(await workspace.getByRole("button", { name: "Uploading", exact: true }).isDisabled(), true);
    assert.equal(await upload.locator('input[type="file"]').isDisabled(), true);
    assert.equal(await tabs.getByRole("tab").evaluateAll((elements) => elements.every((element) => element.disabled)), true);
  } finally {
    releaseUpload();
    state.uploadGate = null;
  }
  await review.getByRole("heading", { name: UPLOAD_NAME, exact: true }).waitFor({ state: "visible" });
  assert.deepEqual(await tabs.getByRole("tab").allTextContents(), ["Reports", "Upload report", "Review form"]);
  await verifyView(page, "Review form");
  assert.equal(await tabs.getByRole("tab", { name: "Review form", exact: true }).evaluate((element) => document.activeElement === element), true, "Completing an upload must focus the newly available Review form tab.");
  assert.equal(state.uploads.length, 1);
  assert.equal(await review.getByRole("textbox", { name: /^Facility name/ }).inputValue(), "Alamo San Pablo");
  assert.equal(await review.getByRole("textbox", { name: /^What happened/ }).inputValue(), sourceData.eventNarrative);
  assert.equal(await review.getByRole("button", { name: "Mark reviewed", exact: true }).isDisabled(), true);
  const uploadedId = state.uploads[0].submissionId;
  const originalData = structuredClone(state.submissions.get(uploadedId).sourceData);
  await review.getByRole("textbox", { name: /^Telephone/ }).fill("510-555-0199");
  await review.getByRole("textbox", { name: /^Reviewed by/ }).fill("Test Executive Director");
  await review.getByRole("textbox", { name: /^Reviewed date/ }).fill("10/09/2026");
  let releaseReview;
  state.reviewGate = new Promise((resolve) => { releaseReview = resolve; });
  const pendingSave = page.waitForRequest((request) => request.method() === "PUT" && new URL(request.url()).pathname === `${API_PREFIX}/licensing-intake/review`);
  await review.getByRole("button", { name: "Save draft", exact: true }).click();
  await pendingSave;
  try {
    await review.locator('form[aria-busy="true"]').waitFor({ state: "visible" });
    assert.equal(await review.locator("fieldset.lic624-review__fields").evaluate((element) => element.disabled), true);
    assert.equal(await review.getByRole("textbox", { name: /^Telephone/ }).isDisabled(), true, "An in-flight save must prevent edits that could be lost when the response arrives.");
    assert.equal(await review.locator(".lic624-review__fields").evaluate((fields) => [...fields.querySelectorAll("input, textarea, select, button")].every((element) => element.matches(":disabled"))), true);
    assert.equal(await review.getByRole("button", { name: "Close digital form", exact: true }).isDisabled(), true);
    assert.equal(await review.getByRole("button", { name: "Reset", exact: true }).isDisabled(), true);
    assert.equal(await review.getByRole("button", { name: "Mark reviewed", exact: true }).isDisabled(), true);
    assert.equal(await tabs.getByRole("tab").evaluateAll((elements) => elements.every((element) => element.disabled)), true);
    await review.getByRole("button", { name: "Reset", exact: true }).evaluate((element) => element.click());
    await review.getByRole("button", { name: "Close digital form", exact: true }).evaluate((element) => element.click());
    assert.equal(await review.getByRole("textbox", { name: /^Telephone/ }).inputValue(), "510-555-0199");
    assert.equal(await review.isVisible(), true);
    await page.getByRole("link", { name: "Community", exact: true }).click();
    assert.equal(new URL(page.url()).pathname, "/executive/licensing", "Pending saves must block header navigation away from the review.");
    await workspace.getByRole("alert").filter({ hasText: "Wait for the current report action to finish before leaving Licensing." }).waitFor({ state: "visible" });
  } finally {
    releaseReview();
    state.reviewGate = null;
  }
  await waitForReviewRevision(page, 1);
  await workspace.getByRole("alert").filter({ hasText: "Wait for the current report action to finish before leaving Licensing." }).waitFor({ state: "hidden" });
  await review.getByRole("status").filter({ hasText: "Draft saved securely." }).waitFor({ state: "visible" });
  await tabs.getByRole("tab", { name: "Reports", exact: true }).click();
  await tabs.getByRole("tab", { name: "Review form", exact: true }).click();
  assert.equal(await review.getByRole("status").filter({ hasText: "Draft saved securely." }).isVisible(), true, "The successful save message must survive the saved-data update and view navigation.");
  assert.equal(state.reviews.length, 1);
  assert.equal(state.reviews[0].confirm, false);
  assert.equal(state.reviews[0].data.facility.telephone, "510-555-0199");
  assert.equal(state.submissions.get(uploadedId).reviewRevision, 1);
  assert.deepEqual(state.submissions.get(uploadedId).sourceData, originalData, "Saving a draft must not alter the extracted source.");
  assert.deepEqual(state.submissions.get(uploadedId).reviewIssues, [], "The saved review must contain every required field before confirmation.");
  assert.equal(await review.getByRole("textbox", { name: /^Reviewed by/ }).inputValue(), "Test Executive Director");
  assert.equal(await review.getByRole("textbox", { name: /^Reviewed date/ }).inputValue(), "10/09/2026");
  await review.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await waitForReviewRevision(page, 2);
  await review.getByRole("status").filter({ hasText: "Review complete." }).waitFor({ state: "visible" });
  assert.equal(state.reviews[1].confirm, true);
  assert.equal(state.reviews[1].expectedRevision, 1);
  assert.equal(state.submissions.get(uploadedId).status, "ready_to_file");
  assert.equal(state.submissions.get(uploadedId).reviewRevision, 2);
  assert.deepEqual(state.submissions.get(uploadedId).sourceData, originalData);
  viewportResults[0].views.push(await measureAndCapture(page, "desktop-1440", "review"));
  const popupPromise = page.waitForEvent("popup");
  const originalResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === `${API_PREFIX}/licensing-intake/source`);
  await review.getByRole("button", { name: "Original", exact: true }).click();
  const popup = await popupPromise;
  const originalResponse = await originalResponsePromise;
  assert.equal(originalResponse.status(), 200);
  await popup.waitForURL(/^blob:/);
  const openedOriginal = await page.evaluate(async (blobUrl) => {
    const bytes = await (await fetch(blobUrl)).arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return { byteLength: bytes.byteLength, sha256: hash };
  }, popup.url());
  assert.deepEqual(openedOriginal, { byteLength: sourceBytes.byteLength, sha256: state.submissions.get(uploadedId).sha256 }, "The original opened by the browser must preserve the uploaded PDF bytes.");
  await popup.close();
  assert.deepEqual(state.sources, [uploadedId]);

  const telephone = review.getByRole("textbox", { name: /^Telephone/ });
  await telephone.fill("510-555-0111");
  assert.equal(await review.getByRole("status").filter({ hasText: "Review complete." }).count(), 0, "Editing a field must clear an obsolete success message.");
  for (const linkName of ["Community", "Community dashboard home"]) {
    await chooseDiscardResponse(page, () => page.getByRole("link", { name: linkName, exact: true }).click(), false);
    assert.equal(new URL(page.url()).pathname, "/executive/licensing");
    assert.equal(await telephone.inputValue(), "510-555-0111", "Canceling header navigation must preserve the local draft.");
  }
  await tabs.getByRole("tab", { name: "Reports", exact: true }).click();
  await verifyView(page, "Reports");
  const secondReport = reports.locator('[data-licensing-report="00000000-0000-4000-8000-000000000002"]');
  await secondReport.waitFor({ state: "visible" });
  await chooseDiscardResponse(page, () => secondReport.getByRole("button", { name: "Review form", exact: true }).click(), false);
  await verifyView(page, "Reports");
  await tabs.getByRole("tab", { name: /^Review form/ }).click();
  assert.equal(await telephone.inputValue(), "510-555-0111", "Canceling a report switch must preserve the unsaved draft.");
  await chooseDiscardResponse(page, () => review.getByRole("button", { name: "Close digital form", exact: true }).click(), false);
  await review.waitFor({ state: "visible" });
  assert.equal(await telephone.inputValue(), "510-555-0111", "Canceling form closure must preserve the unsaved draft.");
  await tabs.getByRole("tab", { name: "Upload report", exact: true }).click();
  await upload.getByRole("button", { name: "Clear batch", exact: true }).click();
  await upload.locator('input[type="file"]').setInputFiles({ name: UPLOAD_NAME, mimeType: "application/pdf", buffer: sourceBytes });
  await chooseDiscardResponse(page, () => workspace.getByRole("button", { name: "Upload securely", exact: true }).click(), false);
  assert.equal(state.uploads.length, 1, "Canceling draft replacement must not upload another file.");
  await tabs.getByRole("tab", { name: /^Review form/ }).click();
  assert.equal(await telephone.inputValue(), "510-555-0111", "Changing tabs must preserve the mounted draft.");
  await tabs.getByRole("tab", { name: "Reports", exact: true }).click();
  let releaseOpen;
  state.openGate = new Promise((resolve) => { releaseOpen = resolve; });
  const pendingOpen = page.waitForRequest((request) => request.method() === "GET" && new URL(request.url()).pathname === `${API_PREFIX}/licensing-intake`);
  await chooseDiscardResponse(page, () => secondReport.getByRole("button", { name: "Review form", exact: true }).click(), true);
  await pendingOpen;
  try {
    assert.equal(await secondReport.getByRole("button", { name: "Opening", exact: true }).isDisabled(), true);
    assert.equal(await tabs.getByRole("tab").evaluateAll((elements) => elements.every((element) => element.disabled)), true);
  } finally {
    releaseOpen();
    state.openGate = null;
  }
  await review.getByRole("heading", { name: REPORT_NAMES[1], exact: true }).waitFor({ state: "visible" });
  assert.equal(await tabs.getByRole("tab", { name: "Review form", exact: true }).evaluate((element) => document.activeElement === element), true, "Opening a report must leave focus on its active Review form tab.");
  assert.equal(await telephone.inputValue(), sourceData.facility.telephone);
  assert.equal(state.submissions.get(uploadedId).draftData.facility.telephone, "510-555-0199", "Discarding a local draft must not overwrite the saved review.");
  await tabs.getByRole("tab", { name: "Reports", exact: true }).click();
  await statusFilter.selectOption("ready_to_file");
  await waitForReportNames(page, [UPLOAD_NAME]);
  await reports.locator(`[data-licensing-report="${uploadedId}"]`).getByRole("button", { name: "Open form", exact: true }).click();
  await review.getByRole("heading", { name: UPLOAD_NAME, exact: true }).waitFor({ state: "visible" });
  assert.equal(await telephone.inputValue(), "510-555-0199");
  await tabs.getByRole("tab", { name: "Reports", exact: true }).click();
  await statusFilter.selectOption("");
  await waitForReportNames(page, sortedSubmissions(state).slice(0, 25).map((submission) => submission.originalFileName));
  await tabs.getByRole("tab", { name: "Upload report", exact: true }).click();
  await workspace.getByRole("button", { name: "Remove selected file", exact: true }).click();
  await tabs.getByRole("tab", { name: "Review form", exact: true }).click();

  for (const viewport of [{ label: "tablet-768", width: 768, height: 1024 }, { label: "mobile-390", width: 390, height: 844 }, { label: "compact-320", width: 320, height: 568 }, { label: "zoom-200-equivalent-720", width: 720, height: 450 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const views = [];
    for (const [name, key] of [["Reports", "reports"], ["Upload report", "upload"], ["Review form", "review"]]) {
      await tabs.getByRole("tab", { name, exact: true }).click();
      await verifyView(page, name);
      if (key === "review") await review.getByRole("heading", { name: UPLOAD_NAME, exact: true }).waitFor({ state: "visible" });
      views.push(await measureAndCapture(page, viewport.label, key));
    }
    const firstField = review.getByRole("textbox", { name: /^Facility name/ });
    const firstFieldMetrics = await firstField.evaluate((element) => ({ top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom, footerTop: document.querySelector(".lic624-review__footer")?.getBoundingClientRect().top ?? window.innerHeight }));
    auditMeasurements.push({ label: viewport.label, firstField: firstFieldMetrics });
    if (viewport.width === 390 && firstFieldMetrics.bottom > firstFieldMetrics.footerTop) auditFindings.push({ label: viewport.label, issue: "The first review field should be visible above the sticky footer when the form opens.", ...firstFieldMetrics });
    for (const section of ["05", "01"]) {
      await review.getByRole("combobox", { name: "Jump to review section", exact: true }).selectOption(section);
      const heading = review.locator(`[data-lic624-section="${section}"] h3`);
      assert.equal(await heading.evaluate((element) => document.activeElement === element), true, "A section jump must put keyboard focus on its destination heading.");
      const bounds = await heading.evaluate((element) => ({ top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom, footerTop: document.querySelector(".lic624-review__footer")?.getBoundingClientRect().top ?? window.innerHeight }));
      if (bounds.top < 0 || bounds.bottom > bounds.footerTop) auditFindings.push({ label: viewport.label, section, issue: "Section-jump destinations must remain visible above the sticky footer.", ...bounds });
    }
    await firstField.focus();
    const focusedField = await firstField.evaluate((element) => ({ top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom, footerTop: document.querySelector(".lic624-review__footer")?.getBoundingClientRect().top ?? window.innerHeight }));
    if (focusedField.top < 0 || focusedField.bottom > focusedField.footerTop) auditFindings.push({ label: viewport.label, issue: "Focused form fields must remain visible above the sticky footer.", ...focusedField });
    await review.getByRole("textbox", { name: /^Reviewed by/ }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${screenshotDir}/${viewport.label}-review-actions.png`, fullPage: false });
    viewportResults.push({ label: viewport.label, views });
  }

  assert.deepEqual(state.unexpectedRequests, [], "Fixture coverage must prevent all unexpected or live mutation requests.");
  assert.equal(state.uploads.length, 1, "Draft navigation must not create additional uploads.");
  assert.equal(state.reviews.length, 2, "Only the explicit draft save and review confirmation may write review data.");
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(requestFailures, []);
  const failureContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const failureState = createFixtureState();
  failureState.bootstrapUnavailable = true;
  await installFixtures(failureContext, failureState);
  const failurePage = await failureContext.newPage();
  const failureConsoleErrors = [];
  const failureRequests = [];
  attachPageDiagnostics(failurePage, { consoleErrors: failureConsoleErrors, requestFailures: failureRequests });
  await failurePage.goto(`${BASE_URL}/executive/licensing`, { waitUntil: "domcontentloaded" });
  await failurePage.getByRole("alert").filter({ hasText: "Fixture bootstrap temporarily unavailable." }).waitFor({ state: "visible" });
  const availableReport = failurePage.locator('[data-licensing-report="00000000-0000-4000-8000-000000000001"]');
  await availableReport.getByRole("button", { name: "Review form", exact: true }).click();
  await failurePage.locator('[data-lic624-review-workspace="true"]').getByRole("heading", { name: REPORT_NAMES[0], exact: true }).waitFor({ state: "visible" });
  await verifyView(failurePage, "Review form");
  assert.deepEqual(failureState.unexpectedRequests, []);
  assert.deepEqual(failureRequests, []);
  assert.deepEqual(failureConsoleErrors.filter((message) => !/^Failed to load resource: the server responded with a status of 503\b/.test(message)), []);
  await measureAndCapture(failurePage, "desktop-1440", "bootstrap-failure-review");
  failureState.bootstrapUnavailable = false;
  const recoveredBootstrap = failurePage.waitForResponse((response) => new URL(response.url()).pathname === `${API_PREFIX}/bootstrap` && response.ok());
  await failurePage.getByRole("button", { name: "Retry workspace", exact: true }).click();
  await recoveredBootstrap;
  await failurePage.getByRole("alert").filter({ hasText: "Fixture bootstrap temporarily unavailable." }).waitFor({ state: "hidden" });
  await failurePage.locator('[data-lic624-review-workspace="true"]').getByRole("heading", { name: REPORT_NAMES[0], exact: true }).waitFor({ state: "visible" });
  await verifyView(failurePage, "Review form");
  assert.deepEqual(failureState.unexpectedRequests, []);
  assert.deepEqual(failureRequests, []);
  assert.deepEqual(failureConsoleErrors.filter((message) => !/^Failed to load resource: the server responded with a status of 503\b/.test(message)), []);
  await failureContext.close();
  const batchIntake = await checkBatchIntake(browser);
  await writeFile(`${artifactDir}/formatting-audit.json`, JSON.stringify({ passed: auditFindings.length === 0, findings: auditFindings, measurements: auditMeasurements }, null, 2));
  assert.deepEqual(auditFindings, [], "Licensing formatting and keyboard audit must pass at every supported viewport.");
  await writeFile(`${artifactDir}/latest.json`, JSON.stringify({ passed: true, fixtureOnly: true, uploads: state.uploads, batchIntake, reviewRequests: state.reviews.map(({ submissionId, expectedRevision, confirm }) => ({ submissionId, expectedRevision, confirm })), originalRequests: state.sources, catalogRequests: state.listRequests, dirtyGuard: { canceledReportSwitch: true, canceledClose: true, canceledUpload: true, canceledCommunityAndBrandNavigation: true, discardedDraftPreservedSavedReview: true }, pendingActions: { serializedUploadOpenAndSave: true, saveDisabledInputsCloseAndReset: true, blockedHeaderNavigation: true, asyncCompletionRestoredFocus: true }, resilience: { changedCatalogRevisionRefreshed: true, reviewOpenedWithoutBootstrap: true, bootstrapRetryRecovered: true, savedToastPersistedUntilNextEdit: true }, viewportResults }, null, 2));
  await context.close();
  console.log("Executive Director Licensing browser QA passed at 1440px, 768px, 390px, 320px, and a 200% zoom-equivalent viewport with fixture-only upload, review, original retrieval, catalog filters/pagination, and draft guards.");
});
