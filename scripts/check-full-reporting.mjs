import {
  compileFullReportFromContext,
  getAvailableFullReportPeriods,
  getFullReportDefinitions
} from "../server/full-reporting.mjs";
import {
  FULL_REPORT_DEFINITIONS,
  renderFullReportHtml,
  validateFullReportDocument
} from "../shared/full-report.mjs";
import { ALAMO_FACILITIES } from "../shared/community-names.mjs";
import { validateFullReportRequest } from "../server/http-request-schema.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(`Full report check failed: ${message}`);
}

const facilities = [
  {
    facility_id: "337",
    community_name: "San Pablo",
    community_code: "SP",
    city: "San Pablo",
    state: "CA",
    total_residents: 100
  },
  {
    facility_id: "345",
    community_name: "Santa Clarita",
    community_code: "SC",
    city: "Santa Clarita",
    state: "CA",
    total_residents: 80
  }
];

const residents = [
  {
    res_number: "1",
    first_name: "Alex",
    last_name: "Rivera",
    age: 42,
    admit_date: "2025-01-15",
    los_days: 530,
    facility_id: "337",
    facility_name: "San Pablo",
    unit_number: "101A",
    primary_diagnosis: "Schizophrenia"
  },
  {
    res_number: "2",
    first_name: "Taylor",
    last_name: "Morgan",
    age: 36,
    admit_date: "2026-01-10",
    los_days: 170,
    facility_id: "345",
    facility_name: "Santa Clarita",
    unit_number: "201B",
    primary_diagnosis: "Schizoaffective disorder"
  },
  {
    res_number: "3",
    first_name: "SAN PABLO MHW 1",
    last_name: "PM",
    age: 0,
    admit_date: "2020-01-01",
    los_days: 2500,
    facility_id: "337",
    facility_name: "San Pablo",
    unit_number: "STAFF",
    primary_diagnosis: ""
  }
];

const incidentAggregates = [
  { facility_id: "337", category: "Medication Refusal", month_bucket: "2026-05", incident_count: 15 },
  { facility_id: "337", category: "Medication Refusal", month_bucket: "2026-06", incident_count: 12 },
  { facility_id: "337", category: "AWOL/Elopement", month_bucket: "2026-06", incident_count: 5 },
  { facility_id: "345", category: "Medication Refusal", month_bucket: "2026-06", incident_count: 8 },
  { facility_id: "337", category: "Medication Refusal", month_bucket: "2026-07", incident_count: 10 },
  { facility_id: "345", category: "AWOL/Elopement", month_bucket: "2026-07", incident_count: 4 }
];

const communities = {
  generated_at: "2026-07-28T12:00:00.000Z",
  as_of_date: "2026-07-27",
  facilities,
  residents,
  incidents: incidentAggregates
};

const home = {
  generated_at: communities.generated_at,
  reporting_month: "2026-07",
  snapshot_status: {
    stale: false,
    warning: null,
    generated_at: communities.generated_at,
    ageHours: 2,
    maxAgeHours: 30
  },
  portfolio: {
    communityCount: 2,
    residentCount: 2,
    currentIncidents: 14,
    averageAge: 39,
    averageLengthOfStay: 350
  },
  operational: {
    asOf: "2026-07-27T00:00:00.000Z",
    latestCensusWeek: "2026-07-27",
    currentWeeklyCensus: 180,
    priorWeeklyCensus: 177,
    censusChange7d: 3
  },
  communities: [
    {
      facility_id: "337",
      community_name: "San Pablo",
      currentWeeklyCensus: 100,
      priorWeeklyCensus: 98,
      censusChange7d: 2,
      averageAge: 42,
      averageLengthOfStay: 530
    },
    {
      facility_id: "345",
      community_name: "Santa Clarita",
      currentWeeklyCensus: 80,
      priorWeeklyCensus: 79,
      censusChange7d: 1,
      averageAge: 36,
      averageLengthOfStay: 170
    }
  ],
  reporting: {
    averageCompliance: 96,
    documentationGapCount: 1,
    refusalSignalCount: 1
  }
};

const medicationCompliance = [
  {
    facility_id: "337",
    facility_name: "San Pablo",
    month_bucket: "2026-06",
    total_scheduled: 900,
    given: 855,
    compliance_pct: 95
  },
  {
    facility_id: "345",
    facility_name: "Santa Clarita",
    month_bucket: "2026-06",
    total_scheduled: 700,
    given: 630,
    compliance_pct: 90
  },
  {
    facility_id: "337",
    facility_name: "San Pablo",
    month_bucket: "2026-07",
    total_scheduled: 1000,
    given: 970,
    compliance_pct: 97
  },
  {
    facility_id: "345",
    facility_name: "Santa Clarita",
    month_bucket: "2026-07",
    total_scheduled: 800,
    given: 760,
    compliance_pct: 95
  }
];

