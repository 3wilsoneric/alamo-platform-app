/** @typedef {import("./platform-module-registry.d.mts").PlatformModuleDefinition} PlatformModuleDefinition */

/** @type {PlatformModuleDefinition[]} */
const surfaceModules = [
  {
    id: "communities-overview",
    kind: "surface",
    family: "communities",
    title: "Communities Overview",
    eyebrow: "Census + community trends",
    description: "Portfolio census, movement, medication, diagnosis, and community drilldowns.",
    aliases: ["communities overview", "community overview", "communities page", "portfolio communities", "community trend module", "community trends module", "community trend", "community trends"],
    scopes: ["portfolio"],
    data: ["facility directory", "monthly census", "monthly incidents", "resident roster", "medication summary"],
    capabilities: ["drilldown", "pin", "surface"],
    canvasId: "communities",
    icon: "building",
    route: "/communities"
  },
  {
    id: "community-detail",
    kind: "surface",
    family: "communities",
    title: "Community Detail",
    eyebrow: "Focused community",
    description: "A selected community's census, incidents, residents, and drilldowns.",
    aliases: ["community detail", "community profile page", "community page", "facility detail"],
    scopes: ["portfolio", "community"],
    data: ["community snapshot", "monthly census", "monthly incidents", "resident roster"],
    capabilities: ["drilldown", "pin", "surface"],
    canvasId: "communityDetail",
    icon: "building",
    route: "/communities/:facilityId"
  },
  {
    id: "resident-census-search",
    kind: "surface",
    family: "residents",
    title: "Resident Search",
    eyebrow: "Resident directory",
    description: "Find a current resident and open one complete profile card.",
    aliases: ["search census", "census search", "resident search", "resident census search", "search residents", "resident search module", "search resident module", "resident directory", "find a resident", "find resident"],
    scopes: ["community"],
    data: ["current resident roster", "resident incident detail"],
    capabilities: ["search", "resident drilldown", "community selector", "surface"],
    canvasId: "residentSearch",
    icon: "building",
    focus: "search",
    route: "/communities/:facilityId?focus=search"
  },
  {
    id: "community-census",
    kind: "surface",
    family: "census",
    title: "Community Census",
    eyebrow: "Focused census",
    description: "Monthly census history for one community.",
    aliases: ["community census module", "census datasheet", "community census", "census detail"],
    scopes: ["community"],
    data: ["monthly census"],
    capabilities: ["table", "community selector", "surface"],
    canvasId: "communityDetail",
    icon: "chart",
    focus: "census",
    route: "/communities/:facilityId?focus=census"
  },
  {
    id: "community-incidents",
    kind: "surface",
    family: "incidents",
    title: "Community Incidents",
    eyebrow: "Focused incidents",
    description: "Incident volume, category detail, and event history for one community.",
    aliases: ["community incidents module", "incident datasheet", "community incidents", "incident detail module"],
    scopes: ["community"],
    data: ["monthly incident categories", "incident detail"],
    capabilities: ["trend", "category drilldown", "resident drilldown", "surface"],
    canvasId: "communityDetail",
    icon: "siren",
    focus: "incidents",
    route: "/communities/:facilityId?focus=incidents"
  },
  {
    id: "community-residents",
    kind: "surface",
    family: "residents",
    title: "Community Residents",
    eyebrow: "Focused residents",
    description: "Current residents and length-of-stay detail for one community.",
    aliases: ["community residents module", "resident roster", "community roster", "longest stay residents"],
    scopes: ["community"],
    data: ["current resident roster"],
    capabilities: ["resident drilldown", "surface"],
    canvasId: "communityDetail",
    icon: "building",
    focus: "residents",
    route: "/communities/:facilityId?focus=residents"
  },
  {
    id: "incident-center",
    kind: "surface",
    family: "incidents",
    title: "Incident Center",
    eyebrow: "Incident review",
    description: "Portfolio incident triage, category drilldowns, resident history, and event detail.",
    aliases: ["incident center", "incidents page", "incident screen", "incident workspace", "incidents module", "incident module", "incident search", "search incidents", "incident archive", "incident history search"],
    scopes: ["portfolio", "community", "resident"],
    data: ["incident stream", "incident detail", "resident roster"],
    capabilities: ["search", "filter", "resident drilldown", "event drilldown", "surface"],
    canvasId: "incidents",
    icon: "siren",
    route: "/incidents"
  },
  {
    id: "data-explorer",
    kind: "surface",
    family: "support",
    title: "Data Explorer",
    eyebrow: "Full-screen row search",
    description: "Full-screen governed search for incidents, census, and residents with CSV and Excel export.",
    aliases: ["__internal_data_explorer__"],
    scopes: ["portfolio", "community", "resident"],
    data: ["incident detail", "monthly census", "resident roster"],
    capabilities: ["search", "filter", "export", "full-screen"],
    canvasId: "dataExplorer",
    icon: "chart",
    route: "/explorer/incidents"
  },
  {
    id: "glossary",
    kind: "surface",
    family: "support",
    title: "Glossary",
    eyebrow: "Data dictionary",
    description: "Definitions for platform measures and operating terms.",
    aliases: ["glossary", "data glossary", "definitions", "data dictionary"],
    scopes: ["portfolio"],
    data: ["platform definitions"],
    capabilities: ["search", "surface"],
    canvasId: "glossary",
    icon: "report",
    route: "/glossary"
  },
  {
    id: "command-center",
    kind: "surface",
    family: "support",
    title: "Command Center",
    eyebrow: "System view",
    description: "System health and platform controls.",
    aliases: ["command center", "system health", "admin screen"],
    scopes: ["portfolio"],
    data: ["platform health"],
    capabilities: ["surface"],
    canvasId: "command",
    icon: "chart",
    route: "/command-center"
  }
];

