import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildCertifiedCacheRequests,
  buildCertifiedFollowUps,
  CERTIFIED_ANALYST_QUESTIONS,
  getCertifiedQuestionMenuRoutes,
  getCertifiedQuestionRouteById,
  makeCertifiedQuestionMeta,
  matchCertifiedQuestion
} from "../shared/certified-analyst-questions.mjs";
import {
  applyAnalysisPatch,
  createEmptyAnalysisFrame,
  createExecutionPlan,
  deriveAnalysisPatch
} from "../shared/analysis-session-state.mjs";
import { certifiedCacheEligible, runCopilotTool } from "../server/copilot-tools.mjs";
import { getCommunitiesDashboardData, getReportsSummaryData } from "../server/platform-data.mjs";
import {
  buildCertifiedAnswerDataSignature,
  getCertifiedAnswerCacheEntry,
  normalizeCertifiedAnswerCache
} from "../server/certified-answer-cache.mjs";
import { findUserFacingDateContractViolations } from "./analyst-display-contract.mjs";

const facilities = [
  { facility_id: "337", community_name: "A & A Health Services San Pablo" },
  { facility_id: "342", community_name: "Victoria's House" },
  { facility_id: "343", community_name: "JC Wallace House" },
  { facility_id: "344", community_name: "AHS Turlock OP LLC" },
  { facility_id: "345", community_name: "Santa Clarita" }
];
const months = ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
const categories = ["AWOL/Elopement", "Medication Refusal", "Medical Emergency", "Aggressive Behavior", "Substance Use", "Fall"];
const residents = [
  { resident_name: "Shannon Romero" },
  { resident_name: "Tuesday Woo" }
];
const frameOptions = {
  facilities,
  residents,
  availableMonths: months,
  categories
};

function assert(condition, message, context = null) {
  if (condition) return;
  console.error(`FAILED: ${message}`);
  if (context) console.error(JSON.stringify(context, null, 2));
  process.exit(1);
}

const validCachedToolResult = {
  handled: true,
  tool: "incident_breakdown",
  text: "San Pablo had 10 incidents.",
  truthState: "valid_rows",
  trace: {
    tool: "incident_breakdown",
    rowCount: 1,
    truthState: "valid_rows"
  },
  visual: {
    type: "bar_chart",
    title: "Incidents",
    valueLabel: "Incidents",
    rows: [{ label: "AWOL/Elopement", value: 10 }]
  }
};
const normalizedCache = normalizeCertifiedAnswerCache({
  version: "certified-answer-cache-v2",
  generatedAt: "2026-06-24T12:00:00.000Z",
  dataSignature: `certified-data-v1:${"a".repeat(64)}`,
  entries: [
    { cacheKey: "valid", result: validCachedToolResult },
    { cacheKey: "valid", result: validCachedToolResult },
    {
      cacheKey: "invalid-result",
      result: {
        ...validCachedToolResult,
        actions: [{ kind: "external", label: "Unsafe", url: "javascript:alert(1)" }]
      }
    }
  ]
});
assert(normalizedCache?.entries.length === 1, "certified cache normalization did not filter duplicate or invalid entries", normalizedCache);
assert(normalizeCertifiedAnswerCache({
  version: "certified-answer-cache-v2",
  generatedAt: "2026-06-24T12:00:00.000Z",
  dataSignature: "forged",
  entries: []
}) === null, "certified cache accepted an invalid data signature");
assert(normalizeCertifiedAnswerCache({
  version: "retired-cache-version",
  generatedAt: "2026-06-24T12:00:00.000Z",
  dataSignature: `certified-data-v1:${"a".repeat(64)}`,
  entries: []
}) === null, "certified cache accepted an unsupported cache version");