const residentFlowMonthlyByCommunity = [
  { facility_id: "337", facility_name: "San Pablo", month_bucket: "2025-12", admissions: 4, discharges: 2, net_change: 2 },
  { facility_id: "345", facility_name: "Santa Clarita", month_bucket: "2025-12", admissions: 2, discharges: 1, net_change: 1 },
  { facility_id: "337", facility_name: "San Pablo", month_bucket: "2026-06", admissions: 2, discharges: 4, net_change: -2 },
  { facility_id: "345", facility_name: "Santa Clarita", month_bucket: "2026-06", admissions: 1, discharges: 1, net_change: 0 },
  { facility_id: "337", facility_name: "San Pablo", month_bucket: "2026-07", admissions: 3, discharges: 1, net_change: 2 },
  { facility_id: "345", facility_name: "Santa Clarita", month_bucket: "2026-07", admissions: 2, discharges: 1, net_change: 1 }
];

const residentEpisodeHistory = [
  {
    episode_id: "episode-1",
    facility_id: "337",
    facility_name: "San Pablo",
    resident_id: "1",
    resident_name: "Alex Rivera",
    admit_date: "2025-01-15",
    discharge_date: "2025-12-20",
    discharge_reason: "Lower level of care",
    discharge_destination: "Community placement",
    episode_status: "discharged",
    month_bucket: "2025-01"
  },
  {
    episode_id: "episode-2",
    facility_id: "337",
    facility_name: "San Pablo",
    resident_id: "1",
    resident_name: "Alex Rivera",
    admit_date: "2026-01-15",
    discharge_date: null,
    discharge_reason: null,
    discharge_destination: null,
    episode_status: "active_or_unknown",
    month_bucket: "2026-01"
  },
  {
    episode_id: "episode-3",
    facility_id: "345",
    facility_name: "Santa Clarita",
    resident_id: "2",
    resident_name: "Taylor Morgan",
    admit_date: "2026-01-10",
    discharge_date: "2026-06-30",
    discharge_reason: null,
    discharge_destination: null,
    episode_status: "discharged",
    month_bucket: "2026-01"
  }
];

const marMonthlyByCommunityMedication = [
  { facility_id: "337", month_bucket: "2026-06", medication_name: "Medication A", refusal_count: 6 },
  { facility_id: "345", month_bucket: "2026-06", medication_name: "Medication B", refusal_count: 3 },
  { facility_id: "337", month_bucket: "2026-07", medication_name: "Medication A", refusal_count: 8 },
  { facility_id: "345", month_bucket: "2026-07", medication_name: "Medication B", refusal_count: 4 }
];

const censusWeeklyByCommunity = [
  { facility_id: "337", facility_name: "San Pablo", census_date: "2026-01-05", census: 92 },
  { facility_id: "345", facility_name: "Santa Clarita", census_date: "2026-01-05", census: 74 },
  { facility_id: "337", facility_name: "San Pablo", census_date: "2026-04-06", census: 96 },
  { facility_id: "345", facility_name: "Santa Clarita", census_date: "2026-04-06", census: 77 },
  { facility_id: "337", facility_name: "San Pablo", census_date: "2026-07-27", census: 100 },
  { facility_id: "345", facility_name: "Santa Clarita", census_date: "2026-07-27", census: 80 }
];

const documentationStatus = [
  {
    resident_id: "1",
    resident_name: "Alex Rivera",
    facility_id: "337",
    facility_name: "San Pablo",
    last_note_date: "2026-07-20",
    days_since_last_note: 7
  },
  {
    resident_id: "2",
    resident_name: "Taylor Morgan",
    facility_id: "345",
    facility_name: "Santa Clarita",
    last_note_date: "2026-07-25",
    days_since_last_note: 2
  }
];

const marResidentSummary = [
  {
    resident_id: "1",
    resident_name: "Alex Rivera",
    facility_id: "337",
    facility_name: "San Pablo",
    active_medication_count: 8,
    active_psychotropic_count: 3,
    compliance_pct_30d: 98,
    prn_given_30d: 4,
    prn_followup_30d: 3
  },
  {
    resident_id: "2",
    resident_name: "Taylor Morgan",
    facility_id: "345",
    facility_name: "Santa Clarita",
    active_medication_count: 6,
    active_psychotropic_count: 2,
    compliance_pct_30d: 94,
    prn_given_30d: 0,
    prn_followup_30d: 0
  }
];

