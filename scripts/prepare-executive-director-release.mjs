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

for (const file of [
  "api-auth.mjs",
  "executive-director-access.mjs",
  "executive-director-api.mjs",
  "executive-director-intake-storage.mjs",
  "lic624-extraction.mjs",
  "lic624-review.mjs"
]) {
  await cp(path.join(root, "server", file), path.join(overlay, "server", file));
}
for (const file of ["executive-director-access.mjs", "lic624-contracts.mjs"]) {
  await cp(path.join(root, "shared", file), path.join(overlay, "shared", file));
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
  `FROM ${base}\nUSER root\nWORKDIR /app\nRUN rm -rf /app/dist\nCOPY overlay /app\nRUN npm install --no-package-lock --no-save --omit=dev --ignore-scripts --no-audit --no-fund pdf-lib@1.17.1 \\\n  && chown -R node:node /app/dist /app/api/platform.js /app/server/api-auth.mjs /app/server/executive-director-access.mjs /app/server/executive-director-api.mjs /app/server/executive-director-intake-storage.mjs /app/server/lic624-extraction.mjs /app/server/lic624-review.mjs /app/shared/executive-director-access.mjs /app/shared/lic624-contracts.mjs /app/node_modules/pdf-lib /app/node_modules/@pdf-lib\nUSER node\n`
);
await writeFile(path.join(root, "generated/executive-director-release/context.txt"), destination);
console.log(destination);
