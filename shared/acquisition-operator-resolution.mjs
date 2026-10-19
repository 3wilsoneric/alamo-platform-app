import { createHash } from "node:crypto";
import {
  buildKnownCapacitySliceValuation,
  findAcquisitionValuationSegment
} from "./acquisition-valuation.mjs";

export const ACQUISITION_OPERATOR_INDEX_VERSION = 14;
export const ACQUISITION_EXCLUDED_STATE_CODES = Object.freeze(["CA"]);

export const ACQUISITION_SCREENING_CAPACITY_MODEL = Object.freeze({
  version: "nsumhss_2024_peer_capacity_v1",
  datasetYear: 2024,
  dataset: "N-SUMHSS public-use file",
  sourceFields: ["RCBEDS", "RESBED"],
  statisticBasis: "non_California_private_for_profit_adult_residential_site_percentiles",
  rangeDefinition: "p25_p50_p75_beds_per_candidate_site",
  siteProfiles: Object.freeze({
    coreSignal: Object.freeze({ sampleSize: 246, low: 8, base: 16, high: 34 }),
    adjacentSignal: Object.freeze({ sampleSize: 312, low: 11, base: 24, high: 45 }),
    unresolvedResidential: Object.freeze({ sampleSize: 432, low: 10, base: 20, high: 44 })
  }),
  scope: "partial_observable_site_proxy",
  limitations: Object.freeze([
    "The public-use bed records are anonymized and cannot be joined to the named facility directory.",
    "Organization ranges cover observable candidate residential sites only, not verified whole-company capacity.",
    "Licensed beds, operator-reported beds, and peer-derived ranges remain separate evidence classes.",
    "Screening ranges must not be used for valuation until site capacity and scope are verified."
  ])
});

const EXCLUDED_ACQUISITION_ELIGIBILITY = new Set([
  "excluded_out_of_scope",
  "excluded_public_company"
]);

const LICENSE_SCOPE_CLASSIFICATIONS = new Set([
  "core_target",
  "adjacent_high_acuity_sud",
  "other_or_unresolved"
]);

const LICENSE_STATUSES = new Set(["active", "pending", "expired", "suspended", "closed", "unknown"]);
const CAPACITY_EVIDENCE_BASES = new Set(["operator_reported"]);

const NON_OPERATOR_DOMAIN_SUFFIXES = new Set([
  "business.site",
  "facebook.com",
  "findtreatment.gov",
  "instagram.com",
  "linkedin.com",
  "linktr.ee",
  "psychologytoday.com",
  "rainierrehab.org",
  "recovered.org",
  "rehab.com",
  "sites.google.com",
  "twitter.com",
  "wixsite.com",
  "wordpress.com",
  "x.com",
  "yelp.com"
]);

const COMPANY_SUFFIXES = new Set([
  "co",
  "company",
  "corp",
  "corporation",
  "inc",
  "incorporated",
  "limited",
  "llc",
  "ltd",
  "pllc"
]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function stableId(prefix, value) {
  return `${prefix}-${createHash("sha256").update(String(value)).digest("hex").slice(0, 20)}`;
}

function serviceText(facility, ...codes) {
  return codes.flatMap((code) => facility.services?.[code] || []).join("; ").toLowerCase();
}

export function normalizeAcquisitionOrganizationName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((part) => part && !COMPANY_SUFFIXES.has(part))
    .join(" ")
    .trim();
}

export function acquisitionWebsiteDomain(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const isNonOperatorDomain = [...NON_OPERATOR_DOMAIN_SUFFIXES]
      .some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
    return hostname && !isNonOperatorDomain ? hostname : null;
  } catch {
    return null;
  }
}

export function scoreAcquisitionFacility(facility) {
  const operation = serviceText(facility, "FOP");
  const setting = serviceText(facility, "SET");
  const facilityType = serviceText(facility, "FT");
  const treatment = serviceText(facility, "TC");
  const populations = serviceText(facility, "SG");
  const ages = serviceText(facility, "AGE");
  const combined = [facility.name, facility.secondaryName, setting, facilityType, treatment, populations]
    .join(" ")
    .toLowerCase();

  const signals = [];
  const cautions = [];
  let score = 0;
  const privateForProfit = operation.includes("private for-profit") && !operation.includes("for-profit/non-profit");
  const residential = setting.includes("residential");
  const adult = /(^|; )adults(;|$)/.test(ages) || ages.includes("young adults") || ages.includes("seniors");
  const adultRtc = facilityType.includes("residential treatment center (rtc) for adults");
  const seriousMentalIllness = treatment.includes("serious mental illness") ||
    populations.includes("serious mental illness") || populations.includes("first-episode psychosis");
  const primaryMentalHealth = facility.typeFacilities?.includes("MH") === true;
  const mentalHealth = primaryMentalHealth || treatment.includes("mental health treatment");
  const crisis = combined.includes("crisis");
  const coOccurring = treatment.includes("co-occurring") || combined.includes("integrated mental");
  const youth = ages.includes("children") || ages.includes("adolescents");
  const youthOnly = youth && !adult;
  const nonprofit = /private non.?profit/.test(operation);
  const government = operation.includes("government") || operation.includes("department of veterans affairs");
  const soberOrTransitional = /sober (living|home)|transitional housing|halfway house/.test(combined);
  const eatingDisorder = /eating|anorexia|bulimia|monte nido|clementine/.test(
    `${facility.name ?? ""} ${facility.secondaryName ?? ""}`.toLowerCase()
  );
  const hospital = facilityType.includes("psychiatric hospital") || facilityType.includes("psychiatric unit");

  if (privateForProfit) {
    score += 20;
    signals.push("private_for_profit_directory_signal");
  }
  if (residential) {
    score += 15;
    signals.push("residential_signal");
  }
  if (adult) {
    score += 10;
    signals.push("adult_signal");
  }
  if (mentalHealth) {
    score += 10;
    signals.push("mental_health_signal");
  }
  if (primaryMentalHealth) signals.push("primary_mental_health_directory_signal");
  if (adultRtc) {
    score += 20;
    signals.push("adult_rtc_signal");
  }
  if (seriousMentalIllness) {
    score += 20;
    signals.push("serious_mental_illness_signal");
  }
  if (crisis) {
    score += 15;
    signals.push("crisis_or_subacute_signal");
  }
  if (coOccurring) {
    score += 5;
    signals.push("co_occurring_signal");
  }
  if (setting.includes("long-term residential")) {
    score += 5;
    signals.push("long_term_residential_signal");
  }
  if (hospital) cautions.push("hospital_context_requires_separable_residential_asset");
  if (youth && !seriousMentalIllness) cautions.push("youth_or_mixed_age_scope_risk");
  if (youthOnly) score -= 45;
  if (nonprofit || government) score -= 60;
  if (soberOrTransitional && !mentalHealth) {
    score -= 30;
    cautions.push("sober_or_transitional_only_risk");
  }
  if (eatingDisorder && !seriousMentalIllness && !crisis) {
    score -= 25;
    cautions.push("eating_disorder_only_risk");
  }
  if (!residential) score -= 25;

  const explicitHighAcuity = adultRtc || seriousMentalIllness || crisis;
  const candidate = facility.disposition === "include" || facility.disposition === "review";
  const fitCategory = candidate && privateForProfit && residential && adult && primaryMentalHealth && explicitHighAcuity
    ? "core_signal"
    : candidate && privateForProfit && residential && adult && (mentalHealth || coOccurring)
      ? "adjacent_signal"
      : "context_or_unresolved";

  return {
    score: clamp(Math.round(score), 0, 100),
    fitCategory,
    candidate,
    signals: [...new Set(signals)].sort(),
    cautions: [...new Set(cautions)].sort()
  };
}

