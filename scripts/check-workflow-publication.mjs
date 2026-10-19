import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import { readCatalogSources } from '../server/workflow/catalog.mjs';
import { createWorkflowService } from '../server/workflow/service.mjs';
import { workflowContext } from '../server/workflow/access.mjs';
import { createWorkflowApiHandler } from '../server/workflow-api.mjs';
import { createWorkflowAzurePersistence } from '../server/workflow/azure-persistence.mjs';
import { WorkflowError } from '../server/workflow/model.mjs';
import { patchWorkflowApi } from '../deploy/patch-workflow-api.mjs';

const claims = { oid: 'f73371d5-d2b4-48b4-a32b-1edc7c88869f', tid: '10000000-0000-4000-8000-000000000001', scp: 'access_as_user', name: 'Synthetic owner fixture' };
const owner = workflowContext({ authenticated: true, mode: 'entra-delegated', claims });
const content = { title: 'Fictional publication guide', kind: 'procedure', audience: 'Practice team', purpose: 'Exercise reviewed publication.', sourceReference: 'Synthetic test only.', body: 'The assessor follows this fictional handoff procedure. This is a synthetic test.' };
const sources = await readCatalogSources(path.resolve('src/features/workflow/legacy'));
const failure = status => error => error.status === status;
function memoryPersistence() {
  const states = new Map();
  return { kind: 'isolated-test', states,
    async read(scope) { const record = states.get(scope.tenantId); return record ? structuredClone(record) : { value: null, version: null }; },
    async write(scope, value, version) {
      if ((states.get(scope.tenantId)?.version ?? null) !== version) throw new WorkflowError(409, 'revision_conflict', 'Conflict.');
      states.set(scope.tenantId, { value: structuredClone(value), version: String(Number(version ?? 0) + 1) });
    } };
}
function fixture() {
  const persistence = memoryPersistence(); let currentSources = structuredClone(sources);
  const service = createWorkflowService({ persistence, readSources: async () => currentSources });
  const call = (method, pathname, input, context = owner, query) => service(context, method, pathname, input, query);
  return { persistence, service, call, changeSource: () => { currentSources = currentSources.map(source => {
    if (source.id !== 'roles') return source;
    const data = JSON.parse(source.text); data.roles.find(role => role.id === 'assessor').mission += ' Synthetic changed mission.'; data.revision++;
    return { ...source, text: JSON.stringify(data) };
  }); } };
}
async function prepare(f) {
  const id = randomUUID(), connectionId = randomUUID();
  await f.call('PUT', `/drafts/${id}`, { action: 'save', expectedRevision: 0, content });
  const graph = await f.call('GET', '/knowledge'), target = graph.nodes.find(node => node.id === 'role:assessor');
  await f.call('PUT', `/knowledge/proposals/${connectionId}`, { action: 'propose', expectedRevision: 0, draftId: id, draftRevision: 1, snapshotId: graph.snapshot.id,
    targetId: target.id, targetFingerprint: target.fingerprint, predicate: 'for_role', quote: 'The assessor follows this fictional handoff procedure.', quoteStart: 0, rationale: 'Synthetic relationship.' });
  return { id, connectionId };
}
async function approve(f, id, connectionId) {
  await f.call('PUT', `/drafts/${id}`, { action: 'submit', expectedRevision: 1 });
  await f.call('PUT', `/knowledge/proposals/${connectionId}`, { action: 'approve', expectedRevision: 1, note: 'Reviewed the exact quoted evidence.' });
  await f.call('PUT', `/drafts/${id}`, { action: 'approve', expectedRevision: 2, note: 'Reviewed this fictional document.' });
}

test('create → connect → separate reviews → publish → retrieve exact approved evidence after service restart', async () => {
  const f = fixture(), { id, connectionId } = await prepare(f);
  await assert.rejects(f.call('GET', `/published/${id}`), failure(404));
  await assert.rejects(f.call('PUT', `/drafts/${id}`, { action: 'publish', expectedRevision: 1, proposalIds: [] }), failure(409));
  await f.call('PUT', `/drafts/${id}`, { action: 'submit', expectedRevision: 1 });
  await f.call('PUT', `/drafts/${id}`, { action: 'approve', expectedRevision: 2, note: 'Document reviewed.' });
  await assert.rejects(f.call('PUT', `/drafts/${id}`, { action: 'publish', expectedRevision: 3, proposalIds: [connectionId] }), failure(409));
  await f.call('PUT', `/knowledge/proposals/${connectionId}`, { action: 'approve', expectedRevision: 1, note: 'Connection reviewed separately.' });
  await f.call('PUT', `/drafts/${id}`, { action: 'publish', expectedRevision: 3, proposalIds: [connectionId] });
  const restart = createWorkflowService({ persistence: f.persistence, readSources: async () => sources });
  const result = await restart(owner, 'GET', `/published/${id}`);
  assert.equal(result.publication.document.contentRevision, 1);
  assert.equal(result.publication.document.state, 'published');
  assert.equal(result.citations[0].source.excerpt, 'The assessor follows this fictional handoff procedure.');
  assert.equal(result.citations[0].target.status, 'draft-reference', 'Reviewing a relationship must not approve its target role library');
  assert.equal(result.publication.document.approval.actor.id, owner.actor.id);
  assert.equal(result.publication.connections[0].approval.actor.id, owner.actor.id);
  assert.equal((await f.call('GET', `/drafts/${id}`, {}, owner, new URLSearchParams('revision=1'))).state, 'draft');
});

