#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const NON_APPLICABLE_ADVISORIES = new Set([
  // This app is a client-rendered Vite SPA. It does not enable React Router RSC
  // mode, server actions, or action request processing.
  1124282
]);

const audit = spawnSync(
  "npm",
  ["audit", "--omit=dev", "--json"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  }
);

if (!audit.stdout.trim()) {
  console.error(audit.stderr.trim() || "npm audit returned no report.");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  console.error("npm audit returned invalid JSON.");
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const routerAdvisories = (vulnerabilities["react-router"]?.via ?? [])
  .filter((entry) => typeof entry === "object" && entry !== null)
  .map((entry) => Number(entry.source));
const routerExceptionIsExact =
  routerAdvisories.length > 0 &&
  routerAdvisories.every((source) => NON_APPLICABLE_ADVISORIES.has(source));

const failures = Object.values(vulnerabilities).filter((entry) => {
  if (!["high", "critical"].includes(entry.severity)) return false;
  if (
    routerExceptionIsExact &&
    (entry.name === "react-router" || entry.name === "react-router-dom")
  ) {
    return false;
  }
  return true;
});

if (failures.length) {
  console.error("Production dependency audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure.name}: ${failure.severity}`);
  }
  process.exit(1);
}

if (routerExceptionIsExact) {
  console.warn(
    "Allowed non-applicable advisory GHSA-qwww-vcr4-c8h2: React Router RSC mode is not used by this Vite SPA."
  );
}

console.log(
  `Production dependency audit passed: ${report.metadata?.dependencies?.prod ?? 0} runtime dependencies checked.`
);
