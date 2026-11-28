import { DAY_MS, DAILY_CENSUS_DEFINITION, averageDailyCensus, censusBedDays, censusDay, censusEpisodes, censusOnDay } from '../shared/daily-census.mjs';
import { ALAMO_FACILITIES } from '../shared/community-names.mjs';

// Governed measures for any date, day, week or period (W8 "one governed answer").
// Census, admissions, discharges, length of stay and incident rates are computed
// here from admission-episode and incident history with the canonical daily
// census rule, so the analyst never chooses tables for the basics. Read-only.
const EPISODES = 'Admission episodes from v_tool_resident_episode_history (countability audit applied; repeat stays count separately).';
export const DAY_MEASURES = Object.freeze({
  census: { label: 'Census', unit: 'residents', additivity: 'summed across communities for one day; never summed across days',
    definition: `Residents in-house on the day (on the date, or the last day of each period). ${DAILY_CENSUS_DEFINITION}` },
  average_census: { label: 'Average daily census', unit: 'residents', additivity: 'non-additive across days',
    definition: `Mean of the daily census over every day in the period. ${DAILY_CENSUS_DEFINITION}` },
  resident_days: { label: 'Resident-days', unit: 'resident-days', additivity: 'additive',
    definition: 'Sum of the daily census over the days in the period (occupied bed-days).' },
  admissions: { label: 'Admissions', unit: 'admission episodes', additivity: 'additive', definition: `Episodes whose admit_date falls in the period. ${EPISODES}` },
  discharges: { label: 'Discharges', unit: 'discharge episodes', additivity: 'additive', definition: `Episodes whose discharge_date falls in the period. ${EPISODES}` },
  net_change: { label: 'Net change', unit: 'episodes', additivity: 'additive', definition: 'Admissions minus discharges in the period. Not a census.' },
  completed_stay_los_median: { label: 'Median completed-stay length (days)', unit: 'days', additivity: 'non-additive',
    definition: `Median of discharge date minus admit date for episodes discharged in the period. ${EPISODES}` },
  completed_stay_los_average: { label: 'Average completed-stay length (days)', unit: 'days', additivity: 'non-additive',
    definition: `Mean of discharge date minus admit date for episodes discharged in the period. ${EPISODES}` },
  incidents: { label: 'Incidents', unit: 'incidents', additivity: 'additive',
    definition: 'Incidents by occurrence date (Incident_Date_parsed) in the period. Counts incidents, not residents.' },
  incidents_per_1000_resident_days: { label: 'Incidents per 1,000 resident-days', unit: 'rate', additivity: 'non-additive',
    definition: 'Incidents in the period divided by resident-days in the same period and communities, times 1,000.' }
});
const NEEDS_INCIDENTS = new Set(['incidents', 'incidents_per_1000_resident_days']);
const DATE = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const error = (code, field, allowed) => Object.assign(Error(code), { code: 'ally_metric_invalid', metricCode: code, field, ...(allowed ? { allowed } : {}) });
const literal = value => `'${String(value).replace(/[^A-Za-z0-9 _&.:/-]/g, '')}'`;
const key = time => new Date(time).toISOString().slice(0, 10);

/** True when a metrics request needs day precision (a date, day-level bounds, a day/week grain or a day measure). */
export function isDayMeasureRequest(request) {
  if (!request || typeof request !== 'object') return false;
  const dayBound = value => typeof value === 'string' && DATE.test(value);
  return request.date !== undefined || dayBound(request.from) || dayBound(request.through) || ['day', 'week'].includes(request.timeGrain) ||
    (Array.isArray(request.metrics) && request.metrics.some(id => ['census', 'resident_days', 'completed_stay_los_median', 'completed_stay_los_average', 'incidents_per_1000_resident_days'].includes(id)));
}

