import {
  getAzureSnapshotStorageSummary,
  getPlatformSnapshotMaxBytes
} from "./platform-snapshot.mjs";
import { getBoundedNumberEnv } from "./runtime-environment.mjs";

function normalizeString(value) {
  return value == null ? "" : String(value).trim();
}

export class SnapshotUnavailableError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SnapshotUnavailableError";
    this.code = "SNAPSHOT_UNAVAILABLE";
    this.statusCode = 503;
    this.details = details;
  }
}

export function missingSnapshotSection(section) {
  return new SnapshotUnavailableError(
    `The published platform snapshot does not contain ${section}. Run the governed snapshot publish before retrying.`,
    { reason: "missing-section", section }
  );
}

export function getSnapshotMaxAgeHours() {
  return getBoundedNumberEnv("PLATFORM_SNAPSHOT_MAX_AGE_HOURS", 30, 1, 24 * 14);
}

export function getSnapshotFreshness(snapshot, options = {}) {
  const generatedAtRaw = snapshot?.snapshot?.generated_at ?? snapshot?.generated_at ?? null;
  const generatedAt = generatedAtRaw ? new Date(generatedAtRaw) : null;
  const maxAgeHours = options.maxAgeHours ?? getSnapshotMaxAgeHours();
  const nowMs = options.now instanceof Date ? options.now.getTime() : Date.now();

  if (!generatedAt || Number.isNaN(generatedAt.getTime())) {
    return {
      warning: "Snapshot timestamp is unavailable.",
      generated_at: generatedAtRaw,
      ageHours: null,
      maxAgeHours,
      stale: true
    };
  }

  const ageHours = (nowMs - generatedAt.getTime()) / 36e5;
  const futureSkewHours = Math.max(-ageHours, 0);
  const futureDated = futureSkewHours > (5 / 60);
  const stale = ageHours > maxAgeHours || futureDated;
  const ageLabel = ageHours >= 48
    ? `${(ageHours / 24).toFixed(1)} days`
    : `${ageHours.toFixed(1)} hours`;

  return {
    warning: futureDated
      ? `Snapshot timestamp is ${futureSkewHours.toFixed(1)} hours in the future. Verify the publisher clock and business date before trusting it.`
      : stale
        ? `Snapshot is ${ageLabel} old, which exceeds the ${maxAgeHours}-hour freshness target.`
        : null,
    generated_at: generatedAt.toISOString(),
    ageHours,
    maxAgeHours,
    stale
  };
}

