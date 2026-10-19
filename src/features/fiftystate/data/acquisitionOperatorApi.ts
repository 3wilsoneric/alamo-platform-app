import {
  fetchWithApiAuth,
  readBoundedJsonResponse
} from "../../../shared/api/authenticatedFetch";

export type AcquisitionOperatorStage = "all" | "target_candidates" | "screen_500" | "research_100_queue" | "validated_targets";
export type AcquisitionOperatorConfidence = "all" | "not_high" | "unverified" | "low" | "medium" | "high";
export type AcquisitionOperatorCapacityEvidence = "all" | "verified_any" | "verified_core" | "reported" | "unverified";
export type AcquisitionOperatorValuationEvidence = "all" | "available" | "unavailable";
export type AcquisitionOperatorMaturityTier = "platform_scale_signal" | "regional_scale_signal" | "established_local_signal" | "single_site_or_unresolved";
export type AcquisitionOperatorMaturity = "all" | "mature_scale_signal" | AcquisitionOperatorMaturityTier;
export type AcquisitionOperatorSelectionBucket = "all" | "mature_target_signal" | "established_target_signal" | "smaller_target_signal" | "mature_needs_fit_review" | "market_context";
export type AcquisitionOperatorPrivateLikelihood = "all" | "verified_private" | "supported_private" | "directory_private_signal" | "unverified" | "excluded";
export type AcquisitionOperatorScreeningCapacityBand = "all" | "estimable" | "not_estimable" | "under_25" | "25_74" | "75_149" | "150_299" | "300_plus";
export type AcquisitionOperatorFacilityScaleBand = "all" | "one_location" | "two_three_locations" | "four_nine_locations" | "ten_twenty_four_locations" | "twenty_five_plus_locations";
export type AcquisitionOperatorFit = "all" | "core_signal" | "adjacent_signal" | "context_or_unresolved";
export type AcquisitionOperatorOwnerDecision = "all" | "selected" | "hold" | "excluded" | "undecided";
export type AcquisitionOperatorDecisionStatus = Exclude<AcquisitionOperatorOwnerDecision, "all" | "undecided">;
export type AcquisitionOperatorSort = "rank" | "maturity" | "score" | "screening_capacity" | "beds" | "value" | "company";

export interface AcquisitionOperatorValuationCase {
  beds: number;
  occupancy: number;
  netRevenuePerOccupiedBedDay: number;
  ebitdaMargin: number;
  ebitdaMultiple: number;
  revenueMillions: number;
  ebitdaMillions: number;
  enterpriseValueMillions: number;
}

export interface AcquisitionOperatorValuationEvidenceRecord {
  status: string;
  scope: string;
  isWholeCompanyEstimate: false;
  capacityBasis: string;
  capacityConfidence: string;
  estimateConfidence: string;
  capacity: {
    verifiedLicensedBeds: number;
    nonOverlappingOperatorReportedBeds: number;
    overlappingOperatorReportedBedsExcluded: number;
    valuedBeds: number;
    licensedPrograms: number;
    reportedPrograms: number;
  };
  valuation: {
    version: string;
    modelVersion: string;
    status: string;
    operatorId: string | null;
    segment: { id: string; label: string; workbookBasis: string };
    assumptions: Record<string, Record<string, number>>;
    outputs: Record<"low" | "base" | "high", AcquisitionOperatorValuationCase>;
    formulas: Record<string, string>;
    limitations: string[];
  };
  limitations: string[];
}

export interface AcquisitionOperatorResult {
  id: string;
  proposedName: string;
  canonicalNameStatus: string;
  rootDomain: string | null;
  discoveryBasis: string;
  aliases: string[];
  identityKeys: string[];
  acquisitionEligibility: string;
  screeningProfile: {
    maturityTier: AcquisitionOperatorMaturityTier;
    maturityScore: number;
    privateLikelihood: Exclude<AcquisitionOperatorPrivateLikelihood, "all">;
    selectionBucket: Exclude<AcquisitionOperatorSelectionBucket, "all">;
    facilityScale: number;
    facilityScaleBand: Exclude<AcquisitionOperatorFacilityScaleBand, "all">;
    stateBreadth: number;
    basis: string;
  };
  screeningDecision: null | {
    operatorId: string;
    status: AcquisitionOperatorDecisionStatus;
    notes: string;
    snapshot: {
      proposedName: string;
      rootDomain: string | null;
      selectionBucket: string;
      maturityTier: string;
      identityKeys: string[];
      targetRank: number | null;
    };
    createdAt: string;
    updatedAt: string;
    updatedBy: string;
  };
  parentIdentity: null | {
    id: string;
    operatingParentName: string;
    canonicalLegalName: string | null;
    primaryDomain: string | null;
    sponsorName: string | null;
    ownershipType: string;
    acquisitionEligibility: string;
    targetClassification: string;
    valuationModel: null | { segmentId: string; selectionBasis: string };
    confidence: Record<string, string>;
    sources: Array<{
      id: string;
      sourceType: string;
      title: string;
      url: string;
      asOf: string;
      supports: string[];
    }>;
    contradictions: Array<{ id: string; status: string; description: string }>;
    notes: string;
  };
  licenseEvidence: {
    status: string;
    portfolioCoverage: string;
    confidence: Record<string, string>;
    bedTotals: {
      verifiedCurrentLicensed: number | null;
      verifiedCoreTarget: number | null;
      verifiedAdjacentHighAcuitySud: number | null;
      reportedByOperator: number | null;
      estimatedLow: number | null;
      estimatedHigh: number | null;
    };
    counts: Record<string, number>;
    stateCodes: string[];
    lastVerifiedAt: string | null;
    evidenceIds: string[];
    licenses: Array<{
      id: string;
      brandName: string | null;
      programName: string;
      legalOperatorName: string;
      address: Record<string, string>;
      license: Record<string, string | null>;
      capacity: { licensedBeds: number | null; scopeClassification: string; confidence: string };
      source: { id: string; title: string; sourceType: string; url: string; landingPageUrl: string; workbookSheet: string | null; asOf: string };
    }>;
    reportedCapacity: Array<{
      id: string;
      brandName: string | null;
      programName: string;
      address: Record<string, string>;
      capacity: { reportedBeds: number; evidenceBasis: string; scopeClassification: string; confidence: string };
      source: { id: string; title: string; sourceType: string; url: string; asOf: string };
    }>;
  };
  screeningCapacity: {
    status: string;
    bucket: Exclude<AcquisitionOperatorScreeningCapacityBand, "all">;
    confidence: "low";
    isWholeCompanyEstimate: false;
    rangeScope: string;
    candidateSites: { total: number; core: number; adjacent: number; unresolved: number };
    peerRange: { low: number | null; base: number | null; high: number | null };
    range: { low: number | null; base: number | null; high: number | null };
    evidencedFloorBeds: number | null;
    basis: string;
    limitations: string[];
  };
  valuationEvidence: AcquisitionOperatorValuationEvidenceRecord | null;
  research: { gaps: string[]; nextAction: string | null };
  resolution: {
    status: string;
    confidence: string;
    basis: string;
    parentCompanyId: string | null;
    legalOperatorIds: string[];
    evidenceIds: string[];
    contradictionIds: string[];
  };
  scope: {
    fitCategory: string;
    inferredFitCategory: string;
    targetClassification: string;
    signals: string[];
    cautions: string[];
    screeningScore: number;
    scoreComponents: Record<string, number>;
  };
  facilityCounts: { total: number; candidates: number; coreSignal: number; adjacentSignal: number };
  stateCodes: string[];
  candidateStateCodes: string[];
  facilityIds: string[];
  candidateFacilityIds: string[];
  targetRank: number | null;
  validatedTargetRank: number | null;
  funnelStage: string;
}

