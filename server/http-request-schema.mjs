import { sanitizeAnalysisFrame } from "../shared/analysis-session-state.mjs";
import { FULL_REPORT_DEFINITIONS } from "../shared/full-report.mjs";
import { createHttpError } from "./http-errors.mjs";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalid(message) {
  return createHttpError(400, "request_schema_invalid", message);
}

function assertObject(value, label = "request body") {
  if (!isObject(value)) throw invalid(`${label} must be a JSON object.`);
  return value;
}

function assertOptionalString(value, field, maximumLength = MAX_MESSAGE_LENGTH) {
  if (value == null) return;
  if (typeof value !== "string") throw invalid(`${field} must be a string when provided.`);
  if (value.length > maximumLength) throw invalid(`${field} exceeds the ${maximumLength}-character limit.`);
}

function assertRequiredString(value, field, maximumLength = MAX_MESSAGE_LENGTH) {
  if (typeof value !== "string" || !value.trim()) throw invalid(`${field} is required.`);
  if (value.length > maximumLength) throw invalid(`${field} exceeds the ${maximumLength}-character limit.`);
}

function assertOptionalBoolean(value, field) {
  if (value === undefined) return;
  if (typeof value !== "boolean") throw invalid(`${field} must be boolean when provided.`);
}

function assertOptionalAnalysisFrame(value) {
  if (value == null) return value;
  const frame = sanitizeAnalysisFrame(value);
  if (!frame) throw invalid("analysisFrame is invalid or exceeds its limits.");
  return frame;
}

function assertOptionalHistory(value) {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw invalid("history must be an array when provided.");
  if (value.length > MAX_HISTORY_MESSAGES) throw invalid(`history exceeds the ${MAX_HISTORY_MESSAGES}-message limit.`);
  value.forEach((message, index) => {
    const row = assertObject(message, `history[${index}]`);
    if (!["assistant", "user"].includes(row.role)) {
      throw invalid(`history[${index}].role must be "assistant" or "user".`);
    }
    assertRequiredString(row.text, `history[${index}].text`, MAX_MESSAGE_LENGTH);
  });
}

export function validateClaudeMessageRequest(value) {
  const body = assertObject(value);
  assertRequiredString(body.content, "content", MAX_CONTENT_LENGTH);
  assertOptionalString(body.threadId, "threadId", MAX_IDENTIFIER_LENGTH);
  assertOptionalString(body.sessionId, "sessionId", MAX_IDENTIFIER_LENGTH);
  const analysisFrame = assertOptionalAnalysisFrame(body.analysisFrame);
  assertOptionalBoolean(body.ignoreAnalysisFrame, "ignoreAnalysisFrame");
  assertOptionalBoolean(body.forceClaude, "forceClaude");
  assertOptionalHistory(body.history);
  return {
    content: body.content,
    ...(body.threadId !== undefined ? { threadId: body.threadId } : {}),
    ...(body.sessionId !== undefined ? { sessionId: body.sessionId } : {}),
    ...(body.analysisFrame !== undefined ? { analysisFrame } : {}),
    ...(body.ignoreAnalysisFrame !== undefined ? { ignoreAnalysisFrame: body.ignoreAnalysisFrame } : {}),
    ...(body.forceClaude !== undefined ? { forceClaude: body.forceClaude } : {}),
    ...(body.history !== undefined ? { history: body.history } : {})
  };
}

export function validateCopilotToolRequest(value) {
  const body = assertObject(value);
  assertRequiredString(body.content, "content", MAX_CONTENT_LENGTH);
  assertOptionalString(body.sessionId, "sessionId", MAX_IDENTIFIER_LENGTH);
  assertOptionalString(body.certifiedQuestionRouteId, "certifiedQuestionRouteId", MAX_IDENTIFIER_LENGTH);
  const analysisFrame = assertOptionalAnalysisFrame(body.analysisFrame);
  return {
    content: body.content,
    ...(body.sessionId !== undefined ? { sessionId: body.sessionId } : {}),
    ...(body.certifiedQuestionRouteId !== undefined ? { certifiedQuestionRouteId: body.certifiedQuestionRouteId } : {}),
    ...(body.analysisFrame !== undefined ? { analysisFrame } : {})
  };
}

export function validateCopilotIntentRequest(value) {
  return validateCopilotToolRequest(value);
}

export function validateSessionResetRequest(value) {
  const body = assertObject(value);
  assertOptionalString(body.sessionId, "sessionId", MAX_IDENTIFIER_LENGTH);
  return body.sessionId === undefined ? {} : { sessionId: body.sessionId };
}

function validateReportOptions(value) {
  if (value === undefined) return {};
  const options = assertObject(value, "options");
  assertOptionalString(options.audience, "options.audience", 64);
  assertOptionalString(options.emphasis, "options.emphasis", 64);
  return {
    ...(options.audience !== undefined ? { audience: options.audience } : {}),
    ...(options.emphasis !== undefined ? { emphasis: options.emphasis } : {})
  };
}

export function validateGovernedReportRequest(value) {
  const body = assertObject(value);
  if (!Array.isArray(body.sources) || body.sources.length < 1 || body.sources.length > 12) {
    throw invalid("sources must contain 1 to 12 verified answer bundles.");
  }
  body.sources.forEach((source, index) => assertObject(source, `sources[${index}]`));
  return {
    sources: body.sources,
    options: validateReportOptions(body.options)
  };
}

const FULL_REPORT_IDS = new Set(FULL_REPORT_DEFINITIONS.map((definition) => definition.id));

export function validateFullReportRequest(value) {
  const body = assertObject(value);
  assertRequiredString(body.reportId, "reportId", 64);
  if (!FULL_REPORT_IDS.has(body.reportId)) {
    throw invalid(`reportId must be one of: ${[...FULL_REPORT_IDS].join(", ")}.`);
  }
  assertOptionalString(body.facilityId, "facilityId", 64);
  assertOptionalString(body.period, "period", 7);
  assertOptionalString(body.audience, "audience", 64);
  if (body.facilityId !== undefined && !/^[a-z0-9_-]{1,64}$/i.test(body.facilityId)) {
    throw invalid("facilityId is invalid.");
  }
  if (body.period !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.period)) {
    throw invalid("period must use YYYY-MM.");
  }
  if (body.reportId === "community" && !body.facilityId) {
    throw invalid("facilityId is required for a community report.");
  }
  return {
    reportId: body.reportId,
    ...(body.facilityId !== undefined ? { facilityId: body.facilityId } : {}),
    ...(body.period !== undefined ? { period: body.period } : {}),
    ...(body.audience !== undefined ? { audience: body.audience } : {})
  };
}

const MAX_CONTENT_LENGTH = 12_000;
const MAX_MESSAGE_LENGTH = 20_000;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_HISTORY_MESSAGES = 50;
