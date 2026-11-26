import { normalizeKnownCommunityNames, ALAMO_FACILITIES } from "../shared/community-names.mjs";
import { ANALYSIS_SLICE_CATALOG } from "../shared/analysis-slice-catalog.mjs";
import { getReportsSummaryData } from "./platform-data.mjs";
import { queryDatabricks } from "./databricks.mjs";
import { readPlatformSnapshot } from './platform-snapshot.mjs';
import { reportHash } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { DAILY_CENSUS_DEFINITION, averageDailyCensus, censusDay, censusEpisodes, censusOnDay } from '../shared/daily-census.mjs';

// These are the governed view names published by tool_context_views.py. A
// snapshot manifest may describe fields and coverage, but cannot register a
// new SQL target for Ally.
const EXTRA_SLICES = [
  "incident_detail_current_month", "resident_profile",
  "current_resident_county_by_community", "mar_daily_by_community_90d", "mar_monthly_by_community_medication", "mar_daily_by_community_medication",
  // Canonical daily census (Facility × day): v_tool_census_daily_by_community.
  // Governed metrics derive it from episode history until the view is published.
  "census_daily_by_community"
];
const ALLOWED_SLICES = new Set([...ANALYSIS_SLICE_CATALOG.map(slice => slice.id), ...EXTRA_SLICES]);
const FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_FILTERS = 6;
const MAX_ROWS = 100;
const MAX_GROUPS = 3;
const MAX_RESULT_BYTES = 80_000;

function sourceManifest(reportsSummary) {
  const context = reportsSummary?.toolContext;
  const entries = Array.isArray(context?.manifest) ? context.manifest : [];
  return entries.filter(entry => ALLOWED_SLICES.has(entry?.slice_name) &&
    Array.isArray(entry.fields) && entry.fields.every(field => FIELD.test(field)) &&
    Number.isSafeInteger(entry.row_count) && entry.row_count >= 0);
}

export function listAllyPlatformDataSources(reportsSummary) {
  const tables = reportsSummary?.toolContext?.tables ?? {};
  return sourceManifest(reportsSummary).map(entry => ({
    id: entry.slice_name, grain: entry.grain, fields: entry.fields,
    sourceRows: entry.row_count, snapshotRows: Array.isArray(tables[entry.slice_name]) ? tables[entry.slice_name].length : reportsSummary.toolContext.tableReferences?.[entry.slice_name]?.rows ?? null,
    minPeriod: entry.min_period ?? null, maxPeriod: entry.max_period ?? null,
    facilityIds: entry.facility_ids ?? [], generatedAt: entry.generated_at ?? null,
    asOfDate: /^20\d{2}-\d{2}-\d{2}$/.test(entry.as_of_date ?? '') ? entry.as_of_date : null,
    fieldCoverage: publishedFieldCoverage(entry, tables[entry.slice_name]),
    nullableFields: Array.isArray(entry.nullable_fields) && entry.nullable_fields.every(field => entry.fields.includes(field)) ? entry.nullable_fields : []
  }));
}

/** @param {string} message @param {string|null} [field] @param {string[]} [allowed] */
const invalidQuery = (message, field = null, allowed = undefined) => Object.assign(Error(message), {code:'ally_query_invalid', field, ...(allowed ? {allowed} : {})});