export interface AcquisitionOperatorCohortSummary {
  id: string;
  name: string;
  status: string;
  memberCount: number;
  sourceSelectionRevision: number;
  sourceIndexVersion: number;
  sourceIndexGeneratedAt: string;
  createdAt: string;
  createdBy: string;
  readiness: {
    parentRelationshipHigh: number;
    legalIdentityHigh: number;
    privateOwnershipHigh: number;
    targetFitHigh: number;
    capacityHigh: number;
    valuationInputsHigh: number;
    knownCapacityValuations: number;
    allEvidenceGatesHigh: number;
  };
  evidenceTotals: {
    verifiedCoreBedsInSnapshots: number;
    operatorReportedBedsInSnapshots: number;
    knownCapacityBaseEnterpriseValueMillions: number;
  };
  researchQueue: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    blocked: number;
    phase1: number;
    phase2: number;
    phase3: number;
  };
}

export interface AcquisitionOperatorSearchResponse {
  available: boolean;
  persistence: "local_file_store" | "azure_blob";
  indexVersion: number | null;
  generatedAt: string | null;
  status: string | null;
  scope: Record<string, unknown> | null;
  counts: Record<string, number>;
  verificationBoundary: string | null;
  selectionIntegrity: {
    reattached: AcquisitionOperatorSelectionIssue[];
    orphaned: AcquisitionOperatorSelectionIssue[];
    conflicts: AcquisitionOperatorSelectionIssue[];
    superseded: AcquisitionOperatorSelectionIssue[];
  };
  selectionRevision: number;
  cohorts: AcquisitionOperatorCohortSummary[];
  matched: number;
  matchedBreakdown: {
    total: number;
    platformScaleSignals: number;
    regionalScaleSignals: number;
    establishedLocalSignals: number;
    singleSiteOrUnresolved: number;
    evidenceBackedParents: number;
    unresolvedParentProposals: number;
    verifiedPrivate: number;
    ownershipPending: number;
    excludedOwnership: number;
    coreFitSignals: number;
    adjacentFitSignals: number;
    unresolvedFit: number;
    screeningCapacityAvailable: number;
    screeningCapacityNotEstimable: number;
    screeningCapacityUnder25: number;
    screeningCapacity25To74: number;
    screeningCapacity75To149: number;
    screeningCapacity150To299: number;
    screeningCapacity300Plus: number;
    withVerifiedCoreBeds: number;
    withReportedBeds: number;
    withKnownCapacityValuation: number;
    withOpenContradictions: number;
  };
  results: AcquisitionOperatorResult[];
}

export interface AcquisitionOperatorFilters {
  stage: AcquisitionOperatorStage;
  q?: string;
  state?: string;
  eligibility?: string;
  relationshipConfidence?: AcquisitionOperatorConfidence;
  ownershipConfidence?: AcquisitionOperatorConfidence;
  capacityEvidence?: AcquisitionOperatorCapacityEvidence;
  valuationEvidence?: AcquisitionOperatorValuationEvidence;
  maturity?: AcquisitionOperatorMaturity;
  selectionBucket?: AcquisitionOperatorSelectionBucket;
  privateLikelihood?: AcquisitionOperatorPrivateLikelihood;
  screeningCapacityBand?: AcquisitionOperatorScreeningCapacityBand;
  facilityScaleBand?: AcquisitionOperatorFacilityScaleBand;
  fit?: AcquisitionOperatorFit;
  ownerDecision?: AcquisitionOperatorOwnerDecision;
  gap?: string;
  sort?: AcquisitionOperatorSort;
  limit?: number;
  offset?: number;
}

