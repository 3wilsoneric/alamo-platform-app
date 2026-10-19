import { buildKnowledgeCatalog, atPointer, compareKnowledgeCatalogs } from "./catalog.mjs";
import { assertId, documentDetail, draftNodes, fail, hash, latest, permission, predicates, proposalFreshness, shape } from "./model.mjs";
import { mutateDocument } from "./documents.mjs";
import { mutateConnection } from "./connections.mjs";

function initialState(scope) {
  return { schemaVersion: 1, revision: 0, scope, documents: {}, proposals: {}, publications: {}, retractions: {}, snapshots: {}, sources: {} };
}
function validateState(state, context) {
  if (state.schemaVersion !== 1 || state.scope?.tenantId !== context.scope.tenantId || state.scope?.workspace !== "workflow") fail(503, "workflow_storage_invalid", "Workflow storage failed its scope or schema check.");
  for (const key of ["documents", "proposals", "publications", "retractions", "snapshots", "sources"]) {
    if (!state[key] || typeof state[key] !== "object" || Array.isArray(state[key])) fail(503, "workflow_storage_invalid", "Workflow storage failed its integrity check.");
  }
}
function proposalDetail(state, id) {
  assertId(id);
  if (!state.proposals[id]?.length) fail(404, "proposal_missing", "That connection was not found.");
  return { proposal: latest(state.proposals[id]), history: [...state.proposals[id]].reverse() };
}
function revision(state, id, number) {
  assertId(id);
  if (!Number.isSafeInteger(number) || number < 1) fail(400, "invalid_revision", "Choose a valid document revision.");
  const doc = state.documents[id]?.find(item => item.revision === number);
  if (!doc) fail(404, "draft_not_found", "That document revision was not found.");
  return doc;
}
function sourceEvidence(state, snapshotId, anchor, title) {
  const snapshot = state.snapshots[snapshotId], manifest = snapshot?.sources.find(source => source.id === anchor.sourceId && source.digest === anchor.digest);
  if (!manifest) fail(404, "evidence_missing", "That source revision was not found.");
  const text = state.sources[manifest.digest];
  if (typeof text !== "string" || hash(text) !== manifest.digest) fail(503, "source_integrity", "Source evidence failed its integrity check.");
  const value = atPointer(JSON.parse(text), anchor.pointer);
  if (value === undefined || hash(value) !== anchor.valueHash) fail(503, "source_integrity", "The cited value failed its integrity check.");
  return { title, reference: `${manifest.path} · revision ${manifest.revision}`, digest: manifest.digest, pointer: anchor.pointer,
    excerpt: typeof value === "string" ? value : JSON.stringify(value, null, 2), status: "draft-reference" };
}
function targetEvidence(state, connection) {
  const anchor = connection.targetEvidence;
  if (!anchor.draftId) return sourceEvidence(state, connection.targetSnapshotId, anchor, connection.targetTitle);
  const doc = revision(state, anchor.draftId, anchor.revision);
  return { title: doc.content.title, reference: `Draft revision ${doc.revision}`, pointer: "/content", excerpt: JSON.stringify(doc.content, null, 2), status: doc.state };
}
function quoteEvidence(state, connection) {
  const doc = revision(state, connection.source.draftId, connection.source.revision), source = connection.source;
  if (doc.contentHash !== source.contentHash || doc.content.body.slice(source.quoteStart, source.quoteStart + source.quote.length) !== source.quote) fail(503, "source_integrity", "The saved quotation failed its integrity check.");
  return { title: doc.content.title, reference: `Draft revision ${doc.revision}`, pointer: `/content/body [${source.quoteStart}:${source.quoteStart + source.quote.length}]`,
    excerpt: source.quote, status: connection.status, rationale: connection.rationale };
}
function evidence(state, input) {
  shape(input, ["snapshotId", "nodeId", "edgeId", "proposalId", "side"]);
  const selectors = ["nodeId", "edgeId", "proposalId"].filter(key => input[key] !== undefined);
  if (selectors.length !== 1 || typeof input[selectors[0] ?? ""] !== "string" || (input.side !== undefined && !["source", "target"].includes(input.side))) fail(400, "invalid_input", "Choose one evidence record.");
  if (input.proposalId) {
    const connection = proposalDetail(state, input.proposalId).proposal;
    return input.side === "target" ? targetEvidence(state, connection) : quoteEvidence(state, connection);
  }
  if (input.nodeId?.startsWith("draft:")) {
    const doc = documentDetail(state, input.nodeId.slice(6)).document;
    return { title: doc.content.title, reference: `Draft revision ${doc.revision}`, pointer: "/content", excerpt: JSON.stringify(doc.content, null, 2), status: doc.state };
  }
  const snapshot = state.snapshots[input.snapshotId];
  const record = input.edgeId ? snapshot?.edges.find(edge => edge.id === input.edgeId) : snapshot?.nodes.find(node => node.id === input.nodeId);
  if (!record) fail(404, "evidence_missing", "That evidence was not found.");
  return sourceEvidence(state, input.snapshotId, record.evidence, record.title ?? record.predicate);
}
function graph(state, catalog) {
  const nodes = [...catalog.nodes, ...draftNodes(state)];
  const proposals = Object.values(state.proposals).map(history => { const item = latest(history); return { ...item, ...proposalFreshness(state, item, nodes) }; });
  const edges = [...catalog.edges, ...proposals.filter(item => ["proposed", "approved"].includes(item.status)).map(item => ({ id: `proposal:${item.id}`, from: `draft:${item.source.draftId}`, to: item.targetId,
    predicate: item.predicate, status: item.status, origin: "proposal", grounding: item.status === "approved" ? "reviewed-connection" : "author-proposed", freshness: item.freshness, proposalId: item.id }))];
  return { schemaVersion: 1, mode: "platform-owner-pilot", snapshot: { id: catalog.id, capturedAt: state.snapshots[catalog.id].capturedAt, sources: catalog.sources }, nodes, edges, proposals,
    archives: Object.values(state.snapshots).map(item => ({ id: item.id, capturedAt: item.capturedAt })).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)), predicates };
}
function published(state, catalog, id, expectedHash) {
  assertId(id);
  const publication = latest(state.publications[id]);
  if (!publication) fail(404, "publication_missing", "That document has not been published.");
  if (state.retractions[publication.id]) fail(410, "publication_retracted", "This publication was retracted.");
  if (expectedHash && publication.document.contentHash !== expectedHash) fail(409, "publication_changed", "This document has a newer publication. Refresh its citation.");
  const citations = publication.connections.map(connection => {
    if (connection.targetEvidence.draftId) {
      const target = latest(state.publications[connection.targetEvidence.draftId]);
      if (!target || state.retractions[target.id] || target.document.contentHash !== connection.targetFingerprint) fail(409, "publication_evidence_changed", "A referenced publication changed or was retracted. Review this publication.");
    } else if (!catalog.nodes.some(node => node.id === connection.targetId && node.fingerprint === connection.targetFingerprint)) fail(409, "publication_evidence_changed", "A referenced library source changed. Review this publication.");
    return { connectionId: connection.id, predicate: connection.predicate, review: connection.approval, source: quoteEvidence(state, connection), target: targetEvidence(state, connection) };
  });
  return { schemaVersion: 1, publication, citations, status: "published", scope: state.scope };
}