const cacheTestDirectory = await mkdtemp(path.join(tmpdir(), "alamo-certified-cache-"));
const cacheTestPath = path.join(cacheTestDirectory, "latest.json");
const previousCachePath = process.env.CERTIFIED_ANSWER_CACHE_PATH;
const previousRecheckMs = process.env.CERTIFIED_ANSWER_CACHE_RECHECK_MS;
const capturedCacheWarnings = [];
const originalConsoleWarn = console.warn;
try {
  process.env.CERTIFIED_ANSWER_CACHE_PATH = cacheTestPath;
  process.env.CERTIFIED_ANSWER_CACHE_RECHECK_MS = "10";
  console.warn = (...args) => capturedCacheWarnings.push(args);
  const reloadableCache = await import(`../server/certified-answer-cache.mjs?reload-check=${Date.now()}`);
  const dataSignature = `certified-data-v1:${"b".repeat(64)}`;

  assert(
    await reloadableCache.getCertifiedAnswerCacheEntry("late-cache", { dataSignature }) === null,
    "missing certified cache did not produce a safe cache miss"
  );

  await writeFile(cacheTestPath, JSON.stringify({
    version: "certified-answer-cache-v2",
    generatedAt: "2026-06-24T12:00:00.000Z",
    dataSignature,
    entries: [{ cacheKey: "late-cache", result: validCachedToolResult }]
  }));
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert(
    Boolean(await reloadableCache.getCertifiedAnswerCacheEntry("late-cache", { dataSignature })),
    "certified cache did not recover after a first-read miss without a process restart"
  );

  await writeFile(cacheTestPath, "{malformed");
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert(
    Boolean(await reloadableCache.getCertifiedAnswerCacheEntry("late-cache", { dataSignature })),
    "certified cache discarded its last valid value during a malformed refresh"
  );
  assert(capturedCacheWarnings.length === 1, "malformed certified cache refresh was not reported exactly once", {
    warningCount: capturedCacheWarnings.length
  });
} finally {
  console.warn = originalConsoleWarn;
  if (previousCachePath === undefined) delete process.env.CERTIFIED_ANSWER_CACHE_PATH;
  else process.env.CERTIFIED_ANSWER_CACHE_PATH = previousCachePath;
  if (previousRecheckMs === undefined) delete process.env.CERTIFIED_ANSWER_CACHE_RECHECK_MS;
  else process.env.CERTIFIED_ANSWER_CACHE_RECHECK_MS = previousRecheckMs;
  await rm(cacheTestDirectory, { recursive: true, force: true });
}

function makeFrame(overrides = {}) {
  return {
    ...createEmptyAnalysisFrame(),
    ...overrides,
    fields: overrides.fields ?? [],
    periods: overrides.periods ?? [],
    revision: 1
  };
}

const certifiedDrilldownScenarios = [
  {
    tool: "incident_breakdown",
    frame: makeFrame({ metric: "incidents", periods: ["2026-05"], facilityId: "337", communityName: "A & A Health Services San Pablo" }),
    expectedFamilies: ["incident-period-comparison", "incident-detail-list", "incident-rate"]
  },
  {
    tool: "incident_detail_list",
    frame: makeFrame({ metric: "incidents", category: "AWOL/Elopement", periods: ["2026-05"], facilityId: "337", communityName: "A & A Health Services San Pablo" }),
    expectedFamilies: ["incident-category-breakdown", "incident-resident-drivers"]
  },
  {
    tool: "census_trend",
    frame: makeFrame({ metric: "census", periods: ["2026-05"], facilityId: "345", communityName: "Santa Clarita" }),
    expectedFamilies: ["census-movement", "census-drop-history", "community-comparison"]
  },
  {
    tool: "community_profile",
    frame: makeFrame({ metric: "community profile", periods: ["2026-05"], facilityId: "337", communityName: "A & A Health Services San Pablo" }),
    expectedFamilies: ["census-trend", "incident-category-breakdown"]
  },
  {
    tool: "medication_profile",
    frame: makeFrame({ metric: "medications", periods: ["2026-05"], facilityId: "337", communityName: "A & A Health Services San Pablo" }),
    expectedFamilies: ["medication-watch"]
  }
];

