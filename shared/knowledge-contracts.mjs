export const KNOWLEDGE_CONTRACT_VERSION = "1.0";

export const PLATFORM_KNOWLEDGE_RECORD_KINDS = Object.freeze([
  "state_profile",
  "demand_evidence",
  "buyer_target",
  "opportunity",
  "source",
  "document",
  "assertion",
  "note"
]);

export const ASSERTION_STATUSES = Object.freeze([
  "proposed",
  "approved",
  "rejected",
  "superseded"
]);

export const CAPACITY_QUALIFIERS = Object.freeze([
  "licensed",
  "staffed",
  "funded",
  "census",
  "waitlist"
]);

const recordKinds = new Set(PLATFORM_KNOWLEDGE_RECORD_KINDS);
const assertionStatuses = new Set(ASSERTION_STATUSES);
const capacityQualifiers = new Set(CAPACITY_QUALIFIERS);
const MAX_QUERY_LENGTH = 500;
const MAX_SEARCH_LIMIT = 25;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value, maximumLength, { required = false } = {}) {
  if (value == null && !required) return null;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maximumLength) return null;
  return text;
}

function normalizedStringList(value, allowedValues = null) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return [...new Set(rawValues
    .flatMap((entry) => String(entry ?? "").split(","))
    .map((entry) => entry.trim())
    .filter((entry) => entry && (!allowedValues || allowedValues.has(entry))))];
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizePlatformKnowledgeSearchInput(value = {}) {
  const input = isObject(value) ? value : {};
  const query = String(input.query ?? input.q ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const state = boundedString(input.state, 80);
  const status = boundedString(input.status, 80);
  const requestedLimit = Number(input.limit);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_SEARCH_LIMIT)
    : 10;

  return Object.freeze({
    query,
    state,
    status,
    kinds: Object.freeze(normalizedStringList(input.kinds ?? input.kind, recordKinds)),
    limit
  });
}

export function validateKnowledgeSourceInput(value) {
  const errors = [];
  if (!isObject(value)) return { valid: false, errors: ["source must be an object"], value: null };
  const platform = boundedString(value.platform, 120, { required: true });
  const collectorKey = boundedString(value.collectorKey, 240, { required: true });
  const name = boundedString(value.name, 500, { required: true });
  const url = httpsUrl(value.url);
  if (!platform) errors.push("source platform is required");
  if (!collectorKey) errors.push("source collectorKey is required");
  if (!name) errors.push("source name is required");
  if (!url) errors.push("source URL must use HTTPS");
  if (value.config != null && !isObject(value.config)) errors.push("source config must be an object");
  if (value.rateLimitRpm != null && (!Number.isFinite(Number(value.rateLimitRpm)) || Number(value.rateLimitRpm) <= 0)) {
    errors.push("source rateLimitRpm must be positive");
  }
  if (value.cadenceMinutes != null && (!Number.isFinite(Number(value.cadenceMinutes)) || Number(value.cadenceMinutes) < 5)) {
    errors.push("source cadenceMinutes must be at least 5");
  }
  return {
    valid: errors.length === 0,
    errors,
    value: errors.length ? null : {
      platform,
      collectorKey,
      name,
      url,
      tenant: boundedString(value.tenant, 240),
      config: { ...(value.config ?? {}) },
      cadenceMinutes: value.cadenceMinutes == null ? 1440 : Math.round(Number(value.cadenceMinutes)),
      rateLimitRpm: value.rateLimitRpm == null ? 10 : Number(value.rateLimitRpm)
    }
  };
}

export function validateKnowledgeDocumentInput(value) {
  const errors = [];
  if (!isObject(value)) return { valid: false, errors: ["document must be an object"], value: null };
  const sourceId = boundedString(value.sourceId, 256, { required: true });
  const sourceUrl = httpsUrl(value.sourceUrl);
  const title = boundedString(value.title, 1_000, { required: true });
  const mediaType = boundedString(value.mediaType, 160, { required: true });
  const hasContent = typeof value.content === "string" || value.content instanceof Uint8Array;
  if (!sourceId) errors.push("document sourceId is required");
  if (!sourceUrl) errors.push("document sourceUrl must use HTTPS");
  if (!title) errors.push("document title is required");
  if (!mediaType) errors.push("document mediaType is required");
  if (!hasContent) errors.push("document content must be text or bytes");
  return {
    valid: errors.length === 0,
    errors,
    value: errors.length ? null : {
      sourceId,
      sourceUrl,
      title,
      mediaType,
      content: value.content,
      publishedAt: boundedString(value.publishedAt, 64),
      retrievedAt: boundedString(value.retrievedAt, 64),
      etag: boundedString(value.etag, 500),
      lastModified: boundedString(value.lastModified, 160),
      metadata: isObject(value.metadata) ? { ...value.metadata } : {}
    }
  };
}

