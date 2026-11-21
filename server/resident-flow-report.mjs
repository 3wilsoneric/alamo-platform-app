import { ALAMO_FACILITIES } from "../shared/community-names.mjs";
import { readPlatformSnapshot } from "./platform-snapshot.mjs";
import { createHttpError } from "./http-errors.mjs";
import { getSnapshotFreshness } from "./snapshot-status.mjs";

const DAY_MS = 86_400_000;
const facilities = new Map(ALAMO_FACILITIES.map((facility) => [facility.facilityId, facility]));
const round = (value) => Math.round(value * 10) / 10;
function day(value) {
  const key = String(value ?? "").slice(0, 10);
  const time = /^\d{4}-\d{2}-\d{2}$/.test(key) ? Date.parse(`${key}T00:00:00Z`) : NaN;
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== key) {
    throw createHttpError(503, "resident_date_invalid", "Client flow contains an invalid date.");
  }
  return time;
}
const dateKey = (time) => new Date(time).toISOString().slice(0, 10);
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}
function county(value) {
  const cleaned = String(value ?? "").trim().replace(/\s+county$/i, "");
  if (!cleaned || /^(unknown|n\/?a|null)$/i.test(cleaned)) return "Not recorded";
  if (/^(private|self)[ -]?pay$/i.test(cleaned)) return "Private pay";
  return cleaned.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/^San Bernadino$/, "San Bernardino");
}

