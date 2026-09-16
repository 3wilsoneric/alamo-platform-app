import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAcquisitionAzureJson, shouldUseAzureAcquisitionStorage } from "./acquisition-azure-storage.mjs";
import { createHttpError } from "./http-errors.mjs";
import {
  acquisitionOperatorSelectionStore,
  summarizeAcquisitionOperatorCohort
} from "./acquisition-operator-selection-store.mjs";
import {
  acquisitionWebsiteDomain,
  isValidatedAcquisitionTarget,
  normalizeAcquisitionOrganizationName
} from "../shared/acquisition-operator-resolution.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storeRoot = path.resolve(
  process.env.ACQUISITION_INTELLIGENCE_ROOT || path.join(repositoryRoot, "generated/acquisition-intelligence")
);
const localPath = path.join(storeRoot, "derived/operator-proposals.json");
const azurePath = "derived/operator-proposals.json.gz";
const MAX_INDEX_BYTES = 40_000_000;
const MAX_ORGANIZATIONS = 20_000;
const VALID_STAGES = new Set(["all", "target_candidates", "screen_500", "research_100_queue", "validated_targets"]);
const VALID_FITS = new Set(["all", "core_signal", "adjacent_signal", "context_or_unresolved"]);
const VALID_ELIGIBILITY = new Set(["all", "eligible_private", "pending_private_verification", "excluded_public_company", "excluded_out_of_scope"]);
const VALID_CLASSIFICATIONS = new Set([
  "all",
  "unclassified",
  "needs_fit_validation",
  "core_adult_mental_health",
  "mixed_core_and_adjacent",
  "adjacent_dual_diagnosis",
  "sud_primary_adjacent",
  "excluded_public_company",
  "excluded_out_of_scope"
]);
const VALID_CONFIDENCE = new Set(["all", "not_high", "unverified", "low", "medium", "high"]);
const VALID_CAPACITY_EVIDENCE = new Set(["all", "verified_any", "verified_core", "reported", "unverified"]);
const VALID_VALUATION_EVIDENCE = new Set(["all", "available", "unavailable"]);
const VALID_MATURITY_TIERS = new Set([
  "all",
  "mature_scale_signal",
  "platform_scale_signal",
  "regional_scale_signal",
  "established_local_signal",
  "single_site_or_unresolved"
]);
const VALID_SELECTION_BUCKETS = new Set([
  "all",
  "mature_target_signal",
  "established_target_signal",
  "smaller_target_signal",
  "mature_needs_fit_review",
  "market_context"
]);
const VALID_PRIVATE_LIKELIHOOD = new Set([
  "all",
  "verified_private",
  "supported_private",
  "directory_private_signal",
  "unverified",
  "excluded"
]);
const VALID_SCREENING_CAPACITY_BANDS = new Set([
  "all",
  "estimable",
  "not_estimable",
  "under_25",
  "25_74",
  "75_149",
  "150_299",
  "300_plus"
]);
const VALID_FACILITY_SCALE_BANDS = new Set([
  "all",
  "one_location",
  "two_three_locations",
  "four_nine_locations",
  "ten_twenty_four_locations",
  "twenty_five_plus_locations"
]);
const VALID_OWNER_DECISIONS = new Set(["all", "selected", "hold", "excluded", "undecided"]);
const VALID_GAPS = new Set([
  "all",
  "contradiction_review",
  "operating_parent_relationship",
  "legal_identity",
  "private_ownership",
  "target_fit",
  "licensed_capacity",
  "valuation_inputs"
]);
const VALID_SORTS = new Set(["rank", "maturity", "score", "screening_capacity", "beds", "value", "company"]);
let cache = null;

