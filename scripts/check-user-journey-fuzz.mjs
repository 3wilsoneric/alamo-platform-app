import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCopilotTool } from "../server/copilot-tools.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, "../generated/user-journey-fuzz");
const outputPath = path.join(outputDir, "latest.json");

const defaultSeed = "20260623";
const seedText = String(process.env.USER_JOURNEY_FUZZ_SEED || defaultSeed);
const requestedTurns = Number(process.env.USER_JOURNEY_FUZZ_TURNS || 160);
const targetTurns = Math.max(40, Math.min(1000, Number.isFinite(requestedTurns) ? requestedTurns : 160));
const runOutputPath = path.join(
  outputDir,
  `${seedText.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "seed"}-${targetTurns}.json`
);

const facilities = [
  {
    id: "337",
    full: "A & A Health Services San Pablo",
    aliases: ["San Pablo", "A & A Health Services San Pablo", "san pablo"]
  },
  {
    id: "342",
    full: "Victoria's House",
    aliases: ["Victoria's House", "victorias house", "victoria house"]
  },
  {
    id: "343",
    full: "JC Wallace House",
    aliases: ["JC Wallace House", "jc wallace", "wallace house"]
  },
  {
    id: "344",
    full: "AHS Turlock OP LLC",
    aliases: ["Turlock", "AHS Turlock OP LLC", "turlock"]
  },
  {
    id: "345",
    full: "Santa Clarita",
    aliases: ["Santa Clarita", "santa clartia", "santa clarita"]
  }
];

const months = [
  { period: "2025-12", long: "December 2025", short: "Dec 2025", loose: "december 2025" },
  { period: "2026-01", long: "January 2026", short: "Jan 2026", loose: "january" },
  { period: "2026-02", long: "February 2026", short: "Feb 2026", loose: "frebruary" },
  { period: "2026-03", long: "March 2026", short: "Mar 2026", loose: "march" },
  { period: "2026-04", long: "April 2026", short: "Apr 2026", loose: "april" },
  { period: "2026-05", long: "May 2026", short: "May 2026", loose: "last month" },
  { period: "2026-06", long: "June 2026", short: "Jun 2026", loose: "june" }
];

const incidentCategories = [
  "AWOL/Elopement",
  "Medication Refusal",
  "Medical Emergency",
  "Substance Use",
  "Aggressive Behavior"
];

const fixedRegressionCases = [
  {
    family: "historical-census",
    prompt: "how many clients at san pablo in january of 2026",
    expect: {
      tools: ["census_trend"],
      facilityId: "337",
      period: "2026-01",
      valueLabel: "Census",
      textIncludes: ["139"]
    }
  },
  {
    family: "historical-incidents",
    prompt: "incidents san pablo january",
    expect: {
      tools: ["incident_breakdown"],
      facilityId: "337",
      period: "2026-01",
      valueLabel: "Incidents"
    }
  },
  {
    family: "people-vs-events",
    prompt: "how many people went AWOL in May 2026",
    expect: {
      tools: ["incident_breakdown"],
      period: "2026-05",
      category: "AWOL/Elopement",
      valueLabel: "Residents",
      textIncludes: ["unique resident"]
    }
  },
  {
    family: "people-vs-events",
    prompt: "how many AWOL events were there in May 2026",
    expect: {
      tools: ["incident_breakdown"],
      period: "2026-05",
      category: "AWOL/Elopement",
      valueLabel: "Incidents"
    }
  },
  {
    family: "typo-correction",
    prompt: "show santa clartia censsus trend",
    expect: {
      tools: ["census_trend"],
      facilityId: "345",
      visualType: "line_chart",
      textIncludes: ["Santa Clarita"]
    }
  },
  {
    family: "typo-correction",
    prompt: "give me frebruary breakdown of awol incidents by community",
    expect: {
      tools: ["slice_metric"],
      period: "2026-02",
      category: "AWOL/Elopement",
      visualType: "table",
      valueLabel: "Incidents"
    }
  },
  {
    family: "resident-profile",
    prompt: "show Shannon Romero resident profile",
    expect: {
      tools: ["resident_lookup"],
      textIncludes: ["Shannon Romero", "Resident #"],
      moduleId: "resident-profile"
    }
  },
  {
    family: "resident-recovery",
    prompt: "show john smith resident profile",
    expect: {
      tools: ["data_recovery", "resident_lookup"],
      truthStates: ["verified_zero", "not_loaded"],
      textIncludes: ["no verified exact match"],
      textExcludes: ["Audrey West", "Portfolio Longest Stay"]
    }
  },
  {
    family: "data-availability",
    prompt: "what data periods are available for incident detail?",
    expect: {
      tools: ["data_availability"],
      textIncludes: ["most recent incident detail"],
      visualType: "table"
    }
  },
  {
    family: "unsupported-period",
    prompt: "give me the top category of each community in incidents November of last year",
    expect: {
      tools: ["top_incident_category_by_community", "data_availability"],
      truthStates: ["not_loaded", "stale"],
      textIncludesAny: ["not available", "not loaded", "loaded months"]
    }
  },
  {
    family: "surface-only",
    prompt: "open incident center",
    expect: {
      tools: ["surface_module"],
      route: "/incidents",
      maxActions: 1
    }
  },
  {
    family: "surface-only",
    prompt: "show resident search",
    expect: {
      tools: ["surface_module"],
      route: "/resident-search",
      maxActions: 1
    }
  }
];

