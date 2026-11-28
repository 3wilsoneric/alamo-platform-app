import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createPlatformReportSourceHandler, structuredQueryError } from '../server/ally-report-source-api.mjs';
import { createPlatformReportSources, DATA_CARD_VERSION } from '../server/ally-report-source.mjs';
import { readAllyPlatformData, profileAllyPlatformData, readAllyMetrics, planAllyMetricQuery, compileAllyMetricQuery, createContinuationCache, mapWithConcurrency } from '../server/ally-data-source.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';
import { EXECUTIVE_REPORT_SOURCE_PATH } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { createHttpError } from '../server/http-error-contract.mjs';

// Synthetic identities and rows only. Every warehouse call is a local fake.
const user = '11111111-1111-4111-8111-111111111111', clientId = '22222222-2222-4222-8222-222222222222', principalId = '33333333-3333-4333-8333-333333333333';
const now = Date.parse('2026-11-23T18:00:00Z'), generated = new Date(now).toISOString();
const scope = { communityIds: ['337'], from: '2026-07-01', through: '2026-10-31' };
const IDENTIFIER = /^[A-Za-z0-9_.:\-[\]]{1,80}$/;

function fixture({ detail = false, slices = ['incident_detail_history', 'census_monthly_by_community', 'resident_flow_monthly_by_community', 'census_weekly_by_community', 'census_daily_by_community'] } = {}) {
  const grant = { id: 'batch-fixture', clientId, principalId, subjectId: user, communityIds: ['337', '345'], capabilities: ['platform-data', 'incident-summary'], slices, detail, expiresAt: new Date(now + 86400000).toISOString(), revoked: false };
  const registry = { version: 1, grants: [grant] };
  const incidents = [{ facility_id: '337', incident_date: '2026-08-02', severity: 'high', status: 'open', private_name: 'Synthetic A' },
    { facility_id: '337', incident_date: '2026-09-04', severity: 'low', status: 'closed', private_name: 'Synthetic B' },
    { facility_id: '337', incident_date: '2026-09-05', severity: 'low', status: null, private_name: 'Synthetic C' },
    { facility_id: '345', incident_date: '2026-09-06', severity: 'high', status: 'open', private_name: 'OTHER_COMMUNITY' }];
  const published = { toolContext: { manifest: [
    { slice_name: 'incident_detail_history', grain: 'incident', row_count: incidents.length, fields: ['facility_id', 'incident_date', 'severity', 'status', 'private_name'], generated_at: generated, max_period: '2026-10' },
    { slice_name: 'census_monthly_by_community', grain: 'community month', row_count: 1, fields: ['facility_id', 'month', 'census'], generated_at: generated, max_period: '2026-09' },
    { slice_name: 'resident_flow_monthly_by_community', grain: 'community month', row_count: 0, fields: ['Facility', 'month_bucket', 'admissions', 'discharges', 'net_change'], generated_at: generated, max_period: '2026-10' },
    { slice_name: 'census_weekly_by_community', grain: 'community week', row_count: 0, fields: ['Facility', 'week_start', 'census_date', 'month_bucket', 'census'], generated_at: generated, max_period: '2026-10-31' },
    // Canonical daily census view published: governed census metrics read it in the same statement.
    { slice_name: 'census_daily_by_community', grain: 'community day', row_count: 0, fields: ['Facility', 'census_date', 'census'], generated_at: generated, max_period: '2026-10-31' }],
  tables: { incident_detail_history: incidents, census_monthly_by_community: [{ facility_id: '337', month: '2026-09', census: 40 }] } } };
  const state = { grantReads: 0, revalidations: 0, warehouse: [], afterRead: () => {}, incidentCalls: 0, incidentActive: 0, incidentPeak: 0 };
  const execute = async (sql, options) => { state.warehouse.push({ sql, options });
    if (sql.includes('keys AS')) return [{ facility_id: '337', period: '2026-07', admissions: 3, admissions__prior: 1, average_census: 41.5, average_census__prior: null }];
    throw Error('Offline fixture'); };
  const sources = createPlatformReportSources({ now: () => now, summary: async () => published,
    data: async (query, options) => { const value = await readAllyPlatformData(query, { ...options, load: async () => published, execute }); state.afterRead(); return value; },
    profileData: (query, options) => profileAllyPlatformData(query, { ...options, execute }),
    metricData: (plan, options) => readAllyMetrics(plan, { ...options, execute }),
    incidents: async ({ facilityId }) => { state.incidentCalls++; state.incidentActive++; state.incidentPeak = Math.max(state.incidentPeak, state.incidentActive);
      await new Promise(resolve => setTimeout(resolve, 5)); state.incidentActive--;
      return { status: 'ready', matchingIncidents: Number(facilityId) % 3, coverage: { status: 'complete' }, generatedAt: generated, freshness: { stale: false } }; } });
  const handler = createPlatformReportSourceHandler({ now: () => now, authorize: async () => ({ tenantId: EVERYAGENT_TENANT, clientId, principalId }),
    readGrants: async (options = {}) => { state.grantReads++; if (options.revalidate) state.revalidations++; return structuredClone(registry); }, sources });
  async function send(body) {
    const req = Readable.from([Buffer.from(JSON.stringify({ version: 1, subjectId: user, scope, step: null, ...body }))]);
    req.url = EXECUTIVE_REPORT_SOURCE_PATH; req.method = 'POST'; req.headers = { 'content-type': 'application/json' };
    let status, json;
    const res = { setHeader() {}, status(code) { status = code; return res; }, json(value) { json = value; } };
    await handler(req, res); return { status, body: json };
  }
  return { grant, registry, published, state, send };
}
const countStep = (id, extra = {}) => ({ id, capability: 'platform-data', input: { slice: 'incident_detail_history', operation: 'count', groupBy: ['severity'], dateField: 'incident_date', ...extra } });