export interface AcquisitionOperatorExportArtifact {
  version: string;
  available: true;
  filename: string;
  mimeType: "text/csv;charset=utf-8";
  generatedAt: string;
  indexVersion: number;
  selectionRevision: number;
  matched: number;
  rowCount: number;
  truncated: boolean;
  content: string;
}

export interface AcquisitionOperatorBulkDecisionResponse {
  ok: true;
  revision: number;
  requested: number;
  selected: number;
  skippedAlreadyReviewed: number;
  skippedIneligible: number;
  skippedResearchListLimit: number;
  ownerSelected: number;
  selectedOperatorIds: string[];
}

export interface AcquisitionOperatorSelectionIssue {
  operatorId: string;
  status: string;
  proposedName: string;
  rootDomain: string | null;
  reason: string;
  currentOperatorId?: string;
  candidateOperatorIds?: string[];
  matchedIdentityKeys?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalid(label: string): never {
  throw new Error(`The operator universe returned invalid ${label}.`);
}

function text(value: unknown, label: string) {
  if (typeof value !== "string") invalid(label);
  return value;
}

function nullableText(value: unknown, label: string) {
  if (value === null) return null;
  return text(value, label);
}

function number(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalid(label);
  return value;
}

function nullableNumber(value: unknown, label: string) {
  if (value === null) return null;
  return number(value, label);
}

function textList(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) invalid(label);
  return value;
}

function textRecord(value: unknown, label: string) {
  if (!isRecord(value)) invalid(label);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, text(entry, `${label}.${key}`)]));
}

function numberRecord(value: unknown, label: string) {
  if (!isRecord(value)) invalid(label);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, number(entry, `${label}.${key}`)]));
}

function validateMatchedBreakdown(value: unknown): AcquisitionOperatorSearchResponse["matchedBreakdown"] {
  if (!isRecord(value)) invalid("matchedBreakdown");
  return {
    total: number(value.total, "matchedBreakdown.total"),
    platformScaleSignals: number(value.platformScaleSignals, "matchedBreakdown.platformScaleSignals"),
    regionalScaleSignals: number(value.regionalScaleSignals, "matchedBreakdown.regionalScaleSignals"),
    establishedLocalSignals: number(value.establishedLocalSignals, "matchedBreakdown.establishedLocalSignals"),
    singleSiteOrUnresolved: number(value.singleSiteOrUnresolved, "matchedBreakdown.singleSiteOrUnresolved"),
    evidenceBackedParents: number(value.evidenceBackedParents, "matchedBreakdown.evidenceBackedParents"),
    unresolvedParentProposals: number(value.unresolvedParentProposals, "matchedBreakdown.unresolvedParentProposals"),
    verifiedPrivate: number(value.verifiedPrivate, "matchedBreakdown.verifiedPrivate"),
    ownershipPending: number(value.ownershipPending, "matchedBreakdown.ownershipPending"),
    excludedOwnership: number(value.excludedOwnership, "matchedBreakdown.excludedOwnership"),
    coreFitSignals: number(value.coreFitSignals, "matchedBreakdown.coreFitSignals"),
    adjacentFitSignals: number(value.adjacentFitSignals, "matchedBreakdown.adjacentFitSignals"),
    unresolvedFit: number(value.unresolvedFit, "matchedBreakdown.unresolvedFit"),
    screeningCapacityAvailable: number(value.screeningCapacityAvailable, "matchedBreakdown.screeningCapacityAvailable"),
    screeningCapacityNotEstimable: number(value.screeningCapacityNotEstimable, "matchedBreakdown.screeningCapacityNotEstimable"),
    screeningCapacityUnder25: number(value.screeningCapacityUnder25, "matchedBreakdown.screeningCapacityUnder25"),
    screeningCapacity25To74: number(value.screeningCapacity25To74, "matchedBreakdown.screeningCapacity25To74"),
    screeningCapacity75To149: number(value.screeningCapacity75To149, "matchedBreakdown.screeningCapacity75To149"),
    screeningCapacity150To299: number(value.screeningCapacity150To299, "matchedBreakdown.screeningCapacity150To299"),
    screeningCapacity300Plus: number(value.screeningCapacity300Plus, "matchedBreakdown.screeningCapacity300Plus"),
    withVerifiedCoreBeds: number(value.withVerifiedCoreBeds, "matchedBreakdown.withVerifiedCoreBeds"),
    withReportedBeds: number(value.withReportedBeds, "matchedBreakdown.withReportedBeds"),
    withKnownCapacityValuation: number(value.withKnownCapacityValuation, "matchedBreakdown.withKnownCapacityValuation"),
    withOpenContradictions: number(value.withOpenContradictions, "matchedBreakdown.withOpenContradictions")
  };
}

