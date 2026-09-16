import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  KNOWLEDGE_CONTRACT_VERSION,
  normalizePlatformKnowledgeSearchInput,
  validateKnowledgeAssertionInput,
  validateKnowledgeDocumentInput,
  validateKnowledgeNoteInput,
  validateKnowledgeSourceInput
} from "../shared/knowledge-contracts.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultStorePath = path.join(repositoryRoot, "generated/platform-knowledge/store-v1.json");
const DEFAULT_TEXT_INDEX_LIMIT = 250_000;
const STOP_WORDS = new Set([
  "a", "about", "all", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is",
  "it", "of", "on", "or", "that", "the", "their", "this", "to", "was", "were", "what", "when",
  "where", "which", "who", "with"
]);

function nowIso() {
  return new Date().toISOString();
}

function emptyState(initialized = false) {
  const now = nowIso();
  return {
    version: KNOWLEDGE_CONTRACT_VERSION,
    initialized,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    sources: [],
    sourceRuns: [],
    discoveredItems: [],
    documents: [],
    documentLinks: [],
    documentRevisions: [],
    fetchCache: [],
    processQueue: [],
    assertions: [],
    notes: []
  };
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableId(prefix, value) {
  return `${prefix}-${createHash("sha256").update(String(value)).digest("hex").slice(0, 20)}`;
}

function assertValid(validation, label) {
  if (!validation.valid) throw new Error(`${label} is invalid: ${validation.errors.join("; ")}`);
  return validation.value;
}

function parseState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Knowledge store must contain an object.");
  if (value.version !== KNOWLEDGE_CONTRACT_VERSION) throw new Error("Knowledge store has an unsupported version.");
  for (const field of [
    "sources", "sourceRuns", "discoveredItems", "documents", "documentLinks",
    "documentRevisions", "fetchCache", "processQueue", "assertions", "notes"
  ]) {
    if (!Array.isArray(value[field])) throw new Error(`Knowledge store is missing ${field}.`);
  }
  return { ...value, initialized: true };
}

async function readState(storePath) {
  try {
    return parseState(JSON.parse(await readFile(storePath, "utf8")));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return emptyState();
    throw error;
  }
}

