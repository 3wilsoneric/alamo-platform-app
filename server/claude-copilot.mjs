import { randomUUID } from "node:crypto";
import { readPlatformSnapshot } from "./platform-snapshot.mjs";
import { runRelevantCopilotTools } from "./copilot-tools.mjs";
import { getRelevantPlatformModules } from "../shared/platform-module-registry.mjs";
import { analysisFrameToPrompt, isAnalysisFrame } from "../shared/analysis-session-state.mjs";
import { isFrameIndependentQuestion } from "../shared/chat-context-boundary.mjs";
import { getAnalystCapability, isDeterministicOnlyCapability } from "../shared/analyst-capability-registry.mjs";
import { matchCertifiedQuestion } from "../shared/certified-analyst-questions.mjs";
import {
  normalizeKnownCommunityNames as normalizeKnownNames,
  normalizeKnownCommunityNamesDeep as normalizeKnownNamesDeep
} from "../shared/community-names.mjs";
import { getBoundedIntegerEnv } from "./runtime-environment.mjs";
import { createHttpError } from "./http-errors.mjs";

const MAX_CLAUDE_THREADS = 500;
const MAX_THREAD_MESSAGES = 10;
const DEFAULT_ANTHROPIC_TIMEOUT_MS = 35_000;
const DEFAULT_ANTHROPIC_MAX_ATTEMPTS = 2;
const TRANSIENT_ANTHROPIC_STATUSES = new Set([429, 500, 502, 503, 529]);
const SNAPSHOT_CONTEXT_WARNING_INTERVAL_MS = 5 * 60_000;
const threads = new Map();
let snapshotContextWarning = {
  signature: /** @type {string | null} */ (null),
  warnedAt: 0
};

function getThreadStoreKey(threadId, ownerKey = "local-direct") {
  return `${String(ownerKey || "local-direct")}\u001f${threadId}`;
}

function rememberThread(storeKey, thread) {
  threads.delete(storeKey);
  threads.set(storeKey, thread);
  while (threads.size > MAX_CLAUDE_THREADS) {
    threads.delete(threads.keys().next().value);
  }
}

function getOptionalEnv(name) {
  const value = process.env[name];
  return value?.trim() ? value.trim() : null;
}

function getAnthropicConfig() {
  return {
    apiKey: getOptionalEnv("ANTHROPIC_API_KEY"),
    model: getOptionalEnv("ANTHROPIC_MODEL") || "claude-sonnet-4-6",
    maxTokens: getBoundedIntegerEnv("ANTHROPIC_MAX_TOKENS", 1200, 200, 4_000),
    timeoutMs: getBoundedIntegerEnv("ANTHROPIC_TIMEOUT_MS", DEFAULT_ANTHROPIC_TIMEOUT_MS, 5_000, 80_000),
    maxAttempts: getBoundedIntegerEnv("ANTHROPIC_MAX_ATTEMPTS", DEFAULT_ANTHROPIC_MAX_ATTEMPTS, 1, 3),
    assistantLabel: getOptionalEnv("COPILOT_ASSISTANT_LABEL") || "Alamo Analyst"
  };
}

export function getClaudeCopilotHealth() {
  const config = getAnthropicConfig();

  return {
    configured: Boolean(config.apiKey),
    assistantLabel: config.assistantLabel,
    model: config.model,
    context: "governed-tool-context-and-platform-snapshot"
  };
}

function cleanAssistantText(value) {
  return normalizeKnownNames(String(value ?? ""))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .trim();
}

function compactCacheKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "prompt";
}

function roundNumber(value, decimals = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** decimals;
  return Math.round(numeric * factor) / factor;
}

function getLatestMonth(rows) {
  return [...new Set((rows ?? []).map((row) => row?.month_bucket).filter(Boolean))]
    .sort()
    .at(-1) ?? null;
}

function getPriorMonth(rows, latestMonth) {
  if (!latestMonth) return null;
  return [...new Set((rows ?? []).map((row) => row?.month_bucket).filter(Boolean))]
    .sort()
    .filter((month) => month < latestMonth)
    .at(-1) ?? null;
}

function averageFromValues(values) {
  const valid = values.map(Number).filter(Number.isFinite);
  if (!valid.length) return null;
  return roundNumber(valid.reduce((sum, value) => sum + value, 0) / valid.length, 1);
}

function pctDelta(currentValue, priorValue) {
  const current = Number(currentValue);
  const prior = Number(priorValue);
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return null;
  return roundNumber(((current - prior) / prior) * 100, 1);
}

