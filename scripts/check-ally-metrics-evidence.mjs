import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createPlatformReportSourceHandler } from '../server/ally-report-source-api.mjs';
import { createPlatformReportSources } from '../server/ally-report-source.mjs';
import { readAllyMetrics } from '../server/ally-data-source.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';
import * as packagedContracts from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';

// W3.2b: governed metrics as a standard, citable platform-data read.
// Synthetic identities and rows only; every warehouse call is a local fake.
const ENGINE_CONTRACTS = '/Users/eric/ally-worktrees/ally-week1/shared/executive-report-contracts.mjs';
const contractSets = [packagedContracts, ...(existsSync(ENGINE_CONTRACTS) ? [await import(pathToFileURL(ENGINE_CONTRACTS).href)] : [])];
const { EXECUTIVE_REPORT_SOURCE_PATH } = packagedContracts;
const user = '11111111-1111-4111-8111-111111111111', clientId = '22222222-2222-4222-8222-222222222222', principalId = '33333333-3333-4333-8333-333333333333';
const now = Date.parse('2026-11-23T18:00:00Z'), generated = new Date(now - 3600_000).toISOString();
const scope = { communityIds: ['337'], from: '2026-07-01', through: '2026-10-31' };
const FLOW = 'resident_flow_monthly_by_community', WEEKLY = 'census_weekly_by_community';

const DAILY = 'census_daily_by_community';
// dailyPublished: v_tool_census_daily_by_community is in the manifest. Without it,
// daily census metrics are derived from episode history (second statement).
function fixture({ detail = false, slices = [FLOW, WEEKLY, 'census_monthly_by_community', DAILY], dailyPublished = true } = {}) {
  const grant = { id: 'metrics-fixture', clientId, principalId, subjectId: user, communityIds: ['337', '345'], capabilities: ['platform-data'], slices, detail, expiresAt: new Date(now + 86400000).toISOString(), revoked: false };
  const registry = { version: 1, grants: [grant] };
  const published = { toolContext: { manifest: [
    { slice_name: FLOW, grain: 'community month', row_count: 0, fields: ['Facility', 'month_bucket', 'admissions', 'discharges', 'net_change'], generated_at: generated, max_period: '2026-10' },
    { slice_name: WEEKLY, grain: 'community week', row_count: 0, fields: ['Facility', 'week_start', 'census_date', 'month_bucket', 'census'], generated_at: generated, max_period: '2026-10-31' },
    { slice_name: 'census_monthly_by_community', grain: 'community month', row_count: 0, fields: ['Facility', 'month_bucket', 'census'], generated_at: generated, max_period: '2026-10' },
    ...(dailyPublished ? [{ slice_name: DAILY, grain: 'community day', row_count: 0, fields: ['Facility', 'census_date', 'census'], generated_at: generated, max_period: '2026-10-31' }] : [])], tables: {} } };
  const state = { sql: [], afterRead: () => {} };
  const execute = async sql => { state.sql.push(sql); state.afterRead();
    // Episode spine for derived daily census: one stay from 2026-07-01 to 2026-08-16 (discharge day not counted).
    if (sql.includes('v_tool_resident_episode_history')) return [{ facility_id: '337', admit_date: '2026-07-01', discharge_date: '2026-08-16' }, { facility_id: '337', admit_date: '2026-09-30', discharge_date: null }];
    return ['2026-07', '2026-08', '2026-09', '2026-10'].map((period, i) => ({ facility_id: '337', period, admissions: 3 + i, discharges: 2, average_census: 40.5 + i })); };
  const sources = createPlatformReportSources({ now: () => now, summary: async () => published, metricData: (plan, options) => readAllyMetrics(plan, { ...options, execute }) });
  const handler = createPlatformReportSourceHandler({ now: () => now, authorize: async () => ({ tenantId: EVERYAGENT_TENANT, clientId, principalId }),
    readGrants: async () => structuredClone(registry), sources });
  async function send(body) {
    const req = Readable.from([Buffer.from(JSON.stringify({ version: 1, subjectId: user, scope, step: null, ...body }))]);
    req.url = EXECUTIVE_REPORT_SOURCE_PATH; req.method = 'POST'; req.headers = { 'content-type': 'application/json' };
    let status, json;
    const res = { setHeader() {}, status(code) { status = code; return res; }, json(value) { json = value; } };
    await handler(req, res); return { status, body: json };
  }
  return { grant, registry, state, send };
}
const metricStep = (query = { metrics: ['admissions', 'discharges', 'average_census'], dimensions: ['community'], timeGrain: 'month' }, slice = FLOW) =>
  ({ id: 'm', capability: 'platform-data', input: { slice, operation: 'metrics', query } });

