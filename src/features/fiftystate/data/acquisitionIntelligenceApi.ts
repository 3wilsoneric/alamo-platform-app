import {
  fetchWithApiAuth,
  readBoundedJsonResponse
} from "../../../shared/api/authenticatedFetch";

export type AcquisitionCaseName = "low" | "base" | "high";
export type AcquisitionCaseValues = Record<AcquisitionCaseName, number>;

export interface AcquisitionAssumptions {
  occupancy: AcquisitionCaseValues;
  netRevenuePerOccupiedBedDay: AcquisitionCaseValues;
  ebitdaMargin: AcquisitionCaseValues;
  ebitdaMultiple: AcquisitionCaseValues;
}

export interface AcquisitionSegment {
  id: string;
  label: string;
  workbookBasis: string;
  assumptions: AcquisitionAssumptions;
}

export interface AcquisitionLead {
  id: string;
  name: string;
  stateCodes: string[];
  stateFootprintConfidence: "low" | "medium" | "high";
  relevance: string;
  researchPriority: "low" | "medium" | "high" | "very_high";
  candidateDisposition: "review" | "hold";
  verificationStatus: "discovery_only";
  nextEvidenceTask: string;
  segmentId: string;
  segmentLabel: string;
  reportedScale: string;
  reportedSiteCount: number | null;
  estimatedBeds: {
    low: number;
    high: number;
    confidence: "low" | "medium" | "high";
    sourceType: "reported" | "estimated";
    basis: string;
  };
  workbookIndicativeValue: { low: number; high: number };
  estimatedEnterpriseValue: {
    low: number;
    base: number;
    high: number;
    confidence: "low" | "medium" | "high";
    modelVersion: string;
  };
  sources: Array<{ label: string; url: string; asOf: string }>;
}

export interface AcquisitionWorkflowStage {
  id: string;
  label: string;
  status: string;
  description: string;
}

export interface AcquisitionNationalDiscoverySummary {
  available: boolean;
  status: "discovery_only" | "not_refreshed";
  persistence?: "local_file_store" | "azure_blob";
  datasetYear: number | null;
  generatedAt: string | null;
  identityJoinStatus?: string;
  caveat?: string;
  limitations?: string[];
  publicUse: null | {
    rawRecords: number;
    usStateRecords: number;
    counts: {
      privateForProfit: number;
      adult: number;
      residential: number;
      preliminaryPrivateAdultResidential: number;
      preliminaryCoreCandidates: number;
    };
  };
  directory: null | {
    counts: { total: number; include: number; review: number; exclude: number };
  };
  states: string[];
}

export interface AcquisitionFacilitySearchResult {
  id: string;
  name: string;
  secondaryName: string;
  address: { street1: string; street2: string; city: string; stateCode: string; zip: string };
  phone: string;
  website: string;
  typeFacilities: string[];
  tags: string[];
  disposition: "include" | "review" | "exclude";
  reasons: string[];
  verificationStatus: "directory_discovery_only";
  licenseMatchStatus: "pending";
  ownershipResolutionStatus: "unresolved";
  evidence: {
    operation: string[];
    setting: string[];
    ages: string[];
    typeOfCare: string[];
    specialPrograms: string[];
    facilityType: string[];
    license: string[];
  };
}

export interface AcquisitionFacilitySearchResponse {
  available: boolean;
  matched: number;
  results: AcquisitionFacilitySearchResult[];
}

export interface AcquisitionOverview {
  version: string;
  source: string;
  visibility: "owner_only";
  datasetStatus: "discovery_seed_only";
  scope: {
    ownership: string;
    population: string;
    geography: string;
    excluded: string[];
  };
  counts: {
    discoveryLeads: number;
    verifiedFacilities: number;
    verifiedPrivateOperators: number;
    rankedOperators: number;
  };
  formulas: {
    baseBeds: string;
    revenue: string;
    ebitda: string;
    enterpriseValue: string;
  };
  segments: AcquisitionSegment[];
  workflow: AcquisitionWorkflowStage[];
  leads: AcquisitionLead[];
  sourceNotes: string[];
  nationalDiscovery: AcquisitionNationalDiscoverySummary;
}

export interface AcquisitionValuationRequest {
  operatorId: string | null;
  segmentId: string;
  bedsLow: number;
  bedsHigh: number;
  assumptions: AcquisitionAssumptions;
}

