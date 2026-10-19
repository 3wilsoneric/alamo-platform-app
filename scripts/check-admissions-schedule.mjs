#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/features/admissions/schedule.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
});
const { buildAdmissionsMoveInSchedule, isAcceptedReferral } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

const card = (overrides = {}) => ({
  referralId: 1,
  clientName: "Future Client",
  status: "Accepted",
  plannedAdmissionDate: "2026-10-06",
  community: "Turlock",
  facilityId: "346",
  owner: "Admissions Owner",
  ...overrides
});
const publishedMoveIn = (overrides = {}) => ({
  referralId: 1,
  clientName: "Future Client",
  plannedAt: "2026-10-06T09:00:00-07:00",
  community: "Turlock",
  facilityId: "346",
  owner: "Admissions Owner",
  status: "Accepted",
  readiness: "ready",
  pipelineUrl: "https://alamo-pipeline.com/?referralId=1",
  ...overrides
});
const briefing = (coverage, plannedMoveIns) => ({
  coverage: { moveIns: coverage },
  plannedMoveIns
});
const pipeline = {
  status: "connected",
  board: {
    cards: [
      card(),
      card({ referralId: 2, clientName: "No Date", plannedAdmissionDate: null }),
      card({ referralId: 3, clientName: "Past Date", plannedAdmissionDate: "2026-10-01" }),
      card({ referralId: 4, clientName: "Denied Client", status: "Denied", plannedAdmissionDate: "2026-10-07" })
    ]
  }
};
const published = briefing(true, [
  publishedMoveIn(),
  publishedMoveIn({ referralId: 99, clientName: "Briefing Only", plannedAt: "2026-10-07T10:00:00-07:00" })
]);

assert.equal(isAcceptedReferral("Accepted"), true);
assert.equal(isAcceptedReferral("Awaiting admit"), true);
assert.equal(isAcceptedReferral("Denied"), false);

const connectedSchedule = buildAdmissionsMoveInSchedule(pipeline, published, "2026-10-04");
assert.deepEqual(connectedSchedule.map((event) => [event.referralId, event.clientName, event.date]), [
  [1, "Future Client", "2026-10-06"]
]);
assert.equal(connectedSchedule[0].detail, "Accepted · ready");

const briefingFallback = buildAdmissionsMoveInSchedule(null, published, "2026-10-04");
assert.deepEqual(briefingFallback.map((event) => event.referralId), [1, 99]);
assert.deepEqual(buildAdmissionsMoveInSchedule(null, briefing(false, [publishedMoveIn()]), "2026-10-04"), []);

console.log("admissions schedule reconciliation checks passed");
