import { createHash } from "node:crypto";
import { validateLicensingLibrary, validateLicensingReport, validateLicensingUpdates } from "../shared/licensing-contracts.mjs";

export function validateLicensingBundle(input) {
  if (input?.version !== "licensing-bundle-v1") throw new Error("Invalid licensing bundle.");
  const baseline = validateLicensingBaseline(input.baseline);
  const updates = validateLicensingUpdates(input.updates);
  if (updates.lastSuccessful !== baseline.collectedAt) throw new Error("Licensing update/archive mismatch.");
  if (updates.alerts.some((alert) => alert.reportId && !baseline.reports.some((report) => report.id === alert.reportId))) {
    throw new Error("Licensing alert references an absent report.");
  }
  const collector = input.collector;
  if (collector && (collector.version !== "licensing-collector-v1" || !/^[a-f0-9]{64}$/.test(collector.evidenceSha256))) {
    throw new Error("Invalid licensing collector state.");
  }
  return { version: "licensing-bundle-v1", baseline, updates,
    ...(collector ? { collector: { version: "licensing-collector-v1", evidenceSha256: collector.evidenceSha256 } } : {}) };
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

