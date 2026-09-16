#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const BASE_URL = String(
  process.env.PRODUCTION_RESPONSIVE_BASE_URL ||
    process.env.PRODUCTION_SIGNED_IN_BASE_URL ||
    "https://www.alamoplatform.com"
).replace(/\/+$/, "");
const STORAGE_STATE = path.resolve(
  ROOT,
  process.env.PRODUCTION_RESPONSIVE_STORAGE_STATE ||
    process.env.PRODUCTION_SIGNED_IN_STORAGE_STATE ||
    ".auth/alamo-production-storage-state.json"
);
const SESSION_STORAGE_STATE = path.resolve(
  ROOT,
  process.env.PRODUCTION_RESPONSIVE_SESSION_STORAGE_STATE ||
    process.env.PRODUCTION_SIGNED_IN_SESSION_STORAGE_STATE ||
    STORAGE_STATE.replace(/\.json$/i, ".session-storage.json")
);
const REQUIRED = process.env.PRODUCTION_RESPONSIVE_REQUIRED === "true";
const HEADED = process.env.PRODUCTION_RESPONSIVE_HEADED === "true";
const TIMEOUT_MS = Number(process.env.PRODUCTION_RESPONSIVE_TIMEOUT_MS || 30_000);
const READY_TIMEOUT_MS = Number(process.env.PRODUCTION_RESPONSIVE_READY_TIMEOUT_MS || 15_000);
const OUTPUT_DIR = path.join(ROOT, "generated", "production-responsive-qa");

const VIEWPORTS = [
  { name: "full-hd", width: 1920, height: 1080, priority: "primary" },
  { name: "desktop-window", width: 1440, height: 900, priority: "primary" },
  { name: "exec-laptop", width: 1366, height: 768, priority: "primary" },
  { name: "compact-desktop", width: 1280, height: 720, priority: "primary" },
  { name: "ipad-air-landscape", width: 1180, height: 820, priority: "primary" },
  { name: "ipad-landscape", width: 1024, height: 768, priority: "primary" },
  { name: "ipad-air-portrait", width: 820, height: 1180, priority: "primary" },
  { name: "ipad-portrait", width: 768, height: 1024, priority: "primary" },
  { name: "mobile-safety", width: 390, height: 844, priority: "secondary" }
];

const ROUTES = [
  {
    name: "home",
    pathname: "/home",
    capture: true,
    ready: async (page) => {
      await page.waitForFunction(
        () => document.querySelectorAll("[data-california-community-dot]").length === 5,
        undefined,
        { timeout: READY_TIMEOUT_MS }
      );
    }
  },
  {
    name: "analytics",
    pathname: "/analytics",
    capture: true,
    ready: async (page) => {
      await page.waitForFunction(
        () => {
          const main = document.querySelector('[data-reports-page="true"] main');
          return main?.getAttribute("aria-busy") === "false" &&
            Boolean(document.querySelector("article[data-full-report]"));
        },
        undefined,
        { timeout: READY_TIMEOUT_MS }
      );
    }
  },
  {
    name: "questions",
    pathname: "/analytics/questions",
    capture: true,
    ready: async (page) => {
      await page.locator('[data-certified-question-guide="true"]').waitFor({
        state: "visible",
        timeout: READY_TIMEOUT_MS
      });
    }
  },
  {
    name: "community",
    pathname: "/home/community/337",
    capture: true,
    ready: async (page) => {
      await page.locator('[data-california-community-profile="337"]').waitFor({
        state: "visible",
        timeout: READY_TIMEOUT_MS
      });
      await page.waitForFunction(
        () => {
          const surface = document.querySelector('[data-community-dashboard-surface="detail"]');
          return Boolean(surface) && !/Loading community data/i.test(surface?.textContent || "");
        },
        undefined,
        { timeout: READY_TIMEOUT_MS }
      );
    }
  },
  {
    name: "incidents",
    pathname: "/incidents",
    capture: false,
    ready: async (page) => {
      await page.locator('[data-incident-center="true"]').waitFor({
        state: "visible",
        timeout: READY_TIMEOUT_MS
      });
      await page.waitForFunction(
        () => !/Loading incidents/i.test(document.querySelector('[data-incident-center="true"]')?.textContent || ""),
        undefined,
        { timeout: READY_TIMEOUT_MS }
      );
    }
  },
  {
    name: "residents",
    pathname: "/explorer/residents",
    capture: false,
    ready: async (page) => {
      await page.waitForFunction(
        () => document.querySelector('[data-explorer-kind="residents"]')?.getAttribute("data-explorer-status") === "ready",
        undefined,
        { timeout: READY_TIMEOUT_MS }
      );
    }
  },
  {
    name: "command-center",
    pathname: "/command-center",
    capture: false,
    ready: async (page) => {
      await page.waitForFunction(
        () => document.querySelector('[data-command-center="true"]')?.getAttribute("data-command-center-loading") === "false",
        undefined,
        { timeout: READY_TIMEOUT_MS }
      );
    }
  }
];