test('a metrics read returns standard evidence the engine accepts and can cite', async () => {
  const f = fixture(), step = metricStep();
  const response = await f.send({ operation: 'read', step });
  assert.equal(response.status, 200);
  const evidence = response.body.evidence;
  for (const contracts of contractSets) assert.doesNotThrow(() => contracts.validateReportEvidence(evidence, step, scope), 'engine evidence contract');
  assert.equal(f.state.sql.length, 1, 'one statement for several metrics');
  assert.match(f.state.sql[0], /v_tool_census_daily_by_community/); assert.doesNotMatch(f.state.sql[0], /v_tool_census_weekly_by_community/);
  assert.equal(evidence.requiresDetail, false); assert.equal(evidence.status, 'verified'); assert.equal(evidence.coverage, 'complete');
  assert.equal(evidence.grantRevision, response.body.grant.revision); assert.equal(evidence.observedAt, generated);
  assert.equal(evidence.period, '2026-07-01–2026-10-31'); assert.equal(evidence.grain, 'governed metrics by community and month');
  const answer = JSON.parse(evidence.answer);
  assert.equal(answer.version, 'ally-metrics-v1');
  assert.equal(answer.metrics.find(metric => metric.id === 'average_census').additivity, 'non-additive across dates');
  assert.deepEqual(answer.rows[0], { community: 'San Pablo', facility_id: '337', period: '2026-07', admissions: 3, discharges: 2, average_census: 40.5 });
  assert.equal(answer.freshness.length, 2);
  assert.equal(evidence.dataset.shape, 'series', 'one community by month charts as a series');
  assert.deepEqual(evidence.dataset.columns.map(column => column.label), ['Period', 'Community', 'Community ID', 'Admissions', 'Discharges', 'Average daily census']);
  assert.equal(evidence.dataset.rows.length, 4);
  assert.match(evidence.note, /must not be summed/);
  // Prior-period comparison and a non-primary slice for a mixed metric set.
  // WEEKLY is a deprecated slice alias of the daily census slice.
  const compare = metricStep({ metrics: ['admissions', 'average_census'], compare: 'prior_period' }, WEEKLY);
  const compared = (await f.send({ operation: 'read', step: compare })).body.evidence;
  for (const contracts of contractSets) assert.doesNotThrow(() => contracts.validateReportEvidence(compared, compare, scope));
  assert.match(compared.note, /Prior period 2026-03–2026-06/);
});

test('read-batch, authorize and authorize-batch accept the same step; revoking any probed slice denies it', async () => {
  const f = fixture(), step = metricStep();
  const batch = await f.send({ operation: 'read-batch', steps: [step] });
  assert.equal(batch.status, 200); assert.equal(batch.body.results[0].ok, true);
  for (const contracts of contractSets) contracts.validateReportEvidence(batch.body.results[0].evidence, step, scope);
  assert.equal((await f.send({ operation: 'authorize', step })).status, 200);
  const granted = await f.send({ operation: 'authorize-batch', checks: [{ scope, step }] });
  assert.equal(granted.status, 200); assert.equal(granted.body.grants[0].revision, batch.body.results[0].grant.revision);

  // The weekly census slice is probed by average_census, not named in input.slice.
  f.registry.grants[0].slices = [FLOW];
  assert.equal((await f.send({ operation: 'read', step })).status, 403);
  assert.equal((await f.send({ operation: 'authorize', step })).status, 403);
  assert.deepEqual((await f.send({ operation: 'authorize-batch', checks: [{ scope, step }] })).body.grants, [null]);
  const denied = await f.send({ operation: 'read-batch', steps: [step] });
  assert.equal(denied.body.results[0].ok, false); assert.equal(denied.body.results[0].status, 403);
  assert.equal((await f.send({ operation: 'read', step: metricStep({ metrics: ['admissions'] }) })).status, 200, 'remaining slices still read');

  // A revocation during the read withholds the result.
  const g = fixture();
  g.state.afterRead = () => { g.registry.grants[0].slices = [FLOW]; };
  const changed = await g.send({ operation: 'read', step });
  assert.equal(changed.status, 403); assert(!JSON.stringify(changed.body).includes('40.5'));
  // Scope beyond the grant is denied for metrics like any read.
  assert.equal((await fixture().send({ operation: 'read', scope: { ...scope, communityIds: ['342'] }, step })).status, 403);
});

test('invalid metric reads are structured corrections; aggregate-only grants stay aggregate', async () => {
  const f = fixture();
  const unknown = await f.send({ operation: 'read', step: metricStep({ metrics: ['admissions', 'revenue'] }) });
  assert.equal(unknown.status, 400); assert.equal(unknown.body.error.code, 'unknown_metric'); assert.equal(unknown.body.error.field, 'input.query.metrics[1]');
  const mismatch = await f.send({ operation: 'read', step: metricStep({ metrics: ['admissions'] }, 'census_monthly_by_community') });
  assert.deepEqual(mismatch.body, { error: { code: 'metric_slice_mismatch', field: 'input.slice', allowed: [FLOW] } });
  const extra = await f.send({ operation: 'read', step: { id: 'm', capability: 'platform-data', input: { ...metricStep().input, groupBy: ['Facility'] } } });
  assert.equal(extra.status, 400); assert.equal(extra.body.error.code, 'unknown_field');
  const batch = await f.send({ operation: 'read-batch', steps: [metricStep({ metrics: ['revenue'] })] });
  assert.equal(batch.body.results[0].status, 400); assert.equal(batch.body.results[0].error.code, 'unknown_metric');
  assert.deepEqual((await f.send({ operation: 'authorize-batch', checks: [{ scope, step: metricStep({ metrics: ['revenue'] }) }] })).body.grants, [null]);
  const outside = await f.send({ operation: 'read', step: metricStep({ metrics: ['admissions'], filters: [{ dimension: 'community', op: 'in', values: ['345'] }] }) });
  assert.equal(outside.body.error.code, 'community_not_authorized');
  // Detail grants still get aggregate-only, non-detail metric evidence.
  const detail = await fixture({ detail: true }).send({ operation: 'read', step: metricStep() });
  assert.equal(detail.body.evidence.requiresDetail, false);
});