const forbiddenPatterns = [
  /\bAnswer The\b/i,
  /\bThe clearest row\b/i,
  /\blargest row in this slice\b/i,
  /\bClosest Recovery Path\b/i,
  /\bObject object\b/i,
  /\bundefined\b/i,
  /\bT00:00:00\.000Z\b/i,
  /\bVictoria's Place\b/i,
  /\bfacility\s+(337|342|343|344|345)\b/i,
  /^Source:/i
];

function hashSeed(seed) {
  let hash = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(hashSeed(seedText)());

function pick(items) {
  return items[Math.floor(rand() * items.length)];
}

function maybe(probability) {
  return rand() < probability;
}

function labelForMonth(month) {
  const style = pick(["long", "short", "loose"]);
  return month[style];
}

function aliasForFacility(facility) {
  return pick(facility.aliases);
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function lower(value) {
  return String(value ?? "").toLowerCase();
}

function includesText(haystack, needle) {
  return lower(haystack).includes(lower(needle));
}

function resultTruthState(result) {
  return result?.truthState ?? result?.trace?.truthState ?? result?.runtimeSchema?.truthState ?? null;
}

function allActionRoutes(result) {
  return (result?.actions ?? []).map((action) => action?.route).filter(Boolean);
}

function allModuleIds(result) {
  return [
    result?.moduleSpec?.moduleId,
    ...(result?.moduleSpecs ?? []).map((moduleSpec) => moduleSpec?.moduleId)
  ].filter(Boolean);
}

function resultHaystack(result) {
  return [
    result?.text,
    result?.trace,
    result?.analysisFrame,
    result?.executionPlan,
    result?.planValidation,
    result?.interpretation,
    result?.visual,
    result?.moduleSpec,
    result?.moduleSpecs,
    result?.actions,
    result?.artifact
  ]
    .map((value) => (typeof value === "string" ? value : JSON.stringify(value ?? "")))
    .join("\n");
}

function renderedText(result) {
  return JSON.stringify({
    text: result?.text,
    visual: result?.visual,
    actions: result?.actions,
    moduleSpec: result?.moduleSpec,
    moduleSpecs: result?.moduleSpecs,
    artifact: result?.artifact
  });
}

function validateTurn(testCase, result) {
  const failures = [];
  const expect = testCase.expect ?? {};
  const body = renderedText(result);
  const haystack = resultHaystack(result);
  const text = String(result?.text ?? "");

  if (!result?.handled) failures.push("result was not handled");
  if (result?.handled && result.tool !== "clarification" && !result.runtimeSchema?.valid) {
    failures.push("missing or invalid runtime schema");
  }
  if (result?.handled && result.tool !== "clarification" && !result.turnTrace?.turnId) {
    failures.push("missing analyst turn trace");
  }

  const acceptedTools = asArray(expect.tools ?? expect.tool);
  if (acceptedTools.length && !acceptedTools.includes(result?.tool)) {
    failures.push(`expected tool ${acceptedTools.join(" or ")}, got ${result?.tool ?? "none"}`);
  }

  const expectedTruthStates = asArray(expect.truthStates ?? expect.truthState);
  if (expectedTruthStates.length && !expectedTruthStates.includes(resultTruthState(result))) {
    failures.push(`expected truthState ${expectedTruthStates.join(" or ")}, got ${resultTruthState(result) ?? "none"}`);
  }

  if (expect.period && !includesText(haystack, expect.period)) {
    failures.push(`missing expected period ${expect.period}`);
  }
  for (const period of asArray(expect.periodIncludes)) {
    if (!includesText(haystack, period)) failures.push(`missing expected period ${period}`);
  }
  if (
    expect.facilityId &&
    !includesText(haystack, `"facilityId":"${expect.facilityId}"`) &&
    !includesText(haystack, `"facility_id":"${expect.facilityId}"`)
  ) {
    failures.push(`missing facility scope ${expect.facilityId}`);
  }
  if (expect.category && !includesText(haystack, expect.category)) {
    failures.push(`missing category ${expect.category}`);
  }
  const safeUnavailable = expect.allowUnavailable &&
    ["not_loaded", "stale", "verified_zero", "summary_not_shown"].includes(resultTruthState(result));
  if (expect.valueLabel && !safeUnavailable && result?.visual?.valueLabel !== expect.valueLabel) {
    failures.push(`expected value label ${expect.valueLabel}, got ${result?.visual?.valueLabel ?? "none"}`);
  }
  if (expect.visualType && !safeUnavailable && result?.visual?.type !== expect.visualType) {
    failures.push(`expected visual type ${expect.visualType}, got ${result?.visual?.type ?? "none"}`);
  }
  if (expect.maxVisualRows != null && (result?.visual?.rows?.length ?? 0) > expect.maxVisualRows) {
    failures.push(`visual has too many rows (${result.visual.rows.length}, max ${expect.maxVisualRows})`);
  }
  if (expect.artifact && !result?.artifact?.content && !result?.artifact?.href && !result?.artifact?.url) {
    failures.push("expected export artifact");
  }
  if (expect.moduleId && !allModuleIds(result).includes(expect.moduleId)) {
    failures.push(`missing expected module ${expect.moduleId}`);
  }
  if (expect.route && !allActionRoutes(result).includes(expect.route)) {
    failures.push(`missing action route ${expect.route}`);
  }
  if (expect.maxActions != null && (result?.actions ?? []).length > expect.maxActions) {
    failures.push(`too many actions (${(result.actions ?? []).length}, max ${expect.maxActions})`);
  }

  for (const snippet of asArray(expect.textIncludes)) {
    if (!includesText(text, snippet) && !includesText(body, snippet)) {
      failures.push(`missing ${JSON.stringify(snippet)}`);
    }
  }
  const alternatives = asArray(expect.textIncludesAny);
  if (alternatives.length && !alternatives.some((snippet) => includesText(text, snippet) || includesText(body, snippet))) {
    failures.push(`missing one of ${alternatives.map((snippet) => JSON.stringify(snippet)).join(", ")}`);
  }
  for (const snippet of asArray(expect.textExcludes)) {
    if (includesText(text, snippet) || includesText(body, snippet)) {
      failures.push(`included forbidden snippet ${JSON.stringify(snippet)}`);
    }
  }
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(body)) failures.push(`matched forbidden pattern ${pattern}`);
  }

  return failures;
}

