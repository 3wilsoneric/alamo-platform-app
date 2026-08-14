import { runCopilotTool } from "../server/copilot-tools.mjs";
import { getReportsSummaryData } from "../server/platform-data.mjs";
import { planAdHocModule } from "../shared/ad-hoc-module-spec.mjs";
import { createMedicationExceptionTools } from "../server/tools/medications.mjs";
import { createMedicationOrderTools } from "../server/tools/medication-orders.mjs";
import { buildResidentMedicationPresentation } from "../server/tools/resident-medications.mjs";
import { createToolDataAccess } from "../server/tools/tool-data-access.mjs";

const reportsSummary = await getReportsSummaryData();
const toolContext = reportsSummary.toolContext ?? {};
const tables = toolContext.tables ?? {};
const toolContextVersion = Number(toolContext.version ?? 0);
const isAzureSnapshotCheck = process.env.PLATFORM_SNAPSHOT_READ_SOURCE === "azure";
const marMonthlyRows =
  toolContext.marMonthlyByCommunityMedication?.length ??
  tables.mar_monthly_by_community_medication?.length ??
  0;
const marResidentRows =
  toolContext.marResidentSummary?.length ??
  tables.mar_resident_summary?.length ??
  0;
const marExceptionRows =
  toolContext.marExceptionDetails?.length ??
  tables.mar_exception_detail_90d?.length ??
  0;
const marMedicationOrderRows =
  toolContext.marMedicationOrdersCurrent?.length ??
  tables.mar_medication_orders_current?.length ??
  0;
const marReady = marMonthlyRows > 0 && marResidentRows > 0;

const cases = [
  {
    prompt: "show current medication orders for San Pablo",
    tool: "medication_orders_current",
    visualType: "table",
    mustInclude: ["Current medication orders"],
    mustExclude: ["Source:", "largest row"],
    requiresToolContextVersion: 8
  },
  {
    prompt: "How is San Pablo doing with medications?",
    tool: "medication_profile",
    visualType: "summary_card",
    visualTitleIncludes: "A & A Health Services San Pablo Medication Profile",
    mustInclude: ["Answer\n", "medication compliance", "scheduled administrations"],
    mustExclude: ["Portfolio medication profile", "largest row", "Source:"],
    requireVisualRowsWhenReady: 5
  },
  {
    prompt: "who needs medication attention at San Pablo?",
    tool: "medication_watch",
    visualType: "table",
    visualTitleIncludes: "A & A Health Services San Pablo Medication Watch",
    expectedModuleId: "medication-watch",
    mustInclude: ["Answer\n", "Medication Watch", "top medication watch"],
    mustExclude: ["Source:", "largest row"],
    requireVisualRowsWhenReady: 1,
    requiresMarReady: true
  },
  {
    prompt: "show San Pablo medication compliance in May and June",
    tool: "medication_compliance",
    visualType: "line_chart",
    periodIncludes: ["2026-05", "2026-06"],
    mustInclude: ["Answer\n", "May 2026 and June 2026", "Medication compliance uses scheduled administrations"],
    mustExclude: ["current-state data", "historical slice unavailable", "largest row"]
  },
  {
    prompt: "What medications had the most refusals at San Pablo in June 2026?",
    tool: "medication_refusals_by_community",
    visualTitleIncludes: "A & A Health Services San Pablo Medication Refusals",
    periodIncludes: ["2026-06"],
    mustInclude: ["Answer\n", "had the most"],
    mustExclude: ["current-state data", "historical slice unavailable", "largest row"],
    requiresMarReady: true
  },
  {
    prompt: "show San Pablo medication refusal detail in June 2026",
    tool: "medication_exception_detail",
    visualType: "table",
    periodIncludes: ["2026-06"],
    mustInclude: ["Answer\n", "governed MAR exception"],
    mustExclude: ["current-state data", "historical slice unavailable", "largest row", "Source:"],
    requiresMarReady: true,
    requiresToolContextVersion: 8
  },
  {
    prompt: "show late medication administrations",
    tool: "medication_exception_detail",
    visualType: "table",
    mustInclude: ["Answer\n", "late administration"],
    mustExclude: ["Source:", "largest row"],
    requiresMarReady: true,
    requiresToolContextVersion: 8
  },
  {
    prompt: "show PRN medication detail",
    tool: "medication_exception_detail",
    visualType: "table",
    mustInclude: ["Answer\n", "PRN"],
    mustExclude: ["Source:", "largest row"],
    requiresMarReady: true,
    requiresToolContextVersion: 8
  },
  {
    prompt: "show Shannon Romero medication profile",
    tool: "resident_lookup",
    visualType: "profile_card",
    visualTitleIncludes: "Shannon Romero Resident Profile",
    mustInclude: ["Answer\n", "Shannon Romero", "MAR"],
    mustExclude: ["Medication Exception Detail", "largest row", "Source:"]
  }
];