test('catalog teaches metrics; the standalone metrics operation is unchanged', async () => {
  const f = fixture();
  const catalog = (await f.send({ operation: 'catalog' })).body.catalog.find(item => item.id === 'platform-data');
  assert(catalog.inputSchema.properties.operation.enum.includes('metrics'));
  assert.deepEqual(catalog.inputSchema.properties.query.properties.metrics.items.enum, ['admissions', 'discharges', 'net_change', 'average_census', 'month_end_census', 'incidents']);
  assert.match(catalog.description, /operation metrics/); assert.match(catalog.description, /average_census is non-additive/);
  assert.deepEqual(catalog.dataCard.metrics.map(metric => metric.id), ['admissions', 'discharges', 'net_change', 'average_census', 'month_end_census'], 'only metrics of granted slices');
  const standalone = await f.send({ operation: 'metrics', query: { metrics: ['admissions'], dimensions: ['community'], timeGrain: 'month' } });
  assert.equal(standalone.status, 200); assert.equal(standalone.body.metrics.version, 'ally-metrics-v1');
  assert.equal(standalone.body.metrics.grantRevision, standalone.body.grant.revision);
});

test('census definition: average_census is the mean of daily census; month_end_census is the last day', async () => {
  const f = fixture();
  const answer = JSON.parse((await f.send({ operation: 'read', step: metricStep({ metrics: ['average_census', 'month_end_census'], timeGrain: 'month' }, DAILY) })).body.evidence.answer);
  const average = answer.metrics.find(metric => metric.id === 'average_census');
  assert.match(average.definition, /daily census from admission episodes \+ countability/); assert.doesNotMatch(average.definition, /weekly/i);
  assert.equal(average.source, DAILY);
  assert.match(f.state.sql[0], /last_day\(observed\)/, 'month-end is the last calendar day');
  assert.match(f.state.sql[0], /date_format\(`census_date`, 'yyyy-MM'\)/);
});

test('until the daily view is published, census metrics derive from episodes with the shared day rule', async () => {
  const f = fixture({ dailyPublished: false });
  const response = await f.send({ operation: 'read', step: metricStep({ metrics: ['admissions', 'average_census', 'month_end_census'], dimensions: ['community'], timeGrain: 'month' }) });
  assert.equal(response.status, 200);
  assert.equal(f.state.sql.length, 2); assert.doesNotMatch(f.state.sql[0], /census/); assert.match(f.state.sql[1], /v_tool_resident_episode_history/);
  const answer = JSON.parse(response.body.evidence.answer);
  const byPeriod = Object.fromEntries(answer.rows.map(row => [row.period, row]));
  assert.equal(byPeriod['2026-07'].average_census, 1); assert.equal(byPeriod['2026-07'].month_end_census, 1);
  assert.equal(byPeriod['2026-08'].average_census, 15 / 31, 'present Aug 1–15; discharge day excluded');
  assert.equal(byPeriod['2026-08'].month_end_census, 0);
  assert.equal(byPeriod['2026-09'].average_census, 1 / 30, 'admission day counted'); assert.equal(byPeriod['2026-09'].month_end_census, 1);
  assert.equal(byPeriod['2026-07'].admissions, 3, 'SQL metrics merge with derived census');
  assert.match(answer.notes.join(' '), /not yet published/);
  assert.equal(answer.freshness.find(item => item.slice === DAILY).derivedFrom, 'resident_episode_history');
});

test('daily census needs its own grant: a weekly or monthly census grant does not imply it', async () => {
  const f = fixture({ slices: [FLOW, WEEKLY, 'census_monthly_by_community'] });
  assert.equal((await f.send({ operation: 'read', step: metricStep({ metrics: ['average_census'] }, DAILY) })).status, 403, 'no implicit widening from weekly census');
  f.registry.grants[0].slices = [FLOW, WEEKLY, 'census_monthly_by_community', DAILY];
  assert.equal((await f.send({ operation: 'read', step: metricStep({ metrics: ['average_census'] }, DAILY) })).status, 200, 'an explicit daily-census grant authorizes it');
});
