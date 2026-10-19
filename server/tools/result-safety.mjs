import {
  FACILITY_NAME_BY_ID,
  normalizeKnownCommunityNames,
  normalizeKnownCommunityNamesDeep
} from "../../shared/community-names.mjs";
import { cleanDisplayDateText } from "../../shared/display-date.mjs";

const TOOL_ENGINE_VERSION = "analysis-session-v1";

export const TOOL_TRUTH_STATES = new Set([
  "valid_rows",
  "verified_zero",
  "summary_not_shown",
  "not_loaded",
  "stale",
  "plan_rejected"
]);

export function formatNumber(value) {
  if (value == null) return "—";
  const text = String(value).replace(/,/g, "").trim();
  if (!text) return "—";
  const parsed = Number(text);
  return Number.isFinite(parsed) ? new Intl.NumberFormat("en-US").format(parsed) : "—";
}

export function sanitizeDisplayString(value) {
  return cleanDisplayDateText(normalizeKnownCommunityNames(String(value ?? "")))
    .replace(
      /\b(facility|community)\s+(337|342|343|344|345)\b/gi,
      (_match, prefix, id) => `${prefix} ${FACILITY_NAME_BY_ID.get(id)}`
    );
}

function sanitizeDisplayList(values) {
  return Array.isArray(values)
    ? values.map((value) => typeof value === "string" ? sanitizeDisplayString(value) : value)
    : values;
}

function sanitizeDisplayVisual(visual) {
  if (!visual || typeof visual !== "object") return visual;
  return {
    ...visual,
    title: sanitizeDisplayString(visual.title),
    ...(visual.subtitle == null ? {} : { subtitle: sanitizeDisplayString(visual.subtitle) }),
    ...(visual.valueLabel == null ? {} : { valueLabel: sanitizeDisplayString(visual.valueLabel) }),
    ...(Array.isArray(visual.columns) ? { columns: sanitizeDisplayList(visual.columns) } : {}),
    ...(Array.isArray(visual.rows) ? {
      rows: visual.rows.map((row) => ({
        ...row,
        label: sanitizeDisplayString(row.label),
        ...(row.meta == null ? {} : { meta: sanitizeDisplayString(row.meta) }),
        ...(Array.isArray(row.cells) ? { cells: sanitizeDisplayList(row.cells) } : {})
      }))
    } : {})
  };
}

function sanitizeStructuredAnswer(structuredAnswer) {
  if (!structuredAnswer || typeof structuredAnswer !== "object") return structuredAnswer;
  return {
    ...structuredAnswer,
    ...(structuredAnswer.answer == null ? {} : { answer: sanitizeDisplayString(structuredAnswer.answer) }),
    ...(structuredAnswer.definition == null ? {} : { definition: sanitizeDisplayString(structuredAnswer.definition) }),
    ...(Array.isArray(structuredAnswer.facts) ? { facts: sanitizeDisplayList(structuredAnswer.facts) } : {}),
    ...(Array.isArray(structuredAnswer.rowsChecked) ? { rowsChecked: sanitizeDisplayList(structuredAnswer.rowsChecked) } : {}),
    ...(Array.isArray(structuredAnswer.warnings) ? { warnings: sanitizeDisplayList(structuredAnswer.warnings) } : {})
  };
}

function sanitizeModuleSpec(moduleSpec) {
  if (!moduleSpec || typeof moduleSpec !== "object") return moduleSpec;
  return {
    ...moduleSpec,
    title: sanitizeDisplayString(moduleSpec.title),
    ...(moduleSpec.filters && typeof moduleSpec.filters === "object" ? {
      filters: {
        ...moduleSpec.filters,
        ...(moduleSpec.filters.note == null ? {} : { note: sanitizeDisplayString(moduleSpec.filters.note) })
      }
    } : {}),
    ...(moduleSpec.selectionReason && typeof moduleSpec.selectionReason === "object" ? {
      selectionReason: {
        ...moduleSpec.selectionReason,
        label: sanitizeDisplayString(moduleSpec.selectionReason.label)
      }
    } : {}),
    visual: sanitizeDisplayVisual(moduleSpec.visual)
  };
}

function sanitizeTrace(trace) {
  if (!trace || typeof trace !== "object") return trace;
  return {
    ...trace,
    ...(trace.communityName == null ? {} : { communityName: sanitizeDisplayString(trace.communityName) }),
    ...(trace.dataSource == null ? {} : { dataSource: sanitizeDisplayString(trace.dataSource) }),
    ...(trace.note == null ? {} : { note: sanitizeDisplayString(trace.note) })
  };
}

function sanitizeActions(actions) {
  if (!Array.isArray(actions)) return actions;
  return actions.map((action) => (
    action && typeof action === "object"
      ? { ...action, label: sanitizeDisplayString(action.label) }
      : action
  ));
}

export function enforceAnswerInvariants(result) {
  if (!result?.handled) return result;
  return {
    ...result,
    ...(result.text == null ? {} : { text: sanitizeDisplayString(result.text) }),
    ...(result.structuredAnswer == null ? {} : { structuredAnswer: sanitizeStructuredAnswer(result.structuredAnswer) }),
    ...(result.visual == null ? {} : { visual: sanitizeDisplayVisual(result.visual) }),
    ...(result.moduleSpec == null ? {} : { moduleSpec: sanitizeModuleSpec(result.moduleSpec) }),
    ...(Array.isArray(result.moduleSpecs) ? { moduleSpecs: result.moduleSpecs.map(sanitizeModuleSpec) } : {}),
    ...(Array.isArray(result.actions) ? { actions: sanitizeActions(result.actions) } : {}),
    ...(result.trace == null ? {} : { trace: sanitizeTrace(result.trace) })
  };
}

/**
 * @param {{
 *   tool: string,
 *   dataSource?: string,
 *   rowCount?: number | null,
 *   facility?: { community_name?: unknown, facility_id?: unknown } | null,
 *   period?: string | null,
 *   note?: string | null,
 *   truthState?: string | null
 * }} input
 */
export function makeTrace(/** @type {{
  tool: string,
  dataSource?: string,
  rowCount?: number | null,
  facility?: { community_name?: unknown, facility_id?: unknown } | null,
  period?: string | null,
  note?: string | null,
  truthState?: string | null
}} */ {
  tool,
  dataSource = "published platform snapshot",
  rowCount = null,
  facility = null,
  period = null,
  note = null,
  truthState = null
}) {
  return normalizeKnownCommunityNamesDeep({
    source: "local-data-tool",
    tool,
    dataSource,
    rowCount,
    communityName: facility?.community_name ?? null,
    facilityId: facility?.facility_id ?? null,
    period,
    note,
    truthState: truthState && TOOL_TRUTH_STATES.has(String(truthState)) ? truthState : null,
    engineVersion: TOOL_ENGINE_VERSION
  });
}

export function attachTrace(result, fallback = {}) {
  if (!result?.handled) return result;
  const tool = result.tool ?? fallback.tool ?? "unknown_tool";
  return {
    ...result,
    trace: normalizeKnownCommunityNamesDeep(
      result.trace ?? makeTrace({
        tool,
        dataSource: fallback.dataSource,
        rowCount: fallback.rowCount,
        facility: fallback.facility,
        period: fallback.period,
        note: fallback.note
      })
    )
  };
}