function validateValuationEvidence(value: unknown, label: string): AcquisitionOperatorValuationEvidenceRecord | null {
  if (value === null) return null;
  if (!isRecord(value) || !isRecord(value.capacity) || !isRecord(value.valuation) ||
      !isRecord(value.valuation.segment) || !isRecord(value.valuation.assumptions) ||
      !isRecord(value.valuation.outputs) || !isRecord(value.valuation.formulas)) invalid(label);
  const valuation = value.valuation as Record<string, unknown>;
  const valuationOutputs = valuation.outputs as Record<string, unknown>;
  const valuationAssumptions = valuation.assumptions as Record<string, unknown>;
  const outputs = Object.fromEntries((["low", "base", "high"] as const).map((caseName) => {
    const output = valuationOutputs[caseName];
    if (!isRecord(output)) invalid(`${label}.outputs.${caseName}`);
    return [caseName, numberRecord(output, `${label}.outputs.${caseName}`)];
  })) as unknown as AcquisitionOperatorValuationEvidenceRecord["valuation"]["outputs"];
  return {
    status: text(value.status, `${label}.status`),
    scope: text(value.scope, `${label}.scope`),
    isWholeCompanyEstimate: value.isWholeCompanyEstimate === false ? false : invalid(`${label}.isWholeCompanyEstimate`),
    capacityBasis: text(value.capacityBasis, `${label}.capacityBasis`),
    capacityConfidence: text(value.capacityConfidence, `${label}.capacityConfidence`),
    estimateConfidence: text(value.estimateConfidence, `${label}.estimateConfidence`),
    capacity: numberRecord(value.capacity, `${label}.capacity`) as unknown as AcquisitionOperatorValuationEvidenceRecord["capacity"],
    valuation: {
      version: text(valuation.version, `${label}.valuation.version`),
      modelVersion: text(valuation.modelVersion, `${label}.valuation.modelVersion`),
      status: text(valuation.status, `${label}.valuation.status`),
      operatorId: nullableText(valuation.operatorId, `${label}.valuation.operatorId`),
      segment: textRecord(valuation.segment, `${label}.valuation.segment`) as unknown as AcquisitionOperatorValuationEvidenceRecord["valuation"]["segment"],
      assumptions: Object.fromEntries(Object.entries(valuationAssumptions).map(([key, entry]) => [
        key,
        numberRecord(entry, `${label}.valuation.assumptions.${key}`)
      ])),
      outputs,
      formulas: textRecord(valuation.formulas, `${label}.valuation.formulas`),
      limitations: textList(valuation.limitations, `${label}.valuation.limitations`)
    },
    limitations: textList(value.limitations, `${label}.limitations`)
  };
}

