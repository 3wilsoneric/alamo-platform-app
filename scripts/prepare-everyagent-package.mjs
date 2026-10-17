import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Both deployment units use explicit closures, never a copy of Platform's
// runtime tree. Updating a dependency is a root-lock change reviewed separately.
const core = [
  "server/everyagent-access.mjs", "server/everyagent-adapters.mjs", "server/everyagent-persistence.mjs",
  "server/everyagent-publication.mjs", "server/everyagent-store.mjs", "server/everyagent-workflow-service.mjs",
  "server/everyagent-workflow-validation.mjs", "server/http-error-contract.mjs", "server/runtime-environment.mjs",
  "server/everyagent-source-client.mjs", "server/everyagent-source-runtime.mjs",
  "shared/everyagent-catalog.mjs", "shared/everyagent-contracts.mjs", "shared/everyagent-identity.mjs",
  "shared/licensing-access.mjs", "shared/licensing-communities.mjs", "shared/everyagent-links.mjs", "shared/everyagent-source-contracts.mjs"
];
const api = ["server/everyagent-auth.mjs", "server/everyagent-host.mjs", "server/everyagent-http.mjs", "server/everyagent-server.mjs",
  "server/everyagent-service.mjs", "server/http-body.mjs", "server/http-response.mjs", "shared/everyagent-client.mjs"];
const worker = ["server/everyagent-functions.mjs", "server/everyagent-orchestrator.mjs", "server/everyagent-worker.mjs"];

export async function prepareEveryAgentPackage(kind) {
  if (!["service", "worker"].includes(kind)) throw new Error("Choose an agent deployment unit.");
  const root = process.cwd();
  const destination = path.join(root, `generated/everyagent-${kind}`);
  const files = [...core, ...(kind === "service" ? api : worker)];
  const sourcePackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  const names = ["@azure/identity", "@azure/storage-blob", ...(kind === "service" ? ["jose"] : ["@azure/functions", "durable-functions"])];
  const dependencies = Object.fromEntries(names.map(name => [name, lock.packages[`node_modules/${name}`].version]));
  const pkg = { name: kind === "service" ? "alamoagent-api" : "alamoagent-worker", version: "1.0.0", private: true, type: "module", engines: sourcePackage.engines,
    ...(kind === "service" ? { scripts: { start: "node server/everyagent-server.mjs" } } :
      { main: "server/everyagent-worker.mjs", overrides: { "durable-functions": sourcePackage.overrides["durable-functions"] } }), dependencies };
  await rm(destination, { recursive: true, force: true });
  for (const file of files) {
    await mkdir(path.dirname(path.join(destination, file)), { recursive: true });
    await cp(path.join(root, file), path.join(destination, file));
  }
  await writeFile(path.join(destination, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  lock.name = pkg.name; lock.version = pkg.version;
  lock.packages[""] = { name: pkg.name, version: pkg.version, engines: pkg.engines, dependencies };
  await writeFile(path.join(destination, "package-lock.json"), JSON.stringify(lock, null, 2) + "\n");
  execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: destination, stdio: "pipe", timeout: 120_000 });
  const pruned = JSON.parse(await readFile(path.join(destination, "package-lock.json"), "utf8"));
  for (const [name, dependency] of Object.entries(pruned.packages)) {
    if (name && (dependency.version !== lock.packages[name]?.version || dependency.integrity !== lock.packages[name]?.integrity)) throw new Error("The isolated package changed a reviewed dependency. Update the root lock explicitly.");
  }
  if (kind === "worker") await cp(path.join(root, "scripts/azure/everyagent-host.json"), path.join(destination, "host.json"));
  else await writeFile(path.join(destination, "Dockerfile"), "FROM node:22-bookworm-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund\nCOPY server ./server\nCOPY shared ./shared\nENV NODE_ENV=production\nUSER node\nEXPOSE 8080\nCMD [\"node\", \"server/everyagent-server.mjs\"]\n");
  console.log(`Prepared independent ${kind} (${files.length} runtime files, ${names.length} direct dependencies) at ${destination}. No resources created or deployed.`);
}
