import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.INCIDENT_PERSONNEL_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(base ?? "")) {
  throw new Error("Set INCIDENT_PERSONNEL_BASE_IMAGE to the verified live production digest.");
}

const root = process.cwd();
const destination = path.join(root, `generated/incident-personnel-release/context-${Date.now()}`);
const overlay = path.join(destination, "overlay");
const baseSource = "a7f9236e4f5ca02b2c0531cbf177dbe147b186fd";
const changedFiles = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACM", baseSource, "HEAD", "--", "server", "shared"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const runtimeFiles = changedFiles.filter((name) => /^(?:server|shared)\/.+\.mjs$/.test(name));
if (!runtimeFiles.includes("server/executive-director-api.mjs") || !runtimeFiles.includes("shared/medication-presentation-policy.mjs")) {
  throw new Error("Expected incident and medication runtime files are missing from the release diff.");
}

for (const name of runtimeFiles) {
  await mkdir(path.dirname(path.join(overlay, name)), { recursive: true });
  await cp(path.join(root, name), path.join(overlay, name));
}
await cp(path.join(root, "dist"), path.join(overlay, "dist"), { recursive: true });
await writeFile(path.join(destination, "Dockerfile"), `FROM ${base}\nCOPY --chown=node:node overlay /app\n`);
await writeFile(path.join(destination, "release.json"), JSON.stringify({
  base,
  baseSource,
  source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  files: runtimeFiles,
  distEntry: (await readFile(path.join(root, "dist/index.html"), "utf8")).match(/assets\/index-[^"']+\.js/)?.[0] ?? null
}, null, 2));
console.log(destination);
