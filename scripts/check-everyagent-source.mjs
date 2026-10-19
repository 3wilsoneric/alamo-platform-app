import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAgentSourceFixture } from "./everyagent-source-fixture.mjs";
import { createEveryAgentSourceClient } from "../server/everyagent-source-client.mjs";
import { createEveryAgentService } from "../server/everyagent-service.mjs";
import { createEveryAgentWorkflowService } from "../server/everyagent-workflow-service.mjs";
import { createEveryAgentStore } from "../server/everyagent-store.mjs";
import { createEveryAgentPersistence } from "../server/everyagent-persistence.mjs";
import { AGENT_SOURCE_PATH, AGENT_SOURCE_MAX_BYTES } from "../shared/everyagent-source-contracts.mjs";
import { EVERYAGENT_TENANT, EVERYAGENT_USERS } from "../shared/everyagent-identity.mjs";
import { resolveEveryAgentLink } from "../shared/everyagent-links.mjs";
import { readPlatformAgentSourceGrants } from "../server/platform-agent-source-grants.mjs";

const directory = await mkdtemp(path.join(os.tmpdir(), "alamoagent-source-"));
const localPath = path.join(directory, "state.json");
let clock = Date.now(); const now = () => clock;
const fixture = await createAgentSourceFixture({ now });
const assignment = { userId: EVERYAGENT_USERS[0], skillId: "licensing", communityIds: ["337"] };
const input = { version: 1, operation: "read", subjectId: assignment.userId, skillId: assignment.skillId, communityIds: assignment.communityIds };
const options = { origin: fixture.origin, fetchImpl: fixture.fetchImpl, now,
  getToken: async () => ({ token: fixture.token, expiresOnTimestamp: clock + 60_000 }) };
