import type { LiveCommunitiesDashboardResponse } from "../../shared/api/platformData";
import type { DrilldownSeriesPoint } from "../../shared/ui/SeriesDrilldownModal";

export function getIncidentMonthCommunityBreakdown(
  dashboard: LiveCommunitiesDashboardResponse | null,
  month: string | null
): DrilldownSeriesPoint[] {
  if (!dashboard || !month) return [];
  const names = new Map(
    dashboard.facilities.map((facility) => [facility.facility_id, facility.community_name])
  );
  const counts = dashboard.incidents
    .filter((row) => row.month_bucket === month)
    .reduce((acc, row) => {
      acc.set(row.facility_id, (acc.get(row.facility_id) ?? 0) + row.incident_count);
      return acc;
    }, new Map<string, number>());

  return [...counts.entries()]
    .map(([id, value]) => ({
      id,
      label: names.get(id) ?? "Unknown Community",
      value,
      tone: "danger" as const
    }))
    .sort((left, right) => right.value - left.value);
}
