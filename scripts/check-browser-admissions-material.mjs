#!/usr/bin/env node
import { connectedAdmissionsFixture } from "./check-admissions-dashboard.mjs";
import { BASE_URL, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";

const { screenshotDir } = await prepareArtifactDirs("browser-admissions-material-qa");

await withBrowserQa(async (browser) => {
  for (const [label, width, height] of [["desktop", 1440, 900], ["phone", 390, 844], ["narrow-phone", 320, 700]]) {
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
    const page = await context.newPage();
    await page.route("**/api/platform/admissions-dashboard", (route) => route.fulfill({ json: connectedAdmissionsFixture }));
    await page.goto(`${BASE_URL}/admissions?view=pipeline`, { waitUntil: "domcontentloaded" });
    const files = page.locator('[data-admissions-board-card]:visible');
    await files.first().waitFor({ state: "visible" });
    if (await files.count() < 1 || await files.first().getByText("Client file").count() !== 1) {
      throw new Error(`${label} Pipeline lost the client-file card.`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) throw new Error(`${label} Pipeline overflows horizontally by ${overflow}px.`);
    await page.screenshot({ path: `${screenshotDir}/${label}-pipeline.png`, fullPage: true });

    await files.first().click();
    const dialog = page.getByRole("dialog", { name: /Jordan Lee/ });
    await dialog.waitFor({ state: "visible" });
    if (await dialog.getByRole("button", { name: "Close client file" }).count() !== 1) {
      throw new Error(`${label} client file cannot be closed.`);
    }
    if (await dialog.locator(".admissions-client-document-header h2").innerText() !== "Jordan Lee") {
      throw new Error(`${label} client file lost its document identity.`);
    }
    if ((await dialog.locator(".admissions-client-document-status").textContent())?.trim() !== "Referral received") {
      throw new Error(`${label} client file lost its actual Pipeline status.`);
    }
    const paperOverflow = await dialog.locator('[data-admissions-chart-paper="true"]').evaluate((paper) => paper.scrollWidth - paper.clientWidth);
    if (paperOverflow > 1) throw new Error(`${label} client file overflows horizontally by ${paperOverflow}px.`);
    await page.screenshot({ path: `${screenshotDir}/${label}-client-file.png` });
    await dialog.locator('[data-admissions-data-trigger="placement"]').click();
    if (!await dialog.locator('[data-admissions-data-detail="placement"]').isVisible()) {
      throw new Error(`${label} client file disclosure no longer opens.`);
    }
    await dialog.getByRole("button", { name: "Close client file" }).click();
    if (!await files.first().evaluate((file) => document.activeElement === file)) {
      throw new Error(`${label} focus did not return to the client file after close.`);
    }
    await page.goto(`${BASE_URL}/admissions`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-admissions-executive-update="true"][data-admissions-chat-typing="false"]').waitFor({ state: "visible" });
    const briefingText = await page.locator('[data-admissions-executive-update="true"]').innerText();
    if (!briefingText.includes("1 has been accepted") || /No community assigned has the largest|1 have been accepted/.test(briefingText)) {
      throw new Error(`${label} Briefing contains misleading workload language or singular grammar.`);
    }
    await page.screenshot({ path: `${screenshotDir}/${label}-briefing.png`, fullPage: true });
    await context.close();
  }
  console.log("browser admissions material checks passed");
});
