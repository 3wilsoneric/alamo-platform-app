#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BASE_URL,
  TIMEOUT_MS,
  attachPageDiagnostics,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const OUTPUT_DIR = path.join(process.cwd(), "generated", "browser-platform-mobile-qa");
const VIEWPORTS = [
  { name: "compact-phone", width: 320, height: 568 },
  { name: "standard-phone", width: 390, height: 844 },
  { name: "large-phone", width: 430, height: 932 },
  { name: "phone-landscape", width: 844, height: 390 }
];
const ROUTES = [
  { name: "home", pathname: "/home", ready: "[data-california-workspace-carousel='true']" },
  { name: "community-profile", pathname: "/home/community/337", ready: "[data-california-community-profile='337']" },
  { name: "analytics", pathname: "/analytics", ready: "[data-reports-page='true']" },
  { name: "questions", pathname: "/analytics/questions", ready: "[data-certified-question-guide='true']" },
  { name: "admissions", pathname: "/admissions", ready: "[data-admissions-overview='true']" },
  { name: "workforce", pathname: "/workforce", ready: "[data-workforce-overview='true']" },
  { name: "outreach", pathname: "/outreach", ready: "[data-fifty-state-page='true']" },
  { name: "licensing", pathname: "/analytics/licensing", ready: "[data-licensing-page='true']" },
  { name: "chat", pathname: "/chat", ready: "[data-owner-chat-route='true']" },
  { name: "incidents", pathname: "/incidents", ready: "[data-incident-center='true']" },
  { name: "communities", pathname: "/communities", ready: "main" },
  { name: "community-dashboard", pathname: "/communities/337", ready: "main" },
  { name: "glossary", pathname: "/glossary", ready: "main" },
  { name: "explorer-incidents", pathname: "/explorer/incidents", ready: "[data-explorer-kind='incidents']" },
  { name: "explorer-census", pathname: "/explorer/census", ready: "[data-explorer-kind='census']" },
  { name: "explorer-residents", pathname: "/explorer/residents", ready: "[data-explorer-kind='residents']" },
  { name: "command-center", pathname: "/command-center", ready: "[data-command-center='true']" },
  { name: "data-architecture", pathname: "/data-architecture", ready: "[data-data-architecture='true']" }
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function inspectMobileLayout(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = window.innerWidth;
    const visible = (element) => {
      if (!(element instanceof Element) || element.closest("[hidden],[inert],[aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && bounds.width > 0 && bounds.height > 0;
    };
    const locallyScrollable = (element) => {
      let current = element.parentElement;
      while (current && current !== body) {
        const style = getComputedStyle(current);
        if (["auto", "scroll"].includes(style.overflowX) && current.scrollWidth > current.clientWidth + 2) return true;
        current = current.parentElement;
      }
      return false;
    };
    const describe = (element) => {
      const bounds = element.getBoundingClientRect();
      return {
        element: element.tagName.toLowerCase(),
        label: String(element.getAttribute("aria-label") || element.textContent || element.getAttribute("placeholder") || "")
          .trim().replace(/\s+/g, " ").slice(0, 90),
        left: Math.round(bounds.left),
        right: Math.round(bounds.right),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height)
      };
    };
    const controls = [...document.querySelectorAll("button,a[href],input,select,textarea,[role='button'],[role='tab']")]
      .filter(visible);
    const clippedControls = controls
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return (bounds.left < -2 || bounds.right > viewportWidth + 2) && !locallyScrollable(element);
      })
      .map(describe)
      .slice(0, 12);
    const zoomRiskInputs = [...document.querySelectorAll("input,select,textarea")]
      .filter(visible)
      .filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 16)
      .map(describe)
      .slice(0, 12);
    const offscreenDialogs = [...document.querySelectorAll("dialog,[role='dialog'],[aria-modal='true']")]
      .filter(visible)
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left < -2 || bounds.right > viewportWidth + 2;
      })
      .map(describe)
      .slice(0, 12);
    const clippedFixedContent = [...document.querySelectorAll("*")]
      .filter(visible)
      .filter((element) => ["fixed", "sticky"].includes(getComputedStyle(element).position))
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return (bounds.left < -2 || bounds.right > viewportWidth + 2) && !locallyScrollable(element);
      })
      .map(describe)
      .slice(0, 12);

    return {
      pathname: location.pathname,
      rootOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
      bodyOverflow: Math.max(0, body.scrollWidth - body.clientWidth),
      clippedControls,
      zoomRiskInputs,
      offscreenDialogs,
      clippedFixedContent
    };
  });
}

