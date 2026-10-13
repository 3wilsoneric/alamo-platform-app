import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { gzipSync, brotliCompressSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = process.env.PRESENTATION_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(base ?? "")) {
  throw new Error("Set PRESENTATION_BASE_IMAGE to the verified current production digest.");
}
const destination = path.join(root, `generated/presentation-release/context-${Date.now()}`);
const overlay = path.join(destination, "overlay");
await mkdir(path.join(overlay, "api"), { recursive: true });
const exec = promisify(execFile);
await exec(process.execPath, [path.join(root, "scripts/check-presentation.mjs")], { env: { ...process.env, PRESENTATION_CONTENT_REQUIRED: "true" } });
const { stdout } = await exec("docker", ["create", "--platform", "linux/amd64", base]);
const container = stdout.trim();
try {
  await exec("docker", ["cp", `${container}:/app/api/platform.js`, path.join(overlay, "api/platform.js")]);
} finally {
  await exec("docker", ["rm", container]);
}
const handlerPath = path.join(overlay, "api/platform.js");
const original = await readFile(handlerPath, "utf8");
if (createHash("sha256").update(original).digest("hex") !== "4fbd4a2c004005e421c51ae19049e6332db932618e5f172db93a1dff034aceed") {
  throw new Error("Production API differs from the reviewed base. Reconcile it before releasing.");
}
const marker = "const PLATFORM_GET_ROUTES = Object.freeze({";
if (original.split(marker).length !== 2) throw new Error("Unexpected production API route map.");
const additions = [
  '  "/api/platform/presentation/access": ({ req, authContext }) => ({ allowed: hasPresentationAccess(authContext, { remoteAddress: req.socket?.remoteAddress }) }),',
  '  "/api/platform/presentation": ({ req, authContext }) => getPresentation(authContext, { remoteAddress: req.socket?.remoteAddress }),',
  '  "/api/platform/presentation/asset": ({ req, requestUrl, authContext }) => getPresentationAsset(requestUrl, authContext, { remoteAddress: req.socket?.remoteAddress }),'
].join("\n");
const handler = original.replace(marker, `import { getPresentation, getPresentationAsset, hasPresentationAccess } from "../server/presentation.mjs";\n\n${marker}\n${additions}`);
await writeFile(handlerPath, handler);
await mkdir(path.join(overlay, "server"), { recursive: true });
await cp(path.join(root, "server/presentation.mjs"), path.join(overlay, "server/presentation.mjs"));
await cp(path.join(root, "server/presentations"), path.join(overlay, "server/presentations"), { recursive: true });
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
await writeFile(path.join(destination, "Dockerfile"), `FROM ${base}\nCOPY --chown=node:node overlay /app\n`);
await writeFile(path.join(root, "generated/presentation-release/context.txt"), destination);
await writeFile(path.join(root, "generated/presentation-release/base-image.txt"), `${base}\n`);
console.log(destination);
