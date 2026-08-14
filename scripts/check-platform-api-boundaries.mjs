import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platformDataPath = path.join(root, "src/shared/api/platformData.ts");
const serverPlatformDataPath = path.join(root, "server/platform-data.mjs");
const schemaPath = path.join(root, "src/shared/api/platformResponseSchemas.ts");
const devApiPath = path.join(root, "server/dev-api.mjs");
const platformApiPath = path.join(root, "api/platform.js");
const chatApiPath = path.join(root, "api/chat.js");
const requestSchemaPath = path.join(root, "server/http-request-schema.mjs");
const requestBodyPath = path.join(root, "server/http-body.mjs");
const apiAuthPath = path.join(root, "server/api-auth.mjs");
const apiResponsePath = path.join(root, "server/http-response.mjs");
const authenticatedFetchPath = path.join(root, "src/shared/api/authenticatedFetch.ts");
const authConfigPath = path.join(root, "src/app/auth/authConfig.ts");
const claudeCopilotPath = path.join(root, "server/claude-copilot.mjs");
const vercelConfigPath = path.join(root, "vercel.json");
const notFoundApiPath = path.join(root, "api/not-found.js");
const incidentFeedPath = path.join(root, "server/incident-feed.mjs");
const copilotChatPath = path.join(root, "src/shared/api/copilotChat.ts");
const copilotResponseSchemasPath = path.join(root, "src/shared/api/copilotResponseSchemas.ts");
const appUserProfilePath = path.join(root, "src/shared/auth/appUserProfile.ts");
const chatHistoryPath = path.join(root, "src/features/home/chatHistory.ts");
const platformSnapshotPath = path.join(root, "server/platform-snapshot.mjs");
const snapshotStatusPath = path.join(root, "server/snapshot-status.mjs");
const packagePath = path.join(root, "package.json");
const reportsApiPath = path.join(root, "api/reports.js");
const governedReportingPath = path.join(root, "server/governed-reporting.mjs");
const weeklyBriefingsPath = path.join(root, "server/weekly-briefings.mjs");

const [platformData, serverPlatformData, schemas, devApi, platformApi, chatApi, requestSchemas, requestBody, apiAuth, apiResponse, authenticatedFetch, authConfig, claudeCopilot, vercelConfigSource, notFoundApi, incidentFeed, copilotChat, copilotResponseSchemas, appUserProfile, chatHistory, platformSnapshot, snapshotStatus, packageSource] = await Promise.all([
  readFile(platformDataPath, "utf8"),
  readFile(serverPlatformDataPath, "utf8"),
  readFile(schemaPath, "utf8"),
  readFile(devApiPath, "utf8"),
  readFile(platformApiPath, "utf8"),
  readFile(chatApiPath, "utf8"),
  readFile(requestSchemaPath, "utf8"),
  readFile(requestBodyPath, "utf8"),
  readFile(apiAuthPath, "utf8"),
  readFile(apiResponsePath, "utf8"),
  readFile(authenticatedFetchPath, "utf8"),
  readFile(authConfigPath, "utf8"),
  readFile(claudeCopilotPath, "utf8"),
  readFile(vercelConfigPath, "utf8"),
  readFile(notFoundApiPath, "utf8"),
  readFile(incidentFeedPath, "utf8"),
  readFile(copilotChatPath, "utf8"),
  readFile(copilotResponseSchemasPath, "utf8"),
  readFile(appUserProfilePath, "utf8"),
  readFile(chatHistoryPath, "utf8"),
  readFile(platformSnapshotPath, "utf8"),
  readFile(snapshotStatusPath, "utf8"),
  readFile(packagePath, "utf8")
]);

const failures = [];
const protectedGetHandler = await readFile(path.join(root, "server/protected-get-handler.mjs"), "utf8");
const [reportsApi, governedReporting, weeklyBriefings] = await Promise.all([
  readFile(reportsApiPath, "utf8"),
  readFile(governedReportingPath, "utf8"),
  readFile(weeklyBriefingsPath, "utf8")
]);

for (const apiFile of [
  "api/analytics-summary.js",
  "api/chat.js",
  "api/communities.js",
  "api/data-explorer.js",
  "api/home-dashboard.js",
  "api/incidents.js",
  "api/platform.js",
  "api/reports.js"
]) {
  const source = await readFile(path.join(root, apiFile), "utf8");
  const usesSharedGetBoundary = source.includes("handleProtectedGet");
  if (!source.includes("requireApiUser") && !usesSharedGetBoundary) failures.push(`${apiFile}: missing centralized API authentication`);
  if (!source.includes("applyProtectedApiHeaders") && !usesSharedGetBoundary) failures.push(`${apiFile}: missing protected response headers`);
}

if (
  !protectedGetHandler.includes("requireApiUser") ||
  !protectedGetHandler.includes("applyProtectedApiHeaders") ||
  !protectedGetHandler.includes("getApiError") ||
  !protectedGetHandler.includes("handleProtectedGetRoutes")
) {
  failures.push("protected-get-handler.mjs: shared GET boundary must enforce auth, private headers, and safe errors");
}