function makeIncidentBreakdownCase() {
  const facility = maybe(0.8) ? pick(facilities) : null;
  const month = pick(months);
  const category = maybe(0.45) ? pick(incidentCategories) : null;
  const communityText = facility ? `${aliasForFacility(facility)} ` : "";
  const categoryText = category ? `${category} ` : "";
  const templates = category
    ? [
        `show ${communityText}${categoryText}incidents in ${labelForMonth(month)}`,
        `what were ${communityText}${categoryText}incidents for ${labelForMonth(month)}`,
        `${communityText}${labelForMonth(month)} ${categoryText}incident category breakdown`
      ]
    : [
        `${communityText}${labelForMonth(month)} incidents`,
        `${communityText}${labelForMonth(month)} incident category breakdown`
      ];
  return {
    family: "incident-breakdown",
    prompt: pick(templates).replace(/\s+/g, " ").trim(),
    expect: {
      tools: ["incident_breakdown"],
      period: month.period,
      facilityId: facility?.id,
      category,
      visualType: category ? "summary_card" : "bar_chart",
      valueLabel: "Incidents",
      allowUnavailable: true
    }
  };
}

function makePeopleVsEventCase() {
  const month = pick(months.slice(1));
  const facility = maybe(0.5) ? pick(facilities) : null;
  const asksPeople = maybe(0.55);
  const place = facility ? ` at ${aliasForFacility(facility)}` : "";
  const prompt = asksPeople
    ? `how many people went AWOL${place} in ${labelForMonth(month)}`
    : `how many AWOL events${place} in ${labelForMonth(month)}`;
  return {
    family: "people-vs-events",
    prompt,
    expect: {
      tools: ["incident_breakdown"],
      period: month.period,
      facilityId: facility?.id,
      category: "AWOL/Elopement",
      valueLabel: asksPeople ? "Residents" : "Incidents"
    }
  };
}

