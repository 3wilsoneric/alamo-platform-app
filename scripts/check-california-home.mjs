import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [app, page, map, neighborPaths, modal, communities, profile, incidentCenter, shell, wordmark, identity] = await Promise.all([
  read("src/app/App.tsx"),
  read("src/features/california/pages/CaliforniaHomePage.tsx"),
  read("src/features/california/components/CaliforniaCommunityMap.tsx"),
  read("src/features/california/data/californiaNeighborPaths.ts"),
  read("src/features/california/components/CaliforniaCommunityModal.tsx"),
  read("src/features/california/data/californiaCommunities.ts"),
  read("src/features/communities/components/CommunityDashboardSurface.tsx"),
  read("src/features/incidents/pages/IncidentCenterPage.tsx"),
  read("src/shared/layout/ProtectedAppShell.tsx"),
  read("src/shared/branding/PlatformWordmark.tsx"),
  read("src/shared/auth/PlatformUserIdentity.tsx")
]);

const failures = [];
const requireText = (source, pattern, message) => {
  if (!pattern.test(source)) failures.push(message);
};

requireText(
  app,
  /<Route path="\/" element=\{withRouteBoundary\(<CaliforniaHomePage \/>\)\} \/>[\s\S]*?<Route path="\/home" element=\{withRouteBoundary\(<CaliforniaHomePage \/>\)\} \/>[\s\S]*?path="\/home\/community\/:facilityId"[\s\S]*?<Route path="\/questions" element=\{withRouteBoundary\(<CaliforniaHomePage \/>\)\} \/>[\s\S]*?<Route path="\/analytics" element=\{withRouteBoundary\(<CaliforniaHomePage \/>\)\} \/>[\s\S]*?<Route path="\/reports" element=\{withRouteBoundary\(<CaliforniaHomePage \/>\)\} \/>/,
  "map, community, Questions, and Analytics routes do not share one warning-free persistent California carousel"
);
requireText(
  page,
  /<WorkspaceHomePage[\s\S]*?embedded[\s\S]*?sectionId="questions"[\s\S]*?\/>/,
  "California home does not pre-mount the analyst panel"
);
requireText(
  page,
  /<ReportsPage embedded active=\{activePanel === "reports"\} \/>/,
  "California home does not defer report loading until the pre-mounted Analytics panel is active"
);
if (/reports\/fiftystate/.test(app) || /reports\/fiftystate/.test(page)) {
  failures.push("the 50-state atlas is still nested under the legacy reports route");
}
requireText(
  page,
  /fetchHomeDashboard\(\)[\s\S]*?setMapDashboard\(dashboard\)[\s\S]*?dashboard=\{mapDashboard\}/,
  "California map is not enhanced with the cached home-dashboard metrics"
);
requireText(
  page,
  /useState<HomeDashboardResponse \| null>\(readCachedHomeDashboard\)[\s\S]*?dashboardUnavailable=\{mapDashboardUnavailable\}/,
  "California map does not seed its first render from the post-sign-in cache or distinguish loading from failure"
);
requireText(
  profile,
  /useState<LiveCommunitiesDashboardResponse \| null>\(readCachedCommunitiesDashboard\)/,
  "community profiles do not seed from the post-sign-in cache"
);
requireText(
  profile,
  /data-community-medication-loading="true"/,
  "community profiles do not preserve a truthful medication loading state"
);
requireText(
  page,
  /data-california-hero-action="questions"[\s\S]*?Ask a question/,
  "Ask a question is not presented in the California hero menu"
);
requireText(
  page,
  /data-california-hero-menu="true"[\s\S]*?data-california-hero-action="questions"[\s\S]*?Ask a question[\s\S]*?data-california-hero-action="analytics"[\s\S]*?Analytics/,
  "California hero does not expose the Questions and Analytics actions"
);
requireText(
  page,
  /const ANALYTICS_NAVIGATION_ENABLED = true/,
  "Analytics navigation is not explicitly enabled"
);
requireText(
  page,
  /\{ANALYTICS_NAVIGATION_ENABLED \? \([\s\S]*?onClick=\{\(\) => openPanel\("reports"\)\}[\s\S]*?data-california-question-analytics-link="true"[\s\S]*?Analytics[\s\S]*?\) : null\}/,
  "the Questions workspace does not expose the Analytics handoff"
);
requireText(
  page,
  /onClick=\{\(\) => openPanel\("questions"\)\}[\s\S]*?data-california-hero-action="questions"/,
  "Ask a question does not open the analyst panel route"
);
requireText(
  page,
  /function panelForPath[\s\S]*?pathname === "\/questions"[\s\S]*?pathname\.startsWith\("\/analytics"\)[\s\S]*?pathname\.startsWith\("\/reports"\)[\s\S]*?setActivePanel\(panelForPath\(location\.pathname\)\)[\s\S]*?addEventListener\("popstate"/,
  "carousel state is not synchronized with canonical routes and browser history"
);
requireText(
  page,
  /data-california-carousel-panel="map"[\s\S]*?data-california-carousel-panel="questions"[\s\S]*?data-california-carousel-panel="reports"/,
  "the map, analyst, and reports panels are not pre-mounted in order"
);
requireText(
  page,
  /data-california-workspace-carousel="true"[\s\S]*?className="relative left-1\/2 h-dvh w-screen -translate-x-1\/2 overflow-clip/,
  "the California carousel is not constrained to a non-scrolling viewport"
);
requireText(
  page,
  /data-california-carousel-track="true"[\s\S]*?w-\[300vw\][\s\S]*?transition-transform[\s\S]*?motion-reduce:transition-none[\s\S]*?translate3d/,
  "the workspace does not use a reduced-motion-safe horizontal slide track"
);
requireText(
  page,
  /data-california-carousel-back="true"[\s\S]*?aria-label="Back to California map"[\s\S]*?<ArrowLeft/,
  "neighboring panels do not provide a clear back control"
);
requireText(
  page,
  /aria-hidden=\{activePanel !== "questions"\}[\s\S]*?inert=\{activePanel !== "questions"\}[\s\S]*?aria-hidden=\{activePanel !== "reports"\}[\s\S]*?inert=\{activePanel !== "reports"\}/,
  "off-screen carousel panels remain exposed to assistive technology or keyboard focus"
);
requireText(
  page,
  /function openCommunity\(facilityId: string\)[\s\S]*?setSelectedFacilityId\(facilityId\)[\s\S]*?navigate\(`\/home\/community\/\$\{encodeURIComponent\(facilityId\)\}`\)/,
  "map selection does not open immediately and synchronize the canonical community route"
);
requireText(
  modal,
  /data-california-community-profile=/,
  "community modal has no stable profile boundary"
);
requireText(
  modal,
  /focus=\{currentView\.focus\}/,
  "California modal does not render the selected community profile view"
);
requireText(
  modal,
  /<ResidentSearchModule[\s\S]*?facilityId=\{community\.facilityId\}[\s\S]*?embedded[\s\S]*?compact/,
  "California modal does not keep resident search inside the community workspace"
);
requireText(
  modal,
  /viewStack[\s\S]*?canGoBack[\s\S]*?aria-label=\{`Back to[\s\S]*?<ArrowLeft/,
  "California modal does not provide stacked back navigation"
);
requireText(
  modal,
  /viewFromDestination[\s\S]*?focus === "census"[\s\S]*?focus === "incidents"[\s\S]*?focus === "medications"[\s\S]*?focus === "residents"/,
  "California modal does not route community drilldowns through its internal view stack"
);
requireText(
  modal,
  /data-community-modal-navigation="true"[\s\S]*?\["detail", "Overview"\][\s\S]*?\["census", "Census"\][\s\S]*?\["incidents", "Incidents"\][\s\S]*?\["medications", "Medications"\][\s\S]*?\["residents", "Residents"\]/,
  "community modal does not expose the complete scoped profile navigation"
);
requireText(
  modal,
  /bg-\[#111111\]\/72[\s\S]*?backdrop-blur-\[7px\]/,
  "community modal backdrop does not clearly obscure the workspace behind it"
);
requireText(
  profile,
  /onOpenSurface\?:/,
  "shared community profile cannot route drilldowns outside the chat canvas"
);
requireText(
  profile,
  /data-community-incident-triage="true"[\s\S]*?<IncidentCenterPage[\s\S]*?embedded[\s\S]*?facilityId=\{facilityId\}[\s\S]*?facilityName=\{facilityName\}/,
  "community incidents do not include the community-scoped recent triage surface"
);
requireText(
  incidentCenter,
  /facilityId\s*\?\s*enriched\.filter\(\(incident\) => String\(incident\.facility_id\) === String\(facilityId\)\)/,
  "incident triage does not enforce facility scope before rendering"
);
requireText(
  incidentCenter,
  /data-incident-date-window=\{index === 0 \? "latest" : "previous"\}/,
  "incident triage does not expose the latest two loaded incident-day controls"
);
requireText(
  incidentCenter,
  /data-incident-priority=\{priority\}/,
  "incident triage does not expose the high, medium, and low lanes for QA"
);
requireText(
  map,
  /data-california-community-marker=\{community\.facilityId\}/,
  "map markers do not expose accessible community profile labels"
);
requireText(
  map,
  /role="button"[\s\S]*?onClick=\{\(\) => onSelectCommunity\(community\.facilityId\)\}[\s\S]*?event\.key !== "Enter" && event\.key !== " "/,
  "map markers are not native pointer and keyboard actions"
);
requireText(
  map,
  /id="california-paper-face"[\s\S]*?stopColor="#ffffff"[\s\S]*?stopColor="#e9efed"/,
  "California does not use the restrained paper object face"
);
requireText(
  map,
  /id="california-neighbor-soft-focus"[\s\S]*?<feGaussianBlur[\s\S]*?stdDeviation="0\.65"[\s\S]*?data-california-neighbor-context="true"/,
  "California does not render softened neighboring-state context"
);
for (const stateId of ["or", "nv", "az", "id", "ut", "nm"]) {
  requireText(
    neighborPaths,
    new RegExp(`id:\\s*"${stateId}"`),
    `California neighbor context is missing ${stateId}`
  );
}
requireText(
  map,
  /CALIFORNIA_NEIGHBOR_PATHS\.map[\s\S]*?data-california-neighbor-state=\{state\.id\}/,
  "California does not render the neighboring-state silhouettes"
);
requireText(
  map,
  /id="california-object-shadow"[\s\S]*?stdDeviation="3\.2"/,
  "California does not use the dimensional object shadow"
);
requireText(
  map,
  /width: "min\(44vw, 880px, calc\(\(100dvh - 48px\) \* 0\.68\)\)"/,
  "California does not use the approved enlarged height-bounded map size"
);
requireText(
  map,
  /translate-x-8[\s\S]*?sm:-translate-x-\[29%\]/,
  "California map does not preserve the approved responsive left shift"
);
requireText(
  map,
  /data-california-state-face="true"/,
  "California silhouette does not expose a clipping regression target"
);
requireText(
  map,
  /fill="#9ba9a5"[\s\S]*?transform="translate\(4\.4 5\.4\)"[\s\S]*?fill="url\(#california-edge-face\)"[\s\S]*?transform="translate\(2\.35 2\.9\)"/,
  "California does not render a clean layered 3D edge"
);
requireText(
  map,
  /fill="url\(#california-paper-face\)"[\s\S]*?stroke="#879590"[\s\S]*?strokeWidth="2\.1"/,
  "California does not render the paper face with a clean illustrated border"
);
requireText(
  map,
  /const currentCensus = metrics\?\.currentWeeklyCensus \?\? null/,
  "California community census does not come exclusively from the governed weekly series"
);
requireText(
  map,
  /const currentCensus = metrics\?\.currentWeeklyCensus \?\? null[\s\S]*?data-california-node-census=\{currentCensus \?\? ""\}[\s\S]*?data-california-node-census-change-7d=\{censusChangeValue \?\? ""\}/,
  "California markers do not expose their governed census and weekly change"
);
if (/data-california-node-incidents|INCIDENTS · 24H/.test(map)) {
  failures.push("California map still mixes incident metrics into the census view");
}
if (
  /data-california-portfolio-readout|california-data-matrix|california-data-ribbon|california-network-line|california-community-signal/.test(
    map
  )
) {
  failures.push("California map still contains the rejected total card or decorative data layer");
}
if (/california-isometric-mesh|california-relief-shadow|california-state-clip/.test(map)) {
  failures.push("California still contains the rejected interior mesh or raised relief plates");
}
for (const state of ["Oregon", "Nevada", "Arizona"]) {
  requireText(
    neighborPaths,
    new RegExp(`name: "${state}"`),
    `California map context is missing ${state}`
  );
}
if (/currentWeeklyCensus\s*\?\?\s*(metrics\?\.total_residents|dashboard\?\.portfolio\.residentCount)/.test(map)) {
  failures.push("California map still substitutes resident-profile rows for governed census");
}
requireText(
  map,
  /<polyline[\s\S]*?data-california-community-tooltip=/,
  "map markers do not have permanent leader-line community labels"
);
requireText(
  map,
  /data-california-community-dot=\{community\.facilityId\}/,
  "map markers do not expose their projected geographic point for QA"
);
requireText(
  map,
  /const markerY = community\.mapY \+ \(community\.markerOffsetY \?\? 0\)/,
  "map markers do not preserve visual-only Bay Area spacing"
);
requireText(
  map,
  /r=\{isActive \? 4\.5 : 3\.5\}/,
  "California community dots are not using the compact marker size"
);
requireText(
  communities,
  /projectCaliforniaCoordinate\(position\.longitude, position\.latitude\)/,
  "California markers are not derived from longitude and latitude"
);
requireText(
  modal,
  /role="dialog"/,
  "community profile is not presented as an accessible modal"
);
requireText(
  modal,
  /const \[dismissed, setDismissed\][\s\S]*?data-california-modal-dismiss="true"[\s\S]*?onClick=\{dismissModal\}/,
  "community profile does not have a full-screen outside-click dismiss layer"
);
requireText(
  shell,
  /!isStandaloneEditorial && !isCaliforniaExperience[\s\S]*?<PlatformWordmark \/>/,
  "the shared shell does not remove its fixed chrome from the California experience"
);
requireText(
  shell,
  /isCaliforniaExperience[\s\S]*?\? "px-0 pb-0"/,
  "California experience still reserves space for the removed fixed header"
);
requireText(
  shell,
  /location\.pathname\.startsWith\("\/reports"\)[\s\S]*?location\.pathname\.startsWith\("\/home"\)/,
  "reports are not included in the California shell experience"
);
requireText(
  page,
  /data-california-workspace-brand="true"[\s\S]*?<PlatformWordmark \/>/,
  "California workspace does not restore the quiet Alamo Health home anchor"
);
if (/PlatformUserIdentity|data-california-hero-identity/.test(page)) {
  failures.push("California workspace reintroduced redundant signed-in profile chrome");
}
requireText(
  page,
  /flex min-h-0 w-full flex-1 -translate-y-3 items-center justify-center sm:translate-y-0/,
  "California map does not preserve the approved header-safe hero position"
);
for (const word of ["Alamo", "Health"]) {
  requireText(
    wordmark,
    new RegExp(`>${word}<|>\\s*${word}\\s*<`),
    `platform wordmark is missing ${word}`
  );
}
requireText(
  identity,
  /data-platform-user-identity="true"[\s\S]*?rounded-full[\s\S]*?\{displayName\}/,
  "signed-in identity is not rendered as a quiet reusable element"
);
if (/\bManagement\b/.test(wordmark)) {
  failures.push("retired Management label remains in the platform wordmark");
}

for (const facilityId of ["337", "342", "343", "344", "345"]) {
  if (!communities.includes(`"${facilityId}"`)) {
    failures.push(`California map is missing facility ${facilityId}`);
  }
}

for (const [facilityId, coordinates] of Object.entries({
  "337": [
    'city: "San Pablo",',
    "longitude: -122.3456,",
    "latitude: 37.9622,",
    "markerOffsetY: -2,"
  ],
  "342": [
    'city: "San Francisco",',
    "longitude: -122.4194,",
    "latitude: 37.7749,",
    "markerOffsetY: 2,"
  ],
  "343": ['city: "San Bernardino",', "longitude: -117.2898,", "latitude: 34.1083,"],
  "344": ['city: "Turlock",', "longitude: -120.849,", "latitude: 37.5057,"],
  "345": ['city: "Santa Clarita",', "longitude: -118.5426,", "latitude: 34.3917,"]
})) {
  const facilityBlock = communities.match(
    new RegExp(`"${facilityId}": \\{([\\s\\S]*?)\\n  \\}`)
  )?.[1] ?? "";
  if (!coordinates.every((coordinate) => facilityBlock.includes(coordinate))) {
    failures.push(`California marker ${facilityId} does not use its approved city coordinates`);
  }
}

if (failures.length) {
  console.error("California home contract failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("California home contract passed: map, Questions, and Analytics navigation share the mounted carousel, and community markers and modal drilldowns remain intact.");