/** @type {ReadonlyArray<readonly [string, string, string, string, readonly string[]]>} */
const analysisModuleDefinitions = [
  ["community-profile", "Community Profile", "community_profile", "summary_card", ["community profile", "community topline", "community overview", "how is this community"]],
  ["operating-snapshot", "Operating Snapshot", "community_profile", "summary_card", ["operating snapshot", "portfolio topline", "community topline"]],
  ["census-trend", "Census Trend", "census_trend", "line_chart", ["census trend", "census history", "census time series"]],
  ["census-movement", "Census Movement", "census_movement", "comparison_chart", ["census movement", "census movers", "month over month census"]],
  ["census-drop-history", "Census Drop History", "census_drop_history", "table", ["census drops", "census declines", "census drop history"]],
  ["community-time-series", "Community Time Series", "community_time_series", "multi_line_chart", ["compare community trends", "community trend matrix", "community heatmap"]],
  ["incident-breakdown", "Incident Category Breakdown", "incident_breakdown", "bar_chart", ["incident breakdown", "incident categories", "category breakdown"]],
  ["incident-detail-list", "Incident Detail List", "incident_detail_list", "table", ["incident list", "incident details", "incident residents", "incident search results", "incident archive", "incident history search"]],
  ["all-incidents-search", "All Incidents Search", "incident_detail_list", "table", ["all incidents", "every incident ever", "all loaded incidents", "search every incident", "full incident list", "complete incident history"]],
  ["incident-resident-drivers", "Resident Incident Drivers", "incident_resident_drivers", "table", ["incident drivers", "resident incident drivers", "top incident residents", "top incident clients", "repeat incident residents", "repeat incident clients", "who is driving incidents", "who is driving awol", "who accounts for incidents"]],
  ["community-incident-drivers", "Community Incident Drivers", "incident_resident_drivers", "table", ["community incident drivers", "community resident incident drivers", "san pablo incident drivers", "santa clarita incident drivers", "jc wallace incident drivers", "victoria incident drivers", "turlock incident drivers", "who is driving incidents by community"]],
  ["metric-slice", "Metric Slice", "slice_metric", "table", ["metric slice", "slice metric", "incidents by community", "incidents by month", "incidents by category", "awol by community", "census by community", "group by community", "group by month"]],
  ["data-detail-list", "Data Detail List", "detail_list", "table", ["detail rows", "exact rows", "data detail list"]],
  ["census-search", "Monthly Census Detail", "detail_list", "table", ["monthly census rows", "all census rows", "every census row", "census count rows", "census export rows"]],
  ["data-availability", "Data Availability", "data_availability", "table", ["data availability", "data freshness", "loaded periods", "latest loaded data"]],
  ["incident-category-comparison", "Incident Category Comparison", "incident_category_comparison", "comparison_chart", ["compare incident categories", "incident category comparison"]],
  ["incident-rate", "Incident Rate", "incident_rate", "table", ["incident rate", "incidents per 100 residents"]],
  ["incident-rate-change", "Incident Rate Change", "incident_rate_change", "comparison_chart", ["incident rate change", "compare incident rates"]],
  ["resident-profile", "Resident Profile", "resident_lookup", "profile_card", ["resident profile", "client profile", "resident lookup"]],
  ["resident-incident-history", "Resident Incident History", "resident_incident_history", "table", ["resident incident history", "client incident history"]],
  ["resident-search-results", "Resident Search Results", "resident_search", "table", ["resident search results", "resident lookup results", "search roster"]],
  ["resident-search", "Resident Search", "resident_search", "table", ["resident search", "search residents", "resident roster search", "resident directory search", "full resident search", "census search", "search census", "current census list", "census roster", "who is on census", "everyone on census"]],
  ["weekly-resident-flow", "Weekly Intake and Discharge", "resident_flow_weekly", "table", ["weekly intake and discharge", "intake discharge", "admissions discharges", "resident flow", "weekly resident flow", "move ins move outs", "week by week intake"]],
  ["resident-watch-summary", "Resident Watch Summary", "resident_risk_summary", "ranked_list", ["resident watchlist", "resident watch summary", "residents need attention"]],
  ["diagnosis-mix", "Diagnosis Mix", "diagnosis_mix", "donut_chart", ["diagnosis mix", "clinical mix"]],
  ["resident-demographics", "Resident Demographics", "resident_demographics", "bar_chart", ["resident demographics", "age mix"]],
  ["length-of-stay", "Length of Stay", "length_of_stay_mix", "donut_chart", ["length of stay", "los mix", "resident tenure"]],
  ["medication-profile", "Medication Profile", "medication_profile", "summary_card", ["medication profile", "medication picture", "meds overview"]],
  ["medication-watch", "Medication Watch", "medication_watch", "table", ["medication watch", "resident mar watchlist", "medication attention", "who needs medication attention", "top medication residents", "med refusal drivers"]],
  ["medication-compliance", "Medication Compliance", "medication_compliance", "table", ["medication compliance", "emar compliance"]],
  ["medication-current-orders", "Current Medication Orders", "medication_orders_current", "table", ["current medication orders", "active medication orders", "current meds by community", "active meds by community"]],
  ["medication-refusals", "Medication Refusals", "medication_refusals_by_community", "bar_chart", ["medication refusals", "refused medications"]],
  ["medication-exceptions", "Medication Exception Detail", "medication_exception_detail", "table", ["medication exceptions", "mar exceptions", "not given meds", "missed meds", "held meds", "late meds", "prn detail"]],
  ["medication-refusal-detail", "Medication Refusal Detail", "medication_exception_detail", "table", ["medication refusal detail", "who refused meds", "refusal rows", "refused medication rows", "med refusal detail"]],
  ["medication-late-admins", "Late Medication Administrations", "medication_exception_detail", "table", ["late medication administrations", "late meds", "over 60 minute meds", "delayed medication rows"]],
  ["medication-held-admins", "Held Medication Detail", "medication_exception_detail", "table", ["held medication detail", "held meds", "on hold medication rows", "missed held meds"]],
  ["medication-prn-detail", "PRN Medication Detail", "medication_exception_detail", "table", ["prn medication detail", "prn detail", "prn follow up", "prn effectiveness"]],
  ["resident-medication-profile", "Resident Medication Profile", "resident_lookup", "profile_card", ["resident medication profile", "client medication profile", "resident mar profile", "client mar profile", "resident meds profile"]],
  ["documentation-gaps", "Documentation Gaps", "documentation_gaps", "table", ["documentation gaps", "note gaps", "care note gaps"]],
  ["community-comparison", "Community Comparison", "community_compare", "table", ["community comparison", "compare communities"]],
  ["period-comparison", "Period Comparison", "compare_periods", "comparison_chart", ["period comparison", "compare months"]]
];

