#!/usr/bin/env node
import { understandQuery } from "../shared/query-understanding.mjs";
import {
  normalizeKnownCommunityNames,
  normalizeKnownCommunityNamesDeep
} from "../shared/community-names.mjs";
import { findClosestMonthWindow } from "../shared/period-utils.mjs";

const communities = [
  { community_name: "A & A Health Services San Pablo" },
  { community_name: "JC Wallace House" },
  { community_name: "Santa Clarita" },
  { community_name: "AHS Turlock OP LLC" },
  { community_name: "Victoria's House" }
];

const residentTerms = [
  ["john", "john", "resident"],
  ["smith", "smith", "resident"],
  ["shannon", "shannon", "resident"],
  ["romero", "romero", "resident"]
];

const cases = [
  {
    name: "exact guided wording does not manufacture an interpretation notice",
    prompt: "Compare census and incident trends across communities month by month.",
    expectedText: "compare census and incident trends across communities month by month",
    requiresConfirmation: false,
    changed: false
  },
  {
    name: "obvious community and metric typos auto-correct",
    prompt: "show santa clartia censsus trend",
    expectedText: "show santa clarita census trend",
    requiresConfirmation: false,
    changed: true
  },
  {
    name: "normal connective words are never treated as names",
    prompt: "List every AWOL incident from May through June, then export the exact same rows to CSV.",
    expectedText: "list every awol incident from may through june then export the exact same rows to csv",
    requiresConfirmation: false,
    forbiddenOriginals: ["then"]
  },
  {
    name: "known typo aliases apply without whack-a-mole regexes",
    prompt: "give me frebruary breakdown of awol incdients by communty",
    expectedText: "give me february breakdown of awol incidents by community",
    requiresConfirmation: false,
    changed: true
  },
  {
    name: "short ambiguous month abbreviations still ask first",
    prompt: "compare marc and aprl incidents",
    expectedText: "compare march and april incidents",
    requiresConfirmation: true
  },
  {
    name: "resident misspellings stay confirmation-gated",
    prompt: "show jon smth resident profile",
    expectedText: "show john smith resident profile",
    requiresConfirmation: true
  },
  {
    name: "old facility name normalizes to current name",
    prompt: "show victoria's place incidents",
    expectedText: "show victoria house incidents",
    requiresConfirmation: false,
    changed: true
  },
  {
    name: "category typo and dimension typo recover together",
    prompt: "medcation emergncy incidents by comunity",
    expectedText: "medication emergency incidents by community",
    requiresConfirmation: false,
    changed: true
  }
];

function fail(message, details = {}) {
  console.error(`query-understanding check failed: ${message}`);
  if (Object.keys(details).length) console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

for (const testCase of cases) {
  const result = understandQuery(testCase.prompt, { communities, extraTerms: residentTerms });
  if (result.correctedText !== testCase.expectedText) {
    fail(`${testCase.name}: corrected text mismatch`, {
      prompt: testCase.prompt,
      expected: testCase.expectedText,
      actual: result.correctedText,
      corrections: result.corrections
    });
  }
  if (result.requiresConfirmation !== testCase.requiresConfirmation) {
    fail(`${testCase.name}: confirmation mismatch`, {
      prompt: testCase.prompt,
      expected: testCase.requiresConfirmation,
      actual: result.requiresConfirmation,
      corrections: result.corrections
    });
  }
  if (typeof testCase.changed === "boolean" && result.changed !== testCase.changed) {
    fail(`${testCase.name}: changed mismatch`, {
      prompt: testCase.prompt,
      expected: testCase.changed,
      actual: result.changed,
      corrections: result.corrections
    });
  }
  const correctedOriginals = result.corrections.map((correction) => correction.original);
  for (const forbiddenOriginal of testCase.forbiddenOriginals ?? []) {
    if (correctedOriginals.includes(forbiddenOriginal)) {
      fail(`${testCase.name}: corrected a protected natural-language token`, {
        prompt: testCase.prompt,
        forbiddenOriginal,
        corrections: result.corrections
      });
    }
  }
}

const closestWindowCases = [
  {
    name: "closest window preserves requested width",
    requested: ["2025-11", "2025-12", "2026-01"],
    available: ["2026-02", "2026-03", "2026-04", "2026-05"],
    expected: ["2026-02", "2026-03", "2026-04"]
  },
  {
    name: "single-month ties prefer the latest valid month",
    requested: ["2026-05"],
    available: ["2026-04", "2026-06"],
    expected: ["2026-06"]
  },
  {
    name: "invalid and duplicate periods do not corrupt recovery",
    requested: ["bad", "2026-05", "2026-05"],
    available: ["bad", "2026-03", "2026-04"],
    expected: ["2026-04"]
  }
];

for (const testCase of closestWindowCases) {
  const actual = findClosestMonthWindow(testCase.requested, testCase.available);
  if (JSON.stringify(actual) !== JSON.stringify(testCase.expected)) {
    fail(`${testCase.name}: closest-month recovery mismatch`, {
      requested: testCase.requested,
      available: testCase.available,
      expected: testCase.expected,
      actual
    });
  }
}

if (normalizeKnownCommunityNames("Victoria's Place census") !== "Victoria's House census") {
  fail("community-name normalization did not replace the legacy name");
}

const nestedCommunityValue = {
  title: "Victoria Place profile",
  rows: [{ community: "Victoria's Place" }],
  untouched: 42
};
const normalizedCommunityValue = normalizeKnownCommunityNamesDeep(nestedCommunityValue);
if (
  normalizedCommunityValue.title !== "Victoria's House profile" ||
  normalizedCommunityValue.rows[0]?.community !== "Victoria's House" ||
  normalizedCommunityValue.untouched !== 42 ||
  nestedCommunityValue.title !== "Victoria Place profile"
) {
  fail("deep community-name normalization changed the wrong values or mutated the source", {
    source: nestedCommunityValue,
    normalized: normalizedCommunityValue
  });
}

console.log(`query-understanding checks passed (${cases.length} language cases, ${closestWindowCases.length} recovery cases, community normalization).`);
