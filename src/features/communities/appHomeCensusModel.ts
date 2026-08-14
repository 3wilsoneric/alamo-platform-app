import type { LiveCommunitiesDashboardResponse } from "../../shared/api/platformData";

export function getLatestCommunityCensusRows(
  dashboard: LiveCommunitiesDashboardResponse | null
) {
  if (!dashboard) return [];

  const latestMonth = [...new Set(dashboard.census.map((row) => row.month_bucket))]
    .sort()
    .at(-1);
  const facilityNames = new Map(
    dashboard.facilities.map((facility) => [facility.facility_id, facility.community_name])
  );

  return dashboard.census
    .filter((row) => row.month_bucket === latestMonth)
    .map((row) => ({
      facilityId: row.facility_id,
      communityName: facilityNames.get(row.facility_id) ?? "Unknown Community",
      monthBucket: latestMonth ?? null,
      census: row.census
    }))
    .sort((left, right) => right.census - left.census);
}
