import { COMMUNITY_CROSSWALK, parseResidentKey, residentKey } from '../shared/identity-crosswalk.mjs';

export const IDENTITY_VIEWS = ['communities', 'coverage', 'links', 'resolve'];
export const IDENTITY_PAGE = 100;

/**
 * Join owner-recorded links on the resident key. Keys and provenance only: no
 * names or birth dates. Nothing is matched here by name; a key without a link
 * is unlinked, not absent.
 * @param {{communities:string[], current:Iterable<string>, known:Iterable<string>,
 *   carelog: {links:Array<{clientId:string,facilityId:string,residentNumber:string}>, ambiguousKeys:number} | null,
 *   pipeline: {links:Array<{residentKey:string,clientId:string,referralId:number|null,matchMethod:string|null}>} | null}} input
 */
export function buildIdentityLinks({ communities, current, known, carelog, pipeline }) {
  const allowed = new Set(communities), currentKeys = new Set(current), knownKeys = new Set(known);
  /** @type {Map<string, any>} */
  const entries = new Map();
  const entry = key => {
    let value = entries.get(key);
    if (!value) entries.set(key, value = { residentKey: key, facilityId: parseResidentKey(key)?.facilityId ?? null, onCurrentRoster: currentKeys.has(key),
      inPlatformHistory: knownKeys.has(key) || currentKeys.has(key), carelogClientId: null, pipelineClientIds: [], pipelineReferralIds: [], pipelineMatchMethods: [] });
    return value;
  };
  const inScope = key => allowed.has(parseResidentKey(key)?.facilityId ?? '');
  for (const key of currentKeys) if (inScope(key)) entry(key);
  for (const link of carelog?.links ?? []) {
    let key; try { key = residentKey(link.facilityId, link.residentNumber); } catch { continue; }
    if (inScope(key)) entry(key).carelogClientId = link.clientId;
  }
  for (const link of pipeline?.links ?? []) {
    if (!parseResidentKey(link.residentKey) || !inScope(link.residentKey)) continue;
    const value = entry(link.residentKey);
    if (!value.pipelineClientIds.includes(link.clientId)) value.pipelineClientIds.push(link.clientId);
    if (link.referralId !== null && !value.pipelineReferralIds.includes(link.referralId)) value.pipelineReferralIds.push(link.referralId);
    if (link.matchMethod && !value.pipelineMatchMethods.includes(link.matchMethod)) value.pipelineMatchMethods.push(link.matchMethod);
  }
  const rows = [...entries.values()].sort((a, b) => a.residentKey < b.residentKey ? -1 : a.residentKey > b.residentKey ? 1 : 0);
  const sources = { platform: 'available', carelog: carelog ? 'available' : 'unavailable', pipeline: pipeline ? 'available' : 'unavailable' };

  function coverage() {
    const byCommunity = COMMUNITY_CROSSWALK.filter(row => allowed.has(row.facilityId)).map(community => {
      const list = rows.filter(row => row.facilityId === community.facilityId), cur = list.filter(row => row.onCurrentRoster);
      return { facilityId: community.facilityId, community: community.shortName,
        currentResidents: cur.length,
        currentWithCarelogLink: carelog ? cur.filter(row => row.carelogClientId).length : null,
        currentWithPipelineLink: pipeline ? cur.filter(row => row.pipelineClientIds.length).length : null,
        currentWithBothLinks: carelog && pipeline ? cur.filter(row => row.carelogClientId && row.pipelineClientIds.length).length : null,
        carelogLinkedKeys: carelog ? list.filter(row => row.carelogClientId).length : null,
        carelogKeysNotInPlatform: carelog ? list.filter(row => row.carelogClientId && !row.inPlatformHistory).length : null,
        pipelineLinkedKeys: pipeline ? list.filter(row => row.pipelineClientIds.length).length : null,
        pipelineKeysNotInPlatform: pipeline ? list.filter(row => row.pipelineClientIds.length && !row.inPlatformHistory).length : null };
    });
    const sum = field => byCommunity.some(row => row[field] === null) ? null : byCommunity.reduce((total, row) => total + row[field], 0);
    const fields = ['currentResidents', 'currentWithCarelogLink', 'currentWithPipelineLink', 'currentWithBothLinks', 'carelogLinkedKeys', 'carelogKeysNotInPlatform', 'pipelineLinkedKeys', 'pipelineKeysNotInPlatform'];
    return { sources, byCommunity, total: Object.fromEntries(fields.map(field => [field, sum(field)])),
      carelogAmbiguousKeysExcluded: carelog ? carelog.ambiguousKeys : null,
      meaning: 'Counts of resident keys (<facility>:<ElderMark resident number>), not people: one person who moved communities holds two keys. Pipeline links exist only for referrals confirmed against the census, so current residents who did not arrive through Pipeline have none. A key not in Platform history is a link to a record Platform does not publish (e.g. excluded or non-countable).' };
  }

  /** @param {{offset?:number, linked?:string}} [options] */
  function links({ offset = 0, linked } = {}) {
    const filtered = rows.filter(row => linked === undefined || (linked === 'carelog' ? row.carelogClientId : linked === 'pipeline' ? row.pipelineClientIds.length : linked === 'none' ? !row.carelogClientId && !row.pipelineClientIds.length : true));
    const page = filtered.slice(offset, offset + IDENTITY_PAGE);
    return { sources, total: filtered.length, offset, nextOffset: offset + page.length < filtered.length ? offset + page.length : null, rows: page };
  }

  /** @param {{residentKey?:string, pipelineReferralId?:number, pipelineClientId?:string, carelogClientId?:string}} query */
  function resolve(query) {
    const matches = rows.filter(row => query.residentKey !== undefined ? row.residentKey === query.residentKey
      : query.pipelineReferralId !== undefined ? row.pipelineReferralIds.includes(query.pipelineReferralId)
      : query.pipelineClientId !== undefined ? row.pipelineClientIds.includes(query.pipelineClientId)
      : query.carelogClientId !== undefined ? row.carelogClientId === query.carelogClientId : false).slice(0, 10);
    return { sources, matches, found: matches.length > 0 };
  }

  return { coverage, links, resolve };
}
