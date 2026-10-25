#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

const baseImage = process.env.WORKFORCE_RENAME_BASE_IMAGE;
const expectedJs = process.env.WORKFORCE_RENAME_EXPECTED_JS;
const expectedCss = process.env.WORKFORCE_RENAME_EXPECTED_CSS;
const registry = "pipelineprodacra6qdvl6ebenac.azurecr.io";
const origin = "https://alamoplatform.com";

if (!new RegExp(`^${registry.replaceAll(".", "\\.")}/alamo-platform@sha256:[a-f0-9]{64}$`).test(baseImage ?? "")) {
  throw new Error("Set WORKFORCE_RENAME_BASE_IMAGE to the exact current production digest.");
}
if (!/^index-[\w-]+\.js$/.test(expectedJs ?? "") || !/^index-[\w-]+\.css$/.test(expectedCss ?? "")) {
  throw new Error("Set the exact current JS and CSS asset names.");
}

const output = path.join(process.cwd(), "generated", "workforce-rename-release", "context");
const overlay = path.join(output, "overlay");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const count = (text, needle) => text.split(needle).length - 1;

function fromImage(relative) {
  return execFileSync("docker", ["run", "--rm", "--platform", "linux/amd64", "--entrypoint", "cat", baseImage, `/app/dist/${relative}`], {
    maxBuffer: 8 * 1024 * 1024
  });
}

function replaceOnce(value, before, after) {
  if (count(value, before) !== 1) throw new Error(`Expected exactly one production occurrence of ${before.slice(0, 90)}.`);
  return value.replace(before, after);
}

async function writeCompressed(relative, bytes) {
  const target = path.join(overlay, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await Promise.all([
    writeFile(target, bytes),
    writeFile(`${target}.gz`, gzipSync(bytes)),
    writeFile(`${target}.br`, brotliCompressSync(bytes))
  ]);
}

async function assertLiveMatches(relative, imageBytes) {
  const response = await fetch(`${origin}/${relative}`, {
    headers: { "Cache-Control": "no-cache", "Accept-Encoding": "identity" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`Live ${relative} returned ${response.status}.`);
  const liveBytes = Buffer.from(await response.arrayBuffer());
  if (hash(liveBytes) !== hash(imageBytes)) throw new Error(`Live ${relative} differs from the reviewed production image.`);
}

const originalJs = fromImage(`assets/${expectedJs}`);
const originalCss = fromImage(`assets/${expectedCss}`);
await Promise.all([
  assertLiveMatches(`assets/${expectedJs}`, originalJs),
  assertLiveMatches(`assets/${expectedCss}`, originalCss)
]);

let js = originalJs.toString("utf8");
if (count(js, "Personnel") !== 10 || count(js, "/personnel") !== 4) {
  throw new Error("The production Workforce bundle changed; review its labels and routes before release.");
}

js = replaceOnce(js,
  "{id:`personnel`,label:`Personnel`,href:`/personnel`,ownerOnly:!0}",
  "{id:`workforce`,label:`Workforce`,href:`/workforce`,ownerOnly:!0}");
js = replaceOnce(js,
  "t.startsWith(`/personnel`)||t.startsWith(`/workforce`)?`personnel`",
  "t.startsWith(`/workforce`)||t.startsWith(`/personnel`)?`workforce`");
js = replaceOnce(js,
  "to:`/personnel${e.search}${e.hash}`,replace:!0",
  "to:`/workforce${e.search}${e.hash}`,replace:!0");
js = replaceOnce(js,
  "path:`/personnel`,element:yk((0,V.jsx)(EC,{}))",
  "path:`/workforce`,element:yk((0,V.jsx)(EC,{}))");
js = replaceOnce(js,
  "path:`/workforce`,element:(0,V.jsx)(Sk,{})",
  "path:`/personnel`,element:(0,V.jsx)(Sk,{})");
js = js.replaceAll("Personnel", "Workforce");
if (js.includes("Personnel") || count(js, "/personnel") !== 2) {
  throw new Error("The renamed bundle still has an unexpected Personnel label or route.");
}

let css = originalCss.toString("utf8");
css = replaceOnce(css, "aria-label=Personnel\\ pages", "aria-label=Workforce\\ pages");

const nextJs = `index-workforce-${hash(js).slice(0, 12)}.js`;
const nextCss = `index-workforce-${hash(css).slice(0, 12)}.css`;
const entryHashes = {};
for (const relative of ["index.html", "admissions/index.html", "chat/index.html"]) {
  const originalHtml = fromImage(relative);
  await assertLiveMatches(relative, originalHtml);
  let html = originalHtml.toString("utf8");
  html = replaceOnce(html, `/assets/${expectedJs}`, `/assets/${nextJs}`);
  html = replaceOnce(html, `/assets/${expectedCss}`, `/assets/${nextCss}`);
  await writeCompressed(relative, Buffer.from(html));
  entryHashes[relative] = { before: hash(originalHtml), after: hash(html) };
}

await writeCompressed(`assets/${nextJs}`, Buffer.from(js));
await writeCompressed(`assets/${nextCss}`, Buffer.from(css));
await writeFile(path.join(output, "Dockerfile"), `FROM ${baseImage}\nCOPY --chown=node:node overlay /app/dist\n`);
await writeFile(path.join(output, "release.json"), JSON.stringify({
  baseImage,
  expectedJs,
  expectedCss,
  nextJs,
  nextCss,
  jsHashes: { before: hash(originalJs), after: hash(js) },
  cssHashes: { before: hash(originalCss), after: hash(css) },
  entryHashes
}, null, 2));
console.log(`Prepared Workforce rename over ${baseImage}; new assets ${nextJs} and ${nextCss}.`);
