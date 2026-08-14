import {
  DEFAULT_API_RESPONSE_MAX_BYTES,
  fetchWithApiAuth,
  readBoundedResponseText
} from "./authenticatedFetch";
import {
  assertCopilotIntentDebugResult,
  assertCopilotToolResult
} from "./copilotResponseSchemas";
import type { GovernedReportSource } from "../../../shared/governed-report.mjs";

export interface CopilotChatAction {
  label: string;
  kind: "route" | "external" | "download" | "tool";
  route?: string;
  url?: string | null;
  filename?: string;
  content?: string;
  mimeType?: string;
  tool?: string;
  prompt?: string;
  certifiedQuestionRouteId?: string;
}

export interface CopilotToolVisual {
  type:
    | "bar_chart"
    | "line_chart"
    | "multi_line_chart"
    | "heatmap"
    | "donut_chart"
    | "comparison_chart"
    | "ranked_list"
    | "table"
    | "profile_card"
    | "summary_card";
  title: string;
  subtitle?: string;
  valueLabel?: string;
  columns?: string[];
  originalRowCount?: number;
  isHistoryPreview?: boolean;
  rows: Array<{
    label: string;
    value: number;
    meta?: string;
    cells?: Array<string | number | null>;
  }>;
}

export interface CopilotAdHocModuleSpec {
  version: "1.0";
  id: string;
  moduleId: string | null;
  templateId: "trend-line" | "multi-series-line" | "period-heatmap" | "composition-donut" | "comparison-bars" | "ranked-bars" | "data-table" | "resident-profile" | "topline-summary" | "simple-bars";
  family: string;
  title: string;
  scope: "portfolio" | "community" | "resident";
  filters: Record<string, string | null>;
  provenance: {
    tool: string | null;
    dataSource: string | null;
    rowCount: number | null;
    visibleRowCount: number | null;
    originalRowCount: number | null;
    artifactRowCount: number | null;
    rowSetId: string | null;
    dataset: string | null;
    engineVersion: string | null;
  };
  selectionReason: {
    code:
      | "direct_answer"
      | "requested_census_context"
      | "requested_incident_context"
      | "requested_medication_context"
      | "requested_documentation_context"
      | "requested_resident_context"
      | "requested_operating_context";
    label: string;
  };
  interactions: string[];
  visual: CopilotToolVisual;
  request: string;
}

export interface CopilotQueryInterpretation {
  originalText: string;
  correctedText: string;
  changed: boolean;
  requiresConfirmation: boolean;
  corrections: Array<{
    original: string;
    suggestion: string;
    alternatives: string[];
    domain: string;
    confidence: number;
    requiresConfirmation: boolean;
  }>;
}

export interface CopilotChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  status: "complete" | "running";
  createdAt: number | null;
  meta?: {
    assistantLabel?: string;
    model?: string;
    actions?: CopilotChatAction[];
    visual?: CopilotToolVisual;
    moduleSpec?: CopilotAdHocModuleSpec;
    moduleSpecs?: CopilotAdHocModuleSpec[];
    toolTrace?: CopilotToolTrace;
    runtimeSchema?: CopilotRuntimeSchemaValidation;
    turnTrace?: CopilotTurnTrace;
    interpretation?: CopilotQueryInterpretation;
    certifiedQuestion?: CopilotCertifiedQuestionMeta;
    cached?: boolean;
    deterministicGuard?: boolean;
    forceClaude?: boolean;
    deterministicOverride?: boolean;
    certifiedQuestionRouteId?: string;
    transient?: boolean;
    variant?: "process" | "suggestion";
    reportSource?: GovernedReportSource;
  };
}

export interface CopilotCertifiedQuestionMeta {
  version: string;
  id: string;
  title: string;
  description: string;
  preferredTool: string;
  answerStyle: string;
  cacheKey: string;
  confidence: number;
  executionMode?: "deterministic_only" | "verified_synthesis_optional" | "agentic_synthesis";
  claudeRole?: string;
  routeId?: string;
}

export interface AnalysisFrame {
  version: "1.0";
  revision: number;
  metric: string | null;
  metricGrain: string | null;
  category: string | null;
  mode: string | null;
  periods: string[];
  grouping: string | null;
  fields: string[];
  export: boolean;
  facilityId: string | null;
  communityName: string | null;
  residentName: string | null;
  calculation: string | null;
  presentation: string | null;
  sourcePrompt: string | null;
}

export interface AnalysisExecutionPlan {
  version: "1.0";
  tool: string | null;
  capability?: {
    temporalScope: "current_state" | "mixed";
    supportsExplicitPeriods: boolean;
    historicalAlternative: string | null;
  };
  canonicalPrompt: string;
  expected: Record<string, unknown>;
  preflight?: {
    valid: boolean;
    errors: Array<{
      code: string;
      message: string;
      tool: string | null;
      requestedPeriods: string[];
    }>;
  };
}

export interface CopilotIntentDebugResult {
  handled: boolean;
  reason?: string;
  originalContent?: string;
  interpretedContent?: string;
  interpretation?: CopilotQueryInterpretation;
  derivedFrame?: {
    patch?: Partial<AnalysisFrame>;
    inherit?: boolean;
    referential?: boolean;
  };
  analysisFrame?: AnalysisFrame | null;
  detectedTool?: string | null;
  certifiedQuestion?: CopilotCertifiedQuestionMeta | null;
  executionPlan?: AnalysisExecutionPlan;
  compiler?: {
    frameFirst: boolean;
    fallbackTool: string | null;
    isModuleSurfaceIntent: boolean;
    hasExplicitAnalyticalShape: boolean;
    inherited: boolean;
  };
}

