import { isAnalysisFrame } from "../../../shared/analysis-session-state.mjs";
import { validateGovernedReportSource } from "../../../shared/governed-report.mjs";
import type {
  CopilotAdHocModuleSpec,
  CopilotChatAction,
  CopilotChatMessage,
  CopilotIntentDebugResult,
  CopilotToolResult,
  CopilotToolVisual
} from "./copilotChat";

const VISUAL_TYPES = new Set<CopilotToolVisual["type"]>([
  "bar_chart",
  "line_chart",
  "multi_line_chart",
  "heatmap",
  "donut_chart",
  "comparison_chart",
  "ranked_list",
  "table",
  "profile_card",
  "summary_card"
]);
const ACTION_KINDS = new Set<CopilotChatAction["kind"]>(["route", "external", "download", "tool"]);
const TRUTH_STATES = new Set([
  "valid_rows",
  "verified_zero",
  "summary_not_shown",
  "not_loaded",
  "stale",
  "plan_rejected"
]);
const TEMPLATE_IDS = new Set<CopilotAdHocModuleSpec["templateId"]>([
  "trend-line",
  "multi-series-line",
  "period-heatmap",
  "composition-donut",
  "comparison-bars",
  "ranked-bars",
  "data-table",
  "resident-profile",
  "topline-summary",
  "simple-bars"
]);
const SCOPES = new Set<CopilotAdHocModuleSpec["scope"]>(["portfolio", "community", "resident"]);
const MAX_VISUAL_ROWS = 1_000;
const MAX_MODULE_SPECS = 10;
const MAX_ACTIONS = 20;
const MAX_DOWNLOAD_BYTES = 25_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, maximumLength: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= maximumLength && (allowEmpty || Boolean(value.trim()));
}

function isNullableBoundedString(value: unknown, maximumLength: number): value is string | null | undefined {
  return value == null || isBoundedString(value, maximumLength, true);
}

function isSafeInternalRoute(value: unknown): value is string {
  return isBoundedString(value, 1_024) && /^\/(?!\/)/.test(value) && !/[\\\u0000-\u001f\u007f]/.test(value);
}

