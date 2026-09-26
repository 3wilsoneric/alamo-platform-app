export function getChartNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).replace(/,/g, "").replace(/%/g, "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseChartNumber(value) {
  return getChartNumber(value) ?? 0;
}

export function formatChartNumber(value, valueLabel = null) {
  const parsed = getChartNumber(value);
  if (parsed == null) return "—";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: String(valueLabel ?? "").includes("%") ? 1 : 0
  }).format(parsed);
}

export function getPositiveChartWidth(value, maximum, minimumPercent = 5) {
  const parsed = getChartNumber(value);
  if (parsed == null || parsed <= 0 || maximum <= 0) return 0;
  return Math.min(Math.max((parsed / maximum) * 100, minimumPercent), 100);
}
