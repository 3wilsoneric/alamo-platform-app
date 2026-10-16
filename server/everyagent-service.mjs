import { randomUUID } from "node:crypto";
import { EVERYAGENT_TENANT, EVERYAGENT_USERS, everyAgentSkillsFor } from "../shared/everyagent-catalog.mjs";
import { EVERYAGENT_VERSION, validateEveryAgentCommand } from "../shared/everyagent-contracts.mjs";
import { createEveryAgentStore } from "./everyagent-store.mjs";
import { createEveryAgentAdapters, everyAgentFingerprint } from "./everyagent-adapters.mjs";
import { createHttpError } from "./http-errors.mjs";

const INTERVAL = 15 * 60_000;
const LEASE = 120_000;
const hidden = () => createHttpError(404, "not_found", "Not found.");
const grantFor = userId => everyAgentSkillsFor({ tid: EVERYAGENT_TENANT, oid: userId });
function actor(auth) {
  if (auth?.authenticated !== true || auth.mode !== "entra-delegated" || !everyAgentSkillsFor(auth.claims).length) throw hidden();
  return String(auth.claims.oid).toLowerCase();
}
function freshAssignment(userId, skill) {
  return { userId, skillId: skill.id, version: 0, paused: false, communityIds: skill.communities.map(c => c.id),
    lastChecked: null, sourceCheckedAt: null, nextCheck: null, connection: "not_checked", issue: null, cursor: null };
}
function scopeAllows(item, assignment) {
  return item.communityIds.every(id => assignment.communityIds.includes(id));
}
function allowedAssignment(assignment) {
  const skill = grantFor(assignment.userId).find(item => item.id === assignment.skillId);
  return Boolean(skill && (skill.scope !== "community" || assignment.communityIds.length) &&
    assignment.communityIds.every(id => skill.communities.some(c => c.id === id)));
}