export interface AcquisitionValuationCase {
  beds: number;
  occupancy: number;
  netRevenuePerOccupiedBedDay: number;
  ebitdaMargin: number;
  ebitdaMultiple: number;
  revenueMillions: number;
  ebitdaMillions: number;
  enterpriseValueMillions: number;
}

export interface AcquisitionValuationResponse {
  version: string;
  modelVersion: string;
  status: "illustrative_screening_only";
  operatorId: string | null;
  segment: Pick<AcquisitionSegment, "id" | "label" | "workbookBasis">;
  assumptions: AcquisitionAssumptions;
  outputs: Record<AcquisitionCaseName, AcquisitionValuationCase>;
  formulas: AcquisitionOverview["formulas"];
  limitations: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalid(label: string): never {
  throw new Error(`The acquisition service returned invalid ${label}.`);
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) invalid(label);
  return value;
}

function requireNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(label);
  return value;
}

function requireNullableNumber(value: unknown, label: string) {
  if (value === null) return null;
  return requireNumber(value, label);
}

function requireStringList(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) invalid(label);
  return value as string[];
}

function requireCaseValues(value: unknown, label: string): AcquisitionCaseValues {
  if (!isRecord(value)) invalid(label);
  return {
    low: requireNumber(value.low, `${label}.low`),
    base: requireNumber(value.base, `${label}.base`),
    high: requireNumber(value.high, `${label}.high`)
  };
}

function requireAssumptions(value: unknown, label: string): AcquisitionAssumptions {
  if (!isRecord(value)) invalid(label);
  return {
    occupancy: requireCaseValues(value.occupancy, `${label}.occupancy`),
    netRevenuePerOccupiedBedDay: requireCaseValues(
      value.netRevenuePerOccupiedBedDay,
      `${label}.netRevenuePerOccupiedBedDay`
    ),
    ebitdaMargin: requireCaseValues(value.ebitdaMargin, `${label}.ebitdaMargin`),
    ebitdaMultiple: requireCaseValues(value.ebitdaMultiple, `${label}.ebitdaMultiple`)
  };
}

function requireBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") invalid(label);
  return value;
}

function validateNationalDiscovery(value: unknown): AcquisitionNationalDiscoverySummary {
  if (!isRecord(value)) invalid("nationalDiscovery");
  const available = requireBoolean(value.available, "nationalDiscovery.available");
  const status = requireString(value.status, "nationalDiscovery.status");
  if (!available) {
    if (status !== "not_refreshed") invalid("nationalDiscovery.status");
    return {
      available: false,
      status,
      persistence: value.persistence === "azure_blob" ? "azure_blob" : "local_file_store",
      datasetYear: null,
      generatedAt: null,
      publicUse: null,
      directory: null,
      states: requireStringList(value.states, "nationalDiscovery.states")
    };
  }
  if (status !== "discovery_only" || !isRecord(value.publicUse) || !isRecord(value.publicUse.counts) ||
    !isRecord(value.directory) || !isRecord(value.directory.counts)) invalid("nationalDiscovery");
  const counts = value.publicUse.counts;
  const directoryCounts = value.directory.counts;
  return {
    available: true,
    status,
    persistence: value.persistence === "azure_blob" ? "azure_blob" : "local_file_store",
    datasetYear: requireNumber(value.datasetYear, "nationalDiscovery.datasetYear"),
    generatedAt: requireString(value.generatedAt, "nationalDiscovery.generatedAt"),
    identityJoinStatus: requireString(value.identityJoinStatus, "nationalDiscovery.identityJoinStatus"),
    caveat: requireString(value.caveat, "nationalDiscovery.caveat"),
    limitations: requireStringList(value.limitations, "nationalDiscovery.limitations"),
    publicUse: {
      rawRecords: requireNumber(value.publicUse.rawRecords, "nationalDiscovery.publicUse.rawRecords"),
      usStateRecords: requireNumber(value.publicUse.usStateRecords, "nationalDiscovery.publicUse.usStateRecords"),
      counts: {
        privateForProfit: requireNumber(counts.privateForProfit, "nationalDiscovery.counts.privateForProfit"),
        adult: requireNumber(counts.adult, "nationalDiscovery.counts.adult"),
        residential: requireNumber(counts.residential, "nationalDiscovery.counts.residential"),
        preliminaryPrivateAdultResidential: requireNumber(
          counts.preliminaryPrivateAdultResidential,
          "nationalDiscovery.counts.preliminaryPrivateAdultResidential"
        ),
        preliminaryCoreCandidates: requireNumber(
          counts.preliminaryCoreCandidates,
          "nationalDiscovery.counts.preliminaryCoreCandidates"
        )
      }
    },
    directory: {
      counts: {
        total: requireNumber(directoryCounts.total, "nationalDiscovery.directory.total"),
        include: requireNumber(directoryCounts.include, "nationalDiscovery.directory.include"),
        review: requireNumber(directoryCounts.review, "nationalDiscovery.directory.review"),
        exclude: requireNumber(directoryCounts.exclude, "nationalDiscovery.directory.exclude")
      }
    },
    states: requireStringList(value.states, "nationalDiscovery.states")
  };
}