/** @type {PlatformModuleDefinition[]} */
const analysisModules = analysisModuleDefinitions.map(([id, title, tool, visualType, aliases]) => ({
  id,
  kind: "analysis",
  family: id.startsWith("incident") ? "incidents" : id.startsWith("census") ? "census" : id.startsWith("medication") ? "medications" : id.startsWith("resident") || id === "length-of-stay" || id === "diagnosis-mix" || id === "documentation-gaps" ? "residents" : "operations",
  title,
  eyebrow: "Analytical module",
  description: `Deterministic ${String(title).toLowerCase()} generated from approved platform rows.`,
  aliases: [...aliases],
  scopes: ["portfolio", "community"],
  data: [],
  capabilities: ["calculate", "filter", "export", "render"],
  tool,
  visualType
}));

export const platformModuleRegistry = Object.freeze([...surfaceModules, ...analysisModules]);

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getPlatformModule(id) {
  return platformModuleRegistry.find((module) => module.id === id) ?? null;
}

export function getPlatformModuleByTool(tool) {
  return platformModuleRegistry.find((module) => module.kind === "analysis" && module.tool === tool) ?? null;
}

export function getPlatformModuleByCanvasId(canvasId, focus = null) {
  return surfaceModules.find((module) => module.canvasId === canvasId && (focus ? module.focus === focus : !module.focus)) ??
    surfaceModules.find((module) => module.canvasId === canvasId) ??
    null;
}

