import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createEveryAgentAuthorizer } from "../server/everyagent-auth.mjs";
import { createEveryAgentHttpServer } from "../server/everyagent-host.mjs";
import { createEveryAgentRequestHandler } from "../server/everyagent-http.mjs";
import { createEveryAgentService } from "../server/everyagent-service.mjs";
import { createEveryAgentStore } from "../server/everyagent-store.mjs";
import { createEveryAgentPersistence } from "../server/everyagent-persistence.mjs";
import { createEveryAgentWorkflowService } from "../server/everyagent-workflow-service.mjs";
import { createEveryAgentAdapters } from "../server/everyagent-adapters.mjs";
import { createEveryAgentClient, EVERYAGENT_API_PATH } from "../shared/everyagent-client.mjs";
import { EVERYAGENT_TENANT, EVERYAGENT_USERS } from "../shared/everyagent-identity.mjs";

// Real HTTP and signed JWTs; all data, keys and persisted state are synthetic.
const directory = await mkdtemp(path.join(os.tmpdir(), "alamoagent-api-"));
const localPath = path.join(directory, "state.json");
const clientId = "11111111-1111-4111-8111-111111111111";
const audience = "api://alamoagent-test";
const origin = "https://agent.example.test";
const issuer = `https://login.microsoftonline.com/${EVERYAGENT_TENANT}/v2.0`;
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
const keySet = createLocalJWKSet({ keys: [{ ...jwk, kid: "test", alg: "RS256", use: "sig" }] });
const authOptions = { tenantId: EVERYAGENT_TENANT, audience, clientIds: [clientId], keySet };
const authorize = createEveryAgentAuthorizer(authOptions);
const owner = { authenticated: true, mode: "entra-delegated", claims: { tid: EVERYAGENT_TENANT, oid: EVERYAGENT_USERS[0] } };
const token = (claims = {}) => new SignJWT({ tid: EVERYAGENT_TENANT, oid: EVERYAGENT_USERS[0], scp: "access_as_user", azp: clientId,
  iss: issuer, aud: audience, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, ...claims })
  .setProtectedHeader({ alg: "RS256", kid: "test" }).sign(privateKey);
let clock = Date.now();
let fingerprint = "a".repeat(64);
const now = () => clock;
const makeStore = () => createEveryAgentStore(createEveryAgentPersistence({ localPath, azure: false }));
const service = () => createEveryAgentService({ store: makeStore(), now });
const adapters = createEveryAgentAdapters({
  licensing: async () => ({ collectedAt: new Date(clock).toISOString(), communities: [], reports: [{ id: `079201030-${"a".repeat(32)}`,
    facilityId: "337", title: "Synthetic published report", textSha256: fingerprint, reportDate: "2026-10-01", reportType: "Inspection",
    retrievedAt: new Date(clock).toISOString(), sourceUrl: "https://www.ccld.dss.ca.gov/carefacilitysearch/FacDetail/079201030" }] }),
  updates: async () => ({ status: "complete", lastChecked: new Date(clock).toISOString() }),
  pipeline: async () => ({ status: "not_connected" })
});
const worker = () => createEveryAgentWorkflowService({ store: makeStore(), adapters, now });
const servers = [];
async function start(apiService = service()) {
  const server = createEveryAgentHttpServer({ authorize, service: apiService, origins: [origin] });
  servers.push(server); server.listen(0, "127.0.0.1"); await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}
