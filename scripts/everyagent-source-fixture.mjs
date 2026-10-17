import { createServer } from "node:http";
import { once } from "node:events";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createPlatformAgentSourceAuthorizer } from "../server/platform-agent-source-auth.mjs";
import { createPlatformAgentSourceHandler } from "../server/platform-agent-source-api.mjs";
import { createEveryAgentAdapters } from "../server/everyagent-adapters.mjs";
import { EVERYAGENT_TENANT, EVERYAGENT_USERS } from "../shared/everyagent-identity.mjs";

// Synthetic source owned by the test parent, separate from the worker process.
export async function createAgentSourceFixture({ now = () => Date.now(), onRead = async () => {} } = {}) {
  const clientId = "11111111-1111-4111-8111-111111111111";
  const principalId = "22222222-2222-4222-8222-222222222222";
  const audience = "33333333-3333-4333-8333-333333333333";
  const origin = "https://source.example.test";
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const keySet = createLocalJWKSet({ keys: [{ ...jwk, kid: "source-test", alg: "RS256", use: "sig" }] });
  const sign = (claims = {}) => new SignJWT({ tid: EVERYAGENT_TENANT, oid: principalId, azp: clientId, roles: ["AlamoAgent.Source.Read"], ver: "2.0",
    iss: `https://login.microsoftonline.com/${EVERYAGENT_TENANT}/v2.0`, aud: audience, iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, ...claims }).setProtectedHeader({ alg: "RS256", kid: "source-test" }).sign(privateKey);
  const state = { hash: "a".repeat(64), reads: 0, grantReads: 0, afterRead: async () => {},
    document: { version: 1, grants: ["licensing", "admissions-watch"].map(skillId => ({ id: `test-${skillId}`, clientId, principalId,
      subjectId: EVERYAGENT_USERS[0], skillId, communityIds: skillId === "licensing" ? ["337", "345"] : [],
      expiresAt: new Date(now() + 86_400_000).toISOString(), revoked: false })) } };
  const adapters = createEveryAgentAdapters({
    licensing: async () => {
      state.reads++; await onRead(); await state.afterRead();
      return { collectedAt: new Date(now()).toISOString(), communities: [], reports: ["337", "345"].map(facilityId => ({
        id: `${facilityId === "337" ? "079201030" : "197610805"}-${"a".repeat(32)}`, facilityId, textSha256: state.hash,
        title: facilityId === "337" ? "Synthetic inspection" : "OTHER_COMMUNITY_REPORT", reportDate: "2026-10-01", reportType: "Inspection",
        retrievedAt: new Date(now()).toISOString(), sourceUrl: "https://www.ccld.dss.ca.gov/carefacilitysearch/FacDetail/079201030",
        privatePayload: "PRIVATE_RAW_SHOULD_NOT_CROSS_CONNECTOR"
      })) };
    },
    updates: async () => ({ status: "complete", lastChecked: new Date(now()).toISOString() }),
    pipeline: async () => ({ status: "connected", generatedAt: new Date().toISOString(),
      metrics: { activeReferrals: 12, stale: 1, unassigned: 2, awaitingAdmission: 3 }, board: { cards: [{ clientName: "PRIVATE_PATIENT" }] } })
  });
  const handler = createPlatformAgentSourceHandler({ authorize: createPlatformAgentSourceAuthorizer({ audience, keySet }), now, adapters,
    readGrants: async () => { state.grantReads++; return structuredClone(state.document); } });
  const server = createServer((req, response) => {
    const res = { setHeader: (name, value) => response.setHeader(name, value), getHeader: name => response.getHeader(name),
      status(code) { response.statusCode = code; return res; },
      json(value) { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(value)); } };
    void handler(req, res).catch(error => response.destroy(error));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = await sign();
  return { origin, base, token, sign, clientId, principalId, audience, state,
    // Only the injected test transport rewrites HTTPS to local HTTP. Production
    // configuration never permits an insecure connector or redirect.
    fetchImpl: (url, init) => fetch(new URL(new URL(url).pathname, base), init),
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
