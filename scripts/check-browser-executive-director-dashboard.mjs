#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import {
  BASE_URL,
  attachPageDiagnostics,
  prepareArtifactDirs,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-executive-director-dashboard");

const dashboardResponse = {
  facility: {
    facilityId: "337",
    communityName: "Alamo San Pablo",
    shortName: "San Pablo",
    city: "San Pablo",
    state: "CA"
  },
  dashboard: {
    version: "executive-director-community-dashboard-v1",
    status: "ready",
    generatedAt: "2026-10-08T20:33:00.000Z",
    reportingMonth: "2026-10",
    summary: {
      residents: 153,
      currentIncidents: 95,
      priorIncidents: 397,
      averageAge: 47.686,
      averageLengthOfStay: 549.51
    },
    census: [
      { month: "2025-11", census: 132 },
      { month: "2025-12", census: 133 },
      { month: "2026-01", census: 129 },
      { month: "2026-02", census: 131 },
      { month: "2026-03", census: 130 },
      { month: "2026-04", census: 129 },
      { month: "2026-05", census: 129 },
      { month: "2026-06", census: 140 },
      { month: "2026-07", census: 148 },
      { month: "2026-08", census: 145 },
      { month: "2026-09", census: 149 },
      { month: "2026-10", census: 153 }
    ],
    incidentTrend: [
      { month: "2026-09", count: 397 },
      { month: "2026-10", count: 95 }
    ],
    topIncidentCategories: [
      { label: "Medication Refusal", count: 1168 },
      { label: "AWOL/Elopement", count: 427 },
      { label: "Other", count: 309 },
      { label: "Substance Use", count: 198 }
    ],
    medication: {
      month: "2026-10",
      compliancePct: 96,
      scheduled: 10759,
      given: 10333,
      notGiven: 426
    },
    admissions: {
      status: "connected",
      generatedAt: "2026-10-08T20:33:00.000Z",
      asOfDate: "2026-10-08",
      community: {
        census: 153,
        censusChange: 4,
        operatingLimit: 175,
        occupancyPct: 87.4,
        monthToDate: { admissions: 3, discharges: 2, net: 1 },
        lastMonth: { admissions: 8, discharges: 7, net: 1 },
        recentWeeks: { admissions: 5, discharges: 4, net: 1 },
        activeReferrals: 8,
        inDecision: 4,
        needsAttention: 0,
        newReferrals7d: 2,
        newReferrals14d: 5,
        assessmentsThisWeek: 0,
        plannedMoveInsThisWeek: 1,
        completedMoveInsThisWeek: 0
      },
      cards: [
        { referralId: 1, facilityId: "337", clientName: "Sean Bobier", status: "Awaiting admit", column: "decision", daysOpen: 9 },
        { referralId: 2, facilityId: "337", clientName: "Ben Randolph", status: "Assessment scheduled", column: "in_progress", daysOpen: 4 },
        { referralId: 3, facilityId: "337", clientName: "Georgette Moore", status: "Assessment scheduled", column: "in_progress", daysOpen: 3 },
        { referralId: 4, facilityId: "337", clientName: "Jonah Wicker", status: "Clinical review", column: "in_progress", daysOpen: 2 }
      ],
      recentReferrals: [],
      upcomingAssessments: [],
      plannedMoveIns: [
        { referralId: 1, facilityId: "337", clientName: "Sean Bobier", plannedAt: "2026-10-09T18:00:00.000Z", status: "Awaiting admit", readiness: "ready" }
      ]
    }
  }
};

await withBrowserQa(async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  attachPageDiagnostics(page, { consoleErrors, requestFailures });
  await page.route("**/api/platform/executive-director/dashboard**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(dashboardResponse)
  }));

  await page.goto(`${BASE_URL}/executive/dashboard`, { waitUntil: "domcontentloaded" });
  const dashboard = page.locator('[data-executive-community-dashboard="true"]');
  const summary = page.locator('[data-daily-operating-summary="true"]');
  await summary.waitFor({ state: "visible" });

  const forbiddenCopy = /A current view of resident census|Community briefing|Select any area to open|How to read this|What is next/i;
  if (forbiddenCopy.test(await dashboard.innerText())) {
    throw new Error("The repeat-use dashboard reintroduced introductory or explanatory title copy.");
  }
  if (await summary.getByRole("button").count() < 4) {
    throw new Error("The daily operating summary must keep all four drill-down entry points.");
  }
  const desktopMetrics = await page.evaluate(() => {
    const root = document.querySelector('[data-executive-community-dashboard="true"]');
    const summary = document.querySelector('[aria-label="Current community snapshot"]');
    const rootRect = root?.getBoundingClientRect();
    const summaryRect = summary?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      summaryTop: summaryRect?.top ?? null,
      summaryBottom: summaryRect?.bottom ?? null,
      rootTop: rootRect?.top ?? null
    };
  });
  if (desktopMetrics.overflow > 2 || desktopMetrics.summaryTop == null || desktopMetrics.summaryTop > 190 || desktopMetrics.summaryBottom > 330) {
    throw new Error(`The desktop dashboard is not compact enough: ${JSON.stringify(desktopMetrics)}`);
  }
  await page.screenshot({ path: `${screenshotDir}/desktop-1440.png`, fullPage: true });

  await summary.getByRole("button", { name: /^Census/ }).click();
  const detailModal = page.locator('[data-executive-community-detail-modal="census"]');
  await detailModal.waitFor({ state: "visible" });
  await detailModal.getByRole("button", { name: /Close Census detail/i }).click();
  await detailModal.waitFor({ state: "hidden" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const mobileMetrics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    width: document.documentElement.clientWidth,
    firstMetricHeight: document.querySelector('[aria-label="Current community snapshot"] button')?.getBoundingClientRect().height ?? 0
  }));
  if (mobileMetrics.overflow > 2 || mobileMetrics.width !== 390 || mobileMetrics.firstMetricHeight < 44) {
    throw new Error(`The mobile dashboard is not viewport-safe: ${JSON.stringify(mobileMetrics)}`);
  }
  await page.screenshot({ path: `${screenshotDir}/mobile-390.png`, fullPage: false });

  if (consoleErrors.length || requestFailures.length) {
    throw new Error(JSON.stringify({ consoleErrors, requestFailures }));
  }
  await writeFile(`${artifactDir}/latest.json`, JSON.stringify({ desktopMetrics, mobileMetrics }, null, 2));
  await context.close();
  console.log("Executive Director dashboard browser QA passed at 1440px and 390px.");
});
