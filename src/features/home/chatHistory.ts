import type {
  AnalysisFrame,
  CopilotAdHocModuleSpec,
  CopilotChatAction,
  CopilotChatMessage,
  CopilotQueryInterpretation,
  CopilotToolTrace,
  CopilotToolVisual
} from "../../shared/api/copilotChat";
import {
  getPlatformModuleByCanvasId,
  type CanvasModuleId
} from "../../../shared/platform-module-registry.mjs";
import { isAnalysisFrame, sanitizeAnalysisFrame } from "../../../shared/analysis-session-state.mjs";
import {
  isValidCopilotAction,
  isValidCopilotMessage,
  isValidCopilotModuleSpec,
  isValidCopilotVisual
} from "../../shared/api/copilotResponseSchemas";
import {
  readJsonStorage,
  removeStorageItem,
  writeStorageItem
} from "../../shared/storage/browserStorage";
import {
  validateGovernedReportSource,
  type GovernedReportSource
} from "../../../shared/governed-report.mjs";

const CHAT_HISTORY_STORAGE_PREFIX = "alamo-platform:chat-history-v1:";
const CHAT_HISTORY_SCHEMA_VERSION = 2;
const CHAT_HISTORY_LIMIT = 10;
const CHAT_HISTORY_MAX_BYTES = 2_000_000;
const CHAT_HISTORY_THREAD_MAX_BYTES = 250_000;
const CHAT_HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60_000;
const INTERRUPTED_RESPONSE_TEXT = "This response was interrupted before it finished. Choose the question again to rerun it.";

export interface ModuleContext {
  route?: string | null;
  facilityId?: string | null;
  focus?: string | null;
  category?: string | null;
  month?: string | null;
  residentId?: string | null;
  query?: string | null;
}

export type ChatTimelineItem =
  | { id: string; type: "message"; message: CopilotChatMessage }
  | { id: string; type: "module"; module: CanvasModuleId; sourceLabel: string | null; context?: ModuleContext };

export interface StoredChatThread {
  id: string;
  title: string;
  updatedAt: number;
  threadId: string | null;
  analysisSessionId: string;
  analysisFrame: AnalysisFrame | null;
  messages: CopilotChatMessage[];
  timelineItems: ChatTimelineItem[];
}

function getChatHistoryStorageKey(homeAccountId?: string | null) {
  return `${CHAT_HISTORY_STORAGE_PREFIX}${homeAccountId ?? "local"}`;
}

export function createStoredChatId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function truncateText(value: string, maxLength = 8_000) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function sanitizeAction(action: unknown): CopilotChatAction | null {
  if (!isValidCopilotAction(action)) return null;
  if (action.kind === "download" && !action.url) return null;
  return {
    label: action.label,
    kind: action.kind,
    ...(action.route ? { route: action.route } : {}),
    ...(action.url ? { url: action.url } : {}),
    ...(action.filename ? { filename: action.filename } : {}),
    ...(action.kind !== "download" && action.content !== undefined ? { content: action.content } : {}),
    ...(action.mimeType ? { mimeType: action.mimeType } : {}),
    ...(action.tool ? { tool: action.tool } : {}),
    ...(action.prompt ? { prompt: action.prompt } : {})
  };
}

function sanitizeVisual(visual: unknown): CopilotToolVisual | undefined {
  if (!isValidCopilotVisual(visual)) return undefined;
  const originalRowCount = visual.rows?.length ?? 0;
  const rows = visual.rows.slice(0, 20).map((row) => ({
    label: row.label,
    value: row.value,
    ...(row.meta !== undefined ? { meta: row.meta } : {}),
    ...(row.cells ? { cells: [...row.cells] } : {})
  }));
  const isHistoryPreview = originalRowCount > rows.length;

  return {
    type: visual.type,
    title: visual.title,
    ...(isHistoryPreview
      ? { subtitle: `${visual.subtitle ? `${visual.subtitle} · ` : ""}Restored preview (${rows.length.toLocaleString()} of ${originalRowCount.toLocaleString()} records)` }
      : visual.subtitle !== undefined
        ? { subtitle: visual.subtitle }
        : {}),
    ...(visual.valueLabel !== undefined ? { valueLabel: visual.valueLabel } : {}),
    ...(visual.columns ? { columns: [...visual.columns] } : {}),
    rows,
    originalRowCount,
    isHistoryPreview
  };
}

