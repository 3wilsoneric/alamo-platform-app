import type {
  CopilotChatAction,
  CopilotChatMessage,
  CopilotToolTrace
} from "../../shared/api/copilotChat";
import { formatMonthLabel } from "../../../shared/period-utils.mjs";

export async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some browsers expose the Clipboard API but reject it outside a secure
      // user gesture. Fall through to the compatibility path.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.setAttribute("aria-hidden", "true");
  document.body.appendChild(textarea);
  let copied = false;
  try {
    textarea.focus();
    textarea.select();
    copied = typeof document.execCommand === "function" && document.execCommand("copy");
  } finally {
    textarea.remove();
  }

  if (!copied) {
    throw new Error("The browser rejected the clipboard operation.");
  }
}

export function isRequestAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRequestTimeoutError(error: unknown) {
  return error instanceof DOMException && error.name === "TimeoutError";
}

function getChatRequestErrorMessage(error: unknown, fallback: string) {
  if (isRequestTimeoutError(error)) {
    return "That request took too long, so I stopped it before it could hang the workspace. Retry it, or use one of the verified surfaces already in the thread.";
  }

  if (error instanceof TypeError && /fetch|network|failed/i.test(error.message)) {
    return "The workspace could not reach the analysis service. Check the API/deployment, then try again.";
  }

  return fallback;
}

export function getFallbackSurfaceActions(content: string): CopilotChatAction[] {
  const normalized = content.toLowerCase();
  const actions: CopilotChatAction[] = [];

  if (/incident|awol|fall|refusal|aggressive|emergency|elopement/.test(normalized)) {
    actions.push({
      label: "Open Incident Center",
      kind: "route",
      route: "/incidents"
    });
  }

  if (/resident|client|person|profile|name|unit|diagnosis|los|length of stay/.test(normalized)) {
    actions.push({
      label: "Open Resident Search",
      kind: "route",
      route: "/resident-search"
    });
  }

  if (/community|communities|census|san pablo|santa clarita|wallace|turlock|victoria/.test(normalized)) {
    actions.push({
      label: "Open Communities",
      kind: "route",
      route: "/communities"
    });
  }

  actions.push({
    label: "Show data availability",
    kind: "tool",
    prompt: "show data availability"
  });

  if (!actions.some((action) => action.route === "/incidents")) {
    actions.push({
      label: "Open Incident Center",
      kind: "route",
      route: "/incidents"
    });
  }

  if (!actions.some((action) => action.route === "/communities")) {
    actions.push({
      label: "Open Communities",
      kind: "route",
      route: "/communities"
    });
  }

  return actions.slice(0, 3);
}

export function createFallbackMessage(content: string, error: unknown, assistantLabel = "Fallback mode"): CopilotChatMessage {
  const message = getChatRequestErrorMessage(error, "The analysis request failed.");

  return {
    id: `fallback-${Date.now()}`,
    role: "assistant",
    text: `${message}\n\nOpen a structured surface below, or rerun the same question.`,
    status: "complete",
    createdAt: Date.now(),
    meta: {
      assistantLabel,
      actions: getFallbackSurfaceActions(content)
    }
  };
}

export function getToolAssistantLabel(tool?: string, hasVisual = false) {
  if (tool === "clarification") return "Clarification";
  if (tool === "data_recovery") return "Search assist";
  if (tool === "export_csv") return "CSV export";
  if (tool === "resident_lookup") return "Resident profile";
  if (tool === "community_profile") return "Community profile";
  if (tool === "community_history") return "Community history";
  if (hasVisual || tool?.startsWith("ad_hoc_")) return "AH Analyst";
  return "AH Analyst";
}

function formatTracePeriod(value?: string | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
      if (!match) return item;
      return formatMonthLabel(item, { fallback: item });
    })
    .join(" to ");
}

export function formatToolTrace(trace?: CopilotToolTrace) {
  if (!trace?.source) return null;
  const toolLabel = trace.tool
    ? String(trace.tool)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : null;
  const period = formatTracePeriod(trace.period);
  const pieces = [
    "Verified",
    toolLabel,
    period
  ].filter(Boolean);

  return pieces.join(" · ");
}
