import { createHttpError } from "./http-errors.mjs";
import { searchAcquisitionOperatorUniverse } from "./acquisition-operator-store.mjs";

export const ACQUISITION_OPERATOR_EXPORT_VERSION = "1.0";

const MAX_EXPORT_ROWS = 500;
const PAGE_SIZE = 100;

function invalid(message) {
  return createHttpError(400, "acquisition_operator_export_invalid", message);
}

function csvCell(value) {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number" && Number.isFinite(value)) return `"${value}"`;
  let text = String(value).replace(/\r?\n/g, " ").trim();
  let firstNonControl = 0;
  while (firstNonControl < text.length && text.charCodeAt(firstNonControl) <= 32) {
    firstNonControl += 1;
  }
  const firstVisible = text[firstNonControl];
  if (firstVisible && "=+-@".includes(firstVisible)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function joined(values) {
  return Array.isArray(values) ? values.filter(Boolean).join(" | ") : "";
}

/** @type {ReadonlyArray<readonly [string, (record: any) => unknown]>} */
const EXPORT_COLUMNS = Object.freeze([
  ["Validated target rank", (record) => record.validatedTargetRank],
  ["Funnel rank", (record) => record.targetRank],
  ["Company", (record) => record.proposedName],
  ["Company identity status", (record) => record.canonicalNameStatus],
  ["Canonical legal entity", (record) => record.parentIdentity?.canonicalLegalName],
  ["Sponsor / controlling owner", (record) => record.parentIdentity?.sponsorName],
  ["Website domain", (record) => record.rootDomain],
  ["Maturity scale signal", (record) => record.screeningProfile.maturityTier],
  ["Maturity score", (record) => record.screeningProfile.maturityScore],
  ["Observable locations", (record) => record.screeningProfile.facilityScale],
  ["Observable location band", (record) => record.screeningProfile.facilityScaleBand],
  ["State breadth", (record) => record.screeningProfile.stateBreadth],
  ["States", (record) => joined(record.stateCodes)],
  ["Selection bucket", (record) => record.screeningProfile.selectionBucket],
  ["Service fit", (record) => record.scope.fitCategory],
  ["Private likelihood", (record) => record.screeningProfile.privateLikelihood],
  ["Acquisition eligibility", (record) => record.acquisitionEligibility],
  ["Parent confidence", (record) => record.parentIdentity?.confidence?.relationship ?? record.resolution.confidence],
  ["Legal identity confidence", (record) => record.parentIdentity?.confidence?.legalIdentity],
  ["Ownership confidence", (record) => record.parentIdentity?.confidence?.ownership],
  ["Target fit confidence", (record) => record.parentIdentity?.confidence?.targetFit],
  ["Capacity confidence", (record) => record.parentIdentity?.confidence?.capacity],
  ["Candidate residential sites", (record) => record.screeningCapacity.candidateSites.total],
  ["Core candidate sites", (record) => record.screeningCapacity.candidateSites.core],
  ["Adjacent candidate sites", (record) => record.screeningCapacity.candidateSites.adjacent],
  ["Unresolved candidate sites", (record) => record.screeningCapacity.candidateSites.unresolved],
  ["Screening bed band", (record) => record.screeningCapacity.bucket],
  ["Screening beds low", (record) => record.screeningCapacity.range.low],
  ["Screening beds base", (record) => record.screeningCapacity.range.base],
  ["Screening beds high", (record) => record.screeningCapacity.range.high],
  ["Evidenced bed floor", (record) => record.screeningCapacity.evidencedFloorBeds],
  ["Screening capacity status", (record) => record.screeningCapacity.status],
  ["Screening capacity scope", (record) => record.screeningCapacity.rangeScope],
  ["Screening capacity basis", (record) => record.screeningCapacity.basis],
  ["Verified current licensed beds", (record) => record.licenseEvidence.bedTotals.verifiedCurrentLicensed],
  ["Verified core beds", (record) => record.licenseEvidence.bedTotals.verifiedCoreTarget],
  ["Operator-reported beds", (record) => record.licenseEvidence.bedTotals.reportedByOperator],
  ["Valued beds", (record) => record.valuationEvidence?.capacity?.valuedBeds],
  ["Known-slice EV low ($M)", (record) => record.valuationEvidence?.valuation?.outputs?.low?.enterpriseValueMillions],
  ["Known-slice EV base ($M)", (record) => record.valuationEvidence?.valuation?.outputs?.base?.enterpriseValueMillions],
  ["Known-slice EV high ($M)", (record) => record.valuationEvidence?.valuation?.outputs?.high?.enterpriseValueMillions],
  ["Valuation scope", (record) => record.valuationEvidence?.scope],
  ["Owner decision", (record) => record.screeningDecision?.status ?? "undecided"],
  ["Owner notes", (record) => record.screeningDecision?.notes],
  ["Research gaps", (record) => joined(record.research.gaps)],
  ["Next action", (record) => record.research.nextAction],
  ["Open contradictions", (record) => record.resolution.contradictionIds.length]
]);

export function buildAcquisitionOperatorCsv(records) {
  if (!Array.isArray(records) || records.length > MAX_EXPORT_ROWS) {
    throw invalid(`A company export must contain at most ${MAX_EXPORT_ROWS} rows.`);
  }
  const lines = [EXPORT_COLUMNS.map(([label]) => csvCell(label)).join(",")];
  for (const record of records) {
    lines.push(EXPORT_COLUMNS.map(([, value]) => csvCell(value(record))).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function exportLimit(requestUrl) {
  const raw = requestUrl.searchParams.get("exportLimit");
  if (raw === null || raw === "") return MAX_EXPORT_ROWS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_EXPORT_ROWS) {
    throw invalid(`exportLimit must be a whole number from 1 through ${MAX_EXPORT_ROWS}.`);
  }
  return value;
}

function pageUrl(requestUrl, offset) {
  const value = new URL(requestUrl);
  value.pathname = "/api/platform/acquisition/operators";
  value.searchParams.delete("exportLimit");
  value.searchParams.set("limit", String(PAGE_SIZE));
  value.searchParams.set("offset", String(offset));
  return value;
}

function sameSnapshot(left, right) {
  return left.indexVersion === right.indexVersion &&
    left.generatedAt === right.generatedAt &&
    left.selectionRevision === right.selectionRevision;
}

export async function getAcquisitionOperatorExportResponse(requestUrl) {
  const maximumRows = exportLimit(requestUrl);
  const firstPage = await searchAcquisitionOperatorUniverse(pageUrl(requestUrl, 0));
  if (!firstPage.available) {
    throw createHttpError(404, "acquisition_operator_index_unavailable", "The company universe is not available.");
  }
  const rowTarget = Math.min(firstPage.matched, maximumRows);
  const records = firstPage.results.slice(0, rowTarget);
  for (let offset = PAGE_SIZE; records.length < rowTarget; offset += PAGE_SIZE) {
    const nextPage = await searchAcquisitionOperatorUniverse(pageUrl(requestUrl, offset));
    if (!nextPage.available || !sameSnapshot(firstPage, nextPage)) {
      throw createHttpError(
        409,
        "acquisition_operator_export_revision_changed",
        "The company universe or owner selections changed during export. Try again."
      );
    }
    records.push(...nextPage.results.slice(0, rowTarget - records.length));
    if (!nextPage.results.length) break;
  }
  if (records.length !== rowTarget) {
    throw createHttpError(409, "acquisition_operator_export_incomplete", "The filtered company export could not be completed consistently.");
  }
  const stage = String(firstPage.query?.stage ?? "screen_500").replace(/[^a-z0-9_-]+/g, "-");
  const asOf = String(firstPage.generatedAt).slice(0, 10);
  return {
    version: ACQUISITION_OPERATOR_EXPORT_VERSION,
    available: true,
    filename: `alamo-acquisition-${stage}-${asOf}.csv`,
    mimeType: "text/csv;charset=utf-8",
    generatedAt: firstPage.generatedAt,
    indexVersion: firstPage.indexVersion,
    selectionRevision: firstPage.selectionRevision,
    matched: firstPage.matched,
    rowCount: records.length,
    truncated: firstPage.matched > records.length,
    filters: firstPage.query,
    content: buildAcquisitionOperatorCsv(records)
  };
}
