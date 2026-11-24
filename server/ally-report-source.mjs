import { reportHash, reportObject, reportText, validateReportScope } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { ALAMO_FACILITIES, normalizeKnownCommunityNamesDeep } from '../shared/community-names.mjs';
import { ANALYSIS_SLICE_CATALOG } from '../shared/analysis-slice-catalog.mjs';
import { readPlatformSnapshot } from './platform-snapshot.mjs';
import { getSnapshotFreshness } from './snapshot-status.mjs';
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
import { ANALYST_SOURCES, ANALYST_NUMERIC_FIELDS, analystSourceDefinition, analystDateFields } from './ally-analyst-catalog.mjs';

const objectSchema = properties => ({ type: 'object', properties, additionalProperties: false });
const string = { type: 'string' }, strings = { type: 'array', items: string, maxItems: 3 };
const schemas = {
  'platform-data': objectSchema({ slice: string, operation: { enum: ['rows', 'count', 'sum', 'average', 'minimum', 'maximum', 'median', 'distinct', 'statistics'] }, groupBy: strings, measure: string,
    columns:{type:'array',items:string,maxItems:40,description:'Projection for rows only. Omit for aggregates; valid redundant columns do not change the aggregate population.'}, orderBy:{type:'array',maxItems:3,description:'Use returned keys: groupBy fields and result for aggregates; named statistics for statistics.',items:objectSchema({field:string,direction:{enum:['asc','desc']}})},
    dateField: { type: ['string', 'null'] }, limit: { type: 'integer', minimum: 1, maximum: 100 },
    filters: { type: 'array', maxItems: 6, items: objectSchema({ field: string, op: { enum: ['eq', 'gte', 'lte', 'contains', 'number-gte', 'number-lte'] }, value: {type:'string',minLength:1,maxLength:200} }) } }),
  'incident-summary': objectSchema({ from: string, through: string, communityIds: { type: 'array', items: string, maxItems: 5 }, priority: { enum: ['high', 'medium', 'low', 'unknown'] } }),
  'data-catalog': objectSchema({query:{type:'string',minLength:1,maxLength:240},slice:{type:'string',minLength:1,maxLength:80}}),
  'resident-flow': objectSchema({ view: { enum: ['communities', 'counties', 'occupancy'] } }),
  'pipeline-summary': objectSchema({ view: { enum: ['stages', 'planned-admissions', 'current-workspaces', 'monthly-history'] }, query:{type:'string',minLength:1,maxLength:120}, stage:{enum:INTAKE_STAGES.map(stage=>stage.key)} }),
  'licensing-search': objectSchema({ query: {type:'string',minLength:1,maxLength:120}, type: { enum: ['Complaint', 'Inspection', 'Other'] } }),
  'proforma-search': objectSchema({ query: {type:'string',minLength:1,maxLength:200} })
};
const metadata = {
  'platform-data': ['Governed Platform data', 'Query source-owned data within authorized dates and communities. Counts count rows, not necessarily people. columns is only for rows; omit it for aggregates. Aggregates return groupBy fields and result. statistics returns records, known, missing, mean, median, minimum, maximum. orderBy uses these returned keys, not the original measure. Numeric filters use number-gte/number-lte; gte/lte are date filters. Never sum census across dates.'],
  'data-catalog': ['Find and describe data', 'Search authorized datasets by topic or describe one slice. Returns actual columns, meanings, date basis and coverage. Use this when the first source is insufficient; lack of a field in one dataset does not mean the organization lacks the data.'],
  'incident-summary': ['Incident counts by date and priority', 'Use for daily incidents, yesterday, and high/medium/low priority questions. Returns aggregate counts from the same incident register as the Incidents page, with exact occurrence-date filters and optional narrower communityIds. Community IDs: 337 San Pablo, 342 Victoria’s House, 343 JC Wallace House, 344 Turlock, 345 Santa Clarita. High means a sentinel event or emergency-services notification; this is operational priority, not a clinical severity grade. Snapshot fallback is explicitly partial. No client details are returned.'],
  'resident-flow': ['Admissions, discharges and bed use', 'Reconciled admission episodes in the selected period; repeat stays count separately. Default communities returns admissions/discharges, opening/closing census, bed-days, completedStayCount, averageCompletedStayDays and medianCompletedStayDays. Use it for length of stays ending in the selected period: complete admission-to-discharge durations, including admissions before the period. These are not ongoing stays of current residents. Use view counties for counties of those admissions, not current residents. Use view occupancy for latest published census, operating capacity and available beds; occupancy is a current snapshot, not historical utilization.'],
  'pipeline-summary': ['Current referral pipeline', 'Current published referral stages and decisions. Use view planned-admissions for move-ins scheduled this week, by community; plans are not confirmed admissions. The schedule carries its own Monday–Sunday Pacific period. Default stages shows current active workspaces. current-workspaces returns bounded named active workspace metadata for detail-authorized readers, optionally filtered by query or stage. monthly-history returns published monthly referral/decision/admission event counts for the entire portfolio only, within its stated historical coverage; these events are not a single conversion cohort.'],
  'licensing-search': ['State licensing reports', 'Dated inspection and complaint metadata for selected communities. Separate from internal incidents.'],
  'proforma-search': ['ProForma procedures', 'Source-linked draft procedure excerpts. Draft references are not approved policy.']
};
const definition = id => ANALYSIS_SLICE_CATALOG.find(s => s.id === id);
const sourceTitle = id => definition(id)?.title ?? reportColumnLabel({key:id});
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
    dimensions.every(other => other === column || constant(other.key) || other.key==='month_bucket' && rows.every(row=>String(row[other.key]).slice(0,7)===String(row[column.key]).slice(0,7))));
  const axis = label ?? date;
  if (axis) {
    dataset.shape = label ? 'categories' : 'series';
    dataset.columns = [axis, ...columns.filter(column => column !== axis)].map(column => ({...column,label:reportColumnLabel(column)}));
  }
  return dataset;
}

