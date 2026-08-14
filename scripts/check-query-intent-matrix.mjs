import {
  applyAnalysisPatch,
  createExecutionPlan,
  deriveAnalysisPatch
} from "../shared/analysis-session-state.mjs";

const facilities = [
  { facility_id: "337", community_name: "A & A Health Services San Pablo", alias: "San Pablo", shorthand: "pablo" },
  { facility_id: "342", community_name: "Victoria's House", alias: "Victoria's House", shorthand: "victoria" },
  { facility_id: "343", community_name: "JC Wallace House", alias: "JC Wallace House", shorthand: "wallace" },
  { facility_id: "344", community_name: "AHS Turlock OP LLC", alias: "Turlock", shorthand: "turlock" },
  { facility_id: "345", community_name: "Santa Clarita", alias: "Santa Clarita", shorthand: "clarita" }
];
const historicalMonths = [
  ["November", "2025-11"],
  ["December", "2025-12"]
];
const months = [
  ["January", "2026-01"],
  ["February", "2026-02"],
  ["March", "2026-03"],
  ["April", "2026-04"],
  ["May", "2026-05"],
  ["June", "2026-06"]
];
const categories = ["AWOL/Elopement", "Medical Emergency", "Substance Use"];
const options = {
  facilities,
  residents: [],
  availableMonths: [...historicalMonths, ...months].map(([, period]) => period),
  categories
};
const cases = [];
const add = (prompt, expected) => cases.push({ prompt, expected });

for (const facility of facilities) {
  const communityHistoryPrompts = [
    [`how was ${facility.shorthand} november through january`, ["2025-11", "2025-12", "2026-01"]],
    [`what happened at ${facility.alias} between February and April`, ["2026-02", "2026-03", "2026-04"]],
    [`give me the read on ${facility.shorthand} last few months`, ["2026-04", "2026-05", "2026-06"]],
    [`how did ${facility.alias} look March - May`, ["2026-03", "2026-04", "2026-05"]],
    [`show ${facility.alias} YTD picture`, ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]],
    [`how was ${facility.shorthand} q1`, ["2026-01", "2026-02", "2026-03"]],
    [`how has ${facility.shorthand} been since november`, ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]],
    [`how has ${facility.alias} been from February onward`, ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]],
    [`show me ${facility.shorthand} quarter to date`, ["2026-04", "2026-05", "2026-06"]],
    [`give me ${facility.alias} previous quarter`, ["2026-01", "2026-02", "2026-03"]],
    [`how has ${facility.shorthand} been trailing 3 months`, ["2026-04", "2026-05", "2026-06"]],
    [`what's the ${facility.alias} read last 6 mos`, ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]]
  ];

  for (const [prompt, periods] of communityHistoryPrompts) {
    add(prompt, {
      tool: "community_history",
      facilityId: facility.facility_id,
      periods
    });
  }

  for (const [month, period] of months) {
    for (const category of categories) {
      const phrase = category === "AWOL/Elopement" ? "AWOL" : category;
      add(`how many ${phrase} incidents did ${facility.alias} have in ${month} 2026`, {
        tool: "incident_breakdown", metric: "incidents", metricGrain: "incident_events", category, period, facilityId: facility.facility_id
      });
      add(`how many people had ${phrase} incidents at ${facility.alias} in ${month} 2026`, {
        tool: "incident_breakdown", metric: "incidents", metricGrain: "distinct_residents", category, period, facilityId: facility.facility_id
      });
      add(`list every ${facility.alias} ${phrase} incident row in ${month} 2026 with resident date type and description`, {
        tool: "incident_detail_list", metric: "incidents", mode: "detail", category, period, facilityId: facility.facility_id
      });
      add(`export every ${facility.alias} ${phrase} incident in ${month} 2026 to csv`, {
        tool: "export_csv", metric: "incidents", category, period, facilityId: facility.facility_id, export: true
      });
    }

    add(`list all ${facility.alias} census rows for ${month} 2026`, {
      tool: "detail_list", metric: "census", mode: "detail", period, facilityId: facility.facility_id
    });
    add(`list every ${facility.alias} medication compliance row for ${month} 2026`, {
      tool: "detail_list", metric: "medications", mode: "detail", period, facilityId: facility.facility_id
    });
    add(`which community added the most residents in ${month} 2026`, {
      tool: "census_movement", metric: "census", calculation: "movement", period
    });
    add(`show ${facility.alias} census trend in ${month} 2026`, {
      tool: "census_trend", metric: "census", mode: "trend", period, facilityId: facility.facility_id
    });
    add(`show ${facility.alias} medication compliance in ${month} 2026`, {
      tool: "medication_compliance", metric: "medications", period, facilityId: facility.facility_id
    });
    add(`slice ${facility.alias} incidents by category for ${month} 2026`, {
      tool: "slice_discovery", metric: "incidents", grouping: "category", period, facilityId: facility.facility_id
    });
    add(`pivot ${facility.alias} census by month for ${month} 2026`, {
      tool: "slice_discovery", metric: "census", grouping: "month", period, facilityId: facility.facility_id
    });
  }

  add(`compare ${facility.alias} incidents March April May June 2026 by category`, {
    tool: "slice_discovery",
    metric: "incidents",
    mode: "comparison",
    grouping: "category",
    facilityId: facility.facility_id,
    periods: ["2026-03", "2026-04", "2026-05", "2026-06"]
  });
  add(`compare ${facility.alias} census March April May June 2026 by month`, {
    tool: "slice_discovery",
    metric: "census",
    mode: "comparison",
    grouping: "month",
    facilityId: facility.facility_id,
    periods: ["2026-03", "2026-04", "2026-05", "2026-06"]
  });
}

