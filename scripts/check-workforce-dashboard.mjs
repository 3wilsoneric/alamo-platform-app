#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getWorkforceSummary, normalizeWorkforceSummary } from "../server/workforce-summary.mjs";

const totals = (overrides = {}) => ({
  active: 7, onboarding: 1, onLeave: 1, openRoles: 14, applicants: 10, phase1: 5, phase2: 3, phase3: 2,
  expired: 4, expiring: 3, missing: 2, staffBlockedFromScheduling: 3, complianceRate: 0.41, ...overrides
});
const payload = () => ({
  schemaVersion: 1,
  generatedAt: "2026-09-29T17:00:00Z",
  overview: {
    asOf: "2026-09-29",
    portfolio: totals(),
    communities: [{ community: "San Pablo", totals: totals() }],
    roles: [{ discipline: "psychiatric_technician", label: "Psych tech", totals: totals() }],
    openPositions: [{
      title: "Psych Tech - Nights", community: "San Pablo", discipline: "psychiatric_technician", roleLabel: "Psych tech",
      openings: 3, openedOn: "2026-08-04", daysOpen: 56, phase1: 1, phase2: 1, phase3: 1,
      path: "/hiring?position=0f6b2c3e-9a1d-4c55-8e21-3b7d9f0a1c42"
    }],
    phaseNames: { 1: "Screening", 2: "Interview", 3: "Offer and clearance" },
    upcomingExpirations: [{ community: "San Pablo", label: "BLS / CPR", expiresOn: "2026-10-04", people: 2, blocksScheduling: true }]
  }
});

const summary = normalizeWorkforceSummary(payload(), "https://workforce.example");
assert.equal(summary.status, "connected");
assert.equal(summary.workforceUrl, "https://workforce.example");
assert.deepEqual(summary.phaseNames, ["Screening", "Interview", "Offer and clearance"]);
assert.equal(summary.communities[0].totals.openRoles, 14);
assert.equal(summary.openPositions[0].openings, 3);
assert.equal(summary.openPositions[0].discipline, "psychiatric_technician");
assert.equal(summary.openPositions[0].url, "https://workforce.example/hiring?position=0f6b2c3e-9a1d-4c55-8e21-3b7d9f0a1c42");
assert.deepEqual(summary.upcomingExpirations[0], { community: "San Pablo", label: "BLS / CPR", expiresOn: "2026-10-04", people: 2, blocksScheduling: true });
const olderProducer = payload();
delete olderProducer.overview.upcomingExpirations;
assert.deepEqual(normalizeWorkforceSummary(olderProducer).upcomingExpirations, [], "older producers omit expirations");
// A path that could leave the Workforce origin is dropped rather than linked.
const offsite = payload();
offsite.overview.openPositions[0].path = "//evil.example/hiring?position=0f6b2c3e-9a1d-4c55-8e21-3b7d9f0a1c42";
assert.equal(normalizeWorkforceSummary(offsite, "https://workforce.example").openPositions[0].url, null);
// Only contract fields pass through; anything extra (for example a name) is dropped.
const withExtra = payload();
withExtra.overview.openPositions[0].hiringManager = "Should Not Appear";
assert.equal(JSON.stringify(normalizeWorkforceSummary(withExtra)).includes("Should Not Appear"), false);

const rejects = (mutate, reason) => {
  const candidate = payload();
  mutate(candidate);
  assert.equal(normalizeWorkforceSummary(candidate), null, reason);
};
rejects((p) => { p.schemaVersion = 2; }, "unknown schema version");
rejects((p) => { p.overview.portfolio.openRoles = -1; }, "negative count");
rejects((p) => { p.overview.portfolio.applicants = 11; }, "phases must sum to applicants");
rejects((p) => { p.overview.portfolio.complianceRate = 1.4; }, "rate out of range");
rejects((p) => { p.overview.asOf = "09/29/2026"; }, "non-ISO date");
rejects((p) => { delete p.overview.phaseNames[2]; }, "missing phase name");
rejects((p) => { p.overview.openPositions[0].openings = "3"; }, "string count");
rejects((p) => { p.overview.upcomingExpirations[0].people = 0; }, "empty expiration group");
rejects((p) => { p.overview.upcomingExpirations[0].blocksScheduling = "yes"; }, "non-boolean flag");
rejects((p) => { p.overview.communities = Array.from({ length: 41 }, () => ({ community: "X", totals: totals() })); }, "row bound");

delete process.env.WORKFORCE_SUMMARY_URL;
delete process.env.WORKFORCE_SUMMARY_TOKEN;
assert.deepEqual(await getWorkforceSummary(), { status: "not_connected" });

const root = path.resolve(import.meta.dirname, "..");
const [app, navigation, platformApi, devApi, pageSource, briefingSource, staffingSource] = await Promise.all([
  readFile(path.join(root, "src/app/App.tsx"), "utf8"),
  readFile(path.join(root, "src/features/california/components/PlatformPageNavigation.tsx"), "utf8"),
  readFile(path.join(root, "api/platform.js"), "utf8"),
  readFile(path.join(root, "server/dev-api.mjs"), "utf8"),
  readFile(path.join(root, "src/features/workforce/pages/WorkforcePage.tsx"), "utf8"),
  readFile(path.join(root, "src/features/workforce/components/WorkforceBriefing.tsx"), "utf8"),
  readFile(path.join(root, "src/features/workforce/components/StaffingMap.tsx"), "utf8")
]);
const page = [pageSource, briefingSource, staffingSource].join("\n");
assert.match(app, /path="\/workforce"/);
assert.match(navigation, /id: "workforce", label: "Workforce", href: "\/workforce"/);
assert.match(platformApi, /"\/api\/platform\/workforce-dashboard": \(\) => getWorkforceDashboardData\(\)/);
assert.match(devApi, /\/api\/platform\/workforce-dashboard/);
for (const surface of ["Briefing", "Expiring in 30 days", "Offers and clearance", "No candidates yet", "Needs candidates", "Interviewing", "Ready to hire", "Staffing by community", "Filter by community", "Filter by role"]) {
  assert.ok(page.includes(surface), `Workforce page shows ${surface}`);
}

console.log("Workforce dashboard contract checks passed.");