export function createWorkflowService({ persistence, readSources }) {
  return async function request(context, method, pathname, input = {}, query = new URLSearchParams(), readAttempt = 0) {
    permission(context, "read");
    const sources = await readSources(), catalog = buildKnowledgeCatalog(sources);
    const loaded = await persistence.read(context.scope);
    const state = loaded.value === null ? initialState(context.scope) : structuredClone(loaded.value);
    validateState(state, context);
    let changed = false;
    if (!state.snapshots[catalog.id]) {
      state.snapshots[catalog.id] = { ...catalog, capturedAt: new Date().toISOString() };
      for (const source of sources) state.sources[hash(source.text)] = source.text;
      changed = true;
    }
    let result;
    const draftMatch = /^\/drafts\/([^/]+)$/.exec(pathname), proposalMatch = /^\/knowledge\/proposals\/([^/]+)$/.exec(pathname), publicationMatch = /^\/published\/([^/]+)$/.exec(pathname);
    if (method === "GET" && pathname === "/session") result = { mode: "platform-owner-pilot", storage: persistence.kind, actor: context.actor, scope: context.scope, permissions: context.permissions };
    else if (method === "GET" && pathname === "/drafts") result = { mode: "platform-owner-pilot", documents: Object.values(state.documents).map(history => { const doc = latest(history); return { id: doc.id, revision: doc.revision, state: doc.state, updatedAt: doc.updatedAt, title: doc.content.title, kind: doc.content.kind, audience: doc.content.audience }; }) };
    else if (draftMatch && method === "GET") result = query.has("revision") ? revision(state, draftMatch[1], Number(query.get("revision"))) : documentDetail(state, draftMatch[1]);
    else if (draftMatch && method === "PUT") { mutateDocument(state, catalog, context, draftMatch[1], input); result = documentDetail(state, draftMatch[1]); changed = true; }
    else if (method === "GET" && pathname === "/knowledge") result = graph(state, catalog);
    else if (method === "POST" && pathname === "/knowledge/evidence") result = evidence(state, input);
    else if (method === "GET" && pathname === "/knowledge/impact") {
      const before = state.snapshots[query.get("baseline") ?? ""];
      if (!before) fail(404, "snapshot_missing", "That snapshot was not found.");
      result = compareKnowledgeCatalogs(before, catalog);
    }
    else if (proposalMatch && method === "GET") result = proposalDetail(state, proposalMatch[1]);
    else if (proposalMatch && method === "PUT") { mutateConnection(state, catalog, context, proposalMatch[1], input); result = proposalDetail(state, proposalMatch[1]); changed = true; }
    else if (method === "GET" && pathname === "/published") result = { documents: Object.keys(state.publications).flatMap(id => { const item = latest(state.publications[id]); return state.retractions[item.id] ? [] : [{ id, title: item.document.content.title, contentHash: item.document.contentHash, publishedAt: item.publishedAt }]; }) };
    else if (method === "GET" && publicationMatch) result = published(state, catalog, publicationMatch[1], query.get("revision"));
    else fail(404, "route_missing", "That Workflow operation is not available.");
    if (changed) {
      state.revision += 1;
      try { await persistence.write(context.scope, state, loaded.version); }
      catch (error) {
        if (method !== "PUT" && readAttempt < 2 && error && typeof error === "object" && "code" in error && error.code === "revision_conflict") return request(context, method, pathname, input, query, readAttempt + 1);
        throw error;
      }
    }
    return result;
  };
}