function validateResult(value: unknown, index: number): AcquisitionOperatorResult {
  const label = `results[${index}]`;
  if (!isRecord(value) || !isRecord(value.licenseEvidence) || !isRecord(value.licenseEvidence.bedTotals) ||
      !isRecord(value.licenseEvidence.counts) || !Array.isArray(value.licenseEvidence.licenses) ||
      !Array.isArray(value.licenseEvidence.reportedCapacity) || !isRecord(value.research) ||
      !isRecord(value.resolution) || !isRecord(value.scope) || !isRecord(value.scope.scoreComponents) ||
      !isRecord(value.facilityCounts) || !isRecord(value.screeningProfile) || !isRecord(value.screeningCapacity) ||
      !isRecord(value.screeningCapacity.candidateSites) || !isRecord(value.screeningCapacity.peerRange) ||
      !isRecord(value.screeningCapacity.range)) invalid(label);
  const parent = value.parentIdentity;
  if (parent !== null && (!isRecord(parent) || !Array.isArray(parent.sources) || !Array.isArray(parent.contradictions))) {
    invalid(`${label}.parentIdentity`);
  }
  const parentRecord = parent as Record<string, unknown> | null;
  return {
    id: text(value.id, `${label}.id`),
    proposedName: text(value.proposedName, `${label}.proposedName`),
    canonicalNameStatus: text(value.canonicalNameStatus, `${label}.canonicalNameStatus`),
    rootDomain: nullableText(value.rootDomain, `${label}.rootDomain`),
    discoveryBasis: text(value.discoveryBasis, `${label}.discoveryBasis`),
    aliases: textList(value.aliases, `${label}.aliases`),
    identityKeys: textList(value.identityKeys, `${label}.identityKeys`),
    acquisitionEligibility: text(value.acquisitionEligibility, `${label}.acquisitionEligibility`),
    screeningProfile: {
      maturityTier: text(value.screeningProfile.maturityTier, `${label}.screeningProfile.maturityTier`) as AcquisitionOperatorResult["screeningProfile"]["maturityTier"],
      maturityScore: number(value.screeningProfile.maturityScore, `${label}.screeningProfile.maturityScore`),
      privateLikelihood: text(value.screeningProfile.privateLikelihood, `${label}.screeningProfile.privateLikelihood`) as AcquisitionOperatorResult["screeningProfile"]["privateLikelihood"],
      selectionBucket: text(value.screeningProfile.selectionBucket, `${label}.screeningProfile.selectionBucket`) as AcquisitionOperatorResult["screeningProfile"]["selectionBucket"],
      facilityScale: number(value.screeningProfile.facilityScale, `${label}.screeningProfile.facilityScale`),
      facilityScaleBand: text(value.screeningProfile.facilityScaleBand, `${label}.screeningProfile.facilityScaleBand`) as AcquisitionOperatorResult["screeningProfile"]["facilityScaleBand"],
      stateBreadth: number(value.screeningProfile.stateBreadth, `${label}.screeningProfile.stateBreadth`),
      basis: text(value.screeningProfile.basis, `${label}.screeningProfile.basis`)
    },
    screeningDecision: value.screeningDecision === null
      ? null
      : (() => {
        if (!isRecord(value.screeningDecision) || !isRecord(value.screeningDecision.snapshot)) invalid(`${label}.screeningDecision`);
        const decision = value.screeningDecision;
        const decisionSnapshot = decision.snapshot as Record<string, unknown>;
        return {
          operatorId: text(decision.operatorId, `${label}.screeningDecision.operatorId`),
          status: text(decision.status, `${label}.screeningDecision.status`) as AcquisitionOperatorDecisionStatus,
          notes: text(decision.notes, `${label}.screeningDecision.notes`),
          snapshot: {
            proposedName: text(decisionSnapshot.proposedName, `${label}.screeningDecision.snapshot.proposedName`),
            rootDomain: nullableText(decisionSnapshot.rootDomain, `${label}.screeningDecision.snapshot.rootDomain`),
            selectionBucket: text(decisionSnapshot.selectionBucket, `${label}.screeningDecision.snapshot.selectionBucket`),
            maturityTier: text(decisionSnapshot.maturityTier, `${label}.screeningDecision.snapshot.maturityTier`),
            identityKeys: textList(decisionSnapshot.identityKeys, `${label}.screeningDecision.snapshot.identityKeys`),
            targetRank: nullableNumber(decisionSnapshot.targetRank, `${label}.screeningDecision.snapshot.targetRank`)
          },
          createdAt: text(decision.createdAt, `${label}.screeningDecision.createdAt`),
          updatedAt: text(decision.updatedAt, `${label}.screeningDecision.updatedAt`),
          updatedBy: text(decision.updatedBy, `${label}.screeningDecision.updatedBy`)
        };
      })(),
    parentIdentity: parentRecord === null ? null : {
      id: text(parentRecord.id, `${label}.parent.id`),
      operatingParentName: text(parentRecord.operatingParentName, `${label}.parent.operatingParentName`),
      canonicalLegalName: nullableText(parentRecord.canonicalLegalName, `${label}.parent.canonicalLegalName`),
      primaryDomain: nullableText(parentRecord.primaryDomain, `${label}.parent.primaryDomain`),
      sponsorName: nullableText(parentRecord.sponsorName, `${label}.parent.sponsorName`),
      ownershipType: text(parentRecord.ownershipType, `${label}.parent.ownershipType`),
      acquisitionEligibility: text(parentRecord.acquisitionEligibility, `${label}.parent.acquisitionEligibility`),
      targetClassification: text(parentRecord.targetClassification, `${label}.parent.targetClassification`),
      valuationModel: parentRecord.valuationModel === null
        ? null
        : textRecord(parentRecord.valuationModel, `${label}.parent.valuationModel`) as { segmentId: string; selectionBasis: string },
      confidence: textRecord(parentRecord.confidence, `${label}.parent.confidence`),
      sources: (parentRecord.sources as unknown[]).map((source, sourceIndex) => {
        if (!isRecord(source)) invalid(`${label}.parent.sources[${sourceIndex}]`);
        return {
          id: text(source.id, "source.id"), sourceType: text(source.sourceType, "source.sourceType"),
          title: text(source.title, "source.title"), url: text(source.url, "source.url"),
          asOf: text(source.asOf, "source.asOf"), supports: textList(source.supports, "source.supports")
        };
      }),
      contradictions: (parentRecord.contradictions as unknown[]).map((entry, contradictionIndex) => {
        if (!isRecord(entry)) invalid(`${label}.parent.contradictions[${contradictionIndex}]`);
        return { id: text(entry.id, "contradiction.id"), status: text(entry.status, "contradiction.status"), description: text(entry.description, "contradiction.description") };
      }),
      notes: text(parentRecord.notes, `${label}.parent.notes`)
    },
    licenseEvidence: {
      status: text(value.licenseEvidence.status, `${label}.license.status`),
      portfolioCoverage: text(value.licenseEvidence.portfolioCoverage, `${label}.license.portfolioCoverage`),
      confidence: textRecord(value.licenseEvidence.confidence, `${label}.license.confidence`),
      bedTotals: {
        verifiedCurrentLicensed: nullableNumber(value.licenseEvidence.bedTotals.verifiedCurrentLicensed, "verifiedCurrentLicensed"),
        verifiedCoreTarget: nullableNumber(value.licenseEvidence.bedTotals.verifiedCoreTarget, "verifiedCoreTarget"),
        verifiedAdjacentHighAcuitySud: nullableNumber(value.licenseEvidence.bedTotals.verifiedAdjacentHighAcuitySud, "verifiedAdjacentHighAcuitySud"),
        reportedByOperator: nullableNumber(value.licenseEvidence.bedTotals.reportedByOperator, "reportedByOperator"),
        estimatedLow: nullableNumber(value.licenseEvidence.bedTotals.estimatedLow, "estimatedLow"),
        estimatedHigh: nullableNumber(value.licenseEvidence.bedTotals.estimatedHigh, "estimatedHigh")
      },
      counts: numberRecord(value.licenseEvidence.counts, `${label}.license.counts`),
      stateCodes: textList(value.licenseEvidence.stateCodes, `${label}.license.stateCodes`),
      lastVerifiedAt: nullableText(value.licenseEvidence.lastVerifiedAt, `${label}.license.lastVerifiedAt`),
      evidenceIds: textList(value.licenseEvidence.evidenceIds, `${label}.license.evidenceIds`),
      licenses: value.licenseEvidence.licenses as AcquisitionOperatorResult["licenseEvidence"]["licenses"],
      reportedCapacity: value.licenseEvidence.reportedCapacity as AcquisitionOperatorResult["licenseEvidence"]["reportedCapacity"]
    },
    screeningCapacity: {
      status: text(value.screeningCapacity.status, `${label}.screeningCapacity.status`),
      bucket: text(value.screeningCapacity.bucket, `${label}.screeningCapacity.bucket`) as AcquisitionOperatorResult["screeningCapacity"]["bucket"],
      confidence: text(value.screeningCapacity.confidence, `${label}.screeningCapacity.confidence`) as "low",
      isWholeCompanyEstimate: value.screeningCapacity.isWholeCompanyEstimate === false
        ? false
        : invalid(`${label}.screeningCapacity.isWholeCompanyEstimate`),
      rangeScope: text(value.screeningCapacity.rangeScope, `${label}.screeningCapacity.rangeScope`),
      candidateSites: {
        total: number(value.screeningCapacity.candidateSites.total, `${label}.screeningCapacity.candidateSites.total`),
        core: number(value.screeningCapacity.candidateSites.core, `${label}.screeningCapacity.candidateSites.core`),
        adjacent: number(value.screeningCapacity.candidateSites.adjacent, `${label}.screeningCapacity.candidateSites.adjacent`),
        unresolved: number(value.screeningCapacity.candidateSites.unresolved, `${label}.screeningCapacity.candidateSites.unresolved`)
      },
      peerRange: {
        low: nullableNumber(value.screeningCapacity.peerRange.low, `${label}.screeningCapacity.peerRange.low`),
        base: nullableNumber(value.screeningCapacity.peerRange.base, `${label}.screeningCapacity.peerRange.base`),
        high: nullableNumber(value.screeningCapacity.peerRange.high, `${label}.screeningCapacity.peerRange.high`)
      },
      range: {
        low: nullableNumber(value.screeningCapacity.range.low, `${label}.screeningCapacity.range.low`),
        base: nullableNumber(value.screeningCapacity.range.base, `${label}.screeningCapacity.range.base`),
        high: nullableNumber(value.screeningCapacity.range.high, `${label}.screeningCapacity.range.high`)
      },
      evidencedFloorBeds: nullableNumber(value.screeningCapacity.evidencedFloorBeds, `${label}.screeningCapacity.evidencedFloorBeds`),
      basis: text(value.screeningCapacity.basis, `${label}.screeningCapacity.basis`),
      limitations: textList(value.screeningCapacity.limitations, `${label}.screeningCapacity.limitations`)
    },
    valuationEvidence: validateValuationEvidence(value.valuationEvidence, `${label}.valuationEvidence`),
    research: { gaps: textList(value.research.gaps, `${label}.research.gaps`), nextAction: nullableText(value.research.nextAction, `${label}.research.nextAction`) },
    resolution: {
      status: text(value.resolution.status, `${label}.resolution.status`), confidence: text(value.resolution.confidence, `${label}.resolution.confidence`),
      basis: text(value.resolution.basis, `${label}.resolution.basis`), parentCompanyId: nullableText(value.resolution.parentCompanyId, `${label}.resolution.parentCompanyId`),
      legalOperatorIds: textList(value.resolution.legalOperatorIds, `${label}.resolution.legalOperatorIds`), evidenceIds: textList(value.resolution.evidenceIds, `${label}.resolution.evidenceIds`),
      contradictionIds: textList(value.resolution.contradictionIds, `${label}.resolution.contradictionIds`)
    },
    scope: {
      fitCategory: text(value.scope.fitCategory, `${label}.scope.fitCategory`), inferredFitCategory: text(value.scope.inferredFitCategory, `${label}.scope.inferredFitCategory`),
      targetClassification: text(value.scope.targetClassification, `${label}.scope.targetClassification`), signals: textList(value.scope.signals, `${label}.scope.signals`),
      cautions: textList(value.scope.cautions, `${label}.scope.cautions`), screeningScore: number(value.scope.screeningScore, `${label}.scope.screeningScore`),
      scoreComponents: numberRecord(value.scope.scoreComponents, `${label}.scope.scoreComponents`)
    },
    facilityCounts: {
      total: number(value.facilityCounts.total, `${label}.facilityCounts.total`), candidates: number(value.facilityCounts.candidates, `${label}.facilityCounts.candidates`),
      coreSignal: number(value.facilityCounts.coreSignal, `${label}.facilityCounts.coreSignal`), adjacentSignal: number(value.facilityCounts.adjacentSignal, `${label}.facilityCounts.adjacentSignal`)
    },
    stateCodes: textList(value.stateCodes, `${label}.stateCodes`),
    candidateStateCodes: textList(value.candidateStateCodes, `${label}.candidateStateCodes`),
    facilityIds: textList(value.facilityIds, `${label}.facilityIds`),
    candidateFacilityIds: textList(value.candidateFacilityIds, `${label}.candidateFacilityIds`),
    targetRank: nullableNumber(value.targetRank, `${label}.targetRank`),
    validatedTargetRank: nullableNumber(value.validatedTargetRank, `${label}.validatedTargetRank`),
    funnelStage: text(value.funnelStage, `${label}.funnelStage`)
  };
}

