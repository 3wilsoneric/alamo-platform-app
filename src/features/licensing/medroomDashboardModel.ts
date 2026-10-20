import type { HomeDashboardResponse, ReportsSummaryResponse } from "../../shared/api/platformData";
import { ALAMO_FACILITIES } from "../../../shared/community-names.mjs";

export type MedicationMonth = {
  month: string;
  scheduled: number;
  given: number;
  notGiven: number;
  communities: number;
  completion: number | null;
};

const validCount = (value: number) => Number.isFinite(value) && value >= 0 ? value : 0;
const performanceOrder = ["337", "344", "345", "343", "342"];
const knownFacilityIds = new Set(ALAMO_FACILITIES.map((facility) => facility.facilityId));

export function buildMedicationMonths(summary: ReportsSummaryResponse | null): MedicationMonth[] {
  if (!summary) return [];
  const months = new Map<string, { scheduled: number; given: number; notGiven: number; facilities: Set<string> }>();
  for (const row of summary.medicationCompliance) {
    if (!/^\d{4}-\d{2}$/.test(row.month_bucket) || !knownFacilityIds.has(row.facility_id)) continue;
    const month = months.get(row.month_bucket) ?? { scheduled: 0, given: 0, notGiven: 0, facilities: new Set<string>() };
    month.scheduled += validCount(row.total_scheduled);
    month.given += validCount(row.given);
    month.notGiven += validCount(row.not_given);
    month.facilities.add(row.facility_id);
    months.set(row.month_bucket, month);
  }
  return [...months].sort(([left], [right]) => left.localeCompare(right)).map(([month, totals]) => ({
    month,
    scheduled: totals.scheduled,
    given: totals.given,
    notGiven: totals.notGiven,
    communities: totals.facilities.size,
    completion: totals.scheduled > 0 ? totals.given / totals.scheduled * 100 : null
  }));
}

export function buildMedicationCommunities(summary: ReportsSummaryResponse | null, month: string | null) {
  const rows = new Map(summary?.medicationCompliance.filter((row) => row.month_bucket === month).map((row) => [row.facility_id, row]) ?? []);
  return [...ALAMO_FACILITIES].sort((a, b) => performanceOrder.indexOf(a.facilityId) - performanceOrder.indexOf(b.facilityId)).map((facility) => {
    const row = rows.get(facility.facilityId);
    return {
      facilityId: facility.facilityId,
      name: facility.shortName,
      scheduled: row ? validCount(row.total_scheduled) : null,
      given: row ? validCount(row.given) : null,
      notGiven: row ? validCount(row.not_given) : null,
      completion: row && row.total_scheduled > 0 ? row.given / row.total_scheduled * 100 : null
    };
  });
}

export function buildQuarterlyTrend(months: MedicationMonth[], dashboard: HomeDashboardResponse | null) {
  const incidents = new Map(dashboard?.incidentTrend.map((row) => [row.month_bucket, validCount(row.incidentCount)]) ?? []);
  const quarters = new Map<string, { scheduled: number; given: number; incidentCount: number; months: number; incidentMonths: number; communityMonths: number }>();
  for (const row of months) {
    const quarter = `${row.month.slice(0, 4)} Q${Math.ceil(Number(row.month.slice(5, 7)) / 3)}`;
    const value = quarters.get(quarter) ?? { scheduled: 0, given: 0, incidentCount: 0, months: 0, incidentMonths: 0, communityMonths: 0 };
    value.scheduled += row.scheduled;
    value.given += row.given;
    value.months += 1;
    value.communityMonths += row.communities;
    if (incidents.has(row.month)) {
      value.incidentCount += incidents.get(row.month) ?? 0;
      value.incidentMonths += 1;
    }
    quarters.set(quarter, value);
  }
  return [...quarters].map(([period, row]) => ({
    period,
    completion: row.scheduled > 0 ? row.given / row.scheduled * 100 : null,
    given: row.given,
    scheduled: row.scheduled,
    incidents: row.incidentMonths === row.months ? row.incidentCount : null,
    coverage: `${row.communityMonths}/${row.months * ALAMO_FACILITIES.length} community-months`,
    partial: row.months < 3 || row.communityMonths < row.months * ALAMO_FACILITIES.length || row.incidentMonths < row.months
  }));
}