test('permissions, owner-only gate, service identities, tenant scope, and forged actor fields fail closed', async () => {
  assert.throws(() => workflowContext({ authenticated: false, mode: 'explicit-development-bypass' }), failure(401));
  assert.throws(() => workflowContext({ authenticated: true, mode: 'entra-service-principal', claims }), failure(401));
  assert.throws(() => workflowContext({ authenticated: true, mode: 'entra-delegated', claims: { ...claims, oid: randomUUID() } }), failure(404));
  const exactOwnerGrants = JSON.stringify({ [`${claims.tid}:${claims.oid}`]: ['read', 'contribute', 'review', 'publish'] });
  assert.throws(() => workflowContext({ authenticated: true, mode: 'entra-delegated', claims: { ...claims, oid: randomUUID(), email: 'ericwilsonalamo@outlook.com' } }, exactOwnerGrants), failure(403));
  const restricted = workflowContext({ authenticated: true, mode: 'entra-delegated', claims }, JSON.stringify({ [`${claims.tid}:${claims.oid}`]: ['read'] }));
  const f = fixture(), { id } = await prepare(f);
  await assert.rejects(f.call('PUT', `/drafts/${randomUUID()}`, { action: 'save', expectedRevision: 0, content }, restricted), failure(403));
  await assert.rejects(f.call('PUT', `/drafts/${id}`, { action: 'approve', expectedRevision: 1, note: 'Forged review.' }, { ...owner, permissions: ['read', 'contribute'] }), failure(403));
  await assert.rejects(f.call('PUT', `/drafts/${id}`, { action: 'save', expectedRevision: 1, content, actor: { id: 'forged' } }), failure(400));
  const otherTenant = { ...owner, scope: { ...owner.scope, tenantId: randomUUID() } };
  assert.equal((await f.call('GET', '/drafts', {}, otherTenant)).documents.length, 0);
  await assert.rejects(f.call('GET', `/drafts/${id}`, {}, otherTenant), failure(404));
  await assert.rejects(f.call('GET', '/knowledge', {}, { ...owner, permissions: [] }), failure(403));
});

test('parallel initial reads converge; concurrent reviewers/publishers accept one conditional write', async () => {
  const f = fixture();
  await Promise.all([f.call('GET', '/session'), f.call('GET', '/drafts')]);
  const { id, connectionId } = await prepare(f); await approve(f, id, connectionId);
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => f.call('PUT', `/drafts/${id}`, { action: 'publish', expectedRevision: 3, proposalIds: [connectionId] })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert(results.filter(result => result.status === 'rejected').every(result => result.reason.status === 409));
  assert.equal((await f.call('GET', `/drafts/${id}`)).history.length, 4);
});

test('content changes revoke pending approval and source changes prevent stale published retrieval', async () => {
  const f = fixture(), { id, connectionId } = await prepare(f); await approve(f, id, connectionId);
  await f.call('PUT', `/drafts/${id}`, { action: 'reopen', expectedRevision: 3 });
  await f.call('PUT', `/drafts/${id}`, { action: 'save', expectedRevision: 4, content: { ...content, body: content.body + ' Revised.' } });
  assert.equal((await f.call('GET', '/knowledge')).proposals[0].freshness, 'needs_review');
  await assert.rejects(f.call('PUT', `/drafts/${id}`, { action: 'publish', expectedRevision: 5, proposalIds: [connectionId] }), failure(409));
  const g = fixture(), prepared = await prepare(g); await approve(g, prepared.id, prepared.connectionId);
  await g.call('PUT', `/drafts/${prepared.id}`, { action: 'publish', expectedRevision: 3, proposalIds: [prepared.connectionId] });
  const original = await g.call('POST', '/knowledge/evidence', { proposalId: prepared.connectionId, side: 'target' });
  g.changeSource();
  await assert.rejects(g.call('GET', `/published/${prepared.id}`), failure(409));
  assert.deepEqual(await g.call('POST', '/knowledge/evidence', { proposalId: prepared.connectionId, side: 'target' }), original);
});

