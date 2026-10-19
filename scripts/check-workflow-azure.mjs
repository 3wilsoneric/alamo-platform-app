import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AzureCliCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { createWorkflowAzurePersistence } from '../server/workflow/azure-persistence.mjs';
import { createWorkflowService } from '../server/workflow/service.mjs';
import { readCatalogSources } from '../server/workflow/catalog.mjs';
import { hash } from '../server/workflow/model.mjs';
import { syntheticCapture, syntheticSopContent } from './workflow-capture-fixture.mjs';

const account = process.env.WORKFLOW_AZURE_CHECK_ACCOUNT, containerName = process.env.WORKFLOW_AZURE_CHECK_CONTAINER;
if (process.env.WORKFLOW_AZURE_CHECK_WRITE !== 'true' || !account || !containerName) throw new Error('Explicit Azure test account/container and WORKFLOW_AZURE_CHECK_WRITE=true are required. Uses synthetic tenant records only.');
const container = new BlobServiceClient(`https://${account}.blob.core.windows.net`, new AzureCliCredential()).getContainerClient(containerName);
const tenantId = process.argv[2] === '--read' ? process.argv[3] : randomUUID();
const context = { scope: { tenantId, workspace: 'workflow' }, actor: { id: 'synthetic-storage-verification', name: 'Synthetic storage verification' }, permissions: ['read', 'contribute', 'review', 'publish'] };
const persistence = createWorkflowAzurePersistence(container);
const service = createWorkflowService({ persistence, readSources: () => readCatalogSources(path.resolve('src/features/workflow/legacy')) });
const call = (method, pathname, input) => service(context, method, pathname, input);
if (process.argv[2] === '--read') {
  const published = await call('GET', `/published/${process.argv[4]}`);
  assert.equal(published.status, 'published'); assert.equal(published.citations.length, 1);
  assert.equal(published.publication.rendering.rendererVersion, 1);
  assert.equal(published.publication.document.content.sop.steps[0].captureStepId, published.publication.document.capture.bundle.steps[0].id);
  console.log(JSON.stringify({ contentHash: published.publication.document.contentHash, citations: published.citations.length }));
} else {
  const capture = syntheticCapture(), id = capture.id, connectionId = randomUUID(), prefix = `workflow/v1/${hash(tenantId)}/`;
  const receipt = { checkedAt: new Date().toISOString(), account, container: containerName, kind: 'isolated-synthetic-storage-check', productionAccessEnabled: false, checks: [], cleaned: false };
  try {
    await Promise.all([call('GET', '/session'), call('GET', '/drafts')]);
    receipt.checks.push('concurrent-workspace-initialization');
    const imported = await call('PUT', `/drafts/${id}`, { action: 'import_capture', expectedRevision: 0, capture });
    const content = syntheticSopContent(capture, imported.document.content);
    await call('PUT', `/drafts/${id}`, { action: 'save', expectedRevision: 1, content });
    const quote = content.sop.steps[0].action;
    const graph = await call('GET', '/knowledge'), target = graph.nodes.find(node => node.id === 'role:assessor');
    await call('PUT', `/knowledge/proposals/${connectionId}`, { action: 'propose', expectedRevision: 0, draftId: id, draftRevision: 2, targetId: target.id, targetFingerprint: target.fingerprint, snapshotId: graph.snapshot.id, predicate: 'for_role', quote, quoteStart: (await call('GET', `/drafts/${id}`)).document.content.body.indexOf(quote), rationale: 'Synthetic source-backed connection.' });
    await call('PUT', `/drafts/${id}`, { action: 'submit', expectedRevision: 2 });
    await call('PUT', `/knowledge/proposals/${connectionId}`, { action: 'approve', expectedRevision: 1, note: 'Synthetic connection check.' });
    await call('PUT', `/drafts/${id}`, { action: 'approve', expectedRevision: 3, note: 'Synthetic document check.' });
    const outcomes = await Promise.allSettled([0, 1].map(() => call('PUT', `/drafts/${id}`, { action: 'publish', expectedRevision: 4, proposalIds: [connectionId] })));
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
    assert(outcomes.filter(item => item.status === 'rejected').every(item => item.reason.status === 409));
    receipt.checks.push('capture-sop-connect-review-publish', 'concurrent-publication-single-winner');
    const output = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [process.argv[1], '--read', tenantId, id], { env: process.env });
      let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', () => {}); child.once('error', reject); child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(`Fresh process read failed (${code})`)));
    });
    assert.equal(JSON.parse(output).citations, 1); receipt.checks.push('fresh-process-approved-retrieval-with-evidence');
    const frozen = await call('GET', `/published/${id}`);
    assert.deepEqual(frozen.publication.document.capture.bundle, capture);
    assert.deepEqual(frozen.publication.document.content.sop, content.sop);
    await call('PUT', `/drafts/${id}`, { action: 'reopen', expectedRevision: 5 });
    const successor = structuredClone(content); successor.sop.steps[0].expectedResult = 'A changed synthetic result.';
    await call('PUT', `/drafts/${id}`, { action: 'save', expectedRevision: 6, content: successor });
    assert.deepEqual(await call('GET', `/published/${id}`), frozen);
    const beforeRetry = (await persistence.read(context.scope)).version;
    const retry = await call('PUT', `/drafts/${id}`, { action: 'import_capture', expectedRevision: 0, capture });
    assert.equal(retry.document.revision, 7);
    assert.equal((await persistence.read(context.scope)).version, beforeRetry);
    receipt.checks.push('exact-capture-and-structure', 'draft-successor-preserves-publication', 'idempotent-import-retains-edits');
    const objects = []; for await (const blob of container.listBlobsFlat({ prefix })) objects.push(blob.name);
    assert(objects.filter(name => name.includes('/revisions/')).length >= 6); receipt.checks.push('immutable-revision-archives');
    const head = container.getBlockBlobClient(prefix + 'head.json'), headBytes = await head.downloadToBuffer();
    await head.delete();
    await assert.rejects(call('GET', `/published/${id}`), error => error.code === 'workflow_head_missing');
    await head.uploadData(headBytes, { conditions: { ifNoneMatch: '*' } });
    assert.equal((await call('GET', `/published/${id}`)).citations.length, 1);
    receipt.checks.push('missing-head-denial-and-immutable-revision-recovery');
    await call('PUT', `/knowledge/proposals/${connectionId}`, { action: 'withdraw', expectedRevision: 2 });
    await assert.rejects(call('GET', `/published/${id}`), error => error.status === 410); receipt.checks.push('withdrawal-retracts-publication');
  } finally {
    // HNS accounts include directories in flat listings. Remove children first.
    // Only this randomly scoped test namespace is removed.
    const objects = []; for await (const blob of container.listBlobsFlat({ prefix })) objects.push(blob.name);
    objects.sort((a, b) => b.split('/').length - a.split('/').length || b.length - a.length);
    for (const name of objects) await container.deleteBlob(name);
    await container.getBlockBlobClient(prefix.slice(0, -1)).deleteIfExists();
    receipt.cleaned = true;
    await mkdir('generated/workflow-publication', { recursive: true });
    await writeFile('generated/workflow-publication/azure-capture-check.json', JSON.stringify(receipt, null, 2) + '\n');
  }
  console.log(JSON.stringify(receipt));
}