const summary = {
  census: [
    { facility_id: "337", month_bucket: "2026-06", census: 98 },
    { facility_id: "345", month_bucket: "2026-06", census: 79 },
    { facility_id: "337", month_bucket: "2026-07", census: 100 },
    { facility_id: "345", month_bucket: "2026-07", census: 80 }
  ],
  medicationCompliance,
  refusalByMedication: [
    { facility_id: "337", medication: "Current-only fallback", refusals: 99 }
  ],
  documentationGaps: [
    {
      resident_id: "1",
      resident_name: "Alex Rivera",
      facility_id: "337",
      facility_name: "San Pablo",
      last_note_date: "2026-07-20",
      days_since_last_note: 7
    },
    {
      resident_id: "3",
      resident_name: "SAN PABLO MHW 1 PM",
      facility_id: "337",
      facility_name: "San Pablo",
      last_note_date: null,
      days_since_last_note: 0
    }
  ],
  toolContext: {
    residentFlowMonthlyByCommunity,
    marMonthlyByCommunityMedication,
    residentEpisodeHistory,
    censusWeeklyByCommunity,
    documentationStatus,
    marResidentSummary
  }
};

const community = {
  generated_at: communities.generated_at,
  facility: facilities[0],
  reporting_month: "2026-07",
  census: [
    { facility_id: "337", month_bucket: "2026-06", census: 98 },
    { facility_id: "337", month_bucket: "2026-07", census: 100 }
  ],
  incidentDetails: [
    {
      id: "old",
      facility_id: "337",
      resident_id: "1",
      client_name: "Alex Rivera",
      incident_date: "2026-06-15",
      month_bucket: "2026-06",
      category: "AWOL/Elopement",
      location: "Courtyard"
    },
    {
      id: "current",
      facility_id: "337",
      resident_id: "1",
      client_name: "Alex Rivera",
      incident_date: "2026-07-15",
      month_bucket: "2026-07",
      category: "Medication Refusal",
      location: "Medication room"
    }
  ],
  longestStayResidents: [residents[2], residents[0]]
};

const inputs = { home, summary, communities, community };
const reportIds = [
  "overview",
  "community",
  "effectiveness",
  "census",
  "incidents",
  "medications",
  "residents"
];

assert(
  FULL_REPORT_DEFINITIONS.map((definition) => definition.id).join(",") === reportIds.join(","),
  "the shared catalog must contain exactly the seven non-overlapping report families"
);
assert(
  getFullReportDefinitions().reports.map((definition) => definition.id).join(",") === reportIds.join(","),
  "the API catalog must match the shared catalog"
);
assert(
  getFullReportDefinitions().reports
    .filter((definition) => definition.showInAnalyticsNav)
    .map((definition) => definition.id)
    .join(",") === "overview,census,incidents,medications,residents" &&
    getFullReportDefinitions().reports.find((definition) => definition.id === "community")
      ?.showInAnalyticsNav === false &&
    getFullReportDefinitions().reports.find((definition) => definition.id === "effectiveness")
      ?.showInAnalyticsNav === false,
  "Analytics navigation must show only five finished report families while retaining hidden community and effectiveness services"
);
assert(
  validateFullReportRequest({ reportId: "effectiveness", audience: "county" }).reportId ===
    "effectiveness",
  "the HTTP request boundary must accept every canonical report family"
);

for (const reportId of reportIds) {
  const request = reportId === "community"
    ? { reportId, facilityId: "337" }
    : { reportId };
  const first = validateFullReportDocument(compileFullReportFromContext(request, inputs));
  const second = compileFullReportFromContext(request, inputs);
  assert(first.id === second.id, `${reportId} must compile to a stable ID`);
  assert(first.sections.length >= 1, `${reportId} must contain a report body without filler sections`);
  assert(first.freshness.status === "current", `${reportId} must carry snapshot freshness`);
  assert(first.evidence.sources.length >= 1, `${reportId} must retain evidence provenance`);
  assert(!first.summary.includes(";"), `${reportId} must use natural report prose`);
  assert(
    new Set(first.sections.map((section) => section.id)).size === first.sections.length,
    `${reportId} must not repeat report sections`
  );
  const html = renderFullReportHtml(first);
  assert(html.includes("<!doctype html>"), `${reportId} must produce a standalone artifact`);
  assert(html.includes(first.title), `${reportId} artifact must retain its title`);
  assert(html.includes("Snapshot updated"), `${reportId} artifact must disclose its update time`);
  assert(!html.includes("report-executive"), `${reportId} must not retain the retired executive layout`);
}

for (const retiredId of ["executive", "portfolio"]) {
  let rejected = false;
  try {
    validateFullReportRequest({ reportId: retiredId });
  } catch {
    rejected = true;
  }
  assert(rejected, `${retiredId} must not remain as a hidden API report alias`);
}