function mostRepresentativeName(facilities) {
  const counts = new Map();
  for (const facility of facilities) {
    const name = String(facility.name ?? "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].length - right[0].length || left[0].localeCompare(right[0]))[0]?.[0] ??
    "Unresolved organization";
}

function organizationAliases(facilities) {
  return [...new Set(facilities.flatMap((facility) => [facility.name, facility.secondaryName]).map((value) => String(value ?? "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 25);
}

function organizationIdentityKeys({ key, domain, facilities, assertion, names }) {
  const domains = [
    domain,
    assertion?.primaryDomain,
    ...(assertion?.matchedDomains ?? []),
    ...facilities.map((facility) => acquisitionWebsiteDomain(facility.website))
  ].map(acquisitionWebsiteDomain).filter(Boolean);
  const normalizedNames = names
    .map(normalizeAcquisitionOrganizationName)
    .filter((name) => name.length >= 5);
  return [...new Set([
    `group:${key}`,
    ...(assertion?.id ? [`parent:${assertion.id}`] : []),
    ...domains.map((value) => `domain:${value}`),
    ...normalizedNames.map((value) => `name:${value}`)
  ])].sort((left, right) => left.localeCompare(right)).slice(0, 100);
}

function preparedParentAssertions(parentAssertions) {
  if (!Array.isArray(parentAssertions)) throw new Error("parentAssertions must be an array.");
  const ids = new Set();
  return parentAssertions.map((assertion, index) => {
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      throw new Error(`parentAssertions[${index}] must be an object.`);
    }
    const id = String(assertion.id ?? "").trim();
    const operatingParentName = String(assertion.operatingParentName ?? "").trim();
    const relationshipConfidence = String(assertion.confidence?.relationship ?? "").trim();
    if (!id || !operatingParentName) throw new Error(`parentAssertions[${index}] requires id and operatingParentName.`);
    if (ids.has(id)) throw new Error(`Duplicate parent assertion id: ${id}`);
    if (!["low", "medium", "high"].includes(relationshipConfidence)) {
      throw new Error(`parentAssertions[${index}] has an invalid relationship confidence.`);
    }
    if (assertion.valuationModel != null) {
      const segmentId = String(assertion.valuationModel?.segmentId ?? "").trim();
      if (!findAcquisitionValuationSegment(segmentId)) {
        throw new Error(`parentAssertions[${index}] has an invalid valuationModel.segmentId.`);
      }
    }
    ids.add(id);
    return {
      ...assertion,
      id,
      operatingParentName,
      matchedDomains: new Set((assertion.matchedDomains ?? []).map(acquisitionWebsiteDomain).filter(Boolean)),
      matchedNormalizedNames: new Set((assertion.matchedNormalizedNames ?? []).map(normalizeAcquisitionOrganizationName).filter(Boolean)),
      matchedNormalizedNamePrefixes: (assertion.matchedNormalizedNamePrefixes ?? [])
        .map(normalizeAcquisitionOrganizationName)
        .filter(Boolean)
    };
  });
}

function preparedLicenseSources(licenseSources) {
  if (!Array.isArray(licenseSources)) throw new Error("licenseSources must be an array.");
  const ids = new Set();
  return new Map(licenseSources.map((source, index) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error(`licenseSources[${index}] must be an object.`);
    }
    const id = String(source.id ?? "").trim();
    if (!id) throw new Error(`licenseSources[${index}] requires id.`);
    if (ids.has(id)) throw new Error(`Duplicate license source id: ${id}`);
    ids.add(id);
    return [id, { ...source, id }];
  }));
}

function preparedCapacitySources(capacitySources) {
  if (!Array.isArray(capacitySources)) throw new Error("capacitySources must be an array.");
  const ids = new Set();
  return new Map(capacitySources.map((source, index) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error(`capacitySources[${index}] must be an object.`);
    }
    const id = String(source.id ?? "").trim();
    const reportUrl = String(source.reportUrl ?? "").trim();
    if (!id || !reportUrl) throw new Error(`capacitySources[${index}] requires id and reportUrl.`);
    if (ids.has(id)) throw new Error(`Duplicate capacity source id: ${id}`);
    ids.add(id);
    return [id, { ...source, id, reportUrl }];
  }));
}

function preparedLicenseAssertions(licenseAssertions, parentAssertions, licenseSources, excludedStateCodes) {
  if (!Array.isArray(licenseAssertions)) throw new Error("licenseAssertions must be an array.");
  const parentIds = new Set(parentAssertions.map(({ id }) => id));
  const ids = new Set();
  const licenseKeys = new Set();
  return licenseAssertions.map((assertion, index) => {
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      throw new Error(`licenseAssertions[${index}] must be an object.`);
    }
    const id = String(assertion.id ?? "").trim();
    const parentAssertionId = String(assertion.parentAssertionId ?? "").trim();
    const stateCode = String(assertion.address?.stateCode ?? "").trim().toUpperCase();
    const programName = String(assertion.programName ?? "").trim();
    const street1 = String(assertion.address?.street1 ?? "").trim();
    const authorityName = String(assertion.license?.authorityName ?? "").trim();
    const licenseNumber = String(assertion.license?.number ?? "").trim();
    const licenseStatus = String(assertion.license?.status ?? "").trim();
    const scopeClassification = String(assertion.capacity?.scopeClassification ?? "").trim();
    const licensedBeds = assertion.capacity?.licensedBeds;
    const confidence = String(assertion.capacity?.confidence ?? "").trim();
    const sourceId = String(assertion.source?.sourceId ?? "").trim();
    if (!id || !parentAssertionId || !stateCode || !authorityName || !sourceId ||
        (!licenseNumber && (!programName || !street1))) {
      throw new Error(`licenseAssertions[${index}] is missing a required identity or source field.`);
    }
    if (ids.has(id)) throw new Error(`Duplicate license assertion id: ${id}`);
    if (!parentIds.has(parentAssertionId)) throw new Error(`License assertion ${id} references an unknown parent assertion.`);
    if (excludedStateCodes.has(stateCode)) throw new Error(`License assertion ${id} is in excluded state ${stateCode}.`);
    if (!LICENSE_STATUSES.has(licenseStatus)) throw new Error(`License assertion ${id} has an invalid license status.`);
    if (!LICENSE_SCOPE_CLASSIFICATIONS.has(scopeClassification)) {
      throw new Error(`License assertion ${id} has an invalid capacity scope classification.`);
    }
    if (licensedBeds !== null && (!Number.isInteger(licensedBeds) || licensedBeds <= 0)) {
      throw new Error(`License assertion ${id} requires a positive whole licensed bed count or null when the regulator does not publish capacity.`);
    }
    if (!["unverified", "low", "medium", "high"].includes(confidence)) {
      throw new Error(`License assertion ${id} has an invalid capacity confidence.`);
    }
    if (licensedBeds === null && confidence !== "unverified") {
      throw new Error(`License assertion ${id} must use unverified capacity confidence when licensed beds are not published.`);
    }
    const sourceRecord = licenseSources.get(sourceId);
    if (!sourceRecord) throw new Error(`License assertion ${id} references an unknown license source.`);
    const licenseKey = licenseNumber
      ? `${normalizeAcquisitionOrganizationName(authorityName)}:${licenseNumber.toLowerCase()}`
      : `${normalizeAcquisitionOrganizationName(authorityName)}:${stateCode}:${normalizeAcquisitionOrganizationName(street1)}:${normalizeAcquisitionOrganizationName(programName)}`;
    if (licenseKeys.has(licenseKey)) throw new Error(`Duplicate license assertion key: ${licenseKey}`);
    ids.add(id);
    licenseKeys.add(licenseKey);
    return {
      ...assertion,
      id,
      parentAssertionId,
      address: { ...assertion.address, stateCode },
      source: { ...assertion.source, sourceId },
      sourceRecord,
      licenseKey
    };
  });
}