function groupResidentsByFacility(residents) {
  const grouped = new Map();
  for (const resident of residents ?? []) {
    const facilityId = resident?.facility_id;
    if (!facilityId) continue;
    if (!grouped.has(facilityId)) grouped.set(facilityId, []);
    grouped.get(facilityId).push(resident);
  }
  return grouped;
}

function getIncidentDetailMonth(incident) {
  if (incident?.month_bucket) return incident.month_bucket;
  const dateValue = incident?.incident_date ?? incident?.received_at;
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function summarizeIncidentDetail(incident, facilityNames) {
  return {
    id: incident.id,
    facilityId: incident.facility_id,
    communityName: incident.facility_name || facilityNames.get(incident.facility_id) || incident.facility_id,
    residentId: incident.resident_id || null,
    clientName: incident.client_name || "Unknown resident",
    unit: incident.unit_number ?? null,
    category: incident.category || "Uncategorized",
    incidentType: incident.incident_type || incident.category || "Incident",
    incidentDate: incident.incident_date ?? null,
    location: incident.location || null,
    injury: Boolean(incident.injury_occurred),
    emergencyServices: Boolean(incident.police_called),
    sentinel: Boolean(incident.sentinel_event)
  };
}

function buildOperationalSlices(snapshot) {
  if (!snapshot) return null;

  const communities = snapshot.communities ?? snapshot;
  const homeDashboard = snapshot.homeDashboard ?? null;
  const reportsSummary = snapshot.reportsSummary ?? null;
  const facilities = communities?.facilities ?? [];
  const residents = communities?.residents ?? [];
  const incidents = communities?.incidents ?? [];
  const incidentDetails = communities?.incidentDetails ?? [];
  const census = communities?.census ?? [];
  const residentGroups = groupResidentsByFacility(residents);
  const facilityNames = new Map(
    facilities.map((facility) => [facility.facility_id, facility.community_name ?? facility.facility_name ?? facility.facility_id])
  );

  const latestIncidentMonth = getLatestMonth(incidents);
  const priorIncidentMonth = getPriorMonth(incidents, latestIncidentMonth);
  const latestCensusMonth = getLatestMonth(census);
  const priorCensusMonth = getPriorMonth(census, latestCensusMonth);

  const incidentCountsCurrent = new Map();
  const incidentCountsPrior = new Map();
  for (const row of incidents) {
    if (row?.month_bucket === latestIncidentMonth) {
      incidentCountsCurrent.set(row.facility_id, (incidentCountsCurrent.get(row.facility_id) ?? 0) + Number(row.incident_count ?? 0));
    }
    if (row?.month_bucket === priorIncidentMonth) {
      incidentCountsPrior.set(row.facility_id, (incidentCountsPrior.get(row.facility_id) ?? 0) + Number(row.incident_count ?? 0));
    }
  }

  const censusCurrent = new Map();
  const censusPrior = new Map();
  for (const row of census) {
    if (row?.month_bucket === latestCensusMonth) censusCurrent.set(row.facility_id, Number(row.census ?? 0));
    if (row?.month_bucket === priorCensusMonth) censusPrior.set(row.facility_id, Number(row.census ?? 0));
  }

  const homeCommunityMap = new Map(
    (homeDashboard?.communities ?? []).map((community) => [community.facility_id, community])
  );

  const communityCurrentSnapshot = facilities.map((facility) => {
    const homeCommunity = homeCommunityMap.get(facility.facility_id);
    const facilityResidents = residentGroups.get(facility.facility_id) ?? [];

    return {
      facilityId: facility.facility_id,
      communityName: facility.community_name,
      residents:
        homeCommunity?.total_residents ??
        facility.total_residents ??
        facilityResidents.length,
      currentIncidents:
        homeCommunity?.currentIncidents ??
        incidentCountsCurrent.get(facility.facility_id) ??
        0,
      priorIncidents: incidentCountsPrior.get(facility.facility_id) ?? 0,
      incidentDeltaVsPriorMonth:
        (homeCommunity?.currentIncidents ?? incidentCountsCurrent.get(facility.facility_id) ?? 0) -
        (incidentCountsPrior.get(facility.facility_id) ?? 0),
      incidentPctDeltaVsPriorMonth: pctDelta(
        homeCommunity?.currentIncidents ?? incidentCountsCurrent.get(facility.facility_id) ?? 0,
        incidentCountsPrior.get(facility.facility_id) ?? 0
      ),
      currentCensus: censusCurrent.get(facility.facility_id) ?? null,
      priorCensus: censusPrior.get(facility.facility_id) ?? null,
      censusDeltaVsPriorMonth:
        (censusCurrent.get(facility.facility_id) ?? 0) - (censusPrior.get(facility.facility_id) ?? 0),
      censusPctDeltaVsPriorMonth: pctDelta(
        censusCurrent.get(facility.facility_id) ?? 0,
        censusPrior.get(facility.facility_id) ?? 0
      ),
      incidentsPer100Residents:
        (homeCommunity?.total_residents ?? facility.total_residents ?? facilityResidents.length) > 0
          ? roundNumber(
              ((homeCommunity?.currentIncidents ?? incidentCountsCurrent.get(facility.facility_id) ?? 0) /
                (homeCommunity?.total_residents ?? facility.total_residents ?? facilityResidents.length)) *
                100,
              1
            )
          : null,
      averageAge:
        homeCommunity?.averageAge ??
        averageFromValues(facilityResidents.map((resident) => resident.age)),
      averageLengthOfStay:
        homeCommunity?.averageLengthOfStay ??
        averageFromValues(facilityResidents.map((resident) => resident.los_days)),
      residentSharePct: homeCommunity?.residentSharePct ?? null
    };
  });

  const incidentCountsByCommunity = communityCurrentSnapshot
    .map((community) => ({
      facilityId: community.facilityId,
      communityName: community.communityName,
      currentIncidents: community.currentIncidents,
      priorIncidents: incidentCountsPrior.get(community.facilityId) ?? 0,
      deltaVsPriorMonth:
        community.currentIncidents - (incidentCountsPrior.get(community.facilityId) ?? 0),
      pctDeltaVsPriorMonth: pctDelta(community.currentIncidents, incidentCountsPrior.get(community.facilityId) ?? 0),
      incidentsPer100Residents: community.incidentsPer100Residents
    }))
    .sort((left, right) => right.currentIncidents - left.currentIncidents);

  const latestCensusByCommunity = facilities
    .map((facility) => ({
      facilityId: facility.facility_id,
      communityName: facility.community_name,
      census: censusCurrent.get(facility.facility_id) ?? null,
      priorCensus: censusPrior.get(facility.facility_id) ?? null,
      deltaVsPriorMonth:
        (censusCurrent.get(facility.facility_id) ?? 0) - (censusPrior.get(facility.facility_id) ?? 0),
      pctDeltaVsPriorMonth: pctDelta(
        censusCurrent.get(facility.facility_id) ?? 0,
        censusPrior.get(facility.facility_id) ?? 0
      )
    }))
    .sort((left, right) => (right.census ?? -1) - (left.census ?? -1));

  const latestIncidentCategories = [...incidents
    .filter((row) => row?.month_bucket === latestIncidentMonth)
    .reduce((acc, row) => {
      const label = row.category || "Uncategorized";
      acc.set(label, (acc.get(label) ?? 0) + Number(row.incident_count ?? 0));
      return acc;
    }, new Map())
    .entries()]
    .map(([category, incidentCount]) => ({ category, incidentCount }))
    .sort((left, right) => right.incidentCount - left.incidentCount);

  const currentIncidentDetails = incidentDetails
    .filter((incident) => getIncidentDetailMonth(incident) === latestIncidentMonth)
    .sort((left, right) => {
      const leftDate = left.incident_date ?? left.received_at ?? "";
      const rightDate = right.incident_date ?? right.received_at ?? "";
      return rightDate.localeCompare(leftDate);
    });

  const incidentDetailsByCategory = latestIncidentCategories.slice(0, 8).map((categoryRow) => {
    const rows = currentIncidentDetails
      .filter((incident) => (incident.category || "Uncategorized") === categoryRow.category)
      .slice(0, 12)
      .map((incident) => summarizeIncidentDetail(incident, facilityNames));

    return {
      category: categoryRow.category,
      incidentCount: categoryRow.incidentCount,
      exampleIncidents: rows
    };
  });

  const incidentDetailsByCommunity = incidentCountsByCommunity.slice(0, 8).map((communityRow) => {
    const rows = currentIncidentDetails
      .filter((incident) => incident.facility_id === communityRow.facilityId)
      .slice(0, 12)
      .map((incident) => summarizeIncidentDetail(incident, facilityNames));

    return {
      facilityId: communityRow.facilityId,
      communityName: communityRow.communityName,
      incidentCount: communityRow.currentIncidents,
      recentIncidents: rows
    };
  });

  const recentCommunitySeries = facilities.map((facility) => ({
    facilityId: facility.facility_id,
    communityName: facility.community_name,
    incidentSeries: incidents
      .filter((row) => row.facility_id === facility.facility_id)
      .sort((left, right) => left.month_bucket.localeCompare(right.month_bucket))
      .slice(-6)
      .map((row) => ({
        month: row.month_bucket,
        incidents: Number(row.incident_count ?? 0)
      })),
    censusSeries: census
      .filter((row) => row.facility_id === facility.facility_id)
      .sort((left, right) => left.month_bucket.localeCompare(right.month_bucket))
      .slice(-6)
      .map((row) => ({
        month: row.month_bucket,
        census: Number(row.census ?? 0)
      }))
  }));

  const medicationRefusals = (reportsSummary?.refusalByMedication ?? [])
    .slice(0, 20)
    .map((row) => ({
      facilityId: row.facility_id,
      communityName: facilityNames.get(row.facility_id) ?? row.facility_id,
      medication: row.medication,
      refusals: row.refusals,
      refusalPct: row.refusal_pct
    }));

  return normalizeKnownNamesDeep({
    reportingMonth: homeDashboard?.reporting_month ?? null,
    generatedAt: snapshot.generated_at ?? snapshot.snapshot?.generated_at ?? null,
    latestIncidentMonth,
    priorIncidentMonth,
    latestCensusMonth,
    priorCensusMonth,
    communityCurrentSnapshot,
    incidentCountsByCommunity,
    latestCensusByCommunity,
    latestIncidentCategories,
    incidentDetailsByCategory,
    incidentDetailsByCommunity,
    recentCommunitySeries,
    medicationRefusals
  });
}

function summarizeSnapshot(snapshot) {
  if (!snapshot) return null;
  const communities = snapshot.communities ?? snapshot;
  const facilities = communities?.facilities ?? [];
  const residents = communities?.residents ?? [];
  const incidents = communities?.incidents ?? [];
  const census = communities?.census ?? [];

  return normalizeKnownNamesDeep({
    generatedAt: snapshot.snapshot?.generated_at ?? snapshot.generated_at ?? null,
    counts: {
      facilities: Array.isArray(facilities) ? facilities.length : null,
      residents: Array.isArray(residents) ? residents.length : null,
      incidents: Array.isArray(incidents) ? incidents.length : null,
      censusRows: Array.isArray(census) ? census.length : null
    },
    latestFacilities: Array.isArray(facilities)
      ? facilities.slice(0, 8).map((facility) => ({
          id: facility.facility_id ?? facility.id ?? facility.Facility ?? null,
          name: facility.facility_name ?? facility.name ?? facility.Facility_Name ?? null,
          census: facility.census ?? facility.active_residents ?? facility.current_census ?? null
        }))
      : [],
    operationalSlices: buildOperationalSlices(snapshot)
  });
}

function buildCertifiedQuestionContext(snapshot) {
  const communities = snapshot?.communities ?? snapshot ?? {};
  const facilities = Array.isArray(communities.facilities) ? communities.facilities : [];
  const residents = Array.isArray(communities.residents) ? communities.residents : [];
  const incidents = Array.isArray(communities.incidents) ? communities.incidents : [];
  const census = Array.isArray(communities.census) ? communities.census : [];
  const categories = [...new Set(incidents.map((incident) => incident?.incident_category ?? incident?.category).filter(Boolean))];
  const availableMonths = [
    ...new Set([
      ...incidents.map(getIncidentDetailMonth),
      ...census.map((row) => row?.month_bucket ?? row?.month)
    ].filter(Boolean))
  ].sort();

  return {
    facilities,
    residents,
    categories,
    availableMonths
  };
}

function makeCertifiedQuestionMetaForClaude(question, content) {
  if (!question?.id) return null;
  const capability = getAnalystCapability(question.id);
  return {
    version: "claude-context-certified-question-v1",
    id: question.id,
    title: question.title,
    description: question.description,
    preferredTool: question.preferredTool,
    answerStyle: question.answerStyle,
    cacheKey: `${question.cacheFamily ?? question.id}:${compactCacheKey(content)}`,
    confidence: 1,
    executionMode: capability?.executionMode,
    claudeRole: capability?.claudeRole
  };
}

function getQuestionIntent(message) {
  const text = String(message ?? "").toLowerCase();

  if (/\b(census|occupancy|resident count|headcount|community trend|trend least|monthly census)\b/.test(text)) {
    return {
      intent: "census",
      instruction:
        "The user is asking about census or occupancy. Use governed census tool rows and do not use incident metrics unless the user explicitly asks about incidents."
    };
  }

  if (/\b(incident|incidents|awol|elopement|medication refusal|aggressive|sentinel|911|police)\b/.test(text)) {
    return {
      intent: "incidents",
      instruction:
        "The user is asking about incidents. Use governed incident tool rows and use census only for rates or denominator context."
    };
  }

  if (/\b(length of stay|los|tenure|long stay|short stay)\b/.test(text)) {
    return {
      intent: "length-of-stay",
      instruction:
        "The user is asking about length of stay. Use governed resident profile or roster rows."
    };
  }

  if (/\b(medication|meds|refusal|emar|profile)\b/.test(text)) {
    return {
      intent: "medication",
      instruction:
        "The user is asking about medication. Use governed medication tool rows; use incident rows only when the question is specifically about medication-refusal incidents."
    };
  }

  return {
    intent: "general",
    instruction:
      "Use the smallest relevant governed tool slice. Do not blend data domains unless the user asks for a cross-domain answer."
  };
}

function getRuntimeErrorSignature(error) {
  if (!error || typeof error !== "object") return typeof error;
  const name = typeof error.name === "string" && error.name ? error.name : "Error";
  const code = typeof error.code === "string" && error.code ? error.code : "unknown";
  return `${name}:${code}`;
}

async function readCopilotSnapshotContext() {
  try {
    const snapshot = await readPlatformSnapshot();
    snapshotContextWarning = { signature: null, warnedAt: 0 };
    return snapshot;
  } catch (error) {
    const now = Date.now();
    const signature = getRuntimeErrorSignature(error);
    const warningExpired = now - snapshotContextWarning.warnedAt >= SNAPSHOT_CONTEXT_WARNING_INTERVAL_MS;
    if (signature !== snapshotContextWarning.signature || warningExpired) {
      console.warn(
        `Platform snapshot context is unavailable (${signature}); continuing with governed tool results.`
      );
      snapshotContextWarning = { signature, warnedAt: now };
    }
    return null;
  }
}

async function buildCopilotContext(message, analysisFrame = null, session = {}) {
  const effectiveMessage = isAnalysisFrame(analysisFrame) && !isFrameIndependentQuestion(message)
    ? analysisFrameToPrompt(analysisFrame)
    : message;
  const questionIntent = getQuestionIntent(effectiveMessage);
  const [snapshot, toolResults] = await Promise.all([
    readCopilotSnapshotContext(),
    runRelevantCopilotTools({
      content: effectiveMessage,
      analysisFrame,
      sessionId: session.sessionId,
      sessionOwnerKey: session.sessionOwnerKey
    }).catch((error) => {
      console.error("Structured tool context could not be loaded.", error);
      return [{
        tool: "tool_context_error",
        text: "Structured tool context could not be loaded for this request.",
        trace: {
          source: "local-data-tool",
          tool: "tool_context_error",
          dataSource: "tool orchestrator",
          rowCount: 0
        }
      }];
    })
  ]);

  const certifiedQuestion = makeCertifiedQuestionMetaForClaude(
    matchCertifiedQuestion(effectiveMessage, buildCertifiedQuestionContext(snapshot)),
    effectiveMessage
  );

  return {
    analysisFrame: isAnalysisFrame(analysisFrame) ? analysisFrame : null,
    certifiedQuestion,
    questionIntent,
    toolResults,
    moduleCatalog: getRelevantPlatformModules(effectiveMessage),
    snapshot: summarizeSnapshot(snapshot)
  };
}

function pickDeterministicToolAnswer(context) {
  const results = Array.isArray(context?.toolResults) ? context.toolResults : [];
  const certifiedResult = results.find((result) =>
    typeof result?.text === "string" &&
    result.text.trim() &&
    result?.certifiedQuestion?.id &&
    isDeterministicOnlyCapability(result.certifiedQuestion.id)
  );
  if (certifiedResult) return certifiedResult;

  if (context?.certifiedQuestion?.id && isDeterministicOnlyCapability(context.certifiedQuestion.id)) {
    const firstAnsweredResult = results.find((result) => typeof result?.text === "string" && result.text.trim());
    return firstAnsweredResult ? { ...firstAnsweredResult, certifiedQuestion: context.certifiedQuestion } : null;
  }

  return null;
}

function pickDeterministicCertifiedToolResult(context) {
  const results = Array.isArray(context?.toolResults) ? context.toolResults : [];
  const certifiedResult = results.find((result) =>
    result?.certifiedQuestion?.id &&
    isDeterministicOnlyCapability(result.certifiedQuestion.id)
  );
  if (certifiedResult) return certifiedResult;
  return context?.certifiedQuestion?.id && isDeterministicOnlyCapability(context.certifiedQuestion.id)
    ? { certifiedQuestion: context.certifiedQuestion }
    : null;
}

function isFailedToolResult(result) {
  const truthState = String(result?.truthState ?? result?.trace?.truthState ?? "").trim();
  return Boolean(
    result?.safeRefusal ||
    result?.contractViolation ||
    ["not_loaded", "plan_rejected", "stale", "summary_not_shown"].includes(truthState)
  );
}

function deterministicClaudeOverrideEnabled(payload = {}, deterministicResult = null) {
  if (payload.forceClaude !== true) return false;
  if (process.env.ALLOW_DETERMINISTIC_CLAUDE_OVERRIDE === "true") return true;
  return isFailedToolResult(deterministicResult);
}

function buildDeterministicGuardAnswer(result) {
  const certifiedTitle = result?.certifiedQuestion?.title ?? "this deterministic question";
  return [
    `I stopped before using AH Analyst because ${certifiedTitle} is certified for deterministic tool output.`,
    "The structured tool did not return a safe answer, so I am not sending an incomplete context bundle to synthesis."
  ].join("\n\n");
}

function createSystemPrompt(context) {
  return [
    "You are Alamo Analyst, an internal operating copilot for Alamo Health.",
    "Answer from the provided platform context only. If the context does not contain the answer, say what is missing and what data/view would be needed.",
    "Be direct, operational, and concise. No generic chatbot filler.",
    "Write like a capable analyst speaking to an informed operator, not like a database dump or executive memo.",
    "Start with one natural sentence that directly answers the question. Do not prefix it with Answer, Result, or Bottom line.",
    "Then include only the two to five supporting facts needed to understand the answer. Use short bullets for discrete facts and a compact markdown table for comparisons with three or more rows.",
    "Use a Data limit note only when a limitation materially changes the answer. Do not repeat tool metadata, row counts, or source names in the prose because the interface renders provenance separately.",
    "Do not restate every value that is already visible in the attached data module. Explain the pattern, comparison, or calculation that the module supports.",
    "Avoid advisory or editorial phrases such as structural issue, risk, should focus, warrants attention, deserves investigation, worth checking, or should be monitored unless the user explicitly asks for interpretation or recommendations.",
    "Do not add run-rate projections unless the user explicitly asks for projection, pace, or month-end estimate. If you do calculate one, verify the arithmetic and comparison direction before writing it.",
    "For compare questions, stay with the requested comparison table and factual deltas. Do not add recommendations or next-check language unless asked.",
    "Do not wrap numbers in markdown bold or asterisks. Use plain text numbers.",
    "When answering analytical questions, distinguish current partial-period reads from completed-month reads.",
    "Use community names rather than facility ids when names are available.",
    "The community formerly mislabeled Victoria's Place must be called Victoria's House.",
    "If snapshot.operationalSlices contains the direct row answer, use it before any broader snapshot summary.",
    "If toolResults are present, use them before snapshot prose. Treat toolResults as the most direct structured answer for the current user question.",
    "If a toolResult is safeRefusal, not_loaded, plan_rejected, stale, or summary_not_shown, do not repeat the failure. Try to answer from other loaded structured context. If no loaded context can answer, say that plainly and name the closest usable slice.",
    "analysisFrame is the authoritative conversation state. Preserve its metric, category, mode, periods, grouping, fields, and facility unless the current turn explicitly patches them.",
    "When a toolResult has trace.source local-data-tool, you may mention that the answer came from the local data tool if source clarity matters.",
    "Do not invent missing detail rows. If a tool trace says aggregate rows or zero detail rows, say that plainly.",
    "For community-specific questions, check snapshot.operationalSlices.communityCurrentSnapshot, incidentCountsByCommunity, latestCensusByCommunity, latestIncidentCategories, and recentCommunitySeries first.",
    "For incident category or resident-involved questions, check snapshot.operationalSlices.incidentDetailsByCategory and incidentDetailsByCommunity before summarizing.",
    "Follow the questionIntent instruction in the context. Do not blend incident metrics into census answers unless explicitly asked.",
    "If the user asks what to investigate, give practical next checks tied to the data.",
    "The moduleCatalog lists reusable product surfaces and deterministic analytical modules. When a registered module would materially help, refer to it by its exact title. Do not claim that a module was opened unless a tool result says it was surfaced.",
    "",
    "Platform context JSON:",
    JSON.stringify(context)
  ].join("\n");
}

function toClaudeMessages(messages) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: message.text
    }));
}

