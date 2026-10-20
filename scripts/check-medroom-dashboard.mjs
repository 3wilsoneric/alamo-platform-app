#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildMedroomDashboard } from "../server/medroom-dashboard.mjs";
import { assertMedroomAccess } from "../server/medroom-access.mjs";

const countFields = { scheduled_count: 10, given_count: 8, not_given_count: 1, pending_count: 1, missed_count: 0, late_given_count: 2, refused_count: 1, held_count: 0, other_not_given_count: 0, prn_given_count: 2 };
const facilities = ["337", "342", "343", "344", "345"];
const daily = Array.from({ length: 90 }, (_, index) => new Date(Date.parse("2026-10-19T00:00:00Z") - index * 86_400_000).toISOString().slice(0, 10))
  .flatMap(administration_date => facilities.map(facility_id => ({ facility_id, administration_date, ...countFields })));
const prn = [{ administration_date: "2026-10-19", has_effectiveness_followup: false }];
const orders = [
  { facility_id: "337", resident_id: "private-1", resident_name: "Never return me", medication_name: "Test med", medication_order_id: "one", dosage: "1 mg", route: "PO", schedule: "daily" },
  { facility_id: "337", resident_id: "private-1", resident_name: "Never return me", medication_name: "Test med", medication_order_id: "two", dosage: "1 mg", route: "PO", schedule: "daily" }
];
const snapshot = {
  snapshot: { as_of_date: "2026-10-20" },
  reportsSummary: { medicationCompliance: facilities.map(facility_id => ({ facility_id, month_bucket: "2026-10", total_scheduled: 190, given: 152 })), toolContext: {
    manifest: [
      { slice_name: "mar_daily_by_community_90d", row_count: daily.length },
      { slice_name: "mar_prn_effectiveness_90d", row_count: prn.length },
      { slice_name: "mar_medication_orders_current", row_count: orders.length }
    ],
    tables: { mar_daily_by_community_90d: daily, mar_prn_effectiveness_90d: prn, mar_medication_orders_current: orders }
  } }
};

const result = buildMedroomDashboard(snapshot);
assert.equal(result.windows[7].scheduled_count, 350);
assert.equal(result.windows[30].scheduled_count, 1500);
assert.equal(result.windows[60].scheduled_count, 3000);
assert.equal(result.windows[90].scheduled_count, 4500);
assert.equal(result.windows[7].from, "2026-10-13");
assert.equal(result.windows[7].through, "2026-10-19");
assert.equal(result.windows[7].completion_pct, 80);
assert.equal(result.current_month.refused_count, 95);
assert.equal(result.monthly_reconciliation.matches, true);
assert.equal(result.prn_followup.documented, 0);
assert.equal(result.possible_duplicate_orders, 1);
assert.deepEqual(result.watch.map((row) => row.code), ["pending_outcome", "late_given", "prn_followup", "possible_duplicate_order"]);
assert(!JSON.stringify(result).includes("Never return me"), "resident names must never reach the browser");
assert(!JSON.stringify(result).includes("private-1"), "resident IDs must never reach the browser");
assert(!JSON.stringify(result).includes("Test med"), "medication order details must never reach the browser");

const incomplete = structuredClone(snapshot);
incomplete.reportsSummary.toolContext.manifest[0].row_count += 1;
const partial = buildMedroomDashboard(incomplete);
assert.equal(partial.daily_available, false);
assert.equal(partial.windows[7], null);
assert.equal(partial.current_month, null);
const corrupt = structuredClone(snapshot);
corrupt.reportsSummary.toolContext.tables.mar_daily_by_community_90d[0].pending_count = 4;
assert.equal(buildMedroomDashboard(corrupt).daily_available, false, "daily numerator/denominator mismatch must fail closed");
const provisional = structuredClone(snapshot);
provisional.reportsSummary.toolContext.tables.mar_daily_by_community_90d[0].administration_date = "2026-10-20";
assert.equal(buildMedroomDashboard(provisional).daily_available, false, "current-day scheduled doses must not enter completed-day windows");

const auth = (oid) => ({ authenticated: true, mode: "entra-delegated", claims: { oid, tid: "d72d9036-cff8-4f5f-a6fa-d698f621d420" } });
assert.doesNotThrow(() => assertMedroomAccess(auth("f73371d5-d2b4-48b4-a32b-1edc7c88869f")));
assert.throws(() => assertMedroomAccess(auth("424b21d4-605a-43a6-8dff-2a89a846e698")), { statusCode: 404 });
assert.throws(() => assertMedroomAccess(auth("75099b5b-5f7d-437f-8e3b-181f1fea1653")), { statusCode: 404 });
assert.throws(() => assertMedroomAccess({ ...auth("f73371d5-d2b4-48b4-a32b-1edc7c88869f"), claims: { oid: "f73371d5-d2b4-48b4-a32b-1edc7c88869f", tid: "another-tenant" } }), { statusCode: 404 });

console.log("Med-room aggregate windows, source coverage, owner-only access, and PHI redaction verified.");
