import { assertId, expected, fail, latest, permission, predicates, reviewNote, shape, draftNodes, proposalFreshness } from "./model.mjs";

export function mutateConnection(state, catalog, context, id, input) {
  assertId(id);
  shape(input, ["action", "expectedRevision", "draftId", "draftRevision", "targetId", "targetFingerprint", "snapshotId", "predicate", "quote", "quoteStart", "rationale", "note"]);
  const previous = latest(state.proposals[id]);
  expected(previous?.revision ?? 0, input.expectedRevision);
  const timestamp = new Date().toISOString(), nodes = [...catalog.nodes, ...draftNodes(state)];
  let record;
  if (input.action === "propose") {
    permission(context, "contribute");
    if (previous) fail(409, "already_exists", "Refresh connections to inspect the accepted proposal.");
    assertId(input.draftId);
    const source = latest(state.documents[input.draftId]);
    if (!source || source.state !== "draft" || source.revision !== input.draftRevision) fail(409, "draft_changed", "Save and load the current draft before connecting it.");
    if (typeof input.quote !== "string" || !input.quote.trim() || input.quote.length > 1000 || !Number.isSafeInteger(input.quoteStart) || input.quoteStart < 0 || source.content.body.slice(input.quoteStart, input.quoteStart + input.quote.length) !== input.quote) fail(400, "invalid_quote", "The quotation must exactly match the saved instructions.");
    if (catalog.id !== input.snapshotId) fail(409, "catalog_changed", "Refresh knowledge before connecting it.");
    const target = nodes.find(node => node.id === input.targetId);
    if (!target || target.fingerprint !== input.targetFingerprint) fail(409, "target_changed", "Refresh the connected entity.");
    if (target.id === `draft:${source.id}` || !Object.hasOwn(predicates, input.predicate) || !predicates[input.predicate].includes(target.type)) fail(400, "invalid_relationship", "Choose a supported relationship and target.");
    record = { schemaVersion: 1, id, revision: 1, status: "proposed", predicate: input.predicate, targetId: target.id, targetTitle: target.title,
      targetFingerprint: target.fingerprint, targetSnapshotId: catalog.id, targetEvidence: target.evidence,
      source: { draftId: source.id, revision: source.revision, contentHash: source.contentHash, quote: input.quote, quoteStart: input.quoteStart },
      rationale: reviewNote(input.rationale), actor: context.actor, scope: context.scope, createdAt: timestamp, updatedAt: timestamp, approval: null };
  } else {
    shape(input, ["action", "expectedRevision", "note"]);
    if (!["approve", "reject", "withdraw"].includes(input.action)) fail(400, "invalid_action", "Unsupported connection decision.");
    permission(context, input.action === "withdraw" ? "contribute" : "review");
    if (!previous || ["withdrawn", "rejected"].includes(previous.status)) fail(409, "connection_closed", "That connection is unavailable or already closed.");
    if (input.action === "approve" && (previous.status !== "proposed" || proposalFreshness(state, previous, nodes).freshness !== "current")) fail(409, "stale_evidence", "Approve only a current proposal. Create a new one if its evidence changed.");
    const note = input.action === "withdraw" ? "Withdrawn by contributor." : reviewNote(input.note);
    record = { ...previous, revision: previous.revision + 1, status: input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "withdrawn", updatedAt: timestamp, actor: context.actor,
      approval: input.action === "approve" ? { actor: context.actor, at: timestamp, note } : previous.approval, note };
    if (record.status !== "approved") {
      for (const history of Object.values(state.publications)) {
        const publication = latest(history);
        if (publication.connections.some(connection => connection.id === id) && !state.retractions[publication.id]) state.retractions[publication.id] = { at: timestamp, actor: context.actor, note: "A published connection was withdrawn or rejected." };
      }
    }
  }
  state.proposals[id] ??= []; state.proposals[id].push(record);
}