/** @param {any} request @param {{from:string,through:string}} scope @param {string[]} communities */
export function planDayMeasures(request, scope, communities) {
  const allowedKeys = ['metrics', 'dimensions', 'timeGrain', 'filters', 'limit', 'from', 'through', 'date'];
  const extra = Object.keys(request).find(k => !allowedKeys.includes(k));
  if (extra) throw error('unknown_field', `query.${extra.replace(/[^A-Za-z0-9_]/g, '').slice(0, 60)}`, allowedKeys);
  const ids = Object.keys(DAY_MEASURES);
  if (!Array.isArray(request.metrics) || !request.metrics.length || request.metrics.length > 6 || new Set(request.metrics).size !== request.metrics.length) throw error('metrics_invalid', 'query.metrics', ids);
  request.metrics.forEach((id, i) => { if (!Object.hasOwn(DAY_MEASURES, id)) throw error('unknown_metric', `query.metrics[${i}]`, ids); });
  const dimensions = request.dimensions ?? [];
  if (!Array.isArray(dimensions) || dimensions.some(d => d !== 'community') || dimensions.length > 1) throw error('dimension_not_supported', 'query.dimensions', ['community']);
  const timeGrain = request.timeGrain ?? 'none';
  if (!['none', 'day', 'week', 'month'].includes(timeGrain)) throw error('time_grain_not_supported', 'query.timeGrain', ['none', 'day', 'week', 'month']);
  let selected = communities;
  for (const [i, filter] of (request.filters ?? []).entries()) {
    if (filter?.dimension !== 'community' || filter.op !== 'in' || !Array.isArray(filter.values) || !filter.values.length) throw error('filter_invalid', `query.filters[${i}]`, ['dimension:community', 'op:in', 'values']);
    const outside = filter.values.find(v => !communities.includes(v));
    if (outside !== undefined) throw error('community_not_authorized', `query.filters[${i}].values`, communities);
    selected = selected.filter(id => filter.values.includes(id));
  }
  const normal = (value, end) => typeof value !== 'string' ? null : DATE.test(value) ? value : /^20\d{2}-(0[1-9]|1[0-2])$/.test(value)
    ? (end ? new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0)).toISOString().slice(0, 10) : `${value}-01`) : (() => { throw error('date_invalid', `query.${end ? 'through' : 'from'}`); })();
  if (request.date !== undefined && (typeof request.date !== 'string' || !DATE.test(request.date))) throw error('date_invalid', 'query.date');
  const from = request.date ?? normal(request.from, false) ?? scope.from, through = request.date ?? normal(request.through, true) ?? scope.through;
  if (from < scope.from || through > scope.through || from > through) throw error('period_outside_scope', 'query.from', [scope.from, scope.through]);
  const limit = request.limit ?? 200;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw error('limit_invalid', 'query.limit');
  const start = /** @type {number} */ (censusDay(from)), end = /** @type {number} */ (censusDay(through));
  /** @type {Array<{period:string,start:number,end:number}>} */ const buckets = [];
  if (timeGrain === 'none') buckets.push({ period: from === through ? from : `${from}–${through}`, start, end });
  else for (let t = start; t <= end;) {
    let next;
    if (timeGrain === 'day') next = t;
    else if (timeGrain === 'week') { const day = new Date(t).getUTCDay(); next = Math.min(end, t + ((7 - day) % 7) * DAY_MS); } // through Sunday
    else { const d = new Date(t); next = Math.min(end, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); }
    buckets.push({ period: timeGrain === 'month' ? key(t).slice(0, 7) : next === t ? key(t) : `${key(t)}–${key(next)}`, start: t, end: next });
    t = next + DAY_MS;
  }
  if (buckets.length * (dimensions.length ? selected.length : 1) > limit) throw error('too_many_rows', 'query.timeGrain', [`at most ${limit} rows`]);
  const metrics = request.metrics.map(id => ({ id, ...DAY_MEASURES[id] }));
  const slices = ['resident_episode_history', ...(metrics.some(m => NEEDS_INCIDENTS.has(m.id)) ? ['incident_detail_history'] : [])];
  const probes = slices.map(slice => ({ id: `measure-${slice}`, capability: 'platform-data', input: { slice, operation: 'count', groupBy: ['Facility'] } }));
  return { kind: 'day', metrics, dimensions, timeGrain, communities: selected, from, through, buckets, limit, slices, probes };
}

/** @param {ReturnType<typeof planDayMeasures>} plan */
export function compileDayMeasureQueries(plan) {
  if (!plan.communities.length) throw error('community_not_authorized', 'query.filters');
  const ids = plan.communities.map(literal).join(', ');
  const episodes = 'SELECT CAST(`Facility` AS STRING) AS facility_id, CAST(`admit_date` AS STRING) AS admit_date, CAST(`discharge_date` AS STRING) AS discharge_date ' +
    `FROM alamohealth.gold.v_tool_resident_episode_history WHERE CAST(\`Facility\` AS STRING) IN (${ids}) AND \`admit_date\` IS NOT NULL ` +
    `AND CAST(\`admit_date\` AS DATE) <= DATE ${literal(plan.through)} AND (\`discharge_date\` IS NULL OR CAST(\`discharge_date\` AS DATE) >= DATE ${literal(plan.from)})`;
  const incidents = plan.slices.includes('incident_detail_history')
    ? 'SELECT CAST(`Facility` AS STRING) AS facility_id, CAST(CAST(`Incident_Date_parsed` AS DATE) AS STRING) AS incident_date, COUNT(*) AS incidents ' +
      `FROM alamohealth.gold.v_tool_incident_detail_history WHERE CAST(\`Facility\` AS STRING) IN (${ids}) AND \`Incident_Date_parsed\` IS NOT NULL ` +
      `AND CAST(\`Incident_Date_parsed\` AS DATE) BETWEEN DATE ${literal(plan.from)} AND DATE ${literal(plan.through)} GROUP BY 1, 2` : null;
  return { episodes, incidents };
}

