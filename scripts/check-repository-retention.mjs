import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const rootFiles = new Set([
  ".env.example",
  ".gitignore",
  "AGENTS.md",
  "README.md",
  "eslint.config.js",
  "index.html",
  "knip.json",
  "package-lock.json",
  "package.json",
  "postcss.config.cjs",
  "tailwind.config.js",
  "tsconfig.json",
  "tsconfig.server.json",
  "vercel.json",
  "vite.config.ts"
]);

const platformDocs = [
  "docs/platform/README.md",
  "docs/platform/analyst-system.md",
  "docs/platform/architecture.md",
  "docs/platform/data-publishing.md",
  "docs/platform/deployment-operations.md",
  "docs/platform/full-reporting.md",
  "docs/platform/integration-platform.md",
  "docs/platform/product-surfaces.md",
  "docs/platform/repository-ownership.md",
  "docs/platform/ship-checklist.md",
  "docs/platform/testing-quality.md",
  "docs/platform/user-journeys.md"
];

const referenceDocs = [
  "docs/reference/alamo-platform-complete-data-strategy-map-2026-08-03.md",
  "docs/reference/analysis-session-state-spec.md",
  "docs/reference/analytics-tool-context-views.md",
  "docs/reference/mar-source-inventory-findings.md",
  "docs/reference/platform-daily-publish-runbook.md",
  "docs/reference/platform-module-registry-spec.md"
];

const approvedDocs = new Set(["AGENTS.md", "README.md", ...platformDocs, ...referenceDocs]);
const approvedApiFiles = new Set([
  "api/analytics-summary.js",
  "api/chat.js",
  "api/communities.js",
  "api/data-explorer.js",
  "api/home-dashboard.js",
  "api/incidents.js",
  "api/not-found.js",
  "api/platform.js",
  "api/reports.js"
]);
const approvedWorkflowFiles = new Set([
  "databricks/workflows/daily_platform_publish.json",
  "databricks/workflows/daily_snapshot_refresh.json"
]);
const manualDatabricksDiagnostics = new Set([
  "databricks/notebooks/census_fast_check.py",
  "databricks/notebooks/eldermark_census_rebuild.py",
  "databricks/notebooks/gold_view_schema_repair.py",
  "databricks/notebooks/mar_source_inventory.py",
  "databricks/notebooks/overview_report_extract.py"
]);

const ignoredPhysicalDirs = new Set([".auth", ".git", ".vercel", "dist", "generated", "node_modules"]);
const rejectedPathParts = [
  /^docs\/code-bible\//,
  /^public\/strategy\//,
  /^src\/features\/briefings\//,
  /^src\/features\/(admin|demo|strategy|suite|workflow|workforce)\//,
  /^src\/mobile\//,
  /^api\/debug\//,
  /^api\/census\.js$/,
  /^api\/reports\//,
  /^databricks\/notebooks\/(?:report_publish|report_analysis_publish|briefing_publish)\.py$/
];

const requiredEnvironmentVariables = [
  "ALLOW_DATABRICKS_PAT_IN_DEV",
  "ALLOW_DETERMINISTIC_CLAUDE_OVERRIDE",
  "ANALYST_TRACE_MAX_RECORDS",
  "ANALYST_TRACE_SLOW_MS",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MAX_TOKENS",
  "ANTHROPIC_MODEL",
  "API_AUTH_REQUIRED",
  "API_PORT",
  "AZURE_STORAGE_ACCOUNT",
  "AZURE_STORAGE_CONNECTION_STRING",
  "AZURE_STORAGE_CONTAINER",
  "CERTIFIED_ANSWER_CACHE_ENABLED",
  "COPILOT_ASSISTANT_LABEL",
  "DATABRICKS_CATALOG",
  "DATABRICKS_CLIENT_ID",
  "DATABRICKS_CLIENT_SECRET",
  "DATABRICKS_HOST",
  "DATABRICKS_HTTP_PATH",
  "DATABRICKS_SCHEMA",
  "DATABRICKS_SQL_WAREHOUSE_ID",
  "DATABRICKS_TOKEN",
  "ENTRA_CLIENT_ID",
  "ENTRA_CLIENT_SECRET",
  "ENTRA_TENANT_ID",
  "ENTRA_API_AUDIENCE",
  "ENTRA_API_SCOPE",
  "PLATFORM_SNAPSHOT_ALLOW_EMPTY_TOOL_CONTEXT",
  "PLATFORM_SNAPSHOT_CACHE_TTL_MS",
  "PLATFORM_SNAPSHOT_MAX_AGE_HOURS",
  "PLATFORM_SNAPSHOT_MAX_BYTES",
  "PLATFORM_SNAPSHOT_READ_SOURCE",
  "PLATFORM_SNAPSHOT_REQUIRED",
  "PIPELINE_CLINICAL_API_MAX_RESPONSE_BYTES",
  "PIPELINE_CLINICAL_API_ROLE",
  "PIPELINE_CLINICAL_API_SCOPE",
  "PIPELINE_CLINICAL_SNAPSHOT_MAX_AGE_HOURS",
  "SNAPSHOT_ROOT",
  "VITE_API_PROXY_TARGET",
  "VITE_API_AUTH_REQUIRED",
  "VITE_E2E_AUTH_BYPASS",
  "VITE_ENTRA_CLIENT_ID",
  "VITE_ENTRA_API_SCOPE",
  "VITE_ENTRA_TENANT_ID",
  "VITE_PIPELINE_APP_URL"
];