function preparedCapacityAssertions(capacityAssertions, parentAssertions, capacitySources, excludedStateCodes) {
  if (!Array.isArray(capacityAssertions)) throw new Error("capacityAssertions must be an array.");
  const parentIds = new Set(parentAssertions.map(({ id }) => id));
  const ids = new Set();
  const observationKeys = new Set();
  return capacityAssertions.map((assertion, index) => {
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      throw new Error(`capacityAssertions[${index}] must be an object.`);
    }
    const id = String(assertion.id ?? "").trim();
    const parentAssertionId = String(assertion.parentAssertionId ?? "").trim();
    const programName = String(assertion.programName ?? "").trim();
    const street1 = String(assertion.address?.street1 ?? "").trim();
    const stateCode = String(assertion.address?.stateCode ?? "").trim().toUpperCase();
    const evidenceBasis = String(assertion.capacity?.evidenceBasis ?? "").trim();
    const scopeClassification = String(assertion.capacity?.scopeClassification ?? "").trim();
    const reportedBeds = assertion.capacity?.reportedBeds;
    const confidence = String(assertion.capacity?.confidence ?? "").trim();
    const sourceId = String(assertion.source?.sourceId ?? "").trim();
    const asOf = String(assertion.source?.asOf ?? "").trim();
    const rowFingerprint = String(assertion.source?.rowFingerprint ?? "").trim();
    if (!id || !parentAssertionId || !programName || !street1 || !stateCode || !sourceId || !asOf || !rowFingerprint) {
      throw new Error(`capacityAssertions[${index}] is missing a required identity, address, or source field.`);
    }
    if (ids.has(id)) throw new Error(`Duplicate capacity assertion id: ${id}`);
    if (!parentIds.has(parentAssertionId)) throw new Error(`Capacity assertion ${id} references an unknown parent assertion.`);
    if (excludedStateCodes.has(stateCode)) throw new Error(`Capacity assertion ${id} is in excluded state ${stateCode}.`);
    if (!CAPACITY_EVIDENCE_BASES.has(evidenceBasis)) {
      throw new Error(`Capacity assertion ${id} has an invalid evidence basis.`);
    }
    if (!LICENSE_SCOPE_CLASSIFICATIONS.has(scopeClassification)) {
      throw new Error(`Capacity assertion ${id} has an invalid scope classification.`);
    }
    if (!Number.isInteger(reportedBeds) || reportedBeds <= 0) {
      throw new Error(`Capacity assertion ${id} requires a positive whole reported bed count.`);
    }
    if (!["low", "medium", "high"].includes(confidence)) {
      throw new Error(`Capacity assertion ${id} has an invalid confidence.`);
    }
    const sourceRecord = capacitySources.get(sourceId);
    if (!sourceRecord) throw new Error(`Capacity assertion ${id} references an unknown capacity source.`);
    const observationKey = `${parentAssertionId}:${stateCode}:${normalizeAcquisitionOrganizationName(street1)}`;
    if (observationKeys.has(observationKey)) throw new Error(`Duplicate capacity assertion location: ${observationKey}`);
    ids.add(id);
    observationKeys.add(observationKey);
    return {
      ...assertion,
      id,
      parentAssertionId,
      programName,
      address: { ...assertion.address, street1, stateCode },
      source: { ...assertion.source, sourceId, asOf, rowFingerprint },
      sourceRecord,
      observationKey
    };
  });
}

function publicLicenseAssertion(assertion) {
  return {
    id: assertion.id,
    parentAssertionId: assertion.parentAssertionId,
    brandName: assertion.brandName ?? null,
    programName: assertion.programName,
    legalOperatorName: assertion.legalOperatorName,
    address: assertion.address,
    license: assertion.license,
    capacity: assertion.capacity,
    populationSignals: assertion.populationSignals ?? {},
    source: {
      id: assertion.source.sourceId,
      title: assertion.sourceRecord.title,
      sourceType: assertion.sourceRecord.authorityType,
      url: assertion.sourceRecord.reportUrl,
      landingPageUrl: assertion.sourceRecord.landingPageUrl,
      workbookSheet: assertion.source.workbookSheet ?? null,
      asOf: assertion.source.asOf
    }
  };
}

function publicCapacityAssertion(assertion) {
  return {
    id: assertion.id,
    parentAssertionId: assertion.parentAssertionId,
    brandName: assertion.brandName ?? null,
    programName: assertion.programName,
    address: assertion.address,
    capacity: assertion.capacity,
    source: {
      id: assertion.source.sourceId,
      title: assertion.sourceRecord.title,
      sourceType: assertion.sourceRecord.authorityType,
      url: assertion.sourceRecord.reportUrl,
      asOf: assertion.source.asOf
    }
  };
}

function licenseEvidenceSummary(licenseAssertions, capacityAssertions) {
  const current = licenseAssertions.filter(({ license }) => license.status === "active");
  const resolvedLegalOperatorNames = current
    .map(({ legalOperatorName }) => normalizeAcquisitionOrganizationName(legalOperatorName))
    .filter((name) => name && !name.startsWith("unresolved "));
  const currentWithKnownCapacity = current.filter(({ capacity }) =>
    Number.isInteger(capacity.licensedBeds) && capacity.licensedBeds > 0
  );
  const reported = capacityAssertions.filter(({ capacity }) => capacity.evidenceBasis === "operator_reported");
  const scopedBeds = (classification) => {
    const matches = currentWithKnownCapacity.filter(({ capacity }) => capacity.scopeClassification === classification);
    return matches.length ? matches.reduce((sum, { capacity }) => sum + capacity.licensedBeds, 0) : null;
  };
  const currentLicensedBeds = currentWithKnownCapacity.length
    ? currentWithKnownCapacity.reduce((sum, { capacity }) => sum + capacity.licensedBeds, 0)
    : null;
  const capacityConfidence = !currentWithKnownCapacity.length
    ? "unverified"
    : currentWithKnownCapacity.length === current.length &&
        currentWithKnownCapacity.every(({ capacity }) => capacity.confidence === "high")
      ? "high"
      : "medium";
  const reportedCapacityConfidence = !reported.length
    ? "unverified"
    : reported.every(({ capacity }) => capacity.confidence === "high")
      ? "high"
      : reported.every(({ capacity }) => capacity.confidence !== "low")
        ? "medium"
        : "low";
  const evidenceDates = [
    ...current.map(({ source }) => source.asOf),
    ...reported.map(({ source }) => source.asOf)
  ].filter(Boolean).sort();
  const status = current.length && reported.length
    ? "partial_current_license_and_reported_capacity_evidence"
    : current.length
      ? "partial_current_license_evidence"
      : reported.length
        ? "operator_reported_capacity_evidence"
        : "unverified";
  return {
    status,
    portfolioCoverage: current.length || reported.length ? "partial_facility_crosswalk_pending" : "unverified",
    confidence: {
      currentLicenseCapacity: capacityConfidence,
      reportedCapacity: reportedCapacityConfidence,
      portfolioCompleteness: "unverified"
    },
    bedTotals: {
      verifiedCurrentLicensed: currentLicensedBeds,
      verifiedCoreTarget: scopedBeds("core_target"),
      verifiedAdjacentHighAcuitySud: scopedBeds("adjacent_high_acuity_sud"),
      reportedByOperator: reported.length
        ? reported.reduce((sum, { capacity }) => sum + capacity.reportedBeds, 0)
        : null,
      estimatedLow: null,
      estimatedHigh: null
    },
    counts: {
      assertions: licenseAssertions.length,
      currentLicenses: current.length,
      verifiedPrograms: new Set(current.map(({ id }) => id)).size,
      verifiedLegalOperators: new Set(resolvedLegalOperatorNames).size,
      reportedCapacityAssertions: reported.length,
      reportedCapacityPrograms: new Set(reported.map(({ observationKey }) => observationKey)).size
    },
    stateCodes: [...new Set([
      ...current.map(({ address }) => address.stateCode),
      ...reported.map(({ address }) => address.stateCode)
    ])].sort(),
    lastVerifiedAt: evidenceDates.at(-1) ?? null,
    evidenceIds: [
      ...licenseAssertions.map(({ id }) => id),
      ...reported.map(({ id }) => id)
    ],
    licenses: licenseAssertions.map(publicLicenseAssertion),
    reportedCapacity: reported.map(publicCapacityAssertion)
  };
}

