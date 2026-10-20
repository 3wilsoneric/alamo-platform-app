#!/usr/bin/env node
import assert from "node:assert/strict";
import { BASE_URL, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";

const { screenshotDir } = await prepareArtifactDirs("browser-medroom-dashboard");
const facilities = ["337", "344", "345", "343", "342"];
const medicationCompliance = ["2026-08", "2026-09", "2026-10"].flatMap((month, monthIndex) =>
  facilities.map((facility_id, facilityIndex) => ({
    facility_id,
    facility_name: ["San Pablo", "Turlock", "Santa Clarita", "JC Wallace House", "Victoria's House"][facilityIndex],
    month_bucket: month,
    total_scheduled: 1200 + facilityIndex * 100,
    given: 1140 + facilityIndex * 94 - monthIndex * 2,
    not_given: 60 + facilityIndex * 6 + monthIndex * 2,
    compliance_pct: 95
  }))
);
const medication = { census: [], medicationCompliance, refusalByMedication: [], documentationGaps: [] };
const dashboard = {
  generated_at: "2026-10-20T12:00:00.000Z",
  reporting_month: "2026-10",
  portfolio: { communityCount: 5, residentCount: 550, currentIncidents: 243, averageAge: 45, averageLengthOfStay: 280 },
  operational: { asOf: "2026-10-20", latestCensusWeek: null, currentWeeklyCensus: null, priorWeeklyCensus: null,
    censusChange7d: null, censusCadence: null, currentCensusPeriod: null, priorCensusPeriod: null,
    currentCensus: null, priorCensus: null, censusChange: null },
  incidentTrend: ["2026-08", "2026-09", "2026-10"].map((month_bucket, index) => ({ month_bucket, incidentCount: 210 + index * 16 })),
  communities: facilities.map((facility_id, index) => ({ facility_id, community_name: medicationCompliance[index].facility_name,
    community_code: "", city: "", state: "CA", total_residents: 100, currentIncidents: 40 + index,
    currentWeeklyCensus: null, priorWeeklyCensus: null, censusChange7d: null, latestCensusWeek: null,
    censusCadence: null, currentCensusPeriod: null, priorCensusPeriod: null, currentCensus: null,
    priorCensus: null, censusChange: null, averageAge: 45, averageLengthOfStay: 280, residentSharePct: 20 })),
  reporting: { latestMonth: "2026-10", averageCompliance: 95, documentationGapCount: 0, refusalSignalCount: 0 },
  watch: { largestCommunityName: "San Pablo", largestCommunityResidents: 152 }
};
const medroom = {
  as_of_date: "2026-10-20", medication_month: "2026-10", daily_available: true,
  latest_administration_date: "2026-10-19", source_coverage: "450 community-day rows across 90 completed days; 450 published",
  windows: Object.fromEntries([7, 30, 60, 90].map(days => [days, { from: "2026-10-01", through: "2026-10-19", scheduled_count: 900, given_count: 855, not_given_count: 35, pending_count: 10, missed_count: 2, late_given_count: 3, refused_count: 4, held_count: 5, other_not_given_count: 8, prn_given_count: 7, completion_pct: 95 }])),
  current_month: { scheduled_count: 900, given_count: 855, not_given_count: 35, pending_count: 10, missed_count: 2, late_given_count: 3, refused_count: 4, held_count: 5, other_not_given_count: 8, prn_given_count: 7 },
  community_month: [], prn_followup: { administrations: 7, documented: 6 }, possible_duplicate_orders: 2,
  watch: [{ code: "pending_outcome", count: 10, label: "Unresolved administration outcomes" }],
  definitions: { late: "Given more than 60 minutes after scheduled time" }
};

await withBrowserQa(async browser => {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "phone", width: 390, height: 844 },
    { name: "compact-phone", width: 320, height: 680 }
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.route("**/api/analytics-summary", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(medication) }));
    await page.route("**/api/home-dashboard", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dashboard) }));
    await page.route("**/api/platform/medroom", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(medroom) }));
    await page.goto(`${BASE_URL}/analytics/medroom`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Med-room dashboard" }).waitFor();
    await page.getByText("October 2026", { exact: true }).first().waitFor();
    assert.equal(await page.getByRole("heading", { level: 2 }).count(), 6, "all six sections must render");
    assert.equal(await page.locator(".medroom-dashboard__community").count(), 5, "all five communities must render");
    assert.match(await page.locator(".medroom-dashboard__metrics").innerText(), /243/);
    assert.match(await page.locator(".medroom-dashboard__breakdown").innerText(), /Refused\s+4/);
    assert.match(await page.locator(".medroom-dashboard__breakdown").innerText(), /Possible duplicate orders\s+2/);
    assert.match(await page.locator(".medroom-dashboard__risk-grid").innerText(), /Predicted issues\s+Not enabled/);
    await page.getByRole("button", { name: "60 days" }).click();
    assert.match(await page.locator(".medroom-dashboard__rolling").innerText(), /60-day med pass: 95\.0%/);
    await page.getByRole("button", { name: "Quarterly" }).click();
    assert.match(await page.locator(".medroom-dashboard__trend-table").innerText(), /2026 Q3/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${viewport.name} overflows by ${overflow}px`);
    if (viewport.name === "desktop" || viewport.name === "phone") {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${screenshotDir}/${viewport.name}.png` });
      await page.screenshot({ path: `${screenshotDir}/${viewport.name}-full.png`, fullPage: true });
    }
    await context.close();
  }
  const unavailableContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const unavailablePage = await unavailableContext.newPage();
  await unavailablePage.route("**/api/analytics-summary", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "source_unavailable" }) }));
  await unavailablePage.route("**/api/home-dashboard", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "source_unavailable" }) }));
  await unavailablePage.route("**/api/platform/medroom", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "source_unavailable" }) }));
  await unavailablePage.goto(`${BASE_URL}/analytics/medroom`, { waitUntil: "domcontentloaded" });
  await unavailablePage.getByRole("status").filter({ hasText: "Governed measures are unavailable" }).waitFor();
  assert.match(await unavailablePage.locator(".medroom-dashboard__med-summary").innerText(), /Administrations given\s+—/);
  assert.match(await unavailablePage.locator(".medroom-dashboard__community-list").innerText(), /San Pablo\s+—/);
  await unavailableContext.close();
  console.log("Med-room dashboard: live aggregate fixtures, six sections, five communities, quarterly trend, and desktop/mobile fit verified.");
});
