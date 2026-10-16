import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEveryAgentPersistence } from "../server/everyagent-persistence.mjs";
import { createEveryAgentStore } from "../server/everyagent-store.mjs";
import { createEveryAgentService } from "../server/everyagent-service.mjs";
import { createEveryAgentAdapters } from "../server/everyagent-adapters.mjs";
import { EVERYAGENT_TENANT, EVERYAGENT_USERS } from "../shared/everyagent-catalog.mjs";

const directory = await mkdtemp(path.join(os.tmpdir(), "everyagent-check-"));
const localPath = path.join(directory, "state.json");
const auth = id => ({ authenticated: true, mode: "entra-delegated", claims: { tid: EVERYAGENT_TENANT, oid: id } });
const owner = auth(EVERYAGENT_USERS[2]);
const teammate = auth(EVERYAGENT_USERS[0]);
let clock = Date.now();
const now = () => clock;
let hash = "a".repeat(64);
let sourceStatus = "complete";
let pipelineStatus = "connected";
let active = 10;
let reads = 0;
const library = () => ({ collectedAt: new Date(clock).toISOString(), communities: [{ facilityId: "337", name: "San Pablo" }], reports: [{
  id: `079201030-${"a".repeat(32)}`, facilityId: "337", textSha256: hash,
  title: "Synthetic state report", reportDate: "2026-10-01", reportType: "Inspection", retrievedAt: new Date(clock).toISOString(),
  sourceUrl: "https://www.ccld.dss.ca.gov/carefacilitysearch/FacDetail/079201030"
}] });
const adapters = createEveryAgentAdapters({
  licensing: async () => { reads++; return library(); },
  updates: async () => ({ status: sourceStatus, lastChecked: new Date(clock).toISOString() }),
  pipeline: async () => ({ status: pipelineStatus, generatedAt: new Date().toISOString(),
    metrics: { activeReferrals: active, stale: 2, unassigned: 1, awaitingAdmission: 4 },
    board: { cards: [{ clientName: "PRIVATE_REFERRAL_SHOULD_NEVER_PERSIST" }] } })
});
const makeStore = () => createEveryAgentStore(createEveryAgentPersistence({ localPath, azure: false }));
const service = createEveryAgentService({ store: makeStore(), adapters, now });
const rejects = (promise, status) => assert.rejects(promise, error => error.statusCode === status);
try {
  for (const invalid of [auth("not-allowed"), { ...owner, claims: { ...owner.claims, tid: "wrong-tenant" } }, { ...owner, mode: "entra-application" }, { authenticated: false }]) {
    await rejects(service.overview(invalid), 404);
  }
  assert.equal((await service.overview(owner)).skills.length, 2);
  assert.equal((await service.overview(teammate)).skills.length, 1);
  await Promise.all([service.tick(), createEveryAgentService({ store: makeStore(), adapters, now }).tick()]);
  assert.equal(reads, 1, "one leased collection shared across subscribers");
  let view = await service.overview(owner);
  assert.equal(view.work.length, 2);
  assert(view.work.every(item => item.status === "completed"), "backlog is a baseline, not a flood of new alerts");
  assert.equal(view.emailEnabled, false);
  assert.equal((await makeStore().read()).value.assignments.length, 4);
  assert(!JSON.stringify((await makeStore().read()).value).includes("PRIVATE_REFERRAL"), "Pipeline projection excludes referral data");
  assert.equal(view.work.find(item => item.skillId === "licensing").relationships[0].relation, "has_report");
  clock += 16 * 60_000;
  hash = "b".repeat(64); active++;
  await service.tick();
  view = await service.overview(owner);
  const report = view.work.find(item => item.skillId === "licensing" && item.status === "needs_review");
  assert(report);
  assert.equal(view.work.filter(item => item.status === "needs_review").length, 2);
  await rejects(service.command(teammate, { action: "review", workId: report.id }), 404);
  await service.command(owner, { action: "review", workId: report.id });
  await service.command(owner, { action: "review", workId: report.id });
  const restarted = createEveryAgentService({ store: makeStore(), adapters, now });
  assert((await restarted.overview(owner)).work.find(item => item.id === report.id).reviewedAt);
  clock += 16 * 60_000;
  await restarted.tick();
  assert.equal((await restarted.overview(owner)).work.length, 4, "unchanged source does not create duplicate work");
  await rejects(service.command(owner, { action: "send_email", recipient: "someone" }), 400);
  await rejects(service.command(owner, { action: "configure", skillId: "licensing", paused: false, communityIds: ["999"], expectedVersion: 0 }), 400);
  await rejects(service.command(teammate, { action: "configure", skillId: "admissions-watch", paused: false, communityIds: [], expectedVersion: 0 }), 404);
  await service.command(owner, { action: "configure", skillId: "licensing", paused: true, communityIds: ["337"], expectedVersion: 0 });
  await rejects(service.command(owner, { action: "configure", skillId: "licensing", paused: false, communityIds: ["337"], expectedVersion: 0 }), 409);
  assert.equal((await service.overview(owner)).work.filter(item => item.skillId === "licensing").length, 1, "broad baseline excluded after narrowed scope");
  clock += 16 * 60_000; hash = "c".repeat(64);
  await service.tick();
  assert.equal((await service.overview(owner)).work.filter(item => item.skillId === "licensing").length, 1, "paused subscriber receives no changes");
  await service.command(owner, { action: "configure", skillId: "licensing", paused: false, communityIds: ["345"], expectedVersion: 1 });
  assert.equal((await service.overview(owner)).work.filter(item => item.skillId === "licensing").length, 0);
  await rejects(service.command(owner, { action: "review", workId: report.id }), 404);
  // Pause after a source read begins, before it settles.
  let release;
  let announce;
  const pending = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { announce = resolve; });
  const inFlight = createEveryAgentService({ store: makeStore(), now, adapters: { ...adapters, licensing: async () => { announce(); await pending; return adapters.licensing(); } } });
  const run = inFlight.tick();
  await started;
  await service.command(owner, { action: "configure", skillId: "licensing", paused: true, communityIds: ["345"], expectedVersion: 2 });
  release(); await run;
  assert.equal((await service.overview(owner)).responsibilities.find(item => item.skillId === "licensing").lastChecked, null, "pause during read cancels publication");
  clock += 16 * 60_000;
  sourceStatus = "failed"; pipelineStatus = "unavailable";
  await service.tick();
  view = await service.overview(owner);
  assert.equal(view.responsibilities.find(item => item.skillId === "admissions-watch").connection, "unavailable");
  assert(view.work.some(item => item.skillId === "admissions-watch"), "source failure retains prior results");
  assert.equal((await service.overview(teammate)).responsibilities[0].connection, "unavailable");
  sourceStatus = "complete"; pipelineStatus = "connected";
  clock += 16 * 60_000;
  await makeStore().update(state => { state.lease = { token: "crashed-worker", expiresAt: clock + 1000 }; return true; });
  const before = reads;
  await service.tick(); assert.equal(reads, before);
  clock += 1001;
  await service.tick(); assert.equal(reads, before + 1, "expired lease resumes work after crash");
  assert.equal((await service.overview(teammate)).responsibilities[0].connection, "connected");
  await makeStore().update(state => {
    const item = state.work.find(work => work.userId === owner.claims.oid && work.skillId === "admissions-watch");
    for (let index = 0; index < 160; index++) state.work.push({ ...item, id: index.toString(16).padStart(32, "0"), status: "needs_review" });
    return true;
  });
  assert((await service.overview(owner)).work.filter(item => item.status === "needs_review").length >= 160, "older unresolved work must remain reachable");
  console.log("EveryAgent checks passed: two applications, identity/scope isolation, shared collection, CAS/leases, restart recovery, pause races, review persistence, source failures, evidence links, no email actions.");
} finally { await rm(directory, { recursive: true, force: true }); }
