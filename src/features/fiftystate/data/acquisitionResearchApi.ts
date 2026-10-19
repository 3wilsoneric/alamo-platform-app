import {
  fetchWithApiAuth,
  readBoundedJsonResponse
} from "../../../shared/api/authenticatedFetch";

export type AcquisitionResearchQueue = "priority" | "ownership" | "license" | "scope" | "capacity" | "review" | "all";
export type AcquisitionResearchStatus = "new" | "researching" | "blocked" | "ready_for_review" | "verified" | "excluded";
export type AcquisitionResearchPriority = "normal" | "high" | "urgent";
export type AcquisitionScopeStatus = "pending" | "confirmed" | "excluded";
export type AcquisitionOwnershipStatus = "unresolved" | "proposed" | "verified";
export type AcquisitionLicenseStatus = "pending" | "matched" | "not_found" | "not_required";
export type AcquisitionEvidenceKind =
  | "ownership"
  | "license"
  | "capacity"
  | "adult_population"
  | "residential_setting"
  | "private_for_profit"
  | "other";

export interface AcquisitionResearchEvidence {
  id: string;
  caseId: string;
  kind: AcquisitionEvidenceKind;
  title: string;
  url: string | null;
  note: string;
  observedAt: string | null;
  createdAt: string;
  createdBy: string;
}

export interface AcquisitionResearchCase {
  id: string;
  facilityId: string;
  discoveryDisposition: "include" | "review";
  evidencePriorityScore: number;
  status: AcquisitionResearchStatus;
  priority: AcquisitionResearchPriority;
  assignee: string | null;
  notes: string;
  scope: {
    adult: AcquisitionScopeStatus;
    residential: AcquisitionScopeStatus;
    privateForProfit: AcquisitionScopeStatus;
  };
  ownership: {
    status: AcquisitionOwnershipStatus;
    operatorName: string | null;
    parentName: string | null;
    sourceUrl: string | null;
    verifiedAt: string | null;
  };
  license: {
    status: AcquisitionLicenseStatus;
    legalEntity: string | null;
    licenseNumber: string | null;
    licensedBeds: number | null;
    sourceUrl: string | null;
    verifiedAt: string | null;
  };
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  facility: {
    id: string;
    name: string;
    secondaryName: string;
    address: { street1: string; street2: string; city: string; stateCode: string; zip: string };
    website: string;
    disposition: "include" | "review";
    reasons: string[];
    tags: string[];
  };
  evidence: AcquisitionResearchEvidence[];
}

export interface AcquisitionOperatorProposal {
  id: string;
  label: string;
  status: "proposed_not_verified";
  basis: "shared_website_domain" | "shared_normalized_facility_name";
  confidence: "low" | "medium";
  facilityCount: number;
  stateCodes: string[];
  facilityIds: string[];
  examples: Array<{ facilityId: string; name: string; city: string; stateCode: string }>;
}

export interface AcquisitionResearchResponse {
  version: string;
  available: boolean;
  persistence: "local_file_store" | "azure_blob";
  verificationBoundary: string;
  query: { queue: AcquisitionResearchQueue; q: string; state: string; limit: number };
  summary: {
    revision: number;
    updatedAt: string;
    totalCases: number;
    activeCases: number;
    researching: number;
    readyForReview: number;
    verified: number;
    ownershipPending: number;
    licensePending: number;
    capacityPending: number;
    scopePending: number;
    evidenceRecords: number;
    proposedOperatorClusters: number;
    evidencePriorityCases: number;
  };
  matched: number;
  cases: AcquisitionResearchCase[];
  operatorProposals: AcquisitionOperatorProposal[];
}

export interface AcquisitionResearchCaseUpdate {
  status: AcquisitionResearchStatus;
  priority: AcquisitionResearchPriority;
  assignee: string | null;
  notes: string;
  scope: AcquisitionResearchCase["scope"];
  ownership: Omit<AcquisitionResearchCase["ownership"], "verifiedAt">;
  license: Omit<AcquisitionResearchCase["license"], "verifiedAt">;
}

export interface AcquisitionEvidenceInput {
  kind: AcquisitionEvidenceKind;
  title: string;
  url: string | null;
  note: string;
  observedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalid(label: string): never {
  throw new Error(`The acquisition research service returned invalid ${label}.`);
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== "string") invalid(label);
  return value;
}

function nullableString(value: unknown, label: string) {
  if (value === null) return null;
  return stringValue(value, label);
}

function numberValue(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(label);
  return value;
}

function stringList(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) invalid(label);
  return value as string[];
}

function enumString<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  const normalized = stringValue(value, label);
  if (!allowed.includes(normalized as T)) invalid(label);
  return normalized as T;
}

