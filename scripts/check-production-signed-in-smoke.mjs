#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
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
const ROUTE_PROBES = [
  {
    name: "Authenticated entrypoint",
    pathname: "/",
    expect: /Ask a question/i,
    readySelector: "[data-california-community-marker]"
  },
  {
    name: "Home workspace",
    pathname: "/home",
    expect: /Ask a question/i,
    readySelector: "[data-california-community-marker]"
  },
  {
    name: "Resident explorer",
    pathname: "/explorer/residents",
    expect: /Resident Search|filtered of|Search resident/i,
    requiresLoadedRecords: true
  },
  {
    name: "Incident explorer",
    pathname: "/explorer/incidents",
    expect: /Incident Search|filtered of|Search resident, category/i,
    requiresLoadedRecords: true
  },
  {
    name: "Command center",
    pathname: "/command-center",
    expect: /Command Center|Databricks Warehouse|Analyst QA|Prompt workbench/i,
    requiresSnapshotHealth: true
  }
];

function buildUrl(pathname) {
  return `${BASE_URL}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function sanitizeBrowserDiagnostic(value) {
  return String(value)
    .replace(
      /([?#&](?:code|client_info|state|session_state|id_token|access_token|client-request-id|nonce|sid|x-anchormailbox|code_challenge)=)[^&\s'"\]]+/gi,
      "$1[redacted]"
    )
    .replace(/https:\/\/[^\s'"\]]+\/login#[^\s'"\]]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}#[redacted]`;
      } catch {
        return "[redacted login callback]";
      }
    });
}

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
  const artifactDir = path.join(ROOT, "generated", "production-signed-in-smoke");
  await mkdir(path.join(artifactDir, "screenshots"), { recursive: true });
  await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));
  return artifactDir;
}

async function readJsonIfExists(filePath) {
  if (!(await fileExists(filePath))) return null;
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readPageState(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || "";
    const documentElement = document.documentElement;
    const hasAuthenticatedShell = Boolean(document.querySelector("[aria-label^='Signed in as ']"));
    const hasWorkspaceContent =
      Boolean(document.querySelector("[data-california-community-marker]")) ||
      /Communities|Incidents|Resident Search|Ask a question|Ask the platform/i.test(text);
    return {
      url: window.location.href,
      title: document.title,
      textSample: text.slice(0, 1600),
      hasComposer: Boolean(document.querySelector("textarea[placeholder*='Ask']")),
      hasWorkspaceTile: hasWorkspaceContent,
      hasAuthenticatedShell,
      shellOnly: hasAuthenticatedShell && !hasWorkspaceContent,
      isMicrosoftLogin: /login\.microsoftonline\.com/i.test(window.location.href) || /Sign in|Pick an account/i.test(text),
      communityMarkerCount: document.querySelectorAll("[data-california-community-marker]").length,
      loadingGovernedRecords: /Loading governed records/i.test(text),
      loadedRecordCount: Number(
        text.match(/[\d,]+\s+filtered of\s+([\d,]+)\s+loaded records/i)?.[1]?.replace(/,/g, "") ?? 0
      ),
      explorerStatus: document.querySelector("[data-explorer-status]")?.getAttribute("data-explorer-status") ?? null,
      commandCenterLoading:
        document.querySelector("[data-command-center]")?.getAttribute("data-command-center-loading") === "true",
      snapshotUnavailable: /SNAPSHOT FRESHNESS\s+Unavailable|No snapshot timestamp is available/i.test(text),
      horizontalOverflow: documentElement.scrollWidth - documentElement.clientWidth
    };
  });
}

async function waitForExpectedContent(page, routeProbe) {
  if (routeProbe.readySelector) {
    await page.locator(routeProbe.readySelector).first().waitFor({
      state: "visible",
      timeout: ROUTE_READY_TIMEOUT_MS
    }).catch(() => {});
  }
  if (routeProbe.requiresLoadedRecords) {
    await page.waitForFunction(
      () => {
        const text = document.body.innerText || "";
        const loaded = Number(
          text.match(/[\d,]+\s+filtered of\s+([\d,]+)\s+loaded records/i)?.[1]?.replace(/,/g, "") ?? 0
        );
        return !/Loading governed records/i.test(text) && loaded > 0;
      },
      undefined,
      { timeout: DATA_READY_TIMEOUT_MS }
    ).catch(() => {});
  }
  if (routeProbe.requiresSnapshotHealth) {
    await page.waitForFunction(
      () => document.querySelector("[data-command-center]")?.getAttribute("data-command-center-loading") === "false",
      undefined,
      { timeout: DATA_READY_TIMEOUT_MS }
    ).catch(() => {});
  }
  await page.waitForFunction(
    ({ source, flags }) => {
      const text = document.body.innerText || "";
      return new RegExp(source, flags).test(text) || /login\.microsoftonline\.com/i.test(window.location.href);
    },
    {
      source: routeProbe.expect.source,
      flags: routeProbe.expect.flags
    },
    { timeout: ROUTE_READY_TIMEOUT_MS }
  ).catch(() => {});
}

