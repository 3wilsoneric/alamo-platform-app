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

  await page.goto(`${BASE_URL}/home`, { waitUntil: "networkidle" });
  const admissionsLink = page.locator('[data-california-hero-action="admissions"]');
  if (await admissionsLink.count()) {
    throw new Error("Admissions navigation must remain hidden until the overview is finished.");
  }
  await page.goto(`${BASE_URL}/admissions`, { waitUntil: "networkidle" });

  await page.locator('[data-admissions-overview="true"]').waitFor();
  for (const name of ["Board", "Census", "Trends"]) {
    if (await page.getByRole("tab", { name: new RegExp(`^${name}`) }).count() !== 1) {
      throw new Error(`Admissions overview is missing its compact ${name} tab.`);
    }
  }
  const fullPipelineLink = page.locator('[data-open-full-pipeline="true"]');
  if (
    await fullPipelineLink.count() !== 1 ||
    await fullPipelineLink.getAttribute("href") !== "https://alamo-pipeline.com"
  ) {
    throw new Error("Admissions overview does not hand OCR and referral workflow to the full Pipeline app.");
  }
  const fullPipelineContrast = await fullPipelineLink.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return { color: style.color, backgroundColor: style.backgroundColor };
  });
  if (
    fullPipelineContrast.color !== "rgb(255, 255, 255)" ||
    fullPipelineContrast.backgroundColor !== "rgb(17, 17, 17)"
  ) {
    throw new Error(`Full Pipeline action lost its dark-button contrast: ${JSON.stringify(fullPipelineContrast)}`);
  }
  await page.screenshot({
    path: `${screenshotDir}/desktop-admissions-board.png`,
    fullPage: true
  });
  await page.getByRole("tab", { name: /^Census/ }).click();
  await page.getByRole("heading", { name: "Community census" }).waitFor();
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
  await mobilePage.goto(`${BASE_URL}/admissions`, { waitUntil: "networkidle" });
  await mobilePage.locator('[data-admissions-overview="true"]').waitFor();
  await mobilePage.screenshot({
    path: `${screenshotDir}/mobile-admissions-board.png`,
    fullPage: true
  });
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
