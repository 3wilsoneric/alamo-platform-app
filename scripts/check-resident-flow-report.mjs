import assert from "node:assert/strict";
import { ALAMO_FACILITIES } from "../shared/community-names.mjs";
import { buildResidentFlowReport } from "../server/resident-flow-report.mjs";
const snapshot = {
  snapshot: { as_of_date: "2026-02-02", generated_at: "2026-02-02T12:00:00Z" },
  reportsSummary: { toolContext: { tables: {
    resident_flow_monthly_by_community: ALAMO_FACILITIES.map((facility) => ({ facility_id: facility.facilityId, month_bucket: "2026-01", admissions: 1, discharges: 1 })),
    resident_episode_history: ALAMO_FACILITIES.flatMap((facility) => [
      { episode_id: `${facility.facilityId}-old`, resident_name: "Previous client", facility_id: facility.facilityId, admit_date: "2025-12-01", discharge_date: "2026-01-02", admission_county: "Alameda" },
      { episode_id: `${facility.facilityId}-new`, resident_name: "New client", facility_id: facility.facilityId, admit_date: "2026-01-02", discharge_date: null, admission_county: "Contra Costa County" }
    ]),
    census_weekly_by_community: ALAMO_FACILITIES.map((facility) => ({ facility_id: facility.facilityId, census_date: "2026-01-02", census: 1 }))
  } } }
};
const report = buildResidentFlowReport(snapshot);
assert.equal(report.totals.admissions, 5); assert.equal(report.totals.discharges, 5);
assert.equal(report.totals.net, 0); assert.equal(report.totals.bedDays, 165);
assert.equal(report.period.through, "2026-02-02"); assert.equal(report.totals.averageDailyCensus, 5);
assert.equal(report.totals.medianCompletedStayDays, 32); assert.equal(report.reconciliation.weeklyCensusPoints, 5);
assert.equal(report.records.length, 10); assert.equal(report.totals.movedInAndOut, 0);
assert.deepEqual(report.counties.rows, [{ county: "Contra Costa", admissions: 5 }]);
assert.equal(JSON.stringify(report).includes("resident_id"), false);
assert.equal(JSON.stringify(report).includes("birth_date"), false);
const range = buildResidentFlowReport(snapshot, null, '2026', {from:'2026-01-02',through:'2026-01-02'});
assert.equal(range.totals.admissions,5); assert.equal(range.totals.discharges,5); assert.equal(range.totals.bedDays,5); assert.equal(range.totals.openingCensus,5); assert.equal(range.totals.closingCensus,5);
const after = buildResidentFlowReport(snapshot, null, '2026', {from:'2026-01-03',through:'2026-01-04'});
assert.equal(after.totals.admissions,0); assert.equal(after.totals.discharges,0); assert.equal(after.totals.bedDays,10);
assert.throws(()=>buildResidentFlowReport(snapshot,null,'2026',{from:'2025-12-31',through:'2026-01-02'}),/within the selected year/);
const community = ALAMO_FACILITIES[0];
const scoped = buildResidentFlowReport(snapshot, community.facilityId);
assert.equal(scoped.scope.label, community.shortName); assert.equal(scoped.sites.length, 1);
assert.equal(scoped.totals.admissions, 1); assert.equal(scoped.totals.discharges, 1); assert.equal(scoped.totals.bedDays, 33);
assert.equal(scoped.records.length, 2); assert.ok(scoped.records.every((row) => row.facilityId === community.facilityId));
assert.throws(() => buildResidentFlowReport(snapshot, "unknown"), /Unknown community/i);
for (const year of ["2025", "2027", "2026.5", "oops"]) assert.throws(() => buildResidentFlowReport(snapshot, null, year), /available report year/);
const tables = (value) => value.reportsSummary.toolContext.tables;
const mismatch = structuredClone(snapshot); tables(mismatch).census_weekly_by_community[0].census = 2;
assert.throws(() => buildResidentFlowReport(mismatch), /weekly census do not reconcile/i);
const missing = structuredClone(snapshot); tables(missing).resident_flow_monthly_by_community.pop();
assert.throws(() => buildResidentFlowReport(missing), /incomplete community rows/i);
const badDate = structuredClone(snapshot); tables(badDate).resident_episode_history[0].admit_date = "2026-02-30";
assert.throws(() => buildResidentFlowReport(badDate), /invalid date/i);
const duplicate = structuredClone(snapshot); tables(duplicate).resident_episode_history.push(tables(duplicate).resident_episode_history[0]);
assert.throws(() => buildResidentFlowReport(duplicate), /duplicate review/i);
const churn = structuredClone(snapshot);
tables(churn).resident_episode_history.push({ episode_id: "new-feb", resident_name: "A second stay", facility_id: community.facilityId, admit_date: "2026-02-01", discharge_date: "2026-02-02", admission_county: "San Bernadino", ssn: "must-not-leak" });
const updated = buildResidentFlowReport(churn);
assert.equal(updated.totals.admissions, 6); assert.equal(updated.totals.discharges, 6); assert.equal(updated.totals.movedInAndOut, 1); assert.equal(updated.totals.dischargedWithin30Days, 1);
assert.equal(updated.totals.bedDays, 166); assert.equal(updated.totals.closingCensus, 5);
assert.ok(updated.counties.rows.some((row) => row.county === "San Bernardino")); assert.equal(JSON.stringify(updated).includes("must-not-leak"), false);
const unknown = structuredClone(snapshot); tables(unknown).resident_episode_history[1].admission_county = null;
assert.equal(buildResidentFlowReport(unknown).counties.rows.find((row) => row.county === "Not recorded").admissions, 1);
const absent = structuredClone(snapshot); delete tables(absent).resident_episode_history[1].admission_county;
assert.equal(buildResidentFlowReport(absent).counties.available, false);
const firstDay = structuredClone(snapshot); firstDay.snapshot.as_of_date = "2027-01-01";
tables(firstDay).census_weekly_by_community = ALAMO_FACILITIES.map((facility) => ({ facility_id: facility.facilityId, census_date: "2026-12-31", census: 1 }));
const newYear = buildResidentFlowReport(firstDay); assert.equal(newYear.period.year, 2027); assert.equal(newYear.totals.admissions, 0); assert.deepEqual(newYear.counties.rows, []); assert.equal(newYear.totals.bedDays, 5);
console.log("Client flow: scope, current month, year rollover, county normalization, churn, source reconciliation and privacy checks passed.");
