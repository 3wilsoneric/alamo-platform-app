#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ALAMO_FACILITIES } from "../shared/community-names.mjs";
import {
  attachPageDiagnostics,
  measureCanvas,
  openChat,
  prepareArtifactDirs,
  startCleanChat,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const surfaceModes = [
  { id: "detail", routeSuffix: "", module: "communityDetail", focus: "", required: "detail" },
  { id: "census", routeSuffix: "?focus=census", module: "communityDetail", focus: "census", required: "census" },
  { id: "incidents", routeSuffix: "?focus=incidents", module: "communityDetail", focus: "incidents", required: "incidents" },
  { id: "residents", routeSuffix: "?focus=residents", module: "communityDetail", focus: "residents", required: "residents" },
  { id: "resident-search", routeSuffix: "?focus=search", module: "residentSearch", focus: "search", required: "search" },
  { id: "trend", routeSuffix: "?focus=trend", module: "communityDetail", focus: "trend", required: "trend" }
];
const routeViewports = [
  { id: "desktop", width: 1440, height: 920 },
  { id: "mobile", width: 390, height: 844 }
];

const rejectedText = [
  /Safe Mode/i,
  /could not render/i,
  /could not be loaded/i,
  /Invalid Date/i,
  /\bundefined\b/i,
  /Victoria's Place/i
];

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

async function dispatchSurface(page, route, sourceLabel) {
  const moduleCountBefore = await page.locator("[data-chat-module-content-id]").count();
  await page.evaluate(({ nextRoute, nextLabel }) => {
    window.dispatchEvent(new CustomEvent("alamo-platform:surface-in-canvas", {
      detail: {
        route: nextRoute,
        sourceLabel: nextLabel,
        introText: null
      }
    }));
  }, { nextRoute: route, nextLabel: sourceLabel });
  await page.waitForFunction(
    (previousCount) => document.querySelectorAll("[data-chat-module-content-id]").length > previousCount,
    moduleCountBefore,
    { timeout: 12_000 }
  );
  return page.locator("[data-chat-module-content-id]").last();
}

async function clickForSurface(page, control) {
  const moduleCountBefore = await page.locator("[data-chat-module-content-id]").count();
  await control.click();
  await page.waitForFunction(
    (previousCount) => document.querySelectorAll("[data-chat-module-content-id]").length > previousCount,
    moduleCountBefore,
    { timeout: 12_000 }
  );
  return page.locator("[data-chat-module-content-id]").last();
}

async function waitForSurfaceReady(moduleRoot, mode) {
  await moduleRoot.locator("[data-platform-module]").waitFor({ state: "visible", timeout: 12_000 });
  await moduleRoot.page().waitForFunction(
    (element) => {
      if (!(element instanceof HTMLElement)) return false;
      return !/Loading (?:community|resident|snapshot|data)|Loading\.\.\./i.test(element.innerText);
    },
    await moduleRoot.elementHandle(),
    { timeout: 30_000 }
  ).catch(() => {});
  const readySelector = mode.required === "census" || mode.required === "trend" || mode.required === "detail"
    ? '[data-module-chart="census-trend"]'
    : mode.required === "residents"
      ? '[data-module-row="resident-roster"]'
      : mode.required === "search"
        ? '[data-resident-search-module="true"]'
        : null;
  if (readySelector) {
    await moduleRoot.locator(readySelector).first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  } else if (mode.required === "incidents") {
    await moduleRoot.getByText(/Incident Volume/i).first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  }
  await delay(80);
}

async function revealCensusPointTooltip(moduleRoot) {
  const point = moduleRoot.locator('[data-chart-point="census"]').first();
  const tooltip = point.locator('[data-chart-point-tooltip="census"]');
  await point.hover().catch(() => {});
  if (await tooltip.waitFor({ state: "visible", timeout: 1_500 }).then(() => true).catch(() => false)) {
    return true;
  }
  await point.focus().catch(() => {});
  return tooltip.waitFor({ state: "visible", timeout: 1_500 }).then(() => true).catch(() => false);
}

async function assertSurface(moduleRoot, facility, mode) {
  await waitForSurfaceReady(moduleRoot, mode);
  const platformRoot = moduleRoot.locator("[data-platform-module]").first();
  const moduleId = await platformRoot.getAttribute("data-platform-module");
  const facilityId = await platformRoot.getAttribute("data-platform-facility-id");
  const focus = await platformRoot.getAttribute("data-platform-focus");
  const text = await moduleRoot.innerText();
  const failures = [];

  if (moduleId !== mode.module) failures.push(`expected module ${mode.module}, got ${moduleId ?? "none"}`);
  if (facilityId !== facility.facilityId) failures.push(`expected facility ${facility.facilityId}, got ${facilityId ?? "none"}`);
  if (focus !== mode.focus) failures.push(`expected focus ${mode.focus || "none"}, got ${focus ?? "none"}`);
  if (!text.includes(facility.communityName)) failures.push(`missing community name ${facility.communityName}`);
  for (const pattern of rejectedText) {
    if (pattern.test(text)) failures.push(`rejected text ${pattern}`);
  }

  if (mode.required === "census" || mode.required === "trend") {
    if (!(await moduleRoot.locator('[data-community-census-surface="true"]').count())) failures.push("missing dedicated census surface");
    if (!(await moduleRoot.locator('[data-module-chart="census-trend"]').count())) failures.push("missing census trend chart");
    if (!(await moduleRoot.locator('[data-chart-point="census"]').count())) failures.push("census trend has no interactive points");
    if (!(await revealCensusPointTooltip(moduleRoot))) failures.push("census point value is not visible on hover or focus");
  }
  if (mode.required === "incidents") {
    if (!(await moduleRoot.locator('[data-community-dashboard-surface="incidents"]').count())) failures.push("missing dedicated incident surface");
    const triage = moduleRoot.locator('[data-community-incident-triage="true"]');
    await triage.locator("[data-incident-priority]").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    if (!(await triage.count())) failures.push("missing community-scoped recent incident triage");
    if (await triage.locator("[data-incident-priority]").count() !== 3) failures.push("incident triage is missing a priority lane");
    if (await triage.locator("[data-incident-date-window]").count() !== 2) failures.push("incident triage is missing one of the latest two loaded-day controls");
    const triageFacilityId = await triage
      .locator('[data-incident-center="true"]')
      .getAttribute("data-incident-center-facility");
    if (triageFacilityId !== facility.facilityId) failures.push(`incident triage scoped to ${triageFacilityId ?? "nothing"}`);
    if (!/Incident Volume/i.test(text)) failures.push("missing incident volume");
    if (!/Monthly totals/i.test(text)) failures.push("missing incident monthly totals");
    if (await moduleRoot.locator("[data-incident-total-drilldown]").count()) failures.push("incident surface still uses a separate total drilldown button");
    if (!(await moduleRoot.locator("[data-incident-month-drilldown]").count())) failures.push("incident months do not open scoped reports");
    const categoryRows = moduleRoot.locator('[data-module-row="incident-category"]');
    if (await categoryRows.count() && await categoryRows.first().evaluate((node) => node.tagName) !== "BUTTON") {
      failures.push("incident category rows do not drill into category detail");
    }
    if (await categoryRows.count() && !(await categoryRows.first().getAttribute("data-incident-category-drilldown"))) {
      failures.push("incident category rows do not expose their scoped report destination");
    }
  }
  if (mode.required === "residents") {
    if (!(await moduleRoot.locator('[data-community-dashboard-surface="residents"]').count())) failures.push("missing dedicated resident surface");
    if (!/Longest Stay Residents|Residents by Length of Stay|Resident roster/i.test(text)) failures.push("missing resident roster");
    if (!(await moduleRoot.locator('[data-module-row="resident-roster"]').count())) failures.push("resident roster has no rows");
    if (await moduleRoot.locator('[data-module-row="resident-roster"]').first().evaluate((node) => node.tagName) !== "BUTTON") {
      failures.push("resident roster rows do not open resident profiles");
    }
  }
  if (mode.required === "search") {
    if (!(await moduleRoot.locator('[data-resident-search-module="true"]').count())) failures.push("missing resident search module");
    const selectedCommunity = await moduleRoot.getByLabel("Filter resident search by community").inputValue().catch(() => "");
    if (selectedCommunity !== facility.communityName) failures.push(`resident search scoped to ${selectedCommunity || "nothing"}`);
  }
  if (mode.required === "detail") {
    if (!(await moduleRoot.locator('[data-community-dashboard-surface="detail"]').count())) failures.push("missing dedicated community overview surface");
    if (!(await moduleRoot.locator('[data-module-chart="census-trend"]').count())) failures.push("missing census trend chart");
    if (!(await moduleRoot.locator('[data-chart-point="census"]').count())) failures.push("community overview trend has no interactive points");
    if (!(await revealCensusPointTooltip(moduleRoot))) failures.push("community overview point value is not visible on hover or focus");
    if (!/Medication performance/i.test(text)) failures.push("missing medication performance");
    if (!/Diagnosis mix/i.test(text)) failures.push("missing diagnosis mix");
    const diagnosisLayout = await moduleRoot.evaluate((root) => {
      const chart = root.querySelector('[data-module-chart="diagnosis-mix"]');
      const firstRow = root.querySelector('[data-module-row="diagnosis-mix"]');
      const chartRect = chart?.getBoundingClientRect();
      const rowRect = firstRow?.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        chartTop: chartRect ? Math.round(chartRect.top) : null,
        rowTop: rowRect ? Math.round(rowRect.top) : null
      };
    });
    if (
      diagnosisLayout.viewportWidth >= 768 &&
      diagnosisLayout.chartTop != null &&
      diagnosisLayout.rowTop != null &&
      Math.abs(diagnosisLayout.chartTop - diagnosisLayout.rowTop) > 24
    ) {
      failures.push(`diagnosis chart and legend are vertically misaligned: ${JSON.stringify(diagnosisLayout)}`);
    }
    if (await moduleRoot.locator("[data-community-kpi-drilldown]").count() < 5) failures.push("summary figures are missing scoped drilldowns");
    for (const selector of [
      '[data-module-row="incident-category"]',
      '[data-module-row="diagnosis-mix"]',
      '[data-module-row="resident-roster"]'
    ]) {
      const control = moduleRoot.locator(selector).first();
      if (!(await control.count()) || await control.evaluate((node) => node.tagName) !== "BUTTON") {
        failures.push(`${selector} does not open scoped detail`);
      }
    }
  }

  const overflow = await moduleRoot.evaluate((root) => root.scrollWidth - root.clientWidth);
  if (overflow > 8) failures.push(`horizontal overflow ${overflow}px`);
  if (failures.length) throw new Error(failures.join("; "));
}