async function writeState(storePath, state) {
  const parent = path.dirname(storePath);
  await mkdir(parent, { recursive: true });
  const temporaryPath = path.join(parent, `.store-v1-${randomUUID()}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, storePath);
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
}

function normalizeForHash(content, mediaType) {
  const buffer = content instanceof Uint8Array ? Buffer.from(content) : Buffer.from(String(content), "utf8");
  const normalizedMediaType = (String(mediaType).split(";", 1)[0] ?? "").trim().toLowerCase();
  if (normalizedMediaType === "application/json") {
    try {
      return Buffer.from(JSON.stringify(stableJson(JSON.parse(buffer.toString("utf8")))), "utf8");
    } catch {
      return Buffer.from(buffer.toString("utf8").replace(/\s+/g, " ").trim(), "utf8");
    }
  }
  if (normalizedMediaType.startsWith("text/") || ["application/xml", "application/xhtml+xml"].includes(normalizedMediaType)) {
    return Buffer.from(buffer.toString("utf8").replace(/\s+/g, " ").trim(), "utf8");
  }
  return buffer;
}

function extensionFor(mediaType, sourceUrl) {
  const byMediaType = new Map([
    ["application/pdf", ".pdf"],
    ["application/json", ".json"],
    ["text/html", ".html"],
    ["text/plain", ".txt"],
    ["application/xml", ".xml"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"]
  ]);
  const normalizedMediaType = (String(mediaType).split(";", 1)[0] ?? "").trim().toLowerCase();
  if (byMediaType.has(normalizedMediaType)) return byMediaType.get(normalizedMediaType);
  try {
    const extension = path.extname(new URL(sourceUrl).pathname).toLowerCase();
    if (/^\.[a-z0-9]{1,8}$/.test(extension)) return extension;
  } catch {
    // Input validation reports malformed URLs before this point.
  }
  return ".bin";
}

function artifactRelativePath(hash, extension) {
  return `raw/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}${extension}`;
}

async function writeArtifact(storePath, relativePath, content) {
  const artifactPath = path.join(path.dirname(storePath), ...relativePath.split("/"));
  await mkdir(path.dirname(artifactPath), { recursive: true });
  try {
    await writeFile(artifactPath, content, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;
  }
}

function sourcePublicRecord(source) {
  return {
    id: source.id,
    kind: "source",
    title: source.name,
    summary: `${source.platform} source · ${source.verified ? "verified" : "unverified"} · ${source.active ? "active" : "inactive"}`,
    stateName: source.config?.state ?? null,
    stateCode: source.config?.stateCode ?? null,
    region: source.config?.county ?? null,
    organization: source.config?.organization ?? null,
    status: source.active ? "active" : "inactive",
    asOf: source.updatedAt,
    facts: [
      { label: "Collector", value: source.collectorKey },
      { label: "Cadence", value: `${source.cadenceMinutes} minutes` },
      { label: "Rate limit", value: `${source.rateLimitRpm} requests/minute` }
    ],
    sources: [{ id: source.id, label: source.name, url: source.url }],
    searchBody: JSON.stringify(source.config)
  };
}

function documentPublicRecord(document, state) {
  const links = state.documentLinks.filter((link) => link.documentId === document.id);
  return {
    id: document.id,
    kind: "document",
    title: document.title,
    summary: `${document.mediaType} · content ${document.sha256.slice(0, 12)} · ${links.length} source link${links.length === 1 ? "" : "s"}`,
    stateName: document.metadata?.state ?? null,
    stateCode: document.metadata?.stateCode ?? null,
    region: document.metadata?.county ?? null,
    organization: document.metadata?.organization ?? null,
    status: "archived",
    asOf: document.retrievedAt,
    facts: [
      { label: "SHA-256", value: document.sha256 },
      { label: "Archive path", value: document.artifactPath },
      { label: "Published", value: document.publishedAt }
    ],
    sources: links.map((link) => ({ id: link.id, label: link.title ?? document.title, url: link.url })),
    searchBody: document.indexedText
  };
}

function assertionValue(assertion) {
  const field = ["valueText", "valueNum", "valueDate", "valueJson"].find((key) => assertion[key] != null);
  if (!field) return "";
  const value = field === "valueJson" ? JSON.stringify(assertion[field]) : assertion[field];
  return [value, assertion.unit, assertion.valueQualifier].filter((part) => part != null && part !== "").join(" · ");
}

function assertionPublicRecord(assertion, state) {
  const document = state.documents.find((item) => item.id === assertion.documentId);
  const links = state.documentLinks.filter((link) => link.documentId === assertion.documentId);
  return {
    id: assertion.id,
    kind: "assertion",
    title: `${assertion.entityType}: ${assertion.fieldName}`,
    summary: assertionValue(assertion),
    stateName: assertion.entityHint?.state ?? document?.metadata?.state ?? null,
    stateCode: assertion.entityHint?.stateCode ?? document?.metadata?.stateCode ?? null,
    region: assertion.entityHint?.county ?? document?.metadata?.county ?? null,
    organization: assertion.entityHint?.name ?? document?.metadata?.organization ?? null,
    status: assertion.status,
    asOf: assertion.observedAt ?? assertion.extractedAt,
    facts: [
      { label: "Evidence grade", value: assertion.evidenceGrade },
      { label: "Quote", value: assertion.quote },
      { label: "Page", value: assertion.page }
    ],
    sources: links.map((link) => ({ id: link.id, label: link.title ?? document?.title ?? "Source document", url: link.url })),
    searchBody: [assertion.quote, JSON.stringify(assertion.entityHint)].filter(Boolean).join(" ")
  };
}

function notePublicRecord(note, state) {
  const documents = note.documentIds.map((id) => state.documents.find((document) => document.id === id)).filter(Boolean);
  const documentIds = new Set(documents.map((document) => document.id));
  const links = state.documentLinks.filter((link) => documentIds.has(link.documentId));
  return {
    id: note.id,
    kind: "note",
    title: note.title,
    summary: note.body.slice(0, 500),
    stateName: note.metadata?.state ?? null,
    stateCode: note.metadata?.stateCode ?? null,
    region: note.metadata?.county ?? null,
    organization: note.metadata?.organization ?? null,
    status: note.status,
    asOf: note.updatedAt,
    facts: [
      { label: "Tags", value: note.tags.join(", ") },
      { label: "Source documents", value: note.documentIds.length }
    ],
    sources: links.map((link) => ({ id: link.id, label: link.title ?? "Source document", url: link.url })),
    searchBody: note.body
  };
}

function searchableRecords(state, { includeReviewQueue = false } = {}) {
  return [
    ...state.sources.map(sourcePublicRecord),
    ...state.documents.map((document) => documentPublicRecord(document, state)),
    ...state.assertions
      .filter((assertion) => includeReviewQueue || assertion.status === "approved")
      .map((assertion) => assertionPublicRecord(assertion, state)),
    ...state.notes
      .filter((note) => includeReviewQueue || note.status === "published")
      .map((note) => notePublicRecord(note, state))
  ];
}

function searchTokens(query) {
  return [...new Set(normalizeText(query).split(" ").filter((token) => token.length >= 2 && !STOP_WORDS.has(token)))];
}

function scoreRecord(record, query, tokens) {
  if (!query) return 1;
  const title = normalizeText(record.title);
  const summary = normalizeText(record.summary);
  const body = normalizeText([
    record.title, record.summary, record.stateName, record.stateCode, record.region,
    record.organization, record.status, JSON.stringify(record.facts), record.searchBody
  ].filter(Boolean).join(" "));
  let score = title.includes(query) ? 70 : summary.includes(query) ? 35 : 0;
  let matched = 0;
  for (const token of tokens) {
    if (!body.includes(token)) continue;
    matched += 1;
    score += title.includes(token) ? 14 : summary.includes(token) ? 8 : 3;
  }
  if (tokens.length && matched === tokens.length) score += 30;
  return score;
}

function currentFactKey(assertion) {
  return `${assertion.entityType}:${assertion.entityId ?? JSON.stringify(assertion.entityHint)}:${assertion.fieldName}`;
}

function enqueueStage(state, documentId, stage, status = "pending") {
  const existing = state.processQueue.find((item) => item.documentId === documentId && item.stage === stage);
  if (existing) return existing;
  const timestamp = nowIso();
  const item = {
    id: stableId("process", `${documentId}:${stage}`),
    documentId,
    stage,
    status,
    attempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: status === "completed" ? timestamp : null,
    error: null
  };
  state.processQueue.push(item);
  return item;
}

function evidenceGradeRank(value) {
  const normalized = normalizeText(value);
  if (normalized.includes("primary") || normalized.includes("official")) return 3;
  if (normalized.includes("secondary")) return 2;
  return normalized ? 1 : 0;
}

function assertionTime(assertion) {
  return assertion.observedAt ?? assertion.reviewedAt ?? assertion.extractedAt ?? "";
}

function compareCurrentFactCandidate(left, right) {
  const observed = String(assertionTime(left)).localeCompare(String(assertionTime(right)));
  if (observed) return observed;
  const evidence = evidenceGradeRank(left.evidenceGrade) - evidenceGradeRank(right.evidenceGrade);
  if (evidence) return evidence;
  const extracted = String(left.extractedAt ?? "").localeCompare(String(right.extractedAt ?? ""));
  if (extracted) return extracted;
  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}

function validRangesOverlap(left, right) {
  const leftStart = left.validFrom ?? "0000-01-01";
  const rightStart = right.validFrom ?? "0000-01-01";
  const leftEnd = left.validTo ?? "9999-12-31";
  const rightEnd = right.validTo ?? "9999-12-31";
  return String(leftStart) <= String(rightEnd) && String(rightStart) <= String(leftEnd);
}

function stripSearchBody(record) {
  const { searchBody: _searchBody, ...publicRecord } = record;
  return publicRecord;
}

export function createPlatformKnowledgeStore({ storePath = defaultStorePath } = {}) {
  const resolvedStorePath = path.resolve(storePath);
  let writeQueue = Promise.resolve();

  async function mutate(mutator) {
    const operation = writeQueue.then(async () => {
      const state = await readState(resolvedStorePath);
      const result = await mutator(state);
      state.initialized = true;
      state.revision += 1;
      state.updatedAt = nowIso();
      await writeState(resolvedStorePath, state);
      return result;
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  async function initialize() {
    const state = await readState(resolvedStorePath);
    state.initialized = true;
    await writeState(resolvedStorePath, state);
    return getSummaryFromState(state);
  }

  async function registerSource(input) {
    const source = assertValid(validateKnowledgeSourceInput(input), "Knowledge source");
    return mutate((state) => {
      const key = `${source.platform}:${source.collectorKey}`;
      const existing = state.sources.find((item) => item.registryKey === key);
      const timestamp = nowIso();
      if (existing) {
        const requiresReview =
          existing.url !== source.url ||
          existing.tenant !== source.tenant ||
          JSON.stringify(stableJson(existing.config)) !== JSON.stringify(stableJson(source.config));
        Object.assign(existing, source, { updatedAt: timestamp });
        if (requiresReview) {
          existing.verified = false;
          existing.active = false;
          existing.verifiedBy = null;
          existing.verifiedAt = null;
          existing.blockedAt = null;
          existing.blockedReason = "source endpoint or configuration changed; review required";
        }
        return { created: false, requiresReview, source: { ...existing } };
      }
      const record = {
        id: stableId("source", key),
        registryKey: key,
        ...source,
        verified: false,
        active: false,
        verifiedBy: null,
        verifiedAt: null,
        consecutiveFailures: 0,
        blockedAt: null,
        blockedReason: null,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      state.sources.push(record);
      return { created: true, source: { ...record } };
    });
  }

  async function reviewSource(sourceId, { verified, active, reviewer }) {
    const reviewerName = String(reviewer ?? "").trim();
    if (!reviewerName || reviewerName.length > 500) throw new Error("Source review requires a bounded reviewer identity.");
    if (typeof verified !== "boolean" || typeof active !== "boolean") throw new Error("Source review requires boolean verified and active decisions.");
    if (active && !verified) throw new Error("An unverified source cannot be active.");
    return mutate((state) => {
      const source = state.sources.find((item) => item.id === sourceId);
      if (!source) throw new Error("Knowledge source was not found.");
      const timestamp = nowIso();
      source.verified = verified;
      source.active = active;
      source.verifiedBy = reviewerName;
      source.verifiedAt = timestamp;
      source.updatedAt = timestamp;
      if (active) {
        source.blockedAt = null;
        source.blockedReason = null;
      } else {
        source.blockedReason = source.blockedReason ?? "deactivated by reviewer";
      }
      return { ...source };
    });
  }

  async function recordSourceRun({ sourceId, status, discoveredCount = 0, detail = null }) {
    return mutate((state) => {
      const source = state.sources.find((item) => item.id === sourceId);
      if (!source) throw new Error("Knowledge source was not found.");
      const run = {
        id: randomUUID(),
        sourceId,
        status: String(status ?? "unknown"),
        discoveredCount: Math.max(0, Math.round(Number(discoveredCount) || 0)),
        detail: detail == null ? null : String(detail).slice(0, 4_000),
        ranAt: nowIso()
      };
      state.sourceRuns.push(run);
      if (run.status === "ok") source.consecutiveFailures = 0;
      else source.consecutiveFailures += 1;
      source.updatedAt = run.ranAt;
      return { ...run };
    });
  }

  async function markSourceBlocked(sourceId, reason) {
    return mutate((state) => {
      const source = state.sources.find((item) => item.id === sourceId);
      if (!source) throw new Error("Knowledge source was not found.");
      source.active = false;
      source.blockedAt = nowIso();
      source.blockedReason = String(reason ?? "blocked").slice(0, 2_000);
      source.updatedAt = source.blockedAt;
      return { ...source };
    });
  }

  async function recordDiscoveredItem({ sourceId, dedupeKey, url, title, itemType = "document", publishedAt = null, listingHash, metadata = {} }) {
    return mutate((state) => {
      if (!state.sources.some((source) => source.id === sourceId)) throw new Error("Knowledge source was not found.");
      const sourceUrl = new URL(String(url));
      if (sourceUrl.protocol !== "https:") throw new Error("Discovered item URL must use HTTPS.");
      const key = String(dedupeKey ?? url).trim();
      if (!key) throw new Error("Discovered item requires a dedupe key.");
      const timestamp = nowIso();
      const existing = state.discoveredItems.find((item) => item.sourceId === sourceId && item.dedupeKey === key);
      if (existing) {
        const changed = existing.listingHash !== String(listingHash ?? "");
        Object.assign(existing, {
          url: sourceUrl.toString(),
          title: String(title ?? existing.title).slice(0, 1_000),
          itemType: String(itemType),
          publishedAt,
          listingHash: String(listingHash ?? ""),
          metadata: { ...metadata },
          status: changed ? "pending" : existing.status,
          updatedAt: timestamp
        });
        return { created: false, changed, item: { ...existing } };
      }
      const item = {
        id: stableId("item", `${sourceId}:${key}`),
        sourceId,
        dedupeKey: key,
        url: sourceUrl.toString(),
        title: String(title ?? url).slice(0, 1_000),
        itemType: String(itemType),
        publishedAt,
        listingHash: String(listingHash ?? ""),
        metadata: { ...metadata },
        status: "pending",
        createdAt: timestamp,
        updatedAt: timestamp
      };
      state.discoveredItems.push(item);
      return { created: true, changed: false, item: { ...item } };
    });
  }

  async function ingestDocument(input) {
    const documentInput = assertValid(validateKnowledgeDocumentInput(input), "Knowledge document");
    const originalBytes = documentInput.content instanceof Uint8Array
      ? Buffer.from(documentInput.content)
      : Buffer.from(documentInput.content, "utf8");
    const normalizedBytes = normalizeForHash(originalBytes, documentInput.mediaType);
    const sha256 = createHash("sha256").update(normalizedBytes).digest("hex");
    const extension = extensionFor(documentInput.mediaType, documentInput.sourceUrl);
    const relativeArtifactPath = artifactRelativePath(sha256, extension);
    return mutate(async (state) => {
      const source = state.sources.find((item) => item.id === documentInput.sourceId);
      if (!source) throw new Error("Knowledge source was not found.");
      if (!source.verified || !source.active) throw new Error("Only active, human-verified sources may archive documents.");
      await writeArtifact(resolvedStorePath, relativeArtifactPath, originalBytes);
      const timestamp = documentInput.retrievedAt ?? nowIso();
      let document = state.documents.find((item) => item.sha256 === sha256);
      const created = !document;
      if (!document) {
        const canIndexText = documentInput.mediaType.startsWith("text/") || documentInput.mediaType.includes("json") || documentInput.mediaType.includes("xml");
        document = {
          id: `document-${sha256}`,
          sha256,
          title: documentInput.title,
          mediaType: documentInput.mediaType,
          byteLength: originalBytes.length,
          artifactPath: relativeArtifactPath,
          indexedText: canIndexText ? originalBytes.toString("utf8").slice(0, DEFAULT_TEXT_INDEX_LIMIT) : null,
          textBlobPath: null,
          pageCount: null,
          publishedAt: documentInput.publishedAt,
          retrievedAt: timestamp,
          metadata: documentInput.metadata,
          createdAt: nowIso()
        };
        state.documents.push(document);
        enqueueStage(state, document.id, "text_extract", canIndexText ? "completed" : "pending");
      }

      const priorLink = [...state.documentLinks]
        .filter((link) => link.url === documentInput.sourceUrl)
        .sort((left, right) => String(right.retrievedAt).localeCompare(String(left.retrievedAt)))[0];
      let revision = null;
      if (priorLink && priorLink.documentId !== document.id) {
        revision = {
          id: stableId("revision", `${documentInput.sourceUrl}:${priorLink.documentId}:${document.id}`),
          url: documentInput.sourceUrl,
          priorDocumentId: priorLink.documentId,
          documentId: document.id,
          detectedAt: timestamp
        };
        if (!state.documentRevisions.some((item) => item.id === revision.id)) state.documentRevisions.push(revision);
      }

      const linkId = stableId("document-link", `${document.id}:${documentInput.sourceUrl}`);
      if (!state.documentLinks.some((link) => link.id === linkId)) {
        state.documentLinks.push({
          id: linkId,
          sourceId: documentInput.sourceId,
          documentId: document.id,
          url: documentInput.sourceUrl,
          title: documentInput.title,
          retrievedAt: timestamp,
          etag: documentInput.etag,
          lastModified: documentInput.lastModified
        });
      }
      const cache = state.fetchCache.find((item) => item.url === documentInput.sourceUrl);
      const cacheValue = {
        url: documentInput.sourceUrl,
        etag: documentInput.etag,
        lastModified: documentInput.lastModified,
        documentId: document.id,
        sha256,
        updatedAt: timestamp
      };
      if (cache) Object.assign(cache, cacheValue);
      else state.fetchCache.push(cacheValue);
      const discovered = state.discoveredItems.find((item) => item.sourceId === documentInput.sourceId && item.url === documentInput.sourceUrl);
      if (discovered) {
        discovered.status = "fetched";
        discovered.documentId = document.id;
        discovered.updatedAt = timestamp;
      }
      return { created, deduplicated: !created, revision: revision ? { ...revision } : null, document: { ...document } };
    });
  }

  async function attachExtractedText(documentId, { text, pageCount = null }) {
    const extractedText = String(text ?? "").trim();
    if (!extractedText || extractedText.length > 5_000_000) throw new Error("Extracted text must contain 1 to 5,000,000 characters.");
    if (pageCount != null && (!Number.isInteger(Number(pageCount)) || Number(pageCount) < 1)) {
      throw new Error("Extracted text pageCount must be a positive integer.");
    }
    return mutate(async (state) => {
      const document = state.documents.find((item) => item.id === documentId);
      if (!document) throw new Error("Knowledge document was not found.");
      const textPath = `text/${document.sha256.slice(0, 2)}/${document.sha256.slice(2, 4)}/${document.sha256}.txt`;
      await writeArtifact(resolvedStorePath, textPath, Buffer.from(extractedText, "utf8"));
      document.textBlobPath = textPath;
      document.indexedText = extractedText.slice(0, DEFAULT_TEXT_INDEX_LIMIT);
      document.pageCount = pageCount == null ? document.pageCount : Number(pageCount);
      const queueItem = enqueueStage(state, document.id, "text_extract");
      queueItem.status = "completed";
      queueItem.updatedAt = nowIso();
      queueItem.completedAt = queueItem.updatedAt;
      queueItem.error = null;
      return { document: { ...document }, process: { ...queueItem } };
    });
  }

  async function proposeAssertion(input) {
    const assertionInput = assertValid(validateKnowledgeAssertionInput(input), "Knowledge assertion");
    return mutate((state) => {
      if (!state.documents.some((document) => document.id === assertionInput.documentId)) {
        throw new Error("Assertion source document was not found.");
      }
      const timestamp = nowIso();
      const assertion = {
        id: randomUUID(),
        ...assertionInput,
        status: "proposed",
        extractedAt: timestamp,
        supersededBy: null,
        reviewer: null,
        reviewedAt: null
      };
      state.assertions.push(assertion);
      return { ...assertion };
    });
  }

  async function reviewAssertion(assertionId, { decision, reviewer }) {
    if (!["approved", "rejected"].includes(decision)) throw new Error("Assertion decision must be approved or rejected.");
    const reviewerName = String(reviewer ?? "").trim();
    if (!reviewerName || reviewerName.length > 500) throw new Error("Assertion review requires a bounded reviewer identity.");
    return mutate((state) => {
      const assertion = state.assertions.find((item) => item.id === assertionId);
      if (!assertion) throw new Error("Knowledge assertion was not found.");
      if (assertion.status !== "proposed") throw new Error("Only proposed assertions may be reviewed.");
      assertion.status = decision;
      assertion.reviewer = reviewerName;
      assertion.reviewedAt = nowIso();
      return { ...assertion };
    });
  }

  async function putNote(input) {
    const noteInput = assertValid(validateKnowledgeNoteInput(input), "Knowledge note");
    return mutate((state) => {
      for (const documentId of noteInput.documentIds) {
        if (!state.documents.some((document) => document.id === documentId)) throw new Error(`Note source document ${documentId} was not found.`);
      }
      const timestamp = nowIso();
      const id = noteInput.id ?? stableId("note", noteInput.title);
      const existing = state.notes.find((note) => note.id === id);
      const record = {
        ...(existing ?? { id, createdAt: timestamp }),
        ...noteInput,
        id,
        updatedAt: timestamp
      };
      if (existing) Object.assign(existing, record);
      else state.notes.push(record);
      return { ...record };
    });
  }

  async function search(input = {}, options = {}) {
    const state = await readState(resolvedStorePath);
    const filters = normalizePlatformKnowledgeSearchInput(input);
    const normalizedQuery = normalizeText(filters.query);
    const tokens = searchTokens(filters.query);
    const requestedKinds = new Set(filters.kinds);
    const stateFilter = normalizeText(filters.state);
    const statusFilter = normalizeText(filters.status);
    const ranked = searchableRecords(state, options)
      .filter((record) => !requestedKinds.size || requestedKinds.has(record.kind))
      .filter((record) => !stateFilter || [record.stateName, record.stateCode].some((value) => normalizeText(value) === stateFilter))
      .filter((record) => !statusFilter || normalizeText(record.status) === statusFilter)
      .map((record) => ({ ...record, score: scoreRecord(record, normalizedQuery, tokens) }))
      .filter((record) => record.score > 0)
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
    return {
      version: KNOWLEDGE_CONTRACT_VERSION,
      source: "local-platform-knowledge-store",
      query: filters.query,
      filters: { state: filters.state, status: filters.status, kinds: filters.kinds },
      total: ranked.length,
      results: ranked.slice(0, filters.limit).map(stripSearchBody),
      coverage: getSummaryFromState(state)
    };
  }

  async function getRecord(recordId, options = {}) {
    const state = await readState(resolvedStorePath);
    const record = searchableRecords(state, options).find((entry) => entry.id === String(recordId ?? "").trim());
    return record ? stripSearchBody(record) : null;
  }

  async function getSummary() {
    return getSummaryFromState(await readState(resolvedStorePath));
  }

  async function getReviewQueue() {
    const state = await readState(resolvedStorePath);
    return {
      version: KNOWLEDGE_CONTRACT_VERSION,
      unverifiedSources: state.sources.filter((source) => !source.verified || !source.active).map((source) => ({ ...source })),
      proposedAssertions: state.assertions.filter((assertion) => assertion.status === "proposed").map((assertion) => ({ ...assertion })),
      draftNotes: state.notes.filter((note) => note.status === "draft").map((note) => ({ ...note })),
      pendingItems: state.discoveredItems.filter((item) => item.status === "pending").map((item) => ({ ...item })),
      pendingProcessing: state.processQueue.filter((item) => item.status === "pending").map((item) => ({ ...item }))
    };
  }

  async function getCurrentFacts() {
    const state = await readState(resolvedStorePath);
    const byKey = new Map();
    for (const assertion of state.assertions.filter((item) => item.status === "approved")) {
      const key = currentFactKey(assertion);
      const existing = byKey.get(key);
      if (!existing || compareCurrentFactCandidate(assertion, existing) > 0) byKey.set(key, assertion);
    }
    return [...byKey.values()].map((assertion) => ({ ...assertion }));
  }

  async function getAssertionConflicts() {
    const state = await readState(resolvedStorePath);
    const groups = new Map();
    for (const assertion of state.assertions.filter((item) => item.status === "approved")) {
      const key = currentFactKey(assertion);
      groups.set(key, [...(groups.get(key) ?? []), assertion]);
    }
    return [...groups.entries()].flatMap(([key, assertions]) => {
      const conflicting = assertions.filter((assertion, index) =>
        assertions.some((other, otherIndex) =>
          otherIndex !== index && assertionValue(other) !== assertionValue(assertion) && validRangesOverlap(assertion, other)
        )
      );
      return conflicting.length > 1 ? [{ key, assertions: conflicting.map((assertion) => ({ ...assertion })) }] : [];
    });
  }

  return Object.freeze({
    storePath: resolvedStorePath,
    initialize,
    registerSource,
    reviewSource,
    recordSourceRun,
    markSourceBlocked,
    recordDiscoveredItem,
    ingestDocument,
    attachExtractedText,
    proposeAssertion,
    reviewAssertion,
    putNote,
    search,
    getRecord,
    getSummary,
    getReviewQueue,
    getCurrentFacts,
    getAssertionConflicts
  });
}

function getSummaryFromState(state) {
  return {
    version: KNOWLEDGE_CONTRACT_VERSION,
    initialized: state.initialized === true,
    revision: state.revision,
    updatedAt: state.initialized === true ? state.updatedAt : null,
    sources: state.sources.length,
    activeSources: state.sources.filter((source) => source.active).length,
    blockedSources: state.sources.filter((source) => source.blockedAt).length,
    sourceRuns: state.sourceRuns.length,
    discoveredItems: state.discoveredItems.length,
    pendingItems: state.discoveredItems.filter((item) => item.status === "pending").length,
    documents: state.documents.length,
    documentLinks: state.documentLinks.length,
    documentRevisions: state.documentRevisions.length,
    pendingProcessing: state.processQueue.filter((item) => item.status === "pending").length,
    completedProcessing: state.processQueue.filter((item) => item.status === "completed").length,
    proposedAssertions: state.assertions.filter((assertion) => assertion.status === "proposed").length,
    approvedAssertions: state.assertions.filter((assertion) => assertion.status === "approved").length,
    rejectedAssertions: state.assertions.filter((assertion) => assertion.status === "rejected").length,
    notes: state.notes.length,
    publishedNotes: state.notes.filter((note) => note.status === "published").length
  };
}

let defaultStore = null;

export function getDefaultPlatformKnowledgeStore() {
  if (!defaultStore) defaultStore = createPlatformKnowledgeStore();
  return defaultStore;
}
