import { runCopilotTool } from "../server/copilot-tools.mjs";
import {
  getAnalystTraceTelemetry,
  resetAnalystTraceTelemetry
} from "../server/tools/turn-trace.mjs";

const prompt = "show santa clarita census trend";
const failures = [];

resetAnalystTraceTelemetry();

const result = await runCopilotTool({
  content: prompt,
  sessionId: `trace-store-${Date.now()}`
});
const recoveryPrompt = "show incidents for November 2020";
const recoveryResult = await runCopilotTool({
  content: recoveryPrompt,
  sessionId: `trace-store-recovery-${Date.now()}`
});
const broadPreviewPrompt = "List every incident from June 2026 by community including resident name date incident type and description";
const broadPreviewResult = await runCopilotTool({
  content: broadPreviewPrompt,
  sessionId: `trace-store-preview-${Date.now()}`
});
const residentPrompt = "show Shannon Romero resident profile";
const residentResult = await runCopilotTool({
  content: residentPrompt,
  sessionId: `trace-store-resident-${Date.now()}`
});
const telemetry = getAnalystTraceTelemetry();
const boundedTelemetry = getAnalystTraceTelemetry({ limit: 10_000 });
const defaultedTelemetry = getAnalystTraceTelemetry({ limit: Number.NaN });
const trace = telemetry.recent.find((record) => record.turnId === result.turnTrace?.turnId);
const recoveryTrace = telemetry.recent.find((record) => record.turnId === recoveryResult.turnTrace?.turnId);
const broadPreviewTrace = telemetry.recent.find((record) => record.turnId === broadPreviewResult.turnTrace?.turnId);
const residentTrace = telemetry.recent.find((record) => record.turnId === residentResult.turnTrace?.turnId);
const serializedTelemetry = JSON.stringify(telemetry).toLowerCase();

if (!result.turnTrace?.turnId) {
  failures.push("tool result did not include a turn trace");
}

if (!trace) {
  failures.push("trace journal did not retain the returned turn trace");
}

if (!recoveryTrace) {
  failures.push("trace journal did not retain the recovery turn trace");
}

if (!broadPreviewTrace) {
  failures.push("trace journal did not retain the broad preview turn trace");
}

if (!residentTrace) {
  failures.push("trace journal did not retain the resident turn trace");
}

if (trace?.selectedTool !== result.tool) {
  failures.push(`trace selected tool ${trace?.selectedTool ?? "none"} did not match result tool ${result.tool}`);
}

if (!Number.isFinite(Number(trace?.performance?.executionMs))) {
  failures.push("trace did not expose numeric execution timing");
}

if (typeof trace?.performance?.slow !== "boolean") {
  failures.push("trace did not expose slow-turn boolean");
}

if (!trace?.quality || !Number.isFinite(Number(trace.quality.score)) || !trace.quality.grade) {
  failures.push(`trace did not expose answer quality scoring: ${JSON.stringify(trace?.quality)}`);
}

if (!trace?.quality?.dimensions || trace.quality.dimensions.intent !== "pass") {
  failures.push(`trace did not expose answer quality dimensions: ${JSON.stringify(trace?.quality)}`);
}

if (!trace?.plan?.tool || trace.plan.tool !== result.executionPlan?.tool) {
  failures.push(`trace did not expose the selected execution plan tool: ${JSON.stringify(trace?.plan)}`);
}

if (!trace?.plan?.decision?.family) {
  failures.push(`trace did not expose normalized decision metadata: ${JSON.stringify(trace?.plan)}`);
}

if (!trace?.plan?.canonicalPromptHash || trace.plan.canonicalPromptHash.length !== 16) {
  failures.push(`trace did not expose a canonical prompt hash: ${JSON.stringify(trace?.plan)}`);
}

if (!Array.isArray(trace?.plan?.expected?.periods)) {
  failures.push("trace plan did not expose expected periods as an array");
}

if (!recoveryTrace?.outcome?.recovery) {
  failures.push("recovery trace did not mark outcome.recovery");
}

if (recoveryTrace?.truthState !== "not_loaded") {
  failures.push(`recovery trace truth state ${recoveryTrace?.truthState ?? "none"} was not not_loaded`);
}

if (result.moduleSpec || result.moduleSpecs?.length) {
  const expectedModuleCount = result.moduleSpecs?.length ?? 1;
  if (trace?.module?.count !== expectedModuleCount) {
    failures.push(`trace module count ${trace?.module?.count ?? "none"} did not match rendered module count ${expectedModuleCount}`);
  }
  if (!trace?.module?.reasonCodes?.includes("direct_answer")) {
    failures.push("trace module reason codes did not include the direct-answer module");
  }
}

if (broadPreviewTrace?.volume?.previewed !== true) {
  failures.push(`broad preview trace did not mark volume.previewed: ${JSON.stringify(broadPreviewTrace?.volume)}`);
}

if (broadPreviewTrace?.volume?.artifactRows == null || broadPreviewTrace.volume.artifactRows <= (broadPreviewTrace.volume.visualRows ?? 0)) {
  failures.push(`broad preview trace did not expose artifact rows larger than visual rows: ${JSON.stringify(broadPreviewTrace?.volume)}`);
}

