#!/usr/bin/env node
import assert from "node:assert/strict";
import { BASE_URL, withBrowserQa } from "./browser-qa-utils.mjs";

await withBrowserQa(async browser => {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "no-preference" });
    const page = await context.newPage();
    await context.route(url => url.pathname.startsWith("/api/"), route => route.fulfill({ json: {} }));
    await page.goto(`${BASE_URL}/analytics`, { waitUntil: "domcontentloaded" });
    const launcher = page.locator(".platform-ally-header-button:visible").first();
    await launcher.waitFor();
    await page.evaluate(() => {
      window.__allyFlightDirections = [];
      const observer = new MutationObserver(() => {
        for (const mark of document.querySelectorAll("[data-ally-flight]")) {
          const direction = mark.getAttribute("data-ally-flight");
          if (direction && !window.__allyFlightDirections.includes(direction)) window.__allyFlightDirections.push(direction);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    await launcher.click();
    const panel = page.getByRole("dialog", { name: "Ally" });
    await panel.waitFor({ state: "visible" });
    assert.equal(await launcher.getAttribute("aria-expanded"), "true");
    assert.equal(await panel.locator(".ally-panel-mark path").count(), 3);
    await page.waitForFunction(() => window.__allyFlightDirections.includes("out"));
    await page.waitForTimeout(320);
    assert.equal(await page.locator("[data-ally-flight]").count(), 0);
    assert.equal(await panel.locator(".ally-panel-mark").evaluate(mark => getComputedStyle(mark).visibility), "visible");
    await panel.getByRole("button", { name: "Close Ally" }).click();
    await panel.waitFor({ state: "hidden" });
    await page.waitForFunction(() => window.__allyFlightDirections.includes("home"));
    await page.waitForTimeout(280);
    assert.equal(await launcher.getAttribute("aria-expanded"), "false");
    assert.equal(await launcher.locator(".p-ally-mark").evaluate(mark => getComputedStyle(mark).visibility), "visible");
    assert.equal(await launcher.evaluate(button => document.activeElement === button), true);
    await context.close();
  }
});

console.log("Carelog-style Ally bookmark opens, travels, returns and restores focus at desktop and phone widths.");
