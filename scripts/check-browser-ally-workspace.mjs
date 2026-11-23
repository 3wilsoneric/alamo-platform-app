#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { BASE_URL, withBrowserQa } from "./browser-qa-utils.mjs";

Object.assign(process.env, {
  VITE_E2E_AUTH_BYPASS: "true",
  VITE_ALLY_REPORTS_ENABLED: "true",
  VITE_ALAMOAGENT_API_ORIGIN: "https://agent.example.test",
  VITE_ALAMOAGENT_SCOPE: "api://77777777-7777-4777-8777-777777777777/access_as_user",
});
const output = path.resolve("generated/platform-page-screenshots-2026-11-22");
await mkdir(output, { recursive: true });

await withBrowserQa(async browser => {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const id = "11111111-1111-4111-8111-111111111111";
    let created = false;
    let question = "";
    let reportCreated = false;
    const reportId = "33333333-3333-4333-8333-333333333333";
    const ownerId = "44444444-4444-4444-8444-444444444444";
    const reportSummary = { id: reportId, ownerId, title: "Community admissions and discharges", status: "ready", revision: 1, version: 1, updatedAt: "2026-11-22T15:00:00Z", completedSources: 1, totalSources: 1 };
    const report = { ...reportSummary, selectedVersion: 1, canEdit: true, readers: [], scope: { communityIds: [], from: "2026-01-01", through: "2026-11-22" }, objective: "Compare admissions and discharges across communities", error: null,
      sourceProgress: [{ id: "flow", title: "Resident flow", status: "verified" }], versions: [{ version: 1, createdAt: "2026-11-22T15:00:00Z", status: "ready" }],
      artifact: { title: "Community flow", generatedAt: "2026-11-22T15:00:00Z", coverage: "Synthetic browser fixture", findings: [{ text: "Admissions exceeded discharges in four of five communities in this synthetic fixture.", sourceIds: ["flow"] }], gaps: [],
        sections: [{ id: "flow", title: "Admissions and discharges", observedAt: "2026-11-22T15:00:00Z", status: "verified", period: "2026", grain: "community", note: "Synthetic interface fixture", answer: null,
          dataset: { title: "Community flow", shape: "categories", columns: [{ key: "community", label: "Community", type: "string" }, { key: "admissions", label: "Admissions", type: "number" }, { key: "discharges", label: "Discharges", type: "number" }],
            rows: [{ community: "San Pablo", admissions: 18, discharges: 11 }, { community: "Santa Clarita", admissions: 15, discharges: 8 }, { community: "JC Wallace House", admissions: 12, discharges: 12 }, { community: "Turlock", admissions: 10, discharges: 6 }, { community: "Victoria’s House", admissions: 6, discharges: 3 }] } }] },
      view: { blocks: [{ id: "flow-chart", componentId: "comparison", datasetId: "flow", sourceIds: ["flow"] }] } };
    const conversation = () => ({
        id, version: 2, createdAt: "2026-11-22T15:00:00Z", workId: null,
        scope: [{ skillId: "admissions-watch", communityIds: [] }],
        turns: [{ id: "22222222-2222-4222-8222-222222222222", text: question, status: "complete", createdAt: "2026-11-22T15:00:00Z",
          answer: { paragraphs: [
            { kind: "answer", text: "Seven accepted clients in this synthetic fixture have no move-in date. Santa Clarita accounts for five of the seven.", sourceIds: ["pipeline"] },
            { kind: "table", text: "Community | Accepted without date\n--- | ---\nSanta Clarita | 5\nSan Pablo | 1\nJC Wallace House | 1", sourceIds: ["pipeline"] },
            { kind: "context", text: "The useful next step is to confirm the move-in date for each accepted client and review open requirements before arrival.", sourceIds: ["pipeline"] },
          ] },
          evidence: [{ id: "pipeline", skillId: "admissions-watch", title: "Pipeline referral records", text: "Synthetic interface fixture", observedAt: "2026-11-22T15:00:00Z", links: [{ href: "https://www.alamoplatform.com/admissions", title: "Admissions" }] }],
        }],
    });
    await page.route(url => url.origin === BASE_URL && url.pathname.startsWith("/api/"), route => route.fulfill({ json: {} }));
    await page.route("https://agent.example.test/api/agent/v1/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.endsWith("/reports")) {
        if (request.method() === "POST") { reportCreated = true; return route.fulfill({ json: reportSummary }); }
        return route.fulfill({ json: url.searchParams.has("id") ? report : { reports: reportCreated ? [reportSummary] : [] } });
      }
      if (request.method() === "POST") {
        const command = request.postDataJSON();
        if (command.action === "create") { created = true; return route.fulfill({ json: { ...conversation(), turns: [], version: 1 } }); }
        if (command.action === "send") { question = command.text; return route.fulfill({ json: conversation() }); }
      }
      if (url.searchParams.has("id")) return route.fulfill({ json: conversation() });
      return route.fulfill({ json: { modelAvailable: true, conversations: created ? [{ id, title: question || "Admissions review", createdAt: "2026-11-22T15:00:00Z", locked: false }] : [] } });
    });
    if (width === 1440) {
      for (const [legacy, destination] of [
        ["/analytics/residents?period=2026-10#clients", "/analytics?period=2026-10&report=residents#clients"],
        ["/analytics/community?community=337&report=overview", "/analytics?community=337&report=community"],
        ["/analytics/admissions?community=337", "/admissions?community=337"],
      ]) {
        await page.goto(`${BASE_URL}${legacy}`, { waitUntil: "domcontentloaded" });
        await page.waitForURL(`${BASE_URL}${destination}`);
        assert.equal(page.url(), `${BASE_URL}${destination}`, "saved links retain their scope and destination");
        assert.equal(await page.locator('[data-california-community-profile]').count(), 0, "report scope must not open the old community popup");
      }
    }
    if (width === 1440) {
      await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
      await page.locator('[data-california-community-marker="337"]').click();
      await page.waitForURL(`${BASE_URL}/analytics?report=community&community=337`);
      assert.equal(await page.locator('[data-california-community-profile]').count(), 0, "map opens the full report without a duplicate popup");
    }
    await page.goto(`${BASE_URL}/analytics`, { waitUntil: "domcontentloaded" });
    await page.locator(".platform-ally-header-button:visible").first().click();
    const panel = page.getByRole("dialog", { name: "Ally" });
    if (width > 700) await panel.getByRole("button", { name: "Expand Ally to full screen" }).click();
    const initialReport = panel.locator(".executive-ally-report-surface");
    await initialReport.waitFor();
    assert.equal(await panel.locator(".executive-ally-chat").count(), 0, "Platform opens its data questions without a parallel chat");
    assert.equal(await panel.locator("textarea:visible").count(), 1, "the initial report has one composer");
    await initialReport.getByRole("textbox", { name: "Ask Ally" }).fill("Compare admissions and discharges across communities.");
    await initialReport.getByRole("button", { name: "Send question" }).click();
    await initialReport.getByRole("article", { name: "Report findings" }).waitFor();
    assert.equal(await initialReport.locator(".ally-report-comparison li").count(), 5);
    await panel.screenshot({ path: path.join(output, `ally-workspace-default-report-${width}.png`) });
    await panel.getByLabel("Saved conversations").click();
    await panel.getByRole("button", { name: "Guidance chats" }).click();
    if (width <= 390) assert.equal(await panel.getByRole("button", { name: "Answer" }).count(), 0, "the empty phone view starts with one composer");
    assert.equal(await panel.getByRole("textbox", { name: "Ask Ally" }).count(), 1, "the empty workspace has one input");
    await panel.getByRole("textbox", { name: "Ask Ally" }).fill("Which accepted clients are still waiting for a move-in date?");
    await panel.screenshot({ path: path.join(output, `ally-workspace-composer-${width}.png`) });
    await panel.getByRole("button", { name: "Send question" }).click();
    const canvas = panel.getByRole("article", { name: "Expanded Ally answer" });
    await canvas.waitFor({ timeout: 10_000 }).catch(async error => {
      console.error("Workspace fixture failed:", width, await panel.innerText(), errors);
      await panel.screenshot({ path: path.join(output, `ally-workspace-failed-${width}.png`) });
      throw error;
    });
    assert.match(await canvas.innerText(), /Santa Clarita/);
    assert.equal(await canvas.getByRole("table").count(), 1);
    await canvas.getByText("Sources used").click();
    assert.equal(await canvas.getByRole("link", { name: "Pipeline referral records" }).count(), 1);
    await canvas.getByText("Sources used").click();
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal overflow");
    await page.waitForTimeout(330);
    await panel.screenshot({ path: path.join(output, `ally-workspace-answer-${width}.png`) });
    if (width > 700) {
      await panel.getByRole("button", { name: "Restore Ally panel" }).click();
      await panel.getByRole("button", { name: "Expand Ally to full screen" }).click();
    }
    assert.equal(await panel.getByRole("article", { name: "Expanded Ally answer" }).count(), 1, "the answer survives panel resizing");
    await panel.getByRole("button", { name: "New chat", exact: true }).click();
    const reportSurface = panel.locator(".executive-ally-report-surface");
    await reportSurface.getByRole("textbox", { name: "Ask Ally" }).fill("Compare admissions and discharges across communities.");
    await reportSurface.getByRole("button", { name: "Send question" }).click();
    await reportSurface.getByRole("article", { name: "Report findings" }).waitFor();
    assert.equal(await panel.locator(".executive-ally-chat").count(), 0, "data questions use one continuous conversation surface");
    assert.equal(await reportSurface.locator(".ally-report-comparison li").count(), 5);
    assert.equal(await reportSurface.locator(".ally-thread-question").count(), 1, "the asked data question is visible above its answer");
    assert.equal(await panel.locator("textarea:visible").count(), 1, "the report has one visible place to ask a follow-up");
    assert.equal(await panel.evaluate(element => element.scrollLeft), 0, "the phone panel does not scroll sideways");
    assert.deepEqual(errors, []);
    await panel.screenshot({ path: path.join(output, `ally-workspace-report-${width}.png`) });
    await context.close();
  }
});

console.log("Ally data conversations, retained guidance chats, sources, one composer, route scope and 320/390/1440px layouts passed.");
