import { brotliCompressSync, gzipSync } from "node:zlib";
import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = process.env.EXECUTIVE_DIRECTOR_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(base ?? "")) {
  throw new Error("Set EXECUTIVE_DIRECTOR_BASE_IMAGE to the verified current production digest.");
}

const destination = path.join(root, `generated/executive-director-release/context-${Date.now()}`);
const overlay = path.join(destination, "overlay");
await mkdir(path.join(overlay, "api"), { recursive: true });
await mkdir(path.join(overlay, "server"), { recursive: true });
await mkdir(path.join(overlay, "shared"), { recursive: true });

const exec = promisify(execFile);
const { stdout } = await exec("docker", ["create", "--platform", "linux/amd64", base]);
const container = stdout.trim();
try {
  await exec("docker", ["cp", `${container}:/app/api/platform.js`, path.join(overlay, "api/platform.js")]);
  await exec("docker", ["cp", `${container}:/app/server/dev-api.mjs`, path.join(overlay, "server/dev-api.mjs")]);
} finally {
  await exec("docker", ["rm", container]);
}

const handlerPath = path.join(overlay, "api/platform.js");
let handler = await readFile(handlerPath, "utf8");
const licensingAccessImport = 'import { assertLicensingAccess } from "../server/licensing-access.mjs";';
const executiveImport = `import {
  handleExecutiveDirectorApiRequest,
  isExecutiveDirectorApiPath
} from "../server/executive-director-api.mjs";`;
if (!handler.includes(licensingAccessImport)) {
  throw new Error("The selected production image does not contain the expected protected Licensing API.");
}
if (!handler.includes(executiveImport)) {
  handler = handler.replace(licensingAccessImport, `${licensingAccessImport}\n${executiveImport}`);
}

const requestMarker = '  const requestPath = String(req.url ?? "").split("?", 1)[0] ?? "";';
const executiveDispatch = `${requestMarker}
  if (isExecutiveDirectorApiPath(requestPath)) {
    await handleExecutiveDirectorApiRequest(req, res);
    return;
  }`;
if (!handler.includes(requestMarker)) {
  throw new Error("The selected production image has an unexpected API handler shape.");
}
if (!handler.includes("isExecutiveDirectorApiPath(requestPath)")) {
  handler = handler.replace(requestMarker, executiveDispatch);
}
await writeFile(handlerPath, handler);

const runtimePath = path.join(overlay, "server/dev-api.mjs");
let runtime = await readFile(runtimePath, "utf8");
const responseAdapterMarker = `    json(body) {
      sendJson(res, this.statusCode, body);
    }`;
if (!runtime.includes(responseAdapterMarker) && !runtime.includes("send(body)")) {
  throw new Error("The selected production image has an unexpected response adapter shape.");
}
if (!runtime.includes("send(body)")) {
  runtime = runtime.replace(responseAdapterMarker, `    json(body) {
      sendJson(res, this.statusCode, body);
    },
    send(body) {
      res.statusCode = this.statusCode;
      res.end(body);
    }`);
}
await writeFile(runtimePath, runtime);

const serverFiles = [
  "api-auth.mjs",
  "executive-director-access.mjs",
  "executive-director-api.mjs",
  "executive-director-dashboard.mjs",
  "executive-director-incidents.mjs",
  "executive-director-incidents-live.mjs",
  "executive-director-intake-storage.mjs",
  "executive-director-intake-lock.mjs",
  "executive-director-intake-objects.mjs",
  "executive-director-intake-receipts.mjs",
  "lic624-extraction.mjs",
  "lic624-review.mjs"
];
const sharedFiles = ["executive-director-access.mjs", "lic624-contracts.mjs"];
for (const file of serverFiles) {
  await cp(path.join(root, "server", file), path.join(overlay, "server", file));
}
for (const file of sharedFiles) {
  await cp(path.join(root, "shared", file), path.join(overlay, "shared", file));
}

// Check the exact combined filesystem without starting the application or
// contacting a data service. Missing relative imports must stop packaging,
// rather than survive until production because the local checkout has them.
// The proven base supplies unchanged dependencies; it is never rebuilt here.
const dependencyCheck = String.raw`
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const pending = JSON.parse(process.argv[1]);
const visited = new Set();
async function locate(relative) {
  for (const directory of ["/overlay", "/app"]) {
    const candidate = path.join(directory, relative);
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error("Release dependency is missing from the overlay and production base: " + relative);
}
while (pending.length) {
  const relative = pending.pop();
  if (visited.has(relative)) continue;
  visited.add(relative);
  const file = await locate(relative);
  if (!/\.(?:mjs|cjs|js)$/.test(file)) continue;
  const source = await readFile(file, "utf8");
  const imports = [
    ...source.matchAll(/(?:from\s+|import\s*\()(["'])([^"']+)\1/g),
    ...source.matchAll(/\bimport\s+(["'])([^"']+)\1/g)
  ];
  for (const match of imports) {
    const specifier = match[2];
    if (!specifier.startsWith(".")) continue;
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
    if (dependency === ".." || dependency.startsWith("../") || dependency.includes("\\")) {
      throw new Error("Release dependency leaves /app: " + relative + " -> " + specifier);
    }
    pending.push(dependency);
  }
}
console.log("Verified " + visited.size + " release modules and relative dependencies.");
`;
const releaseModules = [
  "api/platform.js",
  "server/dev-api.mjs",
  ...serverFiles.map((file) => `server/${file}`),
  ...sharedFiles.map((file) => `shared/${file}`)
];
// Copy instead of bind-mounting: the Docker daemon may run on a remote host
// where this checkout's absolute path does not exist. The temporary container
// runs only the filesystem checker, with networking disabled.
const verificationContainerResult = await exec("docker", [
  "create", "--network", "none", "--platform", "linux/amd64",
  "--entrypoint", "node", base, "--input-type=module", "--eval", dependencyCheck,
  JSON.stringify(releaseModules)
]);
const verificationContainer = verificationContainerResult.stdout.trim();
try {
  await exec("docker", ["cp", overlay, `${verificationContainer}:/overlay`]);
  const verification = await exec("docker", ["start", "--attach", verificationContainer]);
  const result = await exec("docker", ["inspect", "--format", "{{.State.ExitCode}}", verificationContainer]);
  if (result.stdout.trim() !== "0") {
    throw new Error(`Release dependency verification failed: ${verification.stderr || verification.stdout}`);
  }
  console.log(verification.stdout.trim());
} finally {
  await exec("docker", ["rm", "--force", verificationContainer]);
}
await cp(path.join(root, "dist"), path.join(overlay, "dist"), { recursive: true });

async function compress(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await compress(file);
    else if (/\.(?:html|js|css|json|svg)$/.test(entry.name)) {
      const bytes = await readFile(file);
      await writeFile(`${file}.gz`, gzipSync(bytes));
      await writeFile(`${file}.br`, brotliCompressSync(bytes));
    }
  }
}
await compress(path.join(overlay, "dist"));

await writeFile(
  path.join(destination, "Dockerfile"),
  `FROM ${base}\nUSER root\nWORKDIR /app\nRUN rm -rf /app/dist\nCOPY overlay /app\nRUN npm install --no-package-lock --no-save --omit=dev --ignore-scripts --no-audit --no-fund pdf-lib@1.17.1 \\\n  && chown -R node:node /app/dist ${releaseModules.map((file) => `/app/${file}`).join(" ")} /app/node_modules/pdf-lib /app/node_modules/@pdf-lib\nUSER node\n`
);
await writeFile(path.join(root, "generated/executive-director-release/context.txt"), destination);
console.log(destination);
