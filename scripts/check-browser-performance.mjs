#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import {
  attachPageDiagnostics,
  ask,
  BASE_URL,
  measureCanvas,
  prepareArtifactDirs,
  startCleanChat,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const HOME_READY_MS = Number(process.env.BROWSER_PERF_HOME_READY_MS || 2_000);
const CHAT_READY_MS = Number(process.env.BROWSER_PERF_CHAT_READY_MS || 2_500);
const SURFACE_READY_MS = Number(process.env.BROWSER_PERF_SURFACE_READY_MS || 5_000);
const HEAVY_ROUTE_READY_MS = Number(process.env.BROWSER_PERF_HEAVY_ROUTE_READY_MS || 5_000);

function apiPathFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return url;
  }
}

async function waitForLatestRenderableReady(page, label, timeoutMs = SURFACE_READY_MS) {
  try {
    await page.waitForFunction(
      () => {
        const renderables = Array.from(
          document.querySelectorAll("[data-chat-module-content-id], [data-chat-visual-module-id]")
        );
        const root = renderables.at(-1);
        if (!root) return false;
        const text = root.textContent || "";
        return !/Loading [\s\S]*?(data|snapshot|directory|incidents)|Loading\.\.\./i.test(text);
      },
      undefined,
      { timeout: timeoutMs }
    );
  } catch (error) {
    const state = await page.evaluate(() => {
      const renderables = Array.from(document.querySelectorAll(
        "[data-chat-module-content-id], [data-chat-visual-module-id]"
      ));
      const root = renderables.at(-1);
      return {
        path: location.pathname,
        renderableCount: renderables.length,
        hasLoadingText: Boolean(root && /Loading [\s\S]*?(data|snapshot|directory|incidents)|Loading\.\.\./i.test(root.textContent || ""))
      };
    }).catch(() => null);
    throw new Error(`${label} renderable readiness timed out: ${JSON.stringify(state)}`, { cause: error });
  }
}

async function waitForText(page, pattern, timeoutMs = HEAVY_ROUTE_READY_MS) {
  try {
    await page.waitForFunction(
      ({ source, flags }) => new RegExp(source, flags).test(document.body.innerText || ""),
      { source: pattern.source, flags: pattern.flags },
      { timeout: timeoutMs }
    );
  } catch (error) {
    throw new Error(`Route text readiness timed out at ${new URL(page.url()).pathname}: ${pattern}`, { cause: error });
  }
}

async function measureRouteReady(page, pathname, pattern) {
  const startedAt = performance.now();
  await page.goto(`${BASE_URL}${pathname}`, { waitUntil: "domcontentloaded" });
  await waitForText(page, pattern);
  return Math.round(performance.now() - startedAt);
}

async function openAnalyticsQuestionGuide(page, timeoutMs) {
  await page.locator('[data-platform-page-target="analytics"]').click({ timeout: timeoutMs });
  const analyticsSections = page.locator('[data-analytics-section-navigation][data-analytics-section-current="reports"]');
  await analyticsSections.waitFor({ state: "visible", timeout: timeoutMs });
  await analyticsSections.locator('[data-analytics-section-target="questions"]').click({ timeout: timeoutMs });
  await page.locator('[data-california-carousel-panel="questions"][aria-hidden="false"]')
    .waitFor({ state: "visible", timeout: timeoutMs });
  await page.locator('[data-certified-question-guide="true"]').first().waitFor({
    state: "visible",
    timeout: timeoutMs
  });
}

async function measureResidentSearchSurfaceReady(page) {
  const startedAt = performance.now();
  await page.goto(`${BASE_URL}/analytics/questions`, { waitUntil: "domcontentloaded" });
  await startCleanChat(page);
  await ask(page, "Can you show me the Resident Search module?");
  await waitForLatestRenderableReady(page, "Resident Search");
  await waitForText(page, /Resident Search|Search residents|Resident profile/i, SURFACE_READY_MS);
  return Math.round(performance.now() - startedAt);
}