if (!apiAuth.includes("jwtVerify") || !apiAuth.includes("requiredScope") || !apiAuth.includes("requiredRole") || !apiAuth.includes("audience") || !apiAuth.includes("issuer")) {
  failures.push("server/api-auth.mjs: delegated token validation must cover signature, scope, optional role, audience, and issuer");
}
if (!authenticatedFetch.includes("acquireTokenSilent") || !authenticatedFetch.includes("Authorization")) {
  failures.push("authenticatedFetch.ts: browser API calls must acquire and attach the delegated access token");
}
if (
  !authenticatedFetch.includes("DEFAULT_API_REQUEST_TIMEOUT_MS") ||
  !authenticatedFetch.includes("createRequestBoundary") ||
  !authenticatedFetch.includes("awaitWithinRequestBoundary")
) {
  failures.push("authenticatedFetch.ts: browser API calls and token acquisition must share one timeout and cancellation boundary");
}
if (
  !authenticatedFetch.includes("DEFAULT_API_RESPONSE_MAX_BYTES") ||
  !authenticatedFetch.includes('response.headers.get("content-length")') ||
  !authenticatedFetch.includes("response.body.getReader()") ||
  !authenticatedFetch.includes("readBoundedJsonResponse")
) {
  failures.push("authenticatedFetch.ts: browser API responses must be streamed through a bounded byte limit");
}
if (
  platformData.includes("response.json()") ||
  copilotChat.includes("response.json()") ||
  !platformData.includes("readBoundedJsonResponse") ||
  !copilotChat.includes("readBoundedResponseText")
) {
  failures.push("browser API consumers must not buffer unbounded JSON responses before validation");
}
if (!authConfig.includes("access_as_user") || !authConfig.includes("apiAuthEnabled")) {
  failures.push("authConfig.ts: login must request the delegated API scope when API auth is enabled");
}
if (!authConfig.includes("import.meta.env.PROD || configuredApiAuth === \"true\"")) {
  failures.push("authConfig.ts: a production build must not allow VITE_API_AUTH_REQUIRED=false to disable delegated API auth");
}
if ((platformData.match(/fetchWithApiAuth/g) ?? []).length < 4 || !chatApi.includes("requireApiUser") || !devApi.includes("requireApiUser")) {
  failures.push("API authentication is not wired through all browser and server boundaries");
}
if (!devApi.includes("applyProtectedApiHeaders") || !apiResponse.includes("private, no-store") || !apiResponse.includes('"Authorization"')) {
  failures.push("protected API responses must be private, non-cacheable, and vary by Authorization");
}
if (!devApi.includes("appendResponseVaryHeader(res, \"Origin\")")) {
  failures.push("dev-api.mjs: CORS must append Vary: Origin without replacing Vary: Authorization");
}
if (
  !devApi.includes("DEV_API_ALLOWED_ORIGINS") ||
  !devApi.includes("LOOPBACK_DEV_ORIGIN") ||
  devApi.includes('"Access-Control-Allow-Origin": "*"')
) {
  failures.push("dev-api.mjs: local browser CORS must be allowlisted rather than open to every origin");
}
if (/warning:\s*error instanceof Error \? error\.message/.test(devApi)) {
  failures.push("dev-api.mjs: successful incident fallback responses must not expose raw upstream errors");
}
if (!chatApi.includes("getApiSessionOwnerKey") || !devApi.includes("getApiSessionOwnerKey")) {
  failures.push("chat session memory must be scoped to the authenticated API identity");
}
if (!claudeCopilot.includes("MAX_CLAUDE_THREADS") || !claudeCopilot.includes("MAX_THREAD_MESSAGES") || !claudeCopilot.includes("getThreadStoreKey")) {
  failures.push("Claude thread memory must be user-scoped and bounded");
}
if (!claudeCopilot.includes("ANTHROPIC_TIMEOUT_MS") || !claudeCopilot.includes("TRANSIENT_ANTHROPIC_STATUSES") || /Claude request failed \([^)]*\):/.test(claudeCopilot)) {
  failures.push("Claude requests must be bounded, retry transient failures, and never expose raw upstream response bodies");
}
if (!claudeCopilot.includes('getBoundedIntegerEnv("ANTHROPIC_MAX_TOKENS"')) {
  failures.push("Claude output tokens must use the bounded integer configuration boundary");
}
if (!platformData.includes("awaitSharedRequest(cached.promise, signal)")) {
  failures.push("platformData.ts: callers must be able to cancel while awaiting a shared cached request");
}
if ((platformData.match(/signed-in account changed while platform data was loading/g) ?? []).length < 5) {
  failures.push("platformData.ts: direct, uncached, and shared pending requests must all reject after an account partition change");
}
if (!platformData.includes("previous account platform warm cache")) {
  failures.push("platformData.ts: account changes must remove the prior user's session warm cache");
}
if (!notFoundApi.includes("applyProtectedApiHeaders") || !notFoundApi.includes("status(404)")) {
  failures.push("api/not-found.js: unknown API routes must return a private JSON 404 response");
}
if (
  !devApi.includes("getIncidentFeedResponse") ||
  !String(await readFile(path.join(root, "api/incidents.js"), "utf8")).includes("getIncidentFeedResponse") ||
  !incidentFeed.includes("snapshot-preferred") ||
  !incidentFeed.includes("snapshot-fallback")
) {
  failures.push("incident feed snapshot/live fallback policy must be shared by local and production APIs");
}

