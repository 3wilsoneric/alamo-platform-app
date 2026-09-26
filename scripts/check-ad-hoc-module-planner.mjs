import { runCopilotTool } from "../server/copilot-tools.mjs";
import {
  AD_HOC_MODULE_SPEC_VERSION,
  moduleSelectionReasonCodes,
  planAdHocModule,
  shouldComposeAdHocModules,
  validateAdHocModuleSpec,
  visualizationTemplateRegistry
} from "../shared/ad-hoc-module-spec.mjs";

const failures = [];
const templateIds = new Set();

for (const template of visualizationTemplateRegistry) {
  if (templateIds.has(template.id)) failures.push(`duplicate template: ${template.id}`);
  templateIds.add(template.id);
  if (!template.visualType || !template.shape) failures.push(`${template.id}: incomplete template definition`);
  if (template.minRows > template.maxRows) failures.push(`${template.id}: invalid row limits`);
}

const synthetic = planAdHocModule("show monthly trend", {
  handled: true,
  tool: "census_trend",
  trace: {
    facilityId: "345",
    communityName: "Santa Clarita",
    period: "2026-01 to 2026-06",
    dataSource: "monthly census rows",
    rowCount: 6,
    engineVersion: "test"
  },
  visual: {
    type: "line_chart",
    title: "Santa Clarita Census Trend",
    valueLabel: "Census",
    rows: [
      { label: "January 2026", value: 62 },
      { label: "February 2026", value: 85 },
      { label: "March 2026", value: 94 }
    ]
  },
  actions: []
});

if (synthetic?.version !== AD_HOC_MODULE_SPEC_VERSION) failures.push("synthetic plan has wrong version");
if (synthetic?.templateId !== "trend-line") failures.push(`synthetic plan chose ${synthetic?.templateId ?? "no template"}`);
if (synthetic?.scope !== "community") failures.push(`synthetic plan chose ${synthetic?.scope ?? "no scope"}`);
if (synthetic?.selectionReason?.code !== "direct_answer") failures.push(`synthetic plan chose reason ${synthetic?.selectionReason?.code ?? "none"}`);
if (synthetic?.provenance?.visibleRowCount !== synthetic?.visual?.rows?.length) failures.push("synthetic plan did not preserve visible row count");
if (!validateAdHocModuleSpec(synthetic).valid) failures.push("synthetic plan did not validate");

const malformed = synthetic ? {
  ...synthetic,
  templateId: "composition-donut",
  visual: { ...synthetic.visual, type: "line_chart" }
} : null;
if (malformed && validateAdHocModuleSpec(malformed).valid) failures.push("mismatched template was accepted");
const missingReason = synthetic ? {
  ...synthetic,
  selectionReason: undefined
} : null;
if (missingReason && validateAdHocModuleSpec(missingReason).valid) failures.push("module without selection reason was accepted");
const invalidReason = synthetic ? {
  ...synthetic,
  selectionReason: { code: "maybe_relevant", label: "Maybe relevant" }
} : null;
if (invalidReason && validateAdHocModuleSpec(invalidReason).valid) failures.push("module with invalid selection reason was accepted");
const previewWithoutRowSet = synthetic ? {
  ...synthetic,
  templateId: "data-table",
  visual: {
    ...synthetic.visual,
    type: "table",
    originalRowCount: 200,
    rows: synthetic.visual.rows.slice(0, 2)
  },
  provenance: {
    ...synthetic.provenance,
    rowSetId: null,
    rowCount: 200,
    visibleRowCount: 2,
    originalRowCount: 200,
    artifactRowCount: null
  }
} : null;
if (previewWithoutRowSet && validateAdHocModuleSpec(previewWithoutRowSet).valid) failures.push("large table preview without rowSetId was accepted");
if (!moduleSelectionReasonCodes.includes("direct_answer") || !moduleSelectionReasonCodes.includes("requested_incident_context")) failures.push("selection reason registry is missing required codes");
if (shouldComposeAdHocModules("list every AWOL incident from May through June and compare with census")) failures.push("broad list request was allowed to compose extra modules");
if (shouldComposeAdHocModules("export San Pablo incidents and census to csv")) failures.push("export request was allowed to compose extra modules");
if (shouldComposeAdHocModules("what data periods are available for incident detail")) failures.push("data availability request was allowed to compose extra modules");
if (shouldComposeAdHocModules("compare San Pablo census and incidents", { primaryTool: "incident_detail_list" })) failures.push("detail-list primary tool was allowed to compose extra modules");
if (!shouldComposeAdHocModules("compare San Pablo census and incidents", { primaryTool: "census_trend" })) failures.push("valid cross-domain comparison was not allowed to compose");

