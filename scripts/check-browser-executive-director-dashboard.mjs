#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import {
  BASE_URL,
  attachPageDiagnostics,
  prepareArtifactDirs,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-executive-director-dashboard");

function mockAdmissionsCard(card, profile = {}) {
  return {
    nextAction: "Review the client profile",
    community: "San Pablo",
    owner: "Admissions team",
    priority: "standard",
    daysSinceUpdate: 0,
    plannedAdmissionDate: null,
    flags: { stale: false, unassigned: false, moveInOverdue: false },
    managementProfile: {
      dateOfBirth: "1984-05-12",
      referralSource: "County behavioral health",
      referringCounty: "Contra Costa County",
      payer: "Medi-Cal",
      responsiblePerson: "Self",
      conservedStatus: "Not conserved",
      documentStatus: "Reviewed",
      assessmentStatus: "Complete",
      assessmentSigned: true,
      assessmentDate: "2026-10-07",
      openRequirements: 0,
      blockingRequirements: 0,
      overview: ["Step-down behavioral health placement", "Medication support and community transition planning"],
      supportSnapshot: [{ label: "Mobility", value: "Independent" }],
      medications: ["Medication list reviewed"],
      medicationSource: "signed_assessment",
      ...profile
    },
    pipelineUrl: "https://pipeline.example/referral",
    ...card
  };
}

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
      { label: "Medication Refusal", count: 28 },
      { label: "AWOL/Elopement", count: 20 },
      { label: "Other", count: 17 },
      { label: "Substance Use", count: 11 }
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
        mockAdmissionsCard({ referralId: 1, facilityId: "337", clientName: "Sean Bobier", status: "Awaiting admit", column: "decision", daysOpen: 9, plannedAdmissionDate: "2026-10-09" }),
        mockAdmissionsCard({ referralId: 2, facilityId: "337", clientName: "Ben Randolph", status: "Assessment scheduled", column: "in_progress", daysOpen: 4 }),
        mockAdmissionsCard({ referralId: 3, facilityId: "337", clientName: "Georgette Moore", status: "Assessment scheduled", column: "in_progress", daysOpen: 3 }),
        mockAdmissionsCard({ referralId: 4, facilityId: "337", clientName: "Jonah Wicker", status: "Clinical review", column: "in_progress", daysOpen: 2 }),
        mockAdmissionsCard({ referralId: 5, facilityId: "337", clientName: "Deanna Bell", status: "Accepted", column: "decision", daysOpen: 12 }, { assessmentSigned: false, assessmentStatus: "Awaiting signature", openRequirements: 1 }),
        mockAdmissionsCard({ referralId: 6, facilityId: "337", clientName: "Mario Manzaro", status: "Under review", column: "decision", daysOpen: 7 }),
        mockAdmissionsCard({ referralId: 7, facilityId: "337", clientName: "Iris Delgado", status: "Referral received", column: "received", daysOpen: 1 }),
        mockAdmissionsCard({ referralId: 8, facilityId: "337", clientName: "Malcolm Reed", status: "Document review", column: "in_progress", daysOpen: 5 })
      ],
      recentReferrals: [],
      upcomingAssessments: [],
      plannedMoveIns: [
        { referralId: 1, facilityId: "337", clientName: "Sean Bobier", plannedAt: "2026-10-09T18:00:00.000Z", status: "Awaiting admit", readiness: "ready" }
      ]
    }
  }
};