let vercelConfig = null;
try {
  vercelConfig = JSON.parse(vercelConfigSource);
} catch {
  failures.push("vercel.json must be valid JSON");
}
const vercelRewrites = vercelConfig?.rewrites ?? [];
for (const route of ["/api/chat/claude/(.*)", "/api/chat/tools", "/api/chat/intent", "/api/chat/session/reset"]) {
  if (!vercelRewrites.some((rewrite) => rewrite.source === route && rewrite.destination === "/api/chat")) {
    failures.push(`vercel.json: missing production chat rewrite for ${route}`);
  }
}
if (!vercelRewrites.some((rewrite) => rewrite.source === "/api/reports/(.*)" && rewrite.destination === "/api/reports")) {
  failures.push("vercel.json: missing production governed-report rewrite");
}
if (!(vercelConfig?.crons ?? []).some((cron) => cron.path === "/api/reports/weekly" && cron.schedule)) {
  failures.push("vercel.json: missing weekly briefing schedule");
}
if (
  !reportsApi.includes("requireCronSecret") ||
  !reportsApi.includes("CRON_SECRET") ||
  !reportsApi.includes("requireApiUser") ||
  !reportsApi.includes("validateGovernedReportRequest")
) {
  failures.push("api/reports.js: reporting endpoints must enforce cron or user auth and validate request bodies");
}
if (
  !governedReporting.includes("getCertifiedQuestionRouteById") ||
  !governedReporting.includes("REPORT_EMAIL_ALLOWED_DOMAINS") ||
  !governedReporting.includes('"Idempotency-Key"')
) {
  failures.push("governed-reporting.mjs: report creation and delivery must enforce registered routes, recipient domains, and idempotency");
}
if (
  !weeklyBriefings.includes("getCertifiedQuestionRouteById") ||
  !weeklyBriefings.includes("idempotencyKey") ||
  !weeklyBriefings.includes('status: "failed"')
) {
  failures.push("weekly-briefings.mjs: scheduled plans must use registered routes, idempotent delivery, and isolated failure results");
}
if (!requestSchemas.includes("validateGovernedReportRequest")) {
  failures.push("http-request-schema.mjs: governed report requests require a bounded schema validator");
}
const apiFallbackIndex = vercelRewrites.findIndex(
  (rewrite) => rewrite.source === "/api/(.*)" && rewrite.destination === "/api/not-found"
);
const spaFallbackIndex = vercelRewrites.findIndex(
  (rewrite) => rewrite.source === "/(.*)" && rewrite.destination === "/index.html"
);
if (apiFallbackIndex < 0 || spaFallbackIndex < 0 || apiFallbackIndex > spaFallbackIndex) {
  failures.push("vercel.json: unknown API routes must resolve to JSON 404 before the SPA fallback");
}

let packageConfig = null;
try {
  packageConfig = JSON.parse(packageSource);
} catch {
  failures.push("package.json must be valid JSON");
}
for (const scriptName of ["check:release", "check:ship"]) {
  if (!String(packageConfig?.scripts?.[scriptName] ?? "").includes("PRODUCTION_SIGNED_IN_REQUIRED=true")) {
    failures.push(`package.json: ${scriptName} must fail when signed-in production verification is skipped`);
  }
}
const staticHeaderKeys = new Set(
  (vercelConfig?.headers ?? []).flatMap((rule) => rule.headers ?? []).map((header) => header.key)
);
for (const header of ["Content-Security-Policy", "Permissions-Policy", "Referrer-Policy", "Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options"]) {
  if (!staticHeaderKeys.has(header)) failures.push(`vercel.json: missing browser security header ${header}`);
}

const requiredSchemaValidators = [
  "communitiesDashboard",
  "homeDashboard",
  "communitySnapshot",
  "incidentStream",
  "analyticsSummary",
  "platformHealth",
  "analystQaStatus",
  "analystTraceTelemetry",
  "platformBootstrap",
  "dataExplorer"
];

for (const validator of requiredSchemaValidators) {
  if (!schemas.includes(`${validator}(value: unknown)`)) {
    failures.push(`platformResponseSchemas.ts: missing ${validator} validator`);
  }
}

const liveClientValidators = [
  "communitiesDashboard",
  "homeDashboard",
  "communitySnapshot",
  "incidentStream",
  "analyticsSummary",
  "platformHealth",
  "analystTraceTelemetry",
  "dataExplorer"
];

for (const validator of liveClientValidators) {
  if (!platformData.includes(`platformResponseValidators.${validator}`)) {
    failures.push(`platformData.ts: ${validator} response validator is not wired into the fetch boundary`);
  }
}

if (schemas.includes("rows.slice(0") || !schemas.includes("rows.forEach((row, index)")) {
  failures.push("platformResponseSchemas.ts: live platform responses must validate every returned row");
}
if (!platformData.includes("Community snapshot scope mismatch") || !platformData.includes("Data explorer scope mismatch")) {
  failures.push("platformData.ts: scoped responses must be rejected when the server returns a different facility or explorer kind");
}
for (const validator of ["assertCopilotToolResult", "assertCopilotIntentDebugResult"]) {
  if (!copilotChat.includes(validator) || !copilotResponseSchemas.includes(`export function ${validator}`)) {
    failures.push(`copilot response boundary is missing ${validator}`);
  }
}
if (!copilotResponseSchemas.includes("value.rows.every") || !copilotResponseSchemas.includes("MAX_VISUAL_ROWS")) {
  failures.push("copilotResponseSchemas.ts: every bounded visual row must be validated before rendering");
}
if (!appUserProfile.includes("sanitizeStoredProfile(parsed, account)")) {
  failures.push("appUserProfile.ts: persisted profiles must pass exact account-scoped normalization");
}
if (!chatHistory.includes("sanitizeStoredThread") || chatHistory.includes("...message.meta,")) {
  failures.push("chatHistory.ts: persisted threads must be normalized without spreading untrusted message metadata");
}
if (
  !platformSnapshot.includes("assertPlatformSnapshotPayload(JSON.parse(raw)") ||
  !platformSnapshot.includes('assertPlatformSnapshotPayload(payload, "publish payload", { requireAsOfDate: true })')
) {
  failures.push("platform-snapshot.mjs: snapshot reads must be validated and snapshot writes must require governed as-of dates");
}
if (!snapshotStatus.includes("futureSkewHours") || !snapshotStatus.includes("futureDated")) {
  failures.push("snapshot-status.mjs: future-dated snapshots must be reported as stale");
}
for (const serverOnlyMarTable of [
  "mar_exception_detail_90d",
  "mar_prn_effectiveness_90d",
  "mar_medication_orders_current"
]) {
  if (!serverPlatformData.includes(`${serverOnlyMarTable}: _`)) {
    failures.push(`server/platform-data.mjs: ${serverOnlyMarTable} must remain server-only rather than entering the browser snapshot`);
  }
}

