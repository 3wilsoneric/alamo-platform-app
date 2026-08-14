import { runCopilotTool } from "../server/copilot-tools.mjs";
import { validateAdHocModuleSpec } from "../shared/ad-hoc-module-spec.mjs";

const facilities = [
  "San Pablo",
  "Victoria's House",
  "JC Wallace House",
  "AHS Turlock OP LLC",
  "Santa Clarita"
];

const cases = [];
const add = (prompts, tool, moduleId, templateId) => {
  prompts.forEach((prompt) => cases.push({ prompt, tool, moduleId, templateId }));
};

add([
  ...facilities.map((name) => `show ${name} census trend`),
  ...facilities.map((name) => `${name} census history over time`)
], "census_trend", "census-trend", "trend-line");

add([
  "show latest census movement",
  "census movement by community",
  "which communities changed census this month",
  "show month over month census change",
  "rank community census movers",
  "latest census delta by community",
  "where did census increase this month",
  "where did census decrease this month",
  "community headcount movement",
  "portfolio census movers"
], "census_movement", "census-movement", "comparison-bars");

add([
  ...facilities.map((name) => `show ${name} current incident category breakdown`),
  ...facilities.map((name) => `${name} incidents by category this month`)
], "incident_breakdown", "incident-breakdown", "simple-bars");

add([
  "list every AWOL incident from May through June by community including resident name date type and description",
  "show all May AWOL incident details",
  "list June incidents with resident names and descriptions",
  "show every San Pablo incident detail for May",
  "who was involved in Santa Clarita incidents in June",
  "list JC Wallace House AWOL incidents for May",
  "show incident rows with resident date type and narrative for June",
  "give me every Victoria's House incident in May",
  "list all AHS Turlock OP LLC incident details for June",
  "show residents involved in June AWOL incidents"
], "incident_detail_list", "incident-detail-list", "data-table");

add([
  ...facilities.map((name) => `show ${name} diagnosis mix`),
  ...facilities.map((name) => `${name} clinical mix by diagnosis`)
], "diagnosis_mix", "diagnosis-mix", "simple-bars");

add([
  ...facilities.map((name) => `show ${name} medication compliance`),
  ...facilities.map((name) => `${name} MAR scheduled and given compliance`)
], "medication_compliance", "medication-compliance", "data-table");

add([
  ...facilities.map((name) => `show ${name} community profile`),
  ...facilities.map((name) => `${name} community overview`)
], "community_profile", "community-profile", "topline-summary");

add([
  ...facilities.map((name) => `search residents in ${name}`),
  "search resident roster",
  "find residents named Romero",
  "lookup residents in unit 211B",
  "search residents with schizophrenia",
  "find current residents by name or unit"
], "resident_search", "resident-search-results", "data-table");

add([
  "compare census trends across communities over the last six months",
  "show census over time by community",
  "show monthly census trends across all communities",
  "compare incident trends across communities over the last six months",
  "show incidents over time by community",
  "show an incident heatmap by community over the last six months",
  "show a census heat map by community over time",
  "incident matrix by community over time",
  "census matrix across all facilities",
  "show historical incidents across communities"
], "community_time_series", "community-time-series", null);

add([
  "compare communities",
  "community comparison",
  "rank communities against each other",
  "compare all facilities",
  "show community compare",
  "compare community operating metrics",
  "compare communities by census incidents and average LOS",
  "compare census incidents and LOS by community",
  "rank facilities by operating metrics",
  "show a portfolio community comparison"
], "community_compare", "community-comparison", null);

if (cases.length !== 100) {
  console.error(`FAILED: expected 100 benchmark cases, found ${cases.length}`);
  process.exit(1);
}

const failures = [];
const familyCounts = new Map();

for (const testCase of cases) {
  const result = await runCopilotTool({ content: testCase.prompt });
  familyCounts.set(testCase.tool, (familyCounts.get(testCase.tool) ?? 0) + 1);
  if (result.tool !== testCase.tool) failures.push(`${testCase.prompt}: expected tool ${testCase.tool}, received ${result.tool ?? "none"}`);
  if (result.moduleSpec?.moduleId !== testCase.moduleId) failures.push(`${testCase.prompt}: expected module ${testCase.moduleId}, received ${result.moduleSpec?.moduleId ?? "none"}`);
  if (testCase.templateId && result.moduleSpec?.templateId !== testCase.templateId) failures.push(`${testCase.prompt}: expected template ${testCase.templateId}, received ${result.moduleSpec?.templateId ?? "none"}`);
  if (result.moduleSpec && !validateAdHocModuleSpec(result.moduleSpec).valid) failures.push(`${testCase.prompt}: returned an invalid module specification`);
}

if (failures.length) {
  console.error(`FAILED: module selection benchmark (${failures.length}/${cases.length})`);
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`module selection benchmark passed (${cases.length} questions across ${familyCounts.size} tool families)`);
}
