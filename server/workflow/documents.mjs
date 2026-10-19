import { randomUUID } from "node:crypto";
import { assertId, expected, fail, hash, latest, permission, requireComplete, reviewNote, shape, validateContent, draftNodes, proposalFreshness } from "./model.mjs";
import { captureToContent } from '../../src/features/workflow/legacy/src/lib/capture-contract.mjs';
import { captureEvidence, assertCaptureReferences } from './content-evidence.mjs';

export function mutateDocument(state, catalog, context, id, input) {
  assertId(id); shape(input, ["action", "expectedRevision", "content", "note", "proposalIds", "capture"]);
  const { action } = input;
  if (!["save", "submit", "reopen", "approve", "reject", "publish", "retract", "import_capture"].includes(action)) fail(400, "invalid_action", "Unsupported document action.");
  permission(context, ["approve", "reject"].includes(action) ? "review" : ["publish", "retract"].includes(action) ? "publish" : "contribute");
  if (action !== "save" && input.content !== undefined) fail(400, "invalid_input", "Save content separately from review decisions.");
  if (action !== "publish" && input.proposalIds !== undefined) fail(400, "invalid_input", "Choose connections only when publishing.");
  if (action !== 'import_capture' && Object.hasOwn(input, 'capture')) fail(400, 'invalid_input', 'Original capture evidence is attached only when importing a new document.');
  const history = state.documents[id] ?? [], previous = latest(history);
  let capture;
  if (action === 'import_capture') {
    if (input.expectedRevision !== 0 || input.note !== undefined) fail(400, 'invalid_input', 'A capture import creates a document at revision zero.');
    capture = captureEvidence(input.capture, id);
    if (previous) {
      if (previous.capture?.digest === capture.digest) return false;
      fail(409, 'capture_conflict', 'This capture ID already has different content. The saved document was not changed.');
    }
  }
  expected(previous?.revision ?? 0, input.expectedRevision);
  if (history.length >= 200) fail(409, "revision_limit", "This pilot document reached its 200-revision limit.");
  if (!previous && !['save', 'import_capture'].includes(action)) fail(404, "draft_not_found", "Save the document first.");
  const allowed = { save: ["draft"], submit: ["draft"], reopen: ["in_review", "approved", "published"], approve: ["in_review"], reject: ["in_review", "approved"], publish: ["approved"], retract: ["published"] };
  if (previous && !allowed[action].includes(previous.state)) fail(409, "review_locked", "That action is not available in this document state.");
  const timestamp = new Date().toISOString(), content = capture ? validateContent(captureToContent(capture.bundle)) : action === "save" ? validateContent(input.content) : previous.content;
  if (previous?.content.sop && !content.sop) fail(400, 'sop_required', 'Reload this document in the guided editor to preserve its SOP sections.');
  assertCaptureReferences(content, capture ?? previous?.capture);
  const revision = (previous?.revision ?? 0) + 1;
  const states = { save: "draft", import_capture: 'draft', submit: "in_review", reopen: "draft", approve: "approved", reject: "draft", publish: "published", retract: "approved" };
  const record = { schemaVersion: 1, id, revision, state: states[action], content, action,
    contentRevision: ['save', 'import_capture'].includes(action) ? revision : previous.contentRevision, contentHash: hash(content), scope: context.scope,
    createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp, createdBy: previous?.createdBy ?? context.actor, updatedBy: context.actor,
    approval: ["save", "submit", "reopen", "reject"].includes(action) ? null : previous?.approval ?? null,
    note: ["approve", "reject", "retract"].includes(action) ? reviewNote(input.note) : null };
  if (capture ?? previous?.capture) Object.assign(record, { capture: capture ?? previous.capture });
  if (['submit', 'approve', 'publish'].includes(action)) requireComplete(content);
  if (action === "approve") record.approval = { actor: context.actor, at: timestamp, contentHash: record.contentHash, contentRevision: record.contentRevision, note: record.note };
  if (action === "publish") {
    if (!previous.approval || previous.approval.contentHash !== record.contentHash) fail(409, "approval_missing", "Approve this exact content revision before publication.");
    if (!Array.isArray(input.proposalIds) || input.proposalIds.length > 50 || new Set(input.proposalIds).size !== input.proposalIds.length) fail(400, "invalid_connections", "Explicitly select up to 50 distinct approved connections.");
    const nodes = [...catalog.nodes, ...draftNodes(state)];
    const connections = input.proposalIds.map(proposalId => {
      assertId(proposalId);
      const proposal = latest(state.proposals[proposalId]);
      if (!proposal || proposal.status !== "approved" || proposal.source.draftId !== id || proposalFreshness(state, proposal, nodes).freshness !== "current") fail(409, "connection_not_approved", "Every selected connection must be approved with unchanged evidence.");
      if (proposal.targetEvidence.draftId) {
        const targetPublication = latest(state.publications[proposal.targetEvidence.draftId]);
        if (!targetPublication || state.retractions[targetPublication.id] || targetPublication.document.contentHash !== proposal.targetFingerprint) fail(409, "target_not_published", "Publish referenced documents before publishing this connection.");
      }
      return structuredClone(proposal);
    });
    const publication = { schemaVersion: 1, id: randomUUID(), document: record, connections, scope: context.scope, publishedAt: timestamp, publishedBy: context.actor, catalogSnapshotId: catalog.id };
    if (content.sop) Object.assign(publication, { rendering: { format: 'structured-sop', schemaVersion: 1, rendererVersion: 1 } });
    state.publications[id] ??= []; state.publications[id].push(publication);
  }
  if (action === "retract") {
    const publication = latest(state.publications[id]);
    if (!publication || state.retractions[publication.id]) fail(409, "publication_missing", "There is no active publication to retract.");
    state.retractions[publication.id] = { at: timestamp, actor: context.actor, note: record.note };
  }
  state.documents[id] ??= []; state.documents[id].push(record);
  return true;
}