const median = values => { if (!values.length) return null; const s = [...values].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = (value, places = 1) => value === null || !Number.isFinite(value) ? null : Math.round(value * 10 ** places) / 10 ** places;

/** @param {ReturnType<typeof planDayMeasures>} plan @param {Array<Record<string,any>>} episodeRows @param {Array<Record<string,any>>} incidentRows */
export function computeDayMeasures(plan, episodeRows, incidentRows = []) {
  const all = censusEpisodes(episodeRows).filter(e => plan.communities.includes(e.facilityId));
  const incidents = incidentRows.map(r => ({ facilityId: String(r.facility_id), time: censusDay(String(r.incident_date)), count: Number(r.incidents) })).filter(r => r.time !== null && Number.isFinite(r.count));
  const groups = plan.dimensions.includes('community') ? plan.communities.map(id => ({ id, episodes: all.filter(e => e.facilityId === id), incidents: incidents.filter(i => i.facilityId === id) })) : [{ id: null, episodes: all, incidents }];
  const rows = [];
  for (const group of groups) for (const bucket of plan.buckets) {
    const days = Math.round((bucket.end - bucket.start) / DAY_MS) + 1;
    const residentDays = censusBedDays(group.episodes, bucket.start, bucket.end);
    const discharged = group.episodes.filter(e => e.discharged !== null && e.discharged >= bucket.start && e.discharged <= bucket.end);
    const stays = discharged.map(e => Math.round((/** @type {number} */ (e.discharged) - e.admitted) / DAY_MS));
    const incidentCount = group.incidents.filter(i => /** @type {number} */ (i.time) >= bucket.start && /** @type {number} */ (i.time) <= bucket.end).reduce((n, i) => n + i.count, 0);
    const values = {
      census: censusOnDay(group.episodes, bucket.end), average_census: round(averageDailyCensus(group.episodes, bucket.start, bucket.end)), resident_days: residentDays,
      admissions: group.episodes.filter(e => e.admitted >= bucket.start && e.admitted <= bucket.end).length, discharges: discharged.length,
      completed_stay_los_median: median(stays), completed_stay_los_average: round(stays.length ? stays.reduce((a, b) => a + b, 0) / stays.length : null),
      incidents: incidentCount, incidents_per_1000_resident_days: residentDays ? round(incidentCount / residentDays * 1000, 2) : null };
    values.net_change = values.admissions - values.discharges;
    const facility = group.id ? ALAMO_FACILITIES.find(f => f.facilityId === group.id) : null;
    rows.push({ ...(group.id ? { community: facility?.shortName ?? group.id, facility_id: group.id } : {}), period: bucket.period, days,
      ...Object.fromEntries(plan.metrics.map(m => [m.id, values[m.id] ?? null])) });
  }
  return rows;
}

/** @param {ReturnType<typeof planDayMeasures>} plan @param {{execute:(sql:string, options?:any)=>Promise<any>}} deps */
export async function readDayMeasures(plan, { execute }) {
  const { episodes, incidents } = compileDayMeasureQueries(plan);
  const episodeRows = await execute(episodes, {});
  const incidentRows = incidents ? await execute(incidents, {}) : [];
  for (const rows of [episodeRows, incidentRows]) if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object')) throw Error('Invalid measure result.');
  const rows = computeDayMeasures(plan, episodeRows, incidentRows);
  const columns = [...(plan.dimensions.includes('community') ? [{ key: 'community', type: 'string' }, { key: 'facility_id', type: 'string' }] : []), { key: 'period', type: 'string' }, { key: 'days', type: 'number' },
    ...plan.metrics.map(m => ({ key: m.id, type: 'number', metric: m.id }))];
  return { version: 'ally-measures-v1', measures: plan.metrics.map(({ id, label, unit, additivity, definition }) => ({ id, label, unit, additivity, definition })),
    period: { from: plan.from, through: plan.through, timeGrain: plan.timeGrain }, dimensions: plan.dimensions, columns, rows, returnedRows: rows.length, coverage: 'complete',
    notes: ['Computed live from governed admission-episode and incident history with the canonical daily census rule; no publication is needed for any date.'] };
}