function validateEvidence(value: unknown, label: string): AcquisitionResearchEvidence {
  if (!isRecord(value)) invalid(label);
  return {
    id: stringValue(value.id, `${label}.id`),
    caseId: stringValue(value.caseId, `${label}.caseId`),
    kind: enumString(value.kind, [
      "ownership", "license", "capacity", "adult_population", "residential_setting", "private_for_profit", "other"
    ], `${label}.kind`),
    title: stringValue(value.title, `${label}.title`),
    url: nullableString(value.url, `${label}.url`),
    note: stringValue(value.note, `${label}.note`),
    observedAt: nullableString(value.observedAt, `${label}.observedAt`),
    createdAt: stringValue(value.createdAt, `${label}.createdAt`),
    createdBy: stringValue(value.createdBy, `${label}.createdBy`)
  };
}

function validateCase(value: unknown, label: string): AcquisitionResearchCase {
  if (!isRecord(value) || !isRecord(value.scope) || !isRecord(value.ownership) || !isRecord(value.license) ||
    !isRecord(value.facility) || !isRecord(value.facility.address) || !Array.isArray(value.evidence)) invalid(label);
  const beds = value.license.licensedBeds;
  if (beds !== null && (typeof beds !== "number" || !Number.isFinite(beds))) invalid(`${label}.license.licensedBeds`);
  return {
    id: stringValue(value.id, `${label}.id`),
    facilityId: stringValue(value.facilityId, `${label}.facilityId`),
    discoveryDisposition: enumString(value.discoveryDisposition, ["include", "review"], `${label}.discoveryDisposition`),
    evidencePriorityScore: numberValue(value.evidencePriorityScore, `${label}.evidencePriorityScore`),
    status: enumString(value.status, ["new", "researching", "blocked", "ready_for_review", "verified", "excluded"], `${label}.status`),
    priority: enumString(value.priority, ["normal", "high", "urgent"], `${label}.priority`),
    assignee: nullableString(value.assignee, `${label}.assignee`),
    notes: stringValue(value.notes, `${label}.notes`),
    scope: {
      adult: enumString(value.scope.adult, ["pending", "confirmed", "excluded"], `${label}.scope.adult`),
      residential: enumString(value.scope.residential, ["pending", "confirmed", "excluded"], `${label}.scope.residential`),
      privateForProfit: enumString(value.scope.privateForProfit, ["pending", "confirmed", "excluded"], `${label}.scope.privateForProfit`)
    },
    ownership: {
      status: enumString(value.ownership.status, ["unresolved", "proposed", "verified"], `${label}.ownership.status`),
      operatorName: nullableString(value.ownership.operatorName, `${label}.ownership.operatorName`),
      parentName: nullableString(value.ownership.parentName, `${label}.ownership.parentName`),
      sourceUrl: nullableString(value.ownership.sourceUrl, `${label}.ownership.sourceUrl`),
      verifiedAt: nullableString(value.ownership.verifiedAt, `${label}.ownership.verifiedAt`)
    },
    license: {
      status: enumString(value.license.status, ["pending", "matched", "not_found", "not_required"], `${label}.license.status`),
      legalEntity: nullableString(value.license.legalEntity, `${label}.license.legalEntity`),
      licenseNumber: nullableString(value.license.licenseNumber, `${label}.license.licenseNumber`),
      licensedBeds: beds as number | null,
      sourceUrl: nullableString(value.license.sourceUrl, `${label}.license.sourceUrl`),
      verifiedAt: nullableString(value.license.verifiedAt, `${label}.license.verifiedAt`)
    },
    createdAt: stringValue(value.createdAt, `${label}.createdAt`),
    updatedAt: stringValue(value.updatedAt, `${label}.updatedAt`),
    updatedBy: stringValue(value.updatedBy, `${label}.updatedBy`),
    facility: {
      id: stringValue(value.facility.id, `${label}.facility.id`),
      name: stringValue(value.facility.name, `${label}.facility.name`),
      secondaryName: stringValue(value.facility.secondaryName, `${label}.facility.secondaryName`),
      address: {
        street1: stringValue(value.facility.address.street1, `${label}.facility.address.street1`),
        street2: stringValue(value.facility.address.street2, `${label}.facility.address.street2`),
        city: stringValue(value.facility.address.city, `${label}.facility.address.city`),
        stateCode: stringValue(value.facility.address.stateCode, `${label}.facility.address.stateCode`),
        zip: stringValue(value.facility.address.zip, `${label}.facility.address.zip`)
      },
      website: stringValue(value.facility.website, `${label}.facility.website`),
      disposition: enumString(value.facility.disposition, ["include", "review"], `${label}.facility.disposition`),
      reasons: stringList(value.facility.reasons, `${label}.facility.reasons`),
      tags: stringList(value.facility.tags, `${label}.facility.tags`)
    },
    evidence: value.evidence.map((entry, index) => validateEvidence(entry, `${label}.evidence[${index}]`))
  };
}

