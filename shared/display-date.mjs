import { PLATFORM_REPORTING_TIME_ZONE } from "./reporting-date.mjs";
import { formatMonthLabel } from "./period-utils.mjs";

// Intl construction is expensive across a full roster. Cache only the native
// month vocabulary; invalid/custom options still receive native validation.
// Like other runtime locale configuration, a default-timezone change requires
// restarting the process. Timestamp formatting uses the explicit reporting zone.
const dateFormatters = new Map();
const timestampFormatters = new Map();
const cacheableMonths = new Set(["numeric", "2-digit", "long", "short", "narrow"]);

function displayFormatter(cache, month, options) {
  if (!cacheableMonths.has(month)) return new Intl.DateTimeFormat("en-GB", options);
  let formatter = cache.get(month);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", options);
    cache.set(month, formatter);
  }
  return formatter;
}

function isEmptyDateValue(value) {
  return (
    value == null ||
    String(value).trim() === "" ||
    /^[-—]+$/.test(String(value).trim()) ||
    /invalid date/i.test(String(value))
  );
}

function buildDate(year, month, day) {
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }
  return date;
}

export function parseDisplayDate(value) {
  if (isEmptyDateValue(value)) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoMatch) return buildDate(isoMatch[1], isoMatch[2], isoMatch[3]);

  const separatedMatch = text.match(/^(\d{1,4})([!/.])(\d{1,2})\2(\d{1,4})(?:\s.*)?$/);
  if (separatedMatch) {
    const [, first, separator, second, third] = separatedMatch;
    if (first.length === 4) return buildDate(first, second, third);

    if (separator === "!") {
      // ElderMark dates are day!month!four-digit-year. Never guess a century.
      return third.length === 4 ? buildDate(third, second, first) : null;
    }

    const year = third.length === 4 ? third : third.length === 2 ? `20${third}` : null;
    if (year) {
      if (Number(first) > 12) return buildDate(year, second, first);
      if (Number(second) > 12) return buildDate(year, first, second);
      return buildDate(year, second, first);
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseDisplayTimestamp(value) {
  if (isEmptyDateValue(value)) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) || /^\d{1,4}!\d{1,2}!\d{1,4}$/.test(text)) {
    return parseDisplayDate(text);
  }

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text)
    ? text.replace(" ", "T")
    : text;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeDisplayDateKey(value) {
  const date = parseDisplayDate(value);
  if (!date) return null;
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

export function normalizeDisplayTimestamp(value) {
  const date = parseDisplayTimestamp(value);
  return date ? date.toISOString() : null;
}

export function formatDisplayDate(value, options = {}) {
  const {
    fallback = "—",
    month = "long"
  } = options;
  const date = parseDisplayDate(value);
  if (!date) return fallback;
  return displayFormatter(dateFormatters, month, {
    day: "numeric",
    month,
    year: "numeric"
  }).format(date);
}

export function formatDisplayDateTime(value, options = {}) {
  const {
    fallback = "—",
    month = "long"
  } = options;
  const date = parseDisplayTimestamp(value);
  if (!date) return fallback;
  return displayFormatter(timestampFormatters, month, {
    timeZone: PLATFORM_REPORTING_TIME_ZONE,
    day: "numeric",
    month,
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

export function cleanDisplayDateText(value) {
  return String(value ?? "")
    .replace(/\b(\d{4}-\d{2}-\d{2})[T ][0-9:.]+(?:Z|[+-]\d{2}:?\d{2})?\b/g, (_match, date) => formatDisplayDate(date))
    .replace(/\b(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b/g, (match) => formatDisplayDate(match))
    .replace(/\b(\d{4}-(?:0[1-9]|1[0-2]))\b(?!-\d{2})/g, (match) => formatMonthLabel(match, { fallback: match }))
    .replace(
      /\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+20\d{2}\b/gi,
      (match) => formatMonthLabel(match, { fallback: match })
    )
    .replace(/\b\d{1,4}!\d{1,2}!\d{1,4}\b/g, (match) => formatDisplayDate(match, { month: "long" }))
    .replace(/\bInvalid Date\b/gi, "—");
}
