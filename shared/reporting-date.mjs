export const PLATFORM_REPORTING_TIME_ZONE = "America/Los_Angeles";

const reportingDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PLATFORM_REPORTING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function getReportingDateParts(timestamp = Date.now()) {
  const parts = Object.fromEntries(
    reportingDateFormatter
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  if (![year, month, day].every(Number.isInteger)) {
    throw new Error("The reporting date formatter returned an incomplete date.");
  }
  return { year, month, day };
}

export function getReportingDateKey(timestamp = Date.now()) {
  const { year, month, day } = getReportingDateParts(timestamp);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getReportingDayTimestamp(timestamp = Date.now()) {
  const { year, month, day } = getReportingDateParts(timestamp);
  return Date.UTC(year, month - 1, day);
}
