import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const launcher = await readFile(new URL("../public/point-of-care-launcher.js", import.meta.url), "utf8");
const redirect = await readFile(new URL("../public/carelog-demo-launch.js", import.meta.url), "utf8");
const redirectHtml = await readFile(new URL("../public/carelog-demo.html", import.meta.url), "utf8");
const sourceIndex = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.match(sourceIndex, /<script defer src="\/point-of-care-launcher\.js"><\/script>/);

const server = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  const html = (body) => { response.writeHead(200, { "content-type": "text/html" }); response.end(body); };
  if (url.pathname === "/point-of-care-launcher.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(launcher);
  } else if (url.pathname === "/carelog-demo-launch.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(redirect);
  } else if (url.pathname === "/carelog-demo.html") {
    html(redirectHtml);
  } else if (url.pathname === "/poc") {
    // The live presenter has the same Platform token bridge. Check that the
    // opened tab can answer its child app without an interactive login.
    html(`<!doctype html><html><body><h1>Carelog Surface</h1>
      <iframe id="app-screen" src="/poc/app/?platform=1&presented=1"></iframe>
      <script>addEventListener("message",event=>{
        if(event.origin!==location.origin||event.data?.type!=="poc-platform-token-request")return;
        event.source.postMessage({type:"poc-platform-token",requestId:event.data.requestId,
          token:sessionStorage.getItem("platform-session-check")},location.origin)
      })</script></body></html>`);
  } else if (url.pathname === "/poc/app/") {
    html(`<!doctype html><html><body><script>
      addEventListener("message",event=>{
        if(event.origin===location.origin&&event.data?.type==="poc-platform-token")
          document.body.dataset.token=event.data.token||"missing"
      });
      parent.postMessage({type:"poc-platform-token-request",requestId:"desktop-check",interactive:false},location.origin);
    </script></body></html>`);
  } else {
    const name = url.searchParams.get("name") ?? "Eric Wilson";
    html(`<!doctype html><html><body>
      <header data-platform-page-navigation>
        <div data-platform-primary-links>
          <a href="/analytics">Analytics</a>
          <div data-platform-user-identity aria-label="Signed in as ${name}"></div>
        </div>
        <button aria-controls="platform-mobile-menu">Menu</button>
      </header>
      <script src="/point-of-care-launcher.js"></script></body></html>`);
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (process.env.POC_BROWSER === "webkit" ? webkit : chromium).launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const name of ["Betty Dominici", "Andrew Dominici", "Eric Wilson"]) {
    await page.goto(`${base}/home?name=${encodeURIComponent(name)}`);
    const link = page.locator("[data-platform-primary-links] > .platform-poc-launcher");
    await link.waitFor();
    assert.equal(await link.isVisible(), true);
    assert.equal(await page.locator(".platform-poc-launcher").count(), 1);
    assert.equal(await link.getAttribute("href"), "/carelog-demo.html");
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.equal(await link.getAttribute("rel"), "opener");
    await page.evaluate(() => sessionStorage.setItem("platform-session-check", "existing-platform-session"));
    const opened = page.waitForEvent("popup");
    await link.click();
    const popup = await opened;
    await popup.waitForURL("**/poc?platform=1&view=surface");
    await popup.waitForFunction(() => document.querySelector("#app-screen")?.contentDocument?.body.dataset.token === "existing-platform-session");
    assert.equal(await popup.evaluate(() => window.opener), null);
    assert.equal(new URL(page.url()).pathname, "/home");
    await popup.close();
  }
  await page.goto(`${base}/analytics?name=Raj%20Thandi`);
  assert.equal(await page.locator(".platform-poc-launcher").count(), 0);
  await page.goto(`${base}/home?name=Betty%20Dominici`);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator(".platform-poc-launcher").isVisible(), false);
  assert.equal(await page.locator("[data-platform-page-navigation] > .platform-poc-launcher").count(), 0);
  await page.setViewportSize({ width: 900, height: 900 });
  assert.equal(await page.locator(".platform-poc-launcher").isVisible(), false);
  console.log("Desktop Carelog Surface link and session handoff checks passed.");
} finally {
  await browser.close();
  server.close();
}
