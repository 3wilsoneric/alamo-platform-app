#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  BASE_URL,
  attachPageDiagnostics,
  prepareArtifactDirs,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const { screenshotDir } = await prepareArtifactDirs("browser-acquisition-intelligence-qa");

await withBrowserQa(async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  attachPageDiagnostics(page, { consoleErrors, requestFailures });
  page.on("response", (response) => {
    if (response.status() < 500) return;
    requestFailures.push({ url: response.url(), failure: `HTTP ${response.status()}` });
  });

  await page.goto(`${BASE_URL}/outreach`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-fifty-state-page="true"]').waitFor();
  await page.getByRole("heading", { name: "Market map" }).waitFor();

  const acquisitionTab = page.getByRole("button", { name: "Acquisition intelligence" });
  await acquisitionTab.waitFor();
  await acquisitionTab.click();
  const operatorScreen = page.locator('[data-acquisition-operator-screen="true"]');
  await operatorScreen.waitFor();
  await page.getByRole("heading", { name: "Private operator screen" }).waitFor();
  await page.getByRole("heading", { name: "Choose companies" }).waitFor();
  await page.getByText("1,067 matches · page 1 of 22", { exact: true }).waitFor();
  await page.getByText(/^Showing 50 of 1,067/).waitFor();
  await page.getByText("8,516", { exact: true }).first().waitFor();
  await page.getByText("Mature-scale pool", { exact: true }).first().waitFor();
  await page.locator('[data-acquisition-shortlist-composition="true"]').waitFor();
  await page.getByText(/Current view composition · 1,067 proposals/).waitFor();
  await page.getByText(/86 peer ranges · 981 not estimable/).waitFor();
  const capacityLanes = page.locator('[data-acquisition-capacity-lanes="true"]');
  await capacityLanes.waitFor();
  await capacityLanes.getByText("3", { exact: true }).waitFor();
  await capacityLanes.getByText("11", { exact: true }).waitFor();
  await capacityLanes.getByText("30", { exact: true }).waitFor();
  await capacityLanes.getByText("121", { exact: true }).waitFor();
  await capacityLanes.getByText("599", { exact: true }).waitFor();
  await capacityLanes.getByText("981", { exact: true }).waitFor();
  const matureServiceLanes = page.locator('[data-acquisition-mature-service-lanes="true"]');
  await matureServiceLanes.waitFor();
  await matureServiceLanes.getByText("39", { exact: true }).waitFor();
  await matureServiceLanes.getByText("21", { exact: true }).waitFor();
  await matureServiceLanes.getByText("239", { exact: true }).waitFor();
  await matureServiceLanes.getByText("768", { exact: true }).waitFor();
  if (await page.locator('[data-acquisition-mature-readiness-lanes="true"]').isVisible()) {
    throw new Error("Parent and ownership diligence lenses must stay collapsed during broad company screening.");
  }
  if (await page.locator('[data-acquisition-selection-controls="true"]').count()) {
    throw new Error("Detailed company evidence must not open until the owner intentionally selects a row.");
  }
  await page.locator('[data-acquisition-deferred-readiness="true"] summary').click();
  const matureReadinessLanes = page.locator('[data-acquisition-mature-readiness-lanes="true"]');
  await matureReadinessLanes.waitFor();
  await matureReadinessLanes.getByText("60", { exact: true }).waitFor();
  await matureReadinessLanes.getByText("30", { exact: true }).first().waitFor();
  await matureReadinessLanes.getByText("18", { exact: true }).waitFor();
  await matureReadinessLanes.getByRole("button", { name: /Parent to resolve/ }).click();
  await page.getByText("30 matches · page 1 of 1", { exact: true }).waitFor();
  if (await page.getByLabel("Company bucket").inputValue() !== "mature_target_signal" ||
      await page.getByLabel("Parent confidence").inputValue() !== "not_high" ||
      await page.getByLabel("Maturity signal", { exact: true }).inputValue() !== "mature_scale_signal") {
    throw new Error("The parent-cleanup lane must show only mature target-service proposals without high parent proof.");
  }
  await matureServiceLanes.getByRole("button", { name: /Likely adult MH/ }).click();
  await page.getByText("39 matches · page 1 of 1", { exact: true }).waitFor();
  if (await page.getByLabel("Company bucket").inputValue() !== "mature_target_signal" ||
      await page.getByLabel("Acquisition fit").inputValue() !== "core_signal" ||
      await page.getByLabel("Maturity signal", { exact: true }).inputValue() !== "mature_scale_signal") {
    throw new Error("The likely-adult-MH lane must open the mature core-signal company view.");
  }
  await matureServiceLanes.getByRole("button", { name: /All mature/ }).click();
  await page.getByText("1,067 matches · page 1 of 22", { exact: true }).waitFor();
  const bulkPageSelection = page.locator('[data-acquisition-bulk-selection="true"]');
  await bulkPageSelection.waitFor();
  const bulkPageSelectionLabel = await bulkPageSelection.innerText();
  const bulkPageSelectionCount = Number(bulkPageSelectionLabel.split("·").at(-1)?.trim());
  if (!bulkPageSelectionLabel.startsWith("Add unreviewed page ·") ||
      !Number.isInteger(bulkPageSelectionCount) || bulkPageSelectionCount < 1 || bulkPageSelectionCount > 50 ||
      await bulkPageSelection.isDisabled()) {
    throw new Error("The owner must be able to add the current eligible unreviewed page without starting research.");
  }
  const review100 = page.getByRole("button", { name: "Review 100" });
  await review100.waitFor();
  await page.getByRole("button", { name: "Review 500" }).waitFor();
  await page.getByRole("button", { name: "Review mature" }).waitFor();
  const freezeCohort = page.getByRole("button", { name: "Freeze cohort" });
  await freezeCohort.waitFor();
  if (!(await freezeCohort.isDisabled())) {
    throw new Error("Research cohort freezing must remain disabled until the owner selects 50 through 100 companies.");
  }
  if (await page.locator('[data-acquisition-quick-decision="true"]').count() < 2) {
    throw new Error("Company rows must expose quick Research, Hold, and Pass controls on both responsive table variants.");
  }

  await page.getByLabel("Research funnel").selectOption("validated_targets");
  await page.getByLabel("Maturity signal", { exact: true }).selectOption("all");
  await page.getByText("2 matches · page 1 of 1", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Kelly-Norton Programs", exact: true }).waitFor();
  await page.getByRole("button", { name: "Southern Live Oak Wellness", exact: true }).waitFor();
  await page.locator("tbody").getByText("V#1", { exact: true }).waitFor();
  await page.locator("tbody").getByText("V#2", { exact: true }).waitFor();

  await review100.click();
  await page.getByText("100 matches · page 1 of 2", { exact: true }).waitFor();
  await page.getByText(/68 platform · 32 regional/).waitFor();
  if (await page.getByLabel("Research funnel").inputValue() !== "research_100_queue" ||
      await page.getByLabel("Owner decision").inputValue() !== "undecided" ||
      await page.getByLabel("Maturity signal", { exact: true }).inputValue() !== "all" ||
      await page.getByLabel("Sort companies").inputValue() !== "rank") {
    throw new Error("Review 100 must open the unreviewed suggested shortlist in funnel-rank order.");
  }
  const exportButton = page.locator('[data-acquisition-company-export="true"]');
  await exportButton.waitFor();
  if (await exportButton.innerText() !== "Export 100 companies" || await exportButton.isDisabled()) {
    throw new Error("The suggested 100 must be exportable as the exact filtered company view.");
  }
  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const companyExport = await downloadPromise;
  const exportFailure = await companyExport.failure();
  const exportPath = exportFailure ? null : await companyExport.path();
  const exportContent = exportPath ? await readFile(exportPath, "utf8") : "";
  if (exportFailure || !/^alamo-acquisition-research_100_queue-\d{4}-\d{2}-\d{2}\.csv$/.test(companyExport.suggestedFilename())) {
    throw new Error(`The owner company export failed or used an unsafe filename: ${exportFailure ?? companyExport.suggestedFilename()}`);
  }
  if (!exportContent.includes('"Company"') ||
      !exportContent.includes('"Maturity scale signal"') ||
      !exportContent.includes('"Screening bed band"') ||
      !exportContent.includes('"Screening beds base"') ||
      !exportContent.includes('"Known-slice EV base ($M)"') ||
      exportContent.split("\r\n").filter(Boolean).length !== 101) {
    throw new Error("The suggested-100 CSV must contain one header and exactly 100 evidence-safe company rows.");
  }

  await page.getByRole("button", { name: "Review 500" }).click();
  await page.getByText("500 matches · page 1 of 10", { exact: true }).waitFor();
  await page.getByText(/223 platform · 277 regional/).waitFor();
  await page.getByText(/0 established · 0 smaller\/open/).waitFor();
  if (await page.getByLabel("Research funnel").inputValue() !== "screen_500" ||
      await page.getByLabel("Owner decision").inputValue() !== "undecided" ||
      await page.getByLabel("Sort companies").inputValue() !== "rank") {
    throw new Error("Review 500 must open the mature-only screening set without starting research.");
  }
  await capacityLanes.getByText("1 lower bound · 16 upper range", { exact: true }).waitFor();
  await capacityLanes.getByRole("button", { name: /Base proxy ≥300/ }).click();
  await page.getByText("3 matches · page 1 of 1", { exact: true }).waitFor();
  await page.getByText(/3 peer ranges · 0 not estimable/).waitFor();
  await page.getByLabel("Observable location range").selectOption("twenty_five_plus_locations");
  await page.getByText("1 matches · page 1 of 1", { exact: true }).waitFor();
  await page.getByLabel("Sort companies").selectOption("screening_capacity");
  if (await page.getByLabel("Screening bed proxy").inputValue() !== "300_plus" ||
      await page.getByLabel("Observable location range").inputValue() !== "twenty_five_plus_locations") {
    throw new Error("The owner screen must combine screening-bed and observable-location range buckets.");
  }

  if (await page.locator('[data-national-facility-discovery="true"]').count()) {
    throw new Error("The national facility discovery workflow must remain hidden from the operator screen.");
  }
  if (await page.locator('[data-acquisition-research-workflow="true"]').count()) {
    throw new Error("The detailed facility research workflow must remain hidden from the operator screen.");
  }

  await page.getByLabel("Research funnel").selectOption("all");
  await page.getByLabel("Company bucket").selectOption("all");
  await page.getByLabel("Maturity signal", { exact: true }).selectOption("all");
  await page.getByLabel("Screening bed proxy").selectOption("all");
  await page.getByLabel("Observable location range").selectOption("all");
  await page.getByPlaceholder("Parent, sponsor, legal entity, license, city").fill("Constellation Behavioral Health");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText("1 matches · page 1 of 1", { exact: true }).waitFor();
  await page.locator("tbody").getByRole("button", { name: "Constellation Behavioral Health", exact: true }).click();
  await page.getByRole("heading", { name: "Constellation Behavioral Health" }).waitFor();
  await page.locator('[data-acquisition-fast-screen="true"]').waitFor();
  await page.getByText("Why shortlisted", { exact: true }).waitFor();
  await page.getByText("Needs proof before deep research", { exact: true }).waitFor();
  await page.getByText("1 evidenced · 0 unresolved", { exact: true }).waitFor();
  await page.getByText("1 verified · 0 pending · 0 excluded", { exact: true }).waitFor();
  await page.getByText("NMS Capital", { exact: true }).waitFor();
  await page.getByText("Not a whole-company valuation", { exact: true }).waitFor();
  await page.getByText("Screening capacity proxy", { exact: true }).waitFor();
  await page.getByText(/not a verified or whole-company bed count/).waitFor();
  const reportedBeds = page.getByText("Operator-reported beds", { exact: true }).locator("xpath=following-sibling::dd");
  if (await reportedBeds.innerText() !== "12") {
    throw new Error("Constellation must preserve the 12-slot operator-reported Nashville capacity separately from licensed beds.");
  }
  const currentCoreLicenses = page.getByText("Current core licenses", { exact: true }).locator("xpath=following-sibling::dd");
  if (await currentCoreLicenses.innerText() !== "—") {
    throw new Error("Tennessee's capacity-unpublished license rows must not become a verified licensed-bed total.");
  }
  await page.getByRole("link", { name: /BrightQuest Nashville.*805 Horner Avenue.*current registry listing/ }).waitFor();
  await page.getByRole("link", { name: /BrightQuest Nashville Residential Mental Health Program/ }).first().waitFor();
  await page.getByRole("button", { name: "Close detail" }).click();
  if (await page.locator('[data-acquisition-selection-controls="true"]').count()) {
    throw new Error("Company evidence detail must close without changing the screening decision.");
  }

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  if (horizontalOverflow > 2) {
    throw new Error(`Acquisition workspace has ${horizontalOverflow}px of horizontal overflow.`);
  }
  if (consoleErrors.length || requestFailures.length) {
    throw new Error(JSON.stringify({ consoleErrors, requestFailures }));
  }

  await page.screenshot({
    path: `${screenshotDir}/desktop-acquisition-intelligence.png`,
    fullPage: true
  });
  await context.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${BASE_URL}/outreach`, { waitUntil: "domcontentloaded" });
  await mobilePage.getByRole("button", { name: "Acquisition intelligence" }).click();
  await mobilePage.locator('[data-acquisition-operator-screen="true"]').waitFor();
  await mobilePage.getByRole("heading", { name: "Private operator screen" }).waitFor();
  await mobilePage.getByText(/^Showing 50 of 1,067/).waitFor();
  await mobilePage.locator('[data-acquisition-mature-service-lanes="true"]').waitFor();
  await mobilePage.locator('[data-acquisition-bulk-selection="true"]').waitFor();
  if (await mobilePage.locator('[data-national-facility-discovery="true"]').count()) {
    throw new Error("The national facility discovery workflow must remain hidden on mobile.");
  }
  const mobileOverflow = await mobilePage.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  if (mobileOverflow > 2) {
    throw new Error(`Acquisition workspace has ${mobileOverflow}px of horizontal overflow on mobile.`);
  }
  await mobilePage.screenshot({
    path: `${screenshotDir}/mobile-acquisition-intelligence.png`,
    fullPage: true
  });
  await mobileContext.close();
});

console.log("browser acquisition intelligence checks passed");