const source = createEveryAgentSourceClient(options);
const store = () => createEveryAgentStore(createEveryAgentPersistence({ localPath, azure: false }));
const api = () => createEveryAgentService({ store: store(), sourceAccess: source.authorize, portableLinks: true, now });
const worker = () => createEveryAgentWorkflowService({ store: store(), adapters: source.adapters, sourceAccess: source.authorize, now });
const owner = { authenticated: true, mode: "entra-delegated", claims: { tid: EVERYAGENT_TENANT, oid: assignment.userId } };
const send = (body = input, token = fixture.token, method = "POST") => fetch(fixture.base + AGENT_SOURCE_PATH,
  { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
try {
  const names = ["PLATFORM_AGENT_SOURCE_STORAGE_ACCOUNT", "PLATFORM_AGENT_SOURCE_STORAGE_CONTAINER", "AZURE_CLIENT_ID", "AZURE_STORAGE_ACCOUNT", "AZURE_STORAGE_CONTAINER"];
  const priorEnvironment = names.map(name => process.env[name]);
  try {
    for (const name of names) process.env[name] = "synthetic";
    await assert.rejects(readPlatformAgentSourceGrants(), /separate private container/);
  } finally { names.forEach((name, index) => { if (priorEnvironment[index] === undefined) delete process.env[name]; else process.env[name] = priorEnvironment[index]; }); }
  assert.throws(() => createEveryAgentSourceClient({ ...options, origin: "http://source.example.test" }));
  for (const [claims, status] of [
    [{ aud: "agent-api" }, 401], [{ tid: "wrong-tenant" }, 403], [{ exp: 1 }, 401], [{ ver: "1.0" }, 403],
    [{ roles: [] }, 403], [{ scp: "access_as_user" }, 403], [{ idtyp: "user" }, 403],
    [{ azp: "44444444-4444-4444-8444-444444444444" }, 403], [{ oid: EVERYAGENT_USERS[0] }, 403],
    [{ iss: "https://attacker.example" }, 401], [{ azp: undefined }, 401]
  ]) assert.equal((await send(input, await fixture.sign(claims))).status, status);
  assert.equal((await send(input, "invalid")).status, 401);
  assert.equal((await send(input, fixture.token, "GET")).status, 405);
  assert.equal((await send("{")).status, 400);
  assert.equal((await send({ ...input, action: "send_email" })).status, 400);
  assert.equal((await send("x".repeat(5000))).status, 413);
  for (const denied of [{ ...input, communityIds: ["344"] }, { ...input, subjectId: "424b21d4-605a-43a6-8dff-2a89a846e698" }]) {
    assert.equal((await send(denied)).status, 403);
  }
  assert.equal(fixture.state.reads, 0, "denied requests never read source records");
  const response = await send(); assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/);
  const envelope = await response.json();
  assert.equal(envelope.result.entries.length, 1);
  assert(!JSON.stringify(envelope).includes("OTHER_COMMUNITY")); assert(!JSON.stringify(envelope).includes("PRIVATE_RAW"));
  assert(envelope.result.entries[0].evidence[0].href.startsWith("https://www.alamoplatform.com/"));
  const collected = await source.adapters.licensing(assignment);
  assert.equal(collected.sourceGrant.id, "test-licensing");
  assert.equal(collected.entries[0].evidence[0].resource.application, "platform");
  const aggregate = await source.adapters["admissions-watch"]({ ...assignment, skillId: "admissions-watch", communityIds: [] });
  assert.match(aggregate.entries[0].summary, /12 active referrals/); assert(!JSON.stringify(aggregate).includes("PRIVATE_PATIENT"));
  const reads = fixture.state.reads; await source.authorize(assignment); assert.equal(fixture.state.reads, reads, "permission checks do not read report data");
  const grant = fixture.state.document.grants[0];
  grant.unexpected = true;
  const invalidRegistry = await send(); assert.equal(invalidRegistry.status, 503);
  assert(!(await invalidRegistry.text()).includes("registry")); delete grant.unexpected;
  grant.revoked = true; await assert.rejects(source.authorize(assignment)); grant.revoked = false;
  const expiry = grant.expiresAt; grant.expiresAt = new Date(clock - 1).toISOString(); assert.equal((await send()).status, 403); grant.expiresAt = expiry;
  fixture.state.document.grants.push({ ...grant, id: "duplicate" }); assert.equal((await send()).status, 403); fixture.state.document.grants.pop();
  fixture.state.afterRead = async () => { grant.revoked = true; };
  const revokedResponse = await send(); assert.equal(revokedResponse.status, 403); assert(!(await revokedResponse.text()).includes("Synthetic inspection"));
  grant.revoked = false; fixture.state.afterRead = async () => {};
  for (const mutate of [value => { value.subjectId = "other"; }, value => { value.grant.expiresAt = "2000-01-01"; },
    value => { value.result.entries[0].evidence[0].href = "https://attacker.example"; }]) {
    const malformed = structuredClone(envelope); mutate(malformed);
    const bad = createEveryAgentSourceClient({ ...options, fetchImpl: async () => Response.json(malformed) });
    await assert.rejects(bad.adapters.licensing(assignment));
  }
  const oversized = createEveryAgentSourceClient({ ...options, fetchImpl: async () => new Response(" ".repeat(AGENT_SOURCE_MAX_BYTES + 1), { headers: { "Content-Type": "application/json" } }) });
  await assert.rejects(oversized.adapters.licensing(assignment));
  const expired = createEveryAgentSourceClient({ ...options, getToken: async () => ({ token: "EXPIRED_TOKEN", expiresOnTimestamp: 1 }), fetchImpl: async () => { assert.fail("expired token must not be sent"); } });
  await assert.rejects(expired.authorize(assignment));
  const privateError = createEveryAgentSourceClient({ ...options, fetchImpl: async (_url, init) => {
    assert.equal(init.redirect, "error"); assert(init.signal instanceof AbortSignal); throw new Error("SECRET_PROVIDER_DIAGNOSTICS");
  } });
  await assert.rejects(privateError.authorize(assignment), error => !error.message.includes("SECRET_PROVIDER"));
  for (const href of ["//attacker.example", "//www.alamoplatform.com/admissions", "/analytics/agent?skill=licensing&redirect=https://attacker.example",
    "/analytics/agent?skill=licensing&report=wrong", "https://www.alamoplatform.com@attacker.example/admissions", "https://alamo-pipeline.com/clinical"]) {
    assert.throws(() => resolveEveryAgentLink(href));
  }

  await api().command(owner, { action: "configure", skillId: "licensing", communityIds: ["337"], paused: false, expectedVersion: 0 });
  await api().command(owner, { action: "configure", skillId: "admissions-watch", communityIds: [], paused: true, expectedVersion: 0 });
  const due = async () => { clock += 16 * 60_000; await worker().prepare(); return (await store().read()).value.tasks.find(t => ["queued", "running"].includes(t.status)); };
  const finish = async task => { const data = await worker().collect(task.id); await worker().publish(task.id, await worker().validate(task.id, data)); };
  await finish(await due()); fixture.state.hash = "b".repeat(64); await finish(await due());
  let view = await api().overview(owner); const item = view.work.find(work => work.status === "needs_review"); assert(item);
  assert(view.work.every(work => work.sourceGrant));
  assert(view.work.every(work => work.evidence.every(evidence => evidence.href.startsWith("https://"))));
  const interrupted = await due(); const captured = await worker().collect(interrupted.id); const validated = await worker().validate(interrupted.id, captured);
  grant.revoked = true;
  await assert.rejects(worker().publish(interrupted.id, validated));
  assert.equal((await store().read()).value.tasks.find(t => t.id === interrupted.id).status, "running");
  view = await api().overview(owner); assert.equal(view.work.length, 0); assert.equal(view.tasks.length, 0);
  await assert.rejects(api().command(owner, { action: "review", workId: item.id }), error => error.statusCode === 403);
  await api().command(owner, { action: "cancel_run", runId: interrupted.id });
  await api().command(owner, { action: "configure", skillId: "licensing", communityIds: ["337"], paused: true, expectedVersion: 1 });
  assert.equal((await store().read()).value.work.length, 2, "revocation withholds, never deletes prior work");
  grant.revoked = false;
  await api().command(owner, { action: "configure", skillId: "licensing", communityIds: ["337"], paused: false, expectedVersion: 2 });
  await api().command(owner, { action: "review", workId: item.id }); assert((await api().overview(owner)).work.find(work => work.id === item.id).reviewedAt);
  const changed = await due(); const prior = await worker().collect(changed.id);
  grant.communityIds = ["337"]; await assert.rejects(worker().validate(changed.id, prior), /changed during this run/);
  await worker().fail(changed.id);
  grant.communityIds = ["337", "345"];
  let changedScope = false;
  const localPlatform = createEveryAgentService({ store: store(), now });
  const racingApi = createEveryAgentService({ store: store(), now, sourceAccess: async scoped => {
    const receipt = await source.authorize(scoped);
    if (!changedScope && scoped.skillId === "licensing") {
      changedScope = true;
      const current = (await store().read()).value.assignments.find(a => a.skillId === "licensing");
      await localPlatform.command(owner, { action: "configure", skillId: "licensing", communityIds: ["345"], paused: false, expectedVersion: current.version });
    }
    return receipt;
  } });
  assert.equal((await racingApi.overview(owner)).work.length, 0, "a scope change during permission I/O cannot return the earlier scope's work");
  const offlineApi = createEveryAgentService({ store: store(), now, sourceAccess: privateError.authorize });
  assert.equal((await offlineApi.overview(owner)).work.length, 0, "unverifiable source access withholds cached evidence");
  const serialized = await readFile(localPath, "utf8");
  for (const forbidden of [fixture.token, "PRIVATE_PATIENT", "PRIVATE_RAW", "SECRET_PROVIDER"]) assert(!serialized.includes(forbidden));
  console.log("Agent source connector passed: signed workload tokens, exact grants/scopes, safe aggregates, grant expiry/change/revocation, bounded HTTP, portable evidence, publication/retrieval denial, preserved reviews and no secrets in state.");
} finally { await fixture.close(); await rm(directory, { recursive: true, force: true }); }
