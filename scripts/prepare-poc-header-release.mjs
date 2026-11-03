#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

const baseImage = process.env.POC_HEADER_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(baseImage ?? "")) throw Error("Set POC_HEADER_BASE_IMAGE to the current production image digest.");
const current = execFileSync("az", ["containerapp", "show", "-n", "alamo-platform-prod-web", "-g", "alamo-data-rg", "--query", "properties.template.containers[0].image", "-o", "tsv"], { encoding: "utf8" }).trim();
if (current !== baseImage) throw Error("Production image changed. Rebase the overlay.");
const output = path.join(process.cwd(), "generated", "poc-header-release", "context");
const overlay = path.join(output, "overlay", "dist");
await rm(output, { recursive: true, force: true });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fromImage = (relative) => execFileSync("docker", ["run", "--rm", "--platform", "linux/amd64", "--entrypoint", "cat", baseImage, `/app/dist/${relative}`], { maxBuffer: 32 * 1024 * 1024 });
const fromLive = (relative) => execFileSync("curl", ["-fsSL", `https://www.alamoplatform.com/${relative}`], { maxBuffer: 32 * 1024 * 1024 });
async function writeCompressed(relative, bytes) {
  const target = path.join(overlay, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await Promise.all([writeFile(target, bytes), writeFile(`${target}.gz`, gzipSync(bytes)), writeFile(`${target}.br`, brotliCompressSync(bytes))]);
}
const oldLauncher = fromImage("point-of-care-launcher.js");
if (hash(oldLauncher) !== hash(fromLive("point-of-care-launcher.js"))) throw Error("The live launcher does not match the pinned image.");
const newLauncher = await readFile("public/point-of-care-launcher.js");
await writeCompressed("point-of-care-launcher.js", newLauncher);
for (const relative of ["carelog.html", "carelog-launch.js", "carelog-demo.html", "carelog-demo-launch.js"]) {
  await writeCompressed(relative, await readFile(path.join("public", relative)));
}
const version = `header-${hash(newLauncher).slice(0, 12)}`;
for (const relative of ["index.html", "admissions/index.html", "chat/index.html"]) {
  const original = fromImage(relative).toString("utf8");
  if (relative === "index.html" && hash(original) !== hash(fromLive("analytics"))) throw Error("The live entry does not match the pinned image.");
  const script = `<script defer src="/point-of-care-launcher.js?v=${version}"></script>`;
  const updated = /<script defer src="\/point-of-care-launcher\.js(?:\?[^\"]*)?"\s*><\/script>/.test(original)
    ? original.replace(/<script defer src="\/point-of-care-launcher\.js(?:\?[^\"]*)?"\s*><\/script>/, script)
    : original.replace("</body>", `  ${script}\n  </body>`);
  if (updated === original || !updated.includes(script)) throw Error(`Could not add launcher to ${relative}`);
  await writeCompressed(relative, Buffer.from(updated));
}
await writeFile(path.join(output, "Dockerfile"), `FROM ${baseImage}\nCOPY --chown=node:node overlay/dist /app/dist\n`);
console.log(JSON.stringify({ baseImage, output, version, launcherSha256: hash(newLauncher) }));
