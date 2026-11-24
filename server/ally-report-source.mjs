import { reportHash, reportObject, reportText, validateReportScope } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { ALAMO_FACILITIES } from '../shared/community-names.mjs';
import { ANALYSIS_SLICE_CATALOG } from '../shared/analysis-slice-catalog.mjs';
import { readPlatformSnapshot } from './platform-snapshot.mjs';
import { getReportsSummaryData } from './platform-data.mjs';
import { buildResidentFlowReport } from './resident-flow-report.mjs';
import { listAllyPlatformDataSources, readAllyPlatformData, aggregateFields } from './ally-data-source.mjs';
import { getPipelineAdmissionsSummary } from './pipeline-admissions-summary.mjs';
import { buildAdmissionsDashboard, facilityIdForPipelineCommunity } from './admissions-dashboard.mjs';
import { getReportingDateKey } from '../shared/reporting-date.mjs';
import { activeIntakeCards, hasCompleteIntakeBoard, intakeStage, INTAKE_STAGES } from '../shared/admissions-intake.mjs';
import { getLicensingLibrary } from './licensing-library.mjs';
import { createWorkflowKnowledgeSource } from './workflow-knowledge-source.mjs';
import { reportAggregateFields, reportNumericField } from './ally-report-source-grants.mjs';
import { getExecutiveDirectorIncidents } from './executive-director-incidents.mjs';
import { reportColumnLabel } from '../shared/report-display.mjs';
import { ANALYST_SOURCES, ANALYST_NUMERIC_FIELDS, analystSourceDefinition } from './ally-analyst-catalog.mjs';

const objectSchema = properties => ({ type: 'object', properties, additionalProperties: false });
const string = { type: 'string' }, strings = { type: 'array', items: string, maxItems: 3 };
const schemas = {
  'platform-data': objectSchema({ slice: string, operation: { enum: ['rows', 'count', 'sum', 'average', 'minimum', 'maximum', 'median', 'distinct', 'statistics'] }, groupBy: strings, measure: string,
    columns:{type:'array',items:string,maxItems:40}, orderBy:{type:'array',maxItems:3,items:objectSchema({field:string,direction:{enum:['asc','desc']}})},
    dateField: { type: ['string', 'null'] }, limit: { type: 'integer', minimum: 1, maximum: 100 },
    filters: { type: 'array', maxItems: 6, items: objectSchema({ field: string, op: { enum: ['eq', 'gte', 'lte', 'contains', 'number-gte', 'number-lte'] }, value: string }) } }),
  'incident-summary': objectSchema({ from: string, through: string, communityIds: { type: 'array', items: string, maxItems: 5 }, priority: { enum: ['high', 'medium', 'low', 'unknown'] } }),
  'data-catalog': objectSchema({query:string,slice:string}),
  'resident-flow': objectSchema({ view: { enum: ['communities', 'counties', 'occupancy'] } }),
  'pipeline-summary': objectSchema({ view: { enum: ['stages', 'planned-admissions'] } }),
  'licensing-search': objectSchema({ query: string, type: { enum: ['Complaint', 'Inspection', 'Other'] } }),
  'proforma-search': objectSchema({ query: string })
};
const metadata = {
  'platform-data': ['Governed Platform data', 'Query published source grains. Counts count rows, not necessarily unique clients. Dates and communities are enforced. Never sum census across dates.'],
  'data-catalog': ['Find and describe data', 'Search authorized datasets by topic or describe one slice. Returns actual columns, meanings, date basis and coverage. Use this when the first source is insufficient; lack of a field in one dataset does not mean the organization lacks the data.'],
  'incident-summary': ['Incident counts by date and priority', 'Use for daily incidents, yesterday, and high/medium/low priority questions. Returns aggregate counts from the same incident register as the Incidents page, with exact occurrence-date filters and optional narrower communityIds. Community IDs: 337 San Pablo, 342 Victoria’s House, 343 JC Wallace House, 344 Turlock, 345 Santa Clarita. High means a sentinel event or emergency-services notification; this is operational priority, not a clinical severity grade. Snapshot fallback is explicitly partial. No client details are returned.'],
  'resident-flow': ['Admissions, discharges and bed use', 'Reconciled admission episodes in the selected period; repeat stays count separately. Use view counties for counties of those admissions, not current residents. Use view occupancy for latest published census, operating capacity and available beds; occupancy is a current snapshot, not historical utilization. Default communities shows period admissions/discharges, opening/closing census and bed-days.'],
  'pipeline-summary': ['Current referral pipeline', 'Current published referral stages and decisions. Use view planned-admissions for move-ins scheduled this week, by community; plans are not confirmed admissions. The schedule carries its own Monday–Sunday Pacific period. Default stages shows current active workspaces. Neither view is historical referral event history.'],
  'licensing-search': ['State licensing reports', 'Dated inspection and complaint metadata for selected communities. Separate from internal incidents.'],
  'proforma-search': ['ProForma procedures', 'Source-linked draft procedure excerpts. Draft references are not approved policy.']
};
const definition = id => ANALYSIS_SLICE_CATALOG.find(s => s.id === id);
const facilityField = fields => ['facility_id', 'Facility', 'facility', 'FacilityID'].find(f => fields.includes(f));
function scopedDataset(title, rows, columns, shape = 'records') {
  return { title, shape, columns: columns.map(column => ({...column, label:reportColumnLabel(column)})), rows };
}
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
    dataset.columns = [axis, ...columns.filter(column => column !== axis)].map(column => ({...column,label:reportColumnLabel(column)}));
  }
  return dataset;
}