function isSafeExternalUrl(value: unknown): value is string {
  if (!isBoundedString(value, 2_048)) return false;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null | undefined {
  return value == null || isFiniteNumber(value);
}

function isScalarCell(value: unknown) {
  return value === null || typeof value === "string" || isFiniteNumber(value);
}

function isCopilotVisual(value: unknown): value is CopilotToolVisual {
  if (!isRecord(value) || !VISUAL_TYPES.has(value.type as CopilotToolVisual["type"])) return false;
  if (!isBoundedString(value.title, 500) || !isNullableBoundedString(value.subtitle, 2_000) || !isNullableBoundedString(value.valueLabel, 240)) return false;
  if (value.columns !== undefined && (!Array.isArray(value.columns) || value.columns.length > 100 || !value.columns.every((column) => isBoundedString(column, 240)))) return false;
  if (!isNullableFiniteNumber(value.originalRowCount) || (isFiniteNumber(value.originalRowCount) && value.originalRowCount < 0)) return false;
  if (value.isHistoryPreview !== undefined && typeof value.isHistoryPreview !== "boolean") return false;
  if (!Array.isArray(value.rows) || value.rows.length > MAX_VISUAL_ROWS) return false;
  return value.rows.every((row) => (
    isRecord(row) &&
    isBoundedString(row.label, 2_000) &&
    isFiniteNumber(row.value) &&
    isNullableBoundedString(row.meta, 4_000) &&
    (row.cells === undefined || (
      Array.isArray(row.cells) &&
      row.cells.length <= 100 &&
      row.cells.every((cell) => isScalarCell(cell) && (typeof cell !== "string" || cell.length <= 20_000))
    ))
  ));
}

function isCopilotAction(value: unknown): value is CopilotChatAction {
  if (!isRecord(value) || !isBoundedString(value.label, 240) || !ACTION_KINDS.has(value.kind as CopilotChatAction["kind"])) return false;
  if (value.route != null && !isSafeInternalRoute(value.route)) return false;
  if (value.url != null && !isSafeExternalUrl(value.url)) return false;
  if (!isNullableBoundedString(value.filename, 512) || !isNullableBoundedString(value.mimeType, 240) || !isNullableBoundedString(value.tool, 240)) return false;
  if (!isNullableBoundedString(value.certifiedQuestionRouteId, 240)) return false;
  if (!isNullableBoundedString(value.prompt, 12_000) || !isNullableBoundedString(value.content, MAX_DOWNLOAD_BYTES)) return false;
  if (value.kind === "route" && !isSafeInternalRoute(value.route)) return false;
  if (value.kind === "external" && !isSafeExternalUrl(value.url)) return false;
  if (value.kind === "tool" && !isBoundedString(value.tool ?? value.prompt, 12_000)) return false;
  if (value.kind === "download" && !isBoundedString(value.filename ?? value.url, 2_048)) return false;
  return true;
}

export function isValidCopilotAction(value: unknown): value is CopilotChatAction {
  return isCopilotAction(value);
}

function isStringRecord(value: unknown) {
  return isRecord(value) && Object.entries(value).length <= 64 && Object.entries(value).every(([key, entry]) => (
    isBoundedString(key, 128) && (entry === null || isBoundedString(entry, 2_000, true))
  ));
}

function isCopilotModuleSpec(value: unknown): value is CopilotAdHocModuleSpec {
  if (!isRecord(value)) return false;
  if (
    value.version !== "1.0" ||
    !isBoundedString(value.id, 512) ||
    !(value.moduleId === null || isBoundedString(value.moduleId, 512)) ||
    !TEMPLATE_IDS.has(value.templateId as CopilotAdHocModuleSpec["templateId"]) ||
    !isBoundedString(value.family, 240) ||
    !isBoundedString(value.title, 500) ||
    !SCOPES.has(value.scope as CopilotAdHocModuleSpec["scope"]) ||
    !isStringRecord(value.filters) ||
    !isRecord(value.provenance) ||
    !isRecord(value.selectionReason) ||
    !isBoundedString(value.selectionReason.code, 128) ||
    !isBoundedString(value.selectionReason.label, 500) ||
    !Array.isArray(value.interactions) ||
    value.interactions.length > 20 ||
    !value.interactions.every((interaction) => isBoundedString(interaction, 128)) ||
    !isCopilotVisual(value.visual) ||
    !isBoundedString(value.request, 12_000)
  ) return false;

  const provenance = value.provenance as Record<string, unknown>;
  const numericProvenance = ["rowCount", "visibleRowCount", "originalRowCount", "artifactRowCount"];
  const stringProvenance = ["tool", "dataSource", "rowSetId", "dataset", "engineVersion"];
  return numericProvenance.every((key) => isNullableFiniteNumber(provenance[key])) &&
    stringProvenance.every((key) => isNullableBoundedString(provenance[key], 2_000));
}

export function isValidCopilotModuleSpec(value: unknown): value is CopilotAdHocModuleSpec {
  return isCopilotModuleSpec(value);
}

function isCopilotMessage(value: unknown): value is CopilotChatMessage {
  if (!isRecord(value)) return false;
  if (
    !isBoundedString(value.id, 512) ||
    !["assistant", "user"].includes(String(value.role)) ||
    !isBoundedString(value.text, 250_000, true) ||
    !["complete", "running"].includes(String(value.status)) ||
    !(value.createdAt === null || isFiniteNumber(value.createdAt))
  ) return false;
  if (value.meta === undefined) return true;
  if (!isRecord(value.meta)) return false;
  if (value.meta.assistantLabel !== undefined && !isBoundedString(value.meta.assistantLabel, 240)) return false;
  if (value.meta.actions !== undefined && (!Array.isArray(value.meta.actions) || value.meta.actions.length > MAX_ACTIONS || !value.meta.actions.every(isCopilotAction))) return false;
  if (value.meta.visual !== undefined && !isCopilotVisual(value.meta.visual)) return false;
  if (value.meta.moduleSpec !== undefined && !isCopilotModuleSpec(value.meta.moduleSpec)) return false;
  if (value.meta.moduleSpecs !== undefined && (!Array.isArray(value.meta.moduleSpecs) || value.meta.moduleSpecs.length > MAX_MODULE_SPECS || !value.meta.moduleSpecs.every(isCopilotModuleSpec))) return false;
  for (const key of ["toolTrace", "runtimeSchema", "turnTrace", "interpretation", "certifiedQuestion"] as const) {
    if (value.meta[key] !== undefined && !isRecord(value.meta[key])) return false;
  }
  for (const key of ["cached", "deterministicGuard", "forceClaude", "deterministicOverride", "transient"] as const) {
    if (value.meta[key] !== undefined && typeof value.meta[key] !== "boolean") return false;
  }
  if (value.meta.reportSource !== undefined && !validateGovernedReportSource(value.meta.reportSource).valid) return false;
  return value.meta.variant === undefined || value.meta.variant === "process" || value.meta.variant === "suggestion";
}

export function isValidCopilotMessage(value: unknown): value is CopilotChatMessage {
  return isCopilotMessage(value);
}

export function isValidCopilotVisual(value: unknown): value is CopilotToolVisual {
  return isCopilotVisual(value);
}

function responseError(message: string) {
  return new Error(`${message} The workspace safely stopped before rendering it.`);
}

function removeNullProperties(value: Record<string, unknown>, keys: readonly string[]) {
  const normalized = { ...value };
  for (const key of keys) {
    if (normalized[key] === null) delete normalized[key];
  }
  return normalized;
}

function normalizeVisual(value: Record<string, unknown>) {
  const normalized = removeNullProperties(value, ["subtitle", "valueLabel", "columns", "originalRowCount", "isHistoryPreview"]);
  if (Array.isArray(value.rows)) {
    normalized.rows = value.rows.map((row) => (
      isRecord(row) ? removeNullProperties(row, ["meta", "cells"]) : row
    ));
  }
  return normalized;
}

function normalizeModuleSpec(value: Record<string, unknown>) {
  return {
    ...value,
    visual: isRecord(value.visual) ? normalizeVisual(value.visual) : value.visual
  };
}

function normalizeToolResult(value: Record<string, unknown>): CopilotToolResult {
  const normalized = removeNullProperties(value, [
    "tool",
    "text",
    "reason",
    "artifact",
    "visual",
    "moduleSpec",
    "moduleSpecs",
    "trace",
    "runtimeSchema",
    "turnTrace",
    "interpretation",
    "certifiedQuestion",
    "actions",
    "executionPlan",
    "planValidation",
    "truthState",
    "safeRefusal",
    "contractViolation",
    "guidedContract",
    "provenance",
    "cached"
  ]);
  if (isRecord(normalized.visual)) normalized.visual = normalizeVisual(normalized.visual);
  if (isRecord(normalized.moduleSpec)) normalized.moduleSpec = normalizeModuleSpec(normalized.moduleSpec);
  if (Array.isArray(normalized.moduleSpecs)) {
    normalized.moduleSpecs = normalized.moduleSpecs.map((spec) => (
      isRecord(spec) ? normalizeModuleSpec(spec) : spec
    ));
  }
  if (Array.isArray(normalized.actions)) {
    normalized.actions = normalized.actions.map((action) => (
      isRecord(action)
        ? removeNullProperties(action, ["route", "url", "filename", "content", "mimeType", "tool", "prompt", "certifiedQuestionRouteId"])
        : action
    ));
  }
  return normalized as unknown as CopilotToolResult;
}

export function assertCopilotToolResult(value: unknown): CopilotToolResult {
  if (!isRecord(value) || typeof value.handled !== "boolean" || (value.tool != null && !isBoundedString(value.tool, 240))) {
    throw responseError("The structured analysis tool returned an incomplete response.");
  }
  if (value.text != null && !isBoundedString(value.text, 250_000, true)) throw responseError("The structured analysis tool returned invalid text.");
  if (value.actions != null && (!Array.isArray(value.actions) || value.actions.length > MAX_ACTIONS || !value.actions.every(isCopilotAction))) throw responseError("The structured analysis tool returned invalid actions.");
  if (value.visual != null && !isCopilotVisual(value.visual)) throw responseError("The structured analysis tool returned an invalid visual.");
  if (value.moduleSpec != null && !isCopilotModuleSpec(value.moduleSpec)) throw responseError("The structured analysis tool returned an invalid module.");
  if (value.moduleSpecs != null && (!Array.isArray(value.moduleSpecs) || value.moduleSpecs.length > MAX_MODULE_SPECS || !value.moduleSpecs.every(isCopilotModuleSpec))) throw responseError("The structured analysis tool returned invalid modules.");
  if (value.analysisFrame != null && !isAnalysisFrame(value.analysisFrame)) throw responseError("The structured analysis tool returned invalid analysis context.");
  if (value.artifact != null) {
    if (!isRecord(value.artifact) || value.artifact.type !== "csv" || !isBoundedString(value.artifact.filename, 512) || !isBoundedString(value.artifact.mimeType, 240) || !isBoundedString(value.artifact.content, MAX_DOWNLOAD_BYTES, true)) {
      throw responseError("The structured analysis tool returned an invalid export.");
    }
  }
  for (const key of ["trace", "runtimeSchema", "turnTrace", "interpretation", "certifiedQuestion", "executionPlan", "planValidation", "guidedContract", "provenance"] as const) {
    if (value[key] != null && !isRecord(value[key])) throw responseError(`The structured analysis tool returned invalid ${key}.`);
  }
  if (value.truthState != null && !TRUTH_STATES.has(String(value.truthState))) throw responseError("The structured analysis tool returned an invalid truth state.");
  for (const key of ["safeRefusal", "cached"] as const) {
    if (value[key] != null && typeof value[key] !== "boolean") throw responseError(`The structured analysis tool returned invalid ${key}.`);
  }
  for (const key of ["reason", "contractViolation"] as const) {
    if (value[key] != null && !isBoundedString(value[key], 12_000, true)) throw responseError(`The structured analysis tool returned invalid ${key}.`);
  }
  return normalizeToolResult(value);
}

export function assertCopilotIntentDebugResult(value: unknown): CopilotIntentDebugResult {
  if (!isRecord(value) || typeof value.handled !== "boolean") throw responseError("The intent compiler returned an incomplete response.");
  if (value.analysisFrame != null && !isAnalysisFrame(value.analysisFrame)) throw responseError("The intent compiler returned invalid analysis context.");
  if (value.detectedTool != null && !isBoundedString(value.detectedTool, 240)) throw responseError("The intent compiler returned an invalid tool selection.");
  if (value.executionPlan !== undefined && !isRecord(value.executionPlan)) throw responseError("The intent compiler returned an invalid execution plan.");
  return value as unknown as CopilotIntentDebugResult;
}
