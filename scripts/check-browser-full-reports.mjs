#!/usr/bin/env node
import path from "node:path";
import {
  BASE_URL,
  attachPageDiagnostics,
  prepareArtifactDirs,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const reportFamilies = [
  ["overview", "Portfolio overview"],
  ["census", "Census and resident flow"],
  ["incidents", "Incident report"],
  ["medications", "Medication performance report"],
  ["residents", "Resident population"]
];

const reportSectionExpectations = {
  overview: {
    required: ["community-operating-position", "current-resident-context"],
    forbidden: ["census-growth", "incident-direction", "medication-execution", "resident-documentation-watch"]
  },
  census: {
    required: ["census-trend", "selected-community-position", "annual-census-summary"],
    forbidden: ["monthly-census"]
  },
  incidents: {
    required: ["incident-trend", "category-mix", "community-comparison"],
    forbidden: ["community-detail"]
  },
  medications: {
    required: ["compliance-trend", "administration-detail"],
    forbidden: ["compliance-comparison"]
  },
  residents: {
    required: ["diagnosis-mix", "community-profile"],
    forbidden: ["longest-current-stays"]
  }
};

function assert(condition, message) {
  if (!condition) throw new Error(`Full report browser check failed: ${message}`);
}

async function waitForReport(page, reportId) {
  const report = page.locator(`[data-full-report="${reportId}"]`);
  await page.waitForFunction(
    (expectedReportId) =>
      Boolean(document.querySelector(`[data-full-report="${expectedReportId}"]`)) ||
      Array.from(document.querySelectorAll('[role="alert"]')).some((node) =>
        node.textContent?.includes("This report could not be compiled.")
      ),
    reportId,
    { timeout: 45_000 }
  );
  const visibleError = page.locator('[role="alert"]').filter({
    hasText: "This report could not be compiled."
  });
  if (await visibleError.count()) {
    throw new Error(
      `Full report browser check failed: ${reportId} rendered the report failure state: ${(
        await visibleError.first().innerText()
      ).replace(/\s+/g, " ").trim()}`
    );
  }
  await report.waitFor({ state: "visible", timeout: 5_000 });
  await page.getByText("Compiling the governed report.").waitFor({
    state: "hidden",
    timeout: 45_000
  }).catch(() => {});
  assert(
    !(await page.getByText("This report could not be compiled.").count()),
    `${reportId} rendered the report failure state`
  );
  const sections = report.locator("section");
  assert(await sections.count() >= 1, `${reportId} has no report sections`);
  assert(
    !(await report.getByText(
      /\b(?:[A-Z][A-Za-z.'-]*\s+){1,4}(?:MHW|DUMMY|PLACEHOLDER)\b/
    ).count()),
    `${reportId} exposed an operational placeholder profile`
  );
  return report;
}

async function assertReportSemantics(report, reportId) {
  const expectations = reportSectionExpectations[reportId];
  for (const sectionId of expectations.required) {
    assert(
      (await report.locator(`section#${sectionId}`).count()) === 1,
      `${reportId} is missing the required ${sectionId} section`
    );
  }
  for (const sectionId of expectations.forbidden) {
    assert(
      !(await report.locator(`section#${sectionId}`).count()),
      `${reportId} still renders the redundant or inappropriate ${sectionId} section`
    );
  }

  const tableAudit = await report.locator("table").evaluateAll((tables) =>
    tables.map((table) => {
      const headers = Array.from(table.querySelectorAll("thead th"));
      const rows = Array.from(table.querySelectorAll("tbody tr"));
      return {
        headerCount: headers.length,
        rowCellCounts: rows.map((row) => row.querySelectorAll("td").length),
        emptyColumnLabels: headers
          .map((header, columnIndex) => {
            const values = rows.map((row) => row.querySelectorAll("td")[columnIndex]?.textContent?.trim());
            return values.length > 0 && values.every((value) =>
              !value || value === "Not available" || value === "Not reported"
            )
              ? header.textContent?.trim()
              : null;
          })
          .filter(Boolean)
      };
    })
  );
  for (const table of tableAudit) {
    assert(
      table.headerCount > 0 && table.rowCellCounts.every((count) => count === table.headerCount),
      `${reportId} has a table whose headers do not align with its body cells`
    );
    assert(
      table.emptyColumnLabels.length === 0,
      `${reportId} renders all-empty columns: ${table.emptyColumnLabels.join(", ")}`
    );
  }

  if (reportId === "overview") {
    assert(await report.locator("section").count() <= 3, "the overview repeats focused-report detail");
  }
  if (reportId === "incidents") {
    const communityRows = report.locator("#community-comparison tbody tr");
    assert(
      await communityRows.count() <= 5,
      "the incident community comparison exposes unaggregated source rows"
    );
  }
  if (reportId === "residents") {
    const residentHeaders = await report.locator("th").allTextContents();
    assert(
      !residentHeaders.includes("Resident") && !residentHeaders.includes("Unit"),
      "the population report exposes a resident-level worklist"
    );
  }
}

async function assertReportEndReachable(page, report, reportId, screenshotDir, viewportLabel) {
  const evidence = report.locator("details");
  await evidence.scrollIntoViewIfNeeded();
  const evidenceBox = await evidence.boundingBox();
  const viewport = page.viewportSize();
  assert(
    evidenceBox && viewport && evidenceBox.y < viewport.height && evidenceBox.y + evidenceBox.height > 0,
    `${reportId} evidence boundary is not reachable in the ${viewportLabel} reader`
  );
  await page.screenshot({
    path: path.join(screenshotDir, `full-report-${reportId}-${viewportLabel}-bottom.png`),
    fullPage: false
  });
}

async function assertScrollableTableEnds(report, reportId) {
  const results = await report.locator('[role="region"][aria-label="Scrollable report table"]').evaluateAll(
    (regions) => regions.map((region) => {
      const maxScroll = Math.max(0, region.scrollWidth - region.clientWidth);
      region.scrollLeft = region.scrollWidth;
      const regionBox = region.getBoundingClientRect();
      const lastHeaderBox = region.querySelector("thead th:last-child")?.getBoundingClientRect();
      return {
        maxScroll,
        scrollLeft: region.scrollLeft,
        lastHeaderVisible: !lastHeaderBox || (
          lastHeaderBox.left < regionBox.right + 2 &&
          lastHeaderBox.right > regionBox.left - 2
        )
      };
    })
  );
  for (const result of results) {
    if (result.maxScroll <= 2) continue;
    assert(
      result.scrollLeft >= result.maxScroll - 2 && result.lastHeaderVisible,
      `${reportId} cannot reach the rightmost table column on mobile`
    );
  }
}

async function assertDocumentFits(page, label) {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    reports: (() => {
      const node = document.querySelector('[data-reports-page="true"]');
      return node ? node.scrollWidth - node.clientWidth : null;
    })()
  }));
  assert(
    overflow.document <= 2 && (overflow.reports == null || overflow.reports <= 2),
    `${label} overflows horizontally: ${JSON.stringify(overflow)}`
  );
}

