#!/usr/bin/env node
import { BASE_URL, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";

const { screenshotDir } = await prepareArtifactDirs("browser-monday-admissions-ribbon-qa");

await withBrowserQa(async (browser) => {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "compact-phone", width: 320, height: 568 },
    { name: "phone", width: 390, height: 844 }
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-10-19T17:00:00Z") });
    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    const ribbon = page.locator('[data-monday-admissions-ribbon="true"]');
    await ribbon.waitFor({ state: "visible" });
    const bounds = await ribbon.boundingBox();
    if (!bounds || bounds.x < -2 || bounds.x + bounds.width > viewport.width + 2) {
      throw new Error(`${viewport.name}: Monday ribbon is clipped`);
    }
    await page.screenshot({ path: `${screenshotDir}/${viewport.name}-monday.png` });

    await ribbon.getByRole("button", { name: "Dismiss Monday admissions briefing" }).click();
    await ribbon.waitFor({ state: "hidden" });
    await page.reload({ waitUntil: "domcontentloaded" });
    if (await ribbon.count()) throw new Error(`${viewport.name}: dismissed ribbon returned on Monday`);

    await page.clock.setFixedTime(new Date("2026-10-20T17:00:00Z"));
    await page.reload({ waitUntil: "domcontentloaded" });
    if (await ribbon.count()) throw new Error(`${viewport.name}: ribbon appeared on Tuesday`);

    await page.clock.setFixedTime(new Date("2026-10-26T17:00:00Z"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await ribbon.waitFor({ state: "visible" });
    await ribbon.getByRole("button", { name: "Open Admissions" }).click();
    await page.locator('[data-admissions-overview="true"]').waitFor({ state: "visible" });
    if (new URL(page.url()).pathname !== "/admissions") {
      throw new Error(`${viewport.name}: ribbon did not open Platform Admissions`);
    }
    await context.close();
  }
  console.log("Monday Admissions ribbon desktop and phone checks passed.");
});