function makeCensusCase() {
  const facility = pick(facilities);
  const month = pick(months);
  const asksPoint = maybe(0.5);
  const prompt = asksPoint
    ? `how many clients at ${aliasForFacility(facility)} in ${labelForMonth(month)}`
    : `show ${aliasForFacility(facility)} census trend`;
  return {
    family: "census",
    prompt,
    expect: {
      tools: ["census_trend"],
      period: asksPoint ? month.period : undefined,
      facilityId: facility.id,
      valueLabel: "Census",
      visualType: asksPoint ? "summary_card" : "line_chart"
    }
  };
}

function makeComparisonCase() {
  const facility = maybe(0.7) ? pick(facilities) : null;
  const rightIndex = 1 + Math.floor(rand() * (months.length - 1));
  const left = months[rightIndex - 1];
  const right = months[rightIndex];
  const prompt = `${facility ? `${aliasForFacility(facility)} ` : ""}compare ${left.long} incidents to ${right.long} incidents by category`;
  return {
    family: "comparison",
    prompt,
    expect: {
      tools: ["incident_category_comparison"],
      periodIncludes: [left.period, right.period],
      facilityId: facility?.id,
      visualType: "comparison_chart",
      allowUnavailable: true
    }
  };
}

function makeSurfaceCase() {
  const base = [
    { prompt: "open communities overview", route: "/communities" },
    { prompt: "open incident center", route: "/incidents" },
    { prompt: "show resident search", route: "/resident-search" },
    { prompt: "open command center", route: "/command-center" },
    { prompt: "show glossary", route: "/glossary" }
  ];
  const focused = facilities.flatMap((facility) => [
    { prompt: `open ${aliasForFacility(facility)} community page`, route: `/communities/${facility.id}`, text: facility.full },
    { prompt: `show ${aliasForFacility(facility)} incidents module`, route: `/communities/${facility.id}?focus=incidents`, text: facility.full },
    { prompt: `show ${aliasForFacility(facility)} census module`, route: `/communities/${facility.id}?focus=census`, text: facility.full }
  ]);
  const selected = pick([...base, ...focused]);
  return {
    family: "surface-only",
    prompt: selected.prompt,
    expect: {
      tools: ["surface_module"],
      route: selected.route,
      textIncludes: selected.text ? [selected.text] : [],
      maxActions: 1
    }
  };
}

