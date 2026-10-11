#!/usr/bin/env node
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { buildExecutiveDirectorIncidentsResponse } from "../server/executive-director-incidents.mjs";
import {
  BASE_URL,
  attachPageDiagnostics,
  prepareArtifactDirs,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-executive-director-dashboard");
const auditFindings = [];
const auditMeasurements = [];
const INCIDENTS_PATH = "/api/platform/executive-director/incidents";
const HISTORY_TOTAL = 67;
const ARCHIVED_RESIDENT = "Archive Search Resident";
const ARCHIVED_NARRATIVE = "Wisteria archive narrative, preserved from the full incident history.";
const historyRows = Array.from({ length: HISTORY_TOTAL }, (_, index) => ({
  id: `history-${String(index + 1).padStart(3, "0")}`,
  facility_id: "337",
  resident_id: `history-resident-${index + 1}`,
  client_name: index === HISTORY_TOTAL - 1 ? ARCHIVED_RESIDENT : `History Resident ${String(index + 1).padStart(3, "0")}`,
  incident_date: index === HISTORY_TOTAL - 1 ? "2024-05-19" : new Date(Date.UTC(2026, 9, 9 - index)).toISOString().slice(0, 10),
  received_at: "2026-10-09T12:00:00.000Z",
  category: ["Fall", "Medication Refusal", "Other"][index % 3],
  incident_type: index === HISTORY_TOTAL - 1 ? "Archived event classification" : "Recorded incident",
  location: index === HISTORY_TOTAL - 1 ? "Archive courtyard" : `Residential Unit ${index % 2 ? "A" : "B"}`,
  email_body: index === HISTORY_TOTAL - 1 ? ARCHIVED_NARRATIVE : `Synthetic incident ${index + 1} narrative.`,
  assistance_given: index === HISTORY_TOTAL - 1 ? "Archive follow-up response documented." : "Staff documented the immediate response.",
  staff_name: "Test Staff Member",
  injury_occurred: index === HISTORY_TOTAL - 1 ? null : index % 7 === 0,
  emergency_services_notified: index % 11 === 0,
  sentinel_event: index === HISTORY_TOTAL - 1
}));
const foreignHistoryRow = { ...historyRows[0], id: "foreign-history-record", facility_id: "342", client_name: "Other Community Only", email_body: "Foreign facility search marker" };
const historyAggregates = [...historyRows, foreignHistoryRow].reduce((rows, row) => {
  const month = row.incident_date.slice(0, 7);
  const existing = rows.find((item) => item.facility_id === row.facility_id && item.month_bucket === month && item.category === row.category);
  if (existing) existing.incident_count += 1;
  else rows.push({ facility_id: row.facility_id, month_bucket: month, category: row.category, incident_count: 1 });
  return rows;
}, []);
const historySnapshot = {
  snapshot: { generated_at: "2026-10-09T16:00:00.000Z", as_of_date: "2026-10-09" },
  communities: { incidents: historyAggregates },
  reportsSummary: { toolContext: { tables: { incident_detail_history: [...historyRows, foreignHistoryRow] } } }
};

async function installIncidentHistoryFixture(page, state) {
  await page.route(`**${INCIDENTS_PATH}**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    assert.equal(request.method(), "GET", "All incidents is a read-only workflow.");
    assert.equal(url.searchParams.get("facilityId"), "337", "Incident requests must use the authenticated facility, not a route override.");
    const options = {
      facilityId: url.searchParams.get("facilityId"), query: url.searchParams.get("q") ?? "", category: url.searchParams.get("category") ?? "",
      from: url.searchParams.get("from") ?? "", to: url.searchParams.get("to") ?? "", cursor: url.searchParams.get("cursor") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 25)
    };
    if (state.staleNextPage && options.cursor) {
      state.staleNextPage = false;
      try {
        buildExecutiveDirectorIncidentsResponse({ ...historySnapshot, snapshot: { ...historySnapshot.snapshot, generated_at: "2026-10-09T17:00:00.000Z" } }, options);
        assert.fail("A cursor from another source revision must be rejected.");
      } catch (error) {
        assert.equal(error.statusCode, 409);
        state.expectedConflicts += 1;
        state.requests.push({ ...options, status: "stale-cursor", ids: [] });
        await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: error.message, code: error.code }) });
        return;
      }
    }
    const snapshot = state.mode === "unavailable" ? {} : state.mode === "empty" ? {
      ...historySnapshot, communities: { incidents: [] }, reportsSummary: { toolContext: { tables: { incident_detail_history: [] } } }
    } : state.mode === "partial" ? {
      ...historySnapshot, communities: { incidents: historyAggregates.map((row, index) => index === 0 ? { ...row, incident_count: row.incident_count + 8 } : row) }
    } : historySnapshot;
    const response = await buildExecutiveDirectorIncidentsResponse(snapshot, options);
    // This explicitly enumerated fixture is complete; the partial mode keeps the
    // real snapshot builder's bounded-source coverage note and mismatched total.
    if (state.mode === "ready" || state.mode === "empty") response.coverage = { ...response.coverage, status: "complete", note: "Every incident in the synthetic facility history is included." };
    state.requests.push({ ...options, status: response.status, coverage: response.coverage.status, total: response.totalIncidents, matching: response.matchingIncidents, ids: response.incidents.map((row) => row.id) });
    assert.ok(response.incidents.every((row) => row.id !== foreignHistoryRow.id), "Cross-facility records must not enter the fixture response.");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
  });
}

function incidentRegister(page) {
  return page.locator('[data-executive-incident-register="true"]');
}

function expectedIncidentPage(options = {}) {
  return buildExecutiveDirectorIncidentsResponse(historySnapshot, { facilityId: "337", limit: 25, ...options });
}

async function waitForIncidentRows(page, expected) {
  await page.waitForFunction((ids) => {
    const register = [...document.querySelectorAll('[data-executive-incident-register="true"]')].find((element) => element.getClientRects().length);
    return register && JSON.stringify([...register.querySelectorAll("[data-executive-incident-row]")].map((row) => row.getAttribute("data-executive-incident-row"))) === JSON.stringify(ids);
  }, expected.incidents.map((row) => row.id));
  const register = incidentRegister(page);
  await register.locator('[aria-label="Incident results"][aria-busy="false"]').waitFor({ state: "visible" });
  assert.equal(await register.locator('[data-executive-incident-matches="true"]').innerText(), String(expected.matchingIncidents));
}

async function auditFullIncidentHistory(page, state) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/executive/dashboard`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-daily-operating-summary="true"]').getByRole("button", { name: "View incidents", exact: true }).click();
  const register = incidentRegister(page);
  const search = register.getByRole("searchbox", { name: "Search incidents", exact: true });
  const category = register.getByRole("combobox", { name: "Category", exact: true });
  const from = register.getByLabel("From date", { exact: true });
  const to = register.getByLabel("To date", { exact: true });
  const reset = register.getByRole("search", { name: "Search all incidents", exact: true }).getByRole("button", { name: "Reset filters", exact: true });
  const pages = register.getByRole("navigation", { name: "Incident pages", exact: true });
  const firstPage = expectedIncidentPage();
  assert.equal(firstPage.totalIncidents, HISTORY_TOTAL);
  assert.ok(HISTORY_TOTAL > 50, "The fixture must exercise history beyond the old fifty-record dashboard preview.");
  await waitForIncidentRows(page, firstPage);
  assert.equal(await register.locator('[data-executive-incident-total="true"]').innerText(), String(HISTORY_TOTAL));
  assert.equal(await register.getByText("Total incidents", { exact: true }).isVisible(), true);
  assert.equal(await register.getByRole("heading", { name: "All incidents", exact: true }).isVisible(), true);
  assert.equal(await reset.isDisabled(), true);
  assert.equal(await pages.getByRole("button", { name: "Previous", exact: true }).isDisabled(), true);
  assert.equal(await register.getByText(ARCHIVED_RESIDENT, { exact: true }).count(), 0, "The searchable archive fixture must not be in the first page.");
  const firstRow = register.locator(`[data-executive-incident-row="${firstPage.incidents[0].id}"]`).getByRole("button");
  await firstRow.focus();
  await page.keyboard.press("Enter");
  assert.equal(await firstRow.getAttribute("aria-expanded"), "true");
  assert.equal(await firstRow.evaluate((element) => {
    const detail = document.getElementById(element.getAttribute("aria-controls"));
    return detail && !detail.hidden;
  }), true, "Expanded incident buttons must control their visible detail panel.");
  await page.keyboard.press("Space");
  assert.equal(await firstRow.getAttribute("aria-expanded"), "false");

  const secondPage = expectedIncidentPage({ cursor: firstPage.nextCursor });
  await pages.getByRole("button", { name: "Next", exact: true }).focus();
  await page.keyboard.press("Enter");
  await waitForIncidentRows(page, secondPage);
  assert.equal(await register.locator('[aria-label="Incident results"]').evaluate((element) => document.activeElement === element), true, "Page changes must move keyboard focus to the new incident results.");
  assert.match(await pages.innerText(), /26–50 of 67 matching records/);
  const thirdPage = expectedIncidentPage({ cursor: secondPage.nextCursor });
  await pages.getByRole("button", { name: "Next", exact: true }).click();
  await waitForIncidentRows(page, thirdPage);
  assert.equal(await register.locator("[data-executive-incident-row]").count(), 17);
  assert.equal(await pages.getByRole("button", { name: "Next", exact: true }).isDisabled(), true);
  assert.equal(await register.getByText(ARCHIVED_RESIDENT, { exact: true }).isVisible(), true);
  await pages.getByRole("button", { name: "Previous", exact: true }).click();
  await waitForIncidentRows(page, secondPage);

  await search.fill("wisteria");
  const archiveMatch = expectedIncidentPage({ query: "wisteria" });
  await waitForIncidentRows(page, archiveMatch);
  assert.equal(archiveMatch.matchingIncidents, 1);
  assert.equal(await register.locator('[data-executive-incident-total="true"]').innerText(), String(HISTORY_TOTAL), "Search must not substitute its matching count for the facility history total.");
  assert.equal(await pages.getByRole("button", { name: "Previous", exact: true }).isDisabled(), true, "Search must reset a later cursor to the first result page.");
  const archiveId = archiveMatch.incidents[0].id;
  const archiveRow = register.locator(`[data-executive-incident-row="${archiveId}"]`).getByRole("button");
  const archiveDetail = register.locator(`[data-executive-incident-detail="${archiveId}"]`);
  await archiveRow.click();
  await archiveDetail.waitFor({ state: "visible" });
  assert.match(await archiveDetail.innerText(), /May 19, 2024/);
  for (const text of [ARCHIVED_NARRATIVE, "Archived event classification", "Archive courtyard", "Archive follow-up response documented.", "Test Staff Member"]) assert.ok((await archiveDetail.innerText()).includes(text), `Expanded details must preserve ${text}`);
  assert.match(await archiveDetail.innerText(), /Injury\s+Not recorded/);
  assert.match(await archiveDetail.innerText(), /Sentinel event\s+Yes/);
  assert.match(await archiveDetail.innerText(), /Emergency services notified\s+Yes/);
  assert.equal(await archiveDetail.getByText("Police called", { exact: true }).count(), 0, "Emergency-service notification must not be relabeled as a police call.");

  await search.fill("Foreign facility search marker");
  await register.getByRole("heading", { name: "No matching incidents", exact: true }).waitFor({ state: "visible" });
  assert.equal(await register.locator("[data-executive-incident-row]").count(), 0);
  assert.equal(await register.locator('[data-executive-incident-total="true"]').innerText(), String(HISTORY_TOTAL));
  assert.equal(await register.locator('[data-executive-incident-matches="true"]').innerText(), "0");
  await reset.click();
  await waitForIncidentRows(page, firstPage);
  await category.selectOption("Fall");
  await waitForIncidentRows(page, expectedIncidentPage({ category: "Fall" }));
  await from.fill("2024-05-01");
  await waitForIncidentRows(page, expectedIncidentPage({ category: "Fall", from: "2024-05-01" }));
  await to.fill("2024-05-31");
  await waitForIncidentRows(page, expectedIncidentPage({ category: "Fall", from: "2024-05-01", to: "2024-05-31" }));
  assert.equal(await register.locator("[data-executive-incident-row]").count(), 1, "Date and category filters must search the full archive, not only recent records.");
  await reset.click();
  await waitForIncidentRows(page, firstPage);
  assert.deepEqual(await Promise.all([search.inputValue(), category.inputValue(), from.inputValue(), to.inputValue()]), ["", "", "", ""]);
  assert.equal(await register.locator('[data-executive-incident-row] button[aria-expanded="true"]').count(), 0, "Resetting filters must close an obsolete expanded record.");
  await search.fill("History Resident");
  const filteredFirstPage = expectedIncidentPage({ query: "History Resident" });
  await waitForIncidentRows(page, filteredFirstPage);
  state.staleNextPage = true;
  await pages.getByRole("button", { name: "Next", exact: true }).click();
  await register.getByRole("alert").filter({ hasText: "Incident records or filters changed. Refresh the list." }).waitFor({ state: "visible" });
  assert.equal(await register.locator("[data-executive-incident-row]").count(), 0, "A stale cursor error must not leave the previous page's resident rows visible.");
  await register.getByRole("button", { name: "Retry incident history", exact: true }).click();
  await waitForIncidentRows(page, filteredFirstPage);
  assert.equal(state.requests.at(-1).cursor, undefined, "Retry after a stale cursor must restart at the first page.");
  assert.equal(await search.inputValue(), "History Resident", "Retry must preserve the operator's search.");
  await reset.click();
  await waitForIncidentRows(page, firstPage);

  const viewportResults = [];
  for (const viewport of [{ label: "desktop-1440", width: 1440, height: 900 }, { label: "mobile-390", width: 390, height: 844 }, { label: "compact-320", width: 320, height: 568 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    if (!await reset.isDisabled()) await reset.click();
    await waitForIncidentRows(page, firstPage);
    await register.evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
    await settleLayout(page);
    await page.screenshot({ path: `${screenshotDir}/${viewport.label}-all-incidents.png`, fullPage: false });
    await search.fill("wisteria");
    await waitForIncidentRows(page, archiveMatch);
    await archiveRow.focus();
    await page.keyboard.press("Enter");
    await archiveDetail.waitFor({ state: "visible" });
    const metrics = await register.evaluate((element) => ({
      viewport: window.innerWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      registerOverflow: element.scrollWidth - element.clientWidth,
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      phoneInputSizes: [...element.querySelectorAll("input,select")].map((input) => Number.parseFloat(getComputedStyle(input).fontSize))
    }));
    assert.ok(metrics.documentOverflow <= 2 && metrics.registerOverflow <= 2 && metrics.left >= -1 && metrics.right <= viewport.width + 1, `Full incident history must fit ${viewport.label}: ${JSON.stringify(metrics)}`);
    if (viewport.width < 640) assert.ok(metrics.phoneInputSizes.every((size) => size >= 16), "Phone incident filters must avoid sub16px inputs that trigger browser zoom.");
    await auditTouchTargets(register, `${viewport.label} all incidents`);
    await archiveDetail.evaluate((element) => {
      element.scrollIntoView({ block: "start", behavior: "instant" });
      window.scrollBy(0, -(document.querySelector('[data-executive-director-header="true"]')?.getBoundingClientRect().height ?? 64) - 12);
    });
    await page.screenshot({ path: `${screenshotDir}/${viewport.label}-all-incidents-detail.png`, fullPage: false });
    await register.getByRole("button", { name: "Clear incident search", exact: true }).focus();
    await page.keyboard.press("Enter");
    await waitForIncidentRows(page, firstPage);
    assert.equal(await search.evaluate((element) => document.activeElement === element), true, "Clearing search by keyboard must return focus to the stable search input.");
    viewportResults.push({ label: viewport.label, ...metrics });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/executive/dashboard?view=incidents&facilityId=342`, { waitUntil: "domcontentloaded" });
  await waitForIncidentRows(page, firstPage);
  assert.equal(await page.locator('[data-executive-community-dashboard="true"] .executive-director-community__masthead h1').innerText(), "San Pablo", "A URL facility override must not switch the authenticated community.");
  state.mode = "partial";
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForIncidentRows(page, firstPage);
  assert.equal(await register.locator('[data-executive-incident-total="true"]').innerText(), "75");
  assert.equal(await register.getByText("Published incidents", { exact: true }).isVisible(), true, "A bounded snapshot's published count must not be labeled as a complete incident total.");
  assert.equal(await register.getByText("Total incidents", { exact: true }).count(), 0);
  assert.equal(await register.getByText("Available records", { exact: true }).isVisible(), true);
  assert.equal(await register.locator('[data-executive-incident-available="true"]').innerText(), "67");
  assert.match(await register.locator('[data-executive-incident-coverage="partial"]').innerText(), /67 individual records.*75 incidents/);
  state.mode = "unavailable";
  await page.reload({ waitUntil: "domcontentloaded" });
  await register.getByRole("button", { name: "Retry incident history", exact: true }).waitFor({ state: "visible" });
  assert.equal(await register.locator('[data-executive-incident-total="true"]').innerText(), "—", "Unavailable history must not claim zero incidents.");
  assert.equal(await register.locator('[data-executive-incident-matches="true"]').innerText(), "—");
  assert.equal(await register.locator("[data-executive-incident-row]").count(), 0, "Unavailable history must not retain stale resident rows.");
  assert.equal(await register.getByRole("heading", { name: "No incident records available", exact: true }).count(), 0);
  state.mode = "empty";
  await register.getByRole("button", { name: "Retry incident history", exact: true }).click();
  await register.getByRole("heading", { name: "No incident records available", exact: true }).waitFor({ state: "visible" });
  assert.equal(await register.locator('[data-executive-incident-total="true"]').innerText(), "0");
  assert.equal(await register.locator('[data-executive-incident-matches="true"]').innerText(), "0");
  state.mode = "ready";
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForIncidentRows(page, firstPage);
  assert.ok(state.requests.every((request) => request.facilityId === "337" && !request.ids.includes(foreignHistoryRow.id)));
  return { total: HISTORY_TOTAL, fullHistoryBeyondPreview: true, offPageSearch: true, dateCategoryReset: true, staleCursorRetryResetPage: true, expandedDetailsKeyboard: true, facilityOverrideIgnored: true, partialCoverageHonest: true, unavailableDistinctFromZero: true, viewportResults, requests: state.requests };
}

async function settleLayout(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function auditTouchTargets(scope, label) {
  const metrics = await scope.evaluate((root) => {
    const controls = [...root.querySelectorAll("button, a[href], select, input:not([type='file']):not([type='hidden']), label[for]")].filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
    const targets = controls.map((element) => {
      const target = element.closest("label") ?? element;
      const rect = target.getBoundingClientRect();
      return { name: (element.getAttribute("aria-label") || element.textContent || element.getAttribute("placeholder") || element.tagName).trim().slice(0, 85), width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10, chartPoint: element.classList.contains("executive-trend-chart__point") };
    });
    // Dense plot points have equivalent period-tab controls; measure them separately.
    return { smallTargets: targets.filter((target) => !target.chartPoint && (target.width < 43.5 || target.height < 43.5)), chartTargets: targets.filter((target) => target.chartPoint) };
  });
  auditMeasurements.push({ label, ...metrics });
  if (metrics.smallTargets.length) auditFindings.push({ label, issue: "Primary controls must provide at least a 44px touch target.", targets: metrics.smallTargets });
}

async function auditHeader(page, label) {
  const header = page.locator('[data-executive-director-header="true"]');
  await auditTouchTargets(header, `${label} header`);
  const fit = await header.evaluate((element) => {
    const logo = element.querySelector('[data-platform-brand-logo="true"]');
    const links = [...element.querySelectorAll('.executive-director-header__link')];
    const profile = element.querySelector('[data-platform-user-identity="true"]');
    const headerBox = element.getBoundingClientRect();
    const logoBox = logo?.getBoundingClientRect();
    const profileBox = profile?.getBoundingClientRect();
    const linkBoxes = links.map((link) => { const box = link.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }; });
    return {
      logoVisible: Boolean(logoBox && logoBox.width >= 140 && logoBox.height >= 20 && logoBox.left >= -1 && logoBox.right <= window.innerWidth + 1),
      linksInside: linkBoxes.every((box) => box.left >= -1 && box.right <= window.innerWidth + 1 && box.top >= headerBox.top && box.bottom <= headerBox.bottom + 1),
      profileInside: Boolean(profileBox && profileBox.right <= window.innerWidth + 1 && profileBox.bottom <= headerBox.bottom + 1),
      height: headerBox.height,
      linkBoxes
    };
  });
  auditMeasurements.push({ label, headerFit: fit });
  if (!fit.logoVisible || !fit.linksInside || !fit.profileInside) auditFindings.push({ label, issue: "The full Alamo logo, navigation, and profile must fit inside the header.", ...fit });
}

async function auditSelectedMonth(page, detail, name, label) {
  const tablist = detail.getByRole("tablist", { name, exact: true });
  if (!await tablist.count()) return;
  const state = await tablist.evaluate((element) => {
    const tabs = [...element.querySelectorAll('[role="tab"]')];
    const selected = tabs.find((tab) => tab.getAttribute("aria-selected") === "true");
    const outer = element.getBoundingClientRect();
    const inner = selected?.getBoundingClientRect();
    return { selectedText: selected?.textContent, selectedIndex: tabs.indexOf(selected), count: tabs.length, rovingStops: tabs.filter((tab) => tab.tabIndex === 0).length, selectedVisible: Boolean(inner && inner.left >= outer.left - 2 && inner.right <= outer.right + 2), left: inner?.left, right: inner?.right, containerLeft: outer.left, containerRight: outer.right };
  });
  auditMeasurements.push({ label, monthNavigation: state });
  if (!state.selectedVisible) auditFindings.push({ label, issue: "The selected month must be visible when its workspace opens.", ...state });
  if (state.rovingStops !== 1) auditFindings.push({ label, issue: "Month tabs must provide one keyboard Tab stop.", stops: state.rovingStops });
  const tabs = tablist.getByRole("tab");
  const original = tabs.nth(state.selectedIndex);
  await original.focus();
  await original.press("ArrowLeft");
  await settleLayout(page);
  const previous = tabs.nth((state.selectedIndex + state.count - 1) % state.count);
  if (await previous.getAttribute("aria-selected") !== "true" || !await previous.evaluate((element) => document.activeElement === element)) {
    auditFindings.push({ label, issue: "ArrowLeft must select and focus the preceding month tab." });
  }
  for (const [key, index] of [["Home", 0], ["End", state.count - 1]]) {
    await page.keyboard.press(key);
    await settleLayout(page);
    const target = tabs.nth(index);
    if (await target.getAttribute("aria-selected") !== "true" || !await target.evaluate((element) => document.activeElement === element)) auditFindings.push({ label, issue: `${key} must select and focus the ${key === "Home" ? "first" : "last"} month.` });
    if (!await target.evaluate((element) => {
      const panel = document.getElementById(element.getAttribute("aria-controls") ?? "");
      return panel?.getAttribute("role") === "tabpanel" && panel.getAttribute("aria-labelledby") === element.id;
    })) auditFindings.push({ label, issue: "The selected month must label its associated tab panel." });
  }
  await original.click();
}

async function auditTablePanning(page, detail, label) {
  await settleLayout(page);
  for (const table of await detail.locator(".material-table-scroll").all()) {
    const state = await table.evaluate((element) => ({ overflow: element.scrollWidth - element.clientWidth, role: element.getAttribute("role"), name: element.getAttribute("aria-label") || element.getAttribute("aria-labelledby"), tabIndex: element.tabIndex, visibleHint: /scroll|swipe|pan/i.test(element.parentElement?.innerText ?? "") }));
    auditMeasurements.push({ label, tablePanning: state });
    if (state.overflow <= 2) continue;
    await table.evaluate((element) => element.parentElement?.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.screenshot({ path: `${screenshotDir}/${label.replaceAll(" ", "-")}-table.png`, fullPage: false });
    if (state.role !== "region" || !state.name || state.tabIndex < 0 || !state.visibleHint) {
      auditFindings.push({ label, issue: "An overflowing table needs a named keyboard-focusable region and a visible horizontal-scroll hint.", ...state });
      continue;
    }
    await table.focus();
    await table.press("ArrowRight");
    await settleLayout(page);
    if (!await table.evaluate((element) => element.scrollLeft > 0)) auditFindings.push({ label, issue: "ArrowRight must pan a focused overflowing table." });
    await table.evaluate((element) => { element.scrollLeft = 0; });
  }
}

async function auditWorkspace(page, detail, workspace, label) {
  await auditTouchTargets(detail, label);
  const monthLabels = { census: "Census month", incidents: "Incident month", medications: "Medication month" };
  if (monthLabels[workspace.key]) await auditSelectedMonth(page, detail, monthLabels[workspace.key], label);
  if (workspace.key === "admissions") {
    const tabs = detail.getByRole("tablist", { name: "Impending admits", exact: true }).getByRole("tab");
    const before = await tabs.evaluateAll((elements) => elements.map((element) => ({ name: element.textContent, selected: element.getAttribute("aria-selected") === "true", tabIndex: element.tabIndex })));
    const selectedIndex = before.findIndex((tab) => tab.selected);
    const selectedName = before[selectedIndex]?.name;
    if (before.filter((tab) => tab.tabIndex === 0).length !== 1) auditFindings.push({ label, issue: "Client folder tabs must provide one keyboard Tab stop." });
    if (before.length > 1 && selectedName) {
      await tabs.nth(selectedIndex).focus();
      await page.keyboard.press("ArrowRight");
      const nextTab = detail.getByRole("tab", { name: before[(selectedIndex + 1) % before.length].name, exact: true });
      if (await nextTab.getAttribute("aria-selected") !== "true" || !await nextTab.evaluate((element) => document.activeElement === element)) auditFindings.push({ label, issue: "ArrowRight must select and focus the next client folder." });
      await detail.getByRole("tab", { name: selectedName, exact: true }).click();
    }
  }
  await auditTablePanning(page, detail, label);
  if (!workspace.view) {
    await detail.evaluate((dialog) => {
      const controls = [...dialog.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")].filter((element) => !element.matches(":disabled") && element.tabIndex >= 0 && element.getClientRects().length);
      controls[0]?.focus();
    });
    await page.keyboard.press("Shift+Tab");
    const wrapsToLast = await detail.evaluate((dialog) => {
      const controls = [...dialog.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")].filter((element) => !element.matches(":disabled") && element.tabIndex >= 0 && element.getClientRects().length);
      return document.activeElement === controls.at(-1);
    });
    await page.keyboard.press("Tab");
    const wrapsToFirst = await detail.evaluate((dialog) => {
      const controls = [...dialog.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")].filter((element) => !element.matches(":disabled") && element.tabIndex >= 0 && element.getClientRects().length);
      return document.activeElement === controls[0];
    });
    if (!wrapsToLast || !wrapsToFirst) auditFindings.push({ label, issue: "Tab and Shift+Tab must keep keyboard focus inside an open modal.", wrapsToLast, wrapsToFirst });
  }
}

function mockAdmissionsCard(card, profile = {}) {
  return {
    nextAction: "Review the client profile",
    community: "San Pablo",
    owner: "Admissions team",
    priority: "standard",
    daysSinceUpdate: 0,
    plannedAdmissionDate: null,
    flags: { stale: false, unassigned: false, moveInOverdue: false },
    managementProfile: {
      dateOfBirth: "1984-05-12",
      referralSource: "County behavioral health",
      referringCounty: "Contra Costa County",
      payer: "Medi-Cal",
      responsiblePerson: "Self",
      conservedStatus: "Not conserved",
      documentStatus: "Reviewed",
      assessmentStatus: "Complete",
      assessmentSigned: true,
      assessmentDate: "2026-10-07",
      openRequirements: 0,
      blockingRequirements: 0,
      overview: ["Step-down behavioral health placement", "Medication support and community transition planning"],
      supportSnapshot: [{ label: "Mobility", value: "Independent" }],
      medications: ["Medication list reviewed"],
      medicationSource: "signed_assessment",
      ...profile
    },
    pipelineUrl: "https://pipeline.example/referral",
    ...card
  };
}

const dashboardResponse = {
  facility: {
    facilityId: "337",
    communityName: "Alamo San Pablo",
    shortName: "San Pablo",
    city: "San Pablo",
    state: "CA"
  },
  dashboard: {
    version: "executive-director-community-dashboard-v1",
    status: "ready",
    generatedAt: "2026-10-08T20:33:00.000Z",
    reportingMonth: "2026-10",
    summary: {
      residents: 153,
      currentIncidents: 95,
      priorIncidents: 397,
      averageAge: 47.686,
      averageLengthOfStay: 549.51
    },
    census: [
      { month: "2025-11", census: 132 },
      { month: "2025-12", census: 133 },
      { month: "2026-01", census: 129 },
      { month: "2026-02", census: 131 },
      { month: "2026-03", census: 130 },
      { month: "2026-04", census: 129 },
      { month: "2026-05", census: 129 },
      { month: "2026-06", census: 140 },
      { month: "2026-07", census: 148 },
      { month: "2026-08", census: 145 },
      { month: "2026-09", census: 149 },
      { month: "2026-10", census: 153 }
    ],
    incidentTrend: [
      { month: "2025-11", count: 66 },
      { month: "2025-12", count: 71 },
      { month: "2026-01", count: 64 },
      { month: "2026-02", count: 79 },
      { month: "2026-03", count: 73 },
      { month: "2026-04", count: 82 },
      { month: "2026-05", count: 88 },
      { month: "2026-06", count: 76 },
      { month: "2026-07", count: 91 },
      { month: "2026-08", count: 84 },
      { month: "2026-09", count: 397 },
      { month: "2026-10", count: 95 }
    ],
    topIncidentCategories: [
      { label: "Medication Refusal", count: 28 },
      { label: "AWOL/Elopement", count: 20 },
      { label: "Other", count: 17 },
      { label: "Substance Use", count: 11 },
      { label: "Aggressive Behavior", count: 8 }
    ],
    incidentDetails: [
      { id: "incident-1", residentId: "r-1", residentName: "Maria Gomez", date: "2026-10-27", category: "Medication Refusal", location: "Residential — Unit B", injuryOccurred: false, policeCalled: false, response: "RN notified; medication education documented." },
      { id: "incident-2", residentId: "r-2", residentName: "James Carter", date: "2026-10-24", category: "Medication Refusal", location: "Residential — Unit A", injuryOccurred: false, policeCalled: false, response: "Scheduled medication offered again." },
      { id: "incident-3", residentId: "r-3", residentName: "Linda Park", date: "2026-10-21", category: "AWOL/Elopement", location: "Community grounds", injuryOccurred: false, policeCalled: true, response: "Search protocol completed and contacts notified." },
      { id: "incident-4", residentId: "r-4", residentName: "Robert Allen", date: "2026-10-18", category: "Medication Refusal", location: "Residential — Unit A", injuryOccurred: false, policeCalled: false, response: "Care plan reviewed with resident." },
      { id: "incident-5", residentId: "r-5", residentName: "Angela Ruiz", date: "2026-10-14", category: "Substance Use", location: "Residential — Unit B", injuryOccurred: false, policeCalled: false, response: "Clinical team notified and follow-up documented." },
      { id: "incident-6", residentId: "r-6", residentName: "Thomas Nguyen", date: "2026-10-09", category: "Other", location: "Dining room", injuryOccurred: true, policeCalled: false, response: "First aid provided; supervisor notified." },
      { id: "incident-september-1", residentId: "r-sep-1", residentName: "September Resident A", date: "2026-09-22", category: "Fall", location: "Dining room", injuryOccurred: false, policeCalled: false, response: "September follow-up recorded." },
      { id: "incident-september-2", residentId: "r-sep-2", residentName: "September Resident B", date: "2026-09-15", category: "Medication Refusal", location: "Residential — Unit B", injuryOccurred: false, policeCalled: false, response: "September medication review recorded." }
    ],
    residentMovements: [
      { id: "movement-1", residentId: "r-1", residentName: "Maria Gomez", date: "2026-10-28", action: "Move-in", type: "Admission", destination: "Community → San Pablo", note: null },
      { id: "movement-2", residentId: "r-2", residentName: "James Carter", date: "2026-10-24", action: "Move-out", type: "Discharge", destination: "San Pablo → Home", note: "Completed treatment" },
      { id: "movement-3", residentId: "r-3", residentName: "Linda Park", date: "2026-10-18", action: "Move-in", type: "Admission", destination: "Hospital → San Pablo", note: null },
      { id: "movement-4", residentId: "r-4", residentName: "Robert Allen", date: "2026-10-12", action: "Move-out", type: "Discharge", destination: "San Pablo → SNF", note: "Higher level of care" }
    ],
    medicationHistory: [
      { month: "2026-05", compliancePct: 92, scheduled: 10144, given: 9333, notGiven: 811 },
      { month: "2026-06", compliancePct: 93, scheduled: 10201, given: 9487, notGiven: 714 },
      { month: "2026-07", compliancePct: 94, scheduled: 10432, given: 9806, notGiven: 626 },
      { month: "2026-08", compliancePct: 95, scheduled: 10502, given: 9977, notGiven: 525 },
      { month: "2026-09", compliancePct: 94, scheduled: 10644, given: 10005, notGiven: 639 },
      { month: "2026-10", compliancePct: 96, scheduled: 10759, given: 10333, notGiven: 426 }
    ],
    medication: {
      month: "2026-10",
      compliancePct: 96,
      scheduled: 10759,
      given: 10333,
      notGiven: 426
    },
    medicationExceptions: [
      { id: "mar-1", residentId: "r-1", residentName: "Maria Gomez", medication: "Metformin", dosage: "500 mg", date: "2026-10-27", outcome: "Not given", reason: "Out of stock", noteRecorded: true },
      { id: "mar-2", residentId: "r-2", residentName: "James Carter", medication: "Lisinopril", dosage: "10 mg", date: "2026-10-27", outcome: "Not given", reason: "Not available", noteRecorded: true },
      { id: "mar-3", residentId: "r-3", residentName: "Linda Park", medication: "Furosemide", dosage: "40 mg", date: "2026-10-26", outcome: "Not given", reason: "Resident out", noteRecorded: true },
      { id: "mar-4", residentId: "r-4", residentName: "Robert Allen", medication: "Potassium", dosage: "20 mEq", date: "2026-10-26", outcome: "Held", reason: "NPO", noteRecorded: true },
      { id: "mar-5", residentId: "r-5", residentName: "Angela Ruiz", medication: "Atorvastatin", dosage: "20 mg", date: "2026-10-25", outcome: "Not given", reason: "Medication not available", noteRecorded: true },
      { id: "mar-6", residentId: "r-6", residentName: "Thomas Nguyen", medication: "Sertraline", dosage: "50 mg", date: "2026-10-25", outcome: "Refused", reason: "Resident refused", noteRecorded: true },
      { id: "mar-7", residentId: "r-1", residentName: "Maria Gomez", medication: "Omeprazole", dosage: "20 mg", date: "2026-10-24", outcome: "Late", reason: "Held by provider", noteRecorded: false },
      { id: "mar-september-1", residentId: "r-sep-mar", residentName: "September Medication Resident", medication: "September medication", dosage: "10 mg", date: "2026-09-20", outcome: "Not given", reason: "September exception recorded", noteRecorded: true }
    ],
    medicationWatch: [
      { residentId: "r-1", residentName: "Maria Gomez", exceptions: 18 },
      { residentId: "r-2", residentName: "Robert Allen", exceptions: 15 },
      { residentId: "r-3", residentName: "Angela Ruiz", exceptions: 14 },
      { residentId: "r-4", residentName: "James Carter", exceptions: 13 },
      { residentId: "r-5", residentName: "Linda Park", exceptions: 10 }
    ],
    admissions: {
      status: "connected",
      generatedAt: "2026-10-08T20:33:00.000Z",
      asOfDate: "2026-10-08",
      community: {
        census: 153,
        censusChange: 4,
        operatingLimit: 175,
        occupancyPct: 87.4,
        monthToDate: { admissions: 3, discharges: 2, net: 1 },
        lastMonth: { admissions: 8, discharges: 7, net: 1 },
        recentWeeks: { admissions: 5, discharges: 4, net: 1 },
        activeReferrals: 10,
        inDecision: 4,
        needsAttention: 0,
        newReferrals7d: 2,
        newReferrals14d: 5,
        assessmentsThisWeek: 0,
        plannedMoveInsThisWeek: 1,
        completedMoveInsThisWeek: 0
      },
      cards: [
        mockAdmissionsCard({ referralId: 1, facilityId: "337", clientName: "Sean Bobier", status: "Awaiting admit", column: "decision", daysOpen: 9, plannedAdmissionDate: "2026-10-09" }),
        mockAdmissionsCard({ referralId: 2, facilityId: "337", clientName: "Ben Randolph", status: "Assessment scheduled", column: "in_progress", daysOpen: 4 }),
        mockAdmissionsCard({ referralId: 3, facilityId: "337", clientName: "Georgette Moore", status: "Assessment scheduled", column: "in_progress", daysOpen: 3 }),
        mockAdmissionsCard({ referralId: 4, facilityId: "337", clientName: "Jonah Wicker", status: "Clinical review", column: "in_progress", daysOpen: 2 }),
        mockAdmissionsCard({ referralId: 5, facilityId: "337", clientName: "Deanna Bell", status: "Accepted", column: "decision", daysOpen: 12 }, { assessmentSigned: false, assessmentStatus: "Awaiting signature", openRequirements: 1 }),
        mockAdmissionsCard({ referralId: 6, facilityId: "337", clientName: "Mario Manzaro", status: "Under review", column: "decision", daysOpen: 7 }),
        mockAdmissionsCard({ referralId: 7, facilityId: "337", clientName: "Iris Delgado", status: "Referral received", column: "received", daysOpen: 1 }),
        mockAdmissionsCard({ referralId: 8, facilityId: "337", clientName: "Malcolm Reed", status: "Document review", column: "in_progress", daysOpen: 5 }),
        mockAdmissionsCard({ referralId: 9, facilityId: "337", clientName: "Nakya Hobbs", status: "Awaiting admit", column: "decision", daysOpen: 8, plannedAdmissionDate: "2026-10-10" }),
        mockAdmissionsCard({ referralId: 10, facilityId: "337", clientName: "Carlos Vivanco", status: "Accepted", column: "decision", daysOpen: 6, plannedAdmissionDate: "2026-10-11" })
      ],
      recentReferrals: [],
      upcomingAssessments: [],
      plannedMoveIns: [
        { referralId: 1, facilityId: "337", clientName: "Sean Bobier", plannedAt: "2026-10-09T18:00:00.000Z", status: "Awaiting admit", readiness: "ready" }
      ]
    }
  }
};

const expectedImpendingCards = [1, 9, 10, 5].map((referralId) => dashboardResponse.dashboard.admissions.cards.find((card) => card.referralId === referralId));
const detailWorkspaces = [
  { key: "census", trigger: "History", material: "ledger", identity: "[data-census-ledger='true']", close: /Close Census detail/i },
  { key: "admissions", material: "folder", identity: "[data-admissions-folder-shell='true']", close: /Close Admissions detail/i },
  { key: "incidents", tab: "Incidents", view: "incidents", trigger: "View incidents", material: "register", identity: "[data-incident-register='true']", close: "Back to overview" },
  { key: "medications", tab: "MARs", view: "mars", trigger: "View MARs", material: "binder", identity: "[data-mar-binder='true']", close: "Back to overview" }
];

function workspaceLocator(page, workspace) {
  return page.locator(`[${workspace.view ? "data-executive-community-workspace" : "data-executive-community-detail-modal"}="${workspace.key}"]`);
}

async function verifySelectedCommunityView(page, name, view) {
  const actualView = new URL(page.url()).searchParams.get("view") ?? "overview";
  if (actualView !== view) throw new Error(`The ${name} community view must retain view=${view} in its URL, received ${page.url()}.`);
  const renderedView = await page.locator('[data-executive-current-view]').getAttribute('data-executive-current-view');
  if (renderedView !== view) throw new Error(`The ${name} community view did not render the matching workspace.`);
}

async function verifyNotifications(page, expectedCards) {
  const trigger = page.getByRole("button", { name: "New client notifications", exact: true });
  const notifications = page.getByRole("region", { name: "New client notifications", exact: true });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  await notifications.waitFor({ state: "visible" });
  if (!await notifications.getByRole("heading", { name: "New client", exact: true }).isVisible()) {
    throw new Error("The notification popup must display the New client title.");
  }
  const countText = await trigger.locator('[data-executive-notification-count="true"]').innerText();
  if (countText !== String(expectedCards.length)) {
    throw new Error(`The notification count must reflect all ${expectedCards.length} impending clients: ${countText}`);
  }
  if (await trigger.getAttribute("aria-expanded") !== "true" || await notifications.getAttribute("data-executive-client-notifications") == null) {
    throw new Error("The notifications control must expose its expanded region.");
  }
  const rows = notifications.locator("ol > li, ul > li");
  if (await rows.count() !== expectedCards.length || await notifications.locator('[data-executive-referral-status="true"]').count() !== expectedCards.length) {
    throw new Error("New client notifications must show every impending client and status without pagination.");
  }
  for (let index = 0; index < expectedCards.length; index += 1) {
    const card = expectedCards[index];
    if (!await rows.nth(index).getByRole("button", { name: new RegExp(card.clientName) }).count()) {
      throw new Error(`The notification list lost the ordered client ${card.clientName}.`);
    }
  }
  if (await notifications.getByRole("button", { name: /^(Previous|Next)$/ }).count()) {
    throw new Error("The client notification list must not paginate impending clients.");
  }
  const ineligibleNames = dashboardResponse.dashboard.admissions.cards.filter((card) => !expectedCards.includes(card)).map((card) => card.clientName);
  for (const name of ineligibleNames) {
    if (await notifications.getByText(name, { exact: true }).count()) throw new Error(`The notification list included ineligible client ${name}.`);
  }
  return notifications;
}

async function openWorkspace(page, dashboard, workspace) {
  if (workspace.key === "admissions") {
    const notifications = await verifyNotifications(page, expectedImpendingCards);
    await notifications.getByRole("button", { name: /Sean Bobier/ }).click();
  } else {
    await dashboard.getByRole("button", { name: workspace.trigger, exact: true }).click();
  }
  const detail = workspaceLocator(page, workspace);
  await detail.waitFor({ state: "visible" });
  await detail.locator(`[data-executive-detail-view="${workspace.key}"]`).waitFor({ state: "visible" });
  if (workspace.view) {
    await verifySelectedCommunityView(page, workspace.tab, workspace.view);
    if (await page.locator('[data-executive-community-modal-backdrop="true"]').count()) {
      throw new Error(`The ${workspace.key} community view must be inline instead of a modal.`);
    }
    await page.waitForFunction((key) => {
      const heading = document.querySelector(`[data-executive-community-workspace="${key}"] h1`)?.getBoundingClientRect();
      const appHeader = document.querySelector('[data-executive-director-header="true"]')?.getBoundingClientRect();
      return Boolean(heading && appHeader && heading.top >= appHeader.bottom - 1 && heading.bottom <= window.innerHeight);
    }, workspace.key, { timeout: 5_000 });
  }
  return detail;
}

async function closeWorkspace(page, detail, workspace) {
  await detail.getByRole("button", { name: workspace.close, exact: typeof workspace.close === "string" }).click();
  await detail.waitFor({ state: "hidden" });
  await verifySelectedCommunityView(page, "Overview", "overview");
  if (workspace.view) {
    const trigger = page.locator('[data-daily-operating-summary="true"]').getByRole("button", { name: workspace.trigger, exact: true });
    await trigger.waitFor({ state: "visible" });
    await page.waitForFunction((label) => document.activeElement?.getAttribute("aria-label") === label, workspace.trigger);
  }
}

async function measureWorkspace(page, workspace) {
  return workspaceLocator(page, workspace).evaluate((element, key) => ({
    key,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    dialogOverflow: element.scrollWidth - element.clientWidth,
    dialogWidth: element.getBoundingClientRect().width,
    dialogLeft: element.getBoundingClientRect().left
  }), workspace.key);
}

async function refreshOnFocus(page) {
  const refreshedDashboard = page.waitForResponse((response) => response.url().includes("/api/platform/executive-director/dashboard") && response.ok());
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await (await refreshedDashboard).finished();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function verifyPeriodSelection(modal, view, page) {
  if (view === "census") {
    if (await modal.locator('[data-census-reconciliation="true"]').count() || !/differ by 3 residents/i.test(await modal.locator('[data-census-movement-summary="true"]').innerText())) {
      throw new Error("A four-resident census change and one-resident net movement must not be presented as a reconciled equation.");
    }
    await modal.getByRole("tablist", { name: "Census month" }).getByRole("tab", { name: /^Sep\b/ }).click();
    const censusSummary = await modal.getByRole("complementary", { name: "Selected census period" }).innerText();
    if (!/September 2026[\s\S]*149[\s\S]*85\.1%/.test(censusSummary)) {
      throw new Error(`The selected census period did not update its resident and occupancy values: ${censusSummary}`);
    }
    if (await modal.locator('[data-census-movement-summary="true"], [data-census-reconciliation="true"]').count() || /Maria Gomez|James Carter/.test(await modal.locator("table").innerText())) {
      throw new Error("Selecting September census must not retain October movement or reconciliation values.");
    }
    await modal.getByRole("group", { name: "Monthly census history" }).getByRole("button", { name: /^Oct\b/ }).click();
  }
  if (view === "incidents") {
    await modal.getByRole("tablist", { name: "Incident month" }).getByRole("tab", { name: /^Sep\b/ }).click();
    const categoryPanel = modal.locator(".incident-register__categories");
    if (!/2 available records of 397 incidents/.test(await categoryPanel.innerText()) || await categoryPanel.locator("ol > li").count() !== 2) {
      throw new Error("Historical category mix must expose loaded-record coverage, not reuse the current month's totals.");
    }
    await waitForIncidentRows(page, expectedIncidentPage({ from: "2026-09-01", to: "2026-09-30" }));
    await categoryPanel.getByRole("button", { name: /Fall.*1.*50%/ }).click();
    await waitForIncidentRows(page, expectedIncidentPage({ category: "Fall", from: "2026-09-01", to: "2026-09-30" }));
    assert.equal(await incidentRegister(page).getByRole("combobox", { name: "Category", exact: true }).inputValue(), "Fall");
    assert.equal(await incidentRegister(page).locator("[data-executive-incident-row]").count(), 10, "Chart categories must query all historical records, not the one-row capped preview.");
    await modal.getByRole("tablist", { name: "Incident month" }).getByRole("tab", { name: /^Aug\b/ }).click();
    if (await categoryPanel.locator("ol > li").count() || !/No category records for this month are included in the loaded history/.test(await categoryPanel.innerText())) throw new Error("The category summary must not carry forward a different month's preview.");
    await waitForIncidentRows(page, expectedIncidentPage({ from: "2026-08-01", to: "2026-08-31" }));
    assert.equal(await incidentRegister(page).getByRole("combobox", { name: "Category", exact: true }).inputValue(), "");
    assert.equal(await incidentRegister(page).locator('[data-executive-incident-matches="true"]').innerText(), "27", "The full register must expose August records even when its dashboard preview has none.");
    await modal.getByRole("tablist", { name: "Incident month" }).getByRole("tab", { name: /^Oct\b/ }).click();
    await waitForIncidentRows(page, expectedIncidentPage({ from: "2026-10-01", to: "2026-10-31" }));
  }
  if (view === "medications") {
    const history = modal.getByRole("group", { name: "Medication compliance history" });
    await history.getByRole("button", { name: /^Sep\b/ }).click();
    const composition = await modal.locator(".mar-binder__composition").innerText();
    const watch = modal.locator(".mar-binder__watch");
    if (!/September 2026[\s\S]*10,644[\s\S]*10,005[\s\S]*639/.test(composition) || !/September Medication Resident/.test(await watch.innerText()) || /Maria Gomez|Robert Allen/.test(await watch.innerText())) {
      throw new Error("Historical MAR totals and resident watch must use only the selected month.");
    }
    if (await modal.locator("tbody tr").count() !== 1 || !/September medication/.test(await modal.locator("table").innerText())) {
      throw new Error("September MAR must show its single exception record without October rows.");
    }
    await history.getByRole("button", { name: /^Aug\b/ }).click();
    if (!/No resident exception records for this month are included in the loaded history/.test(await watch.innerText()) || !/No medication exception records for this month are included in the loaded history/.test(await modal.locator("table").innerText()) || /Maria Gomez|September Medication Resident/.test(await watch.innerText())) {
      throw new Error("A MAR month without exception detail must not fall back to another month's resident watch.");
    }
    await history.getByRole("button", { name: /^Oct\b/ }).click();
  }
}

await withBrowserQa(async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/api/**", async (route) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) throw new Error(`Unexpected browser QA write: ${route.request().method()} ${route.request().url()}`);
    await route.continue();
  });
  const page = await context.newPage();
  const incidentHistory = { mode: "ready", requests: [], staleNextPage: false, expectedConflicts: 0 };
  await installIncidentHistoryFixture(page, incidentHistory);
  const consoleErrors = [];
  const requestFailures = [];
  attachPageDiagnostics(page, { consoleErrors, requestFailures });
  let admissionsFeedUnavailable = false;
  await page.route("**/api/platform/executive-director/dashboard**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(admissionsFeedUnavailable ? {
      ...dashboardResponse,
      dashboard: { ...dashboardResponse.dashboard, admissions: { ...dashboardResponse.dashboard.admissions, status: "unavailable", cards: [], community: null } }
    } : dashboardResponse)
  }));

  await page.goto(`${BASE_URL}/executive/dashboard`, { waitUntil: "domcontentloaded" });
  const dashboard = page.locator('[data-executive-community-dashboard="true"]');
  const summary = page.locator('[data-daily-operating-summary="true"]');
  await summary.waitFor({ state: "visible" });
  if (await page.getByRole("tablist", { name: "Community views", exact: true }).count()) {
    throw new Error("The dashboard must not repeat its MARs and Incidents drilldowns as header tabs.");
  }
  await verifySelectedCommunityView(page, "Overview", "overview");
  if (await summary.getByRole("button", { name: "View MARs", exact: true }).count() !== 1 ||
      await summary.getByRole("button", { name: "View incidents", exact: true }).count() !== 1) {
    throw new Error("The overview must retain direct MARs and Incidents drilldowns.");
  }
  await summary.waitFor({ state: "visible" });

  const forbiddenCopy = /A current view of resident census|Community briefing|Select any area to open|How to read this|What is next/i;
  if (forbiddenCopy.test(await dashboard.innerText())) {
    throw new Error("The repeat-use dashboard reintroduced introductory or explanatory title copy.");
  }
  const panelKinds = await summary.locator("[data-executive-dashboard-panel]").evaluateAll((panels) => panels.map((panel) => panel.getAttribute("data-executive-dashboard-panel")).sort());
  if (JSON.stringify(panelKinds) !== JSON.stringify(["census", "incidents", "medications"])) {
    throw new Error("The overview must contain only census, incident, and medication components.");
  }
  if (await summary.locator("[data-executive-panel-tab]").count()) {
    throw new Error("Operating metrics must not be presented as file tabs.");
  }
  const panelVisuals = await summary.locator("[data-executive-dashboard-panel]").evaluateAll((panels) => panels.map((panel) => {
    const surface = window.getComputedStyle(panel);
    const heading = panel.querySelector("h2");
    const header = panel.querySelector("[data-executive-panel-header]");
    return {
      borderTopColor: surface.borderTopColor,
      headingSize: heading ? Number.parseFloat(window.getComputedStyle(heading).fontSize) : 0,
      headerBackground: header ? window.getComputedStyle(header).backgroundImage : "none"
    };
  }));
  if (new Set(panelVisuals.map((panel) => panel.borderTopColor)).size !== 3) {
    throw new Error(`The three operating components must remain visually distinct: ${JSON.stringify(panelVisuals)}`);
  }
  if (panelVisuals.some((panel) => panel.headingSize < 18)) {
    throw new Error(`Dashboard component headings are too small: ${JSON.stringify(panelVisuals)}`);
  }
  if (panelVisuals.some((panel) => panel.headerBackground === "none")) {
    throw new Error(`The operating components lost their rich header treatments: ${JSON.stringify(panelVisuals)}`);
  }
  if (await summary.locator("[data-executive-dashboard-tone]").count()) {
    throw new Error("The removed multi-color KPI strip must not return.");
  }
  if (await summary.locator('[data-executive-impending-summary="true"], [data-executive-referral-status="true"]').count()) {
    throw new Error("Client notifications must not return as an admissions panel in the overview.");
  }
  const notificationsTrigger = page.getByRole("button", { name: "New client notifications", exact: true });
  if (!await notificationsTrigger.getByText("New client", { exact: true }).isVisible()) {
    throw new Error("The desktop notification trigger must display the New client label.");
  }
  if (await notificationsTrigger.getAttribute("aria-expanded") !== "false" || await notificationsTrigger.getAttribute("data-executive-meet-client-trigger") == null) {
    throw new Error("New client notifications must start as a collapsed control.");
  }
  const notifications = await verifyNotifications(page, expectedImpendingCards);
  if (!/Sean Bobier[\s\S]*Oct 9[\s\S]*Nakya Hobbs[\s\S]*Oct 10[\s\S]*Carlos Vivanco[\s\S]*Oct 11[\s\S]*Deanna Bell[\s\S]*Date pending/i.test(await notifications.innerText())) {
    throw new Error("Notifications must retain date-safe scheduling and the unscheduled client's pending-date context.");
  }
  await page.screenshot({ path: `${screenshotDir}/desktop-client-notifications.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await notifications.waitFor({ state: "hidden" });
  if (!await notificationsTrigger.evaluate((element) => document.activeElement === element)) throw new Error("Escape must close client notifications and return focus to their trigger.");
  await verifyNotifications(page, expectedImpendingCards);
  await notificationsTrigger.click();
  await notifications.waitFor({ state: "hidden" });
  const desktopMetrics = await page.evaluate(() => {
    const root = document.querySelector('[data-executive-community-dashboard="true"]');
    const summary = document.querySelector('[data-executive-dashboard-panel="census"]');
    const rootRect = root?.getBoundingClientRect();
    const summaryRect = summary?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      summaryTop: summaryRect?.top ?? null,
      summaryBottom: summaryRect?.bottom ?? null,
      rootTop: rootRect?.top ?? null
    };
  });
  if (desktopMetrics.overflow > 2 || desktopMetrics.summaryTop == null || desktopMetrics.summaryTop > 270) {
    throw new Error(`The desktop dashboard is not compact enough: ${JSON.stringify(desktopMetrics)}`);
  }
  await page.screenshot({ path: `${screenshotDir}/desktop-1440.png`, fullPage: true });
  await auditTouchTargets(dashboard, "desktop-1440 overview");
  await auditHeader(page, "desktop-1440");

  for (const workspace of detailWorkspaces) {
    const detailModal = await openWorkspace(page, dashboard, workspace);
    if (await detailModal.getAttribute("data-executive-detail-material") !== workspace.material) {
      throw new Error(`The ${workspace.key} drill-down did not receive its own material treatment.`);
    }
    if (await detailModal.locator(workspace.identity).count() !== 1) {
      throw new Error(`The ${workspace.key} drill-down did not render its dedicated ${workspace.material} workspace.`);
    }
    const workspaceChrome = await page.evaluate((inline) => {
      const header = document.querySelector('[data-executive-director-header="true"]');
      const backdrop = document.querySelector(inline ? '[data-executive-community-workspace]' : '[data-executive-community-modal-backdrop="true"]');
      const headerRect = header?.getBoundingClientRect();
      const backdropRect = backdrop?.getBoundingClientRect();
      return {
        headerBottom: headerRect?.bottom ?? null,
        backdropTop: backdropRect?.top ?? null,
        wordmarkVisible: Boolean(header?.querySelector('img'))
      };
    }, Boolean(workspace.view));
    if (!workspaceChrome.wordmarkVisible || workspaceChrome.headerBottom == null || workspaceChrome.backdropTop == null || workspaceChrome.backdropTop < workspaceChrome.headerBottom - 1) {
      throw new Error(`The ${workspace.key} drill-down obscured or replaced the platform header: ${JSON.stringify(workspaceChrome)}`);
    }
    await auditWorkspace(page, detailModal, workspace, `desktop-1440 ${workspace.key}`);
    if (await detailModal.getByRole("tab", { name: /^(Census|Admissions|Incidents|Medications)$/ }).count()) {
      throw new Error(`The ${workspace.key} drill-down reintroduced the generic cross-domain tab strip.`);
    }
    if (workspace.key === "admissions") {
      if (await detailModal.locator('[data-executive-impending-admits="true"] [role="tab"]').count() !== expectedImpendingCards.length) {
        throw new Error("The admissions folder must contain one tab per impending admit.");
      }
      if (await detailModal.getByText(/Upcoming assessments|Referral charts|Received|In progress|Decision/, { exact: true }).count()) {
        throw new Error("The admissions drill-down must not reproduce Pipeline stages or assessment workflow.");
      }
      if (await detailModal.locator('[data-admissions-folder-shell="true"]').count() !== 1 || await detailModal.locator('[data-admissions-record-sheet="true"]').count() !== 1 || await detailModal.locator('[data-admissions-record-row="true"]').count() < 5 || await detailModal.locator('[data-admissions-folder-panel="true"]').count() < 5 || await detailModal.locator('[data-admissions-folder-timeline="true"]').count() !== 1) {
        throw new Error("The admissions drill-down must render one coherent client record, operational panels, and readiness timeline.");
      }
      if (!/Referral ID[\s\S]*Planned move-in[\s\S]*Referral source[\s\S]*Community[\s\S]*Payer[\s\S]*Responsible person[\s\S]*Assessment[\s\S]*Documents[\s\S]*Open requirements[\s\S]*Admissions timeline/i.test(await detailModal.innerText())) {
        throw new Error("The admissions folder is missing required client-review sections.");
      }
    }
    await verifyPeriodSelection(detailModal, workspace.key, page);
    const detailCopy = await detailModal.innerText();
    if (/Governed monthly census|shown without portfolio|Client charts open the existing management review/i.test(detailCopy)) {
      throw new Error(`The ${workspace.key} drill-down reintroduced explanatory report copy.`);
    }
    if (workspace.view) await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${screenshotDir}/desktop-${workspace.key}-detail.png`, fullPage: false });
    await closeWorkspace(page, detailModal, workspace);
  }

  await summary.getByRole("button", { name: "View MARs", exact: true }).click();
  await page.locator('[data-executive-community-workspace="medications"]').waitFor({ state: "visible" });
  await verifySelectedCommunityView(page, "MARs", "mars");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-executive-community-workspace="medications"]').waitFor({ state: "visible" });
  await verifySelectedCommunityView(page, "MARs", "mars");
  if (await summary.count()) throw new Error("Reloading the MARs workspace must not fall back to the overview.");
  await page.goto(`${BASE_URL}/executive/dashboard?view=incidents`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-executive-community-workspace="incidents"]').waitFor({ state: "visible" });
  await verifySelectedCommunityView(page, "Incidents", "incidents");
  await page.getByRole("button", { name: "Back to overview", exact: true }).click();
  await summary.waitFor({ state: "visible" });
  await summary.getByRole("button", { name: "View MARs", exact: true }).click();
  await page.locator('[data-executive-community-workspace="medications"]').waitFor({ state: "visible" });
  const reopenedNotifications = await verifyNotifications(page, expectedImpendingCards);
  await reopenedNotifications.getByRole("button", { name: /Nakya Hobbs/ }).click();
  const meetClientModal = page.locator('[data-executive-community-detail-modal="admissions"]');
  await meetClientModal.waitFor({ state: "visible" });
  if (await meetClientModal.getByRole("tab", { name: "Nakya Hobbs", exact: true }).getAttribute("aria-selected") !== "true" || await meetClientModal.getByRole("heading", { name: "Nakya Hobbs", exact: true }).count() !== 1) {
    throw new Error("Selecting a client notification must open that client's own admissions folder.");
  }
  await meetClientModal.getByRole("button", { name: "Open full management chart" }).click();
  const clientProfile = page.locator('[data-admissions-progress-modal="true"]');
  await clientProfile.waitFor({ state: "visible" });
  if (!/Nakya Hobbs/.test(await clientProfile.innerText()) || /Sean Bobier|Deanna Bell/.test(await clientProfile.innerText())) {
    throw new Error("New client notifications must open the existing management profile for the selected impending admit.");
  }
  const chartFocusTarget = clientProfile.locator('[data-admissions-data-trigger="placement"]');
  await chartFocusTarget.focus();
  await refreshOnFocus(page);
  if (!await chartFocusTarget.evaluate((element) => document.activeElement === element)) {
    throw new Error("An unchanged dashboard refresh must preserve focus on the selected management chart control.");
  }
  await page.screenshot({ path: `${screenshotDir}/desktop-meet-client-profile.png`, fullPage: false });
  await clientProfile.getByRole("button", { name: "Close client file" }).click();
  await clientProfile.waitFor({ state: "hidden" });
  await meetClientModal.waitFor({ state: "visible" });
  if (await meetClientModal.getByRole("tab", { name: "Nakya Hobbs", exact: true }).getAttribute("aria-selected") !== "true") {
    throw new Error("Closing the management chart must return to the same client's custom admissions folder.");
  }
  await meetClientModal.getByRole("tab", { name: "Carlos Vivanco", exact: true }).click();
  await meetClientModal.getByRole("button", { name: "Open full management chart" }).click();
  await clientProfile.waitFor({ state: "visible" });
  if (!/Carlos Vivanco/.test(await clientProfile.innerText()) || /Nakya Hobbs/.test(await clientProfile.innerText())) {
    throw new Error("Switching folder tabs must update the client opened in the full management chart.");
  }
  await clientProfile.getByRole("button", { name: "Close client file" }).click();
  await clientProfile.waitFor({ state: "hidden" });
  await meetClientModal.waitFor({ state: "visible" });
  if (await meetClientModal.getByRole("tab", { name: "Carlos Vivanco", exact: true }).getAttribute("aria-selected") !== "true") {
    throw new Error("Closing a chart after switching folder tabs must preserve that newly selected client.");
  }
  await meetClientModal.getByRole("button", { name: /Close admissions detail/i }).click();
  await meetClientModal.waitFor({ state: "hidden" });
  await verifySelectedCommunityView(page, "MARs", "mars");
  await page.locator('[data-executive-community-workspace="medications"]').waitFor({ state: "visible" });
  const persistentNotifications = await verifyNotifications(page, expectedImpendingCards);
  await persistentNotifications.getByRole("button", { name: /Sean Bobier/ }).click();
  await meetClientModal.waitFor({ state: "visible" });
  await meetClientModal.getByRole("tab", { name: "Carlos Vivanco", exact: true }).click();
  if (await meetClientModal.getByRole("tab", { name: "Carlos Vivanco", exact: true }).getAttribute("aria-selected") !== "true") {
    throw new Error("A viewed notification must remain available for selection from the client folder tabs.");
  }

  const admittedCard = dashboardResponse.dashboard.admissions.cards.find((card) => card.clientName === "Carlos Vivanco");
  const previousStatus = admittedCard.status;
  admittedCard.status = "Admitted";
  const refreshedDashboard = page.waitForResponse((response) => response.url().includes("/api/platform/executive-director/dashboard") && response.ok());
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refreshedDashboard;
  await meetClientModal.waitFor({ state: "hidden" });
  await verifySelectedCommunityView(page, "MARs", "mars");
  const remainingCards = expectedImpendingCards.filter((card) => card !== admittedCard);
  const refreshedNotifications = await verifyNotifications(page, remainingCards);
  await page.screenshot({ path: `${screenshotDir}/desktop-client-notifications-after-admission.png`, fullPage: false });
  await notificationsTrigger.click();
  await refreshedNotifications.waitFor({ state: "hidden" });

  admittedCard.status = previousStatus;
  const restoredDashboard = page.waitForResponse((response) => response.url().includes("/api/platform/executive-director/dashboard") && response.ok());
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await restoredDashboard;
  await page.waitForFunction((count) => {
    return document.querySelector('[data-executive-notification-count="true"]')?.textContent === String(count);
  }, expectedImpendingCards.length);
  const beforeUnavailableNotifications = await verifyNotifications(page, expectedImpendingCards);
  await beforeUnavailableNotifications.getByRole("button", { name: /Carlos Vivanco/ }).click();
  await meetClientModal.waitFor({ state: "visible" });
  admissionsFeedUnavailable = true;
  await refreshOnFocus(page);
  await meetClientModal.getByRole("status").filter({ hasText: "Updates unavailable. Showing the last connected Pipeline data." }).waitFor({ state: "visible" });
  if (await meetClientModal.getByRole("tab", { name: "Carlos Vivanco", exact: true }).getAttribute("aria-selected") !== "true") {
    throw new Error("A disconnected refresh must preserve the open client folder and display its source warning.");
  }
  await meetClientModal.getByRole("button", { name: "Open full management chart" }).click();
  await clientProfile.waitFor({ state: "visible" });
  await clientProfile.getByRole("status").filter({ hasText: "Updates unavailable. Showing the last connected Pipeline data." }).waitFor({ state: "visible" });
  await clientProfile.getByRole("button", { name: "Close client file" }).click();
  await clientProfile.waitFor({ state: "hidden" });
  await meetClientModal.waitFor({ state: "visible" });
  await meetClientModal.getByRole("button", { name: /Close admissions detail/i }).click();
  await meetClientModal.waitFor({ state: "hidden" });
  const staleNotifications = await verifyNotifications(page, expectedImpendingCards);
  await staleNotifications.getByRole("status").filter({ hasText: "Updates unavailable. Showing the last connected Pipeline data." }).waitFor({ state: "visible" });
  await page.screenshot({ path: `${screenshotDir}/desktop-client-notifications-refresh-unavailable.png`, fullPage: false });
  await staleNotifications.getByRole("button", { name: /Carlos Vivanco/ }).click();
  await meetClientModal.waitFor({ state: "visible" });
  if (await meetClientModal.getByRole("tab", { name: "Carlos Vivanco", exact: true }).getAttribute("aria-selected") !== "true") {
    throw new Error("A temporarily unavailable admissions feed must retain the client's notification and review folder.");
  }
  await meetClientModal.getByRole("button", { name: /Close admissions detail/i }).click();
  await meetClientModal.waitFor({ state: "hidden" });
  admissionsFeedUnavailable = false;
  const recoveredDashboard = page.waitForResponse((response) => response.url().includes("/api/platform/executive-director/dashboard") && response.ok());
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await recoveredDashboard;
  const recoveredNotifications = await verifyNotifications(page, expectedImpendingCards);
  await recoveredNotifications.getByRole("status").waitFor({ state: "hidden" });
  await recoveredNotifications.getByRole("button", { name: /Carlos Vivanco/ }).click();
  await meetClientModal.waitFor({ state: "visible" });
  await meetClientModal.getByRole("button", { name: /Close admissions detail/i }).click();
  await meetClientModal.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Back to overview", exact: true }).click();
  await summary.waitFor({ state: "visible" });
  await verifySelectedCommunityView(page, "Overview", "overview");

  const censusWorkspace = detailWorkspaces.find((workspace) => workspace.key === "census");
  const censusDetail = await openWorkspace(page, dashboard, censusWorkspace);
  const censusFocusTarget = censusDetail.getByRole("tablist", { name: "Census month" }).getByRole("tab", { name: /^Sep\b/ });
  await censusFocusTarget.focus();
  admittedCard.status = "Admitted";
  await refreshOnFocus(page);
  await page.waitForFunction(() => document.querySelector('[data-executive-notification-count="true"]')?.textContent === "3");
  if (!await censusDetail.isVisible() || !await censusFocusTarget.evaluate((element) => document.activeElement === element)) {
    throw new Error("Admission of a previously closed client must not close Census or move focus behind its open modal.");
  }
  admittedCard.status = previousStatus;
  await refreshOnFocus(page);
  await page.waitForFunction(() => document.querySelector('[data-executive-notification-count="true"]')?.textContent === "4");
  await closeWorkspace(page, censusDetail, censusWorkspace);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const mobileMetrics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    width: document.documentElement.clientWidth,
    firstPanelTop: document.querySelector('[data-executive-dashboard-panel="census"]')?.getBoundingClientRect().top ?? 0
  }));
  if (mobileMetrics.overflow > 2 || mobileMetrics.width !== 390 || mobileMetrics.firstPanelTop <= 0) {
    throw new Error(`The mobile dashboard is not viewport-safe: ${JSON.stringify(mobileMetrics)}`);
  }
  await page.screenshot({ path: `${screenshotDir}/mobile-390.png`, fullPage: false });
  await auditTouchTargets(dashboard, "mobile-390 overview");
  await auditHeader(page, "mobile-390");
  await verifyNotifications(page, expectedImpendingCards);
  const mobileNotificationMetrics = await notifications.evaluate((element) => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    width: element.getBoundingClientRect().width,
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right
  }));
  if (mobileNotificationMetrics.overflow > 2 || mobileNotificationMetrics.width > 390 || mobileNotificationMetrics.left < -1 || mobileNotificationMetrics.right > 391) {
    throw new Error(`Mobile client notifications are not viewport-safe: ${JSON.stringify(mobileNotificationMetrics)}`);
  }
  await page.screenshot({ path: `${screenshotDir}/mobile-client-notifications.png`, fullPage: false });
  await notificationsTrigger.click();
  await notifications.waitFor({ state: "hidden" });
  const mobileDetailMetrics = [];
  for (const workspace of detailWorkspaces) {
    const mobileDetailModal = await openWorkspace(page, dashboard, workspace);
    const metrics = await measureWorkspace(page, workspace);
    mobileDetailMetrics.push(metrics);
    if (metrics.overflow > 2 || metrics.dialogOverflow > 2 || metrics.dialogWidth > 390 || metrics.dialogLeft < -1) {
      throw new Error(`The ${workspace.key} mobile drill-down is not viewport-safe: ${JSON.stringify(metrics)}`);
    }
    await page.screenshot({ path: `${screenshotDir}/mobile-${workspace.key}-detail.png`, fullPage: false });
    await auditWorkspace(page, mobileDetailModal, workspace, `mobile-390 ${workspace.key}`);
    await closeWorkspace(page, mobileDetailModal, workspace);
  }

  const intermediateViewportMetrics = [];
  for (const viewport of [{ label: "compact-320", width: 320, height: 568 }, { label: "tablet-768", width: 768, height: 1024 }, { label: "landscape-1024", width: 1024, height: 768 }, { label: "zoom-200-equivalent-720", width: 720, height: 450 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    const overviewMetrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      width: document.documentElement.clientWidth
    }));
    if (overviewMetrics.overflow > 2 || overviewMetrics.width !== viewport.width) {
      throw new Error(`The ${viewport.label} dashboard is not viewport-safe: ${JSON.stringify(overviewMetrics)}`);
    }
    await page.screenshot({ path: `${screenshotDir}/${viewport.label}.png`, fullPage: true });
    await auditTouchTargets(dashboard, `${viewport.label} overview`);
    await auditHeader(page, viewport.label);
    await verifyNotifications(page, expectedImpendingCards);
    await settleLayout(page);
    const popupBounds = await notifications.evaluate((element) => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom, viewport: window.innerWidth, viewportHeight: window.innerHeight, overflow: element.scrollWidth - element.clientWidth }));
    if (popupBounds.left < -1 || popupBounds.right > popupBounds.viewport + 1 || popupBounds.top < 0 || popupBounds.bottom > popupBounds.viewportHeight + 1 || popupBounds.overflow > 2) auditFindings.push({ label: viewport.label, issue: "Client notifications must stay inside the viewport without clipping.", ...popupBounds });
    const lastClientReachable = await notifications.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      const popup = element.getBoundingClientRect();
      const last = element.querySelector("li:last-child button")?.getBoundingClientRect();
      const reachable = Boolean(last && last.top >= popup.top && last.bottom <= popup.bottom + 1);
      element.scrollTop = 0;
      return reachable;
    });
    if (!lastClientReachable) auditFindings.push({ label: viewport.label, issue: "The last notification must remain fully reachable by scrolling its popup." });
    await page.screenshot({ path: `${screenshotDir}/${viewport.label}-client-notifications.png`, fullPage: false });
    await notificationsTrigger.click();
    await notifications.waitFor({ state: "hidden" });
    const details = [];
    for (const workspace of detailWorkspaces) {
      const modal = await openWorkspace(page, dashboard, workspace);
      const metrics = await measureWorkspace(page, workspace);
      details.push(metrics);
      if (metrics.overflow > 2 || metrics.dialogOverflow > 2 || metrics.dialogWidth > viewport.width || metrics.dialogLeft < -1) {
        auditFindings.push({ label: `${viewport.label} ${workspace.key}`, issue: "The drill-down must remain inside its viewport without clipping content.", ...metrics });
      }
      await page.screenshot({ path: `${screenshotDir}/${viewport.label}-${workspace.key}-detail.png`, fullPage: false });
      await auditWorkspace(page, modal, workspace, `${viewport.label} ${workspace.key}`);
      await closeWorkspace(page, modal, workspace);
    }
    intermediateViewportMetrics.push({ label: viewport.label, overviewMetrics, details });
  }

  const incidentHistoryResults = await auditFullIncidentHistory(page, incidentHistory);
  await writeFile(`${artifactDir}/formatting-audit.json`, JSON.stringify({ passed: auditFindings.length === 0, findings: auditFindings, measurements: auditMeasurements }, null, 2));
  if (auditFindings.length) throw new Error(`Executive dashboard formatting audit failed: ${JSON.stringify(auditFindings)}`);
  let expectedConflicts = incidentHistory.expectedConflicts;
  const unexpectedConsoleErrors = consoleErrors.filter((message) => {
    if (expectedConflicts && /^Failed to load resource: the server responded with a status of 409\b/.test(message)) { expectedConflicts -= 1; return false; }
    return true;
  });
  if (unexpectedConsoleErrors.length || requestFailures.length) {
    throw new Error(JSON.stringify({ consoleErrors: unexpectedConsoleErrors, requestFailures }));
  }
  await writeFile(`${artifactDir}/latest.json`, JSON.stringify({ desktopMetrics, mobileMetrics, mobileNotificationMetrics, mobileDetailMetrics, intermediateViewportMetrics, incidentHistory: incidentHistoryResults, notificationLifecycle: { initialClients: expectedImpendingCards.length, afterAdmission: remainingCards.length, removedClient: admittedCard.clientName, unavailableRefreshRetainedClients: true } }, null, 2));
  await context.close();
  console.log("Executive Director dashboard browser QA passed at 1440px, 1024px, 768px, 390px, 320px, and a 200% zoom-equivalent viewport.");
});
