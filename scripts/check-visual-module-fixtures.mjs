import {
  formatChartNumber,
  getChartNumber,
  getPositiveChartWidth,
  parseChartNumber
} from "../shared/visual-number-utils.mjs";
import { readFileSync } from "node:fs";

const failures = [];

function assert(condition, message, details = undefined) {
  if (condition) return;
  failures.push(details ? `${message}: ${JSON.stringify(details)}` : message);
}

const numberCases = [
  { label: "numeric zero", value: 0, expected: 0 },
  { label: "string zero", value: "0", expected: 0 },
  { label: "null", value: null, expected: null },
  { label: "blank string", value: "   ", expected: null },
  { label: "bad string", value: "not a number", expected: null },
  { label: "comma number", value: "1,234", expected: 1234 },
  { label: "percent number", value: "92.4%", expected: 92.4 },
  { label: "infinite number", value: Infinity, expected: null }
];

numberCases.forEach((testCase) => {
  assert(
    getChartNumber(testCase.value) === testCase.expected,
    `getChartNumber failed for ${testCase.label}`,
    { actual: getChartNumber(testCase.value), expected: testCase.expected }
  );
});

assert(parseChartNumber(null) === 0, "parseChartNumber should default missing numeric input to 0 for aggregations");
assert(formatChartNumber(null) === "—", "formatChartNumber should not display missing input as 0");
assert(formatChartNumber("0") === "0", "formatChartNumber should preserve real zero");
assert(formatChartNumber("92.44", "% compliance") === "92.4", "formatChartNumber should honor percent precision");
assert(formatChartNumber("1000000") === "1,000,000", "formatChartNumber should format large values");

const widthCases = [
  { label: "zero value", value: 0, maximum: 100, expected: 0 },
  { label: "null value", value: null, maximum: 100, expected: 0 },
  { label: "bad value", value: "n/a", maximum: 100, expected: 0 },
  { label: "negative value", value: -4, maximum: 100, expected: 0 },
  { label: "minimum visible positive", value: 1, maximum: 100, expected: 5 },
  { label: "normal ratio", value: 25, maximum: 100, expected: 25 },
  { label: "large value cap", value: 500, maximum: 100, expected: 100 },
  { label: "bad maximum", value: 5, maximum: 0, expected: 0 }
];

widthCases.forEach((testCase) => {
  assert(
    getPositiveChartWidth(testCase.value, testCase.maximum) === testCase.expected,
    `getPositiveChartWidth failed for ${testCase.label}`,
    {
      actual: getPositiveChartWidth(testCase.value, testCase.maximum),
      expected: testCase.expected
    }
  );
});

const structuredModuleFiles = [
  "src/features/home/components/InlineAdHocCharts.tsx",
  "src/shared/modules/CensusMovementModule.tsx",
  "src/shared/modules/CensusTrendModule.tsx",
  "src/shared/modules/ComparisonBarsModule.tsx",
  "src/shared/modules/DiagnosisMixModule.tsx",
  "src/shared/modules/EvidenceTableModule.tsx",
  "src/shared/modules/IncidentCategoriesModule.tsx",
  "src/shared/modules/IncidentDetailListModule.tsx",
  "src/shared/modules/KpiStripModule.tsx",
  "src/shared/modules/MedicationComplianceModule.tsx",
  "src/shared/modules/MedicationExceptionDetailModule.tsx",
  "src/shared/modules/MedicationProfileModule.tsx",
  "src/shared/modules/MedicationWatchModule.tsx",
  "src/shared/modules/MultiSeriesTrendModule.tsx",
  "src/shared/modules/PeriodHeatmapModule.tsx",
  "src/shared/modules/ResidentRosterModule.tsx",
  "src/shared/modules/ResidentSearchModule.tsx"
];

structuredModuleFiles.forEach((filePath) => {
  const source = readFileSync(new URL(`../${filePath}`, import.meta.url), "utf8");
  assert(
    /data-module-(row|chart)=/.test(source),
    "structured visual module is missing stable QA structure markers",
    { filePath }
  );
});

if (failures.length) {
  console.error(`FAILED: visual module fixtures (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("visual module fixture checks passed (zero, null, bad number, large value, structure markers)");