function parentAssertionForFacility(facility, assertions) {
  const domain = acquisitionWebsiteDomain(facility.website);
  const names = [facility.name, facility.secondaryName]
    .map(normalizeAcquisitionOrganizationName)
    .filter(Boolean);
  const matches = assertions.filter((assertion) =>
    (domain && assertion.matchedDomains.has(domain)) ||
    names.some((name) => assertion.matchedNormalizedNames.has(name)) ||
    names.some((name) => assertion.matchedNormalizedNamePrefixes.some((prefix) => name.startsWith(prefix)))
  );
  if (matches.length > 1) {
    throw new Error(`Facility ${facility.id ?? facility.name ?? "unknown"} matches multiple parent assertions: ${matches.map(({ id }) => id).join(", ")}`);
  }
  return matches[0] ?? null;
}

function facilityFromLicenseAssertion(licenseAssertion, parentAssertion) {
  const populationSignals = licenseAssertion.populationSignals ?? {};
  const scopeClassification = licenseAssertion.capacity?.scopeClassification;
  const isCore = scopeClassification === "core_target";
  const isAdjacent = scopeClassification === "adjacent_high_acuity_sud";
  const isAdult = populationSignals.adults === true && populationSignals.adolescents !== true;
  const primaryMentalHealth = populationSignals.primaryMentalHealth === true || isCore;
  const eligiblePrivate = parentAssertion.acquisitionEligibility === "eligible_private";
  const active = licenseAssertion.license?.status === "active";
  const candidate = active && eligiblePrivate && isAdult && (isCore || isAdjacent);
  return {
    id: `state-license:${licenseAssertion.id}`,
    name: licenseAssertion.programName || licenseAssertion.brandName || parentAssertion.operatingParentName,
    secondaryName: licenseAssertion.brandName ?? "",
    address: licenseAssertion.address,
    phone: "",
    website: parentAssertion.primaryDomain ? `https://${parentAssertion.primaryDomain}` : "",
    latitude: null,
    longitude: null,
    typeFacilities: primaryMentalHealth ? ["MH"] : ["SA"],
    services: {
      FOP: eligiblePrivate ? ["Private for-profit organization"] : [],
      SET: isCore || isAdjacent ? ["Residential/24-hour residential"] : [],
      FT: isAdult ? ["Residential treatment center (RTC) for adults"] : [],
      TC: primaryMentalHealth
        ? ["Mental health treatment"]
        : isAdjacent
          ? ["Substance use treatment; Treatment for co-occurring disorders plus serious mental illness (SMI) in adults"]
          : [],
      SG: isCore
        ? ["Persons 18 and older with serious mental illness (SMI)"]
        : populationSignals.coOccurringDisorders === true
          ? ["Clients with co-occurring mental and substance use disorders"]
          : [],
      AGE: isAdult ? ["Adults"] : []
    },
    sourceRowCount: 1,
    disposition: candidate ? "include" : "review",
    reasons: ["current state-license assertion linked to an evidence-backed operating parent"],
    tags: [
      "state_license_discovery",
      active ? "active_license_signal" : "non_current_license_signal",
      isCore ? "core_target_license_signal" : isAdjacent ? "adjacent_license_signal" : "unresolved_license_scope"
    ],
    verificationStatus: "state_license_verified",
    licenseMatchStatus: "matched",
    ownershipResolutionStatus: "evidence_backed",
    source: {
      kind: "state_license_assertion",
      id: licenseAssertion.source?.sourceId ?? null,
      url: licenseAssertion.sourceRecord?.reportUrl ?? null,
      asOf: licenseAssertion.source?.asOf ?? null
    }
  };
}

function publicParentAssertion(assertion) {
  if (!assertion) return null;
  return {
    id: assertion.id,
    operatingParentName: assertion.operatingParentName,
    canonicalLegalName: assertion.canonicalLegalName ?? null,
    primaryDomain: assertion.primaryDomain ?? null,
    sponsorName: assertion.sponsorName ?? null,
    ownershipType: assertion.ownershipType,
    acquisitionEligibility: assertion.acquisitionEligibility,
    targetClassification: assertion.targetClassification ?? "needs_fit_validation",
    valuationModel: assertion.valuationModel ?? null,
    confidence: assertion.confidence,
    sources: assertion.sources ?? [],
    contradictions: assertion.contradictions ?? [],
    notes: assertion.notes ?? ""
  };
}

function resolvedFitCategory(inferredFitCategory, targetClassification) {
  if (targetClassification === "excluded_public_company" || targetClassification === "excluded_out_of_scope") {
    return "context_or_unresolved";
  }
  if (targetClassification === "sud_primary_adjacent" || targetClassification === "adjacent_dual_diagnosis") {
    return inferredFitCategory === "context_or_unresolved" ? inferredFitCategory : "adjacent_signal";
  }
  return inferredFitCategory;
}

function targetFitEvidencePriority(organization) {
  const confidence = organization.parentIdentity?.confidence?.targetFit;
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  if (!organization.parentIdentity) return 1;
  return 0;
}

export function isValidatedAcquisitionTarget(organization) {
  const confidence = organization?.parentIdentity?.confidence;
  const verifiedCoreBeds = organization?.licenseEvidence?.bedTotals?.verifiedCoreTarget;
  const valuedBeds = organization?.valuationEvidence?.capacity?.valuedBeds;
  return organization?.acquisitionEligibility === "eligible_private" &&
    organization?.scope?.fitCategory === "core_signal" &&
    confidence?.relationship === "high" &&
    confidence?.legalIdentity === "high" &&
    confidence?.ownership === "high" &&
    confidence?.targetFit === "high" &&
    confidence?.capacity === "high" &&
    typeof verifiedCoreBeds === "number" && verifiedCoreBeds > 0 &&
    typeof valuedBeds === "number" && valuedBeds > 0 &&
    !organization?.stateCodes?.includes("CA") &&
    (organization?.resolution?.contradictionIds?.length ?? 0) === 0;
}

