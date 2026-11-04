import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const script = await readFile(new URL("../public/point-of-care-launcher.js", import.meta.url), "utf8");
const launchScript = await readFile(new URL("../public/carelog-launch.js", import.meta.url), "utf8");
const launchHtml = await readFile(new URL("../public/carelog.html", import.meta.url), "utf8");
const demoScript = await readFile(new URL("../public/carelog-demo-launch.js", import.meta.url), "utf8");
const demoHtml = await readFile(new URL("../public/carelog-demo.html", import.meta.url), "utf8");
const phoneCss = await readFile(new URL("../public/carelog-phone.css", import.meta.url), "utf8");
const realBridge = await readFile(new URL("../public/carelog-platform-session.js", import.meta.url), "utf8");
const server = createServer((request, response) => {
  if (request.url === "/real-bridge") {
    response.writeHead(200, { "content-type": "text/html" });
    response.end('<!doctype html><html><body><iframe id="app-screen" src="about:blank"></iframe><script type="module" src="/real-platform-session.js" onload="document.getElementById(\'app-screen\').src=\'/real-frame\'"></script></body></html>');
    return;
  }
  if (request.url === "/real-frame") {
    response.writeHead(200, { "content-type": "text/html" });
    response.end('<!doctype html><html><body><script>addEventListener("message",e=>{if(e.data?.type==="poc-platform-token")document.body.dataset.error=e.data.error});parent.postMessage({type:"poc-platform-token-request",requestId:"real-test",interactive:false},location.origin)</script></body></html>');
    return;
  }
  if (request.url === "/real-platform-session.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(realBridge);
    return;
  }
  if (request.url === "/carelog-popup-token.js" || request.url?.startsWith("/carelog-popup-token.js?")) {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end("export async function acquireExistingPlatformToken(){return {token:sessionStorage.getItem('platform-session-check'),expires:Date.now()+3600000}}");
    return;
  }
  if (request.url === "/poc/app/auth/config") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ platform: { tenantId: "d72d9036-cff8-4f5f-a6fa-d698f621d420", clientId: "40283155-592b-4565-bd3c-c730a34feaaa", scope: "api://40283155-592b-4565-bd3c-c730a34feaaa/access_as_user" } }));
    return;
  }
  if (request.url === "/point-of-care-launcher.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(script);
    return;
  }
  if (request.url === "/carelog-launch.js" || request.url?.startsWith("/carelog-launch.js?")) {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(launchScript);
    return;
  }
  if (request.url === "/carelog.html" || request.url?.startsWith("/carelog.html?")) {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(launchHtml);
    return;
  }
  if (request.url === "/carelog-demo-launch.js" || request.url?.startsWith("/carelog-demo-launch.js?")) {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(demoScript);
    return;
  }
  if (request.url === "/carelog-demo.html") {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(demoHtml);
    return;
  }
  if (request.url === "/carelog-phone.css" || request.url?.startsWith("/carelog-phone.css?")) {
    response.writeHead(200, { "content-type": "text/css" });
    response.end(phoneCss);
    return;
  }
  if (request.url?.startsWith("/poc/app/now?")) {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html><html><head></head><body><div class="p-shell"><nav class="p-rail">Carelog</nav><main class="p-page">Client work</main></div><script>window.addEventListener('message',e=>{if(e.data?.type==='poc-platform-token')document.body.dataset.token=e.data.token});window.parent.postMessage({type:'poc-platform-token-request',requestId:'test',interactive:false},location.origin)</script></body></html>`);
    return;
  }
  if (request.url?.startsWith("/poc?")) {
    response.writeHead(200, { "content-type": "text/html" });
    response.end('<!doctype html><html><body><div id="demo-hand">Carelog Surface demo</div></body></html>');
    return;
  }
  if (request.url === "/carelog-platform-session.js" || request.url?.startsWith("/carelog-platform-session.js?")) {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end("window.addEventListener('message',event=>{if(event.origin!==location.origin||event.data?.type!=='poc-platform-token-request')return;event.source.postMessage({type:'poc-platform-token',requestId:event.data.requestId,token:sessionStorage.getItem('platform-session-check'),expires:Date.now()+3600000},location.origin)})");
    return;
  }
  const requestUrl = new URL(request.url, "http://localhost");
  const name = requestUrl.searchParams.get("name") ?? "Eric Wilson";
  const seed = requestUrl.searchParams.get("seed") === "1";
  response.writeHead(200, { "content-type": "text/html" });
  response.end(`<!doctype html><html><head></head><body>
    <header data-platform-page-navigation><a href="/home">Alamo</a><div data-platform-primary-links><a href="/analytics">Analytics</a><div data-platform-user-identity aria-label="Signed in as ${name}"></div></div><button aria-controls="platform-mobile-menu">Menu</button></header>
    ${seed ? "<script>sessionStorage.setItem('platform-session-check','retained')</script>" : ""}
    <script src="/point-of-care-launcher.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await (process.env.POC_BROWSER === "webkit" ? webkit : chromium).launch({ headless: true });
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
  assert.equal(await phone.locator("[data-platform-poc-surface='mobile']").getAttribute("href"), "/carelog.html?phone=1");
  await phone.evaluate(() => sessionStorage.setItem("platform-session-check", "retained"));
  const phonePopupPromise = phone.waitForEvent("popup");
  await phone.locator("[data-platform-poc-surface='mobile']").click();
  const phonePopup = await phonePopupPromise;
  await phonePopup.waitForURL("**/carelog.html?phone=1");
  await phonePopup.locator("#turn:visible").waitFor();
  // The application is already loaded behind the portrait prompt.
  await phonePopup.locator("#app-screen[src='/poc/app/now?platform=1&presented=1']").waitFor();
  await phonePopup.waitForFunction(() => document.querySelector("#app-screen")?.contentDocument?.body.dataset.token === "retained");
  assert.equal(await phonePopup.locator("script[src*='carelog-platform-session.js']").count(), 0);
  await phonePopup.locator("#loading").waitFor({ state: "hidden" });
  assert.equal(new URL(phone.url()).pathname, "/home");
  await phonePopup.setViewportSize({ width: 844, height: 390 });
  await phonePopup.locator("#turn").waitFor({ state: "hidden" });
  assert.equal(await phonePopup.evaluate(() => sessionStorage.getItem("platform-session-check")), "retained");
  assert.equal(await phonePopup.evaluate(() => window.opener === null), true);
  await phonePopup.locator("#app-screen[src='/poc/app/now?platform=1&presented=1']").waitFor();
  await phonePopup.waitForFunction(() => document.querySelector("#app-screen")?.contentDocument?.documentElement.hasAttribute("data-phone-surface"));
  await phonePopup.waitForFunction(() => document.querySelector("#app-screen")?.contentDocument?.body.dataset.token === "retained");
  assert.equal(await phonePopup.locator("#app-screen").evaluate((frame) => frame.style.width), "1098px");
  const fittedFrame = await phonePopup.locator("#app-screen").boundingBox();
  assert.ok(fittedFrame && fittedFrame.width >= 800 && fittedFrame.height >= 370);
  assert.equal(await phonePopup.locator("#app-screen").evaluate((frame) => frame.contentDocument?.getElementById("carelog-phone-viewport")?.getAttribute("href")), "/carelog-phone.css?v=phone-surface-1103");
  assert.equal(new URL(phone.url()).pathname, "/home");
  const preparedPhone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await preparedPhone.goto(`http://127.0.0.1:${port}/home?name=Eric%20Wilson&seed=1`);
  await preparedPhone.locator("[data-platform-poc-surface='mobile'][data-platform-token-ready='true']").waitFor();
  const preparedPopupPromise = preparedPhone.waitForEvent("popup");
  await preparedPhone.locator("[data-platform-poc-surface='mobile']").click();
  const preparedPopup = await preparedPopupPromise;
  await preparedPopup.waitForURL("**/carelog.html?phone=1");
  assert.equal(await preparedPopup.locator("html").getAttribute("data-carelog-handoff"), "ready");
  await preparedPopup.waitForFunction(() => document.querySelector("#app-screen")?.contentDocument?.body.dataset.token === "retained");
  assert.equal(await preparedPopup.evaluate(() => sessionStorage.getItem("carelog-platform-handoff-v1")), null);
  await desktop.goto(`http://127.0.0.1:${port}/carelog.html`);
  await desktop.locator("#app-screen[src='/poc/app/now?platform=1&presented=1']").waitFor();
  assert.equal(await desktop.locator("#turn").isHidden(), true);
  const portrait = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await portrait.goto(`http://127.0.0.1:${port}/carelog.html`);
  await portrait.locator("#turn:visible").waitFor();
  await portrait.locator("#app-screen[src='/poc/app/now?platform=1&presented=1']").waitFor();
  await portrait.locator("#loading").waitFor({ state: "hidden" });
  await portrait.locator("#continue-upright").click();
  await portrait.locator("#turn").waitFor({ state: "hidden" });
  await portrait.setViewportSize({ width: 844, height: 390 });
  assert.equal(await portrait.locator("#app-screen").getAttribute("src"), "/poc/app/now?platform=1&presented=1");
  // Safari may report no innerText even after a frame loads. The shell must
  // reveal the frame so Carelog can display its own loading or error state.
  const emptyFrame = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  await emptyFrame.route("**/poc/app/now?*", (route) => route.fulfill({
    status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>",
  }));
  await emptyFrame.goto(`http://127.0.0.1:${port}/carelog.html?phone=1`);
  await emptyFrame.locator("#app-screen[src='/poc/app/now?platform=1&presented=1']").waitFor();
  await emptyFrame.locator("#loading").waitFor({ state: "hidden" });
  const signingIn = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await signingIn.route("**/poc/app/now?*", (route) => route.fulfill({
    status: 200, contentType: "text/html", body: "<!doctype html><html><body><div class='p-lock'>Sign in</div></body></html>",
  }));
  await signingIn.goto(`http://127.0.0.1:${port}/carelog.html?phone=1`);
  await signingIn.locator("#loading").waitFor({ state: "hidden" });
  assert.equal(await signingIn.locator("#turn").isHidden(), true);
  assert.equal(await signingIn.locator("#app-screen").evaluate((frame) => frame.getBoundingClientRect().width), 390);
  await signingIn.locator("#app-screen").evaluate((frame) => {
    const work = frame.contentDocument.createElement("div");
    work.className = "p-shell";
    frame.contentDocument.body.append(work);
  });
  await signingIn.locator("#turn:visible").waitFor();
  await signingIn.setViewportSize({ width: 844, height: 390 });
  await signingIn.locator("#turn").waitFor({ state: "hidden" });
  assert.equal(await signingIn.locator("#app-screen").evaluate((frame) => frame.style.width), "1098px");
  await desktop.goto(`http://127.0.0.1:${port}/real-bridge`);
  await desktop.waitForFunction(() => document.querySelector("#app-screen")?.contentDocument?.body.dataset.error === "platform_no_session");
  console.log("Point of Care header and mobile entry checks passed.");
} finally {
  await browser.close();
  server.close();
}
