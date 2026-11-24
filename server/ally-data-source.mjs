import { normalizeKnownCommunityNames } from "../shared/community-names.mjs";
import { ANALYSIS_SLICE_CATALOG } from "../shared/analysis-slice-catalog.mjs";
import { getReportsSummaryData } from "./platform-data.mjs";
import { queryDatabricks } from "./databricks.mjs";

// These are the governed view names published by tool_context_views.py. A
// snapshot manifest may describe fields and coverage, but cannot register a
// new SQL target for Ally.
const EXTRA_SLICES = [
  "incident_detail_current_month", "resident_profile",
  "current_resident_county_by_community", "mar_daily_by_community_90d", "mar_monthly_by_community_medication"
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
    sourceRows: entry.row_count, snapshotRows: Array.isArray(tables[entry.slice_name]) ? tables[entry.slice_name].length : null,
    minPeriod: entry.min_period ?? null, maxPeriod: entry.max_period ?? null,
    facilityIds: entry.facility_ids ?? [], generatedAt: entry.generated_at ?? null
  }));
}

function validateQuery(query, source) {
  if (!query || typeof query !== "object" || Array.isArray(query) || !source || !ALLOWED_SLICES.has(source.id) ||
    !Array.isArray(source.fields) || source.fields.some(field => !FIELD.test(field))) throw Error("Choose a listed Platform source.");
  const fields = new Set(source.fields);
  const filters = Array.isArray(query.filters) ? query.filters : [];
  if (filters.length > MAX_FILTERS || filters.some(filter => !filter || !fields.has(filter.field) ||
    !["eq", "gte", "lte", "contains", "number-gte", "number-lte"].includes(filter.op) ||
    (filter.op.startsWith('number-') && !Number.isFinite(Number(filter.value))) ||
    (["gte", "lte"].includes(filter.op) && !/(?:date|month|week|time|period)/i.test(filter.field)) ||
    typeof filter.value !== "string" || !filter.value.trim() || filter.value.length > 200)) throw Error("Choose valid bounded source filters.");
  const groupBy = Array.isArray(query.groupBy) ? query.groupBy : [];
  if (groupBy.length > MAX_GROUPS || new Set(groupBy).size !== groupBy.length || groupBy.some(field => !fields.has(field))) throw Error("Choose listed grouping fields.");
  const operation = query.operation ?? "rows";
  if (!["rows", "count", "sum", "average", "minimum", "maximum", "median", "distinct", "statistics"].includes(operation) || operation === "rows" && groupBy.length ||
    ["sum", "average", "minimum", "maximum", "median", "distinct", "statistics"].includes(operation) && !fields.has(query.measure) ||
    ["rows", "count"].includes(operation) && query.measure) throw Error("Choose a supported source operation.");
  const columns = query.columns ?? source.fields;
  if (!Array.isArray(columns) || !columns.length || (operation === 'rows' && columns.length > 40) || new Set(columns).size !== columns.length || columns.some(field => !fields.has(field)) || query.columns !== undefined && operation !== 'rows') throw Error('Choose listed result columns.');
  const orderBy = query.orderBy ?? [];
  const resultFields = operation === 'rows' ? columns : [...groupBy, ...aggregateFields(operation)];
  if (!Array.isArray(orderBy) || orderBy.length > 3 || orderBy.some(order => !order || !resultFields.includes(order.field) || !['asc','desc'].includes(order.direction))) throw Error('Choose valid result ordering.');
  const limit = Number(query.limit ?? 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROWS) throw Error("Choose a row limit from 1 to 100.");
  return { source, filters, groupBy, operation, measure: query.measure ?? null, columns, orderBy, limit };
}

function quotedField(field) { return `\`${field}\``; }
function valueSql(value) { return `CAST(unbase64('${Buffer.from(value, "utf8").toString("base64")}') AS STRING)`; }