async function assertContainedReader(page, label) {
  const composition = await page.evaluate(() => {
    const reports = document.querySelector('[data-reports-page="true"]');
    const aside = document.querySelector('aside[aria-label="Analytics"]');
    const main = reports?.querySelector('main');
    const library = document.querySelector('[data-analytics-report-library="true"]');
    const reader = document.querySelector('[data-full-report]');
    if (!reports || !aside || !main || !library || !reader) return null;
    const reportsBox = reports.getBoundingClientRect();
    const asideBox = aside.getBoundingClientRect();
    const mainBox = main.getBoundingClientRect();
    const libraryBox = library.getBoundingClientRect();
    const readerBox = reader.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      reportsLeft: reportsBox.left,
      reportsRight: reportsBox.right,
      asideRight: asideBox.right,
      asideWidth: asideBox.width,
      mainLeft: mainBox.left,
      mainRight: mainBox.right,
      mainTop: mainBox.top,
      mainWidth: mainBox.width,
      libraryBottom: libraryBox.bottom,
      readerTop: readerBox.top,
      readerLeft: readerBox.left,
      readerRight: readerBox.right,
      readerWidth: readerBox.width
    };
  });
  assert(composition, `${label} did not render a report composition`);
  if (composition.viewportWidth >= 768) {
    assert(
      composition.asideRight <= composition.mainLeft + 2 && composition.asideWidth <= 300,
      `${label} library is not a restrained left rail: ${JSON.stringify(composition)}`
    );
  } else {
    assert(
      composition.mainTop >= composition.libraryBottom - 2,
      `${label} mobile reader overlaps its library: ${JSON.stringify(composition)}`
    );
  }
  assert(
    composition.mainLeft >= composition.reportsLeft - 2 &&
      composition.mainRight <= composition.reportsRight + 2 &&
      composition.readerLeft >= composition.mainLeft - 2 &&
      composition.readerRight <= composition.mainRight + 2 &&
      composition.readerWidth >= composition.mainWidth * 0.96,
    `${label} reader is not contained by its report pane: ${JSON.stringify(composition)}`
  );
}