export interface CopilotToolArtifact {
  type: "csv";
  filename: string;
  mimeType: string;
  content: string;
  rowSetId?: string;
  rowCount?: number;
}

export type CopilotTruthState =
  | "valid_rows"
  | "verified_zero"
  | "summary_not_shown"
  | "not_loaded"
  | "stale"
  | "plan_rejected";

export interface CopilotToolTrace {
  source?: string;
  tool?: string;
  dataSource?: string;
  rowCount?: number | null;
  communityName?: string | null;
  facilityId?: string | null;
  period?: string | null;
  note?: string | null;
  truthState?: CopilotTruthState | string | null;
  engineVersion?: string | null;
  turnId?: string | null;
  promptHash?: string | null;
  schemaValid?: boolean | null;
  schemaWarningCount?: number | null;
  schemaErrorCount?: number | null;
}

export interface CopilotRuntimeSchemaValidation {
  version: string;
  valid: boolean;
  errorCount: number;
  warningCount: number;
  errors: string[];
  warnings: string[];
}

export interface CopilotTurnTrace {
  version: string;
  turnId: string;
  stage: string;
  promptHash: string;
  promptLength: number;
  requestedTool: string | null;
  selectedTool: string | null;
  expectedTool: string | null;
  answerFamily: string | null;
  truthState: CopilotTruthState | string | null;
  rowCount: number | null;
  cache: {
    used: boolean;
    eligible: boolean | null;
    reason: string | null;
  };
  validation: {
    valid: boolean | null;
    errors: string[];
  };
  schema: {
    valid: boolean;
    errorCount: number;
    warningCount: number;
  } | null;
  module: {
    id: string;
    templateId: string;
    family: string;
    scope: string;
    count?: number;
    ids?: string[];
  } | null;
}

export interface CopilotToolResult {
  handled: boolean;
  tool?: "run_analysis" | "export_csv" | string;
  text?: string;
  reason?: string;
  artifact?: CopilotToolArtifact;
  visual?: CopilotToolVisual;
  moduleSpec?: CopilotAdHocModuleSpec;
  moduleSpecs?: CopilotAdHocModuleSpec[];
  trace?: CopilotToolTrace;
  runtimeSchema?: CopilotRuntimeSchemaValidation;
  turnTrace?: CopilotTurnTrace;
  interpretation?: CopilotQueryInterpretation;
  certifiedQuestion?: CopilotCertifiedQuestionMeta;
  actions?: CopilotChatAction[];
  analysisFrame?: AnalysisFrame | null;
  executionPlan?: AnalysisExecutionPlan;
  planValidation?: { valid: boolean; errors: string[] };
  truthState?: CopilotTruthState;
  safeRefusal?: boolean;
  contractViolation?: string;
  guidedContract?: {
    valid: boolean;
    routeId: string;
    failures: string[];
  };
  provenance?: {
    rowSetId?: string;
    rowCount?: number;
    dataset?: string;
  };
  cached?: boolean;
}

async function readJson<T>(response: Response) {
  const text = await readBoundedResponseText(
    response,
    response.ok ? DEFAULT_API_RESPONSE_MAX_BYTES : 64 * 1024
  );
  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = JSON.parse(text);
    } catch {
      // The public fallback below avoids rendering raw proxy or upstream bodies.
    }
    if (isRecord(payload) && typeof payload.error === "string") throw new Error(payload.error);
    throw new Error(`Request failed (${response.status})`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("The server returned a response the workspace could not read.");
  }
}

const CHAT_TOOL_TIMEOUT_MS = 45_000;
const CHAT_INTENT_TIMEOUT_MS = 20_000;
const CHAT_SESSION_RESET_TIMEOUT_MS = 10_000;

async function fetchWithTimeout<T>(url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal) {
  return fetchWithApiAuth(url, {
    ...init,
    ...(signal ? { signal } : {})
  }, {
    timeoutMs,
    consume: readJson<T>
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function runCopilotTool(payload: {
  content: string;
  sessionId?: string;
  analysisFrame?: AnalysisFrame | null;
  certifiedQuestionRouteId?: string;
}, options?: { signal?: AbortSignal }) {
  const result = await fetchWithTimeout<unknown>("/api/chat/tools", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, CHAT_TOOL_TIMEOUT_MS, options?.signal);
  return assertCopilotToolResult(result);
}

export async function compileCopilotIntent(payload: {
  content: string;
  sessionId?: string;
  analysisFrame?: AnalysisFrame | null;
  certifiedQuestionRouteId?: string;
}, options?: { signal?: AbortSignal }) {
  const result = await fetchWithTimeout<unknown>("/api/chat/intent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, CHAT_INTENT_TIMEOUT_MS, options?.signal);
  return assertCopilotIntentDebugResult(result);
}

export async function resetCopilotAnalysisSession(sessionId?: string | null) {
  if (!sessionId) return { ok: true, cleared: false };

  const result = await fetchWithTimeout<unknown>("/api/chat/session/reset", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ sessionId })
  }, CHAT_SESSION_RESET_TIMEOUT_MS);
  return isRecord(result) && typeof result.ok === "boolean"
    ? result as { ok: boolean; cleared: boolean }
    : { ok: false, cleared: false };
}