for (const invalidRequest of [
  { reportId: "overview", facilityId: "337" },
  { reportId: "residents", period: "2026-07" },
  { reportId: "incidents", period: "2024-01" },
  { reportId: "overview", audience: "county" },
  { reportId: "effectiveness", audience: "unsupported" }
]) {
  let rejected = false;
  try {
    compileFullReportFromContext(invalidRequest, inputs);
  } catch {
    rejected = true;
  }
  assert(
    rejected,
    `${JSON.stringify(invalidRequest)} must be rejected instead of silently changing scope or period`
  );
}

const overview = compileFullReportFromContext({ reportId: "overview" }, inputs);
assert(overview.title === "Portfolio overview", "the report library must open on one live portfolio overview");
assert(
  overview.metrics.some(
    (metric) => metric.label === "Medication completion" && metric.value === "96.1%"
  ),
  "portfolio medication completion must be weighted by scheduled administrations"
);
const overviewOperatingSection = overview.sections.find(
  (section) => section.id === "community-operating-position"
);
const overviewOperatingTable = overviewOperatingSection?.blocks.find(
  (block) => block.type === "table"
);
assert(
  overviewOperatingTable?.columns.some((column) => column.key === "admissions") &&
    overviewOperatingTable?.columns.some((column) => column.key === "discharges") &&
    overviewOperatingTable?.columns.some((column) => column.key === "net"),
  "the portfolio comparison must include resident flow when it is loaded"
);
assert(
  overviewOperatingTable?.columns.some((column) => column.key === "operatingLimit") &&
    overview.evidence.sources.some((source) => source.slice === "community_capacity_registry"),
  "the latest portfolio comparison must include current capacity with provenance"
);
assert(
  overview.metrics.some(
    (metric) => metric.label === "Operating utilization" && metric.value === "55.4%"
  ),
  "capacity utilization must use only the communities represented by the governed census"
);
for (const sectionId of ["community-operating-position", "current-resident-context", "care-delivery-coverage"]) {
  assert(
    overview.sections.some((section) => section.id === sectionId),
    `the current overview must include ${sectionId} when its governed source is complete`
  );
}
assert(
  !overview.sections.some((section) => [
    "census-growth",
    "resident-population-profile",
    "incident-direction",
    "medication-execution",
    "medication-burden",
    "resident-flow"
  ].includes(section.id)) &&
    !JSON.stringify(overview).includes("Alex Rivera") &&
    !JSON.stringify(overview).includes("Taylor Morgan"),
  "the overview must not repeat focused reports or expose resident-level worklists"
);

const historicalOverview = compileFullReportFromContext(
  { reportId: "overview", period: "2026-06" },
  inputs
);
assert(
  historicalOverview.period.label === "June 2026" &&
    !historicalOverview.sections.some((section) => [
      "current-resident-context",
      "care-delivery-coverage",
      "medication-burden"
    ].includes(section.id)) &&
    !historicalOverview.sections
      .flatMap((section) => section.blocks)
      .filter((block) => block.type === "table")
      .flatMap((block) => block.columns)
      .some((column) => column.key === "operatingLimit"),
  "historical overviews must not backfill current capacity, resident, or care-delivery measures"
);
const partialFlowInputs = structuredClone(inputs);
partialFlowInputs.summary.toolContext.residentFlowMonthlyByCommunity =
  partialFlowInputs.summary.toolContext.residentFlowMonthlyByCommunity.filter(
    (row) => !(row.month_bucket === "2026-07" && row.facility_id === "345")
  );
const partialFlowOverview = compileFullReportFromContext(
  { reportId: "overview" },
  partialFlowInputs
);
assert(
  partialFlowOverview.summary.includes("cover 1 of 2 communities") &&
    partialFlowOverview.metrics.some(
      (metric) => metric.label === "Reported net flow" && metric.detail.includes("1 of 2 communities")
    ),
  "partial overview flow must disclose community coverage instead of claiming a portfolio total"
);
const partialFlowCensus = compileFullReportFromContext(
  { reportId: "census" },
  partialFlowInputs
);
assert(
  partialFlowCensus.summary.includes("cover 1 of 2 communities") &&
    partialFlowCensus.metrics.some((metric) => metric.label === "Reported admissions") &&
    partialFlowCensus.sections.find((section) => section.id === "resident-flow")
      ?.intro.includes("Missing community records are not treated as zero"),
  "partial census flow must label reported totals and preserve missing-as-unknown semantics"
);

