import { ALAMO_FACILITIES } from "../shared/community-names.mjs";
import { readPlatformSnapshot } from "./platform-snapshot.mjs";
import { createHttpError } from "./http-errors.mjs";

const DAY_MS = 86_400_000;
const facilities = new Map(ALAMO_FACILITIES.map((facility) => [facility.facilityId, facility]));

function day(value) {
  const text = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const time = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

function requiredDay(value) {
  const parsed = day(value);
  if (parsed === null) throw createHttpError(503, "resident_date_invalid", "Resident flow contains an invalid date.");
  return parsed;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function completeMonths(rows, asOfDate) {
  const currentMonth = asOfDate.slice(0, 7);
  const available = [...new Set(rows.map((row) => String(row.month_bucket ?? "")))]
    .filter((month) => /^\d{4}-\d{2}$/.test(month) && month < currentMonth)
    .sort();
  const latest = available.at(-1);
  if (!latest) return [];
  const year = latest.slice(0, 4);
  const months = [];
  for (let index = 1; index <= Number(latest.slice(5)); index += 1) {
    const month = `${year}-${String(index).padStart(2, "0")}`;
    const ids = new Set(rows.filter((row) => row.month_bucket === month).map((row) => String(row.facility_id)));
    if (ids.size !== facilities.size || [...facilities.keys()].some((id) => !ids.has(id))) break;
    months.push(month);
  }
  return months;
}

/** @param {any} snapshot @param {string | null} [facilityId] */
export function buildResidentFlowReport(snapshot, facilityId = null) {
  const selectedFacilityId = facilityId == null || facilityId === "" ? null : String(facilityId);
  if (selectedFacilityId && !facilities.has(selectedFacilityId)) {
    throw createHttpError(400, "invalid_community", "Unknown community for client flow.");
  }
  const source = snapshot?.reportsSummary?.toolContext?.tables;
  const asOfDate = String(snapshot?.snapshot?.as_of_date ?? "");
  const flowRows = source?.resident_flow_monthly_by_community;
  const episodes = source?.resident_episode_history;
  const weekly = source?.census_weekly_by_community;
  if (!day(asOfDate) || !Array.isArray(flowRows) || !Array.isArray(episodes) || !Array.isArray(weekly)) {
    throw createHttpError(503, "resident_flow_unavailable", "Resident flow evidence is unavailable.");
  }
  const months = completeMonths(flowRows, asOfDate);
  const firstMonth = months[0] ?? "";
  if (!months.length || firstMonth.slice(5) !== "01") {
    throw createHttpError(503, "resident_flow_incomplete", "A complete year-to-date resident flow is unavailable.");
  }
  const start = requiredDay(`${firstMonth.slice(0, 4)}-01-01`);
  const last = months.at(-1) ?? "";
  const endYear = Number(last.slice(0, 4));
  const endMonth = Number(last.slice(5, 7));
  const exclusiveEnd = Date.UTC(endYear, endMonth, 1);
  const monthSet = new Set(months);
  const selectedFlow = flowRows.filter((row) => monthSet.has(row.month_bucket) && facilities.has(String(row.facility_id)));
  if (selectedFlow.length !== months.length * facilities.size || selectedFlow.some((row) => !Number.isInteger(Number(row.admissions)) || !Number.isInteger(Number(row.discharges)))) {
    throw createHttpError(503, "resident_flow_incomplete", "Resident flow has incomplete community rows.");
  }
  const validEpisodes = episodes.map((row) => ({
    facilityId: String(row.facility_id ?? ""),
    admitted: requiredDay(row.admit_date),
    discharged: row.discharge_date == null ? null : requiredDay(row.discharge_date)
  }));
  if (validEpisodes.some((row) => row.discharged !== null && row.discharged < row.admitted)) {
    throw createHttpError(503, "resident_stays_invalid", "Resident stay dates need source review.");
  }
  if (validEpisodes.some((row) => !facilities.has(row.facilityId))) {
    throw createHttpError(503, "resident_stays_invalid", "Resident stays contain an unknown community.");
  }
  const sites = [...facilities.values()].map((facility) => {
    const id = facility.facilityId;
    const rows = selectedFlow.filter((row) => String(row.facility_id) === id);
    const admissions = rows.reduce((sum, row) => sum + Number(row.admissions), 0);
    const discharges = rows.reduce((sum, row) => sum + Number(row.discharges), 0);
    const ownEpisodes = validEpisodes.filter((row) => row.facilityId === id);
    const episodeAdmissions = ownEpisodes.filter((row) => row.admitted >= start && row.admitted < exclusiveEnd).length;
    const dischargedStays = ownEpisodes.filter((row) => row.discharged !== null && row.discharged >= start && row.discharged < exclusiveEnd);
    if (episodeAdmissions !== admissions || dischargedStays.length !== discharges) {
      throw createHttpError(503, "resident_flow_mismatch", "Monthly movement and stay records do not reconcile.");
    }
    const bedDays = ownEpisodes.reduce((sum, row) => sum + Math.max(0, (Math.min(row.discharged ?? exclusiveEnd, exclusiveEnd) - Math.max(row.admitted, start)) / DAY_MS), 0);
    const lengths = dischargedStays.flatMap((row) => row.discharged === null ? [] : [(row.discharged - row.admitted) / DAY_MS]);
    return {
      facilityId: id,
      community: facility.shortName,
      admissions,
      discharges,
      net: admissions - discharges,
      bedDays,
      averageDailyCensus: Math.round((bedDays / ((exclusiveEnd - start) / DAY_MS)) * 10) / 10,
      dischargedStayCount: lengths.length,
      averageCompletedStayDays: lengths.length ? Math.round(lengths.reduce((sum, value) => sum + value, 0) / lengths.length * 10) / 10 : null,
      medianCompletedStayDays: median(lengths)
    };
  });
  const weeklyPoints = weekly.filter((row) => {
    if (!facilities.has(String(row.facility_id))) return false;
    const censusDay = requiredDay(row.census_date);
    return censusDay >= start && censusDay < exclusiveEnd;
  });
  const weeklyMatches = weeklyPoints.filter((row) => {
    const target = requiredDay(row.census_date);
    const count = validEpisodes.filter((episode) => episode.facilityId === String(row.facility_id) && episode.admitted <= target && (episode.discharged === null || target < episode.discharged)).length;
    return count === Number(row.census);
  }).length;
  if (!weeklyPoints.length || weeklyMatches !== weeklyPoints.length) {
    throw createHttpError(503, "resident_census_mismatch", "Resident stays and weekly census do not reconcile.");
  }
  const scopedSites = selectedFacilityId ? sites.filter((site) => site.facilityId === selectedFacilityId) : sites;
  const scopedEpisodes = selectedFacilityId ? validEpisodes.filter((row) => row.facilityId === selectedFacilityId) : validEpisodes;
  const monthly = months.map((month) => {
    const year = Number(month.slice(0, 4));
    const index = Number(month.slice(5, 7));
    const monthStart = Date.UTC(year, index - 1, 1);
    const monthEnd = Date.UTC(year, index, 1);
    const bedDays = scopedEpisodes.reduce((sum, row) => sum + Math.max(0, (Math.min(row.discharged ?? monthEnd, monthEnd) - Math.max(row.admitted, monthStart)) / DAY_MS), 0);
    const rows = selectedFlow.filter((row) => row.month_bucket === month && (!selectedFacilityId || String(row.facility_id) === selectedFacilityId));
    return {
      month,
      admissions: rows.reduce((sum, row) => sum + Number(row.admissions), 0),
      discharges: rows.reduce((sum, row) => sum + Number(row.discharges), 0),
      bedDays,
      averageDailyCensus: Math.round((bedDays / ((monthEnd - monthStart) / DAY_MS)) * 10) / 10
    };
  });
  const total = (key) => scopedSites.reduce((sum, site) => sum + site[key], 0);
  const completed = scopedEpisodes.flatMap((row) => row.discharged !== null && row.discharged >= start && row.discharged < exclusiveEnd ? [(row.discharged - row.admitted) / DAY_MS] : []);
  const periodDays = (exclusiveEnd - start) / DAY_MS;
  return {
    status: "complete",
    scope: selectedFacilityId
      ? { kind: "community", facilityId: selectedFacilityId, label: facilities.get(selectedFacilityId)?.shortName ?? "Community" }
      : { kind: "portfolio", facilityId: null, label: "All communities" },
    period: { start: new Date(start).toISOString().slice(0, 10), through: new Date(exclusiveEnd - DAY_MS).toISOString().slice(0, 10), year: Number(firstMonth.slice(0, 4)), completeMonths: months.length, days: periodDays },
    snapshot: { asOfDate, generatedAt: snapshot.snapshot.generated_at },
    totals: {
      admissions: total("admissions"), discharges: total("discharges"), net: total("net"),
      bedDays: total("bedDays"), averageDailyCensus: Math.round(total("bedDays") / periodDays * 10) / 10,
      completedStayCount: completed.length,
      averageCompletedStayDays: completed.length ? Math.round(completed.reduce((sum, value) => sum + value, 0) / completed.length * 10) / 10 : null,
      medianCompletedStayDays: median(completed)
    },
    monthly, sites: scopedSites,
    reconciliation: {
      weeklyCensusPoints: selectedFacilityId ? weeklyPoints.filter((row) => String(row.facility_id) === selectedFacilityId).length : weeklyMatches,
      movementRows: selectedFacilityId ? months.length : selectedFlow.length,
      communities: scopedSites.length
    },
    method: "Admission day counted; discharge day excluded. Length of stay uses stays discharged in the period. Historical occupancy percentage is omitted because dated operating limits are unavailable."
  };
}

/** @param {string | null} [facilityId] */
export async function getResidentFlowReport(facilityId = null) {
  const snapshot = await readPlatformSnapshot();
  if (!snapshot) throw createHttpError(503, "resident_flow_unavailable", "The governed snapshot is unavailable.");
  return buildResidentFlowReport(snapshot, facilityId);
}
