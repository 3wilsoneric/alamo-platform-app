import {
  isFrameIndependentQuestion,
  shouldIgnoreAnalysisContext
} from "../../shared/chat-context-boundary.mjs";
import {
  applyAnalysisPatch,
  createEmptyAnalysisFrame,
  createExecutionPlan,
  deriveAnalysisPatch,
  hasMeaningfulAnalysisFrame,
  isAnalysisFrame
} from "../../shared/analysis-session-state.mjs";
import {
  getCertifiedQuestionRouteById,
  matchCertifiedQuestion
} from "../../shared/certified-analyst-questions.mjs";
import {
  getAnalysisSessionFrame,
  needsPriorAnalysisContext
} from "../analysis-session-store.mjs";

/** @typedef {import("../../shared/analysis-session-state.mjs").AnalysisFrame} AnalysisFrame */
/** @typedef {import("../../shared/analysis-session-state.mjs").AnalysisExecutionPlan} AnalysisExecutionPlan */
/** @typedef {import("../../shared/certified-analyst-questions.mjs").CertifiedAnalystQuestionMatch} CertifiedAnalystQuestionMatch */
/** @typedef {import("../../shared/certified-analyst-questions.mjs").CertifiedQuestionRoute} CertifiedQuestionRoute */

/**
 * @typedef {object} MissingContextExecution
 * @property {true} missingPriorContext
 * @property {string | null} sessionId
 * @property {string} sessionOwnerKey
 * @property {AnalysisFrame | null} previousFrame
 * @property {any} frameOptions
 * @property {any} derivedFrame
 * @property {string} detectedTool
 */

/**
 * @typedef {object} ReadyAnalysisExecution
 * @property {false} missingPriorContext
 * @property {string | null} sessionId
 * @property {string} sessionOwnerKey
 * @property {AnalysisFrame | null} previousFrame
 * @property {any} frameOptions
 * @property {any} derivedFrame
 * @property {string} detectedTool
 * @property {boolean} isModuleSurfaceIntent
 * @property {boolean} isUtilityIntent
 * @property {AnalysisFrame} effectiveAnalysisFrame
 * @property {CertifiedAnalystQuestionMatch | null} certifiedQuestion
 * @property {CertifiedQuestionRoute | null} certifiedQuestionRoute
 * @property {boolean} hasExplicitAnalyticalShape
 * @property {string} fallbackTool
 * @property {boolean} contextualFollowUp
 * @property {AnalysisExecutionPlan} executionPlan
 */

function carryForwardSameDomainScope(previousFrame, derivedFrame) {
  if (!isAnalysisFrame(previousFrame) || derivedFrame.inherit) return derivedFrame;
  if (!previousFrame.facilityId || !derivedFrame.patch.metric || derivedFrame.patch.metric !== previousFrame.metric) return derivedFrame;
  if (derivedFrame.patch.residentName) return derivedFrame;
  if (Object.hasOwn(derivedFrame.patch, "facilityId")) return derivedFrame;
  if (["community", "facility"].includes(derivedFrame.patch.grouping)) return derivedFrame;
  return {
    ...derivedFrame,
    scopeCarried: true,
    patch: {
      ...derivedFrame.patch,
      facilityId: previousFrame.facilityId,
      communityName: previousFrame.communityName
    }
  };
}

function carryForwardResidentScope(previousFrame, derivedFrame, content) {
  if (!hasMeaningfulAnalysisFrame(previousFrame)) return derivedFrame;
  if (!previousFrame.residentName || derivedFrame.patch.residentName || derivedFrame.patch.facilityId || derivedFrame.patch.communityName) return derivedFrame;
  if (derivedFrame.patch.metric !== "incidents") return derivedFrame;
  const text = String(content ?? "").toLowerCase();
  const asksForResidentHistory = /\b(incident history|incidents?|history)\b/.test(text) &&
    !/\b(portfolio|all communities|all facilities|by community|by facility|community|facility)\b/.test(text);
  if (!asksForResidentHistory) return derivedFrame;
  return {
    ...derivedFrame,
    scopeCarried: true,
    patch: {
      ...derivedFrame.patch,
      residentName: previousFrame.residentName
    }
  };
}

function hasExplicitAnalysisShape(frame) {
  return Boolean(
    frame.metricGrain ||
    frame.mode ||
    frame.export ||
    frame.calculation ||
    frame.grouping ||
    frame.fields?.length
  );
}

