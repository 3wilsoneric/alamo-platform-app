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
    const readerTitleBox = await page.locator("article[data-licensing-reader] h2").boundingBox();
    assert.ok(readerTitleBox && readerTitleBox.y >= 0 && readerTitleBox.y < viewport.height, `${viewport.width}px reader did not return to its title`);
    assert.equal(await page.getByRole("link", { name: "Open state record" }).count(), 1, `${viewport.width}px reader lost the state record action`);
    assert.equal(await page.getByRole("button", { name: "Open original text" }).count(), 1, `${viewport.width}px reader lost the original text action`);
    assert.equal(await page.getByRole("button", { name: "Download original text" }).count(), 1, `${viewport.width}px reader lost the download action`);
    assert.equal(reader.undersized.length, 0, `${viewport.width}px exposed undersized reader controls: ${reader.undersized.join(", ")}`);
    if (viewport.width === 390) {
      await page.screenshot({ path: path.join(output, "licensing-reader-390.png"), fullPage: false });
      const popupPromise = page.waitForEvent("popup");
      await page.getByRole("button", { name: "Open original text" }).click();
      const popup = await popupPromise;
      await popup.waitForLoadState();
      assert.match(await popup.locator("body").innerText(), /COMPLAINT INVESTIGATION REPORT/, "original text action did not open the archived report");
      await popup.close();
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download original text" }).click();
      const download = await downloadPromise;
      assert.match(download.suggestedFilename(), /^CCLD-079201030-2026-08-12-\d{8}\.txt$/, "original text download used an unexpected filename");
    }
    results.push({ viewport, list, reader, panel: panelBox });
    await context.close();
  }
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktop = await desktopContext.newPage();
  await installApiFixtures(desktop);
  await desktop.goto(`${BASE_URL}/analytics/licensing`, { waitUntil: "domcontentloaded" });
  await desktop.locator('[data-licensing-workspace="true"]').waitFor({ state: "visible" });
  const desktopLayout = await desktop.evaluate(() => {
    const aside = document.querySelector('[data-licensing-workspace="true"] aside');
    const selectedReport = aside?.querySelector('[aria-pressed="true"]');
    const reader = document.querySelector('[data-licensing-workspace="true"] [aria-label="Report reader"]');
    const page = document.querySelector('[data-licensing-page="true"]');
    const analyticsLink = document.querySelector('[data-platform-page-target="analytics"]');
    const licensingLink = document.querySelector('[data-analytics-section-target="licensing"]');
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      asideWidth: Math.round(aside?.getBoundingClientRect().width ?? 0),
      readerWidth: Math.round(reader?.getBoundingClientRect().width ?? 0),
      pageBackground: page ? getComputedStyle(page).backgroundColor : null,
      asideBackground: aside ? getComputedStyle(aside).backgroundColor : null,
      selectedReportBackground: selectedReport ? getComputedStyle(selectedReport).backgroundColor : null,
      readerBackground: reader ? getComputedStyle(reader).backgroundColor : null,
      analyticsCurrent: analyticsLink?.getAttribute("aria-current"),
      licensingCurrent: licensingLink?.getAttribute("aria-current")
    };
  });
  assert.ok(desktopLayout.overflow <= 1, `desktop licensing overflowed by ${desktopLayout.overflow}px`);
  assert.ok(desktopLayout.asideWidth >= 240, "desktop report rail was too narrow to scan");
  assert.ok(desktopLayout.readerWidth > desktopLayout.asideWidth, "desktop report reader did not retain the primary width");
  assert.equal(desktopLayout.pageBackground, "rgb(255, 255, 255)", "licensing canvas did not retain the requested white foundation");
  assert.notEqual(desktopLayout.selectedReportBackground, desktopLayout.readerBackground, "selected report did not separate from the reader");
  assert.equal(desktopLayout.analyticsCurrent, "page", "primary Analytics navigation was not active");
  assert.equal(desktopLayout.licensingCurrent, "page", "Licensing navigation was not active");
  await desktop.screenshot({ path: path.join(output, "licensing-desktop-1440.png"), fullPage: false });
  results.push({ viewport: { width: 1440, height: 900 }, desktop: desktopLayout });
  await desktopContext.close();
  await writeFile(path.join(output, "latest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), passed: true, results }, null, 2));
  console.log("Licensing QA passed at 320px, 390px, 430px, and 1440px with navigation, list, updates sheet, summary reader, and original-record actions.");
});
