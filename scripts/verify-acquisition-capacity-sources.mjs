#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.resolve(
  process.env.ACQUISITION_SOURCE_CONFIG || path.join(root, "config/acquisition-intelligence/nsumhss-2024.json")
);
const config = JSON.parse(await readFile(configPath, "utf8"));
const registryPath = path.resolve(root, String(config?.acquisitionScope?.capacityAssertionPath ?? ""));
const allowedRoot = path.join(root, "config/acquisition-intelligence");
if (!registryPath.startsWith(`${allowedRoot}${path.sep}`)) {
  throw new Error("acquisitionScope.capacityAssertionPath must stay under config/acquisition-intelligence.");
}

const registry = JSON.parse(await readFile(registryPath, "utf8"));
if (!Array.isArray(registry?.sources) || !Array.isArray(registry?.assertions)) {
  throw new Error("Capacity assertion registry is invalid.");
}

const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const MAX_SOURCE_BYTES = 5_000_000;
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_FETCH_ATTEMPTS = 4;
const results = [];

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const fetchSource = async (source) => {
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    const response = await fetch(source.extractionUrl, {
      headers: { "User-Agent": "AlamoPlatform/1.0 acquisition-capacity-source-check" }
    });
    if (response.ok) return response;
    if (!RETRYABLE_HTTP_STATUSES.has(response.status) || attempt === MAX_FETCH_ATTEMPTS) {
      throw new Error(`Capacity source check failed (${response.status}) for ${source.id}.`);
    }
    await wait(750 * 2 ** (attempt - 1));
  }
  throw new Error(`Capacity source check exhausted retries for ${source.id}.`);
};

for (const source of registry.sources) {
  const extractionUrl = String(source.extractionUrl ?? "").trim();
  if (!extractionUrl) {
    results.push({ sourceId: source.id, status: "not_remotely_checkable", assertions: 0 });
    continue;
  }
  const response = await fetchSource({ ...source, extractionUrl });
  const declaredBytes = Number(response.headers.get("content-length") || 0);
  if (declaredBytes > MAX_SOURCE_BYTES) throw new Error(`Capacity source ${source.id} exceeds the size limit.`);
  const sourceText = await response.text();
  if (Buffer.byteLength(sourceText, "utf8") > MAX_SOURCE_BYTES) {
    throw new Error(`Capacity source ${source.id} exceeds the size limit.`);
  }
  const normalizedSource = normalize(sourceText);
  const assertions = registry.assertions.filter((assertion) => assertion.source?.sourceId === source.id);
  for (const assertion of assertions) {
    const fingerprint = normalize(assertion.source?.rowFingerprint);
    if (!fingerprint) throw new Error(`Capacity assertion ${assertion.id} requires a source row fingerprint.`);
    const first = normalizedSource.indexOf(fingerprint);
    const second = first < 0 ? -1 : normalizedSource.indexOf(fingerprint, first + fingerprint.length);
    if (first < 0) throw new Error(`Capacity assertion ${assertion.id} no longer matches source ${source.id}.`);
    if (second >= 0) throw new Error(`Capacity assertion ${assertion.id} matches multiple source rows.`);
  }
  results.push({
    sourceId: source.id,
    status: "current_rows_matched",
    assertions: assertions.length,
    authority: source.authorityName
  });
}

console.log(JSON.stringify({ registryVersion: registry.version, checkedAt: new Date().toISOString(), results }, null, 2));