if (residentTrace?.plan?.expected?.hasResidentScope !== true) {
  failures.push(`resident trace did not mark resident scope without retaining the resident name: ${JSON.stringify(residentTrace?.plan)}`);
}

if (telemetry.summary.previewedTurns < 1) {
  failures.push(`trace summary did not count previewed turns: ${JSON.stringify(telemetry.summary)}`);
}

if (telemetry.summary.qualityScoredTurns !== 4) {
  failures.push(`trace summary did not count scored turns: ${JSON.stringify(telemetry.summary)}`);
}

if (!Number.isFinite(Number(telemetry.summary.averageQualityScore)) || telemetry.summary.averageQualityScore <= 0) {
  failures.push(`trace summary did not expose average quality score: ${JSON.stringify(telemetry.summary)}`);
}

if (!Array.isArray(telemetry.decisionFamilies) || !telemetry.decisionFamilies.length) {
  failures.push("trace telemetry did not expose decision-family quality summaries");
}

if (!telemetry.decisionFamilies?.every((family) => Number.isFinite(Number(family.avgQualityScore)))) {
  failures.push(`decision-family quality summaries are missing scores: ${JSON.stringify(telemetry.decisionFamilies)}`);
}

if (!Array.isArray(telemetry.qualityFlags)) {
  failures.push("trace telemetry did not expose quality flag summaries");
}

if (!telemetry.moduleCoverage || telemetry.moduleCoverage.version !== "platform-module-coverage-v1") {
  failures.push(`trace telemetry did not expose module coverage: ${JSON.stringify(telemetry.moduleCoverage)}`);
}

if (!Number.isFinite(Number(telemetry.moduleCoverage?.totalModules)) || telemetry.moduleCoverage.totalModules <= 0) {
  failures.push(`module coverage did not include registered module count: ${JSON.stringify(telemetry.moduleCoverage)}`);
}

if (!Array.isArray(telemetry.moduleCoverage?.families) || !telemetry.moduleCoverage.families.length) {
  failures.push("module coverage did not expose family coverage rows");
}

if (!telemetry.tools?.some((tool) => tool.previewedTurns >= 1)) {
  failures.push("trace tool summary did not count previewed turns");
}

if (telemetry.summary.totalTurns !== 4) {
  failures.push(`expected four retained turns, received ${telemetry.summary.totalTurns}`);
}

if (telemetry.retention.currentRecords !== 4) {
  failures.push(`expected four current trace records, received ${telemetry.retention.currentRecords}`);
}

if (boundedTelemetry.recent.length !== 4 || defaultedTelemetry.recent.length !== 4) {
  failures.push("trace telemetry did not safely bound or default the requested record limit");
}

if (telemetry.summary.recoveryTurns < 1 || telemetry.summary.notLoadedTurns < 1) {
  failures.push(`trace summary did not count recovery/not-loaded turns: ${JSON.stringify(telemetry.summary)}`);
}

if (telemetry.summary.certifiedTurns < 1) {
  failures.push(`trace summary did not count certified turns: ${JSON.stringify(telemetry.summary)}`);
}

if (!telemetry.tools?.every((tool) => Number.isFinite(Number(tool.certifiedTurns)) && Number.isFinite(Number(tool.uncertifiedTurns)))) {
  failures.push("trace tool summary did not expose certified/uncategorized counts");
}

if (!telemetry.families?.some((family) => family.recoveryTurns >= 1 && family.notLoadedTurns >= 1)) {
  failures.push("trace family summary did not count recovery/not-loaded turns");
}

if (serializedTelemetry.includes(prompt.toLowerCase())) {
  failures.push("trace telemetry stored the raw prompt text");
}

if (serializedTelemetry.includes(recoveryPrompt.toLowerCase())) {
  failures.push("trace telemetry stored the raw recovery prompt text");
}

if (serializedTelemetry.includes(broadPreviewPrompt.toLowerCase())) {
  failures.push("trace telemetry stored the raw broad-preview prompt text");
}

if (serializedTelemetry.includes(residentPrompt.toLowerCase()) || serializedTelemetry.includes("shannon romero")) {
  failures.push("trace telemetry stored the raw resident prompt or resident name");
}

if (serializedTelemetry.includes("santa clarita census trend")) {
  failures.push("trace telemetry stored an unhashed prompt fragment");
}

if (serializedTelemetry.includes("show incidents for november 2020")) {
  failures.push("trace telemetry stored an unhashed recovery prompt fragment");
}

if (!trace?.promptHash || trace.promptHash.length !== 16) {
  failures.push(`trace prompt hash is invalid: ${trace?.promptHash ?? "none"}`);
}

if (failures.length) {
  console.error(`FAILED: turn trace store (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`turn trace store checks passed (${telemetry.summary.totalTurns} retained turns, ${telemetry.summary.toolsObserved} tools observed, ${telemetry.summary.recoveryTurns} recovery turn, ${telemetry.summary.previewedTurns} previewed turn, ${telemetry.summary.averageQualityScore}/100 avg quality)`);