async function callClaude({ messages, context }) {
  const config = getAnthropicConfig();
  if (!config.apiKey) {
    throw new Error("Claude copilot is not configured. Set ANTHROPIC_API_KEY on the backend.");
  }

  const requestBody = JSON.stringify({
    model: config.model,
    max_tokens: Number.isFinite(config.maxTokens) ? config.maxTokens : 1200,
    system: createSystemPrompt(context),
    messages: toClaudeMessages(messages)
  });

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new DOMException("Anthropic request timed out.", "TimeoutError"));
    }, config.timeoutMs);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: requestBody,
        signal: controller.signal
      });

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        if (TRANSIENT_ANTHROPIC_STATUSES.has(response.status) && attempt < config.maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)));
          continue;
        }
        throw createHttpError(
          502,
          "api_anthropic_upstream_error",
          "AH Analyst synthesis is temporarily unavailable. Please retry the question."
        );
      }

      const payload = await response.json();
      const text = (payload.content ?? [])
        .map((part) => (part?.type === "text" ? part.text : ""))
        .filter(Boolean)
        .join("\n\n");
      const cleaned = cleanAssistantText(text);
      if (!cleaned) {
        throw createHttpError(
          502,
          "api_anthropic_empty_response",
          "AH Analyst returned an empty synthesis. Please retry the question."
        );
      }
      return cleaned;
    } catch (error) {
      if (controller.signal.aborted) {
        if (attempt < config.maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)));
          continue;
        }
        throw createHttpError(
          504,
          "api_anthropic_timeout",
          "AH Analyst synthesis timed out. Please retry the question."
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw createHttpError(
    502,
    "api_anthropic_upstream_error",
    "AH Analyst synthesis is temporarily unavailable. Please retry the question."
  );
}

