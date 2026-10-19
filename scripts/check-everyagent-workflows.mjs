import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEveryAgentPersistence } from "../server/everyagent-persistence.mjs";
import { createEveryAgentStore } from "../server/everyagent-store.mjs";
import { createEveryAgentService } from "../server/everyagent-service.mjs";
import { createEveryAgentWorkflowService } from "../server/everyagent-workflow-service.mjs";
import { createEveryAgentAdapters } from "../server/everyagent-adapters.mjs";
import { everyAgentMonitorV1 } from "../server/everyagent-orchestrator.mjs";
import { validateEveryAgentWorkflowResult } from "../server/everyagent-workflow-validation.mjs";
import { EVERYAGENT_TENANT, EVERYAGENT_USERS } from "../shared/everyagent-catalog.mjs";

const directory = await mkdtemp(path.join(os.tmpdir(), "alamoagent-workflow-"));
const localPath = path.join(directory, "state.json");
const owner = { authenticated: true, mode: "entra-delegated", claims: { tid: EVERYAGENT_TENANT, oid: EVERYAGENT_USERS[0] } };
let clock = Date.now();
let hash = "a".repeat(64);
let reads = 0;
const now = () => clock;
const adapters = createEveryAgentAdapters({
  licensing: async () => { reads++; return { collectedAt: new Date(clock).toISOString(), communities: [], reports: [{
    id: `079201030-${"b".repeat(32)}`, facilityId: "337", textSha256: hash, title: "Published inspection",
    reportDate: "2026-10-01", reportType: "Inspection", retrievedAt: new Date(clock).toISOString(),
    sourceUrl: "https://www.ccld.dss.ca.gov/carefacilitysearch/FacDetail/079201030"
  }] }; },
  updates: async () => ({ status: "complete", lastChecked: new Date(clock).toISOString() }),
  pipeline: async () => ({ status: "not_connected" })
});
const store = () => createEveryAgentStore(createEveryAgentPersistence({ localPath, azure: false }));
const worker = () => createEveryAgentWorkflowService({ store: store(), adapters, now });
const api = () => createEveryAgentService({ store: store(), adapters, now });
const license = tasks => tasks.find(task => task.skillId === "licensing");
const taskState = async id => (await store().read()).value.tasks.find(task => task.id === id);
const due = async () => { clock += 16 * 60_000; await worker().prepare(); return license((await store().read()).value.tasks.filter(t => ["queued", "running"].includes(t.status))); };
async function complete(task) {
  const source = await worker().collect(task.id);
  const verified = await worker().validate(task.id, source);
  return worker().publish(task.id, verified);
}
try {
  await api().command(owner, { action: "configure", skillId: "licensing", paused: false, communityIds: ["337"], expectedVersion: 0 });
  await api().command(owner, { action: "configure", skillId: "admissions-watch", paused: true, communityIds: [], expectedVersion: 0 });
  await Promise.all([worker().prepare(), worker().prepare()]);
  let state = (await store().read()).value;
  assert.equal(state.tasks.length, 1, "concurrent dispatch claims one task");
  const first = state.tasks[0];
  assert.equal((await api().overview(owner)).workerEnabled, true);
  clock += 121_000;
  assert.equal((await api().overview(owner)).workerEnabled, false, "a stale heartbeat does not imply a healthy worker");
  clock -= 121_000;
  await api().tick();
  assert.equal(reads, 0, "persisted durable fence stops inline scheduler");
  const captured = await worker().collect(first.id);
  assert.equal(reads, 1);
  // Reconstruct the service from persisted storage between each step.
  const verified = await worker().validate(first.id, captured);
  await Promise.all([worker().publish(first.id, verified), worker().publish(first.id, verified)]);
  state = (await store().read()).value;
  assert.equal(state.work.length, 1);
  assert.equal(state.runs.length, 1, "repeated publication has one receipt");
  assert.equal(state.work[0].runId, first.id);
  assert.equal(state.tasks[0].status, "completed");
  const afterResponseLoss = await worker().publish(first.id, verified);
  assert.equal(afterResponseLoss.status, "completed");
  assert.equal((await worker().fail(first.id)).status, "completed", "late failure delivery preserves the terminal outcome");
  hash = "c".repeat(64);
  const changed = await due();
  await complete(changed);
  const reviewItem = (await api().overview(owner)).work.find(item => item.status === "needs_review");
  assert(reviewItem);
  await api().command(owner, { action: "review", workId: reviewItem.id });
  await complete(await due());
  assert.equal((await api().overview(owner)).work.length, 2, "same content stays deduplicated across checks");
  assert((await api().overview(owner)).work.find(item => item.id === reviewItem.id).reviewedAt);

  const canceled = await due();
  const beforeCancel = await worker().collect(canceled.id);
  await api().command(owner, { action: "cancel_run", runId: canceled.id });
  assert.equal(await worker().validate(canceled.id, beforeCancel), null);
  await worker().publish(canceled.id, beforeCancel);
  assert.equal((await taskState(canceled.id)).status, "canceled");
  assert.equal((await worker().fail(canceled.id)).status, "canceled");
  assert.equal((await worker().prepare()).length, 0, "cancel waits until next scheduled occurrence");

  const revoked = await due();
  const beforeRevocation = await worker().collect(revoked.id);
  await api().command(owner, { action: "configure", skillId: "licensing", paused: true, communityIds: ["337"], expectedVersion: 1 });
  assert.equal(await worker().validate(revoked.id, beforeRevocation), null);
  assert.equal((await taskState(revoked.id)).status, "canceled");
  await api().command(owner, { action: "configure", skillId: "licensing", paused: false, communityIds: ["337"], expectedVersion: 2 });
  const failed = await due();
  await worker().fail(failed.id);
  assert.equal((await taskState(failed.id)).status, "failed");
  await Promise.all([api().command(owner, { action: "retry_run", runId: failed.id }), api().command(owner, { action: "retry_run", runId: failed.id })]);
  const retries = (await store().read()).value.tasks.filter(t => t.previousRunId === failed.id);
  assert.equal(retries.length, 1, "duplicate retry commands create one active successor");
  await complete(retries[0]);
  await api().command(owner, { action: "retry_run", runId: failed.id });
  assert.equal((await store().read()).value.tasks.filter(t => t.previousRunId === failed.id).length, 1, "late replay of a retry command does not start another run");
  assert.equal((await api().overview(owner)).work.length, 2, "failure and retry retain previous work and review");

  const deadline = await due();
  clock += 21 * 60_000;
  const beforeDeadlineRead = reads;
  assert.equal(await worker().collect(deadline.id), null);
  assert.equal(reads, beforeDeadlineRead);
  assert.equal((await taskState(deadline.id)).status, "failed");
  const tampered = await due();
  const original = await worker().collect(tampered.id);
  await worker().validate(tampered.id, original);
  const altered = structuredClone(original);
  altered.entries[0].summary = "Changed after validation";
  await assert.rejects(worker().publish(tampered.id, altered), /validated source result changed/);
  await worker().fail(tampered.id);

  const readRace = await due();
  const racingReader = createEveryAgentWorkflowService({ store: store(), now, adapters: { ...adapters,
    licensing: async () => {
      const source = await adapters.licensing();
      await api().command(owner, { action: "cancel_run", runId: readRace.id });
      return source;
    } } });
  assert.equal(await racingReader.collect(readRace.id), null, "cancellation during a source request excludes its response from history");
  const validateRace = await due();
  const raceSource = await worker().collect(validateRace.id);
  const raceStore = store();
  let writes = 0;
  const racingValidator = createEveryAgentWorkflowService({ now, adapters, store: { ...raceStore,
    update: async mutate => {
      if (++writes === 2) await api().command(owner, { action: "cancel_run", runId: validateRace.id });
      return raceStore.update(mutate);
    } } });
  assert.equal(await racingValidator.validate(validateRace.id, raceSource), null, "cancellation between validation and commit excludes a new checkpoint");

  const projected = structuredClone(original);
  projected.privatePayload = "NEVER_PERSIST";
  projected.entries.push({ ...projected.entries[0], key: "other-community", communityIds: ["345"], summary: "OUT_OF_SCOPE" });
  projected.entries[0].privatePayload = "NEVER_PERSIST";
  const safe = validateEveryAgentWorkflowResult(projected, { skillId: "licensing", communityIds: ["337"] });
  assert(!JSON.stringify(safe).includes("NEVER_PERSIST"));
  assert(!JSON.stringify(safe).includes("OUT_OF_SCOPE"));
  for (const href of ["javascript:alert(1)", "https://attacker.example", "//attacker.example", "https://user@www.ccld.dss.ca.gov/"]) {
    const bad = structuredClone(original); bad.entries[0].evidence[0].href = href;
    assert.throws(() => validateEveryAgentWorkflowResult(bad, { skillId: "licensing", communityIds: ["337"] }));
  }
  const bad = structuredClone(original); bad.entries.push(bad.entries[0]);
  assert.throws(() => validateEveryAgentWorkflowResult(bad, { skillId: "licensing", communityIds: ["337"] }), /invalid/);
  const blocked = { ...owner, claims: { ...owner.claims, oid: "424b21d4-605a-43a6-8dff-2a89a846e698" } };
  await assert.rejects(api().command(blocked, { action: "retry_run", runId: failed.id }), error => error.statusCode === 404);
  await assert.rejects(api().command(owner, { action: "cancel_run", runId: "0".repeat(32) }), error => error.statusCode === 404);
  await assert.rejects(api().command(owner, { action: "retry_run", runId: failed.id, recipient: "someone" }), error => error.statusCode === 400);
  await assert.rejects(api().command(owner, { action: "send_email" }), error => error.statusCode === 400);

  // Exercise the real generator's activity ordering and failure branch. The
  // separate host check covers actual storage replay and worker termination.
  const context = { df: { instanceId: first.id, setCustomStatus() {}, callActivityWithRetry: (name, options, input) => ({ name, options, input }) } };
  const flow = everyAgentMonitorV1(context);
  assert.equal(flow.next().value.name, "agentCollectV1");
  assert.equal(flow.next(original).value.name, "agentValidateV1");
  assert.equal(flow.next(original).value.name, "agentPublishV1");
  assert.equal(flow.next({ status: "completed" }).done, true);
  const failure = everyAgentMonitorV1(context);
  failure.next();
  assert.equal(failure.throw(new Error("Activity retries exhausted")).value.name, "agentFailV1");
  console.log("Agent workflow checks passed: persisted phases, fenced schedulers, concurrent/idempotent publish, review continuity, cancellation, assignment revocation, bounded failure/retry, deadline, result validation, scope projection, denied accounts and no email actions.");
} finally { await rm(directory, { recursive: true, force: true }); }
