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
const recoveryPage = read("public/recover.html");
const recoveryClient = read("public/recover-client.js");

assert.equal(manifest.id, "/");
assert.equal(manifest.start_url, "/home");
assert.equal(manifest.scope, "/");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.orientation, "any");
assert.ok(manifest.categories.includes("business"));

for (const [size, file] of [
  [32, "public/pwa/alamo-favicon-32-v2.png"],
  [180, "public/pwa/alamo-apple-touch-icon-180-v2.png"],
  [192, "public/pwa/alamo-app-icon-192-v2.png"],
  [512, "public/pwa/alamo-app-icon-512-v2.png"],
  [1024, "public/pwa/alamo-app-icon-1024-v2.png"],
  [512, "public/pwa/alamo-app-icon-maskable-512-v2.png"],
  [1024, "public/pwa/alamo-app-icon-maskable-1024-v2.png"]
]) {
  const dimensions = readPngDimensions(file);
  assert.deepEqual(dimensions, { width: size, height: size }, `${file} must be ${size}x${size}`);
  assert.ok(statSync(file).size > 100, `${file} must not be empty`);
}

assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"));
assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
assert.ok(manifest.icons.some((icon) => icon.sizes === "1024x1024" && icon.purpose === "maskable"));
assert.match(index, /rel="manifest" href="\/manifest\.json\?v=ah-brand-v2"/);
assert.match(index, /alamo-favicon-32-v2\.png/);
assert.match(index, /alamo-apple-touch-icon-180-v2\.png/);
assert.doesNotMatch(index, /favicon\.svg|favicon\.ico|alamo-.*-v1\.png/);
assert.equal(manifest.name, "Alamo Health Management");
assert.ok(statSync("public/brand/alamo-head-tree-mark.png").size > 100);

assert.match(main, /<DesktopRuntime \/>/);
assert.doesNotMatch(runtime, /serviceWorker\.register/);
assert.match(runtime, /serviceWorker\.getRegistrations\(\)/);
assert.match(runtime, /registration\.unregister\(\)/);
assert.match(runtime, /name\.startsWith\(LEGACY_CACHE_PREFIX\)/);
assert.match(runtime, /caches\.delete\(name\)/);
assert.match(runtime, /alamo-release-check/);
assert.match(runtime, /cache: "no-store"/);
assert.match(runtime, /visibilitychange/);
assert.match(runtime, /window\.addEventListener\("focus"/);
assert.match(runtime, /window\.addEventListener\("online"/);
assert.match(runtime, /RELEASE_CHECK_INTERVAL_MS/);
assert.match(runtime, /window\.location\.reload\(\)/);

assert.match(worker, /CACHE_PREFIX = "alamo-static-"/);
assert.match(worker, /self\.skipWaiting\(\)/);
assert.match(worker, /self\.registration\.unregister\(\)/);
assert.match(worker, /deleteLegacyAlamoCaches/);
assert.match(worker, /name\.startsWith\(CACHE_PREFIX\)/);
assert.match(worker, /self\.clients\.matchAll/);
assert.match(worker, /client\.navigate\(destination\.toString\(\)\)/);
assert.doesNotMatch(worker, /addEventListener\("fetch"/);
assert.doesNotMatch(worker, /caches\.open\(/);
assert.doesNotMatch(worker, /caches\.match\(/);
assert.doesNotMatch(worker, /localStorage|sessionStorage|indexedDB/i);
assert.doesNotMatch(worker, /pathname\.startsWith\("\/api/);

assert.doesNotMatch(offline, /<script/i);
assert.doesNotMatch(offline, /resident|diagnosis|medication|assessment/i);
assert.match(offline, /No platform data is stored/);
assert.match(offline, /href="\/home"[^>]*>Try again</);

assert.match(recoveryPage, /<script src="\/recover-client\.js" defer><\/script>/);
assert.match(recoveryPage, /noindex, nofollow/);
assert.doesNotMatch(recoveryPage, /resident|diagnosis|medication|assessment/i);
assert.match(recoveryClient, /serviceWorker\.getRegistrations\(\)/);
assert.match(recoveryClient, /registration\.unregister\(\)/);
assert.match(recoveryClient, /name\.startsWith\("alamo-static-"\)/);
assert.match(recoveryClient, /caches\.delete\(name\)/);
assert.match(recoveryClient, /window\.location\.replace/);
assert.match(recoveryClient, /"\/executive\/dashboard"/);
console.log("desktop readiness check passed");

function readPngDimensions(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG", `${file} must be a PNG`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}