function validateOverview(value: unknown): AcquisitionOverview {
  if (!isRecord(value)) invalid("overview");
  if (!isRecord(value.scope) || !isRecord(value.counts) || !isRecord(value.formulas)) invalid("overview");
  if (!Array.isArray(value.segments) || !Array.isArray(value.workflow) || !Array.isArray(value.leads)) invalid("overview collections");
  const visibility = requireString(value.visibility, "visibility");
  const datasetStatus = requireString(value.datasetStatus, "datasetStatus");
  if (visibility !== "owner_only") invalid("visibility");
  if (datasetStatus !== "discovery_seed_only") invalid("datasetStatus");

  const segments = value.segments.map((entry, index) => {
    if (!isRecord(entry)) invalid(`segments[${index}]`);
    return {
      id: requireString(entry.id, `segments[${index}].id`),
      label: requireString(entry.label, `segments[${index}].label`),
      workbookBasis: requireString(entry.workbookBasis, `segments[${index}].workbookBasis`),
      assumptions: requireAssumptions(entry.assumptions, `segments[${index}].assumptions`)
    };
  });
  const workflow = value.workflow.map((entry, index) => {
    if (!isRecord(entry)) invalid(`workflow[${index}]`);
    return {
      id: requireString(entry.id, `workflow[${index}].id`),
      label: requireString(entry.label, `workflow[${index}].label`),
      status: requireString(entry.status, `workflow[${index}].status`),
      description: requireString(entry.description, `workflow[${index}].description`)
    };
  });
  const leads = value.leads.map((entry, index) => {
    if (!isRecord(entry)) invalid(`leads[${index}]`);
    const stateFootprintConfidence = requireString(entry.stateFootprintConfidence, `leads[${index}].stateFootprintConfidence`);
    const researchPriority = requireString(entry.researchPriority, `leads[${index}].researchPriority`);
    const candidateDisposition = requireString(entry.candidateDisposition, `leads[${index}].candidateDisposition`);
    const verificationStatus = requireString(entry.verificationStatus, `leads[${index}].verificationStatus`);
    if (!isRecord(entry.estimatedBeds) || !isRecord(entry.workbookIndicativeValue) ||
      !isRecord(entry.estimatedEnterpriseValue) || !Array.isArray(entry.sources)) invalid(`leads[${index}].screeningProfile`);
    const bedConfidence = requireString(entry.estimatedBeds.confidence, `leads[${index}].estimatedBeds.confidence`);
    const bedSourceType = requireString(entry.estimatedBeds.sourceType, `leads[${index}].estimatedBeds.sourceType`);
    const valueConfidence = requireString(entry.estimatedEnterpriseValue.confidence, `leads[${index}].estimatedEnterpriseValue.confidence`);
    if (!["low", "medium", "high"].includes(stateFootprintConfidence)) invalid(`leads[${index}].stateFootprintConfidence`);
    if (!["low", "medium", "high", "very_high"].includes(researchPriority)) invalid(`leads[${index}].researchPriority`);
    if (!["review", "hold"].includes(candidateDisposition)) invalid(`leads[${index}].candidateDisposition`);
    if (verificationStatus !== "discovery_only") invalid(`leads[${index}].verificationStatus`);
    if (!["low", "medium", "high"].includes(bedConfidence)) invalid(`leads[${index}].estimatedBeds.confidence`);
    if (!["reported", "estimated"].includes(bedSourceType)) invalid(`leads[${index}].estimatedBeds.sourceType`);
    if (!["low", "medium", "high"].includes(valueConfidence)) invalid(`leads[${index}].estimatedEnterpriseValue.confidence`);
    return {
      id: requireString(entry.id, `leads[${index}].id`),
      name: requireString(entry.name, `leads[${index}].name`),
      stateCodes: requireStringList(entry.stateCodes, `leads[${index}].stateCodes`),
      stateFootprintConfidence: stateFootprintConfidence as AcquisitionLead["stateFootprintConfidence"],
      relevance: requireString(entry.relevance, `leads[${index}].relevance`),
      researchPriority: researchPriority as AcquisitionLead["researchPriority"],
      candidateDisposition: candidateDisposition as AcquisitionLead["candidateDisposition"],
      verificationStatus: verificationStatus as AcquisitionLead["verificationStatus"],
      nextEvidenceTask: requireString(entry.nextEvidenceTask, `leads[${index}].nextEvidenceTask`),
      segmentId: requireString(entry.segmentId, `leads[${index}].segmentId`),
      segmentLabel: requireString(entry.segmentLabel, `leads[${index}].segmentLabel`),
      reportedScale: requireString(entry.reportedScale, `leads[${index}].reportedScale`),
      reportedSiteCount: requireNullableNumber(entry.reportedSiteCount, `leads[${index}].reportedSiteCount`),
      estimatedBeds: {
        low: requireNumber(entry.estimatedBeds.low, `leads[${index}].estimatedBeds.low`),
        high: requireNumber(entry.estimatedBeds.high, `leads[${index}].estimatedBeds.high`),
        confidence: bedConfidence as AcquisitionLead["estimatedBeds"]["confidence"],
        sourceType: bedSourceType as AcquisitionLead["estimatedBeds"]["sourceType"],
        basis: requireString(entry.estimatedBeds.basis, `leads[${index}].estimatedBeds.basis`)
      },
      workbookIndicativeValue: {
        low: requireNumber(entry.workbookIndicativeValue.low, `leads[${index}].workbookIndicativeValue.low`),
        high: requireNumber(entry.workbookIndicativeValue.high, `leads[${index}].workbookIndicativeValue.high`)
      },
      estimatedEnterpriseValue: {
        low: requireNumber(entry.estimatedEnterpriseValue.low, `leads[${index}].estimatedEnterpriseValue.low`),
        base: requireNumber(entry.estimatedEnterpriseValue.base, `leads[${index}].estimatedEnterpriseValue.base`),
        high: requireNumber(entry.estimatedEnterpriseValue.high, `leads[${index}].estimatedEnterpriseValue.high`),
        confidence: valueConfidence as AcquisitionLead["estimatedEnterpriseValue"]["confidence"],
        modelVersion: requireString(entry.estimatedEnterpriseValue.modelVersion, `leads[${index}].estimatedEnterpriseValue.modelVersion`)
      },
      sources: entry.sources.map((source, sourceIndex) => {
        if (!isRecord(source)) invalid(`leads[${index}].sources[${sourceIndex}]`);
        return {
          label: requireString(source.label, `leads[${index}].sources[${sourceIndex}].label`),
          url: requireString(source.url, `leads[${index}].sources[${sourceIndex}].url`),
          asOf: requireString(source.asOf, `leads[${index}].sources[${sourceIndex}].asOf`)
        };
      })
    };
  });

  return {
    version: requireString(value.version, "version"),
    source: requireString(value.source, "source"),
    visibility,
    datasetStatus,
    scope: {
      ownership: requireString(value.scope.ownership, "scope.ownership"),
      population: requireString(value.scope.population, "scope.population"),
      geography: requireString(value.scope.geography, "scope.geography"),
      excluded: requireStringList(value.scope.excluded, "scope.excluded")
    },
    counts: {
      discoveryLeads: requireNumber(value.counts.discoveryLeads, "counts.discoveryLeads"),
      verifiedFacilities: requireNumber(value.counts.verifiedFacilities, "counts.verifiedFacilities"),
      verifiedPrivateOperators: requireNumber(value.counts.verifiedPrivateOperators, "counts.verifiedPrivateOperators"),
      rankedOperators: requireNumber(value.counts.rankedOperators, "counts.rankedOperators")
    },
    formulas: {
      baseBeds: requireString(value.formulas.baseBeds, "formulas.baseBeds"),
      revenue: requireString(value.formulas.revenue, "formulas.revenue"),
      ebitda: requireString(value.formulas.ebitda, "formulas.ebitda"),
      enterpriseValue: requireString(value.formulas.enterpriseValue, "formulas.enterpriseValue")
    },
    segments,
    workflow,
    leads,
    sourceNotes: requireStringList(value.sourceNotes, "sourceNotes"),
    nationalDiscovery: validateNationalDiscovery(value.nationalDiscovery)
  };
}

