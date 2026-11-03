#!/usr/bin/env node

// Bound the access change to the currently serving browser bundle and shared
// server policy. A full frontend rebuild would replace other live UI work.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

const baseImage = process.env.LICENSING_VIEWERS_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(baseImage ?? "")) {
  throw Error("Set LICENSING_VIEWERS_BASE_IMAGE to the current production image digest.");
}
const currentImage = execFileSync("az", ["containerapp", "show", "-n", "alamo-platform-prod-web", "-g", "alamo-data-rg", "--query", "properties.template.containers[0].image", "-o", "tsv"], { encoding: "utf8" }).trim();
if (currentImage !== baseImage) throw Error("Production image changed; rebase the access overlay.");

const output = path.join(process.cwd(), "generated", "licensing-four-viewers", "context");
const overlay = path.join(output, "overlay");
await rm(output, { recursive: true, force: true });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fromImage = relative => execFileSync("docker", ["run", "--rm", "--platform", "linux/amd64", "--entrypoint", "cat", baseImage, `/app/${relative}`], { maxBuffer: 32 * 1024 * 1024 });
const fromLive = relative => execFileSync("curl", ["-fsSL", `https://www.alamoplatform.com/${relative.replace(/^dist\//, "")}`], { maxBuffer: 32 * 1024 * 1024 });
async function writeCompressed(relative, bytes) {
  const target = path.join(overlay, "dist", relative);
  await mkdir(path.dirname(target), { recursive: true });
  await Promise.all([writeFile(target, bytes), writeFile(`${target}.gz`, gzipSync(bytes)), writeFile(`${target}.br`, brotliCompressSync(bytes))]);
}
function replaceOnce(text, oldText, newText) {
  if (text.split(oldText).length !== 2) throw Error(`Unexpected access bundle near ${oldText.slice(0, 60)}.`);
  return text.replace(oldText, newText);
}

const index = fromImage("dist/index.html");
if (hash(index) !== hash(fromLive("dist/index.html"))) throw Error("Live entry differs from the pinned image.");
const oldJs = index.toString("utf8").match(/\/assets\/(index-[\w-]+\.js)/)?.[1];
if (oldJs !== "index-licensing-alert-14e559593938.js") throw Error("Serving browser bundle changed.");
const oldBytes = fromImage(`dist/assets/${oldJs}`);
if (hash(oldBytes) !== hash(fromLive(`dist/assets/${oldJs}`))) throw Error("Live browser bundle differs from the pinned image.");
const oldUsers = "var es=`d72d9036-cff8-4f5f-a6fa-d698f621d420`,ts=new Set([`424b21d4-605a-43a6-8dff-2a89a846e698`,`75099b5b-5f7d-437f-8e3b-181f1fea1653`,`f73371d5-d2b4-48b4-a32b-1edc7c88869f`]);";
const newUsers = "var es=`d72d9036-cff8-4f5f-a6fa-d698f621d420`,ts=new Set([`424b21d4-605a-43a6-8dff-2a89a846e698`,`e9f39185-d751-45c0-bcf5-c24d3565bdd9`,`75099b5b-5f7d-437f-8e3b-181f1fea1653`,`f73371d5-d2b4-48b4-a32b-1edc7c88869f`]);";
const js = replaceOnce(oldBytes.toString("utf8"), oldUsers, newUsers);
const newJs = `index-licensing-viewers-${hash(js).slice(0, 12)}.js`;
await writeCompressed(`assets/${newJs}`, Buffer.from(js));
for (const relative of ["dist/index.html", "dist/admissions/index.html", "dist/chat/index.html"]) {
  let original;
  try { original = fromImage(relative).toString("utf8"); }
  catch (error) {
    if (relative === "dist/index.html") throw error;
    continue;
  }
  const oldTag = `<script type="module" crossorigin src="/assets/${oldJs}"></script>`;
  if (!original.includes(oldTag)) {
    if (relative === "dist/index.html") throw Error("Root entry script changed.");
    continue;
  }
  await writeCompressed(relative.replace(/^dist\//, ""), Buffer.from(replaceOnce(original, oldTag, `<script type="module" crossorigin src="/assets/${newJs}"></script>`)));
}
const sourcePolicy = await readFile(new URL("../shared/licensing-access.mjs", import.meta.url));
const basePolicy = fromImage("shared/licensing-access.mjs");
if (!basePolicy.toString("utf8").includes("f73371d5-d2b4-48b4-a32b-1edc7c88869f") ||
    basePolicy.toString("utf8").includes("e9f39185-d751-45c0-bcf5-c24d3565bdd9")) {
  throw Error("Base server policy differs from the expected three-viewer allowlist.");
}
const policyPath = path.join(overlay, "shared", "licensing-access.mjs");
await mkdir(path.dirname(policyPath), { recursive: true });
await writeFile(policyPath, sourcePolicy);
await writeFile(path.join(output, "Dockerfile"), `FROM ${baseImage}\nCOPY --chown=node:node overlay/dist /app/dist\nCOPY --chown=node:node overlay/shared /app/shared\n`);
console.log(JSON.stringify({ baseImage, oldJs, newJs, output, policySha256: hash(sourcePolicy) }));