for (const scenario of certifiedDrilldownScenarios) {
  const actions = buildCertifiedFollowUps({
    tool: scenario.tool,
    visual: { rows: [{ label: "A & A Health Services San Pablo", value: 1 }] }
  }, scenario.frame, "");
  const certifiedActions = actions.filter((action) => action.certifiedQuestionRouteId);
  const visibleRouteIds = new Set(getCertifiedQuestionMenuRoutes().map((route) => route.id));
  assert(
    certifiedActions.every((action) => visibleRouteIds.has(action.certifiedQuestionRouteId)),
    `${scenario.tool} exposed a follow-up outside the visible question menu`
  );
  if (scenario.tool === "incident_breakdown") {
    assert(
      /2026-04.*2026-05/.test(certifiedActions[0]?.prompt ?? ""),
      "prior-month drilldown did not compile concrete periods from the current answer",
      { scenario, actions }
    );
  }
  const resolvedFamilies = certifiedActions.map((action) => {
    const route = getCertifiedQuestionRouteById(action.certifiedQuestionRouteId);
    assert(Boolean(route), "certified drilldown referenced a missing question route", { scenario, action });
    assert(
      route.expectedTool === route.question.preferredTool,
      "certified drilldown route no longer matches its registered tool",
      { scenario, action, route }
    );
    return route.familyId;
  });
  assert(
    JSON.stringify(resolvedFamilies) === JSON.stringify(scenario.expectedFamilies),
    "certified drilldown ladder changed families",
    { scenario, resolvedFamilies, actions }
  );
}

const expectedMatches = [
  ["incidents", "incident-current-snapshot"],
  ["show current incidents", "incident-current-snapshot"],
  ["april incidents san pablo", "incident-current-snapshot"],
  ["how many people went AWOL in May 2026", "incident-unique-people-count"],
  ["how many clients went elopement last month", "incident-unique-people-count"],
  ["how many AWOL incidents in May 2026 total", "incident-event-count"],
  ["total medication refusal incidents for San Pablo", "incident-event-count"],
  ["how many clients at san pablo in january of 2026", "census-point-count"],
  ["residents at Santa Clarita in May 2026", "census-point-count"],
  ["why are today's incidents not showing up", "incident-freshness-troubleshoot"],
  ["why is Incident Center empty", "incident-freshness-troubleshoot"],
  ["why does Incident Center show zero today", "incident-freshness-troubleshoot"],
  ["are incidents current today", "incident-freshness-troubleshoot"],
  ["are daily incidents loaded", "incident-freshness-troubleshoot"],
  ["did yesterday incidents load", "incident-freshness-troubleshoot"],
  ["do we have this week's incidents", "incident-freshness-troubleshoot"],
  ["are weekly incidents available", "incident-freshness-troubleshoot"],
  ["is the incident feed behind", "incident-freshness-troubleshoot"],
  ["did new incidents come in today", "incident-freshness-troubleshoot"],
  ["when was incident data last received", "incident-freshness-troubleshoot"],
  ["what data is loaded for incidents", "data-availability"],
  ["do we have November 2025 incident detail rows loaded", "data-availability"],
  ["do we have resident roster rows", "data-availability"],
  ["is the snapshot stale", "data-availability"],
  ["when did the platform last refresh", "data-availability"],
  ["list every AWOL incident from May through June by community including resident date type and description", "incident-detail-list"],
  ["all elopement rows in may with description", "incident-detail-list"],
  ["export these awol incident rows to csv", "incident-row-export"],
  ["download san pablo incidents spreadsheet", "incident-row-export"],
  ["San Pablo incidents by category", "incident-category-breakdown"],
  ["JC Wallace current incident category breakdown", "incident-category-breakdown"],
  ["AWOL incidents by community in June", "incident-category-by-community"],
  ["February breakdown of AWOL incidents by community", "incident-category-by-community"],
  ["compare San Pablo May incidents to June by category", "incident-period-comparison"],
  ["April vs May incidents", "incident-period-comparison"],
  ["incident rate by community", "incident-rate"],
  ["which community has highest incidents per 100", "incident-rate"],
  ["which community had the biggest incident rate change from April to May", "incident-rate-change"],
  ["compare incident rates by community", "incident-rate-change"],
  ["which residents are driving incidents", "incident-resident-drivers"],
  ["top residents for San Pablo AWOL incidents", "incident-resident-drivers"],
  ["show Santa Clarita census trend", "census-trend"],
  ["San Pablo census history", "census-trend"],
  ["what changed in census this month", "census-movement"],
  ["what changed in census at San Pablo", "census-movement"],
  ["community census movers", "census-movement"],
  ["has any community had a drop in census", "census-drop-history"],
  ["month over month census declines", "census-drop-history"],
  ["give me Shannon Romero profile", "resident-profile"],
  ["show resident profile for John Smith", "resident-profile"],
  ["pull up Shannon Romero", "resident-profile"],
  ["tell me about Shannon Romero", "resident-profile"],
  ["open Shannon Romero", "resident-profile"],
  ["what changed for Shannon Romero", "resident-change-summary"],
  ["what's new with Tuesday Woo", "resident-change-summary"],
  ["show Shannon Romero incident history", "resident-incident-history"],
  ["what incidents does Tuesday Woo have", "resident-incident-history"],
  ["search census for John", "resident-search"],
  ["find residents named Smith", "resident-search"],
  ["how is San Pablo", "community-month-status"],
  ["how's San Pablo doing", "community-month-status"],
  ["what's going on with San Pablo", "community-month-status"],
  ["tell me about San Pablo", "community-topline"],
  ["Santa Clarita overview", "community-topline"],
  ["what changed at San Pablo", "community-change-summary"],
  ["what's new with Santa Clarita", "community-change-summary"],
  ["medication refusals by community", "medication-refusal-detail"],
  ["top refused meds", "medication-refusal-detail"],
  ["medication compliance this month", "medication-compliance"],
  ["emar compliance by community", "medication-compliance"],
  ["what data can you use", "data-slice-catalog"],
  ["show available analytical slices", "data-slice-catalog"],
  ["show available modules", "module-catalog"],
  ["what modules can I open", "module-catalog"],
  ["open the incident center module", "module-surface"],
  ["show me the resident search module", "module-surface"],
  ["show San Pablo incidents module", "module-surface"],
  ["open command center", "module-surface"],
  ["where are we operationally", "operating-snapshot"],
  ["current operating picture", "operating-snapshot"],
  ["what changed in incidents this month", "incident-current-snapshot"],
  ["what changed in incidents from May to June", "incident-period-comparison"]
];