test('withdrawn connections retract affected publications; explicit retraction preserves all history', async () => {
  const f = fixture(), { id, connectionId } = await prepare(f); await approve(f, id, connectionId);
  await f.call('PUT', `/drafts/${id}`, { action: 'publish', expectedRevision: 3, proposalIds: [connectionId] });
  await f.call('PUT', `/knowledge/proposals/${connectionId}`, { action: 'withdraw', expectedRevision: 2 });
  await assert.rejects(f.call('GET', `/published/${id}`), failure(410));
  assert.equal((await f.call('GET', '/published')).documents.length, 0);
  assert.equal((await f.call('GET', `/knowledge/proposals/${connectionId}`)).history.length, 3);
  const g = fixture(), prepared = await prepare(g); await approve(g, prepared.id, prepared.connectionId);
  await g.call('PUT', `/drafts/${prepared.id}`, { action: 'publish', expectedRevision: 3, proposalIds: [] });
  await g.call('PUT', `/drafts/${prepared.id}`, { action: 'retract', expectedRevision: 4, note: 'Synthetic retraction.' });
  await assert.rejects(g.call('GET', `/published/${prepared.id}`), failure(410));
});

test('failed storage and corrupt state never report accepted publication', async () => {
  const f = fixture(), { id, connectionId } = await prepare(f); await approve(f, id, connectionId);
  const failing = createWorkflowService({ readSources: async () => sources, persistence: { ...f.persistence, write: async () => { throw new Error('Offline'); } } });
  await assert.rejects(failing(owner, 'PUT', `/drafts/${id}`, { action: 'publish', expectedRevision: 3, proposalIds: [] }), /Offline/);
  assert.equal((await f.call('GET', `/drafts/${id}`)).document.state, 'approved');
  f.persistence.states.get(owner.scope.tenantId).value.scope.tenantId = 'wrong';
  await assert.rejects(f.call('GET', '/drafts'), failure(503));
});

test('Azure adapter uses tenant paths, ETags, size bounds and no filesystem fallback', async () => {
  const blobs = new Map(); let failStorage = false;
  const names = [], container = { async *listBlobsFlat({ prefix }) { for (const name of blobs.keys()) if (name.startsWith(prefix)) yield { name }; }, getBlockBlobClient(name) { names.push(name); return {
    async download() { if (failStorage) throw Object.assign(new Error('Denied'), { statusCode: 403 }); const blob = blobs.get(name); if (!blob) throw Object.assign(new Error('Missing'), { code: 'BlobNotFound' }); return { readableStreamBody: Readable.from([blob.bytes]), contentLength: blob.bytes.length, etag: blob.etag }; },
    async uploadData(value, options) { const etag = blobs.get(name)?.etag; if ((etag ? options.conditions.ifMatch !== etag : options.conditions.ifNoneMatch !== '*')) throw Object.assign(new Error('Conflict'), { statusCode: 412 }); blobs.set(name, { bytes: value, etag: String(Number(etag ?? 0) + 1) }); }
  }; } };
  const storage = createWorkflowAzurePersistence(container);
  assert.deepEqual(await storage.read(owner.scope), { value: null, version: null });
  await storage.write(owner.scope, { schemaVersion: 1 }, null);
  assert.equal((await storage.read(owner.scope)).version, '1');
  await assert.rejects(storage.write(owner.scope, {}, null), failure(409));
  assert(names.every(name => /^workflow\/v1\/[a-f0-9]{64}\/(head|revisions\/[a-f0-9]{64})\.json$/.test(name)));
  const headName = names.find(name => name.endsWith('/head.json')), head = blobs.get(headName);
  blobs.delete(headName);
  await assert.rejects(storage.read(owner.scope), error => error.code === 'workflow_head_missing');
  blobs.set(headName, head);
  assert.deepEqual((await storage.read(owner.scope)).value, { schemaVersion: 1 }, 'Restoring the accepted head recovers its immutable revision.');
  failStorage = true; await assert.rejects(storage.read(owner.scope), /Denied/);
  await assert.rejects(storage.write(owner.scope, { text: 'a'.repeat(17 * 1024 * 1024) }, '1'), failure(409));
});

