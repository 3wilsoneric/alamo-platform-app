import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getReportingDateKey } from "../shared/reporting-date.mjs";
import { getBoundedIntegerEnv } from "./runtime-environment.mjs";
import { validateToolResultSchema } from "./tools/result-schema.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultCertifiedAnswerCachePath = path.resolve(__dirname, "../generated/certified-answer-cache/latest.json");
let dataSignatureMemo = null;
const CERTIFIED_CACHE_VERSION = "certified-answer-cache-v2";
const MAX_CERTIFIED_CACHE_BYTES = 25 * 1024 * 1024;
const MAX_CERTIFIED_CACHE_ENTRIES = 5_000;
const DEFAULT_CERTIFIED_CACHE_RECHECK_MS = 30_000;
const DATA_SIGNATURE_PATTERN = /^certified-data-v1:[a-f0-9]{64}$/;

/**
 * @typedef {object} CertifiedAnswerCache
 * @property {string} version
 * @property {string} generatedAt
 * @property {string} dataSignature
 * @property {any[]} entries
 */

/**
 * @typedef {object} CertifiedAnswerCacheState
 * @property {string | null} path
 * @property {CertifiedAnswerCache | null} value
 * @property {string | null} fingerprint
 * @property {number} checkedAt
 * @property {Promise<CertifiedAnswerCache | null> | null} promise
 * @property {string | null} warningKey
 */

/** @type {CertifiedAnswerCacheState} */
let certifiedAnswerCacheState = {
  path: null,
  value: null,
  fingerprint: null,
  checkedAt: 0,
  promise: null,
  warningKey: null
};

/**
 * @typedef {object} SignatureDataset
 * @property {string} name
 * @property {(communities: any, reportsSummary: any) => any[] | undefined} selectRows
 * @property {(row: any) => unknown[]} selectFields
 */

/** @type {ReadonlyArray<SignatureDataset>} */
const SIGNATURE_DATASETS = Object.freeze([
  { name: "facilities", selectRows: (communities) => communities?.facilities, selectFields: (row) => [row.facility_id, row.community_name] },
  { name: "residents", selectRows: (communities) => communities?.residents, selectFields: (row) => [row.res_number, row.facility_id, row.status, row.admit_date, row.los_days] },
  { name: "census", selectRows: (communities) => communities?.census, selectFields: (row) => [row.facility_id, row.month_bucket, row.census] },
  { name: "incidents", selectRows: (communities) => communities?.incidents, selectFields: (row) => [row.facility_id, row.month_bucket, row.category, row.incident_count] },
  { name: "incident-details", selectRows: (communities, reportsSummary) => communities?.incidentDetails ?? reportsSummary?.toolContext?.incidentDetailHistory, selectFields: (row) => [row.incident_id, row.facility_id, row.month_bucket, row.incident_date, row.category, row.resident_id, row.client_name] },
  { name: "medication-compliance", selectRows: (_communities, reportsSummary) => reportsSummary?.medicationCompliance, selectFields: (row) => [row.facility_id, row.month_bucket, row.scheduled_count, row.given_count, row.not_given_count] },
  { name: "medication-refusals", selectRows: (_communities, reportsSummary) => reportsSummary?.refusalByMedication, selectFields: (row) => [row.facility_id, row.month_bucket, row.medication_name, row.refusal_count] },
  { name: "documentation-gaps", selectRows: (_communities, reportsSummary) => reportsSummary?.documentationGaps, selectFields: (row) => [row.resident_id, row.facility_id, row.last_note_date, row.days_since_last_note] }
]);

export function buildCertifiedAnswerDataSignature(communities = {}, reportsSummary = {}) {
  const reportingDate = getReportingDateKey();
  if (
    dataSignatureMemo?.communities === communities &&
    dataSignatureMemo?.reportsSummary === reportsSummary &&
    dataSignatureMemo?.reportingDate === reportingDate
  ) {
    return dataSignatureMemo.value;
  }

  const hash = createHash("sha256");
  // Rolling 30/90/180-day answers change at the California reporting-day
  // boundary even when the underlying snapshot rows have not changed.
  hash.update(`reporting-date:${reportingDate}\n`);
  for (const { name, selectRows, selectFields } of SIGNATURE_DATASETS) {
    const selectedRows = selectRows(communities, reportsSummary);
    const rows = Array.isArray(selectedRows) ? selectedRows : [];
    const values = rows.map((row) => JSON.stringify(selectFields(row ?? {}))).sort();
    hash.update(`${name}:${values.length}\n`);
    for (const value of values) hash.update(`${value}\n`);
  }

  const value = `certified-data-v1:${hash.digest("hex")}`;
  dataSignatureMemo = { communities, reportsSummary, reportingDate, value };
  return value;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value, maximumLength) {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maximumLength;
}

