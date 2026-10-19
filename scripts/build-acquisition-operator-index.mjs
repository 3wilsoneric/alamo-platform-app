#!/usr/bin/env node
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAcquisitionOperatorIndex } from "../shared/acquisition-operator-resolution.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datastoreRoot = path.resolve(
  process.env.ACQUISITION_INTELLIGENCE_ROOT || path.join(root, "generated/acquisition-intelligence")
);
const allowedRoot = path.join(root, "generated/acquisition-intelligence");
if (datastoreRoot !== allowedRoot && !datastoreRoot.startsWith(`${allowedRoot}${path.sep}`)) {
  throw new Error("ACQUISITION_INTELLIGENCE_ROOT must stay under generated/acquisition-intelligence.");
}

const directoryPath = path.join(datastoreRoot, "derived/facility-directory.json");
const outputPath = path.join(datastoreRoot, "derived/operator-proposals.json");
const manifestPath = path.join(datastoreRoot, "derived/manifest.json");
const configPath = path.resolve(
  process.env.ACQUISITION_SOURCE_CONFIG || path.join(root, "config/acquisition-intelligence/nsumhss-2024.json")
);
const details = await stat(directoryPath);
if (details.size > 60_000_000) throw new Error("Facility directory exceeds the operator-index input size limit.");
const directory = JSON.parse(await readFile(directoryPath, "utf8"));
if (!Array.isArray(directory?.facilities)) throw new Error("Facility directory is invalid.");
const config = JSON.parse(await readFile(configPath, "utf8"));
const excludedStateCodes = config?.acquisitionScope?.excludedStateCodes;
if (!Array.isArray(excludedStateCodes) || !excludedStateCodes.every((value) => typeof value === "string")) {
  throw new Error("acquisitionScope.excludedStateCodes must be a list of state codes.");
}
const parentAssertionPath = path.resolve(root, String(config?.acquisitionScope?.parentAssertionPath ?? ""));
const licenseAssertionPath = path.resolve(root, String(config?.acquisitionScope?.licenseAssertionPath ?? ""));
const capacityAssertionPath = path.resolve(root, String(config?.acquisitionScope?.capacityAssertionPath ?? ""));
const allowedAssertionRoot = path.join(root, "config/acquisition-intelligence");
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

const generatedAt = new Date().toISOString();
const index = buildAcquisitionOperatorIndex(directory.facilities, {
  generatedAt,
  excludedStateCodes,
  parentAssertions: parentAssertionRegistry.assertions,
  licenseSources: licenseAssertionRegistry.sources,
  licenseAssertions: licenseAssertionRegistry.assertions,
  capacitySources: capacityAssertionRegistry.sources,
  capacityAssertions: capacityAssertionRegistry.assertions
});
await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.operatorResolution = {
  status: index.status,
  generatedAt,
  counts: index.counts,
  path: path.relative(datastoreRoot, outputPath),
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
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ path: path.relative(root, outputPath), ...index.counts }, null, 2));