for (const retiredClientFetch of [
  "fetchCommunitiesOccupancy",
  "fetchPublishedReportCatalog",
  "fetchPublishedReportArtifact",
  "fetchAnalystQaStatus",
  "fetchPlatformBootstrap",
  "warmPlatformExperience",
  "hasWarmPlatformExperience"
]) {
  if (platformData.includes(retiredClientFetch)) {
    failures.push(`platformData.ts: retired browser fetch returned: ${retiredClientFetch}`);
  }
}

for (const retiredEndpoint of ["/api/census", "/api/communities/occupancy", "/api/reports/summary"]) {
  if (platformData.includes(retiredEndpoint) || devApi.includes(retiredEndpoint)) {
    failures.push(`retired endpoint returned: ${retiredEndpoint}`);
  }
}

for (const [label, source] of [["development", devApi], ["production", platformApi]]) {
  if (!source.includes("/api/platform/analyst-traces") || !source.includes("getAnalystTraceTelemetry")) {
    failures.push(`${label} API is missing analyst trace telemetry`);
  }
}

for (const helper of ["fetchJson", "fetchLiveJson"]) {
  const signature = new RegExp(`async function ${helper}<T>\\([^)]*validate\\?: ResponseValidator<T>`, "s");
  if (!signature.test(platformData)) {
    failures.push(`platformData.ts: ${helper} must accept a ResponseValidator<T>`);
  }
}

if (!platformData.includes("Ignored invalid warm cache entry")) {
  failures.push("platformData.ts: invalid warm-cache entries must be discarded before rendering");
}

for (const requiredAnalystTraceField of [
  "recoveryTurns",
  "staleTurns",
  "notLoadedTurns",
  "planRejectedTurns",
  "certifiedTurns",
  "uncertifiedTurns",
  "slowTurns",
  "previewedTurns",
  "qualityScoredTurns",
  "averageQualityScore",
  "lowQualityTurns",
  "performance",
  "volume",
  "families",
  "decisionFamilies",
  "qualityFlags",
  "moduleCoverage",
  "uncoveredAnalysisModules",
  "outcome",
  "plan",
  "decision",
  "canonicalPromptHash",
  "hasResidentScope",
  "quality"
]) {
  if (!schemas.includes(requiredAnalystTraceField)) {
    failures.push(`platformResponseSchemas.ts: analyst trace telemetry validator must cover ${requiredAnalystTraceField}`);
  }
}

const requiredRequestValidators = [
  "validateClaudeMessageRequest",
  "validateCopilotToolRequest",
  "validateCopilotIntentRequest",
  "validateSessionResetRequest"
];

for (const validator of requiredRequestValidators) {
  if (!requestSchemas.includes(`export function ${validator}`)) {
    failures.push(`http-request-schema.mjs: missing ${validator}`);
  }
  if (!devApi.includes(`readValidatedJsonRequest(req, ${validator})`)) {
    failures.push(`dev-api.mjs: ${validator} is not wired into its POST route`);
  }
  if (!chatApi.includes(`readValidatedJsonRequest(req, ${validator})`)) {
    failures.push(`api/chat.js: ${validator} is not wired into its production POST route`);
  }
}

if (!devApi.includes("sendApiError(res, error)")) {
  failures.push("dev-api.mjs: POST request validation failures must return JSON errors");
}

if (!requestBody.includes("DEFAULT_MAX_REQUEST_BODY_BYTES") || !requestBody.includes("typeof req.body === \"string\"")) {
  failures.push("server/http-body.mjs: shared request boundary must parse and limit raw or platform-provided JSON bodies");
}

const chatAuthPosition = chatApi.indexOf("await requireApiUser(req)");
const chatRoutePosition = chatApi.indexOf('pathname === "/api/chat/claude/health"');
if (chatAuthPosition < 0 || chatRoutePosition < 0 || chatAuthPosition > chatRoutePosition) {
  failures.push("api/chat.js: authentication must execute before any production chat route");
}

if (!chatApi.includes("sendApiError(res, error)")) {
  failures.push("api/chat.js: production chat validation failures must return JSON errors");
}

