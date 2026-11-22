// Current production navigation assertions. Browser operations are supplied by
// the caller: Playwright in CI or the supported main-Chrome page adapter. This
// module never opens a browser, reads credentials or changes application state.
export function sanitizeBrowserDiagnostic(value) {
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

export function createProductionNavigationChecks({ baseUrl, legacyQuestionsOnly = false,
  timeoutMs = 30_000, homeReadyMs = 5_000, routeReadyMs = 8_000, dataReadyMs = 12_000 }) {
  const BASE_URL = baseUrl.replace(/\/+$/, "");
  const LEGACY_QUESTIONS_ONLY = legacyQuestionsOnly;
  const TIMEOUT_MS = timeoutMs, HOME_READY_BUDGET_MS = homeReadyMs,
    ROUTE_READY_TIMEOUT_MS = routeReadyMs, DATA_READY_TIMEOUT_MS = dataReadyMs;
const LEGACY_QUESTION_PROBES = ["/questions", "/analytics/questions"].map((pathname) => ({
  name: `Retired question route ${pathname}`, pathname, expect: /Overview/i,
  readySelector: 'article[data-full-report="overview"]', requiresReport: true,
  expectedPathname: "/analytics", retiredQuestions: true
}));
const ROUTE_PROBES = LEGACY_QUESTIONS_ONLY ? LEGACY_QUESTION_PROBES : [
  { name: "Authenticated entrypoint", pathname: "/", expect: /Communities/i,
    readySelector: "[data-california-community-marker]", requiresCommunityMarkers: true },
  { name: "Home workspace", pathname: "/home", expect: /Communities/i,
    readySelector: "[data-california-community-marker]", requiresCommunityMarkers: true },
  { name: "Overview", pathname: "/analytics", expect: /Overview/i,
    readySelector: 'article[data-full-report="overview"]', requiresReport: true },
  { name: "Admissions", pathname: "/admissions", expect: /Admissions/i,
    readySelector: '[data-admissions-journey="complete"]' },
  { name: "Clients", pathname: "/analytics?report=residents", expect: /Clients/i,
    readySelector: 'article[data-full-report="residents"]', requiresReport: true },
  { name: "Incidents", pathname: "/incidents", expect: /Search full history/i,
    readySelector: '[data-incident-center="true"]', requiresIncidents: true },
  { name: "Licensing", pathname: "/analytics/licensing", expect: /Licensing/i,
    readySelector: '[data-licensing-workspace="true"]' },
  { name: "Resident explorer", pathname: "/explorer/residents",
    expect: /Resident Search|filtered of|Search resident/i, requiresLoadedRecords: true },
  { name: "Incident explorer", pathname: "/explorer/incidents",
    expect: /Incident Search|filtered of|Search resident, category/i, requiresLoadedRecords: true },
  { name: "Command center", pathname: "/command-center",
    expect: /Command Center|Databricks Warehouse|Analyst QA|Prompt workbench/i, requiresSnapshotHealth: true },
  { name: "Legacy Admissions", pathname: "/analytics/admissions", expectedPathname: "/admissions", expect: /Admissions/i,
    readySelector: '[data-admissions-journey="complete"]' },
  { name: "Legacy Clients", pathname: "/analytics/residents", expectedPathname: "/analytics?report=residents", expect: /Clients/i,
    readySelector: 'article[data-full-report="residents"]', requiresReport: true },
  { name: "Legacy community", pathname: "/analytics/community?community=337", expectedPathname: "/analytics?community=337&report=community", expect: /San Pablo/i,
    readySelector: 'article[data-full-report="community"]', requiresReport: true },
  ...LEGACY_QUESTION_PROBES
];

function buildUrl(pathname) {
  return `${BASE_URL}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function readPageState(page, routeProbe = {}) {
  return page.evaluate((probe) => {
    const text = document.body.innerText || "";
    const documentElement = document.documentElement;
    const hasAuthenticatedShell = Boolean(document.querySelector("[aria-label^='Signed in as ']"));
    const hasWorkspaceContent =
      Boolean(document.querySelector("[data-california-community-marker]")) ||
      /Communities|Incidents|Resident Search|Ask a question|Ask the platform/i.test(text);
    return {
      url: window.location.href,
      title: document.title,
      matchedExpected: new RegExp(probe.expectSource || "", probe.expectFlags || "").test(text),
      readySelectorVisible: !probe.readySelector || [...document.querySelectorAll(probe.readySelector)].some((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]');
      }),
      questionGuideVisible: [...document.querySelectorAll('[data-certified-question-guide="true"]')].some(element => {
        const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;
      }),
      reportBusy: Boolean(document.querySelector('[data-reports-page] main[aria-busy="true"]')),
      incidentLoading: /Loading incidents/i.test(document.querySelector('[data-incident-center="true"]')?.textContent || ""),
      errorVisible: /could not render|failed to load|unable to load|Safe Mode/i.test(text),
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
  }, { readySelector: routeProbe.readySelector, expectSource: routeProbe.expect?.source, expectFlags: routeProbe.expect?.flags });
}

async function waitForExpectedContent(page, probe) {
  if (probe.readySelector) await page.locator(probe.readySelector).first()
    .waitFor({ state: "visible", timeout: ROUTE_READY_TIMEOUT_MS }).catch(() => {});
  if (probe.requiresReport) await page.locator('[data-reports-page] main[aria-busy="false"]')
    .waitFor({ state: "visible", timeout: DATA_READY_TIMEOUT_MS }).catch(() => {});
  if (probe.requiresIncidents) await page.getByText(/Loading incidents/i).first()
    .waitFor({ state: "hidden", timeout: DATA_READY_TIMEOUT_MS }).catch(() => {});
  if (probe.requiresLoadedRecords) await page.locator('[data-explorer-status="ready"]')
    .waitFor({ state: "visible", timeout: DATA_READY_TIMEOUT_MS }).catch(() => {});
  if (probe.requiresSnapshotHealth) await page.locator('[data-command-center][data-command-center-loading="false"]')
    .waitFor({ state: "visible", timeout: DATA_READY_TIMEOUT_MS }).catch(() => {});
  // A completed route marker is authoritative. A broad text match may select
  // a hidden map description before the visible heading and inflate timing.
  if (!probe.readySelector && !probe.requiresLoadedRecords && !probe.requiresSnapshotHealth) {
    await page.getByText(probe.expect).first().waitFor({ state: "visible", timeout: ROUTE_READY_TIMEOUT_MS }).catch(() => {});
  }
}

// Export the exact assertions for a supported main-Chrome adapter. This does
// not bypass the independent console, HTTP/request-failure and revision checks.
async function checkProductionRoutes(page, artifactDir) {
    const routeResults = [];

    for (const [index, routeProbe] of ROUTE_PROBES.entries()) {
      const routeStartedAt = Date.now();
      await page.goto(buildUrl(routeProbe.pathname), { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await waitForExpectedContent(page, routeProbe);
      const pageState = await readPageState(page, routeProbe);
      const matchedExpected = pageState.matchedExpected;
      const elapsedMs = Date.now() - routeStartedAt;
      const routeFailures = [];
      const expectedUrl = new URL(buildUrl(routeProbe.expectedPathname || routeProbe.pathname));
      const actualUrl = new URL(pageState.url);
      const allowedPaths = routeProbe.pathname === "/" ? ["/", "/home"] : [expectedUrl.pathname];
      if (!allowedPaths.includes(actualUrl.pathname) || actualUrl.search !== expectedUrl.search) {
        routeFailures.push("route resolved to an unexpected destination");
      }
      if (routeProbe.retiredQuestions && pageState.questionGuideVisible) routeFailures.push("retired question guide is still exposed");
      if (!pageState.hasAuthenticatedShell) routeFailures.push("authenticated shell missing");
      if (!pageState.readySelectorVisible) routeFailures.push("route readiness marker missing");
      if (pageState.errorVisible) routeFailures.push("route rendered an error");
      if (routeProbe.requiresReport && pageState.reportBusy) routeFailures.push("report still loading");
      if (routeProbe.requiresIncidents && pageState.incidentLoading) routeFailures.push("incidents still loading");
      if (pageState.isMicrosoftLogin) routeFailures.push("landed on Microsoft login");
      if (!matchedExpected) routeFailures.push("expected route content did not render");
      if (routeProbe.requiresCommunityMarkers && pageState.communityMarkerCount !== 5) {
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

      const routeScreenshotPath = `${artifactDir}/screenshots/${String(index + 1).padStart(2, "0")}-${routeProbe.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`;
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

    return routeResults;
}

async function checkProductionInteractions(page) {
    const interactionResults = [];
    if (!LEGACY_QUESTIONS_ONLY) {
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
          buildUrl(`/home/community/${facilityId}`),
          { timeout: ROUTE_READY_TIMEOUT_MS }
        ).catch(() => {
          failures.push("community click did not update the route");
        });
        await page
          .locator(`[data-california-community-profile="${facilityId}"] [data-community-domain-section="census"]`)
          .waitFor({ state: "visible", timeout: ROUTE_READY_TIMEOUT_MS })
          .catch(() => {
            failures.push("community profile did not render after navigation");
          });
      }

      if (failures.length === 0) {
        await page
          .getByRole("button", { name: /^Close .+ profile$/ })
          .click({ timeout: ROUTE_READY_TIMEOUT_MS })
          .catch(() => {
            failures.push("community return-home link failed");
          });
        await page.waitForURL(
          buildUrl("/home"),
          { timeout: ROUTE_READY_TIMEOUT_MS }
        ).catch(() => {
          failures.push("community return link did not return home");
        });
      }

      interactionResults.push({
        name: `Community ${facilityId} marker and report`,
        passed: failures.length === 0,
        failures
      });
    }

    // Current navigation replaces the retired carousel and question-picker entry.
    // Keep both route and completed-data assertions for each visible destination.
    for (const [label, pathname] of [
      ["Analytics", "/analytics"], ["Admissions", "/admissions"],
      ["Clients", "/analytics?report=residents"], ["Incidents", "/incidents"],
      ["Licensing", "/analytics/licensing"]
    ]) {
      const failures = [];
      const probe = ROUTE_PROBES.find((candidate) => candidate.pathname === pathname);
      try {
        await page.getByRole("link", { name: label, exact: true }).click({ timeout: ROUTE_READY_TIMEOUT_MS });
        await page.waitForURL(buildUrl(pathname), { timeout: ROUTE_READY_TIMEOUT_MS });
        await waitForExpectedContent(page, probe);
        const state = await readPageState(page, probe);
        if (!state.hasAuthenticatedShell || !state.matchedExpected || !state.readySelectorVisible || state.errorVisible ||
            state.reportBusy || state.incidentLoading || state.horizontalOverflow > 8) {
          failures.push("navigation did not reach an authenticated, loaded, contained destination");
        }
      } catch (error) { failures.push(sanitizeBrowserDiagnostic(error.message)); }
      interactionResults.push({ name: `${label} navigation`, passed: failures.length === 0, failures });
    }
    const logoFailures = [];
    await page.getByRole("link", { name: "Back to California map", exact: true }).click({ timeout: ROUTE_READY_TIMEOUT_MS })
      .catch(() => logoFailures.push("Home navigation click failed"));
    await page.waitForURL(buildUrl("/home"), { timeout: ROUTE_READY_TIMEOUT_MS })
      .catch(() => logoFailures.push("Home navigation did not update the route"));
    await page.locator("[data-california-community-marker]").first().waitFor({ state: "visible", timeout: ROUTE_READY_TIMEOUT_MS })
      .catch(() => logoFailures.push("community map did not return"));
    interactionResults.push({ name: "Home navigation", passed: logoFailures.length === 0, failures: logoFailures });

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
      buildUrl("/home"),
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

    }

    return interactionResults;
}

  return { checkProductionRoutes, checkProductionInteractions };
}
