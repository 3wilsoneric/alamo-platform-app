#!/usr/bin/env node
import {
  BASE_URL,
  attachPageDiagnostics,
  withBrowserQa
} from "./browser-qa-utils.mjs";

await withBrowserQa(async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  attachPageDiagnostics(page, { consoleErrors, requestFailures });

  await page.goto(`${BASE_URL}/home`, { waitUntil: "networkidle" });
  const admissionsLink = page.locator('[data-california-hero-action="admissions"]');
  await admissionsLink.waitFor({ state: "visible", timeout: 10_000 });
  await admissionsLink.click();
  await page.waitForURL((url) => url.pathname === "/admissions", { timeout: 5_000 });

  await page.getByRole("heading", { name: "Referral packets and assessments." }).waitFor();
  const pipelineLink = page.getByRole("link", { name: "Open Pipeline" });
  const href = await pipelineLink.getAttribute("href");
  if (href !== "https://alamo-pipeline.com") {
    throw new Error(`Admissions handoff used an unexpected URL: ${href ?? "missing"}.`);
  }
  if (consoleErrors.length || requestFailures.length) {
    throw new Error(JSON.stringify({ consoleErrors, requestFailures }));
  }

  await context.close();
});

console.log("browser admissions checks passed");
