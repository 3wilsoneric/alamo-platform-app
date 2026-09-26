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

  await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
  const homeBackground = await page.locator('[data-california-workspace-carousel="true"]').evaluate(
    (element) => window.getComputedStyle(element).backgroundColor
  );
  const admissionsLink = page.locator('[data-california-hero-action="admissions"]');
  if (await admissionsLink.count()) {
    throw new Error("Admissions navigation must remain hidden until the overview is finished.");
  }
  await page.goto(`${BASE_URL}/admissions`, { waitUntil: "domcontentloaded" });

  await page.locator('[data-admissions-overview="true"]').waitFor();
  const admissionsBackground = await page.locator('[data-admissions-overview="true"]').evaluate(
    (element) => window.getComputedStyle(element).backgroundColor
  );
  if (admissionsBackground !== homeBackground) {
    throw new Error(`Admissions canvas ${admissionsBackground} does not match Home ${homeBackground}.`);
  }
  for (const name of ["Board", "Census", "Trends"]) {
    if (await page.getByRole("tab", { name: new RegExp(`^${name}`) }).count() !== 1) {
      throw new Error(`Admissions overview is missing its compact ${name} tab.`);
    }
  }
  const clientNames = page.locator('[data-admissions-client-name="true"]');
  await clientNames.first().waitFor({ state: "visible", timeout: 60_000 });
  if (await clientNames.count() < 1 || !(await clientNames.first().innerText()).trim()) {
    throw new Error("Admissions board cards must show the client name.");
  }
  const executiveUpdate = page.locator('[data-admissions-executive-update="true"]');
  await executiveUpdate.waitFor({ state: "visible" });
  const executiveText = (await executiveUpdate.innerText()).trim();
  if (
    !/active referrals?/.test(executiveText) ||
    !executiveText.includes("at decision") ||
    !executiveText.includes("Activity is concentrated at") ||
    !executiveText.includes("immediate follow-up")
  ) {
    throw new Error(`Admissions executive update is incomplete: ${executiveText}`);
  }
  const surfaceTabs = page.locator('[data-admissions-surface-tabs="true"]');
  const tabTreatment = await surfaceTabs.getByRole("tab", { name: /^Board/ }).evaluate((element) => {
    const tab = window.getComputedStyle(element);
    const list = window.getComputedStyle(element.parentElement);
    return { borderBottomColor: tab.borderBottomColor, borderRadius: tab.borderRadius, listBackground: list.backgroundColor };
  });
  if (tabTreatment.borderBottomColor !== "rgb(15, 139, 115)" || tabTreatment.borderRadius !== "0px" || tabTreatment.listBackground !== "rgba(0, 0, 0, 0)") {
    throw new Error(`Admissions tabs lost their quiet analyst treatment: ${JSON.stringify(tabTreatment)}`);
  }
  if (await page.locator('[data-open-full-pipeline="true"], a[href*="alamo-pipeline.com"]').count()) {
    throw new Error("Admissions overview must remain a self-contained analyst update without Pipeline links.");
  }
  await page.screenshot({
    path: `${screenshotDir}/desktop-admissions-board.png`,
    fullPage: true
  });
  await page.locator('[data-admissions-board-card]').first().click();
  const progressModal = page.locator('[data-admissions-progress-modal="true"]');
  await progressModal.waitFor({ state: "visible" });
  if (await progressModal.locator('[data-admissions-progress-step]').count() !== 3) {
    throw new Error("Client progress review must show the three referral stages.");
  }
  await page.screenshot({
    path: `${screenshotDir}/desktop-admissions-progress.png`,
    fullPage: false
  });
  await page.keyboard.press("Escape");
  await progressModal.waitFor({ state: "hidden" });
  await page.getByRole("tab", { name: /^Census/ }).click();
  await page.getByRole("heading", { name: "Community census" }).waitFor();
  if (await executiveUpdate.count()) {
    throw new Error("Admissions executive referral update must stay with the Board view.");
  }
  await page.screenshot({
    path: `${screenshotDir}/desktop-admissions-census.png`,
    fullPage: true
  });
  if (consoleErrors.length || requestFailures.length) {
    throw new Error(JSON.stringify({ consoleErrors, requestFailures }));
  }

  await context.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${BASE_URL}/admissions`, { waitUntil: "domcontentloaded" });
  await mobilePage.locator('[data-admissions-overview="true"]').waitFor();
  await mobilePage.locator('[data-admissions-executive-update="true"]').waitFor({ state: "visible", timeout: 60_000 });
  await mobilePage.screenshot({
    path: `${screenshotDir}/mobile-admissions-board.png`,
    fullPage: true
  });
  await mobilePage.locator('[data-admissions-board-card]').first().click();
  const mobileProgress = mobilePage.locator('[data-admissions-progress-modal="true"]');
  await mobileProgress.waitFor({ state: "visible" });
  const modalOverflow = await mobileProgress.evaluate(
    (element) => element.scrollWidth - element.clientWidth
  );
  if (modalOverflow > 2) {
    throw new Error(`Admissions progress modal has ${modalOverflow}px of horizontal overflow on mobile.`);
  }
  const mobileDialog = mobileProgress.getByRole("dialog");
  const dialogBox = await mobileDialog.boundingBox();
  if (!dialogBox || dialogBox.y < 0 || dialogBox.y + dialogBox.height > 846) {
    throw new Error(`Admissions progress modal is not anchored to the mobile viewport: ${JSON.stringify(dialogBox)}`);
  }
  const doneColor = await mobileProgress.getByRole("button", { name: "Done" }).evaluate(
    (element) => window.getComputedStyle(element).color
  );
  if (doneColor !== "rgb(255, 255, 255)") {
    throw new Error(`Admissions progress modal action lost its white label: ${doneColor}`);
  }
  await mobilePage.screenshot({
    path: `${screenshotDir}/mobile-admissions-progress.png`,
    fullPage: false
  });
  await mobileProgress.getByRole("button", { name: "Done" }).click();
  await mobilePage.getByRole("tab", { name: /^Census/ }).click();
  if (await mobilePage.locator('[data-admissions-community-census-card]').count() !== 5) {
    throw new Error("Admissions overview does not render all five mobile community census cards.");
  }
  const mobileOverflow = await mobilePage.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  if (mobileOverflow > 2) {
    throw new Error(`Admissions overview has ${mobileOverflow}px of horizontal overflow on mobile.`);
  }
  await mobilePage.screenshot({
    path: `${screenshotDir}/mobile-admissions-overview.png`,
    fullPage: true
  });
  await mobileContext.close();
});

console.log("browser admissions checks passed");
