import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readAcquisitionAzureJson,
  shouldUseAzureAcquisitionStorage
} from "./acquisition-azure-storage.mjs";
import { createHttpError } from "./http-errors.mjs";
import { getBoundedIntegerEnv } from "./runtime-environment.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storeRoot = path.resolve(
  process.env.ACQUISITION_INTELLIGENCE_ROOT || path.join(repositoryRoot, "generated/acquisition-intelligence")
);
const manifestPath = path.join(storeRoot, "derived/manifest.json");
const directoryPath = path.join(storeRoot, "derived/facility-directory.json");
const MAX_MANIFEST_BYTES = 500_000;
const MAX_DIRECTORY_BYTES = 60_000_000;
const MAX_FACILITIES = 50_000;
const DEFAULT_AZURE_CACHE_TTL_MS = 5 * 60_000;
const VALID_DISPOSITIONS = new Set(["include", "review", "exclude", "all"]);
let cache = null;

function invalid(message) {
  return createHttpError(400, "acquisition_search_invalid", message);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is invalid.`);
  return value.trim();
}

function requiredNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function stringList(value, label) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function readAddress(value, label) {
  if (!isObject(value)) throw new Error(`${label} is invalid.`);
  return {
    street1: typeof value.street1 === "string" ? value.street1 : "",
    street2: typeof value.street2 === "string" ? value.street2 : "",
    city: typeof value.city === "string" ? value.city : "",
    stateCode: requiredString(value.stateCode, `${label}.stateCode`),
    zip: typeof value.zip === "string" ? value.zip : ""
  };
}

function readServices(value, label) {
  if (!isObject(value)) throw new Error(`${label} is invalid.`);
  return Object.fromEntries(Object.entries(value).map(([key, entries]) => [key, stringList(entries, `${label}.${key}`)]));
}

function normalizeFacility(value, index) {
  if (!isObject(value)) throw new Error(`facilities[${index}] is invalid.`);
  const disposition = requiredString(value.disposition, `facilities[${index}].disposition`);
  if (!VALID_DISPOSITIONS.has(disposition) || disposition === "all") {
    throw new Error(`facilities[${index}].disposition is invalid.`);
  }
  const facility = {
    id: requiredString(value.id, `facilities[${index}].id`),
    name: requiredString(value.name, `facilities[${index}].name`),
    secondaryName: typeof value.secondaryName === "string" ? value.secondaryName : "",
    address: readAddress(value.address, `facilities[${index}].address`),
    phone: typeof value.phone === "string" ? value.phone : "",
    website: typeof value.website === "string" ? value.website : "",
    typeFacilities: stringList(value.typeFacilities, `facilities[${index}].typeFacilities`),
    services: readServices(value.services, `facilities[${index}].services`),
    tags: stringList(value.tags, `facilities[${index}].tags`),
    disposition,
    reasons: stringList(value.reasons, `facilities[${index}].reasons`),
    verificationStatus: requiredString(value.verificationStatus, `facilities[${index}].verificationStatus`),
    licenseMatchStatus: requiredString(value.licenseMatchStatus, `facilities[${index}].licenseMatchStatus`),
    ownershipResolutionStatus: requiredString(
      value.ownershipResolutionStatus,
      `facilities[${index}].ownershipResolutionStatus`
    )
  };
  const searchable = [
    facility.name,
    facility.secondaryName,
    facility.address.street1,
    facility.address.street2,
    facility.address.city,
    facility.address.stateCode,
    facility.address.zip,
    facility.tags.join(" "),
    Object.values(facility.services).flat().join(" ")
  ].join(" ").toLowerCase();
  return { ...facility, searchable };
}

function normalizeManifest(value) {
  if (!isObject(value) || !isObject(value.publicUse) || !isObject(value.directory)) {
    throw new Error("Acquisition discovery manifest is invalid.");
  }
  if (!isObject(value.publicUse.counts) || !isObject(value.directory.counts) || !isObject(value.directory.byState)) {
    throw new Error("Acquisition discovery manifest counts are invalid.");
  }
  return {
    version: requiredNumber(value.version, "manifest.version"),
    generatedAt: requiredString(value.generatedAt, "manifest.generatedAt"),
    datasetYear: requiredNumber(value.datasetYear, "manifest.datasetYear"),
    status: requiredString(value.status, "manifest.status"),
    identityJoinStatus: requiredString(value.identityJoinStatus, "manifest.identityJoinStatus"),
    caveat: requiredString(value.caveat, "manifest.caveat"),
    limitations: stringList(value.limitations, "manifest.limitations"),
    publicUse: {
      rawRecords: requiredNumber(value.publicUse.rawRecords, "manifest.publicUse.rawRecords"),
      usStateRecords: requiredNumber(value.publicUse.usStateRecords, "manifest.publicUse.usStateRecords"),
      counts: value.publicUse.counts,
      byState: value.publicUse.byState
    },
    directory: {
      counts: value.directory.counts,
      byState: value.directory.byState
    }
  };
}

async function readBoundedJson(filePath, maximumBytes) {
  const details = await stat(filePath);
  if (details.size > maximumBytes) throw new Error(`${path.basename(filePath)} exceeds its size limit.`);
  return { details, value: JSON.parse(await readFile(filePath, "utf8")) };
}

function normalizeDirectory(value) {
  if (!isObject(value) || !Array.isArray(value.facilities)) {
    throw new Error("Acquisition facility directory is invalid.");
  }
  if (value.facilities.length > MAX_FACILITIES) {
    throw new Error(`Acquisition facility directory exceeds ${MAX_FACILITIES} records.`);
  }
  return value.facilities.map(normalizeFacility);
}

async function loadAzureStore() {
  const now = Date.now();
  if (cache?.source === "azure" && cache.expiresAt > now) return cache;
  const [manifestFile, directoryFile] = await Promise.all([
    readAcquisitionAzureJson("derived/manifest.json", MAX_MANIFEST_BYTES),
    readAcquisitionAzureJson("derived/facility-directory.json.gz", MAX_DIRECTORY_BYTES, { compressed: true })
  ]);
  if (!manifestFile || !directoryFile) {
    throw new Error("Azure acquisition discovery storage is missing its manifest or facility directory.");
  }
  const signature = `${manifestFile.signature}:${directoryFile.signature}`;
  const expiresAt = now + getBoundedIntegerEnv(
    "ACQUISITION_STORAGE_CACHE_TTL_MS",
    DEFAULT_AZURE_CACHE_TTL_MS,
    10_000,
    60 * 60_000
  );
  if (cache?.source === "azure" && cache.signature === signature) {
    cache.expiresAt = expiresAt;
    return cache;
  }
  cache = {
    source: "azure",
    signature,
    expiresAt,
    manifest: normalizeManifest(manifestFile.value),
    facilities: normalizeDirectory(directoryFile.value)
  };
  return cache;
}

async function loadLocalStore() {
  try {
    const manifestFile = await readBoundedJson(manifestPath, MAX_MANIFEST_BYTES);
    const directoryFile = await readBoundedJson(directoryPath, MAX_DIRECTORY_BYTES);
    const signature = [
      manifestFile.details.mtimeMs,
      manifestFile.details.size,
      directoryFile.details.mtimeMs,
      directoryFile.details.size
    ].join(":");
    if (cache?.source === "local" && cache.signature === signature) return cache;
    cache = {
      source: "local",
      signature,
      manifest: normalizeManifest(manifestFile.value),
      facilities: normalizeDirectory(directoryFile.value)
    };
    return cache;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function loadStore() {
  return shouldUseAzureAcquisitionStorage() ? loadAzureStore() : loadLocalStore();
}

function summaryFromStore(store) {
  if (!store) {
    return {
      available: false,
      status: "not_refreshed",
      persistence: shouldUseAzureAcquisitionStorage() ? "azure_blob" : "local_file_store",
      datasetYear: null,
      generatedAt: null,
      publicUse: null,
      directory: null,
      states: []
    };
  }
  return {
    available: true,
    status: store.manifest.status,
    persistence: store.source === "azure" ? "azure_blob" : "local_file_store",
    datasetYear: store.manifest.datasetYear,
    generatedAt: store.manifest.generatedAt,
    identityJoinStatus: store.manifest.identityJoinStatus,
    caveat: store.manifest.caveat,
    limitations: store.manifest.limitations,
    publicUse: {
      rawRecords: store.manifest.publicUse.rawRecords,
      usStateRecords: store.manifest.publicUse.usStateRecords,
      counts: store.manifest.publicUse.counts
    },
    directory: { counts: store.manifest.directory.counts },
    states: Object.keys(store.manifest.directory.byState).sort()
  };
}

export async function getNationalDiscoverySummary() {
  return summaryFromStore(await loadStore());
}

function compactFacility(facility) {
  return {
    id: facility.id,
    name: facility.name,
    secondaryName: facility.secondaryName,
    address: facility.address,
    phone: facility.phone,
    website: facility.website,
    typeFacilities: facility.typeFacilities,
    tags: facility.tags,
    disposition: facility.disposition,
    reasons: facility.reasons,
    verificationStatus: facility.verificationStatus,
    licenseMatchStatus: facility.licenseMatchStatus,
    ownershipResolutionStatus: facility.ownershipResolutionStatus,
    evidence: {
      operation: facility.services.FOP || [],
      setting: facility.services.SET || [],
      ages: facility.services.AGE || [],
      typeOfCare: facility.services.TC || [],
      specialPrograms: facility.services.SG || [],
      facilityType: facility.services.FT || [],
      license: facility.services.LCA || []
    }
  };
}

export async function listNationalFacilityCandidates() {
  const store = await loadStore();
  if (!store) return [];
  return store.facilities
    .filter((facility) => facility.disposition === "include" || facility.disposition === "review")
    .map(compactFacility);
}

export async function searchNationalFacilityDiscovery(requestUrl) {
  const store = await loadStore();
  const summary = summaryFromStore(store);
  if (!store) return { ...summary, matched: 0, results: [] };
  const query = String(requestUrl.searchParams.get("q") || "").trim().toLowerCase();
  const stateCode = String(requestUrl.searchParams.get("state") || "").trim().toUpperCase();
  const disposition = String(requestUrl.searchParams.get("disposition") || "include").trim().toLowerCase();
  const requestedLimit = Number(requestUrl.searchParams.get("limit") || 50);
  if (query.length > 120) throw invalid("q must be 120 characters or fewer.");
  if (stateCode && !/^[A-Z]{2}$/.test(stateCode)) throw invalid("state must be a two-letter code.");
  if (!VALID_DISPOSITIONS.has(disposition)) throw invalid("disposition is not supported.");
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    throw invalid("limit must be a whole number from 1 through 100.");
  }

  const matches = store.facilities.filter((facility) =>
    (!query || facility.searchable.includes(query)) &&
    (!stateCode || facility.address.stateCode === stateCode) &&
    (disposition === "all" || facility.disposition === disposition)
  );
  const order = { include: 0, review: 1, exclude: 2 };
  matches.sort((left, right) =>
    order[left.disposition] - order[right.disposition] ||
    left.address.stateCode.localeCompare(right.address.stateCode) ||
    left.name.localeCompare(right.name)
  );
  return {
    ...summary,
    query: { q: query, state: stateCode, disposition, limit: requestedLimit },
    matched: matches.length,
    results: matches.slice(0, requestedLimit).map(compactFacility)
  };
}
