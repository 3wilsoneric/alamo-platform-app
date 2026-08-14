import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import USA from "@svg-maps/usa";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`50-state atlas check failed: ${message}`);
  }
}

function matches(source, expression) {
  return [...source.matchAll(expression)].map((match) => match[1]);
}

const dataSource = read("src/features/fiftystate/data/stateTargetingData.ts");
const researchSource = read("src/features/fiftystate/data/stateResearchData.ts");
const buyerResearchSource = read("src/features/fiftystate/data/stateBuyerResearchData.ts");
const nationalBeds = JSON.parse(
  read("src/features/fiftystate/data/research/stateBedSupply.json")
);
const verifiedDemand = JSON.parse(
  read("src/features/fiftystate/data/research/verifiedDemandStates.json")
);
const buyerSprint = JSON.parse(
  read("src/features/fiftystate/data/research/fiveStateBuyerSprint.json")
);
const mapSource = read("src/features/fiftystate/components/StateTargetingMap.tsx");
const modalSource = read("src/features/fiftystate/components/StateDetailModal.tsx");
const pageSource = read("src/features/fiftystate/pages/FiftyStatePage.tsx");
const appSource = read("src/app/App.tsx");

const stateNames = matches(dataSource, /"stateName": "([^"]+)"/g);
const stateCodes = matches(dataSource, /"stateCode": "([^"]+)"/g);
const uniqueStateNames = new Set(stateNames);
const uniqueStateCodes = new Set(stateCodes);
const mapStateNames = new Set(
  USA.locations.flatMap((location) => (location.name ? [location.name] : []))
);
const missingMapShapes = [...uniqueStateNames].filter((state) => !mapStateNames.has(state));
const nationalStateRows = nationalBeds.states.filter((state) => state.abbr !== "DC");
const nationalBedByCode = new Map(nationalStateRows.map((state) => [state.abbr, state]));
const verifiedDemandCodes = new Set(verifiedDemand.states.map((state) => state.abbr));
const verifiedSourceIds = new Set(verifiedDemand.sources.map((source) => source.id));
const sourceAlias = new Map([
  ["Beckers-beds (full TAC 2023 table)", "Beckers-beds"]
]);
const expectedBuyerStates = new Set([
  "California",
  "Washington",
  "Oregon",
  "Texas",
  "New York"
]);
const expectedBuyerTargetCounts = new Map([
  ["California", 3],
  ["Washington", 3],
  ["Oregon", 3],
  ["Texas", 3],
  ["New York", 2]
]);
const allowedBuyerStatuses = new Set([
  ...buyerSprint.research_rules.status_labels,
  "closed"
]);

