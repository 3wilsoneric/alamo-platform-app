import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSnapshotHistory, describePublishedDates, publishedReportsSummary, PublishedSnapshotUnavailable } from '../server/platform-snapshot-history.mjs';

const publication = (asOf, rows) => ({
  snapshot: { as_of_date: asOf, generated_at: `${asOf}T13:00:00Z` },
  reportsSummary: { toolContext: { version: 8, manifest: [{ slice_name: 'resident_profile', row_count: rows.length, facility_ids: ['337'], fields: ['facility_id', 'res_number'], generated_at: `${asOf}T13:00:00Z`, as_of_date: asOf }],
    tables: { resident_profile: rows } } } });

function fakeContainer(blobs) {
  const reads = [];
  return { reads, target: { root: 'snapshots/daily', container: {
    async *listBlobsFlat({ prefix }) { for (const name of Object.keys(blobs)) if (name.startsWith(prefix)) yield { name }; },
    getBlobClient(name) { return {
      async getProperties() { if (!blobs[name]) throw Object.assign(Error('missing'), { statusCode: 404 }); return { etag: `"${name}"`, contentLength: Buffer.byteLength(blobs[name]) }; },
      async downloadToBuffer() { reads.push(name); return Buffer.from(blobs[name]); } }; } } } };
}

test('dated publications are listed from the container, ignoring latest, backups and versions', async () => {
  const root = 'snapshots/daily/';
  const { target } = fakeContainer({ [`${root}2026-11-01.json`]: '{}', [`${root}2026-11-03.json`]: '{}', [`${root}latest.json`]: '{}', [`${root}latest.json.gz`]: '', [`${root}backups/x.json`]: '{}', [`${root}20260821T070708Z-before.json`]: '{}' });
  const history = createSnapshotHistory({ container: () => target });
  assert.deepEqual(await history.dates(), ['2026-11-01', '2026-11-03']);
  assert.deepEqual(await history.describe(), { first: '2026-11-01', last: '2026-11-03', count: 2, missingDays: 1, missing: ['2026-11-02'] });
  assert.deepEqual(describePublishedDates([]), { first: null, last: null, count: 0, missingDays: 0, missing: [] });
});

test('a publication is read once per ETag, reports its own as-of date and rejects missing or unsupported dates', async () => {
  const root = 'snapshots/daily/';
  const { target, reads } = fakeContainer({ [`${root}2026-10-31.json`]: JSON.stringify(publication('2026-10-31', [{ facility_id: '337', res_number: '1' }])),
    [`${root}2026-06-02.json`]: JSON.stringify({ snapshot: { as_of_date: '2026-06-02', generated_at: '2026-06-02T20:00:00Z' }, reportsSummary: {} }) });
  const history = createSnapshotHistory({ container: () => target });
  const first = await history.read('2026-10-31');
  assert.equal(first.asOfDate, '2026-10-31'); assert.equal(first.publishedOn, '2026-10-31');
  assert.equal(first.reportsSummary.toolContext.tables.resident_profile.length, 1);
  await history.read('2026-10-31');
  assert.equal(reads.length, 1, 'Same ETag is served from memory');
  await assert.rejects(history.read('2026-11-02'), error => error instanceof PublishedSnapshotUnavailable && error.code === 'published_snapshot_missing' && /2026-06-02 through 2026-10-31/.test(error.message));
  await assert.rejects(history.read('2026-06-02'), error => error.code === 'published_snapshot_unsupported');
  await assert.rejects(history.read('../latest'), error => error.code === 'published_date_invalid');
  assert.throws(() => publishedReportsSummary({}, '2026-01-01'), error => error.code === 'published_snapshot_invalid');
});

test('sharded tables of a past publication are hydrated only when requested', async () => {
  const root = 'snapshots/daily/', payload = publication('2026-11-20', []);
  payload.reportsSummary.toolContext.tableReferences = { notes_summary: { path: `snapshots/tool-tables/v1/notes_summary/${'a'.repeat(64)}.json.gz`, sha256: 'a'.repeat(64), bytes: 10, compressedBytes: 5, rows: 1 } };
  const { target } = fakeContainer({ [`${root}2026-11-20.json`]: JSON.stringify(payload) });
  const tables = [];
  const history = createSnapshotHistory({ container: () => target, readTable: async reference => { tables.push(reference.path); return [{ facility_id: '337' }]; } });
  assert.equal((await history.read('2026-11-20')).reportsSummary.toolContext.tables.notes_summary, undefined);
  assert.deepEqual((await history.read('2026-11-20', { tableNames: ['notes_summary'] })).reportsSummary.toolContext.tables.notes_summary, [{ facility_id: '337' }]);
  assert.equal(tables.length, 1);
});

