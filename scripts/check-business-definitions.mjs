// Owner-approved business definitions in server/shared code: canonical daily
// census, effective-dated capacity, single incident priority scale, and the
// Ally-facing wording for admission, LOS and medication compliance/refusal.
// Synthetic rows only; no warehouse, Azure or Pipeline calls.
import assert from "node:assert/strict";
import { averageDailyCensus, buildDailyCensusRows, censusDay, censusEpisodes, censusOnDay, DAILY_CENSUS_BASIS } from "../shared/daily-census.mjs";
import { capacityOn, COMMUNITY_CAPACITY_HISTORY, currentCapacity } from "../shared/community-capacity.mjs";
import { ALAMO_FACILITIES } from "../shared/community-names.mjs";
import { deriveIncidentPriority, incidentPrioritySql } from "../shared/incident-priority.mjs";
import { BUSINESS_DEFINITIONS } from "../shared/business-definitions.mjs";
import { applySharedIncidentPriority } from "../server/platform-data.mjs";
import { buildExecutiveIncidentLiveSql } from "../server/executive-director-incidents-live.mjs";
import { ALLY_METRICS, deriveCensusMetricRows, planAllyMetricQuery } from "../server/ally-data-source.mjs";
import { ANALYST_SOURCES } from "../server/ally-analyst-catalog.mjs";

// 1. Census: admission day counted, discharge day not; invalid and admit-less rows skipped.
const rows = [
  { facility_id: "337", admit_date: "2026-03-01", discharge_date: "2026-03-03" },
  { facility_id: "337", admit_date: "2026-03-02", discharge_date: null },
  { facility_id: "337", admit_date: null, discharge_date: "2026-03-02" },
  { facility_id: "337", admit_date: "2026-03-05", discharge_date: "2026-03-04" },
  { facility_id: "342", admit_date: "2026-02-20", discharge_date: "2026-03-02" }
];
const episodes = censusEpisodes(rows);
assert.equal(episodes.length, 3, "no admit date = not an admission episode; discharge before admit fails countability");
const day = (value) => /** @type {number} */ (censusDay(value));
assert.deepEqual(["2026-03-01", "2026-03-02", "2026-03-03"].map((date) => censusOnDay(episodes.filter((row) => row.facilityId === "337"), day(date))), [1, 2, 1]);
assert.equal(averageDailyCensus(episodes.filter((row) => row.facilityId === "337"), day("2026-03-01"), day("2026-03-04")), 5 / 4);
assert.deepEqual(buildDailyCensusRows(rows, { from: "2026-03-01", through: "2026-03-02", facilityIds: ["337", "342"] }), [
  { Facility: "337", census_date: "2026-03-01", census: 1 }, { Facility: "337", census_date: "2026-03-02", census: 2 },
  { Facility: "342", census_date: "2026-03-01", census: 1 }, { Facility: "342", census_date: "2026-03-02", census: 0 }
]);
assert.equal(DAILY_CENSUS_BASIS, "daily census from admission episodes + countability");
for (const id of ["average_census", "month_end_census"]) {
  assert.equal(ALLY_METRICS[id].slice, "census_daily_by_community");
  assert.match(ALLY_METRICS[id].definition, /daily census from admission episodes \+ countability/);
}
assert.doesNotMatch(ALLY_METRICS.average_census.definition, /weekly|Not a daily census/i);
assert.match(ANALYST_SOURCES.census_daily_by_community.meaning, /daily census from admission episodes \+ countability/i);
// Derived metric rows (portfolio, no dimension) sum communities per day before averaging.
const plan = planAllyMetricQuery({ metrics: ["average_census", "month_end_census"], compare: "prior_period" }, { from: "2026-03-01", through: "2026-03-31" }, ["337", "342"]);
const [portfolio] = deriveCensusMetricRows(plan, plan.metrics, rows);
assert.equal(portfolio.period, "current");
assert.equal(portfolio.average_census, (2 + 2 + 29) / 31, "Mar 1: 2, Mar 2: 2, Mar 3-31: 1 each (communities summed per day)");
assert.equal(portfolio.month_end_census, 1); assert.equal(portfolio.month_end_census__prior, 1, "Feb 28: one 342 stay");

