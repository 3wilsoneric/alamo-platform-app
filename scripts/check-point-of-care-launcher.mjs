import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const script = await readFile(new URL("../public/point-of-care-launcher.js", import.meta.url), "utf8");
const server = createServer((request, response) => {
  if (request.url === "/point-of-care-launcher.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(script);
    return;
  }
  const name = new URL(request.url, "http://localhost").searchParams.get("name") ?? "Eric Wilson";
  response.writeHead(200, { "content-type": "text/html" });
  response.end(`<!doctype html><html><head></head><body>
    <div data-platform-user-identity aria-label="Signed in as ${name}"></div>
    <div data-california-home-hero></div>
    <div data-mobile-community-home><div></div></div>
    <script src="/point-of-care-launcher.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const name of ["Betty Dominici", "Andrew Dominici"]) {
    await page.goto(`http://127.0.0.1:${port}/home?name=${encodeURIComponent(name)}`);
    await page.locator(".platform-poc-launcher").first().waitFor();
    assert.equal(await page.locator(".platform-poc-launcher").count(), 2);
    assert.equal(await page.locator("[data-mobile-community-home] > div > .platform-poc-launcher").count(), 1);
    assert.equal(await page.locator(".platform-poc-launcher").first().getAttribute("href"), "/poc?platform=1&view=desktop");
  }
  await page.goto(`http://127.0.0.1:${port}/home?name=Eric%20Wilson`);
  assert.equal(await page.locator(".platform-poc-launcher").count(), 0);
  await page.goto(`http://127.0.0.1:${port}/analytics?name=Betty%20Dominici`);
  assert.equal(await page.locator(".platform-poc-launcher").count(), 0);
  console.log("Point of Care launcher checks passed.");
} finally {
  await browser.close();
  server.close();
}