for (const [prompt, expectedId] of expectedMatches) {
  const match = matchCertifiedQuestion(prompt, frameOptions);
  assert(match?.id === expectedId, "certified question did not match expected family", { prompt, expectedId, actual: match?.id });
}

let generated = expectedMatches.length;
const communities = ["San Pablo", "Santa Clarita", "JC Wallace", "Turlock", "Victoria"];
const incidentPhrases = ["incidents", "incident category breakdown", "AWOL incidents by community", "incident rate", "top residents driving incidents"];
const monthPhrases = ["January", "February", "April", "May", "June"];

for (const community of communities) {
  for (const phrase of incidentPhrases) {
    const prompt = `${community} ${phrase}`;
    const match = matchCertifiedQuestion(prompt, frameOptions);
    assert(Boolean(match), "generated incident prompt should match a certified family", { prompt });
    const frame = applyAnalysisPatch(null, deriveAnalysisPatch(prompt, frameOptions));
    assert(frame.metric === "incidents" || phrase.includes("rate"), "generated incident prompt should produce incident metric", { prompt, frame });
    generated += 1;
  }

  for (const month of monthPhrases) {
    const prompt = `show ${community} census trend for ${month}`;
    const match = matchCertifiedQuestion(prompt, frameOptions);
    assert(match?.id === "census-trend", "generated census trend should match census family", { prompt, match: match?.id });
    const frame = applyAnalysisPatch(null, deriveAnalysisPatch(prompt, frameOptions));
    assert(frame.metric === "census" && frame.periods.length === 1, "generated census prompt should derive census period", { prompt, frame });
    generated += 1;
  }
}

const followUpBase = applyAnalysisPatch(null, deriveAnalysisPatch(
  "list every AWOL incident from May through June by community including resident date type and description",
  frameOptions
));
const followUps = [
  ["do it for April", "2026-04", "detail"],
  ["now San Pablo", "2026-05,2026-06", "detail"],
  ["just totals", "2026-05,2026-06", "aggregate"],
  ["export that", "2026-05,2026-06", "detail"]
];

