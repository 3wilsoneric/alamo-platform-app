#!/usr/bin/env node
import assert from "node:assert/strict";
import { BASE_URL, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";

const { screenshotDir } = await prepareArtifactDirs("browser-workforce-demo");

await withBrowserQa(async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE_URL}/workforce`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-workforce-demo="true"]').waitFor({ state: "visible" });
  assert.match(await page.locator('[data-workforce-demo="true"]').innerText(), /fictional.*not connected/i);
  assert.equal(await page.getByRole("tab", { name: "Briefing" }).getAttribute("aria-selected"), "true");
  await page.locator('[data-workforce-executive-update="true"]').waitFor({ state: "visible" });
  await page.getByRole("tab", { name: "Hiring board" }).click();
  assert.equal(new URL(page.url()).searchParams.get("view"), "board");
  assert.equal(await page.locator('[data-workforce-role-card="true"]').count(), 9);
  await page.getByRole("group", { name: "Filter by community" }).getByRole("button", { name: "San Pablo" }).click();
  assert.equal(await page.locator('[data-workforce-role-card="true"]').count(), 2);
  await page.getByRole("group", { name: "Filter by community" }).getByRole("button", { name: "All communities" }).click();
  await page.getByRole("tab", { name: "Briefing" }).click();
  await page.locator('[data-workforce-executive-update="true"][aria-busy="false"]').waitFor({ state: "visible" });
  await page.screenshot({ path: `${screenshotDir}/workforce-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-workforce-demo="true"]').waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Mobile Workforce must not overflow horizontally");
  await page.screenshot({ path: `${screenshotDir}/workforce-mobile.png`, fullPage: true });
  await page.close();
  console.log("Workforce demo browser checks passed: labeled local fixture, briefing, board filters, and mobile layout.");
});
