import { createHash } from "node:crypto";
import { createHttpError } from "./http-errors.mjs";
import { listNationalFacilityCandidates } from "./acquisition-intelligence-store.mjs";
import { acquisitionResearchStore } from "./acquisition-research-store.mjs";

export const ACQUISITION_RESEARCH_VERSION = "1.0";

const VALID_QUEUES = new Set(["priority", "ownership", "license", "scope", "capacity", "review", "all"]);
const VALID_CASE_STATUSES = new Set(["new", "researching", "blocked", "ready_for_review", "verified", "excluded"]);
const VALID_PRIORITIES = new Set(["normal", "high", "urgent"]);
const VALID_SCOPE_STATUSES = new Set(["pending", "confirmed", "excluded"]);
const VALID_OWNERSHIP_STATUSES = new Set(["unresolved", "proposed", "verified"]);
const VALID_LICENSE_STATUSES = new Set(["pending", "matched", "not_found", "not_required"]);
const VALID_EVIDENCE_KINDS = new Set([
  "ownership",
  "license",
  "capacity",
  "adult_population",
  "residential_setting",
  "private_for_profit",
  "other"
]);
const GENERIC_DOMAINS = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "sites.google.com",
  "business.site",
  "findtreatment.gov"
]);

function invalid(message) {
  return createHttpError(400, "acquisition_research_invalid", message);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value, field, { required = false, maximum = 5_000 } = {}) {
  if (value == null) return required ? (() => { throw invalid(`${field} is required.`); })() : null;
  if (typeof value !== "string") throw invalid(`${field} must be text.`);
  const normalized = value.trim();
  if (required && !normalized) throw invalid(`${field} is required.`);
  if (normalized.length > maximum) throw invalid(`${field} is too long.`);
  return normalized || null;
}

function enumValue(value, allowed, field) {
  if (typeof value !== "string" || !allowed.has(value)) throw invalid(`${field} is not supported.`);
  return value;
}

function optionalHttpsUrl(value, field) {
  const normalized = boundedString(value, field, { maximum: 2_000 });
  if (!normalized) return null;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw invalid(`${field} must be a valid HTTPS URL.`);
  }
  if (parsed.protocol !== "https:") throw invalid(`${field} must use HTTPS.`);
  return parsed.toString();
}

function optionalDate(value, field) {
  const normalized = boundedString(value, field, { maximum: 10 });
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isFinite(Date.parse(`${normalized}T00:00:00Z`))) {
    throw invalid(`${field} must be a valid date.`);
  }
  return normalized;
}

function researchActor(authContext) {
  const claims = authContext?.claims ?? {};
  return String(claims.preferred_username ?? claims.email ?? claims.upn ?? claims.oid ?? "owner")
    .trim()
    .slice(0, 500) || "owner";
}

function scoreFacility(facility) {
  const tags = new Set(facility.tags);
  let score = facility.disposition === "include" ? 40 : 15;
  if (tags.has("high_acuity_smi_signal")) score += 20;
  if (tags.has("crisis_or_subacute_signal")) score += 15;
  if (tags.has("co_occurring_signal")) score += 10;
  if (tags.has("psychiatric_residential_signal")) score += 10;
  if (tags.has("private_for_profit_signal")) score += 5;
  return Math.min(100, score);
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(incorporated|corporation|company|limited|holdings|healthcare|health|services|service|inc|corp|co|llc|ltd)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function websiteDomain(value) {
  if (!value) return null;
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return hostname && !GENERIC_DOMAINS.has(hostname) ? hostname : null;
  } catch {
    return null;
  }
}

