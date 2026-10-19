import assert from "node:assert/strict";
import { build } from "vite";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createConversationFixture } from "./everyagent-conversation-fixture.mjs";
import { withBrowserQa, BASE_URL } from "./browser-qa-utils.mjs";

// Browser authentication is bypassed only on loopback; the actual HTTP server
// still verifies signed synthetic tokens for two separately registered clients.
const settings = { VITE_ALAMOAGENT_API_ORIGIN: "https://agent.example.test", VITE_ALAMOAGENT_SCOPE: "api://77777777-7777-4777-8777-777777777777/access_as_user", VITE_E2E_AUTH_BYPASS: "true" };
Object.assign(process.env, settings);
const runtimeMode = process.env.NODE_ENV;
await build({ configFile: "vite.agent.config.ts" });
if (runtimeMode === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = runtimeMode;
await import("./prepare-everyagent-web.mjs");
const fixture = await createConversationFixture({ webRoot: path.resolve("generated/everyagent-web") });
const output = path.resolve("generated/browser-everyagent-conversations");
await mkdir(output, { recursive: true });
async function bridge(page, clientId) {
  const token = await fixture.sign({ azp: clientId });
  await page.route("https://agent.example.test/api/agent/v1/**", async route => {
    const req = route.request();
    const url = new URL(req.url());
    const response = await fetch(`${fixture.base}${url.pathname}${url.search}`, { method: req.method(), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(req.method() === "POST" ? { body: req.postData() } : {}) });
    await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
  });
}
try {
  const web = await fetch(fixture.base);
  assert.equal(web.status, 200); assert.match(web.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal((await fetch(`${fixture.base}/package.json`)).status, 401);
  assert.equal((await fetch(`${fixture.base}/api/agent/v1/conversations`)).status, 401);
  await withBrowserQa(async browser => {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await bridge(page, fixture.clients[0]);
      await page.goto(fixture.base, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Discuss", exact: true }).first().waitFor().catch(async error => {
        await page.screenshot({ path: path.join(output, `failed-${width}.png`), fullPage: true });
        console.error("Direct-home fixture state:", await page.locator("body").innerText(), errors); throw error;
      });
      assert.doesNotMatch(await page.locator("body").innerText(), /Welcome|Your assistant|What do you need to know|I’m AlamoAgent/);
      assert.equal(await page.getByRole("textbox").count(), 0, "direct home leads with work");
      await page.getByRole("button", { name: "Discuss", exact: true }).first().click();
      const input = page.getByRole("textbox", { name: "Message AlamoAgent" });
      await input.waitFor();
      assert.match(await page.getByLabel("Chat scope").innerText(), /Licensing · 1 community/);
      await input.fill("Summarize this inspection and link the original.");
      await input.press("Enter");
      await page.getByLabel("AlamoAgent answer").first().waitFor();
      const id = new URL(page.url()).searchParams.get("chat");
      assert(id);
      await page.locator(".agent-conversation-sources summary").first().click();
      assert(await page.getByText(/Source checked/).count() > 0);
      assert(await page.locator('.agent-conversation-answer a[href^="https://www.alamoplatform.com/"]').count() > 0);
      await page.screenshot({ path: path.join(output, `direct-${width}.png`), fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), `${width}px direct home overflowed`);
      await page.reload(); await page.getByLabel("AlamoAgent answer").first().waitFor();
      assert.equal(await page.locator(".agent-conversation-user").count(), 1);
      const embedded = await context.newPage();
      embedded.on("pageerror", error => errors.push(error.message));
      await bridge(embedded, fixture.clients[1]);
      await embedded.goto(`${BASE_URL}/analytics/agent?chat=${id}`, { waitUntil: "domcontentloaded" });
      await embedded.bringToFront();
      await embedded.getByLabel("AlamoAgent answer").first().waitFor().catch(async error => {
        await embedded.screenshot({ path: path.join(output, `failed-embedded-${width}.png`), fullPage: true });
        console.error("Embedded fixture state:", embedded.url(), await embedded.locator("body").innerText(), await embedded.evaluate(() => document.visibilityState), errors); throw error;
      });
      assert.equal(await embedded.getByRole("button", { name: "Open AlamoAgent", exact: true }).count(), 0, "the floating helper must not cover the chat composer");
      await embedded.getByRole("textbox", { name: "Message AlamoAgent" }).fill("Which source supports that?");
      await embedded.getByRole("button", { name: "Send question" }).click();
      await embedded.locator('[aria-label="AlamoAgent answer"]').nth(1).waitFor();
      await embedded.screenshot({ path: path.join(output, `embedded-${width}.png`), fullPage: true });
      assert(await embedded.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), `${width}px embedded home overflowed`);
      await page.bringToFront(); await page.reload(); await page.getByLabel("AlamoAgent answer").nth(1).waitFor();
      assert.equal(await page.locator(".agent-conversation-user").count(), 2);
      await page.getByRole("textbox", { name: "Message AlamoAgent" }).fill("Keep this unsent draft");
      await embedded.bringToFront(); await page.bringToFront();
      await page.getByRole("textbox", { name: "Message AlamoAgent" }).waitFor();
      assert.equal(await page.getByRole("textbox", { name: "Message AlamoAgent" }).inputValue(), "Keep this unsent draft", "focus revalidation must preserve an unsent draft in memory");
      if (width === 1440) {
        let release;
        fixture.modelState.wait = () => new Promise(resolve => { release = resolve; });
        await page.getByRole("textbox", { name: "Message AlamoAgent" }).fill("Explain the evidence.");
        await page.getByRole("button", { name: "Send question" }).click();
        await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
        fixture.sourceFixture.state.document.grants[0].revoked = true;
        await page.getByRole("button", { name: "Refresh chats" }).click();
        const canceledResponse = page.waitForResponse(response => response.url().includes("/api/agent/v1/conversations") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "cancel");
        await page.getByRole("button", { name: "Stop request", exact: true }).click();
        assert.equal((await (await canceledResponse).json()).canceled, true);
        release(); fixture.modelState.wait = async () => {};
        fixture.sourceFixture.state.document.grants[0].revoked = false;
        await page.getByRole("button", { name: "Refresh chats" }).click();
        await page.getByText("Stopped.", { exact: true }).waitFor();
      }
      fixture.sourceFixture.state.document.grants[0].revoked = true;
      await page.getByRole("button", { name: "Refresh chats" }).click();
      await page.getByRole("alert").waitFor();
      assert.equal(await page.getByLabel("AlamoAgent answer").count(), 0, "revocation clears visible transcript");
      fixture.sourceFixture.state.document.grants[0].revoked = false;
      assert.deepEqual(errors, []);
      await context.close();
    }
  });
  console.log("Direct and embedded conversation browser checks passed at 320/390/1440px: real authenticated API, one persisted chat across clients, task-linked scope, cited replies, refresh/reopen, cancellation, revocation hiding, work-first layout and no overflow/runtime errors.");
} finally { await fixture.close(); }