export function createAnalysisExecutionPlanner({
  buildAnalysisFrameOptions,
  detectTool
}) {
  /** @returns {MissingContextExecution | ReadyAnalysisExecution} */
  function prepareAnalysisExecution({ payload, interpretedContent, communities, reportsSummary }) {
    const sessionId = String(payload.sessionId ?? "").trim() || null;
    const sessionOwnerKey = String(payload.sessionOwnerKey ?? "").trim() || "local-direct";
    const ignoreStoredContext = isFrameIndependentQuestion(interpretedContent);
    const previousFrame = ignoreStoredContext
      ? null
      : hasMeaningfulAnalysisFrame(payload.analysisFrame)
        ? payload.analysisFrame
        : getAnalysisSessionFrame(sessionId, sessionOwnerKey);
    const frameOptions = buildAnalysisFrameOptions(communities, reportsSummary);
    const certifiedQuestionRoute = getCertifiedQuestionRouteById(payload.certifiedQuestionRouteId);
    const directCertifiedQuestion = certifiedQuestionRoute?.question ?? matchCertifiedQuestion(interpretedContent, {
      analysisFrame: createEmptyAnalysisFrame(),
      facilities: communities.facilities ?? [],
      residents: communities.residents ?? [],
      categories: frameOptions.categories
    });
    const derivedFrame = carryForwardResidentScope(
      previousFrame,
      carryForwardSameDomainScope(
        previousFrame,
        deriveAnalysisPatch(interpretedContent, frameOptions)
      ),
      interpretedContent
    );
    const detectedTool = detectTool(interpretedContent, communities);

    if (needsPriorAnalysisContext(derivedFrame, previousFrame) && !directCertifiedQuestion) {
      return {
        missingPriorContext: true,
        sessionId,
        sessionOwnerKey,
        previousFrame,
        frameOptions,
        derivedFrame,
        detectedTool
      };
    }

    const analysisFrame = applyAnalysisPatch(previousFrame, derivedFrame);
    const guidedTool = certifiedQuestionRoute?.expectedTool ?? null;
    const isModuleSurfaceIntent = guidedTool === "surface_module" || detectedTool === "surface_module" || detectedTool === "module_catalog";
    const isUtilityIntent = isModuleSurfaceIntent || shouldIgnoreAnalysisContext({ content: interpretedContent, tool: detectedTool });
    const initialEffectiveAnalysisFrame = isUtilityIntent ? createEmptyAnalysisFrame() : analysisFrame;
    const certifiedQuestion = certifiedQuestionRoute?.question ?? matchCertifiedQuestion(interpretedContent, {
      analysisFrame: initialEffectiveAnalysisFrame,
      facilities: communities.facilities ?? [],
      residents: communities.residents ?? [],
      categories: frameOptions.categories
    }) ?? directCertifiedQuestion;
    const certifiedUtilityIntent = ["data_availability", "tool_context_catalog", "module_catalog", "surface_module"]
      .includes(guidedTool ?? certifiedQuestion?.preferredTool ?? "");
    const finalUtilityIntent = isUtilityIntent || certifiedUtilityIntent;
    const effectiveAnalysisFrame = finalUtilityIntent ? createEmptyAnalysisFrame() : initialEffectiveAnalysisFrame;
    const explicitAnalysisShape = finalUtilityIntent ? false : hasExplicitAnalysisShape(effectiveAnalysisFrame);
    const certifiedTool = guidedTool ?? certifiedQuestion?.preferredTool ?? null;
    const certifiedToolDomainConflict =
      effectiveAnalysisFrame.metric === "incidents" && /^medication_/.test(String(certifiedTool ?? ""));
    const canUseCertifiedPreferredTool = Boolean(certifiedQuestion && !isModuleSurfaceIntent && !certifiedToolDomainConflict);
    const fallbackTool = canUseCertifiedPreferredTool ? certifiedQuestion?.preferredTool ?? detectedTool : detectedTool;
    const contextualFollowUp = !finalUtilityIntent && Boolean(previousFrame && (derivedFrame.inherit || derivedFrame.scopeCarried));
    const executionPlan = createExecutionPlan(effectiveAnalysisFrame, fallbackTool, {
      // A selected question route is already the product's execution plan. Do
      // not let the generic frame compiler replace its declared tool merely
      // because the filled-in prompt contains a range, grouping, or detail
      // request.
      preferFallback: Boolean(certifiedQuestionRoute) || finalUtilityIntent || (!contextualFollowUp && !explicitAnalysisShape)
    });

    return {
      missingPriorContext: false,
      sessionId,
      sessionOwnerKey,
      previousFrame,
      frameOptions,
      derivedFrame,
      detectedTool,
      isModuleSurfaceIntent,
      isUtilityIntent: finalUtilityIntent,
      effectiveAnalysisFrame,
      certifiedQuestion,
      certifiedQuestionRoute,
      hasExplicitAnalyticalShape: explicitAnalysisShape,
      fallbackTool,
      contextualFollowUp,
      executionPlan
    };
  }

  return Object.freeze({
    prepareAnalysisExecution
  });
}
