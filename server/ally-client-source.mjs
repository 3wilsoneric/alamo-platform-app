import { reportHash, reportObject, reportText } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { ALAMO_FACILITIES } from '../shared/community-names.mjs';
import { readPlatformClientDatabase, readPlatformClientIntelligence } from './platform-snapshot.mjs';
import { buildPipelineClinicalApiResponse, buildPipelineClinicalIntelligenceResponse, PIPELINE_CLINICAL_API_PREFIX } from './pipeline-clinical-api.mjs';

export const CLIENT_READ_VIEWS = ['directory', 'profile', 'episodes', 'facts', 'documents', 'document-search', 'document-text', 'fact-evidence'];

// Reuse the source owner's identity, extraction, QA and document projections.
// This adapter has no record-write path and accepts IDs, never remote URLs.
/** @returns {Promise<Record<string, any>>} */
export async function readAllyClientRecords(args, { snapshot, communities, now = Date.now,
  database = readPlatformClientDatabase, intelligence = readPlatformClientIntelligence }) {
  reportObject(args, ['view'], ['clientId','query','cursor','limit','field','documentId','page','offset','revision']);
  if (!CLIENT_READ_VIEWS.includes(args.view)) throw Error('Choose a registered client record view.');
  const limit = args.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw Error('Choose 1–20 records per page.');
  for (const key of ['clientId','documentId','cursor','revision','field']) if (args[key] !== undefined) reportText(args[key], key === 'cursor' ? 2000 : 256);
  if (args.query !== undefined) reportText(args.query, 200);
  const db = await database(snapshot);
  const timestamp = new Date(now());
  const url = new URL(PIPELINE_CLINICAL_API_PREFIX + '/clients', 'https://platform.invalid');
  url.searchParams.set('limit', String(limit));
  if (args.cursor) url.searchParams.set('cursor', args.cursor);
  if (args.query) url.searchParams.set('q', args.query);
  const selectedCommunities = ALAMO_FACILITIES.filter(f => communities.includes(f.facilityId)).map(f => f.shortName);
  if (args.view === 'directory') {
    return buildPipelineClinicalApiResponse(snapshot, url, timestamp, db, { selectedCommunities }).body;
  }
  if (!args.clientId) throw Error('Find the canonical client ID in the directory before opening a record.');
  url.pathname += '/' + encodeURIComponent(args.clientId);
  const record = buildPipelineClinicalApiResponse(snapshot, url, timestamp, db).body;
  if (!('client' in record)) throw Error('Client detail response is unavailable.');
  const { client, ...metadata } = record;
  // Detail grants cover the whole organization. The query cohort still controls
  // which client is selected; their explicitly dated history remains intact.
  const matching = new URL(PIPELINE_CLINICAL_API_PREFIX + '/clients', url);
  matching.searchParams.set('q', args.clientId);
  matching.searchParams.set('limit', '200');
  const selected = buildPipelineClinicalApiResponse(snapshot, matching, timestamp, db, { selectedCommunities }).body;
  if (!('clients' in selected)) throw Error('Client directory response is unavailable.');
  if (!selected.clients.some(row => row.canonical_client_id === args.clientId)) throw Error('Client is outside this query population.');
  const revision = reportHash({ snapshot: metadata.snapshot_id, database: metadata.client_database });
  if (args.revision !== undefined && args.revision !== revision) throw Error('The client source changed; restart from the first page.');
  const identity = { canonical_client_id: client.canonical_client_id, display_name: client.display_name, community_names: client.community_names, current_resident: client.current_resident };
  const base = { ...metadata, revision, client: identity };
  if (args.view === 'document-search' || args.view === 'fact-evidence') {
    if (args.view === 'fact-evidence' && !args.field) throw Error('Choose the fact field from the client facts.');
    url.pathname += args.view === 'document-search' ? '/search' : '/facts/' + encodeURIComponent(args.field) + '/evidence';
    if (args.documentId) url.searchParams.set('document_id', args.documentId);
    const extracted = await intelligence(db, args.clientId);
    if (!extracted) return { ...base, unavailable: 'Document text has not been published for this client.' };
    const response = buildPipelineClinicalIntelligenceResponse(snapshot, url, timestamp, db, extracted);
    if (!response) throw Error('Client intelligence response is unavailable.');
    return { ...response.body, revision };
  }
  const offset = args.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000 || offset && !args.revision) throw Error('Continuation needs a valid offset and the previous source revision.');
  if (args.view === 'document-text') {
    const document = client.source_documents.find(doc => doc.document_id === args.documentId);
    if (!document) throw Error('Choose a document ID from this client’s documents.');
    if (!Number.isInteger(args.page) || args.page < 1 || args.page > 10000) throw Error('Choose a document page number.');
    const extracted = await intelligence(db, args.clientId);
    const page = extracted?.pages.find(row => row.document_id === args.documentId && row.page_number === args.page);
    if (!page) return { ...base, unavailable: 'Extracted text is unavailable for this document page; this does not mean the document is empty.' };
    if (offset > page.text.length) throw Error('Text offset is outside this page.');
    const text = page.text.slice(offset, offset + 8000), end = offset + text.length;
    return { ...base, document, page: args.page, section: page.section ?? null, text, nextOffset: end < page.text.length ? end : null };
  }
  if (args.view === 'profile') {
    const fields = { identity: Object.fromEntries(Object.entries(client).filter(([key]) => !['resident_profile','resident_profiles','resident_episode_history','enrichment','source_documents','facts'].includes(key))),
      resident_profile: client.resident_profile, resident_profiles: client.resident_profiles, enrichment: client.enrichment };
    if (args.field && !Object.hasOwn(fields, args.field)) throw Error('Choose identity, resident_profile, resident_profiles or enrichment.');
    return { ...base, profile: args.field ? { [args.field]: fields[args.field] } : fields };
  }
  const rows = args.view === 'episodes' ? client.resident_episode_history : args.view === 'documents' ? client.source_documents : client.facts.filter(row => !args.field || row.field_name === args.field);
  if (offset > rows.length) throw Error('Record offset is outside this result.');
  return { ...base, [args.view]: rows.slice(offset, offset + limit), total: rows.length,
    nextOffset: offset + limit < rows.length ? offset + limit : null };
}
