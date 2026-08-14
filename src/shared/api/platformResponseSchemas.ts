import type {
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
      assertNumber(row.age, endpoint, `${path}.age`);
      assertString(row.admit_date, endpoint, `${path}.admit_date`, { nullable: true });
      assertNumber(row.los_days, endpoint, `${path}.los_days`);
      assertString(row.primary_diagnosis, endpoint, `${path}.primary_diagnosis`, { nullable: true });
      assertString(row.care_level, endpoint, `${path}.care_level`, { nullable: true });
      assertString(row.payor, endpoint, `${path}.payor`, { nullable: true });
      assertString(row.physician, endpoint, `${path}.physician`, { nullable: true });
    }
  });
  return payload as unknown as DataExplorerResponse;
}

export const platformResponseValidators = {
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