export function getSnapshotDiagnostics(snapshot) {
  if (!snapshot) return null;
  const storage = getAzureSnapshotStorageSummary();
  const sizeBytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
  const maxSizeBytes = getPlatformSnapshotMaxBytes();
  const freshness = getSnapshotFreshness(snapshot);
  const generatedAt = snapshot.snapshot?.generated_at ?? snapshot.generated_at ?? null;
  const snapshotVersion = snapshot.snapshot?.version ?? snapshot.version ?? null;
  const snapshotSource = snapshot.snapshot?.source ?? (storage ? "azure-storage" : "local-fallback");
  const incidentDetailRows =
    snapshot.reportsSummary?.toolContext?.incidentDetailHistory?.length ??
    snapshot.reportsSummary?.toolContext?.tables?.incident_detail_history?.length ??
    snapshot.communities?.incidentDetails?.length ??
    0;
  const toolContext = snapshot.reportsSummary?.toolContext;
  const toolContextTableNames = Object.keys(toolContext?.tables ?? {});
  const toolRows = (camelKey, tableKey) =>
    toolContext?.[camelKey] ?? toolContext?.tables?.[tableKey] ?? [];
  const maxField = (rows, field) => {
    const values = rows.map((row) => normalizeString(row?.[field])).filter(Boolean);
    return values.length ? values.sort().at(-1) : null;
  };
  const minField = (rows, field) => {
    const values = rows.map((row) => normalizeString(row?.[field])).filter(Boolean);
    return values.length ? values.sort()[0] : null;
  };
  const censusQuality = toolRows("censusDataQuality", "census_data_quality");
  const censusWeekly = toolRows("censusWeeklyByCommunity", "census_weekly_by_community");
  const residentFlowMonthly = toolRows("residentFlowMonthlyByCommunity", "resident_flow_monthly_by_community");
  const marMonthlyRows = toolRows("marMonthlyByCommunityMedication", "mar_monthly_by_community_medication").length;
  const marResidentRows = toolRows("marResidentSummary", "mar_resident_summary").length;
  const marExceptionRows = toolRows("marExceptionDetails", "mar_exception_detail_90d").length;
  const incidentMonthlyRows = toolRows("incidentMonthlyByCommunityCategory", "incident_monthly_by_community_category").length;
  const medicationComplianceRows = toolRows("medicationComplianceMonthly", "medication_compliance_monthly").length;
  const censusWeeklyRows = censusWeekly.length;
  const censusQualityRows = censusQuality.length;
  const residentCountabilityRows = toolRows("residentCountabilityAudit", "resident_countability_audit").length;
  const residentFlowMonthlyRows = residentFlowMonthly.length;
  const latestCensusMonth = maxField(censusQuality, "latest_census_month");
  const censusWeeklyMinWeek = minField(censusWeekly, "week_start");
  const censusWeeklyMaxWeek = maxField(censusWeekly, "week_start");
  const residentFlowMonthlyMaxMonth = maxField(residentFlowMonthly, "month_bucket");

  return {
    sizeBytes,
    sizeMegabytes: sizeBytes / 1024 / 1024,
    maxSizeBytes,
    maxSizeMegabytes: maxSizeBytes / 1024 / 1024,
    oversized: sizeBytes > maxSizeBytes,
    snapshotVersion,
    snapshotSource,
    snapshotRoot: storage?.root ?? "local",
    snapshotContainer: storage?.container ?? null,
    snapshotLatestPath: storage?.latestPath ?? "generated/platform-snapshot/latest.json",
    incidentDetailRows,
    toolContextVersion: toolContext?.version ?? null,
    toolContextManifestRows: toolContext?.manifest?.length ?? 0,
    toolContextTableCount: toolContextTableNames.length,
    toolContextTableNames,
    marMonthlyRows,
    marResidentRows,
    marExceptionRows,
    marReady: marMonthlyRows > 0 && marResidentRows > 0,
    incidentMonthlyRows,
    medicationComplianceRows,
    historicalAggregateReady: incidentMonthlyRows > 0 && medicationComplianceRows > 0,
    censusWeeklyRows,
    censusQualityRows,
    residentCountabilityRows,
    residentFlowMonthlyRows,
    latestCensusMonth,
    censusWeeklyMinWeek,
    censusWeeklyMaxWeek,
    residentFlowMonthlyMaxMonth,
    censusTrustReady:
      censusWeeklyRows > 0 &&
      censusQualityRows > 0 &&
      residentCountabilityRows > 0 &&
      residentFlowMonthlyRows > 0,
    ageHours: freshness.ageHours,
    maxAgeHours: freshness.maxAgeHours,
    stale: freshness.stale,
    generatedAt: freshness.generated_at ?? generatedAt
  };
}

export function assertToolContextSafeForAzurePublish(payload) {
  const toolContext = payload?.reportsSummary?.toolContext;
  const manifestRows = Array.isArray(toolContext?.manifest) ? toolContext.manifest.length : 0;
  const tableCount = Object.keys(toolContext?.tables ?? {}).length;
  if (
    (manifestRows > 0 && tableCount > 0) ||
    process.env.PLATFORM_SNAPSHOT_ALLOW_EMPTY_TOOL_CONTEXT === "true"
  ) {
    return;
  }

  throw new Error(
    `Refusing to publish app-generated Azure snapshot with empty toolContext ` +
      `(manifest=${manifestRows}, tables=${tableCount}). ` +
      `Run Databricks tool_context_views and snapshot_publish instead, or set ` +
      `PLATFORM_SNAPSHOT_ALLOW_EMPTY_TOOL_CONTEXT=true for an intentional emergency override.`
  );
}

export function decorateSnapshotPayload(payload, snapshot) {
  return {
    ...payload,
    snapshot_status: getSnapshotFreshness(snapshot)
  };
}

export function isSnapshotUnavailableError(error) {
  return error?.code === "SNAPSHOT_UNAVAILABLE";
}
