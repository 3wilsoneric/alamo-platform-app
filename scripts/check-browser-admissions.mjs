#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { BASE_URL, attachPageDiagnostics, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";
import { connectedAdmissionsFixture } from "./check-admissions-dashboard.mjs";

// Current production journey: named records, scoped stages, and the existing
// read-only client file. Replaces the obsolete Briefing/Pipeline tab contract.
const { screenshotDir } = await prepareArtifactDirs("browser-admissions-overview-qa");
const fixture = structuredClone(connectedAdmissionsFixture);
const template = fixture.referral_pipeline.board.cards[0];
const names = ["Alexandra Christina Montgomery-Williams", "Jordan Lee", "Robin Chen", "Taylor Rivera", "Avery Morgan", "Casey Patel", "Morgan Sullivan", "Riley Walsh"];
const statuses = ["Assessment scheduled", "Awaiting admit", "Under review", "Referral received"];
fixture.referral_pipeline.board.cards = names.map((clientName, index) => ({
  ...structuredClone(template), referralId: 8000 + index, clientName,
  facilityId: index % 2 ? "342" : "337", community: index % 2 ? "Victoria's House" : "San Pablo",
  status: statuses[index % 4], column: index % 4 === 0 ? "in_progress" : index % 4 === 3 ? "received" : "decision"
}));
fixture.referral_pipeline.board.total = names.length;
fixture.referral_pipeline.board.truncated = false;
fixture.referral_pipeline.metrics.activeReferrals = names.length;

await withBrowserQa(async browser => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const consoleErrors = []; const requestFailures = [];
  attachPageDiagnostics(page, { consoleErrors, requestFailures });
  let response = fixture;
  await page.route("**/api/platform/admissions-dashboard*", route => route.fulfill({ json: response }));
  await page.goto(`${BASE_URL}/admissions`, { waitUntil: "domcontentloaded" });
  const list = page.getByRole("region", { name: "Active referrals", exact: true });
  await list.waitFor({ state: "visible" });
  assert.equal(await list.locator("li button").count(), 8);
  await list.getByRole("button", { name: /Alexandra Christina/ }).click();
  await page.getByRole("button", { name: "Open client file", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  assert.match(await dialog.innerText(), /Alexandra Christina Montgomery-Williams/);
  assert.equal(await dialog.locator('a[href*="alamo-pipeline.com"]').count(), 0);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Open client file →");

  await page.getByRole("combobox", { name: "Intake stage" }).selectOption("arrival");
  assert.equal(await list.locator("li button").count(), 2);
  await page.getByRole("combobox", { name: "Admissions community" }).selectOption("337");
  assert.equal(new URL(page.url()).searchParams.get("community"), "337");
  await page.getByText("No active referrals in this view.", { exact: true }).waitFor({ state: "visible" });
  assert.equal(await page.getByRole("button", { name: "Open client file", exact: true }).count(), 0);
  await page.getByRole("combobox", { name: "Intake stage" }).selectOption("");
  assert.equal(await list.locator("li button").count(), 4);
  await page.goBack();
  assert.equal(await list.locator("li button").count(), 8);
  await page.getByText("Referral sources & assessors", { exact: true }).click();
  assert.equal(await page.getByRole("heading", { name: "Referring county", exact: true }).count(), 1);
  await page.screenshot({ path: path.join(screenshotDir, "admissions-current-desktop.png"), fullPage: true });

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await list.getByRole("button", { name: /Alexandra Christina/ }).click();
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      clippedNames: [...document.querySelectorAll('.intake-list li strong')].filter(node => node.scrollWidth > node.clientWidth + 1).length,
      controls: [...document.querySelectorAll('.active-intake button,.intake-page-heading select,.intake-stage-control select')].filter(node => node.getBoundingClientRect().height > 0).map(node => node.getBoundingClientRect().height)
    }));
    assert.ok(layout.overflow <= 1, `${width}px page overflow`);
    assert.equal(layout.clippedNames, 0, `${width}px clipped client names`);
    assert.ok(layout.controls.every(height => height >= 44), `${width}px undersized control`);
    await page.screenshot({ path: path.join(screenshotDir, `admissions-current-${width}.png`), fullPage: true });
  }
  response = structuredClone(fixture); response.referral_pipeline.board.truncated = true;
  const partialPage = await context.newPage();
  await partialPage.route("**/api/platform/admissions-dashboard*", route => route.fulfill({ json: response }));
  await partialPage.goto(`${BASE_URL}/admissions`);
  await partialPage.getByText(/The active intake list is incomplete/).waitFor({ state: "visible" });
  assert.equal(await partialPage.locator('.intake-list li button').count(), 0);
  response = structuredClone(fixture); response.referral_pipeline.board.cards = []; response.referral_pipeline.board.total = 0; response.referral_pipeline.metrics.activeReferrals = 0;
  const emptyPage = await context.newPage();
  await emptyPage.route("**/api/platform/admissions-dashboard*", route => route.fulfill({ json: response }));
  await emptyPage.goto(`${BASE_URL}/admissions`);
  await emptyPage.getByText("No active referrals in this view.", { exact: true }).waitFor({ state: "visible" });
  assert.equal(await emptyPage.getByRole("button", { name: "Open client file", exact: true }).count(), 0);
  assert.equal(consoleErrors.length, 0, consoleErrors.join(" | "));
  assert.equal(requestFailures.length, 0, JSON.stringify(requestFailures));
  await context.close();
  console.log("Admissions browser: names, scopes, stages, client-file review, focus return, empty/partial feeds, and 320/390px layouts passed.");
});
