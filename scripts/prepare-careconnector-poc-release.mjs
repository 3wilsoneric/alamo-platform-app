import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = process.env.POC_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(base ?? "")) throw new Error("Set POC_BASE_IMAGE to the verified current production image digest.");
const assets = process.env.POC_WEB_DIRECTORY;
if (!assets || !path.isAbsolute(assets)) throw new Error("Set POC_WEB_DIRECTORY to CareConnector's mounted Vite output directory.");
const html = await readFile(path.join(assets, "index.html"), "utf8");
const presenter = await readFile(path.join(assets, "present.html"), "utf8");
if (!html.includes('/poc/app/assets/') || !presenter.includes('src="/poc/app/?presented=1"')) throw new Error("CareConnector must be built with vite.poc.config.ts.");
const destination = path.join(root, `generated/poc-release/context-${Date.now()}`);
const overlay = path.join(destination, "overlay");
await mkdir(path.join(overlay, "server"), { recursive: true });
const exec = promisify(execFile);
await exec(process.execPath, ["--test", path.join(root, "scripts/check-careconnector-poc.mjs")]);
const { stdout } = await exec("docker", ["create", "--platform", "linux/amd64", base]);
const container = stdout.trim();
let installedProxy = null;
try {
  await exec("docker", ["cp", `${container}:/app/server/app-server.mjs`, path.join(overlay, "server/app-server.mjs")]);
  if ((await readFile(path.join(overlay, "server/app-server.mjs"), "utf8")).includes("createPocHandler")) {
    await exec("docker", ["cp", `${container}:/app/server/careconnector-poc.mjs`, path.join(overlay, "server/careconnector-poc.mjs")]);
    installedProxy = await readFile(path.join(overlay, "server/careconnector-poc.mjs"), "utf8");
  }
} finally { await exec("docker", ["rm", container]); }
const serverPath = path.join(overlay, "server/app-server.mjs");
const original = await readFile(serverPath, "utf8");
const digest = createHash("sha256").update(original).digest("hex");
if (digest !== process.env.POC_REVIEWED_SERVER_SHA256) throw new Error("Base server differs from the reviewed source; reconcile before releasing.");
const rootMarker = 'const DIST_ROOT = path.resolve(__dirname, "../dist");';
const handlerMarker = 'async function handleRequest(req, res) {';
if (original.split(rootMarker).length !== 2 || original.split(handlerMarker).length !== 2) throw new Error("Unexpected base server; inspect its route ownership before releasing.");
const proxySource = await readFile(path.join(root, "server/careconnector-poc.mjs"), "utf8");
if (installedProxy !== null) {
  // Branding/assets updates preserve the already-reviewed production proxy byte for byte.
  for (const marker of ['import { createPocHandler } from "./careconnector-poc.mjs";', `${rootMarker}\nconst handlePoc = createPocHandler({ distRoot: DIST_ROOT });`, `${handlerMarker}\n  if (await handlePoc(req, res)) return;`]) {
    if (original.split(marker).length !== 2) throw new Error("Existing POC mount differs from the reviewed route integration.");
  }
  if (installedProxy !== proxySource) throw new Error("Installed POC proxy differs from the reviewed source; reconcile before releasing.");
} else {
  await writeFile(serverPath, 'import { createPocHandler } from "./careconnector-poc.mjs";\n' + original
    .replace(rootMarker, `${rootMarker}\nconst handlePoc = createPocHandler({ distRoot: DIST_ROOT });`)
    .replace(handlerMarker, `${handlerMarker}\n  if (await handlePoc(req, res)) return;`));
  await cp(path.join(root, "server/careconnector-poc.mjs"), path.join(overlay, "server/careconnector-poc.mjs"));
}
const pocRoot = path.join(overlay, "dist/poc");
await cp(assets, path.join(pocRoot, "app"), { recursive: true });
await writeFile(path.join(pocRoot, "index.html"), presenter);
// The hosted browser install may never claim Platform's root URL or service-worker scope.
const manifestPath = path.join(pocRoot, "app/manifest.webmanifest");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.start_url = "/poc/app/";
manifest.scope = "/poc/app/";
manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: `/poc/app/${icon.src.replace(/^\//, "")}` }));
await writeFile(manifestPath, JSON.stringify(manifest));
async function compress(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await compress(file);
    else if (/\.(?:html|js|css|json|svg|webmanifest)$/.test(entry.name)) {
      const bytes = await readFile(file);
      await writeFile(`${file}.gz`, gzipSync(bytes));
      await writeFile(`${file}.br`, brotliCompressSync(bytes));
    }
  }
}
await compress(pocRoot);
await writeFile(path.join(destination, "Dockerfile"), `FROM ${base}\nCOPY --chown=node:node overlay /app\n`);
await writeFile(path.join(root, "generated/poc-release/context.txt"), destination);
await writeFile(path.join(destination, "receipt.json"), JSON.stringify({ base, baseServerSha256: digest, changed: installedProxy === null ? ["server/app-server.mjs (three additions)", "server/careconnector-poc.mjs", "dist/poc/**"] : ["dist/poc/**"], existingServerPreserved: installedProxy !== null }, null, 2));
console.log(destination);
