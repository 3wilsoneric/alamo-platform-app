import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { access, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createEveryAgentPersistence } from "../server/everyagent-persistence.mjs";
import { createEveryAgentStore } from "../server/everyagent-store.mjs";
import { createEveryAgentService } from "../server/everyagent-service.mjs";
import { EVERYAGENT_TENANT, EVERYAGENT_USERS } from "../shared/everyagent-catalog.mjs";

// Real Functions host + isolated Azurite storage. No Azure credentials, cloud
// writes, public sources, or production task records are used in this check.
const root = process.cwd();
const tools = path.join(root, "generated/agent-workflow-tools/node_modules/.bin");
const func = process.env.AGENT_TEST_FUNC_PATH || path.join(tools, "func");
const azurite = process.env.AGENT_TEST_AZURITE_PATH || path.join(tools, "azurite");
await Promise.all([access(func), access(azurite)]).catch(() => {
  throw new Error("Install local tools with: npm install --prefix generated/agent-workflow-tools --no-save azure-functions-core-tools@4.16.0 azurite@3.37.0");
});
const directory = path.join(root, "generated/everyagent-host-check", String(Date.now()));
await mkdir(directory, { recursive: true });
const localPath = path.join(directory, "state.json");
const marker = path.join(directory, "validating");
const release = path.join(directory, "resume");
const readLog = path.join(directory, "source-reads");
const makeStore = () => createEveryAgentStore(createEveryAgentPersistence({ localPath, azure: false }));
const owner = { authenticated: true, mode: "entra-delegated", claims: { tid: EVERYAGENT_TENANT, oid: EVERYAGENT_USERS[0] } };
const api = createEveryAgentService({ store: makeStore() });
await api.command(owner, { action: "configure", skillId: "licensing", communityIds: ["337"], paused: false, expectedVersion: 0 });
await api.command(owner, { action: "configure", skillId: "admissions-watch", communityIds: [], paused: true, expectedVersion: 0 });
await makeStore().update(state => { state.assignments.find(a => a.skillId === "licensing").cursor = {}; return true; });
const importUrl = file => JSON.stringify(pathToFileURL(path.join(root, file)).href);
await writeFile(path.join(directory, "worker.mjs"), `
import { appendFile, access, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { registerEveryAgentFunctions } from ${importUrl("server/everyagent-functions.mjs")};
import { createEveryAgentWorkflowService } from ${importUrl("server/everyagent-workflow-service.mjs")};
import { createEveryAgentStore } from ${importUrl("server/everyagent-store.mjs")};
import { createEveryAgentPersistence } from ${importUrl("server/everyagent-persistence.mjs")};
import { createEveryAgentAdapters } from ${importUrl("server/everyagent-adapters.mjs")};
const adapters = createEveryAgentAdapters({
  licensing: async () => {
    await appendFile(${JSON.stringify(readLog)}, "read\\n");
    return {collectedAt: "2026-10-16T12:00:00Z", communities: [], reports: [{
      id: "079201030-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", facilityId: "337", textSha256: "a".repeat(64),
      title: "Synthetic inspection", reportDate: "2026-10-01", reportType: "Inspection",
      retrievedAt: "2026-10-16T12:00:00Z", sourceUrl: "https://www.ccld.dss.ca.gov/carefacilitysearch/FacDetail/079201030"
    }]};
  },
  updates: async () => ({status: "complete", lastChecked: "2026-10-16T12:00:00Z"}),
  pipeline: async () => { throw new Error("Paused skill must not read"); }
});
const store = createEveryAgentStore(createEveryAgentPersistence({localPath: ${JSON.stringify(localPath)}, azure: false}));
const service = createEveryAgentWorkflowService({store, adapters});
const validate = service.validate;
service.validate = async (...args) => {
  await writeFile(${JSON.stringify(marker)}, "ready");
  while (!(await access(${JSON.stringify(release)}).then(() => true, () => false))) await delay(250);
  return validate(...args);
};
registerEveryAgentFunctions({service, schedule: "*/5 * * * * *"});
`);
await writeFile(path.join(directory, "package.json"), JSON.stringify({ name: "alamoagent-host-check", type: "module", main: "worker.mjs" }));
await symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir");
const host = JSON.parse(await readFile(path.join(root, "scripts/azure/everyagent-host.json"), "utf8"));
host.extensions.durableTask.storageProvider = { type: "azureStorage", controlQueueVisibilityTimeout: "00:01:00", workItemQueueVisibilityTimeout: "00:01:00", maxQueuePollingInterval: "00:00:02", partitionCount: 1 };
await writeFile(path.join(directory, "host.json"), JSON.stringify(host));
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const [blob, queue, table, port] = await Promise.all([freePort(), freePort(), freePort(), freePort()]);
// Public Azurite development credential, used only with loopback endpoints.
const key = "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";
await writeFile(path.join(directory, "local.settings.json"), JSON.stringify({ IsEncrypted: false, Values: {
  AzureWebJobsStorage: `DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=${key};BlobEndpoint=http://127.0.0.1:${blob}/devstoreaccount1;QueueEndpoint=http://127.0.0.1:${queue}/devstoreaccount1;TableEndpoint=http://127.0.0.1:${table}/devstoreaccount1;`,
  FUNCTIONS_WORKER_RUNTIME: "node", EVERYAGENT_WORKER_ENABLED: "true", EVERYAGENT_WORKER_MODE: "durable"
} }));
const children = new Set();
function launch(command, args, log) {
  const fd = openSync(path.join(directory, log), "a");
  const child = spawn(command, args, { cwd: directory, detached: true, stdio: ["ignore", fd, fd],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: "development", FUNCTIONS_CORE_TOOLS_TELEMETRY_OPTOUT: "1" } });
  closeSync(fd); children.add(child);
  child.on("error", error => { console.error(error.message); });
  return child;
}
async function stop(child) {
  if (!child || !children.has(child)) return;
  try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  await new Promise(resolve => { if (child.exitCode !== null || child.signalCode !== null) resolve(); else child.once("exit", resolve); });
  children.delete(child);
}
async function until(predicate, description, timeout = 240_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ([...children].some(child => child.exitCode !== null || child.signalCode !== null)) throw new Error(`A test host stopped unexpectedly. Inspect ${directory}`);
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${description}. Inspect ${directory}`);
}
let firstHost;
try {
  launch(azurite, ["--silent", "--skipApiVersionCheck", "--location", path.join(directory, "storage"), "--blobHost", "127.0.0.1", "--queueHost", "127.0.0.1", "--tableHost", "127.0.0.1", "--blobPort", String(blob), "--queuePort", String(queue), "--tablePort", String(table)], "azurite.log");
  await until(() => fetch(`http://127.0.0.1:${blob}`).then(() => true, () => false), "local storage", 20_000);
  firstHost = launch(func, ["start", "--port", String(port), "--no-build"], "host.log");
  console.log(`Running actual Functions host replay check. Logs: ${directory}`);
  await until(() => access(marker).then(() => true, () => false), "collection checkpoint and validation activity");
  const before = (await makeStore().read()).value;
  assert.equal(before.tasks.length, 1);
  assert.equal(before.tasks[0].phase, "validate");
  assert.equal(before.work.length, 0);
  const id = before.tasks[0].id;
  await stop(firstHost);
  await writeFile(release, "resume");
  launch(func, ["start", "--port", String(port), "--no-build"], "host-resumed.log");
  await until(async () => (await makeStore().read()).value.tasks.find(t => t.id === id)?.status === "completed", "resumed publication");
  const after = (await makeStore().read()).value;
  assert.equal(after.tasks[0].id, id);
  assert.equal(after.work.length, 1);
  assert.equal(after.work[0].status, "needs_review");
  assert.equal(after.runs.length, 1);
  assert.equal((await readFile(readLog, "utf8")).trim().split("\n").length, 1, "completed source activity is replayed from durable history");
  await api.command(owner, { action: "review", workId: after.work[0].id });
  assert((await makeStore().read()).value.work[0].reviewedAt);
  const result = { passed: true, syntheticOnly: true, engine: "Azure Durable Functions", checks: ["persisted source checkpoint", "worker process killed during validation", "same instance resumed", "source read once", "one cited result and run receipt", "review persisted through existing API"] };
  await writeFile(path.join(directory, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  for (const child of [...children]) await stop(child);
}