function validateFacilitySearch(value: unknown): AcquisitionFacilitySearchResponse {
  if (!isRecord(value) || !Array.isArray(value.results)) invalid("facility search");
  return {
    available: requireBoolean(value.available, "facility search availability"),
    matched: requireNumber(value.matched, "facility search matched count"),
    results: value.results.map((entry, index) => {
      if (!isRecord(entry) || !isRecord(entry.address) || !isRecord(entry.evidence)) {
        invalid(`facility search results[${index}]`);
      }
      const disposition = requireString(entry.disposition, `results[${index}].disposition`);
      if (!(["include", "review", "exclude"] as string[]).includes(disposition)) invalid(`results[${index}].disposition`);
      const verificationStatus = requireString(entry.verificationStatus, `results[${index}].verificationStatus`);
      const licenseMatchStatus = requireString(entry.licenseMatchStatus, `results[${index}].licenseMatchStatus`);
      const ownershipResolutionStatus = requireString(
        entry.ownershipResolutionStatus,
        `results[${index}].ownershipResolutionStatus`
      );
      if (verificationStatus !== "directory_discovery_only" || licenseMatchStatus !== "pending" ||
        ownershipResolutionStatus !== "unresolved") invalid(`results[${index}].workflow status`);
      return {
        id: requireString(entry.id, `results[${index}].id`),
        name: requireString(entry.name, `results[${index}].name`),
        secondaryName: typeof entry.secondaryName === "string" ? entry.secondaryName : "",
        address: {
          street1: typeof entry.address.street1 === "string" ? entry.address.street1 : "",
          street2: typeof entry.address.street2 === "string" ? entry.address.street2 : "",
          city: typeof entry.address.city === "string" ? entry.address.city : "",
          stateCode: requireString(entry.address.stateCode, `results[${index}].stateCode`),
          zip: typeof entry.address.zip === "string" ? entry.address.zip : ""
        },
        phone: typeof entry.phone === "string" ? entry.phone : "",
        website: typeof entry.website === "string" ? entry.website : "",
        typeFacilities: requireStringList(entry.typeFacilities, `results[${index}].typeFacilities`),
        tags: requireStringList(entry.tags, `results[${index}].tags`),
        disposition: disposition as AcquisitionFacilitySearchResult["disposition"],
        reasons: requireStringList(entry.reasons, `results[${index}].reasons`),
        verificationStatus,
        licenseMatchStatus,
        ownershipResolutionStatus,
        evidence: {
          operation: requireStringList(entry.evidence.operation, `results[${index}].evidence.operation`),
          setting: requireStringList(entry.evidence.setting, `results[${index}].evidence.setting`),
          ages: requireStringList(entry.evidence.ages, `results[${index}].evidence.ages`),
          typeOfCare: requireStringList(entry.evidence.typeOfCare, `results[${index}].evidence.typeOfCare`),
          specialPrograms: requireStringList(entry.evidence.specialPrograms, `results[${index}].evidence.specialPrograms`),
          facilityType: requireStringList(entry.evidence.facilityType, `results[${index}].evidence.facilityType`),
          license: requireStringList(entry.evidence.license, `results[${index}].evidence.license`)
        }
      } as AcquisitionFacilitySearchResult;
    })
  };
}