function validateResponse(value: unknown): AcquisitionOperatorSearchResponse {
  if (!isRecord(value) || !Array.isArray(value.results)) invalid("response");
  const persistence = text(value.persistence, "persistence");
  if (persistence !== "local_file_store" && persistence !== "azure_blob") invalid("persistence");
  const available = value.available === true;
  const matchedBreakdown = validateMatchedBreakdown(value.matchedBreakdown);
  const integrity = available && isRecord(value.selectionIntegrity) ? value.selectionIntegrity : {};
  const validateIssues = (issues: unknown, label: string): AcquisitionOperatorSelectionIssue[] => {
    if (!Array.isArray(issues)) invalid(label);
    return issues.map((issue, index) => {
      if (!isRecord(issue)) invalid(`${label}[${index}]`);
      return {
        operatorId: text(issue.operatorId, `${label}[${index}].operatorId`),
        status: text(issue.status, `${label}[${index}].status`),
        proposedName: text(issue.proposedName, `${label}[${index}].proposedName`),
        rootDomain: nullableText(issue.rootDomain, `${label}[${index}].rootDomain`),
        reason: text(issue.reason, `${label}[${index}].reason`),
        ...(typeof issue.currentOperatorId === "string" ? { currentOperatorId: issue.currentOperatorId } : {}),
        ...(Array.isArray(issue.candidateOperatorIds) ? { candidateOperatorIds: textList(issue.candidateOperatorIds, `${label}[${index}].candidateOperatorIds`) } : {}),
        ...(Array.isArray(issue.matchedIdentityKeys) ? { matchedIdentityKeys: textList(issue.matchedIdentityKeys, `${label}[${index}].matchedIdentityKeys`) } : {})
      };
    });
  };
  const validateCohorts = (cohorts: unknown): AcquisitionOperatorCohortSummary[] => {
    if (!Array.isArray(cohorts)) invalid("cohorts");
    return cohorts.map((cohort, index) => {
      if (!isRecord(cohort) || !isRecord(cohort.readiness) || !isRecord(cohort.evidenceTotals) || !isRecord(cohort.researchQueue)) invalid(`cohorts[${index}]`);
      return {
        id: text(cohort.id, `cohorts[${index}].id`),
        name: text(cohort.name, `cohorts[${index}].name`),
        status: text(cohort.status, `cohorts[${index}].status`),
        memberCount: number(cohort.memberCount, `cohorts[${index}].memberCount`),
        sourceSelectionRevision: number(cohort.sourceSelectionRevision, `cohorts[${index}].sourceSelectionRevision`),
        sourceIndexVersion: number(cohort.sourceIndexVersion, `cohorts[${index}].sourceIndexVersion`),
        sourceIndexGeneratedAt: text(cohort.sourceIndexGeneratedAt, `cohorts[${index}].sourceIndexGeneratedAt`),
        createdAt: text(cohort.createdAt, `cohorts[${index}].createdAt`),
        createdBy: text(cohort.createdBy, `cohorts[${index}].createdBy`),
        readiness: numberRecord(cohort.readiness, `cohorts[${index}].readiness`) as unknown as AcquisitionOperatorCohortSummary["readiness"],
        evidenceTotals: numberRecord(cohort.evidenceTotals, `cohorts[${index}].evidenceTotals`) as unknown as AcquisitionOperatorCohortSummary["evidenceTotals"],
        researchQueue: numberRecord(cohort.researchQueue, `cohorts[${index}].researchQueue`) as unknown as AcquisitionOperatorCohortSummary["researchQueue"]
      };
    });
  };
  return {
    available,
    persistence,
    indexVersion: available ? number(value.indexVersion, "indexVersion") : null,
    generatedAt: available ? text(value.generatedAt, "generatedAt") : null,
    status: available ? text(value.status, "status") : null,
    scope: available && isRecord(value.scope) ? value.scope : null,
    counts: available ? numberRecord(value.counts, "counts") : {},
    verificationBoundary: available ? text(value.verificationBoundary, "verificationBoundary") : null,
    selectionIntegrity: available ? {
      reattached: validateIssues(integrity.reattached, "selectionIntegrity.reattached"),
      orphaned: validateIssues(integrity.orphaned, "selectionIntegrity.orphaned"),
      conflicts: validateIssues(integrity.conflicts, "selectionIntegrity.conflicts"),
      superseded: validateIssues(integrity.superseded, "selectionIntegrity.superseded")
    } : { reattached: [], orphaned: [], conflicts: [], superseded: [] },
    selectionRevision: available ? number(value.selectionRevision, "selectionRevision") : 0,
    cohorts: available ? validateCohorts(value.cohorts) : [],
    matched: number(value.matched, "matched"),
    matchedBreakdown,
    results: value.results.map(validateResult)
  };
}

