#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { screenAcquisitionDirectoryFacility } from "../shared/acquisition-discovery.mjs";
import { buildAcquisitionOperatorIndex } from "../shared/acquisition-operator-resolution.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.resolve(
  process.env.ACQUISITION_SOURCE_CONFIG || path.join(root, "config/acquisition-intelligence/nsumhss-2024.json")
);
const outputRoot = path.resolve(
  process.env.ACQUISITION_INTELLIGENCE_ROOT || path.join(root, "generated/acquisition-intelligence")
);
const rawRoot = path.join(outputRoot, "raw");
const directoryRawRoot = path.join(rawRoot, "findtreatment");
const derivedRoot = path.join(outputRoot, "derived");
const config = JSON.parse(await readFile(configPath, "utf8"));
const allowedOutputRoot = path.join(root, "generated/acquisition-intelligence");
const parentAssertionPath = path.resolve(root, String(config?.acquisitionScope?.parentAssertionPath ?? ""));
const licenseAssertionPath = path.resolve(root, String(config?.acquisitionScope?.licenseAssertionPath ?? ""));
const capacityAssertionPath = path.resolve(root, String(config?.acquisitionScope?.capacityAssertionPath ?? ""));
const allowedAssertionRoot = path.join(root, "config/acquisition-intelligence");

if (!outputRoot.startsWith(`${allowedOutputRoot}${path.sep}`) && outputRoot !== allowedOutputRoot) {
  throw new Error("ACQUISITION_INTELLIGENCE_ROOT must stay under generated/acquisition-intelligence.");
}
if (!parentAssertionPath.startsWith(`${allowedAssertionRoot}${path.sep}`)) {
  throw new Error("acquisitionScope.parentAssertionPath must stay under config/acquisition-intelligence.");
}
if (!licenseAssertionPath.startsWith(`${allowedAssertionRoot}${path.sep}`)) {
  throw new Error("acquisitionScope.licenseAssertionPath must stay under config/acquisition-intelligence.");
}
if (!capacityAssertionPath.startsWith(`${allowedAssertionRoot}${path.sep}`)) {
  throw new Error("acquisitionScope.capacityAssertionPath must stay under config/acquisition-intelligence.");
}
const parentAssertionDetails = await stat(parentAssertionPath);
if (parentAssertionDetails.size > 1_000_000) throw new Error("Parent assertion registry exceeds its size limit.");
const parentAssertionRegistry = JSON.parse(await readFile(parentAssertionPath, "utf8"));
if (!Array.isArray(parentAssertionRegistry?.assertions)) throw new Error("Parent assertion registry is invalid.");
const licenseAssertionDetails = await stat(licenseAssertionPath);
if (licenseAssertionDetails.size > 2_000_000) throw new Error("License assertion registry exceeds its size limit.");
const licenseAssertionRegistry = JSON.parse(await readFile(licenseAssertionPath, "utf8"));
if (!Array.isArray(licenseAssertionRegistry?.sources) || !Array.isArray(licenseAssertionRegistry?.assertions)) {
  throw new Error("License assertion registry is invalid.");
}
const capacityAssertionDetails = await stat(capacityAssertionPath);
if (capacityAssertionDetails.size > 2_000_000) throw new Error("Capacity assertion registry exceeds its size limit.");
const capacityAssertionRegistry = JSON.parse(await readFile(capacityAssertionPath, "utf8"));
if (!Array.isArray(capacityAssertionRegistry?.sources) || !Array.isArray(capacityAssertionRegistry?.assertions)) {
  throw new Error("Capacity assertion registry is invalid.");
}

await mkdir(rawRoot, { recursive: true });
await mkdir(directoryRawRoot, { recursive: true });
await mkdir(derivedRoot, { recursive: true });