function sanitizeModuleSpec(moduleSpec: unknown): CopilotAdHocModuleSpec | undefined {
  if (!isValidCopilotModuleSpec(moduleSpec)) return undefined;
  const visual = sanitizeVisual(moduleSpec.visual);
  if (!visual) return undefined;
  return {
    version: "1.0",
    id: moduleSpec.id,
    moduleId: moduleSpec.moduleId,
    templateId: moduleSpec.templateId,
    family: moduleSpec.family,
    title: moduleSpec.title,
    scope: moduleSpec.scope,
    filters: { ...moduleSpec.filters },
    provenance: {
      tool: moduleSpec.provenance.tool,
      dataSource: moduleSpec.provenance.dataSource,
      rowCount: moduleSpec.provenance.rowCount,
      visibleRowCount: Math.min(moduleSpec.provenance.visibleRowCount ?? visual.rows.length, visual.rows.length),
      originalRowCount: moduleSpec.provenance.originalRowCount,
      artifactRowCount: moduleSpec.provenance.artifactRowCount,
      rowSetId: moduleSpec.provenance.rowSetId,
      dataset: moduleSpec.provenance.dataset,
      engineVersion: moduleSpec.provenance.engineVersion
    },
    selectionReason: {
      code: moduleSpec.selectionReason.code,
      label: moduleSpec.selectionReason.label
    },
    interactions: [...moduleSpec.interactions],
    visual,
    request: moduleSpec.request
  };
}

function sanitizeToolTrace(value: unknown): CopilotToolTrace | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const trace = value as CopilotToolTrace;
  const text = (entry: unknown, maximumLength = 2_000) => typeof entry === "string" && entry.length <= maximumLength ? entry : null;
  const number = (entry: unknown) => typeof entry === "number" && Number.isFinite(entry) ? entry : null;
  const source = text(trace.source);
  const tool = text(trace.tool);
  const dataSource = text(trace.dataSource);
  return {
    ...(source ? { source } : {}),
    ...(tool ? { tool } : {}),
    ...(dataSource ? { dataSource } : {}),
    rowCount: number(trace.rowCount),
    communityName: text(trace.communityName),
    facilityId: text(trace.facilityId),
    period: text(trace.period),
    note: text(trace.note, 4_000),
    truthState: text(trace.truthState),
    engineVersion: text(trace.engineVersion),
    turnId: text(trace.turnId),
    promptHash: text(trace.promptHash),
    schemaValid: typeof trace.schemaValid === "boolean" ? trace.schemaValid : null,
    schemaWarningCount: number(trace.schemaWarningCount),
    schemaErrorCount: number(trace.schemaErrorCount)
  };
}

function sanitizeInterpretation(value: unknown): CopilotQueryInterpretation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<CopilotQueryInterpretation>;
  if (
    typeof candidate.originalText !== "string" || candidate.originalText.length > 12_000 ||
    typeof candidate.correctedText !== "string" || candidate.correctedText.length > 12_000 ||
    typeof candidate.changed !== "boolean" ||
    typeof candidate.requiresConfirmation !== "boolean" ||
    !Array.isArray(candidate.corrections) || candidate.corrections.length > 20
  ) return undefined;
  const corrections = candidate.corrections.filter((correction) => (
    correction &&
    typeof correction.original === "string" && correction.original.length <= 240 &&
    typeof correction.suggestion === "string" && correction.suggestion.length <= 240 &&
    Array.isArray(correction.alternatives) && correction.alternatives.length <= 10 && correction.alternatives.every((alternative) => typeof alternative === "string" && alternative.length <= 240) &&
    typeof correction.domain === "string" && correction.domain.length <= 240 &&
    typeof correction.confidence === "number" && Number.isFinite(correction.confidence) &&
    typeof correction.requiresConfirmation === "boolean"
  ));
  if (corrections.length !== candidate.corrections.length) return undefined;
  return {
    originalText: candidate.originalText,
    correctedText: candidate.correctedText,
    changed: candidate.changed,
    requiresConfirmation: candidate.requiresConfirmation,
    corrections: corrections.map((correction) => ({
      original: correction.original,
      suggestion: correction.suggestion,
      alternatives: [...correction.alternatives],
      domain: correction.domain,
      confidence: correction.confidence,
      requiresConfirmation: correction.requiresConfirmation
    }))
  };
}