for (const [prompt, expectedPeriods, expectedMode] of followUps) {
  const frame = applyAnalysisPatch(followUpBase, deriveAnalysisPatch(prompt, frameOptions));
  assert(frame.metric === "incidents" && frame.category === "AWOL/Elopement", "follow-up lost inherited incident subject", { prompt, frame });
  assert(frame.periods.join(",") === expectedPeriods, "follow-up period patch failed", { prompt, expectedPeriods, frame });
  assert(frame.mode === expectedMode, "follow-up mode patch failed", { prompt, expectedMode, frame });
  generated += 1;
}

const exportAndComparisonPrompts = [
  "export San Pablo AWOL incidents for April to csv",
  "download JC Wallace medication refusal incidents",
  "how many people went AWOL at JC Wallace in May 2026",
  "number of substance use incidents at Santa Clarita in June",
  "how many residents were at Victoria's House in April 2026",
  "why are San Pablo incidents stale today",
  "compare Santa Clarita incidents May vs June",
  "compare Turlock incident rates from April to May",
  "show Victoria AWOL incidents by community",
  "rank residents driving San Pablo incidents in June",
  "show A & A Health Services San Pablo current operating picture",
  "what data can the analyst use right now",
  "show medication compliance by community",
  "top refused medications by community"
];

for (const prompt of exportAndComparisonPrompts) {
  const match = matchCertifiedQuestion(prompt, frameOptions);
  assert(Boolean(match), "extra certified prompt did not match any family", { prompt });
  const frame = applyAnalysisPatch(null, deriveAnalysisPatch(prompt, frameOptions));
  assert(Boolean(frame.metric) || /data|operating picture/i.test(prompt), "extra certified prompt did not derive a usable frame", { prompt, frame, match: match?.id });
  generated += 1;
}

const cacheRequests = buildCertifiedCacheRequests({ facilities, months });
assert(cacheRequests.length >= 20, "certified cache request plan is too small", { count: cacheRequests.length });
assert(cacheRequests.every((request) => request.prompt && request.matchedQuestion), "cache request missing certified match", cacheRequests.filter((request) => !request.matchedQuestion));

const [liveCommunities, liveReportsSummary] = await Promise.all([
  getCommunitiesDashboardData(),
  getReportsSummaryData()
]);
const liveDataSignature = buildCertifiedAnswerDataSignature(liveCommunities, liveReportsSummary);
assert(/^certified-data-v1:[a-f0-9]{64}$/.test(liveDataSignature), "certified cache data signature is malformed", { liveDataSignature });
const currentSnapshotRoute = getCertifiedQuestionRouteById("incident-current-snapshot:0");
assert(Boolean(currentSnapshotRoute), "current snapshot route could not be resolved");
const currentSnapshotPrompt = currentSnapshotRoute.runPrompt;
const currentSnapshotFrame = applyAnalysisPatch(null, deriveAnalysisPatch(currentSnapshotPrompt, frameOptions));
const currentSnapshotMeta = makeCertifiedQuestionMeta(currentSnapshotRoute.question, currentSnapshotFrame);
const currentSnapshotCacheKey = currentSnapshotMeta
  ? `${currentSnapshotMeta.cacheKey}:route:${currentSnapshotRoute.id}`
  : null;
assert(Boolean(currentSnapshotCacheKey), "current snapshot cache key could not be derived");
const currentSnapshotCache = await getCertifiedAnswerCacheEntry(currentSnapshotCacheKey, {
  dataSignature: liveDataSignature
});
assert(Boolean(currentSnapshotCache), "certified cache did not contain a current-snapshot-compatible incident answer");
const staleSnapshotCache = await getCertifiedAnswerCacheEntry(currentSnapshotCacheKey, {
  dataSignature: "certified-data-v1:stale"
});
assert(staleSnapshotCache == null, "certified cache accepted an answer from a different data snapshot", staleSnapshotCache);

for (const routeId of ["incident-current-snapshot:0", "community-month-status:1"]) {
  const route = getCertifiedQuestionRouteById(routeId);
  assert(Boolean(route), "guided cache smoke route could not be resolved", { routeId });
  const result = await runCopilotTool({
    content: route.runPrompt,
    certifiedQuestionRouteId: route.id,
    sessionId: `guided-cache-smoke-${route.id}-${Date.now()}`
  });
  assert(result.handled && result.guidedContract?.valid === true, "cached guided route did not pass its runtime contract", {
    routeId,
    tool: result.tool,
    truthState: result.truthState,
    guidedContract: result.guidedContract,
    text: result.text
  });
}