const pufZipPath = path.join(rawRoot, `nsumhss-${config.datasetYear}-csv.zip`);
const csvMember = path.basename(String(config.publicUseCsvMember || ""));
if (!csvMember || csvMember !== config.publicUseCsvMember || !csvMember.toLowerCase().endsWith(".csv")) {
  throw new Error("publicUseCsvMember must be a plain CSV filename.");
}
const pufCsvPath = path.join(rawRoot, csvMember);
const codebookPath = path.join(rawRoot, `nsumhss-${config.datasetYear}-codebook.pdf`);
const directoryGuidePath = path.join(rawRoot, "findtreatment-developer-guide.pdf");
const directoryPath = path.join(derivedRoot, "facility-directory.json");
const operatorIndexPath = path.join(derivedRoot, "operator-proposals.json");
const manifestPath = path.join(derivedRoot, "manifest.json");

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function download(url, destination, maximumBytes) {
  if (await exists(destination)) return;
  const response = await fetch(url, { headers: { "User-Agent": "AlamoPlatform/1.0 acquisition-research" } });
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > maximumBytes) throw new Error(`Download exceeds the ${maximumBytes}-byte limit: ${url}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > maximumBytes) throw new Error(`Download exceeds the ${maximumBytes}-byte limit: ${url}`);
  await writeFile(destination, body);
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current);
  return cells;
}

function isYes(value) {
  return String(value ?? "").trim() === "1";
}

async function summarizePublicUseFile() {
  const stream = createReadStream(pufCsvPath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  let header = null;
  let indexes = null;
  let rawRecords = 0;
  let usStateRecords = 0;
  const counts = {
    privateForProfit: 0,
    adult: 0,
    residential: 0,
    preliminaryPrivateAdultResidential: 0,
    preliminaryCoreCandidates: 0
  };
  const byState = {};
  const requiredFields = Object.values(config.publicUseFields);

  for await (const line of lines) {
    if (!header) {
      header = parseCsvLine(line.replace(/^\uFEFF/, ""));
      indexes = Object.fromEntries(requiredFields.map((field) => [field, header.indexOf(field)]));
      const missing = requiredFields.filter((field) => indexes[field] < 0);
      if (missing.length) throw new Error(`N-SUMHSS schema is missing configured fields: ${missing.join(", ")}`);
      continue;
    }
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (cells.length !== header.length) {
      throw new Error(`N-SUMHSS record ${rawRecords + 2} has ${cells.length} fields; expected ${header.length}.`);
    }
    rawRecords += 1;
    const value = (field) => cells[indexes[field]];
    const stateCode = value(config.publicUseFields.state);
    if (!Object.hasOwn(config.stateDirectoryIds, stateCode)) continue;
    usStateRecords += 1;
    const state = byState[stateCode] ||= { rawRecords: 0, preliminaryCandidates: 0, coreCandidates: 0 };
    state.rawRecords += 1;
    const privateForProfit = value(config.publicUseFields.ownership) === "1";
    const adult = isYes(value(config.publicUseFields.adult)) || isYes(value(config.publicUseFields.youngAdult));
    const residential = [
      config.publicUseFields.mentalHealthResidentialSetting,
      config.publicUseFields.substanceUseResidentialSetting,
      config.publicUseFields.substanceUseResidentialUtilization,
      config.publicUseFields.mentalHealthResidentialUtilization
    ].some((field) => isYes(value(field))) || ["5", "6"].includes(value(config.publicUseFields.mentalHealthFacilityType));
    const mentalHealth = isYes(value(config.publicUseFields.mentalHealthUniverse)) || ["2", "3"].includes(value(config.publicUseFields.focus));
    const clinicalFit = mentalHealth || [
      config.publicUseFields.seriousMentalIllnessProgram,
      config.publicUseFields.coOccurringMentalHealth,
      config.publicUseFields.coOccurringSubstanceUse,
      config.publicUseFields.integratedDualDiagnosis
    ].some((field) => isYes(value(field)));
    if (privateForProfit) counts.privateForProfit += 1;
    if (adult) counts.adult += 1;
    if (residential) counts.residential += 1;
    if (privateForProfit && adult && residential) {
      counts.preliminaryPrivateAdultResidential += 1;
      state.preliminaryCandidates += 1;
      if (clinicalFit) {
        counts.preliminaryCoreCandidates += 1;
        state.coreCandidates += 1;
      }
    }
  }

  return { rawRecords, usStateRecords, counts, byState };
}

function normalizedKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function serviceMap(services) {
  const mapped = {};
  for (const service of Array.isArray(services) ? services : []) {
    const code = String(service?.f2 ?? "").trim();
    const value = String(service?.f3 ?? "").trim();
    if (!code || !value) continue;
    const values = mapped[code] ||= [];
    if (!values.includes(value)) values.push(value);
  }
  return mapped;
}

const DERIVED_SERVICE_CODES = new Set(["AGE", "AS", "EMS", "FOP", "FT", "LCA", "SET", "SG", "TAP", "TC"]);

function mergeDirectoryRow(target, row) {
  target.typeFacilities = [...new Set([...target.typeFacilities, row.typeFacility].filter(Boolean))].sort();
  const incomingServices = serviceMap(row.services);
  for (const [code, values] of Object.entries(incomingServices)) {
    if (!DERIVED_SERVICE_CODES.has(code)) continue;
    target.services[code] = [...new Set([...(target.services[code] || []), ...values])].sort();
  }
  target.sourceRowCount += 1;
}

async function fetchDirectoryState(stateCode, stateId) {
  const rows = [];
  let page = 1;
  let totalPages = 1;
  do {
    const requestUrl = new URL(config.facilityDirectoryApiUrl);
    requestUrl.search = new URLSearchParams({
      sAddr: "0,0",
      limitType: "0",
      limitValue: String(stateId),
      pageSize: "2000",
      page: String(page),
      sort: "2"
    });
    const response = await fetch(requestUrl, { headers: { "User-Agent": "AlamoPlatform/1.0 acquisition-research" } });
    if (!response.ok) throw new Error(`FindTreatment request failed (${response.status}) for ${stateCode}, page ${page}.`);
    const payload = await response.json();
    if (!Array.isArray(payload?.rows)) throw new Error(`FindTreatment returned invalid rows for ${stateCode}, page ${page}.`);
    rows.push(...payload.rows);
    totalPages = Number(payload.totalPages || 1);
    page += 1;
  } while (page <= totalPages);
  console.log(`FindTreatment ${stateCode}: ${rows.length.toLocaleString()} rows`);
  return rows;
}

async function buildDirectory() {
  const merged = new Map();
  for (const [stateCode, stateId] of Object.entries(config.stateDirectoryIds)) {
    const rows = await fetchDirectoryState(stateCode, stateId);
    await writeFile(
      path.join(directoryRawRoot, `${stateCode}.json`),
      `${JSON.stringify({ stateCode, datasetYear: config.datasetYear, source: config.facilityDirectoryApiUrl, rows })}\n`
    );
    for (const row of rows) {
      if (String(row?.state ?? "").trim() !== stateCode) continue;
      const key = [row.name1, row.name2, row.street1, row.street2, row.city, stateCode, row.zip]
        .map(normalizedKey)
        .join("|");
      if (!key.replaceAll("|", "")) continue;
      let target = merged.get(key);
      if (!target) {
        target = {
          id: `ft-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`,
          name: String(row.name1 ?? "").trim(),
          secondaryName: String(row.name2 ?? "").trim(),
          address: {
            street1: String(row.street1 ?? "").trim(),
            street2: String(row.street2 ?? "").trim(),
            city: String(row.city ?? "").trim(),
            stateCode,
            zip: String(row.zip ?? "").trim()
          },
          phone: String(row.phone ?? "").trim(),
          website: String(row.website ?? "").trim(),
          latitude: Number(row.latitude) || null,
          longitude: Number(row.longitude) || null,
          typeFacilities: [],
          services: {},
          sourceRowCount: 0
        };
        merged.set(key, target);
      }
      mergeDirectoryRow(target, {
        ...row,
        typeFacility: String(row.typeFacility ?? row.type_facility ?? "").trim()
      });
    }
  }

  const facilities = [...merged.values()].map((facility) => ({
    ...facility,
    ...screenAcquisitionDirectoryFacility(facility),
    verificationStatus: "directory_discovery_only",
    licenseMatchStatus: "pending",
    ownershipResolutionStatus: "unresolved",
    source: {
      kind: "findtreatment_directory",
      url: config.facilityDirectoryApiUrl,
      datasetYear: config.datasetYear
    }
  })).sort((left, right) => left.address.stateCode.localeCompare(right.address.stateCode) || left.name.localeCompare(right.name));

  const counts = { total: facilities.length, include: 0, review: 0, exclude: 0 };
  const byState = {};
  for (const facility of facilities) {
    counts[facility.disposition] += 1;
    const state = byState[facility.address.stateCode] ||= { total: 0, include: 0, review: 0, exclude: 0 };
    state.total += 1;
    state[facility.disposition] += 1;
  }
  return { facilities, counts, byState };
}

await download(config.publicUseFileUrl, pufZipPath, 80_000_000);
await download(config.codebookUrl, codebookPath, 20_000_000);
await download(config.facilityDirectoryApiGuideUrl, directoryGuidePath, 5_000_000);
if (!(await exists(pufCsvPath))) {
  await execFileAsync("unzip", ["-q", "-o", pufZipPath, "-d", rawRoot]);
}

console.log("Summarizing the N-SUMHSS public-use file...");
const publicUse = await summarizePublicUseFile();
console.log("Building the named facility directory discovery layer...");
const directory = await buildDirectory();
const generatedAt = new Date().toISOString();
const excludedStateCodes = config?.acquisitionScope?.excludedStateCodes;
if (!Array.isArray(excludedStateCodes) || !excludedStateCodes.every((value) => typeof value === "string")) {
  throw new Error("acquisitionScope.excludedStateCodes must be a list of state codes.");
}
const operatorIndex = buildAcquisitionOperatorIndex(directory.facilities, {
  generatedAt,
  excludedStateCodes,
  parentAssertions: parentAssertionRegistry.assertions,
  licenseSources: licenseAssertionRegistry.sources,
  licenseAssertions: licenseAssertionRegistry.assertions,
  capacitySources: capacityAssertionRegistry.sources,
  capacityAssertions: capacityAssertionRegistry.assertions
});
const manifest = {
  version: 1,
  generatedAt,
  datasetYear: config.datasetYear,
  status: "discovery_only",
  identityJoinStatus: "not_publicly_available",
  caveat: "The N-SUMHSS PUF and FindTreatment directory do not expose a shared public record identifier; their facility-level rows are not joined.",
  sources: [
    { kind: "nsumhss_public_use_file", url: config.publicUseFileUrl, path: path.relative(outputRoot, pufZipPath), sha256: await sha256(pufZipPath) },
    { kind: "nsumhss_codebook", url: config.codebookUrl, path: path.relative(outputRoot, codebookPath), sha256: await sha256(codebookPath) },
    {
      kind: "findtreatment_api_guide",
      url: config.facilityDirectoryApiGuideUrl,
      path: path.relative(outputRoot, directoryGuidePath),
      sha256: await sha256(directoryGuidePath)
    },
    {
      kind: "findtreatment_directory",
      url: config.facilityDirectoryApiUrl,
      states: Object.keys(config.stateDirectoryIds).length,
      rawPath: path.relative(outputRoot, directoryRawRoot)
    }
  ],
  publicUse,
  directory: { counts: directory.counts, byState: directory.byState, path: path.relative(outputRoot, directoryPath) },
  operatorResolution: {
    status: operatorIndex.status,
    counts: operatorIndex.counts,
    path: path.relative(outputRoot, operatorIndexPath),
    assertionRegistry: {
      version: parentAssertionRegistry.version,
      updatedAt: parentAssertionRegistry.updatedAt,
      path: path.relative(root, parentAssertionPath)
    },
    licenseAssertionRegistry: {
      version: licenseAssertionRegistry.version,
      updatedAt: licenseAssertionRegistry.updatedAt,
      path: path.relative(root, licenseAssertionPath)
    },
    capacityAssertionRegistry: {
      version: capacityAssertionRegistry.version,
      updatedAt: capacityAssertionRegistry.updatedAt,
      path: path.relative(root, capacityAssertionPath)
    }
  },
  limitations: [
    "Directory ownership and service fields are self-reported discovery evidence, not state license proof.",
    "The public-use file suppresses facility names and addresses and cannot be directly joined to directory records with public fields.",
    "Include and review dispositions are research queues, not verified acquisition targets.",
    "Licensed-bed evidence is partial and does not represent a complete parent-company portfolio until every program is reconciled to a current state license.",
    "Transaction values remain unverified until separate evidence is attached."
  ]
};

await writeFile(directoryPath, `${JSON.stringify({ version: 1, generatedAt, facilities: directory.facilities })}\n`);
await writeFile(operatorIndexPath, `${JSON.stringify(operatorIndex, null, 2)}\n`);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Acquisition discovery datastore refreshed at ${path.relative(root, outputRoot)}.`);
console.log(JSON.stringify({ publicUse: publicUse.counts, directory: directory.counts, operators: operatorIndex.counts }, null, 2));