test('read-batch: one identity and registry lookup, per-step grants inline, per-step failures', async () => {
  const f = fixture();
  const response = await f.send({ operation: 'read-batch', steps: [countStep('a'), { id: 'b', capability: 'client-records', input: { view: 'directory' } }, countStep('c', { measure: 'private_name', operation: 'distinct' }),
    { id: 'd', capability: 'incident-summary', input: {} }] });
  assert.equal(response.status, 200);
  assert.equal(f.state.grantReads, 2, 'one cached lookup plus one conditional revalidation per batch');
  assert.equal(f.state.revalidations, 1);
  const [a, b, c, d] = response.body.results;
  assert.equal(a.ok, true); assert.deepEqual(a.grant, response.body.grant, 'grant receipt is inline per step');
  assert.equal(a.evidence.grantRevision, a.grant.revision);
  assert.deepEqual(JSON.parse(a.evidence.answer).rows, [{ severity: 'high', result: 1 }, { severity: 'low', result: 2 }]);
  assert.equal(b.ok, false); assert.equal(b.status, 403, 'an ungranted capability fails only its own step');
  assert.equal(c.ok, false); assert.equal(c.status, 403, 'a private measure on an aggregate grant is denied per step');
  assert.equal(d.ok, true); assert(!JSON.stringify(response.body).includes('Synthetic'));
  assert.equal((await f.send({ operation: 'read-batch', steps: Array.from({ length: 7 }, (_, i) => countStep(`s${i}`)) })).status, 400, 'at most six steps');
  assert.equal((await f.send({ operation: 'read-batch', steps: [countStep('x'), countStep('x')] })).status, 400, 'step ids are unique');
  f.state.afterRead = () => { f.registry.grants[0].revoked = true; };
  const revoked = await f.send({ operation: 'read-batch', steps: [countStep('a')] });
  assert.equal(revoked.status, 403, 'a revocation during the batch withholds every result');
  assert(!JSON.stringify(revoked.body).includes('high'));
});

