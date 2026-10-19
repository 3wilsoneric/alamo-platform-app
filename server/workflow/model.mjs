import { createHash } from "node:crypto";
import { renderSop, sopGaps, validateSop } from '../../src/features/workflow/legacy/src/lib/sop-contract.mjs';

export class WorkflowError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
/** @returns {never} */
export function fail(status, code, message) { throw new WorkflowError(status, code, message); }
export const hash = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function assertId(id) { if (typeof id !== "string" || !uuidPattern.test(id)) fail(400, "invalid_id", "Invalid Workflow record ID."); }
export function shape(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail(400, "invalid_input", "Unsupported Workflow request fields.");
}
export function expected(actual, supplied) {
  if (!Number.isSafeInteger(supplied) || supplied < 0) fail(400, "invalid_revision", "Supply a valid expected revision.");
  if (actual !== supplied) fail(409, "revision_conflict", "This record changed. Keep your text and reload the latest revision.");
}
export function permission(context, operation) {
  if (!context?.scope?.tenantId || context.scope.workspace !== "workflow" || !context.actor?.id || !context.permissions?.includes(operation)) fail(403, "workflow_forbidden", "Your identity cannot perform this Workflow operation.");
}
export function validateContent(value) {
  const limits = { title: 160, kind: 20, audience: 160, purpose: 2000, sourceReference: 1000, body: 40000 };
  shape(value, [...Object.keys(limits), 'sop']);
  /** @type {Record<string,any>} */
  const content = {};
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof value[key] !== "string" || value[key].length > limit || value[key].includes("\0")) fail(400, "invalid_content", `Invalid ${key}; maximum ${limit} characters.`);
    content[key] = value[key].trim();
  }
  if (!content.title || !["procedure", "policy", "tutorial"].includes(content.kind ?? "")) fail(400, "invalid_content", "Add a title and supported document type.");
  if (Object.hasOwn(value, 'sop')) {
    if (content.kind !== 'procedure') fail(400, 'invalid_sop', 'Guided SOPs must be procedures.');
    try { content.sop = validateSop(value.sop); content.body = renderSop(content.sop); }
    catch (error) { fail(400, 'invalid_sop', error instanceof Error ? error.message : 'Invalid SOP.'); }
  }
  return content;
}
export function requireComplete(content) {
  if (!content.audience || !content.purpose || !content.sourceReference || content.body.length < 20) fail(400, "review_incomplete", "Add audience, purpose, source reference, and instructions before review.");
  if (content.sop && sopGaps(content.sop).length) fail(400, 'review_incomplete', `Complete the SOP before review: ${sopGaps(content.sop).slice(0, 6).join('; ')}. Explain when a section does not apply.`);
}
export function reviewNote(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 1000) fail(400, "review_note_required", "Record a review decision in 1–1,000 characters.");
  return value.trim();
}
export const predicates = {
  for_role: ["role"], documents_workflow: ["workflow"], uses_application: ["application"],
  governed_by: ["policy"], teaches: ["procedure", "workflow", "topic"],
  related_to: ["role", "workflow", "procedure", "policy", "tutorial", "application", "topic", "skill", "step"]
};
export const latest = history => history?.at(-1) ?? null;
export function documentDetail(state, id) {
  assertId(id);
  const history = state.documents[id];
  if (!history?.length) fail(404, "draft_not_found", "That document was not found.");
  const publication = latest(state.publications[id]);
  return { document: latest(history), history: [...history].reverse().map(({ revision, state, action, updatedAt, updatedBy }) => ({ revision, state, action, updatedAt, updatedBy })),
    publication: publication ? { id: publication.id, contentRevision: publication.document.contentRevision, active: !state.retractions[publication.id] } : null };
}
export function draftNodes(state) {
  return Object.values(state.documents).map(history => {
    const doc = latest(history);
    return { id: `draft:${doc.id}`, type: doc.content.kind, title: doc.content.title, description: doc.content.purpose,
      origin: "draft", status: doc.state, grounding: "author-entered", draftRevision: doc.revision,
      fingerprint: doc.contentHash, evidence: { draftId: doc.id, revision: doc.revision, pointer: "/content", valueHash: doc.contentHash } };
  });
}
export function proposalFreshness(state, proposal, nodes) {
  const source = latest(state.documents[proposal.source.draftId]), target = nodes.find(node => node.id === proposal.targetId);
  const staleReasons = [];
  if (!source || source.contentHash !== proposal.source.contentHash) staleReasons.push("The cited draft content changed or is unavailable.");
  if (!target || target.fingerprint !== proposal.targetFingerprint) staleReasons.push("The connected entity changed or is unavailable.");
  return { freshness: staleReasons.length ? "needs_review" : "current", staleReasons };
}
