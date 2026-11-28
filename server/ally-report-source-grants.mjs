import { reportHash, reportObject, reportSubject, validateReportScope } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';
import { ALAMO_FACILITIES } from '../shared/community-names.mjs';
import { createHttpError } from './http-error-contract.mjs';
import { planAllyMetricQuery, METRIC_SLICE_ALIASES } from './ally-data-source.mjs';
import { planDayMeasures } from './ally-measures.mjs';

const facilities = new Set(ALAMO_FACILITIES.map(f => f.facilityId));
export const REPORT_CAPABILITIES = ['platform-data', 'data-catalog', 'client-records', 'carelog-records', 'proforma-records', 'pipeline-records', 'incident-summary', 'resident-flow', 'pipeline-summary', 'licensing-search', 'proforma-search', 'identity-links', 'measures'];
export const REPORT_AGGREGATE_SLICES = new Set(['community_operating_summary', 'incident_monthly_by_community_category', 'census_monthly_by_community', 'census_weekly_by_community', 'resident_flow_weekly_by_community', 'resident_flow_monthly_by_community', 'current_resident_county_by_community', 'mar_daily_by_community_90d', 'census_daily_by_community']);
// Each slice needs its own grant entry; no grant implies another slice.
/** @param {{slices:string[]}} grant @param {string} slice */
export const grantHasSlice = (grant, slice) => grant.slices.includes(slice);
const deny = () => { throw createHttpError(403, 'report_source_denied', 'This report source is unavailable for the requested scope.'); };
// Aggregate access cannot be turned into a named-person lookup by grouping or
// probing a private field. New dimensions require a source-owner review here.
const dimensions = new Set(['facility_id','Facility','facility','FacilityID','Facility_Name','facility_name','community','community_name','month','month_bucket','census_month','incident_month','medication_month','census_date','as_of_date','week','week_start','week_end','incident_date','administration_date','severity','category','incident_category','Incident_Category','status','county','admission_county','client_county']);
// Exact numeric columns from the governed publisher. Do not infer permission
// from a field suffix or an observed numeric value; private columns stay closed.
const measures = new Set(['census','prior_census','census_delta','admissions','discharges','net','net_change','occupied_bed_days','bed_days','resident_count','resident_rows','incident_count','incidents','count','total','service_count','refusal_count','scheduled_count','completed_count','given_count','not_given_count','pending_count','missed_count','late_given_count','refused_count','held_count','other_not_given_count','prn_given_count','average_age','average_los_days','incidents_per_100_residents','compliance_pct','documentation_gap_rows','largest_documentation_gap_days']);
export const reportAggregateFields = fields => fields.filter(field => dimensions.has(field) || measures.has(field));
export const reportNumericField = field => measures.has(field);

