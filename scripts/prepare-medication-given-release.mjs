import { execFile } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const exec = promisify(execFile);
const baseImage = process.env.MEDICATION_BASE_IMAGE;
const sourceBase = "2d11635644caf4689fd23356bb07935655418eab";

if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(baseImage ?? "")) {
  throw new Error("Set MEDICATION_BASE_IMAGE to the verified current production digest.");
}

const git = async (...args) => (await exec("git", args, { cwd: root })).stdout.trim();
const head = await git("rev-parse", "HEAD");
if (await git("merge-base", sourceBase, head) !== sourceBase) {
  throw new Error("Release source must descend from the current production source commit.");
}
if (await git("status", "--porcelain")) {
  throw new Error("Commit or account for all checkout changes before preparing the release.");
}

const changedPaths = (await git("diff", "--name-only", "--diff-filter=ACMRT", sourceBase, head, "--", "server", "shared"))
  .split("\n")
  .filter(Boolean);
const deletedPaths = await git("diff", "--name-only", "--diff-filter=D", sourceBase, head, "--", "server", "shared");
if (deletedPaths) throw new Error(`Runtime file deletions require a reviewed release recipe: ${deletedPaths}`);
if (!changedPaths.length || !changedPaths.includes("shared/medication-presentation-policy.mjs")) {
  throw new Error("The medication runtime overlay is missing its policy module.");
}
if (changedPaths.some((relative) => !/^(server|shared)\/[a-zA-Z0-9/.-]+\.mjs$/.test(relative))) {
  throw new Error("Unexpected runtime file in medication release.");
}

const destination = path.join(root, `generated/medication-given-release/context-${Date.now()}`);
const overlay = path.join(destination, "overlay");
for (const relative of changedPaths) {
  const target = path.join(overlay, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(root, relative), target);
}
const entry = await readFile(path.join(root, "dist/index.html"), "utf8");
if (!entry.includes("/assets/index-")) throw new Error("Build the production browser bundle before preparing the release.");
await cp(path.join(root, "dist"), path.join(overlay, "dist"), { recursive: true });
await writeFile(path.join(destination, "Dockerfile"), `FROM ${baseImage}\nCOPY --chown=node:node overlay /app\n`);
await writeFile(path.join(destination, "manifest.json"), JSON.stringify({ head, sourceBase, baseImage, changedPaths }, null, 2));
console.log(destination);