async function openReports(page) {
  await page.goto(`${BASE_URL}/analytics`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-reports-page="true"]').waitFor({
    state: "visible",
    timeout: 20_000
  });
  await waitForReport(page, "overview");
}

async function runDesktop(browser, screenshotDir) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 940 }
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  attachPageDiagnostics(page, { consoleErrors, requestFailures });

  await openReports(page);
  assert(
    (await page.locator('[data-analytics-report-library="true"] button').count()) === 5 &&
      !(await page.getByRole("button", { name: /^Community performance report/ }).count()) &&
      !(await page.getByRole("button", { name: /^Effectiveness evidence report/ }).count()) &&
      !(await page.getByRole("button", { name: /^50-state targeting atlas/ }).count()),
    "Analytics navigation must contain only the five finished report families"
  );
  await assertDocumentFits(page, "portfolio overview");
  await assertContainedReader(page, "portfolio overview");

  const results = [];
  for (const [reportId, title] of reportFamilies) {
    await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
    const report = await waitForReport(page, reportId);
    const titleText = await report.locator("#full-report-title").innerText();
    assert(titleText.trim().length > 5, `${reportId} has no useful title`);
    assert(
      !(await report.getByRole("button", { name: /Export PDF|Download HTML/i }).count()) &&
        !(await report.locator('[data-report-export-pdf="true"]').count()),
      `${reportId} exposes a retired report export action`
    );
    assert(
      !(await report.getByRole("navigation", { name: "Report contents" }).count()) &&
        !(await report.locator('a[href^="#"]').count()),
      `${reportId} exposes the retired in-report contents links`
    );
    await assertReportSemantics(report, reportId);
    await assertDocumentFits(page, `${reportId} current report`);
    await assertContainedReader(page, `${reportId} current report`);
    await page.screenshot({
      path: path.join(screenshotDir, `full-report-${reportId}-desktop.png`),
      fullPage: true
    });
    await assertReportEndReachable(page, report, reportId, screenshotDir, "desktop");

    if (reportId === "community") {
      const communitySelect = page.getByLabel("Report community");
      assert(Boolean(await communitySelect.inputValue()), "community report did not choose a community");
      await communitySelect.selectOption({ index: 1 });
      await waitForReport(page, reportId);
    } else if (reportId !== "overview") {
      assert(
        await page.getByLabel("Report community").inputValue() === "",
        `${reportId} did not default to portfolio scope`
      );
    }

    if (reportId === "residents") {
      assert(
        !(await page.getByLabel("Report period").count()),
        `${reportId} exposes a misleading historical period selector`
      );
    } else {
      const periodSelect = page.getByLabel("Report period");
      const optionCount = await periodSelect.locator("option").count();
      assert(optionCount >= 2, `${reportId} has no governed period choices`);
      await periodSelect.selectOption({ index: Math.min(2, optionCount - 1) });
      await waitForReport(page, reportId);
    }

    await assertDocumentFits(page, `${reportId} report`);
    await assertContainedReader(page, `${reportId} report`);
    results.push({ reportId, title: titleText });
  }

  await page.goto(`${BASE_URL}/fiftystate`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-fifty-state-page="true"][data-fifty-state-embedded="false"]').waitFor({
    state: "visible",
    timeout: 20_000
  });
  const audienceSort = page.getByLabel("Sort states");
  await audienceSort.selectOption("managed-care");
  assert(
    await audienceSort.inputValue() === "managed-care",
    "the atlas did not retain its managed-care audience ordering"
  );
  const stateIndex = page.locator('aside[aria-labelledby="state-index-heading"]');
  await stateIndex.getByRole("button").first().click();
  const stateDialog = page.getByRole("dialog");
  await stateDialog.waitFor({ state: "visible", timeout: 10_000 });
  assert(
    (await stateDialog.getByText("What the buyer will need", { exact: true }).count()) === 1 &&
      (await stateDialog.getByText("Research note", { exact: true }).count()) === 1,
    "the state profile did not expose its bounded effectiveness case"
  );
  const firstStateTitle = await stateDialog.locator("h2").innerText();
  await stateDialog.getByRole("button", { name: "Next state" }).click();
  assert(
    (await stateDialog.locator("h2").innerText()) !== firstStateTitle,
    "the state profile next action did not navigate"
  );
  await stateDialog.getByRole("button", { name: /^Close .* profile$/ }).click();
  await stateDialog.waitFor({ state: "hidden", timeout: 10_000 });

  const atlasSearch = page.getByPlaceholder("Search a state, buyer, region, or leader");
  await atlasSearch.fill("California");
  await stateIndex.getByRole("button", { name: /California/ }).click();
  await stateDialog.waitFor({ state: "visible", timeout: 10_000 });
  assert(
    (await stateDialog.getAttribute("data-state-research-coverage")) === "verified-demand",
    "California did not open its verified demand dossier"
  );
  for (const heading of [
    "Why it matters",
    "Buyer targets",
    "How to enter",
    "What the buyer will need",
    "Sources",
    "Research note"
  ]) {
    assert(
      (await stateDialog.getByRole("heading", { name: heading, exact: true }).count()) === 1,
      `California dossier is missing ${heading}`
    );
  }
  assert(
    (await stateDialog.locator('a[target="_blank"]').count()) >= 3,
    "California dossier does not expose its research sources"
  );
  await page.screenshot({
    path: path.join(screenshotDir, "fifty-state-california-dossier.png"),
    fullPage: false
  });
  await stateDialog.getByRole("button", { name: /^Close .* profile$/ }).click();
  await stateDialog.waitFor({ state: "hidden", timeout: 10_000 });

  await page.getByRole("button", { name: "All 50", exact: true }).click();
  await atlasSearch.fill("Colorado");
  await stateIndex.getByRole("button", { name: /Colorado/ }).click();
  await stateDialog.waitFor({ state: "visible", timeout: 10_000 });
  const baselineHeader = await stateDialog.locator("header").innerText();
  assert(
    (await stateDialog.getAttribute("data-state-research-coverage")) === "national-baseline" &&
      baselineHeader.includes("National baseline"),
    "Colorado did not expose the honest baseline-only research boundary"
  );
  await page.screenshot({
    path: path.join(screenshotDir, "fifty-state-colorado-baseline.png"),
    fullPage: false
  });
  await stateDialog.getByRole("button", { name: /^Close .* profile$/ }).click();
  await stateDialog.waitFor({ state: "hidden", timeout: 10_000 });
  await atlasSearch.fill("");
  await page.screenshot({
    path: path.join(screenshotDir, "fifty-state-audience-prioritization.png"),
    fullPage: true
  });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === "/analytics", {
    timeout: 10_000
  });
  await waitForReport(page, "overview");

  await page.screenshot({
    path: path.join(screenshotDir, "full-reports-desktop.png"),
    fullPage: true
  });
  assert(consoleErrors.length === 0, `desktop console errors: ${consoleErrors.join(" | ")}`);
  assert(requestFailures.length === 0, `desktop API failures: ${JSON.stringify(requestFailures)}`);
  await context.close();
  return results;
}

