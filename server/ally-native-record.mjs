import { reportHash } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { createHttpError } from './http-error-contract.mjs';

export async function readNativeJsonResponse(response, source) {
  if (!response.ok) {
    await response.body?.cancel();
    // Retain the owning API's error class without exposing its response body.
    // An invalid read or stale continuation is not a source outage.
    const code = [400, 422].includes(response.status) ? 'report_source_query_invalid'
      : response.status === 409 ? 'report_source_revision_changed'
      : response.status === 404 ? 'report_source_selection_unavailable'
      : [401, 403].includes(response.status) ? 'report_source_access_changed' : null;
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

// Bounded content-first previews retain exact source paths. Large records must
// expose useful values, not force a paid model turn for every wrapper object.
const childPath = (path, key) => `${path}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
const encodedBytes = value => Buffer.byteLength(JSON.stringify(value));
function textWithinBytes(value, max) {
  let bytes=0,end=0;
  for(const character of value){bytes+=encodedBytes(character)-2;if(bytes>max)break;end+=character.length;}
  return value.slice(0,end);
}
function resolvePointer(data, pointer, source) {
  if (typeof pointer !== 'string' || pointer.length > 1000 || pointer && !pointer.startsWith('/') || /~(?![01])/.test(pointer)) throw createHttpError(400, 'report_source_query_invalid', 'Choose a valid JSON pointer from the record.');
  let value = data;
  for (const segment of pointer ? pointer.slice(1).split('/').map(part => part.replace(/~1/g,'/').replace(/~0/g,'~')) : []) {
    if (['__proto__','prototype','constructor'].includes(segment) || !value || typeof value !== 'object' || !Object.hasOwn(value,segment)) throw createHttpError(400, 'report_source_query_invalid', `That field is not in the ${source} response.`);
    value = value[segment];
  }
  return value;
}
function previewValue(value, pointer, budget = 7500) {
  if (encodedBytes(value) <= budget) return value;
  if (budget < 220) return {pointer, kind:Array.isArray(value)?'array':typeof value, incomplete:true};
  if (typeof value === 'string') return { preview:textWithinBytes(value,Math.max(0,budget-180)), characters:value.length, pointer, incomplete:true };
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value), count = Math.min(entries.length, Array.isArray(value) ? 8 : 24);
  const allowance = Math.max(100,Math.floor((budget-300)/Math.max(1,count))-100);
  return { pointer, ...(Array.isArray(value)?{responseRows:value.length}:{fields:Object.keys(value).slice(0,24), fieldCount:Object.keys(value).length}), incomplete:true,
    preview:Object.fromEntries(entries.slice(0,count).map(([key,item])=>[key, previewValue(item,childPath(pointer,key),allowance)])) };
}
function searchRecord(value, pointer, search, matches) {
  if (value !== null && typeof value === 'object') {
    for (const [key,child] of Object.entries(value)) searchRecord(child,childPath(pointer,key),search,matches);
  } else if (typeof value === 'string' && (value.toLowerCase().includes(search) || pointer.toLowerCase().includes(search))) {
    const index = value.toLowerCase().indexOf(search), start = Math.max(0,index-250), end=Math.min(value.length,start+1200);
    matches.push({pointer, text:value.slice(start,end), offset:start, characters:value.length, incomplete:start>0 || end<value.length});
  }
}

// Native pagination limits belong to the source; these offsets page only the
// selected response. Revision checks prevent mixing pieces of changing records.
export function projectNativeRecord(data, args, source = 'Source') {
  const revision = reportHash(data), offset = args.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0) throw createHttpError(400, 'report_source_query_invalid', 'Choose a nonnegative integer offset.');
  if (args.revision !== undefined && args.revision !== revision || offset > 0 && args.revision !== revision) throw createHttpError(409, 'report_source_revision_changed', `The ${source} response changed or its continuation is unbound. Read it again.`);
  const pointer = args.pointer ?? '';
  const value = resolvePointer(data,pointer,source);
  const columns = args.columns;
  if (columns !== undefined && (!Array.isArray(columns) || !columns.length || columns.length > 20 || columns.some(column => typeof column !== 'string' || column.length > 150))) throw createHttpError(400, 'report_source_query_invalid', 'Choose up to twenty record fields.');
  const select = row => {
    if (!columns) return row;
    if (!row || typeof row !== 'object' || Array.isArray(row) || columns.some(column => !Object.hasOwn(row, column))) throw createHttpError(400, 'report_source_query_invalid', 'A selected field is not present in this record.');
    return Object.fromEntries(columns.map(column => [column,row[column]]));
  };
  const base = { revision, pointer, operation: args.path, parameters: args.parameters ?? {},
    meaning: `Native ${source} response. Its query parameters, paging and source dates define the population; the report page dates do not filter this record.` };
  if (args.paths !== undefined) {
    if (args.search !== undefined || columns !== undefined || !Array.isArray(args.paths) || !args.paths.length || args.paths.length > 12 || new Set(args.paths).size !== args.paths.length) throw createHttpError(400,'report_source_query_invalid','Choose up to twelve distinct paths, without search or columns.');
    // Validate the entire selection before paging. Tiny fields must not reserve
    // an equal share of the payload and force useful neighboring fields into
    // previews. Keep complete values together within one shared byte budget.
    const selected=args.paths.map(path=>({pointer:path,value:resolvePointer(data,path,source)}));
    if(offset>=selected.length)throw createHttpError(400,'report_source_query_invalid','Selected-field offset is out of range.');
    const selections=[];let size=2,shortened=false;
    for(const item of selected.slice(offset)){
      const bytes=Buffer.byteLength(JSON.stringify(item))+1;
      if(size+bytes>10_000){
        if(selections.length)break;
        selections.push({pointer:item.pointer,value:previewValue(item.value,item.pointer,2000)});shortened=true;break;
      }
      selections.push(item);size+=bytes;
    }
    const nextOffset=offset+selections.length<selected.length?offset+selections.length:null;
    const complete=offset===0 && nextOffset===null && !shortened;
    return {...base,selections,offset,nextOffset,totalSelections:selected.length,selectionComplete:complete,contentComplete:!shortened,
      incomplete:!complete || Boolean(data?.complete===false || data?.hasMore || data?.nextCursor || data?.truncated || data?.limited),
      note:'Exact selected fields. nextOffset + revision continues the same paths in this response. A preview marks a field larger than one response; open that pointer for full content. Field coverage is not whole-record or population coverage.'};
  }
  if (args.search !== undefined) {
    if (typeof args.search !== 'string' || args.search.trim().length < 2 || args.search.length > 200) throw createHttpError(400,'report_source_query_invalid','Search this record with two to two hundred characters.');
    const matches=[]; searchRecord(value,pointer,args.search.toLowerCase(),matches);
    return {...base, matches:matches.slice(offset,offset+5), matchingFields:matches.length, nextOffset:offset+5<matches.length?offset+5:null, incomplete:true,
      note:'Literal matches in this source response, not an exhaustive clinical conclusion. Open each pointer for full context; search synonyms separately.'};
  }
  if (Array.isArray(value)) {
    if (offset > value.length) throw createHttpError(400, 'report_source_query_invalid', `${source} response offset is out of range.`);
    const items = []; let size = 0;
    for (const row of value.slice(offset, offset + 20)) {
      const item = select(row), bytes = encodedBytes(item);
      if (size + bytes > 10_000) break;
      items.push(item); size += bytes;
    }
    if (!items.length && offset < value.length) return { ...base, items:[previewValue(select(value[offset]),childPath(pointer,offset))], offset, nextOffset:offset+1<value.length?offset+1:null, totalResponseRows:value.length, contentComplete:false, incomplete:true, note:'This row is previewed with exact paths. Open its fields for full content.' };
    return { ...base, totalResponseRows: value.length, offset, items, nextOffset: offset + items.length < value.length ? offset + items.length : null,
      contentComplete:true, incomplete: true, note: 'These are rows in this response, not a population denominator. Use native source pagination for further source records.' };
  }
  if (typeof value === 'string' && offset > value.length) throw createHttpError(400,'report_source_query_invalid','Text offset is out of range.');
  if (typeof value === 'string') {
    if(offset && /[\uDC00-\uDFFF]/.test(value[offset]??'') && /[\uD800-\uDBFF]/.test(value[offset-1]??''))throw createHttpError(400,'report_source_query_invalid','Text offset splits a character. Use the returned continuation.');
    const text=textWithinBytes(value.slice(offset),8000),next=offset+text.length;
    return {...base,text,characters:value.length,nextOffset:next<value.length?next:null,incomplete:offset>0 || next<value.length};
  }
  if (offset) throw createHttpError(400, 'report_source_query_invalid', 'Only text and arrays support response offsets.');
  const selected = select(value);
  if (encodedBytes(selected) > 10_000) return { ...base, value:previewValue(selected,pointer), incomplete:true, note:'Content preview with exact paths. Use paths to read several fields together, search to find passages, or pointer for full content.' };
  return { ...base, value: selected, incomplete: Boolean(data?.complete === false || data?.hasMore || data?.nextCursor || data?.truncated || data?.limited), note: 'Record detail; do not infer a whole-population total from a native page or capped list.' };
}