async function assertScopedContext(moduleRoot, expected) {
  const platformRoot = moduleRoot.locator("[data-platform-module]").first();
  for (const [attribute, value] of Object.entries(expected)) {
    const actual = await platformRoot.getAttribute(attribute);
    if (actual !== value) throw new Error(`expected ${attribute}=${value}, got ${actual ?? "none"}`);
  }
}

async function auditCommunityProfileDrilldowns(page, facility) {
  await startCleanChat(page);
  const latestProfile = await dispatchSurface(page, `/communities/${facility.facilityId}`, `${facility.communityName} profile`);
  const profileId = await latestProfile.getAttribute("data-chat-module-content-id");
  if (!profileId) throw new Error("community profile has no stable module id");
  const profile = page.locator(`[data-chat-module-content-id="${profileId}"]`);
  await assertSurface(profile, facility, surfaceModes[0]);
  const completed = [];

  for (const focus of ["census", "incidents", "residents"]) {
    const destination = await clickForSurface(page, profile.locator(`[data-community-kpi-drilldown="${focus}"]`).first());
    const mode = surfaceModes.find((candidate) => candidate.focus === focus);
    if (!mode) throw new Error(`missing QA mode for ${focus}`);
    await assertSurface(destination, facility, mode);
    completed.push(`summary ${focus}`);
  }

  const categoryControl = profile.locator('[data-module-row="incident-category"]').first();
  const category = await categoryControl.innerText().then((value) => value.split("\n")[0]?.trim() ?? "");
  const categoryDetail = await clickForSurface(page, categoryControl);
  await assertScopedContext(categoryDetail, {
    "data-platform-focus": "incidents",
    "data-platform-category": category
  });
  if (!(await categoryDetail.getByText(category, { exact: false }).count())) throw new Error("category detail omitted the selected category");
  const reportList = categoryDetail.locator('[data-incident-report-list="true"]');
  await reportList.waitFor({ state: "visible", timeout: 20_000 });
  const incidentEvent = reportList.locator('[data-module-row="incident-detail"]').first();
  await incidentEvent.waitFor({ state: "visible", timeout: 20_000 });
  await incidentEvent.getByRole("button", { name: /Open .* incident from/i }).click();
  const incidentReport = page.locator("[data-incident-report-modal]").last();
  await incidentReport.waitFor({ state: "visible", timeout: 8_000 });
  if (!(await incidentReport.getByText(/Incident report/i).count())) {
    throw new Error("incident event did not open its report");
  }
  await incidentReport.getByRole("button", { name: "Close incident report" }).last().click();
  await incidentReport.waitFor({ state: "hidden", timeout: 8_000 });
  completed.push("incident category");
  completed.push("incident event report");

  const diagnosisControl = profile.locator('[data-module-row="diagnosis-mix"]').first();
  const diagnosis = await diagnosisControl.getAttribute("data-module-row-label") ?? "";
  const diagnosisResidents = await clickForSurface(page, diagnosisControl);
  await assertScopedContext(diagnosisResidents, {
    "data-platform-focus": "search",
    "data-platform-query": diagnosis
  });
  await diagnosisResidents.locator('[data-resident-search-module="true"]').waitFor({ state: "visible", timeout: 20_000 });
  if (await diagnosisResidents.getByLabel("Search residents").inputValue() !== diagnosis) throw new Error("diagnosis drilldown did not preserve its filter");
  completed.push("diagnosis residents");

  const residentControl = profile.locator('[data-module-row="resident-roster"]').first();
  const residentName = (await residentControl.innerText()).split("\n")[0]?.trim() ?? "";
  const residentId = await residentControl.getAttribute("data-module-row-id");
  if (!residentId) throw new Error("resident roster did not expose a row");
  const residentProfile = await clickForSurface(page, residentControl);
  await assertScopedContext(residentProfile, {
    "data-platform-focus": "search",
    "data-platform-resident-id": residentId
  });
  await residentProfile.locator('[data-module-row="resident-profile-card"]').waitFor({ state: "visible", timeout: 20_000 });
  if (!(await residentProfile.getByText(residentName, { exact: true }).count())) throw new Error("resident drilldown did not open the selected resident");
  completed.push("resident profile");
  return completed;
}

