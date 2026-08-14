import { getPlatformModuleByTool } from "./platform-module-registry.mjs";
import { shouldComposeModulesForDecision } from "./analyst-decision-intelligence.mjs";

export const AD_HOC_MODULE_SPEC_VERSION = "1.0";

export const moduleSelectionReasonCodes = Object.freeze([
  "direct_answer",
  "requested_census_context",
  "requested_incident_context",
  "requested_medication_context",
  "requested_documentation_context",
  "requested_resident_context",
  "requested_operating_context"
]);

export const visualizationTemplateRegistry = Object.freeze([
  { id: "trend-line", visualType: "line_chart", minRows: 2, maxRows: 36, shape: "time-series", interactions: ["pin", "export", "refine"] },
  { id: "multi-series-line", visualType: "multi_line_chart", minRows: 2, maxRows: 36, shape: "multi-time-series", interactions: ["pin", "export", "refine"] },
  { id: "period-heatmap", visualType: "heatmap", minRows: 2, maxRows: 36, shape: "entity-period-matrix", interactions: ["pin", "export", "refine", "drilldown"] },
  { id: "composition-donut", visualType: "donut_chart", minRows: 2, maxRows: 8, shape: "composition", interactions: ["pin", "export", "drilldown"] },
  { id: "comparison-bars", visualType: "comparison_chart", minRows: 1, maxRows: 16, shape: "comparison", interactions: ["pin", "export", "refine"] },
  { id: "ranked-bars", visualType: "ranked_list", minRows: 1, maxRows: 20, shape: "ranking", interactions: ["pin", "export", "drilldown"] },
  { id: "data-table", visualType: "table", minRows: 0, maxRows: 1000, shape: "exact-rows", interactions: ["pin", "export", "sort"] },
  { id: "resident-profile", visualType: "profile_card", minRows: 1, maxRows: 40, shape: "entity-profile", interactions: ["pin", "drilldown", "export"] },
  { id: "topline-summary", visualType: "summary_card", minRows: 1, maxRows: 16, shape: "summary", interactions: ["pin", "drilldown"] },
  { id: "simple-bars", visualType: "bar_chart", minRows: 1, maxRows: 20, shape: "categorical", interactions: ["pin", "export", "drilldown"] }
]);

function slug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "module";
}

function getTemplateForVisual(visual) {
  const direct = visualizationTemplateRegistry.find((template) => template.visualType === visual?.type);
  return direct ?? visualizationTemplateRegistry.find((template) => template.id === "data-table");
}