test('existing operations keep their shapes; catalog adds dataCard and an ETag', async () => {
  const f = fixture();
  const read = await f.send({ operation: 'read', step: countStep('one') });
  assert.equal(read.status, 200); assert.deepEqual(Object.keys(read.body).sort(), ['evidence', 'grant', 'requestHash', 'subjectId', 'version']);
  const authorize = await f.send({ operation: 'authorize', step: countStep('one') });
  assert.deepEqual(Object.keys(authorize.body).sort(), ['grant', 'requestHash', 'subjectId', 'version']);
  const catalog = await f.send({ operation: 'catalog' });
  assert.equal(catalog.status, 200); assert.match(catalog.body.catalogEtag, /^[a-f0-9]{64}$/);
  const platform = catalog.body.catalog.find(item => item.id === 'platform-data');
  const census = platform.sources.find(source => source.id === 'census_monthly_by_community');
  assert.equal(census.dataCard.version, DATA_CARD_VERSION);
  assert.equal(census.dataCard.dateBasis, 'month_bucket'); assert.match(census.dataCard.additivity, /never sum across dates/);
  assert.equal(census.dataCard.primaryKeys, null, 'unverified facts stay null');
  assert.equal(census.dataCard.freshness.generatedAt, generated);
  assert.equal(catalog.body.catalog.find(item => item.id === 'incident-summary').dataCard.version, DATA_CARD_VERSION);
  const unchanged = await f.send({ operation: 'catalog', catalogEtag: catalog.body.catalogEtag });
  assert.deepEqual([unchanged.body.catalog, unchanged.body.notModified], [null, true]);
  assert(Buffer.byteLength(JSON.stringify(catalog.body)) < 200_000, 'catalog stays inside the engine transport limit');
});

test('profile: fill rate, distinct, status top values and date range within scope; never rows', async () => {
  const f = fixture();
  const response = await f.send({ operation: 'profile', step: { id: 'p', capability: 'platform-data', input: { slice: 'incident_detail_history' } } });
  assert.equal(response.status, 200);
  const profile = response.body.profile, byField = Object.fromEntries(profile.fields.map(field => [field.field, field]));
  assert.equal(profile.records, 3, 'only the authorized community and dates');
  assert.equal(byField.private_name, undefined, 'aggregate grants never profile private fields');
  assert.deepEqual(byField.severity.topValues, [{ value: 'low', count: 2 }, { value: 'high', count: 1 }]);
  assert.equal(byField.incident_date.type, 'date'); assert.equal(byField.incident_date.minimum, '2026-08-02'); assert.equal(byField.incident_date.maximum, '2026-09-05');
  assert(!JSON.stringify(response.body).includes('Synthetic') && !('rows' in profile));
  const detail = fixture({ detail: true });
  const named = (await detail.send({ operation: 'profile', step: { id: 'p', capability: 'platform-data', input: { slice: 'incident_detail_history' } } })).body.profile;
  const name = named.fields.find(field => field.field === 'private_name');
  assert.equal(name.distinct, 3); assert.equal(name.topValues, undefined, 'names never become top values');
  assert.equal(named.fields.find(field => field.field === 'status').fillRate, 0.6667);
  const bad = await f.send({ operation: 'profile', step: { id: 'p', capability: 'platform-data', input: { slice: 'incident_detail_history', fields: ['severity', 'private_name'] } } });
  assert.equal(bad.status, 400); assert.deepEqual(bad.body.error.field, 'input.fields[1]'); assert.equal(bad.body.error.code, 'unknown_column');
  assert(!bad.body.error.allowed.includes('private_name'));
  assert.equal((await f.send({ operation: 'profile', step: { id: 'p', capability: 'platform-data', input: { slice: 'resident_profile' } } })).status, 403);
});

test('profile on the governed view compiles scoped SQL without returning rows', async () => {
  const calls = [];
  const published = { toolContext: { manifest: [{ slice_name: 'incident_detail_history', grain: 'incident', row_count: 99, fields: ['facility_id', 'severity'], generated_at: generated }], tables: {} } };
  const result = await profileAllyPlatformData({ slice: 'incident_detail_history' }, { load: async () => published, constraints: [{ field: 'facility_id', op: 'in', value: ['337'] }], topValueEligible: field => field === 'severity',
    execute: async sql => { calls.push(sql); return sql.includes('_ally_values') ? [{ field: 'severity', value: 'low', n: 5 }] : [{ __records: 7, filled_0: 7, distinct_0: 1, numeric_0: 7, nmin_0: 337, nmax_0: 337, filled_1: 5, distinct_1: 1, numeric_1: 0 }]; } });
  assert.equal(calls.length, 2); assert(calls.every(sql => sql.includes("IN (CAST(unbase64('MzM3') AS STRING))")));
  assert.deepEqual(result.fields[1], { field: 'severity', type: 'text', records: 7, filled: 5, fillRate: 0.7143, distinct: 1, topValues: [{ value: 'low', count: 5 }], topValuesComplete: true });
});