const rejectedEnvironmentVariables = [
  "ENTRA_GROUP_ADMINS",
  "ENTRA_GROUP_ANALYSTS",
  "ENTRA_GROUP_READERS",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "VITE_DATABRICKS_DOCS_SEARCH_URL",
  "VITE_DATABRICKS_PIPELINE_URL"
];

function projectFiles() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: appRoot, encoding: "utf8" }
  );
  return output
    .split("\0")
    .filter(Boolean)
    .filter((file) => existsSync(path.join(appRoot, file)))
    .sort();
}

function ownershipClass(file) {
  if (rootFiles.has(file)) return "app shell and tooling";
  if (approvedDocs.has(file)) return file.startsWith("docs/reference/") ? "live specification" : "handbook";
  if (/^src\/.+\.(?:ts|tsx|css|json)$/.test(file)) return "browser runtime";
  if (/^public\/.+\.(?:svg|png|jpg|jpeg|webp|ico)$/.test(file)) return "static browser asset";
  if (/^api\/.+\.js$/.test(file)) return "Vercel API";
  if (/^server\/.+\.mjs$/.test(file)) return "server domain";
  if (/^shared\/.+\.(?:mjs|d\.mts)$/.test(file)) return "shared contract";
  if (/^scripts\/.+\.(?:mjs|json)$/.test(file)) return "verification";
  if (/^databricks\/notebooks\/.+\.py$/.test(file)) return "data publishing notebook";
  if (/^databricks\/workflows\/.+\.json$/.test(file)) return "data publishing workflow";
  return null;
}

function walkPhysical(directory, prefix = "") {
  const rows = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (ignoredPhysicalDirs.has(entry.name)) continue;
      rows.push(...walkPhysical(path.join(directory, entry.name), relative));
      continue;
    }
    rows.push(relative);
  }
  return rows;
}

const files = projectFiles();
const failures = [];

for (const file of files) {
  if (!ownershipClass(file)) failures.push(`${file}: no repository ownership class`);
  if (rejectedPathParts.some((pattern) => pattern.test(file))) {
    failures.push(`${file}: retired or production-debug path is not allowed`);
  }
}

for (const file of files.filter((candidate) => /^api\/.+\.js$/.test(candidate))) {
  if (!approvedApiFiles.has(file)) failures.push(`${file}: Vercel API is not in the production endpoint allowlist`);
}
for (const file of approvedApiFiles) {
  if (!files.includes(file)) failures.push(`${file}: approved Vercel API is missing`);
}
for (const file of files.filter((candidate) => /^databricks\/workflows\/.+\.json$/.test(candidate))) {
  if (!approvedWorkflowFiles.has(file)) failures.push(`${file}: Databricks workflow is not in the production workflow allowlist`);
}
for (const file of approvedWorkflowFiles) {
  if (!files.includes(file)) failures.push(`${file}: approved Databricks workflow is missing`);
}

const markdownFiles = files.filter((file) => file.endsWith(".md"));
for (const file of markdownFiles) {
  if (!approvedDocs.has(file)) failures.push(`${file}: Markdown is not in the active documentation allowlist`);
}
for (const file of approvedDocs) {
  if (!files.includes(file)) failures.push(`${file}: approved documentation file is missing`);
}

