import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LIC624_FORM_DEFINITION, LIC624_INCIDENT_TYPE_FIELDS, LIC624_NOTIFICATION_FIELDS } from "../shared/lic624-contracts.mjs";
import { BASE_URL, attachPageDiagnostics, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";

const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-lic624-native");
const root = await mkdtemp(path.join(tmpdir(), "lic624-native-browser-"));
const keys = ["EXECUTIVE_DIRECTOR_INTAKE_STORAGE", "EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT", "API_AUTH_REQUIRED", "NODE_ENV", "VERCEL_ENV"];
const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
Object.assign(process.env, { EXECUTIVE_DIRECTOR_INTAKE_STORAGE: "local", EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT: root, API_AUTH_REQUIRED: "false", NODE_ENV: "development" });
delete process.env.VERCEL_ENV;
const prefix = "/api/platform/executive-director";
const form = { ...LIC624_FORM_DEFINITION, incidentTypes: LIC624_INCIDENT_TYPE_FIELDS.map(({ key, label }) => ({ key, label })), notifications: LIC624_NOTIFICATION_FIELDS };

try {
  await withBrowserQa(async (browser) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const unexpectedWrites = [];
    const creationIds = [];
    let loseFirstResponse = true;
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
      if (url.pathname === `${prefix}/bootstrap`) {
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({
          version: "executive-director-workspace-v1",
          facility: { facilityId: "337", communityName: "Alamo San Pablo", shortName: "San Pablo", city: "San Pablo", state: "CA" },
          dashboard: { status: "unavailable", generatedAt: null, residents: null, reportingMonth: null },
          intake: { summary: { total: 0, drafts: 0, ocrRequired: 0, needsReview: 0, readyToFile: 0, filed: 0, failed: 0 }, submissions: [] }, form
        }) });
      }
      if (request.method() === "POST" && url.pathname === `${prefix}/licensing-intake/drafts`) {
        creationIds.push(request.postDataJSON().creationId);
        if (loseFirstResponse) {
          loseFirstResponse = false;
          const response = await route.fetch();
          assert.equal(response.status(), 201);
          return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic response interruption. Retry new report." }) });
        }
        return route.continue();
      }
      if (request.method() === "PUT" && url.pathname === `${prefix}/licensing-intake/review`) return route.continue();
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        unexpectedWrites.push(`${request.method()} ${url.pathname}`);
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    const page = await context.newPage();
    const consoleErrors = [], requestFailures = [];
    attachPageDiagnostics(page, { consoleErrors, requestFailures });
    await page.goto(`${BASE_URL}/executive/licensing`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "New LIC 624", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Synthetic response interruption" }).waitFor();
    await page.getByRole("button", { name: "New LIC 624", exact: true }).click();
    const review = page.locator('[data-lic624-review-workspace="true"]');
    await review.waitFor({ state: "visible" });
    assert.equal(creationIds.length, 2);
    assert.equal(creationIds[0], creationIds[1], "Retry must recover the same server-persisted draft.");
    assert.equal(await review.getByRole("button", { name: "Original", exact: true }).count(), 0);
    assert.equal(await review.getByRole("button", { name: "Mark reviewed", exact: true }).isDisabled(), true);
    assert.equal(await review.locator('[data-lic624-section]').count(), 5, "Keep the existing five-section editor.");
    await review.getByRole("textbox", { name: /^Name\b/ }).fill("Synthetic Native Resident");
    await review.getByRole("textbox", { name: /^What happened/ }).fill("Synthetic report entered directly in the app. No real incident.");
    await review.getByRole("button", { name: "Save draft", exact: true }).click();
    await review.getByText("Draft saved securely.", { exact: true }).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    const row = page.locator(`[data-licensing-report="${creationIds[0]}"]`);
    await row.waitFor();
    assert.equal(await page.locator('[data-licensing-report]').count(), 1);
    assert.equal(await row.getByRole("button", { name: "Original", exact: true }).count(), 0);
    await page.getByRole("combobox", { name: "Report status", exact: true }).selectOption("draft");
    await row.getByRole("button", { name: "Open form", exact: true }).click();
    await review.waitFor({ state: "visible" });
    assert.equal(await review.getByRole("textbox", { name: /^Name\b/ }).inputValue(), "Synthetic Native Resident");
    assert.match(await review.getByRole("textbox", { name: /^What happened/ }).inputValue(), /entered directly/);

    await review.getByRole("textbox", { name: /^What happened/ }).fill("Unsaved synthetic change");
    await page.getByRole("tab", { name: "Reports", exact: true }).click();
    const dialogPromise = page.waitForEvent("dialog");
    const newClick = page.getByRole("button", { name: "New LIC 624", exact: true }).click();
    const dialog = await dialogPromise;
    await dialog.dismiss();
    await newClick;
    assert.equal(creationIds.length, 2, "Canceling replacement must not create a report.");
    await page.getByRole("tab", { name: "Review", exact: true }).click();
    assert.equal(await review.getByRole("textbox", { name: /^What happened/ }).inputValue(), "Unsaved synthetic change");
    await review.getByRole("button", { name: "Reset", exact: true }).click();

    const measurements = [];
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.getByRole("tab", { name: "Reports", exact: true }).click();
      await page.screenshot({ path: `${screenshotDir}/${width}-reports.png`, fullPage: true });
      const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
      assert.ok(overflow <= 1, `${width}px reports overflow: ${overflow}`);
      await page.getByRole("tab", { name: "Review", exact: true }).click();
      await page.screenshot({ path: `${screenshotDir}/${width}-native-editor.png`, fullPage: true });
      const editorOverflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
      assert.ok(editorOverflow <= 1, `${width}px native editor overflow: ${editorOverflow}`);
      measurements.push({ width, overflow, editorOverflow });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await review.getByRole("textbox", { name: /^Facility file number/ }).fill("SYNTHETIC-624");
    await review.getByRole("textbox", { name: /^Date occurred/ }).fill("10/13/2026");
    await review.getByRole("button", { name: "Other", exact: true }).click();
    await review.getByRole("textbox", { name: /^Immediate action taken/ }).fill("Synthetic response for workflow verification.");
    for (const [label, value] of [["Submitted by", "Synthetic Author"], ["Submitted date", "10/13/2026"], ["Reviewed by", "Synthetic Reviewer"], ["Reviewed date", "10/13/2026"]]) {
      await review.getByRole("textbox", { name: new RegExp(`^${label}`) }).fill(value);
    }
    await review.getByRole("button", { name: "Mark reviewed", exact: true }).click();
    await review.getByText("Review complete. This record is ready for the filing workflow.", { exact: true }).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await row.locator('.licensing-report-status').filter({ hasText: "Ready to file" }).waitFor();
    await row.getByRole("button", { name: "Open form", exact: true }).click();
    await review.getByText("Reviewed", { exact: true }).waitFor();
    assert.deepEqual(unexpectedWrites, []);
    assert.deepEqual(requestFailures, []);
    assert.deepEqual(consoleErrors.filter((message) => !/^Failed to load resource: the server responded with a status of 503\b/.test(message)), []);
    await writeFile(`${artifactDir}/latest.json`, JSON.stringify({ passed: true, syntheticOnly: true, realLocalApi: true, retryRecoveredOneDraft: true, reloadPreservedDraft: true, incompleteReviewBlocked: true, unsavedReplacementCanceled: true, confirmationPersisted: true, measurements }, null, 2));
    await context.close();
    console.log("Native LIC 624 browser QA passed against the real local API: create, lost-response retry, save/reload/reopen, dirty guard, confirmation, and existing editor at 1440/390/320px.");
  });
} finally {
  for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await rm(root, { recursive: true, force: true });
}