// 6. Capacity: effective-dated history seeded from the previous constants.
assert.equal(COMMUNITY_CAPACITY_HISTORY.length, 5);
assert.equal(capacityOn("337", "2026-07-29"), null, "unknown before the first effective date");
assert.deepEqual(capacityOn(337, "2026-07-30"), { facility: "337", effectiveFrom: "2026-07-30", operatingLimit: 175, licensedCapacity: 225 });
const history = [...COMMUNITY_CAPACITY_HISTORY, { facility: "337", effectiveFrom: "2026-12-01", operatingLimit: 180, licensedCapacity: 225 }];
assert.equal(capacityOn("337", "2026-11-30", history)?.operatingLimit, 175);
assert.equal(capacityOn("337", "2026-12-01", history)?.operatingLimit, 180, "a later record supersedes from its own date");
assert.equal(capacityOn("999", "2026-12-01"), null); assert.equal(capacityOn("337", "not a date"), null);
for (const facility of ALAMO_FACILITIES) {
  const record = currentCapacity(facility.facilityId);
  assert.deepEqual([facility.operatingLimit, facility.licensedCapacity, facility.capacityAsOf], [record?.operatingLimit, record?.licensedCapacity, "2026-07-30"], "community-names exports unchanged");
}

// 5. Incident priority: one scale for JS, live SQL, and published snapshot rows.
const sql = incidentPrioritySql({ sentinelEvent: "s", emergencyServicesNotified: "e", injuryOccurred: "i" });
assert(buildExecutiveIncidentLiveSql({ facilityId: "337", query: null, residentId: null, clientQuery: null, clientOffset: 0, category: null, incidentType: null, priority: null, year: null, sort: "date_desc", from: null, to: null, limit: 20, page: null })
  .includes(incidentPrioritySql({ sentinelEvent: "sentinel_event", emergencyServicesNotified: "emergency_services_notified", injuryOccurred: "injury_occurred" })), "live register uses the shared CASE");
assert.match(sql, /WHEN lower\(trim\(i\)\) IN \('yes', 'true', 'y', '1'\) THEN 'medium'/);
assert.throws(() => incidentPrioritySql({ sentinelEvent: "x; DROP", emergencyServicesNotified: "e", injuryOccurred: "i" }));
const published = applySharedIncidentPriority([
  { id: "a", priority: "HIGH", injury_occurred: true, police_called: false, flags: ["injury"], incident_type: "Aggression" },
  { id: "b", priority: "HIGH", injury_occurred: false, police_called: false, flags: [], incident_type: "Aggressive behavior" },
  { id: "c", priority: "LOW", injury_occurred: false, police_called: false, flags: ["sentinel"] },
  { id: "d", priority: "LOW", injury_occurred: false, police_called: true, flags: ["911"] }
]);
assert.deepEqual(published.map((row) => [row.priority, row.priority_level]), [["MEDIUM", "medium"], ["LOW", "unknown"], ["HIGH", "high"], ["HIGH", "high"]],
  "injury is medium and aggression keywords never raise priority");
assert.equal(deriveIncidentPriority({ sentinelEvent: false, emergencyServicesNotified: false, injuryOccurred: false }), "low");

// 2–4. Ally-facing wording names the approved definitions.
assert.match(BUSINESS_DEFINITIONS.admission.definition, /ElderMark admission episode with an admit date/);
assert.match(BUSINESS_DEFINITIONS.admission.definition, /planned arrivals .* assumed arrivals .* never admissions/);
assert.equal(BUSINESS_DEFINITIONS.completed_stay_los.name, "Completed-stay LOS");
assert.equal(BUSINESS_DEFINITIONS.current_length_of_stay.name, "Current length of stay");
assert.match(BUSINESS_DEFINITIONS.medication_compliance.definition, /Given administrations divided by scheduled non-PRN/);
assert.match(BUSINESS_DEFINITIONS.medication_refusal.definition, /not-given reason/);
for (const id of ["mar_daily_by_community_90d", "mar_daily_by_community_medication", "mar_monthly_by_community_medication"]) {
  assert.match(ANALYST_SOURCES[id].meaning, /given ÷ scheduled non-PRN/); assert.match(ANALYST_SOURCES[id].meaning, /not-given reason only/);
}
assert.match(ANALYST_SOURCES.resident_profile.meaning, /current length of stay/);

console.log("Business definitions: daily census, effective-dated capacity, single incident priority, admission/LOS/compliance wording passed.");
