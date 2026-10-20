import { ManagedIdentityCredential } from "@azure/identity";
import { LIC624_FORM_DEFINITION, LIC624_INCIDENT_TYPE_FIELDS } from "../shared/lic624-contracts.mjs";
import { getLic624ReviewIssues, validateLic624ReviewData } from "./lic624-review.mjs";

const API_VERSION = "2024-11-30";
const MODEL = "prebuilt-layout";
const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const MAX_POLLS = 45;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const label = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const KNOWN_HEADING = /^(?:date|yes|no|what happened|persons who observed|person s who observed|immediate action|explain what immediate action|nature of treatment|where administered|administered by|follow up treatment|action taken planned|action taken or planned|supervisor comments|attending physician|submitted by|reviewed by|submission and review|notifications|medical treatment necessary|fictional test data)/;

function endpoint() {
  const raw = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim();
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".cognitiveservices.azure.com") || url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid Document Intelligence endpoint configuration.");
  }
  return url.origin;
}

async function boundedJson(response) {
  const body = await response.text();
  if (body.length > MAX_RESULT_BYTES) throw new Error("Document Intelligence result exceeded its size limit.");
  return JSON.parse(body);
}

async function requestWithThrottleRetry(fetchImpl, url, options) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetchImpl(url, options);
    if (![429, 503].includes(response.status) || attempt === 3) return response;
    const retryAfter = Number(response.headers?.get?.("retry-after"));
    await sleep(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 1_000 * (2 ** attempt), 8_000));
  }
  throw new Error("Document Intelligence remained unavailable.");
}

/** Analyze with the Platform's managed identity. No subscription key is used by the app. */
export async function analyzeLic624Scan(bytes, { fetchImpl = fetch, credential = null } = {}) {
  const origin = endpoint();
  if (!origin) return null;
  const clientId = process.env.AZURE_CLIENT_ID?.trim();
  if (!credential && !clientId) throw new Error("Document Intelligence managed identity is not configured.");
  const identity = credential ?? new ManagedIdentityCredential(clientId || "");
  const token = await identity.getToken("https://cognitiveservices.azure.com/.default");
  if (!token?.token) throw new Error("Document Intelligence authentication failed.");
  const authorization = `Bearer ${token.token}`;
  const start = await requestWithThrottleRetry(fetchImpl, `${origin}/documentintelligence/documentModels/${MODEL}:analyze?api-version=${API_VERSION}&features=keyValuePairs`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/octet-stream" },
    body: bytes,
    signal: AbortSignal.timeout(40_000)
  });
  if (start.status !== 202) throw new Error(`Document Intelligence analyze request failed (${start.status}).`);
  const operation = start.headers.get("operation-location");
  const resultUrl = operation && new URL(operation);
  if (!resultUrl || resultUrl.origin !== origin || !resultUrl.pathname.startsWith(`/documentintelligence/documentModels/${MODEL}/analyzeResults/`)) {
    throw new Error("Document Intelligence returned an invalid result location.");
  }
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    await sleep(attempt < 3 ? 1_000 : 2_000);
    const response = await requestWithThrottleRetry(fetchImpl, resultUrl, {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) throw new Error(`Document Intelligence result request failed (${response.status}).`);
    const result = await boundedJson(response);
    if (result.status === "succeeded") return result.analyzeResult;
    if (result.status === "failed") throw new Error("Document Intelligence could not analyze this scan.");
  }
  throw new Error("Document Intelligence analysis timed out.");
}

function recognizedPairs(analysis) {
  return (analysis?.keyValuePairs ?? []).map((pair) => ({
    key: label(pair.key?.content),
    value: clean(pair.value?.content),
    confidence: Number(pair.confidence ?? 0),
    page: Number(pair.value?.boundingRegions?.[0]?.pageNumber ?? pair.key?.boundingRegions?.[0]?.pageNumber ?? 0)
  })).filter((pair) => pair.key && pair.value && pair.confidence >= 0.85);
}

function findValue(pairs, ...patterns) {
  return pairs.find((pair) => patterns.some((pattern) => pattern.test(pair.key)) && !/^:(?:selected|unselected):$/.test(pair.value))?.value ?? "";
}

function pageLines(analysis, index) {
  const page = analysis?.pages?.[index];
  return (page?.lines ?? []).map((line) => ({
    text: clean(line.content),
    x: Number(line.polygon?.[0] ?? 0) / Number(page.width || 1),
    y: Number(line.polygon?.[1] ?? 0) / Number(page.height || 1)
  }));
}

function lineAfter(lines, anchor, { maxDistance = 0.055, side = null } = {}) {
  const at = lines.find((line) => anchor.test(label(line.text)));
  if (!at) return "";
  const candidates = lines.filter((line) => line.y > at.y + 0.008 && line.y - at.y < maxDistance
    && (side === "left" ? line.x < 0.5 : side === "right" ? line.x >= 0.5 : true)
    && !KNOWN_HEADING.test(label(line.text)));
  return candidates.sort((a, b) => a.y - b.y || a.x - b.x)[0]?.text ?? "";
}

function paragraphAfter(lines, anchor) {
  const at = lines.find((line) => anchor.test(label(line.text)));
  if (!at) return "";
  const boundary = /^(?:persons who observed|person s who observed|immediate action|explain what immediate action|medical treatment necessary|where administered|follow up treatment|action taken planned|supervisor comments|attending physician|notifications|submission and review|fictional test data)/;
  const next = lines.filter((line) => line.y > at.y + 0.008 && line.y - at.y < 0.16)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const text = [];
  for (const line of next) {
    if (boundary.test(label(line.text))) break;
    text.push(line.text);
  }
  return text.join(" ");
}

