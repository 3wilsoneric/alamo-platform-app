import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { COMMUNITY_CROSSWALK, facilityForPipelineCommunity, parseResidentKey, residentKey, PIPELINE_UNASSIGNED } from '../shared/identity-crosswalk.mjs';
import { facilityIdForPipelineCommunity } from '../server/admissions-dashboard.mjs';
import { buildIdentityLinks } from '../server/ally-identity-links.mjs';
import { authorizePlatformReportSource } from '../server/ally-report-source-grants.mjs';
import { createPlatformReportSources } from '../server/ally-report-source.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';

// Owner contracts copied from Pipeline lib/pipeline/community-config.ts and
// Carelog src/BuildingBlocks/Carelog.SharedKernel/Facilities.cs (2026-11-26).
const PIPELINE_COMMUNITIES = ['Unassigned', 'San Pablo', 'Santa Clarita', 'Turlock', "Victoria's House", 'JC Wallace'];
const CARELOG_FACILITIES = { '337': 'San Pablo', '342': "Victoria's House", '343': 'JC Wallace House', '344': 'Turlock', '345': 'Santa Clarita' };

test('one community key: every app maps to the same five ElderMark facility numbers', () => {
  assert.deepEqual(COMMUNITY_CROSSWALK.map(row => row.facilityId), ['337', '342', '343', '344', '345']);
  for (const row of COMMUNITY_CROSSWALK) {
    assert.equal(row.eldermarkFacility, row.facilityId); assert.equal(row.carelogFacilityId, row.facilityId);
    assert(Object.hasOwn(CARELOG_FACILITIES, row.carelogFacilityId));
  }
  for (const name of PIPELINE_COMMUNITIES.filter(name => name !== PIPELINE_UNASSIGNED)) {
    const id = facilityForPipelineCommunity(name);
    assert(id, name); assert.equal(COMMUNITY_CROSSWALK.find(row => row.facilityId === id).pipelineCommunity, name);
    assert.equal(facilityIdForPipelineCommunity(name), id, `The admissions dashboard agrees for ${name}`);
  }
  assert.equal(facilityForPipelineCommunity('Unassigned'), null);
  assert.equal(facilityForPipelineCommunity('Victoria’s House'), '342', 'Curly apostrophe');
  assert.equal(new Set(COMMUNITY_CROSSWALK.map(row => row.pipelineCommunity)).size, 5);
});

test('owner source files still declare the copied community contracts (when the repos are present)', async t => {
  const pipeline = process.env.PIPELINE_REPO, carelog = process.env.CARELOG_REPO;
  if (!pipeline || !carelog) return t.skip('Set PIPELINE_REPO and CARELOG_REPO to check owner sources.');
  const config = await readFile(`${pipeline}/lib/pipeline/community-config.ts`, 'utf8');
  for (const name of PIPELINE_COMMUNITIES) assert(config.includes(JSON.stringify(name)), `Pipeline declares ${name}`);
  const facilities = await readFile(`${carelog}/src/BuildingBlocks/Carelog.SharedKernel/Facilities.cs`, 'utf8');
  for (const id of Object.keys(CARELOG_FACILITIES)) assert(facilities.includes(`"${id}"`), `Carelog declares ${id}`);
});

test('one resident key: <facility>:<ElderMark resident number>, facility-qualified', () => {
  assert.equal(residentKey('337', ' 1001 '), '337:1001'); assert.deepEqual(parseResidentKey('344:R-1'), { facilityId: '344', residentNumber: 'R-1' });
  assert.equal(parseResidentKey('1001'), null); assert.throws(() => residentKey('337', 'a b'));
});

const carelogA = randomUUID(), carelogB = randomUUID();
const joined = (overrides = {}) => buildIdentityLinks({ communities: ['337', '344'], current: ['337:1', '337:2', '344:9', '345:5'], known: ['337:1', '337:2', '337:3', '344:9', '345:5'],
  carelog: { links: [{ clientId: carelogA, facilityId: '337', residentNumber: '1' }, { clientId: carelogB, facilityId: '337', residentNumber: '3' }, { clientId: randomUUID(), facilityId: '345', residentNumber: '5' }], ambiguousKeys: 2 },
  pipeline: { links: [{ residentKey: '337:1', clientId: 'pipeline-client-1', referralId: 42, matchMethod: 'imported' }, { residentKey: '344:77', clientId: 'pipeline-client-2', referralId: 43, matchMethod: 'manual' }] }, ...overrides });

