const UTILITY_TOOLS = new Set([
  "data_availability",
  "tool_context_catalog",
  "module_catalog",
  "surface_module"
]);

function normalizeChatBoundaryText(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isDataCoverageQuestion(value) {
  const text = normalizeChatBoundaryText(value);
  return /\b(data availability|data freshness|coverage window|coverage|loaded dates?|latest loaded|latest incident date|how current|how fresh|available periods?|date range|history available)\b/.test(text) ||
    /\b(snapshot|platform|data|incident|incidents|resident|residents|client|clients|roster|census|documentation|medication|meds)\b.*\b(stale|fresh|refresh|refreshed|last refresh|last updated|loaded|available|coverage)\b/.test(text) ||
    /\b(when|what time)\b.*\b(platform|snapshot|data|incident|incidents)\b.*\b(refresh|refreshed|updated|loaded)\b/.test(text) ||
    /\b(do we have|can you answer|is there|are there)\b.*\b(incident|incidents|census|resident|residents|client|clients|roster|documentation|medication|meds)\b.*\b(data|rows?|detail|coverage|loaded|available)\b/.test(text);
}

function isIncidentFreshnessQuestion(value) {
  const text = normalizeChatBoundaryText(value);
  return /\b(incident|incidents)\b/.test(text) &&
    (
      /\b(today|todays|fresh|freshness|stale|latest|showing up|not showing|received today|right now|behind|delayed|delay|synced|sync|updated|last updated|received|come in|came in|new incidents?|source feed|incident feed|feed|empty|zero)\b/.test(text) ||
      /\b(are|is|how|why|when|did|do)\b.*\b(current|load|loaded|received|updated|behind|delayed|synced|available|empty|zero)\b/.test(text)
    );
}

export function isFrameIndependentQuestion(value) {
  return isDataCoverageQuestion(value) || isIncidentFreshnessQuestion(value);
}

function isUtilityTool(tool) {
  return UTILITY_TOOLS.has(String(tool ?? ""));
}

/** @param {{ content?: unknown, tool?: unknown }} [input] */
export function shouldIgnoreAnalysisContext(input = {}) {
  const { content, tool } = input;
  return isUtilityTool(tool) || isFrameIndependentQuestion(content);
}