function validateValuation(value: unknown): AcquisitionValuationResponse {
  if (!isRecord(value) || !isRecord(value.segment) || !isRecord(value.outputs) || !isRecord(value.formulas)) invalid("valuation");
  const status = requireString(value.status, "valuation.status");
  if (status !== "illustrative_screening_only") invalid("valuation.status");
  const outputRows = value.outputs;
  const outputs = Object.fromEntries((["low", "base", "high"] as const).map((caseName) => {
    const row = outputRows[caseName];
    if (!isRecord(row)) invalid(`valuation.outputs.${caseName}`);
    return [caseName, {
      beds: requireNumber(row.beds, `${caseName}.beds`),
      occupancy: requireNumber(row.occupancy, `${caseName}.occupancy`),
      netRevenuePerOccupiedBedDay: requireNumber(row.netRevenuePerOccupiedBedDay, `${caseName}.netRevenuePerOccupiedBedDay`),
      ebitdaMargin: requireNumber(row.ebitdaMargin, `${caseName}.ebitdaMargin`),
      ebitdaMultiple: requireNumber(row.ebitdaMultiple, `${caseName}.ebitdaMultiple`),
      revenueMillions: requireNumber(row.revenueMillions, `${caseName}.revenueMillions`),
      ebitdaMillions: requireNumber(row.ebitdaMillions, `${caseName}.ebitdaMillions`),
      enterpriseValueMillions: requireNumber(row.enterpriseValueMillions, `${caseName}.enterpriseValueMillions`)
    }];
  })) as AcquisitionValuationResponse["outputs"];
  return {
    version: requireString(value.version, "valuation.version"),
    modelVersion: requireString(value.modelVersion, "valuation.modelVersion"),
    status,
    operatorId: value.operatorId === null ? null : requireString(value.operatorId, "valuation.operatorId"),
    segment: {
      id: requireString(value.segment.id, "valuation.segment.id"),
      label: requireString(value.segment.label, "valuation.segment.label"),
      workbookBasis: requireString(value.segment.workbookBasis, "valuation.segment.workbookBasis")
    },
    assumptions: requireAssumptions(value.assumptions, "valuation.assumptions"),
    outputs,
    formulas: {
      baseBeds: requireString(value.formulas.baseBeds, "valuation.formulas.baseBeds"),
      revenue: requireString(value.formulas.revenue, "valuation.formulas.revenue"),
      ebitda: requireString(value.formulas.ebitda, "valuation.formulas.ebitda"),
      enterpriseValue: requireString(value.formulas.enterpriseValue, "valuation.formulas.enterpriseValue")
    },
    limitations: requireStringList(value.limitations, "valuation.limitations")
  };
}