async function stop(server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
try {
  for (const invalid of [{ tenantId: "other" }, { audience: "" }, { clientIds: [] }, { clientIds: ["*"] }]) {
    assert.throws(() => createEveryAgentAuthorizer({ ...authOptions, ...invalid }), /Configure/);
  }
  assert.throws(() => createEveryAgentHttpServer({ authorize, service: service(), origins: ["https://*.example.test"] }), /origins/);
  assert.throws(() => createEveryAgentRequestHandler({ service: service() }), /identity/);
  assert.throws(() => createEveryAgentClient({}), /transport/);
  let base = await start();
  const bearer = await token();
  const request = (url = EVERYAGENT_API_PATH, init = {}) => fetch(base + url, { ...init, signal: AbortSignal.timeout(5000) });
  const call = (init = {}) => request(EVERYAGENT_API_PATH, { ...init, headers: { Authorization: `Bearer ${bearer}`, ...init.headers } });
  const client = createEveryAgentClient({ requestJson: async (endpoint, init) => {
    const response = await request(endpoint, { ...init, headers: { Authorization: `Bearer ${bearer}`, ...init?.headers } });
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return body;
  } });
  assert.equal((await request("/healthz")).status, 200);
  assert.equal((await request()).status, 401);
  assert.equal((await request(`${EVERYAGENT_API_PATH}?access_token=${bearer}`)).status, 401);
  for (const [claims, status] of [
    [{ aud: "api://platform" }, 401], [{ iss: "https://attacker.example" }, 401], [{ exp: 1 }, 401],
    [{ tid: "22222222-2222-4222-8222-222222222222" }, 403], [{ scp: "other" }, 403],
    [{ azp: "22222222-2222-4222-8222-222222222222" }, 403], [{ oid: "bad" }, 403],
    [{ scp: undefined, roles: ["Agent.Admin"] }, 401], [{ exp: undefined }, 401],
    [{ oid: "424b21d4-605a-43a6-8dff-2a89a846e698" }, 404],
    [{ oid: "75099b5b-5f7d-437f-8e3b-181f1fea1653" }, 404],
    [{ oid: "e9f39185-d751-45c0-bcf5-c24d3565bdd9" }, 404]
  ]) assert.equal((await call({ headers: { Authorization: `Bearer ${await token(claims)}` } })).status, status);
  const invalidSignature = `${bearer.slice(0, bearer.lastIndexOf(".") + 1)}${"a".repeat(342)}`;
  assert.equal((await call({ headers: { Authorization: `Bearer ${invalidSignature}` } })).status, 401);
  const response = await call({ headers: { Origin: origin } });
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.match(response.headers.get("vary"), /Origin/); assert.match(response.headers.get("vary"), /Authorization/);
  assert.equal((await call({ headers: { Origin: "https://unregistered.example" } })).status, 403);
  const preflight = await request(EVERYAGENT_API_PATH, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("access-control-allow-headers"), "Authorization, Content-Type");
  assert.equal((await request("/unknown", { headers: { Authorization: `Bearer ${bearer}` } })).status, 404);
  assert.equal((await call({ method: "DELETE" })).status, 405);
  assert.equal((await call({ method: "POST", body: "{" })).status, 400);
  assert.equal((await call({ method: "POST", body: JSON.stringify({ action: "send_email" }) })).status, 400);
  assert.equal((await call({ method: "POST", body: JSON.stringify({ payload: "x".repeat(5000) }) })).status, 413);
  const initial = await client.read(); assert.equal(initial.skills.length, 2); assert.equal(initial.emailEnabled, false);
  const configure = { action: "configure", skillId: "licensing", communityIds: ["337"], paused: false, expectedVersion: 0 };
  await client.command(configure);
  assert.equal((await call({ method: "POST", body: JSON.stringify(configure) })).status, 409);
  await client.command({ ...configure, skillId: "admissions-watch", communityIds: [], paused: true });

  // The Platform compatibility handler and independent host share the same
  // service/state contracts, including review receipts and optimistic versions.
  const compatibility = createEveryAgentRequestHandler({ authorize: async () => owner, service: service(), paths: ["/api/platform/everyagent"] });
  async function platform(command) {
    let status, body;
    const res = { setHeader() {}, status(value) { status = value; return res; }, json(value) { body = value; } };
    await compatibility({ method: command ? "POST" : "GET", url: "/api/platform/everyagent", body: command }, res);
    assert.equal(status, 200); return body;
  }
  assert.deepEqual(await client.read(), await platform());
  async function due() {
    clock += 16 * 60_000; await worker().prepare();
    return (await makeStore().read()).value.tasks.find(task => ["queued", "running"].includes(task.status));
  }
  async function finish(task) {
    const collected = await worker().collect(task.id);
    await worker().publish(task.id, await worker().validate(task.id, collected));
  }
  await finish(await due()); fingerprint = "b".repeat(64); await finish(await due());
  const item = (await client.read()).work.find(work => work.status === "needs_review"); assert(item);
  await platform({ action: "review", workId: item.id });
  await stop(servers.pop()); base = await start();
  assert((await client.read()).work.find(work => work.id === item.id).reviewedAt, "review survives HTTP host recreation");
  const canceled = await due(); await client.command({ action: "cancel_run", runId: canceled.id });
  assert.equal((await platform()).tasks.find(task => task.id === canceled.id).status, "canceled");
  const failed = await due(); await worker().fail(failed.id);
  await client.command({ action: "retry_run", runId: failed.id }); await platform({ action: "retry_run", runId: failed.id });
  assert.equal((await makeStore().read()).value.tasks.filter(task => task.previousRunId === failed.id).length, 1);
  const brokenBase = await start({ overview() { throw new Error("PRIVATE_PROVIDER_DETAILS"); } });
  const failure = await fetch(brokenBase + EVERYAGENT_API_PATH, { headers: { Authorization: `Bearer ${bearer}` } });
  assert.equal(failure.status, 503); assert(!(await failure.text()).includes("PRIVATE_PROVIDER_DETAILS"));
  console.log("Independent agent API passed: signed tokens, audience/tenant/client/scope checks, Eric-only access, CORS, bounded bodies, private errors, shared state/review/restart and cancel/retry parity; no cloud or email calls.");
} finally {
  for (const server of servers) await stop(server);
  await rm(directory, { recursive: true, force: true });
}