const failures = [];

if (isAzureSnapshotCheck && toolContextVersion < 8) {
  failures.push(
    `Azure snapshot tool context is v${toolContextVersion || "unknown"}; v8 is required for complete MAR exceptions, PRN effectiveness, and current medication orders. Run tool_context_views, analyst_context_qa, and snapshot_publish in that order.`
  );
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function runSyntheticResidentMedicationContract() {
  const access = createToolDataAccess({ normalizeText });
  const syntheticSummary = {
    toolContext: {
      tables: {
        resident_profile: [{
          res_number: "9510001",
          resident_name: "Test Resident",
          first_name: "Test",
          last_name: "Resident",
          facility_id: "337",
          facility_name: "A & A Health Services San Pablo"
        }],
        mar_resident_summary: [{
          resident_id: "9510001",
          facility_id: "337",
          active_medication_count: 1,
          compliance_pct_30d: 97.5
        }],
        mar_medication_orders_current: [{
          medication_order_id: "order-1",
          resident_id: "9510001",
          facility_id: "337",
          medication_name: "Example Medication",
          dosage: "10 MG",
          route: "Oral",
          schedule: "Daily",
          indication: "Example indication",
          is_prn: true
        }],
        mar_prn_effectiveness_90d: [{
          administration_id: "admin-1",
          resident_id: "9510001",
          facility_id: "337",
          medication_name: "Example Medication",
          administration_date: "2026-06-15",
          prn_reason: "Anxiety",
          prn_result: "Effective",
          has_effectiveness_followup: true
        }]
      }
    }
  };
  const residents = access.getResidentRows({ residents: [] }, syntheticSummary);
  const orders = access.getMarMedicationOrderRows(syntheticSummary);
  const prnRows = access.getMarPrnEffectivenessRows(syntheticSummary);
  const presentation = buildResidentMedicationPresentation({
    orders,
    displayValue: (value) => String(value ?? "—"),
    formatNumber: (value) => Number(value).toLocaleString("en-US")
  });
  if (residents[0]?.active_medication_count !== 1 || residents[0]?.mar_compliance_pct_30d !== 97.5) {
    failures.push("synthetic resident MAR summary did not join to the published resident_profile table");
  }
  if (presentation.rows[0]?.cells?.[0] !== "Example Medication" || presentation.rows[0]?.cells?.[5] !== "PRN") {
    failures.push("synthetic current medication order did not render dose/schedule metadata correctly");
  }
  if (prnRows[0]?.prn_result !== "Effective" || prnRows[0]?.has_effectiveness_followup !== true) {
    failures.push("synthetic PRN effectiveness detail did not preserve result and follow-up fields");
  }
}

function runSyntheticLoadedMarContract() {
  const facility = {
    facility_id: "337",
    community_name: "A & A Health Services San Pablo"
  };
  const syntheticRows = [
    {
      facility_id: "337",
      facility_name: facility.community_name,
      month_bucket: "2026-06",
      administration_date: "2026-06-15",
      scheduled_date: "2026-06-15",
      scheduled_time: "9:00 AM",
      resident_id: "9510001",
      resident_name: "Test Resident",
      medication: "Example Med",
      dosage: "10 MG",
      administration_outcome: "Not Given",
      outcome_category: "Not Given",
      not_given_reason: "Resident refused",
      is_refusal: true,
      is_prn: false,
      is_on_hold: false,
      is_over_60_minutes_late: false,
      minutes_late: 0
    }
  ];
  const tools = createMedicationExceptionTools({
    buildUnavailablePeriodResult: () => ({ handled: true, tool: "medication_exception_detail", truthState: "not_loaded" }),
    countBy: (rows, keyFn) => {
      const counts = new Map();
      for (const row of rows) {
        const key = keyFn(row);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...counts.entries()].sort((left, right) => right[1] - left[1]);
    },
    displayValue: (value) => String(value ?? "—"),
    filterByFacility: (rows, selectedFacility) => selectedFacility ? rows.filter((row) => row.facility_id === selectedFacility.facility_id) : rows,
    findFacility: (content) => /san pablo/i.test(content) ? facility : null,
    findResident: () => null,
    fingerprintRows: () => "synthetic-mar-rowset",
    formatDateLabel: (value) => String(value ?? ""),
    formatMonthLabel: (month) => month === "2026-06" ? "June 2026" : String(month ?? ""),
    formatNumber: (value) => Number(value).toLocaleString("en-US"),
    getFacilityNameById: () => facility.community_name,
    getMarExceptionDetailRows: (summary) => summary.syntheticRows,
    getPortfolioFallbackScopes: () => [],
    getRequestedMedicationName: () => null,
    getRequestedMonthBuckets: (content) => /june|jun|2026-06/i.test(content) ? ["2026-06"] : [],
    getResidentRows: () => [],
    makePreviewTableVisual: ({ title, subtitle, valueLabel, columns, rows, totalRows }) => ({
      type: "table",
      title,
      subtitle,
      valueLabel,
      columns,
      rows,
      originalRowCount: totalRows
    }),
    makeTrace: ({ tool, dataSource, rowCount, facility: selectedFacility, period, note, truthState }) => ({
      tool,
      dataSource,
      rowCount,
      facilityId: selectedFacility?.facility_id ?? null,
      communityName: selectedFacility?.community_name ?? null,
      period,
      note,
      truthState
    }),
    medicationMatches: () => true,
    normalizeText,
    rowsToCsv: () => "resident_name,medication\nTest Resident,Example Med\n"
  });
  const result = tools.buildMedicationExceptionDetailTool(
    "show San Pablo medication refusal detail in June 2026",
    { facilities: [facility] },
    { syntheticRows }
  );
  if (result.truthState !== "valid_rows") failures.push(`synthetic MAR exception detail: expected valid_rows, received ${result.truthState}`);
  if (result.visual?.type !== "table" || (result.visual?.rows?.length ?? 0) !== 1) failures.push("synthetic MAR exception detail: expected one table row");
  if (!String(result.text ?? "").includes("1 governed MAR refusal record")) failures.push("synthetic MAR exception detail: missing loaded refusal-record answer text");
  const moduleSpec = planAdHocModule("show San Pablo medication refusal detail in June 2026", result);
  if (moduleSpec?.moduleId !== "medication-exceptions") failures.push(`synthetic MAR exception detail: expected medication-exceptions module, received ${moduleSpec?.moduleId ?? "none"}`);
  if (moduleSpec?.templateId !== "data-table") failures.push(`synthetic MAR exception detail: expected data-table template, received ${moduleSpec?.templateId ?? "none"}`);
}

function runSyntheticCurrentMedicationOrdersContract() {
  const facility = {
    facility_id: "337",
    community_name: "A & A Health Services San Pablo"
  };
  const syntheticRows = [
    {
      medication_order_id: "order-1",
      resident_id: "9510001",
      resident_name: "Test Resident",
      facility_id: "337",
      facility_name: facility.community_name,
      medication: "Example Medication",
      dosage: "10 MG",
      route: "Oral",
      schedule: "Daily",
      indication: "Anxiety",
      is_prn: true,
      is_psychotropic: true,
      is_narcotic: false,
      is_on_hold: false,
      effective_date: "2026-06-01"
    },
    {
      medication_order_id: "order-2",
      resident_id: "9510002",
      resident_name: "Second Resident",
      facility_id: "337",
      facility_name: facility.community_name,
      medication: "Second Medication",
      dosage: "5 MG",
      route: "Oral",
      schedule: "Twice daily",
      indication: "Mood stabilization",
      is_prn: false,
      is_psychotropic: true,
      is_narcotic: false,
      is_on_hold: false,
      effective_date: "2026-06-02"
    }
  ];
  const tools = createMedicationOrderTools({
    countBy: (rows, keyFn) => {
      const counts = new Map();
      for (const row of rows) {
        const key = keyFn(row);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...counts.entries()].sort((left, right) => right[1] - left[1]);
    },
    displayValue: (value) => String(value ?? "—"),
    filterByFacility: (rows, selectedFacility) => selectedFacility ? rows.filter((row) => row.facility_id === selectedFacility.facility_id) : rows,
    findFacility: (content) => /san pablo/i.test(content) ? facility : null,
    fingerprintRows: () => "synthetic-current-orders",
    formatDateLabel: (value) => String(value ?? ""),
    formatNumber: (value) => Number(value).toLocaleString("en-US"),
    getMarMedicationOrderRows: () => syntheticRows,
    makePreviewTableVisual: ({ title, subtitle, valueLabel, columns, rows, totalRows }) => ({
      type: "table",
      title,
      subtitle,
      valueLabel,
      columns,
      rows,
      originalRowCount: totalRows
    }),
    makeTrace: ({ tool, dataSource, rowCount, facility: selectedFacility, note, truthState }) => ({
      tool,
      dataSource,
      rowCount,
      facilityId: selectedFacility?.facility_id ?? null,
      communityName: selectedFacility?.community_name ?? null,
      note,
      truthState
    }),
    rowsToCsv: (rows) => `medication_order_id,resident_name,medication\n${rows.map((row) => `${row.medication_order_id},${row.resident_name},${row.medication}`).join("\n")}\n`
  });
  const result = tools.buildMedicationOrdersTool(
    "show current medication orders for San Pablo",
    { facilities: [facility] },
    {}
  );
  if (result.truthState !== "valid_rows") failures.push(`synthetic current medication orders: expected valid_rows, received ${result.truthState}`);
  if (result.visual?.type !== "table" || result.visual?.rows?.length !== 2) failures.push("synthetic current medication orders: expected two table rows");
  if (!result.visual?.columns?.includes("Schedule") || !result.visual?.columns?.includes("Flags")) failures.push("synthetic current medication orders: missing order-detail columns");
  if (result.artifact?.rowCount !== 2 || !String(result.artifact?.content ?? "").includes("Second Medication")) failures.push("synthetic current medication orders: exact CSV artifact did not preserve both rows");
  if (!String(result.text ?? "").includes("2 current medication orders for 2 residents")) failures.push("synthetic current medication orders: answer did not distinguish order and resident counts");
}

function includesAll(text, expectedValues) {
  return expectedValues
    .filter((expected) => expected !== "Answer\n")
    .every((expected) => text.includes(expected));
}

runSyntheticLoadedMarContract();
runSyntheticResidentMedicationContract();
runSyntheticCurrentMedicationOrdersContract();

for (const testCase of cases) {
  const result = await runCopilotTool({
    content: testCase.prompt,
    sessionId: `mar-analytics-${Date.now()}-${Math.random()}`
  });
  const text = String(result.text ?? "");
  const rendered = JSON.stringify({
    text: result.text,
    visual: result.visual,
    actions: result.actions,
    trace: result.trace
  });

  if (result.tool !== testCase.tool) {
    failures.push(`${testCase.prompt}: expected tool ${testCase.tool}, received ${result.tool}`);
  }
  if (!result.runtimeSchema?.valid) {
    failures.push(`${testCase.prompt}: runtime schema invalid ${JSON.stringify(result.runtimeSchema?.errors ?? [])}`);
  }
  if (result.planValidation && result.planValidation.valid !== true) {
    failures.push(`${testCase.prompt}: plan validation failed ${JSON.stringify(result.planValidation.errors ?? [])}`);
  }
  if (testCase.requiresMarReady && !marReady) {
    if (!["not_loaded", "summary_not_shown", "plan_rejected"].includes(String(result.truthState ?? result.trace?.truthState ?? ""))) {
      failures.push(`${testCase.prompt}: expected safe MAR-unavailable state when MAR is not loaded, received ${result.truthState ?? result.trace?.truthState ?? "none"}`);
    }
    continue;
  }
  if (testCase.requiresToolContextVersion && toolContextVersion < testCase.requiresToolContextVersion) {
    continue;
  }
  if (testCase.visualType && result.visual?.type !== testCase.visualType) {
    failures.push(`${testCase.prompt}: expected visual type ${testCase.visualType}, received ${result.visual?.type ?? "none"}`);
  }
  if (testCase.visualTitleIncludes && !String(result.visual?.title ?? "").includes(testCase.visualTitleIncludes)) {
    failures.push(`${testCase.prompt}: visual title missing ${JSON.stringify(testCase.visualTitleIncludes)} from ${JSON.stringify(result.visual?.title ?? "")}`);
  }
  if (testCase.expectedModuleId) {
    const moduleSpec = planAdHocModule(testCase.prompt, result);
    if (moduleSpec?.moduleId !== testCase.expectedModuleId) {
      failures.push(`${testCase.prompt}: expected module ${testCase.expectedModuleId}, received ${moduleSpec?.moduleId ?? "none"}`);
    }
  }
  if (testCase.periodIncludes) {
    const period = String(result.trace?.period ?? "");
    for (const expectedPeriod of testCase.periodIncludes) {
      if (!period.includes(expectedPeriod)) {
        failures.push(`${testCase.prompt}: trace period ${JSON.stringify(period)} missing ${expectedPeriod}`);
      }
    }
  }
  if (!includesAll(text, testCase.mustInclude)) {
    failures.push(`${testCase.prompt}: missing expected text ${JSON.stringify(testCase.mustInclude.filter((value) => value !== "Answer\n" && !text.includes(value)))}`);
  }
  if (/^Answer\s*$/im.test(text)) {
    failures.push(`${testCase.prompt}: visible Answer heading leaked into the answer`);
  }
  for (const forbidden of testCase.mustExclude ?? []) {
    if (text.includes(forbidden)) {
      failures.push(`${testCase.prompt}: included forbidden text ${JSON.stringify(forbidden)}`);
    }
  }
  if (testCase.requireVisualRowsWhenReady && marReady && (result.visual?.rows?.length ?? 0) < testCase.requireVisualRowsWhenReady) {
    failures.push(`${testCase.prompt}: expected at least ${testCase.requireVisualRowsWhenReady} MAR visual rows when MAR is ready`);
  }
  if (marReady && /Governed MAR context is not loaded/i.test(text)) {
    failures.push(`${testCase.prompt}: claimed governed MAR was not loaded even though snapshot has MAR rows`);
  }
  if (/"label":"(?:337|342|343|344|345)"/.test(rendered) || /Victoria's Place/.test(rendered)) {
    failures.push(`${testCase.prompt}: rendered payload leaked a facility id or stale facility name`);
  }
  if ((result.actions ?? []).length > 2) {
    failures.push(`${testCase.prompt}: returned too many actions`);
  }
}

if (failures.length) {
  console.error(`FAILED: MAR analytics (${failures.length})`);
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`MAR analytics checks passed (${cases.length} prompts; monthly=${marMonthlyRows}, residents=${marResidentRows}, exceptions=${marExceptionRows}, currentOrders=${marMedicationOrderRows})`);
}