const integrationCases = [
  ["show Santa Clarita census trend", "census_trend", "census-trend", "trend-line"],
  ["show latest census movement", "census_movement", "census-movement", "comparison-bars"],
  ["JC Wallace House current incident category breakdown", "incident_breakdown", "incident-breakdown", "simple-bars"],
  ["i just want to know how many people went awol last month total, may 2026", "incident_breakdown", "incident-breakdown", "topline-summary"],
  ["how many AWOL incidents in May 2026 total", "incident_breakdown", "incident-breakdown", "topline-summary"],
  ["who is driving AWOL incidents in May 2026", "incident_resident_drivers", "incident-resident-drivers", "data-table"],
  ["AWOL incidents by community in May and June", "slice_metric", "metric-slice", "data-table"],
  ["compare San Pablo May incidents to June incidents by category", "incident_category_comparison", "incident-category-comparison", "comparison-bars"],
  ["list every AWOL incident from May through June by community including resident name date type and description", "incident_detail_list", "incident-detail-list", "data-table"],
  ["show San Pablo incident rate change from April to May", "incident_rate_change", "incident-rate-change", "data-table"],
  ["show Audrey West resident profile", "resident_lookup", "resident-profile", "resident-profile"],
  ["show Audrey West incident history", "resident_incident_history", "resident-incident-history", "data-table"],
  ["search residents named Romero", "resident_search", "resident-search-results", "data-table"],
  ["show portfolio diagnosis mix", "diagnosis_mix", "diagnosis-mix", "simple-bars"],
  ["show Santa Clarita age mix", "resident_demographics", "resident-demographics", "simple-bars"],
  ["show San Pablo medication profile", "medication_profile", "medication-profile", "topline-summary"],
  ["show portfolio medication compliance", "medication_compliance", "medication-compliance", "data-table"],
  ["show portfolio medication refusals by community", "medication_refusals_by_community", "medication-refusals", "simple-bars"],
  ["show portfolio medication exceptions", "medication_exception_detail", null, null],
  ["compare census trends across communities over the last six months", "community_time_series", "community-time-series", "multi-series-line"],
  ["show an incident heatmap by community over the last six months", "community_time_series", "community-time-series", "period-heatmap"],
  ["Portfolio community profile", "community_profile", "community-profile", "topline-summary"]
];

for (const [prompt, expectedTool, expectedModule, expectedTemplate] of integrationCases) {
  const result = await runCopilotTool({ content: prompt });
  if (result.tool !== expectedTool) failures.push(`${prompt}: expected ${expectedTool}, received ${result.tool}`);
  if (expectedModule == null) {
    if (result.truthState !== "not_loaded") failures.push(`${prompt}: unavailable exception detail did not preserve not_loaded truth state`);
    if (!result.visual) failures.push(`${prompt}: unavailable exception detail omitted its recovery surface`);
    if (result.moduleSpec) failures.push(`${prompt}: unavailable exception detail created an unsupported ad hoc module`);
  } else {
    if (result.moduleSpec?.moduleId !== expectedModule) failures.push(`${prompt}: expected module ${expectedModule}, received ${result.moduleSpec?.moduleId ?? "none"}`);
    if (result.moduleSpec?.templateId !== expectedTemplate) failures.push(`${prompt}: expected ${expectedTemplate}, received ${result.moduleSpec?.templateId ?? "none"}`);
    if (result.moduleSpec?.selectionReason?.code !== "direct_answer") failures.push(`${prompt}: missing direct-answer module reason`);
  }
  if (result.moduleSpec && !validateAdHocModuleSpec(result.moduleSpec).valid) failures.push(`${prompt}: returned invalid module spec`);
  if (result.moduleSpec?.provenance?.visibleRowCount !== result.moduleSpec?.visual?.rows?.length) failures.push(`${prompt}: module visible row count drifted`);
  if (result.artifact?.rowSetId && result.moduleSpec?.provenance?.rowSetId !== result.artifact.rowSetId) failures.push(`${prompt}: module rowSetId did not match artifact rowSetId`);
  if (result.artifact?.rowCount != null && result.moduleSpec?.provenance?.artifactRowCount !== result.artifact.rowCount) failures.push(`${prompt}: module artifact row count did not match artifact`);
}

const composed = await runCopilotTool({ content: "compare San Pablo census and incidents" });
if ((composed.moduleSpecs?.length ?? 0) < 2) failures.push("cross-domain comparison did not compose multiple modules");
if ((composed.moduleSpecs?.length ?? 0) > 3) failures.push("cross-domain comparison exceeded the three-module limit");
if (composed.moduleSpecs?.some((spec) => !validateAdHocModuleSpec(spec).valid)) failures.push("cross-domain comparison included an invalid module");
const composedModuleIds = new Set((composed.moduleSpecs ?? []).map((spec) => spec.moduleId));
const composedReasonCodes = new Set((composed.moduleSpecs ?? []).map((spec) => spec.selectionReason?.code));
if (!composedModuleIds.has("census-trend")) failures.push("cross-domain comparison omitted census trend");
if (!composedModuleIds.has("incident-breakdown")) failures.push("cross-domain comparison omitted incident breakdown");
if (!composedReasonCodes.has("direct_answer")) failures.push("cross-domain comparison omitted the direct-answer module reason");
if (!composedReasonCodes.has("requested_census_context")) failures.push("cross-domain comparison omitted requested census context reason");
if (!composedReasonCodes.has("requested_incident_context")) failures.push("cross-domain comparison omitted requested incident context reason");

const broadListWithAdjacentContext = await runCopilotTool({
  content: "list every AWOL incident from May through June and compare with census"
});
if (broadListWithAdjacentContext.moduleSpecs?.length) failures.push("broad exact-row request returned composed moduleSpecs");
if (broadListWithAdjacentContext.tool !== "incident_detail_list") failures.push(`broad exact-row request selected ${broadListWithAdjacentContext.tool} instead of incident_detail_list`);

if (failures.length) {
  console.error("FAILED: ad hoc module planner");
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`ad hoc module planner checks passed (${visualizationTemplateRegistry.length} templates, ${integrationCases.length} live tool cases)`);
}