function sanitizeReportSource(source: GovernedReportSource | undefined): GovernedReportSource | undefined {
  if (!source || !validateGovernedReportSource(source).valid) return undefined;
  const visual = sanitizeVisual(source.visual);
  const routeId = truncateText(String(source.routeId ?? source.certifiedQuestionRouteId ?? ""), 256);
  if (!routeId) return undefined;
  return {
    handled: true,
    routeId,
    question: truncateText(String(source.question ?? routeId), 12_000),
    answer: truncateText(String(source.answer ?? source.text ?? ""), 12_000),
    tool: truncateText(String(source.tool ?? "verified analysis"), 240),
    truthState: String(source.truthState ?? source.turnTrace?.truthState ?? ""),
    scope: truncateText(String(source.scope ?? "Portfolio"), 2_000),
    period: truncateText(String(source.period ?? "Latest approved data"), 2_000),
    cached: source.cached === true,
    ...(visual ? { visual } : {}),
    runtimeSchema: { valid: true },
    turnTrace: {
      truthState: source.turnTrace?.truthState ?? source.truthState ?? null,
      selectedTool: source.turnTrace?.selectedTool ?? source.tool ?? null,
      rowCount: source.turnTrace?.rowCount ?? source.provenance?.rowCount ?? null,
      validation: { valid: true }
    },
    guidedContract: {
      valid: true,
      routeId
    },
    provenance: {
      rowCount: source.provenance?.rowCount ?? source.turnTrace?.rowCount ?? null
    }
  };
}

export function sanitizeMessageForHistory(message: unknown): CopilotChatMessage | null {
  if (!isValidCopilotMessage(message)) return null;
  if (message.meta?.variant === "suggestion" || message.meta?.transient) return null;

  const visual = sanitizeVisual(message.meta?.visual);
  const moduleSpec = sanitizeModuleSpec(message.meta?.moduleSpec);
  const moduleSpecs = message.meta?.moduleSpecs
    ?.slice(0, 4)
    .map(sanitizeModuleSpec)
    .filter((item): item is CopilotAdHocModuleSpec => Boolean(item));
  const actions = message.meta?.actions
    ?.map(sanitizeAction)
    .filter((item): item is CopilotChatAction => Boolean(item))
    .slice(0, 2);
  const toolTrace = sanitizeToolTrace(message.meta?.toolTrace);
  const interpretation = sanitizeInterpretation(message.meta?.interpretation);
  const reportSource = sanitizeReportSource(message.meta?.reportSource);

  const meta = message.meta && (
    message.meta.assistantLabel || actions?.length || visual || moduleSpec || moduleSpecs?.length || toolTrace || interpretation || reportSource || message.meta.variant || message.meta.transient
  )
    ? {
        ...(message.meta.assistantLabel ? { assistantLabel: truncateText(message.meta.assistantLabel, 240) } : {}),
        ...(actions?.length ? { actions } : {}),
        ...(visual ? { visual } : {}),
        ...(moduleSpec ? { moduleSpec } : {}),
        ...(moduleSpecs?.length ? { moduleSpecs } : {}),
        ...(toolTrace ? { toolTrace } : {}),
        ...(interpretation ? { interpretation } : {}),
        ...(reportSource ? { reportSource } : {}),
        ...(message.meta.transient !== undefined ? { transient: message.meta.transient } : {}),
        ...(message.meta.variant ? { variant: message.meta.variant } : {})
      }
    : null;

  return {
    id: truncateText(message.id, 512),
    role: message.role,
    text: truncateText(message.text),
    status: message.status,
    createdAt: message.createdAt,
    ...(meta ? { meta } : {})
  };
}

export function getTimelineMessages(timelineItems: ChatTimelineItem[]) {
  return timelineItems
    .filter((item): item is Extract<ChatTimelineItem, { type: "message" }> => item.type === "message")
    .map((item) => item.message);
}

export function sanitizeTimelineForHistory(timelineItems: ChatTimelineItem[]) {
  return timelineItems
    .map((item): ChatTimelineItem | null => {
      if (item.type === "module") {
        if (!getPlatformModuleByCanvasId(item.module)) return null;
        return {
          id: truncateText(item.id, 512),
          type: "module",
          module: item.module,
          sourceLabel: item.sourceLabel == null ? null : truncateText(item.sourceLabel, 500),
          ...(item.context ? {
            context: {
              route: item.context.route == null ? null : truncateText(item.context.route, 1_024),
              facilityId: item.context.facilityId == null ? null : truncateText(item.context.facilityId, 512),
              focus: item.context.focus == null ? null : truncateText(item.context.focus, 512),
              category: item.context.category == null ? null : truncateText(item.context.category, 512),
              residentId: item.context.residentId == null ? null : truncateText(item.context.residentId, 512),
              query: item.context.query == null ? null : truncateText(item.context.query, 512)
            }
          } : {})
        };
      }
      const message = sanitizeMessageForHistory(item.message);
      return message ? { id: truncateText(item.id, 512), type: "message", message } : null;
    })
    .filter((item): item is ChatTimelineItem => Boolean(item))
    .slice(-80);
}

