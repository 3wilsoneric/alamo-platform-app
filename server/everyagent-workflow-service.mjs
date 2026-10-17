import { randomUUID } from "node:crypto";
import { EVERYAGENT_USERS } from "../shared/everyagent-catalog.mjs";
import { createEveryAgentStore } from "./everyagent-store.mjs";
import { everyAgentFingerprint } from "./everyagent-adapters.mjs";
import { allowedAssignment, freshAssignment, grantFor, scopeAllows } from "./everyagent-access.mjs";
import { publishEveryAgentResult } from "./everyagent-publication.mjs";
import { validateEveryAgentWorkflowResult } from "./everyagent-workflow-validation.mjs";
import { createHttpError } from "./http-error-contract.mjs";

const INTERVAL = 15 * 60_000;
const DEADLINE = 20 * 60_000;
const active = task => ["queued", "running"].includes(task.status);
const hidden = () => createHttpError(404, "not_found", "Not found.");
function assignmentFor(state, task) {
  return state.assignments.find(a => a.userId === task.userId && a.skillId === task.skillId &&
    a.version === task.assignmentVersion && !a.paused && allowedAssignment(a) && scopeAllows(task, a) &&
    grantFor(a.userId).some(s => s.id === a.skillId && s.version === task.skillVersion));
}
function newTask(assignment, at, previousRunId = null) {
  return { id: everyAgentFingerprint(randomUUID()), userId: assignment.userId, skillId: assignment.skillId,
    communityIds: [...assignment.communityIds], assignmentVersion: assignment.version,
    skillVersion: grantFor(assignment.userId).find(s => s.id === assignment.skillId)?.version,
    workflowVersion: 1, status: "queued", phase: "queued", attempts: 0,
    createdAt: at, updatedAt: at, finishedAt: null, issue: null, previousRunId, resultDigest: null };
}
function cancel(task, at) {
  Object.assign(task, { status: "canceled", phase: "canceled", finishedAt: at, updatedAt: at,
    issue: "This run was canceled or its assignment changed." });
}

