import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const candidate = path.join(root, "generated/everyagent-service");
const directory = await mkdtemp(path.join(os.tmpdir(), "alamoagent-package-"));
try {
  // Move outside the repo so Node cannot resolve a missing dependency from
  // Platform's ancestor node_modules. Install only the candidate's own lock.
  await cp(candidate, directory, { recursive: true, filter: source => path.basename(source) !== "node_modules" });
  const pkg = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["@azure/identity", "@azure/storage-blob", "jose"]);
  const lock = JSON.parse(await readFile(path.join(directory, "package-lock.json"), "utf8"));
  assert(!Object.keys(lock.packages).some(name => /databricks|anthropic|durable-functions|react|pdf-lib/.test(name)));
  execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: directory, stdio: "pipe", timeout: 120_000 });
  await mkdir(path.join(directory, "scripts"));
  await cp(path.join(root, "scripts/check-everyagent-service.mjs"), path.join(directory, "scripts/check-everyagent-service.mjs"));
  const env = { PATH: process.env.PATH, TMPDIR: os.tmpdir() };
  execFileSync(process.execPath, ["scripts/check-everyagent-service.mjs"], { cwd: directory, env, stdio: "pipe", timeout: 30_000 });
  const production = { NODE_ENV: "production", ALAMOAGENT_ENTRA_TENANT_ID: "d72d9036-cff8-4f5f-a6fa-d698f621d420",
    ALAMOAGENT_ENTRA_API_AUDIENCE: "api://test", ALAMOAGENT_ENTRA_CLIENT_IDS: "11111111-1111-4111-8111-111111111111" };
  const connector = { ALAMOAGENT_PLATFORM_ORIGIN: "https://source.example.test",
    ALAMOAGENT_PLATFORM_SCOPE: "api://11111111-1111-4111-8111-111111111111/.default",
    ALAMOAGENT_CONNECTOR_CLIENT_ID: production.ALAMOAGENT_ENTRA_CLIENT_IDS };
  for (const [settings, message] of [
    [{}, /requires production mode/],
    [{ NODE_ENV: "production" }, /Configure the agent tenant/],
    [production, /Configure the agent Platform connector/],
    [{ ...production, ...connector }, /durable storage is not configured/]
  ]) {
    const result = spawnSync(process.execPath, ["server/everyagent-server.mjs"], { cwd: directory, env: { ...env, ...settings }, encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 1); assert.match(result.stderr, message);
  }
  const reservation = createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  // The real entry point starts with synthetic storage settings. Liveness and
  // unauthenticated requests must not perform any storage or identity I/O.
  const child = spawn(process.execPath, ["server/everyagent-server.mjs"], { cwd: directory, stdio: ["ignore", "pipe", "pipe"],
    env: { ...env, ...production, ...connector, PORT: String(port), AZURE_STORAGE_ACCOUNT: "syntheticagentfixture",
      AZURE_STORAGE_CONTAINER: "synthetic", AZURE_CLIENT_ID: production.ALAMOAGENT_ENTRA_CLIENT_IDS } });
  const exited = once(child, "exit");
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Independent API startup timed out.")), 10_000);
      child.once("error", reject);
      child.once("exit", () => reject(new Error("Independent API exited before startup.")));
      child.stdout.on("data", bytes => { if (bytes.toString().includes("API is listening")) resolve(); });
    });
    clearTimeout(timer);
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(5000) })).status, 200);
    assert.equal((await fetch(`${base}/api/agent/v1/work`, { signal: AbortSignal.timeout(5000) })).status, 401);
  } finally {
    clearTimeout(timer); child.kill("SIGTERM");
    const kill = setTimeout(() => child.kill("SIGKILL"), 7000);
    const [code, signal] = await exited; clearTimeout(kill);
    assert.equal(code, 0, `API did not stop cleanly (${signal}).`);
  }
  console.log(`Isolated API package passed: ${Object.keys(lock.packages).length - 1} installed packages, no Platform runtime, real HTTP suite, production startup/health/shutdown and auth/storage guards.`);
} finally { await rm(directory, { recursive: true, force: true }); }