test('coverage counts keys by community within the authorized scope only', () => {
  const coverage = joined().coverage();
  assert.deepEqual(coverage.byCommunity.map(row => row.facilityId), ['337', '344'], 'Santa Clarita is outside the grant');
  assert.deepEqual(coverage.byCommunity[0], { facilityId: '337', community: 'San Pablo', currentResidents: 2, currentWithCarelogLink: 1, currentWithPipelineLink: 1, currentWithBothLinks: 1,
    carelogLinkedKeys: 2, carelogKeysNotInPlatform: 0, pipelineLinkedKeys: 1, pipelineKeysNotInPlatform: 0 });
  assert.equal(coverage.byCommunity[1].pipelineKeysNotInPlatform, 1, '344:77 is linked in Pipeline but not published by Platform');
  assert.equal(coverage.total.currentResidents, 3); assert.equal(coverage.carelogAmbiguousKeysExcluded, 2);
  assert(!JSON.stringify(coverage).includes(carelogA), 'Coverage carries no identifiers');
});

test('an unavailable owner yields null counts, never zero', () => {
  const coverage = joined({ carelog: null }).coverage();
  assert.equal(coverage.sources.carelog, 'unavailable'); assert.equal(coverage.byCommunity[0].currentWithCarelogLink, null);
  assert.equal(coverage.total.currentWithCarelogLink, null); assert.equal(coverage.total.currentWithPipelineLink, 1);
});

test('links page and filter; resolve maps any one app id to the others', () => {
  const all = joined().links();
  assert.deepEqual(all.rows.map(row => row.residentKey), ['337:1', '337:2', '337:3', '344:77', '344:9']);
  assert.deepEqual(joined().links({ linked: 'none' }).rows.map(row => row.residentKey), ['337:2', '344:9']);
  const byReferral = joined().resolve({ pipelineReferralId: 42 });
  assert.equal(byReferral.matches[0].residentKey, '337:1'); assert.equal(byReferral.matches[0].carelogClientId, carelogA);
  assert.equal(joined().resolve({ carelogClientId: carelogB }).matches[0].residentKey, '337:3');
  assert.equal(joined().resolve({ residentKey: '345:5' }).found, false, 'Outside scope');
});

const clientId = randomUUID(), principalId = randomUUID(), user = randomUUID();
const registry = detail => ({ version: 1, grants: [{ id: 'identity-pilot', clientId, principalId, subjectId: user, communityIds: ['337', '342', '343', '344', '345'], capabilities: ['identity-links'], slices: [], detail,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(), revoked: false }] });
const identity = { tenantId: EVERYAGENT_TENANT, clientId, principalId };
const scope = { communityIds: [], from: '2026-01-01', through: '2026-11-24' };
const stepInput = view => ({ subjectId: user, scope, step: { id: 'source-1', capability: 'identity-links', input: { view } } });

test('keys and ids need the detail grant; communities and coverage do not', () => {
  for (const view of ['communities', 'coverage']) assert.equal(authorizePlatformReportSource(identity, stepInput(view), registry(false)).receipt.detail, false);
  for (const view of ['links', 'resolve']) {
    assert.throws(() => authorizePlatformReportSource(identity, stepInput(view), registry(false)), /unavailable/);
    assert.equal(authorizePlatformReportSource(identity, stepInput(view), registry(true)).receipt.detail, true);
  }
});

