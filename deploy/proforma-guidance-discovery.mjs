import { processHash } from './process-model.mjs';

export class GuidanceError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const invalid = () => { throw new GuidanceError(400, 'guidance_input', 'Choose bounded document IDs and a search query.'); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

// The caller's document IDs only narrow source-authorized data. They are never
// source grants, staff assignments or instructions to search private originals.
export function guidanceRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'documentIds,limit,query,schemaVersion' || value.schemaVersion !== 1 ||
    !Array.isArray(value.documentIds) || !value.documentIds.length || value.documentIds.length > 50 ||
    value.documentIds.some(id => typeof id !== 'string' || !uuid.test(id)) || new Set(value.documentIds).size !== value.documentIds.length ||
    typeof value.query !== 'string' || value.query.length > 500 || value.query.includes('\0') ||
    !Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 10) invalid();
  return { schemaVersion: 1, documentIds: [...value.documentIds].sort(), query: value.query.trim(), limit: value.limit };
}

export function guidanceHref(publicationId, fingerprint) {
  return `/workflow?${new URLSearchParams({ view: 'training', publication: publicationId, fingerprint })}`;
}

export function createGuidanceReader({ load, assertCurrent, scope, actorId }) {
  return async input => {
    const request = guidanceRequest(input);
    const result = discoverGuidance(await load(), request, scope, actorId);
    await assertCurrent();
    const current = discoverGuidance(await load(), request, scope, actorId);
    if (current.discoveryHash !== result.discoveryHash) throw new GuidanceError(409, 'source_changed', 'Published guidance changed during discovery. Retry against the current source.');
    await assertCurrent();
    return result;
  };
}

/** A projection of current publication evidence, never a second content store.
 * Missing, withdrawn and stale guides cannot become matches through a draft. */
export function discoverGuidance(loaded, raw, scope, actorId) {
  const request = guidanceRequest(raw), wanted = new Set(request.documentIds);
  const candidates = loaded.materials.filter(item => wanted.has(item.documentId) && item.status === 'current');
  if (new Set(candidates.map(item => item.documentId)).size !== candidates.length) throw new Error('Ambiguous publication heads');
  const terms = [...new Set(request.query.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? [])];
  const scored = candidates.map(item => {
    const title = item.title.toLocaleLowerCase('en-US');
    const body = [item.title, item.content.purpose, item.content.body].join(' ').toLocaleLowerCase('en-US');
    return { item, score: terms.reduce((n, term) => n + (title.includes(term) ? 3 : body.includes(term) ? 1 : 0), 0), matches: terms.every(term => body.includes(term)) };
  }).filter(entry => entry.matches).sort((a, b) => b.score - a.score || a.item.documentId.localeCompare(b.item.documentId));
  const documents = scored.slice(0, request.limit).map(({ item }) => ({
    source: { documentId: item.documentId, publicationId: item.id, fingerprint: item.fingerprint },
    title: item.title, kind: item.kind, status: 'published', contentRevision: item.contentRevision,
    publicationRevision: item.publicationRevision, publishedAt: item.publishedAt,
    view: { module: 'proforma.publication-reader', version: 1, href: guidanceHref(item.id, item.fingerprint) },
  }));
  // No source content or withdrawn titles are exposed through the unavailable list.
  const unavailableDocumentIds = request.documentIds.filter(id => !candidates.some(item => item.documentId === id));
  const result = { schemaVersion: 1, kind: 'proforma.guidance-discovery', producer: 'ProForma', scope, actorId,
    request, documents, matchedCount: scored.length, limited: scored.length > documents.length,
    unavailableDocumentIds, canExecute: false };
  return { ...result, discoveryHash: processHash(result) };
}