async function runMobile(browser, screenshotDir) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  attachPageDiagnostics(page, { consoleErrors, requestFailures });

  await openReports(page);
  await assertDocumentFits(page, "mobile portfolio overview");
  await assertContainedReader(page, "mobile portfolio overview");
  await page.screenshot({
    path: path.join(screenshotDir, "full-reports-mobile-overview.png"),
    fullPage: true
  });
  for (const [reportId, title] of reportFamilies) {
    await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
    const report = await waitForReport(page, reportId);
    await assertReportSemantics(report, reportId);
    await assertDocumentFits(page, `mobile ${reportId} report`);
    await assertContainedReader(page, `mobile ${reportId} report`);
    await page.screenshot({
      path: path.join(screenshotDir, `full-report-${reportId}-mobile.png`),
      fullPage: true
    });
    await assertScrollableTableEnds(report, reportId);
    await assertReportEndReachable(page, report, reportId, screenshotDir, "mobile");
  }
  await page.getByRole("button", { name: /^Medication performance report/ }).click();
  await waitForReport(page, "medications");
  await page.getByLabel("Report community").selectOption({ index: 1 });
  await waitForReport(page, "medications");
  await assertDocumentFits(page, "mobile community-scoped medication report");
  await assertContainedReader(page, "mobile community-scoped medication report");
  await page.screenshot({
    path: path.join(screenshotDir, "full-reports-mobile.png"),
    fullPage: true
  });

  await page.goto(`${BASE_URL}/fiftystate`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-fifty-state-page="true"]').waitFor({
    state: "visible",
    timeout: 20_000
  });
  const atlasSearch = page.getByPlaceholder("Search a state, buyer, region, or leader");
  await atlasSearch.fill("California");
  await page
    .locator('aside[aria-labelledby="state-index-heading"]')
    .getByRole("button", { name: /California/ })
    .click();
  const stateDialog = page.getByRole("dialog");
  await stateDialog.waitFor({ state: "visible", timeout: 10_000 });
  assert(
    (await stateDialog.getAttribute("data-state-research-coverage")) === "verified-demand",
    "mobile California dossier did not expose verified demand research"
  );
  await assertDocumentFits(page, "mobile California dossier");
  await page.screenshot({
    path: path.join(screenshotDir, "fifty-state-california-dossier-mobile.png"),
    fullPage: false
  });

  assert(consoleErrors.length === 0, `mobile console errors: ${consoleErrors.join(" | ")}`);
  assert(requestFailures.length === 0, `mobile API failures: ${JSON.stringify(requestFailures)}`);
  await context.close();
}

async function runPortraitDesktop(browser, screenshotDir) {
  const context = await browser.newContext({
    viewport: { width: 1160, height: 1356 }
  });
  const page = await context.newPage();
  await openReports(page);
  await assertDocumentFits(page, "portrait desktop portfolio overview");
  await assertContainedReader(page, "portrait desktop portfolio overview");
  await page.getByRole("button", { name: /^Incident report/ }).click();
  await waitForReport(page, "incidents");
  await page.getByLabel("Report community").selectOption({ index: 1 });
  await waitForReport(page, "incidents");
  await assertDocumentFits(page, "portrait desktop community-scoped incident report");
  await assertContainedReader(page, "portrait desktop community-scoped incident report");
  await page.screenshot({
    path: path.join(screenshotDir, "full-reports-portrait-desktop.png"),
    fullPage: false
  });
  await context.close();
}

const { screenshotDir } = await prepareArtifactDirs("browser-full-reports");

await withBrowserQa(async (browser) => {
  const reports = await runDesktop(browser, screenshotDir);
  await runPortraitDesktop(browser, screenshotDir);
  await runMobile(browser, screenshotDir);
  console.log(JSON.stringify({
    ok: true,
    reports,
    screenshots: screenshotDir
  }, null, 2));
});
