import { randomUUID } from "node:crypto";
import { EVERYAGENT_USERS } from "../shared/everyagent-catalog.mjs";
import { EVERYAGENT_VERSION, validateEveryAgentCommand } from "../shared/everyagent-contracts.mjs";
import { createEveryAgentStore } from "./everyagent-store.mjs";
import { everyAgentActor, grantFor, freshAssignment, scopeAllows, allowedAssignment } from "./everyagent-access.mjs";
import { publishEveryAgentResult } from "./everyagent-publication.mjs";
import { createEveryAgentWorkflowService } from "./everyagent-workflow-service.mjs";
import { createHttpError } from "./http-error-contract.mjs";
import { portableEveryAgentEvidence, resolveEveryAgentLink } from "../shared/everyagent-links.mjs";

const LEASE = 120_000;
const hidden = () => createHttpError(404, "not_found", "Not found.");

export function createEveryAgentService({ store = createEveryAgentStore(), adapters = {}, now = () => Date.now(), portableLinks = false,
  sourceAccess = /** @type {null | ((assignment: any, receipt?: any) => Promise<any>)} */ (null) } = {}) {
  const workflows = createEveryAgentWorkflowService({ store, adapters, now, sourceAccess });
  async function overview(auth, attempt = 0) {
    const userId = everyAgentActor(auth);
    const { value } = await store.read();
    const skills = grantFor(userId);
    const assignments = skills.map(skill => value.assignments.find(a => a.userId === userId && a.skillId === skill.id) ?? freshAssignment(userId, skill));
    // Revalidate at retrieval; a stored result or conversation owner is not
    // continuing authority after the source withdraws access.
    const permitted = new Set((await Promise.all(assignments.map(async assignment => {
      try { if (sourceAccess) await sourceAccess(assignment); return assignment.skillId; } catch { return null; }
    }))).filter(Boolean));
    if (sourceAccess && (await store.read()).value.revision !== value.revision) {
      if (attempt >= 2) throw createHttpError(409, "agent_state_changed", "Agent work changed. Refresh and try again.");
      return overview(auth, attempt + 1);
    }
    const visibleAssignments = assignments.filter(a => permitted.has(a.skillId));
    const visible = item => item.userId === userId && visibleAssignments.some(a => a.skillId === item.skillId && allowedAssignment(a) && scopeAllows(item, a));
    const work = value.work.filter(visible).reverse();
    const recentCompleted = new Set(work.filter(item => item.status === "completed").slice(0, 50).map(item => item.id));
    const tasks = workflows.visible(value, userId, visibleAssignments);
    return {
      version: EVERYAGENT_VERSION, emailEnabled: false,
      workerEnabled: value.executionMode === "durable" ? Number.isFinite(Date.parse(value.lastWorkflowHeartbeat)) &&
        now() - Date.parse(value.lastWorkflowHeartbeat) < 120_000 && Date.parse(value.lastWorkflowHeartbeat) <= now() + 5000 : process.env.EVERYAGENT_WORKER_ENABLED === "true",
      skills: portableLinks ? skills.map(skill => ({ ...skill, href: resolveEveryAgentLink(skill.href).href })) : skills,
      responsibilities: assignments.map(({ userId: _user, cursor: _cursor, ...rest }) => ({ ...rest,
        connection: permitted.has(rest.skillId) ? rest.connection : "unavailable",
        issue: !permitted.has(rest.skillId) ? "Source access could not be verified. Results are hidden until access is restored." : rest.issue ?? (!rest.paused && rest.nextCheck && Date.parse(rest.nextCheck) < now() - 5 * 60_000
          ? "The next check is delayed. Previous results may be out of date." : null) })),
      work: work.filter(item => item.status === "needs_review" || recentCompleted.has(item.id)).map(({ userId: _user, ...rest }) =>
        portableLinks ? { ...rest, evidence: rest.evidence.map(item => portableEveryAgentEvidence(item, rest.sourceFingerprint ?? null)) } : rest),
      runs: value.runs.filter(visible).slice(-20).reverse().map(({ userId: _user, communityIds: _scope, ...rest }) => rest),
      tasks,
      working: tasks.some(task => ["queued", "running"].includes(task.status)) ||
        Boolean(value.lease && value.lease.expiresAt > now() && assignments.some(a => !a.paused && (!a.nextCheck || Date.parse(a.nextCheck) <= now())))
    };
  }

  async function command(auth, raw) {
    const userId = everyAgentActor(auth);
    let input;
    try { input = validateEveryAgentCommand(raw); }
    catch { throw createHttpError(400, "everyagent_command_invalid", "Choose a valid EveryAgent action."); }
    if (sourceAccess && !(input.action === "cancel_run" || (input.action === "configure" && input.paused))) {
      const { value } = await store.read();
      const target = input.action === "review" ? value.work.find(item => item.id === input.workId && item.userId === userId) :
        input.action === "retry_run" ? value.tasks.find(task => task.id === input.runId && task.userId === userId) : input;
      if (!target) throw hidden();
      const assignment = input.action === "configure" ? { userId, skillId: input.skillId, communityIds: input.communityIds } :
        value.assignments.find(a => a.userId === userId && a.skillId === target.skillId);
      if (!assignment) throw hidden();
      try { await sourceAccess(assignment); } catch { throw createHttpError(403, "source_access_unavailable", "Source access must be restored before this action."); }
    }
    if (input.action === "cancel_run" || input.action === "retry_run") {
      await workflows.command(userId, input);
      return overview(auth);
    }
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
    if (sourceAccess) throw new Error("Remote source connectors require the durable worker.");
    const token = randomUUID();
    const started = now();
    const claimed = await store.update(state => {
      if (state.executionMode === "durable" || state.lease?.expiresAt > started) return false;
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
      if (state.executionMode === "durable" || state.lease?.token !== token || state.lease.expiresAt <= now()) return false;
      for (const original of due) {
        const assignment = state.assignments.find(a => a.userId === original.userId && a.skillId === original.skillId);
        // A pause, scope change, or revoked grant during a read cancels publication.
        if (!assignment || assignment.paused || assignment.version !== original.version || !allowedAssignment(assignment)) continue;
        const result = results.get(assignment.skillId);
        publishEveryAgentResult(state, assignment, result, started, now());
      }
      state.lease = null;
      return true;
    });
  }
  return { overview, command, tick };
}