function acquisitionOperatorSearchParams(filters: AcquisitionOperatorFilters) {
  const search = new URLSearchParams({
    stage: filters.stage,
    limit: String(filters.limit ?? 100),
    offset: String(filters.offset ?? 0)
  });
  if (filters.q?.trim()) search.set("q", filters.q.trim());
  if (filters.state?.trim()) search.set("state", filters.state.trim());
  if (filters.eligibility && filters.eligibility !== "all") search.set("eligibility", filters.eligibility);
  if (filters.relationshipConfidence && filters.relationshipConfidence !== "all") search.set("relationshipConfidence", filters.relationshipConfidence);
  if (filters.ownershipConfidence && filters.ownershipConfidence !== "all") search.set("ownershipConfidence", filters.ownershipConfidence);
  if (filters.capacityEvidence && filters.capacityEvidence !== "all") search.set("capacityEvidence", filters.capacityEvidence);
  if (filters.valuationEvidence && filters.valuationEvidence !== "all") search.set("valuationEvidence", filters.valuationEvidence);
  if (filters.maturity && filters.maturity !== "all") search.set("maturity", filters.maturity);
  if (filters.selectionBucket && filters.selectionBucket !== "all") search.set("selectionBucket", filters.selectionBucket);
  if (filters.privateLikelihood && filters.privateLikelihood !== "all") search.set("privateLikelihood", filters.privateLikelihood);
  if (filters.screeningCapacityBand && filters.screeningCapacityBand !== "all") search.set("screeningCapacityBand", filters.screeningCapacityBand);
  if (filters.facilityScaleBand && filters.facilityScaleBand !== "all") search.set("facilityScaleBand", filters.facilityScaleBand);
  if (filters.fit && filters.fit !== "all") search.set("fit", filters.fit);
  if (filters.ownerDecision && filters.ownerDecision !== "all") search.set("ownerDecision", filters.ownerDecision);
  if (filters.gap && filters.gap !== "all") search.set("gap", filters.gap);
  if (filters.sort) search.set("sort", filters.sort);
  return search;
}

