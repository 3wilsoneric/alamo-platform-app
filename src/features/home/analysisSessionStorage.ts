import type { AnalysisFrame } from "../../shared/api/copilotChat";
import {
  removeStorageItem,
  writeJsonStorage
} from "../../shared/storage/browserStorage";

const ANALYSIS_SESSION_STORAGE_KEY = "alamo-platform:analysis-session-v1";
const ANALYSIS_SESSION_SCHEMA_VERSION = 2;

export function createAnalysisSessionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `analysis-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createFreshAnalysisSession(): { sessionId: string; frame: AnalysisFrame | null } {
  return {
    sessionId: createAnalysisSessionId(),
    frame: null
  };
}

export function persistAnalysisSession(sessionId: string, frame: AnalysisFrame | null) {
  if (typeof window === "undefined") return;
  writeJsonStorage(
    ANALYSIS_SESSION_STORAGE_KEY,
    {
      schemaVersion: ANALYSIS_SESSION_SCHEMA_VERSION,
      sessionId,
      frame
    },
    { kind: "session", label: "analysis session" }
  );
}

export function clearStoredAnalysisSession() {
  if (typeof window === "undefined") return;
  removeStorageItem(ANALYSIS_SESSION_STORAGE_KEY, { kind: "session", label: "analysis session" });
}