function validateResearchResponse(value: unknown): AcquisitionResearchResponse {
  if (!isRecord(value) || !isRecord(value.query) || !isRecord(value.summary) || !Array.isArray(value.cases) ||
    !Array.isArray(value.operatorProposals)) invalid("response");
  const summaryRecord = value.summary;
  const summaryKeys = [
    "revision", "totalCases", "activeCases", "researching", "readyForReview", "verified", "ownershipPending",
    "licensePending", "capacityPending", "scopePending", "evidenceRecords", "proposedOperatorClusters", "evidencePriorityCases"
  ] as const;
  const summary = Object.fromEntries(summaryKeys.map((key) => [key, numberValue(summaryRecord[key], `summary.${key}`)]));
  return {
    version: stringValue(value.version, "version"),
    available: value.available === true,
    persistence: enumString(value.persistence, ["local_file_store", "azure_blob"], "persistence"),
    verificationBoundary: stringValue(value.verificationBoundary, "verificationBoundary"),
    query: {
      queue: enumString(value.query.queue, ["priority", "ownership", "license", "scope", "capacity", "review", "all"], "query.queue"),
      q: stringValue(value.query.q, "query.q"),
      state: stringValue(value.query.state, "query.state"),
      limit: numberValue(value.query.limit, "query.limit")
    },
    summary: {
      ...summary,
      updatedAt: stringValue(summaryRecord.updatedAt, "summary.updatedAt")
    } as AcquisitionResearchResponse["summary"],
    matched: numberValue(value.matched, "matched"),
    cases: value.cases.map((entry, index) => validateCase(entry, `cases[${index}]`)),
    operatorProposals: value.operatorProposals.map((entry, index) => {
      if (!isRecord(entry) || !Array.isArray(entry.examples)) invalid(`operatorProposals[${index}]`);
      return {
        id: stringValue(entry.id, `operatorProposals[${index}].id`),
        label: stringValue(entry.label, `operatorProposals[${index}].label`),
        status: enumString(entry.status, ["proposed_not_verified"], `operatorProposals[${index}].status`),
        basis: enumString(entry.basis, ["shared_website_domain", "shared_normalized_facility_name"], `operatorProposals[${index}].basis`),
        confidence: enumString(entry.confidence, ["low", "medium"], `operatorProposals[${index}].confidence`),
        facilityCount: numberValue(entry.facilityCount, `operatorProposals[${index}].facilityCount`),
        stateCodes: stringList(entry.stateCodes, `operatorProposals[${index}].stateCodes`),
        facilityIds: stringList(entry.facilityIds, `operatorProposals[${index}].facilityIds`),
        examples: entry.examples.map((example, exampleIndex) => {
          if (!isRecord(example)) invalid(`operatorProposals[${index}].examples[${exampleIndex}]`);
          return {
            facilityId: stringValue(example.facilityId, "proposal example facilityId"),
            name: stringValue(example.name, "proposal example name"),
            city: stringValue(example.city, "proposal example city"),
            stateCode: stringValue(example.stateCode, "proposal example stateCode")
          };
        })
      } as AcquisitionOperatorProposal;
    })
  };
}

async function mutateResearch(body: unknown, signal?: AbortSignal) {
  return fetchWithApiAuth<{ ok: true }>("/api/platform/acquisition/research", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {})
  }, {
    consume: async (response) => {
      const payload = await readBoundedJsonResponse<unknown>(response, 250_000);
      if (!response.ok || !isRecord(payload) || payload.ok !== true) throw new Error("The research record could not be updated.");
      return { ok: true };
    }
  });
}

export async function fetchAcquisitionResearch(
  filters: { queue: AcquisitionResearchQueue; q?: string; state?: string },
  signal?: AbortSignal
) {
  const search = new URLSearchParams({ queue: filters.queue, limit: "30" });
  if (filters.q?.trim()) search.set("q", filters.q.trim());
  if (filters.state?.trim()) search.set("state", filters.state.trim());
  return fetchWithApiAuth<AcquisitionResearchResponse>(`/api/platform/acquisition/research?${search}`, {
    cache: "no-store",
    ...(signal ? { signal } : {})
  }, {
    consume: async (response) => {
      if (!response.ok) throw new Error("The research workflow could not be loaded.");
      return validateResearchResponse(await readBoundedJsonResponse<unknown>(response, 2_000_000));
    }
  });
}

export function saveAcquisitionResearchCase(
  facilityId: string,
  record: AcquisitionResearchCaseUpdate,
  signal?: AbortSignal
) {
  return mutateResearch({ action: "update_case", facilityId, case: record }, signal);
}

export function addAcquisitionResearchEvidence(
  facilityId: string,
  evidence: AcquisitionEvidenceInput,
  signal?: AbortSignal
) {
  return mutateResearch({ action: "add_evidence", facilityId, evidence }, signal);
}