const effectiveness = compileFullReportFromContext(
  { reportId: "effectiveness", audience: "county" },
  inputs
);
assert(
  effectiveness.title === "Portfolio effectiveness evidence" &&
    effectiveness.sections.some((section) => section.id === "evidence-boundary"),
  "the effectiveness report must separate supported evidence from missing external outcomes"
);
assert(
  effectiveness.metrics.some(
    (metric) => metric.label === "Internal return admissions" && metric.value === "1"
  ),
  "the effectiveness report must derive internal return admissions from governed episodes"
);
assert(
  effectiveness.metrics.some(
    (metric) => metric.label === "Documented discharge outcomes" && metric.value === "50.0%"
  ),
  "the effectiveness report must disclose structured discharge-outcome coverage"
);
assert(
  effectiveness.metrics.some(
    (metric) => metric.label === "30-day internal readmission" && metric.value === "100.0%" &&
      metric.detail === "1 of 1 mature discharges"
  ),
  "internal readmission rates must use mature discharge cohorts and subsequent Alamo episodes"
);
const communityEffectiveness = compileFullReportFromContext(
  { reportId: "effectiveness", facilityId: "337", audience: "provider" },
  inputs
);
assert(
  communityEffectiveness.scope.kind === "community" &&
    communityEffectiveness.scope.facilityId === "337" &&
    communityEffectiveness.sections[0]?.title.includes("Provider"),
  "the effectiveness report must preserve community and audience scope"
);
const unavailableEffectivenessInputs = structuredClone(inputs);
unavailableEffectivenessInputs.home.operational.currentWeeklyCensus = null;
unavailableEffectivenessInputs.home.communities = [];
unavailableEffectivenessInputs.summary.census = [];
unavailableEffectivenessInputs.summary.medicationCompliance = [];
unavailableEffectivenessInputs.summary.toolContext.residentFlowMonthlyByCommunity = [];
unavailableEffectivenessInputs.summary.toolContext.residentEpisodeHistory = [];
unavailableEffectivenessInputs.communities.incidents = [];
const unavailableEffectiveness = compileFullReportFromContext(
  { reportId: "effectiveness", audience: "county" },
  unavailableEffectivenessInputs
);
for (const metricLabel of [
  "Census",
  "Incidents per 100 census",
  "Medication compliance",
  "Internal return admissions"
]) {
  assert(
    unavailableEffectiveness.metrics.find((metric) => metric.label === metricLabel)?.value ===
      "Not available",
    `${metricLabel} must distinguish unavailable effectiveness evidence from zero`
  );
}
const immatureReadmissionInputs = structuredClone(inputs);
immatureReadmissionInputs.summary.toolContext.residentEpisodeHistory = [residentEpisodeHistory[1]];
const immatureReadmissionReport = compileFullReportFromContext(
  { reportId: "effectiveness", audience: "county" },
  immatureReadmissionInputs
);
assert(
  !immatureReadmissionReport.metrics.some((metric) => metric.label.includes("internal readmission")),
  "readmission rates must be omitted when no discharge cohort has matured"
);
assert(
  !JSON.stringify({
    summary: historicalOverview.summary,
    metrics: historicalOverview.metrics,
    sections: historicalOverview.sections
  }).includes("July 2026"),
  "historical overviews must not include future incident months"
);

const latestCommunity = compileFullReportFromContext(
  { reportId: "community", facilityId: "337" },
  inputs
);
assert(
  latestCommunity.summary.includes("1 incidents") && latestCommunity.summary.includes("a census of 100"),
  "community reports must use the current scoped incident and census periods"
);
assert(
  latestCommunity.sections.some((section) => section.id === "resident-flow") &&
    latestCommunity.summary.includes("3 admissions") &&
    latestCommunity.summary.includes("1 discharges"),
  "community reports must include scoped admissions and discharges"
);
assert(
  latestCommunity.sections.some((section) => section.id === "capacity-position") &&
    latestCommunity.metrics.some(
      (metric) => metric.label === "Weekly operating utilization" && metric.value === "57.1%"
    ),
  "current community reports must calculate utilization from governed weekly census"
);
assert(
  !JSON.stringify(latestCommunity).includes("SAN PABLO MHW"),
  "community reports must exclude operational placeholder profiles"
);

const historicalCommunity = compileFullReportFromContext(
  { reportId: "community", facilityId: "337", period: "2026-06" },
  inputs
);
const historicalCategories = historicalCommunity.sections
  .find((section) => section.id === "incident-pattern")
  ?.blocks.find((block) => block.type === "bar_list");
assert(
  historicalCategories?.items.some((item) => item.label === "AWOL/Elopement") &&
    !historicalCategories.items.some((item) => item.label === "Medication Refusal"),
  "historical community reports must derive categories from the requested month"
);
assert(
  !historicalCommunity.sections.some((section) => section.id === "capacity-position"),
  "historical community reports must not reuse current capacity limits"
);

