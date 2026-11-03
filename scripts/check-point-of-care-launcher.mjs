import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const script = await readFile(new URL("../public/point-of-care-launcher.js", import.meta.url), "utf8");
const launchScript = await readFile(new URL("../public/carelog-launch.js", import.meta.url), "utf8");
const launchHtml = await readFile(new URL("../public/carelog.html", import.meta.url), "utf8");
const demoScript = await readFile(new URL("../public/carelog-demo-launch.js", import.meta.url), "utf8");
const demoHtml = await readFile(new URL("../public/carelog-demo.html", import.meta.url), "utf8");
const server = createServer((request, response) => {
  if (request.url === "/point-of-care-launcher.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(script);
    return;
  }
  if (request.url === "/carelog-launch.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(launchScript);
    return;
  }
  if (request.url === "/carelog.html") {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(launchHtml);
    return;
  }
  if (request.url === "/carelog-demo-launch.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(demoScript);
    return;
  }
  if (request.url === "/carelog-demo.html") {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(demoHtml);
    return;
  }
  if (request.url?.startsWith("/poc?")) {
    response.writeHead(200, { "content-type": "text/html" });
    response.end('<!doctype html><html><body><div id="demo-hand">Carelog Surface demo</div></body></html>');
    return;
  }
  if (request.url === "/poc/app/platform-session.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end("window.__testBridgeReady = true;");
    return;
  }
  const name = new URL(request.url, "http://localhost").searchParams.get("name") ?? "Eric Wilson";
  response.writeHead(200, { "content-type": "text/html" });
  response.end(`<!doctype html><html><head></head><body>
    <header data-platform-page-navigation><a href="/home">Alamo</a><div data-platform-primary-links><a href="/analytics">Analytics</a><div data-platform-user-identity aria-label="Signed in as ${name}"></div></div><button aria-controls="platform-mobile-menu">Menu</button></header>
    <script src="/point-of-care-launcher.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newPage();
  for (const name of ["Betty Dominici", "Andrew Dominici", "Eric Wilson"]) {
    await desktop.goto(`http://127.0.0.1:${port}/home?name=${encodeURIComponent(name)}`);
    await desktop.locator(".platform-poc-launcher").first().waitFor();
    assert.equal(await desktop.locator(".platform-poc-launcher").count(), 2);
    assert.equal(await desktop.locator("[data-platform-primary-links] > .platform-poc-launcher").count(), 1);
    assert.equal(await desktop.locator("[data-platform-page-navigation] > .platform-poc-launcher").count(), 1);
    assert.equal(await desktop.locator(".platform-poc-launcher").first().getAttribute("href"), "/carelog-demo.html");
    assert.equal(await desktop.locator(".platform-poc-launcher").first().getAttribute("target"), "_blank");
    assert.equal(await desktop.locator(".platform-poc-launcher").first().getAttribute("rel"), "opener");
  }
  await desktop.goto(`http://127.0.0.1:${port}/analytics?name=Eric%20Wilson`);
  await desktop.locator(".platform-poc-launcher").first().waitFor();
  assert.equal(await desktop.locator(".platform-poc-launcher").count(), 2);
  await desktop.evaluate(() => sessionStorage.setItem("platform-session-check", "retained"));
  const desktopPopupPromise = desktop.waitForEvent("popup");
  await desktop.locator("[data-platform-poc-surface='desktop']").click();
  const desktopPopup = await desktopPopupPromise;
  await desktopPopup.waitForURL("**/poc?platform=1&view=surface");
  assert.equal(await desktopPopup.locator("#demo-hand").count(), 1);
  assert.equal(await desktopPopup.evaluate(() => sessionStorage.getItem("platform-session-check")), "retained");
  assert.equal(await desktopPopup.evaluate(() => window.opener === null), true);
  assert.equal(new URL(desktop.url()).pathname, "/analytics");
  await desktop.goto(`http://127.0.0.1:${port}/home?name=Raj%20Thandi`);
  assert.equal(await desktop.locator(".platform-poc-launcher").count(), 0);

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.goto(`http://127.0.0.1:${port}/home?name=Eric%20Wilson`);
  const phonePopupPromise = phone.waitForEvent("popup");
  await phone.locator("[data-platform-poc-surface='mobile']").click();
  const phonePopup = await phonePopupPromise;
  await phonePopup.locator("#turn:visible").waitFor();
  assert.equal(new URL(phonePopup.url()).pathname, "/carelog-demo.html");
  assert.equal(new URL(phone.url()).pathname, "/home");
  await phonePopup.setViewportSize({ width: 844, height: 390 });
  await phonePopup.waitForURL("**/poc?platform=1&view=surface");
  assert.equal(new URL(phone.url()).pathname, "/home");
  await desktop.goto(`http://127.0.0.1:${port}/carelog.html`);
  await desktop.locator("#app-screen[src='/poc/app/now?platform=1']").waitFor();
  assert.equal(await desktop.locator("#turn").isHidden(), true);
  const portrait = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await portrait.goto(`http://127.0.0.1:${port}/carelog.html`);
  await portrait.locator("#turn:visible").waitFor();
  assert.equal(await portrait.locator("#app-screen").getAttribute("src"), "about:blank");
  await portrait.setViewportSize({ width: 844, height: 390 });
  await portrait.locator("#app-screen[src='/poc/app/now?platform=1']").waitFor();
  console.log("Point of Care header and mobile entry checks passed.");
} finally {
  await browser.close();
  server.close();
}
