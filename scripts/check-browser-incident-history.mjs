#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildExecutiveDirectorIncidentsResponse } from "../server/executive-director-incidents.mjs";
import { BASE_URL, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";

const { screenshotDir } = await prepareArtifactDirs("browser-incident-history");

const rows = Array.from({ length: 31 }, (_, index) => ({
  id: `history-${index}`, facility_id: index % 2 ? "344" : "337",
  client_name: `Resident ${index}`, incident_date: `2026-09-${String(30 - index % 30).padStart(2, "0")}`,
  incident_type: index % 2 ? "Fall" : "Medication issue", category: index % 2 ? "Fall" : "Medication Refusal",
  injury_occurred: index === 0 ? "yes" : "no", emergency_services_notified: index === 1 ? "yes" : "no",
  sentinel_event: index === 2 ? null : "no"
}));
rows.push({ id: "old-record", facility_id: "342", client_name: "Old Resident", incident_date: "2020-01-02", incident_type: "Other", category: "Other", injury_occurred: null, emergency_services_notified: null, sentinel_event: null });
const snapshot = {
  snapshot: { generated_at: "2026-10-12T12:00:00Z", as_of_date: "2026-10-12" },
  communities: { incidents: [] },
  reportsSummary: { toolContext: { tables: { incident_detail_history: rows } } }
};

await withBrowserQa(async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const requests = [];
  let connected = false;
  await page.route("**/api/platform/incidents/history?**", async (route) => {
    const url = new URL(route.request().url());
    const options = {
      facilityId: url.searchParams.get("facilityId") || "all", query: url.searchParams.get("q") || "",
      category: url.searchParams.get("category") || "", incidentType: url.searchParams.get("type") || "",
      priority: url.searchParams.get("priority") || "", year: url.searchParams.get("year") || "",
      sort: url.searchParams.get("sort") || "date_desc", from: url.searchParams.get("from") || "",
      to: url.searchParams.get("to") || "", cursor: url.searchParams.get("cursor") || "",
      limit: 25
    };
    requests.push(options);
    const response = buildExecutiveDirectorIncidentsResponse(snapshot, options, { allowPortfolio: true });
    if (connected) response.coverage = { ...response.coverage, status: "complete", note: "All records in the connected source are searchable." };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
  });
  await page.goto(`${BASE_URL}/incidents/history`, { waitUntil: "domcontentloaded" });
  const register = page.locator('[data-executive-incident-register="true"]');
  await register.locator('[data-executive-incident-row]').first().waitFor();
  assert.equal(await register.locator('[data-executive-incident-coverage="partial"]').count(), 1);
  assert.match(await register.locator('[data-executive-incident-coverage="partial"]').innerText(), /snapshot history|individual records/i);
  assert.equal(await register.locator('[data-executive-incident-row]').count(), 25);
  await page.screenshot({ path: `${screenshotDir}/desktop.png`, fullPage: false });
  await register.getByRole("navigation", { name: "Incident pages" }).getByRole("button", { name: "Next" }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-executive-incident-row]').length === 7);
  assert.equal(requests.at(-1).cursor.length > 0, true);
  await register.getByRole("combobox", { name: "Community" }).selectOption("344");
  await page.waitForFunction(() => document.querySelector('[data-executive-incident-matches]')?.textContent === "15");
  assert.equal(requests.at(-1).cursor, "", "Changing community must restart pagination.");
  await register.getByRole("button", { name: "Reset filters" }).click();
  await register.getByRole("combobox", { name: "Year occurred" }).selectOption("2020");
  await page.waitForFunction(() => document.querySelector('[data-executive-incident-matches]')?.textContent === "1");
  assert.match(await register.innerText(), /Old Resident/);
  await register.getByRole("button", { name: "Reset filters" }).click();
  await register.getByRole("combobox", { name: "Derived priority" }).selectOption("unknown");
  await page.waitForFunction(() => document.querySelector('[data-executive-incident-matches]')?.textContent === "2");
  assert.match(await register.innerText(), /Old Resident/);
  await register.getByRole("button", { name: "Reset filters" }).click();
  await register.getByRole("combobox", { name: "Sort by" }).selectOption("date_asc");
  await page.waitForFunction(() => document.querySelector('[data-executive-incident-row]')?.getAttribute('data-executive-incident-row') === "342:old-record");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${screenshotDir}/mobile-list.png`, fullPage: false });
  const toggle = register.getByRole("button", { name: /Filters/ });
  await toggle.click();
  assert.equal(await register.getByRole("combobox", { name: "Incident type" }).isVisible(), true);
  const layout = await page.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  assert.ok(layout.overflow <= 2, `Incident history must fit a phone: ${JSON.stringify(layout)}`);
  await page.screenshot({ path: `${screenshotDir}/mobile-filters.png`, fullPage: false });
  connected = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-executive-incident-coverage="complete"]').waitFor();
  assert.doesNotMatch(await page.locator('[data-executive-incident-coverage="complete"]').innerText(), /Partial published snapshot|Complete connected source/);
  await context.close();
  console.log("Portfolio incident history browser checks passed.");
});
