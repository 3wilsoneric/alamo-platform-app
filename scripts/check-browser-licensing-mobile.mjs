#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BASE_URL, withBrowserQa } from "./browser-qa-utils.mjs";
import { queryLicensingLibrary } from "../server/licensing-library.mjs";
import { analyzeLicensingReport } from "../shared/licensing-analysis.mjs";

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
    ? '<meta name="robots" content="noindex">\nCOMPLAINT INVESTIGATION REPORT\n1\n2\n3\n4\nALLEGATION(S):\nMedication administration records were not consistently documented.\nINVESTIGATION FINDINGS:\nSubstantiated\nThe department reviewed records and interviewed staff. The allegation was substantiated because medication documentation required corrective follow-up.\nThis deliberately long source line verifies wrapping: ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.\nPage: 1 of 2\nDEFICIENCY INFORMATION FOR THIS PAGE:\nType B\nSection Cited\n80075(b)\nDeficient Practice Statement\nBased on record review, medication records were incomplete.\nPOC Due Date: 08/26/2026\nPlan of Correction\nAdministrator will train staff and submit the completed records.\nFailure to correct\nPage: 2 of 2\nThis deliberately long source line verifies wrapping: ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.'
    : "FACILITY EVALUATION REPORT\nNARRATIVE\nThe department completed a routine inspection and recorded no deficiencies.\nPage: 1 of 1"
}]));
for (const report of reports) report.analysis = analyzeLicensingReport(reportById.get(report.id)).summary;
const updates = {
  version: "licensing-updates-v1", status: "complete", lastChecked: "2026-10-05T16:02:23.460Z",
  lastSuccessful: library.collectedAt,
  schedule: { owner: "platform", timezone: "America/Los_Angeles", cadence: "weekly", weekday: "Monday", weekdays: ["Monday", "Wednesday"], hour: 9 },
  alerts: [{ id: "20261005T160021Z-2fb72799-profile", community: "Santa Clarita", title: "Updated facility profile", at: "2026-10-05T16:02:23.460Z", reportId: null, reportDate: null }]
};