test('metrics: governed definitions, one statement, prior period, typed columns and structured errors', async () => {
  const f = fixture();
  const response = await f.send({ operation: 'metrics', query: { metrics: ['admissions', 'average_census'], dimensions: ['community'], timeGrain: 'month', compare: 'prior_period' } });
  assert.equal(response.status, 200);
  const metrics = response.body.metrics;
  assert.equal(f.state.warehouse.filter(call => call.sql.includes('keys AS')).length, 1, 'one SQL statement per request');
  const sql = f.state.warehouse.at(-1).sql;
  assert.match(sql, /IN \('337'\)/); assert(!sql.includes("'345'"), 'scope communities only');
  assert.match(sql, /AVG\(total\)/, 'average census averages dated totals; never sums across dates');
  assert.deepEqual(metrics.period, { from: '2026-07', through: '2026-10', priorFrom: '2026-03', priorThrough: '2026-06', priorOffsetMonths: 4, compareBasis: metrics.period.compareBasis });
  assert.deepEqual(metrics.rows, [{ community: 'San Pablo', facility_id: '337', period: '2026-07', admissions: 3, admissions__prior: 1, admissions__change: 2, average_census: 41.5, average_census__prior: null, average_census__change: null }]);
  assert.equal(metrics.metrics.find(metric => metric.id === 'average_census').additivity, 'non-additive across dates');
  assert(metrics.columns.every(column => ['string', 'number'].includes(column.type)));
  assert.equal(metrics.grantRevision, response.body.grant.revision);
  const unknown = await f.send({ operation: 'metrics', query: { metrics: ['admissions', 'revenue'] } });
  assert.equal(unknown.status, 400); assert.equal(unknown.body.error.code, 'unknown_metric'); assert.equal(unknown.body.error.field, 'query.metrics[1]');
  assert(unknown.body.error.allowed.includes('average_census'));
  const dimension = await f.send({ operation: 'metrics', query: { metrics: ['admissions'], dimensions: ['incident_category'] } });
  assert.deepEqual(dimension.body, { error: { code: 'dimension_not_supported', field: 'query.dimensions[0]', allowed: ['community'] } });
  const outside = await f.send({ operation: 'metrics', query: { metrics: ['admissions'], filters: [{ dimension: 'community', op: 'in', values: ['345'] }] } });
  assert.equal(outside.body.error.code, 'community_not_authorized');
  const noSlice = fixture({ slices: ['incident_detail_history'] });
  assert.equal((await noSlice.send({ operation: 'metrics', query: { metrics: ['admissions'] } })).status, 403, 'each metric source needs its slice grant');
});

test('metric compiler: portfolio census, month-end semantics and category filters', () => {
  const plan = planAllyMetricQuery({ metrics: ['month_end_census', 'incidents'], filters: [] }, { from: '2026-07-01', through: '2026-10-31' }, ['337', '345']);
  assert.throws(() => planAllyMetricQuery({ metrics: ['month_end_census', 'incidents'], dimensions: ['incident_category'] }, scope, ['337']), error => error.metricCode === 'dimension_not_supported');
  const sql = compileAllyMetricQuery(plan);
  // Approved definition: month-end census is the daily census on the last calendar day (was the monthly snapshot row).
  assert.match(sql, /WHERE observed = CASE WHEN bucket = 'current' THEN DATE '2026-10-31'/, 'month-end census is the last day, not a sum of days');
  assert.match(sql, /v_tool_census_daily_by_community/);
  const filtered = compileAllyMetricQuery(planAllyMetricQuery({ metrics: ['incidents'], dimensions: ['incident_category'], filters: [{ dimension: 'incident_category', op: 'in', values: ["Fall' OR 1=1"] }] }, scope, ['337']));
  assert(!filtered.includes("OR 1=1'") && filtered.includes('unbase64'), 'category values are encoded, never interpolated');
  assert.throws(() => planAllyMetricQuery({ metrics: ['admissions'] }, { from: '2026-11-01', through: '2026-11-20' }, ['337']), error => error.metricCode === 'period_outside_scope', 'partial months are unavailable');
});