/** Run tasks with bounded parallelism, preserving input order. @template T,R @param {T[]} items @param {number} limit @param {(item:T,index:number)=>Promise<R>} task @returns {Promise<R[]>} */
export async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length); let next = 0;
  const worker = async () => { while (next < items.length) { const index = next++; results[index] = await task(/** @type {T} */ (items[index]), index); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

// W3.6: the full-result fingerprint (sha2 over every projected row) is computed
// once on the first page. Later pages of the same revision reuse it while the
// publication, authorized scope and selection are identical and the entry is
// younger than the TTL; otherwise the full identity query runs again and any
// change still rejects the continuation. A short page also forces a recheck.
export const CONTINUATION_TTL_MS = 10 * 60_000;
export function createContinuationCache({ now = Date.now, ttlMs = CONTINUATION_TTL_MS, maxEntries = 500 } = {}) {
  /** @type {Map<string,{identityKey:string,total:number,storedAt:number}>} */
  const entries = new Map();
  return {
    /** @param {string} key */
    get(key) { const entry = entries.get(key); if (!entry) return null; if (now() - entry.storedAt >= ttlMs) { entries.delete(key); return null; } return entry; },
    /** @param {string} key @param {{identityKey:string,total:number}} value */
    set(key, value) { entries.delete(key); if (entries.size >= maxEntries) { const oldest = entries.keys().next().value; if (oldest !== undefined) entries.delete(oldest); } entries.set(key, { ...value, storedAt: now() }); },
    /** @param {string} key */
    delete(key) { entries.delete(key); },
    get size() { return entries.size; }
  };
}
const defaultContinuations = createContinuationCache();

// Coverage is about the complete published row set, not merely whether a
// column appears in the schema. No values or records enter the catalog.
function publishedFieldCoverage(entry, rows) {
  if(!Array.isArray(rows) || rows.length!==entry.row_count)return null;
  const fields=entry.fields;
  return Object.fromEntries(fields.map(field=>{
    const alias=field==='Res_Number'&&['resident_episode_history','documentation_status','notes_summary','assessment_summary','services_provided','resident_unit_history'].includes(entry.slice_name)?'resident_id':PUBLISHED_FIELD_NAMES[field];
    let present=0, populated=0;
    for(const row of rows) {
      const key=Object.hasOwn(row,field)?field:alias&&Object.hasOwn(row,alias)?alias:null;
      if(!key)continue;
      present++;
      if(row[key]!==null&&row[key]!==undefined&&String(row[key]).trim()!=='')populated++;
    }
    return [field,{records:rows.length,present,populated}];
  }));
}

function validateQuery(query, source) {
  if (!query || typeof query !== "object" || Array.isArray(query) || !source || !ALLOWED_SLICES.has(source.id) ||
    !Array.isArray(source.fields) || source.fields.some(field => !FIELD.test(field))) throw invalidQuery("Choose a listed Platform source.");
  const fields = new Set(source.fields);
  const expression = query.measureExpression;
  if (expression !== undefined && (!expression || typeof expression !== 'object' || Array.isArray(expression) ||
    Object.keys(expression).sort().join(',') !== 'left,operation,right' ||
    !['days-between','add','subtract','multiply','divide'].includes(expression.operation) ||
    !fields.has(expression.left) || !fields.has(expression.right) || query.measure !== undefined ||
    !['sum','average','minimum','maximum','median','statistics'].includes(query.operation))) throw invalidQuery('Choose one supported measure expression using two listed fields, without measure.');
  if (expression?.operation === 'days-between' && [expression.left,expression.right].some(field=>!/(date|time|_at$)/i.test(field))) throw invalidQuery('Days between requires two date fields; left is the start, right is the end.');
  const filters = Array.isArray(query.filters) ? query.filters : [];
  if (filters.length > MAX_FILTERS || filters.some(filter => !filter || !fields.has(filter.field) ||
    !["eq", "gte", "lte", "contains", "number-gte", "number-lte"].includes(filter.op) ||
    (filter.op.startsWith('number-') && !Number.isFinite(Number(filter.value))) ||
    (["gte", "lte"].includes(filter.op) && !/(?:date|month|week|time|period)/i.test(filter.field)) ||
    typeof filter.value !== "string" || !filter.value.trim() || filter.value.length > 200)) throw invalidQuery("Choose valid bounded source filters.");
  const groupBy = Array.isArray(query.groupBy) ? query.groupBy : [];
  if (groupBy.length > MAX_GROUPS || new Set(groupBy).size !== groupBy.length || groupBy.some(field => !fields.has(field))) throw invalidQuery("Choose listed grouping fields.");
  const operation = query.operation ?? "rows";
  if (!["rows", "count", "sum", "average", "minimum", "maximum", "median", "distinct", "statistics"].includes(operation) || operation === "rows" && groupBy.length ||
    ["sum", "average", "minimum", "maximum", "median", "distinct", "statistics"].includes(operation) && !expression && !fields.has(query.measure) ||
    ["rows", "count"].includes(operation) && query.measure) throw invalidQuery("Choose a supported source operation.");
  const requestedColumns = query.columns ?? source.fields;
  if (!Array.isArray(requestedColumns) || !requestedColumns.length || (query.columns !== undefined && requestedColumns.length > 40) || new Set(requestedColumns).size !== requestedColumns.length || requestedColumns.some(field => !fields.has(field))) throw invalidQuery('columns must contain listed source fields.');
  // Projection cannot change an aggregate's population. Validate redundant
  // columns, then retain only its actual output fields in the executed query.
  const columns = operation === 'rows' ? requestedColumns : [...groupBy, ...aggregateFields(operation)];
  const requestedOrder = query.orderBy ?? [];
  const orderBy = Array.isArray(requestedOrder) ? requestedOrder.map(order => order && operation !== 'rows' && operation !== 'statistics' &&
    (order.field === query.measure || operation === 'count' && order.field === 'count') && !groupBy.includes(order.field)
    ? {...order, field:'result'} : order) : requestedOrder;
  const resultFields = operation === 'rows' ? columns : [...groupBy, ...aggregateFields(operation)];
  if (!Array.isArray(orderBy) || orderBy.length > 3 || orderBy.some(order => !order || !resultFields.includes(order.field) || !['asc','desc'].includes(order.direction))) throw invalidQuery('orderBy must use returned fields: selected columns for rows; groupBy fields plus result for aggregates; groupBy plus records, known, missing, mean, median, minimum, maximum for statistics.');
  const limit = Number(query.limit ?? 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROWS) throw invalidQuery("Choose a row limit from 1 to 100.");
  const offset = query.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000 ||
    offset && !query.revision || query.revision !== undefined && (typeof query.revision !== 'string' || !/^[a-f0-9]{64}$/.test(query.revision))) {
    throw invalidQuery('Continue with the returned nextOffset and revision.');
  }
  const excerpt = query.textExcerpt;
  if (excerpt !== undefined && (!excerpt || typeof excerpt !== 'object' || Array.isArray(excerpt) || Object.keys(excerpt).some(key=>!['field','query','characters'].includes(key)) ||
    operation !== 'rows' || !columns.includes(excerpt.field) || typeof excerpt.query !== 'string' || excerpt.query.length > 200 ||
    !Number.isSafeInteger(excerpt.characters) || excerpt.characters < 100 || excerpt.characters > 2000 || limit > 20)) throw invalidQuery('Text excerpts require a selected field, literal query (empty for the start), 100–2000 characters and at most twenty rows.');
  return { source, filters, groupBy, operation, excerpt, measure: expression ? "_ally_measure" : query.measure ?? null, expression, columns, orderBy, limit, offset };
}

function quotedField(field) { return `\`${field}\``; }
function valueSql(value) { return `CAST(unbase64('${Buffer.from(value, "utf8").toString("base64")}') AS STRING)`; }

function filterSql({ field, op, value }) {
  const column = `CAST(${quotedField(field)} AS STRING)`;
  if (op === 'in') return `${column} IN (${value.map(valueSql).join(', ')})`;
  const literal = valueSql(value.trim());
  if(op.startsWith('number-'))return `try_cast(${quotedField(field)} AS DOUBLE) ${op==='number-gte'?'>=':'<='} ${Number(value)}`;
  if (op.startsWith('day-')) return `substring(${column}, 1, 10) ${op === 'day-gte' ? '>=' : '<='} ${literal}`;
  if (op === "contains") return `contains(lower(${column}), lower(${literal}))`;
  return `${column} ${op === "eq" ? "=" : op === "gte" ? ">=" : "<="} ${literal}`;
}

/** @param {any} query @param {any} source @param {Array<{field:string,op:string,value:any}>} [constraints] */
export function compileAllyPlatformDataQuery(query, source, constraints = []) {
  const input = validateQuery(query, source);
  validateConstraints(source, constraints);
  input.filters = [...input.filters, ...constraints];
  const where = input.filters.map(filterSql);
  const expressionSql = input.expression ? (()=>{
    const {left,right,operation}=input.expression;
    const a=`try_cast(${quotedField(left)} AS DOUBLE)`, b=`try_cast(${quotedField(right)} AS DOUBLE)`;
    return operation==='days-between' ? `DATEDIFF(try_cast(${quotedField(right)} AS DATE), try_cast(${quotedField(left)} AS DATE))`
      : `(${a} ${{add:'+',subtract:'-',multiply:'*',divide:'/'}[operation]} ${operation==='divide'?`NULLIF(${b}, 0)`:b})`;
  })() : null;
  const relation=expressionSql ? `(SELECT *, ${expressionSql} AS _ally_measure FROM alamohealth.gold.v_tool_${input.source.id}) AS measured` : `alamohealth.gold.v_tool_${input.source.id}`;
  const groupColumns = input.groupBy.map(quotedField);
  const metric = input.operation === "count" ? "COUNT(*) AS result"
    : input.operation === "sum" ? `SUM(try_cast(${quotedField(input.measure)} AS DOUBLE)) AS result`
      : input.operation === "average" ? `AVG(try_cast(${quotedField(input.measure)} AS DOUBLE)) AS result`
      : input.operation === "minimum" ? `MIN(try_cast(${quotedField(input.measure)} AS DOUBLE)) AS result`
      : input.operation === "maximum" ? `MAX(try_cast(${quotedField(input.measure)} AS DOUBLE)) AS result`
      : input.operation === "median" ? `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY try_cast(${quotedField(input.measure)} AS DOUBLE)) AS result`
      : input.operation === "distinct" ? `COUNT(DISTINCT ${quotedField(input.measure)}) AS result`
      : input.operation === 'statistics' ? statisticsSql(quotedField(input.measure)) : input.columns.map(quotedField).join(', ');
  const projection = input.operation === "rows" ? metric : [...groupColumns, metric].join(", ");
  const sql = `SELECT ${projection} FROM ${relation}` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    (groupColumns.length ? ` GROUP BY ${groupColumns.join(", ")}` : "") +
    (input.orderBy.length ? ` ORDER BY ${input.orderBy.map(order => `${quotedField(order.field)} ${order.direction.toUpperCase()} NULLS LAST`).join(', ')}` : '') +
    ` LIMIT ${input.limit + 1}`;
  // A statement reads a consistent result set. Carry its complete multiset
  // fingerprint with the page, then reject continuation after any source change.
  // Ties across every projected value are indistinguishable duplicate rows;
  // their multiplicity remains in both the fingerprint and total count.
  const stableOrder = [...input.orderBy, ...input.columns.filter(field => !input.orderBy.some(order => order.field === field)).map(field => ({field,direction:'asc'}))];
  const pagedSql = input.operation === 'rows' ? `WITH _ally_rows AS (` +
    `SELECT ${projection} FROM ${relation}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}` +
    `), _ally_identity AS (SELECT COUNT(*) AS __ally_total_rows, ` +
    `sha2(concat_ws('', sort_array(collect_list(sha2(to_json(struct(${input.columns.map(quotedField).join(', ')})), 256)))), 256) AS __ally_result_revision FROM _ally_rows), ` +
    `_ally_page AS (SELECT ${input.columns.map(quotedField).join(', ')}, TRUE AS __ally_row_present FROM _ally_rows ORDER BY ${stableOrder.map(order=>`${quotedField(order.field)} ${order.direction.toUpperCase()} NULLS LAST`).join(', ')} LIMIT ${input.limit+1} OFFSET ${input.offset}) ` +
    `SELECT _ally_page.*, _ally_identity.* FROM _ally_identity LEFT JOIN _ally_page ON TRUE ` +
    `ORDER BY ${stableOrder.map(order=>`${quotedField(order.field)} ${order.direction.toUpperCase()} NULLS LAST`).join(', ')}` : null;
  // A continuation page whose result identity is already known: no full scan.
  const pageSql = input.operation === 'rows' ? `SELECT ${input.columns.map(quotedField).join(', ')} FROM (` +
    `SELECT ${projection} FROM ${relation}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}) AS _ally_rows ` +
    `ORDER BY ${stableOrder.map(order=>`${quotedField(order.field)} ${order.direction.toUpperCase()} NULLS LAST`).join(', ')} LIMIT ${input.limit+1} OFFSET ${input.offset}` : null;
  const searchFilters = (query.filters ?? []).filter(filter => !['gte','lte'].includes(filter.op));
  const searchFields = [...new Set(searchFilters.map(filter => filter.field))];
  const populationFilters = input.filters.filter(filter => !searchFilters.includes(filter));
  const populationSql = searchFields.length ? `SELECT ${searchFields.flatMap((field,i)=>{
    const other=searchFilters.filter(filter=>filter.field!==field).map(filterSql).join(' AND ');
    const value=`NULLIF(TRIM(CAST(${quotedField(field)} AS STRING)), '')`;
    return [`COUNT(${other?`CASE WHEN ${other} THEN 1 END`:'*'}) AS records_${i}`,
      `COUNT(${other?`CASE WHEN ${other} THEN ${value} END`:value}) AS known_${i}`];
  }).join(', ')} FROM alamohealth.gold.v_tool_${input.source.id}` +
    (populationFilters.length ? ` WHERE ${populationFilters.map(filterSql).join(' AND ')}` : '') : null;
  return { sql, pagedSql, pageSql, searchFields, searchFilters, populationFilters, populationSql, ...input };
}

function validateConstraints(source, constraints) {
  if (!Array.isArray(constraints) || constraints.length > 3 || constraints.some(c => !source.fields.includes(c.field) ||
      !['in', 'gte', 'lte', 'day-gte', 'day-lte'].includes(c.op) || (c.op === 'in' ? !Array.isArray(c.value) || !c.value.length || c.value.length > 25 || c.value.some(v => typeof v !== 'string' || v.length > 80) : typeof c.value !== 'string' || c.value.length > 80))) throw Error('Invalid enforced source scope.');
}

export const aggregateFields = operation => operation==='statistics' ? ['records','known','missing','mean','median','minimum','maximum'] : ['result'];
function statisticsSql(field) {
  const numeric=`try_cast(${field} AS DOUBLE)`;
  return `COUNT(*) AS records, COUNT(${numeric}) AS known, COUNT(*) - COUNT(${numeric}) AS missing, AVG(${numeric}) AS mean, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${numeric}) AS median, MIN(${numeric}) AS minimum, MAX(${numeric}) AS maximum`;
}

// snapshot_publish.py preserves the governed measures but normalizes these
// dimensions. Translate back to the manifest/query contract before applying
// scope, filters or grouping. Never guess aliases from a field's spelling.
const PUBLISHED_FIELD_NAMES = Object.freeze({ Facility: 'facility_id', Facility_Name: 'facility_name', Incident_Category: 'category',
  Res_Number:'res_number', First_Name:'first_name',Last_Name:'last_name',Age:'age',Admit_Date:'admit_date',LOS_Days:'los_days',
  Unit_Number:'unit_number',Care_Level:'care_level',Payor_Text:'payor',Primary_Diagnosis:'primary_diagnosis',Physician_Name:'physician',Diet:'diet',
  Unique_ID:'id',Incident_Date_parsed:'incident_date',Assistance_Given:'assistance_given',
  Type_of_Incident:'incident_type',Medication:'medication',__TIMESTAMP:'received_at' });
// The existing dashboard publisher replaces nulls with zero for these nullable
// measures. A zero cannot establish whether the original value was missing.
// Use the governed view in that case, including when a snapshot is the fallback.
// Revisit only when the publisher has a versioned, lossless numeric contract.
const NULL_TO_ZERO_FIELDS = new Set(['Age','LOS_Days','average_age','average_los_days','prior_census','census_delta',
  'incidents_per_100_residents','largest_documentation_gap_days','days_since_last_note','minutes_late','refusal_pct','compliance_pct',
  'latest_monthly_census','prior_census','census_7d_prior','census_change_7d']);
function snapshotQueryRows(rows, input) {
  const required = new Set([...input.filters.map(filter => filter.field), ...input.groupBy, ...(input.expression ? [input.expression.left,input.expression.right] : input.measure ? [input.measure] : []), ...(input.operation==='rows'?input.columns:[])]);
  return rows.map(row => {
    let ambiguity = null;
    const projected = Object.fromEntries(input.source.fields.map(field => {
      const alias = field === 'Res_Number' && ['resident_episode_history','documentation_status','notes_summary','assessment_summary','services_provided','resident_unit_history'].includes(input.source.id)
        ? 'resident_id' : PUBLISHED_FIELD_NAMES[field];
      if (alias && Object.hasOwn(row, field) && Object.hasOwn(row, alias) && String(row[field]) !== String(row[alias])) {
        throw Error('Published source dimensions conflict.');
      }
      const key = Object.hasOwn(row, field) ? field : alias && Object.hasOwn(row, alias) ? alias : null;
      if (!key && required.has(field)) throw Error('The published source lacks a required query field.');
      const normalized = !Object.hasOwn(row,'Facility') && Object.hasOwn(row,'facility_id');
      if (key && required.has(field) && normalized && NULL_TO_ZERO_FIELDS.has(field) && !input.source.nullableFields?.includes(field) && row[key] === 0) {
        ambiguity = 'The published source cannot distinguish a missing value from zero.';
      }
      if (key && required.has(field) && normalized && typeof row[key] === 'boolean') {
        throw Error('The published source coerced the original numeric flag. Use the full view.');
      }
      if (key && normalized && input.operation === 'distinct' && input.measure === field && row[key] === '') {
        ambiguity = 'The published source cannot distinguish a missing value from an empty value.';
      }
      return [field, key ? normalizeKnownCommunityNames(row[key]) : null];
    }));
    if (ambiguity && snapshotFilter([projected],input.filters).length) throw Error(ambiguity);
    if (input.expression) {
      const {left,right,operation}=input.expression;
      const number=value=>value===null || value===undefined || String(value).trim()==='' || !Number.isFinite(Number(value)) ? null : Number(value);
      const day=value=>{ const text=String(value??'').slice(0,10); const time=Date.parse(text+'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===text ? time/86400000 : null; };
      const a=operation==='days-between'?day(projected[left]):number(projected[left]);
      const b=operation==='days-between'?day(projected[right]):number(projected[right]);
      projected._ally_measure=a===null || b===null || operation==='divide' && b===0 ? null : operation==='days-between'?b-a:operation==='add'?a+b:operation==='subtract'?a-b:operation==='multiply'?a*b:a/b;
    }
    return projected;
  });
}

function snapshotFilter(rows, filters) {
  return rows.filter(row => filters.every(({ field, op, value }) => {
    const actual = String(row[field] ?? "");
    if(op.startsWith('number-')) {
      const number=actual.trim()===''?NaN:Number(actual);
      return Number.isFinite(number) && (op==='number-gte'?number>=Number(value):number<=Number(value));
    }
    if (op.startsWith('day-')) return /^\d{4}-\d{2}-\d{2}/.test(actual) && (op === 'day-gte' ? actual.slice(0, 10) >= value : actual.slice(0, 10) <= value);
    if (op === 'in') return value.includes(actual);
    if (op === "contains") return actual.toLowerCase().includes(value.trim().toLowerCase());
    if (op === "eq") return actual === value.trim();
    return op === "gte" ? actual >= value.trim() : actual <= value.trim();
  }));
}

function snapshotAggregate(rows, { operation, measure, groupBy }) {
  const groups = new Map();
  for (const row of rows) {
    const values = groupBy.map(field => row[field] ?? null);
    const key = JSON.stringify(values);
    const current = groups.get(key) ?? { values, count: 0, total: 0, numericCount: 0, numbers: [], distinct: new Set() };
    current.count++;
    const raw = row[measure];
    const number = raw === null || raw === undefined || String(raw).trim() === '' ? NaN : Number(raw);
    if (measure && raw !== null && raw !== undefined) current.distinct.add(String(raw));
    if (measure && Number.isFinite(number)) { current.total += number; current.numericCount++; current.numbers.push(number); }
    groups.set(key, current);
  }
  if (!groups.size && !groupBy.length) groups.set("[]", { values: [], count: 0, total: 0, numericCount: 0, numbers: [], distinct: new Set() });
  return [...groups.values()].map(group => ({
    ...Object.fromEntries(groupBy.map((field, index) => [field, group.values[index]])),
    ...(operation==='statistics' ? {records:group.count,known:group.numericCount,missing:group.count-group.numericCount,
      mean:group.numericCount ? group.total/group.numericCount : null,median:group.numericCount?median(group.numbers):null,
      minimum:group.numericCount?group.numbers.reduce((a,b)=>Math.min(a,b),Infinity):null,maximum:group.numericCount?group.numbers.reduce((a,b)=>Math.max(a,b),-Infinity):null} : {
    result: operation === "count" ? group.count : operation === 'distinct' ? group.distinct.size : !group.numericCount ? null : operation === "sum" ? group.total : operation === 'minimum' ? group.numbers.reduce((a,b)=>Math.min(a,b),Infinity) : operation === 'maximum' ? group.numbers.reduce((a,b)=>Math.max(a,b),-Infinity) : operation === 'median' ? median(group.numbers) : group.total / group.numericCount
    })
  }));
}

function median(values) {
  const sorted = [...values].sort((a,b) => a-b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function orderRows(rows, orderBy) {
  return orderBy.length ? [...rows].sort((a,b) => {
    for (const {field,direction} of orderBy) {
      const left=a[field], right=b[field];
      if (left == null && right != null) return 1;
      if (right == null && left != null) return -1;
      if (left == null && right == null) continue;
      const compared=typeof left==='number' && typeof right==='number' ? left-right : String(left).localeCompare(String(right));
      if (compared) return direction==='desc' ? -compared : compared;
    }
    return 0;
  }) : rows;
}

const defaultLoad = slice => async () => {
  if (!ALLOWED_SLICES.has(slice)) throw invalidQuery('Choose a listed Platform source.', 'input.slice');
  return (await readPlatformSnapshot({ tableNames: [slice] }))?.reportsSummary ?? getReportsSummaryData();
};
// Source-owned authorization narrows the manifest before query compilation.
// Both SQL and fallback rows use this same projection; new columns fail closed.
function authorizedSource(reportsSummary, slice, allowedFields) {
  let source = listAllyPlatformDataSources(reportsSummary).find(item => item.id === slice);
  if (allowedFields !== undefined) {
    if (!source || !Array.isArray(allowedFields) || !allowedFields.length || new Set(allowedFields).size !== allowedFields.length || allowedFields.some(field => !source.fields.includes(field))) throw Error('Invalid authorized source fields.');
    source = { ...source, fields: source.fields.filter(field => allowedFields.includes(field)),
      fieldCoverage: source.fieldCoverage ? Object.fromEntries(allowedFields.map(field => [field, source.fieldCoverage[field]])) : null };
    source.nullableFields = source.nullableFields.filter(field => allowedFields.includes(field));
  }
  return source;
}
// Warehouse results may be reused briefly for the same SQL and publication.
const executeOptions = source => ({ cacheRevision: typeof source?.generatedAt === 'string' ? source.generatedAt : null });

/** @param {any} query @param {{load?:Function,execute?:Function,constraints?:Array<{field:string,op:string,value:any}>,allowedFields?:string[],snapshotOnly?:boolean,continuations?:ReturnType<typeof createContinuationCache>}} [options] */
export async function readAllyPlatformData(query, { load = defaultLoad(query?.slice), execute = queryDatabricks, constraints = [], allowedFields, snapshotOnly = false, continuations = defaultContinuations } = {}) {
  const reportsSummary = await load();
  const source = authorizedSource(reportsSummary, query?.slice, allowedFields);
  const input = compileAllyPlatformDataQuery(query, source, constraints);
  let rows; let readMode = "governed-view"; let coverage = "source-query";
  /** @type {{revision?:string,totalRows?:number,offset?:number}} */
  const continuation = {};
  const snapshotRows = reportsSummary.toolContext?.tables?.[input.source.id];
  const fromSnapshot=()=>{
    if (!Array.isArray(snapshotRows)) throw Error("The governed source is unavailable and no published rows exist for this slice.");
    if (snapshotRows.length < input.source.sourceRows && input.operation !== 'rows') throw Error('An incomplete published sample cannot establish an aggregate.');
    const filtered = snapshotFilter(snapshotQueryRows(snapshotRows, input), input.filters);
    const ordered = orderRows(input.operation === "rows" ? filtered : snapshotAggregate(filtered, input), input.orderBy);
    if (snapshotRows.length === input.source.sourceRows && Number.isFinite(Date.parse(input.source.generatedAt))) {
      // Bind pages to the exact source, authorized scope, query and ordering.
      // A refreshed publication or changed grant cannot silently skip records.
      const { offset: _offset, revision: _revision, limit: _limit, ...selection } = query;
      const revision = reportHash({ source: input.source, constraints, selection, rows: ordered });
      if (query.revision !== undefined && query.revision !== revision) throw invalidQuery('The source or query changed. Restart from the first page.');
      if (input.offset > ordered.length) throw invalidQuery('The continuation is outside this result. Restart from the first page.');
      Object.assign(continuation, { revision, totalRows: ordered.length, offset: input.offset });
    } else if (input.offset || query.revision !== undefined) throw invalidQuery('Continuation requires a complete published source. Narrow the source query instead.');
    return ordered.slice(input.offset,input.offset+input.limit+1);
  };
  // Complete published data is already the versioned source used by Platform.
  // Never pay a warehouse round trip (or its failing permission check) for it.
  if(Array.isArray(snapshotRows) && snapshotRows.length===input.source.sourceRows && Number.isFinite(Date.parse(input.source.generatedAt))) {
    try { rows=fromSnapshot();readMode='published-snapshot';coverage='published-row-set'; }
    catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ally_query_invalid') throw error; /* A missing/conflicting required column needs the full view. */ }
  }
  if (rows === undefined && (input.offset || query.revision !== undefined) && !input.pagedSql) throw invalidQuery('Continuation requires a complete published source. Narrow the source query instead.');
  if (rows === undefined && snapshotOnly) throw Error('A complete, lossless published answer is unavailable.');
  const { offset: _selectionOffset, revision: _selectionRevision, limit: _selectionLimit, ...warehouseSelection } = query;
  const identityKey = input.pagedSql ? reportHash({ source: input.source, constraints, selection: warehouseSelection }) : null;
  if (rows === undefined && input.pagedSql && input.offset && query.revision !== undefined) {
    const known = continuations.get(query.revision);
    if (known && known.identityKey === identityKey && input.offset <= known.total) {
      try {
        const page = await execute(input.pageSql, executeOptions(input.source));
        if (Array.isArray(page) && page.every(row => row && typeof row === 'object') && page.length === Math.min(input.limit + 1, Math.max(0, known.total - input.offset))) {
          rows = page; readMode = 'governed-view'; coverage = 'source-query';
          Object.assign(continuation, { revision: query.revision, totalRows: known.total, offset: input.offset });
        } else continuations.delete(query.revision);
      } catch { continuations.delete(query.revision); /* Recheck with the full identity query. */ }
    }
  }
  if(rows===undefined) try {
    rows = await execute(input.pagedSql ?? input.sql, executeOptions(input.source));
    if (!Array.isArray(rows)) throw Error("Invalid source result.");
    if (input.pagedSql) {
      if (!rows.length || rows.some(row=>!row || typeof row!=='object' || !Object.hasOwn(row,'__ally_result_revision'))) throw Error('The warehouse did not return a continuation identity.');
      const identity=rows[0], total=Number(identity.__ally_total_rows), fingerprint=identity.__ally_result_revision;
      if (!Number.isSafeInteger(total) || total < 0 || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint) ||
        rows.some(row=>row.__ally_result_revision!==fingerprint || Number(row.__ally_total_rows)!==total)) throw Error('Invalid warehouse continuation identity.');
      const { offset: _offset, revision: _revision, limit: _limit, ...selection } = query;
      const revision=reportHash({source:input.source, constraints, selection, warehouseResult:fingerprint,total});
      if (query.revision !== undefined && query.revision!==revision) throw invalidQuery('The source or query changed. Restart from the first page.');
      if (input.offset>total) throw invalidQuery('The continuation is outside this result. Restart from the first page.');
      rows=rows.filter(row=>row.__ally_row_present===true);
      if (rows.length!==Math.min(input.limit+1,Math.max(0,total-input.offset))) throw Error('The warehouse page is incomplete.');
      Object.assign(continuation,{revision,totalRows:total,offset:input.offset});
      if (identityKey) continuations.set(revision, { identityKey, total });
    }
  } catch (error) {
    if (error && typeof error==='object' && 'code' in error && error.code==='ally_query_invalid') throw error;
    if (input.offset || query.revision!==undefined) throw invalidQuery('The source page is unavailable. Retry this revision; do not combine it with a different source.');
    rows=fromSnapshot();
    readMode = "published-snapshot";
    coverage = snapshotRows.length < input.source.sourceRows ? `partial: ${snapshotRows.length} of ${input.source.sourceRows} source rows published` : "published-row-set";
  }
  let hasMore = rows.length > input.limit;
  const fields = input.operation === 'rows' ? input.columns : [...input.groupBy, ...aggregateFields(input.operation)];
  const returned = (hasMore ? rows.slice(0, input.limit) : rows).map(row => Object.fromEntries(fields.map(field => [field, row[field] ?? null])));
  const excerpts = input.excerpt ? returned.map((row,index)=>{
    const {field,query,characters}=input.excerpt, text=row[field];
    if (typeof text !== 'string') return {row:index, field, characters:null, offset:0, complete:true};
    const match=query ? text.toLowerCase().indexOf(query.toLowerCase()) : 0;
    const offset=Math.max(0,match-Math.floor(characters/4));
    row[field]=text.slice(offset,offset+characters);
    return {row:index,field,characters:text.length,offset,complete:offset===0 && text.length<=characters,queryMatched:match>=0};
  }) : null;
  // A failed search is not a demonstrated absence when its predicate has no
  // usable values. Profile only zero-match searches, keeping the enforced
  // community and date constraints; no note bodies enter this coverage result.
  const zero = value => value !== null && value !== undefined && String(value).trim() !== '' && Number(value) === 0;
  const zeroMatches = !rows.length || ['count','distinct'].includes(input.operation) && rows.every(row=>zero(row.result)) ||
    input.operation==='statistics' && rows.every(row=>zero(row.records));
  let searchCoverage = null;
  if (input.searchFields.length && zeroMatches) {
    let population;
    if (readMode === 'published-snapshot') {
      const scoped = snapshotFilter(snapshotQueryRows(snapshotRows,input),input.populationFilters);
      population = Object.fromEntries(input.searchFields.flatMap((field,i)=>{
        const cohort=snapshotFilter(scoped,input.searchFilters.filter(filter=>filter.field!==field));
        return [[`records_${i}`,cohort.length],[`known_${i}`,cohort.filter(row=>row[field]!==null&&String(row[field]??'').trim()!=='').length]];
      }));
    } else {
      try { const profile=await execute(input.populationSql, executeOptions(input.source)); if(Array.isArray(profile)&&profile.length===1)population=profile[0]; }
      catch { /* An unverified search must not become a verified zero. */ }
    }
    const count = value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value)>=0;
    if (!population || input.searchFields.some((_,i)=>!count(population[`records_${i}`]) ||
        !count(population[`known_${i}`]) || Number(population[`known_${i}`])>Number(population[`records_${i}`]))) {
      throw Object.assign(Error('Search coverage could not be verified. Matching records are unknown, not zero.'),{code:'ally_field_coverage_unavailable'});
    }
    searchCoverage=input.searchFields.map((field,i)=>({field,records:Number(population[`records_${i}`]),known:Number(population[`known_${i}`])}));
    const unknown=searchCoverage.filter(item=>item.records>0&&item.known===0).map(item=>item.field);
    if(unknown.length)throw Object.assign(Error(`The searched fields have no populated values in this scope: ${unknown.join(', ')}. Matching records cannot be determined; this is not a zero result.`),{code:'ally_field_coverage_unavailable'});
    if(searchCoverage.some(item=>item.known<item.records))coverage=(coverage.startsWith('partial')?coverage+'; ':'partial: ')+'some searched values are missing; zero matches applies only to recorded values';
  }
  // Page whole records by bytes as well as row count. Never shorten a note to
  // make it fit: the continuation resumes after the last complete returned row.
  // Without a source-issued complete result identity, truncation cannot safely
  // establish a next page, so keep the existing explicit size failure.
  if (continuation.revision && continuation.totalRows !== undefined && input.operation === 'rows' && !excerpts) {
    while (returned.length > 1 && Buffer.byteLength(JSON.stringify(returned),'utf8') > 12_000) returned.pop();
    hasMore = input.offset + returned.length < continuation.totalRows;
  }
  if (Buffer.byteLength(JSON.stringify(returned), "utf8") > MAX_RESULT_BYTES) throw Object.assign(Error("The result is too large; narrow the filters or row limit."),{code:'analyst_result_too_large'});
  return { version: "ally-platform-data-v1", source: input.source, readMode, coverage,
    query: { slice: input.source.id, filters: input.filters, operation: input.operation, groupBy: input.groupBy, measure: input.expression ? null : input.measure, ...(input.expression?{measureExpression:input.expression}:{}), columns:input.columns, orderBy:input.orderBy, limit: input.limit },
    ...(excerpts?{textExcerpts:excerpts,excerptNotice:"Text is an excerpt, not the complete note. Counts still require an aggregate over the filtered source population."}:{}),
    rows: returned, hasMore, returnedRows: returned.length,
    ...(continuation.revision ? {...continuation, nextOffset: hasMore ? input.offset + returned.length : null} : {}),
    ...(searchCoverage?{searchCoverage}:{}) };
}

// W3.7 profile: field-level shape of an authorized slice, never its rows.
// Same source resolution, field authorization and enforced scope as reads.
const PROFILE_TOP_VALUES = 10;
const PROFILE_LOW_CARDINALITY = 20;
const DATE_NAME = /(?:date|month|week|time|period|_at$)/i;
/** @param {{slice:string,fields?:string[]}} query @param {{load?:Function,execute?:Function,constraints?:Array<{field:string,op:string,value:any}>,allowedFields?:string[],topValueEligible?:(field:string)=>boolean,snapshotOnly?:boolean}} [options] */
export async function profileAllyPlatformData(query, { load = defaultLoad(query?.slice), execute = queryDatabricks, constraints = [], allowedFields, topValueEligible = () => false, snapshotOnly = false } = {}) {
  const reportsSummary = await load();
  const source = authorizedSource(reportsSummary, query?.slice, allowedFields);
  if (!source || !ALLOWED_SLICES.has(source.id)) throw invalidQuery('Choose a listed Platform source.', 'input.slice');
  const fields = query.fields ?? source.fields;
  if (!Array.isArray(fields) || !fields.length || fields.length > 40 || new Set(fields).size !== fields.length) throw invalidQuery('Choose up to forty listed fields.', 'input.fields', source.fields);
  const unknown = fields.findIndex(field => typeof field !== 'string' || !source.fields.includes(field));
  if (unknown >= 0) throw invalidQuery('Choose listed fields.', `input.fields[${unknown}]`, source.fields);
  validateConstraints(source, constraints);
  const eligible = fields.filter(field => topValueEligible(field));
  const snapshotRows = reportsSummary.toolContext?.tables?.[source.id];
  const complete = Array.isArray(snapshotRows) && snapshotRows.length === source.sourceRows && Number.isFinite(Date.parse(source.generatedAt));
  let stats = null, readMode = 'governed-view';
  if (complete) {
    try {
      const projected = snapshotFilter(snapshotQueryRows(snapshotRows, { source, filters: constraints, groupBy: [], operation: 'rows', columns: fields, expression: undefined, measure: null }), constraints);
      stats = fields.map(field => {
        const values = projected.map(row => row[field]).filter(value => value !== null && value !== undefined && String(value).trim() !== '');
        const numbers = values.map(Number).filter(Number.isFinite);
        const counts = new Map(); for (const value of values) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
        const texts = values.map(String).sort();
        return { field, records: projected.length, filled: values.length, distinct: counts.size, numeric: numbers.length,
          numberMin: numbers.length ? Math.min(...numbers) : null, numberMax: numbers.length ? Math.max(...numbers) : null,
          textMin: texts[0] ?? null, textMax: texts.at(-1) ?? null,
          top: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, PROFILE_TOP_VALUES + 1).map(([value, count]) => ({ value, count })) };
      });
      readMode = 'published-snapshot';
    } catch { stats = null; /* Lossy or conflicting published columns need the governed view. */ }
  }
  if (!stats) {
    if (snapshotOnly) throw Error('A complete, lossless published profile is unavailable.');
    const where = constraints.map(filterSql);
    const base = `SELECT ${fields.map(quotedField).join(', ')} FROM alamohealth.gold.v_tool_${source.id}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
    const text = field => `NULLIF(TRIM(CAST(${quotedField(field)} AS STRING)), '')`;
    const statsSql = `WITH _ally_base AS (${base}) SELECT COUNT(*) AS __records, ` + fields.map((field, i) =>
      `COUNT(${text(field)}) AS filled_${i}, COUNT(DISTINCT ${text(field)}) AS distinct_${i}, COUNT(try_cast(${text(field)} AS DOUBLE)) AS numeric_${i}, ` +
      `MIN(try_cast(${text(field)} AS DOUBLE)) AS nmin_${i}, MAX(try_cast(${text(field)} AS DOUBLE)) AS nmax_${i}, MIN(${text(field)}) AS tmin_${i}, MAX(${text(field)}) AS tmax_${i}`).join(', ') + ' FROM _ally_base';
    const topSql = eligible.length ? `WITH _ally_base AS (${base}), _ally_values AS (` + eligible.map(field =>
      `SELECT '${field}' AS field, ${text(field)} AS value, COUNT(*) AS n FROM _ally_base WHERE ${text(field)} IS NOT NULL GROUP BY ${text(field)}`).join(' UNION ALL ') +
      `) SELECT field, value, n FROM (SELECT field, value, n, row_number() OVER (PARTITION BY field ORDER BY n DESC, value ASC) AS rank FROM _ally_values) WHERE rank <= ${PROFILE_TOP_VALUES + 1}` : null;
    const [summary, top] = await Promise.all([execute(statsSql, executeOptions(source)), topSql ? execute(topSql, executeOptions(source)) : []]);
    if (!Array.isArray(summary) || summary.length !== 1 || !Array.isArray(top)) throw Error('Invalid source profile result.');
    const row = summary[0], count = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
    const number = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
    stats = fields.map((field, i) => ({ field, records: count(row.__records), filled: count(row[`filled_${i}`]), distinct: count(row[`distinct_${i}`]), numeric: count(row[`numeric_${i}`]),
      numberMin: number(row[`nmin_${i}`]), numberMax: number(row[`nmax_${i}`]), textMin: row[`tmin_${i}`] ?? null, textMax: row[`tmax_${i}`] ?? null,
      top: top.filter(item => item?.field === field).map(item => ({ value: String(item.value), count: count(item.n) })) }));
    if (stats.some(item => item.records === null || item.filled === null || item.distinct === null || item.filled > item.records)) throw Error('Invalid source profile result.');
  }
  const profiles = stats.map(item => {
    const type = DATE_NAME.test(item.field) && !(item.numeric === item.filled && item.filled > 0 && !/^\d{4}-\d{2}/.test(String(item.textMin ?? ''))) ? 'date'
      : item.filled > 0 && item.numeric === item.filled ? 'number' : 'text';
    const showTop = eligible.includes(item.field) && type === 'text' && item.distinct <= PROFILE_LOW_CARDINALITY;
    return { field: item.field, type, records: item.records, filled: item.filled, fillRate: item.records ? Math.round(10000 * item.filled / item.records) / 10000 : null, distinct: item.distinct,
      ...(type === 'number' ? { minimum: item.numberMin, maximum: item.numberMax } : {}),
      ...(type === 'date' ? { minimum: item.textMin, maximum: item.textMax } : {}),
      ...(showTop ? { topValues: item.top.slice(0, PROFILE_TOP_VALUES).map(entry => ({ value: normalizeKnownCommunityNames(entry.value), count: entry.count })), topValuesComplete: item.distinct <= PROFILE_TOP_VALUES } : {}) };
  });
  return { version: 'ally-platform-profile-v1', slice: source.id, grain: source.grain ?? null, readMode, generatedAt: source.generatedAt ?? null, asOfDate: source.asOfDate ?? null,
    records: profiles[0]?.records ?? 0, fields: profiles,
    definition: 'Field shape within the authorized communities and dates. fillRate counts non-blank values; distinct excludes blanks. Top values appear only for low-cardinality status-like fields. No rows are returned.' };
}

// W3.2 governed metrics. Platform owns every definition below; each compiles to
// one SQL statement against the existing gold views. Additivity is enforced in
// the SQL, not left to the caller: census is never summed across dates.
const FLOW = 'resident_flow_monthly_by_community', CENSUS_DAILY = 'census_daily_by_community', INCIDENTS = 'incident_monthly_by_community_category';
// Callers that still name the former census sources for average_census or
// month_end_census are accepted as deprecated aliases of the daily census slice.
export const METRIC_SLICE_ALIASES = Object.freeze({ census_weekly_by_community: CENSUS_DAILY, census_monthly_by_community: CENSUS_DAILY });
// SQL month of a row: daily census carries census_date, monthly views month_bucket.
const monthOf = slice => slice === CENSUS_DAILY ? "date_format(`census_date`, 'yyyy-MM')" : '`month_bucket`';
const EPISODE_EXCLUSIONS = 'Records failing the countability audit (non-clients, suspected test records) are excluded in v_tool_resident_episode_history; repeat stays count separately.';
export const ALLY_METRICS = Object.freeze({
  admissions: { slice: FLOW, measure: 'admissions', aggregation: 'sum', additivity: 'additive', unit: 'admission episodes', label: 'Admissions',
    dateBasis: 'admit_date month (month_bucket)', dimensions: ['community'], definition: `Admission episodes whose admit_date falls in the period. ${EPISODE_EXCLUSIONS}` },
  discharges: { slice: FLOW, measure: 'discharges', aggregation: 'sum', additivity: 'additive', unit: 'discharge episodes', label: 'Discharges',
    dateBasis: 'discharge_date month (month_bucket)', dimensions: ['community'], definition: `Episodes whose discharge_date falls in the period. ${EPISODE_EXCLUSIONS}` },
  net_change: { slice: FLOW, measure: 'net_change', aggregation: 'sum', additivity: 'additive', unit: 'episodes', label: 'Net change',
    dateBasis: 'month_bucket', dimensions: ['community'], definition: 'Admissions minus discharges in the period, from the same episode rows. Not a census.' },
  average_census: { slice: CENSUS_DAILY, measure: 'census', dateField: 'census_date', aggregation: 'average-of-dated-totals', additivity: 'non-additive across dates', unit: 'residents', label: 'Average daily census',
    dateBasis: 'census_date (every calendar day); month is the month of census_date', dimensions: ['community'],
    definition: `Mean of daily census over every day in the period. ${DAILY_CENSUS_DEFINITION} Communities are summed per day first, then averaged across days.` },
  month_end_census: { slice: CENSUS_DAILY, measure: 'census', dateField: 'census_date', aggregation: 'last', additivity: 'semi-additive: summed across communities, last day across months', unit: 'residents', label: 'Month-end census',
    dateBasis: 'census_date = last calendar day of the month', dimensions: ['community'],
    definition: `Daily census on the last day of the month; without a month grain, the last day of the period. ${DAILY_CENSUS_DEFINITION} Summed across communities for the same day. A missing day is null, not zero.` },
  incidents: { slice: INCIDENTS, measure: 'incident_count', aggregation: 'sum', additivity: 'additive', unit: 'incidents', label: 'Incidents',
    dateBasis: 'Incident_Date_parsed month (month_bucket)', dimensions: ['community', 'incident_category'],
    definition: 'Incidents with a parsed occurrence date, by occurrence month. Missing categories are grouped as Uncategorized. Counts incidents, not residents.' }
});
const METRIC_DIMENSIONS = { community: { column: 'CAST(`Facility` AS STRING)', key: 'facility_id', grantField: 'Facility' }, incident_category: { column: '`Incident_Category`', key: 'incident_category', grantField: 'Incident_Category' } };
const monthShift = (month, delta) => { const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1)); return date.toISOString().slice(0, 7); };
const monthEnd = month => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
const metricError = (code, field, allowed) => Object.assign(Error(code), { code: 'ally_metric_invalid', metricCode: code, field, ...(allowed ? { allowed } : {}) });
const literal = value => `'${String(value).replace(/[^A-Za-z0-9 _&.:/-]/g, '')}'`;

/** Validate a metric request. Returns the slices it reads and its grant probes. @param {any} request @param {{from:string,through:string}} scope @param {string[]} communities */
export function planAllyMetricQuery(request, scope, communities) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw metricError('query_invalid', 'query');
  const allowedKeys = ['metrics', 'dimensions', 'timeGrain', 'compare', 'filters', 'limit', 'from', 'through'];
  const extra = Object.keys(request).find(key => !allowedKeys.includes(key));
  if (extra) throw metricError('unknown_field', `query.${extra.replace(/[^A-Za-z0-9_]/g, '').slice(0, 60) || 'field'}`, allowedKeys);
  const ids = Object.keys(ALLY_METRICS);
  if (!Array.isArray(request.metrics) || !request.metrics.length || request.metrics.length > 6 || new Set(request.metrics).size !== request.metrics.length) throw metricError('metrics_invalid', 'query.metrics', ids);
  request.metrics.forEach((id, index) => { if (!Object.hasOwn(ALLY_METRICS, id)) throw metricError('unknown_metric', `query.metrics[${index}]`, ids); });
  const metrics = request.metrics.map(id => ({ id, ...ALLY_METRICS[id] }));
  const supported = Object.keys(METRIC_DIMENSIONS).filter(dimension => metrics.every(metric => metric.dimensions.includes(dimension)));
  const dimensions = request.dimensions ?? [];
  if (!Array.isArray(dimensions) || dimensions.length > 2 || new Set(dimensions).size !== dimensions.length) throw metricError('dimensions_invalid', 'query.dimensions', supported);
  dimensions.forEach((dimension, index) => { if (!supported.includes(dimension)) throw metricError('dimension_not_supported', `query.dimensions[${index}]`, supported); });
  const timeGrain = request.timeGrain ?? 'none';
  if (!['none', 'month'].includes(timeGrain)) throw metricError('time_grain_not_supported', 'query.timeGrain', ['none', 'month']);
  if (request.compare !== undefined && request.compare !== 'prior_period') throw metricError('compare_not_supported', 'query.compare', ['prior_period']);
  const limit = request.limit ?? 200;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw metricError('limit_invalid', 'query.limit');
  let selectedCommunities = communities; /** @type {string[]|null} */ let categories = null;
  const filters = request.filters ?? [];
  if (!Array.isArray(filters) || filters.length > 2) throw metricError('filters_invalid', 'query.filters', supported);
  filters.forEach((filter, index) => {
    if (!filter || typeof filter !== 'object' || Object.keys(filter).sort().join(',') !== 'dimension,op,values' || filter.op !== 'in') throw metricError('filter_invalid', `query.filters[${index}]`, ['dimension', 'op', 'values']);
    if (!supported.includes(filter.dimension)) throw metricError('dimension_not_supported', `query.filters[${index}].dimension`, supported);
    if (!Array.isArray(filter.values) || !filter.values.length || filter.values.length > 25 || filter.values.some(value => typeof value !== 'string' || !value.trim() || value.length > 80)) throw metricError('filter_values_invalid', `query.filters[${index}].values`);
    if (filter.dimension === 'community') {
      const outside = filter.values.findIndex(value => !communities.includes(value));
      if (outside >= 0) throw metricError('community_not_authorized', `query.filters[${index}].values[${outside}]`, communities);
      selectedCommunities = selectedCommunities.filter(id => filter.values.includes(id));
    } else categories = filter.values;
  });
  // Monthly views cannot establish partial months: default to the complete
  // months inside the authorized scope; explicit months must lie inside it.
  const firstComplete = scope.from.endsWith('-01') ? scope.from.slice(0, 7) : monthShift(scope.from.slice(0, 7), 1);
  const lastComplete = monthEnd(scope.through.slice(0, 7)) === scope.through ? scope.through.slice(0, 7) : monthShift(scope.through.slice(0, 7), -1);
  for (const key of ['from', 'through']) if (request[key] !== undefined && (typeof request[key] !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(request[key]))) throw metricError('month_invalid', `query.${key}`);
  const from = request.from ?? firstComplete, through = request.through ?? lastComplete;
  if (from < firstComplete || through > lastComplete || from > through) throw metricError('period_outside_scope', request.from !== undefined && from < firstComplete ? 'query.from' : 'query.through', [firstComplete, lastComplete].filter(month => /^20\d{2}-\d{2}$/.test(month)));
  const months = (Number(through.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(through.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
  const compare = request.compare === 'prior_period';
  const prior = compare ? { from: monthShift(from, -months), through: monthShift(from, -1) } : null;
  const slices = [...new Set(metrics.map(metric => metric.slice))];
  // Grant probes: a metric reads its slice exactly like an aggregate read of
  // these measures grouped by these fields; non-detail grants stay aggregate-only.
  const probes = slices.map(slice => {
    const sliceMetrics = metrics.filter(metric => metric.slice === slice);
    return { id: `metric-${slice}`.slice(0, 80), capability: 'platform-data', input: { slice, operation: 'sum', measure: sliceMetrics[0].measure,
      groupBy: [...dimensions.map(dimension => METRIC_DIMENSIONS[dimension].grantField), sliceMetrics[0].dateField ?? 'month_bucket'].slice(0, 3) } };
  });
  return { metrics, dimensions, timeGrain, compare, limit, communities: selectedCommunities, categories: /** @type {string[]|null} */ (categories), from, through, months, prior, slices, probes };
}

/** One statement for the whole request. @param {ReturnType<typeof planAllyMetricQuery>} plan */
export function compileAllyMetricQuery(plan) {
  if (!plan.communities.length) throw metricError('community_not_authorized', 'query.filters');
  const dims = plan.dimensions.map(dimension => METRIC_DIMENSIONS[dimension]);
  const dimSelect = dims.map(dim => `${dim.column} AS ${dim.key}`), dimKeys = dims.map(dim => dim.key);
  const windowStart = plan.prior?.from ?? plan.from;
  const bucketOf = (slice) => plan.timeGrain === 'month' ? monthOf(slice) : `CASE WHEN ${monthOf(slice)} >= ${literal(plan.from)} THEN 'current' ELSE 'prior' END`;
  const where = (slice) => [`CAST(\`Facility\` AS STRING) IN (${plan.communities.map(literal).join(', ')})`,
    `${monthOf(slice)} >= ${literal(windowStart)}`, `${monthOf(slice)} <= ${literal(plan.through)}`,
    ...(plan.categories && slice === INCIDENTS ? [`CAST(\`Incident_Category\` AS STRING) IN (${plan.categories.map(valueSql).join(', ')})`] : [])].join(' AND ');
  const group = [...dimKeys, 'bucket'].join(', ');
  const ctes = [];
  plan.slices.forEach((slice, index) => {
    const name = `s${index}`, sliceMetrics = plan.metrics.filter(metric => metric.slice === slice), bucket = bucketOf(slice);
    const head = [...dimSelect, `${bucket} AS bucket`];
    for (const metric of sliceMetrics) {
      if (metric.aggregation === 'sum') continue;
      const value = `try_cast(\`${metric.measure}\` AS DOUBLE)`;
      if (metric.aggregation === 'average-of-dated-totals') {
        // Sum communities per observation date, then average dates.
        ctes.push(`${name}_${metric.id}_dated AS (SELECT ${[...head, `\`${metric.dateField}\` AS observed`, `SUM(${value}) AS total`].join(', ')} FROM alamohealth.gold.v_tool_${slice} WHERE ${where(slice)} GROUP BY ${[...dims.map(dim => dim.column), bucket, `\`${metric.dateField}\``].join(', ')})`,
          `${name}_${metric.id} AS (SELECT ${[...dimKeys, 'bucket', `AVG(total) AS m_${metric.id}`].join(', ')} FROM ${name}_${metric.id}_dated GROUP BY ${group})`);
      } else if (metric.aggregation === 'last') {
        // Daily census: the observation on the last calendar day of the month.
        const observed = metric.dateField ? `CAST(\`${metric.dateField}\` AS DATE)` : '`month_bucket`';
        const last = metric.dateField
          ? plan.timeGrain === 'month' ? 'last_day(observed)' : `CASE WHEN bucket = 'current' THEN DATE ${literal(monthEnd(plan.through))} ELSE DATE ${literal(monthEnd(plan.prior?.through ?? plan.through))} END`
          : plan.timeGrain === 'month' ? 'bucket' : `CASE WHEN bucket = 'current' THEN ${literal(plan.through)} ELSE ${literal(plan.prior?.through ?? plan.through)} END`;
        ctes.push(`${name}_${metric.id}_months AS (SELECT ${[...head, `${observed} AS observed`, `SUM(${value}) AS total`].join(', ')} FROM alamohealth.gold.v_tool_${slice} WHERE ${where(slice)} GROUP BY ${[...dims.map(dim => dim.column), bucket, observed].join(', ')})`,
          `${name}_${metric.id} AS (SELECT ${[...dimKeys, 'bucket', `SUM(total) AS m_${metric.id}`].join(', ')} FROM ${name}_${metric.id}_months WHERE observed = ${last} GROUP BY ${group})`);
      }
    }
    const sums = sliceMetrics.filter(metric => metric.aggregation === 'sum');
    if (sums.length) ctes.push(`${name}_sum AS (SELECT ${[...head, ...sums.map(metric => `SUM(try_cast(\`${metric.measure}\` AS DOUBLE)) AS m_${metric.id}`)].join(', ')} FROM alamohealth.gold.v_tool_${slice} WHERE ${where(slice)} GROUP BY ${[...dims.map(dim => dim.column), bucket].join(', ')})`);
  });
  const sourceOf = metric => { const index = plan.slices.indexOf(metric.slice); return metric.aggregation === 'sum' ? `s${index}_sum` : `s${index}_${metric.id}`; };
  const relations = [...new Set(plan.metrics.map(sourceOf))];
  ctes.push(`keys AS (${relations.map(relation => `SELECT ${group} FROM ${relation}`).join(' UNION ')})`);
  const on = (alias, bucketExpr) => [...dimKeys.map(key => `${alias}.${key} <=> k.${key}`), `${alias}.bucket = ${bucketExpr}`].join(' AND ');
  const priorBucket = plan.timeGrain === 'month' ? `date_format(add_months(to_date(concat(k.bucket, '-01')), -${plan.months}), 'yyyy-MM')` : `'prior'`;
  const joins = relations.map((relation, i) => `LEFT JOIN ${relation} c${i} ON ${on(`c${i}`, 'k.bucket')}` + (plan.compare ? ` LEFT JOIN ${relation} p${i} ON ${on(`p${i}`, priorBucket)}` : '')).join(' ');
  const select = [...dimKeys.map(key => `k.${key}`), 'k.bucket AS period', ...plan.metrics.flatMap(metric => {
    const i = relations.indexOf(sourceOf(metric));
    return [`c${i}.m_${metric.id} AS ${metric.id}`, ...(plan.compare ? [`p${i}.m_${metric.id} AS ${metric.id}__prior`] : [])];
  })];
  const current = plan.timeGrain === 'month' ? `k.bucket >= ${literal(plan.from)}` : `k.bucket = 'current'`;
  return `WITH ${ctes.join(', ')} SELECT ${select.join(', ')} FROM keys k ${joins} WHERE ${current} ORDER BY ${[...dimKeys.map(key => `k.${key}`), 'k.bucket'].join(', ')} LIMIT ${plan.limit + 1}`;
}

/** Episode spine for derived daily census. @param {ReturnType<typeof planAllyMetricQuery>} plan */
export function compileCensusEpisodeQuery(plan) {
  if (!plan.communities.length) throw metricError('community_not_authorized', 'query.filters');
  const first = `${plan.prior?.from ?? plan.from}-01`, last = monthEnd(plan.through);
  return 'SELECT CAST(`Facility` AS STRING) AS facility_id, CAST(`admit_date` AS STRING) AS admit_date, CAST(`discharge_date` AS STRING) AS discharge_date ' +
    `FROM alamohealth.gold.v_tool_resident_episode_history WHERE CAST(\`Facility\` AS STRING) IN (${plan.communities.map(literal).join(', ')}) ` +
    `AND \`admit_date\` IS NOT NULL AND CAST(\`admit_date\` AS DATE) <= DATE ${literal(last)} AND (\`discharge_date\` IS NULL OR CAST(\`discharge_date\` AS DATE) >= DATE ${literal(first)})`;
}

/**
 * Daily census metrics from episode rows, in the same row shape as the SQL
 * result (facility_id?, period, metric, metric__prior).
 * @param {ReturnType<typeof planAllyMetricQuery>} plan @param {Array<{id:string,aggregation:string}>} metrics @param {Array<Record<string, unknown>>} rows
 */
export function deriveCensusMetricRows(plan, metrics, rows) {
  const episodes = censusEpisodes(rows).filter(row => plan.communities.includes(row.facilityId));
  const groups = plan.dimensions.includes('community') ? plan.communities.map(id => ({ facility_id: id, episodes: episodes.filter(row => row.facilityId === id) })) : [{ facility_id: undefined, episodes }];
  const months = [];
  for (let month = plan.from; month <= plan.through; month = monthShift(month, 1)) months.push(month);
  /** @param {string} from @param {string} through */
  const range = (from, through) => ({ start: /** @type {number} */ (censusDay(`${from}-01`)), end: /** @type {number} */ (censusDay(monthEnd(through))) });
  /** @param {typeof episodes} own @param {string} from @param {string} through @param {string} aggregation */
  const value = (own, from, through, aggregation) => {
    const { start, end } = range(from, through);
    return aggregation === 'last' ? censusOnDay(own, end) : averageDailyCensus(own, start, end);
  };
  const buckets = plan.timeGrain === 'month'
    ? months.map(month => ({ period: month, from: month, through: month, priorFrom: monthShift(month, -plan.months), priorThrough: monthShift(month, -plan.months) }))
    : [{ period: 'current', from: plan.from, through: plan.through, priorFrom: plan.prior?.from, priorThrough: plan.prior?.through }];
  return groups.flatMap(group => buckets.map(bucket => ({ ...(group.facility_id === undefined ? {} : { facility_id: group.facility_id }), period: bucket.period,
    ...Object.fromEntries(metrics.flatMap(metric => [[metric.id, value(group.episodes, bucket.from, bucket.through, metric.aggregation)],
      ...(plan.compare && bucket.priorFrom && bucket.priorThrough ? [[`${metric.id}__prior`, value(group.episodes, bucket.priorFrom, bucket.priorThrough, metric.aggregation)]] : [])])) })));
}

/** @param {Array<Record<string, any>>} sqlRows @param {Array<Record<string, any>>} derived @param {ReturnType<typeof planAllyMetricQuery>} plan */
function mergeMetricRows(sqlRows, derived, plan) {
  const key = (/** @type {Record<string, any>} */ row) => `${row.facility_id ?? ''}|${row.incident_category ?? ''}|${row.period}`;
  const merged = new Map(sqlRows.map(row => [key(row), { ...row }]));
  for (const row of derived) merged.set(key(row), { ...(merged.get(key(row)) ?? {}), ...row });
  return [...merged.values()].sort((a, b) => String(a.facility_id ?? '').localeCompare(String(b.facility_id ?? '')) || String(a.period).localeCompare(String(b.period))).slice(0, plan.limit + 1);
}

/** @param {ReturnType<typeof planAllyMetricQuery>} plan @param {{load?:Function,execute?:Function}} [options] */
export async function readAllyMetrics(plan, { load = async () => (await readPlatformSnapshot({ tableNames: [] }))?.reportsSummary ?? getReportsSummaryData(), execute = queryDatabricks } = {}) {
  const sources = listAllyPlatformDataSources(await load());
  /** @type {Array<{slice:string,generatedAt:any,asOfDate:any,maxPeriod:any,derivedFrom?:string}>} */
  const freshness = plan.slices.map(slice => { const source = sources.find(item => item.id === slice);
    return { slice, generatedAt: source?.generatedAt ?? null, asOfDate: source?.asOfDate ?? null, maxPeriod: source?.maxPeriod ?? null }; });
  // Until v_tool_census_daily_by_community is published, daily census metrics
  // are derived from governed episode history with the shared day rule.
  const derivedCensus = sources.some(item => item.id === CENSUS_DAILY) ? [] : plan.metrics.filter(metric => metric.slice === CENSUS_DAILY);
  const sqlPlan = derivedCensus.length ? { ...plan, metrics: plan.metrics.filter(metric => metric.slice !== CENSUS_DAILY), slices: plan.slices.filter(slice => slice !== CENSUS_DAILY) } : plan;
  let rows = sqlPlan.metrics.length ? await execute(compileAllyMetricQuery(sqlPlan), { cacheRevision: reportHash(freshness) }) : [];
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object')) throw Error('Invalid metric result.');
  if (derivedCensus.length) {
    const episodes = await execute(compileCensusEpisodeQuery(plan), { cacheRevision: reportHash(freshness) });
    if (!Array.isArray(episodes) || episodes.some(row => !row || typeof row !== 'object')) throw Error('Invalid metric result.');
    rows = mergeMetricRows(rows, deriveCensusMetricRows(plan, derivedCensus, episodes), plan);
    const daily = freshness.find(item => item.slice === CENSUS_DAILY);
    if (daily) daily.derivedFrom = 'resident_episode_history';
  }
  const hasMore = rows.length > plan.limit;
  const number = value => value === null || value === undefined || String(value).trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : (() => { throw Error('Invalid metric result.'); })();
  const periodLabel = plan.timeGrain === 'month' ? null : `${plan.from}–${plan.through}`;
  const output = rows.slice(0, plan.limit).map(row => {
    const facility = row.facility_id === undefined ? null : ALAMO_FACILITIES.find(item => item.facilityId === String(row.facility_id));
    if (row.facility_id !== undefined && (!facility || !plan.communities.includes(facility.facilityId))) throw Error('Metric community scope could not be verified.');
    return { ...(plan.dimensions.includes('community') ? { community: facility?.shortName ?? null, facility_id: facility?.facilityId ?? null } : {}),
      ...(plan.dimensions.includes('incident_category') ? { incident_category: row.incident_category ?? null } : {}),
      period: periodLabel ?? row.period,
      ...Object.fromEntries(plan.metrics.flatMap(metric => {
        const value = number(row[metric.id]); const prior = plan.compare ? number(row[`${metric.id}__prior`]) : undefined;
        return [[metric.id, value], ...(plan.compare ? [[`${metric.id}__prior`, prior], [`${metric.id}__change`, value === null || prior === null || prior === undefined ? null : value - prior]] : [])];
      })) };
  });
  const columns = [...(plan.dimensions.includes('community') ? [{ key: 'community', type: 'string' }, { key: 'facility_id', type: 'string' }] : []),
    ...(plan.dimensions.includes('incident_category') ? [{ key: 'incident_category', type: 'string' }] : []), { key: 'period', type: 'string' },
    ...plan.metrics.flatMap(metric => [{ key: metric.id, type: 'number', metric: metric.id }, ...(plan.compare ? [{ key: `${metric.id}__prior`, type: 'number', metric: metric.id }, { key: `${metric.id}__change`, type: 'number', metric: metric.id }] : [])])];
  const notes = freshness.filter(item => typeof item.maxPeriod === 'string' && item.maxPeriod.slice(0, 7) < plan.through).map(item => `${item.slice} is published through ${String(item.maxPeriod).slice(0, 7)}; later months are unavailable, not zero.`);
  if (derivedCensus.length) notes.push(`${derivedCensus.map(metric => metric.id).join(' and ')} computed from governed admission episodes with the canonical daily census rule; ${CENSUS_DAILY} is not yet published.`);
  return { version: 'ally-metrics-v1',
    metrics: plan.metrics.map(({ id, label, definition, aggregation, additivity, unit, dateBasis, slice }) => ({ id, label, definition, aggregation, additivity, unit, dateBasis, source: slice })),
    dimensions: plan.dimensions, timeGrain: plan.timeGrain, compare: plan.compare ? 'prior_period' : null,
    period: { from: plan.from, through: plan.through, ...(plan.prior ? { priorFrom: plan.prior.from, priorThrough: plan.prior.through, priorOffsetMonths: plan.months,
      compareBasis: 'Each value is compared with the value the same number of months earlier, where that number is the length of the selected period (equal-length immediately preceding window).' } : {}) },
    columns, rows: output, hasMore, returnedRows: output.length, coverage: notes.length || hasMore ? 'partial' : 'complete', notes, freshness };
}
