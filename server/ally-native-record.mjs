import { reportHash } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { createHttpError } from './http-error-contract.mjs';

export async function readNativeJsonResponse(response, source) {
  if (!response.ok) {
    await response.body?.cancel();
    // Retain the owning API's error class without exposing its response body.
    // An invalid read or stale continuation is not a source outage.
    const code = [400, 422].includes(response.status) ? 'report_source_query_invalid'
      : response.status === 409 ? 'report_source_revision_changed'
      : [401, 403, 404].includes(response.status) ? 'report_source_access_changed' : null;
    if (code) throw createHttpError(response.status, code, `${source} source returned ${response.status}.`);
    throw Error(`${source} source returned ${response.status}.`);
  }
  if (!response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw Error(`${source} source did not return a record.`); }
  const reader = response.body?.getReader();
  if (!reader) throw Error(`${source} source has no response body.`);
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 4 * 1024 * 1024) throw Error(`${source} selection exceeds the source read limit. Narrow the query or use source paging.`);
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Error(`${source} returned an invalid source record.`); }
}

// Native pagination limits belong to the source; these offsets page only the
// selected response. Revision checks prevent mixing pieces of changing records.
export function projectNativeRecord(data, args, source = 'Source') {
  const revision = reportHash(data), offset = args.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0) throw createHttpError(400, 'report_source_query_invalid', 'Choose a nonnegative integer offset.');
  if (args.revision !== undefined && args.revision !== revision || offset > 0 && args.revision !== revision) throw createHttpError(409, 'report_source_revision_changed', `The ${source} response changed or its continuation is unbound. Read it again.`);
  const pointer = args.pointer ?? '';
  if (typeof pointer !== 'string' || pointer.length > 1000 || pointer && !pointer.startsWith('/') || /~(?![01])/.test(pointer)) throw createHttpError(400, 'report_source_query_invalid', 'Choose a valid JSON pointer from the record.');
  let value = data;
  for (const segment of pointer ? pointer.slice(1).split('/').map(part => part.replace(/~1/g,'/').replace(/~0/g,'~')) : []) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value,segment)) throw createHttpError(400, 'report_source_query_invalid', `That field is not in the ${source} response.`);
    value = value[segment];
  }
  const columns = args.columns;
  if (columns !== undefined && (!Array.isArray(columns) || !columns.length || columns.length > 20 || columns.some(column => typeof column !== 'string' || column.length > 150))) throw createHttpError(400, 'report_source_query_invalid', 'Choose up to twenty record fields.');
  const select = row => {
    if (!columns) return row;
    if (!row || typeof row !== 'object' || Array.isArray(row) || columns.some(column => !Object.hasOwn(row, column))) throw createHttpError(400, 'report_source_query_invalid', 'A selected field is not present in this record.');
    return Object.fromEntries(columns.map(column => [column,row[column]]));
  };
  const base = { revision, pointer, operation: args.path, parameters: args.parameters ?? {},
    meaning: `Native ${source} response. Its query parameters, paging and source dates define the population; the report page dates do not filter this record.` };
  if (Array.isArray(value)) {
    if (offset > value.length) throw createHttpError(400, 'report_source_query_invalid', `${source} response offset is out of range.`);
    const items = []; let size = 0;
    for (const row of value.slice(offset, offset + 20)) {
      const item = select(row), bytes = JSON.stringify(item).length;
      if (size + bytes > 10_000) break;
      items.push(item); size += bytes;
    }
    if (!items.length && offset < value.length) return { ...base, fields: typeof value[offset] === 'object' && value[offset] !== null ? Object.keys(value[offset]).slice(0,100) : [], totalResponseRows: value.length,
      incomplete: true, note: 'Select fewer columns or open this row with a JSON pointer to read its fields.' };
    return { ...base, totalResponseRows: value.length, offset, items, nextOffset: offset + items.length < value.length ? offset + items.length : null,
      incomplete: true, note: 'These are rows in this response, not a population denominator. Use native source pagination for further source records.' };
  }
  if (typeof value === 'string') return { ...base, text: value.slice(offset, offset + 8000), characters: value.length,
    nextOffset: offset + 8000 < value.length ? offset + 8000 : null, incomplete: offset > 0 || value.length > 8000 };
  if (offset) throw createHttpError(400, 'report_source_query_invalid', 'Only text and arrays support response offsets.');
  const selected = select(value);
  if (JSON.stringify(selected).length > 10_000) return { ...base, fields: Object.keys(value), incomplete: true,
    note: 'Open a field with its JSON pointer or select columns to read this record in full.' };
  return { ...base, value: selected, incomplete: Boolean(data?.complete === false || data?.hasMore || data?.nextCursor || data?.truncated || data?.limited), note: 'Record detail; do not infer a whole-population total from a native page or capped list.' };
}