async function installApiFixtures(page) {
  await page.route("**/api/platform/licensing**", async (route) => {
    const url = new URL(route.request().url());
    let payload = queryLicensingLibrary({ ...library, reports: [...reportById.values()] }, url);
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
    await page.getByText("Latest check complete", { exact: true }).waitFor();
    await page.getByRole("region", { name: "Licensing answer" }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/analytics/agent", "old Licensing route must redirect to the Agent workspace");
    assert.equal(await page.getByRole("heading", { name: "EveryAgent", exact: true }).count(), 1);
    assert.match(await page.getByRole("region", { name: "EveryAgent work", exact: true }).innerText(), /Active skill\s+Licensing/);
    const list = await measure(page);
    assert.ok(list.overflow <= 1, `${viewport.width}px list overflowed by ${list.overflow}px`);
    assert.equal(list.searchWidth, 0, "search must stay secondary to the agent output");
    assert.equal(await page.locator("article[data-licensing-reader]").count(), 0, "agent must not automatically open a report");
    assert.equal(await page.getByRole("button", { name: "Explore reports", exact: true }).getAttribute("aria-expanded"), "false");
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

    await page.getByRole("region", { name: "Licensing answer" }).waitFor();
    assert.match(await page.getByRole("region", { name: "Licensing answer" }).innerText(), /3 latest state reports/);
    if (viewport.width === 390) await page.screenshot({ path: path.join(output, "licensing-answer-390.png"), fullPage: false });
    await page.getByRole("button", { name: /San Pablo.*Complaint/ }).click();
    await page.locator("article[data-licensing-reader]").waitFor({ state: "visible" });
    const reader = await measure(page);
    assert.ok(reader.overflow <= 1, `${viewport.width}px reader overflowed by ${reader.overflow}px`);
    const readerTitleBox = await page.locator("article[data-licensing-reader] h2").boundingBox();
    assert.ok(readerTitleBox && readerTitleBox.y >= 0 && readerTitleBox.y < viewport.height, `${viewport.width}px reader did not return to its title`);
    assert.equal(await page.getByRole("link", { name: "Open original on state site" }).getAttribute("href"), communities[0].sourceUrl, `${viewport.width}px reader lost the stable state source action`);
    assert.match(await page.getByRole("region", { name: "Report summary" }).innerText(), /Substantiated complaint finding/);
    assert.match(await page.getByRole("region", { name: "Reported concerns" }).innerText(), /Medication administration records/);
    assert.match(await page.getByRole("region", { name: "State findings" }).innerText(), /documentation required corrective follow-up/);
    const corrections = await page.getByRole("region", { name: "Deficiencies and correction plans" }).innerText();
    assert.match(corrections, /Administrator will train staff/);
    assert.match(corrections, /26 August 2026/);
    assert.doesNotMatch(corrections, /overdue/i);
    const sourceText = page.locator('[data-licensing-source-text="true"]');
    assert.equal(await sourceText.count(), 1, `${viewport.width}px reader did not embed the archived report`);
    assert.equal(await sourceText.locator(".licensing-report-prose p").count(), 2, "report narrative must render as separate paragraphs");
    assert.equal(await sourceText.locator("pre").count(), 0, "report text must not be a preformatted dump");
    assert.doesNotMatch(await sourceText.innerText(), /COMPLAINT INVESTIGATION REPORT|Section Cited|noindex/);
    assert.equal(await page.getByRole("button", { name: "Download original text", exact: true }).count(), 1, `${viewport.width}px reader lost the download action`);
    assert.equal(reader.undersized.length, 0, `${viewport.width}px exposed undersized reader controls: ${reader.undersized.join(", ")}`);
    if (viewport.width === 390) {
      await page.screenshot({ path: path.join(output, "licensing-reader-390.png"), fullPage: false });
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download original text", exact: true }).click();
      const download = await downloadPromise;
      assert.match(download.suggestedFilename(), /^CCLD-079201030-2026-08-12-\d{8}\.txt$/, "original text download used an unexpected filename");
      assert.equal(await readFile(await download.path(), "utf8"), reportById.get(reports[0].id).text, "download must preserve the original bytes including form gutters");
    }
    await page.getByRole("button", { name: "Source · page 1" }).first().click();
    assert.equal(await page.locator('[data-source-page="1"]').evaluate(element => element === document.activeElement), true, "source reference must focus its narrative page");
    assert.match(await sourceText.innerText(), /documentation required corrective follow-up/, `${viewport.width}px reader omitted the report body`);
    assert.match(await sourceText.innerText(), /ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/, `${viewport.width}px reader truncated long source text`);
    assert.ok((await measure(page)).overflow <= 1, "formatted report text must wrap");
    if (viewport.width === 390) await page.screenshot({ path: path.join(output, "licensing-text-390.png"), fullPage: false });
    await page.getByRole("button", { name: "Back to reports" }).click();
    await page.getByRole("region", { name: "Licensing answer" }).waitFor();
    assert.match(await page.getByRole("region", { name: "Licensing answer" }).innerText(), /3 latest state reports/);
    results.push({ viewport, list, reader, panel: panelBox });
    await context.close();
  }
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktop = await desktopContext.newPage();
  await installApiFixtures(desktop);
  await desktop.goto(`${BASE_URL}/analytics/licensing`, { waitUntil: "domcontentloaded" });
  await desktop.locator('[data-licensing-workspace="true"]').waitFor({ state: "visible" });
  await desktop.getByText("Latest check complete", { exact: true }).waitFor();
  await desktop.getByRole("region", { name: "Licensing answer" }).waitFor();
  const desktopLayout = await desktop.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    agentColor: getComputedStyle(document.querySelector('.agent-work-card')).backgroundColor,
    licensingCurrent: document.querySelector('[data-analytics-section-target="agent"]')?.getAttribute('aria-current')
  }));
  assert.ok(desktopLayout.overflow <= 1);
  assert.equal(desktopLayout.agentColor, "rgb(8, 125, 100)", "agent entry should be green");
  assert.equal(desktopLayout.licensingCurrent, "page");
  await desktop.screenshot({ path: path.join(output, "licensing-agent-1440.png"), fullPage: false });
  await desktop.getByRole("button", { name: "Explore reports", exact: true }).click();
  await desktop.getByRole("button", { name: "Cited deficiencies", exact: true }).click();
  await desktop.getByRole("region", { name: "Licensing answer" }).waitFor();
  assert.equal(await desktop.getByRole("list", { name: "Licensing reports" }).locator("li").count(), 1, "citation question must filter by evidence");
  await desktop.getByRole("button", { name: /San Pablo.*Complaint/ }).click();
  await desktop.getByRole("region", { name: "Report summary" }).waitFor();
  await desktop.getByRole("button", { name: "Read report text", exact: true }).click();
  await desktop.screenshot({ path: path.join(output, "licensing-text-1440.png"), fullPage: false });
  await desktop.getByRole("button", { name: "Back to reports" }).click();
  await desktop.getByRole("button", { name: "Explore reports", exact: true }).click();
  await desktop.getByRole("combobox", { name: "Licensing community" }).selectOption("344");
  await desktop.getByRole("button", { name: "Cited deficiencies", exact: true }).click();
  await desktop.getByRole("region", { name: "Licensing answer" }).waitFor();
  assert.match(await desktop.getByRole("region", { name: "Licensing answer" }).innerText(), /couldn’t find a matching report/);
  assert.equal(await desktop.getByRole("list", { name: "Licensing reports" }).locator("li").count(), 0);
  await desktop.getByRole("button", { name: "Explore reports", exact: true }).click();
  await desktop.getByRole("combobox", { name: "Licensing community" }).selectOption("");
  await desktop.getByRole("textbox", { name: "Ask about licensing reports" }).fill("Santa Clarita");
  await desktop.getByRole("button", { name: "Find licensing reports" }).click();
  await desktop.getByRole("region", { name: "Licensing answer" }).waitFor();
  assert.equal(await desktop.getByRole("list", { name: "Licensing reports" }).locator("li").count(), 1);
  await desktop.getByRole("button", { name: /Santa Clarita.*Complaint/ }).click();
  await desktop.getByRole("region", { name: "Report summary" }).waitFor();
  assert.match(await desktop.locator('[data-licensing-source-text="true"]').innerText(), /routine inspection and recorded no deficiencies/);
  assert.doesNotMatch(await desktop.locator('[data-licensing-source-text="true"]').innerText(), /medication documentation/, "previous report text remained in the reader");
  const legacyReportUrl = desktop.url().replace("/analytics/agent", "/analytics/licensing");
  await desktop.goto(legacyReportUrl);
  await desktop.waitForURL(url => url.pathname === "/analytics/agent");
  assert.equal(new URL(desktop.url()).pathname, "/analytics/agent");
  await desktop.reload();
  await desktop.getByRole("region", { name: "Report summary" }).waitFor();
  assert.match(await desktop.locator('[data-licensing-source-text="true"]').innerText(), /routine inspection/, "report deep link must survive reload");
  results.push({ viewport: { width: 1440, height: 900 }, desktop: desktopLayout });
  await desktop.route("**/api/platform/licensing/updates", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...updates, status: "failed" }) }));
  await desktop.goto(`${BASE_URL}/analytics/licensing`);
  await desktop.getByText("Latest check needs attention", { exact: true }).waitFor();
  assert.match(await desktop.getByRole("region", { name: "EveryAgent work", exact: true }).innerText(), /last complete report collection/);
  await desktop.getByRole("region", { name: "Licensing answer" }).waitFor();
  await desktopContext.close();
  await writeFile(path.join(output, "latest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), passed: true, results }, null, 2));
  console.log("Licensing QA passed at 320px, 390px, 430px, and 1440px with automatic agent status, evidence-filtered answer modules, drilldowns, readable text, and original-record actions.");
});
