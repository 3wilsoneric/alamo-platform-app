import {
  getPlatformModuleByCanvasId,
  type CanvasModuleId
} from "../../../shared/platform-module-registry.mjs";
import type {
  CopilotChatMessage,
  CopilotToolResult
} from "../../shared/api/copilotChat";
import type { GovernedReportSource } from "../../../shared/governed-report.mjs";
import type { ModuleContext } from "./chatHistory";
import { getToolAssistantLabel } from "./chatRuntime";

export function getModuleMeta(module: CanvasModuleId, context?: ModuleContext) {
  const definition = getPlatformModuleByCanvasId(
    module,
    context?.focus ?? (module === "residentSearch" ? "search" : null)
  );
  return {
    eyebrow: definition?.eyebrow ?? "Platform module",
    title: definition?.title ?? "Platform module",
    body: definition?.description ?? "A reusable platform module surfaced in this thread."
  };
}

export function createToolResultMessage(toolResult: CopilotToolResult): CopilotChatMessage {
  const actions = [...(toolResult.actions ?? [])];
  if (toolResult.artifact) {
    actions.unshift({
      label: `Download ${toolResult.artifact.filename}`,
      kind: "download",
      filename: toolResult.artifact.filename,
      content: toolResult.artifact.content,
      mimeType: toolResult.artifact.mimeType
    });
  }

  const routeId = toolResult.certifiedQuestion?.routeId ?? toolResult.guidedContract?.routeId;
  const truthState = toolResult.truthState ?? toolResult.trace?.truthState ?? toolResult.turnTrace?.truthState;
  const reportEligible = (
    toolResult.handled === true &&
    Boolean(routeId) &&
    ["valid_rows", "verified_zero"].includes(String(truthState ?? "")) &&
    toolResult.safeRefusal !== true &&
    !toolResult.contractViolation &&
    toolResult.runtimeSchema?.valid === true &&
    toolResult.turnTrace?.validation?.valid === true &&
    toolResult.guidedContract?.valid === true
  );
  const reportSource: GovernedReportSource | null = reportEligible
    ? {
        handled: true,
        routeId: routeId!,
        question:
          toolResult.analysisFrame?.sourcePrompt ??
          toolResult.moduleSpec?.request ??
          toolResult.certifiedQuestion?.title ??
          routeId!,
        answer: toolResult.text ?? "",
        ...(toolResult.tool ? { tool: toolResult.tool } : {}),
        truthState: String(truthState),
        scope:
          toolResult.trace?.communityName ??
          toolResult.analysisFrame?.communityName ??
          toolResult.analysisFrame?.residentName ??
          "Portfolio",
        period:
          toolResult.trace?.period ??
          toolResult.analysisFrame?.periods?.join(" to ") ??
          "Latest approved data",
        ...(toolResult.cached !== undefined ? { cached: toolResult.cached } : {}),
        ...(toolResult.visual
          ? { visual: {
              ...toolResult.visual,
              rows: toolResult.visual.rows.slice(0, 12)
            } }
          : {}),
        runtimeSchema: toolResult.runtimeSchema!,
        turnTrace: toolResult.turnTrace! as unknown as NonNullable<GovernedReportSource["turnTrace"]>,
        ...(toolResult.certifiedQuestion ? { certifiedQuestion: toolResult.certifiedQuestion } : {}),
        guidedContract: toolResult.guidedContract!,
        ...(toolResult.analysisFrame ? { analysisFrame: toolResult.analysisFrame } : {}),
        ...(toolResult.provenance ? { provenance: toolResult.provenance } : {})
      }
    : null;

  return {
    id: `tool-${Date.now()}`,
    role: "assistant",
    text: toolResult.text ?? "Tool completed.",
    status: "complete",
    createdAt: Date.now(),
    meta: {
      assistantLabel: getToolAssistantLabel(toolResult.tool, Boolean(toolResult.visual)),
      actions,
      ...(toolResult.visual ? { visual: toolResult.visual } : {}),
      ...(toolResult.moduleSpec ? { moduleSpec: toolResult.moduleSpec } : {}),
      ...(toolResult.moduleSpecs ? { moduleSpecs: toolResult.moduleSpecs } : {}),
      ...(toolResult.trace ? { toolTrace: toolResult.trace } : {}),
      ...(toolResult.runtimeSchema ? { runtimeSchema: toolResult.runtimeSchema } : {}),
      ...(toolResult.turnTrace ? { turnTrace: toolResult.turnTrace } : {}),
      ...(toolResult.interpretation ? { interpretation: toolResult.interpretation } : {}),
      ...(toolResult.certifiedQuestion ? { certifiedQuestion: toolResult.certifiedQuestion } : {}),
      ...(toolResult.cached !== undefined ? { cached: toolResult.cached } : {}),
      ...(reportSource ? { reportSource } : {})
    }
  };
}