async function main() {
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-performance-qa");
  const consoleErrors = [];
  const requestFailures = [];
  const apiStarts = new Map();
  const apiRequests = [];
  let requestPhase = "setup";
  let page;

  await withBrowserQa(async (browser) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 920 }
    });
    page = await context.newPage();
    attachPageDiagnostics(page, { consoleErrors, requestFailures });

    page.on("request", (request) => {
      if (apiPathFromUrl(request.url()).startsWith("/api/")) {
        apiStarts.set(request, {
          startedAt: performance.now(),
          phase: requestPhase
        });
      }
    });

    page.on("response", (response) => {
      const request = response.request();
      const pathName = apiPathFromUrl(request.url());
      if (!pathName.startsWith("/api/")) return;
      const requestStart = apiStarts.get(request);
      apiStarts.delete(request);
      apiRequests.push({
        path: pathName,
        status: response.status(),
        durationMs: requestStart ? Math.round(performance.now() - requestStart.startedAt) : null,
        phase: requestStart?.phase ?? "unknown"
      });
    });

    requestPhase = "home";
    const homeStart = performance.now();
    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-platform-page-target="analytics"]').waitFor({
      state: "visible",
      timeout: HOME_READY_MS
    });
    const homeReadyMs = Math.round(performance.now() - homeStart);

    requestPhase = "analytics";
    const chatStart = performance.now();
    await openAnalyticsQuestionGuide(page, CHAT_READY_MS);
    const chatReadyMs = Math.round(performance.now() - chatStart);

    await startCleanChat(page);
    const surfaceStart = performance.now();
    await ask(page, "Can you compare communities?");
    await waitForLatestRenderableReady(page, "community comparison");
    await delay(150);
    const surfaceReadyMs = Math.round(performance.now() - surfaceStart);

    const canvas = await measureCanvas(page);
    const bodyText = await page.evaluate(() => document.body.innerText);
    const screenshotPath = path.join(screenshotDir, "performance-check.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const incidentRouteReadyMs = await measureRouteReady(page, "/incidents", /Incident Center|Received today|Latest received/i);
    const residentSearchSurfaceReadyMs = await measureResidentSearchSurfaceReady(page);

    const bootstrapRequests = apiRequests.filter((entry) => entry.path === "/api/platform/bootstrap");
    const hiddenReportRequests = apiRequests.filter((entry) =>
      entry.phase === "home" && entry.path.startsWith("/api/reports/full/")
    );
    const slowApiRequests = apiRequests.filter((entry) => Number(entry.durationMs) > 4_000);
    const failures = [];

    if (homeReadyMs > HOME_READY_MS) failures.push(`home ready took ${homeReadyMs}ms`);
    if (chatReadyMs > CHAT_READY_MS) failures.push(`chat ready took ${chatReadyMs}ms`);
    if (surfaceReadyMs > SURFACE_READY_MS) failures.push(`community comparison took ${surfaceReadyMs}ms`);
    if (incidentRouteReadyMs > HEAVY_ROUTE_READY_MS) failures.push(`incident route took ${incidentRouteReadyMs}ms`);
    if (residentSearchSurfaceReadyMs > SURFACE_READY_MS) failures.push(`resident search surface took ${residentSearchSurfaceReadyMs}ms`);
    if (bootstrapRequests.length) failures.push("initial experience called heavyweight /api/platform/bootstrap");
    if (hiddenReportRequests.length) failures.push("inactive Analytics loaded reports during the initial experience");
    if (slowApiRequests.length) {
      failures.push(`slow api request: ${slowApiRequests[0].path} ${slowApiRequests[0].durationMs}ms`);
    }
    if (!/Community Compare|A & A Health Services San Pablo|Santa Clarita/i.test(bodyText)) {
      failures.push("community comparison did not render expected content");
    }
    if (!canvas.latestModuleVisible) failures.push("community comparison was not visible after render");
    if (canvas.horizontalOverflow > 8) failures.push(`horizontal overflow: ${canvas.horizontalOverflow}px`);
    if (consoleErrors.length) failures.push(`console errors: ${consoleErrors.length}`);
    if (requestFailures.length) failures.push(`api request failures: ${requestFailures.length}`);

    const report = {
      generatedAt: new Date().toISOString(),
      passed: failures.length === 0,
      thresholds: {
        homeReadyMs: HOME_READY_MS,
        chatReadyMs: CHAT_READY_MS,
        surfaceReadyMs: SURFACE_READY_MS,
        heavyRouteReadyMs: HEAVY_ROUTE_READY_MS
      },
      timings: {
        homeReadyMs,
        chatReadyMs,
        surfaceReadyMs,
        incidentRouteReadyMs,
        residentSearchSurfaceReadyMs
      },
      apiRequests,
      canvas,
      consoleErrors,
      requestFailures,
      failures,
      screenshotPath
    };

    await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));

    if (!report.passed) {
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log(
      `browser performance QA passed: home ${homeReadyMs}ms, chat ${chatReadyMs}ms, community comparison ${surfaceReadyMs}ms, incidents ${incidentRouteReadyMs}ms, resident search ${residentSearchSurfaceReadyMs}ms`
    );
  }).catch(async (error) => {
    if (page) {
      await page.screenshot({ path: path.join(screenshotDir, "failure.png"), fullPage: true }).catch(() => {});
    }
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  });
}

await main();
