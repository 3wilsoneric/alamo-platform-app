#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

// Fleet UI is maintained in Carelog's shared component, but served as its own
// Platform document. Build with web/vite.fleet.config.ts in that repository.
const source = process.env.FLEET_STANDALONE_DIST;
if (!source || !path.isAbsolute(source)) throw Error("Set FLEET_STANDALONE_DIST to the dedicated Fleet build directory.");
const fleet = await readFile(path.join(source, "fleet.html"));
const callback = await readFile(path.join(source, "platform-login.html"));
for (const html of [fleet, callback]) {
  if (!html.toString().includes("/fleet/assets/")) throw Error("Fleet must be built with its dedicated /fleet/ asset base.");
}
// Preserve the running image, root entry documents and every existing app.
execFileSync(process.execPath, ["scripts/prepare-poc-header-release.mjs"], { stdio: "inherit" });
const overlay = path.resolve("generated/poc-header-release/context/overlay/dist");
async function stage(relative, bytes) {
  const target = path.join(overlay, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  if (/\.(?:html|js|css)$/.test(relative)) {
    await Promise.all([writeFile(`${target}.gz`, gzipSync(bytes)), writeFile(`${target}.br`, brotliCompressSync(bytes))]);
  }
}
await stage("fleet/index.html", fleet);
await stage("poc/app/platform-login.html", callback);
const assets = await readdir(path.join(source, "assets"));
for (const name of assets) {
  if (!/^[\w.-]+\.(?:js|css|woff2)$/.test(name)) throw Error(`Unexpected Fleet build output: ${name}`);
  const bytes = await readFile(path.join(source, "assets", name));
  if (/\.(?:js|css)$/.test(name) && bytes.includes(Buffer.from("fictional-local-only"))) throw Error("Review fixture in production output.");
  await stage(`fleet/assets/${name}`, bytes);
}
console.log(`Staged standalone Fleet, ${assets.length} assets and its existing sign-in callback. No server change.`);