function normalizeRows(rows, maxRows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row === "object" && String(row.label ?? "").trim())
    .slice(0, maxRows)
    .map((row) => ({
      label: String(row.label),
      value: Number.isFinite(Number(row.value)) ? Number(row.value) : 0,
      ...(row.meta ? { meta: String(row.meta) } : {}),
      ...(Array.isArray(row.cells) ? { cells: row.cells.map((cell) => cell ?? "—") } : {})
    }));
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSelectionReason(reason, fallbackCode = "direct_answer") {
  const code = moduleSelectionReasonCodes.includes(reason?.code) ? reason.code : fallbackCode;
  const labels = {
    direct_answer: "Direct answer to the question",
    requested_census_context: "Requested census context",
    requested_incident_context: "Requested incident context",
    requested_medication_context: "Requested medication context",
    requested_documentation_context: "Requested documentation context",
    requested_resident_context: "Requested resident context",
    requested_operating_context: "Requested operating context"
  };
  return {
    code,
    label: String(reason?.label ?? labels[code] ?? "Selected module")
  };
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function isCensusModule(spec) {
  return spec?.family === "census" || /\bcensus|occupancy|population|headcount\b/i.test(`${spec?.moduleId ?? ""} ${spec?.title ?? ""}`);
}

function isIncidentModule(spec) {
  return spec?.family === "incidents" || /\bincident|awol|elopement|police|sentinel\b/i.test(`${spec?.moduleId ?? ""} ${spec?.title ?? ""}`);
}

function isMedicationModule(spec) {
  return spec?.family === "medications" || /\bmedication|refusal|emar|mar|compliance|exception|not given|missed|held|late|prn\b/i.test(`${spec?.moduleId ?? ""} ${spec?.title ?? ""}`);
}

function isDocumentationModule(spec) {
  return /\bdocumentation|doc gap|note gap|last note\b/i.test(`${spec?.moduleId ?? ""} ${spec?.title ?? ""}`);
}

function isResidentModule(spec) {
  return spec?.family === "residents" || spec?.scope === "resident" || /\bresident|client|diagnosis|demographic|length of stay|los\b/i.test(`${spec?.moduleId ?? ""} ${spec?.title ?? ""}`);
}

function getCompositionSelectionReason(content, spec, result, primaryTool) {
  const text = normalizeText(content);
  if (primaryTool && result?.tool === primaryTool) return normalizeSelectionReason({ code: "direct_answer" });
  if (isCensusModule(spec) && /\b(census|occupancy|population|headcount|resident count|movement|trends?)\b/.test(text)) {
    return normalizeSelectionReason({ code: "requested_census_context" });
  }
  if (isIncidentModule(spec) && /\b(incident|incidents|awol|elopement|category|fall|police|sentinel)\b/.test(text)) {
    return normalizeSelectionReason({ code: "requested_incident_context" });
  }
  if (isMedicationModule(spec) && /\b(medication|medications|meds|emar|mar|compliance|refusal|refused|not given|missed|held|late|prn)\b/.test(text)) {
    return normalizeSelectionReason({ code: "requested_medication_context" });
  }
  if (isDocumentationModule(spec) && /\b(documentation|doc gap|note gap|last note|care note)\b/.test(text)) {
    return normalizeSelectionReason({ code: "requested_documentation_context" });
  }
  if (isResidentModule(spec) && /\b(resident|residents|client|clients|profile|diagnosis|age|demographic|los|length of stay)\b/.test(text)) {
    return normalizeSelectionReason({ code: "requested_resident_context" });
  }
  if (/\b(operating|snapshot|overview|compare|comparison|relationship|overall|portfolio picture)\b/.test(text)) {
    return normalizeSelectionReason({ code: "requested_operating_context" });
  }
  return null;
}

export function validateAdHocModuleSpec(spec) {
  const errors = [];
  const template = visualizationTemplateRegistry.find((item) => item.id === spec?.templateId);
  if (!spec || typeof spec !== "object") return { valid: false, errors: ["spec is required"] };
  if (spec.version !== AD_HOC_MODULE_SPEC_VERSION) errors.push("unsupported spec version");
  if (!spec.id) errors.push("module id is required");
  if (!spec.title) errors.push("title is required");
  if (!template) errors.push("unknown visualization template");
  if (!spec.visual || !Array.isArray(spec.visual.rows)) errors.push("visual rows are required");
  if (template && spec.visual?.type !== template.visualType) errors.push("visual type does not match template");
  if (template && (spec.visual?.rows?.length ?? 0) < template.minRows) errors.push(`template requires at least ${template.minRows} rows`);
  if (template && (spec.visual?.rows?.length ?? 0) > template.maxRows) errors.push(`template allows at most ${template.maxRows} rows`);
  if (!spec.provenance || typeof spec.provenance !== "object") {
    errors.push("provenance is required");
  } else {
    const visualRows = Array.isArray(spec.visual?.rows) ? spec.visual.rows.length : 0;
    const rowCount = numberOrNull(spec.provenance.rowCount);
    const visibleRowCount = numberOrNull(spec.provenance.visibleRowCount);
    const originalRowCount = numberOrNull(spec.provenance.originalRowCount ?? spec.visual?.originalRowCount);
    const artifactRowCount = numberOrNull(spec.provenance.artifactRowCount);
    const rowSetId = stringOrNull(spec.provenance.rowSetId);
    if (visibleRowCount != null && visibleRowCount !== visualRows) {
      errors.push("provenance visibleRowCount does not match rendered rows");
    }
    const safeEmptyPlaceholder = spec.visual?.type === "table" &&
      rowCount === 0 &&
      visualRows === 1 &&
      /^(no matching rows|not loaded)$/i.test(String(spec.visual?.rows?.[0]?.label ?? ""));
    if (spec.visual?.type === "table" && rowCount != null && rowCount < visualRows && !safeEmptyPlaceholder) {
      errors.push("provenance rowCount is smaller than rendered rows");
    }
    if (spec.visual?.type === "table" && originalRowCount != null && originalRowCount < visualRows) {
      errors.push("provenance originalRowCount is smaller than rendered rows");
    }
    if (artifactRowCount != null && originalRowCount != null && artifactRowCount !== originalRowCount) {
      errors.push("provenance artifactRowCount does not match originalRowCount");
    }
    if (artifactRowCount != null && !rowSetId) {
      errors.push("provenance rowSetId is required when an artifact row count is present");
    }
    if (spec.visual?.type === "table" && originalRowCount != null && originalRowCount > visualRows && !rowSetId) {
      errors.push("table previews of larger row sets require provenance rowSetId");
    }
  }
  if (!spec.selectionReason || typeof spec.selectionReason !== "object") {
    errors.push("selection reason is required");
  } else {
    if (!moduleSelectionReasonCodes.includes(spec.selectionReason.code)) errors.push("selection reason code is unsupported");
    if (!String(spec.selectionReason.label ?? "").trim()) errors.push("selection reason label is required");
  }
  return { valid: errors.length === 0, errors };
}

export function planAdHocModule(content, toolResult, options = {}) {
  if (!toolResult?.handled || !toolResult.visual) return null;
  const registeredModule = getPlatformModuleByTool(toolResult.tool);
  const registeredTemplate = registeredModule?.visualType && toolResult.visual.type === "bar_chart"
    ? visualizationTemplateRegistry.find((template) => template.visualType === registeredModule.visualType)
    : null;
  const registeredRowCount = toolResult.visual.rows?.length ?? 0;
  const template = registeredTemplate && registeredRowCount >= registeredTemplate.minRows && registeredRowCount <= registeredTemplate.maxRows
    ? registeredTemplate
    : getTemplateForVisual(toolResult.visual);
  if (!template) return null;
  const rows = normalizeRows(toolResult.visual.rows, template.maxRows);
  const scope = toolResult.trace?.facilityId
    ? toolResult.trace?.note?.includes("resident") ? "resident" : "community"
    : "portfolio";
  const period = toolResult.trace?.period ?? null;
  const communityName = toolResult.trace?.communityName ?? null;
  const visual = {
    ...toolResult.visual,
    type: template.visualType,
    rows
  };
  const rowSetId = stringOrNull(toolResult.provenance?.rowSetId ?? toolResult.artifact?.rowSetId ?? toolResult.trace?.rowSetId);
  const artifactRowCount = numberOrNull(toolResult.artifact?.rowCount);
  const originalRowCount = numberOrNull(toolResult.visual?.originalRowCount ?? artifactRowCount);
  const sourceRowCount = numberOrNull(toolResult.provenance?.rowCount ?? toolResult.trace?.rowCount ?? originalRowCount ?? rows.length);
  const spec = {
    version: AD_HOC_MODULE_SPEC_VERSION,
    id: `adhoc-${slug(toolResult.tool)}-${slug(communityName ?? "portfolio")}-${slug(period ?? "latest")}-${slug(visual.title ?? visual.valueLabel ?? template.id)}`,
    moduleId: registeredModule?.id ?? null,
    templateId: template.id,
    family: registeredModule?.family ?? "analysis",
    title: visual.title,
    scope,
    filters: {
      facilityId: toolResult.trace?.facilityId ?? null,
      communityName,
      period,
      note: toolResult.trace?.note ?? null
    },
    provenance: {
      tool: toolResult.tool ?? null,
      dataSource: toolResult.trace?.dataSource ?? null,
      rowCount: sourceRowCount,
      visibleRowCount: rows.length,
      originalRowCount,
      artifactRowCount,
      rowSetId,
      dataset: stringOrNull(toolResult.provenance?.dataset ?? registeredModule?.family),
      engineVersion: toolResult.trace?.engineVersion ?? null
    },
    selectionReason: normalizeSelectionReason(options.selectionReason),
    interactions: [...new Set([
      ...template.interactions,
      ...((toolResult.actions ?? []).some((action) => action.kind === "route") ? ["open-source-view"] : [])
    ])],
    visual,
    request: String(content ?? "").trim()
  };
  const validation = validateAdHocModuleSpec(spec);
  return validation.valid ? spec : null;
}

export function shouldComposeAdHocModules(content, options = {}) {
  const text = String(content ?? "").toLowerCase();
  const primaryTool = options.primaryTool ?? options.result?.tool ?? null;
  const decision = options.decision ?? options.executionPlan?.decision ?? null;

  if (decision) return shouldComposeModulesForDecision(decision, content);

  if ([
    "clarification",
    "data_availability",
    "data_recovery",
    "detail_list",
    "export_csv",
    "incident_detail_list",
    "module_catalog",
    "surface_module"
  ].includes(primaryTool)) {
    return false;
  }

  if (/\b(list|every|all|detail|details|exact rows?|export|download|csv|spreadsheet)\b/.test(text)) {
    return false;
  }

  if (/\b(data availability|data freshness|latest loaded|coverage window|what periods are loaded|what data periods are available|available data periods)\b/.test(text)) {
    return false;
  }

  return /\b(compare|comparison|versus|\bvs\b|relationship|alongside|together|and also|both|across)\b/.test(text) ||
    (/\b(census|occupancy|population)\b/.test(text) && /\b(incident|incidents|medication|documentation)\b/.test(text));
}

export function composeAdHocModules(content, toolResults, limit = 3, options = {}) {
  const specs = [];
  const seen = new Set();
  for (const result of Array.isArray(toolResults) ? toolResults : []) {
    const candidates = [
      result,
      ...(Array.isArray(result?.supportingVisuals)
        ? result.supportingVisuals.map((supporting) => ({
            ...result,
            visual: supporting.visual,
            trace: supporting.trace ?? result.trace,
            moduleSpec: undefined,
            moduleSpecs: undefined,
            supportingVisuals: undefined
          }))
        : [])
    ];
    for (const candidate of candidates) {
      const plannedSpec = candidate?.moduleSpec ?? planAdHocModule(content, candidate);
      const selectionReason = getCompositionSelectionReason(content, plannedSpec, candidate, options.primaryTool);
      if (!selectionReason) continue;
      const spec = plannedSpec
        ? { ...plannedSpec, selectionReason }
        : planAdHocModule(content, candidate, { selectionReason });
      if (!spec || !validateAdHocModuleSpec(spec).valid) continue;
      const key = `${spec.moduleId ?? spec.family}:${spec.templateId}:${spec.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      specs.push(spec);
      if (specs.length >= limit) return specs;
    }
  }
  return specs;
}