const portfolioDiagnosis = await runCopilotTool({ content: "show portfolio diagnosis mix" });
assert(portfolioDiagnosis.visual?.type === "bar_chart", "portfolio diagnosis mix reused a grouped-community cache entry", {
  cache: portfolioDiagnosis.turnTrace?.cache,
  visual: portfolioDiagnosis.visual?.type,
  note: portfolioDiagnosis.trace?.note
});
const groupedDiagnosis = await runCopilotTool({ content: "diagnosis mix by community" });
assert(groupedDiagnosis.visual?.type === "table" && /group=community/i.test(String(groupedDiagnosis.trace?.note ?? "")), "grouped diagnosis mix lost its community shape", {
  cache: groupedDiagnosis.turnTrace?.cache,
  visual: groupedDiagnosis.visual?.type,
  note: groupedDiagnosis.trace?.note
});

const uniquePeopleFrame = applyAnalysisPatch(null, deriveAnalysisPatch("how many people went AWOL in May 2026", frameOptions));
const uniquePeoplePlan = createExecutionPlan(uniquePeopleFrame, "incident_breakdown");
const wrongGrainCache = certifiedCacheEligible({
  cachedResult: {
    handled: true,
    tool: "incident_breakdown",
    truthState: "valid_rows",
    text: "May 2026 AWOL incidents: Portfolio had 195 incident rows.",
    trace: { tool: "incident_breakdown", rowCount: 1, period: "2026-05", note: "category=AWOL/Elopement", truthState: "valid_rows" },
    visual: { type: "bar_chart", title: "Portfolio AWOL/Elopement Incidents", valueLabel: "Incidents", rows: [{ label: "AWOL/Elopement", value: 195 }] }
  },
  content: "how many people went AWOL in May 2026",
  communities: { facilities },
  executionPlan: uniquePeoplePlan,
  expectedTool: "incident_breakdown",
  reportsSummary: {},
  certifiedQuestion: matchCertifiedQuestion("how many people went AWOL in May 2026", frameOptions)
});
assert(!wrongGrainCache.eligible && /(plan mismatch|metric grain mismatch)/i.test(wrongGrainCache.reason), "certified cache accepted wrong metric grain", wrongGrainCache);

const nonCacheableTruthState = certifiedCacheEligible({
  cachedResult: {
    handled: true,
    tool: "incident_breakdown",
    safeRefusal: true,
    truthState: "not_loaded",
    text: "Portfolio incident breakdown is not available for Nov 2020.",
    trace: { tool: "incident_breakdown", rowCount: 0, period: "2020-11", truthState: "not_loaded" },
    visual: { type: "table", title: "Available Data for This Request", rows: [] }
  },
  content: "show incidents for November 2020",
  communities: { facilities },
  executionPlan: createExecutionPlan(applyAnalysisPatch(null, deriveAnalysisPatch("show incidents for November 2020", frameOptions)), "incident_breakdown"),
  expectedTool: "incident_breakdown",
  reportsSummary: {},
  certifiedQuestion: matchCertifiedQuestion("show incidents for November 2020", frameOptions)
});
assert(!nonCacheableTruthState.eligible && /truth state/i.test(nonCacheableTruthState.reason), "certified cache accepted a not-loaded safe refusal", nonCacheableTruthState);

