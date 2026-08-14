import { getDatabricksAuthMode, getDatabricksConfig, queryDatabricks } from "./databricks.mjs";
import { buildDataExplorerPayload } from "./data-explorer.mjs";
import { buildHomeDashboard } from "./home-dashboard.mjs";
import { getAnalystQaStatus, getQaArtifactStatuses } from "./qa-artifacts.mjs";
import {
  getAzureSnapshotStorageSummary,
  getPlatformSnapshotTargets,
  readPlatformSnapshot,
  writePlatformSnapshot
} from "./platform-snapshot.mjs";
import {
  SnapshotUnavailableError,
  assertToolContextSafeForAzurePublish,
  decorateSnapshotPayload,
  getSnapshotDiagnostics,
  getSnapshotFreshness,
  getSnapshotMaxAgeHours,
  missingSnapshotSection
} from "./snapshot-status.mjs";
import {
  normalizeKnownCommunityNames as normalizeCommunityName,
  normalizeKnownCommunityNamesDeep as normalizeCommunityLabels
} from "../shared/community-names.mjs";
import {
  normalizeDisplayDateKey,
  normalizeDisplayTimestamp,
  parseDisplayDate
} from "../shared/display-date.mjs";
import { isProductionLikeRuntime } from "./runtime-environment.mjs";
import { createHttpError } from "./http-errors.mjs";

const liveCache = new Map();
const GOVERNED_AS_OF_CTE = `report_context AS (
  SELECT coalesce(max(snapshot_date), last_day(max(to_date(concat(month_bucket, '-01'))))) AS as_of_date
  FROM alamohealth.gold.v_census
)`;

export { getAnalystQaStatus, normalizeAnalystQaArtifact } from "./qa-artifacts.mjs";
export { getSnapshotFreshness, isSnapshotUnavailableError } from "./snapshot-status.mjs";

function stripAnalystHistoryForClient(reportsSummary) {
  if (!reportsSummary?.toolContext) return reportsSummary;
  const {
    incidentDetailHistory: _history,
    marExceptionDetails: _marExceptions,
    ...toolContext
  } = reportsSummary.toolContext;
  const {
    incident_detail_history: _historyTable,
    mar_exception_detail_90d: _marExceptionTable,
    mar_prn_effectiveness_90d: _marPrnEffectivenessTable,
    mar_medication_orders_current: _marMedicationOrdersTable,
    ...tables
  } = toolContext.tables ?? {};
  return {
    ...reportsSummary,
    toolContext: {
      ...toolContext,
      tables
    }
  };
}

async function getRequiredPlatformSnapshot() {
  const snapshot = await readPlatformSnapshot();

  if (!snapshot) {
    const storage = getAzureSnapshotStorageSummary();

    throw new SnapshotUnavailableError(
      "No published platform snapshot is available yet. Generate or publish snapshots/daily/latest.json first.",
      {
        reason: "missing",
        source: storage ? "azure-storage" : "local-fallback",
        expectedPaths: ["snapshots/daily/latest.json", "snapshots/daily/YYYY-MM-DD.json"],
        azurePath: storage?.latestPath ?? null,
        azureContainer: storage?.container ?? null
      }
    );
  }

  return snapshot;
}

function getCachedLoader(key, ttlMs, loader) {
  const now = Date.now();
  const cached = liveCache.get(key);

  if (cached?.value && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const promise = loader()
    .then((value) => {
      liveCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs
      });
      return value;
    })
    .catch((error) => {
      liveCache.delete(key);
      throw error;
    });

  liveCache.set(key, {
    value: cached?.value,
    expiresAt: cached?.expiresAt ?? 0,
    promise
  });

  return promise;
}

function normalizeString(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeFacilityId(value) {
  return normalizeString(value);
}

function validateRequestedFacilityId(value) {
  const facilityId = normalizeFacilityId(value);
  if (!facilityId) {
    throw createHttpError(400, "facility_id_missing", "Missing facilityId.");
  }
  if (!/^[a-z0-9_-]{1,64}$/i.test(facilityId)) {
    throw createHttpError(400, "facility_id_invalid", "Invalid facilityId.");
  }
  return facilityId;
}

function normalizeInteger(value) {
  if (typeof value === "number") return Math.round(value);
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim()) return Number(value);
  return 0;
}

function normalizeDecimal(value) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim()) return Number(value);
  return 0;
}

function normalizeNullable(value) {
  const trimmed = normalizeString(value);
  return trimmed || null;
}

