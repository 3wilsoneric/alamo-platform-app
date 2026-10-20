// Built CareConnector, the actual Platform route/proxy, and an invented upstream. No live records.
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { withBrowserQa } from "./browser-qa-utils.mjs";
import { createPocHandler } from "../server/careconnector-poc.mjs";

const release = (await readFile("generated/poc-release/context.txt", "utf8")).trim();
const distRoot = path.join(release, "overlay/dist");
let trusted = false, unlocked = false;
const tenantId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const authority = `https://login.microsoftonline.com/${tenantId}`;
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (claims) => `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}.invented-signature`;
const profile = { userId: "invented-supervisor", displayName: "Test Supervisor", roles: ["Supervisor"], pinSet: true };
const shift = { name: "Day", start: "2026-10-19T07:00:00Z", end: "2026-10-19T19:00:00Z" };
const calls = [];
const upstream = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://fixture.invalid");
  const body = [];
  for await (const chunk of req) body.push(chunk);
  calls.push(url.pathname);
  const json = (value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
  if (url.pathname === "/auth/config") return json({ mode: "microsoft", tablet: false, tenantId, clientId, scope: "api://invented/access_as_user" });
  if (url.pathname === "/auth/browser") return json({ trusted, person: trusted ? profile : null });
  if (url.pathname === "/auth/browser/enroll") {
    assert.equal(req.headers.authorization, "Bearer invented-access-token");
    assert.equal(req.headers.origin, upstreamOrigin);
    assert.equal(req.headers["x-careconnector-browser"], "1");
    trusted = true;
    res.setHeader("Set-Cookie", "__Host-careconnector-browser=invented; Path=/; Secure; HttpOnly; SameSite=Strict");
    return json(profile);
  }
  if (url.pathname === "/auth/browser/pin/unlock") {
    assert.equal(req.headers["x-careconnector-browser"], "1");
    assert.equal(req.headers.origin, upstreamOrigin);
    assert.deepEqual(JSON.parse(Buffer.concat(body).toString()), { pin: "4821" });
    unlocked = true; return json({ session: "invented-memory-session" });
  }
  if (url.pathname === "/auth/browser/pin/lock") { unlocked = false; res.writeHead(204); res.end(); return; }
  if (url.pathname === "/auth/browser/pin/touch") { res.writeHead(204); res.end(); return; }
  if (url.pathname.startsWith("/api/")) {
    assert.ok(unlocked, "Resident APIs cannot be called before PIN unlock");
    assert.equal(req.headers["x-careconnector-session"], "invented-memory-session");
    assert.equal(req.headers.cookie, "__Host-careconnector-browser=invented");
    assert.equal(req.headers.authorization, undefined, "Microsoft tokens are discarded after browser enrollment");
    if (url.pathname === "/api/me") return json(profile);
    if (url.pathname === "/api/facilities") return json([{ id: "337", shortName: "Test House", city: "Test City" }]);
    if (url.pathname === "/api/services/now") return json({ shift, timeZone: "UTC", facilityName: "Test House", current: [], earlier: [], nextAt: null });
    if (url.pathname === "/api/services/roster") return json({ shift, timeZone: "UTC", rows: [{ clientId: "invented-client", displayName: "Resident Example", bed: "Room 1", presence: "InHouse", scheduled: 5, documented: 0, due: 5, overdue: 0, notDocumented: 0, refused: 0, prn: 0, occurrences: [] }] });
    if (url.pathname === "/api/workspace") return json({ enabled: false });
  }
  return json({ title: "No invented fixture for this panel" }, 503);
});
await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
const upstreamOrigin = `http://127.0.0.1:${upstream.address().port}`;
let handler;
const server = http.createServer((req, res) => { void handler(req, res).then((handled) => { if (!handled) { res.writeHead(404); res.end(); } }); });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
handler = createPocHandler({ distRoot, upstreamOrigin, publicOrigin: origin });
try {
  await withBrowserQa(async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const outside = [], errors = [], violations = [];
  let nonce = "", microsoftVisits = 0;
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "login.microsoftonline.com") {
      if (url.pathname.includes("/discovery/instance")) return route.fulfill({ json: { tenant_discovery_endpoint: `${authority}/v2.0/.well-known/openid-configuration`, metadata: [{ preferred_network: "login.microsoftonline.com", preferred_cache: "login.windows.net", aliases: ["login.microsoftonline.com", "login.windows.net", "sts.windows.net"] }] } });
      if (url.pathname.includes("/.well-known/")) return route.fulfill({ json: { authorization_endpoint: `${authority}/oauth2/v2.0/authorize`, token_endpoint: `${authority}/oauth2/v2.0/token`, end_session_endpoint: `${authority}/oauth2/v2.0/logout`, issuer: `${authority}/v2.0`, jwks_uri: `${authority}/discovery/v2.0/keys`, response_types_supported: ["code"] } });
      if (url.pathname.endsWith("/authorize")) {
        microsoftVisits++;
        assert.equal(url.searchParams.get("redirect_uri"), `${origin}/poc/app/redirect.html`);
        assert.ok(url.searchParams.get("code_challenge"));
        nonce = url.searchParams.get("nonce");
        return route.fulfill({ status: 302, headers: { location: `${origin}/poc/app/redirect.html#code=invented-code&state=${encodeURIComponent(url.searchParams.get("state"))}` } });
      }
      if (url.pathname.endsWith("/token")) {
        const now = Math.floor(Date.now() / 1000);
        return route.fulfill({ json: { token_type: "Bearer", scope: "api://invented/access_as_user", expires_in: 3600, access_token: "invented-access-token", refresh_token: "invented-refresh-token", client_info: encode({ uid: profile.userId, utid: tenantId }), id_token: jwt({ aud: clientId, iss: `${authority}/v2.0`, sub: profile.userId, oid: profile.userId, tid: tenantId, nonce, iat: now, exp: now + 3600, name: profile.displayName, preferred_username: "supervisor@example.invalid" }) } });
      }
      throw new Error("Unexpected invented identity-provider route");
    }
    if (url.origin !== origin) { outside.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (/Content Security Policy|violates.*directive/i.test(message.text())) violations.push(message.text()); });
  await page.goto(`${origin}/poc`);
  const app = page.frameLocator("#app-screen");
  await app.getByRole("button", { name: "Set up with Microsoft", exact: true }).waitFor();
  assert.equal(await page.getByRole("navigation").count(), 0, "No Platform navigation outside the CareConnector iframe");
  assert.ok(!calls.some((call) => call.startsWith("/api/")));
  await app.getByRole("button", { name: "Set up with Microsoft", exact: true }).click();
  await app.getByRole("button", { name: "Test Supervisor Supervisor" }).waitFor();
  await page.reload();
  assert.equal(microsoftVisits, 1, "Browser enrollment survives reload without another Microsoft step");
  await app.getByRole("button", { name: "Test Supervisor Supervisor" }).click();
  await app.getByRole("group", { name: "Four-digit PIN keypad" }).focus();
  await page.keyboard.type("4821");
  await app.getByRole("button", { name: "Unlock", exact: true }).click();
  await app.getByRole("navigation", { name: "Primary navigation" }).waitFor();
  await app.getByRole("link", { name: "Roster", exact: true }).click();
  await app.getByText("Resident Example", { exact: true }).waitFor();
  assert.equal(await app.locator("html").evaluate(() => location.pathname), "/poc/app/services");
  const enteredAt = await app.locator("html").evaluate(() => performance.timeOrigin);
  await mkdir("generated/poc-release/qa", { recursive: true });
  await page.screenshot({ path: "generated/poc-release/qa/surface-invented.png" });
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  await page.screenshot({ path: "generated/poc-release/qa/desktop-invented.png" });
  await page.getByRole("button", { name: "Surface", exact: true }).click();
  await page.getByRole("button", { name: "Rotate Surface to portrait" }).click();
  assert.equal(await app.locator("html").evaluate(() => performance.timeOrigin), enteredAt);
  assert.equal(await app.locator("html").evaluate(() => innerWidth), 732);
  assert.equal(await app.locator("html").evaluate(() => navigator.serviceWorker.getRegistrations().then((registrations) => registrations.length)), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await app.getByRole("button", { name: "Lock AlamoPOC" }).click();
  await app.getByRole("heading", { name: "Who’s using AlamoPOC?" }).waitFor();
  assert.equal(await app.locator(".p-main").count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(violations, []);
  assert.deepEqual(outside, []);
  console.log("PASS: built /poc presenter + proxy; real MSAL popup/PKCE/bridge under production CSP against invented IdP, remembered cookie, Supervisor/PIN, discarded bearer, Roster/history, persistent Surface/Desktop/rotation session, mobile fit, lock, no Platform navigation/service worker/external traffic/CSP errors.");
  });
} finally {
  server.closeAllConnections(); upstream.closeAllConnections();
  await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => upstream.close(resolve))]);
}
