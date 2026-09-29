import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createHttpError } from "./http-errors.mjs";
import { validateLicensingLibrary, validateLicensingReport, validateLicensingUpdates } from "../shared/licensing-contracts.mjs";
import { analyzeLicensingReport, LICENSING_OUTCOMES, LICENSING_TOPICS } from "../shared/licensing-analysis.mjs";
import { licensingSearchPlan } from "../shared/licensing-search.mjs";
import { readLicensingAzureBundle, usesLicensingAzureStorage } from "./licensing-storage.mjs";

const baselinePath = fileURLToPath(new URL("../generated/licensing/baseline.json", import.meta.url));
let cloudCache;
let cloudPending;

export function validateLicensingBundle(input) {
  if (input?.version !== "licensing-bundle-v1") throw new Error("Invalid licensing bundle.");
  const baseline = validateLicensingBaseline(input.baseline);
  const updates = validateLicensingUpdates(input.updates);
  if (updates.lastSuccessful !== baseline.collectedAt) throw new Error("Licensing update/archive mismatch.");
  if (updates.alerts.some((alert) => alert.reportId && !baseline.reports.some((report) => report.id === alert.reportId))) {
    throw new Error("Licensing alert references an absent report.");
  }
  return { version: "licensing-bundle-v1", baseline, updates };
}

async function loadCloudBundle() {
  if (cloudCache && Date.now() < cloudCache.expiresAt) return cloudCache.value;
  if (!cloudPending) cloudPending = readLicensingAzureBundle().then(validateLicensingBundle).then((value) => {
    cloudCache = { value, expiresAt: Date.now() + 15_000 };
    return value;
  }).finally(() => { cloudPending = undefined; });
  return cloudPending;
}

export function validateLicensingBaseline(input) {
  const library = validateLicensingLibrary(input);
  const reports = input.reports.map(validateLicensingReport);
  if (reports.length !== library.totalReports) throw new Error("Incomplete licensing baseline.");
  for (const c of library.communities) {
    if (reports.filter((r) => r.facilityId === c.facilityId).length !== c.reportCount) {
      throw new Error("Licensing community report count mismatch.");
    }
  }
  for (const r of reports) {
    if (createHash("sha256").update(r.text).digest("hex") !== r.textSha256) {
      throw new Error("Licensing report text hash mismatch.");
    }
  }
  return { ...library, reports };
}

async function loadBaseline() {
  try {
    if (usesLicensingAzureStorage()) return (await loadCloudBundle()).baseline;
    if ((await stat(baselinePath)).size > 20 * 1024 * 1024) throw new Error("Oversized baseline.");
    return validateLicensingBaseline(JSON.parse(await readFile(baselinePath, "utf8")));
  } catch {
    throw createHttpError(503, "licensing_unavailable", "The licensing collection is not available. Try again later.");
  }
}

export function queryLicensingLibrary(baseline, requestUrl) {
  const q = (requestUrl.searchParams.get("q") ?? "").trim();
  const community = requestUrl.searchParams.get("community") ?? "";
  const type = requestUrl.searchParams.get("type") ?? "";
  const outcome = requestUrl.searchParams.get("outcome") ?? "";
  const topic = requestUrl.searchParams.get("topic") ?? "";
  const year = requestUrl.searchParams.get("year") ?? "";
  const focus = requestUrl.searchParams.get("focus") ?? "";
  if (q.length > 200 || (community && !baseline.communities.some((c) => c.facilityId === community)) ||
      (type && !["Complaint", "Inspection", "Other"].includes(type)) ||
      (outcome && !LICENSING_OUTCOMES.includes(outcome)) || (topic && !LICENSING_TOPICS.some((t) => t.name === topic)) ||
      (year && !/^20\d{2}$/.test(year)) || (focus && !["citations", "corrections", "review"].includes(focus))) {
    throw createHttpError(400, "licensing_filter_invalid", "Choose a listed community or report type.");
  }
  const plan = licensingSearchPlan(q);
  const terms = plan.terms;
  const reports = baseline.reports.map((r) => ({ ...r, analysis: analyzeLicensingReport(r).summary })).filter((r) => {
    if (community && r.facilityId !== community) return false;
    if (plan.community && r.facilityId !== plan.community) return false;
    if (plan.outcome && !r.analysis.outcomes.includes(plan.outcome)) return false;
    if (plan.year && !r.reportDate.startsWith(plan.year)) return false;
    if (plan.citationsOnly && !r.analysis.citationCount) return false;
    if (plan.correctionsOnly && !r.analysis.correctionsCount) return false;
    if (plan.noDeficienciesOnly && !r.analysis.noDeficiencies) return false;
    if (type && r.reportType !== type) return false;
    if (outcome && r.analysis.outcome !== outcome && !r.analysis.outcomes.includes(outcome)) return false;
    if (topic && !r.analysis.topics.includes(topic)) return false;
    if (year && !r.reportDate.startsWith(year)) return false;
    if (focus === "citations" && !r.analysis.citationCount) return false;
    if (focus === "corrections" && !r.analysis.correctionsCount) return false;
    if (focus === "review" && !r.analysis.reviewNeeded) return false;
    const searchable = `${r.title} ${r.controlNumber ?? ""} ${r.text}`.toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  }).map(({ text: _text, ...r }) => r);
  reports.sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.id.localeCompare(b.id));
  return validateLicensingLibrary({ ...baseline, reports });
}

export async function getLicensingLibrary(requestUrl) {
  return queryLicensingLibrary(await loadBaseline(), requestUrl);
}

export async function getLicensingReport(requestUrl) {
  const id = requestUrl.searchParams.get("id") ?? "";
  if (!/^\d{9}-[a-f0-9]{32}$/.test(id)) {
    throw createHttpError(400, "licensing_report_invalid", "Choose a report from the collection.");
  }
  const report = (await loadBaseline()).reports.find((r) => r.id === id);
  if (!report) throw createHttpError(404, "licensing_report_not_found", "This report is not in the collection.");
  return report;
}

export async function getLicensingUpdates() {
  try {
    if (usesLicensingAzureStorage()) return (await loadCloudBundle()).updates;
    const data = await readFile(new URL("../generated/licensing/updates.json", import.meta.url), "utf8");
    if (data.length > 200_000) throw new Error("Oversized update feed.");
    return validateLicensingUpdates(JSON.parse(data));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return validateLicensingUpdates({ version: "licensing-updates-v1", status: "not_checked", lastChecked: null, lastSuccessful: null, alerts: [] });
    throw createHttpError(503, "licensing_updates_unavailable", "Update history is unavailable. Try again later.");
  }
}
