export const ACQUISITION_VALUATION_CONTRACT_VERSION = "1.0";
export const ACQUISITION_VALUATION_MODEL_VERSION = "operator-valuation-v1";

const CASES = Object.freeze(["low", "base", "high"]);
const DAYS_PER_YEAR = 365;
const DOLLAR_TO_MILLIONS = 1_000_000;

export const ACQUISITION_VALUATION_FORMULAS = Object.freeze({
  baseBeds: "(beds low + beds high) / 2",
  revenue: "beds * occupancy * 365 * net revenue per occupied bed-day / 1,000,000",
  ebitda: "revenue * normalized EBITDA margin",
  enterpriseValue: "normalized EBITDA * selected EV/EBITDA multiple"
});

export const ACQUISITION_VALUATION_SEGMENTS = Object.freeze([
  {
    id: "high_acuity_smi_residential",
    label: "High-acuity adult SMI residential",
    workbookBasis: "Mixed residential",
    assumptions: {
      occupancy: { low: 0.7, base: 0.8, high: 0.88 },
      netRevenuePerOccupiedBedDay: { low: 550, base: 800, high: 1050 },
      ebitdaMargin: { low: 0.08, base: 0.12, high: 0.16 },
      ebitdaMultiple: { low: 5, base: 7, high: 9 }
    }
  },
  {
    id: "integrated_dual_diagnosis_residential",
    label: "Integrated adult dual-diagnosis residential",
    workbookBasis: "SUD residential",
    assumptions: {
      occupancy: { low: 0.68, base: 0.78, high: 0.88 },
      netRevenuePerOccupiedBedDay: { low: 650, base: 900, high: 1200 },
      ebitdaMargin: { low: 0.08, base: 0.13, high: 0.18 },
      ebitdaMultiple: { low: 5, base: 8, high: 10 }
    }
  },
  {
    id: "crisis_subacute_step_down",
    label: "Crisis residential and subacute step-down",
    workbookBasis: "Public/complex",
    assumptions: {
      occupancy: { low: 0.7, base: 0.8, high: 0.88 },
      netRevenuePerOccupiedBedDay: { low: 500, base: 700, high: 900 },
      ebitdaMargin: { low: 0.08, base: 0.12, high: 0.16 },
      ebitdaMultiple: { low: 5, base: 7, high: 9 }
    }
  },
  {
    id: "long_term_psychiatric_rehabilitation",
    label: "Long-term psychiatric rehabilitation",
    workbookBasis: "Mixed residential",
    assumptions: {
      occupancy: { low: 0.7, base: 0.8, high: 0.88 },
      netRevenuePerOccupiedBedDay: { low: 550, base: 800, high: 1050 },
      ebitdaMargin: { low: 0.08, base: 0.12, high: 0.16 },
      ebitdaMultiple: { low: 5, base: 7, high: 9 }
    }
  },
  {
    id: "selected_sud_residential",
    label: "Selected SUD-primary residential",
    workbookBasis: "SUD residential",
    assumptions: {
      occupancy: { low: 0.68, base: 0.78, high: 0.88 },
      netRevenuePerOccupiedBedDay: { low: 650, base: 900, high: 1200 },
      ebitdaMargin: { low: 0.08, base: 0.13, high: 0.18 },
      ebitdaMultiple: { low: 5, base: 8, high: 10 }
    }
  },
  {
    id: "specialty_commercial_residential",
    label: "Specialty commercial residential",
    workbookBasis: "Specialty/commercial",
    assumptions: {
      occupancy: { low: 0.65, base: 0.78, high: 0.9 },
      netRevenuePerOccupiedBedDay: { low: 800, base: 1100, high: 1500 },
      ebitdaMargin: { low: 0.1, base: 0.16, high: 0.22 },
      ebitdaMultiple: { low: 6, base: 9, high: 12 }
    }
  },
  {
    id: "psychiatric_hospital_platform",
    label: "Psychiatric hospital platform",
    workbookBasis: "Hospital-heavy",
    assumptions: {
      occupancy: { low: 0.72, base: 0.82, high: 0.9 },
      netRevenuePerOccupiedBedDay: { low: 1200, base: 1600, high: 2200 },
      ebitdaMargin: { low: 0.07, base: 0.11, high: 0.15 },
      ebitdaMultiple: { low: 5, base: 7, high: 9 }
    }
  },
  {
    id: "youth_specialty_residential",
    label: "Youth and young-adult specialty residential",
    workbookBasis: "Youth/specialty",
    assumptions: {
      occupancy: { low: 0.65, base: 0.78, high: 0.9 },
      netRevenuePerOccupiedBedDay: { low: 750, base: 1050, high: 1400 },
      ebitdaMargin: { low: 0.09, base: 0.15, high: 0.21 },
      ebitdaMultiple: { low: 6, base: 9, high: 12 }
    }
  }
]);

