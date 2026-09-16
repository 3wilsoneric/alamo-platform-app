#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const manifest = JSON.parse(read("public/manifest.json"));
const index = read("index.html");
const runtime = read("src/shared/desktop/DesktopRuntime.tsx");
const main = read("src/main.tsx");
const worker = read("public/sw.js");
const offline = read("public/offline.html");

assert.equal(manifest.id, "/");
assert.equal(manifest.start_url, "/home");
assert.equal(manifest.scope, "/");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.orientation, "any");
assert.ok(manifest.categories.includes("business"));

for (const [size, file] of [
  [32, "public/pwa/alamo-favicon-32-v1.png"],
  [180, "public/pwa/alamo-apple-touch-icon-180-v1.png"],
  [192, "public/pwa/alamo-app-icon-192-v1.png"],
  [512, "public/pwa/alamo-app-icon-512-v1.png"],
  [1024, "public/pwa/alamo-app-icon-1024-v1.png"],
  [512, "public/pwa/alamo-app-icon-maskable-512-v1.png"],
  [1024, "public/pwa/alamo-app-icon-maskable-1024-v1.png"]
]) {
  const dimensions = readPngDimensions(file);
  assert.deepEqual(dimensions, { width: size, height: size }, `${file} must be ${size}x${size}`);
  assert.ok(statSync(file).size > 100, `${file} must not be empty`);
}

assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"));
assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
assert.ok(manifest.icons.some((icon) => icon.sizes === "1024x1024" && icon.purpose === "maskable"));
assert.match(index, /rel="manifest" href="\/manifest\.json\?v=ah-desktop-v1"/);
assert.match(index, /alamo-favicon-32-v1\.png/);
assert.match(index, /alamo-apple-touch-icon-180-v1\.png/);

assert.match(main, /<DesktopRuntime \/>/);
assert.match(runtime, /serviceWorker\.register/);
assert.match(runtime, /updateViaCache: "none"/);
assert.match(runtime, /ALAMO_PRUNE_DESKTOP_CACHES/);

assert.match(worker, /CACHE_PREFIX = "alamo-static-"/);
assert.match(worker, /CACHE_NAME = `\$\{CACHE_PREFIX\}v\d+`/);
assert.match(worker, /request\.mode === "navigate"/);
assert.match(worker, /fetch\(request\)\.catch/);
assert.match(worker, /url\.pathname\.startsWith\("\/assets\/"\)/);
assert.doesNotMatch(worker, /caches\.match\(/);
assert.doesNotMatch(worker, /localStorage|sessionStorage|indexedDB/i);
assert.doesNotMatch(worker, /pathname\.startsWith\("\/api/);

assert.doesNotMatch(offline, /<script/i);
assert.doesNotMatch(offline, /resident|diagnosis|medication|assessment/i);
assert.match(offline, /No platform data is stored/);
console.log("desktop readiness check passed");

function readPngDimensions(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG", `${file} must be a PNG`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}
