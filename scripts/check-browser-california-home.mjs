#!/usr/bin/env node
import { ALAMO_FACILITIES } from "../shared/community-names.mjs";
import {
  BASE_URL,
  prepareArtifactDirs,
  withBrowserQa
} from "./browser-qa-utils.mjs";

async function readPlatformPageNavigation(page) {
  return page.locator('[data-platform-page-navigation="true"]').evaluate((navigation) => ({
    current: navigation.getAttribute("data-platform-page-current"),
    left: Array.from(navigation.querySelectorAll('[data-platform-page-side="left"]'))
      .map((item) => item.getAttribute("data-platform-page-target")),
    right: Array.from(navigation.querySelectorAll('[data-platform-page-side="right"]'))
      .map((item) => item.getAttribute("data-platform-page-target"))
  }));
}

async function main() {
  const { screenshotDir } = await prepareArtifactDirs("browser-california-home-qa");
  await withBrowserQa(async (browser) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 920 } });
    const page = await context.newPage();

    for (const facility of ALAMO_FACILITIES) {
      await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
      const marker = page.locator(
        `[data-california-community-marker="${facility.facilityId}"]`
      );
      await marker.waitFor({ state: "visible", timeout: 10_000 });
      if (facility.facilityId === "337") {
        const userIdentity = page.locator('[data-platform-user-identity="true"]');
        const userName = page.locator('[data-platform-user-name="true"]');
        await userIdentity.waitFor({ state: "visible", timeout: 5_000 });
        const initialUserNameOpacity = await userName.evaluate(
          (element) => window.getComputedStyle(element).opacity
        );
        if (initialUserNameOpacity !== "0") {
          throw new Error("Desktop profile name should stay hidden until the avatar is hovered.");
        }
        await userIdentity.hover();
        await page.waitForFunction(
          () =>
            window.getComputedStyle(
              document.querySelector('[data-platform-user-name="true"]')
            ).opacity === "1"
        );

        const dashboard = await page.evaluate(async () => {
          const response = await fetch("/api/home-dashboard");
          if (!response.ok) {
            throw new Error(`Home dashboard returned ${response.status}.`);
          }
          return response.json();
        });
        const portfolioCensus = Number(dashboard?.operational?.currentCensus);
        const priorPortfolioCensus = Number(
          dashboard?.operational?.priorCensus
        );
        const portfolioChange = Number(
          dashboard?.operational?.censusChange
        );
        const hasGovernedCensus =
          dashboard?.operational?.currentCensus !== null &&
          dashboard?.operational?.currentCensus !== undefined;
        if (hasGovernedCensus && (!Number.isFinite(portfolioCensus) || portfolioCensus <= 0)) {
          throw new Error("California map did not load a valid governed portfolio census.");
        }
        if (hasGovernedCensus && (!Number.isFinite(priorPortfolioCensus) || priorPortfolioCensus <= 0)) {
          throw new Error("California map did not load a valid prior governed portfolio census.");
        }
        if (hasGovernedCensus && !Number.isFinite(portfolioChange)) {
          throw new Error("California map did not load a valid comparable-period portfolio census change.");
        }
        let communityCensusTotal = 0;
        let communityPriorCensusTotal = 0;
        for (const expectedFacility of ALAMO_FACILITIES) {
          const facilityMarker = page.locator(
            `[data-california-community-marker="${expectedFacility.facilityId}"]`
          );
          const census = Number(
            await facilityMarker.getAttribute("data-california-node-census")
          );
          const censusChange = Number(
            await facilityMarker.getAttribute("data-california-node-census-change-7d")
          );
          if (hasGovernedCensus && (!Number.isFinite(census) || census <= 0)) {
            throw new Error(
              `${expectedFacility.communityName} map signal is missing its governed census.`
            );
          }
          if (hasGovernedCensus && !Number.isFinite(censusChange)) {
            throw new Error(
              `${expectedFacility.communityName} map signal is missing its comparable-period census change.`
            );
          }
          if (!hasGovernedCensus && (census !== 0 || censusChange !== 0)) {
            throw new Error(
              `${expectedFacility.communityName} exposed partial census data from an incomplete snapshot.`
            );
          }
          if (hasGovernedCensus) {
            communityCensusTotal += census;
            communityPriorCensusTotal += census - censusChange;
          }
        }
        if (hasGovernedCensus && communityCensusTotal !== portfolioCensus) {
          throw new Error(
            `Portfolio census ${portfolioCensus} does not equal community total ${communityCensusTotal}.`
          );
        }
        if (hasGovernedCensus && communityPriorCensusTotal !== priorPortfolioCensus) {
          throw new Error(
            `Prior portfolio census ${priorPortfolioCensus} does not equal community total ${communityPriorCensusTotal}.`
          );
        }
        if (hasGovernedCensus && communityCensusTotal - communityPriorCensusTotal !== portfolioChange) {
          throw new Error(
            "Portfolio census change does not reconcile to the five community changes."
          );
        }
        const communityIndex = page.locator('[data-california-community-index="true"]');
        await communityIndex.waitFor({ state: "visible", timeout: 5_000 });
        if (await communityIndex.locator('[data-california-index-community]').count() !== ALAMO_FACILITIES.length) {
          throw new Error("The main Platform home does not show every community in its census index.");
        }
        for (const expectedFacility of ALAMO_FACILITIES) {
          const indexRow = communityIndex.locator(`[data-california-index-community="${expectedFacility.facilityId}"]`);
          const matchingData = dashboard.communities.find((item) => String(item.facility_id) === expectedFacility.facilityId);
          const rowText = (await indexRow.textContent()) ?? "";
          if (matchingData?.currentCensus != null && !rowText.includes(Number(matchingData.currentCensus).toLocaleString())) {
            throw new Error(`${expectedFacility.communityName} index census differs from the governed home response.`);
          }
        }
        await page.screenshot({
          path: `${screenshotDir}/desktop-home.png`,
          fullPage: true
        });
        await communityIndex.locator('[data-california-index-community="337"]').hover();
        await page.locator('[data-california-community-metrics="337"]').waitFor({ state: "visible", timeout: 3_000 });
      }
      await marker.hover();
      await page
        .locator(`[data-california-community-tooltip="${facility.facilityId}"]`)
        .waitFor({ state: "visible", timeout: 3_000 });
      const markerMetrics = page.locator(
        `[data-california-community-metrics="${facility.facilityId}"]`
      );
      await markerMetrics.waitFor({ state: "visible", timeout: 3_000 });
      const markerMetricText = (await markerMetrics.textContent()) ?? "";
      const markerCensusText = (await page
        .locator(`[data-california-community-census-metrics="${facility.facilityId}"]`)
        .textContent()) ?? "";
      const hasMarkerCensus = markerMetricText.includes("census") &&
        markerCensusText.includes("vs");
      const hasUnavailableMarkerCensus = markerMetricText.includes("Census unavailable") &&
        markerCensusText.includes("Prior period unavailable");
      if (!hasMarkerCensus && !hasUnavailableMarkerCensus) {
        throw new Error(
          `${facility.communityName} hover detail did not expose census and its comparable-period change.`
        );
      }
      if (facility.facilityId === "337") {
        await page.screenshot({
          path: `${screenshotDir}/desktop-home-hover.png`,
          fullPage: true
        });
      }
      await marker.click();
      await page.waitForURL(
        (url) => url.pathname === `/home/community/${facility.facilityId}`,
        { timeout: 5_000 }
      );
      const profile = page.locator(
        `[data-california-community-profile="${facility.facilityId}"]`
      );
      await profile.waitFor({ state: "visible", timeout: 5_000 });
      await profile
        .getByRole("heading", { name: facility.shortName, exact: true })
        .first()
        .waitFor({ state: "visible", timeout: 5_000 });
      await profile
        .locator('[data-community-dashboard-surface="detail"]')
        .waitFor({ state: "visible", timeout: 5_000 });
      await profile
        .locator('[data-community-kpi-drilldown="residents"]')
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await profile
        .getByRole("button", { name: "Resident search" })
        .waitFor({ state: "visible", timeout: 5_000 });
      for (const focus of ["census", "incidents", "medications", "residents", "detail"]) {
        await profile
          .locator(`[data-community-modal-tab="${focus}"]`)
          .click();
        await page
          .locator(
            `[data-california-community-profile="${facility.facilityId}"][data-california-modal-view="${focus}"]`
          )
          .waitFor({ state: "visible", timeout: 5_000 });
        if (focus === "incidents") {
          const triage = profile.locator('[data-community-incident-triage="true"]');
          await triage.waitFor({ state: "visible", timeout: 10_000 });
          await triage
            .locator("[data-incident-priority]")
            .first()
            .waitFor({ state: "visible", timeout: 15_000 });
          const triageFacilityId = await triage
            .locator('[data-incident-center="true"]')
            .getAttribute("data-incident-center-facility");
          if (triageFacilityId !== facility.facilityId) {
            throw new Error(
              `${facility.communityName} incident triage rendered facility ${triageFacilityId ?? "none"}.`
            );
          }
          if (await triage.locator("[data-incident-priority]").count() !== 3) {
            throw new Error(`${facility.communityName} incident triage is missing a priority lane.`);
          }
          if (await triage.locator("[data-incident-date-window]").count() !== 2) {
            throw new Error(`${facility.communityName} incident triage is missing a loaded-day control.`);
          }
          if (facility.facilityId === "337") {
            await page.screenshot({
              path: `${screenshotDir}/desktop-community-incidents.png`,
              fullPage: false
            });
          }
        }
      }
      if (facility.facilityId === "337") {
        await page.screenshot({
          path: `${screenshotDir}/desktop-community-modal.png`,
          fullPage: false
        });
      }
      if (facility.facilityId === "337") {
        const profileBox = await profile.boundingBox();
        if (!profileBox) throw new Error("Community profile has no visible bounds.");
        await page.mouse.click(
          Math.max(4, profileBox.x / 2),
          Math.max(4, profileBox.y / 2)
        );
      } else {
        await profile
          .getByRole("button", { name: `Close ${facility.communityName} profile` })
          .click();
      }
      await profile.waitFor({ state: "hidden", timeout: 5_000 });
      if (new URL(page.url()).pathname !== "/home") {
        throw new Error(`${facility.communityName} modal closed without returning to /home.`);
      }
    }

    await page.goto(`${BASE_URL}/home/community/337`, {
      waitUntil: "domcontentloaded"
    });
    const sanPabloProfile = page.locator(
      '[data-california-community-profile="337"]'
    );
    const modalView = (view) => page.locator(
      `[data-california-community-profile="337"][data-california-modal-view="${view}"]`
    );
    await sanPabloProfile.waitFor({ state: "visible", timeout: 5_000 });

    await sanPabloProfile
      .locator('[data-community-kpi-drilldown="census"]')
      .first()
      .click();
    await modalView("census").waitFor({ state: "visible", timeout: 5_000 });
    await sanPabloProfile
      .getByRole("button", { name: "Back to A & A Health Services San Pablo" })
      .click();
    await modalView("detail").waitFor({ state: "visible", timeout: 5_000 });

    await sanPabloProfile
      .locator('[data-community-kpi-drilldown="incidents"]')
      .first()
      .click();
    await modalView("incidents").waitFor({ state: "visible", timeout: 5_000 });
    const sanPabloTriage = sanPabloProfile.locator('[data-community-incident-triage="true"]');
    await sanPabloTriage.waitFor({ state: "visible", timeout: 10_000 });
    await sanPabloTriage
      .locator("[data-incident-priority]")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
    await sanPabloTriage
      .locator('[data-incident-date-window="previous"]')
      .click();
    if (await sanPabloTriage.locator("[data-incident-priority]").count() !== 3) {
      throw new Error("San Pablo previous incident day did not preserve all three priority lanes.");
    }
    await sanPabloTriage
      .locator('[data-incident-date-window="latest"]')
      .click();
    await sanPabloProfile
      .locator('[data-module-row="incident-category"]')
      .first()
      .click();
    await modalView("incidents").waitFor({ state: "visible", timeout: 5_000 });
    await sanPabloProfile
      .locator('[data-incident-report-list="true"]')
      .waitFor({ state: "visible", timeout: 10_000 });
    const incidentEvent = sanPabloProfile
      .locator('[data-module-row="incident-detail"]')
      .first();
    await incidentEvent.waitFor({ state: "visible", timeout: 10_000 });
    await incidentEvent
      .getByRole("button", { name: /Open .* incident from/i })
      .click();
    const incidentReport = page.locator("[data-incident-report-modal]").last();
    await incidentReport.waitFor({ state: "visible", timeout: 5_000 });
    await incidentReport
      .getByRole("button", { name: "Close incident report" })
      .last()
      .click();
    await incidentReport.waitFor({ state: "hidden", timeout: 5_000 });
    await sanPabloProfile
      .locator('[data-community-modal-tab="detail"]')
      .click();
    await modalView("detail").waitFor({ state: "visible", timeout: 5_000 });

    await sanPabloProfile
      .locator('[data-community-kpi-drilldown="medications"]')
      .first()
      .click();
    await modalView("medications").waitFor({ state: "visible", timeout: 5_000 });
    await sanPabloProfile
      .locator('[data-module-row="medication-compliance"]')
      .first()
      .waitFor({ state: "visible", timeout: 5_000 });
    await sanPabloProfile
      .locator('[data-community-modal-tab="residents"]')
      .click();
    await modalView("residents").waitFor({ state: "visible", timeout: 5_000 });
    await sanPabloProfile
      .locator('[data-community-modal-tab="detail"]')
      .click();
    await modalView("detail").waitFor({ state: "visible", timeout: 5_000 });

    await sanPabloProfile
      .locator('[data-community-kpi-drilldown="residents"]')
      .first()
      .click();
    await modalView("residents").waitFor({ state: "visible", timeout: 5_000 });
    if (new URL(page.url()).pathname !== "/home/community/337") {
      throw new Error("Resident roster drilldown left the community modal route.");
    }
    await sanPabloProfile
      .locator('[data-module-row="resident-roster"]')
      .first()
      .click();
    await modalView("resident-search").waitFor({ state: "visible", timeout: 5_000 });
    await sanPabloProfile
      .locator('[data-module-row="resident-profile-card"]')
      .waitFor({ state: "visible", timeout: 15_000 });
    await sanPabloProfile
      .getByRole("button", { name: "Back to A & A Health Services San Pablo" })
      .click();
    await modalView("residents").waitFor({ state: "visible", timeout: 5_000 });
    await sanPabloProfile
      .getByRole("button", { name: "Back to A & A Health Services San Pablo" })
      .click();
    await modalView("detail").waitFor({ state: "visible", timeout: 5_000 });
    await sanPabloProfile.waitFor({ state: "visible", timeout: 5_000 });
    await sanPabloProfile
      .getByRole("button", { name: "Resident search" })
      .click();
    await modalView("resident-search").waitFor({ state: "visible", timeout: 5_000 });
    await sanPabloProfile
      .locator('[data-resident-search-module="true"]')
      .waitFor({ state: "visible", timeout: 5_000 });
    const residentSearchOverflow = await sanPabloProfile.evaluate(
      (element) => element.scrollWidth - element.clientWidth
    );
    if (residentSearchOverflow > 2) {
      throw new Error(`Resident search has ${residentSearchOverflow}px of horizontal overflow inside the community modal.`);
    }
    await page.screenshot({
      path: `${screenshotDir}/desktop-resident-search.png`,
      fullPage: false
    });
    if (new URL(page.url()).pathname !== "/home/community/337") {
      throw new Error("Resident search left the community modal route.");
    }
    await sanPabloProfile
      .getByRole("button", { name: "Back to A & A Health Services San Pablo" })
      .click();
    await modalView("detail").waitFor({ state: "visible", timeout: 5_000 });

    await page.goto(`${BASE_URL}/home?community=345`, {
      waitUntil: "domcontentloaded"
    });
    await page
      .locator('[data-california-community-profile="345"]')
      .waitFor({ state: "visible", timeout: 5_000 });

    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    const expectedMarkerPoints = {
      "337": { x: 308.44, y: 247.66 },
      "342": { x: 306.0, y: 255.29 },
      "343": { x: 374.56, y: 356.13 },
      "344": { x: 331.07, y: 266.75 },
      "345": { x: 353.53, y: 344.45 }
    };
    for (const [facilityId, expected] of Object.entries(expectedMarkerPoints)) {
      const point = await page
        .locator(`[data-california-community-dot="${facilityId}"]`)
        .evaluate((element) => ({
          x: Number(element.getAttribute("cx")),
          y: Number(element.getAttribute("cy"))
        }));
      if (
        Math.abs(point.x - expected.x) > 0.05 ||
        Math.abs(point.y - expected.y) > 0.05
      ) {
        throw new Error(
          `California marker ${facilityId} rendered at ${point.x},${point.y}; expected ${expected.x},${expected.y}.`
        );
      }
    }
    const topLevelQuestionsCount = await page
      .locator('[data-platform-page-target="questions"]')
      .count();
    if (topLevelQuestionsCount !== 0) {
      throw new Error("Ask a question is still exposed as a top-level platform destination.");
    }
    const questionPanel = page.locator(
      '[data-california-carousel-panel="questions"]'
    );
    const reportsPanel = page.locator(
      '[data-california-carousel-panel="reports"]'
    );
    if (
      await questionPanel.count() !== 1 ||
      await reportsPanel.count() !== 1
    ) {
      throw new Error("Questions and Analytics were not pre-mounted beside the California map.");
    }
    if (
      await questionPanel.getAttribute("aria-hidden") !== "true" ||
      await reportsPanel.getAttribute("aria-hidden") !== "true"
    ) {
      throw new Error("Off-screen carousel panels are exposed before either is selected.");
    }
    const initialVerticalOverflow = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight
    );
    if (initialVerticalOverflow > 2) {
      throw new Error(`California entry scrolls by ${initialVerticalOverflow}px before Analytics is selected.`);
    }
    const mapBox = await page.locator("[data-california-map]").boundingBox();
    if (!mapBox || mapBox.width < 585 || mapBox.width > 605) {
      throw new Error(`California map did not preserve its regional desktop scale (${mapBox?.width ?? 0}px).`);
    }
    for (const stateId of ["id", "ut", "nm"]) {
      const stateBox = await page
        .locator(`[data-california-neighbor-state="${stateId}"]`)
        .boundingBox();
      if (
        !stateBox ||
        stateBox.width < 40 ||
        stateBox.height < 40 ||
        stateBox.y + stateBox.height < 80 ||
        stateBox.y > 840
      ) {
        throw new Error(
          `${stateId} did not render as visible second-tier geographic context.`
        );
      }
    }
    if (mapBox.y < 95 || mapBox.y >= 150) {
      throw new Error(`California atlas did not preserve its top composition (${mapBox.y}px).`);
    }
    const viewport = page.viewportSize();
    const mapLeftShift = viewport
      ? viewport.width / 2 - (mapBox.x + mapBox.width / 2)
      : 0;
    if (!viewport || mapLeftShift < 165 || mapLeftShift > 180) {
      throw new Error(`California map did not preserve its desktop left shift (${mapLeftShift}px).`);
    }
    const analyticsMenuBox = await page
      .locator('[data-california-hero-action="analytics"]')
      .boundingBox();
    const stateFaceBox = await page
      .locator('[data-california-state-face="true"]')
      .boundingBox();
    if (!stateFaceBox || stateFaceBox.y < 64 || stateFaceBox.y >= 200) {
      throw new Error(
        `California silhouette did not remain the foreground anchor beneath the northern states (${stateFaceBox?.y ?? "missing"}px).`
      );
    }
    if (!analyticsMenuBox || analyticsMenuBox.y + analyticsMenuBox.height > stateFaceBox.y) {
      throw new Error("Analytics navigation overlaps the California map below the shared header.");
    }
    const homeAnalyticsCount = await page
      .locator('[data-california-hero-action="analytics"]')
      .count();
    if (homeAnalyticsCount !== 1) {
      throw new Error("Analytics is missing from the California map menu.");
    }
    const homeNavigation = await readPlatformPageNavigation(page);
    if (
      homeNavigation.current !== "home" ||
      homeNavigation.left.join(",") !== "home" ||
      homeNavigation.right.join(",") !== "analytics,admissions"
    ) {
      throw new Error(`Home platform navigation is out of order: ${JSON.stringify(homeNavigation)}`);
    }
    await page.getByRole("link", { name: "Analytics", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/analytics", { timeout: 5_000 });
    await page
      .locator('[data-reports-page="true"][data-reports-embedded="true"]')
      .waitFor({ state: "visible", timeout: 10_000 });
    await page
      .locator('[data-analytics-section-navigation][data-analytics-section-current="reports"] [data-analytics-section-target="questions"]')
      .click();
    await page
      .locator('[data-certified-question-guide="true"]')
      .waitFor({ state: "visible", timeout: 5_000 });
    await page.waitForFunction(() => {
      const carousel = document.querySelector(
        '[data-california-workspace-carousel="true"]'
      );
      const panel = document.querySelector(
        '[data-california-carousel-panel="questions"]'
      );
      if (!carousel || !panel) return false;
      const panelBox = panel.getBoundingClientRect();
      return (
        carousel.getAttribute("data-california-active-panel") === "questions" &&
        panel.getAttribute("aria-hidden") === "false" &&
        Math.abs(panelBox.left - carousel.getBoundingClientRect().left) <= 2
      );
    });
    await page.screenshot({
      path: `${screenshotDir}/desktop-questions.png`,
      fullPage: false
    });
    if (new URL(page.url()).pathname !== "/analytics/questions") {
      throw new Error("Ask a question did not establish the canonical /analytics/questions route.");
    }
    if (await questionPanel.getAttribute("aria-hidden") !== "false") {
      throw new Error("Questions route did not activate the analyst carousel panel.");
    }
    const questionNavigation = await readPlatformPageNavigation(page);
    if (
      questionNavigation.current !== "analytics" ||
      questionNavigation.left.join(",") !== "home" ||
      questionNavigation.right.join(",") !== "analytics,admissions"
    ) {
      throw new Error(`Analytics question navigation is out of order: ${JSON.stringify(questionNavigation)}`);
    }
    const [questionNavigationBox, questionWorkspaceBox] = await Promise.all([
      page.locator('[data-platform-page-navigation="true"]').boundingBox(),
      page.locator('[data-california-question-workspace="true"]').boundingBox()
    ]);
    if (
      !questionNavigationBox ||
      !questionWorkspaceBox ||
      questionWorkspaceBox.y < questionNavigationBox.y + questionNavigationBox.height + 6
    ) {
      throw new Error("Questions content overlaps the positional platform navigation.");
    }
    const questionScroll = await page.evaluate(() => window.scrollY);
    if (questionScroll > 2) {
      throw new Error(`Questions carousel changed document scroll to ${questionScroll}px.`);
    }
    await page
      .getByRole("link", { name: "Back to California map" })
      .waitFor({ state: "visible", timeout: 5_000 });

    await page.reload({ waitUntil: "networkidle" });
    await page
      .locator('[data-certified-question-guide="true"]')
      .waitFor({ state: "visible", timeout: 5_000 });
    await page.waitForFunction(() => {
      const carousel = document.querySelector(
        '[data-california-workspace-carousel="true"]'
      );
      const panel = document.querySelector(
        '[data-california-carousel-panel="questions"]'
      );
      if (!carousel || !panel) return false;
      return (
        carousel.getAttribute("data-california-active-panel") === "questions" &&
        panel.getAttribute("aria-hidden") === "false" &&
        Math.abs(
          panel.getBoundingClientRect().left -
            carousel.getBoundingClientRect().left
        ) <= 2
      );
    });
    const reloadLayout = await page.evaluate(() => {
      const carousel = document.querySelector(
        '[data-california-workspace-carousel="true"]'
      );
      const mapPanel = document.querySelector(
        '[data-california-carousel-panel="map"]'
      );
      const questionPanel = document.querySelector(
        '[data-california-carousel-panel="questions"]'
      );
      return {
        carouselLeft: Math.round(carousel?.getBoundingClientRect().left ?? -1),
        mapRight: Math.round(mapPanel?.getBoundingClientRect().right ?? -1),
        questionLeft: Math.round(questionPanel?.getBoundingClientRect().left ?? -1),
        scrollY: Math.round(window.scrollY)
      };
    });
    if (
      Math.abs(reloadLayout.questionLeft - reloadLayout.carouselLeft) > 2 ||
      reloadLayout.mapRight > reloadLayout.carouselLeft + 2 ||
      reloadLayout.scrollY > 2
    ) {
      throw new Error(
        `Reload did not preserve the isolated Questions panel: ${JSON.stringify(reloadLayout)}`
      );
    }
    await page.screenshot({
      path: `${screenshotDir}/desktop-questions-reload.png`,
      fullPage: false
    });

    await page
      .locator('[data-analytics-section-navigation][data-analytics-section-current="questions"] [data-analytics-section-target="reports"]')
      .click();
    await page.waitForURL((url) => url.pathname === "/analytics", { timeout: 5_000 });
    await page
      .locator('[data-reports-page="true"][data-reports-embedded="true"]')
      .waitFor({ state: "visible", timeout: 10_000 });
    const analyticsNavigation = await readPlatformPageNavigation(page);
    if (
      analyticsNavigation.current !== "analytics" ||
      analyticsNavigation.left.join(",") !== "home" ||
      analyticsNavigation.right.join(",") !== "analytics,admissions"
    ) {
      throw new Error(`Analytics platform navigation is out of order: ${JSON.stringify(analyticsNavigation)}`);
    }
    const selectedAnalytics = page.locator('[data-platform-page-target="analytics"]');
    const analyticsSelectedStyle = await selectedAnalytics.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        borderColor: style.borderColor
      };
    });
    if (
      await selectedAnalytics.getAttribute("aria-current") !== "page" ||
      analyticsSelectedStyle.borderColor === "rgba(0, 0, 0, 0)"
    ) {
      throw new Error(`Analytics is not visibly selected in the primary navigation: ${JSON.stringify(analyticsSelectedStyle)}`);
    }
    const [analyticsNavigationBox, reportsPageBox] = await Promise.all([
      page.locator('[data-platform-page-navigation="true"]').boundingBox(),
      page.locator('[data-reports-page="true"][data-reports-embedded="true"]').boundingBox()
    ]);
    if (
      !analyticsNavigationBox ||
      !reportsPageBox ||
      reportsPageBox.y < analyticsNavigationBox.y + analyticsNavigationBox.height + 6
    ) {
      throw new Error("Analytics content overlaps the positional platform navigation.");
    }
    await page.waitForFunction(() => {
      const carousel = document.querySelector(
        '[data-california-workspace-carousel="true"]'
      );
      const panel = document.querySelector(
        '[data-california-carousel-panel="reports"]'
      );
      return (
        carousel?.getAttribute("data-california-active-panel") === "reports" &&
        panel?.getAttribute("aria-hidden") === "false" &&
        Math.abs(
          (panel?.getBoundingClientRect().left ?? -100) -
            (carousel?.getBoundingClientRect().left ?? 100)
        ) <= 2
      );
    });
    await page.screenshot({
      path: `${screenshotDir}/desktop-analytics.png`,
      fullPage: false
    });
    if (await page.getByRole("button", { name: /50-state targeting atlas/i }).count()) {
      throw new Error("The direct-URL-only Outreach workspace returned to Analytics navigation.");
    }
    await page.goto(`${BASE_URL}/outreach`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === "/outreach", {
      timeout: 5_000
    });
    await page
      .locator('[data-fifty-state-page="true"][data-fifty-state-embedded="false"]')
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
    await page
      .locator('[data-fifty-state-page="true"][data-fifty-state-embedded="false"]')
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === "/analytics", { timeout: 5_000 });
    await page
      .locator('[data-reports-page="true"][data-reports-embedded="true"]')
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("link", { name: "Back to California map" }).click();
    await page.waitForURL((url) => url.pathname === "/home", { timeout: 5_000 });

    await context.close();

    const tallContext = await browser.newContext({ viewport: { width: 1560, height: 1300 } });
    const tallPage = await tallContext.newPage();
    await tallPage.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    const tallMapBox = await tallPage
      .locator("[data-california-map]")
      .boundingBox();
    const tallCarouselBox = await tallPage
      .locator('[data-california-workspace-carousel="true"]')
      .boundingBox();
    const tallStateFaceBox = await tallPage
      .locator('[data-california-state-face="true"]')
      .boundingBox();
    const tallAnalyticsBox = await tallPage
      .locator('[data-california-hero-action="analytics"]')
      .boundingBox();
    if (!tallMapBox || tallMapBox.width < 680 || tallMapBox.width > 695) {
      throw new Error(
        `California map did not expand for the tall desktop viewport (${tallMapBox?.width ?? 0}px).`
      );
    }
    if (
      !tallCarouselBox ||
      Math.abs(tallCarouselBox.x) > 1 ||
      Math.abs(tallCarouselBox.width - 1560) > 1
    ) {
      throw new Error(
        `California atlas is still constrained by the app content wrapper (${JSON.stringify(tallCarouselBox)}).`
      );
    }
    if (
      !tallStateFaceBox ||
      tallStateFaceBox.y < 68 ||
      tallStateFaceBox.y + tallStateFaceBox.height > 1292
    ) {
      throw new Error(
        `California silhouette is clipped or misplaced on a tall desktop (${JSON.stringify(tallStateFaceBox)}).`
      );
    }
    if (
      !tallAnalyticsBox ||
      !tallStateFaceBox ||
      tallAnalyticsBox.x <= tallStateFaceBox.x + tallStateFaceBox.width + 24
    ) {
      throw new Error(
        `Analytics is not positioned beside the tall California silhouette (map ${JSON.stringify(tallMapBox)}, analytics ${JSON.stringify(tallAnalyticsBox)}).`
      );
    }
    for (const facility of ALAMO_FACILITIES) {
      const labelBox = await tallPage
        .locator(`[data-california-community-tooltip="${facility.facilityId}"]`)
        .boundingBox();
      if (
        !labelBox ||
        labelBox.x < 4 ||
        labelBox.x + labelBox.width > 1556
      ) {
        throw new Error(
          `${facility.shortName} label is clipped at the tall desktop viewport.`
        );
      }
    }
    const tallOverflow = await tallPage.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth - window.innerWidth,
      vertical: document.documentElement.scrollHeight - window.innerHeight
    }));
    if (tallOverflow.horizontal > 2 || tallOverflow.vertical > 2) {
      throw new Error(
        `Tall California entry overflows before the analyst opens: ${JSON.stringify(tallOverflow)}.`
      );
    }
    await tallPage.screenshot({
      path: `${screenshotDir}/tall-desktop-home.png`,
      fullPage: false
    });
    await tallContext.close();

    const zoomedDesktopContext = await browser.newContext({
      viewport: { width: 1060, height: 706 }
    });
    const zoomedDesktopPage = await zoomedDesktopContext.newPage();
    await zoomedDesktopPage.goto(`${BASE_URL}/home`, {
      waitUntil: "domcontentloaded"
    });
    const zoomedMapBox = await zoomedDesktopPage
      .locator("[data-california-map]")
      .boundingBox();
    const zoomedStateFaceBox = await zoomedDesktopPage
      .locator('[data-california-state-face="true"]')
      .boundingBox();
    const zoomedAnalyticsBox = await zoomedDesktopPage
      .locator('[data-california-hero-action="analytics"]')
      .boundingBox();
    if (!zoomedMapBox || zoomedMapBox.width < 440 || zoomedMapBox.width > 455) {
      throw new Error(
        `California map is not height-bounded at the zoomed desktop viewport (${zoomedMapBox?.width ?? 0}px).`
      );
    }
    if (!zoomedStateFaceBox || zoomedStateFaceBox.y < 68) {
      throw new Error(
        `California silhouette is clipped by the header at the zoomed desktop viewport (${zoomedStateFaceBox?.y ?? "missing"}px).`
      );
    }
    for (const facility of ALAMO_FACILITIES) {
      const labelBox = await zoomedDesktopPage
        .locator(`[data-california-community-tooltip="${facility.facilityId}"]`)
        .boundingBox();
      if (
        !labelBox ||
        labelBox.x < 4 ||
        labelBox.x + labelBox.width > 1056
      ) {
        throw new Error(
          `${facility.shortName} label is clipped at the zoomed desktop viewport.`
        );
      }
    }
    if (
      !zoomedAnalyticsBox ||
      zoomedAnalyticsBox.y + zoomedAnalyticsBox.height > 702
    ) {
      throw new Error("Analytics is clipped at the zoomed desktop viewport.");
    }
    const zoomedOverflow = await zoomedDesktopPage.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth - window.innerWidth,
      vertical: document.documentElement.scrollHeight - window.innerHeight
    }));
    if (zoomedOverflow.horizontal > 2 || zoomedOverflow.vertical > 2) {
      throw new Error(
        `Zoomed desktop entry overflows before the analyst opens: ${JSON.stringify(zoomedOverflow)}.`
      );
    }
    await zoomedDesktopPage.screenshot({
      path: `${screenshotDir}/zoomed-desktop-home.png`,
      fullPage: false
    });
    await zoomedDesktopContext.close();

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    const mobileCommunityHome = mobilePage.locator('[data-mobile-community-home="true"]');
    await mobileCommunityHome.waitFor({ state: "visible", timeout: 10_000 });
    const mobileWordmarkBox = await mobilePage
      .locator('[data-platform-wordmark="true"]')
      .boundingBox();
    if (!mobileWordmarkBox) {
      throw new Error("The Alamo Health home anchor is missing on mobile.");
    }
    if (await mobilePage.locator('[aria-label^="Signed in as"]').isVisible()) {
      throw new Error("California carousel reintroduced redundant profile chrome on mobile.");
    }
    const mobileHeadingBox = await mobileCommunityHome.getByRole("heading", { name: "Communities" }).boundingBox();
    if (!mobileHeadingBox || mobileHeadingBox.y < 58) {
      throw new Error("Mobile community heading extends beneath the fixed header.");
    }
    await mobilePage.screenshot({ path: `${screenshotDir}/mobile-home.png`, fullPage: false });
    if (await mobilePage.locator('[data-california-map="true"]').isVisible().catch(() => false)) {
      throw new Error("The desktop California map is exposed on mobile instead of the community list.");
    }
    if (await mobilePage.locator('[data-mobile-community-card]').count() !== ALAMO_FACILITIES.length) {
      throw new Error("Mobile community list is missing a community card.");
    }
    const mobileHomeBox = await mobileCommunityHome.boundingBox();
    const finalCommunityBox = await mobilePage.locator('[data-mobile-community-card]').last().boundingBox();
    if (
      !mobileHomeBox ||
      !finalCommunityBox ||
      mobileHomeBox.height < 780 ||
      finalCommunityBox.y + finalCommunityBox.height < 810
    ) {
      throw new Error("Mobile community rows do not use the available phone viewport.");
    }
    for (const facility of ALAMO_FACILITIES) {
      const cardBox = await mobilePage
        .locator(`[data-mobile-community-card="${facility.facilityId}"]`)
        .boundingBox();
      if (
        !cardBox ||
        cardBox.x < 4 ||
        cardBox.x + cardBox.width > 386
      ) {
        throw new Error(`${facility.shortName} card is clipped on mobile.`);
      }
    }
    const mobileOverflow = await mobilePage.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    if (mobileOverflow > 2) {
      throw new Error(`California home has ${mobileOverflow}px of horizontal overflow on mobile.`);
    }
    await mobilePage.getByRole("button", { name: "Open navigation" }).click();
    const mobileMenu = mobilePage.locator('[data-platform-mobile-menu="true"]');
    await mobileMenu.waitFor({ state: "visible", timeout: 5_000 });
    const mobileMenuBox = await mobileMenu.boundingBox();
    const mobileMenuLinks = await mobileMenu.getByRole("link").evaluateAll((links) =>
      links.map((link) => Math.round(link.getBoundingClientRect().height))
    );
    if (
      !mobileMenuBox ||
      mobileMenuBox.y > 62 ||
      mobileMenuBox.y + mobileMenuBox.height < 842 ||
      mobileMenuLinks.some((height) => height < 60)
    ) {
      throw new Error(`Mobile platform menu is not a full-height touch workspace: ${JSON.stringify({ mobileMenuBox, mobileMenuLinks })}`);
    }
    await mobilePage.screenshot({ path: `${screenshotDir}/mobile-menu.png`, fullPage: false });
    await mobilePage.getByRole("button", { name: "Close navigation" }).click();
    await mobileMenu.waitFor({ state: "hidden", timeout: 5_000 });
    if (
      await mobilePage
        .locator('[data-california-carousel-panel="questions"]')
        .getAttribute("aria-hidden") !== "true"
    ) {
      throw new Error("Mobile analyst panel is exposed before Ask a question is selected.");
    }
    await mobilePage
      .locator('[data-mobile-community-card="345"]')
      .click();
    await mobilePage.waitForURL(
      (url) => url.pathname === "/home/community/345",
      { timeout: 5_000 }
    );
    await mobilePage
      .locator('[data-california-community-profile="345"]')
      .waitFor({ state: "visible", timeout: 5_000 });
    await mobilePage
      .locator('[data-california-community-profile="345"] [data-community-kpi-drilldown="residents"]')
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
    await mobilePage.screenshot({
      path: `${screenshotDir}/mobile-community-modal.png`,
      fullPage: false
    });
    await mobilePage
      .locator('[data-california-community-profile="345"]')
      .getByRole("button", { name: "Resident search" })
      .click();
    await mobilePage
      .locator('[data-california-community-profile="345"][data-california-modal-view="resident-search"]')
      .waitFor({ state: "visible", timeout: 5_000 });
    const mobileResidentModule = mobilePage
      .locator('[data-california-community-profile="345"] [data-resident-search-module="true"]');
    await mobileResidentModule.waitFor({ state: "visible", timeout: 10_000 });
    const residentStatusFilter = mobileResidentModule.locator('[data-resident-status-filter="true"]');
    if (await residentStatusFilter.inputValue() !== "current") {
      throw new Error("Mobile resident search did not start with current residents clearly selected.");
    }
    const currentResult = mobileResidentModule.locator('[data-resident-result-status="current"]').first();
    await currentResult.waitFor({ state: "visible", timeout: 10_000 });
    if (!/Current/i.test(await currentResult.locator('[data-resident-result-status-label="true"]').innerText())) {
      throw new Error("Mobile resident result does not identify the resident as current.");
    }
    if (await mobileResidentModule.locator('[data-resident-profile-panel="true"]').isVisible()) {
      throw new Error("Mobile resident profile rendered beneath the result list before a resident was selected.");
    }
    const mobileResidentSearchOverflow = await mobilePage
      .locator('[data-california-community-profile="345"]')
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    if (mobileResidentSearchOverflow > 2) {
      throw new Error(`Mobile resident search has ${mobileResidentSearchOverflow}px of horizontal overflow.`);
    }
    await mobilePage.screenshot({
      path: `${screenshotDir}/mobile-resident-search.png`,
      fullPage: false
    });
    await currentResult.click();
    const mobileResidentProfile = mobileResidentModule.locator('[data-resident-profile-panel="true"]');
    await mobileResidentProfile.waitFor({ state: "visible", timeout: 10_000 });
    await mobileResidentModule
      .getByRole("button", { name: "Back to results" })
      .waitFor({ state: "visible", timeout: 5_000 });
    if (await mobileResidentModule.locator('[data-resident-results-panel="true"]').isVisible()) {
      throw new Error("Mobile resident results remained above the selected resident profile.");
    }
    if (!/Current resident|Past resident/i.test(await mobileResidentModule.locator('[data-resident-mobile-profile-status="true"]').innerText())) {
      throw new Error("Mobile resident profile does not state whether the resident is current or past.");
    }
    const mobileProfileOverflow = await mobileResidentProfile.evaluate(
      (element) => element.scrollWidth - element.clientWidth
    );
    if (mobileProfileOverflow > 2) {
      throw new Error(`Mobile resident profile has ${mobileProfileOverflow}px of horizontal overflow.`);
    }
    await mobilePage.screenshot({
      path: `${screenshotDir}/mobile-resident-profile.png`,
      fullPage: false
    });
    await mobileResidentModule.getByRole("button", { name: "Back to results" }).click();
    await currentResult.waitFor({ state: "visible", timeout: 5_000 });
    if (await mobileResidentProfile.isVisible()) {
      throw new Error("Back to results did not return to the mobile resident list.");
    }
    await residentStatusFilter.selectOption("past");
    const pastResult = mobileResidentModule.locator('[data-resident-result-status="past"]').first();
    await pastResult.waitFor({ state: "visible", timeout: 10_000 });
    if (!/Past/i.test(await pastResult.locator('[data-resident-result-status-label="true"]').innerText())) {
      throw new Error("Mobile resident result does not identify the resident as past.");
    }
    await residentStatusFilter.selectOption("current");
    await currentResult.waitFor({ state: "visible", timeout: 10_000 });
    await mobilePage.setViewportSize({ width: 320, height: 693 });
    const narrowResidentSearchOverflow = await mobileResidentModule.evaluate(
      (element) => element.scrollWidth - element.clientWidth
    );
    if (narrowResidentSearchOverflow > 2) {
      throw new Error(`320px resident search has ${narrowResidentSearchOverflow}px of horizontal overflow.`);
    }
    await mobilePage.screenshot({
      path: `${screenshotDir}/mobile-resident-search-320.png`,
      fullPage: false
    });
    await currentResult.click();
    await mobileResidentProfile.waitFor({ state: "visible", timeout: 5_000 });
    const narrowResidentProfileOverflow = await mobileResidentProfile.evaluate(
      (element) => element.scrollWidth - element.clientWidth
    );
    if (narrowResidentProfileOverflow > 2) {
      throw new Error(`320px resident profile has ${narrowResidentProfileOverflow}px of horizontal overflow.`);
    }
    await mobilePage.screenshot({
      path: `${screenshotDir}/mobile-resident-profile-320.png`,
      fullPage: false
    });
    await mobileContext.close();
  });

  console.log(
    "California home browser QA passed: pre-mounted desktop panels, route-safe Questions and Analytics slides, five desktop markers, bounded mobile community cards, modal drilldowns, and mobile flow are wired."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
