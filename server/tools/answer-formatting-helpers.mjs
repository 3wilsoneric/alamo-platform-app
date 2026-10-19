export function parseDisplayNumber(value) {
  const text = String(value ?? "").replace(/,/g, "").replace(/%/g, "").trim();
  if (!text || text === "—") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function firstMeaningfulTextLine(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !/^[A-Z][A-Za-z\s]+$/.test(line)) ?? "";
}

export function isRankingOrComparisonIntent(text) {
  return /\b(top|largest|highest|lowest|most|least|biggest|rank|which|winner|compare|comparison|versus| vs |change|moved|movement|increase|decrease|up|down|drop|decline)\b/.test(text);
}

export function isRelativeLatestIntent(text) {
  return /\b(current|today|this month|latest)\b/.test(text);
}

export function hasExplicitMonthIntent(text) {
  return /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+20\d{2})?\b|\b20\d{2}-\d{2}\b/.test(text);
}

export function previousMonthLabel(period) {
  const match = String(period ?? "").match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/i);
  if (!match?.[1] || !match[2]) return "the prior month";
  const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .indexOf(match[1].slice(0, 3).toLowerCase());
  if (monthIndex < 0) return "the prior month";
  const prior = new Date(Date.UTC(Number(match[2]), monthIndex - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(prior);
}

export function executiveValueLabel(value, fallback = "entries") {
  const label = String(value ?? fallback).trim() || fallback;
  return label
    .replace(/\brows?\b/gi, "entries")
    .replace(/\bincident records?\b/gi, "incidents")
    .replace(/\bincident events?\b/gi, "incidents")
    .toLowerCase();
}

export function movementComparison(rawValue, periodPhrase = "the previous available month") {
  const value = parseDisplayNumber(rawValue);
  if (value == null) return null;
  if (value === 0) return `unchanged from ${periodPhrase}`;
  return `${Math.abs(value)} ${value > 0 ? "more" : "fewer"} than in ${periodPhrase}`;
}

export function formatOneDecimal(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(1) : null;
}

export function formatPercentageChange(delta, baseline) {
  const change = Number(delta);
  const startingValue = Number(baseline);
  if (!Number.isFinite(change) || !Number.isFinite(startingValue) || startingValue === 0) return null;
  return `${change > 0 ? "up" : "down"} ${Math.abs(change / startingValue * 100).toFixed(1)}%`;
}

export function formatNaturalList(values) {
  const items = values.filter(Boolean);
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function wordCount(value) {
  return String(value ?? "").split(/\s+/).filter(Boolean).length;
}

export const EXISTING_ANSWER_UPGRADE_TOOLS = new Set([
  "community_time_series",
  "data_availability",
  "incident_rate",
  "medication_orders_current",
  "medication_exception_detail",
  "resident_incident_history"
]);