function compareValidatedTargets(left, right) {
  return maturityTierPriority(right) - maturityTierPriority(left) ||
    (right.licenseEvidence.bedTotals.verifiedCoreTarget ?? 0) -
      (left.licenseEvidence.bedTotals.verifiedCoreTarget ?? 0) ||
    (right.valuationEvidence?.valuation.outputs.base.enterpriseValueMillions ?? 0) -
      (left.valuationEvidence?.valuation.outputs.base.enterpriseValueMillions ?? 0) ||
    (left.targetRank ?? Number.MAX_SAFE_INTEGER) - (right.targetRank ?? Number.MAX_SAFE_INTEGER) ||
    left.proposedName.localeCompare(right.proposedName);
}

function organizationMaturityTier(facilityCount, stateCount) {
  if (stateCount >= 3 || facilityCount >= 10) return "platform_scale_signal";
  if (stateCount >= 2 || facilityCount >= 4) return "regional_scale_signal";
  if (facilityCount >= 2) return "established_local_signal";
  return "single_site_or_unresolved";
}

function organizationFacilityScaleBand(facilityCount) {
  if (facilityCount >= 25) return "twenty_five_plus_locations";
  if (facilityCount >= 10) return "ten_twenty_four_locations";
  if (facilityCount >= 4) return "four_nine_locations";
  if (facilityCount >= 2) return "two_three_locations";
  return "one_location";
}

function screeningCapacityBand(baseBeds) {
  if (baseBeds === null) return "not_estimable";
  if (baseBeds >= 300) return "300_plus";
  if (baseBeds >= 150) return "150_299";
  if (baseBeds >= 75) return "75_149";
  if (baseBeds >= 25) return "25_74";
  return "under_25";
}

function screeningCapacityForOrganization({
  coreCandidateCount,
  adjacentCandidateCount,
  candidateCount,
  licenseEvidence,
  valuationEvidence
}) {
  const unresolvedCandidateCount = Math.max(0, candidateCount - coreCandidateCount - adjacentCandidateCount);
  const profiles = ACQUISITION_SCREENING_CAPACITY_MODEL.siteProfiles;
  const peerRange = candidateCount > 0
    ? {
        low: coreCandidateCount * profiles.coreSignal.low +
          adjacentCandidateCount * profiles.adjacentSignal.low +
          unresolvedCandidateCount * profiles.unresolvedResidential.low,
        base: coreCandidateCount * profiles.coreSignal.base +
          adjacentCandidateCount * profiles.adjacentSignal.base +
          unresolvedCandidateCount * profiles.unresolvedResidential.base,
        high: coreCandidateCount * profiles.coreSignal.high +
          adjacentCandidateCount * profiles.adjacentSignal.high +
          unresolvedCandidateCount * profiles.unresolvedResidential.high
      }
    : { low: null, base: null, high: null };
  const evidencedValues = [
    licenseEvidence.bedTotals.verifiedCurrentLicensed,
    licenseEvidence.bedTotals.reportedByOperator,
    valuationEvidence?.capacity?.valuedBeds
  ].filter((value) => typeof value === "number" && value > 0);
  // These evidence sources can overlap, so the largest known value is a floor rather than a sum.
  const evidencedFloorBeds = evidencedValues.length ? Math.max(...evidencedValues) : null;
  const range = candidateCount > 0
    ? {
        low: Math.max(peerRange.low ?? 0, evidencedFloorBeds ?? 0),
        base: Math.max(peerRange.base ?? 0, evidencedFloorBeds ?? 0),
        high: Math.max(peerRange.high ?? 0, evidencedFloorBeds ?? 0)
      }
    : evidencedFloorBeds !== null
      ? { low: evidencedFloorBeds, base: evidencedFloorBeds, high: null }
      : { low: null, base: null, high: null };
  const status = candidateCount > 0
    ? evidencedFloorBeds !== null ? "peer_range_with_evidenced_floor" : "peer_range"
    : evidencedFloorBeds !== null ? "evidenced_floor_only" : "not_estimable";

  return {
    status,
    bucket: screeningCapacityBand(range.base),
    confidence: "low",
    isWholeCompanyEstimate: false,
    rangeScope: ACQUISITION_SCREENING_CAPACITY_MODEL.scope,
    candidateSites: {
      total: candidateCount,
      core: coreCandidateCount,
      adjacent: adjacentCandidateCount,
      unresolved: unresolvedCandidateCount
    },
    peerRange,
    range,
    evidencedFloorBeds,
    basis: "nsumhss_2024_peer_percentiles",
    limitations: [
      "anonymized_peer_records",
      "partial_observable_sites",
      "no_valuation_use"
    ]
  };
}

function maturityTierPriority(organization) {
  if (organization.screeningProfile.maturityTier === "platform_scale_signal") return 4;
  if (organization.screeningProfile.maturityTier === "regional_scale_signal") return 3;
  if (organization.screeningProfile.maturityTier === "established_local_signal") return 2;
  return 1;
}

function funnelSelectionPriority(organization) {
  if (organization.screeningProfile.selectionBucket === "mature_target_signal") return 5;
  if (organization.screeningProfile.selectionBucket === "mature_needs_fit_review") return 4;
  if (organization.screeningProfile.selectionBucket === "established_target_signal") return 3;
  if (organization.screeningProfile.selectionBucket === "smaller_target_signal") return 2;
  return 1;
}

function screeningLocationKey(record, fallback) {
  const address = record?.address ?? {};
  const parts = [address.street1, address.city, address.stateCode, address.zip]
    .map(normalizeAcquisitionOrganizationName)
    .filter(Boolean);
  return parts.length >= 2 ? `address:${parts.join(":")}` : `record:${fallback}`;
}

function screeningProfileForOrganization({
  facilityCount,
  stateCodes,
  domain,
  assertion,
  acquisitionEligibility,
  fitCategory,
  evaluated
}) {
  const stateCount = stateCodes.length;
  const maturityTier = organizationMaturityTier(facilityCount, stateCount);
  const hasDirectoryPrivateSignal = evaluated.some(({ fit }) =>
    fit.signals.includes("private_for_profit_directory_signal")
  );
  const privateLikelihood = EXCLUDED_ACQUISITION_ELIGIBILITY.has(acquisitionEligibility)
    ? "excluded"
    : assertion?.confidence?.ownership === "high" && acquisitionEligibility === "eligible_private"
      ? "verified_private"
      : acquisitionEligibility === "eligible_private"
        ? "supported_private"
        : hasDirectoryPrivateSignal
          ? "directory_private_signal"
          : "unverified";
  const targetSignal = fitCategory === "core_signal" || fitCategory === "adjacent_signal";
  const matureScaleSignal = maturityTier === "platform_scale_signal" || maturityTier === "regional_scale_signal";
  const selectablePrivateSignal = privateLikelihood !== "excluded" && privateLikelihood !== "unverified";
  const selectionBucket = targetSignal && selectablePrivateSignal
    ? matureScaleSignal
      ? "mature_target_signal"
      : maturityTier === "established_local_signal"
        ? "established_target_signal"
        : "smaller_target_signal"
    : matureScaleSignal && selectablePrivateSignal
      ? "mature_needs_fit_review"
      : "market_context";
  const maturityScore = clamp(Math.round(
    Math.min(65, Math.log2(facilityCount + 1) * 18) +
    Math.min(25, Math.max(0, stateCount - 1) * 7) +
    (domain ? 5 : 0) +
    (assertion?.confidence?.relationship === "high" ? 5 : 0)
  ), 0, 100);
  return {
    maturityTier,
    maturityScore,
    privateLikelihood,
    selectionBucket,
    facilityScale: facilityCount,
    facilityScaleBand: organizationFacilityScaleBand(facilityCount),
    stateBreadth: stateCount,
    basis: "observable_directory_facility_scale_and_state_breadth_not_company_age_or_revenue"
  };
}