function buildUrl(pathname) {
  return `${BASE_URL}${pathname}`;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(filePath) {
  if (!(await fileExists(filePath))) return null;
  return JSON.parse(await readFile(filePath, "utf8"));
}

function sanitizeDiagnostic(value) {
  return String(value)
    .replace(/([?#&](?:code|state|session_state|id_token|access_token|nonce|sid)=)[^&\s'"\]]+/gi, "$1[redacted]")
    .slice(0, 600);
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const root = document.documentElement;
    const body = document.body;
    const isRendered = (element) => {
      if (!(element instanceof Element)) return false;
      if (element.closest("[inert], [aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const hasLocalHorizontalContainment = (element) => {
      let current = element.parentElement;
      while (current && current !== body) {
        const style = getComputedStyle(current);
        if (["auto", "scroll"].includes(style.overflowX) && current.scrollWidth > current.clientWidth) return true;
        current = current.parentElement;
      }
      return false;
    };
    const rectSummary = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        name: (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };

    const interactive = [...document.querySelectorAll("button, a[href], input, select, textarea, [role='button']")]
      .filter((element) => element.namespaceURI === "http://www.w3.org/1999/xhtml");
    const clippedControls = interactive
      .filter(isRendered)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const horizontallyClipped = rect.left < -2 || rect.right > viewport.width + 2;
        const verticallyClipped = rect.top < -2 || rect.bottom > viewport.height + 2;
        return (horizontallyClipped && !hasLocalHorizontalContainment(element)) ||
          (verticallyClipped && ["fixed", "sticky"].includes(getComputedStyle(element).position));
      })
      .map(rectSummary)
      .slice(0, 20);

    const uncontainedTables = [...document.querySelectorAll("table")]
      .filter(isRendered)
      .filter((table) => table.getBoundingClientRect().width > viewport.width + 2 && !hasLocalHorizontalContainment(table))
      .map(rectSummary)
      .slice(0, 10);

    const fixedClipping = [...document.querySelectorAll("*")]
      .filter((element) => isRendered(element) && ["fixed", "sticky"].includes(getComputedStyle(element).position))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const intersectsViewport = rect.right > 0 && rect.left < viewport.width && rect.bottom > 0 && rect.top < viewport.height;
        if (!intersectsViewport || hasLocalHorizontalContainment(element)) return false;
        return rect.left < -2 || rect.right > viewport.width + 2 || rect.top < -2 || rect.bottom > viewport.height + 2;
      })
      .map(rectSummary)
      .slice(0, 10);

    const mapItemsOutsideViewport = [...document.querySelectorAll("[data-california-community-marker]")]
      .filter(isRendered)
      .flatMap((marker) => {
        const facilityId = marker.getAttribute("data-california-community-marker");
        const dot = marker.querySelector("[data-california-community-dot]");
        const label = marker.querySelector("[data-california-community-tooltip]");
        return [dot, label]
          .filter((element) => element instanceof Element && isRendered(element))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left < -2 || rect.right > viewport.width + 2 || rect.top < -2 || rect.bottom > viewport.height + 2;
          })
          .map((element) => ({ facilityId, ...rectSummary(element) }));
      });

    const modal = document.querySelector("[data-california-community-profile]");
    const modalRect = modal && isRendered(modal) ? rectSummary(modal) : null;
    const carousel = document.querySelector('[data-california-workspace-carousel="true"]');
    const activePanelName = carousel?.getAttribute("data-california-active-panel") || null;
    const activePanel = activePanelName
      ? document.querySelector(`[data-california-carousel-panel="${activePanelName}"]`)
      : null;
    const activePanelRect = activePanel && isRendered(activePanel) ? rectSummary(activePanel) : null;

    return {
      pathname: window.location.pathname,
      viewport,
      rootOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
      bodyOverflow: Math.max(0, body.scrollWidth - body.clientWidth),
      clippedControls,
      uncontainedTables,
      fixedClipping,
      mapItemsOutsideViewport,
      modalRect,
      activePanelRect,
      cls: Number(window.__alamoResponsiveCls || 0),
      clsEntries: window.__alamoResponsiveClsEntries || [],
      visibleText: (body.innerText || "").replace(/\s+/g, " ").slice(0, 500)
    };
  });
}