const censusReport = compileFullReportFromContext(
  { reportId: "census", period: "2026-06" },
  inputs
);
assert(
  censusReport.sections.some((section) => section.id === "resident-flow") &&
    censusReport.metrics.some((metric) => metric.label === "Admissions"),
  "the census report must contain resident flow rather than census alone"
);
const censusTrend = censusReport.sections
  .find((section) => section.id === "census-trend")
  ?.blocks.find((block) => block.type === "line_chart")?.items ?? [];
assert(
  !censusTrend.some((item) => item.label === "Jul 2026") &&
    censusReport.sections.some((section) => section.id === "annual-census-summary"),
  "historical census reports must not include future census points"
);
const annualFlowRows = censusReport.sections
  .find((section) => section.id === "annual-resident-flow")
  ?.blocks.find((block) => block.type === "table")?.rows ?? [];
assert(
  annualFlowRows.some((row) => row.year === "2025" && row.admissions === "6") &&
    annualFlowRows.some((row) => row.year === "2026" && row.admissions === "3"),
  "annual resident flow must aggregate all loaded months through the selected period"
);
const disconnectedFlowInputs = structuredClone(inputs);
disconnectedFlowInputs.summary.toolContext.residentFlowMonthlyByCommunity.push({
  facility_id: "337",
  facility_name: "San Pablo",
  month_bucket: "1964-01",
  admissions: 1,
  discharges: 0,
  net_change: 1
});
const disconnectedFlowReport = compileFullReportFromContext(
  { reportId: "census" },
  disconnectedFlowInputs
);
const contiguousAnnualFlowRows = disconnectedFlowReport.sections
  .find((section) => section.id === "annual-resident-flow")
  ?.blocks.find((block) => block.type === "table")?.rows ?? [];
assert(
  !contiguousAnnualFlowRows.some((row) => row.year === "1964") &&
    contiguousAnnualFlowRows.some((row) => row.year === "2025") &&
    contiguousAnnualFlowRows.some((row) => row.year === "2026"),
  "annual resident flow must exclude isolated legacy years outside the latest contiguous series"
);
const changingCoverageInputs = structuredClone(inputs);
changingCoverageInputs.summary.census.push({
  facility_id: "337",
  month_bucket: "2026-05",
  census: 95
});
const changingCoverageReport = compileFullReportFromContext(
  { reportId: "census" },
  changingCoverageInputs
);
const comparableTrendItems = changingCoverageReport.sections
  .find((section) => section.id === "census-trend")
  ?.blocks.find((block) => block.type === "line_chart")?.items ?? [];
const coverageRows = changingCoverageReport.sections
  .find((section) => section.id === "annual-census-summary")
  ?.blocks.find((block) => block.type === "table")?.rows ?? [];
assert(
  comparableTrendItems.length === 2 &&
    !comparableTrendItems.some((item) => item.label === "May 2026") &&
    coverageRows.some(
      (row) => row.year === "2026" &&
        row.communities === "1 to 2" &&
        row.change === "Not comparable"
    ),
  "portfolio census trends must not present reporting-community changes as like-for-like growth"
);

const incidentReport = compileFullReportFromContext(
  { reportId: "incidents", period: "2026-07" },
  inputs
);
assert(
  incidentReport.sections.some(
    (section) => section.id === "incident-trend" &&
      section.blocks.some((block) => block.type === "line_chart" && block.items.length === 2)
  ),
  "the incident report must render the latest like-for-like historical trend"
);
assert(
  !incidentReport.sections.some((section) => section.id === "incident-severity"),
  "incident severity must stay hidden when detail rows do not reconcile to the aggregate"
);
const incidentCommunityRows = incidentReport.sections
  .find((section) => section.id === "community-comparison")
  ?.blocks.find((block) => block.type === "table")?.rows ?? [];
assert(
  incidentCommunityRows.length === 2 &&
    incidentCommunityRows.some((row) => row.community === "San Pablo" && row.incidents === "10") &&
    !incidentReport.sections.some((section) => section.id === "community-detail") &&
    !incidentReport.metrics.some((metric) => metric.label === "Historical rows") &&
    incidentReport.metrics.some(
      (metric) => metric.label === "History loaded" &&
        metric.value === "3 months" &&
        metric.detail === "Reporting-community coverage varies"
    ),
  "incident reporting must aggregate community rows and omit technical row-count metrics"
);
const repeatedIncidentInputs = structuredClone(inputs);
repeatedIncidentInputs.communities.incidents.push({
  facility_id: "337",
  category: "AWOL/Elopement",
  month_bucket: "2026-07",
  incident_count: 2
});
const repeatedIncidentReport = compileFullReportFromContext(
  { reportId: "incidents", period: "2026-07" },
  repeatedIncidentInputs
);
const repeatedIncidentRows = repeatedIncidentReport.sections
  .find((section) => section.id === "community-comparison")
  ?.blocks.find((block) => block.type === "table")?.rows ?? [];
