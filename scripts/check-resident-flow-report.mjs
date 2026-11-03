import assert from "node:assert/strict";
import { ALAMO_FACILITIES } from "../shared/community-names.mjs";
import { buildResidentFlowReport } from "../server/resident-flow-report.mjs";

const snapshot = {
  snapshot: { as_of_date: "2026-02-02", generated_at: "2026-02-02T12:00:00Z" },
  reportsSummary: { toolContext: { tables: {
    resident_flow_monthly_by_community: ALAMO_FACILITIES.map((facility) => ({ facility_id: facility.facilityId, month_bucket: "2026-01", admissions: 1, discharges: 1 })),
    resident_episode_history: ALAMO_FACILITIES.flatMap((facility) => [
      { facility_id: facility.facilityId, admit_date: "2025-12-01", discharge_date: "2026-01-02" },
      { facility_id: facility.facilityId, admit_date: "2026-01-02", discharge_date: null }
    ]),
    census_weekly_by_community: ALAMO_FACILITIES.map((facility) => ({ facility_id: facility.facilityId, census_date: "2026-01-02", census: 1 }))
  } } }
};
const report = buildResidentFlowReport(snapshot);
assert.equal(report.totals.admissions, 5);
assert.equal(report.totals.discharges, 5);
assert.equal(report.totals.net, 0);
assert.equal(report.totals.bedDays, 155); // Each site has exactly one occupied bed for all 31 days.
assert.equal(report.totals.averageDailyCensus, 5);
assert.equal(report.totals.medianCompletedStayDays, 32);
assert.equal(report.reconciliation.weeklyCensusPoints, 5);
assert.equal(JSON.stringify(report).includes("resident_id"), false);
assert.equal(JSON.stringify(report).includes("admit_date"), false);

const community = ALAMO_FACILITIES[0];
const scoped = buildResidentFlowReport(snapshot, community.facilityId);
assert.equal(scoped.scope.kind, "community");
assert.equal(scoped.scope.label, community.shortName);
assert.equal(scoped.sites.length, 1);
assert.equal(scoped.totals.admissions, 1);
assert.equal(scoped.totals.discharges, 1);
assert.equal(scoped.totals.bedDays, 31);
assert.equal(scoped.monthly[0].bedDays, 31);
assert.equal(scoped.reconciliation.weeklyCensusPoints, 1);
assert.throws(() => buildResidentFlowReport(snapshot, "unknown"), /Unknown community/i);

const mismatch = structuredClone(snapshot);
mismatch.reportsSummary.toolContext.tables.census_weekly_by_community[0].census = 2;
assert.throws(() => buildResidentFlowReport(mismatch), /weekly census do not reconcile/i);

const missing = structuredClone(snapshot);
missing.reportsSummary.toolContext.tables.resident_flow_monthly_by_community.pop();
assert.throws(() => buildResidentFlowReport(missing), /complete year-to-date resident flow/i);
console.log("Resident flow report checks passed.");
