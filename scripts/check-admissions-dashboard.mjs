#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { buildAdmissionsDashboard } from "../server/admissions-dashboard.mjs";
import { normalizePipelineAdmissionsSummary } from "../server/pipeline-admissions-summary.mjs";

// Compile the browser validator so the builder and client contract cannot drift.
async function loadClientValidators() {
  const source = await readFile(new URL("../src/shared/api/platformResponseSchemas.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  return module.platformResponseValidators;
}

const weekly = (facilityId, weekStart, admissions, discharges) => ({
  facility_id: facilityId,
  week_start: weekStart,
  admissions,
  discharges,
  admitted_residents: "Resident A",
  discharged_residents: "Resident B"
});
const monthly = (facilityId, month, admissions, discharges) => ({
  facility_id: facilityId,
  month_bucket: month,
  admissions,
  discharges,
  admitted_residents: "Resident A",
  discharged_residents: "Resident B"
});

const snapshot = {
  snapshot: { generated_at: "2026-09-26T12:00:00.000Z", as_of_date: "2026-09-26" },
  reportsSummary: {
    toolContext: {
      tables: {
        community_operating_summary: [
          { facility_id: "337", facility_name: "A & A Health Services San Pablo", census: 151, census_delta: 6 },
          { facility_id: "342", facility_name: "Victoria's House", census: 38, census_delta: -1 }
        ],
        resident_flow_weekly_by_community: [
          weekly("337", "2026-09-14", 5, 2),
          weekly("342", "2026-09-14", 1, 1),
          weekly("337", "2026-09-21", 3, 0),
          // Future rows past the as-of date are ignored.
          weekly("337", "2026-09-28", 9, 9)
        ],
        resident_flow_monthly_by_community: [
          monthly("337", "2026-08", 20, 18),
          monthly("342", "2026-08", 2, 4),
          monthly("337", "2026-09", 8, 2),
          monthly("342", "2026-09", 1, 1)
        ]
      }
    }
  }
};

const dashboard = buildAdmissionsDashboard(snapshot);
assert.equal(dashboard.month, "2026-09");
assert.equal(dashboard.prior_month, "2026-08");
assert.equal(dashboard.portfolio.census, 189);
assert.equal(dashboard.portfolio.censusChange, 5);
assert.deepEqual(dashboard.portfolio.monthToDate, { admissions: 9, discharges: 3, net: 6 });
assert.deepEqual(dashboard.portfolio.lastMonth, { admissions: 22, discharges: 22, net: 0 });
assert.deepEqual(dashboard.portfolio.recentWeeks, { admissions: 9, discharges: 3, net: 6 });
assert.deepEqual(dashboard.weekly.map((point) => [point.period, point.partial]), [
  ["2026-09-14", false],
  ["2026-09-21", true]
]);
assert.equal(dashboard.communities[0].facilityId, "337");
assert.equal(dashboard.communities[0].occupancyPct, 86.3);
assert.deepEqual(dashboard.referral_pipeline, { status: "not_connected" });
assert.ok(!/Resident [AB]/.test(JSON.stringify(dashboard)), "resident names must never reach the admissions payload");

// Month rollover: January's prior month is the previous December.
assert.equal(buildAdmissionsDashboard({ snapshot: { as_of_date: "2027-01-03" } }).prior_month, "2026-12");

const month = (key, received, accepted) => ({ month: key, received, accepted, declined: 1, admitted: 0 });
const card = (overrides) => ({
  referral_id: 11,
  column: "in_progress",
  status: "Assessment scheduled",
  next_action: "Prepare assessment",
  community: "San Pablo",
  owner: "Andrew",
  priority: "standard",
  days_open: 6,
  days_since_update: 1,
  planned_admission_date: null,
  flags: { stale: false, unassigned: false, move_in_overdue: false },
  pipeline_path: "/?view=referrals&screen=packet&referralId=11&workspaceStage=assessment",
  ...overrides
});
const column = (key, label, statuses) => ({
  key,
  label,
  count: statuses.reduce((total, [, count]) => total + count, 0),
  statuses: statuses.map(([status, count]) => ({ status, count }))
});
const pipelinePayload = {
  contract_version: "2.0",
  generated_at: "2026-09-26T13:00:00.000Z",
  board: {
    total: 3,
    columns: [
      column("received", "Referral received", [["Referral received", 1]]),
      column("in_progress", "In progress", [["Assessment scheduled", 1]]),
      column("decision", "Decision", [["Awaiting admit", 1]])
    ],
    cards: [
      card({ client_name: "Leaked", dob: "1970-01-01" }),
      card({ referral_id: 12, column: "received", status: "Referral received", community: "Unassigned", owner: "Unassigned", flags: { stale: true, unassigned: true, move_in_overdue: false } }),
      card({ referral_id: 13, column: "decision", status: "Awaiting admit", community: "Victoria's House", planned_admission_date: "2026-09-20", flags: { stale: false, unassigned: false, move_in_overdue: true } })
    ],
    cards_truncated: false
  },
  metrics: { on_board: 3, stale: 1, unassigned: 1, awaiting_admission: 1 },
  upcoming_admissions: { next_7_days: 0, next_30_days: 0, past_planned_date: 1, no_planned_date: 0 },
  history: {
    month_outcomes: { month: "2026-09", received: 12, accepted: 5, declined: 2, admitted: 1 },
    monthly: [month("2026-08", 15, 6), month("2026-09", 12, 5)],
    decision_timing: { window_days: 90, median_days_to_decision: 4.5, decisions_counted: 9 }
  }
};
const summary = normalizePipelineAdmissionsSummary(pipelinePayload, "https://pipeline.example");
assert.equal(summary?.status, "connected");
assert.deepEqual(summary?.metrics, { onBoard: 3, stale: 1, unassigned: 1, awaitingAdmission: 1 });
assert.equal(summary?.board.cards[0].pipelineUrl, "https://pipeline.example/?view=referrals&screen=packet&referralId=11&workspaceStage=assessment");
assert.ok(!JSON.stringify(summary).includes("Leaked") && !JSON.stringify(summary).includes("1970"), "only documented fields pass through");
const reject = (cardOverrides) => normalizePipelineAdmissionsSummary({
  ...pipelinePayload,
  board: { ...pipelinePayload.board, cards: [card(cardOverrides)] }
});
assert.equal(reject({ pipeline_path: "https://evil.example/?x=1" }), null, "links must stay relative to Pipeline");
assert.equal(reject({ pipeline_path: "//evil.example/?x=1" }), null);
assert.equal(reject({ column: "archive" }), null);
assert.equal(reject({ flags: { stale: "yes", unassigned: false, move_in_overdue: false } }), null);
assert.equal(normalizePipelineAdmissionsSummary({ ...pipelinePayload, metrics: { ...pipelinePayload.metrics, on_board: -1 } }), null);
assert.equal(normalizePipelineAdmissionsSummary({ generated_at: "x" }), null);

const connected = buildAdmissionsDashboard(snapshot, { referralPipeline: summary });
const cardsById = new Map(connected.referral_pipeline.board.cards.map((row) => [row.referralId, row]));
assert.equal(cardsById.get(11)?.facilityId, "337");
assert.equal(cardsById.get(12)?.facilityId, null);
assert.equal(cardsById.get(13)?.facilityId, "342");
assert.deepEqual(connected.communities.find((row) => row.facilityId === "337")?.referrals, { onBoard: 1, inDecision: 0, needsAttention: 0 });
assert.deepEqual(connected.communities.find((row) => row.facilityId === "342")?.referrals, { onBoard: 1, inDecision: 1, needsAttention: 1 });
assert.deepEqual(connected.referral_trend, [
  { month: "2026-08", received: 15, accepted: 6, censusAdmissions: 22 },
  { month: "2026-09", received: 12, accepted: 5, censusAdmissions: 9 }
]);
assert.equal(dashboard.communities[0].referrals, null);
assert.deepEqual(dashboard.referral_trend, []);

const validators = await loadClientValidators();
validators.admissionsDashboard(dashboard);
validators.admissionsDashboard(connected);
assert.throws(() => validators.admissionsDashboard({ ...dashboard, referral_pipeline: { status: "bogus" } }));

console.log("admissions dashboard checks passed");
