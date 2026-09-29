import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync, brotliCompressSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = process.env.LICENSING_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(base ?? "")) {
  throw new Error("Set LICENSING_BASE_IMAGE to the verified current production digest.");
}
const destination = path.join(root, `generated/licensing-release/context-${Date.now()}`);
const overlay = path.join(destination, "overlay");
await mkdir(path.join(overlay, "api"), { recursive: true });
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
const marker = "const PLATFORM_GET_ROUTES = Object.freeze({";
if (handler.split(marker).length !== 2) throw new Error("Unexpected production API shape; inspect before overlaying.");
if (!handler.includes("/api/platform/licensing")) handler = handler.replace(marker, `import { getLicensingLibrary, getLicensingReport, getLicensingUpdates } from "../server/licensing-library.mjs";

${marker}
  "/api/platform/licensing": ({ requestUrl }) => getLicensingLibrary(requestUrl),
  "/api/platform/licensing/report": ({ requestUrl }) => getLicensingReport(requestUrl),
  "/api/platform/licensing/updates": () => getLicensingUpdates(),`);
const libraryImport = 'import { getLicensingLibrary, getLicensingReport, getLicensingUpdates } from "../server/licensing-library.mjs";';
const accessImport = 'import { assertLicensingAccess } from "../server/licensing-access.mjs";';
if (!handler.includes(accessImport)) {
  if (handler.split(libraryImport).length !== 2) throw new Error("Unexpected Licensing import; refusing release.");
  handler = handler.replace(libraryImport, `${libraryImport}\n${accessImport}`);
}
for (const [route, loader, needsUrl] of [
  ["/api/platform/licensing", "getLicensingLibrary", true],
  ["/api/platform/licensing/report", "getLicensingReport", true],
  ["/api/platform/licensing/updates", "getLicensingUpdates", false]
]) {
  const before = `  "${route}": ${needsUrl ? "({ requestUrl })" : "()"} => ${loader}(${needsUrl ? "requestUrl" : ""}),`;
  const after = `  "${route}": (${needsUrl ? "{ requestUrl, authContext }" : "{ authContext }"}) => {\n    assertLicensingAccess(authContext);\n    return ${loader}(${needsUrl ? "requestUrl" : ""});\n  },`;
  if (handler.split(before).length === 2) handler = handler.replace(before, after);
  else if (handler.split(after).length !== 2) throw new Error(`Unexpected ${route} handler; refusing release.`);
}
await writeFile(handlerPath, handler);
for (const directory of ["server", "shared"]) {
  await mkdir(path.join(overlay, directory), { recursive: true });
  for (const file of await readdir(path.join(root, directory))) {
    if (file.startsWith("licensing-") && file.endsWith(".mjs")) await cp(path.join(root, directory, file), path.join(overlay, directory, file));
  }
}
await cp(path.join(root, "shared/platform-owner-access.mjs"), path.join(overlay, "shared/platform-owner-access.mjs"));
await cp(path.join(root, "server/platform-knowledge-access.mjs"), path.join(overlay, "server/platform-knowledge-access.mjs"));
await cp(path.join(root, "dist"), path.join(overlay, "dist"), { recursive: true });
// Override every compressed representation too; the production server prefers them.
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
await writeFile(path.join(destination, "Dockerfile"), `FROM ${base}\nCOPY --chown=node:node overlay /app\n`);
await writeFile(path.join(root, "generated/licensing-release/context.txt"), destination);
console.log(destination);
