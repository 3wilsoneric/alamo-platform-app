const MONTH_ALIASES = new Map([
  ["jan", "01"],
  ["january", "01"],
  ["feb", "02"],
  ["february", "02"],
  ["febuary", "02"],
  ["frebruary", "02"],
  ["mar", "03"],
  ["march", "03"],
  ["apr", "04"],
  ["april", "04"],
  ["may", "05"],
  ["jun", "06"],
  ["june", "06"],
  ["jul", "07"],
  ["july", "07"],
  ["aug", "08"],
  ["august", "08"],
  ["sep", "09"],
  ["sept", "09"],
  ["september", "09"],
  ["oct", "10"],
  ["october", "10"],
  ["nov", "11"],
  ["november", "11"],
  ["novemeber", "11"],
  ["dec", "12"],
  ["december", "12"]
]);

const NUMBER_WORDS = new Map([
  ["one", 1],
  ["couple", 2],
  ["two", 2],
  ["few", 3],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12]
]);

export function formatMonthLabel(value, options = {}) {
  const {
    fallback = "latest period",
    month = "long"
  } = options;
  if (!value) return fallback;

  const text = String(value).trim();
  const machineMatch = text.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
  const displayMatch = text.match(/^([a-z]+)\s+(20\d{2})$/i);
  const year = machineMatch?.[1] ?? displayMatch?.[2];
  const monthNumber = machineMatch?.[2] ?? MONTH_ALIASES.get(displayMatch?.[1]?.toLowerCase());
  if (!year || !monthNumber) return fallback;

  return new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1)).toLocaleDateString("en-US", {
    month,
    year: "numeric",
    timeZone: "UTC"
  });
}

function normalizePeriodText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b(throuhg|throughh|thruogh|thorugh|thrugh|throgh)\b/g, "through")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function enumerateMonthRange(start, end, maxMonths = 60) {
  const startMatch = String(start ?? "").match(/^(\d{4})-(\d{2})$/);
  const endMatch = String(end ?? "").match(/^(\d{4})-(\d{2})$/);
  if (!startMatch || !endMatch) return [];
  const first = Number(startMatch[1]) * 12 + Number(startMatch[2]) - 1;
  const final = Number(endMatch[1]) * 12 + Number(endMatch[2]) - 1;
  let cursor = Math.min(first, final);
  const last = Math.max(first, final);
  const months = [];
  while (cursor <= last && months.length < maxMonths) {
    const year = Math.floor(cursor / 12);
    const month = (cursor % 12) + 1;
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    cursor += 1;
  }
  return months;
}

function monthOrdinal(month) {
  const match = String(month ?? "").match(/^(\d{4})-(\d{2})$/);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

export function findClosestMonthWindow(requestedMonths = [], availableMonths = []) {
  const requested = [...new Set(requestedMonths)].filter((month) => monthOrdinal(month) != null).sort();
  const available = [...new Set(availableMonths)].filter((month) => monthOrdinal(month) != null).sort();
  if (!requested.length || !available.length) return [];

  const windowSize = Math.min(requested.length, available.length);
  let bestWindow = [];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index <= available.length - windowSize; index += 1) {
    const candidate = available.slice(index, index + windowSize);
    const distance = candidate.reduce((total, month, candidateIndex) => {
      const requestedIndex = requested.length === 1
        ? 0
        : Math.round((candidateIndex / Math.max(windowSize - 1, 1)) * (requested.length - 1));
      return total + Math.abs(monthOrdinal(month) - monthOrdinal(requested[requestedIndex]));
    }, 0);

    if (distance < bestDistance || (distance === bestDistance && candidate.at(-1) > bestWindow.at(-1))) {
      bestWindow = candidate;
      bestDistance = distance;
    }
  }

  return bestWindow;
}

function findExplicitRangePair(text, mentions) {
  for (let index = 0; index < mentions.length - 1; index += 1) {
    const start = mentions[index];
    const end = mentions[index + 1];
    const connector = text.slice(start.end, end.start);
    const leadIn = text.slice(Math.max(0, start.start - 32), start.start);

    if (connector.length > 80) continue;
    if (/\b(through|thru|to|until)\b/.test(connector) || /[-–—]/.test(connector)) return { start, end };
    if (/\bbetween\b/.test(leadIn) && /\band\b/.test(connector)) return { start, end };
  }

  return null;
}

