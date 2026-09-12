import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { gzip, gunzip, gunzipSync, gzipSync } from "node:zlib";
import { getBoundedIntegerEnv, isProductionLikeRuntime } from "../server/runtime-environment.mjs";

// Run the actual private reader with fake Azure objects: no network or PHI.
const source = readFileSync(new URL("../server/platform-snapshot.mjs", import.meta.url), "utf8")
  .replace(/^import[\s\S]*?;\n/gm, "").replace(/^export /gm, "")
  .replace("import.meta.url", '"file:///fixture/server/platform-snapshot.mjs"');
const sandbox = vm.createContext({ path, fileURLToPath: () => "/fixture/server/platform-snapshot.mjs",
  promisify, gzipCallback: gzip, gunzipCallback: gunzip, gunzipSync, getBoundedIntegerEnv,
  isProductionLikeRuntime, Buffer, process: { env: {} }, console });
vm.runInContext(`${source}\nglobalThis.reader = readAzureSnapshot;`, sandbox);
const fixture = JSON.parse(readFileSync(new URL("./fixtures/pipeline-clinical-snapshot.sanitized.json", import.meta.url)));
const blobs = new Map();
let propertiesReads = 0;
let downloads = 0;
let storageFailure = false;
function publish(name, value, etag) {
  const raw = Buffer.from(JSON.stringify(value));
  const bytes = name.endsWith(".gz") ? gzipSync(raw) : raw;
  blobs.set(name, { bytes, etag, lastModified: new Date("2026-09-12T12:00:00Z") });
}
const blob = (name) => ({
  url: `https://fixture.blob.core.windows.net/test/${name}`,
  async getProperties() {
    propertiesReads += 1;
    if (storageFailure) throw new Error("Storage unavailable");
    const value = blobs.get(name);
    if (!value) throw Object.assign(new Error("Absent"), { statusCode: 404 });
    return { etag: value.etag, lastModified: value.lastModified, contentLength: value.bytes.length };
  },
  async download() {
    downloads += 1;
    const value = blobs.get(name);
    return { etag: value.etag, contentLength: value.bytes.length, readableStreamBody: Readable.from([value.bytes]) };
  }
});
sandbox.fakeService = { getContainerClient: () => ({ getBlobClient: blob }) };
vm.runInContext('getAzureSnapshotConfig = () => ({ root: "root", container: "test" }); createBlobServiceClient = () => fakeService;', sandbox);
publish("root/latest.json", fixture, '"publication-1"');
const first = await sandbox.reader();
assert.equal(downloads, 1);
assert.strictEqual(await sandbox.reader(), first, "unchanged publication must reuse validated identity");
assert.equal(downloads, 1, "unchanged TTL refresh must not download/parse again");
assert.equal(propertiesReads, 4, "both objects must still be checked on each refresh");
publish("root/latest.json", { ...fixture, snapshot: { ...fixture.snapshot, version: "publication-2" } }, '"publication-2"');
assert.notStrictEqual(await sandbox.reader(), first, "new ETag invalidates the parsed publication");
assert.equal(downloads, 2);
publish("root/latest.json.gz", fixture, '"compressed-1"');
const compressed = await sandbox.reader();
assert.strictEqual(await sandbox.reader(), compressed);
assert.equal(downloads, 3, "compressed publication also revalidates without redownloading");
blobs.delete("root/latest.json.gz");
assert.notStrictEqual(await sandbox.reader(), compressed, "removing compressed publication selects the source");
blobs.delete("root/latest.json");
assert.equal(await sandbox.reader(), null, "deleted publications must not return cached records");
storageFailure = true;
await assert.rejects(sandbox.reader(), /Storage unavailable/, "revalidation must fail closed on storage errors");
storageFailure = false;
publish("root/latest.json", { invalid: true }, '"invalid-publication"');
await assert.rejects(sandbox.reader(), /snapshot|health|communities/, "changed invalid publications must still be validated");
console.log(JSON.stringify({ ok: true, checks: 10, scope: "actual Azure reader ETag revalidation, replacement, deletion and fail-closed validation" }));
