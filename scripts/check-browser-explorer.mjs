#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  attachPageDiagnostics,
  BASE_URL,
  clearClientState,
  prepareArtifactDirs,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const TIMEOUT_MS = Number(process.env.BROWSER_EXPLORER_TIMEOUT_MS || 30_000);

const explorerCases = [
  {
    name: "Resident search full-screen explorer",
    path: "/explorer/residents?q=Shannon%20Romero",
    expect: [/Resident Search|resident/i, /Shannon Romero/i, /Santa Clarita/i],
    minRows: 1,
    expand: true,
    download: "CSV"
  },
  {
    name: "Incident search full-screen explorer",
    path: "/explorer/incidents?period=2026-05&category=AWOL%2FElopement",
    expect: [/Incident Search|incident/i, /AWOL\/Elopement/i, /May 2026|2026-05/i],
    minRows: 10,
    expand: true,
    download: "CSV"
  },
  {
    name: "Census search full-screen explorer",
    path: "/explorer/census?community=337",
    expect: [/Census Search|census/i, /A & A Health Services San Pablo/i, /Monthly census|Trend preview/i],
    minRows: 6,
    expand: false,
    download: "Excel"
  }
];

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function serializePattern(pattern) {
  return pattern instanceof RegExp
    ? { source: pattern.source, flags: pattern.flags }
    : { source: String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags: "i" };
}

async function waitForExplorerReady(page) {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText || "";
      return /filtered of|Showing \d+/i.test(text) && !/Loading governed (rows|records)|Data explorer failed/i.test(text);
    },
    undefined,
    { timeout: TIMEOUT_MS }
  );
}

async function readExplorerState(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || "";
    const rows = Array.from(document.querySelectorAll("tbody tr"));
    const dataRows = rows.filter((row) => !/Description|Resident #|Incident ID/i.test(row.textContent || ""));
    const buttons = Array.from(document.querySelectorAll("button")).map((button) => ({
      text: String(button.textContent || "").trim(),
      disabled: Boolean(button.disabled),
      ariaLabel: button.getAttribute("aria-label")
    }));
    const documentElement = document.documentElement;
    const darkBlocks = Array.from(document.querySelectorAll("section *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const match = style.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
        if (!match || rect.width * rect.height < 20_000) return null;
        const r = Number(match[1]);
        const g = Number(match[2]);
        const b = Number(match[3]);
        const a = match[4] == null ? 1 : Number(match[4]);
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (a < 0.75 || luminance > 72) return null;
        return {
          backgroundColor: style.backgroundColor,
          className: String(element.getAttribute("class") || "").slice(0, 160),
          text: String(element.textContent || "").trim().slice(0, 160)
        };
      })
      .filter(Boolean);

    return {
      url: window.location.href,
      title: document.title,
      textSample: text.slice(0, 2600),
      rowCount: dataRows.length,
      buttonCount: buttons.length,
      buttons,
      hasSearchInput: Boolean(document.querySelector("input[aria-label='Search records']")),
      hasCommunityFilter: Boolean(document.querySelector("select[aria-label='Filter by community']")),
      horizontalOverflow: documentElement.scrollWidth - documentElement.clientWidth,
      darkBlocks
    };
  });
}

async function clickFirstDataRow(page) {
  const row = page.locator("tbody tr").first();
  await row.click({ timeout: 5_000 });
  await delay(150);
}

async function runDownloadCheck(page, label) {
  const button = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).first();
  await button.waitFor({ state: "visible", timeout: 5_000 });
  const disabled = await button.isDisabled();
  if (disabled) {
    return {
      passed: false,
      label,
      failure: `${label} button is disabled`
    };
  }

  const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
  await button.click();
  const download = await downloadPromise;
  const failure = await download.failure();
  return {
    passed: !failure,
    label,
    suggestedFilename: download.suggestedFilename(),
    failure
  };
}

async function runExplorerCase(page, testCase, index, screenshotDir) {
  await page.goto(`${BASE_URL}${testCase.path}`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
  await waitForExplorerReady(page);
  await delay(150);

  if (testCase.expand) {
    await clickFirstDataRow(page);
  }
  await delay(150);

  const found = [];
  const missing = [];
  const text = await page.evaluate(() => document.body.innerText || "");
  for (const pattern of testCase.expect) {
    const serialized = serializePattern(pattern);
    if (new RegExp(serialized.source, serialized.flags).test(text)) {
      found.push(String(pattern));
    } else {
      missing.push(String(pattern));
    }
  }

  const download = await runDownloadCheck(page, testCase.download);
  const state = await readExplorerState(page);
  const screenshotPath = path.join(screenshotDir, `${String(index + 1).padStart(2, "0")}-${slug(testCase.name)}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const failures = [];
  if (missing.length) failures.push(`missing expected text: ${missing.join(", ")}`);
  if (state.rowCount < testCase.minRows) failures.push(`expected at least ${testCase.minRows} table rows, saw ${state.rowCount}`);
  if (!state.hasSearchInput) failures.push("search input missing");
  if (!state.hasCommunityFilter) failures.push("community filter missing");
  if (state.horizontalOverflow > 8) failures.push(`horizontal overflow: ${state.horizontalOverflow}px`);
  if (state.darkBlocks.length) failures.push(`large dark block appeared: ${state.darkBlocks[0].backgroundColor}`);
  if (!download.passed) failures.push(`download failed: ${download.failure ?? "unknown"}`);

  return {
    name: testCase.name,
    path: testCase.path,
    passed: failures.length === 0,
    failures,
    expected: { found, missing },
    state,
    download,
    screenshotPath
  };
}

async function main() {
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-explorer-qa");
  const consoleErrors = [];
  const requestFailures = [];
  let page;

  await withBrowserQa(async (browser) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 920 },
      acceptDownloads: true
    });
    page = await context.newPage();
    attachPageDiagnostics(page, { consoleErrors, requestFailures });
    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    await clearClientState(page);

    const results = [];
    for (const [index, testCase] of explorerCases.entries()) {
      console.log(`explorer QA ${index + 1}/${explorerCases.length}: ${testCase.name}`);
      const result = await runExplorerCase(page, testCase, index, screenshotDir);
      console.log(`explorer QA ${result.passed ? "passed" : "failed"}: ${testCase.name}`);
      results.push(result);
    }

    const passed = results.every((result) => result.passed) && consoleErrors.length === 0 && requestFailures.length === 0;
    const report = {
      generatedAt: new Date().toISOString(),
      passed,
      summary: {
        cases: results.length,
        passedCases: results.filter((result) => result.passed).length,
        consoleErrors: consoleErrors.length,
        requestFailures: requestFailures.length
      },
      consoleErrors,
      requestFailures,
      results
    };

    await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));

    if (!passed) {
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log(`browser explorer QA passed: ${report.summary.passedCases}/${report.summary.cases} cases`);
  }).catch(async (error) => {
    if (page) {
      await page.screenshot({ path: path.join(screenshotDir, "failure.png"), fullPage: true }).catch(() => {});
    }
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  });
}

await main();
