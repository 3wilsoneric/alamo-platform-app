#!/usr/bin/env node
import { BASE_URL, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";

const { screenshotDir } = await prepareArtifactDirs("browser-home-community-index-qa");

await withBrowserQa(async (browser) => {
  for (const viewport of [
    { name: "short-desktop", width: 1440, height: 640 },
    { name: "tablet", width: 1000, height: 768 },
    { name: "phone", width: 390, height: 844 },
    { name: "compact-phone", width: 320, height: 568 }
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-10-19T17:00:00Z") });
    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    if (await page.locator('[data-monday-admissions-ribbon="true"]').count()) {
      throw new Error(`${viewport.name}: removed briefing ribbon is still rendered`);
    }
    const index = page.locator('[data-california-community-index="true"]:visible');
    await index.waitFor({ state: "visible" });
    if (await index.locator('[data-california-index-community]').count() !== 5) {
      throw new Error(`${viewport.name}: community index does not contain all five communities`);
    }
    const bounds = await index.boundingBox();
    if (!bounds || bounds.x < -2 || bounds.x + bounds.width > viewport.width + 2) {
      throw new Error(`${viewport.name}: community index is clipped horizontally`);
    }
    await page.screenshot({ path: `${screenshotDir}/${viewport.name}.png` });
    await index.locator('[data-california-index-community]').first().click();
    await page.locator('[data-california-community-profile]').waitFor({ state: "visible" });
    await context.close();
  }
  console.log("Home community index is visible and navigable on short desktop, tablet, and phones; briefing ribbon is absent.");
});
