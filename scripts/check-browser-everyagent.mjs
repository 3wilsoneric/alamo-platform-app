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
const auth = { authenticated: true, mode: "entra-delegated", claims: { tid: EVERYAGENT_TENANT, oid: EVERYAGENT_USERS[2] } };
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
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/platform/everyagent", async route => {
        const request = route.request();
        const view = request.method() === "POST" ? await service.command(auth, request.postDataJSON()) : await service.overview(auth);
        await route.fulfill({ json: { ...view, workerEnabled: true } });
      });
      await page.goto(`${BASE_URL}/everyagent`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "EveryAgent", exact: true }).waitFor();
      await page.getByRole("heading", { name: "Watch admissions activity" }).waitFor();
      assert.equal(new URL(page.url()).pathname, "/analytics/agent");
      assert.equal(await page.getByText("Email delivery is off.", { exact: false }).count(), 1);
      assert.equal(await page.getByRole("textbox").count(), 0, "work should appear without a prompt");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, `${width}px layout overflowed by ${overflow}px`);
      await page.screenshot({ path: path.join(output, `everyagent-${width}.png`), fullPage: true });
      if (width === 1440) {
        const watch = page.getByRole("article", { name: "Watch state licensing reports" });
        await watch.getByRole("button", { name: "Pause", exact: true }).click();
        await watch.getByRole("button", { name: "Resume", exact: true }).waitFor();
        await page.reload();
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
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log("EveryAgent browser checks passed at 320, 390 and 1440px: automatic work, two applications, persisted pause/scope/review, history, no overflow or runtime errors.");
  });
} finally { await rm(directory, { recursive: true, force: true }); }