assert(stateNames.length === 50, `expected 50 records, found ${stateNames.length}`);
assert(uniqueStateNames.size === 50, "state names must be unique");
assert(uniqueStateCodes.size === 50, "state codes must be unique");
assert(missingMapShapes.length === 0, `missing map shapes: ${missingMapShapes.join(", ")}`);
assert(!uniqueStateNames.has("District of Columbia"), "the 50-state dataset must exclude DC");
assert(nationalBeds.states.length === 51, "national bed research must contain 50 states plus DC");
assert(nationalStateRows.length === 50, "national bed research must cover all 50 states");
assert(
  new Set(nationalStateRows.map((state) => state.abbr)).size === 50,
  "national bed research state codes must be unique"
);
assert(verifiedDemand.states.length === 15, "verified demand research must contain 15 states");
assert(verifiedDemandCodes.size === 15, "verified demand state codes must be unique");
verifiedDemand.states.forEach((state) => {
  const national = nationalBedByCode.get(state.abbr);
  assert(Boolean(national), `verified demand state ${state.abbr} lacks a national baseline`);
  assert(
    Math.abs(
      national.state_psych_beds_per_100k - state.state_psych_beds_per_100k.value
    ) < 0.01,
    `${state.abbr} has conflicting state-bed values across research layers`
  );
  [
    state.involuntary_or_conservatorship,
    state.state_hospital_pressure,
    state.placement_bottleneck,
    state.step_down_registry
  ].forEach((fact) => {
    if (!fact.source) return;
    const normalizedSource = sourceAlias.get(fact.source) ?? fact.source;
    assert(
      verifiedSourceIds.has(normalizedSource),
      `${state.abbr} references missing source ${fact.source}`
    );
  });
});
assert(
  buyerSprint.scope.length === 5 &&
    new Set(buyerSprint.scope).size === 5 &&
    buyerSprint.scope.every((state) => expectedBuyerStates.has(state)),
  "buyer-research scope must be exactly California, Washington, Oregon, Texas, and New York"
);
assert(
  Object.keys(buyerSprint.states).length === 5,
  "buyer-research dataset must contain exactly five state dossiers"
);
let buyerTargetCount = 0;
Object.entries(buyerSprint.states).forEach(([stateName, state]) => {
  assert(expectedBuyerStates.has(stateName), `unexpected buyer-research state ${stateName}`);
  assert(
    state.priority_targets.length === expectedBuyerTargetCounts.get(stateName),
    `${stateName} has the wrong number of buyer targets`
  );
  buyerTargetCount += state.priority_targets.length;
  assert(
    state.first_outreach?.organization &&
      state.first_outreach?.entry_point &&
      state.first_outreach?.lead_problem &&
      state.first_outreach?.offer,
    `${stateName} must retain a complete first-outreach plan`
  );
  const stateSources = buyerSprint.sources[stateName];
  assert(Array.isArray(stateSources) && stateSources.length > 0, `${stateName} lacks source URLs`);
  stateSources.forEach((url) => {
    assert(url.startsWith("https://"), `${stateName} has a non-HTTPS source URL`);
  });

  state.priority_targets.forEach((target) => {
    assert(
      target.buyer || target.buyers?.length,
      `${stateName} ${target.county_or_region} lacks a buyer route`
    );
    const rawProcurements = target.procurement
      ? Array.isArray(target.procurement)
        ? target.procurement
        : [target.procurement]
      : [];
    const statuses = [
      ...rawProcurements.map((procurement) => procurement.status ?? "not_publicly_located"),
      ...(target.procurement_and_funding
        ? [target.procurement_and_funding.recent_rfp_status]
        : []),
      ...(target.recent_precedent ? ["recent_precedent"] : []),
      ...(!target.procurement && !target.procurement_and_funding && !target.recent_precedent
        ? ["not_publicly_located"]
        : [])
    ];
    assert(statuses.length > 0, `${stateName} ${target.county_or_region} lacks opportunity status`);
    statuses.forEach((status) => {
      assert(
        allowedBuyerStatuses.has(status),
        `${stateName} ${target.county_or_region} has unsupported status ${status}`
      );
    });
    assert(target.alamo_pitch, `${stateName} ${target.county_or_region} lacks an Alamo pitch`);
    assert(target.barriers?.length, `${stateName} ${target.county_or_region} lacks execution barriers`);
  });
});
assert(buyerTargetCount === 14, `expected 14 buyer targets, found ${buyerTargetCount}`);
assert(
  buyerSprint.executive_conclusion.strategic_outreach_rank.length === 7,
  "strategic outreach ranking must retain seven priorities"
);
assert(
  buyerSprint.executive_conclusion.live_opportunity_watch.length === 5,
  "live opportunity watch must retain five verified entries"
);
assert(
  buyerSprint.recommended_next_actions.length === 5,
  "buyer sprint must retain five next actions"
);
assert(appSource.includes('path="/fiftystate"'), "the /fiftystate route is not registered");
assert(
  appSource.includes(
    'import FiftyStatePage from "../features/fiftystate/pages/FiftyStatePage"'
  ),
  "the authenticated atlas route must remain statically registered"
);
assert(!appSource.includes("lazy("), "registered routes must not use React.lazy");
assert(
  mapSource.includes('import("@svg-maps/usa")'),
  "the heavy map geometry should load inside the atlas rather than the app shell"
);
assert(mapSource.includes('role="button"'), "map states must remain keyboard-selectable");
assert(mapSource.includes('event.key === "Enter"'), "map states must support Enter");
assert(modalSource.includes('role="dialog"'), "state details must render as a dialog");
assert(modalSource.includes('aria-modal="true"'), "state dialog must be modal");
assert(modalSource.includes('event.key === "Escape"'), "state dialog must close with Escape");
assert(pageSource.includes("StateTargetingMap"), "the map is missing from the atlas page");
assert(pageSource.includes("StateDetailModal"), "the state detail modal is missing");
assert(pageSource.includes("filteredRecords"), "the state index must remain filterable");
assert(
  researchSource.includes("Expected 50 state bed-supply records") &&
    researchSource.includes("Expected 15 verified demand dossiers") &&
    researchSource.includes("Bed-supply research mismatch") &&
    researchSource.includes("comparisonUniverse: bedsByCode.size"),
  "research layers must validate coverage and cross-dataset consistency"
);
assert(
  buyerResearchSource.includes("Expected 5 buyer-research states") &&
    buyerResearchSource.includes("Expected 14 county or regional buyer targets") &&
    buyerResearchSource.includes("Buyer research sources are incomplete"),
  "buyer research must validate state, target, and source coverage"
);
assert(
  pageSource.includes('value="verified-demand"') &&
    pageSource.includes('value="bed-scarcity"') &&
    pageSource.includes('value="buyer-research"'),
  "the atlas must support demand-coverage, buyer-research, and bed-scarcity ordering"
);
assert(
  dataSource.includes("audienceScores") && dataSource.includes("recommendedAudience"),
  "state records must carry qualitative audience-route fit"
);
assert(
  pageSource.includes('aria-label="Sort states"') &&
    pageSource.includes("getStateAudienceScore"),
  "the atlas must support audience-first state prioritization"
);
assert(
  pageSource.includes('type AtlasScope = "priority" | "all"') &&
    pageSource.includes('useState<AtlasScope>("priority")') &&
    pageSource.includes('aria-label="State research scope"') &&
    pageSource.includes("Priority {VERIFIED_DEMAND_STATE_COUNT}") &&
    pageSource.includes("All 50") &&
    pageSource.includes("scope === \"all\" || hasVerifiedDemandResearch"),
  "the atlas must open on the 15 researched states while preserving explicit access to all 50"
);
assert(
  modalSource.includes("Why it matters") &&
    modalSource.includes("Buyer targets") &&
    modalSource.includes("First move") &&
    modalSource.includes("Public opportunity record") &&
    modalSource.includes("How to enter") &&
    modalSource.includes("What the buyer will need") &&
    modalSource.includes("getEffectivenessEvidencePlan") &&
    modalSource.includes("Sources") &&
    modalSource.includes("Research note") &&
    modalSource.includes("does not establish reimbursement"),
  "state details must connect demand research, buyer routes, targeting, sources, and a concise evidence boundary"
);

console.log(
  `50-state atlas check passed: ${uniqueStateNames.size} national records preserved, ${verifiedDemandCodes.size} researched states set as the default, ${buyerSprint.scope.length} buyer dossiers with ${buyerTargetCount} targets, source integrity, audience prioritization, and interaction contracts verified.`
);