function monthNumber(period) {
  const match = String(period ?? "").match(/^\d{4}-(\d{2})$/);
  return match ? Number(match[1]) : null;
}

function resolveMonthOnlyRange(rangePair, sortedAvailableMonths) {
  if (!rangePair || rangePair.start.explicitYear || rangePair.end.explicitYear || !sortedAvailableMonths.length) return null;
  const startMonth = rangePair.start.month ?? monthNumber(rangePair.start.period);
  const endMonth = rangePair.end.month ?? monthNumber(rangePair.end.period);
  if (!startMonth || !endMonth) return null;

  const available = new Set(sortedAvailableMonths);
  const candidates = sortedAvailableMonths
    .filter((period) => monthNumber(period) === startMonth)
    .map((startPeriod) => {
      const startYear = Number(startPeriod.slice(0, 4));
      const endYear = endMonth < startMonth ? startYear + 1 : startYear;
      const endPeriod = `${endYear}-${String(endMonth).padStart(2, "0")}`;
      const months = enumerateMonthRange(startPeriod, endPeriod);
      return {
        startPeriod,
        endPeriod,
        months,
        complete: months.length > 0 && months.every((month) => available.has(month))
      };
    })
    .filter((candidate) => candidate.complete);

  return candidates.sort((left, right) => right.endPeriod.localeCompare(left.endPeriod))[0]?.months ?? null;
}

function resolveMonthOnlyMention(mention, sortedAvailableMonths) {
  if (!mention || mention.explicitYear || !sortedAvailableMonths.length) return mention?.period ?? null;
  const targetMonth = mention.month ?? monthNumber(mention.period);
  if (!targetMonth) return mention.period;
  return sortedAvailableMonths
    .filter((period) => monthNumber(period) === targetMonth)
    .sort()
    .at(-1) ?? mention.period;
}

