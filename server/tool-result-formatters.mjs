import { formatMonthLabel } from "../shared/period-utils.mjs";

export function formatPlanValidationErrorsForUser(errors = []) {
  const formatted = errors.map((error) => {
    const text = String(error ?? "");
    const missingPeriod = text.match(/missing requested period (20\d{2}-\d{2})/i);
    if (missingPeriod) return `Missing period: ${formatMonthLabel(missingPeriod[1])}.`;
    const missingCategory = text.match(/missing requested category (.+)$/i);
    if (missingCategory) return "The requested category is not shown in this view.";
    const wrongTool = text.match(/expected tool ([^,]+), received (.+)$/i);
    if (wrongTool) return `The selected tool returned ${wrongTool[2]} instead of ${wrongTool[1]}.`;
    const fieldMissing = text.match(/requested field (.+) is missing/i);
    if (fieldMissing) return `Missing requested field: ${fieldMissing[1]}.`;
    const groupingMissing = text.match(/requested grouping (.+) is missing/i);
    if (groupingMissing) return `Missing requested grouping: ${groupingMissing[1]}.`;
    return text.replace(/^the tool result did not satisfy the analysis plan\.?\s*/i, "").trim();
  }).filter(Boolean);

  return formatted.length ? formatted.join(" ") : "The result did not match the requested scope.";
}

export function formatIncidentCategoryFilterLabel(categoryFilter) {
  if (!categoryFilter) return null;
  const normalized = String(categoryFilter).toLowerCase().replace(/[^a-z0-9\s/]/g, " ").replace(/\s+/g, " ").trim();
  if (normalized === "awol") return "AWOL/Elopement";
  if (normalized === "substance" || normalized === "aggressive" || normalized === "other") return "Other";
  if (normalized === "medication refusal") return "Other";
  return String(categoryFilter).replace(/\b\w/g, (letter) => letter.toUpperCase());
}
