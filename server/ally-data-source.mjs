import { ANALYSIS_SLICE_CATALOG } from "../shared/analysis-slice-catalog.mjs";
import { getReportsSummaryData } from "./platform-data.mjs";
import { queryDatabricks } from "./databricks.mjs";

// These are the governed view names published by tool_context_views.py. A
// snapshot manifest may describe fields and coverage, but cannot register a
// new SQL target for Ally.
const EXTRA_SLICES = [
  "incident_detail_current_month", "resident_profile",
  "current_resident_county_by_community", "mar_daily_by_community_90d"
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
    !["eq", "gte", "lte", "contains"].includes(filter.op) ||
    (["gte", "lte"].includes(filter.op) && !/(?:date|month|week|time|period)/i.test(filter.field)) ||
    typeof filter.value !== "string" || !filter.value.trim() || filter.value.length > 200)) throw Error("Choose valid bounded source filters.");
  const groupBy = Array.isArray(query.groupBy) ? query.groupBy : [];
  if (groupBy.length > MAX_GROUPS || new Set(groupBy).size !== groupBy.length || groupBy.some(field => !fields.has(field))) throw Error("Choose listed grouping fields.");
  const operation = query.operation ?? "rows";
  if (!["rows", "count", "sum", "average"].includes(operation) || operation === "rows" && groupBy.length ||
    ["sum", "average"].includes(operation) && !fields.has(query.measure) ||
    ["rows", "count"].includes(operation) && query.measure) throw Error("Choose a supported source operation.");
  const limit = Number(query.limit ?? 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROWS) throw Error("Choose a row limit from 1 to 100.");
  return { source, filters, groupBy, operation, measure: query.measure ?? null, limit };
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
    if (op.startsWith('day-')) return `substring(${column}, 1, 10) ${op === 'day-gte' ? '>=' : '<='} ${literal}`;
    if (op === "contains") return `contains(lower(${column}), lower(${literal}))`;
    return `${column} ${op === "eq" ? "=" : op === "gte" ? ">=" : "<="} ${literal}`;
  });
  const groupColumns = input.groupBy.map(quotedField);
  const metric = input.operation === "count" ? "COUNT(*) AS result"
    : input.operation === "sum" ? `SUM(try_cast(${quotedField(input.measure)} AS DOUBLE)) AS result`
      : input.operation === "average" ? `AVG(try_cast(${quotedField(input.measure)} AS DOUBLE)) AS result` : input.source.fields.map(quotedField).join(', ');
  const projection = input.operation === "rows" ? metric : [...groupColumns, metric].join(", ");
  const sql = `SELECT ${projection} FROM alamohealth.gold.v_tool_${input.source.id}` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    (groupColumns.length ? ` GROUP BY ${groupColumns.join(", ")}` : "") +
    ` LIMIT ${input.limit + 1}`;
  return { sql, ...input };
}

// snapshot_publish.py preserves the governed measures but normalizes these
// dimensions. Translate back to the manifest/query contract before applying
// scope, filters or grouping. Never guess aliases from a field's spelling.
const PUBLISHED_FIELD_NAMES = Object.freeze({ Facility: 'facility_id', Facility_Name: 'facility_name', Incident_Category: 'category' });
function snapshotQueryRows(rows, input) {
  const required = new Set([...input.filters.map(filter => filter.field), ...input.groupBy, ...(input.measure ? [input.measure] : [])]);
  return rows.map(row => {
    const projected = Object.fromEntries(input.source.fields.map(field => {
      const alias = PUBLISHED_FIELD_NAMES[field];
      if (alias && Object.hasOwn(row, field) && Object.hasOwn(row, alias) && String(row[field]) !== String(row[alias])) {
        throw Error('Published source dimensions conflict.');
      }
      const key = Object.hasOwn(row, field) ? field : alias && Object.hasOwn(row, alias) ? alias : null;
      if (!key && required.has(field)) throw Error('The published source lacks a required query field.');
      return [field, key ? row[key] : null];
    }));
    return projected;
  });
}

function snapshotFilter(rows, filters) {
  return rows.filter(row => filters.every(({ field, op, value }) => {
    const actual = String(row[field] ?? "");
    if (op.startsWith('day-')) return /^\d{4}-\d{2}-\d{2}/.test(actual) && (op === 'day-gte' ? actual.slice(0, 10) >= value : actual.slice(0, 10) <= value);
    if (op === 'in') return value.includes(actual);
    if (op === "contains") return actual.toLowerCase().includes(value.trim().toLowerCase());
    if (op === "eq") return actual === value.trim();
    return op === "gte" ? actual >= value.trim() : actual <= value.trim();
  }));
}

function snapshotAggregate(rows, { operation, measure, groupBy, limit }) {
  const groups = new Map();
  for (const row of rows) {
    const values = groupBy.map(field => row[field] ?? null);
    const key = JSON.stringify(values);
    const current = groups.get(key) ?? { values, count: 0, total: 0, numericCount: 0 };
    current.count++;
    const raw = row[measure];
    const number = raw === null || raw === undefined || String(raw).trim() === '' ? NaN : Number(raw);
    if (measure && Number.isFinite(number)) { current.total += number; current.numericCount++; }
    groups.set(key, current);
  }
  if (!groups.size && !groupBy.length) groups.set("[]", { values: [], count: 0, total: 0, numericCount: 0 });
  return [...groups.values()].slice(0, limit + 1).map(group => ({
    ...Object.fromEntries(groupBy.map((field, index) => [field, group.values[index]])),
    result: operation === "count" ? group.count : !group.numericCount ? null : operation === "sum" ? group.total : group.total / group.numericCount
  }));
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
  try {
    rows = await execute(input.sql);
    if (!Array.isArray(rows)) throw Error("Invalid source result.");
  } catch {
    const snapshotRows = reportsSummary.toolContext?.tables?.[input.source.id];
    if (!Array.isArray(snapshotRows)) throw Error("The governed source is unavailable and no published rows exist for this slice.");
    readMode = "published-snapshot";
    coverage = snapshotRows.length < input.source.sourceRows ? `partial: ${snapshotRows.length} of ${input.source.sourceRows} source rows published` : "published-row-set";
    const filtered = snapshotFilter(snapshotQueryRows(snapshotRows, input), input.filters);
    rows = input.operation === "rows" ? filtered.slice(0, input.limit + 1) : snapshotAggregate(filtered, input);
  }
  const hasMore = rows.length > input.limit;
  const fields = input.operation === 'rows' ? input.source.fields : [...input.groupBy, 'result'];
  const returned = (hasMore ? rows.slice(0, input.limit) : rows).map(row => Object.fromEntries(fields.map(field => [field, row[field] ?? null])));
  if (Buffer.byteLength(JSON.stringify(returned), "utf8") > MAX_RESULT_BYTES) throw Error("The result is too large; narrow the filters or row limit.");
  return { version: "ally-platform-data-v1", source: input.source, readMode, coverage,
    query: { slice: input.source.id, filters: input.filters, operation: input.operation, groupBy: input.groupBy, measure: input.measure, limit: input.limit },
    rows: returned, hasMore, returnedRows: returned.length };
}
