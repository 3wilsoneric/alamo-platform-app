import type { ExecutiveDirectorCommunityDashboard } from "../data/executiveDirectorApi";

// Older published snapshots can contain an all-history category rollup. Never
// pair that rollup with a selected month's denominator.
export function executiveIncidentCategoryPeriod(dashboard: ExecutiveDirectorCommunityDashboard, month: string | null | undefined) {
  const published = dashboard.incidentCategoryPeriods?.find((period) => period.month === month);
  if (published) return published;
  const rows = dashboard.incidentDetails.filter((row) => Boolean(month && row.date?.startsWith(`${month}-`)));
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row.category, (counts.get(row.category) ?? 0) + 1));
  const totalCount = dashboard.incidentTrend.find((period) => period.month === month)?.count ?? null;
  return {
    month: month ?? "",
    categories: [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    recordCount: rows.length,
    totalCount,
    complete: totalCount != null && totalCount === rows.length
  };
}
