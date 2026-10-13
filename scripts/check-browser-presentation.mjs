#!/usr/bin/env node
import assert from "node:assert/strict";
import { BASE_URL, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";

const { screenshotDir } = await prepareArtifactDirs("browser-presentation");

const destinations = [
  ["platform-community", "/executive/dashboard", "Open Community dashboard"],
  ["platform-admissions", "/executive/dashboard", "Open Community admissions"],
  ["platform-assessment", "https://alamo-pipeline.com/?view=referrals", "Open Pipeline referrals"],
  ["platform-workforce", "/workforce", "Open Workforce"],
];

await withBrowserQa(async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
  const shortcut = page.getByRole("button", { name: "Open presentation" });
  await shortcut.waitFor({ state: "visible" });
  await shortcut.click();
  await page.getByRole("button", { name: /full screen/i }).waitFor({ state: "visible" });
  assert.equal(new URL(page.url()).pathname, "/presentation");

  await page.goto(`${BASE_URL}/executive/dashboard`, { waitUntil: "domcontentloaded" });
  const executiveShortcut = page.locator('[data-executive-director-header="true"]').getByRole("button", { name: "Open presentation" });
  await executiveShortcut.waitFor({ state: "visible" });
  await executiveShortcut.click();
  await page.getByRole("button", { name: "Close presentation" }).click();
  await page.locator('[data-executive-director-header="true"]').waitFor({ state: "visible" });
  assert.equal(new URL(page.url()).pathname, "/executive/dashboard", "Closing the deck must return to the Executive Director route.");

  for (const [slide, route, label] of destinations) {
    await page.goto(`${BASE_URL}/presentation#${slide}`, { waitUntil: "domcontentloaded" });
    const link = page.getByRole("link", { name: `${label} (opens in a new tab)` });
    await link.waitFor({ state: "visible" });
    assert.equal(await link.getAttribute("href"), route);
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.match(await link.getAttribute("rel"), /noopener/);
    assert.match(await link.getAttribute("rel"), /noreferrer/);
    assert.equal(await page.getByRole("button", { name: /full screen/i }).isVisible(), true);
    if (slide === "platform-community") await page.screenshot({ path: `${screenshotDir}/community-desktop.png` });
  }

  await page.goto(`${BASE_URL}/presentation#cover`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /full screen/i }).waitFor({ state: "visible" });
  assert.equal(await page.locator(".presentation-live-link").count(), 0, "Slides without a real route must not show a live link.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/presentation#platform-community`, { waitUntil: "domcontentloaded" });
  assert.equal(await page.getByRole("link", { name: "Open Community dashboard (opens in a new tab)" }).isVisible(), true);
  assert.equal(await page.getByRole("button", { name: /full screen/i }).isVisible(), true);
  assert.equal(await page.locator(".presentation-controls").evaluate((element) => element.scrollWidth <= element.clientWidth), true, "Mobile controls must fit without horizontal overflow.");
  await page.screenshot({ path: `${screenshotDir}/community-mobile.png` });
  await page.close();
  console.log("Presentation browser checks passed: shortcut, full-screen control, route links, new-tab behavior, and mobile controls.");
});