export function normalizeCertifiedAnswerCache(payload) {
  if (
    !isObject(payload) ||
    payload.version !== CERTIFIED_CACHE_VERSION ||
    !isBoundedString(payload.generatedAt, 100) ||
    !Number.isFinite(Date.parse(payload.generatedAt)) ||
    !DATA_SIGNATURE_PATTERN.test(String(payload.dataSignature ?? "")) ||
    !Array.isArray(payload.entries) ||
    payload.entries.length > MAX_CERTIFIED_CACHE_ENTRIES
  ) {
    return null;
  }

  const entries = [];
  const cacheKeys = new Set();
  for (const entry of payload.entries) {
    if (
      !isObject(entry) ||
      !isBoundedString(entry.cacheKey, 2_000) ||
      cacheKeys.has(entry.cacheKey) ||
      !isObject(entry.result) ||
      entry.result.handled !== true ||
      !validateToolResultSchema(entry.result).valid
    ) {
      continue;
    }
    cacheKeys.add(entry.cacheKey);
    entries.push(entry);
  }

  return {
    version: CERTIFIED_CACHE_VERSION,
    generatedAt: payload.generatedAt,
    dataSignature: payload.dataSignature,
    entries
  };
}

function getCertifiedAnswerCachePath() {
  const configuredPath = process.env.CERTIFIED_ANSWER_CACHE_PATH?.trim();
  return configuredPath ? path.resolve(configuredPath) : defaultCertifiedAnswerCachePath;
}

function getCertifiedCacheRecheckMs() {
  return getBoundedIntegerEnv(
    "CERTIFIED_ANSWER_CACHE_RECHECK_MS",
    DEFAULT_CERTIFIED_CACHE_RECHECK_MS,
    10,
    5 * 60_000
  );
}

function warnCacheReadOnce(cachePath, error) {
  if (error?.code === "ENOENT") return;
  const message = error instanceof Error ? error.message : String(error);
  const warningKey = `${cachePath}:${error?.code ?? "unknown"}:${message}`;
  if (certifiedAnswerCacheState.warningKey === warningKey) return;
  certifiedAnswerCacheState.warningKey = warningKey;
  console.warn(`Certified answer cache at ${cachePath} could not be refreshed; continuing with the last valid cache.`, error);
}

function resetCacheStateForPath(cachePath) {
  if (certifiedAnswerCacheState.path === cachePath) return;
  certifiedAnswerCacheState = {
    path: cachePath,
    value: null,
    fingerprint: null,
    checkedAt: 0,
    promise: null,
    warningKey: null
  };
}

async function readCertifiedAnswerCache() {
  if (process.env.CERTIFIED_ANSWER_CACHE_ENABLED === "false") return null;
  const cachePath = getCertifiedAnswerCachePath();
  resetCacheStateForPath(cachePath);

  const now = Date.now();
  if (
    certifiedAnswerCacheState.promise ||
    now - certifiedAnswerCacheState.checkedAt < getCertifiedCacheRecheckMs()
  ) {
    return certifiedAnswerCacheState.promise ?? certifiedAnswerCacheState.value;
  }

  certifiedAnswerCacheState.promise = (async () => {
    try {
      const file = await stat(cachePath);
      if (file.size > MAX_CERTIFIED_CACHE_BYTES) {
        throw new Error(`Cache file exceeds the ${MAX_CERTIFIED_CACHE_BYTES}-byte limit.`);
      }

      const fingerprint = `${file.dev}:${file.ino}:${file.size}:${file.mtimeMs}:${file.ctimeMs}`;
      if (fingerprint === certifiedAnswerCacheState.fingerprint) {
        return certifiedAnswerCacheState.value;
      }

      const normalized = normalizeCertifiedAnswerCache(JSON.parse(await readFile(cachePath, "utf8")));
      if (!normalized) throw new Error("Cache payload failed schema validation.");

      certifiedAnswerCacheState.value = normalized;
      certifiedAnswerCacheState.fingerprint = fingerprint;
      certifiedAnswerCacheState.warningKey = null;
      return normalized;
    } catch (error) {
      warnCacheReadOnce(cachePath, error);
      return certifiedAnswerCacheState.value;
    } finally {
      certifiedAnswerCacheState.checkedAt = Date.now();
      certifiedAnswerCacheState.promise = null;
    }
  })();

  return certifiedAnswerCacheState.promise;
}

/**
 * @param {string} cacheKey
 * @param {{ dataSignature?: string }} [options]
 */
export async function getCertifiedAnswerCacheEntry(cacheKey, options = {}) {
  const { dataSignature } = options;
  if (!cacheKey) return null;
  const cache = await readCertifiedAnswerCache();
  if (!dataSignature || cache?.dataSignature !== dataSignature) return null;
  return cache?.entries?.find((entry) => entry.cacheKey === cacheKey && entry.result?.handled) ?? null;
}