function invalid(message) {
  return createHttpError(400, "acquisition_operator_search_invalid", message);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringList(value, label) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function numberValue(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} is invalid.`);
  return value;
}

function falseValue(value, label) {
  if (value !== false) throw new Error(`${label} is invalid.`);
  return false;
}

function stringValue(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  return value;
}

function stringRecord(value, label) {
  if (!isObject(value)) throw new Error(`${label} is invalid.`);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, stringValue(entry, `${label}.${key}`)]));
}

function numberRecord(value, label) {
  if (!isObject(value)) throw new Error(`${label} is invalid.`);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, numberValue(entry, `${label}.${key}`)]));
}

function normalizeParentIdentity(value, label) {
  if (value === null) return null;
  if (!isObject(value) || !Array.isArray(value.sources) || !Array.isArray(value.contradictions)) {
    throw new Error(`${label} is invalid.`);
  }
  return {
    id: stringValue(value.id, `${label}.id`),
    operatingParentName: stringValue(value.operatingParentName, `${label}.operatingParentName`),
    canonicalLegalName: stringValue(value.canonicalLegalName, `${label}.canonicalLegalName`, { nullable: true }),
    primaryDomain: stringValue(value.primaryDomain, `${label}.primaryDomain`, { nullable: true }),
    sponsorName: stringValue(value.sponsorName, `${label}.sponsorName`, { nullable: true }),
    ownershipType: stringValue(value.ownershipType, `${label}.ownershipType`),
    acquisitionEligibility: stringValue(value.acquisitionEligibility, `${label}.acquisitionEligibility`),
    targetClassification: stringValue(value.targetClassification, `${label}.targetClassification`),
    valuationModel: value.valuationModel == null
      ? null
      : stringRecord(value.valuationModel, `${label}.valuationModel`),
    confidence: stringRecord(value.confidence, `${label}.confidence`),
    sources: value.sources.map((source, sourceIndex) => {
      if (!isObject(source)) throw new Error(`${label}.sources[${sourceIndex}] is invalid.`);
      return {
        id: stringValue(source.id, `${label}.sources[${sourceIndex}].id`),
        sourceType: stringValue(source.sourceType, `${label}.sources[${sourceIndex}].sourceType`),
        title: stringValue(source.title, `${label}.sources[${sourceIndex}].title`),
        url: stringValue(source.url, `${label}.sources[${sourceIndex}].url`),
        asOf: stringValue(source.asOf, `${label}.sources[${sourceIndex}].asOf`),
        supports: stringList(source.supports, `${label}.sources[${sourceIndex}].supports`)
      };
    }),
    contradictions: value.contradictions.map((contradiction, contradictionIndex) => {
      if (!isObject(contradiction)) throw new Error(`${label}.contradictions[${contradictionIndex}] is invalid.`);
      return {
        id: stringValue(contradiction.id, `${label}.contradictions[${contradictionIndex}].id`),
        status: stringValue(contradiction.status, `${label}.contradictions[${contradictionIndex}].status`),
        description: stringValue(contradiction.description, `${label}.contradictions[${contradictionIndex}].description`)
      };
    }),
    notes: stringValue(value.notes, `${label}.notes`)
  };
}

function normalizeValuationEvidence(value, label) {
  if (value == null) return null;
  if (!isObject(value) || !isObject(value.capacity) || !isObject(value.valuation) ||
      !isObject(value.valuation.segment) || !isObject(value.valuation.assumptions) ||
      !isObject(value.valuation.outputs) || !isObject(value.valuation.formulas) ||
      !Array.isArray(value.valuation.limitations) || !Array.isArray(value.limitations)) {
    throw new Error(`${label} is invalid.`);
  }
  const assumptions = value.valuation.assumptions;
  const outputs = Object.fromEntries(["low", "base", "high"].map((caseName) => {
    const output = value.valuation.outputs[caseName];
    if (!isObject(output)) throw new Error(`${label}.valuation.outputs.${caseName} is invalid.`);
    return [caseName, numberRecord(output, `${label}.valuation.outputs.${caseName}`)];
  }));
  return {
    status: stringValue(value.status, `${label}.status`),
    scope: stringValue(value.scope, `${label}.scope`),
    isWholeCompanyEstimate: falseValue(value.isWholeCompanyEstimate, `${label}.isWholeCompanyEstimate`),
    capacityBasis: stringValue(value.capacityBasis, `${label}.capacityBasis`),
    capacityConfidence: stringValue(value.capacityConfidence, `${label}.capacityConfidence`),
    estimateConfidence: stringValue(value.estimateConfidence, `${label}.estimateConfidence`),
    capacity: numberRecord(value.capacity, `${label}.capacity`),
    valuation: {
      version: stringValue(value.valuation.version, `${label}.valuation.version`),
      modelVersion: stringValue(value.valuation.modelVersion, `${label}.valuation.modelVersion`),
      status: stringValue(value.valuation.status, `${label}.valuation.status`),
      operatorId: stringValue(value.valuation.operatorId, `${label}.valuation.operatorId`, { nullable: true }),
      segment: stringRecord(value.valuation.segment, `${label}.valuation.segment`),
      assumptions: {
        occupancy: numberRecord(assumptions.occupancy, `${label}.valuation.assumptions.occupancy`),
        netRevenuePerOccupiedBedDay: numberRecord(assumptions.netRevenuePerOccupiedBedDay, `${label}.valuation.assumptions.netRevenuePerOccupiedBedDay`),
        ebitdaMargin: numberRecord(assumptions.ebitdaMargin, `${label}.valuation.assumptions.ebitdaMargin`),
        ebitdaMultiple: numberRecord(assumptions.ebitdaMultiple, `${label}.valuation.assumptions.ebitdaMultiple`)
      },
      outputs,
      formulas: stringRecord(value.valuation.formulas, `${label}.valuation.formulas`),
      limitations: stringList(value.valuation.limitations, `${label}.valuation.limitations`)
    },
    limitations: stringList(value.limitations, `${label}.limitations`)
  };
}

function normalizeLicenseEvidence(value, label) {
  if (!isObject(value) || !isObject(value.confidence) || !isObject(value.bedTotals) ||
      !isObject(value.counts) || !Array.isArray(value.licenses) || !Array.isArray(value.reportedCapacity)) {
    throw new Error(`${label} is invalid.`);
  }
  const nullableNumber = (entry, entryLabel) => numberValue(entry, entryLabel, { nullable: true });
  return {
    status: stringValue(value.status, `${label}.status`),
    portfolioCoverage: stringValue(value.portfolioCoverage, `${label}.portfolioCoverage`),
    confidence: stringRecord(value.confidence, `${label}.confidence`),
    bedTotals: {
      verifiedCurrentLicensed: nullableNumber(value.bedTotals.verifiedCurrentLicensed, `${label}.bedTotals.verifiedCurrentLicensed`),
      verifiedCoreTarget: nullableNumber(value.bedTotals.verifiedCoreTarget, `${label}.bedTotals.verifiedCoreTarget`),
      verifiedAdjacentHighAcuitySud: nullableNumber(value.bedTotals.verifiedAdjacentHighAcuitySud, `${label}.bedTotals.verifiedAdjacentHighAcuitySud`),
      reportedByOperator: nullableNumber(value.bedTotals.reportedByOperator, `${label}.bedTotals.reportedByOperator`),
      estimatedLow: nullableNumber(value.bedTotals.estimatedLow, `${label}.bedTotals.estimatedLow`),
      estimatedHigh: nullableNumber(value.bedTotals.estimatedHigh, `${label}.bedTotals.estimatedHigh`)
    },
    counts: Object.fromEntries(Object.entries(value.counts).map(([key, entry]) => [
      key,
      numberValue(entry, `${label}.counts.${key}`)
    ])),
    stateCodes: stringList(value.stateCodes, `${label}.stateCodes`),
    lastVerifiedAt: stringValue(value.lastVerifiedAt, `${label}.lastVerifiedAt`, { nullable: true }),
    evidenceIds: stringList(value.evidenceIds, `${label}.evidenceIds`),
    licenses: value.licenses.map((license, licenseIndex) => {
      const licenseLabel = `${label}.licenses[${licenseIndex}]`;
      if (!isObject(license) || !isObject(license.address) || !isObject(license.license) ||
          !isObject(license.capacity) || !isObject(license.populationSignals) || !isObject(license.source)) {
        throw new Error(`${licenseLabel} is invalid.`);
      }
      return {
        id: stringValue(license.id, `${licenseLabel}.id`),
        parentAssertionId: stringValue(license.parentAssertionId, `${licenseLabel}.parentAssertionId`),
        brandName: stringValue(license.brandName, `${licenseLabel}.brandName`, { nullable: true }),
        programName: stringValue(license.programName, `${licenseLabel}.programName`),
        legalOperatorName: stringValue(license.legalOperatorName, `${licenseLabel}.legalOperatorName`),
        address: stringRecord(license.address, `${licenseLabel}.address`),
        license: Object.fromEntries(Object.entries(license.license).map(([key, entry]) => [
          key,
          stringValue(entry, `${licenseLabel}.license.${key}`, { nullable: true })
        ])),
        capacity: {
          licensedBeds: numberValue(license.capacity.licensedBeds, `${licenseLabel}.capacity.licensedBeds`, { nullable: true }),
          scopeClassification: stringValue(license.capacity.scopeClassification, `${licenseLabel}.capacity.scopeClassification`),
          confidence: stringValue(license.capacity.confidence, `${licenseLabel}.capacity.confidence`)
        },
        populationSignals: Object.fromEntries(Object.entries(license.populationSignals).map(([key, entry]) => {
          if (typeof entry !== "boolean") throw new Error(`${licenseLabel}.populationSignals.${key} is invalid.`);
          return [key, entry];
        })),
        source: {
          id: stringValue(license.source.id, `${licenseLabel}.source.id`),
          title: stringValue(license.source.title, `${licenseLabel}.source.title`),
          sourceType: stringValue(license.source.sourceType, `${licenseLabel}.source.sourceType`),
          url: stringValue(license.source.url, `${licenseLabel}.source.url`),
          landingPageUrl: stringValue(license.source.landingPageUrl, `${licenseLabel}.source.landingPageUrl`),
          workbookSheet: stringValue(license.source.workbookSheet, `${licenseLabel}.source.workbookSheet`, { nullable: true }),
          asOf: stringValue(license.source.asOf, `${licenseLabel}.source.asOf`)
        }
      };
    }),
    reportedCapacity: value.reportedCapacity.map((observation, observationIndex) => {
      const observationLabel = `${label}.reportedCapacity[${observationIndex}]`;
      if (!isObject(observation) || !isObject(observation.address) ||
          !isObject(observation.capacity) || !isObject(observation.source)) {
        throw new Error(`${observationLabel} is invalid.`);
      }
      return {
        id: stringValue(observation.id, `${observationLabel}.id`),
        parentAssertionId: stringValue(observation.parentAssertionId, `${observationLabel}.parentAssertionId`),
        brandName: stringValue(observation.brandName, `${observationLabel}.brandName`, { nullable: true }),
        programName: stringValue(observation.programName, `${observationLabel}.programName`),
        address: stringRecord(observation.address, `${observationLabel}.address`),
        capacity: {
          reportedBeds: numberValue(observation.capacity.reportedBeds, `${observationLabel}.capacity.reportedBeds`),
          evidenceBasis: stringValue(observation.capacity.evidenceBasis, `${observationLabel}.capacity.evidenceBasis`),
          scopeClassification: stringValue(observation.capacity.scopeClassification, `${observationLabel}.capacity.scopeClassification`),
          confidence: stringValue(observation.capacity.confidence, `${observationLabel}.capacity.confidence`)
        },
        source: {
          id: stringValue(observation.source.id, `${observationLabel}.source.id`),
          title: stringValue(observation.source.title, `${observationLabel}.source.title`),
          sourceType: stringValue(observation.source.sourceType, `${observationLabel}.source.sourceType`),
          url: stringValue(observation.source.url, `${observationLabel}.source.url`),
          asOf: stringValue(observation.source.asOf, `${observationLabel}.source.asOf`)
        }
      };
    })
  };
}

function normalizeScreeningCapacity(value, label) {
  if (!isObject(value) || !isObject(value.candidateSites) || !isObject(value.peerRange) ||
      !isObject(value.range) || !Array.isArray(value.limitations)) {
    throw new Error(`${label} is invalid.`);
  }
  const nullableNumber = (entry, entryLabel) => numberValue(entry, entryLabel, { nullable: true });
  return {
    status: stringValue(value.status, `${label}.status`),
    bucket: stringValue(value.bucket, `${label}.bucket`),
    confidence: stringValue(value.confidence, `${label}.confidence`),
    isWholeCompanyEstimate: falseValue(value.isWholeCompanyEstimate, `${label}.isWholeCompanyEstimate`),
    rangeScope: stringValue(value.rangeScope, `${label}.rangeScope`),
    candidateSites: {
      total: numberValue(value.candidateSites.total, `${label}.candidateSites.total`),
      core: numberValue(value.candidateSites.core, `${label}.candidateSites.core`),
      adjacent: numberValue(value.candidateSites.adjacent, `${label}.candidateSites.adjacent`),
      unresolved: numberValue(value.candidateSites.unresolved, `${label}.candidateSites.unresolved`)
    },
    peerRange: {
      low: nullableNumber(value.peerRange.low, `${label}.peerRange.low`),
      base: nullableNumber(value.peerRange.base, `${label}.peerRange.base`),
      high: nullableNumber(value.peerRange.high, `${label}.peerRange.high`)
    },
    range: {
      low: nullableNumber(value.range.low, `${label}.range.low`),
      base: nullableNumber(value.range.base, `${label}.range.base`),
      high: nullableNumber(value.range.high, `${label}.range.high`)
    },
    evidencedFloorBeds: nullableNumber(value.evidencedFloorBeds, `${label}.evidencedFloorBeds`),
    basis: stringValue(value.basis, `${label}.basis`),
    limitations: stringList(value.limitations, `${label}.limitations`)
  };
}

function normalizeOrganization(value, index) {
  if (!isObject(value) || !isObject(value.resolution) || !isObject(value.scope) ||
      !isObject(value.scope.scoreComponents) || !isObject(value.facilityCounts) || !isObject(value.research) ||
      !isObject(value.screeningProfile) || !isObject(value.screeningCapacity)) {
    throw new Error(`organizations[${index}] is invalid.`);
  }
  const rootDomain = stringValue(value.rootDomain, `organizations[${index}].rootDomain`, { nullable: true });
  const proposedName = stringValue(value.proposedName, `organizations[${index}].proposedName`);
  const identityKeys = Array.isArray(value.identityKeys)
    ? stringList(value.identityKeys, `organizations[${index}].identityKeys`)
    : [
        ...(acquisitionWebsiteDomain(rootDomain) ? [`domain:${acquisitionWebsiteDomain(rootDomain)}`] : []),
        ...(normalizeAcquisitionOrganizationName(proposedName) ? [`name:${normalizeAcquisitionOrganizationName(proposedName)}`] : [])
      ];
  const organization = {
    id: stringValue(value.id, `organizations[${index}].id`),
    proposedName,
    canonicalNameStatus: stringValue(value.canonicalNameStatus, `organizations[${index}].canonicalNameStatus`),
    rootDomain,
    discoveryBasis: stringValue(value.discoveryBasis, `organizations[${index}].discoveryBasis`),
    aliases: stringList(value.aliases, `organizations[${index}].aliases`),
    identityKeys,
    acquisitionEligibility: stringValue(value.acquisitionEligibility, `organizations[${index}].acquisitionEligibility`),
    screeningProfile: {
      maturityTier: stringValue(value.screeningProfile.maturityTier, `organizations[${index}].screeningProfile.maturityTier`),
      maturityScore: numberValue(value.screeningProfile.maturityScore, `organizations[${index}].screeningProfile.maturityScore`),
      privateLikelihood: stringValue(value.screeningProfile.privateLikelihood, `organizations[${index}].screeningProfile.privateLikelihood`),
      selectionBucket: stringValue(value.screeningProfile.selectionBucket, `organizations[${index}].screeningProfile.selectionBucket`),
      facilityScale: numberValue(value.screeningProfile.facilityScale, `organizations[${index}].screeningProfile.facilityScale`),
      facilityScaleBand: stringValue(value.screeningProfile.facilityScaleBand, `organizations[${index}].screeningProfile.facilityScaleBand`),
      stateBreadth: numberValue(value.screeningProfile.stateBreadth, `organizations[${index}].screeningProfile.stateBreadth`),
      basis: stringValue(value.screeningProfile.basis, `organizations[${index}].screeningProfile.basis`)
    },
    parentIdentity: normalizeParentIdentity(value.parentIdentity, `organizations[${index}].parentIdentity`),
    licenseEvidence: normalizeLicenseEvidence(value.licenseEvidence, `organizations[${index}].licenseEvidence`),
    screeningCapacity: normalizeScreeningCapacity(value.screeningCapacity, `organizations[${index}].screeningCapacity`),
    valuationEvidence: normalizeValuationEvidence(value.valuationEvidence, `organizations[${index}].valuationEvidence`),
    research: {
      gaps: stringList(value.research.gaps, `organizations[${index}].research.gaps`),
      nextAction: stringValue(value.research.nextAction, `organizations[${index}].research.nextAction`, { nullable: true })
    },
    resolution: {
      status: stringValue(value.resolution.status, `organizations[${index}].resolution.status`),
      confidence: stringValue(value.resolution.confidence, `organizations[${index}].resolution.confidence`),
      basis: stringValue(value.resolution.basis, `organizations[${index}].resolution.basis`),
      parentCompanyId: stringValue(value.resolution.parentCompanyId, `organizations[${index}].resolution.parentCompanyId`, { nullable: true }),
      legalOperatorIds: stringList(value.resolution.legalOperatorIds, `organizations[${index}].resolution.legalOperatorIds`),
      evidenceIds: stringList(value.resolution.evidenceIds, `organizations[${index}].resolution.evidenceIds`),
      contradictionIds: stringList(value.resolution.contradictionIds, `organizations[${index}].resolution.contradictionIds`)
    },
    scope: {
      fitCategory: stringValue(value.scope.fitCategory, `organizations[${index}].scope.fitCategory`),
      inferredFitCategory: stringValue(value.scope.inferredFitCategory, `organizations[${index}].scope.inferredFitCategory`),
      targetClassification: stringValue(value.scope.targetClassification, `organizations[${index}].scope.targetClassification`),
      signals: stringList(value.scope.signals, `organizations[${index}].scope.signals`),
      cautions: stringList(value.scope.cautions, `organizations[${index}].scope.cautions`),
      screeningScore: numberValue(value.scope.screeningScore, `organizations[${index}].scope.screeningScore`),
      scoreComponents: Object.fromEntries(Object.entries(value.scope.scoreComponents).map(([key, score]) => [
        key,
        numberValue(score, `organizations[${index}].scope.scoreComponents.${key}`)
      ]))
    },
    facilityCounts: {
      total: numberValue(value.facilityCounts.total, `organizations[${index}].facilityCounts.total`),
      candidates: numberValue(value.facilityCounts.candidates, `organizations[${index}].facilityCounts.candidates`),
      coreSignal: numberValue(value.facilityCounts.coreSignal, `organizations[${index}].facilityCounts.coreSignal`),
      adjacentSignal: numberValue(value.facilityCounts.adjacentSignal, `organizations[${index}].facilityCounts.adjacentSignal`)
    },
    stateCodes: stringList(value.stateCodes, `organizations[${index}].stateCodes`),
    candidateStateCodes: stringList(value.candidateStateCodes, `organizations[${index}].candidateStateCodes`),
    facilityIds: stringList(value.facilityIds, `organizations[${index}].facilityIds`),
    candidateFacilityIds: stringList(value.candidateFacilityIds, `organizations[${index}].candidateFacilityIds`),
    targetRank: numberValue(value.targetRank, `organizations[${index}].targetRank`, { nullable: true }),
    validatedTargetRank: value.validatedTargetRank == null
      ? null
      : numberValue(value.validatedTargetRank, `organizations[${index}].validatedTargetRank`),
    funnelStage: stringValue(value.funnelStage, `organizations[${index}].funnelStage`)
  };
  return {
    ...organization,
    searchable: [
      organization.proposedName,
      organization.rootDomain,
      organization.aliases.join(" "),
      organization.stateCodes.join(" "),
      organization.scope.signals.join(" "),
      organization.parentIdentity?.canonicalLegalName,
      organization.parentIdentity?.sponsorName,
      organization.parentIdentity?.ownershipType,
      organization.parentIdentity?.valuationModel?.segmentId,
      organization.screeningProfile.maturityTier,
      organization.screeningProfile.privateLikelihood,
      organization.screeningProfile.selectionBucket,
      organization.screeningProfile.facilityScaleBand,
      organization.screeningCapacity.bucket,
      organization.valuationEvidence?.valuation?.segment?.label,
      organization.valuationEvidence?.capacityBasis,
      organization.licenseEvidence.licenses.map((license) => [
        license.programName,
        license.legalOperatorName,
        license.license.number,
        license.license.authorityName,
        license.address.city,
        license.address.stateCode
      ].join(" ")).join(" "),
      organization.licenseEvidence.reportedCapacity.map((observation) => [
        observation.programName,
        observation.brandName,
        observation.address.street1,
        observation.address.city,
        observation.address.stateCode,
        observation.source.title
      ].join(" ")).join(" "),
      organization.research.gaps.join(" ")
    ].filter(Boolean).join(" ").toLowerCase()
  };
}

function normalizeIndex(value) {
  if (!isObject(value) || !isObject(value.scope) || !isObject(value.counts) || !Array.isArray(value.organizations)) {
    throw new Error("Acquisition operator index is invalid.");
  }
  if (value.organizations.length > MAX_ORGANIZATIONS) {
    throw new Error(`Acquisition operator index exceeds ${MAX_ORGANIZATIONS} organizations.`);
  }
  return {
    version: numberValue(value.version, "operatorIndex.version"),
    generatedAt: stringValue(value.generatedAt, "operatorIndex.generatedAt"),
    status: stringValue(value.status, "operatorIndex.status"),
    scope: value.scope,
    counts: value.counts,
    confidencePolicy: value.confidencePolicy,
    verificationBoundary: stringValue(value.verificationBoundary, "operatorIndex.verificationBoundary"),
    organizations: value.organizations.map(normalizeOrganization)
  };
}

async function loadIndex() {
  if (shouldUseAzureAcquisitionStorage()) {
    const result = await readAcquisitionAzureJson(azurePath, MAX_INDEX_BYTES, { compressed: true });
    if (!result) return null;
    if (cache?.source === "azure" && cache.signature === result.signature) return cache.value;
    const value = normalizeIndex(result.value);
    cache = { source: "azure", signature: result.signature, value };
    return value;
  }
  try {
    const details = await stat(localPath);
    if (details.size > MAX_INDEX_BYTES) throw new Error("Local acquisition operator index exceeds its size limit.");
    const signature = `${details.mtimeMs}:${details.size}`;
    if (cache?.source === "local" && cache.signature === signature) return cache.value;
    const value = normalizeIndex(JSON.parse(await readFile(localPath, "utf8")));
    cache = { source: "local", signature, value };
    return value;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

function matchesStage(organization, stage) {
  if (stage === "all") return true;
  if (stage === "target_candidates") return organization.targetRank !== null;
  if (stage === "screen_500") return organization.targetRank !== null && organization.targetRank <= 500;
  if (stage === "validated_targets") return isValidatedAcquisitionTarget(organization);
  return organization.funnelStage === "research_100_queue";
}

function matchesMaturity(organization, maturity) {
  if (maturity === "all") return true;
  if (maturity === "mature_scale_signal") {
    return organization.screeningProfile.maturityTier === "platform_scale_signal" ||
      organization.screeningProfile.maturityTier === "regional_scale_signal";
  }
  return organization.screeningProfile.maturityTier === maturity;
}

function matchesConfidence(value, confidence) {
  if (confidence === "all") return true;
  if (confidence === "not_high") return value !== "high";
  return value === confidence;
}

function compareOrganizations(left, right, sort) {
  if (sort === "company") return left.proposedName.localeCompare(right.proposedName);
  if (sort === "maturity") {
    return right.screeningProfile.maturityScore - left.screeningProfile.maturityScore ||
      (left.targetRank ?? Number.MAX_SAFE_INTEGER) - (right.targetRank ?? Number.MAX_SAFE_INTEGER) ||
      left.proposedName.localeCompare(right.proposedName);
  }
  if (sort === "score") {
    return right.scope.screeningScore - left.scope.screeningScore ||
      right.screeningProfile.maturityScore - left.screeningProfile.maturityScore ||
      left.proposedName.localeCompare(right.proposedName);
  }
  if (sort === "screening_capacity") {
    return (right.screeningCapacity.range.base ?? -1) - (left.screeningCapacity.range.base ?? -1) ||
      (left.targetRank ?? Number.MAX_SAFE_INTEGER) - (right.targetRank ?? Number.MAX_SAFE_INTEGER) ||
      left.proposedName.localeCompare(right.proposedName);
  }
  if (sort === "beds") {
    return (right.valuationEvidence?.capacity.valuedBeds ?? -1) -
      (left.valuationEvidence?.capacity.valuedBeds ?? -1) ||
      left.proposedName.localeCompare(right.proposedName);
  }
  if (sort === "value") {
    return (right.valuationEvidence?.valuation.outputs.base.enterpriseValueMillions ?? -1) -
      (left.valuationEvidence?.valuation.outputs.base.enterpriseValueMillions ?? -1) ||
      left.proposedName.localeCompare(right.proposedName);
  }
  return (left.targetRank ?? Number.MAX_SAFE_INTEGER) - (right.targetRank ?? Number.MAX_SAFE_INTEGER) ||
    left.proposedName.localeCompare(right.proposedName);
}

function matchedBreakdown(organizations) {
  const evidenceBackedParents = organizations.filter((organization) =>
    organization.parentIdentity?.confidence?.relationship === "high"
  ).length;
  const maturityCounts = organizations.reduce((counts, organization) => {
    const tier = organization.screeningProfile.maturityTier;
    if (Object.hasOwn(counts, tier)) counts[tier] += 1;
    return counts;
  }, {
    platform_scale_signal: 0,
    regional_scale_signal: 0,
    established_local_signal: 0,
    single_site_or_unresolved: 0
  });
  return {
    total: organizations.length,
    platformScaleSignals: maturityCounts.platform_scale_signal,
    regionalScaleSignals: maturityCounts.regional_scale_signal,
    establishedLocalSignals: maturityCounts.established_local_signal,
    singleSiteOrUnresolved: maturityCounts.single_site_or_unresolved,
    evidenceBackedParents,
    unresolvedParentProposals: organizations.length - evidenceBackedParents,
    verifiedPrivate: organizations.filter((organization) =>
      organization.acquisitionEligibility === "eligible_private" &&
      organization.parentIdentity?.confidence?.ownership === "high"
    ).length,
    ownershipPending: organizations.filter((organization) =>
      !["excluded_public_company", "excluded_out_of_scope"].includes(organization.acquisitionEligibility) &&
      organization.parentIdentity?.confidence?.ownership !== "high"
    ).length,
    excludedOwnership: organizations.filter((organization) =>
      ["excluded_public_company", "excluded_out_of_scope"].includes(organization.acquisitionEligibility)
    ).length,
    coreFitSignals: organizations.filter((organization) => organization.scope.fitCategory === "core_signal").length,
    adjacentFitSignals: organizations.filter((organization) => organization.scope.fitCategory === "adjacent_signal").length,
    unresolvedFit: organizations.filter((organization) => organization.scope.fitCategory === "context_or_unresolved").length,
    screeningCapacityAvailable: organizations.filter((organization) =>
      organization.screeningCapacity.bucket !== "not_estimable").length,
    screeningCapacityNotEstimable: organizations.filter((organization) =>
      organization.screeningCapacity.bucket === "not_estimable").length,
    screeningCapacityUnder25: organizations.filter((organization) =>
      organization.screeningCapacity.bucket === "under_25").length,
    screeningCapacity25To74: organizations.filter((organization) =>
      organization.screeningCapacity.bucket === "25_74").length,
    screeningCapacity75To149: organizations.filter((organization) =>
      organization.screeningCapacity.bucket === "75_149").length,
    screeningCapacity150To299: organizations.filter((organization) =>
      organization.screeningCapacity.bucket === "150_299").length,
    screeningCapacity300Plus: organizations.filter((organization) =>
      organization.screeningCapacity.bucket === "300_plus").length,
    withVerifiedCoreBeds: organizations.filter((organization) =>
      organization.licenseEvidence.bedTotals.verifiedCoreTarget !== null
    ).length,
    withReportedBeds: organizations.filter((organization) =>
      organization.licenseEvidence.bedTotals.reportedByOperator !== null
    ).length,
    withKnownCapacityValuation: organizations.filter((organization) => organization.valuationEvidence !== null).length,
    withOpenContradictions: organizations.filter((organization) => organization.resolution.contradictionIds.length > 0).length
  };
}

function selectionIssue(decision, reason, extra = {}) {
  return {
    operatorId: decision.operatorId,
    status: decision.status,
    proposedName: decision.snapshot.proposedName,
    rootDomain: decision.snapshot.rootDomain,
    reason,
    ...extra
  };
}

export function resolveAcquisitionOperatorSelections(organizations, decisions) {
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization]));
  const organizationIdsByIdentityKey = new Map();
  for (const organization of organizations) {
    for (const identityKey of organization.identityKeys ?? []) {
      const matches = organizationIdsByIdentityKey.get(identityKey) ?? new Set();
      matches.add(organization.id);
      organizationIdsByIdentityKey.set(identityKey, matches);
    }
  }

  const resolvedByOperatorId = new Map();
  const pendingByOperatorId = new Map();
  const reattached = [];
  const orphaned = [];
  const conflicts = [];
  const superseded = [];

  for (const decision of decisions) {
    if (organizationsById.has(decision.operatorId)) {
      resolvedByOperatorId.set(decision.operatorId, {
        ...decision,
        resolution: { kind: "exact_operator_id", originalOperatorId: decision.operatorId, matchedIdentityKeys: [] }
      });
      continue;
    }
    const keys = decision.snapshot.identityKeys ?? [];
    const strongKeys = keys.filter((key) => /^(parent|domain|group):/.test(key));
    const weakKeys = keys.filter((key) => key.startsWith("name:"));
    const matchingCandidates = (candidateKeys) => {
      const candidateIds = new Set();
      const matchedIdentityKeys = [];
      for (const key of candidateKeys) {
        const matches = organizationIdsByIdentityKey.get(key);
        if (!matches?.size) continue;
        matchedIdentityKeys.push(key);
        for (const candidateId of matches) candidateIds.add(candidateId);
      }
      return { candidateIds, matchedIdentityKeys };
    };
    const strongMatch = matchingCandidates(strongKeys);
    const match = strongMatch.candidateIds.size ? strongMatch : matchingCandidates(weakKeys);
    if (match.candidateIds.size === 0) {
      orphaned.push(selectionIssue(decision, "no_current_exact_identity_match"));
      continue;
    }
    if (match.candidateIds.size > 1) {
      conflicts.push(selectionIssue(decision, "multiple_current_exact_identity_matches", {
        candidateOperatorIds: [...match.candidateIds].sort()
      }));
      continue;
    }
    const currentOperatorId = [...match.candidateIds][0];
    const pending = pendingByOperatorId.get(currentOperatorId) ?? [];
    pending.push({ decision, matchedIdentityKeys: match.matchedIdentityKeys });
    pendingByOperatorId.set(currentOperatorId, pending);
  }

  for (const [currentOperatorId, pending] of pendingByOperatorId) {
    if (resolvedByOperatorId.has(currentOperatorId)) {
      superseded.push(...pending.map(({ decision }) => selectionIssue(decision, "current_operator_has_newer_exact_decision", { currentOperatorId })));
      continue;
    }
    const statuses = new Set(pending.map(({ decision }) => decision.status));
    if (statuses.size > 1) {
      conflicts.push(...pending.map(({ decision }) => selectionIssue(decision, "merged_predecessors_have_conflicting_decisions", {
        candidateOperatorIds: [currentOperatorId]
      })));
      continue;
    }
    const selected = [...pending].sort((left, right) =>
      Date.parse(right.decision.updatedAt) - Date.parse(left.decision.updatedAt)
    )[0];
    if (!selected) continue;
    const resolvedDecision = {
      ...selected.decision,
      operatorId: currentOperatorId,
      resolution: {
        kind: "reattached_exact_identity",
        originalOperatorId: selected.decision.operatorId,
        matchedIdentityKeys: selected.matchedIdentityKeys
      }
    };
    resolvedByOperatorId.set(currentOperatorId, resolvedDecision);
    reattached.push(selectionIssue(selected.decision, "reattached_exact_identity", {
      currentOperatorId,
      matchedIdentityKeys: selected.matchedIdentityKeys
    }));
    superseded.push(...pending
      .filter(({ decision }) => decision.operatorId !== selected.decision.operatorId)
      .map(({ decision }) => selectionIssue(decision, "duplicate_predecessor_same_decision", { currentOperatorId })));
  }

  return {
    decisionsByOperatorId: resolvedByOperatorId,
    activeDecisions: [...resolvedByOperatorId.values()],
    integrity: { reattached, orphaned, conflicts, superseded }
  };
}

export async function searchAcquisitionOperatorUniverse(requestUrl) {
  const index = await loadIndex();
  if (!index) {
    return {
      available: false,
      persistence: shouldUseAzureAcquisitionStorage() ? "azure_blob" : "local_file_store",
      matched: 0,
      matchedBreakdown: matchedBreakdown([]),
      results: []
    };
  }
  const query = String(requestUrl.searchParams.get("q") || "").trim().toLowerCase();
  const stateCode = String(requestUrl.searchParams.get("state") || "").trim().toUpperCase();
  const stage = String(requestUrl.searchParams.get("stage") || "screen_500").trim().toLowerCase();
  const fit = String(requestUrl.searchParams.get("fit") || "all").trim().toLowerCase();
  const eligibility = String(requestUrl.searchParams.get("eligibility") || "all").trim().toLowerCase();
  const classification = String(requestUrl.searchParams.get("classification") || "all").trim().toLowerCase();
  const relationshipConfidence = String(requestUrl.searchParams.get("relationshipConfidence") || "all").trim().toLowerCase();
  const ownershipConfidence = String(requestUrl.searchParams.get("ownershipConfidence") || "all").trim().toLowerCase();
  const capacityEvidence = String(requestUrl.searchParams.get("capacityEvidence") || "all").trim().toLowerCase();
  const valuationEvidence = String(requestUrl.searchParams.get("valuationEvidence") || "all").trim().toLowerCase();
  const maturity = String(requestUrl.searchParams.get("maturity") || "all").trim().toLowerCase();
  const selectionBucket = String(requestUrl.searchParams.get("selectionBucket") || "all").trim().toLowerCase();
  const privateLikelihood = String(requestUrl.searchParams.get("privateLikelihood") || "all").trim().toLowerCase();
  const screeningCapacityBand = String(requestUrl.searchParams.get("screeningCapacityBand") || "all").trim().toLowerCase();
  const facilityScaleBand = String(requestUrl.searchParams.get("facilityScaleBand") || "all").trim().toLowerCase();
  const ownerDecision = String(requestUrl.searchParams.get("ownerDecision") || "all").trim().toLowerCase();
  const gap = String(requestUrl.searchParams.get("gap") || "all").trim().toLowerCase();
  const sort = String(requestUrl.searchParams.get("sort") || "rank").trim().toLowerCase();
  const limit = Number(requestUrl.searchParams.get("limit") || 50);
  const offset = Number(requestUrl.searchParams.get("offset") || 0);
  if (query.length > 120) throw invalid("q must be 120 characters or fewer.");
  if (stateCode && !/^[A-Z]{2}$/.test(stateCode)) throw invalid("state must be a two-letter code.");
  if (stateCode === "CA") throw invalid("California is outside the acquisition scope.");
  if (!VALID_STAGES.has(stage)) throw invalid("stage is not supported.");
  if (!VALID_FITS.has(fit)) throw invalid("fit is not supported.");
  if (!VALID_ELIGIBILITY.has(eligibility)) throw invalid("eligibility is not supported.");
  if (!VALID_CLASSIFICATIONS.has(classification)) throw invalid("classification is not supported.");
  if (!VALID_CONFIDENCE.has(relationshipConfidence)) throw invalid("relationshipConfidence is not supported.");
  if (!VALID_CONFIDENCE.has(ownershipConfidence)) throw invalid("ownershipConfidence is not supported.");
  if (!VALID_CAPACITY_EVIDENCE.has(capacityEvidence)) throw invalid("capacityEvidence is not supported.");
  if (!VALID_VALUATION_EVIDENCE.has(valuationEvidence)) throw invalid("valuationEvidence is not supported.");
  if (!VALID_MATURITY_TIERS.has(maturity)) throw invalid("maturity is not supported.");
  if (!VALID_SELECTION_BUCKETS.has(selectionBucket)) throw invalid("selectionBucket is not supported.");
  if (!VALID_PRIVATE_LIKELIHOOD.has(privateLikelihood)) throw invalid("privateLikelihood is not supported.");
  if (!VALID_SCREENING_CAPACITY_BANDS.has(screeningCapacityBand)) throw invalid("screeningCapacityBand is not supported.");
  if (!VALID_FACILITY_SCALE_BANDS.has(facilityScaleBand)) throw invalid("facilityScaleBand is not supported.");
  if (!VALID_OWNER_DECISIONS.has(ownerDecision)) throw invalid("ownerDecision is not supported.");
  if (!VALID_GAPS.has(gap)) throw invalid("gap is not supported.");
  if (!VALID_SORTS.has(sort)) throw invalid("sort is not supported.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid("limit must be a whole number from 1 through 100.");
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_ORGANIZATIONS) throw invalid("offset is not supported.");

  const selectionState = await acquisitionOperatorSelectionStore.read();
  const organizationsById = new Map(index.organizations.map((organization) => [organization.id, organization]));
  const selectionResolution = resolveAcquisitionOperatorSelections(index.organizations, selectionState.decisions);
  const { activeDecisions, decisionsByOperatorId } = selectionResolution;
  const matureDecisions = activeDecisions.filter((decision) => {
    const organization = organizationsById.get(decision.operatorId);
    return organization?.screeningProfile.maturityTier === "platform_scale_signal" ||
      organization?.screeningProfile.maturityTier === "regional_scale_signal";
  });
  const decisionsWithinRank = (maximumRank) => activeDecisions.filter((decision) => {
    const targetRank = organizationsById.get(decision.operatorId)?.targetRank;
    return targetRank !== null && targetRank !== undefined && targetRank <= maximumRank;
  });
  const research100Decisions = decisionsWithinRank(100);
  const screen500Decisions = decisionsWithinRank(500);
  const matches = index.organizations.filter((organization) =>
    matchesStage(organization, stage) &&
    (!stateCode || organization.stateCodes.includes(stateCode)) &&
    (fit === "all" || organization.scope.fitCategory === fit) &&
    (eligibility === "all" || organization.acquisitionEligibility === eligibility) &&
    (classification === "all" || (organization.parentIdentity?.targetClassification ?? "unclassified") === classification) &&
    matchesMaturity(organization, maturity) &&
    (selectionBucket === "all" || organization.screeningProfile.selectionBucket === selectionBucket) &&
    (privateLikelihood === "all" || organization.screeningProfile.privateLikelihood === privateLikelihood) &&
    (screeningCapacityBand === "all" ||
      (screeningCapacityBand === "estimable" && organization.screeningCapacity.bucket !== "not_estimable") ||
      organization.screeningCapacity.bucket === screeningCapacityBand) &&
    (facilityScaleBand === "all" || organization.screeningProfile.facilityScaleBand === facilityScaleBand) &&
    (ownerDecision === "all" ||
      (ownerDecision === "undecided" && !decisionsByOperatorId.has(organization.id)) ||
      decisionsByOperatorId.get(organization.id)?.status === ownerDecision) &&
    matchesConfidence(organization.resolution.confidence, relationshipConfidence) &&
    matchesConfidence(organization.parentIdentity?.confidence?.ownership ?? "unverified", ownershipConfidence) &&
    (capacityEvidence === "all" ||
      (capacityEvidence === "verified_any" && organization.licenseEvidence.bedTotals.verifiedCurrentLicensed !== null) ||
      (capacityEvidence === "verified_core" && organization.licenseEvidence.bedTotals.verifiedCoreTarget !== null) ||
      (capacityEvidence === "reported" && organization.licenseEvidence.bedTotals.reportedByOperator !== null) ||
      (capacityEvidence === "unverified" && organization.licenseEvidence.bedTotals.verifiedCurrentLicensed === null)) &&
    (valuationEvidence === "all" ||
      (valuationEvidence === "available" && organization.valuationEvidence !== null) ||
      (valuationEvidence === "unavailable" && organization.valuationEvidence === null)) &&
    (gap === "all" || organization.research.gaps.includes(gap)) &&
    (!query || organization.searchable.includes(query))
  ).sort((left, right) =>
    stage === "validated_targets" && sort === "rank"
      ? (left.validatedTargetRank ?? Number.MAX_SAFE_INTEGER) -
          (right.validatedTargetRank ?? Number.MAX_SAFE_INTEGER) || left.proposedName.localeCompare(right.proposedName)
      : compareOrganizations(left, right, sort)
  );
  return {
    available: true,
    persistence: shouldUseAzureAcquisitionStorage() ? "azure_blob" : "local_file_store",
    generatedAt: index.generatedAt,
    indexVersion: index.version,
    status: index.status,
    scope: index.scope,
    counts: {
      ...index.counts,
      ownerReviewed: activeDecisions.length,
      ownerSelected: activeDecisions.filter(({ status }) => status === "selected").length,
      ownerHeld: activeDecisions.filter(({ status }) => status === "hold").length,
      ownerExcluded: activeDecisions.filter(({ status }) => status === "excluded").length,
      ownerMatureReviewed: matureDecisions.length,
      ownerMatureSelected: matureDecisions.filter(({ status }) => status === "selected").length,
      ownerMatureRemaining: Math.max(0, Number(index.counts.matureScaleSignals ?? 0) - matureDecisions.length),
      ownerResearch100Reviewed: research100Decisions.length,
      ownerResearch100Selected: research100Decisions.filter(({ status }) => status === "selected").length,
      ownerResearch100Remaining: Math.max(0, Number(index.counts.research100Queue ?? 0) - research100Decisions.length),
      ownerScreen500Reviewed: screen500Decisions.length,
      ownerScreen500Selected: screen500Decisions.filter(({ status }) => status === "selected").length,
      ownerScreen500Remaining: Math.max(0, Number(index.counts.screen500 ?? 0) - screen500Decisions.length),
      ownerReattachedSelections: selectionResolution.integrity.reattached.length,
      ownerOrphanedSelections: selectionResolution.integrity.orphaned.length,
      ownerSelectionConflicts: selectionResolution.integrity.conflicts.length,
      ownerSupersededSelections: selectionResolution.integrity.superseded.length,
      frozenResearchCohorts: selectionState.cohorts.length
    },
    confidencePolicy: index.confidencePolicy,
    verificationBoundary: index.verificationBoundary,
    selectionRevision: selectionState.revision,
    cohorts: [...selectionState.cohorts]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((cohort) => summarizeAcquisitionOperatorCohort(cohort, selectionState.jobs)),
    selectionIntegrity: selectionResolution.integrity,
    query: { q: query, state: stateCode, stage, fit, eligibility, classification, maturity, selectionBucket, privateLikelihood, screeningCapacityBand, facilityScaleBand, ownerDecision, relationshipConfidence, ownershipConfidence, capacityEvidence, valuationEvidence, gap, sort, limit, offset },
    matched: matches.length,
    matchedBreakdown: matchedBreakdown(matches),
    results: matches.slice(offset, offset + limit).map(({ searchable: _searchable, ...organization }) => ({
      ...organization,
      screeningDecision: decisionsByOperatorId.get(organization.id) ?? null
    }))
  };
}

export async function getAcquisitionOperatorById(operatorId) {
  const normalizedId = String(operatorId ?? "").trim();
  if (!normalizedId || normalizedId.length > 120) throw invalid("operatorId is invalid.");
  const index = await loadIndex();
  if (!index) return null;
  const match = index.organizations.find(({ id }) => id === normalizedId);
  if (!match) return null;
  const { searchable: _searchable, ...operator } = match;
  return operator;
}
