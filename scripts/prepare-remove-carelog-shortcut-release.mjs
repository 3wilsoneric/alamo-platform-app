#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

const baseImage = process.env.CARELOG_SHORTCUT_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(baseImage ?? "")) {
  throw Error("Set CARELOG_SHORTCUT_BASE_IMAGE to the current production image digest.");
}
const current = execFileSync("az", ["containerapp", "show", "-n", "alamo-platform-prod-web", "-g", "alamo-data-rg", "--query", "properties.template.containers[0].image", "-o", "tsv"], { encoding: "utf8" }).trim();
if (current !== baseImage) throw Error("Production image changed. Rebase the overlay.");

const output = path.join(process.cwd(), "generated", "remove-carelog-shortcut-release", "context");
const overlay = path.join(output, "overlay", "dist");
await rm(output, { recursive: true, force: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fromImage = (relative) => execFileSync("docker", ["run", "--rm", "--platform", "linux/amd64", "--entrypoint", "cat", baseImage, `/app/dist/${relative}`], { maxBuffer: 32 * 1024 * 1024 });
const fromLive = (relative) => execFileSync("curl", ["-fsSL", `https://www.alamoplatform.com/${relative}`], { maxBuffer: 32 * 1024 * 1024 });
const routes = [
  ["index.html", "analytics"],
  ["admissions/index.html", "admissions"],
  ["chat/index.html", "chat"],
];
for (const [relative, route] of routes) {
  const original = fromImage(relative);
  if (hash(original) !== hash(fromLive(route))) throw Error(`${route} does not match the pinned image.`);
  const html = original.toString("utf8");
  const pattern = /\s*<script defer src="\/point-of-care-launcher\.js(?:\?[^"]*)?"><\/script>/g;
  if ([...html.matchAll(pattern)].length !== 1) throw Error(`Expected one Carelog shortcut script in ${relative}.`);
  const updated = Buffer.from(html.replace(pattern, ""));
  const target = path.join(overlay, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await Promise.all([writeFile(target, updated), writeFile(`${target}.gz`, gzipSync(updated)), writeFile(`${target}.br`, brotliCompressSync(updated))]);
}
await writeFile(path.join(output, "Dockerfile"), `FROM ${baseImage}\nCOPY --chown=node:node overlay/dist /app/dist\n`);
console.log(JSON.stringify({ baseImage, output, routes: routes.map(([relative]) => relative) }));
