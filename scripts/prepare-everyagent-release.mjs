import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const root = process.cwd();
const sourcePackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (sourcePackage.dependencies?.["@alamo/agent-runtime"]) {
  throw new Error("The legacy agent overlay cannot install the extracted engine. Build a dependency-aware Platform image including its lock and vendor package, or deploy the independent agent API/worker.");
}
const base = process.env.EVERYAGENT_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(base ?? "")) {
  throw new Error("Set EVERYAGENT_BASE_IMAGE to the verified live production digest.");
}
const destination = path.join(root, `generated/everyagent-release/context-${Date.now()}`);
const overlay = path.join(destination, "overlay");
await mkdir(path.join(overlay, "api"), { recursive: true });
const exec = promisify(execFile);
const { stdout } = await exec("docker", ["create", "--platform", "linux/amd64", base]);
const container = stdout.trim();
try {
  await exec("docker", ["cp", `${container}:/app/api/platform.js`, path.join(overlay, "api/platform.js")]);
  await exec("docker", ["cp", `${container}:/app/server/app-server.mjs`, path.join(destination, "base-app-server.mjs")]);
} finally { await exec("docker", ["rm", container]); }
const apiPath = path.join(overlay, "api/platform.js");
let api = await readFile(apiPath, "utf8");
const marker = '  const requestPath = String(req.url ?? "").split("?", 1)[0] ?? "";';
if (api.includes("handleEveryAgentRequest") || api.split(marker).length !== 2) throw new Error("Inspect current API shape before release.");
api = 'import { handleEveryAgentRequest } from "../server/everyagent-api.mjs";\n' + api.replace(marker, `${marker}
  if (requestPath === "/api/platform/everyagent" || requestPath.startsWith("/api/platform/everyagent/")) {
    await handleEveryAgentRequest(req, res);
    return;
  }`);
await writeFile(apiPath, api);
for (const directory of ["server", "shared"]) {
  await mkdir(path.join(overlay, directory), { recursive: true });
  for (const file of await readdir(path.join(root, directory))) {
    if (file.startsWith("everyagent-") && file.endsWith(".mjs")) await cp(path.join(root, directory, file), path.join(overlay, directory, file));
  }
}
await cp(path.join(root, "dist"), path.join(overlay, "dist"), { recursive: true });
await writeFile(path.join(destination, "Dockerfile"), `FROM ${base}\nCOPY --chown=node:node overlay /app\n`);
await writeFile(path.join(root, "generated/everyagent-release/context.txt"), destination);
console.log(destination);