assert(
  repeatedIncidentRows.length === 2 &&
    repeatedIncidentRows.some((row) => row.community === "San Pablo" && row.incidents === "12"),
  "repeated incident source rows must roll into one factual community summary"
);
const severityInputs = structuredClone(inputs);
severityInputs.communities.incidents = [
  ...severityInputs.communities.incidents.filter((row) => row.month_bucket !== "2026-07"),
  { facility_id: "337", category: "Medication Refusal", month_bucket: "2026-07", incident_count: 1 },
  { facility_id: "345", category: "AWOL/Elopement", month_bucket: "2026-07", incident_count: 1 }
];
severityInputs.communities.incidentDetails = [
  {
    id: "severity-1",
    facility_id: "337",
    resident_id: "1",
    month_bucket: "2026-07",
    injury_occurred: true,
    police_called: false,
    sentinel_event: false
  },
  {
    id: "severity-2",
    facility_id: "345",
    resident_id: "2",
    month_bucket: "2026-07",
    injury_occurred: false,
    police_called: true,
    sentinel_event: true
  }
];
const completeSeverityReport = compileFullReportFromContext(
  { reportId: "incidents", period: "2026-07" },
  severityInputs
);
assert(
  completeSeverityReport.sections.some((section) => section.id === "incident-severity") &&
    completeSeverityReport.evidence.sources.some((source) => source.slice === "incident_detail_history"),
  "reconciled incident details must add factual severity indicators with provenance"
);

const historicalMedication = compileFullReportFromContext(
  { reportId: "medications", facilityId: "337", period: "2026-06" },
  inputs
);
const historicalRefusals = historicalMedication.sections
  .find((section) => section.id === "refusal-concentration")
  ?.blocks.find((block) => block.type === "bar_list")?.items ?? [];
assert(
  historicalRefusals.some((item) => item.label === "Medication A" && item.value === 6) &&
    !historicalRefusals.some((item) => item.label === "Current-only fallback"),
  "medication refusals must align to the selected period"
);
const medicationRows = historicalMedication.sections
  .find((section) => section.id === "administration-detail")
  ?.blocks.find((block) => block.type === "table")?.rows;
assert(
  medicationRows?.[0]?.notGiven === "45",
  "medication completion gaps must equal scheduled minus given"
);
assert(
  historicalMedication.sections.some(
    (section) => section.id === "compliance-trend" &&
      section.blocks.some((block) => block.type === "line_chart" && block.items.length === 1)
  ) === false &&
    !historicalMedication.sections.some((section) => section.id === "compliance-comparison"),
  "single-month scoped medication reports must not add a duplicate comparison section"
);
assert(
  !historicalMedication.sections.some((section) => section.id === "current-medication-burden"),
  "historical medication reports must not backfill current resident medication burden"
);
const currentMedication = compileFullReportFromContext({ reportId: "medications" }, inputs);
assert(
  currentMedication.sections.some((section) => section.id === "current-medication-burden") &&
    currentMedication.evidence.sources.some((source) => source.slice === "mar_resident_summary"),
  "current medication reports must include governed resident burden measures"
);
assert(
  currentMedication.sections.some(
    (section) => section.id === "compliance-trend" &&
      section.blocks.some((block) => block.type === "line_chart" && block.items.length === 2)
  ) &&
    !currentMedication.sections.some((section) => section.id === "compliance-comparison"),
  "medication reports must pair one monthly trend with one selected-month community table"
);
const changingMedicationCoverageInputs = structuredClone(inputs);
changingMedicationCoverageInputs.summary.medicationCompliance.push({
  facility_id: "337",
  facility_name: "San Pablo",
  month_bucket: "2026-05",
  total_scheduled: 800,
  given: 760,
  compliance_pct: 95
});
const changingMedicationCoverageReport = compileFullReportFromContext(
  { reportId: "medications" },
  changingMedicationCoverageInputs
);
const comparableMedicationTrend = changingMedicationCoverageReport.sections
  .find((section) => section.id === "compliance-trend")
  ?.blocks.find((block) => block.type === "line_chart")?.items ?? [];
