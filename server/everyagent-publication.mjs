import { randomUUID } from "node:crypto";
import { everyAgentFingerprint } from "./everyagent-adapters.mjs";
import { grantFor, scopeAllows } from "./everyagent-access.mjs";

const INTERVAL = 15 * 60_000;

export function publishEveryAgentResult(state, assignment, result, started, finished, runId = randomUUID()) {
  const at = new Date(finished).toISOString();
  assignment.lastChecked = at;
  assignment.sourceCheckedAt = result.sourceCheckedAt;
  assignment.connection = result.connection;
  assignment.issue = result.issue;
  assignment.nextCheck = new Date(finished + INTERVAL).toISOString();
  state.runs.push({ id: runId, userId: assignment.userId, skillId: assignment.skillId, communityIds: assignment.communityIds,
    startedAt: new Date(started).toISOString(), finishedAt: at, status: result.connection === "connected" ? "completed" : result.connection });
  if (result.connection !== "connected") return;
  const entries = result.entries.filter(entry => scopeAllows(entry, assignment));
  const wasInitialized = assignment.cursor !== null;
  const previous = assignment.cursor ?? {};
  const changed = entries.filter(entry => previous[entry.key] !== entry.fingerprint);
  const skill = grantFor(assignment.userId).find(s => s.id === assignment.skillId);
  if (!skill) throw new Error("The skill is no longer available.");
  const work = wasInitialized ? changed : [{
    key: "baseline", fingerprint: everyAgentFingerprint(entries.map(entry => [entry.key, entry.fingerprint])),
    communityIds: assignment.communityIds, title: `${skill.title} monitoring ready`,
    summary: assignment.skillId === "licensing" ? `${entries.length} archived reports available. Future new or changed reports will appear here for review.` : entries[0]?.summary ?? "Published summary checked.",
    evidence: entries[0]?.evidence ?? [{ id: skill.capability, kind: "module", label: `Open ${skill.title}`, href: skill.href, observedAt: result.sourceCheckedAt }],
    relationships: entries[0]?.relationships ?? []
  }];
  for (const item of work) {
    const id = everyAgentFingerprint([assignment.userId, assignment.skillId, item.key, item.fingerprint, wasInitialized ? result.sourceCheckedAt : "baseline"]);
    if (state.work.some(existing => existing.id === id)) continue;
    state.work.push({ ...(result.sourceGrant ? { sourceGrant: result.sourceGrant } : {}),
      id, runId, userId: assignment.userId, skillId: assignment.skillId, title: item.title, summary: item.summary,
      communityIds: item.communityIds, status: wasInitialized ? "needs_review" : "completed", createdAt: at, reviewedAt: null,
      sourceFingerprint: item.fingerprint, sourceCheckedAt: result.sourceCheckedAt,
      evidence: item.evidence, relationships: item.relationships });
  }
  assignment.cursor = Object.fromEntries(entries.map(entry => [entry.key, entry.fingerprint]));
}