function collectNumericTokens(value) {
  return new Set(
    String(value ?? "")
      .match(/-?\d[\d,]*(?:\.\d+)?%?/g)
      ?.map((token) => token.replace(/,/g, "").replace(/%$/, "")) ?? []
  );
}

function hasOnlyGroundedNumbers(value, evidence) {
  const allowed = collectNumericTokens(JSON.stringify(evidence));
  return [...collectNumericTokens(JSON.stringify(value))].every((token) => allowed.has(token));
}

function parseGovernedNarrative(value, evidence) {
  const raw = String(value ?? "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (typeof payload.summary !== "string" || !payload.summary.trim() || payload.summary.length > 1_500) return null;
  if (!Array.isArray(payload.keyPoints) || payload.keyPoints.length > 4 || !payload.keyPoints.every((item) => typeof item === "string" && item.trim() && item.length <= 600)) return null;
  if (typeof payload.closing !== "string" || !payload.closing.trim() || payload.closing.length > 800) return null;
  if (
    payload.summary.includes(";") ||
    payload.closing.includes(";") ||
    payload.keyPoints.some((item) => item.includes(";"))
  ) return null;
  const normalized = {
    summary: cleanAssistantText(payload.summary),
    keyPoints: payload.keyPoints.map(cleanAssistantText),
    closing: cleanAssistantText(payload.closing)
  };
  return hasOnlyGroundedNumbers(normalized, evidence) ? normalized : null;
}

/**
 * @param {{ sources?: Array<Record<string, any>>, audience?: string, emphasis?: string }} [input]
 */
export async function synthesizeGovernedReportNarrative({ sources, audience, emphasis } = {}) {
  const config = getAnthropicConfig();
  if (!config.apiKey || process.env.GOVERNED_REPORT_SYNTHESIS_ENABLED === "false") return null;

  const evidence = Array.isArray(sources)
    ? sources.map((source) => ({
        question: source.question,
        answer: source.answer,
        scope: source.scope,
        period: source.period,
        tool: source.tool,
        visual: source.visual
          ? {
              title: source.visual.title,
              subtitle: source.visual.subtitle,
              valueLabel: source.visual.valueLabel,
              columns: source.visual.columns,
              rows: source.visual.rows?.slice(0, 12)
            }
          : null
      }))
    : [];
  if (!evidence.length) return null;

  const instruction = [
    "Write one concise one-page briefing narrative using only the verified evidence JSON below.",
    `Audience: ${String(audience ?? "executive")}. Emphasis: ${String(emphasis ?? "overview")}.`,
    "Return strict JSON with exactly these keys: summary, keyPoints, closing.",
    "summary must be one plain-English paragraph.",
    "keyPoints must be an array of no more than four complete sentences.",
    "closing must be one restrained sentence describing the practical follow-through.",
    "Do not calculate, infer, introduce names, introduce numbers, diagnose causes, or add recommendations that are absent from the evidence.",
    "Do not mention rows, tools, schemas, AI, prompts, or verification mechanics.",
    "Use active voice and normal punctuation. Avoid semicolons."
  ].join("\n");

  try {
    const response = await callClaude({
      messages: [{
        role: "user",
        text: `${instruction}\n\nVerified evidence JSON:\n${JSON.stringify(evidence)}`
      }],
      context: {
        questionIntent: {
          instruction: "Create a governed briefing narrative from the supplied verified evidence only."
        },
        verifiedEvidence: evidence,
        moduleCatalog: []
      }
    });
    return parseGovernedNarrative(response, evidence);
  } catch (error) {
    console.warn("Governed report synthesis failed; using the deterministic report narrative.", error);
    return null;
  }
}

export async function sendClaudeCopilotMessage(payload = {}) {
  const content = String(payload.content ?? "").trim();
  if (!content) {
    throw new Error("Message content is required.");
  }

  const config = getAnthropicConfig();
  const threadId = payload.threadId || randomUUID();
  const sessionOwnerKey = String(payload.sessionOwnerKey ?? "").trim() || "local-direct";
  const threadStoreKey = getThreadStoreKey(threadId, sessionOwnerKey);
  const existingThread = threads.get(threadStoreKey);
  const ignoreAnalysisFrame = payload.ignoreAnalysisFrame === true;
  const analysisFrame = ignoreAnalysisFrame
    ? null
    : isAnalysisFrame(payload.analysisFrame)
      ? payload.analysisFrame
      : isAnalysisFrame(existingThread?.analysisFrame)
        ? existingThread.analysisFrame
        : null;
  const providedHistory = Array.isArray(payload.history)
    ? payload.history
        .filter((message) => ["user", "assistant"].includes(message?.role) && String(message?.text ?? "").trim())
        .slice(-8)
        .map((message) => ({
          id: randomUUID(),
          role: message.role,
          text: String(message.text).trim(),
          status: "complete",
          createdAt: Date.now()
        }))
    : [];
  const userMessage = {
    id: randomUUID(),
    role: "user",
    text: content,
    status: "complete",
    createdAt: Date.now()
  };
  const rememberedMessages = ignoreAnalysisFrame
    ? []
    : providedHistory.length
      ? providedHistory
      : (existingThread?.messages ?? []).slice(-(MAX_THREAD_MESSAGES - 2));
  const messages = [...rememberedMessages, userMessage];
  const context = await buildCopilotContext(content, analysisFrame, {
    sessionId: payload.sessionId,
    sessionOwnerKey
  });
  const deterministicGuardResult = pickDeterministicCertifiedToolResult(context);
  const deterministicOverrideAllowed = deterministicClaudeOverrideEnabled(payload, deterministicGuardResult);
  const deterministicGuardActive =
    Boolean(deterministicGuardResult) && !deterministicOverrideAllowed;
  const deterministicToolAnswer =
    deterministicGuardActive || payload.forceClaude !== true
      ? pickDeterministicToolAnswer(context)
      : null;
  const answer = deterministicToolAnswer
    ? cleanAssistantText(deterministicToolAnswer.text)
    : deterministicGuardActive
      ? buildDeterministicGuardAnswer(deterministicGuardResult)
      : await callClaude({ messages, context });
  const provider = deterministicToolAnswer || deterministicGuardActive ? "deterministic-tools" : "anthropic";
  const assistantMessage = {
    id: randomUUID(),
    role: "assistant",
    text: answer,
    status: "complete",
    createdAt: Date.now(),
    meta: {
      assistantLabel: config.assistantLabel,
      model: deterministicToolAnswer || deterministicGuardActive ? "deterministic-tools" : config.model,
      toolTrace: deterministicToolAnswer?.trace ?? deterministicGuardResult?.trace,
      certifiedQuestion: deterministicToolAnswer?.certifiedQuestion ?? deterministicGuardResult?.certifiedQuestion,
      deterministicGuard: deterministicGuardActive,
      forceClaude: payload.forceClaude === true,
      deterministicOverride: deterministicOverrideAllowed
    }
  };
  const thread = {
    threadId,
    conversationId: threadId,
    assistantLabel: config.assistantLabel,
    provider,
    analysisFrame,
    messages: [...messages, assistantMessage].slice(-MAX_THREAD_MESSAGES)
  };

  rememberThread(threadStoreKey, thread);
  return thread;
}