const facilityScopedPlan = createExecutionPlan(
  makeFrame({
    metric: "incidents",
    mode: "summary",
    periods: ["2026-06"],
    facilityId: "337",
    communityName: "A & A Health Services San Pablo"
  }),
  "incident_breakdown",
  { preferFallback: true }
);
const wrongFacilityCache = certifiedCacheEligible({
  cachedResult: {
    handled: true,
    tool: "incident_breakdown",
    truthState: "valid_rows",
    text: "Santa Clarita incident breakdown for Jun 2026.",
    trace: { tool: "incident_breakdown", rowCount: 1, period: "2026-06", facilityId: "345", communityName: "Santa Clarita", truthState: "valid_rows" },
    visual: { type: "bar_chart", title: "Santa Clarita Incident Category Breakdown", valueLabel: "Incidents", rows: [{ label: "Medication Refusal", value: 10 }] }
  },
  content: "San Pablo incidents in June",
  communities: { facilities },
  executionPlan: facilityScopedPlan,
  expectedTool: "incident_breakdown",
  reportsSummary: {},
  certifiedQuestion: matchCertifiedQuestion("San Pablo incidents in June", frameOptions)
});
assert(!wrongFacilityCache.eligible && /community scope mismatch/i.test(wrongFacilityCache.reason), "certified cache accepted wrong community scope", wrongFacilityCache);

const awolPlan = createExecutionPlan(
  makeFrame({
    metric: "incidents",
    metricGrain: "incident_events",
    category: "AWOL/Elopement",
    mode: "summary",
    periods: ["2026-05"]
  }),
  "incident_breakdown",
  { preferFallback: true }
);
const wrongCategoryCache = certifiedCacheEligible({
  cachedResult: {
    handled: true,
    tool: "incident_breakdown",
    truthState: "valid_rows",
    text: "May 2026 Medication Refusal incidents: 286 incident rows.",
    trace: { tool: "incident_breakdown", rowCount: 1, period: "2026-05", note: "category=Medication Refusal", truthState: "valid_rows" },
    visual: { type: "bar_chart", title: "Portfolio Medication Refusal Incidents", valueLabel: "Incidents", rows: [{ label: "Medication Refusal", value: 286 }] }
  },
  content: "how many AWOL incidents in May 2026 total",
  communities: { facilities },
  executionPlan: awolPlan,
  expectedTool: "incident_breakdown",
  reportsSummary: {},
  certifiedQuestion: matchCertifiedQuestion("how many AWOL incidents in May 2026 total", frameOptions)
});
assert(!wrongCategoryCache.eligible && /plan mismatch/i.test(wrongCategoryCache.reason), "certified cache accepted wrong incident category", wrongCategoryCache);

const residentScopedPlan = createExecutionPlan(
  makeFrame({
    metric: "resident",
    mode: "profile",
    residentName: "Shannon Romero"
  }),
  "resident_lookup",
  { preferFallback: true }
);
const wrongResidentCache = certifiedCacheEligible({
  cachedResult: {
    handled: true,
    tool: "resident_lookup",
    truthState: "valid_rows",
    text: "John Smith is a current resident at Santa Clarita.",
    trace: { tool: "resident_lookup", rowCount: 1, truthState: "valid_rows" },
    visual: { type: "profile_card", title: "John Smith Resident Profile", valueLabel: "Profile", rows: [{ label: "Resident #", value: 9510000 }] }
  },
  content: "show Shannon Romero resident profile",
  communities: { facilities },
  executionPlan: residentScopedPlan,
  expectedTool: "resident_lookup",
  reportsSummary: {},
  certifiedQuestion: matchCertifiedQuestion("show Shannon Romero resident profile", frameOptions)
});
assert(!wrongResidentCache.eligible && /resident scope mismatch/i.test(wrongResidentCache.reason), "certified cache accepted wrong resident profile scope", wrongResidentCache);

const medicationSpecificCache = certifiedCacheEligible({
  cachedResult: {
    handled: true,
    tool: "medication_refusals_by_community",
    truthState: "valid_rows",
    text: "Top refused medications: Eliquis 2.5 MG TABS.",
    trace: { tool: "medication_refusals_by_community", rowCount: 1, truthState: "valid_rows" },
    visual: { type: "bar_chart", title: "Medication Refusals", valueLabel: "Refusals", rows: [{ label: "Eliquis 2.5 MG TABS", value: 10 }] }
  },
  content: "show Myrbetriq refusals",
  communities: { facilities },
  executionPlan: createExecutionPlan(makeFrame({ metric: "medications", mode: "summary" }), "medication_refusals_by_community", { preferFallback: true }),
  expectedTool: "medication_refusals_by_community",
  reportsSummary: {
    toolContext: {
      tables: {
        medication_refusal_summary: [
          { medication: "Eliquis 2.5 MG TABS", refusals: 10 },
          { medication: "Myrbetriq 25 MG TB24", refusals: 8 }
        ]
      }
    }
  },
  certifiedQuestion: matchCertifiedQuestion("show Myrbetriq refusals", frameOptions)
});
assert(!medicationSpecificCache.eligible && /specific filter/i.test(medicationSpecificCache.reason), "certified cache accepted medication-specific request", medicationSpecificCache);