function parentResearchState(assertion, acquisitionEligibility) {
  if (EXCLUDED_ACQUISITION_ELIGIBILITY.has(acquisitionEligibility)) {
    return { gaps: [], nextAction: null };
  }
  const confidence = assertion?.confidence;
  const gaps = [];
  if (!assertion || confidence?.relationship !== "high") gaps.push("operating_parent_relationship");
  if (!assertion || confidence?.legalIdentity !== "high") gaps.push("legal_identity");
  if (!assertion || confidence?.ownership !== "high") gaps.push("private_ownership");
  if (!assertion || confidence?.targetFit !== "high") gaps.push("target_fit");
  if (!assertion || confidence?.capacity !== "high") gaps.push("licensed_capacity");
  if (!assertion || confidence?.valuation !== "high") gaps.push("valuation_inputs");
  if (assertion?.contradictions?.some(({ status }) => status === "open")) gaps.unshift("contradiction_review");
  return { gaps, nextAction: gaps[0] ?? null };
}

function proposalForGroup(key, domain, facilities, assertion, licenseAssertions, capacityAssertions) {
  const evaluated = facilities.map((facility) => ({ facility, fit: scoreAcquisitionFacility(facility) }));
  const candidates = evaluated.filter(({ fit }) => fit.candidate);
  const coreCandidates = candidates.filter(({ fit }) => fit.fitCategory === "core_signal");
  const adjacentCandidates = candidates.filter(({ fit }) => fit.fitCategory === "adjacent_signal");
  const candidateStates = [...new Set(candidates.map(({ facility }) => facility.address.stateCode))].sort();
  const allStates = [...new Set([
    ...facilities.map((facility) => facility.address.stateCode),
    ...licenseAssertions.map((license) => license.address.stateCode),
    ...capacityAssertions.map((capacity) => capacity.address.stateCode)
  ].filter(Boolean))].sort();
  const observableFacilityScale = new Set([
    ...facilities.map((facility) => screeningLocationKey(facility, facility.id)),
    ...licenseAssertions.map((license) => screeningLocationKey(license, license.id)),
    ...capacityAssertions.map((capacity) => screeningLocationKey(capacity, capacity.id))
  ]).size;
  const maxFacilityScore = Math.max(0, ...candidates.map(({ fit }) => fit.score));
  const averageFacilityScore = candidates.length
    ? candidates.reduce((sum, { fit }) => sum + fit.score, 0) / candidates.length
    : 0;
  const candidateDensity = facilities.length ? candidates.length / facilities.length : 0;
  const coreFitPoints = coreCandidates.length ? 12 : adjacentCandidates.length ? 4 : 0;
  const scalePoints = Math.min(15, Math.log2(coreCandidates.length * 2 + adjacentCandidates.length + 1) * 4);
  const breadthPoints = Math.min(10, Math.max(0, candidateStates.length - 1) * 2);
  const domainPoints = domain ? 5 : 0;
  const screeningScore = candidates.length
    ? clamp(Math.round(
      maxFacilityScore * 0.35 +
      averageFacilityScore * 0.10 +
      candidateDensity * 8 +
      coreFitPoints +
      scalePoints +
      breadthPoints +
      domainPoints
    ), 0, 100)
    : 0;
  const signals = [...new Set(candidates.flatMap(({ fit }) => fit.signals))].sort();
  const cautions = [...new Set(candidates.flatMap(({ fit }) => fit.cautions))].sort();

  const aliases = organizationAliases(facilities);
  const proposedName = assertion?.operatingParentName ?? mostRepresentativeName(candidates.length ? candidates.map(({ facility }) => facility) : facilities);
  const publicAliases = [...new Set([
    ...aliases,
    assertion?.operatingParentName,
    assertion?.canonicalLegalName
  ].filter(Boolean))].sort((left, right) => left.localeCompare(right)).slice(0, 30);
  const identityKeys = organizationIdentityKeys({
    key,
    domain,
    facilities,
    assertion,
    names: [proposedName, ...publicAliases]
  });
  const licenseEvidence = licenseEvidenceSummary(licenseAssertions, capacityAssertions);
  const valuationEvidence = buildKnownCapacitySliceValuation({
    operatorId: assertion?.id ?? null,
    segmentId: assertion?.valuationModel?.segmentId ?? null,
    licenseEvidence
  });
  const screeningCapacity = screeningCapacityForOrganization({
    coreCandidateCount: coreCandidates.length,
    adjacentCandidateCount: adjacentCandidates.length,
    candidateCount: candidates.length,
    licenseEvidence,
    valuationEvidence
  });
  const evidenceIds = [
    ...(assertion?.sources?.map(({ id }) => id) ?? []),
    ...licenseEvidence.evidenceIds
  ];
  const contradictionIds = assertion?.contradictions?.map(({ id }) => id) ?? [];
  const legalOperatorIds = [...new Set(licenseAssertions
    .map(({ legalOperatorName }) => normalizeAcquisitionOrganizationName(legalOperatorName))
    .filter((name) => name && !name.startsWith("unresolved "))
    .map((name) => stableId("legal", `${assertion?.id ?? key}:${name}`)))].sort();
  const relationshipConfidence = assertion?.confidence?.relationship ?? (domain && facilities.length > 1 ? "medium" : "low");
  const acquisitionEligibility = assertion?.acquisitionEligibility ?? "pending_private_verification";
  const inferredFitCategory = coreCandidates.length ? "core_signal" : adjacentCandidates.length ? "adjacent_signal" : "context_or_unresolved";
  const targetClassification = assertion?.targetClassification ?? "needs_fit_validation";
  const fitCategory = resolvedFitCategory(inferredFitCategory, targetClassification);
  const screeningProfile = screeningProfileForOrganization({
    facilityCount: observableFacilityScale,
    stateCodes: allStates,
    domain: assertion?.primaryDomain ?? domain,
    assertion,
    acquisitionEligibility,
    fitCategory,
    evaluated
  });
  const research = parentResearchState(assertion, acquisitionEligibility);
  return {
    id: stableId("org", key),
    proposedName,
    canonicalNameStatus: assertion ? "evidence_backed_operating_parent" : "directory_inference_not_verified",
    rootDomain: assertion?.primaryDomain ?? domain,
    discoveryBasis: facilities.every((facility) => facility.source?.kind === "state_license_assertion")
      ? "state_license_assertions"
      : "federal_facility_directory",
    aliases: publicAliases,
    identityKeys,
    acquisitionEligibility,
    screeningProfile,
    parentIdentity: publicParentAssertion(assertion),
    licenseEvidence,
    screeningCapacity,
    valuationEvidence,
    research,
    resolution: {
      status: assertion ? "evidence_backed_parent_relationship" : domain ? "proposed_domain_cluster" : "unresolved_name_candidate",
      confidence: relationshipConfidence,
      basis: assertion ? "curated_authoritative_parent_assertion" : domain ? "shared_website_domain" : "shared_normalized_directory_name",
      parentCompanyId: assertion?.id ?? null,
      legalOperatorIds,
      evidenceIds,
      contradictionIds
    },
    scope: {
      fitCategory,
      inferredFitCategory,
      targetClassification,
      signals,
      cautions,
      screeningScore,
      scoreComponents: {
        maxFacilityRelevance: Math.round(maxFacilityScore),
        averageFacilityRelevance: Math.round(averageFacilityScore),
        candidateDensity: Math.round(candidateDensity * 100),
        coreFitPoints,
        scalePoints: Math.round(scalePoints),
        breadthPoints,
        domainPoints
      }
    },
    facilityCounts: {
      total: facilities.length,
      candidates: candidates.length,
      coreSignal: coreCandidates.length,
      adjacentSignal: adjacentCandidates.length
    },
    stateCodes: allStates,
    candidateStateCodes: candidateStates,
    facilityIds: facilities.map((facility) => facility.id),
    candidateFacilityIds: candidates.map(({ facility }) => facility.id),
    targetRank: /** @type {number | null} */ (null),
    validatedTargetRank: /** @type {number | null} */ (null),
    funnelStage: "universe"
  };
}