/** @param {any} query @param {any} source @param {Array<{field:string,op:string,value:any}>} [constraints] */
export function compileAllyPlatformDataQuery(query, source, constraints = []) {
  const input = validateQuery(query, source);
  if (!Array.isArray(constraints) || constraints.length > 3 || constraints.some(c => !source.fields.includes(c.field) ||
      !['in', 'gte', 'lte', 'day-gte', 'day-lte'].includes(c.op) || (c.op === 'in' ? !Array.isArray(c.value) || !c.value.length || c.value.length > 25 || c.value.some(v => typeof v !== 'string' || v.length > 80) : typeof c.value !== 'string' || c.value.length > 80))) throw Error('Invalid enforced source scope.');
  input.filters = [...input.filters, ...constraints];
  const where = input.filters.map(({ field, op, value }) => {
    const column = `CAST(${quotedField(field)} AS STRING)`;
    if (op === 'in') return `${column} IN (${value.map(valueSql).join(', ')})`;
    const literal = valueSql(value.trim());
    if(op.startsWith('number-'))return `try_cast(${quotedField(field)} AS DOUBLE) ${op==='number-gte'?'>=':'<='} ${Number(value)}`;
    if (op.startsWith('day-')) return `substring(${column}, 1, 10) ${op === 'day-gte' ? '>=' : '<='} ${literal}`;
    if (op === "contains") return `contains(lower(${column}), lower(${literal}))`;
    return `${column} ${op === "eq" ? "=" : op === "gte" ? ">=" : "<="} ${literal}`;
  });
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
  const sql = `SELECT ${projection} FROM alamohealth.gold.v_tool_${input.source.id}` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    (groupColumns.length ? ` GROUP BY ${groupColumns.join(", ")}` : "") +
    (input.orderBy.length ? ` ORDER BY ${input.orderBy.map(order => `${quotedField(order.field)} ${order.direction.toUpperCase()} NULLS LAST`).join(', ')}` : '') +
    ` LIMIT ${input.limit + 1}`;
  return { sql, ...input };
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
  const required = new Set([...input.filters.map(filter => filter.field), ...input.groupBy, ...(input.measure ? [input.measure] : []), ...(input.operation==='rows'?input.columns:[])]);
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
      if (key && required.has(field) && normalized && NULL_TO_ZERO_FIELDS.has(field) && row[key] === 0) {
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

/** @param {any} query @param {{load?:Function,execute?:Function,constraints?:Array<{field:string,op:string,value:any}>,allowedFields?:string[]}} [options] */
export async function readAllyPlatformData(query, { load = getReportsSummaryData, execute = queryDatabricks, constraints = [], allowedFields } = {}) {
  const reportsSummary = await load();
  let source = listAllyPlatformDataSources(reportsSummary).find(item => item.id === query?.slice);
  // Source-owned authorization narrows the manifest before query compilation.
  // Both SQL and fallback rows use this same projection; new columns fail closed.
  if (allowedFields !== undefined) {
    if (!source || !Array.isArray(allowedFields) || !allowedFields.length || new Set(allowedFields).size !== allowedFields.length || allowedFields.some(field => !source.fields.includes(field))) throw Error('Invalid authorized source fields.');
    source = { ...source, fields: source.fields.filter(field => allowedFields.includes(field)) };
  }
  const input = compileAllyPlatformDataQuery(query, source, constraints);
  let rows; let readMode = "governed-view"; let coverage = "source-query";
  const snapshotRows = reportsSummary.toolContext?.tables?.[input.source.id];
  const fromSnapshot=()=>{
    if (!Array.isArray(snapshotRows)) throw Error("The governed source is unavailable and no published rows exist for this slice.");
    if (snapshotRows.length < input.source.sourceRows && input.operation !== 'rows') throw Error('An incomplete published sample cannot establish an aggregate.');
    const filtered = snapshotFilter(snapshotQueryRows(snapshotRows, input), input.filters);
    return orderRows(input.operation === "rows" ? filtered : snapshotAggregate(filtered, input), input.orderBy).slice(0,input.limit+1);
  };
  // Complete published data is already the versioned source used by Platform.
  // Never pay a warehouse round trip (or its failing permission check) for it.
  if(Array.isArray(snapshotRows) && snapshotRows.length===input.source.sourceRows && Number.isFinite(Date.parse(input.source.generatedAt))) {
    try { rows=fromSnapshot();readMode='published-snapshot';coverage='published-row-set'; }
    catch { /* A missing/conflicting required column needs the full view. */ }
  }
  if(rows===undefined) try {
    rows = await execute(input.sql);
    if (!Array.isArray(rows)) throw Error("Invalid source result.");
  } catch {
    rows=fromSnapshot();
    readMode = "published-snapshot";
    coverage = snapshotRows.length < input.source.sourceRows ? `partial: ${snapshotRows.length} of ${input.source.sourceRows} source rows published` : "published-row-set";
  }
  const hasMore = rows.length > input.limit;
  const fields = input.operation === 'rows' ? input.columns : [...input.groupBy, ...aggregateFields(input.operation)];
  const returned = (hasMore ? rows.slice(0, input.limit) : rows).map(row => Object.fromEntries(fields.map(field => [field, row[field] ?? null])));
  if (Buffer.byteLength(JSON.stringify(returned), "utf8") > MAX_RESULT_BYTES) throw Object.assign(Error("The result is too large; narrow the filters or row limit."),{code:'analyst_result_too_large'});
  return { version: "ally-platform-data-v1", source: input.source, readMode, coverage,
    query: { slice: input.source.id, filters: input.filters, operation: input.operation, groupBy: input.groupBy, measure: input.measure, columns:input.columns, orderBy:input.orderBy, limit: input.limit },
    rows: returned, hasMore, returnedRows: returned.length };
}
