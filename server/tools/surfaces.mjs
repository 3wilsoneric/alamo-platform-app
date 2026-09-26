import {
  buildPlatformModuleRoute,
  getPlatformModule,
  getPlatformModuleManifest,
  resolvePlatformModuleRequest
} from "../../shared/platform-module-registry.mjs";

export function createSurfaceTools({
  normalizeText,
  findFacility,
  makeTrace,
  formatNumber
}) {
  function resolveSurfaceModule(content, communities) {
    const text = normalizeText(content);
    const facility = findFacility(content, communities);
    if (facility && /\b(incident|incidents|awol|elopement|category|categories)\b/.test(text)) return getPlatformModule("community-incidents");
    if (facility && /\b(census|occupancy|headcount|population)\b/.test(text) && !/\b(search|find)\b/.test(text)) return getPlatformModule("community-census");
    if (facility && /\b(resident|residents|roster|los|length of stay)\b/.test(text) && !/\b(search|find)\b/.test(text)) return getPlatformModule("community-residents");
    return resolvePlatformModuleRequest(content, { kind: "surface" });
  }

  function getDataExplorerRoute(content) {
    const text = normalizeText(content);
    if (/\b(resident|residents|roster|client|clients)\b/.test(text)) return "/explorer/residents";
    if (/\b(census|occupancy|headcount|population)\b/.test(text)) return "/explorer/census";
    return "/explorer/incidents";
  }

  function buildSurfaceModuleTool(content, communities) {
    const facility = findFacility(content, communities);
    const module = resolveSurfaceModule(content, communities);
    const route = module?.id === "data-explorer"
      ? getDataExplorerRoute(content)
      : module?.id === "resident-census-search" && !facility
        ? "/resident-search"
        : module?.route?.includes(":facilityId") && !facility
          ? "/communities"
        : module
          ? buildPlatformModuleRoute(module, { facilityId: facility?.facility_id ?? null })
          : null;

    if (!module || !route) {
      return {
        handled: true,
        tool: "data_recovery",
        text: "I could not match that request to a registered product module. I can show the module catalog or open Communities Overview while you narrow it down.",
        trace: makeTrace({
          tool: "data_recovery",
          dataSource: "platform module registry",
          rowCount: 0,
          facility,
          note: "unresolved module request"
        }),
        actions: [
          { label: "Show module catalog", kind: "tool", tool: "module_catalog", prompt: "show available modules" },
          { label: "Open Communities Overview", kind: "route", route: "/communities" }
        ]
      };
    }

    const moduleDescription = module.description
      .replace(/^./, (character) => character.toLowerCase())
      .replace(/\.$/, "");
    const surfaceTitle = `${module.title}${facility ? ` for ${facility.community_name}` : ""}`;
    const openDescription = /^find\b/i.test(module.description)
      ? `Opened ${surfaceTitle}. Use it to ${moduleDescription}.`
      : `Opened ${surfaceTitle}. It shows ${moduleDescription}.`;

    return {
      handled: true,
      tool: "surface_module",
      text: openDescription,
      trace: makeTrace({
        tool: "surface_module",
        dataSource: "platform module registry",
        rowCount: 0,
        facility,
        note: `module=${module.id}`
      }),
      actions: [
        {
          label: `Surface ${module.title}`,
          kind: module.id === "data-explorer" ? "external" : "route",
          route: module.id === "data-explorer" ? undefined : route,
          url: module.id === "data-explorer" ? route : undefined
        }
      ]
    };
  }

  function buildModuleCatalogTool() {
    const modules = getPlatformModuleManifest();
    const surfaceCount = modules.filter((module) => module.kind === "surface").length;
    const analysisCount = modules.filter((module) => module.kind === "analysis").length;
    const familyCount = new Set(modules.map((module) => module.family).filter(Boolean)).size;
    return {
      handled: true,
      tool: "module_catalog",
      text: [
        "Available platform modules",
        `${formatNumber(modules.length)} modules are available: ${formatNumber(surfaceCount)} product surfaces and ${formatNumber(analysisCount)} analytical modules across ${formatNumber(familyCount)} families. The catalog identifies the scope and capabilities of each one.`
      ].join("\n"),
      trace: makeTrace({
        tool: "module_catalog",
        dataSource: "platform module registry",
        rowCount: modules.length
      }),
      visual: {
        type: "table",
        title: "Platform Module Catalog",
        subtitle: "Reusable product and analytical modules",
        valueLabel: "Modules",
        columns: ["Module", "Family", "Kind", "Scopes", "Capabilities"],
        rows: modules.map((module) => ({
          label: String(module.title),
          value: 0,
          cells: [
            String(module.title),
            String(module.family),
            String(module.kind),
            Array.isArray(module.scopes) ? module.scopes.join(", ") : "—",
            Array.isArray(module.capabilities) ? module.capabilities.join(", ") : "—"
          ]
        }))
      }
    };
  }

  return {
    resolveSurfaceModule,
    buildSurfaceModuleTool,
    buildModuleCatalogTool
  };
}