async function openOverview(page) {
  await startCleanChat(page);
  await dispatchSurface(page, "/communities", "Communities");
  const overview = page.locator("[data-chat-module-content-id]").last();
  await overview.locator('[data-community-overview-slider="true"]').waitFor({ state: "visible", timeout: 20_000 });
  const overviewId = await overview.getAttribute("data-chat-module-content-id");
  if (!overviewId) throw new Error("Communities Overview has no stable module id");
  return page.locator(`[data-chat-module-content-id="${overviewId}"]`);
}

async function auditCommunityProfileRows(page, overview, viewportId, results, screenshotDir) {
  await overview.locator('[data-community-overview-tab="Census"]').click();
  await overview.screenshot({ path: path.join(screenshotDir, `${viewportId}-overview-census.png`) });

  for (const facility of ALAMO_FACILITIES) {
    for (const clickMode of [
      { id: "latest-census-row", selector: `[data-slider-card-title*="census by community" i] [data-slider-row-id="${facility.facilityId}"]` },
      { id: "movement-row", selector: `[data-slider-card-title="Community movement"] [data-module-row-id="${facility.facilityId}"]` }
    ]) {
      const name = `${viewportId} / ${facility.communityName} / ${clickMode.id}`;
      try {
        const control = overview.locator(clickMode.selector);
        await control.waitFor({ state: "visible", timeout: 8_000 });
        if (!/View profile/i.test(await control.innerText())) {
          throw new Error("community row does not explain that it opens the profile");
        }
        const moduleRoot = await clickForSurface(page, control);
        await assertSurface(moduleRoot, facility, surfaceModes[0]);
        results.push({ name, kind: "click-through", passed: true });
        console.log(`community click-through passed: ${name}`);
      } catch (error) {
        const screenshotPath = path.join(screenshotDir, `${slug(name)}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
        results.push({ name, kind: "click-through", passed: false, error: error instanceof Error ? error.message : String(error), screenshotPath });
        console.error(`community click-through failed: ${name}`);
      }
    }
  }
}

async function closeDialog(dialog) {
  await dialog.getByRole("button", { name: /Close (?:drilldown|resident profile)/i }).last().click();
  await dialog.waitFor({ state: "detached", timeout: 8_000 });
}

async function auditOverviewDrilldowns(page, overview) {
  const results = [];
  const incidentTab = overview.locator('[data-community-overview-tab="Incidents"]');
  await incidentTab.click();

  const trendButtons = overview.locator('[data-slider-card-title="Incident volume"] [data-mini-trend-label]');
  for (let index = 0; index < await trendButtons.count(); index += 1) {
    const button = trendButtons.nth(index);
    const label = await button.getAttribute("data-mini-trend-label");
    await button.click();
    const dialog = page.getByRole("dialog", { name: new RegExp(`Portfolio Incident Trend.*${String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i") });
    await dialog.waitFor({ state: "visible", timeout: 8_000 });
    results.push(`incident trend: ${label}`);
    if (index === 0) {
      const point = dialog.locator("[data-series-drilldown-point]").first();
      await point.waitFor({ state: "visible", timeout: 8_000 });
      const facilityId = await point.getAttribute("data-series-drilldown-point");
      const moduleCountBefore = await page.locator("[data-chat-module-content-id]").count();
      await point.click();
      await page.waitForFunction(
        (previousCount) => document.querySelectorAll("[data-chat-module-content-id]").length > previousCount,
        moduleCountBefore,
        { timeout: 12_000 }
      );
      const destination = page.locator("[data-chat-module-content-id]").last();
      await assertScopedContext(destination, {
        "data-platform-focus": "incidents",
        "data-platform-facility-id": facilityId ?? ""
      });
      const selectedMonth = await destination
        .locator("[data-platform-module]")
        .first()
        .getAttribute("data-platform-month");
      if (!/^\d{4}-\d{2}$/.test(selectedMonth ?? "")) {
        throw new Error(`portfolio incident month drilldown lost its month: ${selectedMonth ?? "none"}`);
      }
      results.push(`incident trend community: ${facilityId}`);
    } else {
      await closeDialog(dialog);
    }
  }

  const categoryRows = overview.locator('[data-slider-card-title="Top incident categories"] [data-slider-row-id]');
  for (let index = 0; index < await categoryRows.count(); index += 1) {
    const row = categoryRows.nth(index);
    const label = await row.getAttribute("data-slider-row-title");
    await row.click();
    const dialog = page.getByRole("dialog", { name: new RegExp(`${String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} detail`, "i") });
    await dialog.waitFor({ state: "visible", timeout: 8_000 });
    results.push(`incident category: ${label}`);
    await closeDialog(dialog);
  }

  await overview.locator('[data-community-overview-tab="Operations"]').click();
  const complianceRows = overview.locator('[data-slider-card-title="Lowest medication compliance"] [data-module-row="medication-compliance"]');
  for (let index = 0; index < await complianceRows.count(); index += 1) {
    const row = complianceRows.nth(index);
    const label = await row.getAttribute("data-module-row-label");
    await row.click();
    const dialog = page.getByRole("dialog", { name: new RegExp(`${String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} Compliance Detail detail`, "i") });
    await dialog.waitFor({ state: "visible", timeout: 8_000 });
    results.push(`medication compliance: ${label}`);
    await closeDialog(dialog);
  }

  const diagnosisRows = overview.locator('[data-slider-card-title="Diagnosis mix"] [data-module-row="diagnosis-mix"]');
  for (let index = 0; index < await diagnosisRows.count(); index += 1) {
    const row = diagnosisRows.nth(index);
    const label = await row.getAttribute("data-module-row-label");
    await row.click();
    const dialog = page.getByRole("dialog", { name: new RegExp(`${String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} detail`, "i") });
    await dialog.waitFor({ state: "visible", timeout: 8_000 });
    const residentButtons = dialog.locator("button").filter({ hasText: /Resident \d+/i });
    if (index === 0 && await residentButtons.count()) {
      await residentButtons.first().click();
      const residentDialog = page.getByRole("dialog", { name: /resident detail/i });
      await residentDialog.waitFor({ state: "visible", timeout: 8_000 });
      results.push("diagnosis resident profile");
      await closeDialog(residentDialog);
    } else {
      await closeDialog(dialog);
    }
    results.push(`diagnosis: ${label}`);
  }
  return results;
}

async function main() {
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-community-surface-qa");
  const consoleErrors = [];
  const requestFailures = [];
  const results = [];
  let page;

  await withBrowserQa(async (browser) => {
    const context = await browser.newContext({ viewport: { width: routeViewports[0].width, height: routeViewports[0].height } });
    page = await context.newPage();
    attachPageDiagnostics(page, { consoleErrors, requestFailures });
    await openChat(page);

    for (const facility of ALAMO_FACILITIES) {
      for (const mode of surfaceModes) {
        const name = `desktop / ${facility.communityName} / ${mode.id}`;
        try {
          await startCleanChat(page);
          const route = `/communities/${facility.facilityId}${mode.routeSuffix}`;
          const moduleRoot = await dispatchSurface(page, route, name);
          await assertSurface(moduleRoot, facility, mode);
          results.push({ name, kind: "route", passed: true });
          console.log(`community surface passed: ${name}`);
        } catch (error) {
          const screenshotPath = path.join(screenshotDir, `${slug(name)}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
          results.push({ name, kind: "route", passed: false, error: error instanceof Error ? error.message : String(error), screenshotPath });
          console.error(`community surface failed: ${name}`);
        }
      }
    }

    const overview = await openOverview(page);
    await auditCommunityProfileRows(page, overview, "desktop", results, screenshotDir);

    try {
      const profileDrilldowns = await auditCommunityProfileDrilldowns(page, ALAMO_FACILITIES[0]);
      results.push(...profileDrilldowns.map((name) => ({ name, kind: "profile-drilldown", passed: true })));
      console.log(`community profile drilldowns passed: ${profileDrilldowns.length}`);
    } catch (error) {
      const screenshotPath = path.join(screenshotDir, "profile-drilldown-failure.png");
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      results.push({ name: "community profile drilldown matrix", kind: "profile-drilldown", passed: false, error: error instanceof Error ? error.message : String(error), screenshotPath });
    }

    try {
      const drilldownOverview = await openOverview(page);
      const drilldowns = await auditOverviewDrilldowns(page, drilldownOverview);
      results.push(...drilldowns.map((name) => ({ name, kind: "overview-drilldown", passed: true })));
      console.log(`community overview drilldowns passed: ${drilldowns.length}`);
    } catch (error) {
      const screenshotPath = path.join(screenshotDir, "overview-drilldown-failure.png");
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      results.push({ name: "overview drilldown matrix", kind: "overview-drilldown", passed: false, error: error instanceof Error ? error.message : String(error), screenshotPath });
    }

    const canvas = await measureCanvas(page);
    if (canvas.horizontalOverflow > 8) {
      results.push({ name: "workspace horizontal overflow", kind: "layout", passed: false, error: `${canvas.horizontalOverflow}px` });
    }

    const mobileContext = await browser.newContext({ viewport: { width: routeViewports[1].width, height: routeViewports[1].height } });
    const mobilePage = await mobileContext.newPage();
    attachPageDiagnostics(mobilePage, { consoleErrors, requestFailures });
    await openChat(mobilePage);
    for (const facility of ALAMO_FACILITIES) {
      for (const mode of surfaceModes) {
        const name = `mobile / ${facility.communityName} / ${mode.id}`;
        try {
          await startCleanChat(mobilePage);
          const route = `/communities/${facility.facilityId}${mode.routeSuffix}`;
          const moduleRoot = await dispatchSurface(mobilePage, route, name);
          await assertSurface(moduleRoot, facility, mode);
          results.push({ name, kind: "route", passed: true });
          console.log(`community surface passed: ${name}`);
        } catch (error) {
          const screenshotPath = path.join(screenshotDir, `${slug(name)}.png`);
          await mobilePage.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
          results.push({ name, kind: "route", passed: false, error: error instanceof Error ? error.message : String(error), screenshotPath });
          console.error(`community surface failed: ${name}`);
        }
      }
    }
    const mobileOverview = await openOverview(mobilePage);
    await auditCommunityProfileRows(mobilePage, mobileOverview, "mobile", results, screenshotDir);
    await mobileContext.close();

    const fallbackContext = await browser.newContext({ viewport: { width: 1280, height: 840 } });
    const fallbackPage = await fallbackContext.newPage();
    await fallbackPage.route("**/api/communities/snapshot**", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "simulated community snapshot failure" })
      });
    });
    await openChat(fallbackPage);
    try {
      await startCleanChat(fallbackPage);
      const facility = ALAMO_FACILITIES[0];
      for (const mode of surfaceModes.filter((candidate) => candidate.required !== "search")) {
        await startCleanChat(fallbackPage);
        const moduleRoot = await dispatchSurface(
          fallbackPage,
          `/communities/${facility.facilityId}${mode.routeSuffix}`,
          `${mode.id} snapshot fallback`
        );
        await assertSurface(moduleRoot, facility, mode);
        results.push({ name: `${mode.id} snapshot fallback`, kind: "fallback", passed: true });
        console.log(`community surface passed: ${mode.id} snapshot fallback`);
      }
    } catch (error) {
      const screenshotPath = path.join(screenshotDir, "community-snapshot-fallback.png");
      await fallbackPage.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      results.push({
        name: "community snapshot fallback matrix",
        kind: "fallback",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        screenshotPath
      });
    }
    await fallbackContext.close();

    const failed = results.filter((result) => !result.passed);
    const report = {
      generatedAt: new Date().toISOString(),
      passed: failed.length === 0 && consoleErrors.length === 0 && requestFailures.length === 0,
      summary: {
        canonicalCommunities: ALAMO_FACILITIES.length,
        routeViewports: routeViewports.length,
        routePermutations: ALAMO_FACILITIES.length * surfaceModes.length * routeViewports.length,
        clickThroughPermutations: ALAMO_FACILITIES.length * 2 * routeViewports.length,
        checks: results.length,
        passed: results.filter((result) => result.passed).length,
        failed: failed.length,
        consoleErrors: consoleErrors.length,
        requestFailures: requestFailures.length
      },
      consoleErrors,
      requestFailures,
      results
    };
    await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));
    await page.screenshot({ path: path.join(screenshotDir, "final.png"), fullPage: false }).catch(() => {});
    if (!report.passed) {
      console.error(JSON.stringify({ summary: report.summary, failed, consoleErrors, requestFailures }, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(`community surface QA passed: ${report.summary.passed}/${report.summary.checks} checks`);
  }).catch((error) => {
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  });
}

await main();
