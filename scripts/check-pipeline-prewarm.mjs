import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { startPipelineClinicalPrewarming } from "../server/pipeline-clinical-api.mjs";

let date = new Date("2026-09-12T12:59:00Z"); // 05:59 PDT
let tick;
let calls = 0;
let fail = false;
const logs = [];
const start = startPipelineClinicalPrewarming({
  now: () => date,
  schedule: (callback, ms) => { assert.equal(ms, 60_000); tick = callback; return { unref() {} }; },
  warm: async () => { calls += 1; if (fail) throw new Error("fixture-secret-not-for-logs"); return { resident_count: 2, client_count: 3 }; },
  log: (entry) => logs.push(entry),
});
await start.startup;
assert.equal(calls, 1);
const settle = async () => { for (let turn = 0; turn < 5; turn += 1) await Promise.resolve(); };
date = new Date("2026-09-12T13:00:00Z");
tick(); tick();
await settle();
assert.equal(calls, 2, "6 a.m. must prewarm once, without overlapping calls");
date = new Date("2026-09-12T13:30:00Z");
tick(); await settle();
assert.equal(calls, 2, "one morning load per local day");
date = new Date("2026-11-02T13:00:00Z"); // 05:00 PST
tick(); await settle();
assert.equal(calls, 2, "schedule must not drift to 5 a.m. after DST");
date = new Date("2026-11-02T14:00:00Z");
fail = true;
tick(); await settle();
assert.equal(calls, 3);
date = new Date("2026-11-02T14:01:00Z");
tick(); await settle();
assert.equal(calls, 3, "outages back off rather than hammer storage");
date = new Date("2026-11-02T14:05:00Z");
fail = false;
tick(); await settle();
assert.equal(calls, 4, "failed morning load must retry safely");
assert.equal(logs.some(entry => entry.includes("fixture-secret")), false);

const source = readFileSync(new URL("../server/pipeline-clinical-api.mjs", import.meta.url), "utf8")
  .replace(/^import[\s\S]*?;\n/gm, "").replace(/^export /gm, "");
let reads = 0;
let resolveRead;
const routes = [];
const sandbox = vm.createContext({ ALAMO_FACILITIES: [], URL, Date, Intl, setInterval, clearInterval,
  process: { env: {} }, isProductionLikeRuntime: () => false,
  readPlatformSnapshot: () => { reads += 1; return new Promise(resolve => { resolveRead = resolve; }); },
  readPlatformClientDatabase: async () => ({ fixture: true }),
});
vm.runInContext(`${source}\nglobalThis.prewarm = prewarmPipelineClinicalDirectories;\nbuildPipelineClinicalApiResponse = (snapshot, url) => { routes.push(url.pathname); return { body: { total: 2 } }; };`, sandbox);
sandbox.routes = routes;
const one = sandbox.prewarm();
const two = sandbox.prewarm();
assert.strictEqual(one, two, "prewarm must join the existing in-flight source read");
assert.equal(reads, 1);
resolveRead({ clientDatabase: {} });
await one;
assert.equal(routes.length, 2);
assert.ok(routes.every(route => /\/(roster|clients)$/.test(route)), "only directory projections may warm; never files or writes");
const missing = sandbox.prewarm();
resolveRead(null);
await assert.rejects(missing);
console.log(JSON.stringify({ ok: true, scope: "per-replica startup and Pacific morning schedule, DST, no overlap, retry/backoff, no PHI logs, read-only canonical source warming" }));