function getMonthBucket(value) {
  const date = parseDisplayDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function priorityFromIncident(row) {
  const category = normalizeString(row.Incident_Category || row.Type_of_Incident).toLowerCase();
  const detail = normalizeString(row.What_Staff_Saw).toLowerCase();
  const hasInjury = normalizeString(row.Injuires_YN).toLowerCase() === "yes";
  const sentinel = normalizeString(row.Sentinel_Event_YN).toLowerCase() === "yes";
  const police = normalizeString(row.Notify_EmergSrvs_YN).toLowerCase() === "yes";

  if (
    sentinel ||
    police ||
    hasInjury ||
    category.includes("death") ||
    category.includes("aggression") ||
    category.includes("mental health crisis") ||
    category.includes("911") ||
    detail.includes("arrested")
  ) {
    return "HIGH";
  }

  if (
    category.includes("medication") ||
    category.includes("medical") ||
    category.includes("fall") ||
    category.includes("transport") ||
    category.includes("awol")
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

function incidentFlags(row) {
  const flags = [];

  if (normalizeString(row.Sentinel_Event_YN).toLowerCase() === "yes") flags.push("sentinel");
  if (normalizeString(row.Notify_EmergSrvs_YN).toLowerCase() === "yes") flags.push("911");
  if (normalizeString(row.Notify_Physician_YN).toLowerCase() === "yes") flags.push("physician");
  if (normalizeString(row.Notify_Family_YN).toLowerCase() === "yes") flags.push("family");
  if (normalizeString(row.Injuires_YN).toLowerCase() === "yes") flags.push("injury");
  if (normalizeString(row.Prev_History_YN).toLowerCase() === "yes") flags.push("history");

  return flags;
}

function formatResidentName(firstName, lastName) {
  return [normalizeString(firstName), normalizeString(lastName)].filter(Boolean).join(" ");
}

function buildIncidentNotifications(row) {
  return [
    normalizeString(row.Notify_Physician_YN).toLowerCase() === "yes"
      ? {
          recipient: normalizeString(row.Notify_Physician_Name) || "Physician",
          status: "sent"
        }
      : null,
    normalizeString(row.Notify_Family_YN).toLowerCase() === "yes"
      ? {
          recipient: normalizeString(row.Notify_Family_Name) || "Family",
          status: "sent"
        }
      : null,
    normalizeString(row.Notify_Manager_YN).toLowerCase() === "yes"
      ? {
          recipient: normalizeString(row.Notify_Manager_Name) || "Manager",
          status: "sent"
        }
      : null
  ].filter(Boolean);
}

function buildIncidentDetail(row) {
  const residentName = formatResidentName(row.First_Name, row.Last_Name);
  const incidentDate = normalizeDisplayDateKey(row.Incident_Date_parsed);
  const receivedAt = normalizeDisplayTimestamp(row.__TIMESTAMP) || normalizeDisplayTimestamp(incidentDate);

  return {
    id: String(row.Unique_ID),
    facility_id: normalizeFacilityId(row.Facility),
    facility_name: normalizeCommunityName(row.Facility_Name),
    resident_id: row.Res_Number == null ? "" : String(row.Res_Number),
    client_name: residentName || (row.Res_Number ? `Resident ${row.Res_Number}` : "Unknown Resident"),
    unit_number: normalizeNullable(row.Unit_Number),
    incident_date: incidentDate,
    received_at: receivedAt,
    month_bucket: normalizeString(row.month_bucket) || getMonthBucket(row.Incident_Date_parsed),
    category: normalizeString(row.Incident_Category) || "General",
    incident_type: normalizeString(row.Type_of_Incident),
    location: [normalizeString(row.Location_of_Incident_General), normalizeString(row.Location_of_Incident_Specific)]
      .filter(Boolean)
      .join(" · "),
    injury_occurred: normalizeString(row.Injuires_YN).toLowerCase() === "yes",
    police_called: normalizeString(row.Notify_EmergSrvs_YN).toLowerCase() === "yes",
    sentinel_event: normalizeString(row.Sentinel_Event_YN).toLowerCase() === "yes",
    previous_history: normalizeString(row.Prev_History_YN).toLowerCase() === "yes",
    staff_name: normalizeNullable(row.Person_Completing_Report_Name),
    email_body: normalizeNullable(row.What_Staff_Saw),
    assistance_given: normalizeNullable(row.Assistance_Given),
    notifications: buildIncidentNotifications(row),
    flags: incidentFlags(row)
  };
}

function summarizeCounts(values) {
  const counts = new Map();

  values.forEach((value) => {
    const key = normalizeString(value) || "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));
}

function buildCommunitySnapshot(communities, facilityId) {
  const normalizedFacilityId = normalizeFacilityId(facilityId);
  const facility =
    communities.facilities?.find((item) => item.facility_id === normalizedFacilityId) ?? null;
  if (!facility) {
    return null;
  }
  const residents = (communities.residents ?? []).filter(
    (resident) => resident.facility_id === normalizedFacilityId
  );
  const incidents = (communities.incidents ?? []).filter(
    (incident) => incident.facility_id === normalizedFacilityId
  );
  const incidentDetails = (communities.incidentDetails ?? []).filter(
    (incident) => incident.facility_id === normalizedFacilityId
  );
  const census = (communities.census ?? []).filter(
    (row) => row.facility_id === normalizedFacilityId
  );
  const monthBuckets = [...new Set(incidents.map((incident) => incident.month_bucket).filter(Boolean))].sort();
  const latestMonth = monthBuckets[monthBuckets.length - 1] ?? null;
  const priorMonth = monthBuckets[monthBuckets.length - 2] ?? null;
  const currentIncidents = incidents
    .filter((incident) => incident.month_bucket === latestMonth)
    .reduce((sum, incident) => sum + incident.incident_count, 0);
  const priorIncidents = incidents
    .filter((incident) => incident.month_bucket === priorMonth)
    .reduce((sum, incident) => sum + incident.incident_count, 0);
  const averageAge =
    residents.length > 0 ? residents.reduce((sum, resident) => sum + (resident.age ?? 0), 0) / residents.length : 0;
  const averageLengthOfStay =
    residents.length > 0
      ? residents.reduce((sum, resident) => sum + (resident.los_days ?? 0), 0) / residents.length
      : 0;
  const incidentTrend = monthBuckets.map((monthBucket) => ({
    month_bucket: monthBucket,
    incidentCount: incidents
      .filter((incident) => incident.month_bucket === monthBucket)
      .reduce((sum, incident) => sum + incident.incident_count, 0)
  }));
  const topIncidentCategories = summarizeCounts(
    incidents
      .filter((incident) => incident.month_bucket === latestMonth)
      .flatMap((incident) => Array.from({ length: incident.incident_count }, () => incident.category))
  ).slice(0, 6);
  const diagnosisMix = summarizeCounts(residents.map((resident) => resident.primary_diagnosis)).slice(0, 6);
  const longestStayResidents = [...residents]
    .sort((a, b) => (b.los_days ?? 0) - (a.los_days ?? 0))
    .slice(0, 5)
    .map((resident) => ({
      res_number: resident.res_number,
      first_name: resident.first_name,
      last_name: resident.last_name,
      unit_number: resident.unit_number,
      admit_date: resident.admit_date,
      los_days: resident.los_days
    }));
  return {
    generated_at: communities.generated_at ?? new Date().toISOString(),
    facility,
    reporting_month: latestMonth,
    summary: {
      residents: facility.total_residents,
      currentIncidents,
      priorIncidents,
      averageAge,
      averageLengthOfStay
    },
    incidentTrend,
    topIncidentCategories,
    incidentDetails,
    diagnosisMix,
    census,
    longestStayResidents
  };
}

async function readSnapshotSection(selector) {
  const snapshot = await readPlatformSnapshot();
  return snapshot ? selector(snapshot) : null;
}

async function getPlatformHealthLive() {
  return getCachedLoader("platform-health", 15_000, async () => {
    const config = getDatabricksConfig();
    const rows = await queryDatabricks(
      "SELECT current_timestamp() AS warehouse_time, current_catalog() AS current_catalog, current_schema() AS current_schema"
    );
    const current = rows[0] ?? {};

    return {
      ok: true,
      backend: "databricks-sql",
      catalog: config.catalog,
      schema: config.schema,
      warehouseTime: current.warehouse_time ?? null,
      currentCatalog: current.current_catalog ?? null,
      currentSchema: current.current_schema ?? null
    };
  });
}

async function getCommunitiesDashboardDataLive() {
  return getCachedLoader("communities-dashboard", 60_000, async () => {
    const occupancyRows = await queryDatabricks(`
      SELECT
        Facility,
        Facility_Name,
        census AS active_residents
      FROM alamohealth.gold.v_tool_community_operating_summary
      ORDER BY Facility
    `);
    const residentRows = await queryDatabricks(`
      SELECT
        Res_Number,
        First_Name,
        Last_Name,
        Age,
        Admit_Date,
        LOS_Days,
        Facility,
        Facility_Name,
        Unit_Number,
        Care_Level,
        Payor_Text,
        Primary_Diagnosis,
        Physician_Name,
        Diet
      FROM alamohealth.gold.v_tool_resident_profile
    `);
    const incidentRows = await queryDatabricks(`
      WITH ${GOVERNED_AS_OF_CTE}
      SELECT
        Facility,
        Incident_Category,
        Incident_Date_parsed,
        date_format(Incident_Date_parsed, 'yyyy-MM') AS month_bucket,
        count(*) AS incident_count
      FROM alamohealth.gold.v_incidents
      CROSS JOIN report_context
      WHERE Incident_Date_parsed BETWEEN add_months(as_of_date, -6) AND as_of_date
      GROUP BY Facility, Incident_Category, Incident_Date_parsed, date_format(Incident_Date_parsed, 'yyyy-MM')
    `);
    const incidentDetailRows = await queryDatabricks(`
      WITH ${GOVERNED_AS_OF_CTE}
      SELECT
        i.Unique_ID,
        i.Facility,
        i.Facility_Name,
        i.Res_Number,
        r.First_Name,
        r.Last_Name,
        coalesce(i.Unit_Number, r.Unit_Number) AS Unit_Number,
        i.Incident_Date_parsed,
        i.__TIMESTAMP,
        i.Incident_Category,
        i.Type_of_Incident,
        i.Location_of_Incident_General,
        i.Location_of_Incident_Specific,
        i.What_Staff_Saw,
        i.Assistance_Given,
        i.Injuires_YN,
        i.Notify_EmergSrvs_YN,
        i.Notify_Physician_YN,
        i.Notify_Family_YN,
        i.Notify_Manager_YN,
        i.Notify_Physician_Name,
        i.Notify_Family_Name,
        i.Notify_Manager_Name,
        i.Sentinel_Event_YN,
        i.Person_Completing_Report_Name,
        i.Prev_History_YN,
        date_format(i.Incident_Date_parsed, 'yyyy-MM') AS month_bucket
      FROM alamohealth.gold.v_incidents i
      CROSS JOIN report_context
      LEFT JOIN alamohealth.gold.v_tool_resident_profile r
        ON i.Res_Number = r.Res_Number
       AND i.Facility = r.Facility
      WHERE i.Incident_Date_parsed BETWEEN add_months(as_of_date, -6) AND as_of_date
      ORDER BY coalesce(i.__TIMESTAMP, i.Incident_Date_parsed) DESC
    `);
    const censusRows = await queryDatabricks(`
      SELECT Facility, census, month_bucket, snapshot_date
      FROM alamohealth.gold.v_census
      ORDER BY month_bucket DESC, Facility
    `);

    const occupancyByFacility = new Map(
      occupancyRows.map((row) => [
        normalizeFacilityId(row.Facility),
        {
          facility_id: normalizeFacilityId(row.Facility),
          community_name: normalizeCommunityName(row.Facility_Name) || "Unknown Facility",
          community_code: normalizeFacilityId(row.Facility),
          city: normalizeCommunityName(row.Facility_Name),
          state: "CA",
          total_residents: normalizeInteger(row.active_residents)
        }
      ])
    );

    const facilities = [...occupancyByFacility.values()];
    const residents = residentRows.map((row) => ({
      res_number: String(row.Res_Number),
      first_name: normalizeString(row.First_Name),
      last_name: normalizeString(row.Last_Name),
      age: normalizeInteger(row.Age),
      admit_date: normalizeNullable(row.Admit_Date),
      los_days: normalizeInteger(row.LOS_Days),
      facility_id: normalizeFacilityId(row.Facility),
      facility_name: normalizeCommunityName(row.Facility_Name),
      unit_number: normalizeNullable(row.Unit_Number),
      care_level: normalizeNullable(row.Care_Level),
      payor: normalizeNullable(row.Payor_Text),
      primary_diagnosis: normalizeNullable(row.Primary_Diagnosis),
      physician: normalizeNullable(row.Physician_Name),
      diet: normalizeNullable(row.Diet)
    }));

    const incidents = incidentRows.map((row) => ({
      facility_id: normalizeFacilityId(row.Facility),
      category: normalizeString(row.Incident_Category) || "General",
      incident_date: normalizeDisplayDateKey(row.Incident_Date_parsed),
      month_bucket: normalizeString(row.month_bucket),
      incident_count: normalizeInteger(row.incident_count),
      period: normalizeString(row.month_bucket)
    }));

    const incidentDetails = incidentDetailRows.map(buildIncidentDetail);

    const census = censusRows.map((row) => ({
      facility_id: normalizeFacilityId(row.Facility),
      census: normalizeInteger(row.census),
      month_bucket: normalizeString(row.month_bucket)
    }));
    const asOfDate = censusRows
      .map((row) => normalizeDisplayDateKey(row.snapshot_date) ?? "")
      .filter(Boolean)
      .sort()
      .at(-1);

    return {
      generated_at: new Date().toISOString(),
      ...(asOfDate ? { as_of_date: asOfDate } : {}),
      facilities,
      residents,
      incidents,
      incidentDetails,
      census
    };
  });
}

async function getIncidentStreamLive() {
  return getCachedLoader("incident-stream", 10_000, async () => {
    const rows = await queryDatabricks(`
      WITH latest_incidents AS (
        SELECT
          Unique_ID,
          Facility,
          Facility_Name,
          Res_Number,
          Unit_Number,
          Incident_Date_parsed,
          __TIMESTAMP,
          Incident_Category,
          Type_of_Incident,
          Location_of_Incident_General,
          Location_of_Incident_Specific,
          What_Staff_Saw,
          Assistance_Given,
          Injuires_YN,
          Notify_EmergSrvs_YN,
          Notify_Physician_YN,
          Notify_Family_YN,
          Notify_Manager_YN,
          Notify_Physician_Name,
          Notify_Family_Name,
          Notify_Manager_Name,
          Sentinel_Event_YN,
          Person_Completing_Report_Name,
          Prev_History_YN
        FROM alamohealth.gold.v_incidents
        ORDER BY coalesce(__TIMESTAMP, Incident_Date_parsed) DESC
        LIMIT 250
      )
      SELECT
        i.Unique_ID,
        i.Facility,
        i.Facility_Name,
        i.Res_Number,
        r.First_Name,
        r.Last_Name,
        coalesce(i.Unit_Number, r.Unit_Number) AS Unit_Number,
        i.Incident_Date_parsed,
        i.__TIMESTAMP,
        i.Incident_Category,
        i.Type_of_Incident,
        i.Location_of_Incident_General,
        i.Location_of_Incident_Specific,
        i.What_Staff_Saw,
        i.Assistance_Given,
        i.Injuires_YN,
        i.Notify_EmergSrvs_YN,
        i.Notify_Physician_YN,
        i.Notify_Family_YN,
        i.Notify_Manager_YN,
        i.Notify_Physician_Name,
        i.Notify_Family_Name,
        i.Notify_Manager_Name,
        i.Sentinel_Event_YN,
        i.Person_Completing_Report_Name,
        i.Prev_History_YN
      FROM latest_incidents i
      LEFT JOIN alamohealth.gold.v_tool_resident_profile r
        ON i.Res_Number = r.Res_Number
       AND i.Facility = r.Facility
    `);

    return rows.map((row) => {
      const priority = priorityFromIncident(row);
      const receivedAt =
        normalizeDisplayTimestamp(row.__TIMESTAMP) ||
        normalizeDisplayTimestamp(row.Incident_Date_parsed) ||
        new Date().toISOString();
      const detail = buildIncidentDetail(row);

      return {
        id: String(row.Unique_ID),
        priority,
        stage: "new",
        facility_id: normalizeFacilityId(row.Facility),
        facility_name: normalizeCommunityName(row.Facility_Name),
        resident_id: row.Res_Number == null ? "" : String(row.Res_Number),
        client_name: detail.client_name,
        unit_number: detail.unit_number,
        staff_name: normalizeNullable(row.Person_Completing_Report_Name),
        sender: normalizeNullable(row.Person_Completing_Report_Name),
        incident_type: normalizeString(row.Incident_Category || row.Type_of_Incident),
        location: [normalizeString(row.Location_of_Incident_General), normalizeString(row.Location_of_Incident_Specific)]
          .filter(Boolean)
          .join(" · "),
        incident_date: normalizeDisplayDateKey(row.Incident_Date_parsed),
        triage_score: priority === "HIGH" ? 90 : priority === "MEDIUM" ? 65 : 35,
        injury_occurred: normalizeString(row.Injuires_YN).toLowerCase() === "yes",
        police_called: normalizeString(row.Notify_EmergSrvs_YN).toLowerCase() === "yes",
        email_body: normalizeNullable(row.What_Staff_Saw),
        assistance_given: normalizeNullable(row.Assistance_Given),
        notifications: buildIncidentNotifications(row),
        flags: incidentFlags(row),
        received_at: receivedAt
      };
    });
  });
}

async function getReportsSummaryDataLive() {
  return getCachedLoader("reports-summary", 60_000, async () => {
    const censusRows = await queryDatabricks(`
      SELECT Facility, census, month_bucket
      FROM alamohealth.gold.v_census
      ORDER BY month_bucket DESC, Facility
    `);
    const complianceRows = await queryDatabricks(`
      SELECT Facility, Facility_Name, month_bucket, total_scheduled, given, not_given, compliance_pct
      FROM alamohealth.gold.v_medication_compliance
      ORDER BY month_bucket DESC, Facility
      LIMIT 120
    `);
    const refusalRows = await queryDatabricks(`
      SELECT Facility, Medication, total_scheduled, refusals, refusal_pct
      FROM alamohealth.gold.v_refusal_by_medication
      ORDER BY refusal_pct DESC, refusals DESC
      LIMIT 25
    `);
    const gapRows = await queryDatabricks(`
      SELECT Res_Number, First_Name, Last_Name, Facility, Facility_Name, last_note_date, days_since_last_note
      FROM alamohealth.gold.v_documentation_gaps
      ORDER BY days_since_last_note DESC
      LIMIT 25
    `);
    const weeklyCensusRows = await queryDatabricks(`
      SELECT
        Facility,
        Facility_Name,
        week_start,
        week_end,
        census_date,
        prior_census_date,
        month_bucket,
        census,
        census_7d_prior,
        census_change_7d
      FROM alamohealth.gold.v_tool_census_weekly_by_community
      ORDER BY week_start DESC, Facility
    `);

    return {
      census: censusRows.map((row) => ({
        facility_id: normalizeFacilityId(row.Facility),
        census: normalizeInteger(row.census),
        month_bucket: normalizeString(row.month_bucket)
      })),
      medicationCompliance: complianceRows.map((row) => ({
        facility_id: normalizeFacilityId(row.Facility),
        facility_name: normalizeCommunityName(row.Facility_Name),
        month_bucket: normalizeString(row.month_bucket),
        total_scheduled: normalizeInteger(row.total_scheduled),
        given: normalizeInteger(row.given),
        not_given: normalizeInteger(row.not_given),
        compliance_pct: normalizeDecimal(row.compliance_pct)
      })),
      refusalByMedication: refusalRows.map((row) => ({
        facility_id: normalizeFacilityId(row.Facility),
        medication: normalizeString(row.Medication),
        total_scheduled: normalizeInteger(row.total_scheduled),
        refusals: normalizeInteger(row.refusals),
        refusal_pct: normalizeDecimal(row.refusal_pct)
      })),
      documentationGaps: gapRows.map((row) => ({
        resident_id: String(row.Res_Number),
        resident_name: formatResidentName(row.First_Name, row.Last_Name),
        facility_id: normalizeFacilityId(row.Facility),
        facility_name: normalizeCommunityName(row.Facility_Name),
        last_note_date: normalizeDisplayDateKey(row.last_note_date),
        days_since_last_note: normalizeInteger(row.days_since_last_note)
      })),
      toolContext: {
        censusWeeklyByCommunity: weeklyCensusRows.map((row) => ({
          facility_id: normalizeFacilityId(row.Facility),
          facility_name: normalizeCommunityName(row.Facility_Name),
          week_start: normalizeDisplayDateKey(row.week_start),
          week_end: normalizeDisplayDateKey(row.week_end),
          census_date: normalizeDisplayDateKey(row.census_date),
          prior_census_date: normalizeDisplayDateKey(row.prior_census_date),
          month_bucket: normalizeString(row.month_bucket),
          census: normalizeInteger(row.census),
          census_7d_prior: normalizeInteger(row.census_7d_prior),
          census_change_7d: normalizeInteger(row.census_change_7d)
        }))
      }
    };
  });
}

async function getPlatformBootstrapLive() {
  return getCachedLoader("platform-bootstrap-live", 30_000, async () => {
    const health = await getPlatformHealthLive();
    const communities = await getCommunitiesDashboardDataLive();
    const incidents = await getIncidentStreamLive();
    const reportsSummary = await getReportsSummaryDataLive();
    const homeDashboard = buildHomeDashboard(communities, reportsSummary);

    return {
      generated_at: new Date().toISOString(),
      snapshot: {
        version: communities.generated_at,
        generated_at: communities.generated_at,
        freshness_checked_at: new Date().toISOString(),
        source: "live-databricks",
        ...(communities.as_of_date ? { as_of_date: communities.as_of_date } : {})
      },
      health,
      communities,
      incidents: {
        incidents
      },
      reportsSummary,
      homeDashboard
    };
  });
}

export async function getPlatformHealth(options = {}) {
  const analystQa = await getAnalystQaStatus();
  const qaArtifacts = await getQaArtifactStatuses();

  if (options.preferSnapshot !== false) {
    const snapshot = await readPlatformSnapshot();
    if (snapshot?.health) {
      return {
        ...snapshot.health,
        analystQa,
        qaArtifacts,
        snapshotDiagnostics: getSnapshotDiagnostics(snapshot)
      };
    }
  }

  return {
    ...(await getPlatformHealthLive()),
    analystQa,
    qaArtifacts
  };
}

export async function getCommunitiesDashboardData(options = {}) {
  if (options.preferSnapshot !== false) {
    const snapshotValue = await readSnapshotSection((snapshot) => snapshot.communities);
    if (snapshotValue) return normalizeCommunityLabels(snapshotValue);
    if (isProductionLikeRuntime()) throw missingSnapshotSection("community dashboard data");
  }

  return getCommunitiesDashboardDataLive();
}

export async function getDataExplorerData(kindValue) {
  const snapshot = await getRequiredPlatformSnapshot();
  return normalizeCommunityLabels(
    buildDataExplorerPayload(snapshot, kindValue, getSnapshotFreshness(snapshot))
  );
}

export async function getIncidentStream(options = {}) {
  if (options.preferSnapshot !== false) {
    const snapshotValue = await readSnapshotSection((snapshot) => snapshot.incidents?.incidents);
    if (snapshotValue) return normalizeCommunityLabels(snapshotValue);
  }

  return getIncidentStreamLive();
}

export async function getReportsSummaryData(options = {}) {
  let reportsSummary;
  if (options.preferSnapshot !== false) {
    const snapshotValue = await readSnapshotSection((snapshot) => snapshot.reportsSummary);
    if (snapshotValue) reportsSummary = snapshotValue;
    if (!snapshotValue && isProductionLikeRuntime()) throw missingSnapshotSection("analytics summary data");
  }

  reportsSummary ??= await getReportsSummaryDataLive();
  return options.includeAnalystHistory === false
    ? stripAnalystHistoryForClient(reportsSummary)
    : reportsSummary;
}

export async function getHomeDashboardData(options = {}) {
  if (options.preferSnapshot === false) {
    const [communities, reportsSummary] = await Promise.all([
      getCommunitiesDashboardData({ preferSnapshot: false }),
      getReportsSummaryData({ preferSnapshot: false })
    ]);

    return buildHomeDashboard(communities, reportsSummary);
  }

  const snapshot = await getRequiredPlatformSnapshot();
  const payload = buildHomeDashboard(
    snapshot.communities,
    snapshot.reportsSummary
  );
  return normalizeCommunityLabels(decorateSnapshotPayload(payload, snapshot));
}

export async function getCommunitySnapshotData(facilityId, options = {}) {
  const normalizedFacilityId = validateRequestedFacilityId(facilityId);

  if (options.preferSnapshot === false) {
    const communities = await getCommunitiesDashboardData({ preferSnapshot: false });
    const payload = buildCommunitySnapshot(communities, normalizedFacilityId);

    if (!payload) {
      throw new Error(`No community snapshot found for facility ${normalizedFacilityId}.`);
    }

    return payload;
  }

  const snapshot = await getRequiredPlatformSnapshot();
  const payload =
    snapshot.communitySnapshots?.[normalizedFacilityId] ??
    buildCommunitySnapshot(snapshot.communities, normalizedFacilityId);

  if (!payload) {
    throw new Error(`No community snapshot found for facility ${normalizedFacilityId}.`);
  }

  const canonicalIncidentDetails =
    snapshot.reportsSummary?.toolContext?.incidentDetailHistory ??
    snapshot.reportsSummary?.toolContext?.tables?.incident_detail_history ??
    snapshot.communities?.incidentDetails ??
    [];
  const hasDetails = Array.isArray(payload.incidentDetails) && payload.incidentDetails.length > 0;
  const detailPayload =
    hasDetails || !canonicalIncidentDetails.length
      ? payload
      : {
          ...payload,
          incidentDetails: canonicalIncidentDetails.filter(
            (incident) => incident.facility_id === normalizedFacilityId
          )
        };

  const hasCensus = Array.isArray(detailPayload.census) && detailPayload.census.length > 0;
  const fallbackPayload = hasCensus || !snapshot.communities?.census
    ? detailPayload
    : {
        ...detailPayload,
        census: snapshot.communities.census.filter(
          (row) => row.facility_id === normalizedFacilityId
        )
      };

  return normalizeCommunityLabels(decorateSnapshotPayload(fallbackPayload, snapshot));
}

export async function getPlatformBootstrap(options = {}) {
  if (options.preferSnapshot === false) {
    const payload = await getPlatformBootstrapLive();
    return {
      ...payload,
      reportsSummary: stripAnalystHistoryForClient(payload.reportsSummary)
    };
  }

  const snapshot = await getRequiredPlatformSnapshot();
  const homeDashboard = buildHomeDashboard(
    snapshot.communities,
    snapshot.reportsSummary
  );

  if (snapshot.homeDashboard && snapshot.communitySnapshots) {
    return normalizeCommunityLabels({
      ...snapshot,
      homeDashboard: decorateSnapshotPayload(homeDashboard, snapshot),
      reportsSummary: stripAnalystHistoryForClient(snapshot.reportsSummary),
      snapshot: {
        ...snapshot.snapshot,
        ...getSnapshotFreshness(snapshot)
      }
    });
  }

  const communitySnapshots =
    snapshot.communitySnapshots ??
    Object.fromEntries(
      (snapshot.communities?.facilities ?? [])
        .map((facility) => [
          facility.facility_id,
          buildCommunitySnapshot(snapshot.communities, facility.facility_id)
        ])
        .filter((entry) => entry[1])
    );

  return normalizeCommunityLabels({
    ...snapshot,
    reportsSummary: stripAnalystHistoryForClient(snapshot.reportsSummary),
    homeDashboard: decorateSnapshotPayload(homeDashboard, snapshot),
    communitySnapshots: Object.fromEntries(
      Object.entries(communitySnapshots).map(([key, value]) => [key, decorateSnapshotPayload(value, snapshot)])
    ),
    snapshot: {
      ...snapshot.snapshot,
      ...getSnapshotFreshness(snapshot)
    }
  });
}

export async function generatePlatformSnapshot(options = {}) {
  const publishAzure = options.publishAzure ?? false;
  const payload = await getPlatformBootstrapLive();
  const communitySnapshots = Object.fromEntries(
    (payload.communities?.facilities ?? [])
      .map((facility) => [
        facility.facility_id,
        buildCommunitySnapshot(payload.communities, facility.facility_id)
      ])
      .filter((entry) => entry[1])
  );

  const snapshotPayload = {
    ...payload,
    communitySnapshots,
    snapshot: {
      ...payload.snapshot,
      source: "published-snapshot"
    }
  };

  if (publishAzure) {
    assertToolContextSafeForAzurePublish(snapshotPayload);
  }

  await writePlatformSnapshot(snapshotPayload, { publishAzure });
  return payload;
}

export async function getPlatformSnapshotMetadata() {
  const snapshot = await readPlatformSnapshot();

  if (snapshot) {
    const freshness = getSnapshotFreshness(snapshot);
    return {
      available: true,
      version: snapshot.snapshot?.version ?? snapshot.generated_at,
      generated_at: snapshot.snapshot?.generated_at ?? snapshot.generated_at,
      freshness_checked_at:
        snapshot.snapshot?.freshness_checked_at ?? snapshot.generated_at,
      source: snapshot.snapshot?.source ?? "published-snapshot",
      stale: freshness.stale,
      ageHours: freshness.ageHours,
      maxAgeHours: freshness.maxAgeHours,
      warning: freshness.warning,
      diagnostics: getSnapshotDiagnostics(snapshot)
    };
  }

  return {
    available: false,
    version: null,
    generated_at: null,
    freshness_checked_at: new Date().toISOString(),
    source: "missing-snapshot",
    stale: true,
    ageHours: null,
    maxAgeHours: getSnapshotMaxAgeHours(),
    warning: "No published platform snapshot is available.",
    diagnostics: null
  };
}

export async function getPlatformSnapshotHealth() {
  const snapshot = await readPlatformSnapshot();
  const storage = getAzureSnapshotStorageSummary();

  if (!snapshot) {
    return {
      available: false,
      source: storage ? "azure-storage" : "local-fallback",
      generated_at: null,
      version: null,
      stale: true,
      residentCount: 0,
      azurePath: storage?.latestPath ?? null,
      azureContainer: storage?.container ?? null,
      databricksAuthMode: getDatabricksAuthMode(),
      warning: "No published platform snapshot is available."
    };
  }

  const freshness = getSnapshotFreshness(snapshot);
  const targets = getPlatformSnapshotTargets(snapshot);
  const residentCount =
    snapshot.homeDashboard?.portfolio?.residentCount ??
    snapshot.communities?.residents?.length ??
    0;
  const diagnostics = getSnapshotDiagnostics(snapshot);

  return {
    available: true,
    source: snapshot.snapshot?.source ?? (storage ? "published-snapshot" : "local-fallback"),
    generated_at: snapshot.snapshot?.generated_at ?? snapshot.generated_at ?? null,
    version: snapshot.snapshot?.version ?? snapshot.generated_at ?? null,
    stale: freshness.stale,
    residentCount,
    azurePath: targets.azure?.latest ?? storage?.latestPath ?? null,
    azureContainer: storage?.container ?? null,
    databricksAuthMode: getDatabricksAuthMode(),
    warning: freshness.warning,
    diagnostics
  };
}
