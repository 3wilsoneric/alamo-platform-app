#!/usr/bin/env node
import {
  BASE_URL,
  attachPageDiagnostics,
  prepareArtifactDirs,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const { screenshotDir } = await prepareArtifactDirs("browser-admissions-overview-qa");
const admissionsToday = isoDateInTimeZone(new Date(), "America/Los_Angeles");

await withBrowserQa(async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  attachPageDiagnostics(page, { consoleErrors, requestFailures });

  await page.goto(`${BASE_URL}/admissions`, { waitUntil: "domcontentloaded" });
  // A clean browser context may install and assume control of the service worker
  // immediately. Let that finite controller reload settle before asserting the
  // routed surface.
  await page.waitForTimeout(1_500);
  const surfaceNavigation = page.locator('[data-admissions-surface-navigation="true"]');
  await surfaceNavigation.waitFor({ state: "visible" });
  const pipelineTab = surfaceNavigation.getByRole("tab", { name: "Pipeline", exact: true });
  const briefingTab = surfaceNavigation.getByRole("tab", { name: "Briefing", exact: true });
  if (
    await surfaceNavigation.getByRole("tab").count() !== 2 ||
    (await surfaceNavigation.getByRole("tab").allTextContents()).join("|") !== "Briefing|Pipeline" ||
    await pipelineTab.getAttribute("aria-selected") !== "true" ||
    await page.locator('[data-admissions-pipeline-page="true"]').count() !== 1 ||
    await page.locator('[data-admissions-briefing-page="true"]').count() !== 0
  ) {
    throw new Error("Admissions must open on the standalone Pipeline page with Pipeline and Briefing navigation.");
  }

  const board = page.locator('[data-admissions-board="true"]');
  const unavailableBoard = page.locator('[data-admissions-referral-pipeline]');
  await Promise.race([
    board.waitFor({ state: "visible", timeout: 60_000 }),
    unavailableBoard.waitFor({ state: "visible", timeout: 60_000 })
  ]);

  if (await board.isVisible().catch(() => false)) {
    const layoutToggle = page.locator('[data-admissions-layout-toggle="true"]');
    const boardButton = layoutToggle.getByRole("button", { name: "Board", exact: true });
    const listButton = layoutToggle.getByRole("button", { name: "List", exact: true });
    if (
      await page.locator('[data-admissions-board-card]').count() < 1 ||
      await boardButton.getAttribute("aria-pressed") !== "true" ||
      await listButton.getAttribute("aria-pressed") !== "false"
    ) {
      throw new Error("The Pipeline page must keep the live referral board and Board/List switch available.");
    }
    await listButton.click();
    if (await listButton.getAttribute("aria-pressed") !== "true") {
      throw new Error("The Pipeline page List view did not activate.");
    }
    await boardButton.click();

    const firstBriefingButton = page.getByRole("button", { name: /^Briefing/ }).first();
    await firstBriefingButton.click();
    const modal = page.locator('[data-admissions-progress-modal="true"]');
    await modal.waitFor({ state: "visible" });
    await modal.getByRole("button", { name: "Close client chart" }).click();
    await modal.waitFor({ state: "hidden" });
  }
  await page.screenshot({ path: `${screenshotDir}/desktop-admissions-pipeline.png`, fullPage: true });

  await briefingTab.click();
  const dashboard = page.locator('[data-admissions-briefing-dashboard="true"]');
  await dashboard.waitFor({ state: "visible" });
  const executiveUpdate = page.locator('[data-admissions-executive-update="true"]');
  const executiveUpdateVisible = await executiveUpdate.isVisible().catch(() => false);
  if (executiveUpdateVisible) {
    await page.locator('[data-admissions-executive-update="true"][data-admissions-chat-typing="false"]').waitFor({ state: "visible", timeout: 60_000 });
  }
  const executiveText = executiveUpdateVisible ? await executiveUpdate.innerText() : "";
  const dashboardNavigation = page.locator('[data-admissions-briefing-navigation="true"]');
  const scheduleDashboardTab = dashboardNavigation.getByRole("tab", { name: /^Schedule/ });
  const communitiesDashboardTab = dashboardNavigation.getByRole("tab", { name: /^Communities/ });
  const openFieldsDashboardTab = dashboardNavigation.getByRole("tab", { name: /^Open fields/ });
  const scheduleTabVisible = await scheduleDashboardTab.count() === 1;
  const scheduledExecutiveRows = executiveUpdateVisible
    ? await executiveUpdate.locator('[data-admissions-executive-section="scheduled"]').evaluateAll((rows) => rows.map((row) => row.getAttribute("data-admissions-executive-row")))
    : [];
  if (
    await briefingTab.getAttribute("aria-selected") !== "true" ||
    await page.locator('[data-admissions-pipeline-page="true"]').count() !== 0 ||
    await dashboard.locator("table").count() !== 0 ||
    await dashboardNavigation.getByRole("tab").count() < 1 ||
    await dashboardNavigation.getByRole("tab").count() > 3 ||
    await page.locator('[data-admissions-county-outreach="true"]').count() !== 0 ||
    await page.getByRole("heading", { name: "County outreach" }).count() !== 0 ||
    await page.locator('[data-admissions-priority-schedule]').count() !== 0 ||
    await page.getByRole("heading", { name: "Weekly operating brief" }).count() !== 0 ||
    await page.getByRole("heading", { name: "Referral sources" }).count() !== 0 ||
    await page.locator('[data-admissions-origin-source]').count() !== 0 ||
    await page.getByRole("heading", { name: "Weekly trend" }).count() !== 0 ||
    await executiveUpdate.locator('[data-admissions-chat-avatar="true"]').count() !== 0 ||
    await executiveUpdate.getByText("Admissions analyst", { exact: true }).count() !== 0 ||
    (executiveUpdateVisible && await executiveUpdate.locator('[data-admissions-executive-summary="true"]').count() !== 1) ||
    (executiveUpdateVisible && await executiveUpdate.locator('[data-admissions-executive-section="pipeline"]').count() !== 1) ||
    (executiveUpdateVisible && await executiveUpdate.locator('[data-admissions-executive-row]').count() < 2) ||
    scheduledExecutiveRows.some((key) => /^scheduled:(\d{4}-\d{2}-\d{2})\|/.exec(key ?? "")?.[1] < admissionsToday) ||
    await dashboard.getByText(/needs attention|highest-priority|flagged|risk scoring/i).count() !== 0 ||
    (executiveUpdateVisible && /\balso\b|admission date not scheduled|accepted clients moving toward admission|where the work is/i.test(executiveText))
  ) {
    console.error(JSON.stringify({
      briefingTabs: await dashboardNavigation.getByRole("tab").allTextContents(),
      communitiesPageCount: await page.locator('[data-admissions-dashboard-page="communities"]').count(),
      executiveUpdateVisible,
      executiveSummaryCount: await executiveUpdate.locator('[data-admissions-executive-summary="true"]').count(),
      executivePipelineCount: await executiveUpdate.locator('[data-admissions-executive-section="pipeline"]').count(),
      executiveRowCount: await executiveUpdate.locator('[data-admissions-executive-row]').count(),
      executiveText,
      scheduledExecutiveRows
    }, null, 2));
    throw new Error("The Briefing page must render as a concise, structured analyst update without repetitive prose.");
  }
  if (scheduleTabVisible) {
    await scheduleDashboardTab.click();
    await page.locator('[data-admissions-dashboard-page="schedule"]').waitFor({ state: "visible" });
    const visibleScheduleDates = await page.locator('[data-admissions-event-date]').evaluateAll((rows) => rows.map((row) => row.getAttribute("data-admissions-event-date")));
    const scheduleWeekCount = await page.locator('[data-admissions-schedule-week="true"]').count();
    const unavailableScheduleCount = await page.locator('[data-admissions-schedule-coverage="unavailable"]').count();
    if (
      await scheduleDashboardTab.getAttribute("aria-selected") !== "true" ||
      await page.locator('[data-admissions-schedule="true"]').count() !== 1 ||
      scheduleWeekCount + unavailableScheduleCount !== 1 ||
      await page.locator('[data-admissions-schedule-lane="assessment"]').count() !== 1 ||
      await page.locator('[data-admissions-schedule-lane="move-in"]').count() !== 1 ||
      await page.locator('[data-admissions-schedule-lane="accepted-no-date"]').count() !== 1 ||
      await page.getByRole("heading", { name: "Accepted, no date" }).count() !== 1 ||
      await page.getByRole("heading", { name: "Admissions schedule" }).count() !== 1 ||
      await page.getByRole("heading", { name: "Upcoming assessments" }).count() !== 1 ||
      await page.getByRole("heading", { name: "Planned move-ins" }).count() !== 1 ||
      visibleScheduleDates.some((date) => (date ?? "") < admissionsToday)
    ) {
      throw new Error("Schedule must show literal upcoming assessment, move-in, and accepted-without-date lanes.");
    }
    await page.screenshot({ path: `${screenshotDir}/desktop-admissions-schedule.png`, fullPage: true });
  } else if (
    await communitiesDashboardTab.getAttribute("aria-selected") !== "true" ||
    await page.locator('[data-admissions-dashboard-page="communities"]').count() !== 1 ||
    await page.locator('[data-admissions-dashboard-page="schedule"]').count() !== 0
  ) {
    throw new Error("An empty Schedule page must stay hidden so Community snapshot remains useful.");
  }
  const dashboardTypeScale = await page.evaluate(() => ({
    summary: document.querySelector('[data-admissions-executive-summary="true"]')
      ? Number.parseFloat(getComputedStyle(document.querySelector('[data-admissions-executive-summary="true"]')).fontSize)
      : null,
    section: Number.parseFloat(getComputedStyle(document.querySelector('#admissions-schedule-title, #admissions-community-dashboard-title')).fontSize)
  }));
  if ((dashboardTypeScale.summary != null && dashboardTypeScale.summary < 18) || dashboardTypeScale.section < 22) {
    throw new Error(`Admissions briefing typography is too small: ${JSON.stringify(dashboardTypeScale)}`);
  }
  await communitiesDashboardTab.click();
  await page.locator('[data-admissions-dashboard-page="communities"]').waitFor({ state: "visible" });
  if (
    await communitiesDashboardTab.getAttribute("aria-selected") !== "true" ||
    await page.getByRole("heading", { name: "Community snapshot" }).count() !== 1 ||
    await page.locator('[data-admissions-briefing-community]').count() !== 5 ||
    await page.locator('[data-admissions-briefing-community]').filter({ hasText: "Unassigned" }).count() !== 0 ||
    await page.locator('[data-admissions-community-census="true"]:visible').count() !== 5 ||
    await page.locator('[data-admissions-community-upcoming-admits="true"]').count() !== 5 ||
    await page.locator('[data-admissions-community-referrals="true"]').count() !== 5
  ) {
    throw new Error("The Communities dashboard page must retain all five governed community rows and measures.");
  }
  const firstCommunityDisclosure = page.locator('[data-admissions-briefing-community] button[aria-expanded]').first();
  await firstCommunityDisclosure.click();
  if (
    await firstCommunityDisclosure.getAttribute("aria-expanded") !== "true" ||
    await page.locator('[data-admissions-community-detail="true"]').count() !== 1
  ) {
    throw new Error("Community snapshot rows must open an inline operating drill-down.");
  }
  await page.screenshot({ path: `${screenshotDir}/desktop-admissions-briefing-dashboard.png`, fullPage: true });

  if (await openFieldsDashboardTab.count()) {
    await openFieldsDashboardTab.click();
    await page.locator('[data-admissions-dashboard-page="followup"]').waitFor({ state: "visible" });
    if (
      await openFieldsDashboardTab.getAttribute("aria-selected") !== "true" ||
      await page.getByRole("heading", { name: "Open record fields" }).count() !== 1 ||
      await page.locator('[data-admissions-follow-up="true"] button').count() < 1 ||
      await page.locator('[data-admissions-follow-up="true"]').getByText(/highest-priority|flagged|needs attention|priority score/i).count() !== 0
    ) {
      throw new Error("The Open fields page must expose literal unresolved record fields without an inferred ranking.");
    }
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-admissions-briefing-dashboard="true"]').waitFor({ state: "visible" });
  if (await page.getByRole("tab", { name: "Briefing", exact: true }).getAttribute("aria-selected") !== "true") {
    throw new Error("The Briefing page must survive reload through its URL state.");
  }

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${BASE_URL}/admissions?view=briefing`, { waitUntil: "domcontentloaded" });
  await mobile.waitForTimeout(1_500);
  await mobile.locator('[data-admissions-briefing-dashboard="true"]').waitFor({ state: "visible" });
  await mobile.screenshot({ path: `${screenshotDir}/mobile-admissions-briefing-initial.png`, fullPage: true });
  const mobileDashboardNavigation = mobile.locator('[data-admissions-briefing-navigation="true"]');
  const mobileDashboardLabels = await mobileDashboardNavigation.locator('[data-admissions-dashboard-label="true"]').allTextContents();
  for (const label of mobileDashboardLabels) {
    await mobileDashboardNavigation.getByRole("tab", { name: new RegExp(`^${label}`) }).click();
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 2) throw new Error(`Mobile Admissions ${label} dashboard has ${overflow}px of horizontal overflow.`);
  }
  if (await mobile.getByRole("tab", { name: "Briefing", exact: true }).getAttribute("aria-selected") !== "true") {
    throw new Error("Mobile Admissions must retain the separate Pipeline and Briefing destinations.");
  }
  if (await mobile.locator('[data-admissions-county-outreach="true"]').count() !== 0) {
    throw new Error("County outreach must remain absent from mobile Admissions.");
  }
  await mobile.screenshot({ path: `${screenshotDir}/mobile-admissions-briefing-dashboard.png`, fullPage: true });

  await context.setOffline(true);
  const offlineStatus = mobile.locator('[data-platform-connection-status="offline"]');
  await offlineStatus.waitFor({ state: "visible" });
  if (!/previously loaded information stays available/i.test(await offlineStatus.innerText())) {
    throw new Error("Mobile Admissions must keep loaded information visible when the connection drops.");
  }
  const offlineOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (offlineOverflow > 2) throw new Error(`The mobile offline status has ${offlineOverflow}px of horizontal overflow.`);
  await mobile.screenshot({ path: `${screenshotDir}/mobile-admissions-offline.png`, fullPage: false });
  await context.setOffline(false);
  await offlineStatus.waitFor({ state: "hidden" });

  await mobile.evaluate(() => {
    window.dispatchEvent(new CustomEvent("alamo-platform:data-degraded", {
      detail: { cachedAt: Date.now() - 60_000 }
    }));
  });
  const staleStatus = mobile.locator('[data-platform-connection-status="stale"]');
  await staleStatus.waitFor({ state: "visible" });
  if (
    !/showing information last loaded/i.test(await staleStatus.innerText()) ||
    await staleStatus.getByRole("button", { name: "Retry" }).count() !== 1
  ) {
    throw new Error("Mobile Admissions must explain stale fallback data and provide a retry action.");
  }
  await mobile.evaluate(() => window.dispatchEvent(new Event("alamo-platform:data-recovered")));
  await staleStatus.waitFor({ state: "hidden" });

  if (consoleErrors.length || requestFailures.length) {
    throw new Error(JSON.stringify({ consoleErrors, requestFailures }));
  }
  await context.close();
  console.log("browser admissions checks passed");
});

function isoDateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