export function buildAcquisitionOperatorIndex(facilities, {
  generatedAt = new Date().toISOString(),
  excludedStateCodes = ACQUISITION_EXCLUDED_STATE_CODES,
  parentAssertions = [],
  licenseAssertions = [],
  licenseSources = [],
  capacityAssertions = [],
  capacitySources = []
} = {}) {
  const excluded = new Set(excludedStateCodes.map((value) => String(value).trim().toUpperCase()));
  const eligibleGeography = facilities.filter((facility) => !excluded.has(String(facility.address?.stateCode ?? "").toUpperCase()));
  const assertions = preparedParentAssertions(parentAssertions);
  const preparedSources = preparedLicenseSources(licenseSources);
  const licenses = preparedLicenseAssertions(licenseAssertions, assertions, preparedSources, excluded);
  const preparedCapacitySourceRecords = preparedCapacitySources(capacitySources);
  const capacities = preparedCapacityAssertions(capacityAssertions, assertions, preparedCapacitySourceRecords, excluded);
  const licensesByParent = new Map();
  for (const licenseAssertion of licenses) {
    const matches = licensesByParent.get(licenseAssertion.parentAssertionId) ?? [];
    matches.push(licenseAssertion);
    licensesByParent.set(licenseAssertion.parentAssertionId, matches);
  }
  const capacitiesByParent = new Map();
  for (const capacityAssertion of capacities) {
    const matches = capacitiesByParent.get(capacityAssertion.parentAssertionId) ?? [];
    matches.push(capacityAssertion);
    capacitiesByParent.set(capacityAssertion.parentAssertionId, matches);
  }
  const groups = new Map();
  for (const facility of eligibleGeography) {
    const domain = acquisitionWebsiteDomain(facility.website);
    const normalizedName = normalizeAcquisitionOrganizationName(facility.name || facility.secondaryName);
    if (!domain && normalizedName.length < 3) continue;
    const assertion = parentAssertionForFacility(facility, assertions);
    const key = assertion ? `parent:${assertion.id}` : domain ? `domain:${domain}` : `name:${normalizedName}`;
    const group = groups.get(key) ?? { domain, facilities: [], assertion };
    group.facilities.push(facility);
    groups.set(key, group);
  }

  for (const assertion of assertions) {
    const key = `parent:${assertion.id}`;
    if (groups.has(key)) continue;
    const stateLicenseFacilities = (licensesByParent.get(assertion.id) ?? [])
      .filter(({ license, capacity, populationSignals }) =>
        license.status === "active" &&
        ["core_target", "adjacent_high_acuity_sud"].includes(capacity.scopeClassification) &&
        populationSignals?.adults === true &&
        populationSignals?.adolescents !== true
      )
      .map((licenseAssertion) => facilityFromLicenseAssertion(licenseAssertion, assertion));
    if (!stateLicenseFacilities.length) continue;
    groups.set(key, {
      domain: acquisitionWebsiteDomain(assertion.primaryDomain),
      facilities: stateLicenseFacilities,
      assertion
    });
  }

  const organizations = [...groups.entries()].map(([key, group]) => proposalForGroup(
    key,
    group.domain,
    group.facilities,
    group.assertion,
    licensesByParent.get(group.assertion?.id) ?? [],
    capacitiesByParent.get(group.assertion?.id) ?? []
  ));
  const facilitySignalCandidates = organizations
    .filter((organization) =>
      organization.facilityCounts.candidates > 0 &&
      !EXCLUDED_ACQUISITION_ELIGIBILITY.has(organization.acquisitionEligibility)
    );
  const considerationCandidates = organizations
    .filter((organization) => {
      const matureScaleSignal = ["platform_scale_signal", "regional_scale_signal"]
        .includes(organization.screeningProfile.maturityTier);
      return !EXCLUDED_ACQUISITION_ELIGIBILITY.has(organization.acquisitionEligibility) &&
        (matureScaleSignal || organization.facilityCounts.candidates > 0);
    })
    .sort((left, right) =>
      Number(["platform_scale_signal", "regional_scale_signal"].includes(right.screeningProfile.maturityTier)) -
        Number(["platform_scale_signal", "regional_scale_signal"].includes(left.screeningProfile.maturityTier)) ||
      funnelSelectionPriority(right) - funnelSelectionPriority(left) ||
      maturityTierPriority(right) - maturityTierPriority(left) ||
      right.screeningProfile.maturityScore - left.screeningProfile.maturityScore ||
      targetFitEvidencePriority(right) - targetFitEvidencePriority(left) ||
      Number(right.scope.fitCategory === "core_signal") - Number(left.scope.fitCategory === "core_signal") ||
      right.scope.screeningScore - left.scope.screeningScore ||
      right.facilityCounts.coreSignal - left.facilityCounts.coreSignal ||
      right.facilityCounts.candidates - left.facilityCounts.candidates ||
      left.proposedName.localeCompare(right.proposedName)
    );
  const screen500Ids = new Set(considerationCandidates.slice(0, 500).map((organization) => organization.id));
  const research100Ids = new Set(considerationCandidates.slice(0, 100).map((organization) => organization.id));
  considerationCandidates.forEach((organization, index) => {
    organization.targetRank = index + 1;
    organization.funnelStage = research100Ids.has(organization.id)
      ? "research_100_queue"
      : screen500Ids.has(organization.id)
        ? "screen_500"
        : "universe";
  });
  const validatedTargets = organizations
    .filter(isValidatedAcquisitionTarget)
    .sort(compareValidatedTargets);
  validatedTargets.forEach((organization, index) => {
    organization.validatedTargetRank = index + 1;
  });
  organizations.sort((left, right) =>
    (left.targetRank ?? Number.POSITIVE_INFINITY) - (right.targetRank ?? Number.POSITIVE_INFINITY) ||
    left.proposedName.localeCompare(right.proposedName)
  );

  return {
    version: ACQUISITION_OPERATOR_INDEX_VERSION,
    generatedAt,
    status: "proposal_universe_not_verified",
    scope: {
      description: "Private adult high-acuity behavioral-health residential operator discovery; California excluded.",
      excludedStateCodes: [...excluded].sort(),
      visibleEntityLevel: "operating_parent_company",
      hierarchy: ["sponsor", "operating_parent", "legal_operator", "brand", "facility", "license"],
      screeningCapacityModel: ACQUISITION_SCREENING_CAPACITY_MODEL
    },
    verificationBoundary: "Directory domains and names create organization proposals only. Legal parent ownership requires authoritative evidence and contradiction review.",
    counts: {
      inputFacilities: facilities.length,
      excludedGeographyFacilities: facilities.length - eligibleGeography.length,
      indexedFacilities: eligibleGeography.length,
      organizationProposals: organizations.length,
      regulatorDiscoveredOrganizations: organizations.filter((organization) =>
        organization.discoveryBasis === "state_license_assertions").length,
      regulatorDiscoveredFacilities: organizations.reduce((sum, organization) =>
        sum + (organization.discoveryBasis === "state_license_assertions" ? organization.facilityCounts.total : 0), 0),
      targetCandidateOrganizations: considerationCandidates.length,
      considerationOrganizationsWithScreeningCapacity: considerationCandidates.filter((organization) =>
        organization.screeningCapacity.bucket !== "not_estimable").length,
      considerationOrganizationsWithoutScreeningCapacity: considerationCandidates.filter((organization) =>
        organization.screeningCapacity.bucket === "not_estimable").length,
      considerationScreeningCapacityUnder25: considerationCandidates.filter((organization) =>
        organization.screeningCapacity.bucket === "under_25").length,
      considerationScreeningCapacity25To74: considerationCandidates.filter((organization) =>
        organization.screeningCapacity.bucket === "25_74").length,
      considerationScreeningCapacity75To149: considerationCandidates.filter((organization) =>
        organization.screeningCapacity.bucket === "75_149").length,
      considerationScreeningCapacity150To299: considerationCandidates.filter((organization) =>
        organization.screeningCapacity.bucket === "150_299").length,
      considerationScreeningCapacity300Plus: considerationCandidates.filter((organization) =>
        organization.screeningCapacity.bucket === "300_plus").length,
      considerationScreeningCapacityLowerBoundAtLeast300: considerationCandidates.filter((organization) =>
        (organization.screeningCapacity.range.low ?? -1) >= 300).length,
      considerationScreeningCapacityRangeReaches300: considerationCandidates.filter((organization) =>
        (organization.screeningCapacity.range.high ?? -1) >= 300).length,
      facilitySignalOrganizations: facilitySignalCandidates.length,
      matureTargetCandidates: considerationCandidates.filter((organization) =>
        ["platform_scale_signal", "regional_scale_signal"].includes(organization.screeningProfile.maturityTier)
      ).length,
      coreSignalOrganizations: facilitySignalCandidates.filter((organization) => organization.scope.fitCategory === "core_signal").length,
      matureScaleSignals: organizations.filter((organization) =>
        ["platform_scale_signal", "regional_scale_signal"].includes(organization.screeningProfile.maturityTier)
      ).length,
      platformScaleSignals: organizations.filter((organization) => organization.screeningProfile.maturityTier === "platform_scale_signal").length,
      regionalScaleSignals: organizations.filter((organization) => organization.screeningProfile.maturityTier === "regional_scale_signal").length,
      establishedLocalSignals: organizations.filter((organization) => organization.screeningProfile.maturityTier === "established_local_signal").length,
      singleSiteOrUnresolved: organizations.filter((organization) => organization.screeningProfile.maturityTier === "single_site_or_unresolved").length,
      matureTargetSignals: organizations.filter((organization) => organization.screeningProfile.selectionBucket === "mature_target_signal").length,
      matureCoreTargetSignals: organizations.filter((organization) =>
        ["platform_scale_signal", "regional_scale_signal"].includes(organization.screeningProfile.maturityTier) &&
        organization.screeningProfile.selectionBucket === "mature_target_signal" &&
        organization.scope.fitCategory === "core_signal"
      ).length,
      matureAdjacentTargetSignals: organizations.filter((organization) =>
        ["platform_scale_signal", "regional_scale_signal"].includes(organization.screeningProfile.maturityTier) &&
        organization.screeningProfile.selectionBucket === "mature_target_signal" &&
        organization.scope.fitCategory === "adjacent_signal"
      ).length,
      matureTargetParentEvidenced: organizations.filter((organization) =>
        organization.screeningProfile.selectionBucket === "mature_target_signal" &&
        organization.resolution.confidence === "high"
      ).length,
      matureTargetParentToResolve: organizations.filter((organization) =>
        organization.screeningProfile.selectionBucket === "mature_target_signal" &&
        organization.resolution.confidence !== "high"
      ).length,
      matureTargetVerifiedPrivate: organizations.filter((organization) =>
        organization.screeningProfile.selectionBucket === "mature_target_signal" &&
        organization.screeningProfile.privateLikelihood === "verified_private"
      ).length,
      establishedTargetSignals: organizations.filter((organization) => organization.screeningProfile.selectionBucket === "established_target_signal").length,
      smallerTargetSignals: organizations.filter((organization) => organization.screeningProfile.selectionBucket === "smaller_target_signal").length,
      matureNeedsFitReview: organizations.filter((organization) => organization.screeningProfile.selectionBucket === "mature_needs_fit_review").length,
      matureMarketContext: organizations.filter((organization) =>
        ["platform_scale_signal", "regional_scale_signal"].includes(organization.screeningProfile.maturityTier) &&
        organization.screeningProfile.selectionBucket === "market_context"
      ).length,
      marketContextOrganizations: organizations.filter((organization) => organization.screeningProfile.selectionBucket === "market_context").length,
      screen500: screen500Ids.size,
      research100Queue: research100Ids.size,
      matureScreen500: considerationCandidates.filter((organization) =>
        screen500Ids.has(organization.id) &&
        ["platform_scale_signal", "regional_scale_signal"].includes(organization.screeningProfile.maturityTier)
      ).length,
      matureResearch100: considerationCandidates.filter((organization) =>
        research100Ids.has(organization.id) &&
        ["platform_scale_signal", "regional_scale_signal"].includes(organization.screeningProfile.maturityTier)
      ).length,
      parentAssertionsApplied: organizations.filter((organization) => organization.parentIdentity).length,
      licenseAssertionsApplied: organizations.reduce((sum, organization) => sum + organization.licenseEvidence.counts.assertions, 0),
      capacityAssertionsApplied: organizations.reduce((sum, organization) =>
        sum + organization.licenseEvidence.counts.reportedCapacityAssertions, 0),
      organizationsWithCurrentLicenseEvidence: organizations.filter((organization) => organization.licenseEvidence.counts.currentLicenses > 0).length,
      organizationsWithReportedCapacity: organizations.filter((organization) =>
        organization.licenseEvidence.bedTotals.reportedByOperator !== null).length,
      organizationsWithKnownCapacityValuation: organizations.filter((organization) =>
        organization.valuationEvidence !== null).length,
      knownCapacityBedsValued: organizations.reduce((sum, organization) =>
        sum + (organization.valuationEvidence?.capacity?.valuedBeds ?? 0), 0),
      verifiedCurrentLicensedBeds: organizations.reduce((sum, organization) =>
        sum + (organization.licenseEvidence.bedTotals.verifiedCurrentLicensed ?? 0), 0),
      operatorReportedBeds: organizations.reduce((sum, organization) =>
        sum + (organization.licenseEvidence.bedTotals.reportedByOperator ?? 0), 0),
      highConfidenceParentRelationships: organizations.filter((organization) => organization.parentIdentity?.confidence?.relationship === "high").length,
      highConfidencePrivateOwnership: organizations.filter((organization) =>
        organization.parentIdentity?.confidence?.ownership === "high" &&
        organization.acquisitionEligibility === "eligible_private"
      ).length,
      fullyQualifiedTargetParents: organizations.filter((organization) => {
        return isValidatedAcquisitionTarget(organization);
      }).length,
      validatedFinalTargets: validatedTargets.length,
      excludedPublicCompanyOrganizations: organizations.filter((organization) => organization.acquisitionEligibility === "excluded_public_company").length
    },
    confidencePolicy: {
      low: "Directory-only name or domain inference.",
      medium: "Multiple consistent discovery records, but no authoritative parent proof.",
      high: "A current authoritative source explicitly connects a brand, domain, or legal operator to the operating parent. Other confidence dimensions remain independent."
    },
    organizations
  };
}