test('identity-links reads owner links live and reports a missing owner as partial', async () => {
  const snapshot = async () => ({ snapshot: { as_of_date: '2026-11-25', generated_at: '2026-11-25T13:00:00Z' },
    communities: { residents: [{ facility_id: '337', res_number: '1' }, { facility_id: '342', res_number: '8' }] },
    reportsSummary: { toolContext: { tables: { resident_episode_history: [{ facility_id: '337', resident_id: '1' }, { facility_id: '342', resident_id: '8' }] } } } });
  const carelog = Object.assign(async () => ({}), { residentLinks: async subject => { assert.equal(subject, user); return { links: [{ clientId: carelogA, facilityId: '337', residentNumber: '1' }], ambiguousKeys: 0 }; } });
  const pipelineRecords = Object.assign(async () => ({}), { residentLinks: async () => { throw Error('Pipeline down'); } });
  const sources = createPlatformReportSources({ snapshot, carelog, pipelineRecords });
  const authorization = { grant: { detail: true, capabilities: ['identity-links'], slices: [] }, communities: ['337', '342', '343', '344', '345'], receipt: { revision: 'r' } };
  const coverage = await sources.read(stepInput('coverage'), authorization);
  const answer = JSON.parse(coverage.answer);
  assert.equal(coverage.coverage, 'partial'); assert.match(coverage.note, /Unavailable: Pipeline/);
  assert.equal(answer.total.currentResidents, 2); assert.equal(answer.total.currentWithCarelogLink, 1); assert.equal(answer.total.currentWithPipelineLink, null);
  assert.equal(answer.rosterAsOf, '2026-11-25'); assert.equal(coverage.requiresDetail, false);
  const resolved = await sources.read({ ...stepInput('resolve'), step: { id: 's', capability: 'identity-links', input: { view: 'resolve', carelogClientId: carelogA } } }, authorization);
  assert.equal(JSON.parse(resolved.answer).matches[0].residentKey, '337:1'); assert.equal(resolved.requiresDetail, true);
  const ambiguous = await sources.read({ ...stepInput('resolve'), step: { id: 's', capability: 'identity-links', input: { view: 'resolve' } } }, authorization);
  assert.equal(ambiguous.status, 'unavailable');
  const communities = JSON.parse((await sources.read(stepInput('communities'), authorization)).answer);
  assert.equal(communities.communities.find(row => row.facilityId === '343').pipelineCommunity, 'JC Wallace');
});

test('adapter readers: Pipeline follows every cursor; Carelog validates keys-only links', async () => {
  const { createPipelineAnalystSource } = await import('../server/ally-pipeline-source.mjs');
  const { createCarelogAnalystSource } = await import('../server/ally-carelog-source.mjs');
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const seen = [];
  const pipeline = createPipelineAnalystSource({ env: { ALLY_PIPELINE_ORIGIN: 'https://pipeline.example.test', PIPELINE_ALLY_SOURCE_SECRET: 'fixture' }, fetchImpl: async url => {
    const input = JSON.parse(new URL(url).searchParams.get('input')); seen.push(input);
    return json({ schemaVersion: 1, owner: 'pipeline', view: 'resident-links', complete: !!input.cursor, readAt: new Date().toISOString(),
      data: { next_cursor: input.cursor ? null : 'next', records: [{ residentKey: input.cursor ? '344:2' : '337:1', clientId: 'c', referralId: 1, matchMethod: 'imported' }] } }); } });
  assert.deepEqual((await pipeline.residentLinks(user)).links.map(link => link.residentKey), ['337:1', '344:2']);
  assert.deepEqual(seen, [{ view: 'resident-links' }, { view: 'resident-links', cursor: 'next' }]);
  const carelogEnv = { ALLY_CARELOG_ORIGIN: 'https://carelog.example.test', ALLY_CARELOG_AUDIENCE: `api://${randomUUID()}`, AZURE_CLIENT_ID: randomUUID() };
  const credentialFor = () => ({ getToken: async () => ({ token: 't', expiresOnTimestamp: Date.now() + 60_000 }) });
  let body = { links: [{ clientId: carelogA, facilityId: '337', externalResidentId: ' 1 ', residentKey: '337:1' }], ambiguousKeysExcluded: 1 };
  const carelog = createCarelogAnalystSource({ env: carelogEnv, credentialFor, fetchImpl: async url => { assert.equal(new URL(url).pathname, '/api/census/resident-links'); return json(body); } });
  assert.deepEqual(await carelog.residentLinks(user), { links: [{ clientId: carelogA, facilityId: '337', residentNumber: '1' }], ambiguousKeys: 1 });
  body = { links: [{ clientId: 'not-a-guid', facilityId: '337', externalResidentId: '1' }], ambiguousKeysExcluded: 0 };
  await assert.rejects(carelog.residentLinks(user), /unavailable/);
});