async function waitForCarouselPanel(page, panelName) {
  await page.waitForFunction(
    (name) => {
      const carousel = document.querySelector(
        '[data-california-workspace-carousel="true"]'
      );
      const panel = document.querySelector(
        `[data-california-carousel-panel="${name}"]`
      );
      if (!carousel || !panel) return false;
      return (
        carousel.getAttribute("data-california-active-panel") === name &&
        panel.getAttribute("aria-hidden") === "false" &&
        Math.abs(
          panel.getBoundingClientRect().left -
            carousel.getBoundingClientRect().left
        ) <= 2
      );
    },
    panelName,
    { timeout: ROUTE_READY_TIMEOUT_MS }
  );
}

async function main() {
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

  const artifactDir = path.join(ROOT, "generated", "production-signed-in-smoke");
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
    const routeResults = [];

    for (const [index, routeProbe] of ROUTE_PROBES.entries()) {
      const routeStartedAt = Date.now();
      await page.goto(buildUrl(routeProbe.pathname), { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await waitForExpectedContent(page, routeProbe);
      const pageState = await readPageState(page);
      const matchedExpected = routeProbe.expect.test(pageState.textSample);
      const elapsedMs = Date.now() - routeStartedAt;
      const routeFailures = [];
      if (pageState.isMicrosoftLogin) routeFailures.push("landed on Microsoft login");
      if (!matchedExpected) routeFailures.push("expected route content did not render");
      if (routeProbe.readySelector && pageState.communityMarkerCount < 5) {
        routeFailures.push(`expected five community markers; rendered ${pageState.communityMarkerCount}`);
      }
      if (routeProbe.requiresLoadedRecords && pageState.loadingGovernedRecords) {
        routeFailures.push("governed records were still loading");
      }
      if (routeProbe.requiresLoadedRecords && pageState.loadedRecordCount < 1) {
        routeFailures.push("governed explorer returned zero loaded records");
      }
      if (routeProbe.requiresLoadedRecords && pageState.explorerStatus !== "ready") {
        routeFailures.push(`governed explorer settled as ${pageState.explorerStatus ?? "unknown"}`);
      }
      if (routeProbe.requiresSnapshotHealth && pageState.commandCenterLoading) {
        routeFailures.push("snapshot health was still loading");
      }
      if (routeProbe.requiresSnapshotHealth && pageState.snapshotUnavailable) {
        routeFailures.push("published snapshot health was unavailable");
      }
      if ((routeProbe.pathname === "/" || routeProbe.pathname === "/home") && elapsedMs > HOME_READY_BUDGET_MS) {
        routeFailures.push(`home useful-ready exceeded budget: ${elapsedMs}ms > ${HOME_READY_BUDGET_MS}ms`);
      }
      if (pageState.horizontalOverflow > 8) routeFailures.push(`horizontal overflow: ${pageState.horizontalOverflow}px`);

      const routeScreenshotPath = path.join(
        artifactDir,
        "screenshots",
        `${String(index + 1).padStart(2, "0")}-${routeProbe.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`
      );
      await page.screenshot({ path: routeScreenshotPath, fullPage: false }).catch(() => {});
      routeResults.push({
        name: routeProbe.name,
        pathname: routeProbe.pathname,
        passed: routeFailures.length === 0,
        failures: routeFailures,
        elapsedMs,
        pageState,
        screenshotPath: routeScreenshotPath
      });
    }

    const interactionResults = [];
    const communityIds = ["337", "342", "343", "344", "345"];

    for (const facilityId of communityIds) {
      const failures = [];
      await page.goto(buildUrl("/home"), {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUT_MS
      });
      const marker = page.locator(
        `[data-california-community-marker="${facilityId}"]`
      );
      await marker.waitFor({ state: "visible", timeout: ROUTE_READY_TIMEOUT_MS }).catch(() => {
        failures.push("community marker did not render");
      });

      if (failures.length === 0) {
        await marker.click({ timeout: ROUTE_READY_TIMEOUT_MS }).catch(() => {
          failures.push("community marker click failed");
        });
      }

      if (failures.length === 0) {
        await page.waitForURL(
          (url) => url.pathname === `/home/community/${facilityId}`,
          { timeout: ROUTE_READY_TIMEOUT_MS }
        ).catch(() => {
          failures.push("community click did not update the route");
        });
        await page
          .locator(`[data-california-community-profile="${facilityId}"]`)
          .waitFor({ state: "visible", timeout: ROUTE_READY_TIMEOUT_MS })
          .catch(() => {
            failures.push("community profile did not render after navigation");
          });
      }

      if (failures.length === 0) {
        await page
          .getByRole("button", { name: /Close .* profile/i })
          .click({ timeout: ROUTE_READY_TIMEOUT_MS })
          .catch(() => {
            failures.push("community profile close failed");
          });
        await page.waitForURL(
          (url) => url.pathname === "/home",
          { timeout: ROUTE_READY_TIMEOUT_MS }
        ).catch(() => {
          failures.push("closing the community profile did not return home");
        });
      }

      interactionResults.push({
        name: `Community ${facilityId} marker and profile`,
        passed: failures.length === 0,
        failures
      });
    }

    const questionsFailures = [];
    await page.goto(buildUrl("/home"), {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_MS
    });
    await page
      .locator('[data-california-workspace-carousel="true"]')
      .evaluate((carousel) => {
        carousel.setAttribute("data-production-instance-proof", "preserved");
      });
    await page
      .getByRole("button", { name: "Ask a question", exact: true })
      .click({ timeout: ROUTE_READY_TIMEOUT_MS })
      .catch(() => {
        questionsFailures.push("Ask a question click failed");
      });
    await page
      .locator('[data-certified-question-guide="true"]')
      .waitFor({ state: "visible", timeout: ROUTE_READY_TIMEOUT_MS })
      .catch(() => {
        questionsFailures.push("Question guide did not open beneath the California map");
      });
    await waitForCarouselPanel(page, "questions").catch(() => {
      questionsFailures.push("Question workspace did not slide into the viewport");
    });
    const questionsLocation = new URL(page.url());
    if (questionsLocation.pathname !== "/questions") {
      questionsFailures.push(`Ask a question did not open the question workspace route: ${questionsLocation.pathname}${questionsLocation.hash}`);
    }
    if (
      (await page
        .locator('[data-california-workspace-carousel="true"]')
        .getAttribute("data-production-instance-proof")) !== "preserved"
    ) {
      questionsFailures.push("Question navigation remounted the carousel");
    }
    interactionResults.push({
      name: "Ask a question navigation",
      passed: questionsFailures.length === 0,
      failures: questionsFailures
    });

    const analyticsFailures = [];
    await page
      .getByRole("button", { name: "Analytics", exact: true })
      .click({ timeout: ROUTE_READY_TIMEOUT_MS })
      .catch(() => {
        analyticsFailures.push("Analytics click failed");
      });
    await page.waitForURL(
      (url) => url.pathname === "/analytics",
      { timeout: ROUTE_READY_TIMEOUT_MS }
    ).catch(() => {
      analyticsFailures.push("Analytics click did not update the route");
    });
    await waitForCarouselPanel(page, "reports").catch(() => {
      analyticsFailures.push("Analytics workspace did not slide into the viewport");
    });
    await page
      .locator('[data-reports-page="true"][data-reports-embedded="true"]')
      .waitFor({ state: "visible", timeout: ROUTE_READY_TIMEOUT_MS })
      .catch(() => {
        analyticsFailures.push("Analytics workspace did not render");
      });
    if (
      (await page
        .locator('[data-california-workspace-carousel="true"]')
        .getAttribute("data-production-instance-proof")) !== "preserved"
    ) {
      analyticsFailures.push("Analytics navigation remounted the carousel");
    }
    interactionResults.push({
      name: "Analytics carousel navigation",
      passed: analyticsFailures.length === 0,
      failures: analyticsFailures
    });

    const logoFailures = [];
    await page
      .getByRole("link", { name: "Return to the California overview" })
      .click({ timeout: ROUTE_READY_TIMEOUT_MS })
      .catch(() => {
        logoFailures.push("home wordmark click failed");
      });
    await page.waitForURL(
      (url) => url.pathname === "/home",
      { timeout: ROUTE_READY_TIMEOUT_MS }
    ).catch(() => {
      logoFailures.push("home wordmark did not update the route");
    });
    await waitForCarouselPanel(page, "map").catch(() => {
      logoFailures.push("home wordmark did not slide the map into the viewport");
    });
    await page
      .locator("[data-california-community-marker]")
      .first()
      .waitFor({ state: "visible", timeout: ROUTE_READY_TIMEOUT_MS })
      .catch(() => {
        logoFailures.push("home screen did not render after wordmark navigation");
      });
    interactionResults.push({
      name: "Home wordmark navigation",
      passed: logoFailures.length === 0,
      failures: logoFailures
    });

    const commandCenterFailures = [];
    await page.goto(buildUrl("/command-center"), {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_MS
    });
    await page
      .getByRole("link", { name: "Workspace" })
      .click({ timeout: ROUTE_READY_TIMEOUT_MS })
      .catch(() => {
        commandCenterFailures.push("Command Center Workspace click failed");
      });
    await page.waitForURL(
      (url) => url.pathname === "/home",
      { timeout: ROUTE_READY_TIMEOUT_MS }
    ).catch(() => {
      commandCenterFailures.push("Command Center Workspace did not update the route");
    });
    await page
      .locator("[data-california-community-marker]")
      .first()
      .waitFor({ state: "visible", timeout: ROUTE_READY_TIMEOUT_MS })
      .catch(() => {
        commandCenterFailures.push("home screen did not render from Command Center");
      });
    interactionResults.push({
      name: "Command Center Workspace navigation",
      passed: commandCenterFailures.length === 0,
      failures: commandCenterFailures
    });

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

await main();