async function routeContracts(page, route, viewport) {
  const failures = [];
  if (route.name === "outreach" && viewport.width <= 430) {
    const interactiveMapStates = await page.locator("[data-state-code][role='button']").count();
    const stateRows = page.locator("[data-fifty-state-page='true'] aside button.group");
    if (interactiveMapStates !== 0) failures.push(`Outreach exposed ${interactiveMapStates} tiny interactive map states on phone`);
    if (await stateRows.count() < 6) failures.push("Outreach state index did not provide at least six phone-sized choices");
    const firstRow = await stateRows.first().boundingBox();
    if (!firstRow || firstRow.height < 44) failures.push("Outreach state index rows are smaller than 44px");
    const expand = page.getByRole("button", { name: /Show all \d+ states/ });
    if (await expand.count()) {
      await expand.click();
      if (await stateRows.count() <= 6) failures.push("Outreach phone state index did not expand beyond the priority preview");
    }
  }

  if (route.name === "incidents" && viewport.width <= 430) {
    const tabs = page.locator("[data-incident-priority-tabs='true'] [role='tab']");
    if (await tabs.count() !== 3) failures.push("Incident Center did not expose three phone priority tabs");
    if (await page.locator("[data-incident-priority-tabs='true'] + [role='tabpanel']").count() !== 1) {
      failures.push("Incident Center did not reduce the phone view to one priority panel");
    }
    for (const tab of await tabs.all()) {
      const bounds = await tab.boundingBox();
      if (!bounds || bounds.height < 44) failures.push("Incident Center priority tab is smaller than 44px");
    }
    await tabs.filter({ hasText: /Medium/i }).click();
    if (await tabs.filter({ hasText: /Medium/i }).getAttribute("aria-selected") !== "true" ||
      await page.locator("#incident-priority-panel-medium").count() !== 1) {
      failures.push("Incident Center priority tabs did not switch the visible phone lane");
    }
  }

  if (route.name === "command-center" && viewport.width <= 430) {
    const selector = page.locator("[data-command-center-section-navigation='true'] select");
    await selector.selectOption("runtime");
    const visibleSections = await page.locator("[data-command-center-section]").evaluateAll((elements) => elements.filter((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== "none" && bounds.width > 0 && bounds.height > 0;
    }).length);
    if (visibleSections !== 1) failures.push(`Command Center exposed ${visibleSections} detailed diagnostic sections on phone`);
    if (!await page.locator("[data-command-center-section='runtime']").isVisible()) failures.push("Command Center selector did not open the requested phone diagnostic section");
  }

  if (route.name === "data-architecture" && viewport.width <= 430) {
    await page.getByRole("button", { name: "Next architecture chapter" }).first().click();
    const visibleChapters = await page.locator("[data-architecture-chapter]").evaluateAll((elements) => elements.filter((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== "none" && bounds.width > 0 && bounds.height > 0;
    }).length);
    if (visibleChapters !== 1) failures.push(`Data Architecture exposed ${visibleChapters} chapters at once on phone`);
    if (!await page.locator("[data-architecture-chapter='pipeline']").isVisible()) failures.push("Data Architecture chapter control did not advance to the governed pipeline");
  }

  if (route.name === "admissions" && viewport.width <= 430) {
    const primaryTabs = page.locator("[data-admissions-surface-navigation='true'] [role='tab']");
    if (await primaryTabs.count() !== 2) failures.push("Admissions did not preserve its two page-level phone tabs");
    for (const tab of await primaryTabs.all()) {
      const bounds = await tab.boundingBox();
      if (!bounds || bounds.height < 44) failures.push("Admissions page tab is smaller than 44px");
    }
    const dashboardTabs = page.locator("[data-admissions-briefing-navigation='true'] [role='tab']");
    for (const tab of await dashboardTabs.all()) {
      const bounds = await tab.boundingBox();
      if (!bounds || bounds.height < 44) failures.push("Admissions dashboard tab is smaller than 44px");
    }
  }

  return failures;
}

