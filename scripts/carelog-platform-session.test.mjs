import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/carelog/platformClientSession.ts", import.meta.url), "utf8");
function harness() {
  const calls = [];
  let failing = false;
  class PublicClientApplication {
    constructor(config) { calls.push(config); }
    async initialize() {}
    async handleRedirectPromise() { return { account: "existing-account" }; }
    setActiveAccount(account) { assert.equal(account, "existing-account"); }
  }
  const exports = {};
  const context = { exports, require: () => ({ PublicClientApplication }), location: { origin: "https://platform.example" },
    fetch: async (url, options) => { assert.equal(url, "/poc/app/auth/config"); assert.equal(options.credentials, "omit");
      return { ok: !failing, json: async () => ({ platform: { tenantId: "tenant", clientId: "client", scope: "scope" } }) }; } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { create: exports.createPlatformClientSession, calls, fail: (value) => { failing = value; } };
}
test("Carelog entrypoints preserve their own redirect and logout configuration", async () => {
  const h = harness();
  await h.create("/poc/app/platform-login.html", "https://platform.example")();
  await h.create("/login-callback.html")();
  assert.equal(h.calls[0].auth.redirectUri, "https://platform.example/poc/app/platform-login.html");
  assert.equal(h.calls[0].auth.postLogoutRedirectUri, "https://platform.example");
  assert.equal(h.calls[1].auth.redirectUri, "https://platform.example/login-callback.html");
  assert.equal(h.calls[1].auth.postLogoutRedirectUri, undefined);
  assert.equal(h.calls[0].cache.cacheLocation, "sessionStorage");
});
test("simultaneous requests share initialization and failed configuration can retry", async () => {
  const h = harness(); const client = h.create("/login-callback.html");
  h.fail(true); await assert.rejects(client(), /configuration is unavailable/);
  h.fail(false); const [a, b] = await Promise.all([client(), client()]);
  assert.equal(a, b); assert.equal(h.calls.length, 1); assert.equal(a.scope, "scope");
});