assert(
  comparableMedicationTrend.length === 2 &&
    !comparableMedicationTrend.some((item) => item.label === "May 2026"),
  "medication trends must not cross reporting-community coverage changes"
);
const partialMedicationInputs = structuredClone(inputs);
partialMedicationInputs.summary.toolContext.marResidentSummary = [marResidentSummary[0]];
const partialMedicationReport = compileFullReportFromContext(
  { reportId: "medications" },
  partialMedicationInputs
);
assert(
  !partialMedicationReport.sections.some(
    (section) => section.id === "current-medication-burden"
  ),
  "resident medication burden must be omitted when the MAR summary does not cover every resident in scope"
);

const residentReport = compileFullReportFromContext({ reportId: "residents" }, inputs);
assert(
  residentReport.metrics[0]?.value === "2",
  "resident reports must exclude operational placeholder profiles"
);
assert(
  residentReport.metrics.some(
    (metric) => metric.label === "Median stay" && metric.value === "350 days"
  ) && residentReport.sections.some((section) => section.id === "community-profile"),
  "resident reports must include median length of stay and community profile comparisons"
);
const residentCommunityTable = residentReport.sections
  .find((section) => section.id === "community-profile")
  ?.blocks.find((block) => block.type === "table");
assert(
  residentCommunityTable?.columns.some((column) => column.key === "profiles") &&
    residentCommunityTable?.columns.some((column) => column.key === "census") &&
    residentCommunityTable.rows.some(
      (row) => row.community === "San Pablo" && row.profiles === "1" && row.census === "100"
    ),
  "resident community comparisons must distinguish profile rows from governed census"
);
assert(
  residentReport.sections.some((section) => section.id === "length-of-stay-distribution") &&
    !residentReport.sections.some((section) => section.id === "longest-current-stays") &&
    !JSON.stringify(residentReport).includes("Alex Rivera") &&
    !JSON.stringify(residentReport).includes("Taylor Morgan"),
  "resident population reporting must use aggregate stay bands rather than named worklists"
);
const stayItems = residentReport.sections
  .find((section) => section.id === "length-of-stay-distribution")
  ?.blocks.find((block) => block.type === "bar_list")?.items ?? [];
assert(
  stayItems.reduce((total, item) => total + item.value, 0) === 2,
  "length-of-stay bands must reconcile exactly to the governed resident profile count"
);
const invalidStayInputs = structuredClone(inputs);
invalidStayInputs.communities.residents[0].los_days = -5;
const invalidStayReport = compileFullReportFromContext(
  { reportId: "residents" },
  invalidStayInputs
);
assert(
  !invalidStayReport.metrics.some((metric) => ["Average stay", "Median stay", "Stays over one year"].includes(metric.label)) &&
    !invalidStayReport.sections.some((section) => section.id === "length-of-stay-distribution"),
  "negative or incomplete stay values must omit portfolio stay measures rather than distort them"
);

const staleReport = compileFullReportFromContext(
  { reportId: "overview" },
  {
    ...inputs,
    home: {
      ...home,
      snapshot_status: {
        stale: true,
        warning: "The governed snapshot is older than the freshness target.",
        generated_at: "2026-07-25T12:00:00.000Z",
        ageHours: 74
      }
    }
  }
);
assert(
  staleReport.freshness.status === "stale" &&
    staleReport.generatedAtLabel.includes("25 July 2026") &&
    renderFullReportHtml(staleReport).includes("Data update delayed"),
  "stale reports must visibly disclose the snapshot delay and actual update time"
);
const missingFreshnessReport = compileFullReportFromContext(
  { reportId: "overview" },
  { ...inputs, home: { ...home, snapshot_status: undefined } }
);
assert(
  missingFreshnessReport.freshness.status === "stale" &&
    missingFreshnessReport.freshness.warning?.includes("metadata is unavailable"),
  "missing freshness metadata must fail visibly rather than presenting the report as current"
);

assert(
  getAvailableFullReportPeriods({ reportId: "overview" }, inputs).join(",") === "2026-07,2026-06",
  "overview periods must be limited to census, incident, and medication overlap"
);
assert(
  getAvailableFullReportPeriods({ reportId: "incidents" }, inputs).join(",") === "2026-07,2026-06,2026-05",
  "incident reports must expose every loaded incident month"
);
assert(
  getAvailableFullReportPeriods({ reportId: "residents" }, inputs).length === 0,
  "current resident reports must not expose a historical period selector"
);

assert(
  ALAMO_FACILITIES.reduce((total, facility) => total + facility.operatingLimit, 0) === 605 &&
    ALAMO_FACILITIES.reduce((total, facility) => total + facility.licensedCapacity, 0) === 655,
  "the capacity registry must retain the five current operating and licensed denominators"
);

console.log(
  "Full report check passed: seven distinct services, five lean published reports, aggregated incident comparisons, census and medication trends, aggregate resident profiles, period boundaries, completeness gates, freshness disclosure, and evidence provenance."
);