for (const [month, period] of months) {
  for (const category of categories) {
    const phrase = category === "AWOL/Elopement" ? "AWOL" : category;
    add(`${phrase} incidents by community in ${month} 2026`, {
      tool: "slice_metric", metric: "incidents", category, grouping: "community", period
    });
  }
  add(`list every documentation gap row in ${month} 2026`, {
    tool: "detail_list", metric: "documentation", mode: "detail", period
  });
}

if (cases.length < 500) {
  console.error(`FAILED: expected at least 500 intent cases, found ${cases.length}`);
  process.exit(1);
}

const failures = [];
for (const testCase of cases) {
  const derived = deriveAnalysisPatch(testCase.prompt, options);
  const frame = applyAnalysisPatch(null, derived);
  const plan = createExecutionPlan(frame);
  const expected = testCase.expected;
  const checks = [
    ["tool", plan.tool, expected.tool],
    ["metric", frame.metric, expected.metric],
    ["metric grain", frame.metricGrain, expected.metricGrain],
    ["mode", frame.mode, expected.mode],
    ["category", frame.category, expected.category],
    ["grouping", frame.grouping, expected.grouping],
    ["calculation", frame.calculation, expected.calculation],
    ["facility", frame.facilityId, expected.facilityId],
    ["export", frame.export, expected.export]
  ];
  for (const [label, actual, wanted] of checks) {
    if (wanted !== undefined && actual !== wanted) failures.push(`${testCase.prompt}: ${label} expected ${wanted}, received ${actual ?? "null"}`);
  }
  if (expected.period && !frame.periods.includes(expected.period)) {
    failures.push(`${testCase.prompt}: period missing ${expected.period}`);
  }
  for (const expectedPeriod of expected.periods ?? []) {
    if (!frame.periods.includes(expectedPeriod)) {
      failures.push(`${testCase.prompt}: period missing ${expectedPeriod}`);
    }
  }
}

if (failures.length) {
  console.error(`FAILED: query intent matrix (${failures.length}/${cases.length})`);
  console.error(failures.slice(0, 40).map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`query intent matrix passed (${cases.length} structured prompts)`);
