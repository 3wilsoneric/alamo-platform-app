// Canonical daily census (owner-approved definition). One function family is
// shared by resident flow, governed Ally metrics and the derived
// census_daily_by_community slice so no caller re-implements the day rule.
//
// Daily census on day D = countable admission episodes with admit_date <= D and
// (no discharge_date or discharge_date > D). The admission day counts; the
// discharge day does not. Countability (resident number present, valid admit,
// not "Not a Resident", no discharge before admit, no test/placeholder names)
// is applied upstream in v_tool_resident_episode_history.

export const DAY_MS = 86_400_000;

export const DAILY_CENSUS_BASIS = "daily census from admission episodes + countability";
export const DAILY_CENSUS_DEFINITION =
  `Canonical ${DAILY_CENSUS_BASIS}: on each day, countable admission episodes admitted on or before that day and not discharged by it (admission day counted, discharge day not). Leave of absence never subtracts.`;

/** @param {unknown} value @returns {number | null} UTC midnight in ms, or null when not an exact calendar date. */
export function censusDay(value) {
  const key = String(value ?? "").slice(0, 10);
  const time = /^\d{4}-\d{2}-\d{2}$/.test(key) ? Date.parse(`${key}T00:00:00Z`) : NaN;
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === key ? time : null;
}

export const censusDateKey = (/** @type {number} */ time) => new Date(time).toISOString().slice(0, 10);

/** @typedef {{ admitted: number, discharged: number | null }} CensusEpisode */

/** @param {CensusEpisode} row @param {number} time */
export const presentOnDay = (row, time) => row.admitted <= time && (row.discharged === null || row.discharged > time);

/** Census on one day. @param {ReadonlyArray<CensusEpisode>} episodes @param {number} time */
export function censusOnDay(episodes, time) {
  let count = 0;
  for (const row of episodes) if (presentOnDay(row, time)) count += 1;
  return count;
}

/**
 * Bed-days in [start, through] inclusive: the sum of daily census over those days.
 * @param {ReadonlyArray<CensusEpisode>} episodes @param {number} start @param {number} through
 */
export function censusBedDays(episodes, start, through) {
  const end = through + DAY_MS;
  return episodes.reduce((sum, row) => sum + Math.max(0, (Math.min(row.discharged ?? end, end) - Math.max(row.admitted, start)) / DAY_MS), 0);
}

/**
 * Average daily census: mean of daily census over every day in [start, through].
 * @param {ReadonlyArray<CensusEpisode>} episodes @param {number} start @param {number} through
 */
export function averageDailyCensus(episodes, start, through) {
  const days = (through - start) / DAY_MS + 1;
  return days > 0 ? censusBedDays(episodes, start, through) / days : null;
}

/** @param {ReadonlyArray<CensusEpisode>} episodes @param {number} start @param {number} through */
export function dailyCensusSeries(episodes, start, through) {
  const rows = [];
  for (let time = start; time <= through; time += DAY_MS) rows.push({ census_date: censusDateKey(time), census: censusOnDay(episodes, time) });
  return rows;
}

/**
 * Normalize raw episode rows. Rows without an admit date are not admission
 * episodes; a discharge before admission fails countability. Both are skipped.
 * @param {ReadonlyArray<Record<string, unknown>>} rows
 */
export function censusEpisodes(rows) {
  /** @type {Array<CensusEpisode & { facilityId: string }>} */
  const episodes = [];
  for (const row of rows) {
    const admitted = censusDay(row.admit_date);
    const discharged = row.discharge_date == null || row.discharge_date === "" ? null : censusDay(row.discharge_date);
    if (admitted === null || (row.discharge_date != null && row.discharge_date !== "" && discharged === null)) continue;
    if (discharged !== null && discharged < admitted) continue;
    episodes.push({ facilityId: String(row.facility_id ?? row.Facility ?? ""), admitted, discharged });
  }
  return episodes;
}

/**
 * Derived census_daily_by_community rows (Facility × day) until the governed
 * v_tool_census_daily_by_community view is published.
 * @param {ReadonlyArray<Record<string, unknown>>} rows @param {{ from: string, through: string, facilityIds?: ReadonlyArray<string> }} range
 */
export function buildDailyCensusRows(rows, { from, through, facilityIds }) {
  const start = censusDay(from), end = censusDay(through);
  if (start === null || end === null || start > end) throw Error("Choose a valid daily census range.");
  const episodes = censusEpisodes(rows);
  const facilities = facilityIds ?? [...new Set(episodes.map((row) => row.facilityId))].sort();
  return facilities.flatMap((facilityId) => {
    const own = episodes.filter((row) => row.facilityId === facilityId);
    return dailyCensusSeries(own, start, end).map((point) => ({ Facility: facilityId, ...point }));
  });
}
