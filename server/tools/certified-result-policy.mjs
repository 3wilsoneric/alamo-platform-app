import { getAnalystCapability } from "../../shared/analyst-capability-registry.mjs";
import {
  buildCertifiedFollowUps,
  makeCertifiedQuestionMeta
} from "../../shared/certified-analyst-questions.mjs";
import { validateGuidedQuestionResult } from "../../shared/guided-question-contracts.mjs";

/**
 * @param {import("../../shared/certified-analyst-questions.mjs").CertifiedAnalystQuestionMatch | null} question
 * @param {import("../../shared/analysis-session-state.mjs").AnalysisFrame | Record<string, never>} [frame]
 * @param {string | null | undefined} [routeId]
 */
export function makeCapabilityCertifiedQuestionMeta(question, frame = {}, routeId = null) {
  const meta = makeCertifiedQuestionMeta(question, frame);
  const questionId = typeof meta?.id === "string" ? meta.id : null;
  const capability = questionId ? getAnalystCapability(questionId) : null;
  const routeMeta = meta && routeId
    ? { ...meta, routeId, cacheKey: `${meta.cacheKey}:route:${routeId}` }
    : meta;
  return routeMeta && capability
    ? { ...routeMeta, executionMode: capability.executionMode, claudeRole: capability.claudeRole }
    : routeMeta;
}

/** @param {import("../../shared/certified-analyst-questions.mjs").CertifiedQuestionRoute | null} route */
export function validateCertifiedRouteResult(content, result, route) {
  if (!route) return { valid: true, failures: [] };
  return validateGuidedQuestionResult({
    questionId: route.familyId,
    route,
    content,
    result
  });
}

/** @param {import("../../shared/certified-analyst-questions.mjs").CertifiedQuestionRoute | null} route */
export function enforceCertifiedRouteResult(content, result, route) {
  if (!route) return result;
  const guidedContract = validateCertifiedRouteResult(content, result, route);
  if (guidedContract.valid) {
    return {
      ...result,
      guidedContract: {
        valid: true,
        routeId: route.id,
        failures: []
      }
    };
  }

  return {
    handled: true,
    tool: result?.tool ?? route.expectedTool,
    text: "This question is temporarily unavailable because its answer did not pass the platform's report checks. No partial result was shown.",
    truthState: "plan_rejected",
    safeRefusal: true,
    contractViolation: `guided question contract failed: ${guidedContract.failures.join("; ")}`,
    certifiedQuestion: result?.certifiedQuestion,
    trace: {
      ...(result?.trace ?? {}),
      truthState: "plan_rejected",
      note: "guided question contract rejected the result"
    },
    actions: [],
    guidedContract: {
      valid: false,
      routeId: route.id,
      failures: guidedContract.failures
    }
  };
}

/**
 * @param {any} result
 * @param {import("../../shared/certified-analyst-questions.mjs").CertifiedAnalystQuestionMatch | null} question
 * @param {import("../../shared/analysis-session-state.mjs").AnalysisFrame} frame
 * @param {string} content
 * @param {string | null | undefined} [routeId]
 */
export function withCertifiedGuidance(result, question, frame, content, routeId = null) {
  if (!result?.handled || !question) return result;
  if (result.safeRefusal) {
    return {
      ...result,
      certifiedQuestion: makeCapabilityCertifiedQuestionMeta(question, frame, routeId)
    };
  }
  const certifiedActions = buildCertifiedFollowUps(result, frame, content);
  const existingActions = result.actions ?? [];
  const seen = new Set();
  const actions = [...certifiedActions, ...existingActions].filter((action) => {
    const key = `${action.kind}:${action.label}:${action.prompt ?? action.route ?? action.url ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);

  return {
    ...result,
    certifiedQuestion: makeCapabilityCertifiedQuestionMeta(question, frame, routeId),
    actions
  };
}