function stableId(prefix, value) {
  return `${prefix}-${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
}

function mostCommonName(facilities) {
  const counts = new Map();
  for (const facility of facilities) counts.set(facility.name, (counts.get(facility.name) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? "Unnamed proposal";
}

export function buildProposedOperatorClusters(facilities) {
  const assigned = new Set();
  const clusters = [];
  const domains = new Map();
  for (const facility of facilities) {
    const domain = websiteDomain(facility.website);
    if (!domain) continue;
    const items = domains.get(domain) ?? [];
    items.push(facility);
    domains.set(domain, items);
  }
  for (const [domain, items] of domains) {
    if (items.length < 2) continue;
    items.forEach((facility) => assigned.add(facility.id));
    clusters.push({ key: `domain:${domain}`, basis: "shared_website_domain", confidence: "medium", items });
  }

  const names = new Map();
  for (const facility of facilities) {
    if (assigned.has(facility.id)) continue;
    const name = normalizeName(facility.name);
    if (name.length < 5) continue;
    const items = names.get(name) ?? [];
    items.push(facility);
    names.set(name, items);
  }
  for (const [name, items] of names) {
    if (items.length < 2) continue;
    clusters.push({ key: `name:${name}`, basis: "shared_normalized_facility_name", confidence: "low", items });
  }

  return clusters
    .map((cluster) => ({
      id: stableId("proposal", cluster.key),
      label: mostCommonName(cluster.items),
      status: "proposed_not_verified",
      basis: cluster.basis,
      confidence: cluster.confidence,
      facilityCount: cluster.items.length,
      stateCodes: [...new Set(cluster.items.map((facility) => facility.address.stateCode))].sort(),
      facilityIds: cluster.items.slice(0, 25).map((facility) => facility.id),
      examples: cluster.items.slice(0, 3).map((facility) => ({
        facilityId: facility.id,
        name: facility.name,
        city: facility.address.city,
        stateCode: facility.address.stateCode
      }))
    }))
    .sort((left, right) => right.facilityCount - left.facilityCount || left.label.localeCompare(right.label));
}

function enrichCase(record, facility, evidence) {
  return {
    ...record,
    facility: {
      id: facility.id,
      name: facility.name,
      secondaryName: facility.secondaryName,
      address: facility.address,
      website: facility.website,
      disposition: facility.disposition,
      reasons: facility.reasons,
      tags: facility.tags
    },
    evidence: evidence
      .filter((item) => item.caseId === record.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 20)
  };
}

function isCaseInQueue(record, queue, priorityIds) {
  if (queue === "all") return true;
  if (record.status === "excluded") return false;
  if (queue === "priority") return priorityIds.has(record.facilityId);
  if (queue === "ownership") return record.ownership.status !== "verified";
  if (queue === "license") return record.license.status !== "matched";
  if (queue === "scope") return Object.values(record.scope).some((status) => status === "pending");
  if (queue === "capacity") return record.license.licensedBeds === null;
  if (queue === "review") return record.status === "ready_for_review";
  return false;
}

function matchesQuery(record, facility, query, stateCode) {
  if (stateCode && facility.address.stateCode !== stateCode) return false;
  if (!query) return true;
  return [
    facility.name,
    facility.secondaryName,
    facility.address.street1,
    facility.address.city,
    facility.address.stateCode,
    facility.website,
    record.notes,
    record.ownership.operatorName,
    record.ownership.parentName,
    record.license.legalEntity,
    record.license.licenseNumber
  ].filter(Boolean).join(" ").toLowerCase().includes(query);
}

function buildSummary(state, proposals, priorityIds) {
  const active = state.cases.filter((record) => record.status !== "excluded");
  return {
    revision: state.revision,
    updatedAt: state.updatedAt,
    totalCases: state.cases.length,
    activeCases: active.length,
    researching: active.filter((record) => record.status === "researching").length,
    readyForReview: active.filter((record) => record.status === "ready_for_review").length,
    verified: active.filter((record) => record.status === "verified").length,
    ownershipPending: active.filter((record) => record.ownership.status !== "verified").length,
    licensePending: active.filter((record) => record.license.status !== "matched").length,
    capacityPending: active.filter((record) => record.license.licensedBeds === null).length,
    scopePending: active.filter((record) => Object.values(record.scope).some((status) => status === "pending")).length,
    evidenceRecords: state.evidence.length,
    proposedOperatorClusters: proposals.length,
    evidencePriorityCases: priorityIds.size
  };
}

async function synchronizedResearchState(authContext) {
  const facilities = (await listNationalFacilityCandidates()).map((facility) => ({
    ...facility,
    evidencePriorityScore: scoreFacility(facility)
  }));
  const synchronized = await acquisitionResearchStore.synchronizeFacilities(facilities, researchActor(authContext));
  return { facilities, state: synchronized.state };
}

export async function getAcquisitionResearchResponse(requestUrl, authContext) {
  const { facilities, state } = await synchronizedResearchState(authContext);
  const queue = String(requestUrl.searchParams.get("queue") || "priority").trim().toLowerCase();
  const query = String(requestUrl.searchParams.get("q") || "").trim().toLowerCase();
  const stateCode = String(requestUrl.searchParams.get("state") || "").trim().toUpperCase();
  const limit = Number(requestUrl.searchParams.get("limit") || 30);
  if (!VALID_QUEUES.has(queue)) throw invalid("queue is not supported.");
  if (query.length > 120) throw invalid("q must be 120 characters or fewer.");
  if (stateCode && !/^[A-Z]{2}$/.test(stateCode)) throw invalid("state must be a two-letter code.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw invalid("limit must be a whole number from 1 through 50.");

  const byFacilityId = new Map(facilities.map((facility) => [facility.id, facility]));
  const proposals = buildProposedOperatorClusters(facilities);
  const priorityIds = new Set(
    state.cases
      .filter((record) => record.status !== "excluded")
      .sort((left, right) => right.evidencePriorityScore - left.evidencePriorityScore || left.facilityId.localeCompare(right.facilityId))
      .slice(0, 25)
      .map((record) => record.facilityId)
  );
  const matches = state.cases
    .map((record) => ({ record, facility: byFacilityId.get(record.facilityId) }))
    .filter(({ facility }) => facility)
    .filter(({ record, facility }) => isCaseInQueue(record, queue, priorityIds) && matchesQuery(record, facility, query, stateCode))
    .sort((left, right) =>
      right.record.evidencePriorityScore - left.record.evidencePriorityScore ||
      right.record.updatedAt.localeCompare(left.record.updatedAt) ||
      left.facility.name.localeCompare(right.facility.name)
    );

  return {
    version: ACQUISITION_RESEARCH_VERSION,
    available: facilities.length > 0,
    persistence: acquisitionResearchStore.persistence,
    verificationBoundary: "Proposed clusters and discovery signals are not verified operator, license, capacity, or acquisition facts.",
    query: { queue, q: query, state: stateCode, limit },
    summary: buildSummary(state, proposals, priorityIds),
    matched: matches.length,
    cases: matches.slice(0, limit).map(({ record, facility }) => enrichCase(record, facility, state.evidence)),
    operatorProposals: proposals.slice(0, 25)
  };
}

function normalizeUpdateCase(value) {
  if (!isObject(value.case) || !isObject(value.case.scope) || !isObject(value.case.ownership) || !isObject(value.case.license)) {
    throw invalid("case must include scope, ownership, and license fields.");
  }
  const record = value.case;
  const ownershipStatus = enumValue(record.ownership.status, VALID_OWNERSHIP_STATUSES, "case.ownership.status");
  const operatorName = boundedString(record.ownership.operatorName, "case.ownership.operatorName", { maximum: 500 });
  const ownershipSourceUrl = optionalHttpsUrl(record.ownership.sourceUrl, "case.ownership.sourceUrl");
  if (ownershipStatus === "verified" && (!operatorName || !ownershipSourceUrl)) {
    throw invalid("Verified ownership requires an operator name and HTTPS source URL.");
  }
  const licenseStatus = enumValue(record.license.status, VALID_LICENSE_STATUSES, "case.license.status");
  const legalEntity = boundedString(record.license.legalEntity, "case.license.legalEntity", { maximum: 500 });
  const licenseNumber = boundedString(record.license.licenseNumber, "case.license.licenseNumber", { maximum: 200 });
  const licenseSourceUrl = optionalHttpsUrl(record.license.sourceUrl, "case.license.sourceUrl");
  if (licenseStatus === "matched" && (!legalEntity || !licenseNumber || !licenseSourceUrl)) {
    throw invalid("A matched license requires a legal entity, license number, and HTTPS source URL.");
  }
  const beds = record.license.licensedBeds === null || record.license.licensedBeds === ""
    ? null
    : Number(record.license.licensedBeds);
  if (beds !== null && (!Number.isInteger(beds) || beds <= 0 || beds > 100_000)) {
    throw invalid("case.license.licensedBeds must be a positive whole number.");
  }
  return {
    action: "update_case",
    facilityId: boundedString(value.facilityId, "facilityId", { required: true, maximum: 120 }),
    patch: {
      status: enumValue(record.status, VALID_CASE_STATUSES, "case.status"),
      priority: enumValue(record.priority, VALID_PRIORITIES, "case.priority"),
      assignee: boundedString(record.assignee, "case.assignee", { maximum: 200 }),
      notes: boundedString(record.notes, "case.notes", { maximum: 5_000 }) ?? "",
      scope: {
        adult: enumValue(record.scope.adult, VALID_SCOPE_STATUSES, "case.scope.adult"),
        residential: enumValue(record.scope.residential, VALID_SCOPE_STATUSES, "case.scope.residential"),
        privateForProfit: enumValue(
          record.scope.privateForProfit,
          VALID_SCOPE_STATUSES,
          "case.scope.privateForProfit"
        )
      },
      ownership: {
        status: ownershipStatus,
        operatorName,
        parentName: boundedString(record.ownership.parentName, "case.ownership.parentName", { maximum: 500 }),
        sourceUrl: ownershipSourceUrl,
        verifiedAt: ownershipStatus === "verified" ? new Date().toISOString() : null
      },
      license: {
        status: licenseStatus,
        legalEntity,
        licenseNumber,
        licensedBeds: beds,
        sourceUrl: licenseSourceUrl,
        verifiedAt: licenseStatus === "matched" ? new Date().toISOString() : null
      }
    }
  };
}

function normalizeAddEvidence(value) {
  if (!isObject(value.evidence)) throw invalid("evidence is required.");
  return {
    action: "add_evidence",
    facilityId: boundedString(value.facilityId, "facilityId", { required: true, maximum: 120 }),
    evidence: {
      kind: enumValue(value.evidence.kind, VALID_EVIDENCE_KINDS, "evidence.kind"),
      title: boundedString(value.evidence.title, "evidence.title", { required: true, maximum: 300 }),
      url: optionalHttpsUrl(value.evidence.url, "evidence.url"),
      note: boundedString(value.evidence.note, "evidence.note", { maximum: 2_000 }) ?? "",
      observedAt: optionalDate(value.evidence.observedAt, "evidence.observedAt")
    }
  };
}

export function validateAcquisitionResearchRequest(value) {
  if (!isObject(value)) throw invalid("Research request must be a JSON object.");
  if (value.action === "update_case") return normalizeUpdateCase(value);
  if (value.action === "add_evidence") return normalizeAddEvidence(value);
  throw invalid("Research action is not supported.");
}

export async function mutateAcquisitionResearch(input, authContext) {
  await synchronizedResearchState(authContext);
  try {
    if (input.action === "update_case") {
      const result = await acquisitionResearchStore.updateCase(input.facilityId, input.patch, researchActor(authContext));
      return { version: ACQUISITION_RESEARCH_VERSION, ok: true, action: input.action, record: result.value };
    }
    const result = await acquisitionResearchStore.addEvidence(input.facilityId, input.evidence, researchActor(authContext));
    return { version: ACQUISITION_RESEARCH_VERSION, ok: true, action: input.action, evidence: result.value };
  } catch (error) {
    throw invalid(error instanceof Error ? error.message : "The research record could not be updated.");
  }
}