test('HTTP adapter authenticates every operation before storage and preserves protected headers', async () => {
  const f = fixture(); let checked = 0;
  const handler = createWorkflowApiHandler({ env: { WORKFLOW_CONTENT_ENABLED: 'true' }, persistence: f.persistence, readSources: async () => sources,
    authenticate: async req => { checked++; if (req.headers.authorization !== 'Bearer synthetic') throw Object.assign(new Error('Sign in required.'), { statusCode: 401, code: 'api_auth_required' }); return { authenticated: true, mode: 'entra-delegated', claims }; } });
  async function send(method, route, body, authorization = 'Bearer synthetic') {
    const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, getHeader(name) { return this.headers[name]; }, status(value) { this.statusCode = value; return this; }, json(value) { this.value = value; } };
    await handler({ method, url: `/api/platform/workflow/v1${route}`, headers: { authorization, 'content-type': 'application/json' }, body }, response); return response;
  }
  assert.equal((await send('GET', '/session', undefined, '')).statusCode, 401);
  assert.equal(f.persistence.states.size, 0);
  const session = await send('GET', '/session'); assert.equal(session.statusCode, 200); assert.match(session.headers['Cache-Control'], /no-store/); assert.match(session.headers.Vary, /Authorization/);
  assert.equal((await send('PUT', `/drafts/${randomUUID()}`, { action: 'save', expectedRevision: 0, content, scope: 'forged' })).statusCode, 400);
  assert.equal((await send('POST', '/knowledge/evidence', 'a'.repeat(260000))).statusCode, 400);
  assert.equal(checked, 4);
});


test('referenced policies must be published and retraction blocks dependent approved retrieval', async () => {
  const f = fixture(), id = randomUUID(), targetId = randomUUID(), linkId = randomUUID();
  await f.call('PUT', `/drafts/${targetId}`, { action: 'save', expectedRevision: 0, content: { ...content, kind: 'policy' } });
  await f.call('PUT', `/drafts/${id}`, { action: 'save', expectedRevision: 0, content });
  const graph = await f.call('GET', '/knowledge'), target = graph.nodes.find(node => node.id === `draft:${targetId}`);
  await f.call('PUT', `/knowledge/proposals/${linkId}`, { action: 'propose', expectedRevision: 0, draftId: id, draftRevision: 1, snapshotId: graph.snapshot.id,
    targetId: target.id, targetFingerprint: target.fingerprint, predicate: 'governed_by', quote: content.body, quoteStart: 0, rationale: 'Synthetic policy dependency.' });
  await approve(f, id, linkId);
  await assert.rejects(f.call('PUT', `/drafts/${id}`, { action: 'publish', expectedRevision: 3, proposalIds: [linkId] }), error => error.code === 'target_not_published');
  await f.call('PUT', `/drafts/${targetId}`, { action: 'submit', expectedRevision: 1 });
  await f.call('PUT', `/drafts/${targetId}`, { action: 'approve', expectedRevision: 2, note: 'Reviewed synthetic policy.' });
  await f.call('PUT', `/drafts/${targetId}`, { action: 'publish', expectedRevision: 3, proposalIds: [] });
  await f.call('PUT', `/drafts/${id}`, { action: 'publish', expectedRevision: 3, proposalIds: [linkId] });
  assert.equal((await f.call('GET', `/published/${id}`)).citations.length, 1);
  await f.call('PUT', `/drafts/${targetId}`, { action: 'retract', expectedRevision: 4, note: 'Policy withdrawn.' });
  await assert.rejects(f.call('GET', `/published/${id}`), error => error.code === 'publication_evidence_changed');
});

test('HTTP storage failures do not leak Azure request or credential diagnostics', async () => {
  const handler = createWorkflowApiHandler({ env: { WORKFLOW_CONTENT_ENABLED: 'true' }, readSources: async () => sources,
    authenticate: async () => ({ authenticated: true, mode: 'entra-delegated', claims }),
    persistence: { read: async () => { throw Object.assign(new Error('Private Azure request diagnostics'), { statusCode: 403, code: 'AzureDiagnostic' }); } } });
  const response = { setHeader() {}, getHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.value = value; } };
  await handler({ method: 'GET', url: '/api/platform/workflow/v1/session', headers: {} }, response);
  assert.equal(response.statusCode, 503); assert.equal(response.value.error.code, 'workflow_unavailable'); assert.doesNotMatch(response.value.error.message, /Private Azure/);
});


test('release patch preserves the live API, is idempotent, and rejects an unknown entry boundary', () => {
  const existing = 'import { newerLiveRoute } from "../server/newer-live-route.mjs";\nexport default async function handler(req, res) {\n  const requestPath = String(req.url ?? "").split("?", 1)[0] ?? "";\n  return newerLiveRoute(requestPath, req, res);\n}\n';
  const patched = patchWorkflowApi(existing);
  assert(patched.includes('return newerLiveRoute(requestPath, req, res);'));
  assert.equal(patchWorkflowApi(patched), patched);
  assert.throws(() => patchWorkflowApi('export default function unrelated() {}'), /expected request-path/);
  assert.throws(() => patchWorkflowApi(patched.replace('isWorkflowApiPath(requestPath)', 'isWorkflowApiPathChanged(requestPath)')), /partial/);
});