export function createEveryAgentService({ store = createEveryAgentStore(), adapters = createEveryAgentAdapters(), now = () => Date.now() } = {}) {
  async function overview(auth) {
    const userId = actor(auth);
    const { value } = await store.read();
    const skills = grantFor(userId);
    const assignments = skills.map(skill => value.assignments.find(a => a.userId === userId && a.skillId === skill.id) ?? freshAssignment(userId, skill));
    const visible = item => item.userId === userId && assignments.some(a => a.skillId === item.skillId && allowedAssignment(a) && scopeAllows(item, a));
    const work = value.work.filter(visible).reverse();
    const recentCompleted = new Set(work.filter(item => item.status === "completed").slice(0, 50).map(item => item.id));
    return {
      version: EVERYAGENT_VERSION, emailEnabled: false, workerEnabled: process.env.EVERYAGENT_WORKER_ENABLED === "true",
      skills, responsibilities: assignments.map(({ userId: _user, cursor: _cursor, ...rest }) => ({ ...rest,
        issue: rest.issue ?? (!rest.paused && rest.nextCheck && Date.parse(rest.nextCheck) < now() - 5 * 60_000
          ? "The next check is delayed. Previous results may be out of date." : null) })),
      work: work.filter(item => item.status === "needs_review" || recentCompleted.has(item.id)).map(({ userId: _user, ...rest }) => rest),
      runs: value.runs.filter(visible).slice(-20).reverse().map(({ userId: _user, communityIds: _scope, ...rest }) => rest),
      working: Boolean(value.lease && value.lease.expiresAt > now() && assignments.some(a => !a.paused && (!a.nextCheck || Date.parse(a.nextCheck) <= now())))
    };
  }

  async function command(auth, raw) {
    const userId = actor(auth);
    let input;
    try { input = validateEveryAgentCommand(raw); }
    catch { throw createHttpError(400, "everyagent_command_invalid", "Choose a valid EveryAgent action."); }
    await store.update(state => {
      if (input.action === "review") {
        const item = state.work.find(work => work.id === input.workId && work.userId === userId);
        const assignment = state.assignments.find(a => a.userId === userId && a.skillId === item?.skillId);
        if (!item || !assignment || !allowedAssignment(assignment) || !scopeAllows(item, assignment)) throw hidden();
        if (item.status === "completed") return false;
        item.status = "completed";
        item.reviewedAt = new Date(now()).toISOString();
      } else {
        const skill = grantFor(userId).find(s => s.id === input.skillId);
        if (!skill) throw hidden();
        if ((skill.scope === "community" && !input.communityIds.length) ||
            input.communityIds.some(id => !skill.communities.some(c => c.id === id))) {
          throw createHttpError(400, "everyagent_scope_invalid", "Choose at least one permitted community.");
        }
        let assignment = state.assignments.find(a => a.userId === userId && a.skillId === skill.id);
        if (!assignment) { assignment = freshAssignment(userId, skill); state.assignments.push(assignment); }
        if (assignment.version !== input.expectedVersion) throw createHttpError(409, "everyagent_changed", "These settings changed. Refresh and try again.");
        const scopeChanged = [...assignment.communityIds].sort().join() !== [...input.communityIds].sort().join();
        assignment.communityIds = input.communityIds;
        assignment.paused = input.paused;
        assignment.version++;
        if (scopeChanged) { assignment.cursor = null; assignment.lastChecked = null; assignment.sourceCheckedAt = null; assignment.connection = "not_checked"; assignment.issue = null; }
        if (!input.paused) assignment.nextCheck = null;
      }
      return true;
    });
    return overview(auth);
  }

  async function tick() {
    const token = randomUUID();
    const started = now();
    const claimed = await store.update(state => {
      if (state.lease?.expiresAt > started) return false;
      for (const userId of EVERYAGENT_USERS) for (const skill of grantFor(userId)) {
        if (!state.assignments.some(a => a.userId === userId && a.skillId === skill.id)) state.assignments.push(freshAssignment(userId, skill));
      }
      const due = state.assignments.some(a => allowedAssignment(a) && !a.paused && (!a.nextCheck || Date.parse(a.nextCheck) <= started));
      if (!due) return false;
      state.lease = { token, expiresAt: started + LEASE };
      return true;
    });
    if (claimed.lease?.token !== token) return;
    const due = claimed.assignments.filter(a => allowedAssignment(a) && !a.paused && (!a.nextCheck || Date.parse(a.nextCheck) <= started));
    const results = new Map();
    for (const skillId of [...new Set(due.map(a => a.skillId))]) {
      try {
        const adapter = adapters[skillId];
        if (!adapter) throw new Error("No adapter.");
        results.set(skillId, await adapter());
      } catch { results.set(skillId, { connection: "unavailable", issue: "The source could not be checked. Previous results are still available.", sourceCheckedAt: null, entries: [] }); }
    }
    await store.update(state => {
      if (state.lease?.token !== token || state.lease.expiresAt <= now()) return false;
      for (const original of due) {
        const assignment = state.assignments.find(a => a.userId === original.userId && a.skillId === original.skillId);
        // A pause, scope change, or revoked grant during a read cancels publication.
        if (!assignment || assignment.paused || assignment.version !== original.version || !allowedAssignment(assignment)) continue;
        const result = results.get(assignment.skillId);
        publish(state, assignment, result, started, now());
      }
      state.lease = null;
      return true;
    });
  }
  return { overview, command, tick };
}

function publish(state, assignment, result, started, finished) {
  const at = new Date(finished).toISOString();
  assignment.lastChecked = at;
  assignment.sourceCheckedAt = result.sourceCheckedAt;
  assignment.connection = result.connection;
  assignment.issue = result.issue;
  assignment.nextCheck = new Date(finished + INTERVAL).toISOString();
  state.runs.push({ id: randomUUID(), userId: assignment.userId, skillId: assignment.skillId, communityIds: assignment.communityIds,
    startedAt: new Date(started).toISOString(), finishedAt: at, status: result.connection === "connected" ? "completed" : result.connection });
  if (result.connection !== "connected") return;
  const entries = result.entries.filter(entry => scopeAllows(entry, assignment));
  const wasInitialized = assignment.cursor !== null;
  const previous = assignment.cursor ?? {};
  const changed = entries.filter(entry => previous[entry.key] !== entry.fingerprint);
  const skill = grantFor(assignment.userId).find(s => s.id === assignment.skillId);
  if (!skill) throw hidden();
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
    state.work.push({ id, userId: assignment.userId, skillId: assignment.skillId, title: item.title, summary: item.summary,
      communityIds: item.communityIds, status: wasInitialized ? "needs_review" : "completed", createdAt: at, reviewedAt: null,
      evidence: item.evidence, relationships: item.relationships });
  }
  assignment.cursor = Object.fromEntries(entries.map(entry => [entry.key, entry.fingerprint]));
}
