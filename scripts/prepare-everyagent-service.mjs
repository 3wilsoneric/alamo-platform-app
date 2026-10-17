import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const destination = path.join(root, "generated/everyagent-service");
// Explicitly package the API closure. Platform connectors, reporting engines,
// presentation assets, browser output, credentials and the scheduler stay out.
const files = [
  "server/everyagent-access.mjs", "server/everyagent-adapters.mjs", "server/everyagent-auth.mjs",
  "server/everyagent-host.mjs", "server/everyagent-http.mjs", "server/everyagent-persistence.mjs",
  "server/everyagent-publication.mjs", "server/everyagent-server.mjs", "server/everyagent-service.mjs",
  "server/everyagent-store.mjs", "server/everyagent-workflow-service.mjs", "server/everyagent-workflow-validation.mjs",
  "server/http-body.mjs", "server/http-error-contract.mjs", "server/http-response.mjs", "server/runtime-environment.mjs",
  "shared/everyagent-catalog.mjs", "shared/everyagent-client.mjs", "shared/everyagent-contracts.mjs",
  "shared/everyagent-identity.mjs", "shared/licensing-access.mjs", "shared/licensing-communities.mjs"
];
const sourcePackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
const dependencies = Object.fromEntries(["@azure/identity", "@azure/storage-blob", "jose"].map(name => [name, lock.packages[`node_modules/${name}`].version]));
const pkg = { name: "alamoagent-api", version: "1.0.0", private: true, type: "module", engines: sourcePackage.engines,
  scripts: { start: "node server/everyagent-server.mjs" }, dependencies };
await rm(destination, { recursive: true, force: true });
for (const file of files) {
  await mkdir(path.dirname(path.join(destination, file)), { recursive: true });
  await cp(path.join(root, file), path.join(destination, file));
}
await writeFile(path.join(destination, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
// Seed from the reviewed root lock, then let npm prune unreachable packages.
// Exact direct versions and the retained lock keep compatible transitives fixed.
lock.name = pkg.name; lock.version = pkg.version;
lock.packages[""] = { name: pkg.name, version: pkg.version, engines: pkg.engines, dependencies };
await writeFile(path.join(destination, "package-lock.json"), JSON.stringify(lock, null, 2) + "\n");
execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: destination, stdio: "pipe", timeout: 120_000 });
await writeFile(path.join(destination, "Dockerfile"), "FROM node:22-bookworm-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund\nCOPY server ./server\nCOPY shared ./shared\nENV NODE_ENV=production\nUSER node\nEXPOSE 8080\nCMD [\"node\", \"server/everyagent-server.mjs\"]\n");
console.log(`Prepared independent API (${files.length} source files, 3 direct dependencies) at ${destination}. No resources created or deployed.`);
