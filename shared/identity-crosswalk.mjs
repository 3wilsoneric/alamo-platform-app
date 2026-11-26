import { ALAMO_FACILITIES } from './community-names.mjs';

// One key per community and per resident across the suite (ADR 0015).
// Community: the ElderMark facility number. Platform, ElderMark and Carelog use
// it directly (Carelog FacilityDirectory: "the facility id used by the Alamo
// platform and the legacy source system"); Pipeline stores community names, so
// its exact names are mapped here and checked against Pipeline's enum.
// Resident: `<facility>:<ElderMark resident number>` (Platform resident_key).
// Resident numbers are unique only within a facility; one person who moved
// communities can hold two keys. Links are recorded by each owner, never inferred
// from names here: Carelog stays (ExternalResidentId), Pipeline confirmed
// resident links (census reconciliation or staff review).
export const PIPELINE_COMMUNITY_BY_FACILITY = Object.freeze({ '337': 'San Pablo', '342': "Victoria's House", '343': 'JC Wallace', '344': 'Turlock', '345': 'Santa Clarita' });
export const PIPELINE_UNASSIGNED = 'Unassigned';

export const COMMUNITY_CROSSWALK = Object.freeze(ALAMO_FACILITIES.map(facility => Object.freeze({
  facilityId: facility.facilityId, name: facility.communityName, shortName: facility.shortName, code: facility.code,
  eldermarkFacility: facility.facilityId, carelogFacilityId: facility.facilityId, pipelineCommunity: PIPELINE_COMMUNITY_BY_FACILITY[facility.facilityId] ?? null,
})));

const FACILITY_BY_PIPELINE = new Map(COMMUNITY_CROSSWALK.map(row => [row.pipelineCommunity?.toLowerCase(), row.facilityId]));
/** Exact Pipeline community name → facility id; null for Unassigned or an unknown name. */
export const facilityForPipelineCommunity = name => typeof name === 'string' ? FACILITY_BY_PIPELINE.get(name.trim().replace(/’/g, "'").toLowerCase()) ?? null : null;

const RESIDENT_KEY = /^(\d{1,6}):([A-Za-z0-9_-]{1,40})$/;
/** @param {string} facilityId @param {string|number} residentNumber */
export function residentKey(facilityId, residentNumber) {
  const key = `${String(facilityId).trim()}:${String(residentNumber).trim()}`;
  if (!RESIDENT_KEY.test(key)) throw Error('A resident key is <facility>:<ElderMark resident number>.');
  return key;
}
/** @param {string} key */
export function parseResidentKey(key) {
  const match = typeof key === 'string' ? RESIDENT_KEY.exec(key) : null;
  return match ? { facilityId: match[1], residentNumber: match[2] } : null;
}