const livePrompts = [
  ["incidents", "incident_breakdown"],
  ["how many people went AWOL in May 2026", "incident_breakdown"],
  ["how many AWOL incidents in May 2026 total", "incident_breakdown"],
  ["how many clients at San Pablo in January 2026", "census_trend"],
  ["why are today's incidents not showing up", "data_availability"],
  ["are daily incidents loaded", "data_availability"],
  ["list every AWOL incident from May through June by community including resident date type and description", "incident_detail_list"],
  ["show Santa Clarita census trend", "census_trend"],
  ["show Shannon Romero resident profile", "resident_lookup"],
  ["what changed at San Pablo", "community_history"],
  ["what changed for Shannon Romero", "resident_lookup"],
  ["what changed in census at San Pablo", "census_movement"],
  ["what changed in incidents this month", "incident_breakdown"],
  ["show me the resident search module", "surface_module"],
  ["show available modules", "module_catalog"]
];

for (const [prompt, expectedTool] of livePrompts) {
  const result = await runCopilotTool({
    content: prompt,
    sessionId: `certified-rails-${Date.now()}`
  });
  assert(result.planValidation?.valid, "live certified prompt failed plan validation", { prompt, result });
  assert(result.tool === expectedTool, "live certified prompt selected wrong tool", { prompt, expectedTool, actual: result.tool });
  if (expectedTool !== "data_availability") {
    assert(result.certifiedQuestion?.id, "live certified prompt missing certified metadata", { prompt, result });
  }
  assert((result.actions ?? []).length <= 2, "live certified prompt exposed too many action chips", { prompt, actions: result.actions });
}

const cacheParityPrompts = [
  "How is San Pablo doing?",
  "Show the medication profile by community.",
  "List every AWOL/Elopement incident from 2026-05 through 2026-06."
];

for (const prompt of cacheParityPrompts) {
  process.env.CERTIFIED_ANSWER_CACHE_ENABLED = "true";
  const cached = await runCopilotTool({
    content: prompt,
    sessionId: `certified-cache-parity-cached-${Date.now()}-${prompt}`
  });
  process.env.CERTIFIED_ANSWER_CACHE_ENABLED = "false";
  const live = await runCopilotTool({
    content: prompt,
    sessionId: `certified-cache-parity-live-${Date.now()}-${prompt}`
  });
  assert(cached.text === live.text, "certified cache changed the final answer text", {
    prompt,
    cached: cached.text,
    live: live.text
  });
  assert(cached.visual?.type === live.visual?.type, "certified cache changed the visual type", {
    prompt,
    cached: cached.visual?.type,
    live: live.visual?.type
  });
  assert(JSON.stringify(cached.visual?.rows ?? []) === JSON.stringify(live.visual?.rows ?? []), "certified cache changed the rendered rows", {
    prompt,
    cached: cached.visual?.rows,
    live: live.visual?.rows
  });
  const cachedDateViolations = findUserFacingDateContractViolations(cached);
  assert(cachedDateViolations.length === 0, "certified cache exposed a machine or abbreviated date", {
    prompt,
    violations: cachedDateViolations
  });
  const liveDateViolations = findUserFacingDateContractViolations(live);
  assert(liveDateViolations.length === 0, "live certified answer exposed a machine or abbreviated date", {
    prompt,
    violations: liveDateViolations
  });
}
process.env.CERTIFIED_ANSWER_CACHE_ENABLED = "true";

console.log(`certified analyst rails checks passed (${generated} prompt cases + ${cacheRequests.length} cache requests + ${livePrompts.length} live turns + ${cacheParityPrompts.length} cache parity checks, ${CERTIFIED_ANALYST_QUESTIONS.length} families)`);