export class AcquisitionValuationValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AcquisitionValuationValidationError";
  }
}

/** @returns {never} */
function invalid(message) {
  throw new AcquisitionValuationValidationError(message);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredFiniteNumber(value, field) {
  const numeric = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(numeric)) invalid(`${field} must be a finite number.`);
  return numeric;
}

function validateOrderedCaseValues(value, field, { minimum, maximum = Number.POSITIVE_INFINITY }) {
  if (!isObject(value)) invalid(`${field} must include low, base, and high values.`);
  const normalized = {
    low: requiredFiniteNumber(value.low, `${field}.low`),
    base: requiredFiniteNumber(value.base, `${field}.base`),
    high: requiredFiniteNumber(value.high, `${field}.high`)
  };
  CASES.forEach((caseName) => {
    if (normalized[caseName] < minimum || normalized[caseName] > maximum) {
      invalid(`${field}.${caseName} must be between ${minimum} and ${maximum}.`);
    }
  });
  if (!(normalized.low <= normalized.base && normalized.base <= normalized.high)) {
    invalid(`${field} values must be ordered low, base, then high.`);
  }
  return normalized;
}

export function findAcquisitionValuationSegment(segmentId) {
  return ACQUISITION_VALUATION_SEGMENTS.find((segment) => segment.id === segmentId) ?? null;
}

export function validateAcquisitionValuationInput(value) {
  if (!isObject(value)) invalid("Valuation request must be a JSON object.");
  const segmentId = typeof value.segmentId === "string" ? value.segmentId.trim() : "";
  const segment = findAcquisitionValuationSegment(segmentId);
  if (!segment) invalid("segmentId is not supported.");

  const bedsLow = requiredFiniteNumber(value.bedsLow, "bedsLow");
  const bedsHigh = requiredFiniteNumber(value.bedsHigh, "bedsHigh");
  if (!Number.isInteger(bedsLow) || bedsLow <= 0) invalid("bedsLow must be a positive whole number.");
  if (!Number.isInteger(bedsHigh) || bedsHigh <= 0) invalid("bedsHigh must be a positive whole number.");
  if (bedsHigh < bedsLow) invalid("bedsHigh must be greater than or equal to bedsLow.");

  const suppliedAssumptions = value.assumptions == null ? segment.assumptions : value.assumptions;
  if (!isObject(suppliedAssumptions)) invalid("assumptions must be an object.");
  return {
    operatorId: typeof value.operatorId === "string" ? value.operatorId.trim().slice(0, 80) : null,
    segmentId,
    bedsLow,
    bedsHigh,
    assumptions: {
      occupancy: validateOrderedCaseValues(suppliedAssumptions.occupancy, "assumptions.occupancy", {
        minimum: 0.01,
        maximum: 1
      }),
      netRevenuePerOccupiedBedDay: validateOrderedCaseValues(
        suppliedAssumptions.netRevenuePerOccupiedBedDay,
        "assumptions.netRevenuePerOccupiedBedDay",
        { minimum: 1, maximum: 100_000 }
      ),
      ebitdaMargin: validateOrderedCaseValues(suppliedAssumptions.ebitdaMargin, "assumptions.ebitdaMargin", {
        minimum: -1,
        maximum: 1
      }),
      ebitdaMultiple: validateOrderedCaseValues(suppliedAssumptions.ebitdaMultiple, "assumptions.ebitdaMultiple", {
        minimum: 0.1,
        maximum: 100
      })
    }
  };
}

function rounded(value) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function calculateAcquisitionValuationModel(input) {
  const normalized = validateAcquisitionValuationInput(input);
  const segment = findAcquisitionValuationSegment(normalized.segmentId);
  if (!segment) invalid("segmentId is not supported.");
  const beds = {
    low: normalized.bedsLow,
    base: (normalized.bedsLow + normalized.bedsHigh) / 2,
    high: normalized.bedsHigh
  };
  const outputs = Object.fromEntries(CASES.map((caseName) => {
    const revenue = beds[caseName] * normalized.assumptions.occupancy[caseName] * DAYS_PER_YEAR *
      normalized.assumptions.netRevenuePerOccupiedBedDay[caseName] / DOLLAR_TO_MILLIONS;
    const ebitda = revenue * normalized.assumptions.ebitdaMargin[caseName];
    const enterpriseValue = ebitda * normalized.assumptions.ebitdaMultiple[caseName];
    return [caseName, {
      beds: rounded(beds[caseName]),
      occupancy: normalized.assumptions.occupancy[caseName],
      netRevenuePerOccupiedBedDay: normalized.assumptions.netRevenuePerOccupiedBedDay[caseName],
      ebitdaMargin: normalized.assumptions.ebitdaMargin[caseName],
      ebitdaMultiple: normalized.assumptions.ebitdaMultiple[caseName],
      revenueMillions: rounded(revenue),
      ebitdaMillions: rounded(ebitda),
      enterpriseValueMillions: rounded(enterpriseValue)
    }];
  }));

  return {
    version: ACQUISITION_VALUATION_CONTRACT_VERSION,
    modelVersion: ACQUISITION_VALUATION_MODEL_VERSION,
    status: "illustrative_screening_only",
    operatorId: normalized.operatorId,
    segment: { id: segment.id, label: segment.label, workbookBasis: segment.workbookBasis },
    assumptions: normalized.assumptions,
    outputs,
    formulas: ACQUISITION_VALUATION_FORMULAS,
    limitations: [
      "No company value is established without verified operating inputs.",
      "Enterprise value excludes debt, cash, lease obligations, and real-estate adjustments.",
      "The output is a screening range, not a fairness opinion or purchase-price recommendation."
    ]
  };
}

