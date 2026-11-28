import { reportObject, reportSubject } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';
import { projectNativeRecord, readNativeJsonResponse } from './ally-native-record.mjs';

// Reuse Pipeline's canonical source readers; the model cannot choose a host,
// credential, represented user, browser route or mutation.
export function createPipelineAnalystSource({ env = process.env, fetchImpl = fetch } = {}) {
  // Confirmed Pipeline → resident-key links, every page; keys and provenance only.
  async function residentLinks(subjectId) {
    reportSubject(subjectId);
    const origin = env.ALLY_PIPELINE_ORIGIN, secret = env.PIPELINE_ALLY_SOURCE_SECRET;
    if (!origin || !secret) throw Error('Pipeline analytical reads are not connected.');
    if (new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin) throw Error('Invalid Pipeline analytical connection.');
    const links = []; let cursor;
    for (let page = 0; page < 50; page++) {
      const input = JSON.stringify({ view: 'resident-links', ...(cursor ? { cursor } : {}) });
      const response = await fetchImpl(`${origin}/api/integrations/platform/ally?${new URLSearchParams({ input })}`, { method:'GET', redirect:'error', signal:AbortSignal.timeout(10_000),
        headers:{authorization:`Bearer ${secret}`,'x-ally-subject':subjectId,'x-ally-tenant':EVERYAGENT_TENANT,accept:'application/json'} });
      const record = await readNativeJsonResponse(response, 'Pipeline');
      if (record?.owner !== 'pipeline' || record.view !== 'resident-links' || !Array.isArray(record.data?.records)) throw Error('Pipeline resident links are unavailable.');
      for (const link of record.data.records) {
        if (typeof link?.residentKey !== 'string' || !/^\d{1,6}:[A-Za-z0-9_-]{1,40}$/.test(link.residentKey) || typeof link.clientId !== 'string') throw Error('Pipeline returned an invalid resident link.');
        links.push({ residentKey: link.residentKey, clientId: link.clientId, referralId: Number.isSafeInteger(link.referralId) ? link.referralId : null, matchMethod: link.matchMethod ?? null });
      }
      cursor = record.data.next_cursor;
      if (!cursor) return { links };
    }
    throw Error('Pipeline resident links exceed the readable page budget.');
  }
  const read = async (args, { subjectId }) => {
    reportSubject(subjectId);
    reportObject(args, [], ['fields','from','through','dateField','referralRevision','view','referralId','referralIds','assessmentId','query','community','owner','month','workspaceStatus','cursor','sourceRevision','documentId','page','documentHash','pointer','paths','search','columns','offset','revision']);
    const { pointer, paths, search, columns, offset, revision, ...selection } = args;
    const origin = env.ALLY_PIPELINE_ORIGIN, secret = env.PIPELINE_ALLY_SOURCE_SECRET;
    if (!origin || !secret) throw Error('Pipeline analytical reads are not connected.');
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin) throw Error('Invalid Pipeline analytical connection.');
    const input = JSON.stringify(selection);
    if (Buffer.byteLength(input) > 6000) throw Error('Pipeline source selection is too large.');
    const response = await fetchImpl(`${origin}/api/integrations/platform/ally?${new URLSearchParams({ input })}`, {
      method:'GET', redirect:'error', signal:AbortSignal.timeout(10_000),
      headers:{authorization:`Bearer ${secret}`,'x-ally-subject':subjectId,'x-ally-tenant':EVERYAGENT_TENANT,accept:'application/json'},
    });
    const record = await readNativeJsonResponse(response, 'Pipeline');
    if (record?.schemaVersion !== 1 || record.owner !== 'pipeline' || record.view !== (selection.view ?? 'catalog') || typeof record.complete !== 'boolean' || !record.readAt) throw Error('Pipeline returned an invalid source record.');
    // Read time is transport metadata, not the version of the selected evidence.
    const { readAt, ...evidence } = record;
    // Native lists already have a page boundary. Return useful rows and their
    // cursor together instead of a wrapper preview requiring a second read.
    const list = (pointer === undefined || pointer === '/data/records') && paths === undefined && search === undefined && Array.isArray(evidence.data?.records);
    const { records: _records, ...page } = list ? evidence.data : {};
    const selectedPointer = pointer ?? (list ? '/data/records' : selection.view === 'assessment' ? '/data/record' : '/data');
    return { ...projectNativeRecord(evidence, { pointer:selectedPointer, paths, search, columns, offset, revision, path:record.view, parameters:selection }, 'Pipeline'),
      ...(list ? {page} : {}), readAt, sourceComplete:record.complete };
  };
  return Object.assign(read, { residentLinks });
}