export async function fetchAcquisitionOperators(filters: AcquisitionOperatorFilters, signal?: AbortSignal) {
  const search = acquisitionOperatorSearchParams(filters);
  return fetchWithApiAuth<AcquisitionOperatorSearchResponse | null>(`/api/platform/acquisition/operators?${search}`, {
    cache: "no-store",
    ...(signal ? { signal } : {})
  }, {
    consume: async (response) => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("The operator universe could not be loaded.");
      return validateResponse(await readBoundedJsonResponse<unknown>(response, 5_000_000));
    }
  });
}

export function fetchAcquisitionOperatorExport(
  filters: AcquisitionOperatorFilters,
  exportLimit = 500,
  signal?: AbortSignal
) {
  const search = acquisitionOperatorSearchParams(filters);
  search.delete("limit");
  search.delete("offset");
  search.set("exportLimit", String(exportLimit));
  return fetchWithApiAuth<AcquisitionOperatorExportArtifact>(
    `/api/platform/acquisition/operators/export?${search}`,
    { cache: "no-store", ...(signal ? { signal } : {}) },
    {
      consume: async (response) => {
        const value = await readBoundedJsonResponse<unknown>(response, 3_000_000);
        if (!response.ok) {
          const message = isRecord(value) && typeof value.error === "string"
            ? value.error
            : "The filtered company export could not be created.";
          throw new Error(message);
        }
        if (!isRecord(value) || value.available !== true || value.mimeType !== "text/csv;charset=utf-8" ||
            typeof value.truncated !== "boolean") invalid("company export artifact");
        const rowCount = number(value.rowCount, "export.rowCount");
        const matched = number(value.matched, "export.matched");
        if (rowCount > 500 || rowCount > matched) invalid("company export row counts");
        return {
          version: text(value.version, "export.version"),
          available: true,
          filename: text(value.filename, "export.filename"),
          mimeType: "text/csv;charset=utf-8",
          generatedAt: text(value.generatedAt, "export.generatedAt"),
          indexVersion: number(value.indexVersion, "export.indexVersion"),
          selectionRevision: number(value.selectionRevision, "export.selectionRevision"),
          matched,
          rowCount,
          truncated: value.truncated,
          content: text(value.content, "export.content")
        };
      }
    }
  );
}

export function setAcquisitionOperatorDecision(
  operatorId: string,
  status: AcquisitionOperatorDecisionStatus | "undecided",
  notes = "",
  signal?: AbortSignal
) {
  return fetchWithApiAuth<{ ok: true }>("/api/platform/acquisition/operator-decision", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operatorId, status, notes }),
    ...(signal ? { signal } : {})
  }, {
    consume: async (response) => {
      const payload = await readBoundedJsonResponse<unknown>(response, 100_000);
      if (!response.ok || !isRecord(payload) || payload.ok !== true) {
        throw new Error("The company screening decision could not be saved.");
      }
      return { ok: true };
    }
  });
}

export function selectUnreviewedAcquisitionOperatorPage(
  operatorIds: string[],
  selectionRevision: number,
  notes = "Added from the current filtered company page.",
  signal?: AbortSignal
) {
  return fetchWithApiAuth<AcquisitionOperatorBulkDecisionResponse>(
    "/api/platform/acquisition/operator-decisions/bulk",
    {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "select_unreviewed_page",
        operatorIds,
        selectionRevision,
        notes
      }),
      ...(signal ? { signal } : {})
    },
    {
      consume: async (response) => {
        const value = await readBoundedJsonResponse<unknown>(response, 250_000);
        if (!response.ok) {
          const message = isRecord(value) && typeof value.error === "string"
            ? value.error
            : "The page could not be added to the research list.";
          throw new Error(message);
        }
        if (!isRecord(value) || value.ok !== true || !Array.isArray(value.selectedOperatorIds)) {
          invalid("bulk company selection response");
        }
        return {
          ok: true,
          revision: number(value.revision, "bulk.revision"),
          requested: number(value.requested, "bulk.requested"),
          selected: number(value.selected, "bulk.selected"),
          skippedAlreadyReviewed: number(value.skippedAlreadyReviewed, "bulk.skippedAlreadyReviewed"),
          skippedIneligible: number(value.skippedIneligible, "bulk.skippedIneligible"),
          skippedResearchListLimit: number(value.skippedResearchListLimit, "bulk.skippedResearchListLimit"),
          ownerSelected: number(value.ownerSelected, "bulk.ownerSelected"),
          selectedOperatorIds: textList(value.selectedOperatorIds, "bulk.selectedOperatorIds")
        };
      }
    }
  );
}

export function freezeAcquisitionResearchCohort(
  name: string,
  idempotencyKey: string,
  signal?: AbortSignal
) {
  return fetchWithApiAuth<{ ok: true; created: boolean; cohort: AcquisitionOperatorCohortSummary }>(
    "/api/platform/acquisition/operator-cohort",
    {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "freeze_selected", name, idempotencyKey }),
      ...(signal ? { signal } : {})
    },
    {
      consume: async (response) => {
        const value = await readBoundedJsonResponse<unknown>(response, 1_000_000);
        if (!response.ok) {
          const message = isRecord(value) && typeof value.error === "string" ? value.error : "The research cohort could not be frozen.";
          throw new Error(message);
        }
        if (!isRecord(value) || value.ok !== true || !isRecord(value.cohort)) invalid("cohort freeze response");
        return value as unknown as { ok: true; created: boolean; cohort: AcquisitionOperatorCohortSummary };
      }
    }
  );
}
