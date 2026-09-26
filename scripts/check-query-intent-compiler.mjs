import { compileCopilotIntent } from "../server/copilot-tools.mjs";

const cases = [
  {
    prompt: "how many people went AWOL in May 2026",
    metric: "incidents",
    metricGrain: "distinct_residents",
    category: "AWOL/Elopement",
    mode: "aggregate",
    periods: ["2026-05"],
    tool: "incident_breakdown"
  },
  {
    prompt: "how many AWOL incidents in May 2026 total",
    metric: "incidents",
    metricGrain: "incident_events",
    category: "AWOL/Elopement",
    mode: "aggregate",
    periods: ["2026-05"],
    tool: "incident_breakdown"
  },
  {
    prompt: "how many clients went AWOL last month",
    metric: "incidents",
    metricGrain: "distinct_residents",
    category: "AWOL/Elopement",
    mode: "aggregate",
    periods: ["2026-05"],
    tool: "incident_breakdown"
  },
  {
    prompt: "total AWOL events last month",
    metric: "incidents",
    metricGrain: "incident_events",
    category: "AWOL/Elopement",
    mode: "aggregate",
    periods: ["2026-05"],
    tool: "incident_breakdown"
  },
  {
    prompt: "show incident rows with resident date type and narrative for June",
    metric: "incidents",
    mode: "detail",
    fields: ["resident", "date", "type", "description"],
    periods: ["2026-06"],
    tool: "incident_detail_list"
  },
  {
    prompt: "find medication refusal incidents ever",
    metric: "incidents",
    category: "Medication Refusal",
    mode: "detail",
    tool: "incident_detail_list"
  },
  {
    prompt: "AWOL incidents by community in May and June",
    metric: "incidents",
    category: "AWOL/Elopement",
    grouping: "community",
    periods: ["2026-05", "2026-06"],
    tool: "slice_metric"
  },
  {
    prompt: "Between April and May 2026, which community had the largest increase in incidents per 100 residents?",
    metric: "incidents",
    calculation: "rate",
    grouping: "community",
    periods: ["2026-04", "2026-05"],
    tool: "incident_rate_change"
  },
  {
    prompt: "compare census trends across communities over the last six months",
    metric: "census",
    mode: "trend",
    grouping: "community",
    tool: "community_time_series"
  },
  {
    prompt: "show monthly census from January through June",
    metric: "census",
    mode: "trend",
    grouping: "month",
    periods: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
    tool: "slice_metric"
  },
  {
    prompt: "show monthly census January to June",
    metric: "census",
    mode: "trend",
    periods: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
    tool: "slice_metric"
  },
  {
    prompt: "are we counting fake patients in census?",
    metric: "census",
    calculation: "data_quality",
    tool: "slice_discovery"
  },
  {
    prompt: "show census data quality by community",
    metric: "census",
    calculation: "data_quality",
    grouping: "community",
    tool: "slice_discovery"
  },
  {
    prompt: "show resident countability audit",
    metric: "census",
    calculation: "data_quality",
    mode: "detail",
    tool: "slice_discovery"
  },
  {
    prompt: "show weekly census by community",
    metric: "census",
    grouping: "community",
    tool: "slice_discovery"
  },
  {
    prompt: "AWOL incidents June 2026 and November 2020",
    metric: "incidents",
    category: "AWOL/Elopement",
    mode: "comparison",
    periods: ["2026-06", "2020-11"],
    tool: "slice_metric"
  },
  {
    prompt: "how many clients at san pablo in january of 2026",
    metric: "census",
    mode: "aggregate",
    periods: ["2026-01"],
    facilityId: "337",
    tool: "census_trend"
  },
  {
    prompt: "list every client at san pablo",
    metric: "residents",
    mode: "detail",
    facilityId: "337",
    tool: "resident_search"
  },
  {
    prompt: "can i get the census search for santa clarita",
    metric: "residents",
    mode: "detail",
    facilityId: "345",
    tool: "resident_search"
  },
  {
    prompt: "give me admissions from january through may santa clarita",
    metric: "residents",
    mode: "detail",
    calculation: "admissions",
    periods: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"],
    facilityId: "345",
    tool: "detail_list"
  },
  {
    prompt: "Santa Clarita admits Jan through May 2026",
    metric: "residents",
    mode: "detail",
    calculation: "admissions",
    periods: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"],
    facilityId: "345",
    tool: "detail_list"
  },
  {
    prompt: "week by week breakdown by community of intake and discharge",
    metric: "residents",
    calculation: "resident_flow",
    tool: "resident_flow_weekly"
  },
  {
    prompt: "show monthly intake and discharge by community",
    metric: "residents",
    calculation: "resident_flow",
    grouping: "community",
    tool: "slice_discovery"
  },
  {
    prompt: "show weekly intake and dischare for San Pablo",
    metric: "residents",
    calculation: "resident_flow",
    facilityId: "337",
    tool: "resident_flow_weekly"
  },
  {
    prompt: "san pablo, how has been the last three months",
    periods: ["2026-04", "2026-05", "2026-06"],
    facilityId: "337",
    tool: "community_history"
  },
  {
    prompt: "hey how was pablo november throuhg january",
    periods: ["2025-11", "2025-12", "2026-01"],
    facilityId: "337",
    tool: "community_history"
  },
  {
    prompt: "rank community census movers",
    metric: "census",
    calculation: "movement",
    tool: "census_movement"
  },
  {
    prompt: "where did census decrease this month",
    metric: "census",
    calculation: "movement",
    tool: "census_movement"
  },
  {
    prompt: "resident risk watchlist all residents",
    metric: "residents",
    calculation: "risk",
    tool: "resident_risk_summary"
  },
  {
    prompt: "who had the most incidents in san pablo in may",
    metric: "incidents",
    calculation: "resident_drivers",
    periods: ["2026-05"],
    facilityId: "337",
    tool: "incident_resident_drivers"
  },
  {
    prompt: "show Audrey West incident history",
    metric: "incidents",
    residentName: "Audrey West",
    tool: "resident_incident_history"
  },
  {
    prompt: "compare census incidents and LOS by community",
    metric: "community",
    calculation: "community_compare",
    tool: "community_compare"
  },
  {
    prompt: "find a resident",
    tool: "surface_module",
    fallbackTool: "surface_module",
    frameFirst: false
  },
  {
    prompt: "list all census rows for May 2026",
    metric: "census",
    mode: "detail",
    periods: ["2026-05"],
    tool: "detail_list"
  },
  {
    prompt: "list every medication compliance row for May 2026",
    metric: "medications",
    mode: "detail",
    periods: ["2026-05"],
    tool: "detail_list"
  },
  {
    prompt: "show San Pablo medication profile",
    metric: "medications",
    facilityId: "337",
    tool: "medication_profile"
  },
  {
    prompt: "what is the latest incident date loaded",
    metric: null,
    tool: "data_availability",
    fallbackTool: "data_availability",
    frameFirst: false
  },
  {
    prompt: "What data periods are available for incident detail?",
    metric: null,
    tool: "data_availability",
    fallbackTool: "data_availability",
    frameFirst: false
  }
];

