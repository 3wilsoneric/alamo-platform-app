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
    const compact = await panel.boundingBox();
    const chatSurface = panel.locator(".everyagent-companion-body, .executive-ally-chat").first();
    await chatSurface.evaluate(element => { element.dataset.allyStateProbe = "same"; });
    if (width > 700) await panel.getByRole("button", { name: "Expand Ally to full screen" }).click();
    const expanded = await panel.boundingBox();
    assert.ok(expanded, "expanded Ally remains visible");
    assert.ok(Math.abs(expanded.x) <= 1 && Math.abs(expanded.y) <= 1, "expanded Ally reaches viewport origin");
    assert.ok(Math.abs(expanded.width - width) <= 1, "expanded Ally fills viewport width");
    assert.ok(Math.abs(expanded.height - 844) <= 1, "expanded Ally fills viewport height");
    if (width > 700) assert.equal(await panel.getByRole("button", { name: "Restore Ally panel" }).getAttribute("aria-pressed"), "true");
    if (await panel.locator(".ally-panel-create").count()) {
      await panel.locator(".ally-panel-create summary").click();
      assert.equal(await panel.getByRole("button", { name: "New chat" }).count(), 1, "chat controls remain available");
      await panel.locator(".ally-panel-create summary").click();
    } else assert.equal(await panel.getByRole("button", { name: "New chat" }).count(), 0, "an empty chat does not show a redundant new-chat action");
    assert.equal(await chatSurface.getAttribute("data-ally-state-probe"), "same", "the existing chat stays mounted");
    if (width > 700) {
      await page.keyboard.press("Escape");
      assert.equal(await panel.getByRole("button", { name: "Expand Ally to full screen" }).count(), 1, "Escape restores the panel first");
      await panel.getByRole("button", { name: "Expand Ally to full screen" }).click();
      await panel.getByRole("button", { name: "Restore Ally panel" }).click();
      const restored = await panel.boundingBox();
      assert.ok(restored, "Ally returns to its compact panel");
      assert.ok(Math.abs(restored.width - compact.width) <= 1 && Math.abs(restored.x - compact.x) <= 1, "compact geometry is restored");
    }
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

console.log("Ally bookmark flight, full-screen expand/restore, Escape and focus return passed at desktop and phone widths.");