export async function fetchAcquisitionOverview(signal?: AbortSignal) {
  return fetchWithApiAuth<AcquisitionOverview | null>("/api/platform/acquisition", {
    cache: "no-store",
    ...(signal ? { signal } : {})
  }, {
    consume: async (response) => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("The acquisition workspace could not be loaded.");
      return validateOverview(await readBoundedJsonResponse<unknown>(response, 1_000_000));
    }
  });
}

export async function runAcquisitionValuation(request: AcquisitionValuationRequest, signal?: AbortSignal) {
  return fetchWithApiAuth<AcquisitionValuationResponse>("/api/platform/acquisition/valuation", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    ...(signal ? { signal } : {})
  }, {
    consume: async (response) => {
      if (!response.ok) throw new Error("The screening model could not be calculated.");
      return validateValuation(await readBoundedJsonResponse<unknown>(response, 250_000));
    }
  });
}

export async function searchAcquisitionFacilities(
  filters: { q?: string; state?: string; disposition?: "include" | "review" | "exclude" | "all" },
  signal?: AbortSignal
) {
  const search = new URLSearchParams();
  if (filters.q?.trim()) search.set("q", filters.q.trim());
  if (filters.state?.trim()) search.set("state", filters.state.trim());
  if (filters.disposition) search.set("disposition", filters.disposition);
  search.set("limit", "50");
  return fetchWithApiAuth<AcquisitionFacilitySearchResponse>(
    `/api/platform/acquisition/search?${search}`,
    { cache: "no-store", ...(signal ? { signal } : {}) },
    {
      consume: async (response) => {
        if (!response.ok) throw new Error("The facility discovery search could not be loaded.");
        return validateFacilitySearch(await readBoundedJsonResponse<unknown>(response, 1_000_000));
      }
    }
  );
}
