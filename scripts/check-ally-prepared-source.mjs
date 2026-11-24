import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createPlatformReportSourceHandler } from '../server/ally-report-source-api.mjs';
import { createPlatformReportSources } from '../server/ally-report-source.mjs';
import { readAllyPlatformData } from '../server/ally-data-source.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';
import { EXECUTIVE_REPORT_SOURCE_PATH } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';

const user = '11111111-1111-4111-8111-111111111111', clientId = '22222222-2222-4222-8222-222222222222', principalId = '33333333-3333-4333-8333-333333333333';
const now = Date.parse('2026-11-23T18:00:00Z');
function fixture() {
  const grant = { id: 'prepared-fixture', clientId, principalId, subjectId: user, communityIds: ['337'], capabilities: ['platform-data'], slices: ['resident_profile'], detail: true, expiresAt: new Date(now + 86400000).toISOString(), revoked: false };
  const registry = { version: 1, grants: [grant] };
  const published = { snapshot: { generated_at: new Date(now).toISOString(), as_of_date: '2026-11-23' }, reportsSummary: { toolContext: {
    manifest: [{ slice_name: 'resident_profile', grain: 'current resident', row_count: 3, fields: ['Facility', 'Facility_Name', 'Age'], nullable_fields: ['Age'], generated_at: new Date(now).toISOString() }],
    tables: { resident_profile: [{ facility_id: '337', facility_name: 'San Pablo', age: 40 }, { facility_id: '337', facility_name: 'San Pablo', age: null }, { facility_id: '345', facility_name: 'Santa Clarita', age: 80 }] }
  } } };
  let mutate = () => {}, warehouse = 0;
  const sources = createPlatformReportSources({ now: () => now, snapshot: async () => published, data: async (query, options) => {
    const result = await readAllyPlatformData(query, { ...options, execute: async () => { warehouse++; throw Error('Warehouse forbidden during prepare'); } });
    mutate(); return result;
  } });
  const handler = createPlatformReportSourceHandler({ now: () => now, authorize: async () => ({ tenantId: EVERYAGENT_TENANT, clientId, principalId }), readGrants: async () => structuredClone(registry), sources });
  async function send(scope = { communityIds: ['337'], from: '2026-01-01', through: '2026-11-23' }) {
    const req = Readable.from([Buffer.from(JSON.stringify({ version: 1, operation: 'prepare', subjectId: user, scope, step: null }))]);
    req.url = EXECUTIVE_REPORT_SOURCE_PATH; req.method = 'POST'; req.headers = { 'content-type': 'application/json' };
    let status, body;
    const res = { setHeader() {}, status(code) { status = code; return res; }, json(value) { body = value; } };
    await handler(req, res); return { status, body };
  }
  return { grant, published, send, warehouse: () => warehouse, mutate: fn => { mutate = fn; } };
}
test('prepared facts are complete, scoped aggregates using the canonical source reader', async () => {
  const f = fixture(), response = await f.send(); assert.equal(response.status, 200);
  assert.equal(response.body.prepared.length, 1);
  assert.deepEqual(response.body.prepared[0].value.dataset.rows, [{ Facility_Name: 'San Pablo', records: 2, known: 1, missing: 1, mean: 40, median: 40, minimum: 40, maximum: 40 }]);
  assert.equal(f.warehouse(), 0); assert.equal(response.body.prepared[0].value.grantRevision, response.body.grant.revision);
  assert.equal((await f.send({ communityIds: ['345'], from: '2026-01-01', through: '2026-11-23' })).status, 403);
});
test('stale, lossy, incomplete and aggregate-only sources do not invent prepared facts', async () => {
  for (const condition of ['stale', 'lossy', 'incomplete', 'aggregate']) {
    const f = fixture();
    if (condition === 'stale') f.published.snapshot.generated_at = '2026-01-01T00:00:00Z';
    if (condition === 'lossy') { delete f.published.reportsSummary.toolContext.manifest[0].nullable_fields; f.published.reportsSummary.toolContext.tables.resident_profile[1].age = 0; }
    if (condition === 'incomplete') f.published.reportsSummary.toolContext.manifest[0].row_count = 100;
    if (condition === 'aggregate') f.grant.detail = false;
    const response = await f.send(); assert.equal(response.status, 200); assert.deepEqual(response.body.prepared, []); assert.equal(f.warehouse(), 0);
  }
});
test('grant changes during preparation prevent returning the collected facts', async () => {
  for (const change of ['revoke', 'revision', 'capability']) {
    const f = fixture(); f.mutate(() => {
      if (change === 'revoke') f.grant.revoked = true;
      if (change === 'revision') f.grant.id = 'replacement-grant';
      if (change === 'capability') f.grant.capabilities = [];
    });
    const response = await f.send(); assert.equal(response.status, 403); assert.equal(response.body.prepared, undefined);
  }
});