export function buildPlatformModuleRoute(moduleOrId, { facilityId = null } = {}) {
  const module = typeof moduleOrId === "string" ? getPlatformModule(moduleOrId) : moduleOrId;
  if (!module?.route) return null;
  if (module.route.includes(":facilityId") && !facilityId) return null;
  return module.route.replace(":facilityId", String(facilityId));
}

export function getPlatformModuleForRoute(route) {
  if (!route) return null;
  const text = String(route);
  const focus = new URLSearchParams(text.split("?")[1] ?? "").get("focus");
  if (/^\/resident-search(?:[/?#]|$)/.test(text)) {
    return getPlatformModule("resident-census-search");
  }
  if (/^\/communities\/[^/?]+/.test(text)) {
    if (focus) {
      const focused = surfaceModules.find((module) => module.route?.includes(`focus=${focus}`));
      if (focused) return focused;
    }
    return getPlatformModule("community-detail");
  }
  if (/^\/explorer\/[^/?]+/.test(text)) {
    return getPlatformModule("data-explorer");
  }
  return surfaceModules.find((module) => module.route === text || (module.route !== "/" && text.startsWith(module.route))) ?? null;
}

export function resolvePlatformModuleRequest(content, { kind = null } = {}) {
  const text = normalize(content);
  if (!text) return null;
  const candidates = platformModuleRegistry
    .filter((module) => !kind || module.kind === kind)
    .map((module) => {
      const matches = module.aliases
        .map((alias) => normalize(alias))
        .filter((alias) => alias && text.includes(alias));
      const longestMatch = matches.sort((left, right) => right.length - left.length)[0];
      return { module, score: longestMatch?.length ?? 0 };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.module ?? null;
}

export function getPlatformModuleManifest() {
  return platformModuleRegistry.map(({ id, kind, family, title, aliases, scopes, data, capabilities, tool, visualType, canvasId, focus }) => ({
    id,
    kind,
    family,
    title,
    aliases,
    scopes,
    data,
    capabilities,
    tool: tool ?? null,
    visualType: visualType ?? null,
    canvasId: canvasId ?? null,
    focus: focus ?? null
  }));
}

export function getRelevantPlatformModules(content, limit = 8) {
  const text = normalize(content);
  /** @type {ReadonlyArray<readonly [string, RegExp]>} */
  const familySignals = [
    ["incidents", /\b(incident|incidents|awol|elopement|fall|police|sentinel|category|categories)\b/],
    ["census", /\b(census|occupancy|headcount|population|movement)\b/],
    ["residents", /\b(resident|residents|client|clients|profile|diagnosis|age|los|length of stay|documentation|note gap|roster|physician|unit)\b/],
    ["medications", /\b(medication|medications|meds|emar|compliance|refusal|refused)\b/],
    ["communities", /\b(community|communities|facility|facilities|san pablo|santa clarita|wallace|turlock|victoria)\b/],
    ["operations", /\b(operations|snapshot|topline|compare|comparison)\b/],
    ["support", /\b(glossary|definition|command center|system health|admin)\b/]
  ];
  const families = new Set(familySignals.filter(([, pattern]) => pattern.test(text)).map(([family]) => family));

  return platformModuleRegistry
    .map((module) => {
      const aliasScore = module.aliases.reduce((score, alias) => {
        const normalizedAlias = normalize(alias);
        return text.includes(normalizedAlias) ? Math.max(score, 100 + normalizedAlias.length) : score;
      }, 0);
      const familyScore = families.has(module.family) ? 20 : 0;
      const surfaceBonus = module.kind === "surface" ? 2 : 0;
      return { module, score: aliasScore + familyScore + surfaceBonus };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ module }) => ({
      id: module.id,
      kind: module.kind,
      title: module.title,
      family: module.family,
      scopes: module.scopes,
      capabilities: module.capabilities,
      tool: module.tool ?? null,
      focus: module.focus ?? null
    }));
}
