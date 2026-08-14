const CACHEABLE_TRUTH_STATES = new Set(["valid_rows", "verified_zero"]);

/**
 * @typedef {object} CertifiedCachePolicyDependencies
 * @property {(value: unknown) => string} [normalizeText]
 * @property {(content: string, communities: any) => any} [findFacility]
 * @property {(value: unknown, result: any) => string} [normalizeTruthState]
 * @property {(executionPlan: any, result: any) => { valid: boolean, errors: string[] }} [validateResultAgainstPlan]
 * @property {(content: string, rows: any[]) => string | null} [getRequestedMedicationName]
 * @property {(reportsSummary: any) => any[]} [getMedicationRows]
 */

function defaultNormalizeText(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function flattenResultText(result) {
  const visualRows = Array.isArray(result?.visual?.rows) ? result.visual.rows : [];
  const visualColumns = Array.isArray(result?.visual?.columns) ? result.visual.columns : [];
  const actions = Array.isArray(result?.actions) ? result.actions : [];
  const trace = result?.trace && typeof result.trace === "object" ? result.trace : {};
  return [
    result?.tool,
    result?.text,
    result?.truthState,
    trace.tool,
    trace.period,
    trace.note,
    trace.communityName,
    trace.facilityId,
    trace.dataSource,
    result?.visual?.title,
    result?.visual?.subtitle,
    result?.visual?.valueLabel,
    ...visualColumns,
    ...visualRows.flatMap((row) => [row?.label, row?.meta, row?.value, ...(row?.cells ?? [])]),
    result?.artifact?.filename,
    result?.artifact?.rowSetId,
    result?.provenance?.dataset,
    ...actions.flatMap((action) => [action?.label, action?.prompt, action?.route])
  ].filter((value) => value != null).join(" ");
}

function includesNormalized(haystack, needle, normalizeText) {
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedNeedle) return true;
  return normalizeText(haystack).includes(normalizedNeedle);
}

function expectedResidentMatches({ expected, cachedResult, normalizeText }) {
  if (!expected?.residentName) return true;
  return includesNormalized(flattenResultText(cachedResult), expected.residentName, normalizeText);
}

function expectedMetricGrainMatches({ expected, cachedResult, normalizeText }) {
  if (!expected?.metricGrain) return true;
  const valueLabel = normalizeText(cachedResult?.visual?.valueLabel ?? "");
  const text = normalizeText(flattenResultText(cachedResult));
  if (expected.metricGrain === "distinct_residents") {
    return /\b(resident|residents|client|clients|people|person)\b/.test(valueLabel || text);
  }
  if (expected.metricGrain === "incident_events") {
    return /\b(incident|incidents|event|events|row|rows)\b/.test(valueLabel || text);
  }
  return true;
}

function expectedPresentationMatches({ expected, cachedResult }) {
  if (!expected?.presentation) return true;
  if (expected.presentation === "table" && expected.mode !== "detail") return true;
  return Boolean(cachedResult?.visual);
}

function requestedMedicationMatches({ content, cachedResult, reportsSummary, getRequestedMedicationName, getMedicationRows, normalizeText }) {
  const requestedMedication = getRequestedMedicationName?.(content, getMedicationRows?.(reportsSummary) ?? []) ?? null;
  if (!requestedMedication) return { valid: true };
  if (includesNormalized(flattenResultText(cachedResult), requestedMedication, normalizeText)) return { valid: true };
  return {
    valid: false,
    reason: `medication scope mismatch: ${requestedMedication}`
  };
}

/** @param {CertifiedCachePolicyDependencies} [dependencies] */
export function createCertifiedCachePolicy(dependencies = {}) {
  const {
    normalizeText = defaultNormalizeText,
    findFacility,
    normalizeTruthState,
    validateResultAgainstPlan,
    getRequestedMedicationName,
    getMedicationRows
  } = dependencies;
  function shouldBypassCertifiedCache({ content, certifiedQuestion, reportsSummary }) {
    if (!certifiedQuestion) return false;
    if (certifiedQuestion.id === "medication-refusal-detail") {
      return Boolean(getRequestedMedicationName?.(content, getMedicationRows?.(reportsSummary) ?? []));
    }
    if (certifiedQuestion.id === "length-of-stay") {
      return /\bwho\b|\blongest(?:\s+current)?\s+(?:length of )?stay\b/i.test(String(content ?? ""));
    }
    return false;
  }

  function cachedResultMatchesRequestedScope({ cachedResult, content, communities }) {
    const requestedFacility = findFacility?.(content, communities);
    if (!requestedFacility) return true;
    const trace = cachedResult?.trace ?? {};
    return String(trace.facilityId ?? "") === String(requestedFacility.facility_id ?? "") ||
      normalizeText(trace.communityName) === normalizeText(requestedFacility.community_name);
  }

  function certifiedCacheEligible({
    cachedResult,
    content,
    communities,
    executionPlan,
    expectedTool,
    reportsSummary,
    certifiedQuestion
  }) {
    if (!cachedResult?.handled) return { eligible: false, reason: "missing cached result" };
    const acceptedRecovery = expectedTool === "resident_lookup" && cachedResult.tool === "data_recovery";
    if (expectedTool && cachedResult.tool !== expectedTool && !acceptedRecovery) {
      return { eligible: false, reason: `tool mismatch: expected ${expectedTool}, cached ${cachedResult.tool ?? "none"}` };
    }
    if (shouldBypassCertifiedCache({ content, certifiedQuestion, reportsSummary })) {
      return { eligible: false, reason: "specific filter bypasses certified cache" };
    }
    if (!cachedResultMatchesRequestedScope({ cachedResult, content, communities })) {
      return { eligible: false, reason: "community scope mismatch" };
    }

    const truthState = normalizeTruthState?.(cachedResult.truthState, cachedResult) ?? cachedResult.truthState;
    if (!CACHEABLE_TRUTH_STATES.has(String(truthState))) {
      return { eligible: false, reason: `non-cacheable truth state: ${truthState}` };
    }
    if (cachedResult.safeRefusal || cachedResult.contractViolation) {
      return { eligible: false, reason: "cached refusal or contract violation" };
    }

    const expected = executionPlan?.expected ?? {};
    if (!expectedResidentMatches({ expected, cachedResult, normalizeText })) {
      return { eligible: false, reason: `resident scope mismatch: ${expected.residentName}` };
    }
    if (!expectedMetricGrainMatches({ expected, cachedResult, normalizeText })) {
      return { eligible: false, reason: `metric grain mismatch: ${expected.metricGrain}` };
    }
    if (!expectedPresentationMatches({ expected, cachedResult })) {
      return { eligible: false, reason: `presentation mismatch: ${expected.presentation}` };
    }
    const medicationValidation = requestedMedicationMatches({
      content,
      cachedResult,
      reportsSummary,
      getRequestedMedicationName,
      getMedicationRows,
      normalizeText
    });
    if (!medicationValidation.valid) return { eligible: false, reason: medicationValidation.reason ?? "medication scope mismatch" };

    const planValidation = executionPlan && validateResultAgainstPlan
      ? validateResultAgainstPlan(executionPlan, cachedResult)
      : { valid: true, errors: [] };
    if (!planValidation.valid) {
      return { eligible: false, reason: `plan mismatch: ${planValidation.errors.join("; ")}` };
    }

    return { eligible: true, reason: "eligible" };
  }

  return Object.freeze({
    cachedResultMatchesRequestedScope,
    shouldBypassCertifiedCache,
    certifiedCacheEligible
  });
}