test('structured query errors carry identifiers only and stay under 4 KB', () => {
  const body = structuredQueryError(createHttpError(400, 'unknown_column', 'free text', { field: 'input.groupBy[0]', allowed: ['ok_field', 'not an identifier', 'x'.repeat(81), ...Array.from({ length: 60 }, (_, i) => `field_${i}`)] }));
  assert.equal(body.error.code, 'unknown_column'); assert.equal(body.error.field, 'input.groupBy[0]');
  assert(body.error.allowed.length <= 40 && body.error.allowed.every(value => IDENTIFIER.test(value)));
  assert(Buffer.byteLength(JSON.stringify(body)) < 4000);
  assert.deepEqual(structuredQueryError(createHttpError(400, 'Bad Code!', 'x', { field: 'has space' })), { error: { code: 'query_invalid', field: null } });
});

test('invalid read requests return the structured shape; other operations keep the legacy shape', async () => {
  const f = fixture();
  const bad = await f.send({ operation: 'read', step: null });
  assert.equal(bad.status, 400); assert.deepEqual(bad.body, { error: { code: 'report_source_request_invalid', field: 'step' } });
  const legacy = await f.send({ operation: 'authorize-batch', checks: [] });
  assert.deepEqual(legacy.body, { error: 'Choose a valid report source request.', code: 'report_source_request_invalid' });
});

test('incident fan-out runs communities in parallel with a bound and keeps order', async () => {
  const f = fixture();
  const response = await f.send({ operation: 'read', scope: { communityIds: ['337', '345'], from: '2026-07-01', through: '2026-10-31' }, step: { id: 'i', capability: 'incident-summary', input: {} } });
  assert.equal(response.status, 200); assert.equal(f.state.incidentCalls, 2); assert.equal(f.state.incidentPeak, 2);
  assert.deepEqual(JSON.parse(response.body.evidence.answer).communities.map(row => row.community), ['San Pablo', 'Santa Clarita']);
  let active = 0, peak = 0;
  const order = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async value => { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 8 - value)); active--; return value; });
  assert.deepEqual(order, [1, 2, 3, 4, 5, 6, 7]); assert.equal(peak, 3);
});

test('pagination fingerprint is computed once per revision and rechecked on change', async () => {
  const published = { toolContext: { manifest: [{ slice_name: 'incident_detail_history', grain: 'incident', row_count: 50, fields: ['facility_id', 'severity'], generated_at: generated }], tables: {} } };
  const fingerprint = 'f'.repeat(64), sqls = [];
  const execute = async sql => { sqls.push(sql);
    if (sql.includes('__ally_result_revision')) { const offset = Number(/OFFSET (\d+)/.exec(sql)[1]); return Array.from({ length: Math.min(3, 5 - offset) }, (_, i) => ({ facility_id: '337', severity: `s${offset + i}`, __ally_row_present: true, __ally_total_rows: 5, __ally_result_revision: fingerprint })); }
    const offset = Number(/OFFSET (\d+)/.exec(sql)[1]); return Array.from({ length: Math.min(3, 5 - offset) }, (_, i) => ({ facility_id: '337', severity: `s${offset + i}` })); };
  const continuations = createContinuationCache();
  const query = { slice: 'incident_detail_history', operation: 'rows', limit: 2 };
  const first = await readAllyPlatformData(query, { load: async () => published, execute, continuations });
  assert.equal(first.nextOffset, 2); assert.equal(sqls.filter(sql => sql.includes('sha2(')).length, 1);
  const second = await readAllyPlatformData({ ...query, offset: 2, revision: first.revision }, { load: async () => published, execute, continuations });
  assert.equal(sqls.filter(sql => sql.includes('sha2(')).length, 1, 'page two does not rescan the full result');
  assert.deepEqual(second.rows.map(row => row.severity), ['s2', 's3']); assert.equal(second.revision, first.revision); assert.equal(second.totalRows, 5);
  const republished = structuredClone(published); republished.toolContext.manifest[0].generated_at = new Date(now + 1000).toISOString();
  await assert.rejects(readAllyPlatformData({ ...query, offset: 4, revision: first.revision }, { load: async () => republished, execute, continuations }), /changed/, 'a new publication rechecks the full identity');
  assert.equal(sqls.filter(sql => sql.includes('sha2(')).length, 2);
});
