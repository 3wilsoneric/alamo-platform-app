import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["api", "server", "shared", "src"];
const sourceExtensions = [".mjs", ".js", ".ts", ".tsx"];
const failures = [];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute));
    else if (sourceExtensions.includes(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

async function resolveImport(importer, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    base,
    ...sourceExtensions.map((extension) => `${base}${extension}`),
    ...sourceExtensions.map((extension) => path.join(base, `index${extension}`))
  ];
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Continue through the supported resolution candidates.
    }
  }
  return null;
}

function importSpecifiers(content, { includeTypeOnly = true } = {}) {
  const matches = [];
  // Type-only declarations are erased by TypeScript and cannot create runtime
  // dependency cycles. Remove them before building the executable import graph.
  const runtimeContent = includeTypeOnly
    ? content
    : content.replace(
        /^\s*(?:import|export)\s+type\b[\s\S]*?\bfrom\s+(["'])[^"']+\1\s*;?/gm,
        ""
      );
  const pattern = /(?:from\s+|import\s*\()(["'])([^"']+)\1/g;
  for (const match of runtimeContent.matchAll(pattern)) matches.push(match[2]);
  const sideEffectPattern = /(?:^|\n)\s*import\s+(["'])([^"']+)\1/g;
  for (const match of runtimeContent.matchAll(sideEffectPattern)) matches.push(match[2]);
  return matches;
}

if (importSpecifiers('import type { Example } from "./type-only.js";', { includeTypeOnly: false }).length !== 0) {
  failures.push("check-code-health.mjs: type-only imports must not enter the runtime dependency graph");
}
if (importSpecifiers('import type { Example } from "./type-only.js";').length !== 1) {
  failures.push("check-code-health.mjs: type-only imports must remain in the source reachability graph");
}

function findCycles(graph) {
  const visited = new Set();
  const active = new Set();
  const stack = [];
  const cycles = [];

  function visit(node) {
    if (active.has(node)) {
      const start = stack.indexOf(node);
      cycles.push([...stack.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    active.add(node);
    stack.push(node);
    for (const dependency of graph.get(node) ?? []) visit(dependency);
    stack.pop();
    active.delete(node);
  }

  for (const node of graph.keys()) visit(node);
  return cycles;
}

function findReachableFiles(graph, entrypoints) {
  const reachable = new Set();
  const pending = [...entrypoints];
  while (pending.length) {
    const file = pending.pop();
    if (!file || reachable.has(file)) continue;
    reachable.add(file);
    for (const dependency of graph.get(file) ?? []) pending.push(dependency);
  }
  return reachable;
}

function checkDuplicateTopLevelSymbols(relativePath, content) {
  const names = new Map();
  const pattern = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of content.matchAll(pattern)) {
    const name = match[1] ?? match[2];
    names.set(name, (names.get(name) ?? 0) + 1);
  }
  for (const [name, count] of names) {
    if (count > 1) failures.push(`${relativePath}: duplicate top-level symbol ${name} (${count})`);
  }
}

const files = (await Promise.all(sourceRoots.map((directory) => collectFiles(path.join(root, directory))))).flat();
const scriptFiles = await collectFiles(path.join(root, "scripts"));
const graph = new Map();
const runtimeGraph = new Map();
const contents = new Map();

for (const file of files) {
  const content = await readFile(file, "utf8");
  contents.set(file, content);
  checkDuplicateTopLevelSymbols(path.relative(root, file), content);
  const relativePath = path.relative(root, file);
  if (
    relativePath.startsWith("src/") &&
    /\.(?:ts|tsx)$/.test(relativePath) &&
    /(?:Number|parseInt|parseFloat)\([^\n]+\)\s*\|\|\s*0/.test(content)
  ) {
    failures.push(`${relativePath}: UI rendering must not coerce invalid numbers to 0 with || 0; use explicit finite/null handling`);
  }
  const dependencies = [];
  for (const specifier of importSpecifiers(content)) {
    const resolved = await resolveImport(file, specifier);
    if (resolved && files.includes(resolved)) dependencies.push(resolved);
  }
  const runtimeDependencies = [];
  for (const specifier of importSpecifiers(content, { includeTypeOnly: false })) {
    const resolved = await resolveImport(file, specifier);
    if (resolved && files.includes(resolved)) runtimeDependencies.push(resolved);
  }
  graph.set(file, dependencies);
  runtimeGraph.set(file, runtimeDependencies);
}

for (const [file, content] of contents.entries()) {
  const relativePath = path.relative(root, file);
  if (content.includes("/communities/337?focus=residents")) {
    failures.push(`${relativePath}: unscoped resident actions must never default to San Pablo`);
  }
  if (
    relativePath.startsWith("src/") &&
    relativePath !== "src/shared/api/authenticatedFetch.ts" &&
    /\bfetch\(\s*["']\/api\//.test(content)
  ) {
    failures.push(`${relativePath}: platform API requests must use authenticatedFetch.ts`);
  }
}

const appErrorBoundary = contents.get(path.join(root, "src/shared/ui/AppErrorBoundary.tsx")) ?? "";
if (appErrorBoundary.includes("const message = error.message") || /\n\s*\{\s*error\.message\s*\}/.test(appErrorBoundary)) {
  failures.push("src/shared/ui/AppErrorBoundary.tsx: raw exception messages must not be rendered to end users");
}

const loginPage = contents.get(path.join(root, "src/app/auth/LoginPage.tsx")) ?? "";
if (!loginPage.includes("normalizePostLoginPath(")) {
  failures.push("src/app/auth/LoginPage.tsx: persisted post-login destinations must pass through the internal-route boundary");
}
const moduleTelemetry = contents.get(path.join(root, "src/shared/analytics/moduleTelemetry.ts")) ?? "";
if (!moduleTelemetry.includes("sanitizeTelemetryEvent") || /filter\(\(event\) => event\?\.id && event\?\.action\)/.test(moduleTelemetry)) {
  failures.push("src/shared/analytics/moduleTelemetry.ts: persisted telemetry must use exact bounded normalization");
}

const outwardErrorBoundaries = new Map([
  ["server/claude-copilot.mjs", /Structured tool context could not be loaded:\s*\$\{/],
  ["server/copilot-tools.mjs", /note:\s*message\b/],
  ["scripts/generate-analyst-qa.mjs", /reason:\s*error\s+instanceof\s+Error\s*\?\s*error\.message/],
  ["src/features/home/chatRuntime.ts", /return\s+error\s+instanceof\s+Error\s*\?\s*error\.message/],
  ["src/features/command-center/pages/CommandCenterPage.tsx", /reason:\s*error\s+instanceof\s+Error\s*\?\s*error\.message/],
  ["src/features/explorer/pages/DataExplorerPage.tsx", /setError\([^\n]*instanceof\s+Error\s*\?[^\n]*\.message/],
  ["src/shared/modules/ResidentSearchModule.tsx", /setError\([^\n]*instanceof\s+Error\s*\?[^\n]*\.message/]
]);
for (const [relativePath, unsafePattern] of outwardErrorBoundaries) {
  const absolutePath = path.join(root, relativePath);
  const content = contents.get(absolutePath) ?? await readFile(absolutePath, "utf8").catch(() => "");
  if (unsafePattern.test(content)) {
    failures.push(`${relativePath}: raw exception messages must not cross the user or model boundary`);
  }
}

for (const cycle of findCycles(runtimeGraph)) {
  failures.push(`import cycle: ${cycle.map((file) => path.relative(root, file)).join(" -> ")}`);
}

const browserEntrypoint = path.join(root, "src/main.tsx");
const browserReachableFiles = findReachableFiles(graph, [browserEntrypoint]);
for (const file of files) {
  const relativePath = path.relative(root, file);
  if (!relativePath.startsWith("src/") || relativePath.endsWith(".d.ts")) continue;
  if (!browserReachableFiles.has(file)) {
    failures.push(`${relativePath}: browser source is unreachable from src/main.tsx`);
  }
}

const retiredSourcePrefixes = [
  "src/features/admin/",
  "src/features/demo/",
  "src/features/strategy/",
  "src/features/workflow/",
  "src/mobile/",
  "src/shared/search/"
];
for (const file of files) {
  const relativePath = path.relative(root, file);
  const retiredPrefix = retiredSourcePrefixes.find((prefix) => relativePath.startsWith(prefix));
  if (retiredPrefix) failures.push(`${relativePath}: retired prototype surface must not return under ${retiredPrefix}`);
}

for (const file of scriptFiles) {
  const relativePath = path.relative(root, file);
  const content = await readFile(file, "utf8");
  if (/localStorage\.(?:getItem|setItem|removeItem)\(["']alamo-platform:analysis-session-v1["']/.test(content)) {
    failures.push(`${relativePath}: analysis session QA must use sessionStorage, matching the production isolation boundary`);
  }
  if (!/^scripts\/check-browser-.*\.mjs$/.test(relativePath) || relativePath === "scripts/browser-qa-utils.mjs") continue;
  const importsSharedHarness = content.includes("from \"./browser-qa-utils.mjs\"");
  const hasLocalBrowserHarness =
    /from\s+["']playwright["']/.test(content) ||
    /from\s+["']node:child_process["']/.test(content) ||
    /function\s+startManagedServers\s*\(/.test(content) ||
    /server\/dev-api\.mjs/.test(content);
  if (hasLocalBrowserHarness || !importsSharedHarness) {
    failures.push(`${relativePath}: browser QA scripts must use scripts/browser-qa-utils.mjs instead of local server/browser harnesses`);
  }
}

const growthBudgets = new Map([
  ["server/copilot-tools.mjs", 1750],
  ["server/platform-data.mjs", 1100],
  ["server/tools/answer-formatting.mjs", 1350],
  ["server/tools/incidents.mjs", 1325],
  ["server/tools/residents.mjs", 1235],
  ["src/features/command-center/pages/CommandCenterPage.tsx", 1065],
  ["src/features/communities/components/AppHomeDrilldowns.tsx", 275],
  ["src/features/communities/components/AppHomeSummarySlider.tsx", 235],
  ["src/features/communities/pages/AppHomePage.tsx", 625],
  ["src/features/communities/pages/CommunitiesPage.tsx", 1165],
  ["src/features/home/components/AdHocVisualModule.tsx", 700],
  ["src/features/home/pages/WorkspaceHomePage.tsx", 1030],
  ["src/features/incidents/pages/IncidentCenterPage.tsx", 1060]
]);
for (const [relativePath, maximumLines] of growthBudgets) {
  const content = contents.get(path.join(root, relativePath)) ?? "";
  const lineCount = content.split(/\r?\n/).length;
  if (lineCount > maximumLines) failures.push(`${relativePath}: ${lineCount} lines exceeds the ${maximumLines}-line refactor budget`);
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const packageDependencies = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies
};
for (const retiredDependency of ["chart.js", "react-chartjs-2"]) {
  if (packageDependencies[retiredDependency]) {
    failures.push(`package.json: retired chart dependency ${retiredDependency} must not return; use the shared Recharts modules`);
  }
}

const databricksService = contents.get(path.join(root, "server/databricks.mjs")) ?? "";
if (/^import\s+\{?[^\n]*\}?\s+from\s+["']@databricks\/sql["']/m.test(databricksService)) {
  failures.push("server/databricks.mjs: warehouse driver must remain demand-loaded so snapshot-first requests do not pay its startup cost");
}
if (!databricksService.includes('import("@databricks/sql")')) {
  failures.push("server/databricks.mjs: demand-loaded warehouse driver boundary is missing");
}

const copilotTools = contents.get(path.join(root, "server/copilot-tools.mjs")) ?? "";
if (/node:fs|node:path|fileURLToPath/.test(copilotTools)) {
  failures.push("server/copilot-tools.mjs: filesystem/cache IO must stay behind a service boundary");
}
if (
  copilotTools.includes("validateCertifiedRouteResult(") &&
  !/import\s*\{[\s\S]*?validateCertifiedRouteResult[\s\S]*?\}\s*from\s*["']\.\/tools\/certified-result-policy\.mjs["']/.test(copilotTools)
) {
  failures.push("server/copilot-tools.mjs: cached guided-route validation must be imported from the certified result policy boundary");
}

const databricksClient = contents.get(path.join(root, "server/databricks.mjs")) ?? "";
if (/^const client = new DBSQLClient\(\);/m.test(databricksClient)) {
  failures.push("server/databricks.mjs: DBSQLClient must be constructed lazily so pure compiler imports do not retain warehouse handles");
}
if (!databricksClient.includes("function getDatabricksClient()")) {
  failures.push("server/databricks.mjs: missing lazy Databricks client boundary");
}
if (copilotTools.includes("function prepareAnalysisExecution(")) {
  failures.push("server/copilot-tools.mjs: analysis execution preparation must stay behind the execution-planning boundary");
}
if (!copilotTools.includes("createAnalysisExecutionPlanner")) {
  failures.push("server/copilot-tools.mjs: execution planning must be wired through the execution-planning boundary");
}
if (!/validateScopedToolResult\(interpretedContent, result, communities, reportsSummary\)/.test(copilotTools)) {
  failures.push("server/copilot-tools.mjs: secondary analyst tools must pass through scope validation");
}
for (const extractedSymbol of [
  "function buildRecoveryResult(",
  "function getClosestRecoveryActions(",
  "function getIncidentCategoryFilter(",
  "function filterIncidentsByCategory(",
  "function formatIncidentBreakdownSubject(",
  "function buildAdHocIncidentVisual(",
  "function buildAdHocCensusVisual(",
  "function buildCensusTrendTool(",
  "function buildCensusMovementTool(",
  "function buildCensusDropHistoryTool(",
  "function buildCommunityTimeSeriesTool(",
  "function buildIncidentBreakdownTool(",
  "function buildIncidentCategoryComparisonTool(",
  "function buildIncidentDetailListTool(",
  "function buildIncidentRateTool(",
  "function buildIncidentRateChangeTool(",
  "function buildTopIncidentCategoryByCommunityTool(",
  "function getResidentSearchTerms(",
  "function findPartialResidentMatches(",
  "function buildResidentRecoveryResult(",
  "function buildAdHocResidentVisual(",
  "function buildResidentLookupTool(",
  "function buildResidentIncidentHistoryTool(",
  "function buildDiagnosisMixTool(",
  "function buildLengthOfStayMixTool(",
  "function buildResidentDemographicsTool(",
  "function buildResidentSearchTool(",
  "function buildDocumentationGapsTool(",
  "function buildResidentRiskSummaryTool(",
  "function buildDataAvailabilityTool(",
  "function buildIncidentFreshnessTool(",
  "function getDateOnlyKey(",
  "function daysBetweenDateKeys(",
  "function buildUnavailablePeriodResult(",
  "function formatLoadedPeriodWindow(",
  "function findClosestLoadedPeriods(",
  "function buildClosestPeriodPrompt(",
  "function getPortfolioFallbackScopes(",
  "function formatRequestedGrain(",
  "function parseDisplayNumber(",
  "function firstMeaningfulTextLine(",
  "function isRankingOrComparisonIntent(",
  "function getAnswerFormatContract(",
  "function buildAnalystTakeaway(",
  "function addAnalystTakeaway(",
  "function carryForwardSameDomainScope(",
  "function hasExplicitAnalysisShape(",
  "function normalizeToolVisual(",
  "function normalizeToolArtifact(",
  "function normalizeModuleSelectionReason(",
  "function normalizeTruthState(",
  "function normalizeToolResultContract(",
  "function enhanceVisualForIntent(",
  "function finalizeToolResult(",
  "function finalizeCachedToolResult(",
  "function normalizeToolActions(",
  "function pruneActionNoise(",
  "function sanitizeDisplayString(",
  "function enforceAnswerInvariants(",
  "function makeTrace(",
  "function attachTrace(",
  "function makeCapabilityCertifiedQuestionMeta(",
  "function enforceCertifiedRouteResult(",
  "function withCertifiedGuidance(",
  "function buildAdHocMedicationVisual(",
  "function buildMedicationProfileTool(",
  "function buildMedicationRefusalsByCommunityTool(",
  "function buildMedicationComplianceTool("
]) {
  if (copilotTools.includes(extractedSymbol)) {
    failures.push(`server/copilot-tools.mjs: extracted symbol returned to the monolith: ${extractedSymbol}`);
  }
}
if (!copilotTools.includes("createIncidentToolDefinitions")) {
  failures.push("server/copilot-tools.mjs: incident tools must be registered through the incident domain boundary");
}
if (!copilotTools.includes("createActionPolicyTools")) {
  failures.push("server/copilot-tools.mjs: action and recovery policy must stay behind the action-policy boundary");
}
if (!copilotTools.includes("createCensusToolDefinitions")) {
  failures.push("server/copilot-tools.mjs: census tools must be registered through the census domain boundary");
}
if (!copilotTools.includes("createResidentToolDefinitions")) {
  failures.push("server/copilot-tools.mjs: resident tools must be registered through the resident domain boundary");
}
if (!copilotTools.includes("createTrendToolDefinitions")) {
  failures.push("server/copilot-tools.mjs: trend tools must be registered through the trend domain boundary");
}
if (!copilotTools.includes("createAvailabilityToolDefinitions")) {
  failures.push("server/copilot-tools.mjs: availability tools must be registered through the availability domain boundary");
}
if (!copilotTools.includes("createMedicationDomainDefinitions")) {
  failures.push("server/copilot-tools.mjs: medication tools must be registered through the medication domain boundary");
}
if (!copilotTools.includes("createPlatformOverviewToolDefinitions")) {
  failures.push("server/copilot-tools.mjs: platform overview tools must be registered through the platform-overview boundary");
}
if (!copilotTools.includes("createMetricSliceToolDefinitions")) {
  failures.push("server/copilot-tools.mjs: generic metric tools must be registered through the metric-slices boundary");
}
for (const extractedSymbol of [
  "function getMetricIntent(",
  "function getGroupIntent(",
  "function makeTableVisual(",
  "function buildSliceMetricTool(",
  "function buildComparePeriodsTool("
]) {
  if (copilotTools.includes(extractedSymbol)) {
    failures.push(`server/copilot-tools.mjs: metric-slice logic returned to the orchestrator (${extractedSymbol})`);
  }
}
if (!copilotTools.includes("createUnavailablePeriodRecoveryTools")) {
  failures.push("server/copilot-tools.mjs: unavailable-period recovery must stay behind the recovery boundary");
}
if (!copilotTools.includes("createAnswerFormattingTools")) {
  failures.push("server/copilot-tools.mjs: answer formatting must stay behind the answer-formatting boundary");
}
if (!copilotTools.includes("createResultFinalizationTools")) {
  failures.push("server/copilot-tools.mjs: result finalization must stay behind the result-finalization boundary");
}
if (!copilotTools.includes("createCertifiedCachePolicy")) {
  failures.push("server/copilot-tools.mjs: certified-cache eligibility must stay behind the cache-policy boundary");
}

const cachePolicyTools = contents.get(path.join(root, "server/tools/cache-policy.mjs")) ?? "";
for (const requiredSymbol of [
  "createCertifiedCachePolicy",
  "certifiedCacheEligible",
  "cachedResultMatchesRequestedScope",
  "shouldBypassCertifiedCache"
]) {
  if (!cachePolicyTools.includes(requiredSymbol)) {
    failures.push(`server/tools/cache-policy.mjs: missing cache-policy boundary ${requiredSymbol}`);
  }
}

const resultSafetyTools = contents.get(path.join(root, "server/tools/result-safety.mjs")) ?? "";
for (const requiredSymbol of [
  "export const TOOL_TRUTH_STATES",
  "export function sanitizeDisplayString",
  "export function enforceAnswerInvariants",
  "export function makeTrace",
  "export function attachTrace"
]) {
  if (!resultSafetyTools.includes(requiredSymbol)) {
    failures.push(`server/tools/result-safety.mjs: missing result-safety boundary ${requiredSymbol}`);
  }
}

const certifiedResultPolicy = contents.get(path.join(root, "server/tools/certified-result-policy.mjs")) ?? "";
for (const requiredSymbol of [
  "export function makeCapabilityCertifiedQuestionMeta",
  "export function enforceCertifiedRouteResult",
  "export function withCertifiedGuidance"
]) {
  if (!certifiedResultPolicy.includes(requiredSymbol)) {
    failures.push(`server/tools/certified-result-policy.mjs: missing certified-result boundary ${requiredSymbol}`);
  }
}

const serverPlatformData = contents.get(path.join(root, "server/platform-data.mjs")) ?? "";
const qaArtifacts = contents.get(path.join(root, "server/qa-artifacts.mjs")) ?? "";
for (const extractedSymbol of [
  "function readBoundedQaArtifact(",
  "function sanitizeQaFailure(",
  "function getQaArtifactSummary(",
  "class SnapshotUnavailableError",
  "function getSnapshotDiagnostics(",
  "function assertToolContextSafeForAzurePublish(",
  "function normalizeExplorerKind(",
  "function buildIncidentExplorerRows(",
  "function buildCensusExplorerRows(",
  "function buildResidentExplorerRows("
]) {
  if (serverPlatformData.includes(extractedSymbol)) {
    failures.push(`server/platform-data.mjs: QA artifact responsibility returned to the warehouse module: ${extractedSymbol}`);
  }
}

const snapshotStatus = contents.get(path.join(root, "server/snapshot-status.mjs")) ?? "";
for (const requiredSymbol of [
  "export class SnapshotUnavailableError",
  "export function getSnapshotFreshness",
  "export function getSnapshotDiagnostics",
  "export function assertToolContextSafeForAzurePublish",
  "export function isSnapshotUnavailableError"
]) {
  if (!snapshotStatus.includes(requiredSymbol)) {
    failures.push(`server/snapshot-status.mjs: missing snapshot-status boundary ${requiredSymbol}`);
  }
}

const dataExplorer = contents.get(path.join(root, "server/data-explorer.mjs")) ?? "";
for (const requiredSymbol of [
  "export function normalizeExplorerKind",
  "export function buildDataExplorerPayload"
]) {
  if (!dataExplorer.includes(requiredSymbol)) {
    failures.push(`server/data-explorer.mjs: missing data-explorer boundary ${requiredSymbol}`);
  }
}
for (const requiredSymbol of [
  "export function normalizeAnalystQaArtifact",
  "export async function getAnalystQaStatus",
  "export async function getQaArtifactStatuses"
]) {
  if (!qaArtifacts.includes(requiredSymbol)) {
    failures.push(`server/qa-artifacts.mjs: missing QA artifact boundary ${requiredSymbol}`);
  }
}

const incidentTools = contents.get(path.join(root, "server/tools/incidents.mjs")) ?? "";
for (const requiredSymbol of [
  "createIncidentCategoryTools",
  "createIncidentBreakdownTools",
  "createIncidentComparisonTools",
  "createIncidentDetailTools",
  "createIncidentRateTools",
  "createIncidentVisualTools",
  "createIncidentToolDefinitions"
]) {
  if (!incidentTools.includes(`function ${requiredSymbol}`)) {
    failures.push(`server/tools/incidents.mjs: missing incident domain boundary ${requiredSymbol}`);
  }
}

const actionPolicyTools = contents.get(path.join(root, "server/tools/action-policy.mjs")) ?? "";
for (const requiredSymbol of [
  "createActionPolicyTools",
  "normalizeToolActions",
  "buildRecoveryResult",
  "pruneActionNoise"
]) {
  if (!actionPolicyTools.includes(requiredSymbol)) {
    failures.push(`server/tools/action-policy.mjs: missing action-policy boundary ${requiredSymbol}`);
  }
}

const recoveryTools = contents.get(path.join(root, "server/tools/recovery.mjs")) ?? "";
for (const requiredSymbol of [
  "createUnavailablePeriodRecoveryTools",
  "buildUnavailablePeriodResult",
  "findClosestLoadedPeriods",
  "getPortfolioFallbackScopes"
]) {
  if (!recoveryTools.includes(requiredSymbol)) {
    failures.push(`server/tools/recovery.mjs: missing unavailable-period recovery boundary ${requiredSymbol}`);
  }
}

const censusTools = contents.get(path.join(root, "server/tools/census.mjs")) ?? "";
for (const requiredSymbol of [
  "createCensusVisualTools",
  "createCensusTrendTools",
  "createCensusMovementTools",
  "createCensusHistoryTools",
  "createCensusToolDefinitions"
]) {
  if (!censusTools.includes(`function ${requiredSymbol}`)) {
    failures.push(`server/tools/census.mjs: missing census domain boundary ${requiredSymbol}`);
  }
}

const residentTools = contents.get(path.join(root, "server/tools/residents.mjs")) ?? "";
for (const requiredSymbol of [
  "createResidentTools",
  "createResidentToolDefinitions",
  "buildResidentLookupTool",
  "buildResidentSearchTool",
  "buildResidentIncidentHistoryTool",
  "buildResidentRiskSummaryTool"
]) {
  if (!residentTools.includes(requiredSymbol)) {
    failures.push(`server/tools/residents.mjs: missing resident domain boundary ${requiredSymbol}`);
  }
}

const trendTools = contents.get(path.join(root, "server/tools/trends.mjs")) ?? "";
for (const requiredSymbol of [
  "createCommunityTimeSeriesTools",
  "createTrendToolDefinitions",
  "buildCommunityTimeSeriesTool"
]) {
  if (!trendTools.includes(requiredSymbol)) {
    failures.push(`server/tools/trends.mjs: missing trend domain boundary ${requiredSymbol}`);
  }
}

const availabilityTools = contents.get(path.join(root, "server/tools/availability.mjs")) ?? "";
for (const requiredSymbol of [
  "createAvailabilityTools",
  "createAvailabilityToolDefinitions",
  "buildDataAvailabilityTool",
  "buildIncidentFreshnessTool"
]) {
  if (!availabilityTools.includes(requiredSymbol)) {
    failures.push(`server/tools/availability.mjs: missing availability domain boundary ${requiredSymbol}`);
  }
}

const answerFormattingTools = contents.get(path.join(root, "server/tools/answer-formatting.mjs")) ?? "";
for (const requiredSymbol of [
  "createAnswerFormattingTools",
  "buildAnalystTakeaway",
  "getAnswerFormatContract",
  "addAnalystTakeaway"
]) {
  if (!answerFormattingTools.includes(requiredSymbol)) {
    failures.push(`server/tools/answer-formatting.mjs: missing answer-formatting boundary ${requiredSymbol}`);
  }
}

const executionPlanningTools = contents.get(path.join(root, "server/tools/execution-planning.mjs")) ?? "";
for (const requiredSymbol of [
  "createAnalysisExecutionPlanner",
  "prepareAnalysisExecution",
  "carryForwardSameDomainScope",
  "hasExplicitAnalysisShape"
]) {
  if (!executionPlanningTools.includes(requiredSymbol)) {
    failures.push(`server/tools/execution-planning.mjs: missing execution-planning boundary ${requiredSymbol}`);
  }
}

const resultFinalizationTools = contents.get(path.join(root, "server/tools/result-finalization.mjs")) ?? "";
for (const requiredSymbol of [
  "createResultFinalizationTools",
  "normalizeToolResultContract",
  "normalizeTruthState",
  "finalizeToolResult",
  "finalizeCachedToolResult",
  "enhanceVisualForIntent"
]) {
  if (!resultFinalizationTools.includes(requiredSymbol)) {
    failures.push(`server/tools/result-finalization.mjs: missing result-finalization boundary ${requiredSymbol}`);
  }
}

const turnTraceTools = contents.get(path.join(root, "server/tools/turn-trace.mjs")) ?? "";
for (const requiredSymbol of [
  "recordAnalystTurnTrace",
  "getAnalystTraceTelemetry",
  "resetAnalystTraceTelemetry"
]) {
  if (!turnTraceTools.includes(requiredSymbol)) {
    failures.push(`server/tools/turn-trace.mjs: missing trace telemetry boundary ${requiredSymbol}`);
  }
}

const surfaceTools = contents.get(path.join(root, "server/tools/surfaces.mjs")) ?? "";
for (const requiredSymbol of [
  "createSurfaceTools",
  "resolveSurfaceModule",
  "buildSurfaceModuleTool",
  "buildModuleCatalogTool"
]) {
  if (!surfaceTools.includes(requiredSymbol)) {
    failures.push(`server/tools/surfaces.mjs: missing product-surface boundary ${requiredSymbol}`);
  }
}

const toolDataAccess = contents.get(path.join(root, "server/tools/tool-data-access.mjs")) ?? "";
for (const requiredSymbol of [
  "createToolDataAccess",
  "findFacility",
  "getIncidentRows",
  "getResidentRows",
  "getMedicationComplianceRows",
  "getMarExceptionDetailRows"
]) {
  if (!toolDataAccess.includes(requiredSymbol)) {
    failures.push(`server/tools/tool-data-access.mjs: missing data-access boundary ${requiredSymbol}`);
  }
}

const medicationQueryTools = contents.get(path.join(root, "server/tools/medication-query.mjs")) ?? "";
for (const requiredSymbol of [
  "createMedicationQueryTools",
  "medicationMatches",
  "getRequestedMedicationName"
]) {
  if (!medicationQueryTools.includes(requiredSymbol)) {
    failures.push(`server/tools/medication-query.mjs: missing medication-query boundary ${requiredSymbol}`);
  }
}

const medicationSummaryTools = contents.get(path.join(root, "server/tools/medication-summaries.mjs")) ?? "";
for (const requiredSymbol of [
  "createMedicationSummaryTools",
  "buildAdHocMedicationVisual",
  "buildMedicationProfileTool",
  "buildMedicationRefusalsByCommunityTool",
  "buildMedicationComplianceTool"
]) {
  if (!medicationSummaryTools.includes(requiredSymbol)) {
    failures.push(`server/tools/medication-summaries.mjs: missing medication-summary boundary ${requiredSymbol}`);
  }
}

const medicationTools = contents.get(path.join(root, "server/tools/medications.mjs")) ?? "";
for (const requiredSymbol of [
  "createMedicationExceptionTools",
  "createMedicationToolDefinitions",
  "MEDICATION_TOOL_NAMES"
]) {
  if (!medicationTools.includes(requiredSymbol)) {
    failures.push(`server/tools/medications.mjs: missing medication-domain boundary ${requiredSymbol}`);
  }
}

const platformOverviewTools = contents.get(path.join(root, "server/tools/platform-overview.mjs")) ?? "";
for (const requiredSymbol of [
  "createPlatformOverviewTools",
  "createPlatformOverviewToolDefinitions",
  "PLATFORM_OVERVIEW_TOOL_NAMES"
]) {
  if (!platformOverviewTools.includes(requiredSymbol)) {
    failures.push(`server/tools/platform-overview.mjs: missing platform-overview boundary ${requiredSymbol}`);
  }
}
for (const extractedSymbol of [
  "function buildToolContextCatalogTool(",
  "function buildCommunityProfileTool(",
  "function buildOperatingSnapshotTool(",
  "function buildCommunityCompareTool("
]) {
  if (copilotTools.includes(extractedSymbol)) {
    failures.push(`server/copilot-tools.mjs: platform-overview logic returned to the orchestrator (${extractedSymbol})`);
  }
}

const toolDetection = contents.get(path.join(root, "server/tools/tool-detection.mjs")) ?? "";
for (const requiredSymbol of [
  "createToolDetection",
  "detectTool",
  "isAnalysisIntent",
  "isBarePersonNameIntent",
  "isExportIntent"
]) {
  if (!toolDetection.includes(requiredSymbol)) {
    failures.push(`server/tools/tool-detection.mjs: missing intent-detection boundary ${requiredSymbol}`);
  }
}
if (/promptText|rawPrompt|content:\s*content|operatorPrompt/.test(turnTraceTools)) {
  failures.push("server/tools/turn-trace.mjs: trace telemetry must not store raw prompt text");
}

const periodUtils = contents.get(path.join(root, "shared/period-utils.mjs")) ?? "";
if (!periodUtils.includes("parseRequestedMonthBuckets")) {
  failures.push("shared/period-utils.mjs: missing shared period parser boundary");
}
if (!periodUtils.includes("export function formatMonthLabel")) {
  failures.push("shared/period-utils.mjs: missing shared month label formatter");
}
if (!periodUtils.includes("export function findClosestMonthWindow")) {
  failures.push("shared/period-utils.mjs: missing shared closest-month recovery boundary");
}
for (const [file, content] of contents.entries()) {
  const relativePath = path.relative(root, file);
  if (relativePath === "shared/period-utils.mjs") continue;
  for (const duplicatePattern of [
    "const MONTH_ALIASES",
    "const MONTHS = new Map",
    "function enumerateMonthRange(",
    "function formatMonthLabel(",
    "function formatMonthBucket(",
    "function parsePeriods("
  ]) {
    if (content.includes(duplicatePattern)) {
      failures.push(`${relativePath}: month parsing must stay behind shared/period-utils.mjs (${duplicatePattern})`);
    }
  }
}

const communityNames = contents.get(path.join(root, "shared/community-names.mjs")) ?? "";
for (const requiredSymbol of [
  "normalizeKnownCommunityNames",
  "normalizeKnownCommunityNamesDeep"
]) {
  if (!communityNames.includes(`export function ${requiredSymbol}`)) {
    failures.push(`shared/community-names.mjs: missing community-name boundary ${requiredSymbol}`);
  }
}
for (const [file, content] of contents.entries()) {
  const relativePath = path.relative(root, file);
  if (relativePath === "shared/community-names.mjs") continue;
  if (content.includes("FACILITY_NAME_NORMALIZATIONS")) {
    failures.push(`${relativePath}: community-name normalization must stay behind shared/community-names.mjs`);
  }
}

const httpErrors = contents.get(path.join(root, "server/http-errors.mjs")) ?? "";
for (const requiredSymbol of ["getRequestUrl", "getApiError"]) {
  if (!httpErrors.includes(`export function ${requiredSymbol}`)) {
    failures.push(`server/http-errors.mjs: missing HTTP error boundary ${requiredSymbol}`);
  }
}
const protectedGetHandler = contents.get(path.join(root, "server/protected-get-handler.mjs")) ?? "";
if (!protectedGetHandler.includes("getApiError")) {
  failures.push("server/protected-get-handler.mjs: shared GET boundary must use server/http-errors.mjs");
}
if (!protectedGetHandler.includes("export async function handleProtectedGetRoutes")) {
  failures.push("server/protected-get-handler.mjs: missing protected GET route-table boundary");
}
for (const relativePath of ["api/communities.js", "api/platform.js"]) {
  const content = contents.get(path.join(root, relativePath)) ?? "";
  if (!content.includes("handleProtectedGetRoutes")) {
    failures.push(`${relativePath}: multi-route GET APIs must use the protected route-table boundary`);
  }
  for (const duplicateBoundary of ["requireApiUser", "applyProtectedApiHeaders", "getRequestUrl", "getApiError"]) {
    if (content.includes(duplicateBoundary)) {
      failures.push(`${relativePath}: ${duplicateBoundary} must stay behind server/protected-get-handler.mjs`);
    }
  }
}
for (const relativePath of [
  "api/communities.js",
  "api/data-explorer.js",
  "api/home-dashboard.js",
  "api/platform.js",
  "api/analytics-summary.js"
]) {
  const content = contents.get(path.join(root, relativePath)) ?? "";
  if (!content.includes("getApiError") && !content.includes("handleProtectedGet")) {
    failures.push(`${relativePath}: platform API errors must use server/http-errors.mjs`);
  }
}

const browserStorage = contents.get(path.join(root, "src/shared/storage/browserStorage.ts")) ?? "";
for (const requiredSymbol of [
  "readStorageItem",
  "writeStorageItem",
  "removeStorageItem",
  "readJsonStorage",
  "writeJsonStorage"
]) {
  if (!browserStorage.includes(`export function ${requiredSymbol}`)) {
    failures.push(`src/shared/storage/browserStorage.ts: missing browser storage boundary ${requiredSymbol}`);
  }
}

const browserDownload = contents.get(path.join(root, "src/shared/files/browserDownload.ts")) ?? "";
if (!browserDownload.includes("export function downloadTextFile")) {
  failures.push("src/shared/files/browserDownload.ts: missing browser download boundary");
}
for (const [file, content] of contents.entries()) {
  const relativePath = path.relative(root, file);
  if (relativePath === "src/shared/files/browserDownload.ts") continue;
  if (content.includes("function downloadTextFile(")) {
    failures.push(`${relativePath}: browser downloads must stay behind src/shared/files/browserDownload.ts`);
  }
}
for (const [file, content] of contents.entries()) {
  const relativePath = path.relative(root, file);
  if (relativePath === "src/shared/storage/browserStorage.ts") continue;
  if (/\bwindow\.(?:localStorage|sessionStorage)\b|\b(?:localStorage|sessionStorage)\./.test(content)) {
    failures.push(`${relativePath}: browser storage access must stay behind src/shared/storage/browserStorage.ts`);
  }
}

const workspaceHome = contents.get(path.join(root, "src/features/home/pages/WorkspaceHomePage.tsx")) ?? "";
for (const retiredFreeTextSymbol of [
  "sendCopilotChatMessage",
  "getGroupedSearchResults",
  "const [prompt, setPrompt]",
  "composerRef",
  "textareaRef"
]) {
  if (workspaceHome.includes(retiredFreeTextSymbol)) {
    failures.push(`WorkspaceHomePage.tsx: rails-only workspace must not reintroduce free-text composer logic (${retiredFreeTextSymbol})`);
  }
}
if (workspaceHome.includes("react-hooks/exhaustive-deps")) {
  failures.push("WorkspaceHomePage.tsx: hook dependencies must use explicit event or callback boundaries, not lint suppression");
}
if (workspaceHome.includes("alamo-platform:chat-history-v1:")) {
  failures.push("WorkspaceHomePage.tsx: chat-history storage must stay in the chat-history service");
}
if (/function parseMessageBlocks\(|const FormattedMessageText\s*=/.test(workspaceHome)) {
  failures.push("WorkspaceHomePage.tsx: formatted message parsing/rendering must stay behind the FormattedMessageText component boundary");
}
for (const extractedSymbol of [
  "function getModuleMeta(",
  "function createToolResultMessage("
]) {
  if (workspaceHome.includes(extractedSymbol)) {
    failures.push(`WorkspaceHomePage.tsx: module-model logic must stay behind workspaceModuleModel.ts (${extractedSymbol})`);
  }
}
if (
  workspaceHome.includes("<ChatHistoryMenu") ||
  workspaceHome.includes("Open chat history")
) {
  failures.push("WorkspaceHomePage.tsx: the retired visible History menu must not return");
}
for (const retiredHomeNavigationSymbol of [
  "WorkspaceNavigation",
  "useHomeTiles",
  "SaveHomeTileButton",
  "pinModuleTile",
  "pinAnalysisModule"
]) {
  if (workspaceHome.includes(retiredHomeNavigationSymbol)) {
    failures.push(`WorkspaceHomePage.tsx: removed tile/save navigation returned (${retiredHomeNavigationSymbol})`);
  }
}
const workspaceModuleModel = contents.get(path.join(root, "src/features/home/workspaceModuleModel.ts")) ?? "";
for (const requiredSymbol of [
  "getModuleMeta",
  "createToolResultMessage"
]) {
  if (!workspaceModuleModel.includes(`function ${requiredSymbol}(`)) {
    failures.push(`workspaceModuleModel.ts: missing workspace module-model boundary ${requiredSymbol}`);
  }
}
const chatRequestLifecycle = contents.get(path.join(root, "src/features/home/hooks/useChatRequestLifecycle.ts")) ?? "";
if (
  !workspaceHome.includes("useChatRequestLifecycle") ||
  !workspaceHome.includes("clearInboundPromptTimer") ||
  !workspaceHome.includes("scheduleInboundPrompt") ||
  !chatRequestLifecycle.includes("inboundPromptTimerRef") ||
  !chatRequestLifecycle.includes("activeRequestAbortRef.current?.abort()") ||
  !chatRequestLifecycle.includes("transientTimerIdsRef.current.forEach")
) {
  failures.push("workspace chat requests must remain cancelable across superseded requests, thread changes, account changes, and unmounts");
}
const chatSnapController = contents.get(path.join(root, "src/features/home/hooks/useChatSnapController.ts")) ?? "";
if (
  !chatSnapController.includes("snapFrameIdsRef") ||
  !chatSnapController.includes("if (userScrollControlRef.current) return;")
) {
  failures.push("useChatSnapController.ts: scheduled snaps must be cancelable and yield immediately to user scroll control");
}
const commandCenter = contents.get(path.join(root, "src/features/command-center/pages/CommandCenterPage.tsx")) ?? "";
if (!commandCenter.includes("healthRequestRef.current?.abort()") || !commandCenter.includes("intentRequestRef.current?.abort()")) {
  failures.push("CommandCenterPage.tsx: health and intent requests must be cancelable and latest-request-wins");
}
const formattedMessageText = contents.get(path.join(root, "src/features/home/components/FormattedMessageText.tsx")) ?? "";
if (!formattedMessageText.includes("export const FormattedMessageText")) {
  failures.push("FormattedMessageText.tsx: missing formatted message component boundary");
}
for (const duplicatePattern of [
  "const LARGE_DATASHEET_ROW_THRESHOLD =",
  "const chartPalette =",
  "function getAdHocModuleQuickPrompts(",
  "function getIncidentDetailModuleRows(",
  "function getMatrixModuleRows("
]) {
  if (workspaceHome.includes(duplicatePattern)) {
    failures.push(`WorkspaceHomePage.tsx: ad hoc visual model logic must stay behind adHocVisualModel.ts (${duplicatePattern})`);
  }
}
const adHocVisualModel = contents.get(path.join(root, "src/features/home/adHocVisualModel.ts")) ?? "";
for (const requiredSymbol of [
  "export const chartPalette",
  "export function getIncidentDetailModuleRows",
  "export function getMatrixModuleRows",
  "export function getComparisonRows"
]) {
  if (!adHocVisualModel.includes(requiredSymbol)) {
    failures.push(`adHocVisualModel.ts: missing ad hoc visual model boundary ${requiredSymbol}`);
  }
}

const chatHistoryService = contents.get(path.join(root, "src/features/home/chatHistory.ts")) ?? "";
const analysisSessionService = contents.get(path.join(root, "src/features/home/analysisSessionStorage.ts")) ?? "";
const platformDataService = contents.get(path.join(root, "src/shared/api/platformData.ts")) ?? "";
const authenticatedFetchService = contents.get(path.join(root, "src/shared/api/authenticatedFetch.ts")) ?? "";
const dataExplorerPage = contents.get(path.join(root, "src/features/explorer/pages/DataExplorerPage.tsx")) ?? "";
if (!chatHistoryService.includes("CHAT_HISTORY_SCHEMA_VERSION")) {
  failures.push("chatHistory.ts: persisted chat history requires an explicit schema version");
}
if (!chatHistoryService.includes("CHAT_HISTORY_MAX_AGE_MS")) {
  failures.push("chatHistory.ts: persisted resident and analysis history requires a finite retention window");
}
if (!chatHistoryService.includes("restoreInterruptedMessage") || !chatHistoryService.includes("INTERRUPTED_RESPONSE_TEXT")) {
  failures.push("chatHistory.ts: interrupted responses must not restore as permanent running messages");
}
if (!chatHistoryService.includes("isAnalysisFrame(candidate.analysisFrame)")) {
  failures.push("chatHistory.ts: restored analysis frames must be validated before use");
}
if (!chatHistoryService.includes('message.meta?.variant === "suggestion" || message.meta?.transient')) {
  failures.push("chatHistory.ts: transient process and suggestion messages must not persist");
}
if (!chatHistoryService.includes("getTimelineMessages(timelineItems)")) {
  failures.push("chatHistory.ts: persisted messages must derive from the visible timeline");
}
if (/const \[messages, setMessages\]/.test(workspaceHome) || workspaceHome.includes("setMessages(")) {
  failures.push("WorkspaceHomePage.tsx: chat state must use the timeline as its single source of truth");
}
if (!analysisSessionService.includes("ANALYSIS_SESSION_SCHEMA_VERSION")) {
  failures.push("analysisSessionStorage.ts: persisted analysis state requires an explicit schema version");
}
if (!analysisSessionService.includes('{ kind: "session", label: "analysis session" }')) {
  failures.push("analysisSessionStorage.ts: active analysis context must remain tab-session-only");
}
if (!platformDataService.includes("ensureClientCachePartition") || !platformDataService.includes("SESSION_STORAGE_PREFIX")) {
  failures.push("platformData.ts: warm data caches must be account-partitioned");
}
if (!authenticatedFetchService.includes("getApiAuthCachePartition")) {
  failures.push("authenticatedFetch.ts: missing browser cache partition identity boundary");
}
if (!dataExplorerPage.includes("toCsvCell") || !dataExplorerPage.includes("toSpreadsheetText")) {
  failures.push("DataExplorerPage.tsx: spreadsheet exports must use the shared formula-injection boundary");
}
if (/function\s+toCsvValue\s*\(/.test(dataExplorerPage)) {
  failures.push("DataExplorerPage.tsx: CSV encoding must stay behind shared/csv.mjs");
}

if (failures.length) {
  console.error(`FAILED: code health (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`code health checks passed (${files.length} source files, no cycles, growth budgets intact)`);