function makeSliceCase() {
  const month = pick(months);
  const category = pick(incidentCategories);
  return {
    family: "slice-metric",
    prompt: `give me ${labelForMonth(month)} breakdown of ${category} incidents by community`,
    expect: {
      tools: ["slice_metric"],
      period: month.period,
      category,
      visualType: "table",
      valueLabel: "Incidents"
    }
  };
}

function makeResidentCase() {
  if (maybe(0.75)) {
    return {
      family: "resident-profile",
      prompt: pick(["show Shannon Romero resident profile", "Shannon Romero profile", "resident 9513755"]),
      expect: {
        tools: ["resident_lookup"],
        textIncludes: ["Shannon Romero"],
        moduleId: "resident-profile"
      }
    };
  }
  return {
    family: "resident-recovery",
    prompt: pick(["show john smith resident profile", "john smith", "show jon smth resident profile"]),
    expect: {
      tools: ["data_recovery", "resident_lookup", "clarification"],
      truthStates: ["verified_zero", "not_loaded", "needs_clarification", "plan_rejected"],
      textExcludes: ["Audrey West", "Portfolio Longest Stay"]
    }
  };
}

function makeTrustCase() {
  return pick([
    {
      family: "data-availability",
      prompt: "why are today's incidents not showing up",
      expect: {
        tools: ["data_availability"],
        textIncludesAny: ["most recent incident detail", "records dated today", "incident detail"],
        visualType: "table"
      }
    },
    {
      family: "data-availability",
      prompt: "what data periods are available for incident detail?",
      expect: {
        tools: ["data_availability"],
        textIncludes: ["most recent incident detail"],
        visualType: "table"
      }
    },
    {
      family: "unsupported-period",
      prompt: "top category each community November 2025",
      expect: {
        tools: ["top_incident_category_by_community", "data_availability"],
        truthStates: ["not_loaded", "stale"],
        textIncludesAny: ["not available", "not loaded", "loaded months"]
      }
    }
  ]);
}

function makeMedicationCase() {
  const facility = maybe(0.7) ? pick(facilities) : null;
  return pick([
    {
      family: "medication",
      prompt: `${facility ? `How is ${aliasForFacility(facility)} doing with medications?` : "How is the portfolio doing with medications?"}`,
      expect: {
        tools: ["medication_profile"],
        facilityId: facility?.id,
        textIncludesAny: ["Compliance", "medication"]
      }
    },
    {
      family: "medication",
      prompt: `${facility ? `${aliasForFacility(facility)} ` : ""}medication compliance latest month`,
      expect: {
        tools: ["medication_compliance"],
        facilityId: facility?.id,
        textIncludesAny: ["Compliance", "%"]
      }
    },
    {
      family: "medication",
      prompt: "What medications had the most refusals?",
      expect: {
        tools: ["medication_refusals_by_community", "ad_hoc_medication_chart"],
        textIncludes: ["refus"],
        visualType: "bar_chart"
      }
    }
  ]);
}

function makeGeneratedCase(index) {
  const generators = [
    makeIncidentBreakdownCase,
    makePeopleVsEventCase,
    makeCensusCase,
    makeComparisonCase,
    makeSurfaceCase,
    makeSliceCase,
    makeResidentCase,
    makeTrustCase,
    makeMedicationCase
  ];
  const generator = generators[index % generators.length];
  return generator();
}

