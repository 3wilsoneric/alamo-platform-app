import { reportHash, reportObject, reportText } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { ALAMO_FACILITIES } from '../shared/community-names.mjs';
import { ANALYSIS_SLICE_CATALOG } from '../shared/analysis-slice-catalog.mjs';
import { readPlatformSnapshot } from './platform-snapshot.mjs';
import { getReportsSummaryData } from './platform-data.mjs';
import { buildResidentFlowReport } from './resident-flow-report.mjs';
import { listAllyPlatformDataSources, readAllyPlatformData } from './ally-data-source.mjs';
import { getPipelineAdmissionsSummary } from './pipeline-admissions-summary.mjs';
import { facilityIdForPipelineCommunity } from './admissions-dashboard.mjs';
import { getLicensingLibrary } from './licensing-library.mjs';
import { createWorkflowKnowledgeSource } from './workflow-knowledge-source.mjs';
import { reportAggregateFields, reportNumericField } from './ally-report-source-grants.mjs';

const objectSchema = properties => ({ type: 'object', properties, additionalProperties: false });
const string = { type: 'string' }, strings = { type: 'array', items: string, maxItems: 3 };
const schemas = {
  'platform-data': objectSchema({ slice: string, operation: { enum: ['rows', 'count', 'sum', 'average'] }, groupBy: strings, measure: string,
    dateField: { type: ['string', 'null'] }, limit: { type: 'integer', minimum: 1, maximum: 100 },
    filters: { type: 'array', maxItems: 6, items: objectSchema({ field: string, op: { enum: ['eq', 'gte', 'lte', 'contains'] }, value: string }) } }),
  'resident-flow': objectSchema({}), 'pipeline-summary': objectSchema({}),
  'licensing-search': objectSchema({ query: string, type: { enum: ['Complaint', 'Inspection', 'Other'] } }),
  'proforma-search': objectSchema({ query: string })
};
const metadata = {
  'platform-data': ['Governed Platform data', 'Query published source grains. Counts count rows, not necessarily unique clients. Dates and communities are enforced. Never sum census across dates.'],
  'resident-flow': ['Admissions, discharges and bed use', 'Reconciled admission episodes, discharges, opening/closing census, occupied bed-days and completed-stay durations in the exact selected period. Repeat stays count separately.'],
  'pipeline-summary': ['Current referral pipeline', 'Current published referral stages and decisions. This is a current snapshot, not all referral event history.'],
  'licensing-search': ['State licensing reports', 'Dated inspection and complaint metadata for selected communities. Separate from internal incidents.'],
  'proforma-search': ['ProForma procedures', 'Source-linked draft procedure excerpts. Draft references are not approved policy.']
};
const definition = id => ANALYSIS_SLICE_CATALOG.find(s => s.id === id);
const facilityField = fields => ['facility_id', 'Facility', 'facility', 'FacilityID'].find(f => fields.includes(f));
function scopedDataset(title, rows, columns, shape = 'records') { return { title, shape, columns, rows }; }
function numericCell(value) {
  if (value === undefined || value === null) return null;
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '' || !Number.isFinite(Number(value))) throw Error('The published measure is not a valid number.');
  return Number(value);
}
function platformDataset(title, rows, columns, time) {
  const dataset = scopedDataset(title, rows, columns);
  if (!rows.length || !columns.some(column => column.type === 'number')) return dataset;
  const dimensions = columns.filter(column => column.type === 'string');
  const constant = key => rows.every(row => row[key] === rows[0][key]);
  const uniqueLabels = key => rows.every(row => typeof row[key] === 'string' && row[key].trim()) && new Set(rows.map(row => row[key])).size === rows.length;
  const dates = dimensions.filter(column => /(?:date|month|week|time|period)/i.test(column.key));
  const communities = ['community', 'community_name', 'Facility_Name', 'facility_name'];
  const facilityIds = ['facility_id', 'Facility', 'facility', 'FacilityID'];
  // A chart has one unambiguous dimension. Preserve the full table, and never
  // combine dates, duplicate categories, or differently scoped observations.
  const label = dimensions.find(column => !dates.includes(column) && !facilityIds.includes(column.key) &&
    reportAggregateFields([column.key]).length && uniqueLabels(column.key) &&
    dates.every(date => constant(date.key) && rows[0][date.key] != null) &&
    dimensions.every(other => other.key === column.key || constant(other.key) ||
      communities.includes(column.key) && (communities.includes(other.key) || facilityIds.includes(other.key))));
  const date = dimensions.find(column => column.key === time && uniqueLabels(column.key) &&
    rows.every(row => /^\d{4}-\d{2}(?:-\d{2})?$/.test(row[column.key]) && Number.isFinite(Date.parse(row[column.key]))) &&
    dimensions.every(other => other === column || constant(other.key)));
  const axis = label ?? date;
  if (axis) {
    dataset.shape = label ? 'categories' : 'series';
    dataset.columns = [axis, ...columns.filter(column => column !== axis)];
  }
  return dataset;
}

