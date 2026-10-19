import { createHash } from "node:crypto";
import { toCsvCell } from "../../shared/csv.mjs";

const DEFAULT_MAX_VISUAL_ROWS = 50;

export function displayValue(value) {
  return value == null || value === "" ? "—" : String(value);
}

export function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    headers.map(toCsvCell).join(","),
    ...rows.map((row) => headers.map((header) => toCsvCell(row[header])).join(","))
  ].join("\n");
}

export function makePreviewTableVisual({
  title,
  subtitle,
  valueLabel,
  columns,
  rows,
  totalRows = rows.length,
  maxVisualRows = DEFAULT_MAX_VISUAL_ROWS
}) {
  const visualRows = rows.slice(0, maxVisualRows);
  return {
    type: "table",
    title,
    // The browser owns preview state because it may render fewer rows than the
    // server payload. Keep the subtitle factual and carry the total separately.
    subtitle,
    valueLabel,
    columns,
    rows: visualRows,
    originalRowCount: totalRows
  };
}

export function fingerprintRows(rows) {
  return createHash("sha256")
    .update(JSON.stringify(rows))
    .digest("hex")
    .slice(0, 16);
}

export function wantsAllRows(content) {
  return /\b(all|every|complete|full list|entire)\b/i.test(content);
}
