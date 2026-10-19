import type {
  CommunitySnapshotResponse,
  HomeDashboardResponse,
  LiveCommunitiesDashboardResponse,
  ReportsSummaryResponse
} from "./types/platformSnapshot";
import { formatMonthLabel } from "../../shared/period-utils.mjs";

const MONTH_BUCKET_PATTERN = /^(20\d{2})-(0[1-9]|1[0-2])$/;

function monthBucketFromDate(value?: string | null) {
  const match = String(value ?? "").match(/^(20\d{2})-(0[1-9]|1[0-2])-/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function addMonth(months: Set<string>, value?: string | null) {
  const text = String(value ?? "").trim();
  if (MONTH_BUCKET_PATTERN.test(text)) {
    months.add(text);
    return;
  }

  const monthFromDate = monthBucketFromDate(text);
  if (monthFromDate) months.add(monthFromDate);
}

function latestMonthLabel(months: Set<string>) {
  const latestMonth = [...months].sort().at(-1);
  if (!latestMonth) return null;

  return `Data through ${formatMonthLabel(latestMonth, { fallback: "the latest reporting month" })}`;
}

export function getCommunitiesDashboardDataThroughLabel(
  dashboard?: HomeDashboardResponse | null,
  communities?: LiveCommunitiesDashboardResponse | null,
  reportsSummary?: ReportsSummaryResponse | null
) {
  const months = new Set<string>();

  addMonth(months, dashboard?.reporting_month);
  addMonth(months, dashboard?.reporting?.latestMonth);
  dashboard?.incidentTrend?.forEach((row) => addMonth(months, row.month_bucket));

  communities?.census?.forEach((row) => addMonth(months, row.month_bucket));
  communities?.incidents?.forEach((row) => addMonth(months, row.month_bucket));
  communities?.incidentDetails?.forEach((row) => {
    addMonth(months, row.month_bucket);
    addMonth(months, row.incident_date);
  });

  reportsSummary?.census?.forEach((row) => addMonth(months, row.month_bucket));
  reportsSummary?.medicationCompliance?.forEach((row) => addMonth(months, row.month_bucket));

  return latestMonthLabel(months);
}

export function getCommunitySnapshotDataThroughLabel(
  snapshot?: CommunitySnapshotResponse | null,
  communities?: LiveCommunitiesDashboardResponse | null
) {
  const months = new Set<string>();
  const facilityId = snapshot?.facility.facility_id;

  addMonth(months, snapshot?.reporting_month);
  snapshot?.incidentTrend?.forEach((row) => addMonth(months, row.month_bucket));
  snapshot?.incidentDetails?.forEach((row) => {
    addMonth(months, row.month_bucket);
    addMonth(months, row.incident_date);
  });

  communities?.census
    ?.filter((row) => !facilityId || row.facility_id === facilityId)
    .forEach((row) => addMonth(months, row.month_bucket));
  communities?.incidents
    ?.filter((row) => !facilityId || row.facility_id === facilityId)
    .forEach((row) => addMonth(months, row.month_bucket));
  communities?.incidentDetails
    ?.filter((row) => !facilityId || row.facility_id === facilityId)
    .forEach((row) => {
      addMonth(months, row.month_bucket);
      addMonth(months, row.incident_date);
    });

  return latestMonthLabel(months);
}
