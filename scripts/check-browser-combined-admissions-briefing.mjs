#!/usr/bin/env node
import assert from "node:assert/strict";
import { BASE_URL, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";

const { screenshotDir } = await prepareArtifactDirs("browser-combined-admissions-briefing-qa");
const shift = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

await withBrowserQa(async (browser) => {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.route("**/api/platform/admissions-dashboard", async (route) => {
      const response = await route.fetch();
      const dashboard = await response.json();
      const { weekStart, weekEnd } = dashboard.briefing;
      const lastWeekStart = shift(weekStart, -7);
      const lastWeekEnd = shift(weekStart, -1);
      dashboard.briefing.sourceStatus = "ready";
      dashboard.briefing.coverage = { recentReferrals: true, assessments: true, moveIns: true, weeklyTrend: true, completedMoveIns: true };
      dashboard.briefing.upcomingAssessments = [{ referralId: 104, clientName: "Sam Example", scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), community: "San Pablo", facilityId: "337", owner: "Assessor", status: "Scheduled", pipelineUrl: "https://alamo-pipeline.com/?view=referrals&referralId=104" }];
      dashboard.referral_pipeline = {
        status: "connected", generatedAt: new Date().toISOString(),
        board: { total: 0, truncated: false, cards: [], columns: [
          { key: "received", label: "Referral received", count: 0, statuses: [] },
          { key: "in_progress", label: "In progress", count: 0, statuses: [] },
          { key: "decision", label: "Decision", count: 0, statuses: [] }
        ] },
        metrics: { onBoard: 0, activeReferrals: 0, stale: 0, unassigned: 0, awaitingAdmission: 0 },
        upcomingAdmissions: { next7Days: 0, next30Days: 0, pastPlannedDate: 0, noPlannedDate: 0 },
        briefing: {
          status: "ready", timezone: "America/Los_Angeles", windowEnd: weekStart, weekStart, weekEnd,
          lastWeekStart, lastWeekEnd,
          coverage: { recentReferrals: true, assessments: true, moveIns: true, weeklyTrend: true, admittedLastWeek: true, movingThrough: true, didNotMoveIn: true },
          recentReferrals: [], upcomingAssessments: [], weeklyTrend: [],
          admittedLastWeek: [{ referralId: 101, clientName: "Alex Example", admittedAt: lastWeekEnd, community: "San Pablo", facilityId: "337", owner: "Alex Assessor", sourceName: "County referral", referringCounty: "Contra Costa", priorPlacement: "Acute hospital", pipelineUrl: "https://alamo-pipeline.com/?view=referrals&referralId=101" }],
          plannedMoveIns: [{ referralId: 102, clientName: "Morgan Example", plannedAt: weekEnd, community: "Turlock", facilityId: "342", owner: "Assessor", status: "Awaiting admit", readiness: "watch", sourceName: "Hospital", referringCounty: null, priorPlacement: null, pipelineUrl: "https://alamo-pipeline.com/?view=referrals&referralId=102" }],
          movingThrough: [
            { referralId: 103, clientName: "Jordan Example", stage: "decision", phase: "needs_date", plannedAt: null, status: "Accepted · no planned admit date", community: "San Pablo", facilityId: "337", owner: "Assessor", sourceName: "County referral", referringCounty: "Contra Costa", priorPlacement: "Acute hospital", pipelineUrl: "https://alamo-pipeline.com/?view=referrals&referralId=103" },
            { referralId: 105, clientName: "Taylor Example", stage: "decision", phase: "awaiting_arrival", plannedAt: shift(weekStart, -1), status: "Awaiting admit", community: "Turlock", facilityId: "342", owner: "Other assessor", sourceName: "Hospital", referringCounty: null, priorPlacement: null, pipelineUrl: "https://alamo-pipeline.com/?view=referrals&referralId=105" }
          ],
          didNotMoveIn: [{ referralId: 106, clientName: "Casey Example", cancelledAt: new Date().toISOString(), status: "Did not move in", community: "San Pablo", facilityId: "337", owner: "Alex Assessor", sourceName: "County referral", referringCounty: "Contra Costa", priorPlacement: "Acute hospital", pipelineUrl: "https://alamo-pipeline.com/?view=referrals&referralId=106" }]
        },
        history: { coverageStartMonth: null, monthOutcomes: { month: weekStart.slice(0, 7), received: 0, accepted: 0, declined: 0, admitted: 0 }, monthly: [], decisionTiming: { windowDays: 90, medianDaysToDecision: null, decisionsCounted: 0 } }
      };
      await route.fulfill({ response, json: dashboard });
    });
    await page.goto(`${BASE_URL}/admissions`, { waitUntil: "domcontentloaded" });
    const combined = page.locator('[data-admissions-combined-briefing="true"]');
    await combined.waitFor({ state: "visible", timeout: 60_000 });
    const colors = await combined.evaluate((element) => ({
      topBorder: getComputedStyle(element).borderTopColor,
      paper: getComputedStyle(element).backgroundColor,
      censusTotal: getComputedStyle(element.querySelector('[data-admissions-census-total="true"]')).color,
      censusBar: getComputedStyle(element.querySelector('[data-admissions-census-bar="true"]')).backgroundColor
    }));
    assert.equal(colors.topBorder, "rgb(22, 77, 124)", `${width}px report should use the Platform blue edge`);
    assert.equal(colors.paper, "rgb(252, 251, 247)", `${width}px report should use Platform paper`);
    assert.equal(colors.censusTotal, "rgb(22, 77, 124)", `${width}px census total should use Platform blue`);
    assert.equal(colors.censusBar, "rgb(27, 90, 139)", `${width}px census bars should use Platform blue`);
    assert.match(await combined.innerText(), /Census by community/);
    assert.match(await combined.innerText(), /Alex Example[\s\S]*Morgan Example/);
    assert.match(await combined.innerText(), /Origin: County referral · County: Contra Costa · Prior placement: Acute hospital · Assessor: Alex Assessor/);
    assert.doesNotMatch(await combined.innerText(), /Clients moving through|Jordan Example|Taylor Example|Date passed/);
    assert.match(await combined.innerText(), /Did not move in[\s\S]*Casey Example/);
    assert.equal(await combined.locator('a[href^="https://alamo-pipeline.com/"]').count(), 3);
    const censusSection = combined.locator('[data-admissions-census-section="true"]');
    assert.equal(await censusSection.locator('[data-admissions-census-name="true"]').count(), 5);
    assert.equal(await censusSection.locator("a").count(), 0, "community names must not offer a drill-down");
    assert.doesNotMatch(await censusSection.innerText(), /↗/, "community names must not show link arrows");
    assert.equal(await page.locator('[data-admissions-executive-update="true"]').count(), 0);
    await page.getByRole("tab", { name: /Schedule/ }).click();
    assert.equal(await page.locator('[data-admissions-dashboard-page="schedule"]').count(), 1);
    await page.getByRole("tab", { name: /This week/ }).click();
    await combined.waitFor({ state: "visible" });
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(horizontalOverflow <= 1, `${width}px briefing overflows by ${horizontalOverflow}px`);
    await page.screenshot({ path: `${screenshotDir}/${width}-combined-briefing.png`, fullPage: true });
    await context.close();
  }
  console.log("combined admissions briefing browser checks passed");
});