function assertEqual(actual, expected, message, failures) {
  if (expected === undefined) return;
  if (actual !== expected) failures.push(`${message}: expected ${expected}, received ${actual ?? "null"}`);
}

function assertArrayContains(actual = [], expected = [], message, failures) {
  for (const value of expected) {
    if (!actual.includes(value)) failures.push(`${message}: missing ${value}`);
  }
}

const failures = [];

for (const testCase of cases) {
  const result = await compileCopilotIntent({ content: testCase.prompt });
  const frame = result.analysisFrame ?? {};
  const plan = result.executionPlan ?? {};
  const compiler = result.compiler ?? {};
  const prefix = testCase.prompt;

  assertEqual(frame.metric, testCase.metric, `${prefix} metric`, failures);
  assertEqual(frame.metricGrain, testCase.metricGrain, `${prefix} metric grain`, failures);
  assertEqual(frame.category, testCase.category, `${prefix} category`, failures);
  assertEqual(frame.mode, testCase.mode, `${prefix} mode`, failures);
  assertEqual(frame.grouping, testCase.grouping, `${prefix} grouping`, failures);
  assertEqual(frame.calculation, testCase.calculation, `${prefix} calculation`, failures);
  assertEqual(frame.residentName, testCase.residentName, `${prefix} resident`, failures);
  assertEqual(frame.facilityId, testCase.facilityId, `${prefix} facility`, failures);
  assertEqual(plan.tool, testCase.tool, `${prefix} selected tool`, failures);
  assertEqual(compiler.fallbackTool, testCase.fallbackTool, `${prefix} fallback tool`, failures);
  assertEqual(compiler.frameFirst, testCase.frameFirst, `${prefix} frame-first flag`, failures);
  assertArrayContains(frame.periods, testCase.periods, `${prefix} periods`, failures);
  assertArrayContains(frame.fields, testCase.fields, `${prefix} fields`, failures);
}

if (failures.length) {
  console.error(`FAILED: query intent compiler (${failures.length})`);
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`query intent compiler checks passed (${cases.length} compiled prompts)`);
}
