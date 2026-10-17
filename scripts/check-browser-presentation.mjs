#!/usr/bin/env node
import assert from "node:assert/strict";
import { BASE_URL, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";

const { screenshotDir } = await prepareArtifactDirs("browser-presentation");

const destinations = [
  ["platform", "/home", "Open Alamo Platform"],
  ["platform-community", "/executive/dashboard", "Open Community dashboard"],
  ["platform-assessment", "https://alamo-pipeline.com/?view=referrals", "Open Pipeline referrals"],
];

await withBrowserQa(async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-platform-header="true"]').waitFor({ state: "visible" });
  assert.equal(await page.getByRole("button", { name: "Open presentation" }).count(), 0);
  await page.goto(`${BASE_URL}/presentation`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /full screen/i }).waitFor({ state: "visible" });
  assert.equal(new URL(page.url()).pathname, "/presentation");

  await page.goto(`${BASE_URL}/executive/dashboard`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-executive-director-header="true"]').waitFor({ state: "visible" });
  assert.equal(await page.getByRole("button", { name: "Open presentation" }).count(), 0);

  for (const [slide, route, label] of destinations) {
    await page.goto(`${BASE_URL}/presentation#${slide}`, { waitUntil: "domcontentloaded" });
    await page.frameLocator("iframe.presentation-slide").locator("h2").waitFor({ state: "visible" });
    const image = page.frameLocator("iframe.presentation-slide").locator("img").first();
    await image.evaluate((element) => {
      if (!element.complete) return new Promise((resolve) => element.addEventListener("load", resolve, { once: true }));
    });
    assert.equal(await image.evaluate((element) => element.naturalWidth > 0), true, `${slide} image must load`);
    const link = page.getByRole("link", { name: `${label} (opens in a new tab)` });
    await link.waitFor({ state: "visible" });
    assert.equal(await link.getAttribute("href"), route);
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.match(await link.getAttribute("rel"), /noopener/);
    assert.match(await link.getAttribute("rel"), /noreferrer/);
    assert.equal(await page.getByRole("button", { name: /full screen/i }).isVisible(), true);
    if (slide === "platform-community") await page.screenshot({ path: `${screenshotDir}/community-desktop.png` });
  }

  const overflow = [];
  for (const slide of ["cover", "thesis", "stack", "platform", "platform-community", "platform-assessment", "next", "epic", "cc-now", "wf-answer", "software-as-work", "everyagent-how", "everyagent-examples", "close", "endstate", "epic-plan"]) {
    await page.goto(`${BASE_URL}/presentation#${slide}`, { waitUntil: "domcontentloaded" });
    const content = page.frameLocator("iframe.presentation-slide").locator("section");
    await content.waitFor({ state: "visible" });
    const fit = await content.evaluate((element) => ({ width: element.scrollWidth, height: element.scrollHeight }));
    if (fit.width > 1920 || fit.height > 1080) overflow.push(`${slide}: ${JSON.stringify(fit)}`);
  }
  assert.deepEqual(overflow, [], `Slides must fit the 1920 × 1080 canvas:\n${overflow.join("\n")}`);

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
  console.log("Presentation browser checks passed: hidden shortcuts, direct access, full-screen control, route links, new-tab behavior, and mobile controls.");
});