export function deriveStoredChatTitle(
  messages: CopilotChatMessage[],
  timelineItems: ChatTimelineItem[],
  getModuleTitle: (module: CanvasModuleId, context?: ModuleContext) => string
) {
  const firstUserMessage = messages.find((message) => message.role === "user" && message.text.trim());
  if (firstUserMessage) return truncateText(firstUserMessage.text.trim().replace(/\s+/g, " "), 56);

  const firstModule = timelineItems.find((item): item is Extract<ChatTimelineItem, { type: "module" }> => item.type === "module");
  if (firstModule) return firstModule.sourceLabel ?? getModuleTitle(firstModule.module, firstModule.context);
  return "Untitled chat";
}

function isStoredMessage(entry: unknown): entry is CopilotChatMessage {
  return isValidCopilotMessage(entry);
}

function isStoredTimelineItem(entry: unknown): entry is ChatTimelineItem {
  if (!entry || typeof entry !== "object") return false;
  const candidate = entry as Partial<ChatTimelineItem>;
  if (typeof candidate.id !== "string") return false;
  if (candidate.type === "message") return isStoredMessage(candidate.message);
  if (candidate.type !== "module" || typeof candidate.module !== "string" || !getPlatformModuleByCanvasId(candidate.module as CanvasModuleId)) return false;
  if (!(candidate.sourceLabel === null || (typeof candidate.sourceLabel === "string" && candidate.sourceLabel.length <= 500))) return false;
  if (candidate.context === undefined) return true;
  if (!candidate.context || typeof candidate.context !== "object" || Array.isArray(candidate.context)) return false;
  return [
    candidate.context.route,
    candidate.context.facilityId,
    candidate.context.focus,
    candidate.context.category,
    candidate.context.residentId,
    candidate.context.query
  ]
    .every((value) => value == null || (typeof value === "string" && value.length <= 1_024));
}

function isStoredChatThread(entry: unknown): entry is StoredChatThread {
  if (!entry || typeof entry !== "object") return false;
  const candidate = entry as Partial<StoredChatThread>;
  return Boolean(
    typeof candidate.id === "string" && candidate.id.length > 0 && candidate.id.length <= 512 &&
    typeof candidate.title === "string" && candidate.title.length > 0 && candidate.title.length <= 500 &&
    Number.isFinite(candidate.updatedAt) &&
    (candidate.threadId === null || (typeof candidate.threadId === "string" && candidate.threadId.length <= 512)) &&
    typeof candidate.analysisSessionId === "string" && candidate.analysisSessionId.length > 0 && candidate.analysisSessionId.length <= 512 &&
    (candidate.analysisFrame == null || isAnalysisFrame(candidate.analysisFrame)) &&
    Array.isArray(candidate.messages) && candidate.messages.length <= 200 && candidate.messages.every(isStoredMessage) &&
    Array.isArray(candidate.timelineItems) && candidate.timelineItems.length <= 200 && candidate.timelineItems.every(isStoredTimelineItem)
  );
}

function sanitizeStoredThread(entry: unknown): StoredChatThread | null {
  if (!isStoredChatThread(entry)) return null;
  const legacyMessages = entry.messages
    .map(sanitizeMessageForHistory)
    .filter((message): message is CopilotChatMessage => Boolean(message));
  let timelineItems = sanitizeTimelineForHistory(entry.timelineItems);
  if (!timelineItems.some((item) => item.type === "message") && legacyMessages.length) {
    timelineItems = sanitizeTimelineForHistory([
      ...legacyMessages.map((message) => ({
        id: `message-${message.id}`,
        type: "message" as const,
        message
      })),
      ...timelineItems
    ]);
  }
  const messages = getTimelineMessages(timelineItems);
  return {
    id: truncateText(entry.id, 512),
    title: truncateText(entry.title.trim(), 500),
    updatedAt: entry.updatedAt,
    threadId: entry.threadId == null ? null : truncateText(entry.threadId, 512),
    analysisSessionId: truncateText(entry.analysisSessionId, 512),
    analysisFrame: entry.analysisFrame == null ? null : sanitizeAnalysisFrame(entry.analysisFrame),
    messages,
    timelineItems
  };
}

