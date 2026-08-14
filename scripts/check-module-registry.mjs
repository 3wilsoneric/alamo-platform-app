import {
  buildPlatformModuleRoute,
  getPlatformModule,
  getPlatformModuleForRoute,
  platformModuleRegistry,
  resolvePlatformModuleRequest
} from "../shared/platform-module-registry.mjs";

const failures = [];
const ids = new Set();

for (const module of platformModuleRegistry) {
  if (ids.has(module.id)) failures.push(`duplicate module id: ${module.id}`);
  ids.add(module.id);
  if (!module.title) failures.push(`${module.id}: missing title`);
  if (!module.family) failures.push(`${module.id}: missing family`);
  if (!module.aliases?.length) failures.push(`${module.id}: missing aliases`);
  if (!module.scopes?.length) failures.push(`${module.id}: missing scopes`);
  if (!module.capabilities?.length) failures.push(`${module.id}: missing capabilities`);
  if (module.kind === "surface" && (!module.canvasId || !module.route)) failures.push(`${module.id}: surface requires canvasId and route`);
  if (module.kind === "surface" && !module.data?.length) failures.push(`${module.id}: surface requires declared data dependencies`);
  if (module.kind === "surface" && /\b(placeholder|reserved|pending|not published)\b/i.test(module.description ?? "")) {
    failures.push(`${module.id}: placeholder surfaces are not allowed`);
  }
  if (module.kind === "analysis" && (!module.tool || !module.visualType)) failures.push(`${module.id}: analysis requires tool and visualType`);
}

const resolutionCases = [
  ["can i just get the search census module", "surface", "resident-census-search"],
  ["show me the resident search module", "surface", "resident-census-search"],
  ["open resident search", "surface", "resident-census-search"],
  ["open the incident center", "surface", "incident-center"],
  ["open command center", "surface", "command-center"],
  ["show the glossary", "surface", "glossary"],
  ["find a resident", "surface", "resident-census-search"],
  ["surface the community census module", "surface", "community-census"],
  ["show census trend", "analysis", "census-trend"],
  ["compare incident rates", "analysis", "incident-rate-change"],
  ["all loaded incidents", "analysis", "all-incidents-search"],
  ["community incident drivers", "analysis", "community-incident-drivers"],
  ["census search", "analysis", "resident-search"],
  ["resident search", "analysis", "resident-search"],
  ["resident profile", "analysis", "resident-profile"],
  ["who refused meds", "analysis", "medication-refusal-detail"],
  ["late medication administrations", "analysis", "medication-late-admins"],
  ["resident mar profile", "analysis", "resident-medication-profile"]
];

for (const [prompt, kind, expectedId] of resolutionCases) {
  const resolved = resolvePlatformModuleRequest(prompt, { kind });
  if (resolved?.id !== expectedId) failures.push(`${prompt}: expected ${expectedId}, received ${resolved?.id ?? "none"}`);
}

const routeCases = [
  ["resident-census-search", "345", "/communities/345?focus=search", "resident-census-search"],
  ["community-census", "343", "/communities/343?focus=census", "community-census"],
  ["community-incidents", "337", "/communities/337?focus=incidents", "community-incidents"],
  ["incident-center", "337", "/incidents", "incident-center"]
];

for (const id of ["community-detail", "community-census", "community-incidents", "community-residents", "resident-census-search"]) {
  const route = buildPlatformModuleRoute(id);
  if (route !== null) failures.push(`${id}: unresolved community route must return null, received ${route}`);
}

for (const [id, facilityId, expectedRoute, expectedResolvedId] of routeCases) {
  const module = getPlatformModule(id);
  const route = buildPlatformModuleRoute(module, { facilityId });
  if (route !== expectedRoute) failures.push(`${id}: expected route ${expectedRoute}, received ${route}`);
  const fromRoute = getPlatformModuleForRoute(route);
  if (fromRoute?.id !== expectedResolvedId) failures.push(`${route}: expected ${expectedResolvedId}, received ${fromRoute?.id ?? "none"}`);
}

if (failures.length) {
  console.error("FAILED: platform module registry");
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  const surfaceCount = platformModuleRegistry.filter((module) => module.kind === "surface").length;
  const analysisCount = platformModuleRegistry.filter((module) => module.kind === "analysis").length;
  console.log(`module registry checks passed (${surfaceCount} surfaces, ${analysisCount} analytical modules)`);
}