const docMap = ["AGENTS.md", "README.md", "docs/platform/README.md", "docs/platform/repository-ownership.md"]
  .map((file) => readFileSync(path.join(appRoot, file), "utf8"))
  .join("\n");
for (const file of [...platformDocs, ...referenceDocs]) {
  if (file === "docs/platform/README.md" || file === "docs/platform/repository-ownership.md") continue;
  if (!docMap.includes(file)) failures.push(`${file}: retained doc is not linked from the repository map`);
}

const packageSource = readFileSync(path.join(appRoot, "package.json"), "utf8");
const environmentTemplate = readFileSync(path.join(appRoot, ".env.example"), "utf8");
for (const variable of requiredEnvironmentVariables) {
  if (!new RegExp(`^${variable}=`, "m").test(environmentTemplate)) {
    failures.push(`.env.example: missing runtime variable ${variable}`);
  }
}
for (const variable of rejectedEnvironmentVariables) {
  if (new RegExp(`^${variable}=`, "m").test(environmentTemplate)) {
    failures.push(`.env.example: retired variable returned: ${variable}`);
  }
}
const scriptFiles = files.filter((file) => /^scripts\/.+\.mjs$/.test(file));
const scriptSources = new Map(
  scriptFiles.map((file) => [file, readFileSync(path.join(appRoot, file), "utf8")])
);
for (const file of scriptFiles) {
  const basename = path.basename(file);
  const importedByAnotherScript = [...scriptSources].some(
    ([candidate, source]) => candidate !== file && source.includes(basename)
  );
  if (!packageSource.includes(basename) && !importedByAnotherScript) {
    failures.push(`${file}: QA script is neither package-invoked nor imported`);
  }
}

for (const file of files.filter((candidate) => candidate.endsWith(".d.mts"))) {
  const runtimeFile = file.replace(/\.d\.mts$/, ".mjs");
  if (!files.includes(runtimeFile)) failures.push(`${file}: declaration has no matching runtime module`);
}

const workflowNotebookNames = new Set();
for (const workflowFile of files.filter((file) => /^databricks\/workflows\/.+\.json$/.test(file))) {
  const workflow = JSON.parse(readFileSync(path.join(appRoot, workflowFile), "utf8"));
  for (const task of workflow.tasks ?? []) {
    const notebookPath = task.notebook_task?.notebook_path;
    if (notebookPath) workflowNotebookNames.add(path.basename(notebookPath));
  }
}
for (const file of files.filter((candidate) => /^databricks\/notebooks\/.+\.py$/.test(candidate))) {
  const notebookName = path.basename(file, ".py");
  if (!workflowNotebookNames.has(notebookName) && !manualDatabricksDiagnostics.has(file)) {
    failures.push(`${file}: notebook is neither workflow-owned nor an approved diagnostic`);
  }
}

for (const file of walkPhysical(appRoot)) {
  if (file.endsWith("/.DS_Store") || file === ".DS_Store" || file.includes("/__pycache__/") || file.endsWith(".pyc")) {
    failures.push(`${file}: generated cache debris must be removed`);
  }
  if (/\.(?:bak|orig|rej|swp|tmp)$/.test(file)) failures.push(`${file}: backup or temporary file must be removed`);
}

if (process.platform !== "win32") {
  const sensitiveLocalFiles = [
    ".env",
    ...(existsSync(path.join(appRoot, ".auth"))
      ? readdirSync(path.join(appRoot, ".auth"))
          .filter((file) => file.endsWith(".json"))
          .map((file) => `.auth/${file}`)
      : [])
  ];
  for (const file of sensitiveLocalFiles) {
    const absolutePath = path.join(appRoot, file);
    if (!existsSync(absolutePath)) continue;
    const permissions = statSync(absolutePath).mode & 0o777;
    if ((permissions & 0o077) !== 0) {
      failures.push(`${file}: sensitive local file must be owner-readable only (chmod 600)`);
    }
  }
}

if (failures.length) {
  console.error("Repository retention check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const ownershipCounts = new Map();
for (const file of files) {
  const owner = ownershipClass(file);
  ownershipCounts.set(owner, (ownershipCounts.get(owner) ?? 0) + 1);
}

console.log(`Repository retention check passed for ${files.length} project files.`);
for (const [owner, count] of [...ownershipCounts].sort(([left], [right]) => left.localeCompare(right))) {
  console.log(`- ${owner}: ${count}`);
}
