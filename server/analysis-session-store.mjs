import {
  hasMeaningfulAnalysisFrame,
  isAnalysisFrame
} from "../shared/analysis-session-state.mjs";

const MAX_ANALYSIS_SESSIONS = 500;
const analysisSessions = new Map();

function getSessionKey(sessionId, ownerKey = "local-direct") {
  if (!sessionId) return null;
  return `${String(ownerKey || "local-direct")}\u001f${sessionId}`;
}

function getAnalysisSession(sessionId, ownerKey) {
  if (!sessionId) return null;
  const stored = analysisSessions.get(getSessionKey(sessionId, ownerKey));
  if (!stored) return null;
  if (isAnalysisFrame(stored)) {
    return {
      frame: stored,
      lastResult: null,
      lastPlan: null,
      updatedAt: null
    };
  }
  return stored && isAnalysisFrame(stored.frame) ? stored : null;
}

function summarizeAnalysisResult(result, plan) {
  if (!result?.handled) return null;
  return {
    tool: result.tool ?? null,
    trace: result.trace ?? null,
    visual: result.visual
      ? {
          type: result.visual.type,
          title: result.visual.title,
          subtitle: result.visual.subtitle,
          valueLabel: result.visual.valueLabel,
          rowCount: result.visual.rows?.length ?? 0
        }
      : null,
    artifact: result.artifact
      ? {
          filename: result.artifact.filename,
          mimeType: result.artifact.mimeType,
          bytes: result.artifact.content ? String(result.artifact.content).length : 0
        }
      : null,
    expected: plan?.expected ?? null
  };
}

export function getAnalysisSessionFrame(sessionId, ownerKey) {
  const frame = getAnalysisSession(sessionId, ownerKey)?.frame ?? null;
  return hasMeaningfulAnalysisFrame(frame) ? frame : null;
}

/**
 * @param {string} sessionId
 * @param {import("../shared/analysis-session-state.mjs").AnalysisFrame} frame
 * @param {any | null} [result]
 * @param {import("../shared/analysis-session-state.mjs").AnalysisExecutionPlan | null} [plan]
 * @param {string} [ownerKey]
 */
export function saveAnalysisSession(sessionId, frame, result = null, plan = null, ownerKey = "local-direct") {
  if (!sessionId || !isAnalysisFrame(frame)) return;
  const sessionKey = getSessionKey(sessionId, ownerKey);
  if (!hasMeaningfulAnalysisFrame(frame)) {
    analysisSessions.delete(sessionKey);
    return;
  }
  const previous = getAnalysisSession(sessionId, ownerKey);
  analysisSessions.delete(sessionKey);
  analysisSessions.set(sessionKey, {
    frame,
    lastResult: result ? summarizeAnalysisResult(result, plan) : previous?.lastResult ?? null,
    lastPlan: plan ?? previous?.lastPlan ?? null,
    updatedAt: new Date().toISOString()
  });
  if (analysisSessions.size > MAX_ANALYSIS_SESSIONS) {
    analysisSessions.delete(analysisSessions.keys().next().value);
  }
}

export function resetAnalysisSession(sessionId, ownerKey = "local-direct") {
  if (!sessionId) return { ok: true, cleared: false };
  return { ok: true, cleared: analysisSessions.delete(getSessionKey(sessionId, ownerKey)) };
}

export function needsPriorAnalysisContext(derivedFrame, previousFrame) {
  if (!derivedFrame?.inherit || hasMeaningfulAnalysisFrame(previousFrame)) return false;
  const patch = derivedFrame.patch ?? {};
  return !(
    patch.metric ||
    patch.metricGrain ||
    patch.category ||
    patch.mode ||
    patch.grouping ||
    patch.fields?.length ||
    patch.export ||
    patch.facilityId ||
    patch.communityName ||
    patch.residentName ||
    patch.calculation ||
    patch.presentation
  );
}
