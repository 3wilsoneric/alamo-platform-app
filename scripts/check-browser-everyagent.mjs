import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BASE_URL, withBrowserQa } from "./browser-qa-utils.mjs";
import { createEveryAgentPersistence } from "../server/everyagent-persistence.mjs";
import { createEveryAgentStore } from "../server/everyagent-store.mjs";
import { createEveryAgentService } from "../server/everyagent-service.mjs";
import { EVERYAGENT_TENANT, EVERYAGENT_USERS } from "../shared/everyagent-catalog.mjs";

const output = path.resolve("generated/browser-everyagent");
await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(os.tmpdir(), "everyagent-browser-"));
const auth = { authenticated: true, mode: "entra-delegated", claims: { tid: EVERYAGENT_TENANT, oid: EVERYAGENT_USERS[0] } };
let time = Date.now();
let fingerprint = "one";
const result = (skill) => ({ connection: "connected", issue: null, sourceCheckedAt: new Date(time).toISOString(), entries: [{
  key: skill, fingerprint, communityIds: skill === "licensing" ? ["337"] : [],
  title: skill === "licensing" ? "New San Pablo inspection report" : "Admissions activity changed",
  summary: skill === "licensing" ? "A new inspection report is ready to review with its original state source." : "12 active referrals · 2 flagged as stale · 1 unassigned · 4 awaiting admission.",
  evidence: [{ id: skill, kind: "module", label: "View source", href: skill === "licensing" ? "/analytics/agent?skill=licensing" : "/admissions", observedAt: new Date(time).toISOString() }], relationships: []
}] });
const service = createEveryAgentService({
  store: createEveryAgentStore(createEveryAgentPersistence({ localPath: path.join(directory, "state.json"), azure: false })),
  adapters: { licensing: async () => result("licensing"), "admissions-watch": async () => result("admissions-watch") }, now: () => time
});
await service.tick(); time += 16 * 60_000; fingerprint = "two"; await service.tick();
try {
  await withBrowserQa(async browser => {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 } });
      const page = await context.newPage();
      const errors = [];
      let sourceUnavailable = false;
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/platform/everyagent", async route => {
        if (sourceUnavailable) return route.fulfill({ status: 503, json: { error: "Unavailable" } });
        const request = route.request();
        const view = request.method() === "POST" ? await service.command(auth, request.postDataJSON()) : await service.overview(auth);
        await route.fulfill({ json: { ...view, workerEnabled: true } });
      });
      await page.goto(`${BASE_URL}/everyagent`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "I’m EveryAgent.", exact: true }).waitFor();
      await page.getByRole("link", { name: /Admissions watch/ }).first().waitFor();
      assert.equal(new URL(page.url()).pathname, "/analytics/agent");
      assert.equal(await page.getByRole("region", { name: "EveryAgent workspace" }).getByText("Email delivery is off.", { exact: false }).count(), 1);
      assert.equal(await page.getByRole("textbox").count(), 0, "work should appear without a prompt");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, `${width}px layout overflowed by ${overflow}px`);
      await page.screenshot({ path: path.join(output, `everyagent-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: "Open EveryAgent", exact: true }).click();
      const companion = page.getByRole("dialog", { name: "I’m EveryAgent." });
      await companion.waitFor();
      await companion.getByText("With you in your briefing", { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Close EveryAgent");
      assert(await companion.getByRole("article").count() > 0, "embedded assistant should surface actual work");
      assert.equal(await page.evaluate(() => { const dialog = document.querySelector("dialog"); return dialog.scrollWidth <= dialog.clientWidth + 1; }), true);
      await page.screenshot({ path: path.join(output, `everyagent-companion-${width}.png`), fullPage: true });
      await page.keyboard.press("Escape");
      await companion.waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Open EveryAgent");
      if (width === 1440) {
        await page.getByRole("button", { name: "Manage my skills" }).click();
        const watch = page.getByRole("article", { name: "Watch state licensing reports" });
        await watch.getByRole("button", { name: "Pause", exact: true }).click();
        await watch.getByRole("button", { name: "Resume", exact: true }).waitFor();
        await page.reload();
        await page.getByRole("button", { name: "Manage my skills" }).click();
        await watch.getByRole("button", { name: "Resume", exact: true }).waitFor();
        await watch.getByRole("button", { name: "Resume", exact: true }).click();
        await watch.getByRole("button", { name: "Pause", exact: true }).waitFor();
        await watch.getByRole("button", { name: "Configure Licensing" }).click();
        await watch.getByLabel("Santa Clarita", { exact: true }).uncheck();
        await watch.getByRole("button", { name: "Save scope" }).click();
        await watch.getByText("3 communities · your workspace", { exact: true }).waitFor();
        await page.getByRole("button", { name: /^Needs you/ }).click();
        await page.getByRole("button", { name: "Mark reviewed" }).first().click();
        await page.getByRole("button", { name: "Completed", exact: true }).click();
        await page.getByText(/^Reviewed /).first().waitFor();
        await page.reload();
        await page.getByText(/^Reviewed /).first().waitFor();
        await page.getByText("Check history", { exact: true }).click();
        assert(await page.locator(".everyagent-history li").count() > 0);
        sourceUnavailable = true;
        await page.getByRole("button", { name: "Refresh EveryAgent" }).click();
        await page.getByRole("alert").getByText(/couldn’t refresh/).waitFor();
        assert(await page.getByRole("article").count() > 0, "source failure must retain previous briefing");
        sourceUnavailable = false;
        await page.getByRole("button", { name: "Try again" }).click();
        await page.getByRole("alert").waitFor({ state: "hidden" });
      }
      await page.getByRole("button", { name: "Open EveryAgent", exact: true }).click();
      await companion.getByRole("link", { name: "Ask a question", exact: true }).click();
      await companion.waitFor({ state: "hidden" });
      assert.equal(new URL(page.url()).pathname, "/analytics/questions");
      await page.getByRole("button", { name: "Open EveryAgent", exact: true }).click();
      await companion.getByText("With you in Ask a question", { exact: true }).waitFor();
      await companion.getByRole("button", { name: "Close EveryAgent" }).click();
      assert.equal(await page.getByRole("button", { name: "Dismiss EveryAgent introduction" }).count(), 0, "introduction should stay dismissed for this account session");
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log("EveryAgent browser checks passed at 320, 390 and 1440px: introduction, embedded briefing, page context, keyboard focus, source recovery, persisted pause/scope/review, history, no overflow or runtime errors.");
  });
} finally { await rm(directory, { recursive: true, force: true }); }