if (claudeCopilot.includes("readPlatformSnapshot().catch(() => null)")) {
  failures.push("server/claude-copilot.mjs: snapshot context failures must not be silently discarded");
}
if (!claudeCopilot.includes("readCopilotSnapshotContext()") || !claudeCopilot.includes("Platform snapshot context is unavailable")) {
  failures.push("server/claude-copilot.mjs: optional snapshot context must use an observable graceful fallback");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const { default: chatHandler } = await import("../api/chat.js");
const {
  getAcceptedEntraIssuers,
  isApiAuthRequired,
  requireApiUser
} = await import("../server/api-auth.mjs");
const { appendResponseVaryHeader, applyProtectedApiHeaders } = await import("../server/http-response.mjs");
const { sendClaudeCopilotMessage } = await import("../server/claude-copilot.mjs");
const {
  validateClaudeMessageRequest,
  validateCopilotToolRequest
} = await import("../server/http-request-schema.mjs");
const { createEmptyAnalysisFrame } = await import("../shared/analysis-session-state.mjs");
const { assertPlatformSnapshotPayload, getAzureSnapshotStorageSummary } = await import("../server/platform-snapshot.mjs");
const { getSnapshotFreshness, normalizeAnalystQaArtifact } = await import("../server/platform-data.mjs");

const validSnapshotFixture = {
  generated_at: "2026-06-24T12:00:00.000Z",
  snapshot: {
    version: "2026-06-24T12:00:00.000Z",
    generated_at: "2026-06-24T12:00:00.000Z",
    source: "boundary-test",
    as_of_date: "2026-06-24"
  },
  health: { ok: true },
  communities: {
    as_of_date: "2026-06-24",
    facilities: [{ facility_id: "337", community_name: "San Pablo" }],
    residents: [],
    incidents: [],
    census: []
  },
  incidents: { incidents: [] },
  reportsSummary: {}
};

assertPlatformSnapshotPayload(validSnapshotFixture, "boundary test");

const previousStorageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const previousStorageContainer = process.env.AZURE_STORAGE_CONTAINER;
const previousSnapshotRoot = process.env.SNAPSHOT_ROOT;
try {
  process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
  process.env.AZURE_STORAGE_CONTAINER = "platform-snapshots";
  process.env.SNAPSHOT_ROOT = "snapshots/daily";
  const storageSummary = getAzureSnapshotStorageSummary();
  if (
    storageSummary?.latestPath !== "snapshots/daily/latest.json" ||
    storageSummary?.datedPathPattern !== "snapshots/daily/YYYY-MM-DD.json"
  ) {
    console.error("platform snapshot storage summary requires a payload or returned invalid blob paths");
    process.exit(1);
  }
} finally {
  if (previousStorageConnectionString === undefined) delete process.env.AZURE_STORAGE_CONNECTION_STRING;
  else process.env.AZURE_STORAGE_CONNECTION_STRING = previousStorageConnectionString;
  if (previousStorageContainer === undefined) delete process.env.AZURE_STORAGE_CONTAINER;
  else process.env.AZURE_STORAGE_CONTAINER = previousStorageContainer;
  if (previousSnapshotRoot === undefined) delete process.env.SNAPSHOT_ROOT;
  else process.env.SNAPSHOT_ROOT = previousSnapshotRoot;
}

const snapshotWithoutAsOfDate = {
  ...validSnapshotFixture,
  snapshot: { ...validSnapshotFixture.snapshot, as_of_date: undefined },
  communities: { ...validSnapshotFixture.communities, as_of_date: undefined }
};
assertPlatformSnapshotPayload(snapshotWithoutAsOfDate, "backward-compatible read boundary");
let missingPublishAsOfRejected = false;
try {
  assertPlatformSnapshotPayload(snapshotWithoutAsOfDate, "publish boundary", { requireAsOfDate: true });
} catch {
  missingPublishAsOfRejected = true;
}
if (!missingPublishAsOfRejected) {
  console.error("platform snapshot publish boundary accepted a payload without governed as-of dates");
  process.exit(1);
}
for (const [label, payload] of [
  ["missing census rows", {
    ...validSnapshotFixture,
    communities: { ...validSnapshotFixture.communities, census: undefined }
  }],
  ["duplicate facility identifiers", {
    ...validSnapshotFixture,
    communities: {
      ...validSnapshotFixture.communities,
      facilities: [
        ...validSnapshotFixture.communities.facilities,
        { facility_id: "337", community_name: "Duplicate" }
      ]
    }
  }],
  ["non-object incident row", {
    ...validSnapshotFixture,
    incidents: { incidents: ["injected"] }
  }],
  ["invalid generated timestamp", {
    ...validSnapshotFixture,
    generated_at: "not-a-date",
    snapshot: { ...validSnapshotFixture.snapshot, generated_at: "not-a-date" }
  }],
  ["invalid data as-of date", {
    ...validSnapshotFixture,
    snapshot: { ...validSnapshotFixture.snapshot, as_of_date: "2026-02-31" },
    communities: { ...validSnapshotFixture.communities, as_of_date: "2026-02-31" }
  }],
  ["conflicting data as-of dates", {
    ...validSnapshotFixture,
    communities: { ...validSnapshotFixture.communities, as_of_date: "2026-06-23" }
  }]
]) {
  let rejected = false;
  try {
    assertPlatformSnapshotPayload(payload, "boundary test");
  } catch {
    rejected = true;
  }
  if (!rejected) {
    console.error(`platform snapshot validator accepted ${label}`);
    process.exit(1);
  }
}

const futureSnapshotFreshness = getSnapshotFreshness({
  snapshot: { generated_at: new Date(Date.now() + 60 * 60_000).toISOString() }
});
if (!futureSnapshotFreshness.stale || !/future/i.test(String(futureSnapshotFreshness.warning ?? ""))) {
  console.error("platform snapshot freshness accepted a future-dated publisher timestamp");
  process.exit(1);
}

if (normalizeAnalystQaArtifact([]) !== null) {
  console.error("analyst QA normalization accepted a non-object artifact root");
  process.exit(1);
}
const normalizedQaArtifact = normalizeAnalystQaArtifact({
  status: "pass",
  generatedAt: "not-a-date",
  history: "not-an-array",
  failures: [{ id: "failure" }],
  summary: { passed: 10, injected: { nested: true } }
});
if (
  normalizedQaArtifact?.generatedAt !== null ||
  normalizedQaArtifact?.history.length !== 0 ||
  normalizedQaArtifact?.failures.length !== 0 ||
  normalizedQaArtifact?.summary !== null
) {
  console.error("analyst QA normalization preserved malformed artifact fields");
  process.exit(1);
}

const validQaArtifact = normalizeAnalystQaArtifact({
  status: "warning",
  generatedAt: "2026-07-19T10:00:00.000Z",
  businessDate: "2026-07-19",
  summary: { total: 2, passed: 1, failed: 1, warnings: 0, certifiedCoverage: 2, cachedHits: 1, injected: true },
  history: [{
    generatedAt: "2026-07-18T10:00:00.000Z",
    businessDate: "2026-07-18",
    status: "pass",
    total: 2,
    passed: 2,
    failed: 0,
    injected: { nested: true }
  }],
  failures: [{
    id: "qa-failure",
    prompt: "show census",
    expectedTool: "census_trend",
    failures: ["wrong tool", { injected: true }],
    failureDetails: [
      { stage: "compiler", reason: "wrong tool", injected: true },
      { stage: "unsupported", reason: "must be removed" }
    ],
    expected: { periods: ["2026-06", { injected: true }], category: null, injected: true },
    actual: { tool: "community_profile", rowCount: 5, valid: false, validationErrors: ["wrong scope"], injected: true },
    injected: { nested: true }
  }]
});
if (
  validQaArtifact?.status !== "warning" ||
  validQaArtifact?.summary?.total !== 2 ||
  Object.hasOwn(validQaArtifact?.summary ?? {}, "injected") ||
  validQaArtifact?.history.length !== 1 ||
  Object.hasOwn(validQaArtifact?.history[0] ?? {}, "injected") ||
  validQaArtifact?.failures.length !== 1 ||
  validQaArtifact?.failures[0]?.failures.length !== 1 ||
  validQaArtifact?.failures[0]?.failureDetails.length !== 1 ||
  validQaArtifact?.failures[0]?.expected?.periods.length !== 1 ||
  Object.hasOwn(validQaArtifact?.failures[0] ?? {}, "injected")
) {
  console.error("analyst QA normalization did not preserve the allowlisted contract");
  process.exit(1);
}

if (!schemas.includes("validateAnalystQaStatusPayload(payload.analystQa")) {
  console.error("platform health response validation does not validate its nested analyst QA payload");
  process.exit(1);
}

const previousApiAuthRequired = process.env.API_AUTH_REQUIRED;
const previousNodeEnvironment = process.env.NODE_ENV;
const previousVercelEnvironment = process.env.VERCEL_ENV;

const issuerFixtureTenantId = "11111111-2222-3333-4444-555555555555";
const acceptedIssuerFixtures = getAcceptedEntraIssuers(issuerFixtureTenantId);
if (
  acceptedIssuerFixtures.length !== 2 ||
  !acceptedIssuerFixtures.includes(`https://login.microsoftonline.com/${issuerFixtureTenantId}/v2.0`) ||
  !acceptedIssuerFixtures.includes(`https://sts.windows.net/${issuerFixtureTenantId}/`)
) {
  console.error("server/api-auth.mjs must accept Entra v1 and v2 issuers for the configured tenant");
  process.exit(1);
}

try {
  process.env.NODE_ENV = "development";
  process.env.VERCEL_ENV = "production";
  process.env.API_AUTH_REQUIRED = "false";
  if (!isApiAuthRequired()) {
    console.error("server/api-auth.mjs allowed API_AUTH_REQUIRED=false to disable production authentication");
    process.exit(1);
  }

  process.env.VERCEL_ENV = "preview";
  if (!isApiAuthRequired()) {
    console.error("server/api-auth.mjs allowed API_AUTH_REQUIRED=false to disable preview authentication");
    process.exit(1);
  }

  process.env.VERCEL_ENV = "development";
  process.env.NODE_ENV = "production";
  if (!isApiAuthRequired()) {
    console.error("server/api-auth.mjs allowed API_AUTH_REQUIRED=false to disable a production Node runtime");
    process.exit(1);
  }
} finally {
  if (previousApiAuthRequired === undefined) delete process.env.API_AUTH_REQUIRED;
  else process.env.API_AUTH_REQUIRED = previousApiAuthRequired;
  if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnvironment;
  if (previousVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = previousVercelEnvironment;
}

process.env.API_AUTH_REQUIRED = "true";
let missingTokenError = null;
try {
  await requireApiUser({ headers: {} });
} catch (error) {
  missingTokenError = error;
}
if (previousApiAuthRequired === undefined) delete process.env.API_AUTH_REQUIRED;
else process.env.API_AUTH_REQUIRED = previousApiAuthRequired;
if (missingTokenError?.statusCode !== 401 || missingTokenError?.code !== "api_auth_required") {
  console.error("server/api-auth.mjs did not fail closed when a required bearer token was absent");
  process.exit(1);
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    getHeader(name) {
      return this.headers[name];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

const varyResponse = createMockResponse();
applyProtectedApiHeaders(varyResponse);
appendResponseVaryHeader(varyResponse, "Origin");
const protectedVaryValues = String(varyResponse.headers.Vary ?? "")
  .split(",")
  .map((value) => value.trim().toLowerCase());
if (!protectedVaryValues.includes("authorization") || !protectedVaryValues.includes("origin")) {
  console.error("protected response Vary headers did not preserve both Authorization and Origin");
  process.exit(1);
}

const [
  { default: analyticsSummaryHandler },
  { default: communitiesHandler },
  { default: dataExplorerHandler },
  { default: homeDashboardHandler },
  { default: incidentsHandler },
  { default: platformHandler }
] = await Promise.all([
  import("../api/analytics-summary.js"),
  import("../api/communities.js"),
  import("../api/data-explorer.js"),
  import("../api/home-dashboard.js"),
  import("../api/incidents.js"),
  import("../api/platform.js")
]);

const protectedHandlerCases = [
  ["analytics-summary", analyticsSummaryHandler, "/api/analytics-summary"],
  ["chat", chatHandler, "/api/chat/claude/health"],
  ["communities", communitiesHandler, "/api/communities/dashboard"],
  ["data-explorer", dataExplorerHandler, "/api/data-explorer?kind=incidents"],
  ["home-dashboard", homeDashboardHandler, "/api/home-dashboard"],
  ["incidents", incidentsHandler, "/api/incidents"],
  ["platform", platformHandler, "/api/platform/health"]
];

process.env.API_AUTH_REQUIRED = "true";
for (const [label, protectedHandler, url] of protectedHandlerCases) {
  const response = createMockResponse();
  await protectedHandler({ method: "GET", url, headers: {} }, response);
  if (response.statusCode !== 401 || response.payload?.code !== "api_auth_required") {
    console.error(`${label} handler did not reject an anonymous production request before route execution`);
    process.exit(1);
  }
  if (
    !String(response.headers["Cache-Control"] ?? "").includes("private, no-store") ||
    !String(response.headers.Vary ?? "").includes("Authorization") ||
    response.headers["X-Content-Type-Options"] !== "nosniff"
  ) {
    console.error(`${label} handler did not apply protected response headers`);
    process.exit(1);
  }
}
if (previousApiAuthRequired === undefined) delete process.env.API_AUTH_REQUIRED;
else process.env.API_AUTH_REQUIRED = previousApiAuthRequired;

for (const [label, protectedHandler] of [
  ["chat", chatHandler],
  ["communities", communitiesHandler],
  ["incidents", incidentsHandler],
  ["platform", platformHandler]
]) {
  const response = createMockResponse();
  await protectedHandler({ method: "GET", url: "http://[", headers: {} }, response);
  if (response.statusCode !== 400 || response.payload?.code !== "request_url_invalid") {
    console.error(`${label} handler did not return a controlled 400 for a malformed request URL`);
    process.exit(1);
  }
}

const missingFacilityResponse = createMockResponse();
await communitiesHandler(
  { method: "GET", url: "/api/communities/snapshot", headers: {} },
  missingFacilityResponse
);
if (
  missingFacilityResponse.statusCode !== 400 ||
  missingFacilityResponse.payload?.code !== "facility_id_required" ||
  missingFacilityResponse.payload?.error !== "Missing facilityId."
) {
  console.error("api/communities.js did not return the controlled missing-facility contract");
  process.exit(1);
}

for (const [label, body, expectedStatus] of [
  ["malformed JSON", "{", 400],
  ["oversized parsed body", { content: "x".repeat(1_000_001) }, 413]
]) {
  const response = createMockResponse();
  await chatHandler({ method: "POST", url: "/api/chat/tools", body }, response);
  if (response.statusCode !== expectedStatus) {
    console.error(`api/chat.js ${label} boundary returned ${response.statusCode}; expected ${expectedStatus}`);
    process.exit(1);
  }
}

for (const [label, validate] of [
  ["Claude", validateClaudeMessageRequest],
  ["tool", validateCopilotToolRequest]
]) {
  const validated = validate({ content: "incidents", unexpectedServerControl: "injected" });
  if (Object.prototype.hasOwnProperty.call(validated, "unexpectedServerControl")) {
    console.error(`${label} request validator preserved an unknown field`);
    process.exit(1);
  }
}

for (const [label, analysisFrame] of [
  ["missing required fields", { version: "1.0", revision: 0, periods: [], fields: [] }],
  ["invalid revision", { ...createEmptyAnalysisFrame(), revision: -1 }],
  ["oversized period set", { ...createEmptyAnalysisFrame(), periods: Array.from({ length: 601 }, () => "2026-06") }],
  ["non-string field", { ...createEmptyAnalysisFrame(), fields: ["resident", { injected: true }] }]
]) {
  let validationError = null;
  try {
    validateCopilotToolRequest({ content: "incidents", analysisFrame });
  } catch (error) {
    validationError = error;
  }
  if (validationError?.statusCode !== 400) {
    console.error(`tool request validator accepted ${label} analysis frame`);
    process.exit(1);
  }
}

const sanitizedFrame = validateCopilotToolRequest({
  content: "incidents",
  analysisFrame: {
    ...createEmptyAnalysisFrame(),
    metric: "incidents",
    unexpectedServerControl: "injected"
  }
}).analysisFrame;
if (Object.prototype.hasOwnProperty.call(sanitizedFrame, "unexpectedServerControl")) {
  console.error("tool request validator preserved an unknown analysis frame field");
  process.exit(1);
}

const sharedThreadId = `cross-user-thread-${Date.now()}`;
const ownerAThread = await sendClaudeCopilotMessage({
  content: "how many AWOL incidents in May 2026 total",
  threadId: sharedThreadId,
  sessionOwnerKey: "boundary-user-a"
});
const ownerBThread = await sendClaudeCopilotMessage({
  content: "how many clients at San Pablo in January 2026",
  threadId: sharedThreadId,
  sessionOwnerKey: "boundary-user-b"
});
if (
  ownerAThread.messages.length !== 2 ||
  ownerBThread.messages.length !== 2 ||
  ownerBThread.messages.some((message) => /AWOL incidents in May/i.test(message.text ?? ""))
) {
  console.error("Claude thread memory crossed authenticated user boundaries");
  process.exit(1);
}

let boundedThread = ownerAThread;
for (let index = 0; index < 6; index += 1) {
  boundedThread = await sendClaudeCopilotMessage({
    content: "how many AWOL incidents in May 2026 total",
    threadId: sharedThreadId,
    sessionOwnerKey: "boundary-user-a"
  });
}
if (boundedThread.messages.length > 10) {
  console.error(`Claude thread retained ${boundedThread.messages.length} messages; expected at most 10`);
  process.exit(1);
}

function assertExplorerPayload(payload, expectedKind, requiredRowKeys) {
  if (
    payload?.kind !== expectedKind ||
    !Array.isArray(payload?.columns) ||
    !Array.isArray(payload?.rows) ||
    Number(payload?.row_count ?? 0) <= 0 ||
    payload.rows.length <= 0
  ) {
    return `expected a non-empty ${expectedKind} explorer payload`;
  }

  const firstRow = payload.rows[0] ?? {};
  const missingKeys = requiredRowKeys.filter((key) => !(key in firstRow));
  if (missingKeys.length) return `${expectedKind} explorer row missing keys: ${missingKeys.join(", ")}`;

  return null;
}

const explorerCases = [
  ["incidents", ["id", "incident_date", "month_bucket", "community_name", "resident_name", "category", "incident_type", "description"]],
  ["residents", [
    "id",
    "resident_name",
    "community_name",
    "unit",
    "age",
    "los_days",
    "primary_diagnosis",
    "active_medication_count",
    "mar_compliance_pct_30d",
    "last_mar_recorded_date"
  ]],
  ["census", ["id", "month_bucket", "community_name", "census"]]
];

for (const [kind, requiredRowKeys] of explorerCases) {
  const explorerResponse = createMockResponse();
  await dataExplorerHandler(
    {
      method: "GET",
      url: `/api/data-explorer?kind=${kind}`
    },
    explorerResponse
  );

  const failure = explorerResponse.statusCode === 200
    ? assertExplorerPayload(explorerResponse.payload, kind, requiredRowKeys)
    : `expected HTTP 200 and received ${explorerResponse.statusCode}`;

  if (failure) {
    console.error(JSON.stringify({
      failure: `api/data-explorer.js ${kind} smoke test failed: ${failure}`,
      statusCode: explorerResponse.statusCode,
      payload: explorerResponse.payload
    }, null, 2));
    process.exit(1);
  }
}

const toolResponse = createMockResponse();
await chatHandler(
  {
    method: "POST",
    url: "/api/chat/tools",
    body: JSON.stringify({
      content: "incidents san pablo january",
      sessionId: `api-boundary-${Date.now()}`
    })
  },
  toolResponse
);

if (
  toolResponse.statusCode !== 200 ||
  toolResponse.payload?.handled !== true ||
  toolResponse.payload?.tool !== "incident_breakdown" ||
  toolResponse.payload?.trace?.facilityId !== "337" ||
  toolResponse.payload?.trace?.period !== "2026-01" ||
  Number(toolResponse.payload?.trace?.rowCount ?? 0) <= 0
) {
  console.error(JSON.stringify({
    failure: "api/chat.js production tool handler did not answer a raw-body incident prompt",
    statusCode: toolResponse.statusCode,
    payload: toolResponse.payload
  }, null, 2));
  process.exit(1);
}

const deterministicClaudeResponse = createMockResponse();
await chatHandler(
  {
    method: "POST",
    url: "/api/chat/claude/message",
    body: JSON.stringify({
      content: "how many people went AWOL in May 2026",
      threadId: `api-deterministic-guard-${Date.now()}`,
      forceClaude: true
    })
  },
  deterministicClaudeResponse
);

const deterministicAssistant = deterministicClaudeResponse.payload?.messages?.at(-1);
if (
  deterministicClaudeResponse.statusCode !== 200 ||
  deterministicClaudeResponse.payload?.provider !== "deterministic-tools" ||
  deterministicAssistant?.meta?.model !== "deterministic-tools" ||
  deterministicAssistant?.meta?.deterministicGuard !== true ||
  deterministicAssistant?.meta?.certifiedQuestion?.id !== "incident-unique-people-count" ||
  /Claude request failed|Anthropic|not configured/i.test(String(deterministicAssistant?.text ?? ""))
) {
  console.error(JSON.stringify({
    failure: "api/chat.js Claude route allowed deterministic certified prompt to bypass local tools",
    statusCode: deterministicClaudeResponse.statusCode,
    payload: deterministicClaudeResponse.payload
  }, null, 2));
  process.exit(1);
}

console.log(`platform API boundary checks passed (${requiredSchemaValidators.length} response schemas, ${liveClientValidators.length} live client validators, ${requiredRequestValidators.length} allowlisting request validators, ${protectedHandlerCases.length} authenticated and private handler smoke tests, request-size and JSON guards, deployment security headers and chat rewrites, cross-user and bounded Claude memory, ${explorerCases.length} data explorer smoke tests, production chat raw-body tool smoke test, deterministic Claude guard smoke test)`);
