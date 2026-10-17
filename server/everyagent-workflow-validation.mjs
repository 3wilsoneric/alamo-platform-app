import { scopeAllows } from "./everyagent-access.mjs";
import { portableEveryAgentEvidence, resolveEveryAgentLink } from "../shared/everyagent-links.mjs";
import { validateAgentSourceGrant } from "../shared/everyagent-source-contracts.mjs";

const text = (value, maximum) => typeof value === "string" && value.length > 0 && value.length <= maximum;
const date = value => value === null || (text(value, 40) && Number.isFinite(Date.parse(value)));
const invalid = () => { throw new Error("The source returned an invalid agent result."); };
function evidenceLink(value) {
  try { resolveEveryAgentLink(value); return true; } catch { return false; }
}

// Project a bounded result before it enters orchestration history. Upstream
// payloads, private referral detail, and unknown fields are never checkpointed.
export function validateEveryAgentWorkflowResult(value, assignment) {
  if (!value || !["connected", "not_connected", "not_checked", "unavailable"].includes(value.connection) ||
      !date(value.sourceCheckedAt) || !(value.issue === null || text(value.issue, 500)) ||
      !Array.isArray(value.entries) || value.entries.length > 2000) invalid();
  const proof = value.sourceGrant === undefined ? {} : { sourceGrant: validateAgentSourceGrant(value.sourceGrant) };
  if (value.connection !== "connected") return { ...proof, connection: value.connection, issue: value.issue, sourceCheckedAt: value.sourceCheckedAt, entries: [] };
  if (!value.sourceCheckedAt) invalid();
  const keys = new Set();
  const entries = [];
  for (const entry of value.entries) {
    if (!entry || !Array.isArray(entry.communityIds) || entry.communityIds.length > 20 ||
        !entry.communityIds.every(id => typeof id === "string" && /^\d{1,12}$/.test(id))) invalid();
    if (!scopeAllows(entry, assignment)) continue;
    if (assignment.skillId === "licensing" && entry.communityIds.length !== 1) invalid();
    if (assignment.skillId === "admissions-watch" && entry.communityIds.length !== 0) invalid();
    if (!text(entry.key, 150) || keys.has(entry.key) || !/^[a-f0-9]{32,64}$/.test(entry.fingerprint) ||
        !text(entry.title, 500) || !text(entry.summary, 4000) || !Array.isArray(entry.evidence) ||
        entry.evidence.length < 1 || entry.evidence.length > 10 || !Array.isArray(entry.relationships) || entry.relationships.length > 20) invalid();
    keys.add(entry.key);
    const evidence = entry.evidence.map(item => {
      if (!item || !text(item.id, 200) || !["community", "report", "source", "application", "module"].includes(item.kind) ||
          !text(item.label, 200) || !evidenceLink(item.href) || !date(item.observedAt)) invalid();
      const projected = { id: item.id, kind: item.kind, label: item.label, href: item.href, observedAt: item.observedAt };
      return item.resource ? portableEveryAgentEvidence(projected, entry.fingerprint) : projected;
    });
    const ids = new Set(evidence.map(item => item.id));
    const relationships = entry.relationships.map(item => {
      if (!item || !ids.has(item.from) || !ids.has(item.to) || !["has_report", "sourced_from", "summarizes"].includes(item.relation)) invalid();
      return { from: item.from, relation: item.relation, to: item.to };
    });
    entries.push({ key: entry.key, fingerprint: entry.fingerprint, communityIds: [...entry.communityIds],
      title: entry.title, summary: entry.summary, evidence, relationships });
  }
  const result = { ...proof, connection: value.connection, issue: value.issue, sourceCheckedAt: value.sourceCheckedAt, entries };
  if (Buffer.byteLength(JSON.stringify(result)) > 2 * 1024 * 1024) invalid();
  return result;
}
