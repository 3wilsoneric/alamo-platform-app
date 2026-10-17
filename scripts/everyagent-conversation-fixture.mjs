import { mkdtemp, rm } from "node:fs/promises";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createAgentSourceFixture } from "./everyagent-source-fixture.mjs";
import { createEveryAgentSourceClient } from "../server/everyagent-source-client.mjs";
import { createEveryAgentPersistence } from "../server/everyagent-persistence.mjs";
import { createEveryAgentStore } from "../server/everyagent-store.mjs";
import { createConversationStore } from "../server/everyagent-conversation-store.mjs";
import { createConversationService } from "../server/everyagent-conversations.mjs";
import { createConversationModel } from "../server/everyagent-conversation-model.mjs";
import { createEveryAgentService } from "../server/everyagent-service.mjs";
import { createEveryAgentHttpServer } from "../server/everyagent-host.mjs";
import { createEveryAgentAuthorizer } from "../server/everyagent-auth.mjs";
import { EVERYAGENT_TENANT, EVERYAGENT_USERS } from "../shared/everyagent-identity.mjs";
import { freshAssignment, grantFor } from "../server/everyagent-access.mjs";

export async function createConversationFixture({ webRoot = "" } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-conversations-"));
  const sourceFixture = await createAgentSourceFixture();
  const source = createEveryAgentSourceClient({ origin: sourceFixture.origin, getToken: async () => ({ token: sourceFixture.token, expiresOnTimestamp: Date.now() + 60_000 }), fetchImpl: sourceFixture.fetchImpl });
  const workStore = createEveryAgentStore(createEveryAgentPersistence({ localPath: path.join(directory, "work.json"), azure: false }));
  await workStore.update(state => { state.assignments = grantFor(EVERYAGENT_USERS[0]).map(skill => ({ ...freshAssignment(EVERYAGENT_USERS[0], skill), communityIds: skill.id === "licensing" ? ["337"] : [] })); });
  const chatPath = path.join(directory, "chats.json");
  const newStore = () => createConversationStore(createEveryAgentPersistence({ localPath: chatPath, azure: false }));
  const store = newStore();
  const modelState = { calls: 0, contexts: [], wait: async () => {}, bad: false, time: Date.now() };
  const model = createConversationModel({ apiKey: "SYNTHETIC_MODEL_SECRET", fetchImpl: async (_url, init) => {
    modelState.calls++; const body = JSON.parse(init.body); modelState.contexts.push(JSON.parse(body.messages[0].content));
    await modelState.wait();
    const context = modelState.contexts.at(-1);
    const evidence = context.sourceSummaries.find(item => item.skillId === "licensing" && !item.title.includes("availability")) ?? context.sourceSummaries[0];
    return Response.json({ stop_reason: "tool_use", usage: { input_tokens: 120, output_tokens: 80 }, content: [{ type: "tool_use", name: "answer", input: { paragraphs: [
      { kind: "evidence", text: "The published inspection summary is ready to review. Open the state source for the full report.", sourceIds: [modelState.bad ? "invented-id" : evidence.id] }
    ] } }] });
  } });
  const clients = ["44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666"];
  const auth = { authenticated: true, mode: "entra-delegated", claims: { tid: EVERYAGENT_TENANT, oid: EVERYAGENT_USERS[0], azp: clients[0] } };
  const service = createConversationService({ store, workStore, source, model, clientIds: clients.slice(0, 2), now: () => modelState.time });
  const assignments = (await workStore.read()).value.assignments;
  const adapters = Object.fromEntries(assignments.map(assignment => [assignment.skillId, () => source.adapters[assignment.skillId](assignment)]));
  const work = createEveryAgentService({ store: workStore, adapters });
  await work.tick();
  sourceFixture.state.hash = "b".repeat(64);
  await workStore.update(state => { for (const assignment of state.assignments) assignment.nextCheck = null; });
  await work.tick();
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const keySet = createLocalJWKSet({ keys: [{ ...jwk, kid: "chat-test", alg: "RS256", use: "sig" }] });
  const audience = "77777777-7777-4777-8777-777777777777";
  const sign = (claims = {}) => new SignJWT({ ...auth.claims, scp: "access_as_user", aud: audience, iss: `https://login.microsoftonline.com/${EVERYAGENT_TENANT}/v2.0`,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...claims }).setProtectedHeader({ alg: "RS256", kid: "chat-test" }).sign(privateKey);
  const server = createEveryAgentHttpServer({ authorize: createEveryAgentAuthorizer({ tenantId: EVERYAGENT_TENANT, audience, clientIds: clients, keySet }),
    service: createEveryAgentService({ store: workStore, sourceAccess: source.authorize, portableLinks: true }), conversations: service,
    origins: ["https://agent.example.test", "https://platform.example.test"], webRoot });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = await sign();
  return { directory, sourceFixture, source, model, modelState, workStore, store, newStore, auth, clients, service, server, base, sign, token, chatPath,
    request: (input, credential = token, query = "") => fetch(`${base}/api/agent/v1/conversations${query}`, {
      method: input ? "POST" : "GET", headers: { Authorization: `Bearer ${credential}`, ...(input ? { "Content-Type": "application/json" } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) }),
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await sourceFixture.close(); await rm(directory, { recursive: true, force: true }); }
  };
}