export function createPlatformReportSources({ snapshot = readPlatformSnapshot, summary = getReportsSummaryData, data = readAllyPlatformData,
  pipeline = getPipelineAdmissionsSummary, licensing = getLicensingLibrary, knowledge = createWorkflowKnowledgeSource(), now = Date.now } = {}) {
  async function catalog(authorization) {
    const sources = listAllyPlatformDataSources(await summary()).filter(s => authorization.grant.slices.includes(s.id) && facilityField(s.fields))
      .map(s => ({ ...s, fields: authorization.grant.detail ? s.fields : reportAggregateFields(s.fields) }));
    return authorization.grant.capabilities.map(id => ({ id, title: metadata[id][0], description: metadata[id][1], inputSchema: schemas[id],
      ...(id === 'platform-data' ? { sources: sources.map(s => ({ ...s, definition: definition(s.id)?.title, dateFields: s.fields.filter(f => /(?:date|month|week|period|time)/i.test(f)), detailAllowed: authorization.grant.detail })) } : {}) }));
  }
  async function read(input, authorization) {
    const { step, scope } = input, args = step.input;
    const base = { capability: step.capability, inputHash: reportHash(args), scope, grantRevision: authorization.receipt.revision,
      requiresDetail: step.capability === 'platform-data' && authorization.grant.detail,
      observedAt: new Date(now()).toISOString(), period: `${scope.from}–${scope.through}`, grain: 'source observation',
      status: 'verified', coverage: 'complete', title: metadata[step.capability][0], note: '', answer: '', revision: '' };
    let result, dataset;
    if (step.capability === 'resident-flow') {
      reportObject(args, []);
      const flow = buildResidentFlowReport(await snapshot(), null, scope.from.slice(0, 4), scope);
      const sites = flow.sites.filter(s => authorization.communities.includes(s.facilityId));
      result = { period: flow.period, sites, ...(authorization.communities.length === ALAMO_FACILITIES.length ? { totals: flow.totals, counties: flow.counties } : {}),
        definitions: { admissions: 'Admission episodes starting in this period; repeat admissions count separately.', discharges: 'Stay endings in this period.', bedDays: 'Admission day included; discharge day excluded.', averageCompletedStayDays: 'Total duration of stays that ended in this period, not ongoing residents.' } };
      base.observedAt = flow.snapshot.generatedAt; base.period = `${flow.period.start}–${flow.period.through}`; base.grain = 'community admission episodes';
      base.note = flow.snapshot.stale ? 'Published source is stale; this is not a current census.' : 'Stay dates reconcile to published weekly census and monthly movement.';
      if (flow.snapshot.stale || flow.period.through < scope.through) base.coverage = 'partial';
      dataset = scopedDataset('Admissions and discharges', sites.map(s => ({ community: s.community, admissions: s.admissions, discharges: s.discharges, net: s.net, bedDays: s.bedDays })),
        [{ key: 'community', label: 'Community', type: 'string' }, ...['admissions', 'discharges', 'net', 'bedDays'].map(key => ({ key, label: key, type: 'number' }))], 'categories');
    } else if (step.capability === 'platform-data') {
      reportObject(args, ['slice', 'operation'], ['groupBy', 'measure', 'dateField', 'limit', 'filters']);
      const source = listAllyPlatformDataSources(await summary()).find(s => s.id === args.slice);
      const field = source && facilityField(source.fields);
      if (!source || !field) throw Error('This source has no enforceable community scope.');
      const time = args.dateField;
      if (time !== null && time !== undefined && (!source.fields.includes(time) || !/(?:date|month|week|time|period)/i.test(time))) throw Error('Choose a source date field.');
      if (args.operation === 'sum' && /census/.test(args.slice) && !(args.groupBy ?? []).includes(time)) throw Error('Census cannot be summed across dates.');
      const constraints = [{ field, op: 'in', value: authorization.communities }];
      if (time && /month/.test(time)) {
        const lastDay = new Date(Date.UTC(Number(scope.through.slice(0, 4)), Number(scope.through.slice(5, 7)), 0)).toISOString().slice(0, 10);
        if (!scope.from.endsWith('-01') || scope.through !== lastDay) throw Error('Use a daily source for a partial month.');
        constraints.push({ field: time, op: 'gte', value: scope.from.slice(0, 7) }, { field: time, op: 'lte', value: scope.through.slice(0, 7) + '-31' });
      } else if (time) constraints.push({ field: time, op: 'day-gte', value: scope.from }, { field: time, op: 'day-lte', value: scope.through });
      const { dateField: _date, ...query } = args;
      result = await data(query, { constraints, ...(authorization.grant.detail ? {} : {allowedFields: reportAggregateFields(source.fields)}) }); base.grain = source.grain; base.observedAt = source.generatedAt ?? base.observedAt;
      if (!time) base.period = `Source snapshot as of ${base.observedAt.slice(0, 10)}; no event-date filter`;
      base.note = `${result.readMode}; ${result.coverage}${result.hasMore ? '; result truncated' : ''}. ${time ? `Period applies to ${time}.` : 'Snapshot observation; not movement during the requested dates.'}`;
      if (result.hasMore || result.coverage.startsWith('partial')) base.coverage = 'partial';
      const keys = args.operation === 'rows' ? result.source.fields : [...(args.groupBy ?? []), 'result'];
      const columns = keys.map(key => ({ key, label: key, type: key === 'result' || reportNumericField(key) ? 'number' : 'string' }));
      dataset = platformDataset(definition(args.slice)?.title ?? args.slice,
        result.rows.map(row => Object.fromEntries(columns.map(column => [column.key, column.type === 'number' ? numericCell(row[column.key]) : row[column.key] ?? null]))),
        columns, time);
    } else if (step.capability === 'pipeline-summary') {
      reportObject(args, []);
      const source = await pipeline();
      if (source.status !== 'connected') throw Error('Pipeline source unavailable.');
      const portfolio = authorization.communities.length === ALAMO_FACILITIES.length;
      if (!portfolio && source.board.truncated) throw Error('A complete community referral count is unavailable.');
      const columns = source.board.columns.map(column => ({ key: column.key, title: column.label,
        count: portfolio ? column.count : source.board.cards.filter(item => item.column === column.key && authorization.communities.includes(facilityIdForPipelineCommunity(item.community))).length }));
      // Portfolio metrics are never reused for a narrower community scope.
      result = { generatedAt: source.generatedAt, columns, truncated: source.board.truncated,
        ...(authorization.communities.length === ALAMO_FACILITIES.length ? { metrics: source.metrics, history: source.history } : {}) };
      base.observedAt = source.generatedAt; base.period = `Current snapshot as of ${source.generatedAt.slice(0, 10)}`; base.grain = 'referral workspace stage';
      base.note = 'Published Pipeline snapshot. Stage rows may be bounded; this is not full referral event history.';
      dataset = scopedDataset('Current workspaces', columns.map(c => ({ stage: c.title, count: c.count })), [{ key: 'stage', label: 'Stage', type: 'string' }, { key: 'count', label: 'Workspaces', type: 'number' }], 'categories');
    } else if (step.capability === 'licensing-search') {
      reportObject(args, [], ['query', 'type']);
      const url = new URL('https://platform.invalid/api/platform/licensing');
      if (args.query) url.searchParams.set('q', reportText(args.query, 120));
      if (args.type) { if (!['Complaint', 'Inspection', 'Other'].includes(args.type)) throw Error('Invalid report type.'); url.searchParams.set('type', args.type); }
      const library = await licensing(url);
      const matches = library.reports.filter(r => authorization.communities.includes(r.facilityId) && r.reportDate >= scope.from && r.reportDate <= scope.through);
      result = { matched: matches.length, truncated: matches.length > 20, reports: matches.slice(0, 20).map(r => ({ id: r.id, title: r.title, reportDate: r.reportDate, reportType: r.reportType, facilityId: r.facilityId, sourceUrl: r.sourceUrl })) };
      base.observedAt = library.collectedAt; base.grain = 'state licensing report'; base.note = 'Archived report metadata; original findings have not been read.';
      base.coverage = 'partial';
    } else if (step.capability === 'proforma-search') {
      reportObject(args, ['query']);
      result = await knowledge.read({ operation: 'search', query: reportText(args.query, 200) });
      base.observedAt = result.observedAt; base.period = `Document revisions as of ${result.observedAt.slice(0, 10)}`; base.grain = 'procedure excerpt'; base.note = result.notice;
      if (result.limited) base.coverage = 'partial';
    } else throw Error('Unregistered report capability.');
    base.answer = JSON.stringify(result);
    if (base.answer.length > 16_000) throw Error('Narrow the report source selection.');
    base.revision = reportHash(result);
    return { ...base, ...(dataset ? { dataset } : {}) };
  }
  return { catalog, read };
}