async function verifySafeArea(browser) {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
  await page.locator("[data-platform-header='true']").waitFor({ state: "visible", timeout: TIMEOUT_MS });
  await page.addStyleTag({ content: ":root{--platform-safe-top:47px !important;}" });
  await page.getByRole("button", { name: "Open navigation" }).click();
  const geometry = await page.evaluate(() => {
    const header = document.querySelector("[data-platform-header='true']")?.getBoundingClientRect();
    const menu = document.querySelector("[data-platform-mobile-menu='true']")?.getBoundingClientRect();
    return { headerHeight: header?.height ?? 0, menuTop: menu?.top ?? 0 };
  });
  await context.close();
  if (geometry.headerHeight < 106 || geometry.menuTop < 106) {
    return [`Shared mobile chrome ignored the simulated 47px top safe area: ${JSON.stringify(geometry)}`];
  }
  return [];
}

await mkdir(OUTPUT_DIR, { recursive: true });

await withBrowserQa(async (browser) => {
  const checks = [];
  const failures = [];

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    for (const route of ROUTES) {
      const page = await context.newPage();
      const consoleErrors = [];
      const requestFailures = [];
      attachPageDiagnostics(page, { consoleErrors, requestFailures });
      let loadFailure = null;

      try {
        await page.goto(`${BASE_URL}${route.pathname}`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
        await page.locator(route.ready).first().waitFor({ state: "visible", timeout: TIMEOUT_MS });
        await page.waitForTimeout(450);
      } catch (error) {
        loadFailure = error instanceof Error ? error.message.split("\n")[0] : String(error);
      }

      const routeFailures = loadFailure ? [`Route did not settle: ${loadFailure}`] : await routeContracts(page, route, viewport);
      const layout = await inspectMobileLayout(page);
      if (layout.pathname !== route.pathname) routeFailures.push(`Expected ${route.pathname}, rendered ${layout.pathname}`);
      if (layout.rootOverflow > 2 || layout.bodyOverflow > 2) routeFailures.push(`Document overflowed by ${layout.rootOverflow}px root / ${layout.bodyOverflow}px body`);
      if (layout.clippedControls.length) routeFailures.push(`Clipped controls: ${JSON.stringify(layout.clippedControls)}`);
      if (layout.zoomRiskInputs.length) routeFailures.push(`Sub-16px form controls: ${JSON.stringify(layout.zoomRiskInputs)}`);
      if (layout.offscreenDialogs.length) routeFailures.push(`Offscreen dialogs: ${JSON.stringify(layout.offscreenDialogs)}`);
      if (layout.clippedFixedContent.length) routeFailures.push(`Clipped fixed content: ${JSON.stringify(layout.clippedFixedContent)}`);
      if (consoleErrors.length) routeFailures.push(`Console errors: ${unique(consoleErrors).join(" | ")}`);
      if (requestFailures.length) routeFailures.push(`Request failures: ${unique(requestFailures).join(" | ")}`);

      checks.push({ viewport: viewport.name, route: route.name, passed: routeFailures.length === 0, layout, failures: routeFailures });
      for (const failure of routeFailures) failures.push(`${viewport.name}/${route.name}: ${failure}`);
      await page.close();
    }
    await context.close();
  }

  failures.push(...await verifySafeArea(browser));
  const report = {
    generatedAt: new Date().toISOString(),
    passed: failures.length === 0,
    matrix: { viewports: VIEWPORTS.length, routes: ROUTES.length, checks: checks.length },
    failures,
    checks
  };
  await writeFile(path.join(OUTPUT_DIR, "latest.json"), JSON.stringify(report, null, 2));

  if (failures.length) throw new Error(`Platform mobile QA failed:\n${failures.join("\n")}`);
  console.log(`Platform mobile QA passed: ${checks.length} route/viewport checks plus safe-area chrome.`);
});