function quarterMonthsFor(latestAvailable, offset = 0) {
  const match = String(latestAvailable ?? "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];
  const latestAbsoluteMonth = Number(match[1]) * 12 + Number(match[2]) - 1;
  const latestQuarter = Math.floor(latestAbsoluteMonth / 3) + offset;
  const firstAbsoluteMonth = latestQuarter * 3;
  return [0, 1, 2].map((monthOffset) => {
    const absoluteMonth = firstAbsoluteMonth + monthOffset;
    const year = Math.floor(absoluteMonth / 12);
    const month = (absoluteMonth % 12) + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  });
}

export function parseRequestedMonthBuckets(content, availableMonths = []) {
  const hasMarAcronym = /\bMAR\b/.test(String(content ?? ""));
  const text = normalizePeriodText(content);
  const latestYear = (availableMonths.at(-1) ?? "").slice(0, 4) || String(new Date().getFullYear());
  const relativeYear = /\b(last\s+(year|yr|eyar)|prior\s+(year|yr)|previous\s+(year|yr))\b/.test(text)
    ? String(Number(latestYear) - 1)
    : null;
  const mentions = [];
  const pushMention = ({ period, start, end, month = null, explicitYear = false }) => {
    if (!period) return;
    mentions.push({ period, start, end, month, explicitYear });
  };

  for (const match of text.matchAll(/\b(20\d{2})\s*(?:[-/]|\s)\s*(0?[1-9]|1[0-2])\b/g)) {
    const month = String(Number(match[2])).padStart(2, "0");
    pushMention({
      period: `${match[1]}-${month}`,
      start: match.index,
      end: match.index + match[0].length,
      month: Number(month),
      explicitYear: true
    });
  }

  for (const match of text.matchAll(/\b(january|jan|frebruary|febuary|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|novemeber|november|nov|december|dec)(?:\s+(20\d{2}))?\b/g)) {
    if (match[1] === "mar" && hasMarAcronym) continue;
    const month = MONTH_ALIASES.get(match[1]);
    const year = match[2] ?? relativeYear ?? latestYear;
    pushMention({
      period: `${year}-${month}`,
      start: match.index,
      end: match.index + match[0].length,
      month: Number(month),
      explicitYear: Boolean(match[2] ?? relativeYear)
    });
  }

  const orderedMentions = mentions.sort((left, right) => left.start - right.start);
  const periods = unique(orderedMentions.map((mention) => mention.period));
  const sortedAvailableMonths = unique(availableMonths).sort();
  const latestAvailable = sortedAvailableMonths.at(-1);
  const relativeWindowMatch = text.match(/\b(?:last|past|prior|previous|trailing|rolling)\s+(\d{1,2}|one|two|couple|few|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:months?|mos?|periods?)\b/);
  if (!periods.length && relativeWindowMatch) {
    const rawCount = relativeWindowMatch[1];
    const requestedCount = NUMBER_WORDS.get(rawCount) ?? Number(rawCount);
    const count = Math.max(1, Math.min(Number(requestedCount) || 1, 24));
    return sortedAvailableMonths.slice(-count);
  }
  if (!periods.length && /\b(?:last|past)\s+(?:90\s+days?|quarter)\b/.test(text)) {
    return sortedAvailableMonths.slice(-3);
  }
  if (!periods.length && /\b(?:qtd|quarter\s+to\s+date|qtr\s+to\s+date|this\s+(?:qtr|quarter)|current\s+(?:qtr|quarter))\b/.test(text)) {
    const quarterMonths = quarterMonthsFor(latestAvailable);
    return sortedAvailableMonths.filter((month) => quarterMonths.includes(month));
  }
  if (!periods.length && /\b(?:previous|prior)\s+(?:qtr|quarter)\b/.test(text)) {
    const quarterMonths = quarterMonthsFor(latestAvailable, -1);
    return sortedAvailableMonths.filter((month) => quarterMonths.includes(month));
  }
  if (!periods.length && /\b(?:year\s*to\s*date|ytd)\b/.test(text) && latestAvailable) {
    return sortedAvailableMonths.filter((month) => month.startsWith(`${latestAvailable.slice(0, 4)}-`));
  }
  const quarterMatch = text.match(/\bq([1-4])(?:\s+(20\d{2}))?\b|\b(?:quarter\s+)([1-4])(?:\s+(20\d{2}))?\b/);
  if (!periods.length && quarterMatch) {
    const quarter = Number(quarterMatch[1] ?? quarterMatch[3]);
    const year = quarterMatch[2] ?? quarterMatch[4] ?? latestYear;
    const firstMonth = (quarter - 1) * 3 + 1;
    return [0, 1, 2].map((offset) => `${year}-${String(firstMonth + offset).padStart(2, "0")}`);
  }
  if (!periods.length && /\b(last|prior|previous)\s+month\b/.test(text)) {
    return [sortedAvailableMonths.at(-2) ?? sortedAvailableMonths.at(-1)].filter(Boolean);
  }
  if (!periods.length && /\b(this|current)\s+month\b/.test(text)) {
    return [sortedAvailableMonths.at(-1)].filter(Boolean);
  }
  const hasOpenEndedRange = periods.length === 1 && (
    /\b(since|starting)\b/.test(text) ||
    /\bfrom\b.*\b(onward|forward|present|now|today|current)\b/.test(text)
  );

  if (hasOpenEndedRange) {
    const startPeriod = resolveMonthOnlyMention(orderedMentions[0], sortedAvailableMonths);
    return sortedAvailableMonths.filter((month) => month >= startPeriod);
  }

  const rangePair = orderedMentions.length >= 2 ? findExplicitRangePair(text, orderedMentions) : null;
  if (rangePair) {
    const monthOnlyRange = resolveMonthOnlyRange(rangePair, sortedAvailableMonths);
    if (monthOnlyRange) return unique(monthOnlyRange).sort();
    const rangeMonths = enumerateMonthRange(rangePair.start.period, rangePair.end.period);
    return unique([
      ...rangeMonths,
      ...periods.filter((period) => !rangeMonths.includes(period))
    ]).sort();
  }

  return periods;
}
