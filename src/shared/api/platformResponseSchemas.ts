import type {
  AdmissionsBoardCard,
  AdmissionsDashboardResponse,
  WorkforceDashboardResponse,
  AnalystQaStatus,
  AnalystTraceTelemetryResponse,
  CommunityIncidentDetailRecord,
  CommunitySnapshotResponse,
  DataExplorerResponse,
  HomeDashboardResponse,
  IncidentFeedResponse,
  LiveCommunitiesDashboardResponse,
  LiveCommunityCensusRecord,
  LiveCommunityIncidentRecord,
  LiveCommunityResidentRecord,
  LiveIncidentRecord,
  PlatformBootstrapResponse,
  PlatformHealthResponse,
  ReportsSummaryResponse
} from "../types/platformSnapshot";

type Validator<T> = (value: unknown) => T;
const MAX_RESPONSE_ARRAY_ITEMS = 100_000;
const ANALYST_QA_STATUSES = new Set<AnalystQaStatus["status"]>(["pass", "warning", "fail", "missing", "unknown"]);
const ANALYST_QA_FAILURE_STAGES = new Set(["compiler", "tool_execution", "plan_validation", "formatting"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(endpoint: string, detail: string): never {
  throw new Error(`Platform API returned an invalid ${endpoint} response: ${detail}`);
}

function assertRecord(value: unknown, endpoint: string, path = "response") {
  if (!isRecord(value)) fail(endpoint, `${path} must be an object`);
  return value;
}

function assertArray(value: unknown, endpoint: string, path: string) {
  if (!Array.isArray(value)) fail(endpoint, `${path} must be an array`);
  if (value.length > MAX_RESPONSE_ARRAY_ITEMS) {
    fail(endpoint, `${path} exceeds the ${MAX_RESPONSE_ARRAY_ITEMS.toLocaleString()}-item limit`);
  }
  return value;
}

function assertString(value: unknown, endpoint: string, path: string, options: { nullable?: boolean } = {}) {
  if (options.nullable && value === null) return;
  if (typeof value !== "string") fail(endpoint, `${path} must be a string`);
}

function assertIsoCalendarDate(value: unknown, endpoint: string, path: string, options: { optional?: boolean } = {}) {
  if (options.optional && value === undefined) return;
  assertString(value, endpoint, path);
  const text = String(value);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  ) {
    fail(endpoint, `${path} must be a valid YYYY-MM-DD calendar date`);
  }
}

function assertNumber(value: unknown, endpoint: string, path: string, options: { nullable?: boolean } = {}) {
  if (options.nullable && value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(endpoint, `${path} must be a finite number`);
}

function assertBoolean(value: unknown, endpoint: string, path: string, options: { optional?: boolean } = {}) {
  if (options.optional && value === undefined) return;
  if (typeof value !== "boolean") fail(endpoint, `${path} must be boolean`);
}

function validateRows<T>(
  rows: unknown[],
  endpoint: string,
  path: string,
  validateRow: (row: Record<string, unknown>, rowPath: string) => void
) {
  rows.forEach((row, index) => {
    validateRow(assertRecord(row, endpoint, `${path}[${index}]`), `${path}[${index}]`);
  });
  return rows as T[];
}

function assertNullableString(value: unknown, endpoint: string, path: string) {
  if (value !== null) assertString(value, endpoint, path);
}

function assertStringArray(value: unknown, endpoint: string, path: string, maximumItems: number) {
  const rows = assertArray(value, endpoint, path);
  if (rows.length > maximumItems) fail(endpoint, `${path} exceeds the ${maximumItems}-item limit`);
  rows.forEach((entry, index) => assertString(entry, endpoint, `${path}[${index}]`));
  return rows;
}

function validateAnalystQaStatusPayload(value: unknown, endpoint = "analyst QA") {
  const payload = assertRecord(value, endpoint);
  assertBoolean(payload.available, endpoint, "available");
  assertString(payload.status, endpoint, "status");
  if (!ANALYST_QA_STATUSES.has(payload.status as AnalystQaStatus["status"])) {
    fail(endpoint, `status has unsupported value ${String(payload.status)}`);
  }
  assertNullableString(payload.generatedAt, endpoint, "generatedAt");
  assertNullableString(payload.businessDate, endpoint, "businessDate");
  assertNullableString(payload.warning, endpoint, "warning");

  if (payload.summary !== null) {
    const summary = assertRecord(payload.summary, endpoint, "summary");
    ["total", "passed", "failed", "warnings", "certifiedCoverage", "cachedHits"].forEach((field) => {
      assertNumber(summary[field], endpoint, `summary.${field}`);
    });
  }

  const history = assertArray(payload.history, endpoint, "history");
  if (history.length > 7) fail(endpoint, "history exceeds the 7-item limit");
  validateRows<AnalystQaStatus["history"][number]>(history, endpoint, "history", (row, path) => {
    assertString(row.generatedAt, endpoint, `${path}.generatedAt`);
    assertNullableString(row.businessDate, endpoint, `${path}.businessDate`);
    assertString(row.status, endpoint, `${path}.status`);
    ["total", "passed", "failed"].forEach((field) => assertNumber(row[field], endpoint, `${path}.${field}`));
  });

  const failures = assertArray(payload.failures, endpoint, "failures");
  if (failures.length > 20) fail(endpoint, "failures exceeds the 20-item limit");
  validateRows<AnalystQaStatus["failures"][number]>(failures, endpoint, "failures", (row, path) => {
    assertString(row.id, endpoint, `${path}.id`);
    assertString(row.prompt, endpoint, `${path}.prompt`);
    if (row.expectedTool !== undefined) assertNullableString(row.expectedTool, endpoint, `${path}.expectedTool`);
    assertStringArray(row.failures, endpoint, `${path}.failures`, 20);

    if (row.failureDetails !== undefined) {
      const details = assertArray(row.failureDetails, endpoint, `${path}.failureDetails`);
      if (details.length > 20) fail(endpoint, `${path}.failureDetails exceeds the 20-item limit`);
      details.forEach((detail, detailIndex) => {
        const item = assertRecord(detail, endpoint, `${path}.failureDetails[${detailIndex}]`);
        assertString(item.stage, endpoint, `${path}.failureDetails[${detailIndex}].stage`);
        if (!ANALYST_QA_FAILURE_STAGES.has(String(item.stage))) {
          fail(endpoint, `${path}.failureDetails[${detailIndex}].stage is unsupported`);
        }
        assertString(item.reason, endpoint, `${path}.failureDetails[${detailIndex}].reason`);
      });
    }

    if (row.expected !== undefined && row.expected !== null) {
      const expected = assertRecord(row.expected, endpoint, `${path}.expected`);
      if (expected.periods !== undefined) assertStringArray(expected.periods, endpoint, `${path}.expected.periods`, 24);
      ["category", "communityName", "facilityId"].forEach((field) => {
        if (expected[field] !== undefined) assertNullableString(expected[field], endpoint, `${path}.expected.${field}`);
      });
    }

    if (row.actual !== undefined && row.actual !== null) {
      const actual = assertRecord(row.actual, endpoint, `${path}.actual`);
      ["tool", "period", "community", "category"].forEach((field) => {
        if (actual[field] !== undefined) assertNullableString(actual[field], endpoint, `${path}.actual.${field}`);
      });
      if (actual.rowCount !== undefined) assertNumber(actual.rowCount, endpoint, `${path}.actual.rowCount`);
      if (actual.valid !== undefined && actual.valid !== null) assertBoolean(actual.valid, endpoint, `${path}.actual.valid`);
      if (actual.validationErrors !== undefined) {
        assertStringArray(actual.validationErrors, endpoint, `${path}.actual.validationErrors`, 20);
      }
    }
  });

  return payload as unknown as AnalystQaStatus;
}

function validateResidentRow(row: Record<string, unknown>, path: string) {
  assertString(row.res_number, "communities dashboard", `${path}.res_number`);
  assertString(row.first_name, "communities dashboard", `${path}.first_name`);
  assertString(row.last_name, "communities dashboard", `${path}.last_name`);
  assertString(row.facility_id, "communities dashboard", `${path}.facility_id`);
  assertString(row.facility_name, "communities dashboard", `${path}.facility_name`);
  assertNumber(row.age, "communities dashboard", `${path}.age`);
  assertNumber(row.los_days, "communities dashboard", `${path}.los_days`);
}

function validateIncidentAggregateRow(row: Record<string, unknown>, path: string) {
  assertString(row.facility_id, "communities dashboard", `${path}.facility_id`);
  assertString(row.category, "communities dashboard", `${path}.category`);
  assertString(row.month_bucket, "communities dashboard", `${path}.month_bucket`);
  assertNumber(row.incident_count, "communities dashboard", `${path}.incident_count`);
}

function validateCensusRow(row: Record<string, unknown>, path: string) {
  assertString(row.facility_id, "communities dashboard", `${path}.facility_id`);
  assertString(row.month_bucket, "communities dashboard", `${path}.month_bucket`);
  assertNumber(row.census, "communities dashboard", `${path}.census`);
}

function validateFacilityRow(row: Record<string, unknown>, endpoint: string, path: string) {
  assertString(row.facility_id, endpoint, `${path}.facility_id`);
  assertString(row.community_name, endpoint, `${path}.community_name`);
  assertNumber(row.total_residents, endpoint, `${path}.total_residents`);
}

function validateIncidentDetailRow(row: Record<string, unknown>, path: string) {
  assertString(row.id, "community snapshot", `${path}.id`);
  assertString(row.facility_id, "community snapshot", `${path}.facility_id`);
  assertString(row.facility_name, "community snapshot", `${path}.facility_name`);
  assertString(row.client_name, "community snapshot", `${path}.client_name`);
  assertString(row.month_bucket, "community snapshot", `${path}.month_bucket`);
  assertString(row.category, "community snapshot", `${path}.category`);
  assertString(row.incident_type, "community snapshot", `${path}.incident_type`);
  assertBoolean(row.injury_occurred, "community snapshot", `${path}.injury_occurred`);
  assertBoolean(row.police_called, "community snapshot", `${path}.police_called`);
}

function validateLiveIncidentRow(row: Record<string, unknown>, path: string) {
  assertString(row.id, "incident stream", `${path}.id`);
  assertString(row.priority, "incident stream", `${path}.priority`);
  assertString(row.stage, "incident stream", `${path}.stage`);
  assertString(row.facility_id, "incident stream", `${path}.facility_id`);
  assertString(row.facility_name, "incident stream", `${path}.facility_name`);
  assertString(row.client_name, "incident stream", `${path}.client_name`);
  assertString(row.incident_type, "incident stream", `${path}.incident_type`);
  assertString(row.received_at, "incident stream", `${path}.received_at`);
}

function validateAnalyticsSummaryPayload(value: unknown, endpoint: string) {
  const payload = assertRecord(value, endpoint);
  const census = assertArray(payload.census, endpoint, "census");
  const medicationCompliance = assertArray(payload.medicationCompliance, endpoint, "medicationCompliance");
  const refusalByMedication = assertArray(payload.refusalByMedication, endpoint, "refusalByMedication");
  const documentationGaps = assertArray(payload.documentationGaps, endpoint, "documentationGaps");

  validateRows<ReportsSummaryResponse["census"][number]>(census, endpoint, "census", (row, path) => {
    assertString(row.facility_id, endpoint, `${path}.facility_id`);
    assertString(row.month_bucket, endpoint, `${path}.month_bucket`);
    assertNumber(row.census, endpoint, `${path}.census`);
  });
  validateRows<ReportsSummaryResponse["medicationCompliance"][number]>(medicationCompliance, endpoint, "medicationCompliance", (row, path) => {
    assertString(row.facility_id, endpoint, `${path}.facility_id`);
    assertString(row.month_bucket, endpoint, `${path}.month_bucket`);
    assertNumber(row.total_scheduled, endpoint, `${path}.total_scheduled`);
    assertNumber(row.given, endpoint, `${path}.given`);
    assertNumber(row.not_given, endpoint, `${path}.not_given`);
  });
  validateRows<ReportsSummaryResponse["refusalByMedication"][number]>(refusalByMedication, endpoint, "refusalByMedication", (row, path) => {
    assertString(row.facility_id, endpoint, `${path}.facility_id`);
    assertString(row.medication, endpoint, `${path}.medication`);
    assertNumber(row.refusals, endpoint, `${path}.refusals`);
  });
  validateRows<ReportsSummaryResponse["documentationGaps"][number]>(documentationGaps, endpoint, "documentationGaps", (row, path) => {
    assertString(row.resident_id, endpoint, `${path}.resident_id`);
    assertString(row.resident_name, endpoint, `${path}.resident_name`);
    assertString(row.facility_id, endpoint, `${path}.facility_id`);
    assertNumber(row.days_since_last_note, endpoint, `${path}.days_since_last_note`);
  });

  return payload as unknown as ReportsSummaryResponse;
}

function validateAdmissionsDashboardPayload(value: unknown) {
  const endpoint = "admissions dashboard";
  const payload = assertRecord(value, endpoint);
  assertString(payload.generated_at, endpoint, "generated_at");
  assertIsoCalendarDate(payload.as_of_date, endpoint, "as_of_date");
  assertString(payload.month, endpoint, "month");
  assertString(payload.prior_month, endpoint, "prior_month");
  const assertCounts = (value: unknown, path: string, fields: string[]) => {
    const record = assertRecord(value, endpoint, path);
    fields.forEach((field) => assertNumber(record[field], endpoint, `${path}.${field}`));
    return record;
  };
  const assertCommunityReferrals = (value: unknown, path: string) =>
    assertCounts(value, path, ["onBoard", "inDecision", "needsAttention"]);
  const assertTotals = (totalsValue: unknown, path: string) => {
    const totals = assertRecord(totalsValue, endpoint, path);
    ["admissions", "discharges", "net"].forEach((field) => assertNumber(totals[field], endpoint, `${path}.${field}`));
  };
  const assertWebLink = (value: unknown, path: string) => {
    assertString(value, endpoint, path);
    if (!/^https?:\/\//.test(String(value))) fail(endpoint, `${path} must be a web link`);
  };
  const assertTimestamp = (value: unknown, path: string) => {
    assertString(value, endpoint, path);
    if (!Number.isFinite(Date.parse(String(value)))) fail(endpoint, `${path} must be a valid timestamp`);
  };
  const assertBriefingReferral = (value: unknown, path: string) => {
    const row = assertRecord(value, endpoint, path);
    assertNumber(row.referralId, endpoint, `${path}.referralId`);
    ["clientName", "community", "owner", "status"].forEach((field) => assertString(row[field], endpoint, `${path}.${field}`));
    ["sourceName", "sourceCategory", "referringCounty", "facilityId"].forEach((field) => assertString(row[field], endpoint, `${path}.${field}`, { nullable: true }));
    assertTimestamp(row.receivedAt, `${path}.receivedAt`);
    assertWebLink(row.pipelineUrl, `${path}.pipelineUrl`);
  };
  const assertBriefingAssessment = (value: unknown, path: string) => {
    const row = assertRecord(value, endpoint, path);
    assertNumber(row.referralId, endpoint, `${path}.referralId`);
    ["clientName", "community", "owner", "status"].forEach((field) => assertString(row[field], endpoint, `${path}.${field}`));
    assertString(row.facilityId, endpoint, `${path}.facilityId`, { nullable: true });
    assertTimestamp(row.scheduledAt, `${path}.scheduledAt`);
    assertWebLink(row.pipelineUrl, `${path}.pipelineUrl`);
  };
  const assertBriefingMoveIn = (value: unknown, path: string) => {
    const row = assertRecord(value, endpoint, path);
    assertNumber(row.referralId, endpoint, `${path}.referralId`);
    ["clientName", "community", "owner", "status"].forEach((field) => assertString(row[field], endpoint, `${path}.${field}`));
    assertString(row.facilityId, endpoint, `${path}.facilityId`, { nullable: true });
    assertTimestamp(row.plannedAt, `${path}.plannedAt`);
    assertWebLink(row.pipelineUrl, `${path}.pipelineUrl`);
    if (!["ready", "watch", "blocked", "unknown"].includes(String(row.readiness))) {
      fail(endpoint, `${path}.readiness is not a known state`);
    }
  };
  const portfolio = assertRecord(payload.portfolio, endpoint, "portfolio");
  ["census", "censusChange", "operatingLimit", "occupancyPct"].forEach((field) => assertNumber(portfolio[field], endpoint, `portfolio.${field}`, { nullable: true }));
  ["monthToDate", "lastMonth", "recentWeeks"].forEach((field) => assertTotals(portfolio[field], `portfolio.${field}`));
  for (const seriesKey of ["weekly", "monthly"]) {
    const series = assertArray(payload[seriesKey], endpoint, seriesKey);
    if (series.length > 12) fail(endpoint, `${seriesKey} exceeds the 12-item limit`);
    series.forEach((point, index) => {
      assertTotals(point, `${seriesKey}[${index}]`);
      assertString((point as Record<string, unknown>).period, endpoint, `${seriesKey}[${index}].period`);
    });
  }
  const communities = assertArray(payload.communities, endpoint, "communities");
  if (communities.length > 10) fail(endpoint, "communities exceeds the 10-item limit");
  validateRows<AdmissionsDashboardResponse["communities"][number]>(communities, endpoint, "communities", (row, path) => {
    ["facilityId", "communityName", "shortName"].forEach((field) => assertString(row[field], endpoint, `${path}.${field}`));
    ["census", "censusChange", "operatingLimit", "occupancyPct"].forEach((field) => assertNumber(row[field], endpoint, `${path}.${field}`, { nullable: true }));
    ["monthToDate", "lastMonth", "recentWeeks"].forEach((field) => assertTotals(row[field], `${path}.${field}`));
    if (row.referrals !== null) assertCommunityReferrals(row.referrals, `${path}.referrals`);
  });
  const trend = assertArray(payload.referral_trend, endpoint, "referral_trend");
  if (trend.length > 12) fail(endpoint, "referral_trend exceeds the 12-item limit");
  trend.forEach((pointValue, index) => {
    const point = assertRecord(pointValue, endpoint, `referral_trend[${index}]`);
    assertString(point.month, endpoint, `referral_trend[${index}].month`);
    ["received", "accepted", "censusAdmissions"].forEach((field) => assertNumber(point[field], endpoint, `referral_trend[${index}].${field}`));
  });
  const referralPipeline = assertRecord(payload.referral_pipeline, endpoint, "referral_pipeline");
  if (!["connected", "not_connected", "unavailable"].includes(String(referralPipeline.status))) {
    fail(endpoint, "referral_pipeline.status is not a known state");
  }
  if (referralPipeline.status === "connected") {
    assertString(referralPipeline.generatedAt, endpoint, "referral_pipeline.generatedAt");
    const board = assertRecord(referralPipeline.board, endpoint, "referral_pipeline.board");
    assertNumber(board.total, endpoint, "referral_pipeline.board.total");
    assertBoolean(board.truncated, endpoint, "referral_pipeline.board.truncated");
    const columns = assertArray(board.columns, endpoint, "referral_pipeline.board.columns");
    if (columns.length !== 3) fail(endpoint, "referral_pipeline.board.columns must contain the three board columns");
    columns.forEach((columnValue, index) => {
      const path = `referral_pipeline.board.columns[${index}]`;
      const column = assertCounts(columnValue, path, ["count"]);
      ["key", "label"].forEach((field) => assertString(column[field], endpoint, `${path}.${field}`));
      assertArray(column.statuses, endpoint, `${path}.statuses`).forEach((row, statusIndex) => {
        assertString(assertCounts(row, `${path}.statuses[${statusIndex}]`, ["count"]).status, endpoint, `${path}.statuses[${statusIndex}].status`);
      });
    });
    const cards = assertArray(board.cards, endpoint, "referral_pipeline.board.cards");
    if (cards.length > 300) fail(endpoint, "referral_pipeline.board.cards exceeds the 300-item limit");
    validateRows<AdmissionsBoardCard>(cards, endpoint, "referral_pipeline.board.cards", (card, path) => {
      ["referralId", "daysSinceUpdate"].forEach((field) => assertNumber(card[field], endpoint, `${path}.${field}`));
      assertNumber(card.daysOpen, endpoint, `${path}.daysOpen`, { nullable: true });
      ["clientName", "column", "status", "nextAction", "community", "owner", "priority", "pipelineUrl"].forEach((field) => assertString(card[field], endpoint, `${path}.${field}`));
      ["facilityId", "plannedAdmissionDate"].forEach((field) => assertString(card[field], endpoint, `${path}.${field}`, { nullable: true }));
      const flags = assertRecord(card.flags, endpoint, `${path}.flags`);
      ["stale", "unassigned", "moveInOverdue"].forEach((field) => assertBoolean(flags[field], endpoint, `${path}.flags.${field}`));
      const profile = assertRecord(card.managementProfile, endpoint, `${path}.managementProfile`);
      ["dateOfBirth", "referralSource", "referringCounty", "payer", "responsiblePerson", "conservedStatus", "documentStatus", "assessmentStatus", "assessmentDate", "medicationSource"].forEach((field) => assertString(profile[field], endpoint, `${path}.managementProfile.${field}`, { nullable: true }));
      assertBoolean(profile.assessmentSigned, endpoint, `${path}.managementProfile.assessmentSigned`);
      ["openRequirements", "blockingRequirements"].forEach((field) => assertNumber(profile[field], endpoint, `${path}.managementProfile.${field}`));
      assertArray(profile.overview, endpoint, `${path}.managementProfile.overview`).forEach((value, index) => assertString(value, endpoint, `${path}.managementProfile.overview[${index}]`));
      assertArray(profile.medications, endpoint, `${path}.managementProfile.medications`).forEach((value, index) => assertString(value, endpoint, `${path}.managementProfile.medications[${index}]`));
      assertArray(profile.supportSnapshot, endpoint, `${path}.managementProfile.supportSnapshot`).forEach((itemValue, index) => {
        const item = assertRecord(itemValue, endpoint, `${path}.managementProfile.supportSnapshot[${index}]`);
        assertString(item.label, endpoint, `${path}.managementProfile.supportSnapshot[${index}].label`);
        assertString(item.value, endpoint, `${path}.managementProfile.supportSnapshot[${index}].value`);
      });
      if (!/^https?:\/\//.test(String(card.pipelineUrl))) fail(endpoint, `${path}.pipelineUrl must be a web link`);
    });
    assertCounts(referralPipeline.metrics, "referral_pipeline.metrics", ["onBoard", "stale", "unassigned", "awaitingAdmission"]);
    assertCounts(referralPipeline.upcomingAdmissions, "referral_pipeline.upcomingAdmissions", ["next7Days", "next30Days", "pastPlannedDate", "noPlannedDate"]);
    const pipelineBriefing = assertRecord(referralPipeline.briefing, endpoint, "referral_pipeline.briefing");
    if (!["not_supported", "ready"].includes(String(pipelineBriefing.status))) {
      fail(endpoint, "referral_pipeline.briefing.status is not a known state");
    }
    if (pipelineBriefing.status === "ready") {
      if (pipelineBriefing.timezone !== "America/Los_Angeles") fail(endpoint, "referral_pipeline.briefing.timezone is not supported");
      assertIsoCalendarDate(pipelineBriefing.windowEnd, endpoint, "referral_pipeline.briefing.windowEnd");
      const coverage = assertRecord(pipelineBriefing.coverage, endpoint, "referral_pipeline.briefing.coverage");
      ["recentReferrals", "assessments", "moveIns", "weeklyTrend"].forEach((field) => assertBoolean(coverage[field], endpoint, `referral_pipeline.briefing.coverage.${field}`));
      const recentReferrals = assertArray(pipelineBriefing.recentReferrals, endpoint, "referral_pipeline.briefing.recentReferrals");
      if (recentReferrals.length > 500) fail(endpoint, "referral_pipeline.briefing.recentReferrals exceeds the 500-item limit");
      recentReferrals.forEach((row, index) => assertBriefingReferral(row, `referral_pipeline.briefing.recentReferrals[${index}]`));
      const assessments = assertArray(pipelineBriefing.upcomingAssessments, endpoint, "referral_pipeline.briefing.upcomingAssessments");
      const moveIns = assertArray(pipelineBriefing.plannedMoveIns, endpoint, "referral_pipeline.briefing.plannedMoveIns");
      if (assessments.length > 100 || moveIns.length > 100) fail(endpoint, "referral_pipeline.briefing weekly schedule exceeds the 100-item limit");
      assessments.forEach((row, index) => assertBriefingAssessment(row, `referral_pipeline.briefing.upcomingAssessments[${index}]`));
      moveIns.forEach((row, index) => assertBriefingMoveIn(row, `referral_pipeline.briefing.plannedMoveIns[${index}]`));
      const weeklyTrend = assertArray(pipelineBriefing.weeklyTrend, endpoint, "referral_pipeline.briefing.weeklyTrend");
      if (weeklyTrend.length > 12) fail(endpoint, "referral_pipeline.briefing.weeklyTrend exceeds the 12-item limit");
      weeklyTrend.forEach((pointValue, index) => {
        const point = assertCounts(pointValue, `referral_pipeline.briefing.weeklyTrend[${index}]`, ["received", "accepted"]);
        assertIsoCalendarDate(point.weekStart, endpoint, `referral_pipeline.briefing.weeklyTrend[${index}].weekStart`);
      });
    }
    const history = assertRecord(referralPipeline.history, endpoint, "referral_pipeline.history");
    const monthFields = ["received", "accepted", "declined", "admitted"];
    assertString(assertCounts(history.monthOutcomes, "referral_pipeline.history.monthOutcomes", monthFields).month, endpoint, "referral_pipeline.history.monthOutcomes.month");
    assertArray(history.monthly, endpoint, "referral_pipeline.history.monthly").forEach((row, index) => {
      assertString(assertCounts(row, `referral_pipeline.history.monthly[${index}]`, monthFields).month, endpoint, `referral_pipeline.history.monthly[${index}].month`);
    });
    const timing = assertCounts(history.decisionTiming, "referral_pipeline.history.decisionTiming", ["windowDays", "decisionsCounted"]);
    assertNumber(timing.medianDaysToDecision, endpoint, "referral_pipeline.history.decisionTiming.medianDaysToDecision", { nullable: true });
  }
  const briefing = assertRecord(payload.briefing, endpoint, "briefing");
  if (!["ready", "source_upgrade_required", "not_connected", "unavailable"].includes(String(briefing.sourceStatus))) {
    fail(endpoint, "briefing.sourceStatus is not a known state");
  }
  ["asOfDate", "weekStart", "weekEnd"].forEach((field) => assertIsoCalendarDate(briefing[field], endpoint, `briefing.${field}`));
  assertString(briefing.pipelineAsOfDate, endpoint, "briefing.pipelineAsOfDate", { nullable: true });
  if (briefing.pipelineAsOfDate !== null) assertIsoCalendarDate(briefing.pipelineAsOfDate, endpoint, "briefing.pipelineAsOfDate");
  const briefingCoverage = assertRecord(briefing.coverage, endpoint, "briefing.coverage");
  ["recentReferrals", "assessments", "moveIns", "weeklyTrend", "completedMoveIns"].forEach((field) => assertBoolean(briefingCoverage[field], endpoint, `briefing.coverage.${field}`));
  const briefingTotals = assertRecord(briefing.totals, endpoint, "briefing.totals");
  ["census", "newReferrals7d", "newReferrals14d", "assessmentsThisWeek", "plannedMoveInsThisWeek", "completedMoveInsThisWeek"].forEach((field) => assertNumber(briefingTotals[field], endpoint, `briefing.totals.${field}`, { nullable: true }));
  const briefingCommunities = assertArray(briefing.communities, endpoint, "briefing.communities");
  if (briefingCommunities.length > 11) fail(endpoint, "briefing.communities exceeds the 11-item limit");
  briefingCommunities.forEach((rowValue, index) => {
    const row = assertRecord(rowValue, endpoint, `briefing.communities[${index}]`);
    ["facilityId", "communityName", "shortName"].forEach((field) => assertString(row[field], endpoint, `briefing.communities[${index}].${field}`));
    ["census", "operatingLimit", "occupancyPct", "newReferrals7d", "newReferrals14d", "assessmentsThisWeek", "plannedMoveInsThisWeek", "completedMoveInsThisWeek"].forEach((field) => assertNumber(row[field], endpoint, `briefing.communities[${index}].${field}`, { nullable: true }));
  });
  const origins = assertArray(briefing.origins, endpoint, "briefing.origins");
  if (origins.length > 500) fail(endpoint, "briefing.origins exceeds the 500-item limit");
  origins.forEach((rowValue, index) => {
    const row = assertCounts(rowValue, `briefing.origins[${index}]`, ["last7Days", "previous7Days", "total14Days"]);
    ["key", "sourceName"].forEach((field) => assertString(row[field], endpoint, `briefing.origins[${index}].${field}`));
    ["sourceCategory", "referringCounty"].forEach((field) => assertString(row[field], endpoint, `briefing.origins[${index}].${field}`, { nullable: true }));
    assertArray(row.communities, endpoint, `briefing.origins[${index}].communities`).forEach((value, communityIndex) => assertString(value, endpoint, `briefing.origins[${index}].communities[${communityIndex}]`));
  });
  assertArray(briefing.recentReferrals, endpoint, "briefing.recentReferrals").forEach((row, index) => assertBriefingReferral(row, `briefing.recentReferrals[${index}]`));
  assertArray(briefing.upcomingAssessments, endpoint, "briefing.upcomingAssessments").forEach((row, index) => assertBriefingAssessment(row, `briefing.upcomingAssessments[${index}]`));
  assertArray(briefing.plannedMoveIns, endpoint, "briefing.plannedMoveIns").forEach((row, index) => assertBriefingMoveIn(row, `briefing.plannedMoveIns[${index}]`));
  const briefingTrend = assertArray(briefing.trend, endpoint, "briefing.trend");
  if (briefingTrend.length > 12) fail(endpoint, "briefing.trend exceeds the 12-item limit");
  briefingTrend.forEach((pointValue, index) => {
    const point = assertRecord(pointValue, endpoint, `briefing.trend[${index}]`);
    assertIsoCalendarDate(point.weekStart, endpoint, `briefing.trend[${index}].weekStart`);
    ["received", "accepted"].forEach((field) => assertNumber(point[field], endpoint, `briefing.trend[${index}].${field}`));
    assertNumber(point.completedMoveIns, endpoint, `briefing.trend[${index}].completedMoveIns`, { nullable: true });
  });
  return payload as unknown as AdmissionsDashboardResponse;
}

function validateDataExplorerPayload(value: unknown, endpoint: string) {
  const payload = assertRecord(value, endpoint);
  assertString(payload.kind, endpoint, "kind");
  if (!["incidents", "census", "residents"].includes(String(payload.kind))) {
    fail(endpoint, "kind must be incidents, census, or residents");
  }
  assertString(payload.title, endpoint, "title");
  assertString(payload.description, endpoint, "description");
  assertString(payload.generated_at, endpoint, "generated_at");
  assertNumber(payload.row_count, endpoint, "row_count");
  const columns = assertArray(payload.columns, endpoint, "columns");
  const rows = assertArray(payload.rows, endpoint, "rows");
  const filters = assertRecord(payload.filters, endpoint, "filters");
  assertArray(filters.communities, endpoint, "filters.communities");
  assertArray(filters.months, endpoint, "filters.months");
  assertArray(filters.categories, endpoint, "filters.categories");
  if (payload.client_database !== undefined) {
    const clientDatabase = assertRecord(payload.client_database, endpoint, "client_database");
    assertBoolean(clientDatabase.available, endpoint, "client_database.available");
    assertString(clientDatabase.dataset, endpoint, "client_database.dataset");
    if (
      clientDatabase.version !== null &&
      typeof clientDatabase.version !== "string" &&
      typeof clientDatabase.version !== "number"
    ) {
      fail(endpoint, "client_database.version must be a string, number, or null");
    }
    assertString(clientDatabase.baseline_date, endpoint, "client_database.baseline_date", { nullable: true });
    assertString(clientDatabase.generated_at, endpoint, "client_database.generated_at");
    [
      "client_count",
      "field_count",
      "matched_current_profiles",
      "unmatched_current_profiles",
      "unmatched_episode_rows"
    ].forEach((field) => assertNumber(clientDatabase[field], endpoint, `client_database.${field}`));
    assertStringArray(clientDatabase.columns, endpoint, "client_database.columns", 200);
  }
  validateRows<DataExplorerResponse["columns"][number]>(columns, endpoint, "columns", (row, path) => {
    assertString(row.key, endpoint, `${path}.key`);
    assertString(row.label, endpoint, `${path}.label`);
    assertBoolean(row.numeric, endpoint, `${path}.numeric`, { optional: true });
  });
  validateRows<DataExplorerResponse["rows"][number]>(rows, endpoint, "rows", (row, path) => {
    assertString(row.id, endpoint, `${path}.id`);
    assertString(row.facility_id, endpoint, `${path}.facility_id`);
    assertString(row.community_name, endpoint, `${path}.community_name`);

    if (payload.kind === "incidents") {
      assertString(row.incident_date, endpoint, `${path}.incident_date`);
      assertString(row.month_bucket, endpoint, `${path}.month_bucket`);
      assertString(row.resident_id, endpoint, `${path}.resident_id`);
      assertString(row.resident_name, endpoint, `${path}.resident_name`);
      assertString(row.unit, endpoint, `${path}.unit`, { nullable: true });
      assertString(row.category, endpoint, `${path}.category`);
      assertString(row.incident_type, endpoint, `${path}.incident_type`);
      assertString(row.description, endpoint, `${path}.description`);
      assertBoolean(row.injury_occurred, endpoint, `${path}.injury_occurred`);
      assertBoolean(row.police_called, endpoint, `${path}.police_called`);
      assertBoolean(row.sentinel_event, endpoint, `${path}.sentinel_event`);
    } else if (payload.kind === "census") {
      assertString(row.month_bucket, endpoint, `${path}.month_bucket`);
      assertNumber(row.census, endpoint, `${path}.census`);
    } else if (payload.kind === "residents") {
      assertString(row.resident_name, endpoint, `${path}.resident_name`);
      assertString(row.unit, endpoint, `${path}.unit`, { nullable: true });
      assertNumber(row.age, endpoint, `${path}.age`, { nullable: true });
      assertString(row.admit_date, endpoint, `${path}.admit_date`, { nullable: true });
      assertNumber(row.los_days, endpoint, `${path}.los_days`, { nullable: true });
      assertString(row.primary_diagnosis, endpoint, `${path}.primary_diagnosis`, { nullable: true });
      assertString(row.care_level, endpoint, `${path}.care_level`, { nullable: true });
      assertString(row.payor, endpoint, `${path}.payor`, { nullable: true });
      assertString(row.physician, endpoint, `${path}.physician`, { nullable: true });
      if (row.canonical_client_id !== undefined) {
        assertString(row.canonical_client_id, endpoint, `${path}.canonical_client_id`, { nullable: true });
      }
      if (row.resident_id !== undefined) {
        assertString(row.resident_id, endpoint, `${path}.resident_id`, { nullable: true });
      }
      if (row.client_name_search !== undefined) {
        assertString(row.client_name_search, endpoint, `${path}.client_name_search`);
      }
      assertBoolean(row.current_resident, endpoint, `${path}.current_resident`, { optional: true });
      if (row.resident_profile_match_count !== undefined) {
        assertNumber(row.resident_profile_match_count, endpoint, `${path}.resident_profile_match_count`);
      }
      for (const field of ["client_profile", "resident_profile"]) {
        if (row[field] !== undefined && row[field] !== null) {
          assertRecord(row[field], endpoint, `${path}.${field}`);
        }
      }
      for (const field of ["resident_profiles", "resident_episode_history"]) {
        if (row[field] === undefined) continue;
        const nestedRows = assertArray(row[field], endpoint, `${path}.${field}`);
        nestedRows.forEach((nestedRow, index) => {
          assertRecord(nestedRow, endpoint, `${path}.${field}[${index}]`);
        });
      }
    }
  });
  return payload as unknown as DataExplorerResponse;
}

// The server has already enforced the full Workforce contract; this guards the
// shape the page reads so a stale cache or proxy error cannot render as data.
function validateWorkforceDashboardPayload(value: unknown) {
  const endpoint = "workforce dashboard";
  const payload = assertRecord(value, endpoint);
  assertString(payload.generated_at, endpoint, "generated_at");
  const workforce = assertRecord(payload.workforce, endpoint, "workforce");
  const status = workforce.status;
  if (status === "not_connected" || status === "unavailable") return payload as unknown as WorkforceDashboardResponse;
  if (status !== "connected") fail(endpoint, "workforce.status is not recognized");
  assertIsoCalendarDate(workforce.asOf, endpoint, "workforce.asOf");
  assertStringArray(workforce.phaseNames, endpoint, "workforce.phaseNames", 3);
  const assertTotals = (totalsValue: unknown, path: string) => {
    const totals = assertRecord(totalsValue, endpoint, path);
    ["active", "onboarding", "onLeave", "openRoles", "applicants", "phase1", "phase2", "phase3", "complianceRate", "staffBlockedFromScheduling"]
      .forEach((field) => assertNumber(totals[field], endpoint, `${path}.${field}`));
  };
  assertTotals(workforce.portfolio, "workforce.portfolio");
  assertArray(workforce.communities, endpoint, "workforce.communities").forEach((row, index) => {
    const record = assertRecord(row, endpoint, `workforce.communities[${index}]`);
    assertString(record.community, endpoint, `workforce.communities[${index}].community`);
    assertTotals(record.totals, `workforce.communities[${index}].totals`);
  });
  assertArray(workforce.roles, endpoint, "workforce.roles").forEach((row, index) => {
    const record = assertRecord(row, endpoint, `workforce.roles[${index}]`);
    assertString(record.label, endpoint, `workforce.roles[${index}].label`);
    assertTotals(record.totals, `workforce.roles[${index}].totals`);
  });
  assertArray(workforce.openPositions, endpoint, "workforce.openPositions").forEach((row, index) => {
    const record = assertRecord(row, endpoint, `workforce.openPositions[${index}]`);
    ["title", "discipline", "community", "roleLabel"].forEach((field) => assertString(record[field], endpoint, `workforce.openPositions[${index}].${field}`));
    assertString(record.url, endpoint, `workforce.openPositions[${index}].url`, { nullable: true });
    ["openings", "daysOpen", "phase1", "phase2", "phase3"].forEach((field) => assertNumber(record[field], endpoint, `workforce.openPositions[${index}].${field}`));
  });
  assertArray(workforce.upcomingExpirations, endpoint, "workforce.upcomingExpirations").forEach((row, index) => {
    const record = assertRecord(row, endpoint, `workforce.upcomingExpirations[${index}]`);
    assertString(record.community, endpoint, `workforce.upcomingExpirations[${index}].community`);
    assertString(record.label, endpoint, `workforce.upcomingExpirations[${index}].label`);
    assertIsoCalendarDate(record.expiresOn, endpoint, `workforce.upcomingExpirations[${index}].expiresOn`);
    assertNumber(record.people, endpoint, `workforce.upcomingExpirations[${index}].people`);
    assertBoolean(record.blocksScheduling, endpoint, `workforce.upcomingExpirations[${index}].blocksScheduling`);
  });
  return payload as unknown as WorkforceDashboardResponse;
}

export const platformResponseValidators = {
  admissionsDashboard: validateAdmissionsDashboardPayload,
  workforceDashboard: validateWorkforceDashboardPayload,
  communitiesDashboard(value: unknown) {
    const payload = assertRecord(value, "communities dashboard");
    assertString(payload.generated_at, "communities dashboard", "generated_at");
    assertIsoCalendarDate(payload.as_of_date, "communities dashboard", "as_of_date", { optional: true });
    const facilities = assertArray(payload.facilities, "communities dashboard", "facilities");
    const residents = assertArray(payload.residents, "communities dashboard", "residents");
    const incidents = assertArray(payload.incidents, "communities dashboard", "incidents");
    const census = assertArray(payload.census, "communities dashboard", "census");
    validateRows<LiveCommunitiesDashboardResponse["facilities"][number]>(facilities, "communities dashboard", "facilities", (row, path) => validateFacilityRow(row, "communities dashboard", path));
    validateRows<LiveCommunityResidentRecord>(residents, "communities dashboard", "residents", validateResidentRow);
    validateRows<LiveCommunityIncidentRecord>(incidents, "communities dashboard", "incidents", validateIncidentAggregateRow);
    validateRows<LiveCommunityCensusRecord>(census, "communities dashboard", "census", validateCensusRow);
    if (payload.incidentDetails !== undefined) {
      const incidentDetails = assertArray(payload.incidentDetails, "communities dashboard", "incidentDetails");
      validateRows<CommunityIncidentDetailRecord>(incidentDetails, "communities dashboard", "incidentDetails", validateIncidentDetailRow);
    }
    return payload as unknown as LiveCommunitiesDashboardResponse;
  },

  homeDashboard(value: unknown) {
    const payload = assertRecord(value, "home dashboard");
    assertString(payload.generated_at, "home dashboard", "generated_at");
    assertRecord(payload.portfolio, "home dashboard", "portfolio");
    const operational = assertRecord(payload.operational, "home dashboard", "operational");
    assertString(operational.asOf, "home dashboard", "operational.asOf");
    if (operational.latestCensusWeek !== null) {
      assertString(operational.latestCensusWeek, "home dashboard", "operational.latestCensusWeek");
    }
    assertNumber(operational.currentWeeklyCensus, "home dashboard", "operational.currentWeeklyCensus", { nullable: true });
    assertNumber(operational.priorWeeklyCensus, "home dashboard", "operational.priorWeeklyCensus", { nullable: true });
    assertNumber(operational.censusChange7d, "home dashboard", "operational.censusChange7d", { nullable: true });
    if (operational.censusCadence !== null && !["weekly", "monthly"].includes(String(operational.censusCadence))) {
      fail("home dashboard", "operational.censusCadence must be weekly, monthly, or null");
    }
    assertString(operational.currentCensusPeriod, "home dashboard", "operational.currentCensusPeriod", { nullable: true });
    assertString(operational.priorCensusPeriod, "home dashboard", "operational.priorCensusPeriod", { nullable: true });
    assertNumber(operational.currentCensus, "home dashboard", "operational.currentCensus", { nullable: true });
    assertNumber(operational.priorCensus, "home dashboard", "operational.priorCensus", { nullable: true });
    assertNumber(operational.censusChange, "home dashboard", "operational.censusChange", { nullable: true });
    assertArray(payload.incidentTrend, "home dashboard", "incidentTrend");
    const communities = assertArray(payload.communities, "home dashboard", "communities");
    validateRows<HomeDashboardResponse["communities"][number]>(
      communities,
      "home dashboard",
      "communities",
      (row, path) => {
        assertString(row.facility_id, "home dashboard", `${path}.facility_id`);
        assertNumber(row.total_residents, "home dashboard", `${path}.total_residents`);
        assertNumber(row.currentWeeklyCensus, "home dashboard", `${path}.currentWeeklyCensus`, { nullable: true });
        assertNumber(row.priorWeeklyCensus, "home dashboard", `${path}.priorWeeklyCensus`, { nullable: true });
        assertNumber(row.censusChange7d, "home dashboard", `${path}.censusChange7d`, { nullable: true });
        assertNumber(row.currentCensus, "home dashboard", `${path}.currentCensus`, { nullable: true });
        assertNumber(row.priorCensus, "home dashboard", `${path}.priorCensus`, { nullable: true });
        assertNumber(row.censusChange, "home dashboard", `${path}.censusChange`, { nullable: true });
      }
    );
    const currentWeeklyCensus = operational.currentWeeklyCensus as number | null;
    const priorWeeklyCensus = operational.priorWeeklyCensus as number | null;
    const censusChange7d = operational.censusChange7d as number | null;
    if (
      currentWeeklyCensus !== null ||
      priorWeeklyCensus !== null ||
      censusChange7d !== null
    ) {
      if (
        currentWeeklyCensus === null ||
        priorWeeklyCensus === null ||
        censusChange7d === null
      ) {
        fail("home dashboard", "operational weekly census fields must be all present or all null");
      }
      let communityCurrentTotal = 0;
      let communityPriorTotal = 0;
      communities.forEach((value, index) => {
        const row = assertRecord(value, "home dashboard", `communities[${index}]`);
        const current = row.currentWeeklyCensus;
        const prior = row.priorWeeklyCensus;
        const change = row.censusChange7d;
        if (
          typeof current !== "number" ||
          typeof prior !== "number" ||
          typeof change !== "number"
        ) {
          fail(
            "home dashboard",
            `communities[${index}] weekly census fields must be present when portfolio census is present`
          );
        }
        if (current - prior !== change) {
          fail(
            "home dashboard",
            `communities[${index}] weekly census change does not reconcile`
          );
        }
        communityCurrentTotal += current;
        communityPriorTotal += prior;
      });
      if (communityCurrentTotal !== currentWeeklyCensus) {
        fail(
          "home dashboard",
          `community weekly census total ${communityCurrentTotal} does not equal portfolio ${currentWeeklyCensus}`
        );
      }
      if (communityPriorTotal !== priorWeeklyCensus) {
        fail(
          "home dashboard",
          `community prior census total ${communityPriorTotal} does not equal portfolio ${priorWeeklyCensus}`
        );
      }
      if (currentWeeklyCensus - priorWeeklyCensus !== censusChange7d) {
        fail("home dashboard", "portfolio weekly census change does not reconcile");
      }
    }
    const currentCensus = operational.currentCensus as number | null;
    const priorCensus = operational.priorCensus as number | null;
    const censusChange = operational.censusChange as number | null;
    if (currentCensus !== null || priorCensus !== null || censusChange !== null) {
      if (
        currentCensus === null ||
        priorCensus === null ||
        censusChange === null ||
        operational.censusCadence === null ||
        operational.currentCensusPeriod === null ||
        operational.priorCensusPeriod === null
      ) {
        fail("home dashboard", "governed census fields must be complete when census is present");
      }
      let communityCurrentTotal = 0;
      let communityPriorTotal = 0;
      communities.forEach((value, index) => {
        const row = assertRecord(value, "home dashboard", `communities[${index}]`);
        const current = row.currentCensus;
        const prior = row.priorCensus;
        const change = row.censusChange;
        if (typeof current !== "number" || typeof prior !== "number" || typeof change !== "number") {
          fail("home dashboard", `communities[${index}] governed census fields must be present`);
        }
        if (current - prior !== change) {
          fail("home dashboard", `communities[${index}] governed census change does not reconcile`);
        }
        communityCurrentTotal += current;
        communityPriorTotal += prior;
      });
      if (communityCurrentTotal !== currentCensus || communityPriorTotal !== priorCensus) {
        fail("home dashboard", "community governed census totals do not reconcile to the portfolio");
      }
      if (currentCensus - priorCensus !== censusChange) {
        fail("home dashboard", "portfolio governed census change does not reconcile");
      }
    }
    assertRecord(payload.reporting, "home dashboard", "reporting");
    assertRecord(payload.watch, "home dashboard", "watch");
    return payload as unknown as HomeDashboardResponse;
  },

  communitySnapshot(value: unknown) {
    const payload = assertRecord(value, "community snapshot");
    assertString(payload.generated_at, "community snapshot", "generated_at");
    validateFacilityRow(assertRecord(payload.facility, "community snapshot", "facility"), "community snapshot", "facility");
    const census = assertArray(payload.census, "community snapshot", "census");
    validateRows<LiveCommunityCensusRecord>(census, "community snapshot", "census", validateCensusRow);
    assertRecord(payload.summary, "community snapshot", "summary");
    assertArray(payload.incidentTrend, "community snapshot", "incidentTrend");
    assertArray(payload.topIncidentCategories, "community snapshot", "topIncidentCategories");
    const incidentDetails = assertArray(payload.incidentDetails, "community snapshot", "incidentDetails");
    assertArray(payload.diagnosisMix, "community snapshot", "diagnosisMix");
    assertArray(payload.longestStayResidents, "community snapshot", "longestStayResidents");
    validateRows<CommunityIncidentDetailRecord>(incidentDetails, "community snapshot", "incidentDetails", validateIncidentDetailRow);
    return payload as unknown as CommunitySnapshotResponse;
  },

  incidentStream(value: unknown) {
    const payload = assertRecord(value, "incident stream");
    const incidents = assertArray(payload.incidents, "incident stream", "incidents");
    validateRows<LiveIncidentRecord>(incidents, "incident stream", "incidents", validateLiveIncidentRow);
    if (payload.source !== undefined) assertString(payload.source, "incident stream", "source");
    if (payload.warning !== undefined) assertString(payload.warning, "incident stream", "warning", { nullable: true });
    return payload as unknown as IncidentFeedResponse;
  },

  analyticsSummary(value: unknown) {
    return validateAnalyticsSummaryPayload(value, "analytics summary");
  },

  dataExplorer(value: unknown) {
    return validateDataExplorerPayload(value, "data explorer");
  },

  platformHealth(value: unknown) {
    const payload = assertRecord(value, "platform health");
    assertBoolean(payload.ok, "platform health", "ok");
    assertString(payload.backend, "platform health", "backend");
    assertString(payload.catalog, "platform health", "catalog");
    assertString(payload.schema, "platform health", "schema");
    if (payload.qaArtifacts !== undefined) {
      const qaArtifacts = assertArray(payload.qaArtifacts, "platform health", "qaArtifacts");
      validateRows<NonNullable<PlatformHealthResponse["qaArtifacts"]>[number]>(
        qaArtifacts,
        "platform health",
        "qaArtifacts",
        (row, path) => {
          assertString(row.key, "platform health", `${path}.key`);
          assertString(row.label, "platform health", `${path}.label`);
          assertBoolean(row.available, "platform health", `${path}.available`);
          assertString(row.status, "platform health", `${path}.status`);
          assertString(row.generatedAt, "platform health", `${path}.generatedAt`, { nullable: true });
          assertString(row.detail, "platform health", `${path}.detail`);
          assertBoolean(row.passed, "platform health", `${path}.passed`);
          ["total", "passedCount", "failedCount", "warningCount"].forEach((field) => {
            assertNumber(row[field], "platform health", `${path}.${field}`, { nullable: true });
          });
          assertString(row.artifactPath, "platform health", `${path}.artifactPath`);
        }
      );
    }
    if (payload.analystQa !== undefined) validateAnalystQaStatusPayload(payload.analystQa, "platform health analyst QA");
    return payload as unknown as PlatformHealthResponse;
  },

  analystQaStatus(value: unknown) {
    return validateAnalystQaStatusPayload(value);
  },

  analystTraceTelemetry(value: unknown) {
    const payload = assertRecord(value, "analyst traces");
    assertString(payload.version, "analyst traces", "version");
    assertString(payload.generatedAt, "analyst traces", "generatedAt");
    assertRecord(payload.retention, "analyst traces", "retention");
    const summary = assertRecord(payload.summary, "analyst traces", "summary");
    [
      "totalTurns",
      "issueTurns",
      "schemaIssues",
      "validationIssues",
      "recoveryTurns",
      "staleTurns",
      "notLoadedTurns",
      "planRejectedTurns",
      "certifiedTurns",
      "uncertifiedTurns",
      "cacheHits",
      "moduleTurns",
      "slowTurns",
      "previewedTurns",
      "qualityScoredTurns",
      "averageQualityScore",
      "lowQualityTurns",
      "toolsObserved"
    ].forEach((field) => assertNumber(summary[field], "analyst traces", `summary.${field}`));
    const tools = assertArray(payload.tools, "analyst traces", "tools");
    validateRows<AnalystTraceTelemetryResponse["tools"][number]>(tools, "analyst traces", "tools", (row, path) => {
      assertString(row.tool, "analyst traces", `${path}.tool`);
      ["count", "validationIssues", "schemaIssues", "certifiedTurns", "uncertifiedTurns", "cacheHits", "slowTurns", "previewedTurns"].forEach((field) => assertNumber(row[field], "analyst traces", `${path}.${field}`));
      assertString(row.lastSeenAt, "analyst traces", `${path}.lastSeenAt`, { nullable: true });
    });
    const families = assertArray(payload.families, "analyst traces", "families");
    validateRows<AnalystTraceTelemetryResponse["families"][number]>(families, "analyst traces", "families", (row, path) => {
      assertString(row.family, "analyst traces", `${path}.family`);
      ["count", "recoveryTurns", "staleTurns", "notLoadedTurns", "planRejectedTurns", "validationIssues", "schemaIssues", "slowTurns", "previewedTurns"].forEach((field) => assertNumber(row[field], "analyst traces", `${path}.${field}`));
    });
    const decisionFamilies = assertArray(payload.decisionFamilies, "analyst traces", "decisionFamilies");
    validateRows<AnalystTraceTelemetryResponse["decisionFamilies"][number]>(decisionFamilies, "analyst traces", "decisionFamilies", (row, path) => {
      assertString(row.family, "analyst traces", `${path}.family`);
      ["count", "avgQualityScore", "reviewTurns", "moduleTurns", "recoveryTurns", "artifactTurns"].forEach((field) => assertNumber(row[field], "analyst traces", `${path}.${field}`));
    });
    const qualityFlags = assertArray(payload.qualityFlags, "analyst traces", "qualityFlags");
    validateRows<AnalystTraceTelemetryResponse["qualityFlags"][number]>(qualityFlags, "analyst traces", "qualityFlags", (row, path) => {
      assertString(row.flag, "analyst traces", `${path}.flag`);
      assertNumber(row.count, "analyst traces", `${path}.count`);
    });
    const moduleCoverage = assertRecord(payload.moduleCoverage, "analyst traces", "moduleCoverage");
    assertString(moduleCoverage.version, "analyst traces", "moduleCoverage.version");
    ["totalModules", "surfaceModules", "analysisModules", "observedModuleIds", "observedAnalysisTools", "analysisModulesWithObservedTool", "analysisModulesWithObservedModule"].forEach((field) => {
      assertNumber(moduleCoverage[field], "analyst traces", `moduleCoverage.${field}`);
    });
    const uncoveredAnalysisModules = assertArray(moduleCoverage.uncoveredAnalysisModules, "analyst traces", "moduleCoverage.uncoveredAnalysisModules");
    validateRows<AnalystTraceTelemetryResponse["moduleCoverage"]["uncoveredAnalysisModules"][number]>(uncoveredAnalysisModules, "analyst traces", "moduleCoverage.uncoveredAnalysisModules", (row, path) => {
      ["id", "title", "tool", "family"].forEach((field) => assertString(row[field], "analyst traces", `${path}.${field}`));
      assertString(row.visualType, "analyst traces", `${path}.visualType`, { nullable: true });
    });
    const coverageFamilies = assertArray(moduleCoverage.families, "analyst traces", "moduleCoverage.families");
    validateRows<AnalystTraceTelemetryResponse["moduleCoverage"]["families"][number]>(coverageFamilies, "analyst traces", "moduleCoverage.families", (row, path) => {
      assertString(row.family, "analyst traces", `${path}.family`);
      ["total", "surfaces", "analyses", "observedModules", "observedTools"].forEach((field) => assertNumber(row[field], "analyst traces", `${path}.${field}`));
    });
    const recentIssues = assertArray(payload.recentIssues, "analyst traces", "recentIssues");
    const recent = assertArray(payload.recent, "analyst traces", "recent");
    const validateTraceRow = (row: Record<string, unknown>, path: string) => {
      assertString(row.turnId, "analyst traces", `${path}.turnId`);
      assertString(row.stage, "analyst traces", `${path}.stage`, { nullable: true });
      assertString(row.promptHash, "analyst traces", `${path}.promptHash`, { nullable: true });
      assertString(row.selectedTool, "analyst traces", `${path}.selectedTool`, { nullable: true });
      assertString(row.truthState, "analyst traces", `${path}.truthState`, { nullable: true });
      if (!("plan" in row)) fail("analyst traces", `${path}.plan is required`);
      if (row.plan !== null) {
        const plan = assertRecord(row.plan, "analyst traces", `${path}.plan`);
        assertString(plan.tool, "analyst traces", `${path}.plan.tool`, { nullable: true });
        assertString(plan.canonicalPromptHash, "analyst traces", `${path}.plan.canonicalPromptHash`, { nullable: true });
        assertNumber(plan.canonicalPromptLength, "analyst traces", `${path}.plan.canonicalPromptLength`, { nullable: true });
        if (plan.capability !== null) {
          const capability = assertRecord(plan.capability, "analyst traces", `${path}.plan.capability`);
          assertString(capability.temporalScope, "analyst traces", `${path}.plan.capability.temporalScope`, { nullable: true });
          if (capability.supportsExplicitPeriods !== null) assertBoolean(capability.supportsExplicitPeriods, "analyst traces", `${path}.plan.capability.supportsExplicitPeriods`);
          assertString(capability.historicalAlternative, "analyst traces", `${path}.plan.capability.historicalAlternative`, { nullable: true });
        }
        if (plan.decision !== null) {
          const decision = assertRecord(plan.decision, "analyst traces", `${path}.plan.decision`);
          ["family", "answerShape", "confidence"].forEach((field) => {
            assertString(decision[field], "analyst traces", `${path}.plan.decision.${field}`, { nullable: true });
          });
          assertArray(decision.moduleFamilies, "analyst traces", `${path}.plan.decision.moduleFamilies`);
          assertArray(decision.riskFlags, "analyst traces", `${path}.plan.decision.riskFlags`);
          ["exactRows", "expectsArtifact", "expectsModule", "shouldComposeSupportingModules"].forEach((field) => {
            assertBoolean(decision[field], "analyst traces", `${path}.plan.decision.${field}`);
          });
        }
        const expected = assertRecord(plan.expected, "analyst traces", `${path}.plan.expected`);
        ["metric", "metricGrain", "category", "mode", "grouping", "facilityId", "communityName", "presentation"].forEach((field) => {
          assertString(expected[field], "analyst traces", `${path}.plan.expected.${field}`, { nullable: true });
        });
        assertArray(expected.periods, "analyst traces", `${path}.plan.expected.periods`);
        assertNumber(expected.periodCount, "analyst traces", `${path}.plan.expected.periodCount`);
        assertArray(expected.fields, "analyst traces", `${path}.plan.expected.fields`);
        assertNumber(expected.fieldCount, "analyst traces", `${path}.plan.expected.fieldCount`);
        ["export", "hasCommunityScope", "hasResidentScope"].forEach((field) => {
          assertBoolean(expected[field], "analyst traces", `${path}.plan.expected.${field}`);
        });
      }
      const performance = assertRecord(row.performance, "analyst traces", `${path}.performance`);
      assertNumber(performance.executionMs, "analyst traces", `${path}.performance.executionMs`, { nullable: true });
      assertBoolean(performance.slow, "analyst traces", `${path}.performance.slow`);
      if (row.volume !== null) {
        const volume = assertRecord(row.volume, "analyst traces", `${path}.volume`);
        ["visualRows", "originalRows", "artifactRows"].forEach((field) => assertNumber(volume[field], "analyst traces", `${path}.volume.${field}`, { nullable: true }));
        assertBoolean(volume.previewed, "analyst traces", `${path}.volume.previewed`);
      }
      if (row.outcome !== null) {
        const outcome = assertRecord(row.outcome, "analyst traces", `${path}.outcome`);
        ["safeRefusal", "contractViolation", "recovery", "degraded"].forEach((field) => assertBoolean(outcome[field], "analyst traces", `${path}.outcome.${field}`));
      }
      if (row.quality !== null) {
        const quality = assertRecord(row.quality, "analyst traces", `${path}.quality`);
        assertString(quality.version, "analyst traces", `${path}.quality.version`, { nullable: true });
        assertNumber(quality.score, "analyst traces", `${path}.quality.score`);
        assertString(quality.grade, "analyst traces", `${path}.quality.grade`, { nullable: true });
        assertArray(quality.flags, "analyst traces", `${path}.quality.flags`);
        assertRecord(quality.dimensions, "analyst traces", `${path}.quality.dimensions`);
      }
    };
    validateRows<AnalystTraceTelemetryResponse["recentIssues"][number]>(recentIssues, "analyst traces", "recentIssues", validateTraceRow);
    validateRows<AnalystTraceTelemetryResponse["recent"][number]>(recent, "analyst traces", "recent", validateTraceRow);
    return payload as unknown as AnalystTraceTelemetryResponse;
  },

  platformBootstrap(value: unknown) {
    const payload = assertRecord(value, "platform bootstrap");
    assertString(payload.generated_at, "platform bootstrap", "generated_at");
    const snapshot = assertRecord(payload.snapshot, "platform bootstrap", "snapshot");
    assertIsoCalendarDate(snapshot.as_of_date, "platform bootstrap", "snapshot.as_of_date", { optional: true });
    platformResponseValidators.platformHealth(payload.health);
    platformResponseValidators.communitiesDashboard(payload.communities);
    platformResponseValidators.incidentStream(payload.incidents);
    platformResponseValidators.analyticsSummary(payload.reportsSummary);
    platformResponseValidators.homeDashboard(payload.homeDashboard);
    return payload as unknown as PlatformBootstrapResponse;
  }
} satisfies Record<string, Validator<unknown>>;
