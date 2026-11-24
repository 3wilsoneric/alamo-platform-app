// Installed inside ProForma's owning runtime. The callbacks are its canonical
// projections, retrieval, retained-original reader and exact-citation reader.
// This reader cannot write state or call a language model.
export function createAnalystReader({ load, assertCurrent, sources, originals, retrieve, evidence }) {
  return async input => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key =>
      !['view','sourceMode','query','processId','citation','offset','revision'].includes(key))) throw Error('Choose a ProForma analytical read.');
    const view = input.view ?? 'catalog', sourceMode = input.sourceMode ?? 'current', offset = input.offset ?? 0;
    if (!['catalog','search','read'].includes(view) || !['current','working','published'].includes(sourceMode)
      || !Number.isSafeInteger(offset) || offset < 0 || offset > 2_000_000
      || input.query !== undefined && (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 500)
      || input.processId !== undefined && (typeof input.processId !== 'string' || input.processId.length > 250)) throw Error('Choose valid ProForma read parameters.');
    const loaded = await load();
    const revision = loaded.sourceStateFingerprint;
    if (input.revision !== undefined && input.revision !== revision || offset > 0 && input.revision !== revision) throw Error('ProForma changed. Restart this source read.');
    let result;
    if (view === 'read') {
      // The owner's reader verifies saved revision, fingerprint, source pointer,
      // publication status and retained bytes. No model-supplied URL is opened.
      const record = await evidence(input.citation);
      if (typeof record.excerpt !== 'string') throw Error('ProForma evidence has no text.');
      result = { title:record.title, status:record.status, citation:record.citation ?? input.citation, format:record.format ?? 'record',
        excerpt:record.excerpt.slice(offset,offset+8000), characters:record.excerpt.length,
        nextOffset:offset+8000<record.excerpt.length ? offset+8000 : null };
    } else if (view === 'catalog') {
      const selected = sources(loaded,sourceMode);
      const terms = (input.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const records = selected.records.filter(row => (!input.processId || row.id === input.processId)
        && terms.every(term => `${row.title} ${row.type}`.toLowerCase().includes(term))).sort((a,b)=>a.id.localeCompare(b.id));
      result = { documents:records.slice(offset,offset+20).map(row=>({ id:row.id,title:row.title,type:row.type,status:row.status,grounding:row.grounding,
        citation:row.citation, ...(row.excludedReason ? {excludedReason:row.excludedReason} : {}) })), matchedCount:records.length,
        nextOffset:offset+20<records.length ? offset+20 : null };
    } else {
      if (!input.query) throw Error('Enter a ProForma search.');
      const selected = sources(loaded,sourceMode);
      const withOriginals = {...loaded, originals:await originals(selected.records,input.processId)};
      const search = retrieve(withOriginals,{question:input.query,processId:input.processId,sourceMode});
      result = { evidence:search.evidence.slice(offset,offset+4), missing:search.missing, excluded:search.excluded,
        contextFingerprint:search.contextFingerprint, limits:search.limits,
        nextOffset:offset+4<search.evidence.length ? offset+4 : null,
        meaning:'Relevant excerpts, not every matching passage. Use a cited record for its full text. Draft, withdrawn and source-reference material is not approved guidance.' };
    }
    await assertCurrent();
    return {schemaVersion:1,producer:'ProForma',revision,view,sourceMode,...result};
  };
}
