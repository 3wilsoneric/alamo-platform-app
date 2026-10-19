import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendFile } from "node:fs/promises";
import { createAgentSourceFixture } from "./everyagent-source-fixture.mjs";

const root = process.cwd();
const directory = await mkdtemp(path.join(os.tmpdir(), "alamoagent-connector-host-"));
let source;
try {
  await cp(path.join(root, "generated/everyagent-worker"), directory, { recursive: true, filter: file => path.basename(file) !== "node_modules" });
  const lock = JSON.parse(await readFile(path.join(directory, "package-lock.json"), "utf8"));
  assert(!Object.keys(lock.packages).some(name => /databricks|anthropic|react|pdf-lib/.test(name)));
  const deps = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8")).dependencies;
  assert.deepEqual(Object.keys(deps).sort(), ["@azure/functions", "@azure/identity", "@azure/storage-blob", "durable-functions"]);
  execFileSync("npm", ["ci", "--prefer-offline", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: directory, stdio: "pipe", timeout: 120_000 });
  const readLog = path.join(directory, "source-reads");
  source = await createAgentSourceFixture({ onRead: () => appendFile(readLog, "read\n") });
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/check-everyagent-workflow-host.mjs"], { cwd: root, stdio: "inherit",
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, AGENT_TEST_WORKER_RUNTIME: directory,
        AGENT_TEST_SOURCE_URL: source.base, AGENT_TEST_SOURCE_TOKEN: source.token, AGENT_TEST_SOURCE_READ_LOG: readLog } });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Independent connector host check failed (${code}).`)));
  });
  assert.equal(source.state.reads, 1);
  assert(source.state.grantReads >= 8, "grants are rechecked after replay before publication");
  console.log(`Independent worker package and authenticated HTTP replay passed (${Object.keys(lock.packages).length - 1} locked packages); no Platform runtime or cloud calls.`);
} finally { await source?.close(); await rm(directory, { recursive: true, force: true }); }