function layoutFailures(layout) {
  const failures = [];
  if (layout.rootOverflow > 4) failures.push(`root horizontal overflow: ${layout.rootOverflow}px`);
  if (layout.bodyOverflow > 4) failures.push(`body horizontal overflow: ${layout.bodyOverflow}px`);
  if (layout.clippedControls.length) failures.push(`${layout.clippedControls.length} visible control(s) clipped`);
  if (layout.uncontainedTables.length) failures.push(`${layout.uncontainedTables.length} wide table(s) lack local containment`);
  if (layout.fixedClipping.length) failures.push(`${layout.fixedClipping.length} fixed/sticky element(s) clipped`);
  if (layout.mapItemsOutsideViewport.length) failures.push(`${layout.mapItemsOutsideViewport.length} visible map item(s) outside viewport`);
  if (layout.modalRect && (
    layout.modalRect.left < -2 ||
    layout.modalRect.right > layout.viewport.width + 2 ||
    layout.modalRect.top < -2 ||
    layout.modalRect.bottom > layout.viewport.height + 2
  )) failures.push("community modal exceeds viewport");
  if (layout.activePanelRect && (
    Math.abs(layout.activePanelRect.left) > 2 ||
    Math.abs(layout.activePanelRect.width - layout.viewport.width) > 2
  )) failures.push("active carousel panel is not viewport-aligned");
  if (layout.cls > 0.1) failures.push(`layout shift exceeds 0.1: ${layout.cls.toFixed(3)}`);
  return failures;
}

async function writeReport(report) {
  await mkdir(path.join(OUTPUT_DIR, "screenshots"), { recursive: true });
  await writeFile(path.join(OUTPUT_DIR, "latest.json"), JSON.stringify(report, null, 2));
}

