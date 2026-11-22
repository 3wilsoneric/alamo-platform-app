#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createProductionNavigationChecks, sanitizeBrowserDiagnostic } from "./lib/production-navigation-checks.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BASE_URL = String(process.env.PRODUCTION_SIGNED_IN_BASE_URL || process.env.PRODUCTION_SMOKE_BASE_URL || "https://www.alamoplatform.com").replace(/\/+$/, "");
const STORAGE_STATE = path.resolve(
  ROOT,
  process.env.PRODUCTION_SIGNED_IN_STORAGE_STATE || ".auth/alamo-production-storage-state.json"
);
const SESSION_STORAGE_STATE = path.resolve(
  ROOT,
  process.env.PRODUCTION_SIGNED_IN_SESSION_STORAGE_STATE || STORAGE_STATE.replace(/\.json$/i, ".session-storage.json")
);
const REQUIRED = process.env.PRODUCTION_SIGNED_IN_REQUIRED === "true";
const HEADED = process.env.PRODUCTION_SIGNED_IN_HEADED === "true";
const TIMEOUT_MS = Number(process.env.PRODUCTION_SIGNED_IN_TIMEOUT_MS || 30_000);
const HOME_READY_BUDGET_MS = Number(process.env.PRODUCTION_SIGNED_IN_HOME_READY_MS || 5_000);
const ROUTE_READY_TIMEOUT_MS = Number(process.env.PRODUCTION_SIGNED_IN_ROUTE_READY_MS || 8_000);
const DATA_READY_TIMEOUT_MS = Number(process.env.PRODUCTION_SIGNED_IN_DATA_READY_MS || 12_000);
const LEGACY_QUESTIONS_ONLY = process.argv.includes("--legacy-questions");
const OUTPUT_NAME = LEGACY_QUESTIONS_ONLY ? "production-guided-question-qa" : "production-signed-in-smoke";
const { checkProductionRoutes, checkProductionInteractions } = createProductionNavigationChecks({
  baseUrl: BASE_URL, legacyQuestionsOnly: LEGACY_QUESTIONS_ONLY, timeoutMs: TIMEOUT_MS,
  homeReadyMs: HOME_READY_BUDGET_MS, routeReadyMs: ROUTE_READY_TIMEOUT_MS, dataReadyMs: DATA_READY_TIMEOUT_MS
});

function shouldCaptureFailedRequest(requestUrl) {
  try {
    const url = new URL(requestUrl);
    return (
      url.origin === new URL(BASE_URL).origin &&
      (url.pathname.startsWith("/api/") || url.pathname.startsWith("/assets/"))
    ) || url.hostname === "login.microsoftonline.com";
  } catch {
    return false;
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeReport(report) {
  const artifactDir = path.join(ROOT, "generated", OUTPUT_NAME);
  await mkdir(path.join(artifactDir, "screenshots"), { recursive: true });
  await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));
  return artifactDir;
}

async function readJsonIfExists(filePath) {
  if (!(await fileExists(filePath))) return null;
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function main() {
  const { chromium } = await import("playwright");
  if (!(await fileExists(STORAGE_STATE))) {
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      storageStatePath: path.relative(ROOT, STORAGE_STATE),
      status: "skipped",
      passed: !REQUIRED,
      reason: "No Playwright storage-state file exists for a signed-in production session.",
      nextStep: `Create ${path.relative(ROOT, STORAGE_STATE)} from a signed-in browser context, or set PRODUCTION_SIGNED_IN_STORAGE_STATE.`
    };
    await writeReport(report);
    if (REQUIRED) {
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(`production signed-in smoke skipped: missing ${path.relative(ROOT, STORAGE_STATE)}`);
    return;
  }

  const artifactDir = path.join(ROOT, "generated", OUTPUT_NAME);
  const screenshotPath = path.join(artifactDir, "screenshots", "home.png");
  let browser;

  try {
    browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
      headless: !HEADED
    }).catch(() => chromium.launch({ headless: !HEADED }));
    const context = await browser.newContext({
      storageState: STORAGE_STATE,
      viewport: { width: 1440, height: 920 }
    });
    const sessionStorageState = await readJsonIfExists(SESSION_STORAGE_STATE);
    if (sessionStorageState?.entries && sessionStorageState?.origin) {
      await context.addInitScript((state) => {
        if (window.location.origin !== state.origin) return;
        for (const [key, value] of Object.entries(state.entries)) {
          if (window.sessionStorage.getItem(key) === null) {
            window.sessionStorage.setItem(key, String(value));
          }
        }
      }, sessionStorageState);
    }
    const page = await context.newPage();
    const consoleErrors = [];
    const requestFailures = [];
    const httpFailures = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !/Failed to load resource: the server responded with a status of 404/i.test(message.text())) {
        consoleErrors.push(sanitizeBrowserDiagnostic(message.text()).slice(0, 600));
      }
    });
    page.on("requestfailed", (request) => {
      if (!shouldCaptureFailedRequest(request.url())) return;
      if (/net::ERR_ABORTED/i.test(request.failure()?.errorText ?? "")) return;
      requestFailures.push({
        url: sanitizeBrowserDiagnostic(request.url()),
        failure: request.failure()?.errorText ?? "unknown"
      });
    });
    page.on("response", (response) => {
      if (response.status() < 400 || !shouldCaptureFailedRequest(response.url())) return;
      httpFailures.push({
        url: sanitizeBrowserDiagnostic(response.url()),
        status: response.status(),
        statusText: response.statusText()
      });
    });

    await mkdir(path.dirname(screenshotPath), { recursive: true });
    const startedAt = Date.now();
    const routeResults = await checkProductionRoutes(page, artifactDir);
    const interactionResults = await checkProductionInteractions(page);

    const elapsedMs = Date.now() - startedAt;
    const pageState = routeResults[0]?.pageState ?? null;
    const passed =
      routeResults.every((result) => result.passed) &&
      interactionResults.every((result) => result.passed) &&
      consoleErrors.length === 0 &&
      requestFailures.length === 0 &&
      httpFailures.length === 0;
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      storageStatePath: path.relative(ROOT, STORAGE_STATE),
      sessionStorageStatePath: path.relative(ROOT, SESSION_STORAGE_STATE),
      restoredSessionStorage: Boolean(sessionStorageState?.entries),
      budgets: {
        homeReadyMs: HOME_READY_BUDGET_MS,
        routeReadyTimeoutMs: ROUTE_READY_TIMEOUT_MS,
        dataReadyTimeoutMs: DATA_READY_TIMEOUT_MS
      },
      status: passed ? "pass" : "fail",
      passed,
      elapsedMs,
      pageState,
      routeResults,
      interactionResults,
      consoleErrors,
      requestFailures,
      httpFailures,
      screenshotPath
    };

    await writeReport(report);

    if (!passed) {
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log(`production signed-in smoke passed: ${BASE_URL}/home in ${elapsedMs}ms`);
  } catch (error) {
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      storageStatePath: path.relative(ROOT, STORAGE_STATE),
      status: "fail",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      screenshotPath
    };
    await writeReport(report);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
