import { LICENSING_OUTCOMES, LICENSING_TOPICS } from "./licensing-analysis.mjs";

export const LICENSING_COMMUNITIES = Object.freeze([
  { facilityId: "337", licenseNumber: "079201030", name: "San Pablo" },
  { facilityId: "345", licenseNumber: "197610805", name: "Santa Clarita" },
  { facilityId: "344", licenseNumber: "502701372", name: "Turlock" },
  { facilityId: "343", licenseNumber: "365530119", name: "JC Wallace House" }
]);

function invalid() {
  throw new Error("The licensing collection could not be validated.");
}

function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value;
}

function text(value, max = 1000) {
  if (typeof value !== "string" || !value.trim() || value.length > max) invalid();
  return value;
}

function integer(value) {
  if (!Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}

function timestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text(value)) || !Number.isFinite(Date.parse(value))) invalid();
  return value;
}

function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) invalid();
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid();
  return value;
}

function identity(value) {
  const known = LICENSING_COMMUNITIES.find((c) => c.facilityId === value.facilityId);
  if (!known || known.licenseNumber !== value.licenseNumber) invalid();
  if (value.sourceUrl !== `https://www.ccld.dss.ca.gov/carefacilitysearch/FacDetail/${known.licenseNumber}`) invalid();
}

function reportSummary(input) {
  const r = object(input);
  identity(r);
  if (!new RegExp(`^${r.licenseNumber}-[a-f0-9]{32}$`).test(text(r.id))) invalid();
  if (!["Complaint", "Inspection", "Other"].includes(r.reportType)) invalid();
  if (!/^[a-f0-9]{64}$/.test(text(r.textSha256))) invalid();
  return {
    id: r.id, facilityId: r.facilityId, licenseNumber: r.licenseNumber,
    title: text(r.title), reportType: r.reportType, reportDate: date(r.reportDate),
    controlNumber: r.controlNumber === null ? null : text(r.controlNumber, 150),
    sourceUrl: r.sourceUrl, textSha256: r.textSha256, retrievedAt: timestamp(r.retrievedAt),
    ...(r.analysis ? { analysis: analysisSummary(r.analysis) } : {})
  };
}

function analysisSummary(input) {
  const a = object(input);
  if (a.version !== "licensing-analysis-v1" || !LICENSING_OUTCOMES.includes(a.outcome) ||
      !Array.isArray(a.outcomes) || a.outcomes.some((v) => !LICENSING_OUTCOMES.includes(v)) ||
      !Array.isArray(a.topics) || a.topics.some((v) => !LICENSING_TOPICS.some((t) => t.name === v)) ||
      typeof a.noDeficiencies !== "boolean" || typeof a.reviewNeeded !== "boolean") invalid();
  const citationCount = integer(a.citationCount); const correctionsCount = integer(a.correctionsCount);
  if (correctionsCount > citationCount || (a.noDeficiencies && citationCount)) invalid();
  return { version: a.version, outcome: a.outcome, outcomes: a.outcomes, headline: text(a.headline, 200), topics: a.topics,
    citationCount, correctionsCount, noDeficiencies: a.noDeficiencies, reviewNeeded: a.reviewNeeded, allegationCount: integer(a.allegationCount) };
}

export function validateLicensingReport(input) {
  const r = object(input);
  return { ...reportSummary(r), text: text(r.text, 1_000_000) };
}

export function validateLicensingLibrary(input) {
  const value = object(input);
  if (value.version !== "licensing-baseline-v1" || !["not_scheduled", "platform_scheduled"].includes(value.monitoring)) invalid();
  if (!Array.isArray(value.communities) || value.communities.length !== LICENSING_COMMUNITIES.length) invalid();
  if (!Array.isArray(value.reports) || value.reports.length > 5000) invalid();
  const communities = value.communities.map((inputCommunity) => {
    const c = object(inputCommunity);
    identity(c);
    return {
      facilityId: c.facilityId, licenseNumber: c.licenseNumber,
      name: text(c.name, 150), licensedName: text(c.licensedName), licenseStatus: text(c.licenseStatus, 100),
      reportCount: integer(c.reportCount), complaintCount: integer(c.complaintCount), sourceUrl: c.sourceUrl
    };
  });
  if (new Set(communities.map((c) => c.facilityId)).size !== communities.length) invalid();
  const reports = value.reports.map(reportSummary);
  if (new Set(reports.map((r) => r.id)).size !== reports.length) invalid();
  const totalReports = integer(value.totalReports);
  if (communities.reduce((sum, c) => sum + c.reportCount, 0) !== totalReports || reports.length > totalReports) invalid();
  return {
    version: value.version, runId: text(value.runId, 100), collectedAt: timestamp(value.collectedAt),
    monitoring: value.monitoring, totalReports, communities, reports
  };
}
// Presentation only: retain the original text for hashes, search, and downloads.
export function licensingTextForDisplay(text) {
  let display = text.replace(/^<meta name="robots" content="noindex">\s*\n/, "");
  for (const count of [32, 25, 13, 9, 7, 4]) {
    const gutter = Array.from({ length: count }, (_, index) => String(index + 1)).join("\n");
    display = display.replace(new RegExp(`\\n${gutter}\\n(?![0-9]+(?:\\n|$))`, "g"), "\n");
  }
  return display;
}

export function validateLicensingUpdates(input) {
  const value = object(input);
  if (value.version !== "licensing-updates-v1" || !["complete", "failed", "not_checked"].includes(value.status) || !Array.isArray(value.alerts) || value.alerts.length > 100) invalid();
  if (value.schedule && (value.schedule.owner !== "platform" || value.schedule.timezone !== "America/Los_Angeles" ||
    value.schedule.cadence !== "weekly" || value.schedule.weekday !== "Monday" || value.schedule.hour !== 9)) invalid();
  return { version: value.version, status: value.status,
    ...(value.schedule ? { schedule: { owner: "platform", timezone: "America/Los_Angeles", cadence: "weekly", weekday: "Monday", hour: 9 } } : {}), lastChecked: value.lastChecked ? timestamp(value.lastChecked) : null,
    lastSuccessful: value.lastSuccessful ? timestamp(value.lastSuccessful) : null,
    alerts: value.alerts.map((inputAlert) => {
      const a = object(inputAlert);
      if (a.reportId !== null && !/^\d{9}-[a-f0-9]{32}$/.test(a.reportId)) invalid();
      return { id: text(a.id, 200), community: text(a.community, 150), title: text(a.title, 200), at: timestamp(a.at),
        reportId: a.reportId, reportDate: a.reportDate ? date(a.reportDate) : null };
    }) };
}
