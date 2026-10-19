export function toSpreadsheetText(value) {
  if (value == null) return "";
  const rawText = Array.isArray(value) || typeof value === "object" ? JSON.stringify(value) : String(value);
  return typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(rawText)
    ? `'${rawText}`
    : rawText;
}

export function toCsvCell(value) {
  const text = toSpreadsheetText(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