// Intersect query dates with the authorized scope; a page ending mid-month
// must not reject a narrower, complete-month comparison. This never expands
// permission and does not pretend a partial month is a full one.
function queryPeriod(scope, filters, time) {
  let from=scope.from, through=scope.through;
  const monthEnd = month => new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
  for(const filter of filters ?? []) {
    if(filter.field!==time || !['eq','gte','lte'].includes(filter.op)) continue;
    const value=filter.value;
    if(typeof value!=='string' || !/^20\d{2}-\d{2}(?:-\d{2})?$/.test(value)) continue;
    const first=value.length===7?value+'-01':value;
    if(!Number.isFinite(Date.parse(first)) || new Date(first+'T00:00:00Z').toISOString().slice(0,10)!==first) throw Error('Choose valid query dates.');
    const last=value.length===7?monthEnd(value):value;
    if(filter.op==='eq'||filter.op==='gte')from=from>first?from:first;
    if(filter.op==='eq'||filter.op==='lte')through=through<last?through:last;
  }
  return {from,through};
}

// Reuse the canonical publication directly; normalize selected rows and bounded
// output. The standard loader retains missing-publication/fallback behavior.
export function createPlatformReportSources({ snapshot = readPlatformSnapshot,
  summary = async () => (await snapshot())?.reportsSummary || getReportsSummaryData(), data = readAllyPlatformData,
  pipeline = getPipelineAdmissionsSummary, incidents = getExecutiveDirectorIncidents, licensing = getLicensingLibrary, knowledge = createWorkflowKnowledgeSource(), now = Date.now } = {}) {
  async function catalog(authorization) {
    const sources = listAllyPlatformDataSources(await summary()).filter(s => authorization.grant.slices.includes(s.id) && facilityField(s.fields))
      .map(s => { const fields=authorization.grant.detail?s.fields:reportAggregateFields(s.fields);return {...s,fields,fieldCoverage:s.fieldCoverage?Object.fromEntries(fields.map(field=>[field,s.fieldCoverage[field]])):null}; });
    return authorization.grant.capabilities.map(id => ({ id, title: metadata[id][0], description: metadata[id][1], inputSchema: schemas[id],
      ...(id === 'platform-data' ? { sources: sources.map(s => ({ ...analystSourceDefinition(s), definition: sourceTitle(s.id), detailAllowed: authorization.grant.detail })) } : {}) }));
  }
  async function read(input, authorization, { snapshotOnly = false } = {}) {
    const { step, scope } = input, args = step.input;
    const base = { capability: step.capability, inputHash: reportHash(args), scope, grantRevision: authorization.receipt.revision,
      requiresDetail: step.capability === 'platform-data' && authorization.grant.detail,
      observedAt: new Date(now()).toISOString(), period: `${scope.from}–${scope.through}`, grain: 'source observation',
      status: 'verified', coverage: 'complete', title: metadata[step.capability][0], note: '', answer: '', revision: '' };
    const queryLimit=schemas[step.capability].properties.query?.maxLength;
    if(queryLimit && args.query!==undefined && (typeof args.query!=='string' || !args.query.trim() || args.query.length>queryLimit)) {
      const note=`Query needs correction: use a search phrase of 1–${queryLimit} characters, not the whole requested answer.`;
      return {...base,status:'unavailable',coverage:'partial',answer:null,note,revision:reportHash({args,scope,note})};
    }
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
        const response = await incidents({ facilityId, from: selected.from, to: selected.through, priority: args.priority, limit: 1 }, { preferPublishedCounts: true });
        if (response.status !== 'ready' || typeof response.matchingIncidents !== 'number' || !Number.isSafeInteger(response.matchingIncidents) || response.matchingIncidents < 0) throw Error('Incident counts are unavailable.');
        const facility = ALAMO_FACILITIES.find(f => f.facilityId === facilityId);
        if (!facility) throw Error('Choose a listed community.');
        results.push({ community: facility.shortName,
          incidents: response.matchingIncidents, complete: response.coverage.status === 'complete' && !response.freshness?.stale,
          observedAt: response.generatedAt, publishedThrough: 'requestedPeriodComplete' in response.coverage && response.coverage.requestedPeriodComplete ? response.asOfDate : null });
      }
      const rows = results.map(({community, incidents}) => ({community, incidents}));
      base.period = `${selected.from}–${selected.through}`; base.grain = 'incident occurrence by community';
      base.observedAt = results.map(r => r.observedAt).sort()[0];
      base.coverage = results.every(r => r.complete) ? 'complete' : 'partial';
      base.note = 'Same occurrence dates and operational priority as the Incidents page. High means a sentinel event or emergency-services notification; it is not a clinical severity grade.';
      const publishedThrough = results.map(row => row.publishedThrough).filter(Boolean).sort()[0];
      if (publishedThrough) base.note += ` Published counts include data through ${publishedThrough}.`;
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
            availableBeds: capacity === null ? null : Math.max(0, capacity - site.closingCensus),
            occupancyPercent: capacity !== null && capacity > 0 ? Math.round(1000 * site.closingCensus / capacity) / 10 : null, capacityAsOf: facility.capacityAsOf };
        });
        result = { asOfDate: flow.snapshot.asOfDate, communities: rows,
          definitions: { census: 'Residents present at the latest published census date.', operatingCapacity: 'Recorded operating limit, not licensed capacity or a historical occupancy denominator.', occupancyPercent: 'Census divided by operating capacity, expressed as a percentage rounded to one decimal place.', availableBeds: 'Operating capacity minus census, floored at zero. This does not establish room or staffing availability.' } };
        base.period = `Current census as of ${flow.snapshot.asOfDate}`; base.grain = 'community census and operating capacity';
        if (rows.some(row => row.operatingCapacity === null)) { base.coverage = 'partial'; base.note += ' Recorded operating limits do not establish capacity before their effective dates.'; }
        dataset = scopedDataset('Census and operating capacity', rows,
          [{key:'community',label:'Community',type:'string'},...['census','operatingCapacity','availableBeds','occupancyPercent'].map(key=>({key,label:key,type:'number'})),{key:'capacityAsOf',label:'Capacity recorded',type:'string'}], 'categories');
      }
    } else if (step.capability === 'platform-data') {
      reportObject(args, ['slice', 'operation'], ['groupBy', 'measure', 'dateField', 'limit', 'filters','columns','orderBy']);
      const publishedSummary=await summary();
      const source = listAllyPlatformDataSources(publishedSummary).find(s => s.id === args.slice);
      base.title = sourceTitle(args.slice);
      const field = source && facilityField(source.fields);
      if (!source || !field) throw Error('This source has no enforceable community scope.');
      const defaultDate=ANALYST_SOURCES[args.slice]?.dateField;
      if (args.dateField === null && defaultDate && source.fields.includes(defaultDate)) throw Error('Dated records require a date field within the selected report period.');
      const time = args.dateField !== undefined ? args.dateField : source.fields.includes(defaultDate) ? defaultDate : null;
      if (args.slice === 'services_provided' && time !== 'month_bucket') {
        const note='Service archive records cover whole months. Use month_bucket and complete months; service_date is not an individual visit date.';
        return {...base,status:'unavailable',coverage:'partial',answer:null,note,revision:reportHash({args,scope,note})};
      }
      if (time !== null && time !== undefined && !analystDateFields(source.fields).includes(time)) {
        const note='Query needs correction: choose a listed date dimension. A count or rate cannot be used as the event date.';
        return {...base,status:'unavailable',coverage:'partial',answer:null,note,revision:reportHash({args,scope,note})};
      }
      if (args.operation === 'sum' && /census/.test(args.slice) && !(args.groupBy ?? []).includes(time)) throw Error('Census cannot be summed across dates.');
      const selectedPeriod=queryPeriod(scope,args.filters,time);
      if (args.slice === 'services_provided') {
        const first=String(source.minPeriod ?? '').slice(0,7), last=String(source.maxPeriod ?? '').slice(0,7);
        if (!/^20\d{2}-\d{2}$/.test(first) || !/^20\d{2}-\d{2}$/.test(last) || selectedPeriod.from.slice(0,7)<first || selectedPeriod.through.slice(0,7)>last) {
          const note=`The archived client-service data covers ${first || 'an unknown start'} through ${last || 'an unknown end'}. Dates outside that archive are unavailable, not zero services.`;
          return {...base,status:'unavailable',coverage:'partial',answer:null,note,revision:reportHash({args,scope,note})};
        }
      }
      if(time)base.period=`${selectedPeriod.from}–${selectedPeriod.through}`;
      const constraints = [{ field, op: 'in', value: authorization.communities }];
      if (time && /month/.test(time)) {
        const lastDay = new Date(Date.UTC(Number(selectedPeriod.through.slice(0, 4)), Number(selectedPeriod.through.slice(5, 7)), 0)).toISOString().slice(0, 10);
        if (!selectedPeriod.from.endsWith('-01') || selectedPeriod.through !== lastDay) {
          const note = 'This monthly source cannot establish totals for a partial month or a specific day. Use a daily source for the requested dates.';
          return { ...base, status: 'unavailable', coverage: 'partial', answer: null, note, revision: reportHash({args, scope, note}) };
        }
        constraints.push({ field: time, op: 'gte', value: selectedPeriod.from.slice(0, 7) }, { field: time, op: 'lte', value: selectedPeriod.through.slice(0, 7) + '-31' });
      } else if (time) constraints.push({ field: time, op: 'day-gte', value: scope.from }, { field: time, op: 'day-lte', value: scope.through });
      const { dateField: _date, ...query } = args;
      try { result = await data(query, { load:async()=>publishedSummary, constraints, snapshotOnly, ...(authorization.grant.detail ? {} : {allowedFields: reportAggregateFields(source.fields)}) }); }
      catch(error) {
        if(!error || typeof error !== 'object' || !('code' in error) || !['analyst_result_too_large','ally_query_invalid'].includes(String(error.code))) throw error;
        // These are source-owned validation messages, never database/provider
        // exception bodies. Let the existing investigation loop repair the query.
        const note=error.code==='ally_query_invalid' ? `Query needs correction: ${error instanceof Error ? error.message : 'Choose supported query fields.'}` : 'This selection is too large. Request fewer rows and columns, add a narrower filter, or calculate an aggregate.';
        return {...base,status:'unavailable',coverage:'partial',answer:null,note,revision:reportHash({args,scope,note})};
      }
      base.grain = source.grain; base.observedAt = source.generatedAt ?? base.observedAt;
      const {fieldCoverage: _coverage, ...resultSource} = result.source;
      result.source = resultSource;
      if(time==='week_start')result.observationIntervals=[...new Set(result.rows.map(row=>row.week_start).filter(value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)))].map(start=>({start,end:new Date(Date.parse(start+'T00:00:00Z')+6*86400000).toISOString().slice(0,10)}));
      if (!time) base.period = result.readMode === 'published-snapshot' && source.asOfDate
        ? `Source snapshot as of ${source.asOfDate}; no event-date filter`
        : `Published ${getReportingDateKey(base.observedAt)}; no event-date filter`;
      const relevantFields=[args.measure,...(args.columns ?? []),...(args.groupBy ?? []),...(args.filters ?? []).map(filter=>filter.field)].filter(Boolean);
      const emptyFields=relevantFields.filter(field=>source.fieldCoverage?.[field]?.records>0 && source.fieldCoverage[field].populated===0);
      // A predicate on an entirely empty publication cannot establish a zero
      // cohort. Keep genuine zero matches on populated fields answerable.
      const emptyPredicates=(args.filters ?? []).filter(filter=>emptyFields.includes(filter.field));
      if(result.readMode==='published-snapshot' && emptyPredicates.length) {
        const fields=[...new Set(emptyPredicates.map(filter=>filter.field))];
        const note=`The published data has no populated values for the searched fields: ${fields.join(', ')}. Matching records cannot be determined; this is not a zero result.`;
        return {...base,status:'unavailable',coverage:'partial',answer:null,note,revision:reportHash({args,scope,observedAt:base.observedAt,note})};
      }
      base.note = `${result.readMode}; ${result.coverage}${result.hasMore ? '; result truncated' : ''}. ${time ? `Period applies to ${time}.` : 'Snapshot observation; not movement during the requested dates.'}`;
      if(emptyFields.length)base.note+=` No populated values in the complete published data for: ${[...new Set(emptyFields)].slice(0,6).join(', ')}${new Set(emptyFields).size>6?' (and other requested fields)':''}. Missing values are not zero or evidence of no events.`;
      if (result.hasMore || result.coverage.startsWith('partial') || emptyFields.length) base.coverage = 'partial';
      const keys = args.operation === 'rows' ? args.columns ?? result.source.fields : [...(args.groupBy ?? []), ...aggregateFields(args.operation)];
      const resultLabel = args.operation === 'count' ? 'Records' : args.measure
        ? `${({average:'Average',median:'Median',minimum:'Minimum',maximum:'Maximum',distinct:'Distinct',sum:'Total'})[args.operation] ?? 'Total'} ${reportColumnLabel({key:args.measure}).toLowerCase()}` : 'Result';
      const columns = keys.map(key => ({ key, label: key === 'result' ? resultLabel : key, type: aggregateFields(args.operation).includes(key) || reportNumericField(key) || ANALYST_NUMERIC_FIELDS.has(key) ? 'number' : 'string' }));
      dataset = platformDataset(sourceTitle(args.slice),
        result.rows.map(row => Object.fromEntries(columns.map(column => [column.key, column.type === 'number' ? numericCell(row[column.key]) : row[column.key] ?? null]))),
        columns, time);
    } else if (step.capability === 'pipeline-summary') {
      reportObject(args, [], ['view','query','stage']);
      const view = args.view ?? 'stages';
      if (!['stages', 'planned-admissions','current-workspaces','monthly-history'].includes(view)) throw Error('Choose a supported pipeline view.');
      const source = await pipeline();
      if (source.status !== 'connected') throw Error('Pipeline source unavailable.');
      if ((args.query!==undefined || args.stage!==undefined) && view!=='current-workspaces')throw Error('Workspace filters require current-workspaces.');
      if (view !== 'monthly-history' && !hasCompleteIntakeBoard(source)) throw Error('A complete active referral count is unavailable.');
      const active = view === 'monthly-history' ? [] : activeIntakeCards(/** @type {{board:{cards:import('../src/shared/types/platformSnapshot.js').AdmissionsBoardCard[]}}} */ (source));
      const facilityFor = item => item.facilityId ?? facilityIdForPipelineCommunity(item.community);
      if (active.some(item => !ALAMO_FACILITIES.some(facility => facility.facilityId === facilityFor(item)) ||
          item.facilityId && facilityIdForPipelineCommunity(item.community) && item.facilityId !== facilityIdForPipelineCommunity(item.community))) {
        throw Error('Active referral community scope could not be verified.');
      }
      const cards = active.filter(item => authorization.communities.includes(facilityFor(item)));
      const columns = INTAKE_STAGES.map(stage => ({ key: stage.key, title: stage.label, count: cards.filter(card => intakeStage(card) === stage.key).length }));
      if (view === 'monthly-history') {
        const asOf=getReportingDateKey(Date.parse(source.generatedAt));
        const lastDay=new Date(Date.UTC(Number(scope.through.slice(0,4)),Number(scope.through.slice(5,7)),0)).toISOString().slice(0,10);
        const history=source.history;
        const note=authorization.communities.length!==ALAMO_FACILITIES.length
          ? 'Published Pipeline monthly history is portfolio-wide and cannot establish community-specific historical counts.'
          : !scope.from.endsWith('-01') || scope.through!==lastDay && scope.through!==asOf
          ? 'Published monthly history cannot establish this partial-month interval. Select complete months or the current published month through its snapshot date.'
          : !history?.coverageStartMonth || !Array.isArray(history.monthly)
          ? 'Pipeline monthly history is unavailable in this publication.' : null;
        if(note)return {...base,status:'unavailable',coverage:'partial',answer:null,note,revision:reportHash({args,scope,note})};
        const rows=history.monthly.filter(row=>row.month>=scope.from.slice(0,7) && row.month<=scope.through.slice(0,7))
          .map(({month,received,accepted,declined,admitted})=>({month,received,accepted,declined,admitted}));
        base.title='Pipeline monthly activity';base.observedAt=source.generatedAt;base.grain='portfolio month';
        base.note='Published Pipeline monthly events. Received, accepted, declined and admitted are separate events, not a single referral cohort or a conversion rate.';
        if(scope.from.slice(0,7)<history.coverageStartMonth){base.coverage='partial';base.note+=` Available history begins ${history.coverageStartMonth}; earlier months are unavailable, not zero.`;}
        if(scope.through>asOf){base.coverage='partial';base.note+=` Events after ${asOf} are not yet observed.`;}
        base.period=`${scope.from}–${scope.through<asOf?scope.through:asOf}`;
        result={rows,coverageStartMonth:history.coverageStartMonth,asOfDate:asOf,definition:base.note};
        dataset=scopedDataset(base.title,rows,[{key:'month',label:'Month',type:'string'},...['received','accepted','declined','admitted'].map(key=>({key,label:reportColumnLabel({key}),type:'number'}))],'series');
      } else if (view === 'current-workspaces') {
        if(!authorization.grant.detail)throw Error('Named workspace detail is unavailable for this assignment.');
        base.requiresDetail=true;
        const query=args.query===undefined?'':reportText(args.query,120).toLowerCase();
        if(args.stage!==undefined && !INTAKE_STAGES.some(stage=>stage.key===args.stage))throw Error('Choose a listed workspace stage.');
        const selected=cards.filter(card=>(!args.stage||intakeStage(card)===args.stage) && (!query||[card.clientName,card.owner,card.status].some(value=>String(value??'').toLowerCase().includes(query))));
        const rows=selected.slice(0,25).map(card=>({client:card.clientName,community:card.community,owner:card.owner,stage:INTAKE_STAGES.find(stage=>stage.key===intakeStage(card))?.label,status:card.status,daysOpen:card.daysOpen,daysSinceUpdate:card.daysSinceUpdate,plannedAdmissionDate:card.plannedAdmissionDate,workspace:card.pipelineUrl}));
        base.title='Current workspaces';base.observedAt=source.generatedAt;base.period=`Current snapshot as of ${getReportingDateKey(Date.parse(source.generatedAt))}`;base.grain='active referral workspace';
        base.note='Current active workspaces only. Days open is workspace age, not proven avoidable delay. Clinical assessment content is excluded.';
        if(selected.length>rows.length){base.coverage='partial';base.note+=' Only the first 25 matches are shown; narrow the name, owner or stage filter for more detail.';}
        result={matched:selected.length,rows,definition:base.note};
        dataset=scopedDataset(base.title,rows,['client','community','owner','stage','status','daysOpen','daysSinceUpdate','plannedAdmissionDate','workspace'].map(key=>({key,label:reportColumnLabel({key}),type:['daysOpen','daysSinceUpdate'].includes(key)?'number':'string'})),'records');
      } else if (view === 'planned-admissions') {
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
    if (step.capability === 'platform-data') {
      result = normalizeKnownCommunityNamesDeep(result);
      if (dataset) dataset = normalizeKnownCommunityNamesDeep(dataset);
    }
    base.answer = JSON.stringify(result);
    if (base.answer.length > 16_000) {
      const note='This selection exceeds the answer context. Request fewer rows and columns, narrow the filter, or calculate an aggregate.';
      return {...base,status:'unavailable',coverage:'partial',answer:null,note,revision:reportHash({args,scope,note})};
    }
    base.revision = reportHash(result);
    return { ...base, ...(dataset ? { dataset } : {}) };
  }
  async function prepare(authorization, collect) {
    const available = await catalog(authorization), prepared = [];
    const published = await snapshot();
    if (getSnapshotFreshness(published, { now: new Date(now()) }).stale) return { catalog: available, prepared };
    // Small source-owned context, not a second warehouse or an intent router.
    // Missing/partial snapshots simply leave the normal investigation available.
    /** @type {Array<{capability:string,input:Record<string,any>}>} */
    const candidates = [{ capability: 'resident-flow', input: { view: 'occupancy' } }];
    if (authorization.grant.detail && authorization.grant.slices.includes('resident_profile')) {
      candidates.push({ capability: 'platform-data', input: { slice: 'resident_profile', operation: 'statistics', measure: 'Age', groupBy: ['Facility_Name'], dateField: null } });
    }
    for (const candidate of candidates.filter(step => authorization.grant.capabilities.includes(step.capability))) {
      const step = { id: `source-${prepared.length + 1}`, ...candidate };
      const value = await collect(step);
      if (value?.status === 'verified' && value.coverage === 'complete' &&
          !getSnapshotFreshness({ generated_at: value.observedAt }, { now: new Date(now()) }).stale) prepared.push({ step, value });
    }
    return { catalog: available, prepared };
  }
  return { catalog, read, prepare };
}