function normalizedAddressKey(address) {
  return [address?.street1, address?.city, address?.stateCode, address?.zip]
    .map((value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""))
    .join("|");
}

export function buildKnownCapacitySliceValuation({ operatorId, segmentId, licenseEvidence }) {
  if (!segmentId || !findAcquisitionValuationSegment(segmentId)) return null;
  const licenses = Array.isArray(licenseEvidence?.licenses) ? licenseEvidence.licenses : [];
  const reportedCapacity = Array.isArray(licenseEvidence?.reportedCapacity) ? licenseEvidence.reportedCapacity : [];
  const coreLicenses = licenses.filter((record) =>
    record?.license?.status === "active" &&
    record?.capacity?.scopeClassification === "core_target" &&
    Number.isFinite(record?.capacity?.licensedBeds) &&
    record.capacity.licensedBeds > 0
  );
  const licensedAddresses = new Set(coreLicenses.map((record) => normalizedAddressKey(record.address)));
  const coreReported = reportedCapacity.filter((record) =>
    record?.capacity?.evidenceBasis === "operator_reported" &&
    record?.capacity?.scopeClassification === "core_target" &&
    Number.isFinite(record?.capacity?.reportedBeds) &&
    record.capacity.reportedBeds > 0
  );
  const nonOverlappingReported = coreReported.filter((record) => !licensedAddresses.has(normalizedAddressKey(record.address)));
  const overlappingReported = coreReported.filter((record) => licensedAddresses.has(normalizedAddressKey(record.address)));
  const verifiedLicensedBeds = coreLicenses.reduce((sum, record) => sum + record.capacity.licensedBeds, 0);
  const operatorReportedBeds = nonOverlappingReported.reduce((sum, record) => sum + record.capacity.reportedBeds, 0);
  const overlappingReportedBedsExcluded = overlappingReported.reduce((sum, record) => sum + record.capacity.reportedBeds, 0);
  const valuedBeds = verifiedLicensedBeds + operatorReportedBeds;
  if (!valuedBeds) return null;

  const valuation = calculateAcquisitionValuationModel({
    operatorId,
    segmentId,
    bedsLow: valuedBeds,
    bedsHigh: valuedBeds
  });
  const capacityBasis = verifiedLicensedBeds && operatorReportedBeds
    ? "current_core_licenses_plus_non_overlapping_operator_reports"
    : verifiedLicensedBeds
      ? "current_core_licenses_only"
      : "operator_reported_core_capacity_only";
  return {
    status: "known_capacity_slice_estimate",
    scope: "known_current_non_california_core_capacity_slice_only",
    isWholeCompanyEstimate: false,
    capacityBasis,
    capacityConfidence: operatorReportedBeds
      ? "medium"
      : coreLicenses.every((record) => record.capacity.confidence === "high")
        ? "high"
        : "medium",
    estimateConfidence: "low",
    capacity: {
      verifiedLicensedBeds,
      nonOverlappingOperatorReportedBeds: operatorReportedBeds,
      overlappingOperatorReportedBedsExcluded: overlappingReportedBedsExcluded,
      valuedBeds,
      licensedPrograms: coreLicenses.length,
      reportedPrograms: nonOverlappingReported.length
    },
    valuation,
    limitations: [
      "This values only the currently evidenced non-California core-bed slice, not the whole operating parent.",
      "Portfolio completeness, occupancy, reimbursement, margin, and transaction multiple remain unverified.",
      ...(overlappingReportedBedsExcluded
        ? [`${overlappingReportedBedsExcluded} operator-reported beds overlap a licensed address and are excluded from the valued-bed total.`]
        : [])
    ]
  };
}