export function validateKnowledgeAssertionInput(value) {
  const errors = [];
  if (!isObject(value)) return { valid: false, errors: ["assertion must be an object"], value: null };
  const documentId = boundedString(value.documentId, 256, { required: true });
  const entityType = boundedString(value.entityType, 120, { required: true });
  const entityId = boundedString(value.entityId, 256);
  const fieldName = boundedString(value.fieldName, 240, { required: true });
  const valueFields = ["valueText", "valueNum", "valueDate", "valueJson"].filter((field) => value[field] != null);
  const qualifier = boundedString(value.valueQualifier, 120);
  if (!documentId) errors.push("assertion documentId is required");
  if (!entityType) errors.push("assertion entityType is required");
  if (!entityId && !isObject(value.entityHint)) errors.push("assertion requires entityId or entityHint");
  if (!fieldName) errors.push("assertion fieldName is required");
  if (valueFields.length !== 1) errors.push("assertion requires exactly one typed value");
  if (value.valueText != null && !boundedString(value.valueText, 100_000, { required: true })) errors.push("assertion valueText is invalid");
  if (value.valueNum != null && !Number.isFinite(Number(value.valueNum))) errors.push("assertion valueNum must be finite");
  if (value.valueDate != null && !boundedString(value.valueDate, 64, { required: true })) errors.push("assertion valueDate is invalid");
  if (value.page != null && (!Number.isInteger(Number(value.page)) || Number(value.page) < 1)) errors.push("assertion page must be a positive integer");
  if (value.valueJson != null) {
    try {
      JSON.stringify(value.valueJson);
    } catch {
      errors.push("assertion valueJson must be JSON serializable");
    }
  }
  if (value.confidence != null && (!Number.isFinite(Number(value.confidence)) || Number(value.confidence) < 0 || Number(value.confidence) > 1)) {
    errors.push("assertion confidence must be between 0 and 1");
  }
  if (/capacity|beds?|slots?|census|waitlist/i.test(fieldName ?? "") && !capacityQualifiers.has(qualifier)) {
    errors.push(`capacity assertions require valueQualifier: ${CAPACITY_QUALIFIERS.join(", ")}`);
  }
  if (value.status != null && !assertionStatuses.has(value.status)) errors.push("assertion status is invalid");
  if (value.status && value.status !== "proposed") errors.push("new assertions must enter as proposed");
  return {
    valid: errors.length === 0,
    errors,
    value: errors.length ? null : {
      documentId,
      entityType,
      entityId,
      entityHint: isObject(value.entityHint) ? { ...value.entityHint } : null,
      fieldName,
      valueText: value.valueText == null ? null : String(value.valueText).trim(),
      valueNum: value.valueNum == null ? null : Number(value.valueNum),
      valueDate: boundedString(value.valueDate, 64),
      valueJson: value.valueJson ?? null,
      unit: boundedString(value.unit, 120),
      valueQualifier: qualifier,
      quote: boundedString(value.quote, 10_000),
      page: value.page == null ? null : Math.max(1, Math.round(Number(value.page))),
      observedAt: boundedString(value.observedAt, 64),
      validFrom: boundedString(value.validFrom, 64),
      validTo: boundedString(value.validTo, 64),
      confidence: value.confidence == null ? null : Number(value.confidence),
      evidenceGrade: boundedString(value.evidenceGrade, 80),
      extractorVersion: boundedString(value.extractorVersion, 120)
    }
  };
}

export function validateKnowledgeNoteInput(value) {
  const errors = [];
  if (!isObject(value)) return { valid: false, errors: ["note must be an object"], value: null };
  const title = boundedString(value.title, 1_000, { required: true });
  const body = boundedString(value.body, 100_000, { required: true });
  const documentIds = normalizedStringList(value.documentIds).slice(0, 100);
  const status = value.status === "published" ? "published" : "draft";
  if (!title) errors.push("note title is required");
  if (!body) errors.push("note body is required");
  if (status === "published" && !documentIds.length) errors.push("published notes require at least one source document");
  return {
    valid: errors.length === 0,
    errors,
    value: errors.length ? null : {
      id: boundedString(value.id, 256),
      title,
      body,
      status,
      documentIds,
      tags: normalizedStringList(value.tags).slice(0, 50)
    }
  };
}