test('platform-data publishedOn answers from that publication only, with grants and scope unchanged', async t => {
  const { createPlatformReportSources } = await import('../server/ally-report-source.mjs');
  const { target } = fakeContainer({ 'snapshots/daily/2026-10-31.json': JSON.stringify(publication('2026-10-31', [{ facility_id: '337', res_number: '1' }, { facility_id: '337', res_number: '2' }, { facility_id: '344', res_number: '3' }])) });
  const history = createSnapshotHistory({ container: () => target });
  const calls = [];
  let currentReads = 0;
  const sources = createPlatformReportSources({ history, summary: async () => { currentReads++; return { toolContext: { manifest: [], tables: {} } }; },
    data: async (query, options) => { calls.push({ query, options }); const summary = await options.load();
      return { source: { id: query.slice, fields: ['facility_id', 'res_number'], generatedAt: summary.toolContext.manifest[0].generated_at }, readMode: 'published-snapshot', coverage: 'published-row-set', rows: [{ result: 2 }], hasMore: false, returnedRows: 1 }; } });
  const authorization = { grant: { detail: true, slices: ['resident_profile'], capabilities: ['platform-data', 'data-catalog'], communityIds: ['337'] }, communities: ['337'], receipt: { revision: 'r' } };
  const scope = { communityIds: ['337'], from: '2026-01-01', through: '2026-11-24' };
  const value = await sources.read({ step: { capability: 'platform-data', input: { slice: 'resident_profile', operation: 'count', publishedOn: '2026-10-31' } }, scope, subjectId: 's' }, authorization);
  assert.equal(value.status, 'verified'); assert.equal(currentReads, 0, 'The current publication is not read');
  assert.equal(calls[0].options.snapshotOnly, true, 'Never falls through to the live warehouse');
  assert.equal(calls[0].query.publishedOn, undefined);
  assert.deepEqual(calls[0].options.constraints[0], { field: 'facility_id', op: 'in', value: ['337'] });
  assert.deepEqual(JSON.parse(value.answer).publication, { publishedOn: '2026-10-31', asOfDate: '2026-10-31', generatedAt: '2026-10-31T13:00:00Z', toolContextVersion: 8 });
  assert.match(value.title, /published 2026-10-31/); assert.match(value.period, /Publication of 2026-10-31, as of 2026-10-31/);
  const missing = await sources.read({ step: { capability: 'platform-data', input: { slice: 'resident_profile', operation: 'count', publishedOn: '2026-07-01' } }, scope, subjectId: 's' }, authorization);
  assert.equal(missing.status, 'unavailable'); assert.match(missing.note, /No publication exists for 2026-07-01/);
  const listed = await sources.read({ step: { capability: 'data-catalog', input: { publishedDates: true } }, scope, subjectId: 's' }, authorization);
  assert.equal(JSON.parse(listed.answer).publishedDates.count, 1);
  t.diagnostic('publishedOn path verified');
});

const realDir = process.env.PLATFORM_SNAPSHOT_HISTORY_FIXTURE_DIR;
test('real published snapshots read through the governed path (opt-in, read-only)', { skip: !realDir }, async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'snapshot-history-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const date of ['2026-09-15', '2026-11-01']) await copyFile(path.join(realDir, `snap-${date}.json`), path.join(dir, `${date}.json`));
  await writeFile(path.join(dir, 'latest.json'), '{}');
  const { readAllyPlatformData } = await import('../server/ally-data-source.mjs');
  const history = createSnapshotHistory({ container: () => null, localDir: () => dir });
  for (const date of ['2026-09-15', '2026-11-01']) {
    const value = await history.read(date, { tableNames: ['resident_profile'] });
    const result = await readAllyPlatformData({ slice: 'resident_profile', operation: 'count', groupBy: ['Facility'] }, { load: async () => value.reportsSummary, snapshotOnly: true });
    t.diagnostic(`${date} as of ${value.asOfDate}: ${result.rows.map(row => `${row.Facility}=${row.result}`).join(' ')}`);
    assert.equal(result.readMode, 'published-snapshot');
  }
});

test('the catalog points to dated publications when the current one lacks a dataset', async () => {
  const { createPlatformReportSources } = await import('../server/ally-report-source.mjs');
  const { target } = fakeContainer({
    'snapshots/daily/2026-11-03.json': JSON.stringify({ snapshot: { as_of_date: '2026-11-03', generated_at: '2026-11-03T05:00:00Z' }, reportsSummary: {} }),
    'snapshots/daily/2026-11-25.json': JSON.stringify(publication('2026-11-25', [{ facility_id: '337', res_number: '1' }])),
    'snapshots/daily/2026-11-26.json': JSON.stringify({ snapshot: { as_of_date: '2026-11-26', generated_at: '2026-11-26T05:00:00Z' }, reportsSummary: {} }) });
  const history = createSnapshotHistory({ container: () => target });
  assert.deepEqual(await history.latestCatalog(), { publishedOn: '2026-11-25', asOfDate: '2026-11-25', slices: ['resident_profile'] }, 'Skips newer stubs without a catalog');
  const sources = createPlatformReportSources({ history, summary: async () => ({ toolContext: { manifest: [], tables: {} } }) });
  const authorization = { grant: { detail: true, slices: ['resident_profile'], capabilities: ['platform-data', 'data-catalog'], communityIds: ['337'] }, communities: ['337'], receipt: { revision: 'r' } };
  const scope = { communityIds: ['337'], from: '2026-01-01', through: '2026-11-24' };
  const search = JSON.parse((await sources.read({ step: { capability: 'data-catalog', input: { query: 'roster' } }, scope, subjectId: 's' }, authorization)).answer);
  assert.match(search.publicationHint, /publication of 2026-11-25 .* contains: resident_profile/);
  const dates = JSON.parse((await sources.read({ step: { capability: 'data-catalog', input: { publishedDates: true } }, scope, subjectId: 's' }, authorization)).answer);
  assert.deepEqual(dates.publishedDates.latestCatalogPublication, { publishedOn: '2026-11-25', asOfDate: '2026-11-25', slices: ['resident_profile'] });
  const read = await sources.read({ step: { capability: 'platform-data', input: { slice: 'resident_profile', operation: 'count' } }, scope, subjectId: 's' }, authorization);
  assert.equal(read.status, 'unavailable'); assert.match(read.note, /repeat the read with publishedOn 2026-11-25/);
  const narrow = { ...authorization, grant: { ...authorization.grant, slices: ['census_daily_by_community'] } };
  const hidden = JSON.parse((await sources.read({ step: { capability: 'data-catalog', input: { publishedDates: true } }, scope, subjectId: 's' }, narrow)).answer);
  assert.deepEqual(hidden.publishedDates.latestCatalogPublication.slices, [], 'Only granted slices are named');
});
