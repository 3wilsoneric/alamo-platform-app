import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getMondayCensusEmailSubject,
  normalizeMondayCensusEmail,
  renderMondayCensusEmail
} from "../shared/monday-census-email.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(await readFile(
  path.join(root, "scripts/fixtures/monday-census-email.sanitized.json"),
  "utf8"
));
const report = normalizeMondayCensusEmail(fixture);
const html = renderMondayCensusEmail(fixture);

assert.equal(report.portfolio.currentCensus, 538);
assert.equal(report.portfolio.priorCensus, 533);
assert.equal(report.communities.length, 5);
assert.equal(report.communities.reduce((total, row) => total + row.currentCensus, 0), 538);
assert.equal(report.pipeline?.acceptedPendingTotal, 9);
assert.equal(report.pipeline?.acceptedLast7Days, 4);
assert.equal(report.pipeline?.expectedNext7Days, 3);
assert.equal(report.pipeline?.withoutExpectedDate, 2);
assert.equal(getMondayCensusEmailSubject(fixture), "Weekly census change | 538 residents | +5");
assert.match(html, /role="presentation"/);
assert.match(html, /width="680"/);
assert.match(html, /Prototype · sanitized aggregate data · not sent/);
assert.match(html, /Weekly census change/);
assert.equal((html.match(/class="metric-cell"/g) ?? []).length, 4);
assert.match(html, /Pending admission/);
assert.match(html, /Pipeline sample only/);
assert.match(html, /Seven-day census change/);
assert.match(html, /Green indicates an increase · rust indicates a decrease · gray indicates no change/);
assert.match(html, /portfolio census increased by 5, from 533 to 538\./);
assert.match(html, /3 communities increased, none decreased, and 2 were unchanged\./);
assert.match(html, /Santa Clarita had the largest community movement at \+3\./);
assert.match(html, /sample Pipeline outlook contains 9 accepted referrals pending admission/);
assert.match(html, /https:\/\/www\.alamoplatform\.com\/admissions/);
assert.doesNotMatch(html, /Community census/);
assert.doesNotMatch(html, /Destination community/);
assert.doesNotMatch(html, /<script\b/i);
assert.doesNotMatch(html, /display:\s*(?:flex|grid)/i);
assert.ok(Buffer.byteLength(html, "utf8") < 90 * 1024, "Email should stay below common clipping thresholds.");

const mismatched = structuredClone(fixture);
mismatched.portfolio.current_census = 537;
assert.throws(
  () => normalizeMondayCensusEmail(mismatched),
  /does not reconcile to community total 538/
);

const mismatchedPipeline = structuredClone(fixture);
mismatchedPipeline.pipeline.accepted_pending_total = 8;
assert.throws(
  () => normalizeMondayCensusEmail(mismatchedPipeline),
  /Pipeline acceptedPendingTotal 8 does not reconcile to community total 9/
);

const productionWithPrototypePipeline = structuredClone(fixture);
productionWithPrototypePipeline.mode = "production";
assert.throws(
  () => normalizeMondayCensusEmail(productionWithPrototypePipeline),
  /Production email cannot include prototype Pipeline data/
);

console.log("Monday census email checks passed.");