function readSection(pairs, lines, patterns, anchor, options) {
  return findValue(pairs, ...patterns) || (options?.multiline ? paragraphAfter(lines, anchor) : lineAfter(lines, anchor, options));
}

function selectIncidentTypes(pairs) {
  const aliases = new Map(LIC624_INCIDENT_TYPE_FIELDS.map((item) => [label(item.label), item]));
  const injuryAccident = LIC624_INCIDENT_TYPE_FIELDS.find((item) => item.key === "injury_accident");
  const other = LIC624_INCIDENT_TYPE_FIELDS.find((item) => item.key === "other");
  if (injuryAccident) aliases.set("injury accident", injuryAccident);
  if (other) aliases.set("other explain", other);
  return pairs.filter((pair) => pair.value === ":selected:" && pair.confidence >= 0.9)
    .map((pair) => aliases.get(pair.key))
    .filter(Boolean)
    .map(({ key, label: display }) => ({ key, label: display }));
}

/** Deterministic LIC 624 mapping. Every field remains subject to human review. */
export function mapLic624OcrResult(analysis) {
  const pairs = recognizedPairs(analysis);
  const first = pageLines(analysis, 0);
  const second = pageLines(analysis, 1);
  const dates = pairs.filter((pair) => pair.key === "date" && /\d/.test(pair.value)).map((pair) => pair.value);
  const treatmentChoice = pairs.find((pair) => pair.key === "yes" && pair.value === ":selected:")
    ? true : pairs.find((pair) => pair.key === "no" && pair.value === ":selected:") ? false : null;
  const raw = {
    facility: {
      name: findValue(pairs, /^(?:name of )?facility$/),
      fileNumber: findValue(pairs, /^facility file number$/),
      telephone: findValue(pairs, /^telephone(?: number)?$/),
      address: findValue(pairs, /^address$/),
      cityStateZip: findValue(pairs, /^city state zip$/)
    },
    residents: [{
      name: findValue(pairs, /^(?:clients residents involved|name)$/),
      dateOccurred: findValue(pairs, /^date occurred$/),
      age: findValue(pairs, /^age$/),
      sex: findValue(pairs, /^sex$/),
      admissionDate: findValue(pairs, /^(?:date of admission|admitted)$/)
    }],
    incidentTypes: selectIncidentTypes(pairs),
    eventNarrative: readSection(pairs, first, [/^describe event or incident/], /^describe event or incident$|^what happened$/, { multiline: true }),
    observers: readSection(pairs, first, [/^person s who observed/], /^persons who observed$|^person s who observed/),
    immediateAction: readSection(pairs, first, [/^explain what immediate action/], /^immediate action$|^explain what immediate action/, { multiline: true }),
    treatment: {
      necessary: treatmentChoice,
      nature: readSection(pairs, second, [/^nature of treatment$|^if yes give nature of treatment/], /^nature of treatment$|^if yes give nature of treatment/),
      whereAdministered: readSection(pairs, second, [/^where administered$/], /^where administered$/, { side: "left" }),
      administeredBy: readSection(pairs, second, [/^administered by$/], /^administered by$/, { side: "right" }),
      followUp: readSection(pairs, second, [/^follow up treatment/], /^follow up treatment/)
    },
    plannedAction: readSection(pairs, second, [/^action taken or planned|^action taken planned/], /^action taken planned$|^action taken or planned/),
    supervisorComments: readSection(pairs, second, [/^(?:licensee|license|supervisor) ?supervisor comments$|^supervisor comments$/], /^supervisor comments$|^licensee supervisor comments/),
    attendingPhysician: readSection(pairs, second, [/^(?:name of )?attending physician$/], /^attending physician$|^name of attending physician$/),
    submission: {
      submittedBy: readSection(pairs, second, [/^report submitted by$|^submitted by$/], /^submitted by$/, { side: "left" }),
      submittedDate: dates[0] ?? "",
      reviewedBy: readSection(pairs, second, [/^report reviewed approved by$|^reviewed by$/], /^reviewed by$/, { side: "left" }),
      reviewedDate: dates[1] ?? ""
    },
    notifications: []
  };
  const data = validateLic624ReviewData(raw);
  const reviewIssues = getLic624ReviewIssues(data);
  const extractedFieldCount = pairs.filter((pair) => !/^:(?:selected|unselected):$/.test(pair.value)).length + data.incidentTypes.length;
  if (extractedFieldCount < 3) return null;
  const lowConfidence = pairs.some((pair) => pair.confidence < 0.9);
  if (lowConfidence) reviewIssues.push("Some scanned fields have lower confidence. Compare every value with the original.");
  return {
    form: LIC624_FORM_DEFINITION.id,
    method: "document_intelligence",
    status: "needs_review",
    confidence: reviewIssues.length || lowConfidence ? "medium" : "high",
    extractedFieldCount,
    reviewIssues,
    data,
    ocrEvidence: {
      model: MODEL, apiVersion: API_VERSION, pageCount: analysis.pages?.length ?? 0,
      content: String(analysis.content ?? "").slice(0, 60_000),
      keyValuePairs: pairs.slice(0, 300)
    }
  };
}

export async function extractLic624Scan(bytes) {
  try {
    const analysis = await analyzeLic624Scan(bytes);
    return analysis ? mapLic624OcrResult(analysis) : null;
  } catch (error) {
    if (process.env.NODE_ENV !== "test") console.error("LIC 624 OCR unavailable:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}
