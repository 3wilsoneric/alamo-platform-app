import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { computeDayMeasures, compileDayMeasureQueries, isDayMeasureRequest, planDayMeasures } from '../server/ally-measures.mjs';
import { authorizePlatformReportSource } from '../server/ally-report-source-grants.mjs';
import { createPlatformReportSources } from '../server/ally-report-source.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';

const scope = { communityIds: [], from: '2026-01-01', through: '2026-11-24' };
const all = ['337', '342', '343', '344', '345'];
// 337: A in 06-01..06-26 (discharged 06-26), B from 06-25 open, C 06-10..06-20; 344: D from 05-01 open.
const episodes = [
  { facility_id: '337', admit_date: '2026-06-01', discharge_date: '2026-06-26' },
  { facility_id: '337', admit_date: '2026-06-25', discharge_date: null },
  { facility_id: '337', admit_date: '2026-06-10', discharge_date: '2026-06-20' },
  { facility_id: '344', admit_date: '2026-05-01', discharge_date: null }];

test('census on a date follows the day rule (admission day counts, discharge day does not)', () => {
  const plan = planDayMeasures({ metrics: ['census'], dimensions: ['community'], date: '2026-06-25' }, scope, all);
  const rows = computeDayMeasures(plan, episodes);
  assert.deepEqual(rows.filter(r => r.census).map(r => [r.facility_id, r.census]), [['337', 2], ['344', 1]]);
  const after = computeDayMeasures(planDayMeasures({ metrics: ['census'], date: '2026-06-26' }, scope, all), episodes);
  assert.equal(after[0].census, 2, 'A leaves on its discharge day; B and D remain');
});

test('period measures: admissions, discharges, resident-days, average census, completed-stay length, incident rate', () => {
  const plan = planDayMeasures({ metrics: ['admissions', 'discharges', 'resident_days', 'average_census', 'completed_stay_los_median', 'incidents_per_1000_resident_days'], filters: [{ dimension: 'community', op: 'in', values: ['337'] }], from: '2026-06-01', through: '2026-06-30' }, scope, all);
  const [row] = computeDayMeasures(plan, episodes, [{ facility_id: '337', incident_date: '2026-06-12', incidents: 3 }]);
  assert.equal(row.admissions, 3); assert.equal(row.discharges, 2);
  assert.equal(row.resident_days, 25 + 6 + 10, 'A 06-01..06-25 (25), B 06-25..06-30 (6), C 06-10..06-19 (10)');
  assert.equal(row.average_census, 1.4); assert.equal(row.completed_stay_los_median, 17.5, 'stays of 25 and 10 days');
  assert.equal(row.incidents_per_1000_resident_days, Math.round(3 / 41 * 1000 * 100) / 100);
});

test('day and week grains bucket the period; month bounds expand to whole months', () => {
  const days = planDayMeasures({ metrics: ['census'], timeGrain: 'day', from: '2026-06-24', through: '2026-06-26' }, scope, all);
  assert.deepEqual(computeDayMeasures(days, episodes).map(r => [r.period, r.census]), [['2026-06-24', 2], ['2026-06-25', 3], ['2026-06-26', 2]]);
  const weeks = planDayMeasures({ metrics: ['admissions'], timeGrain: 'week', from: '2026-06-01', through: '2026-06-14' }, scope, all);
  assert.deepEqual(weeks.buckets.map(b => b.period), ['2026-06-01–2026-06-07', '2026-06-08–2026-06-14']);
  const month = planDayMeasures({ metrics: ['admissions'], from: '2026-06', through: '2026-06' }, scope, all);
  assert.equal(month.from, '2026-06-01'); assert.equal(month.through, '2026-06-30');
});

test('requests are validated, scoped and compiled to read-only history queries', () => {
  assert.throws(() => planDayMeasures({ metrics: ['census'], date: '2025-12-31' }, scope, all), /period_outside_scope/);
  assert.throws(() => planDayMeasures({ metrics: ['beds'] }, scope, all), /unknown_metric/);
  assert.throws(() => planDayMeasures({ metrics: ['census'], filters: [{ dimension: 'community', op: 'in', values: ['999'] }] }, scope, ['337']), /community_not_authorized/);
  const plan = planDayMeasures({ metrics: ['incidents'], date: '2026-06-25' }, scope, ['337']);
  const { episodes: e, incidents } = compileDayMeasureQueries(plan);
  assert.match(e, /^SELECT .* FROM alamohealth\.gold\.v_tool_resident_episode_history WHERE/); assert.match(incidents, /v_tool_incident_detail_history .* IN \('337'\)/);
  assert(!/(INSERT|UPDATE|DELETE|DROP|CREATE)/i.test(e + incidents));
  assert.equal(isDayMeasureRequest({ metrics: ['admissions'], from: '2026-06' }), false); assert.equal(isDayMeasureRequest({ metrics: ['census'] }), true);
});

const clientId = randomUUID(), principalId = randomUUID(), user = randomUUID();
const registry = slices => ({ version: 1, grants: [{ id: 'measures-pilot', clientId, principalId, subjectId: user, communityIds: all, capabilities: ['measures'], slices, detail: false,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(), revoked: false }] });
const step = input => ({ subjectId: user, scope, step: { id: 'source-1', capability: 'measures', input } });

test('measures need the history slices granted; incidents also need incident history', () => {
  const identity = { tenantId: EVERYAGENT_TENANT, clientId, principalId };
  assert.ok(authorizePlatformReportSource(identity, step({ metrics: ['census'], date: '2026-06-25' }), registry(['resident_episode_history'])));
  assert.throws(() => authorizePlatformReportSource(identity, step({ metrics: ['incidents'], date: '2026-06-25' }), registry(['resident_episode_history'])), /unavailable/);
  assert.throws(() => authorizePlatformReportSource(identity, step({ metrics: ['census'] }), registry([])), /unavailable/);
});

test('the measures capability returns governed rows, a dataset and a correctable note for bad input', async () => {
  let executed = 0;
  const sources = createPlatformReportSources({ measureData: async plan => { executed++; return { version: 'ally-measures-v1', measures: [], period: {}, dimensions: plan.dimensions,
    columns: [{ key: 'period', type: 'string' }, { key: 'census', type: 'number', metric: 'census' }], rows: [{ period: '2026-06-25', census: 509 }], returnedRows: 1, coverage: 'complete', notes: ['Computed live.'] }; } });
  const authorization = { grant: { detail: false, capabilities: ['measures'], slices: ['resident_episode_history'] }, communities: all, receipt: { revision: 'r' } };
  const value = await sources.read(step({ metrics: ['census'], date: '2026-06-25' }), authorization);
  assert.equal(value.status, 'verified'); assert.equal(JSON.parse(value.answer).rows[0].census, 509); assert.equal(value.period, '2026-06-25–2026-06-25'); assert(value.dataset);
  const bad = await sources.read(step({ metrics: ['census'], date: '2025-01-01' }), authorization);
  assert.equal(bad.status, 'unavailable'); assert.match(bad.note, /period_outside_scope/); assert.equal(executed, 1);
});