async function main() {
  if (!(await fileExists(STORAGE_STATE))) {
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      status: "skipped",
      passed: !REQUIRED,
      reason: "No signed-in Playwright storage state is available."
    };
    await writeReport(report);
    console.log(`production responsiveness check skipped: missing ${path.relative(ROOT, STORAGE_STATE)}`);
    if (REQUIRED) process.exitCode = 1;
    return;
  }

  await mkdir(path.join(OUTPUT_DIR, "screenshots"), { recursive: true });
  const sessionStorageState = await readJsonIfExists(SESSION_STORAGE_STATE);
  let browser;

  try {
    browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
      headless: !HEADED
    }).catch(() => chromium.launch({ headless: !HEADED }));

    const results = [];
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        storageState: STORAGE_STATE,
        viewport: { width: viewport.width, height: viewport.height }
      });
      await context.addInitScript(() => {
        window.__alamoResponsiveCls = 0;
        window.__alamoResponsiveClsEntries = [];
        new PerformanceObserver((entries) => {
          for (const entry of entries.getEntries()) {
            if (entry.hadRecentInput) continue;
            window.__alamoResponsiveCls += entry.value;
            window.__alamoResponsiveClsEntries.push({
              value: entry.value,
              sources: (entry.sources || []).map((source) => {
                const node = source.node;
                if (!(node instanceof Element)) return null;
                return {
                  tag: node.tagName.toLowerCase(),
                  id: node.id || null,
                  classes: String(node.className || "").slice(0, 180),
                  text: (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
                  previousRect: source.previousRect,
                  currentRect: source.currentRect
                };
              }).filter(Boolean)
            });
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      if (sessionStorageState?.entries && sessionStorageState?.origin) {
        await context.addInitScript((state) => {
          if (window.location.origin !== state.origin) return;
          for (const [key, value] of Object.entries(state.entries)) {
            if (window.sessionStorage.getItem(key) === null) window.sessionStorage.setItem(key, String(value));
          }
        }, sessionStorageState);
      }

      const page = await context.newPage();
      for (const route of ROUTES) {
        const startedAt = Date.now();
        const consoleErrors = [];
        const httpFailures = [];
        const onConsole = (message) => {
          if (message.type() === "error" && !/Failed to load resource: the server responded with a status of 404/i.test(message.text())) {
            consoleErrors.push(sanitizeDiagnostic(message.text()));
          }
        };
        const onResponse = (response) => {
          try {
            const url = new URL(response.url());
            if (url.origin === new URL(BASE_URL).origin && response.status() >= 400 && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/assets/"))) {
              httpFailures.push(`${response.status()} ${url.pathname}`);
            }
          } catch {
            // Ignore browser-internal URLs.
          }
        };
        page.on("console", onConsole);
        page.on("response", onResponse);

        const failures = [];
        try {
          await page.goto(buildUrl(route.pathname), { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
          await route.ready(page);
          await page.waitForTimeout(250);
        } catch (error) {
          failures.push(`settled state did not render: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
        }

        const layout = await inspectLayout(page).catch(() => null);
        if (!layout) failures.push("layout could not be inspected");
        else failures.push(...layoutFailures(layout));
        if (consoleErrors.length) failures.push(`${consoleErrors.length} console error(s)`);
        if (httpFailures.length) failures.push(`${httpFailures.length} failed API/asset response(s)`);

        let screenshotPath = null;
        if (route.capture) {
          screenshotPath = path.join(OUTPUT_DIR, "screenshots", `${viewport.name}-${route.name}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
        }
        results.push({
          viewport,
          route: route.name,
          pathname: route.pathname,
          elapsedMs: Date.now() - startedAt,
          passed: failures.length === 0,
          failures,
          consoleErrors,
          httpFailures,
          layout,
          screenshotPath
        });
        page.off("console", onConsole);
        page.off("response", onResponse);
      }
      await context.close();
    }

    const failures = results.filter((result) => !result.passed);
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      status: failures.length ? "fail" : "pass",
      passed: failures.length === 0,
      primaryViewportsPassed: results.filter((result) => result.viewport.priority === "primary").every((result) => result.passed),
      matrix: {
        viewports: VIEWPORTS.length,
        routes: ROUTES.length,
        checks: results.length,
        passed: results.length - failures.length,
        failed: failures.length
      },
      results
    };
    await writeReport(report);

    if (failures.length) {
      console.error(JSON.stringify({
        status: report.status,
        matrix: report.matrix,
        failures: failures.map(({ viewport, route, failures: routeFailures }) => ({
          viewport: viewport.name,
          route,
          failures: routeFailures
        }))
      }, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(`production responsiveness passed: ${report.matrix.checks}/${report.matrix.checks} route/viewport checks`);
  } finally {
    await browser?.close().catch(() => {});
  }
}

await main();