function restoreInterruptedMessage(message: CopilotChatMessage): CopilotChatMessage {
  if (message.status !== "running") return message;
  if (message.role === "assistant") {
    return {
      id: message.id,
      role: message.role,
      text: INTERRUPTED_RESPONSE_TEXT,
      status: "complete",
      createdAt: message.createdAt
    };
  }
  return {
    ...message,
    status: "complete",
    text: message.text
  };
}

function restoreStoredThread(thread: StoredChatThread): StoredChatThread {
  return {
    ...thread,
    analysisFrame: isAnalysisFrame(thread.analysisFrame) ? thread.analysisFrame : null,
    messages: thread.messages.map(restoreInterruptedMessage),
    timelineItems: thread.timelineItems.map((item) => item.type === "message"
      ? { ...item, message: restoreInterruptedMessage(item.message) }
      : item)
  };
}

export function readStoredChatHistory(homeAccountId?: string | null): StoredChatThread[] {
  if (typeof window === "undefined") return [];
  const storageKey = getChatHistoryStorageKey(homeAccountId);
  const parsed = readJsonStorage<unknown>(storageKey, {
    fallback: [],
    label: "chat history"
  });
  const legacyPayload = Array.isArray(parsed);
  const storedThreads = legacyPayload
    ? parsed
    : parsed && typeof parsed === "object" &&
        (parsed as { schemaVersion?: unknown }).schemaVersion === CHAT_HISTORY_SCHEMA_VERSION &&
        Array.isArray((parsed as { threads?: unknown }).threads)
      ? (parsed as { threads: unknown[] }).threads
      : null;
  if (!storedThreads) {
    removeStorageItem(storageKey, { label: "invalid chat history" });
    return [];
  }
  const validThreads = storedThreads
    .map(sanitizeStoredThread)
    .filter((thread): thread is StoredChatThread => Boolean(thread))
    .filter((thread) => thread.updatedAt >= Date.now() - CHAT_HISTORY_MAX_AGE_MS);
  const hadInterruptedResponse = validThreads.some((thread) =>
    thread.messages.some((message) => message.status === "running") ||
    thread.timelineItems.some((item) => item.type === "message" && item.message.status === "running")
  );
  const threads = validThreads
    .map(restoreStoredThread)
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
    .slice(0, CHAT_HISTORY_LIMIT);
  if (legacyPayload || hadInterruptedResponse || threads.length !== storedThreads.length) {
    writeStoredChatHistory(homeAccountId, threads);
  }
  return threads;
}

function serializedSize(value: unknown) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function writeStoredChatHistory(homeAccountId: string | null | undefined, entries: StoredChatThread[]) {
  if (typeof window === "undefined") return;

  const storageKey = getChatHistoryStorageKey(homeAccountId);
  let nextEntries = entries
    .map(sanitizeStoredThread)
    .filter((entry): entry is StoredChatThread => Boolean(entry))
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
    .slice(0, CHAT_HISTORY_LIMIT)
    .filter((entry) => serializedSize(entry) <= CHAT_HISTORY_THREAD_MAX_BYTES);

  const makePayload = () => ({ schemaVersion: CHAT_HISTORY_SCHEMA_VERSION, threads: nextEntries });

  while (nextEntries.length > 1 && serializedSize(makePayload()) > CHAT_HISTORY_MAX_BYTES) {
    nextEntries = nextEntries.slice(0, -1);
  }

  while (nextEntries.length) {
    const serialized = JSON.stringify(makePayload());
    if (serialized.length <= CHAT_HISTORY_MAX_BYTES && writeStorageItem(storageKey, serialized, { label: "chat history" })) {
      return;
    }
    nextEntries = nextEntries.slice(0, -1);
  }

  removeStorageItem(storageKey, { label: "oversized chat history" });
}

export function upsertStoredChatThread(homeAccountId: string | null | undefined, thread: StoredChatThread) {
  const current = readStoredChatHistory(homeAccountId);
  writeStoredChatHistory(homeAccountId, [thread, ...current.filter((entry) => entry.id !== thread.id)]);
}