export function createEveryAgentWorkflowService({ store = createEveryAgentStore(), adapters = {},
  sourceAccess = /** @type {null | ((assignment: any, receipt?: any) => Promise<any>)} */ (null), now = () => Date.now() } = {}) {
  const stamp = () => new Date(now()).toISOString();
  function visible(state, userId, assignments) {
    return state.tasks.filter(task => task.userId === userId && assignments.some(a =>
      a.skillId === task.skillId && allowedAssignment(a) && scopeAllows(task, a)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30)
      .map(({ userId: _user, communityIds: _scope, resultDigest: _digest, ...task }) => task);
  }
  async function prepare() {
    const at = stamp();
    const state = await store.update(value => {
      // Cutover waits for an in-flight legacy collection. The updated inline
      // worker also checks this persisted fence on every claim/publication.
      if (value.lease?.expiresAt > now()) return false;
      value.executionMode = "durable";
      value.lastWorkflowHeartbeat = at;
      for (const task of value.tasks.filter(active)) {
        if (!assignmentFor(value, task)) cancel(task, at);
        else if (now() - Date.parse(task.createdAt) >= DEADLINE) finishFailure(value, task, "The run exceeded its time limit.", at);
      }
      for (const userId of EVERYAGENT_USERS) for (const skill of grantFor(userId)) {
        let assignment = value.assignments.find(a => a.userId === userId && a.skillId === skill.id);
        if (!assignment) { assignment = freshAssignment(userId, skill); value.assignments.push(assignment); }
        if (!allowedAssignment(assignment) || assignment.paused ||
            (assignment.nextCheck && Date.parse(assignment.nextCheck) > now()) ||
            value.tasks.some(t => t.userId === userId && t.skillId === skill.id && active(t))) continue;
        value.tasks.push(newTask(assignment, at));
      }
      return true;
    });
    if (state.executionMode !== "durable") return [];
    return state.tasks.filter(active).map(task => ({ id: task.id, createdAt: task.createdAt }));
  }
  async function enter(id, phase) {
    const at = stamp();
    const state = await store.update(value => {
      const task = value.tasks.find(t => t.id === id);
      if (!task || !active(task)) return false;
      if (!assignmentFor(value, task) || value.executionMode !== "durable") { cancel(task, at); return true; }
      if (now() - Date.parse(task.createdAt) >= DEADLINE) { finishFailure(value, task, "The run exceeded its time limit.", at); return true; }
      if (task.workflowVersion !== 1) throw new Error("This workflow version is not supported.");
      task.status = "running"; task.updatedAt = at;
      if (["queued", "collect", "validate", "publish"].indexOf(phase) > ["queued", "collect", "validate", "publish"].indexOf(task.phase)) task.phase = phase;
      if (phase === "collect") task.attempts++;
      return true;
    });
    const task = state.tasks.find(t => t.id === id);
    return task && active(task) ? { task, assignment: assignmentFor(state, task) } : null;
  }
  async function collect(id) {
    const current = await enter(id, "collect");
    if (!current) return null;
    const adapter = adapters[current.task.skillId];
    if (!adapter) throw new Error("The skill has no source adapter.");
    const raw = await adapter(current.assignment);
    // Recheck after the source request before returning anything to history.
    const latest = await enter(id, "validate");
    if (!latest) return null;
    const result = validateEveryAgentWorkflowResult(raw, latest.assignment);
    if (sourceAccess) {
      if (!result.sourceGrant) throw new Error("The source did not provide a grant receipt.");
      await sourceAccess(latest.assignment, result.sourceGrant);
      if (!await enter(id, "validate")) return null;
    }
    if (result.connection === "unavailable") throw new Error("The source is temporarily unavailable.");
    return result;
  }
  async function validate(id, result) {
    const current = await enter(id, "validate");
    if (!current || result === null) return null;
    const verified = validateEveryAgentWorkflowResult(result, current.assignment);
    if (sourceAccess) {
      if (!verified.sourceGrant) throw new Error("The source did not provide a grant receipt.");
      await sourceAccess(current.assignment, verified.sourceGrant);
    }
    const digest = everyAgentFingerprint(verified);
    const saved = await store.update(state => {
      const task = state.tasks.find(t => t.id === id);
      if (!task || !active(task) || !assignmentFor(state, task) || state.executionMode !== "durable") return false;
      task.resultDigest = digest; task.phase = "publish"; task.updatedAt = stamp();
      return true;
    });
    const task = saved.tasks.find(t => t.id === id);
    return task && active(task) && saved.executionMode === "durable" && assignmentFor(saved, task) && task.resultDigest === digest ? verified : null;
  }
  async function publish(id, result) {
    if (sourceAccess) {
      const current = await enter(id, "publish");
      if (current && result !== null) {
        const verified = validateEveryAgentWorkflowResult(result, current.assignment);
        if (!verified.sourceGrant) throw new Error("The source did not provide a grant receipt.");
        await sourceAccess(current.assignment, verified.sourceGrant);
      }
    }
    const at = stamp();
    const state = await store.update(value => {
      const task = value.tasks.find(t => t.id === id);
      if (!task || !active(task)) return false;
      const assignment = assignmentFor(value, task);
      if (!assignment || result === null || value.executionMode !== "durable") { cancel(task, at); return true; }
      if (now() - Date.parse(task.createdAt) >= DEADLINE) { finishFailure(value, task, "The run exceeded its time limit.", at); return true; }
      const verified = validateEveryAgentWorkflowResult(result, assignment);
      if (task.phase !== "publish" || task.resultDigest !== everyAgentFingerprint(verified)) throw new Error("The validated source result changed.");
      publishEveryAgentResult(value, assignment, verified, Date.parse(task.createdAt), now(), task.id);
      task.status = "completed"; task.phase = "completed"; task.finishedAt = at; task.updatedAt = at;
      return true;
    });
    return { id, status: state.tasks.find(t => t.id === id)?.status ?? "canceled" };
  }
  function finishFailure(state, task, issue, at) {
    const assignment = assignmentFor(state, task);
    if (!assignment) { cancel(task, at); return; }
    Object.assign(task, { status: "failed", phase: "failed", issue, updatedAt: at, finishedAt: at });
    Object.assign(assignment, { lastChecked: at, nextCheck: new Date(now() + INTERVAL).toISOString(), connection: "unavailable", issue });
    if (!state.runs.some(run => run.id === task.id)) state.runs.push({ id: task.id, userId: task.userId, skillId: task.skillId,
      communityIds: task.communityIds, startedAt: task.createdAt, finishedAt: at, status: "unavailable" });
  }
  async function fail(id) {
    const saved = await store.update(state => {
      const task = state.tasks.find(t => t.id === id);
      if (!task || !active(task)) return false;
      finishFailure(state, task, "The check could not finish after retries. Previous results remain available.", stamp());
      return true;
    });
    return { id, status: saved.tasks.find(task => task.id === id)?.status ?? "canceled" };
  }
  async function command(userId, input) {
    await store.update(state => {
      const task = state.tasks.find(t => t.id === input.runId && t.userId === userId);
      const assignment = task && state.assignments.find(a => a.userId === userId && a.skillId === task.skillId);
      if (!task || !assignment || !allowedAssignment(assignment) || !scopeAllows(task, assignment)) throw hidden();
      if (input.action === "cancel_run") {
        if (!active(task)) return false;
        cancel(task, stamp());
        // Cancel this occurrence, not the standing responsibility.
        assignment.nextCheck = new Date(now() + INTERVAL).toISOString();
      } else {
        if (state.executionMode !== "durable" || task.status !== "failed" || !assignmentFor(state, task))
          throw createHttpError(409, "agent_run_changed", "This run cannot be retried. Check the current skill settings.");
        if (state.tasks.some(t => t.previousRunId === task.id || (t.userId === userId && t.skillId === task.skillId && active(t)))) return false;
        state.tasks.push(newTask(assignment, stamp(), task.id));
      }
      return true;
    });
  }
  return { prepare, collect, validate, publish, fail, visible, command };
}
