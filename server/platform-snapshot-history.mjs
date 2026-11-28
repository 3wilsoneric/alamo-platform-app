import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gunzip as gunzipCallback } from 'node:zlib';
import { assertToolTableReferences } from './platform-tool-tables.mjs';
import { getPlatformSnapshotContainer, getPlatformSnapshotMaxBytes, localSnapshotDirectory, readPublishedToolTableReference } from './platform-snapshot.mjs';

// Dated publications are the only history of point-in-time facts (roster,
// countability, operating summary): silver tables are fully overwritten daily.
// Keys are `<root>/<YYYY-MM-DD>.json`, the UTC publication date; each read
// reports the publication's own as_of_date and generated_at. Read-only.
const gunzip = promisify(gunzipCallback);
const DATE_KEY = /^(20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\.json$/;
const LIST_TTL_MS = 10 * 60_000;
const MAX_CACHED_PUBLICATIONS = 3;

export class PublishedSnapshotUnavailable extends Error {
  /** @param {string} message @param {string} code */
  constructor(message, code) { super(message); this.code = code; }
}

/** @param {string[]} dates sorted ascending */
export function describePublishedDates(dates) {
  if (!dates.length) return { first: null, last: null, count: 0, missingDays: 0, missing: [] };
  const present = new Set(dates), missing = [];
  for (let t = Date.parse(`${dates[0]}T00:00:00Z`); t <= Date.parse(`${dates.at(-1)}T00:00:00Z`); t += 86_400_000) {
    const key = new Date(t).toISOString().slice(0, 10);
    if (!present.has(key)) missing.push(key);
  }
  return { first: dates[0], last: dates.at(-1), count: dates.length, missingDays: missing.length, missing: missing.slice(0, 60) };
}

/** The governed parts of an older publication; payload shape grew over time. */
export function publishedReportsSummary(payload, dateKey) {
  const snapshot = payload?.snapshot, summary = payload?.reportsSummary, context = summary?.toolContext;
  if (!snapshot || typeof snapshot.as_of_date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(snapshot.as_of_date) || typeof snapshot.generated_at !== 'string')
    throw new PublishedSnapshotUnavailable(`The publication of ${dateKey} has no valid snapshot date.`, 'published_snapshot_invalid');
  if (!context || !Array.isArray(context.manifest) || !context.tables || typeof context.tables !== 'object')
    throw new PublishedSnapshotUnavailable(`The publication of ${dateKey} predates the governed data catalog; its tables cannot be read with current definitions.`, 'published_snapshot_unsupported');
  assertToolTableReferences(context);
  return { publishedOn: dateKey, asOfDate: snapshot.as_of_date, generatedAt: snapshot.generated_at, toolContextVersion: context.version ?? null, reportsSummary: summary };
}

/**
 * @param {{container?: () => ({container:any, root:string} | null), localDir?: () => string, readTable?: (reference:any) => Promise<any>, maxBytes?: () => number, now?: () => number}} [options]
 */
export function createSnapshotHistory({ container = getPlatformSnapshotContainer, localDir = localSnapshotDirectory, readTable = readPublishedToolTableReference,
  maxBytes = getPlatformSnapshotMaxBytes, now = Date.now } = {}) {
  let listed = /** @type {{at:number, dates:string[]} | null} */ (null);
  const cache = new Map();

  async function dates() {
    if (listed && now() - listed.at < LIST_TTL_MS) return listed.dates;
    const target = container(), /** @type {string[]} */ found = [];
    if (target) {
      for await (const blob of target.container.listBlobsFlat({ prefix: `${target.root}/` })) {
        const name = blob.name.slice(target.root.length + 1), match = DATE_KEY.exec(name);
        if (match?.[1]) found.push(match[1]);
      }
    } else {
      try { for (const name of await readdir(localDir())) { const match = DATE_KEY.exec(name); if (match?.[1]) found.push(match[1]); } }
      catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
    }
    found.sort();
    listed = { at: now(), dates: found };
    return found;
  }

  async function download(dateKey) {
    const target = container(), limit = maxBytes();
    if (target) {
      const client = target.container.getBlobClient(`${target.root}/${dateKey}.json`);
      const properties = await client.getProperties().catch(error => { if (error?.statusCode === 404) return null; throw error; });
      if (!properties) return null;
      const cached = cache.get(dateKey);
      if (cached && cached.etag === properties.etag) return cached;
      if (Number(properties.contentLength) > limit) throw new PublishedSnapshotUnavailable(`The publication of ${dateKey} exceeds the configured size limit.`, 'published_snapshot_too_large');
      let body = await client.downloadToBuffer(0, undefined, { abortSignal: AbortSignal.timeout(60_000) });
      if (body[0] === 0x1f && body[1] === 0x8b) body = await gunzip(body, { maxOutputLength: limit });
      return { etag: properties.etag, payload: JSON.parse(body.toString('utf8')) };
    }
    const file = path.join(localDir(), `${dateKey}.json`);
    try {
      const info = await stat(file);
      const cached = cache.get(dateKey);
      if (cached && cached.etag === String(info.mtimeMs)) return cached;
      if (info.size > limit) throw new PublishedSnapshotUnavailable(`The publication of ${dateKey} exceeds the configured size limit.`, 'published_snapshot_too_large');
      return { etag: String(info.mtimeMs), payload: JSON.parse(await readFile(file, 'utf8')) };
    } catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null; throw error; }
  }

  /** @param {string} dateKey @param {{tableNames?: string[]}} [options] */
  async function read(dateKey, { tableNames = [] } = {}) {
    if (typeof dateKey !== 'string' || !DATE_KEY.test(`${dateKey}.json`)) throw new PublishedSnapshotUnavailable('publishedOn is a YYYY-MM-DD publication date.', 'published_date_invalid');
    const entry = await download(dateKey);
    if (!entry) {
      const known = describePublishedDates(await dates());
      throw new PublishedSnapshotUnavailable(`No publication exists for ${dateKey}. Publications cover ${known.first ?? 'no dates'} through ${known.last ?? 'no dates'} with ${known.missingDays} missing days; list them with data-catalog publishedDates. Census, admissions and discharges for any date do not need a publication: read resident-flow with that date as the period.`, 'published_snapshot_missing');
    }
    const value = entry.value ?? publishedReportsSummary(entry.payload, dateKey);
    cache.delete(dateKey);
    cache.set(dateKey, { etag: entry.etag, value });
    while (cache.size > MAX_CACHED_PUBLICATIONS) cache.delete(cache.keys().next().value);
    const references = value.reportsSummary.toolContext.tableReferences ?? {};
    const names = tableNames.filter(name => Object.hasOwn(references, name));
    if (!names.length) return value;
    const tables = { ...value.reportsSummary.toolContext.tables };
    for (const name of names) tables[name] = await readTable(references[name]);
    return { ...value, reportsSummary: { ...value.reportsSummary, toolContext: { ...value.reportsSummary.toolContext, tables } } };
  }

  /** Newest publication (within the last few) that carries a governed catalog, with its slice names. */
  async function latestCatalog(maxTries = 5) {
    const known = await dates();
    for (const dateKey of known.slice(-maxTries).reverse()) {
      try {
        const value = await read(dateKey);
        return { publishedOn: value.publishedOn, asOfDate: value.asOfDate, slices: value.reportsSummary.toolContext.manifest.map(entry => entry?.slice_name).filter(name => typeof name === 'string') };
      } catch (error) { if (!(error instanceof PublishedSnapshotUnavailable)) throw error; }
    }
    return null;
  }

  return { dates, read, latestCatalog, describe: async () => describePublishedDates(await dates()) };
}
