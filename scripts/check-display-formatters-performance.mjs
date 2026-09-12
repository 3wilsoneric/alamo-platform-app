import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  formatDisplayDate, formatDisplayDateTime, parseDisplayDate, parseDisplayTimestamp
} from "../shared/display-date.mjs";
import { PLATFORM_REPORTING_TIME_ZONE } from "../shared/reporting-date.mjs";

const inputs = [
  null, undefined, "", "—", "invalid date", "not a date", "2026-02-30",
  "2!1!2026", "2!13!2026", "2!1!26", "2024-02-29", "2026-09-12",
  "2026-07-20T06:30:00.000Z", "2026-03-08T09:59:00Z",
  "2026-11-01T09:01:00Z", "2026-07-20 06:30:00",
  new Date("2026-07-20T06:30:00Z"), new Date(NaN)
];
for (const month of ["numeric", "2-digit", "long", "short", "narrow"]) {
  for (const input of inputs) {
    const date = parseDisplayDate(input);
    const timestamp = parseDisplayTimestamp(input);
    assert.equal(formatDisplayDate(input, { month, fallback: "missing" }), date
      ? date.toLocaleDateString("en-GB", { day: "numeric", month, year: "numeric" }) : "missing");
    assert.equal(formatDisplayDateTime(input, { month, fallback: "missing" }), timestamp
      ? timestamp.toLocaleString("en-GB", {
        timeZone: PLATFORM_REPORTING_TIME_ZONE, day: "numeric", month,
        year: "numeric", hour: "numeric", minute: "2-digit", hour12: true
      }) : "missing");
  }
}
assert.throws(() => formatDisplayDate("2026-09-12", { month: "invalid" }), RangeError);
assert.throws(() => formatDisplayDateTime("2026-09-12", { month: "invalid" }), RangeError);
assert.equal(formatDisplayDate(null, { month: "invalid", fallback: "missing" }), "missing");

const count = 5_000;
const date = parseDisplayDate("2026-09-12");
const started = performance.now();
for (let index = 0; index < count; index += 1) {
  assert.equal(formatDisplayDate(date), "12 September 2026");
}
const cachedMs = performance.now() - started;
const nativeStarted = performance.now();
for (let index = 0; index < count; index += 1) {
  assert.equal(date.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric"
  }), "12 September 2026");
}
console.log(JSON.stringify({ checks: "native formatter parity", count,
  cached_ms: Math.round(cachedMs), baseline_ms: Math.round(performance.now() - nativeStarted) }));