const expectedImpendingCards = dashboardResponse.dashboard.admissions.cards.filter((card) => {
  const status = card.status.trim().toLowerCase();
  return card.plannedAdmissionDate || status.startsWith("accept") || status === "awaiting admit" || status === "meet the client not sent";
});

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
  if (await summary.locator("[data-executive-dashboard-panel]").count() !== 4) {
    throw new Error("The dashboard must keep four integrated operating components without a separate stat strip.");
  }
  const panelVisuals = await summary.locator("[data-executive-dashboard-panel]").evaluateAll((panels) => panels.map((panel) => {
    const style = window.getComputedStyle(panel);
    const heading = panel.querySelector("h2");
    return {
      backgroundColor: style.backgroundColor,
      borderTopColor: style.borderTopColor,
      headingSize: heading ? Number.parseFloat(window.getComputedStyle(heading).fontSize) : 0
    };
  }));
  if (new Set(panelVisuals.map((panel) => panel.backgroundColor)).size !== 4 || new Set(panelVisuals.map((panel) => panel.borderTopColor)).size !== 4) {
    throw new Error(`The four operating components must remain visually distinct: ${JSON.stringify(panelVisuals)}`);
  }
  if (panelVisuals.some((panel) => panel.headingSize < 18)) {
    throw new Error(`Dashboard component headings are too small: ${JSON.stringify(panelVisuals)}`);
  }
  if (await summary.locator("[data-executive-dashboard-tone]").count()) {
    throw new Error("The removed multi-color KPI strip must not return.");
  }
  if (await dashboard.locator('[data-executive-referral-status="true"]').count() !== Math.min(expectedImpendingCards.length, 4)) {
    throw new Error("The executive admissions component must surface status language only for impending admits.");
  }
  const impendingSummary = dashboard.locator('[data-executive-impending-summary="true"]');
  if (!/Sean Bobier[\s\S]*Oct 9[\s\S]*Deanna Bell[\s\S]*Date pending/i.test(await impendingSummary.innerText())) {
    throw new Error("The dashboard must present impending admits with date-safe scheduling and pending-date context.");
  }
  const desktopMetrics = await page.evaluate(() => {
    const root = document.querySelector('[data-executive-community-dashboard="true"]');
    const summary = document.querySelector('[data-executive-dashboard-panel="census"]');
    const rootRect = root?.getBoundingClientRect();
    const summaryRect = summary?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      summaryTop: summaryRect?.top ?? null,
      summaryBottom: summaryRect?.bottom ?? null,
      rootTop: rootRect?.top ?? null
    };
  });
  if (desktopMetrics.overflow > 2 || desktopMetrics.summaryTop == null || desktopMetrics.summaryTop > 210) {
    throw new Error(`The desktop dashboard is not compact enough: ${JSON.stringify(desktopMetrics)}`);
  }
  await page.screenshot({ path: `${screenshotDir}/desktop-1440.png`, fullPage: true });

  await dashboard.getByRole("button", { name: "History" }).click();
  const detailShell = page.locator("[data-executive-community-detail-modal]");
  const detailModal = page.locator('[data-executive-community-detail-modal="census"]');
  await detailModal.waitFor({ state: "visible" });
  await page.screenshot({ path: `${screenshotDir}/desktop-census-detail.png`, fullPage: false });
  for (const nextView of ["Admissions", "Incidents", "Medications"]) {
    await detailShell.getByRole("tab", { name: nextView }).click();
    const nextKey = nextView.toLowerCase();
    const nextModal = page.locator(`[data-executive-community-detail-modal="${nextKey}"]`);
    await nextModal.waitFor({ state: "visible" });
    await nextModal.locator(`[data-executive-detail-view="${nextKey}"]`).waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    if (await nextModal.getByRole("tab", { selected: true }).count() !== 1) {
      throw new Error(`The ${nextView} drill-down must have exactly one selected navigation tab.`);
    }
    if (nextKey === "admissions") {
      if (await nextModal.locator('[data-executive-meet-client]').count() !== expectedImpendingCards.length) {
        throw new Error("The admissions drill-down must contain only impending admits with meet-the-client profiles.");
      }
      if (await nextModal.getByText(/Upcoming assessments|Referral charts|Received|In progress|Decision/, { exact: true }).count()) {
        throw new Error("The admissions drill-down must not reproduce Pipeline stages or assessment workflow.");
      }
    }
    await page.screenshot({ path: `${screenshotDir}/desktop-${nextKey}-detail.png`, fullPage: false });
  }
  const activeDetailModal = page.locator('[data-executive-community-detail-modal="medications"]');
  const detailCopy = await activeDetailModal.innerText();
  if (/Governed monthly census|shown without portfolio|Client charts open the existing management review/i.test(detailCopy)) {
    throw new Error("The drill-down reintroduced explanatory report copy.");
  }
  await activeDetailModal.getByRole("button", { name: /Close Medications detail/i }).click();
  await detailShell.waitFor({ state: "hidden" });

  await dashboard.getByRole("button", { name: "Meet the clients" }).click();
  const meetClientModal = page.locator('[data-executive-community-detail-modal="admissions"]');
  await meetClientModal.waitFor({ state: "visible" });
  await meetClientModal.locator('[data-executive-meet-client]').first().getByRole("button", { name: "Meet the client" }).click();
  const clientProfile = page.locator('[data-admissions-progress-modal="true"]');
  await clientProfile.waitFor({ state: "visible" });
  if (!/Sean Bobier|Deanna Bell/.test(await clientProfile.innerText())) {
    throw new Error("Meet the client must open the existing management profile for the selected impending admit.");
  }
  await page.screenshot({ path: `${screenshotDir}/desktop-meet-client-profile.png`, fullPage: false });
  await clientProfile.getByRole("button", { name: "Close management chart" }).click();
  await clientProfile.waitFor({ state: "hidden" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const mobileMetrics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    width: document.documentElement.clientWidth,
    firstPanelTop: document.querySelector('[data-executive-dashboard-panel="census"]')?.getBoundingClientRect().top ?? 0
  }));
  if (mobileMetrics.overflow > 2 || mobileMetrics.width !== 390 || mobileMetrics.firstPanelTop <= 0) {
    throw new Error(`The mobile dashboard is not viewport-safe: ${JSON.stringify(mobileMetrics)}`);
  }
  await page.screenshot({ path: `${screenshotDir}/mobile-390.png`, fullPage: false });
  await dashboard.getByRole("button", { name: "Meet the clients" }).click();
  const mobileAdmissionsModal = page.locator('[data-executive-community-detail-modal="admissions"]');
  await mobileAdmissionsModal.waitFor({ state: "visible" });
  const mobileDetailMetrics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    dialogWidth: document.querySelector('[data-executive-community-detail-modal="admissions"]')?.getBoundingClientRect().width ?? 0
  }));
  if (mobileDetailMetrics.overflow > 2 || mobileDetailMetrics.dialogWidth > 390) {
    throw new Error(`The mobile drill-down is not viewport-safe: ${JSON.stringify(mobileDetailMetrics)}`);
  }
  await page.screenshot({ path: `${screenshotDir}/mobile-admissions-detail.png`, fullPage: false });
  await mobileAdmissionsModal.getByRole("button", { name: /Close Admissions detail/i }).click();

  if (consoleErrors.length || requestFailures.length) {
    throw new Error(JSON.stringify({ consoleErrors, requestFailures }));
  }
  await writeFile(`${artifactDir}/latest.json`, JSON.stringify({ desktopMetrics, mobileMetrics, mobileDetailMetrics }, null, 2));
  await context.close();
  console.log("Executive Director dashboard browser QA passed at 1440px and 390px.");
});
