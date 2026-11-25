import { reportObject, reportSubject } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';
import { projectNativeRecord, readNativeJsonResponse } from './ally-native-record.mjs';

// Reuse Pipeline's canonical source readers; the model cannot choose a host,
// credential, represented user, browser route or mutation.
export function createPipelineAnalystSource({ env = process.env, fetchImpl = fetch } = {}) {
  return async (args, { subjectId }) => {
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
}