function buildCases() {
  const cases = [...fixedRegressionCases];
  let index = 0;
  while (cases.length < targetTurns) {
    cases.push(makeGeneratedCase(index));
    index += 1;
  }
  return cases.slice(0, targetTurns).map((testCase, caseIndex) => ({
    ...testCase,
    index: caseIndex + 1
  }));
}

async function runCases(cases) {
  const turns = [];
  const sessionId = `journey-fuzz-${seedText}-${Date.now()}`;
  for (const testCase of cases) {
    const preserveSession = !["surface-only", "resident-recovery", "unsupported-period"].includes(testCase.family);
    const startedAt = Date.now();
    const result = await runCopilotTool({
      content: testCase.prompt,
      sessionId: preserveSession ? sessionId : `${sessionId}-${testCase.index}`
    });
    const failures = validateTurn(testCase, result);
    turns.push({
      index: testCase.index,
      family: testCase.family,
      prompt: testCase.prompt,
      expectedTools: asArray(testCase.expect?.tools ?? testCase.expect?.tool),
      tool: result?.tool ?? null,
      truthState: resultTruthState(result),
      rowCount: result?.trace?.rowCount ?? null,
      facilityId: result?.trace?.facilityId ?? null,
      period: result?.trace?.period ?? null,
      visualType: result?.visual?.type ?? null,
      valueLabel: result?.visual?.valueLabel ?? null,
      actionRoutes: allActionRoutes(result),
      elapsedMs: Date.now() - startedAt,
      passed: failures.length === 0,
      failures
    });
  }
  return turns;
}

function summarizeBy(turns, key) {
  return turns.reduce((memo, turn) => {
    const value = turn[key] ?? "none";
    memo[value] ??= { total: 0, passed: 0, failed: 0 };
    memo[value].total += 1;
    if (turn.passed) memo[value].passed += 1;
    else memo[value].failed += 1;
    return memo;
  }, {});
}

const startedAt = Date.now();
const cases = buildCases();
const turns = await runCases(cases);
const failedTurns = turns.filter((turn) => !turn.passed);
const elapsedMs = Date.now() - startedAt;
const summary = {
  generatedAt: new Date().toISOString(),
  status: failedTurns.length ? "fail" : "pass",
  seed: seedText,
  targetTurns,
  totalTurns: turns.length,
  failedTurns: failedTurns.length,
  passRate: Math.round(((turns.length - failedTurns.length) / turns.length) * 1000) / 10,
  elapsedMs,
  averageElapsedMs: Math.round(turns.reduce((sum, turn) => sum + turn.elapsedMs, 0) / Math.max(turns.length, 1)),
  maxElapsedMs: Math.max(...turns.map((turn) => turn.elapsedMs)),
  byFamily: summarizeBy(turns, "family"),
  byTool: summarizeBy(turns, "tool")
};

const report = {
  summary,
  failedTurns,
  turns
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2));
await writeFile(runOutputPath, JSON.stringify(report, null, 2));

if (failedTurns.length) {
  console.error(`FAILED: user journey fuzz (${failedTurns.length}/${turns.length} failed, seed ${seedText})`);
  console.error(`Report: ${outputPath}`);
  console.error(`Replay report: ${runOutputPath}`);
  console.error(
    failedTurns
      .slice(0, 25)
      .map((turn) => `- [${turn.family} #${turn.index}] ${turn.prompt}: ${turn.failures.join("; ")}`)
      .join("\n")
  );
  process.exit(1);
}

console.log(
  [
    `user journey fuzz passed (${summary.totalTurns} turns, seed ${seedText}, pass rate ${summary.passRate}%)`,
    `families: ${Object.entries(summary.byFamily)
      .map(([family, stats]) => `${family} ${stats.passed}/${stats.total}`)
      .join(", ")}`,
    `avg ${summary.averageElapsedMs}ms, max ${summary.maxElapsedMs}ms`,
    `report -> ${outputPath}`,
    `replay report -> ${runOutputPath}`
  ].join("\n")
);
