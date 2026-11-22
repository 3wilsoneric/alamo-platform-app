#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { BASE_URL, attachPageDiagnostics, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";
import { connectedAdmissionsFixture } from "./check-admissions-dashboard.mjs";

// Synthetic complete Pipeline feed. Never used by the production application.
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
  // This screen is checked with a synthetic Pipeline response; unrelated
  // background API requests should not require a configured Databricks server.
  await context.route(url => url.pathname.startsWith("/api/"), route => route.fulfill({ json: {} }));
  let response = fixture;
  await page.route("**/api/platform/admissions-dashboard*", route => route.fulfill({ json: response }));
  await page.goto(`${BASE_URL}/admissions`, { waitUntil: "domcontentloaded" });
  const journey = page.locator('[data-admissions-journey="complete"]');
  await journey.waitFor({ state: "visible" });
  assert.equal(await journey.locator(".admissions-journey-person-button").count(), 8);
  assert.deepEqual((await journey.locator(".admissions-journey-count").allTextContents()).map(Number), [2, 2, 2, 2]);
  assert.equal(await journey.locator(".admissions-journey-breakdown").count(), 3);
  await journey.getByRole("button", { name: /Alexandra Christina Montgomery-Williams/ }).click();
  assert.match(await journey.locator(".admissions-journey-file").innerText(), /Alexandra Christina Montgomery-Williams/);
  await journey.getByRole("button", { name: "Open client file", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  assert.match(await dialog.innerText(), /Alexandra Christina Montgomery-Williams/);
  assert.equal(await dialog.locator('a[href*="alamo-pipeline.com"]').count(), 0);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ""), /Open client file/);

  await page.getByRole("combobox", { name: "Admissions community" }).selectOption("337");
  assert.equal(new URL(page.url()).searchParams.get("community"), "337");
  assert.equal(await journey.locator(".admissions-journey-person-button").count(), 4);
  assert.deepEqual((await journey.locator(".admissions-journey-count").allTextContents()).map(Number), [0, 2, 2, 0]);
  await page.goBack();
  assert.equal(await journey.locator(".admissions-journey-person-button").count(), 8);
  await page.screenshot({ path: path.join(screenshotDir, "admissions-infographic-desktop.png"), fullPage: true });

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await journey.getByRole("button", { name: /Alexandra Christina Montgomery-Williams/ }).click();
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      clippedNames: [...document.querySelectorAll(".admissions-journey-file-heading h3")].filter(node => node.scrollWidth > node.clientWidth + 1).length,
      people: [...document.querySelectorAll(".admissions-journey-person-button")].map(node => node.getBoundingClientRect().height)
    }));
    assert.ok(layout.overflow <= 1, `${width}px page overflow`);
    assert.equal(layout.clippedNames, 0, `${width}px clipped client names`);
    assert.ok(layout.people.every(height => height >= 44), `${width}px person target below 44px`);
    await page.screenshot({ path: path.join(screenshotDir, `admissions-infographic-${width}.png`), fullPage: true });
  }

  response = structuredClone(fixture); response.referral_pipeline.board.truncated = true;
  const partialPage = await context.newPage();
  await partialPage.route("**/api/platform/admissions-dashboard*", route => route.fulfill({ json: response }));
  await partialPage.goto(`${BASE_URL}/admissions`);
  await partialPage.getByText(/The active intake list is incomplete/).waitFor({ state: "visible" });
  assert.equal(await partialPage.locator(".admissions-journey-person-button").count(), 0);

  response = structuredClone(fixture); response.referral_pipeline.board.cards = []; response.referral_pipeline.board.total = 0; response.referral_pipeline.metrics.activeReferrals = 0;
  const emptyPage = await context.newPage();
  await emptyPage.route("**/api/platform/admissions-dashboard*", route => route.fulfill({ json: response }));
  await emptyPage.goto(`${BASE_URL}/admissions`);
  await emptyPage.getByText("No active referrals are recorded in the current Pipeline feed.", { exact: true }).waitFor({ state: "visible" });
  assert.equal(await emptyPage.locator(".admissions-journey-person-button").count(), 0);
  assert.equal(consoleErrors.length, 0, consoleErrors.join(" | "));
  assert.equal(requestFailures.length, 0, JSON.stringify(requestFailures));
  await context.close();
  console.log("Admissions browser: four-stage infographic, scoped people, client file, focus return, empty/partial feeds, and 320/390px layouts passed.");
});
