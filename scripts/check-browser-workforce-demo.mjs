#!/usr/bin/env node
import assert from "node:assert/strict";
import { BASE_URL, withBrowserQa } from "./browser-qa-utils.mjs";

await withBrowserQa(async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let liveFeedRequests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/platform/workforce-dashboard") liveFeedRequests += 1; });
  await page.goto(`${BASE_URL}/personnel`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === "/home");
  assert.equal(await page.locator('[data-workforce-overview="true"]').count(), 0);
  assert.equal(await page.getByRole("link", { name: "Personnel", exact: true }).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/workforce`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === "/home");
  assert.equal(liveFeedRequests, 0, "Blocked Personnel routes must not request live HR data");
  await page.close();
  console.log("Personnel block browser checks passed: direct and legacy URLs redirect, navigation hidden, HR feed untouched.");
});
