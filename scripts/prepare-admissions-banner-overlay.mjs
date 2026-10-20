#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

const root = process.cwd();
const baseImage = process.env.ADMISSIONS_BANNER_BASE_IMAGE;
const expectedJs = process.env.ADMISSIONS_BANNER_EXPECTED_JS;
const expectedCss = process.env.ADMISSIONS_BANNER_EXPECTED_CSS;
const origin = "https://www.alamoplatform.com";
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(baseImage ?? "")) {
  throw new Error("Set ADMISSIONS_BANNER_BASE_IMAGE to the exact reviewed production digest.");
}
if (!/^\/assets\/index-[\w-]+\.js$/.test(expectedJs ?? "") || !/^\/assets\/index-[\w-]+\.css$/.test(expectedCss ?? "")) {
  throw new Error("Set the exact currently served JS and CSS asset names before preparing the overlay.");
}

const output = path.join(root, "generated", "admissions-banner-release", "context");
const overlay = path.join(output, "overlay");
const marker = "<!-- admissions-banner-hide-20261019 -->";
const link = '<link rel="stylesheet" href="/admissions-banner-hide-v1.css" />';
const paths = ["index.html", "admissions/index.html", "chat/index.html"];
const hashes = {};

async function writeCompressed(relative, bytes) {
  const target = path.join(overlay, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await Promise.all([
    writeFile(target, bytes),
    writeFile(`${target}.gz`, gzipSync(bytes)),
    writeFile(`${target}.br`, brotliCompressSync(bytes))
  ]);
}

for (const relative of paths) {
  const route = relative === "index.html" ? "/" : `/${relative.replace(/\/index\.html$/, "")}`;
  const response = await fetch(`${origin}${route}`, {
    redirect: "manual",
    headers: { "Cache-Control": "no-cache", "Accept-Encoding": "identity" },
    signal: AbortSignal.timeout(20_000)
  });
  if (response.status !== 200 || !response.headers.get("content-type")?.includes("text/html")) {
    throw new Error(`Unexpected production entry response for ${route}: ${response.status}`);
  }
  const html = await response.text();
  if (!html.includes(expectedJs) || !html.includes(expectedCss) || !html.includes("</head>") || html.includes(marker)) {
    throw new Error(`Production entry for ${route} does not match the reviewed shell.`);
  }
  const next = html.replace("</head>", `    ${marker}\n    ${link}\n  </head>`);
  await writeCompressed(relative, Buffer.from(next));
  hashes[route] = {
    before: createHash("sha256").update(html).digest("hex"),
    after: createHash("sha256").update(next).digest("hex")
  };
}

const css = await readFile(path.join(root, "deploy", "admissions-banner-hide.css"));
await writeCompressed("admissions-banner-hide-v1.css", css);
await writeFile(path.join(output, "Dockerfile"), `FROM ${baseImage}\nCOPY --chown=node:node overlay /app/dist\n`);
await writeFile(path.join(output, "release.json"), JSON.stringify({
  baseImage, expectedJs, expectedCss, source: process.env.ADMISSIONS_BANNER_SOURCE_COMMIT ?? null,
  entryHashes: hashes, cssSha256: createHash("sha256").update(css).digest("hex")
}, null, 2));
console.log(`Prepared admissions banner overlay for ${baseImage}; preserved ${expectedJs} and ${expectedCss}.`);
