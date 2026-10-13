import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import handler from "../api/platform.js";
import { getPresentation, getPresentationAsset, hasPresentationAccess } from "../server/presentation.mjs";

const tenant = "d72d9036-cff8-4f5f-a6fa-d698f621d420";
const eric = "f73371d5-d2b4-48b4-a32b-1edc7c88869f";
const andrew = "11111111-1111-4111-8111-111111111111"; // Synthetic test identity only.
const member = (oid) => ({ authenticated: true, mode: "entra-delegated", claims: { tid: tenant, oid } });
const environmentKeys = ["NODE_ENV", "VERCEL_ENV", "API_AUTH_REQUIRED", "ENTRA_TENANT_ID", "ENTRA_API_AUDIENCE", "ENTRA_API_SCOPE", "ENTRA_API_REQUIRED_ROLE", "PLATFORM_PRESENTATION_ANDREW_OBJECT_ID", "PLATFORM_PRESENTATION_ANDREW_EMAIL"];
const saved = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
try {
  Object.assign(process.env, { NODE_ENV: "test", VERCEL_ENV: "", API_AUTH_REQUIRED: "true", ENTRA_TENANT_ID: tenant,
    ENTRA_API_AUDIENCE: "api://presentation-test", ENTRA_API_SCOPE: "access_as_user", ENTRA_API_REQUIRED_ROLE: "",
    PLATFORM_PRESENTATION_ANDREW_OBJECT_ID: "", PLATFORM_PRESENTATION_ANDREW_EMAIL: "" });
  assert.equal(hasPresentationAccess(member(eric)), true);
  assert.equal(hasPresentationAccess(member(andrew)), false, "Andrew stays denied until configured");
  assert.equal(hasPresentationAccess(member(andrew), { andrewObjectId: andrew }), true);
  const emailMember = { ...member(andrew), claims: { tid: tenant, preferred_username: "Andrew@Example.test" } };
  assert.equal(hasPresentationAccess(emailMember, { andrewEmail: "andrew@example.test" }), true);
  assert.equal(hasPresentationAccess(emailMember, { andrewEmail: "andrew@example.test", andrewObjectId: andrew }), false, "object ID must override email");
  for (const context of [null, {}, { ...member(eric), authenticated: false },
    { ...member(eric), mode: "entra-service-principal" }, member("other-user"),
    { ...member(eric), claims: { tid: "other-tenant", oid: eric } },
    { ...member(eric), claims: { tid: tenant, name: "Eric", roles: ["Admin", "Owner"] } }]) {
    assert.equal(hasPresentationAccess(context), false);
    await assert.rejects(getPresentation(context), { statusCode: 404 });
    await assert.rejects(getPresentationAsset(new URL("https://example.test/?name=images/logo.png"), context), { statusCode: 404 });
  }
  const bypass = { authenticated: false, mode: "explicit-development-bypass" };
  const localRequest = { remoteAddress: "127.0.0.1" };
  assert.equal(hasPresentationAccess(bypass, localRequest), true);
  assert.equal(hasPresentationAccess(bypass), false);
  assert.equal(hasPresentationAccess(bypass, { remoteAddress: "192.168.1.10" }), false);
  await assert.rejects(getPresentation(bypass), { statusCode: 404 });
  process.env.NODE_ENV = "production";
  assert.equal(hasPresentationAccess(bypass, localRequest), false);
  process.env.NODE_ENV = "test";
  process.env.VERCEL_ENV = "preview";
  assert.equal(hasPresentationAccess(bypass, localRequest), false);
  process.env.VERCEL_ENV = "";

  const hasContent = existsSync(new URL("../server/presentations/alamo-data-strategy/deck.json", import.meta.url));
  if (process.env.PRESENTATION_CONTENT_REQUIRED === "true") assert.ok(hasContent, "Release requires the private presentation package");
  let deck = null;
  if (hasContent) {
    deck = await getPresentation(member(eric));
    assert.equal(deck.slides.length, 28);
    assert.equal(new Set(deck.slides.map((slide) => slide.id)).size, 28);
    assert.equal(deck.slides[0].id, "cover");
    assert.equal(deck.slides.at(-1).id, "endstate");
    for (const slide of deck.slides) {
      assert.doesNotMatch(slide.html, /<aside|<script|src="\.\./i);
      assert.ok(slide.notes.trim(), `${slide.id} must retain its speaker notes`);
      for (const match of slide.html.matchAll(/__ASSET:([^_]+)__/g)) assert.ok(deck.assets.includes(match[1]));
    }
    for (const name of deck.assets) {
      const asset = await getPresentationAsset(new URL(`https://example.test/?name=${encodeURIComponent(name)}`), member(eric));
      assert.equal(asset.name, name);
      assert.match(asset.dataUrl, /^data:(?:image\/png|font\/(?:ttf|woff2));base64,/);
      assert.ok(JSON.stringify(asset).length < 2 * 1024 * 1024, `${name} must fit the bounded client response`);
    }
    for (const name of ["../.env", "slides/cover.html", "deck.json", "images/missing.png", "", "/etc/passwd"]) {
      await assert.rejects(getPresentationAsset(new URL(`https://example.test/?name=${encodeURIComponent(name)}`), member(eric)), { statusCode: 404 });
    }
  }

  // Real API handlers and JWT verification; only the remote JWKS fetch is replaced.
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(publicKey), kid: "presentation-test", alg: "RS256", use: "sig" };
  globalThis.fetch = async (input) => {
    assert.equal(String(input), `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`);
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Content-Type": "application/json" } });
  };
  async function request(url, claims, overrides = {}) {
    const token = claims ? await new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(overrides.issuer ?? `https://login.microsoftonline.com/${tenant}/v2.0`)
      .setAudience(overrides.audience ?? "api://presentation-test").setIssuedAt().setExpirationTime("2m").sign(privateKey) : null;
    const headers = {};
    const response = { statusCode: 0, body: null, setHeader(name, value) { headers[name] = value; },
      getHeader(name) { return headers[name]; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    await handler({ method: "GET", url, headers: token ? { authorization: `Bearer ${token}` } : {} }, response);
    assert.match(headers["Cache-Control"], /private.*no-store/);
    assert.match(headers.Vary, /Authorization/);
    return response;
  }
  const paths = ["/api/platform/presentation", `/api/platform/presentation/asset?name=${encodeURIComponent(deck?.assets[0] ?? "images/logo.png")}`];
  for (const path of [...paths, "/api/platform/presentation/access"]) {
    assert.equal((await request(path)).statusCode, 401);
    assert.equal((await request(path, { tid: tenant, oid: eric, scp: "access_as_user" }, { issuer: "https://other.test" })).statusCode, 401);
    assert.equal((await request(path, { tid: tenant, oid: eric, scp: "access_as_user" }, { audience: "wrong" })).statusCode, 401);
    assert.equal((await request(path, { tid: tenant, oid: eric, roles: ["Admin"] })).statusCode, 403);
  }
  for (const path of paths) {
    if (deck) assert.equal((await request(path, { tid: tenant, oid: eric, scp: "access_as_user" })).statusCode, 200);
    for (const claims of [{ tid: tenant, oid: andrew, scp: "access_as_user" }, { tid: "other-tenant", oid: eric, scp: "access_as_user" }]) {
      const response = await request(path, claims);
      assert.equal(response.statusCode, 404);
      assert.equal(response.body.error, "Not found.");
    }
  }
  assert.deepEqual((await request("/api/platform/presentation/access", { tid: tenant, oid: andrew, scp: "access_as_user" })).body, { allowed: false });
  assert.deepEqual((await request("/api/platform/presentation/access", { tid: tenant, oid: eric, scp: "access_as_user" })).body, { allowed: true });
  process.env.PLATFORM_PRESENTATION_ANDREW_OBJECT_ID = andrew;
  if (deck) for (const path of paths) assert.equal((await request(path, { tid: tenant, oid: andrew, scp: "access_as_user" })).statusCode, 200);
  assert.deepEqual((await request("/api/platform/presentation/access", { tid: tenant, oid: andrew, scp: "access_as_user" })).body, { allowed: true });
  console.log(`Presentation authorization checks passed: signed tokens, explicit Andrew configuration, tenant isolation, and production bypass rejection. ${deck ? `All ${deck.slides.length} private slides and assets validated.` : "Private content absent; content checks require the release package."}`);
} finally {
  globalThis.fetch = originalFetch;
  for (const key of environmentKeys) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
}