export function createPlatformReportSources({ snapshot = readPlatformSnapshot, summary = getReportsSummaryData, data = readAllyPlatformData,
  pipeline = getPipelineAdmissionsSummary, incidents = getExecutiveDirectorIncidents, licensing = getLicensingLibrary, knowledge = createWorkflowKnowledgeSource(), now = Date.now } = {}) {
  async function catalog(authorization) {
    const sources = listAllyPlatformDataSources(await summary()).filter(s => authorization.grant.slices.includes(s.id) && facilityField(s.fields))
      .map(s => ({ ...s, fields: authorization.grant.detail ? s.fields : reportAggregateFields(s.fields) }));
    return authorization.grant.capabilities.map(id => ({ id, title: metadata[id][0], description: metadata[id][1], inputSchema: schemas[id],
      ...(id === 'platform-data' ? { sources: sources.map(s => ({ ...analystSourceDefinition(s), definition: definition(s.id)?.title, detailAllowed: authorization.grant.detail })) } : {}) }));
  }
  async function read(input, authorization) {
    const { step, scope } = input, args = step.input;
    const base = { capability: step.capability, inputHash: reportHash(args), scope, grantRevision: authorization.receipt.revision,
      requiresDetail: step.capability === 'platform-data' && authorization.grant.detail,
      observedAt: new Date(now()).toISOString(), period: `${scope.from}–${scope.through}`, grain: 'source observation',
      status: 'verified', coverage: 'complete', title: metadata[step.capability][0], note: '', answer: '', revision: '' };
    let result, dataset;
    if (step.capability === 'data-catalog') {
      reportObject(args, [], ['query','slice']);
      if (args.query !== undefined) reportText(args.query,240);
      if (args.slice !== undefined) reportText(args.slice,80);
      const sources=(await catalog(authorization)).find(item=>item.id==='platform-data')?.sources ?? [];
      const words=(args.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const selected=sources.filter(source => (!args.slice || source.id===args.slice) && (!words.length || words.some(word=>JSON.stringify(source).toLowerCase().includes(word))));
      result={sources:selected.slice(0,4),otherMatches:selected.slice(4).map(source=>source.id),definition:'Dataset metadata only. sourceRows counts rows at the declared grain; it is not a client count. Only authorized sources are listed. Describe a slice by ID for its full definition.'};
      base.title='Available data';base.grain='authorized dataset metadata';base.note='Search and schema discovery; metadata does not establish business facts.';
    } else if (step.capability === 'incident-summary') {
      reportObject(args, [], ['from', 'through', 'communityIds', 'priority']);
      const selected = validateReportScope({ communityIds: args.communityIds ?? authorization.communities,
        from: args.from ?? scope.from, through: args.through ?? scope.through });
      if (!selected.communityIds.length || selected.communityIds.some(id => !authorization.communities.includes(id)) ||
          selected.from < scope.from || selected.through > scope.through ||
          args.priority !== undefined && !['high', 'medium', 'low', 'unknown'].includes(args.priority)) throw Error('Choose incident filters within the authorized report scope.');
      const results = [];
      for (const facilityId of selected.communityIds) {
        const response = await incidents({ facilityId, from: selected.from, to: selected.through, priority: args.priority, limit: 1 });
        if (response.status !== 'ready' || typeof response.matchingIncidents !== 'number' || !Number.isSafeInteger(response.matchingIncidents) || response.matchingIncidents < 0) throw Error('Incident counts are unavailable.');
        const facility = ALAMO_FACILITIES.find(f => f.facilityId === facilityId);
        if (!facility) throw Error('Choose a listed community.');
        results.push({ community: facility.shortName,
          incidents: response.matchingIncidents, complete: response.coverage.status === 'complete' && !response.freshness?.stale,
          observedAt: response.generatedAt });
      }
      const rows = results.map(({community, incidents}) => ({community, incidents}));
      base.period = `${selected.from}–${selected.through}`; base.grain = 'incident occurrence by community';
      base.observedAt = results.map(r => r.observedAt).sort()[0];
      base.coverage = results.every(r => r.complete) ? 'complete' : 'partial';
      base.note = 'Same occurrence dates and operational priority as the Incidents page. High means a sentinel event or emergency-services notification; it is not a clinical severity grade.';
      if (base.coverage === 'partial') base.note += ' Published snapshot only: newer or older records may be missing; these are available-record counts, not confirmed complete totals.';
      result = { from: selected.from, through: selected.through, priority: args.priority ?? 'all',
        communities: rows, total: rows.reduce((total, row) => total + row.incidents, 0), coverage: base.coverage, definition: base.note };
      dataset = scopedDataset('Incidents', rows, [{key:'community',label:'Community',type:'string'},{key:'incidents',label:'Incidents',type:'number'}], 'categories');
    } else if (step.capability === 'resident-flow') {
      reportObject(args, [], ['view']);
      const view = args.view ?? 'communities';
      if (!['communities', 'counties', 'occupancy'].includes(view)) throw Error('Choose a supported resident-flow view.');
      const published = await snapshot();
      const range = view === 'occupancy' ? { from: published?.snapshot?.as_of_date, through: published?.snapshot?.as_of_date } : scope;
      const flow = buildResidentFlowReport(published, null, range.from?.slice(0, 4), range);
      const sites = flow.sites.filter(s => authorization.communities.includes(s.facilityId));
      result = { period: flow.period, sites, ...(authorization.communities.length === ALAMO_FACILITIES.length ? { totals: flow.totals, counties: flow.counties } : {}),
        definitions: { admissions: 'Admission episodes starting in this period; repeat admissions count separately.', discharges: 'Stay endings in this period.', bedDays: 'Admission day included; discharge day excluded.', averageCompletedStayDays: 'Total duration of stays that ended in this period, not ongoing residents.' } };
      base.observedAt = flow.snapshot.generatedAt; base.period = `${flow.period.start}–${flow.period.through}`; base.grain = 'community admission episodes';
      base.note = flow.snapshot.stale ? 'Published source is stale; this is not a current census.' : 'Stay dates reconcile to published weekly census and monthly movement.';
      if (flow.snapshot.stale || flow.period.through < scope.through) base.coverage = 'partial';
      dataset = scopedDataset('Admissions and discharges', sites.map(s => ({ community: s.community, admissions: s.admissions, discharges: s.discharges, net: s.net, bedDays: s.bedDays })),
        [{ key: 'community', label: 'Community', type: 'string' }, ...['admissions', 'discharges', 'net', 'bedDays'].map(key => ({ key, label: key, type: 'number' }))], 'categories');
      if (view === 'counties') {
        base.title = 'Counties of admission';
        const selected = authorization.communities.length === ALAMO_FACILITIES.length ? [flow] :
          authorization.communities.map(id => buildResidentFlowReport(published, id, range.from.slice(0, 4), range));
        const available = selected.every(report => report.counties.available);
        const counts = new Map();
        if (available) for (const report of selected) for (const row of report.counties.rows) counts.set(row.county, (counts.get(row.county) ?? 0) + row.admissions);
        const rows = [...counts].map(([county, admissions]) => ({ county, admissions })).sort((a,b) => b.admissions-a.admissions || a.county.localeCompare(b.county));
        result = { period: flow.period, counties: { available, rows }, definitions: { admissions: result.definitions.admissions } };
        base.grain = 'county of admission episodes';
        if (!available) { base.coverage = 'partial'; base.note += ' Admission county fields are unavailable for part of this scope.'; }
        dataset = scopedDataset('Counties of admission', rows, [{key:'county',label:'County',type:'string'},{key:'admissions',label:'Admissions',type:'number'}], 'categories');
      } else if (view === 'occupancy') {
        base.title = 'Census and operating capacity';
        const rows = sites.map(site => {
          const facility = ALAMO_FACILITIES.find(f => f.facilityId === site.facilityId);
          if (!facility) throw Error('Census community has no recorded operating limit.');
          const capacity = facility.capacityAsOf <= flow.snapshot.asOfDate ? facility.operatingLimit : null;
          return { community: site.community, census: site.closingCensus, operatingCapacity: capacity,
            availableBeds: capacity === null ? null : Math.max(0, capacity - site.closingCensus), capacityAsOf: facility.capacityAsOf };
        });
        result = { asOfDate: flow.snapshot.asOfDate, communities: rows,
          definitions: { census: 'Residents present at the latest published census date.', operatingCapacity: 'Recorded operating limit, not licensed capacity or a historical occupancy denominator.', availableBeds: 'Operating capacity minus census, floored at zero. This does not establish room or staffing availability.' } };
        base.period = `Current census as of ${flow.snapshot.asOfDate}`; base.grain = 'community census and operating capacity';
        if (rows.some(row => row.operatingCapacity === null)) { base.coverage = 'partial'; base.note += ' Recorded operating limits do not establish capacity before their effective dates.'; }
        dataset = scopedDataset('Census and operating capacity', rows,
          [{key:'community',label:'Community',type:'string'},...['census','operatingCapacity','availableBeds'].map(key=>({key,label:key,type:'number'})),{key:'capacityAsOf',label:'Capacity recorded',type:'string'}], 'categories');
      }
    } else if (step.capability === 'platform-data') {
      reportObject(args, ['slice', 'operation'], ['groupBy', 'measure', 'dateField', 'limit', 'filters','columns','orderBy']);
      const publishedSummary=await summary();
      const source = listAllyPlatformDataSources(publishedSummary).find(s => s.id === args.slice);
      const field = source && facilityField(source.fields);
      if (!source || !field) throw Error('This source has no enforceable community scope.');
      const defaultDate=ANALYST_SOURCES[args.slice]?.dateField;
      if (args.dateField === null && defaultDate && source.fields.includes(defaultDate)) throw Error('Dated records require a date field within the selected report period.');
      const time = args.dateField !== undefined ? args.dateField : source.fields.includes(defaultDate) ? defaultDate : null;
      if (time !== null && time !== undefined && (!source.fields.includes(time) || !/(?:date|month|week|time|period)/i.test(time))) throw Error('Choose a source date field.');
      if (args.operation === 'sum' && /census/.test(args.slice) && !(args.groupBy ?? []).includes(time)) throw Error('Census cannot be summed across dates.');
      const constraints = [{ field, op: 'in', value: authorization.communities }];
      if (time && /month/.test(time)) {
        const lastDay = new Date(Date.UTC(Number(scope.through.slice(0, 4)), Number(scope.through.slice(5, 7)), 0)).toISOString().slice(0, 10);
        if (!scope.from.endsWith('-01') || scope.through !== lastDay) {
          const note = 'This monthly source cannot establish totals for a partial month or a specific day. Use a daily source for the requested dates.';
          return { ...base, status: 'unavailable', coverage: 'partial', answer: null, note, revision: reportHash({args, scope, note}) };
        }
        constraints.push({ field: time, op: 'gte', value: scope.from.slice(0, 7) }, { field: time, op: 'lte', value: scope.through.slice(0, 7) + '-31' });
      } else if (time) constraints.push({ field: time, op: 'day-gte', value: scope.from }, { field: time, op: 'day-lte', value: scope.through });
      const { dateField: _date, ...query } = args;
      try { result = await data(query, { load:async()=>publishedSummary, constraints, ...(authorization.grant.detail ? {} : {allowedFields: reportAggregateFields(source.fields)}) }); }
      catch(error) {
        if(!error || typeof error !== 'object' || !('code' in error) || error.code !== 'analyst_result_too_large') throw error;
        const note='This selection is too large. Request fewer rows and columns, add a narrower filter, or calculate an aggregate.';
        return {...base,status:'unavailable',coverage:'partial',answer:null,note,revision:reportHash({args,scope,note})};
      }
      base.grain = source.grain; base.observedAt = source.generatedAt ?? base.observedAt;
      if (!time) base.period = `Source snapshot as of ${base.observedAt.slice(0, 10)}; no event-date filter`;
      base.note = `${result.readMode}; ${result.coverage}${result.hasMore ? '; result truncated' : ''}. ${time ? `Period applies to ${time}.` : 'Snapshot observation; not movement during the requested dates.'}`;
      if (result.hasMore || result.coverage.startsWith('partial')) base.coverage = 'partial';
      const keys = args.operation === 'rows' ? args.columns ?? result.source.fields : [...(args.groupBy ?? []), ...aggregateFields(args.operation)];
      const resultLabel = args.operation === 'count' ? 'Records' : args.measure
        ? `${({average:'Average',median:'Median',minimum:'Minimum',maximum:'Maximum',distinct:'Distinct',sum:'Total'})[args.operation] ?? 'Total'} ${reportColumnLabel({key:args.measure}).toLowerCase()}` : 'Result';
      const columns = keys.map(key => ({ key, label: key === 'result' ? resultLabel : key, type: aggregateFields(args.operation).includes(key) || reportNumericField(key) || ANALYST_NUMERIC_FIELDS.has(key) ? 'number' : 'string' }));
      dataset = platformDataset(definition(args.slice)?.title ?? args.slice,
        result.rows.map(row => Object.fromEntries(columns.map(column => [column.key, column.type === 'number' ? numericCell(row[column.key]) : row[column.key] ?? null]))),
        columns, time);
    } else if (step.capability === 'pipeline-summary') {
      reportObject(args, [], ['view']);
      const view = args.view ?? 'stages';
      if (!['stages', 'planned-admissions'].includes(view)) throw Error('Choose a supported pipeline view.');
      const source = await pipeline();
      if (source.status !== 'connected') throw Error('Pipeline source unavailable.');
      if (!hasCompleteIntakeBoard(source)) throw Error('A complete active referral count is unavailable.');
      const active = activeIntakeCards(source);
      const facilityFor = item => item.facilityId ?? facilityIdForPipelineCommunity(item.community);
      if (active.some(item => !ALAMO_FACILITIES.some(facility => facility.facilityId === facilityFor(item)) ||
          item.facilityId && facilityIdForPipelineCommunity(item.community) && item.facilityId !== facilityIdForPipelineCommunity(item.community))) {
        throw Error('Active referral community scope could not be verified.');
      }
      const cards = active.filter(item => authorization.communities.includes(facilityFor(item)));
      const columns = INTAKE_STAGES.map(stage => ({ key: stage.key, title: stage.label, count: cards.filter(card => intakeStage(card) === stage.key).length }));
      if (view === 'planned-admissions') {
        if (source.briefing?.status !== 'ready' || source.briefing.coverage.moveIns !== true) {
          throw Error('A complete planned-admission schedule is unavailable.');
        }
        // Use the same weekly membership and cancellations as the Admissions
        // page. Never send its underlying named-person schedule to the model.
        const briefing = buildAdmissionsDashboard(await snapshot(), {referralPipeline: source}).briefing;
        if (briefing.plannedMoveIns.some(row => !ALAMO_FACILITIES.some(f => f.facilityId === row.facilityId))) {
          throw Error('Planned admission community scope could not be verified.');
        }
        const rows = ALAMO_FACILITIES.filter(f => authorization.communities.includes(f.facilityId)).map(f => ({
          community: f.shortName,
          plannedAdmissions: briefing.plannedMoveIns.filter(row => row.facilityId === f.facilityId).length,
          awaitingDate: cards.filter(card => facilityFor(card) === f.facilityId && intakeStage(card) === 'arrival' && !card.plannedAdmissionDate).length
        }));
        result = { generatedAt: source.generatedAt,
          period: { start: briefing.weekStart, through: briefing.weekEnd, timezone: source.briefing.timezone, asOfDate: briefing.pipelineAsOfDate },
          communities: rows, total: rows.reduce((total, row) => total + row.plannedAdmissions, 0),
          awaitingDate: rows.reduce((total, row) => total + row.awaitingDate, 0),
          definition: 'Planned move-ins in the published weekly Pipeline schedule; not confirmed admissions. Awaiting date counts active accepted workspaces with no planned admission date; their arrival week is unknown.' };
        base.title = 'Planned admissions'; base.observedAt = source.generatedAt;
        base.period = `${briefing.weekStart}–${briefing.weekEnd}`; base.grain = 'community planned move-ins';
        base.note = 'Pipeline weekly schedule, Monday–Sunday in Pacific time. Plans are not confirmed admissions. Accepted workspaces without a date cannot be assigned to this week. This current schedule does not provide historical admission totals.';
        const today = getReportingDateKey(now());
        if (today < briefing.weekStart || today > briefing.weekEnd) {
          base.coverage = 'partial'; base.note += ' The published schedule does not cover the current week.';
        }
        dataset = scopedDataset('Planned admissions', rows,
          [{key:'community',label:'Community',type:'string'},{key:'plannedAdmissions',label:'Planned admissions',type:'number'},{key:'awaitingDate',label:'Awaiting date',type:'number'}], 'categories');
      } else {
        // Counts share the same complete active population as the Admissions UI.
        // The broader producer awaiting-admission metric is not a stage subtotal.
        result = { generatedAt: source.generatedAt, columns, truncated: false,
          metrics: { activeReferrals: cards.length, awaitingAdmission: columns.find(column => column.key === 'arrival')?.count ?? 0 } };
        base.observedAt = source.generatedAt; base.period = `Current snapshot as of ${source.generatedAt.slice(0, 10)}`; base.grain = 'referral workspace stage';
        base.note = 'Complete active Pipeline workspaces in the selected communities. Stages are mutually exclusive; admitted and closed workspaces are excluded. This is a current snapshot, not referral event history.';
        dataset = scopedDataset('Current workspaces', columns.map(c => ({ stage: c.title, count: c.count })), [{ key: 'stage', label: 'Stage', type: 'string' }, { key: 'count', label: 'Workspaces', type: 'number' }], 'categories');
      }
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
      result = await knowledge.read({ version: 1, operation: 'search', query: reportText(args.query, 200) });
      base.observedAt = result.observedAt; base.period = `Document revisions as of ${result.observedAt.slice(0, 10)}`; base.grain = 'procedure excerpt'; base.note = result.notice;
      if (result.limited) base.coverage = 'partial';
    } else throw Error('Unregistered report capability.');
    base.answer = JSON.stringify(result);
    if (base.answer.length > 16_000) {
      const note='This selection exceeds the answer context. Request fewer rows and columns, narrow the filter, or calculate an aggregate.';
      return {...base,status:'unavailable',coverage:'partial',answer:null,note,revision:reportHash({args,scope,note})};
    }
    base.revision = reportHash(result);
    return { ...base, ...(dataset ? { dataset } : {}) };
  }
  return { catalog, read };
}
