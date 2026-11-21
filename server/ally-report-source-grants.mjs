import { reportHash, reportObject, reportSubject, validateReportScope } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';
import { ALAMO_FACILITIES } from '../shared/community-names.mjs';
import { createHttpError } from './http-error-contract.mjs';

const facilities = new Set(ALAMO_FACILITIES.map(f => f.facilityId));
export const REPORT_CAPABILITIES = ['platform-data', 'resident-flow', 'pipeline-summary', 'licensing-search', 'proforma-search'];
export const REPORT_AGGREGATE_SLICES = new Set(['community_operating_summary', 'incident_monthly_by_community_category', 'census_monthly_by_community', 'census_weekly_by_community', 'resident_flow_weekly_by_community', 'resident_flow_monthly_by_community', 'current_resident_county_by_community', 'mar_daily_by_community_90d']);
const deny = () => { throw createHttpError(403, 'report_source_denied', 'This report source is unavailable for the requested scope.'); };
// Aggregate access cannot be turned into a named-person lookup by grouping or
// probing a private field. New dimensions require a source-owner review here.
const dimensions = new Set(['facility_id','Facility','facility','FacilityID','community','community_name','month','month_bucket','census_date','week','week_start','incident_date','severity','category','incident_category','status','county','admission_county']);
const measures = new Set(['census','admissions','discharges','net','occupied_bed_days','bed_days','incident_count','count','total','service_count','refusal_count','scheduled_count','completed_count']);
export const reportAggregateFields = fields => fields.filter(field => dimensions.has(field) || measures.has(field));

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
    if (input.step.capability === 'platform-data') {
      const query = input.step.input;
      if (!grant.slices.includes(query?.slice) || query.groupBy !== undefined && !Array.isArray(query.groupBy)) deny();
      if (!grant.detail && (query.operation === 'rows' && !REPORT_AGGREGATE_SLICES.has(query.slice) ||
          (query.groupBy ?? []).some(field => !dimensions.has(field)) ||
          query.filters !== undefined && (!Array.isArray(query.filters) || query.filters.some(filter => !dimensions.has(filter?.field))) ||
          query.measure !== undefined && !measures.has(query.measure))) deny();
    }
  }
  return { grant, communities, receipt: { revision: reportHash(grant), expiresAt: grant.expiresAt } };
}
