#!/usr/bin/env node
import {
  BASE_URL,
  attachPageDiagnostics,
  prepareArtifactDirs,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const { screenshotDir } = await prepareArtifactDirs("browser-admissions-overview-qa");

await withBrowserQa(async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  attachPageDiagnostics(page, { consoleErrors, requestFailures });

  await page.goto(`${BASE_URL}/admissions`, { waitUntil: "domcontentloaded" });
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
  const countyCommunityCount = await page.locator('[data-admissions-county-community]').count();
  const countyHeadingCount = await page.getByRole("heading", { name: "County outreach" }).count();
  if (
    await briefingTab.getAttribute("aria-selected") !== "true" ||
    await page.locator('[data-admissions-pipeline-page="true"]').count() !== 0 ||
    await dashboard.locator("table").count() !== 0 ||
    await page.locator('[data-admissions-briefing-pager="true"]').count() !== 0 ||
    await page.locator('[data-admissions-briefing-community]').count() !== 5 ||
    await page.locator('[data-admissions-briefing-community]').filter({ hasText: "Unassigned" }).count() !== 0 ||
    ![0, 2].includes(countyCommunityCount) ||
    countyHeadingCount !== (countyCommunityCount === 2 ? 1 : 0) ||
    await page.locator('[data-admissions-priority-schedule]').count() !== 2 ||
    await page.getByRole("heading", { name: "Where referrals are coming from" }).count() !== 1 ||
    await page.getByRole("heading", { name: "Weekly trend" }).count() !== 0 ||
    await page.getByRole("heading", { name: "Upcoming assessments" }).count() !== 1 ||
    await page.getByRole("heading", { name: "Move-ins this week" }).count() !== 1
  ) {
    throw new Error("The Briefing page must render as a readable dashboard without report tables or slide navigation.");
  }
  if (countyCommunityCount === 2 && !/verified county/i.test(await page.locator('[data-admissions-county-outreach="true"]').innerText())) {
    throw new Error("County outreach must identify the displayed county data as verified.");
  }

  const sourceNotice = page.locator('[data-admissions-briefing-source-notice="true"]');
  const sourceCards = dashboard.locator('[aria-labelledby="admissions-origin-dashboard-title"] article');
  if (
    await sourceCards.count() === 0 &&
    (await sourceNotice.count() !== 1 || !/missing data is never shown as zero/i.test(await sourceNotice.innerText()))
  ) {
    throw new Error("An incomplete Pipeline feed must remain explicit on the Briefing dashboard.");
  }
  if (await page.getByRole("button", { name: "Next referral sources" }).isEnabled().catch(() => false)) {
    const firstSources = await sourceCards.allTextContents();
    await page.getByRole("button", { name: "Next referral sources" }).click();
    const nextSources = await sourceCards.allTextContents();
    if (firstSources.join("|") === nextSources.join("|")) {
      throw new Error("Referral-source paging must change the visible dashboard cards.");
    }
  }
  await page.screenshot({ path: `${screenshotDir}/desktop-admissions-briefing-dashboard.png`, fullPage: true });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-admissions-briefing-dashboard="true"]').waitFor({ state: "visible" });
  if (await page.getByRole("tab", { name: "Briefing", exact: true }).getAttribute("aria-selected") !== "true") {
    throw new Error("The Briefing page must survive reload through its URL state.");
  }

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${BASE_URL}/admissions?view=briefing`, { waitUntil: "domcontentloaded" });
  await mobile.locator('[data-admissions-briefing-dashboard="true"]').waitFor({ state: "visible" });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) throw new Error(`Admissions Briefing dashboard has ${overflow}px of horizontal overflow on mobile.`);
  if (await mobile.getByRole("tab", { name: "Briefing", exact: true }).getAttribute("aria-selected") !== "true") {
    throw new Error("Mobile Admissions must retain the separate Pipeline and Briefing destinations.");
  }
  const mobileCountyDetails = mobile.locator('[data-admissions-county-community] details');
  if (await mobileCountyDetails.count()) {
    const firstCountyDetails = mobileCountyDetails.first();
    const countySummaryBox = await firstCountyDetails.locator("summary").boundingBox();
    if (!countySummaryBox || countySummaryBox.height < 44 || await firstCountyDetails.getAttribute("open") != null) {
      throw new Error("Mobile county outreach must open as a compact, touch-sized disclosure.");
    }
    await firstCountyDetails.locator("summary").click();
    if (await firstCountyDetails.getAttribute("open") == null || !await firstCountyDetails.locator("li").first().isVisible()) {
      throw new Error("Mobile county outreach did not reveal its verified county detail.");
    }
    await firstCountyDetails.locator("summary").click();
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
