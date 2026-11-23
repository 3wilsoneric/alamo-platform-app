import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { BlobClient } from '@azure/storage-blob';

// Exercise the real Azure SDK against an isolated, fictional HTTP source.
// Advance the deadline only after the intended stalled request exists, avoiding
// emulated-CPU startup time in the transport assertions.
const fixture = JSON.parse(await readFile(new URL('./fixtures/pipeline-clinical-snapshot.sanitized.json', import.meta.url)));
const raw = Buffer.from(JSON.stringify(fixture)), compressed = gzipSync(raw);
let mode = 'stalled-body', revision = 'one', downloads = 0, closedIncomplete = 0;
let clock, onIncompleteClose;
const incompleteClosed = new Promise(resolve => { onIncompleteClose = resolve; });
const server = createServer((req, res) => {
  res.on('close', () => { if (!res.writableFinished) { closedIncomplete += 1; onIncompleteClose(); } });
  if (mode === 'metadata-stall') { void nextTurn().then(() => clock?.abort()); return; }
  if (mode === 'failure') { res.writeHead(403); res.end(); return; }
  const zipped = req.url.endsWith('.gz');
  if (mode === 'missing' || zipped && mode !== 'compressed') { res.writeHead(404); res.end(); return; }
  const body = zipped ? compressed : mode === 'invalid' ? Buffer.from('{"invalid":true}') : raw;
  res.writeHead(200, { 'Content-Length': body.length, ETag: '"' + revision + '"',
    'Last-Modified': 'Sun, 22 Nov 2026 12:00:00 GMT', 'x-ms-blob-type': 'BlockBlob' });
  if (req.method === 'HEAD') { res.end(); return; }
  downloads += 1;
  if (mode === 'stalled-body') { res.write(body.subarray(0, 1)); return; }
  res.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const before = { ...process.env }, timeout = AbortSignal.timeout, download = BlobClient.prototype.download;
const sourceUrl = process.env.SNAPSHOT_TRANSPORT_MODULE || new URL('../server/platform-snapshot.mjs', import.meta.url).href;
process.env.AZURE_STORAGE_CONNECTION_STRING = `DefaultEndpointsProtocol=http;AccountName=fixture;AccountKey=${Buffer.alloc(32).toString('base64')};BlobEndpoint=http://127.0.0.1:${server.address().port}/fixture;`;
process.env.AZURE_STORAGE_CONTAINER = 'test';
process.env.PLATFORM_SNAPSHOT_READ_SOURCE = 'azure';
process.env.PLATFORM_SNAPSHOT_CACHE_TTL_MS = '1000';
process.env.SNAPSHOT_ROOT = 'snapshots/daily';
let deadlines = 0, sequence = 0;
AbortSignal.timeout = ms => {
  assert.equal(ms, 60_000); deadlines += 1;
  if (!mode.includes('stall')) return timeout(ms);
  clock = new AbortController();
  return clock.signal;
};
BlobClient.prototype.download = async function (...args) {
  const response = await download.apply(this, args);
  if (mode === 'stalled-body' && clock) {
    assert.equal(args[2]?.abortSignal, clock.signal, 'the read deadline must cover the response body');
    void nextTurn().then(() => clock.abort());
  }
  return response;
};
const fresh = () => import(sourceUrl + '?transport=' + ++sequence);
async function bounded(operation) {
  let guard;
  try { return await Promise.race([operation, new Promise((_, reject) => {
    guard = setTimeout(() => reject(new Error('Azure read did not abort its stalled transport')), 3000);
  })]); } finally { clearTimeout(guard); }
}
try {
  const reader = await fresh();
  const results = await bounded(Promise.allSettled([reader.readPlatformSnapshot(), reader.readPlatformSnapshot()]));
  assert(results.every(r => r.status === 'rejected' && r.reason.name === 'AbortError'));
  assert.equal(downloads, 1, 'concurrent reads share the same bounded request');
  await bounded(incompleteClosed);
  assert.equal(closedIncomplete, 1, 'aborting closes the incomplete response');
  mode = 'good';
  assert.equal((await bounded(reader.readPlatformSnapshot())).snapshot.version, fixture.snapshot.version,
    'a failed read must release the cached promise for a new attempt');
  assert.equal(downloads, 2);
  mode = 'metadata-stall';
  await assert.rejects(bounded((await fresh()).readPlatformSnapshot()), { name: 'AbortError' });
  mode = 'compressed';
  assert.equal((await bounded((await fresh()).readPlatformSnapshot())).snapshot.version, fixture.snapshot.version);
  mode = 'missing';
  assert.equal(await bounded((await fresh()).readPlatformSnapshot()), null);
  mode = 'invalid'; revision = 'invalid';
  await assert.rejects(bounded((await fresh()).readPlatformSnapshot()), /snapshot|health|communities/i);
  mode = 'failure';
  await assert.rejects(bounded((await fresh()).readPlatformSnapshot()), error => error.statusCode === 403);
  assert(deadlines >= 7, 'every read has a deadline, including missing or failed reads');
  console.log('Azure snapshot transport passed: stalled headers/body abort, shared request, retry after failure, compressed/raw publications, missing/invalid/denied sources. No external requests.');
} finally {
  AbortSignal.timeout = timeout;
  BlobClient.prototype.download = download;
  for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
  Object.assign(process.env, before);
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
