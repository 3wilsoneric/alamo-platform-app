import { validateAdHocModuleSpec } from "../../shared/ad-hoc-module-spec.mjs";

const TOOL_TRUTH_STATES = new Set([
  "valid_rows",
  "verified_zero",
  "summary_not_shown",
  "not_loaded",
  "stale",
  "plan_rejected"
]);

const VISUAL_TYPES = new Set([
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

const ACTION_KINDS = new Set(["route", "external", "download", "tool"]);
const MAX_VISUAL_ROWS = 1_000;
const MAX_VISUAL_COLUMNS = 100;
const MAX_VISUAL_CELLS = 100;
const MAX_TOOL_ACTIONS = 20;
const MAX_MODULE_SPECS = 10;
const MAX_TOOL_TEXT_LENGTH = 250_000;
const MAX_TOOL_RESULT_BYTES = 30 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 25_000_000;
const MAX_TRACE_BYTES = 100_000;

function isBoundedString(value, maximumLength, { allowEmpty = false } = {}) {
  return typeof value === "string" && value.length <= maximumLength && (allowEmpty || Boolean(value.trim()));
}

function isSafeInternalRoute(value) {
  // eslint-disable-next-line no-control-regex
  return isBoundedString(value, 1_024) && /^\/(?!\/)/.test(value) && !/[\\\u0000-\u001f\u007f]/.test(value);
}

function isSafeExternalUrl(value) {
  if (!isBoundedString(value, 2_048)) return false;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateAction(action, index) {
  const errors = [];
  const warnings = [];
  if (!isObject(action)) return { errors: [`actions[${index}] is not an object`], warnings };
  if (!isBoundedString(action.label, 240)) errors.push(`actions[${index}] has an invalid label`);
  if (!ACTION_KINDS.has(action.kind)) errors.push(`actions[${index}] has unsupported kind ${String(action.kind)}`);
  if (action.kind === "route" && !isSafeInternalRoute(action.route)) errors.push(`actions[${index}] route action has an invalid route`);
  if (action.kind === "external" && !isSafeExternalUrl(action.url)) errors.push(`actions[${index}] external action has an invalid URL`);
  if (action.kind === "tool" && !isBoundedString(action.tool ?? action.prompt, 12_000)) errors.push(`actions[${index}] tool action is missing a bounded tool or prompt`);
  if (action.kind === "download" && !isBoundedString(action.filename ?? action.url, 2_048)) errors.push(`actions[${index}] download action has no bounded filename or URL`);
  if (action.prompt != null && !isBoundedString(action.prompt, 12_000)) errors.push(`actions[${index}] prompt is invalid`);
  if (action.certifiedQuestionRouteId != null && !isBoundedString(action.certifiedQuestionRouteId, 240)) errors.push(`actions[${index}] certified question route is invalid`);
  if (action.content != null && !isBoundedString(action.content, MAX_DOWNLOAD_BYTES, { allowEmpty: true })) errors.push(`actions[${index}] content is invalid`);
  if (action.filename != null && !isBoundedString(action.filename, 512)) errors.push(`actions[${index}] filename is invalid`);
  if (action.mimeType != null && !isBoundedString(action.mimeType, 240)) errors.push(`actions[${index}] mimeType is invalid`);
  return { errors, warnings };
}

function validateVisual(visual) {
  const errors = [];
  const warnings = [];
  if (!isObject(visual)) return { errors: ["visual is not an object"], warnings };
  if (!VISUAL_TYPES.has(visual.type)) errors.push(`visual has unsupported type ${String(visual.type)}`);
  if (!isBoundedString(visual.title, 500)) errors.push("visual has an invalid title");
  if (visual.subtitle != null && !isBoundedString(visual.subtitle, 2_000, { allowEmpty: true })) errors.push("visual subtitle is invalid");
  if (visual.valueLabel != null && !isBoundedString(visual.valueLabel, 240, { allowEmpty: true })) errors.push("visual valueLabel is invalid");
  if (!Array.isArray(visual.rows)) errors.push("visual.rows must be an array");
  if (visual.columns != null && !Array.isArray(visual.columns)) errors.push("visual.columns must be an array when present");
  if (Array.isArray(visual.rows) && visual.rows.length > MAX_VISUAL_ROWS) errors.push(`visual.rows exceeds ${MAX_VISUAL_ROWS} rows`);
  if (Array.isArray(visual.columns) && visual.columns.length > MAX_VISUAL_COLUMNS) errors.push(`visual.columns exceeds ${MAX_VISUAL_COLUMNS} columns`);
  if (Array.isArray(visual.columns) && !visual.columns.every((column) => isBoundedString(column, 240))) {
    errors.push("visual.columns contains an invalid label");
  }

  (Array.isArray(visual.rows) ? visual.rows : []).forEach((row, index) => {
    if (!isObject(row)) {
      errors.push(`visual.rows[${index}] is not an object`);
      return;
    }
    if (!isBoundedString(row.label, 2_000)) errors.push(`visual.rows[${index}] has an invalid label`);
    if (typeof row.value !== "number" || !Number.isFinite(row.value)) errors.push(`visual.rows[${index}] value is not a finite number`);
    if (row.meta != null && !isBoundedString(row.meta, 4_000, { allowEmpty: true })) errors.push(`visual.rows[${index}].meta is invalid`);
    if (row.cells != null && !Array.isArray(row.cells)) errors.push(`visual.rows[${index}].cells must be an array when present`);
    if (Array.isArray(row.cells) && row.cells.length > MAX_VISUAL_CELLS) errors.push(`visual.rows[${index}].cells exceeds ${MAX_VISUAL_CELLS} cells`);
    if (Array.isArray(row.cells) && !row.cells.every((cell) => cell === null || typeof cell === "string" || (typeof cell === "number" && Number.isFinite(cell)))) {
      errors.push(`visual.rows[${index}].cells contains an invalid value`);
    }
  });

  return { errors, warnings };
}

function countCsvRecords(content) {
  const text = String(content ?? "");
  if (!text) return 0;
  let records = 1;
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\"") {
      if (quoted && text[index + 1] === "\"") {
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "\n" && !quoted) {
      records += 1;
    }
  }
  return text.endsWith("\n") ? records - 1 : records;
}

function validateArtifact(artifact, provenance) {
  const errors = [];
  const warnings = [];
  if (!isObject(artifact)) return { errors: ["artifact is not an object"], warnings };
  if (artifact.type !== "csv") errors.push(`artifact has unsupported type ${String(artifact.type)}`);
  if (!isBoundedString(artifact.filename, 512)) errors.push("artifact has an invalid filename");
  if (!isBoundedString(artifact.mimeType, 240)) errors.push("artifact has an invalid mimeType");
  if (!isBoundedString(artifact.content, MAX_DOWNLOAD_BYTES, { allowEmpty: true })) errors.push("artifact has invalid or oversized content");
  if (artifact.type === "csv") {
    if (!isBoundedString(artifact.rowSetId, 2_000)) errors.push("csv artifact is missing rowSetId");
    if (!Number.isInteger(artifact.rowCount) || artifact.rowCount < 0) errors.push("csv artifact is missing rowCount");
    if (!isObject(provenance)) {
      errors.push("csv artifact is missing provenance");
    } else {
      if (!isBoundedString(provenance.rowSetId, 2_000)) errors.push("csv artifact provenance is missing rowSetId");
      if (!Number.isInteger(provenance.rowCount) || provenance.rowCount < 0) errors.push("csv artifact provenance is missing rowCount");
      if (!isBoundedString(provenance.dataset, 2_000)) errors.push("csv artifact provenance is missing dataset");
    }
    if (String(artifact.content ?? "").trim() && Number.isInteger(artifact.rowCount)) {
      const dataRows = Math.max(countCsvRecords(artifact.content) - 1, 0);
      if (dataRows !== artifact.rowCount) {
        errors.push(`csv artifact rowCount ${artifact.rowCount} does not match content row count ${dataRows}`);
      }
    }
  }
  if (artifact.rowSetId && provenance?.rowSetId && artifact.rowSetId !== provenance.rowSetId) {
    errors.push("artifact rowSetId does not match provenance rowSetId");
  }
  if (artifact.rowCount != null && provenance?.rowCount != null && Number(artifact.rowCount) !== Number(provenance.rowCount)) {
    errors.push("artifact rowCount does not match provenance rowCount");
  }
  return { errors, warnings };
}

function validateModuleSpec(spec, path) {
  const validation = validateAdHocModuleSpec(spec);
  return {
    errors: validation.valid ? [] : validation.errors.map((error) => `${path}: ${error}`),
    warnings: []
  };
}

export function validateToolResultSchema(result) {
  const errors = [];
  const warnings = [];

  if (!isObject(result)) {
    return {
      valid: false,
      errors: ["tool result is not an object"],
      warnings: []
    };
  }

  try {
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_TOOL_RESULT_BYTES) {
      errors.push(`tool result exceeds ${MAX_TOOL_RESULT_BYTES} bytes`);
    }
  } catch {
    errors.push("tool result is not JSON serializable");
  }

  if (result.handled !== true) warnings.push("tool result is not marked handled=true");
  if (!isBoundedString(result.tool, 240)) errors.push("tool result is missing tool");
  if (!isBoundedString(result.text, MAX_TOOL_TEXT_LENGTH)) errors.push("tool result is missing or has oversized text");

  const resultTruthState = result.truthState;
  const traceTruthState = isObject(result.trace) ? result.trace.truthState : undefined;
  const truthState = resultTruthState ?? traceTruthState;
  if (!truthState) {
    errors.push("tool result is missing truthState");
  } else if (!TOOL_TRUTH_STATES.has(String(truthState))) {
    errors.push(`unsupported truthState ${String(truthState)}`);
  }

  if (!isObject(result.trace)) errors.push("trace must be an object");
  if (isObject(result.trace)) {
    try {
      if (Buffer.byteLength(JSON.stringify(result.trace), "utf8") > MAX_TRACE_BYTES) errors.push(`trace exceeds ${MAX_TRACE_BYTES} bytes`);
    } catch {
      errors.push("trace is not JSON serializable");
    }
    if (!isBoundedString(result.trace.tool, 240)) errors.push("trace is missing tool");
    if (!Object.hasOwn(result.trace, "rowCount")) errors.push("trace is missing rowCount");
    if (!traceTruthState) errors.push("trace is missing truthState");
    if (resultTruthState && traceTruthState && String(resultTruthState) !== String(traceTruthState)) {
      errors.push("result truthState does not match trace truthState");
    }
    if (result.trace.rowCount != null && !Number.isFinite(Number(result.trace.rowCount))) {
      warnings.push("trace.rowCount is not numeric");
    }
    if (result.trace.tool && result.tool && result.trace.tool !== result.tool) {
      warnings.push(`trace.tool ${String(result.trace.tool)} differs from result.tool ${String(result.tool)}`);
    }
  }

  if (result.visual != null) {
    const visualValidation = validateVisual(result.visual);
    errors.push(...visualValidation.errors);
    warnings.push(...visualValidation.warnings);
  }

  if (result.artifact != null) {
    const artifactValidation = validateArtifact(result.artifact, result.provenance);
    errors.push(...artifactValidation.errors);
    warnings.push(...artifactValidation.warnings);
  }

  if (result.visual?.type === "table" && result.artifact?.type === "csv" && Number.isFinite(Number(result.artifact.rowCount))) {
    const visualRows = Array.isArray(result.visual.rows) ? result.visual.rows.length : 0;
    const artifactRows = Number(result.artifact.rowCount);
    if (result.visual.originalRowCount != null && !Number.isFinite(Number(result.visual.originalRowCount))) {
      errors.push("table visual originalRowCount must be numeric when present");
    }
    if (Number.isFinite(Number(result.visual.originalRowCount))) {
      const originalRows = Number(result.visual.originalRowCount);
      if (originalRows < visualRows) errors.push("table visual originalRowCount is smaller than rendered rows");
      if (originalRows !== artifactRows) errors.push("table visual originalRowCount does not match csv artifact rowCount");
    } else if (artifactRows !== visualRows) {
      errors.push("table visual preview is missing originalRowCount for csv artifact");
    }
  }

  if (result.moduleSpec != null) {
    const moduleValidation = validateModuleSpec(result.moduleSpec, "moduleSpec");
    errors.push(...moduleValidation.errors);
    warnings.push(...moduleValidation.warnings);
  }

  if (result.moduleSpecs != null && !Array.isArray(result.moduleSpecs)) {
    errors.push("moduleSpecs must be an array when present");
  }
  if (Array.isArray(result.moduleSpecs)) {
    if (result.moduleSpecs.length > MAX_MODULE_SPECS) errors.push(`moduleSpecs exceeds ${MAX_MODULE_SPECS} entries`);
    result.moduleSpecs.forEach((spec, index) => {
      const moduleValidation = validateModuleSpec(spec, `moduleSpecs[${index}]`);
      errors.push(...moduleValidation.errors);
      warnings.push(...moduleValidation.warnings);
    });
  }

  if (result.actions != null && !Array.isArray(result.actions)) {
    errors.push("actions must be an array when present");
  }
  if (Array.isArray(result.actions)) {
    if (result.actions.length > MAX_TOOL_ACTIONS) errors.push(`actions exceeds ${MAX_TOOL_ACTIONS} entries`);
    result.actions.forEach((action, index) => {
      const actionValidation = validateAction(action, index);
      errors.push(...actionValidation.errors);
      warnings.push(...actionValidation.warnings);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function attachToolResultSchemaValidation(result) {
  const validation = validateToolResultSchema(result);
  const trace = isObject(result?.trace) ? result.trace : {};
  return {
    ...result,
    runtimeSchema: {
      version: "tool-result-schema-v1",
      valid: validation.valid,
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
      errors: validation.errors,
      warnings: validation.warnings
    },
    trace: {
      ...trace,
      schemaValid: validation.valid,
      schemaWarningCount: validation.warnings.length,
      schemaErrorCount: validation.errors.length
    }
  };
}