/** @param {any} snapshot @param {string | null} [facilityId] @param {string | null} [requestedYear] @param {{from:string,through:string}|null} [range] */
export function buildResidentFlowReport(snapshot, facilityId = null, requestedYear = null, range = null) {
  const selectedFacilityId = facilityId == null || facilityId === "" ? null : String(facilityId);
  if (selectedFacilityId && !facilities.has(selectedFacilityId)) throw createHttpError(400, "invalid_community", "Unknown community for client flow.");
  const source = snapshot?.reportsSummary?.toolContext?.tables;
  if (!Array.isArray(source?.resident_episode_history) || !source.resident_episode_history.length || !Array.isArray(source?.census_weekly_by_community)) {
    throw createHttpError(503, "resident_flow_unavailable", "Client flow evidence is unavailable.");
  }
  const asOfDate = String(snapshot?.snapshot?.as_of_date ?? "");
  const asOf = day(asOfDate);
  const latestYear = Number(asOfDate.slice(0, 4));
  const year = requestedYear == null || requestedYear === "" ? latestYear : Number(requestedYear);
  if (!Number.isInteger(year) || year < 2026 || year > latestYear) throw createHttpError(400, "invalid_report_year", "Choose an available report year.");
  const yearStart = day(`${year}-01-01`);
  if (range && (range.from.slice(0, 4) !== String(year) || range.through.slice(0, 4) !== String(year) || day(range.from) > day(range.through))) throw createHttpError(400, "invalid_report_range", "Choose a date range within the selected year.");
  const start = range ? day(range.from) : yearStart;
  const through = Math.min(asOf, day(range?.through ?? `${year}-12-31`));
  if (start > through) throw createHttpError(400, "invalid_report_range", "No published client flow is available for that period.");
  const end = through + DAY_MS;
  const days = (end - start) / DAY_MS;
  const episodes = source.resident_episode_history.map((row) => ({
    row, facilityId: String(row.facility_id ?? ""), admitted: day(row.admit_date),
    discharged: row.discharge_date == null ? null : day(row.discharge_date)
  }));
  if (episodes.some((row) => !facilities.has(row.facilityId) || (row.discharged !== null && row.discharged < row.admitted))) {
    throw createHttpError(503, "resident_stays_invalid", "Client stay dates or communities need source review.");
  }
  const ids = episodes.map(({ row }) => row.episode_id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw createHttpError(503, "resident_stays_duplicate", "Client stay records need duplicate review.");
  const inPeriod = (value) => value !== null && value >= start && value < end;
  const at = (rows, time) => rows.filter((row) => row.admitted <= time && (row.discharged === null || row.discharged > time)).length;
  const allWeekly = source.census_weekly_by_community.filter((row) => facilities.has(String(row.facility_id)) && day(row.census_date) >= yearStart - 7 * DAY_MS && day(row.census_date) <= through);
  if (!allWeekly.length || allWeekly.some((row) => at(episodes.filter((episode) => episode.facilityId === String(row.facility_id)), day(row.census_date)) !== Number(row.census))) {
    throw createHttpError(503, "resident_census_mismatch", "Client stays and weekly census do not reconcile.");
  }
  // Reconcile each fully loaded month; the current month is calculated from the
  // same episode spine through the snapshot date, not dropped from the report.
  const monthlyFlow = source.resident_flow_monthly_by_community;
  if (!Array.isArray(monthlyFlow)) throw createHttpError(503, "resident_flow_incomplete", "Monthly movement evidence is unavailable.");
  let movementRows = 0;
  for (let month = 1; month <= 12; month += 1) {
    const monthStart = Date.UTC(year, month - 1, 1);
    const monthEnd = Date.UTC(year, month, 1);
    if (monthEnd > end) break;
    for (const id of facilities.keys()) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      const matches = monthlyFlow.filter((row) => String(row.facility_id) === id && row.month_bucket === key);
      if (matches.length !== 1) throw createHttpError(503, "resident_flow_incomplete", "Monthly movement has incomplete community rows.");
      const own = episodes.filter((row) => row.facilityId === id);
      const admissions = own.filter((row) => row.admitted >= monthStart && row.admitted < monthEnd).length;
      const discharges = own.filter((row) => row.discharged !== null && row.discharged >= monthStart && row.discharged < monthEnd).length;
      if (admissions !== Number(matches[0].admissions) || discharges !== Number(matches[0].discharges)) throw createHttpError(503, "resident_flow_mismatch", "Monthly movement and stay records do not reconcile.");
      movementRows += 1;
    }
  }
  function summarize(rows) {
    const admitted = rows.filter((row) => inPeriod(row.admitted));
    const discharged = rows.filter((row) => inPeriod(row.discharged));
    const lengths = discharged.map((row) => (row.discharged - row.admitted) / DAY_MS);
    const bedDays = rows.reduce((sum, row) => sum + Math.max(0, (Math.min(row.discharged ?? end, end) - Math.max(row.admitted, start)) / DAY_MS), 0);
    const openingCensus = at(rows, start - DAY_MS), closingCensus = at(rows, through);
    if (openingCensus + admitted.length - discharged.length !== closingCensus) throw createHttpError(503, "resident_flow_mismatch", "Opening census and client movement do not reconcile.");
    return {
      admissions: admitted.length, discharges: discharged.length, net: admitted.length - discharged.length,
      openingCensus, closingCensus, bedDays, averageDailyCensus: round(bedDays / days),
      completedStayCount: lengths.length,
      averageCompletedStayDays: lengths.length ? round(lengths.reduce((sum, value) => sum + value, 0) / lengths.length) : null,
      medianCompletedStayDays: median(lengths),
      movedInAndOut: discharged.filter((row) => inPeriod(row.admitted)).length,
      dischargedWithin30Days: lengths.filter((length) => length <= 30).length
    };
  }
  const scoped = episodes.filter((row) => !selectedFacilityId || row.facilityId === selectedFacilityId);
  const admitted = scoped.filter((row) => inPeriod(row.admitted));
  const counties = new Map();
  for (const episode of admitted) {
    const name = county(episode.row.admission_county);
    counties.set(name, (counties.get(name) ?? 0) + 1);
  }
  const countyReady = admitted.every(({ row }) => Object.hasOwn(row, "admission_county"));
  const records = scoped.filter((row) => inPeriod(row.admitted) || inPeriod(row.discharged)).map((episode) => ({
    id: episode.row.episode_id, name: String(episode.row.resident_name || "Name not recorded"),
    facilityId: episode.facilityId, community: facilities.get(episode.facilityId)?.shortName ?? "Community",
    admitted: dateKey(episode.admitted), discharged: episode.discharged === null ? null : dateKey(episode.discharged),
    county: county(episode.row.admission_county), priorPlacement: String(episode.row.prior_placement ?? "").trim() || null,
    admittedInPeriod: inPeriod(episode.admitted), dischargedInPeriod: inPeriod(episode.discharged),
    stayDays: episode.discharged === null ? null : (episode.discharged - episode.admitted) / DAY_MS
  })).sort((a, b) => (b.dischargedInPeriod ? b.discharged : b.admitted).localeCompare(a.dischargedInPeriod ? a.discharged : a.admitted) || a.name.localeCompare(b.name));
  return {
    status: "complete",
    scope: selectedFacilityId ? { kind: "community", facilityId: selectedFacilityId, label: facilities.get(selectedFacilityId)?.shortName ?? "Community" } : { kind: "portfolio", facilityId: null, label: "All communities" },
    period: { start: dateKey(start), through: dateKey(through), year, days },
    years: Array.from({ length: latestYear - 2025 }, (_, index) => latestYear - index),
    snapshot: { asOfDate, generatedAt: snapshot.snapshot.generated_at, stale: getSnapshotFreshness(snapshot).stale },
    totals: summarize(scoped),
    sites: [...facilities.values()].filter((site) => !selectedFacilityId || site.facilityId === selectedFacilityId).map((site) => ({ facilityId: site.facilityId, community: site.shortName, ...summarize(scoped.filter((row) => row.facilityId === site.facilityId)) })),
    counties: { available: countyReady, rows: countyReady ? [...counties].map(([name, admissions]) => ({ county: name, admissions })).sort((a, b) => b.admissions - a.admissions || a.county.localeCompare(b.county)) : [] },
    records,
    reconciliation: { weeklyCensusPoints: allWeekly.filter((row) => !selectedFacilityId || String(row.facility_id) === selectedFacilityId).length, movementRows }
  };
}

/** @param {string | null} [facilityId] @param {string | null} [year] */
export async function getResidentFlowReport(facilityId = null, year = null) {
  const snapshot = await readPlatformSnapshot();
  if (!snapshot) throw createHttpError(503, "resident_flow_unavailable", "The governed snapshot is unavailable.");
  return buildResidentFlowReport(snapshot, facilityId, year);
}