export function authorizePlatformReportSource(identity, input, registry, now = Date.now()) {
  reportObject(registry, ['version', 'grants']);
  if (registry.version !== 1 || !Array.isArray(registry.grants) || registry.grants.length > 30) throw Error('Invalid report source registry.');
  const ids = new Set();
  for (const grant of registry.grants) {
    reportObject(grant, ['id', 'clientId', 'principalId', 'subjectId', 'communityIds', 'capabilities', 'slices', 'detail', 'expiresAt', 'revoked']);
    for (const key of ['clientId', 'principalId', 'subjectId']) reportSubject(grant[key]);
    if (typeof grant.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(grant.id) || ids.has(grant.id) || typeof grant.detail !== 'boolean' || typeof grant.revoked !== 'boolean' ||
        !Number.isFinite(Date.parse(grant.expiresAt)) || !Array.isArray(grant.communityIds) || !grant.communityIds.length || grant.communityIds.some(id => !facilities.has(id)) ||
        !Array.isArray(grant.capabilities) || grant.capabilities.some(id => !REPORT_CAPABILITIES.includes(id)) ||
        !Array.isArray(grant.slices) || grant.slices.length > 40 || grant.slices.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(id))) throw Error('Invalid report source registry.');
    ids.add(grant.id);
  }
  const scope = validateReportScope(input.scope);
  const communities = scope.communityIds.length ? scope.communityIds : [...facilities];
  if (identity.tenantId !== EVERYAGENT_TENANT || communities.some(id => !facilities.has(id))) deny();
  const matching = registry.grants.filter(g => g.clientId === identity.clientId && g.principalId === identity.principalId && g.subjectId === input.subjectId);
  if (matching.length !== 1) deny();
  const grant = matching[0];
  if (grant.revoked || Date.parse(grant.expiresAt) <= now || communities.some(id => !grant.communityIds.includes(id))) deny();
  if (input.step) {
    if (!grant.capabilities.includes(input.step.capability)) deny();
    // A client can have records in several communities. Full-record reads need
    // the organizational detail grant rather than leaking a cross-site history
    // through a narrower aggregate grant. Current executive readers have it.
    if (['client-records','carelog-records','proforma-records','pipeline-records'].includes(input.step.capability) && (!grant.detail || [...facilities].some(id => !grant.communityIds.includes(id)))) deny();
    if(input.step.capability==='pipeline-summary' && input.step.input?.view==='current-workspaces' && !grant.detail)deny();
    if(input.step.capability==='licensing-search' && input.step.input?.reportId!==undefined && !grant.detail)deny();
    // Resident keys and linked client ids are record identifiers; counts are not.
    if(input.step.capability==='identity-links' && ['links','resolve'].includes(input.step.input?.view) && !grant.detail)deny();
    // Governed measures read history slices; each must be granted like an aggregate read.
    if (input.step.capability === 'measures') {
      let plan; try { plan = planDayMeasures(input.step.input ?? {}, scope, communities); }
      catch (error) { const v = /** @type {any} */ (error); if (v?.code !== 'ally_metric_invalid') throw error; throw createHttpError(400, v.metricCode ?? 'query_invalid', 'Choose a valid measure query.', { field: `input.${String(v.field ?? 'query').replace(/^query\./, '')}`, allowed: v.allowed }); }
      for (const probe of plan.probes) allowPlatformDataQuery(grant, probe.input);
    }
    if (input.step.capability === 'platform-data') {
      const query = input.step.input;
      allowPlatformDataQuery(grant, query);
      // W3.2b: a metrics read is authorized as every aggregate read its plan
      // probes. The same check runs for read, read-batch, authorize and
      // authorize-batch, so revoking any probed slice denies the step.
      if (query.operation === 'metrics') for (const probe of planMetricRead(query, scope, communities).probes) allowPlatformDataQuery(grant, probe.input);
    }
  }
  return { grant, communities, receipt: { revision: reportHash(grant), expiresAt: grant.expiresAt, detail: grant.detail } };
}

function allowPlatformDataQuery(grant, query) {
  if (!grantHasSlice(grant, query?.slice) || query.groupBy !== undefined && !Array.isArray(query.groupBy)) deny();
  if (!grant.detail && (query.textExcerpt !== undefined || query.measureExpression !== undefined || query.operation === 'rows' && !REPORT_AGGREGATE_SLICES.has(query.slice) ||
      query.columns !== undefined && (!Array.isArray(query.columns) || query.columns.some(field=>!dimensions.has(field)&&!measures.has(field))) ||
      (query.groupBy ?? []).some(field => !dimensions.has(field)) ||
      query.filters !== undefined && (!Array.isArray(query.filters) || query.filters.some(filter => !dimensions.has(filter?.field))) ||
      query.dateField !== undefined && query.dateField !== null && !dimensions.has(query.dateField) ||
      query.measure !== undefined && !measures.has(query.measure))) deny();
}

/** Plan of a platform-data metrics read; its probes are the grant checks. Invalid plans are structured 400s. */
export function planMetricRead(query, scope, communities) {
  let plan;
  try { plan = planAllyMetricQuery(query.query, scope, communities); }
  catch (error) {
    const value = /** @type {any} */ (error);
    if (value?.code !== 'ally_metric_invalid') throw error;
    throw createHttpError(400, value.metricCode ?? 'query_invalid', 'Choose a valid metric query.', { field: `input.${value.field ?? 'query'}`, allowed: value.allowed });
  }
  if (!plan.slices.includes(query.slice) && !plan.slices.includes(METRIC_SLICE_ALIASES[query.slice])) throw createHttpError(400, 'metric_slice_mismatch', 'Set slice to the source of a requested metric.', { field: 'input.slice', allowed: plan.slices });
  return plan;
}
