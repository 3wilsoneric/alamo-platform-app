#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BASE_URL, withBrowserQa } from "./browser-qa-utils.mjs";

const output = path.join(process.cwd(), "generated/browser-licensing-mobile");
const communities = [
  ["337", "079201030", "San Pablo"],
  ["345", "197610805", "Santa Clarita"],
  ["344", "502701372", "Turlock"],
  ["343", "365530119", "JC Wallace House"]
].map(([facilityId, licenseNumber, name], index) => ({
  facilityId, licenseNumber, name, licensedName: `${name} Adult Residential Facility`, licenseStatus: "Licensed",
  reportCount: index < 3 ? 1 : 0, complaintCount: index < 2 ? 1 : 0,
  sourceUrl: `https://www.ccld.dss.ca.gov/carefacilitysearch/FacDetail/${licenseNumber}`
}));
const reports = communities.slice(0, 3).map((community, index) => ({
  id: `${community.licenseNumber}-${String(index + 1).repeat(32)}`,
  facilityId: community.facilityId,
  licenseNumber: community.licenseNumber,
  title: index === 0 ? "Complaint investigation with medication documentation follow-up" : "Annual inspection report",
  reportType: index < 2 ? "Complaint" : "Inspection",
  reportDate: `2026-0${8 - index}-1${index + 2}`,
  controlNumber: index === 0 ? "LONG-CONTROL-NUMBER-2026-001" : null,
  sourceUrl: community.sourceUrl,
  textSha256: String(index + 4).repeat(64),
  retrievedAt: "2026-10-05T16:02:23.460Z",
  analysis: {
    version: "licensing-analysis-v1", outcome: index === 0 ? "Substantiated" : "Not applicable",
    outcomes: index === 0 ? ["Substantiated"] : ["Not applicable"],
    headline: index === 0 ? "Medication documentation required corrective follow-up" : "Routine review completed",
    topics: [], citationCount: 0, correctionsCount: 0, noDeficiencies: index > 0,
    reviewNeeded: false, allegationCount: index === 0 ? 1 : 0
  }
}));
const library = {
  version: "licensing-baseline-v1", runId: "20261005T160021Z-2fb72799", collectedAt: "2026-10-05T16:02:23.460Z",
  monitoring: "platform_scheduled", totalReports: 3, communities, reports
};
const reportById = new Map(reports.map((report, index) => [report.id, {
  ...report,
  text: index === 0
    ? "COMPLAINT INVESTIGATION REPORT\n\nALLEGATION: Medication administration records were not consistently documented.\n\nThe department reviewed records, interviewed staff, and found that documentation required corrective follow-up. The licensee submitted a plan of correction.\n\nThis deliberately long source line verifies that mobile layouts wrap identifiers and narrative text without creating horizontal scrolling: ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789."
    : "FACILITY EVALUATION REPORT\n\nThe department completed a routine inspection and recorded no deficiencies."
}]));
const updates = {
  version: "licensing-updates-v1", status: "complete", lastChecked: "2026-10-05T16:02:23.460Z",
  lastSuccessful: library.collectedAt,
  schedule: { owner: "platform", timezone: "America/Los_Angeles", cadence: "weekly", weekday: "Monday", weekdays: ["Monday", "Wednesday"], hour: 9 },
  alerts: [{ id: "20261005T160021Z-2fb72799-profile", community: "Santa Clarita", title: "Updated facility profile", at: "2026-10-05T16:02:23.460Z", reportId: null, reportDate: null }]
};

async function installApiFixtures(page) {
  await page.route("**/api/platform/licensing**", async (route) => {
    const url = new URL(route.request().url());
    let payload = library;
    if (url.pathname.endsWith("/updates")) payload = updates;
    else if (url.pathname.endsWith("/report")) payload = reportById.get(url.searchParams.get("id")) ?? null;
    await route.fulfill({ status: payload ? 200 : 404, contentType: "application/json", body: JSON.stringify(payload ?? { error: "not_found" }) });
  });
}

async function measure(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const undersized = [...document.querySelectorAll("button, a, input")].filter(visible).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.height < 42 && !element.closest("article") && !element.closest("nav");
    }).map((element) => (element.getAttribute("aria-label") || element.textContent || element.tagName).trim().slice(0, 80));
    return {
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      searchWidth: Math.round(document.querySelector('[data-licensing-search="true"]')?.getBoundingClientRect().width ?? 0),
      workspaceWidth: Math.round(document.querySelector('[data-licensing-workspace="true"]')?.getBoundingClientRect().width ?? 0),
      undersized
    };
  });
}

await mkdir(output, { recursive: true });
await withBrowserQa(async (browser) => {
  const results = [];
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await installApiFixtures(page);
    await page.goto(`${BASE_URL}/analytics/licensing`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-licensing-workspace="true"]').waitFor({ state: "visible" });
    const list = await measure(page);
    assert.ok(list.overflow <= 1, `${viewport.width}px list overflowed by ${list.overflow}px`);
    assert.ok(list.searchWidth >= viewport.width - 34, `${viewport.width}px search was cramped`);
    assert.ok(list.workspaceWidth >= viewport.width - 34, `${viewport.width}px workspace was cramped`);
    if (viewport.width === 390) await page.screenshot({ path: path.join(output, "licensing-list-390.png"), fullPage: false });

    await page.getByRole("button", { name: /^Updates/ }).click();
    const panel = page.locator('[data-licensing-updates-panel="true"]');
    await panel.waitFor({ state: "visible" });
    const panelBox = await panel.boundingBox();
    assert.ok(panelBox && panelBox.x >= 0 && panelBox.x + panelBox.width <= viewport.width + 1, `${viewport.width}px updates sheet was clipped`);
    assert.ok(panelBox && panelBox.y + panelBox.height <= viewport.height + 1, `${viewport.width}px updates sheet exceeded the viewport`);
    if (viewport.width === 390) await page.screenshot({ path: path.join(output, "licensing-updates-390.png"), fullPage: false });
    await page.getByRole("button", { name: "Close state updates" }).click();

    await page.getByRole("button", { name: /San Pablo/i }).click();
    await page.locator("article[data-licensing-reader]").waitFor({ state: "visible" });
    const reader = await measure(page);
    assert.ok(reader.overflow <= 1, `${viewport.width}px reader overflowed by ${reader.overflow}px`);
    await page.getByText("View original source text").click();
    const expanded = await measure(page);
    assert.ok(expanded.overflow <= 1, `${viewport.width}px expanded source overflowed by ${expanded.overflow}px`);
    assert.equal(expanded.undersized.length, 0, `${viewport.width}px exposed undersized controls: ${expanded.undersized.join(", ")}`);
    if (viewport.width === 390) await page.screenshot({ path: path.join(output, "licensing-reader-390.png"), fullPage: false });
    results.push({ viewport, list, reader, expanded, panel: panelBox });
    await context.close();
  }
  await writeFile(path.join(output, "latest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), passed: true, results }, null, 2));
  console.log("Licensing mobile QA passed at 320px, 390px, and 430px with list, updates sheet, reader, and expanded source coverage.");
});
