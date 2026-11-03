import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const script = await readFile(new URL("../public/licensing-nav-alert.js", import.meta.url), "utf8");
const server = createServer((request, response) => {
  if (request.url === "/licensing-nav-alert.js") {
    response.writeHead(200, { "content-type": "text/javascript" }); response.end(script); return;
  }
  response.writeHead(200, { "content-type": "text/html" });
  response.end(`<!doctype html><html><head></head><body>
    <nav data-platform-page-navigation><a href="/analytics/licensing">Licensing</a></nav>
    <nav data-platform-mobile-menu><a href="/analytics/licensing"><span>Licensing</span></a></nav>
    <section data-licensing-page><button aria-expanded="false">Updates</button></section>
    <script defer src="/licensing-nav-alert.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const accountId = "424b21d4-605a-43a6-8dff-2a89a846e698";
const latest = "2026-11-03T16:00:00Z";
const initial = [{ id: "older", at: "2026-10-26T16:00:00Z" }, { id: "fresh", at: latest }];
const send = (id, alerts) => page.evaluate(({ id, alerts, latest }) => {
  window.dispatchEvent(new CustomEvent("alamo:licensing-feed", { detail: { accountId: id, alerts, lastSuccessful: latest } }));
}, { id, alerts, latest });
const count = () => page.locator("[data-platform-page-navigation] .licensing-nav-alert__indicator b").textContent();
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/home`);
  await send(accountId, initial);
  await page.locator("[data-platform-page-navigation] .licensing-nav-alert__indicator").waitFor();
  assert.equal(await count(), "1");
  assert.equal(await page.locator("[data-platform-mobile-menu] .licensing-nav-alert__indicator").count(), 1);
  await page.locator("[data-licensing-page] button").click();
  await page.locator("[data-platform-page-navigation] .licensing-nav-alert__indicator").waitFor({ state: "detached" });
  await send(accountId, [...initial, { id: "next", at: "2026-11-04T18:00:00Z" }]);
  await page.locator("[data-platform-page-navigation] .licensing-nav-alert__indicator").waitFor();
  assert.equal(await count(), "1");
  await page.reload();
  await send(accountId, [...initial, { id: "next", at: "2026-11-04T18:00:00Z" }]);
  await page.locator("[data-platform-page-navigation] .licensing-nav-alert__indicator").waitFor();
  assert.equal(await count(), "1", "Unread status must survive reload.");
  await page.locator("[data-licensing-page] button").click();
  await page.locator("[data-platform-page-navigation] .licensing-nav-alert__indicator").waitFor({ state: "detached" });
  await send("e9f39185-d751-45c0-bcf5-c24d3565bdd9", initial);
  await page.locator("[data-platform-page-navigation] .licensing-nav-alert__indicator").waitFor();
  assert.equal(await count(), "1", "Read state must be separate per account.");
  console.log("Licensing navigation alert checks passed.");
} finally {
  await browser.close(); server.close();
}
