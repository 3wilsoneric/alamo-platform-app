import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BASE_URL, withBrowserQa } from "./browser-qa-utils.mjs";
import { createEveryAgentPersistence } from "../server/everyagent-persistence.mjs";
import { createEveryAgentStore } from "../server/everyagent-store.mjs";
import { createEveryAgentWorkflowService } from "../server/everyagent-workflow-service.mjs";
import { createEveryAgentService } from "../server/everyagent-service.mjs";
import { EVERYAGENT_SKILLS, EVERYAGENT_TENANT, EVERYAGENT_USERS } from "../shared/everyagent-catalog.mjs";

const output = path.resolve("generated/browser-everyagent");
await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(os.tmpdir(), "everyagent-browser-"));
const auth = { authenticated: true, mode: "entra-delegated", claims: { tid: EVERYAGENT_TENANT, oid: EVERYAGENT_USERS[0] } };
let time = Date.now();
let fingerprint = "a".repeat(64);
const result = (skill) => ({ connection: "connected", issue: null, sourceCheckedAt: new Date(time).toISOString(), entries: [{
  key: skill, fingerprint, communityIds: skill === "licensing" ? ["337"] : [],
  title: skill === "licensing" ? "New San Pablo inspection report" : "Admissions activity changed",
  summary: skill === "licensing" ? "A new inspection report is ready to review with its original state source." : "12 active referrals · 2 flagged as stale · 1 unassigned · 4 awaiting admission.",
  evidence: [{ id: skill, kind: "module", label: "View source", href: `https://www.alamoplatform.com${skill === "licensing" ? "/analytics/agent?skill=licensing" : "/admissions"}`, observedAt: new Date(time).toISOString() }], relationships: []
}] });
const store = createEveryAgentStore(createEveryAgentPersistence({ localPath: path.join(directory, "state.json"), azure: false }));
const adapters = { licensing: async () => result("licensing"), "admissions-watch": async () => result("admissions-watch") };
const service = createEveryAgentService({ store, adapters, now: () => time });
const workflows = createEveryAgentWorkflowService({ store, adapters, now: () => time });
await service.tick(); time += 16 * 60_000; fingerprint = "b".repeat(64); await service.tick();
try {
  await withBrowserQa(async browser => {
    for (const width of [320, 390, 1440]) {
      // Each viewport starts with the same full scope; workflow controls below
      // deliberately narrow it and must not change the next viewport's setup.
      for (const responsibility of (await service.overview(auth)).responsibilities) {
        const skill = EVERYAGENT_SKILLS.find(item => item.id === responsibility.skillId);
        await service.command(auth, { action: "configure", skillId: skill.id, paused: false,
          communityIds: skill.communities.map(community => community.id), expectedVersion: responsibility.version });
      }
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
      await page.getByRole("link", { name: /Admissions watch/ }).first().waitFor();
      const workspace = page.getByRole("region", { name: "AlamoAgent workspace" });
      await workspace.getByRole("article").first().waitFor();
      const sourceLinks = await workspace.getByRole("link", { name: /View source/ }).evaluateAll(links => links.map(link => link.getAttribute("href")));
      assert(sourceLinks.length > 0 && sourceLinks.every(href => href?.startsWith("/")), "portable Platform evidence remains local navigation inside Platform");
      assert.equal(new URL(page.url()).pathname, "/analytics/agent");
      assert.doesNotMatch(await page.locator("body").innerText(), /EveryAgent|OneAgent/);
      assert.doesNotMatch(await workspace.innerText(), /I’m AlamoAgent|Hello,|Hello there|Here, while you work|Your assistant|Your briefing|Something you want to look into/);
      assert((await workspace.getByRole("article").first().boundingBox()).y < 400, "updates should appear immediately without an introductory hero");
      assert.equal((await workspace.locator(".everyagent-orb").boundingBox()).width, 32);
      assert.equal(await page.getByRole("textbox").count(), 0, "work should appear without a prompt");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, `${width}px layout overflowed by ${overflow}px`);
      await page.screenshot({ path: path.join(output, `everyagent-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: "Open AlamoAgent", exact: true }).click();
      const companion = page.getByRole("dialog", { name: "AlamoAgent", exact: true });
      await companion.waitFor();
      assert.doesNotMatch(await companion.innerText(), /I’m AlamoAgent|With you in|Your assistant|Your latest briefing|Worth your attention/);
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Close AlamoAgent");
      assert(await companion.getByRole("article").count() > 0, "embedded assistant should surface actual work");
      assert.equal(await page.evaluate(() => { const dialog = document.querySelector("dialog"); return dialog.scrollWidth <= dialog.clientWidth + 1; }), true);
      await page.screenshot({ path: path.join(output, `everyagent-companion-${width}.png`), fullPage: true });
      await page.keyboard.press("Escape");
      await companion.waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Open AlamoAgent");
      if (width === 1440) {
        await page.getByRole("button", { name: "Manage skills" }).click();
        await page.getByText("Email notifications are off.", { exact: true }).waitFor();
        const watch = page.getByRole("article", { name: "Watch state licensing reports" });
        await watch.getByRole("button", { name: "Pause", exact: true }).click();
        await watch.getByRole("button", { name: "Resume", exact: true }).waitFor();
        await page.reload();
        await page.getByRole("button", { name: "Manage skills" }).click();
        await watch.getByRole("button", { name: "Resume", exact: true }).waitFor();
        await watch.getByRole("button", { name: "Resume", exact: true }).click();
        await watch.getByRole("button", { name: "Pause", exact: true }).waitFor();
        await watch.getByRole("button", { name: "Configure Licensing" }).click();
        await watch.getByLabel("Santa Clarita", { exact: true }).uncheck();
        await watch.getByRole("button", { name: "Save scope" }).click();
        await watch.getByText("3 communities", { exact: true }).waitFor();
        await page.getByRole("button", { name: /^Needs you/ }).click();
        await page.getByRole("button", { name: "Mark reviewed" }).first().click();
        await page.getByRole("button", { name: "Completed", exact: true }).click();
        await page.getByText(/^Reviewed /).first().waitFor();
        await page.reload();
        await page.getByText(/^Reviewed /).first().waitFor();
        await page.getByText("Check history", { exact: true }).click();
        assert(await page.locator(".everyagent-history li").count() > 0);
        sourceUnavailable = true;
        await page.getByRole("button", { name: "Refresh AlamoAgent" }).click();
        await page.getByRole("alert").getByText(/couldn’t refresh/).waitFor();
        assert(await page.getByRole("article").count() > 0, "source failure must retain previous briefing");
        sourceUnavailable = false;
        await page.getByRole("button", { name: "Try again" }).click();
        await page.getByRole("alert").waitFor({ state: "hidden" });
      }
      await page.getByRole("button", { name: "Open AlamoAgent", exact: true }).click();
      await companion.getByRole("link", { name: "Ask a question", exact: true }).click();
      await companion.waitFor({ state: "hidden" });
      assert.equal(new URL(page.url()).pathname, "/analytics/questions");
      const launcher = page.getByRole("button", { name: "Open AlamoAgent", exact: true });
      assert((await launcher.boundingBox()).width <= 56, "launcher should be a compact icon");
      assert.doesNotMatch(await launcher.innerText(), /AlamoAgent/);
      await page.getByRole("button", { name: "Open AlamoAgent", exact: true }).click();
      await companion.getByRole("article").first().waitFor();
      await companion.getByRole("button", { name: "Close AlamoAgent" }).click();
      assert.equal(await page.getByRole("button", { name: "Dismiss AlamoAgent introduction" }).count(), 0, "the helper must not show an onboarding pop-up");
      const current = await service.overview(auth);
      for (const responsibility of current.responsibilities) await service.command(auth, { action: "configure", skillId: responsibility.skillId,
        paused: responsibility.skillId !== "licensing", communityIds: responsibility.skillId === "licensing" ? ["337"] : [], expectedVersion: responsibility.version });
      await workflows.prepare();
      await page.goto(`${BASE_URL}/analytics/agent`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Cancel Licensing check", exact: true }).click();
      await page.getByText("Canceled", { exact: true }).last().waitFor({ state: "attached" });
      assert((await service.overview(auth)).tasks.some(task => task.status === "canceled"));
      time += 16 * 60_000;
      const [failed] = await workflows.prepare();
      await workflows.fail(failed.id);
      await page.getByRole("button", { name: "Refresh AlamoAgent" }).click();
      await page.getByRole("button", { name: "Retry Licensing check", exact: true, includeHidden: true }).last().waitFor({ state: "attached" });
      if (!(await page.locator(".everyagent-runs").evaluate(element => element.open))) await page.getByText("Work progress", { exact: true }).click();
      await page.getByRole("button", { name: "Retry Licensing check", exact: true }).last().click();
      await page.getByRole("button", { name: "Cancel Licensing check", exact: true }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 1));
      await page.screenshot({ path: path.join(output, `alamoagent-work-progress-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: "Cancel Licensing check", exact: true }).click();
      assert.deepEqual(errors, []);
      await context.close();
    }
    // Preview Andrew's saved presentation identity with synthetic work only.
    // E2E access is local; production grants are separately asserted unchanged.
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const claims = JSON.stringify({ tid: EVERYAGENT_TENANT, oid: "e9f39185-d751-45c0-bcf5-c24d3565bdd9" });
      await page.route("**/src/features/agent/useAgentBranding.ts*", route => route.fulfill({ contentType: "application/javascript",
        body: `import { agentBrandingFor } from '/shared/agent-branding.mjs'; export function useAgentBranding() { return agentBrandingFor(${claims}); }` }));
      await page.route("**/api/platform/everyagent", async route => route.fulfill({ json: { ...await service.overview(auth), workerEnabled: true } }));
      await page.goto(`${BASE_URL}/analytics/agent`, { waitUntil: "domcontentloaded" });
      await page.getByRole("region", { name: "Wilson workspace" }).getByRole("article").first().waitFor();
      assert.doesNotMatch(await page.locator("body").innerText(), /AlamoAgent|EveryAgent|OneAgent/);
      const mark = page.locator(".everyagent-workspace .everyagent-orb img");
      assert.equal(await mark.getAttribute("src"), "/brand/wilson-andrew.png");
      await mark.evaluate(image => image.decode());
      assert.equal(await mark.evaluate(image => image.naturalWidth), 395);
      assert(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 1));
      await page.screenshot({ path: path.join(output, `wilson-preview-${width}.png`), fullPage: false });
      await page.getByRole("button", { name: "Open Wilson", exact: true }).click();
      const companion = page.getByRole("dialog", { name: "Wilson", exact: true });
      await companion.waitFor();
      assert.equal(await companion.locator(".everyagent-orb img").getAttribute("src"), "/brand/wilson-andrew.png");
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Close Wilson");
      assert.doesNotMatch(await companion.innerText(), /AlamoAgent|EveryAgent|OneAgent/);
      await page.screenshot({ path: path.join(output, `wilson-panel-preview-${width}.png`), fullPage: false });
      await context.close();
    }
    console.log("AlamoAgent browser checks passed at 320, 390 and 1440px: updates first, compact icon, no introductory copy or pop-ups, keyboard focus, source recovery, persisted pause/scope/review, workflow progress and cancel/retry, history, no overflow or runtime errors. Saved Wilson branding also passed desktop/mobile previews with the supplied logo.");
  });
} finally { await rm(directory, { recursive: true, force: true }); }
