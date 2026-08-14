import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`Reports page check failed: ${message}`);
}

const appSource = read("src/app/App.tsx");
const shellSource = read("src/shared/layout/ProtectedAppShell.tsx");
const reportsSource = read("src/features/reports/pages/ReportsPage.tsx");
const reportCatalogSource = read("shared/full-report.mjs");
const workspaceSource = read("src/features/home/pages/WorkspaceHomePage.tsx");
const californiaSource = read("src/features/california/pages/CaliforniaHomePage.tsx");

assert(
  appSource.includes('path="/" element={withRouteBoundary(<CaliforniaHomePage />)}') &&
    appSource.includes('path="/analytics" element={withRouteBoundary(<CaliforniaHomePage />)}') &&
    appSource.includes('path="/reports" element={withRouteBoundary(<CaliforniaHomePage />)}') &&
    !appSource.includes('<Route path="analytics" />') &&
    !appSource.includes('<Route path="reports" />'),
  "the canonical Analytics route and legacy reports route must render the persistent California workspace carousel without empty leaf routes"
);
assert(
  shellSource.includes('location.pathname.startsWith("/analytics")') &&
    shellSource.includes('location.pathname.startsWith("/reports")') &&
    shellSource.includes("isCaliforniaExperience"),
  "Analytics must use the header-free California workspace shell"
);
assert(
  reportsSource.includes("fetchHomeDashboard") &&
    reportsSource.includes("fetchFullReportDefinitions") &&
    !reportsSource.includes("fetchAnalyticsSummary") &&
    reportsSource.includes("createFullReport"),
  "reports must load both their catalog and documents from the governed report service"
);
assert(
    reportsSource.includes("<FullReportReader") &&
    reportsSource.includes('aria-label="Report period"') &&
    reportsSource.includes('aria-label="Report community"') &&
    reportsSource.includes('aria-label="Report audience"') &&
    reportsSource.includes("retryReport") &&
    reportsSource.includes('role="alert"'),
  "reports must render the governed report document with scope, period, and audience controls and a recoverable error state"
);
assert(
  reportsSource.includes('data-reports-page="true"'),
  "reports must expose a stable page marker"
);
assert(
  !reportsSource.includes("Deeper operating analysis.") &&
    !reportsSource.includes("6 report families") &&
    reportsSource.includes("Choose an analysis to review.") &&
    />\s*Analytics\s*</.test(reportsSource) &&
    reportsSource.includes('aria-label="Analytics"'),
  "Analytics must open directly into the streamlined analysis picker"
);
assert(
  !reportsSource.includes("REPORT_FAMILIES") &&
    reportsSource.includes("definitionValue.reports") &&
    reportsSource.includes("report.showInAnalyticsNav") &&
    reportsSource.includes('useState<FullReportId>("overview")'),
  "the report library must use the server-owned visibility contract and open on Portfolio overview"
);
assert(
  /id:\s*"effectiveness"[\s\S]*?showInAnalyticsNav:\s*false/.test(reportCatalogSource),
  "Analytics must keep the unfinished effectiveness report out of navigation"
);
assert(
  !reportsSource.includes("Export PDF") &&
    !reportsSource.includes("Download HTML") &&
    !read("src/features/reports/components/FullReportReader.tsx").includes("Export PDF") &&
    !read("src/features/reports/components/FullReportReader.tsx").includes("Download HTML") &&
    !read("src/features/reports/components/FullReportReader.tsx").includes("data-report-export-pdf"),
  "Analytics must not expose retired report export actions"
);
assert(
  !reportsSource.includes("<Link") &&
    !reportsSource.includes("<a "),
  "reports must not add ungoverned navigation buttons or links"
);
assert(
  /<ReportsPage embedded active=\{activePanel === "reports"\} \/>/.test(californiaSource) &&
    reportsSource.includes("if (!active) return") &&
    reportsSource.includes('data-reports-embedded={embedded ? "true" : "false"}') &&
    reportsSource.includes('data-analytics-page="true"') &&
    californiaSource.includes('data-california-hero-action="analytics"') &&
    californiaSource.includes("<span>Analytics</span>"),
  "Analytics must be available as a governed home surface without loading reports behind the inactive map"
);
assert(
  appSource.includes('<Route path="/fiftystate" element={withRouteBoundary(<FiftyStatePage />)} />') &&
    !appSource.includes('path="reports/fiftystate"') &&
    !reportsSource.includes("<FiftyStatePage") &&
    !reportsSource.includes("/fiftystate") &&
    !reportsSource.includes("50-state targeting atlas"),
  "the 50-state atlas must retain its standalone route without appearing in Analytics navigation"
);
assert(
  !workspaceSource.includes("<ChatHistoryMenu"),
  "the analyst workspace must not expose the retired History menu"
);

console.log("Analytics page check passed: five finished visible reports, unfinished effectiveness and duplicate community reports hidden, standalone /fiftystate route retained, and no visible History menu.");
