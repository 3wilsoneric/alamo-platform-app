import { compileCopilotIntent, runCopilotTool } from "../server/copilot-tools.mjs";
import { validateToolResultSchema } from "../server/tools/result-schema.mjs";
import { rowsToCsv } from "../server/tools/table-artifacts.mjs";
import { toSpreadsheetText } from "../shared/csv.mjs";

function assert(condition, message, context = null) {
  if (condition) return;
  console.error(`FAILED: ${message}`);
  if (context) console.error(JSON.stringify(context, null, 2));
  process.exit(1);
}

function newSession(label) {
  return `answer-contract-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function textOf(result) {
  return String(result.text ?? "");
}

function csvRowCount(csv) {
  const rows = String(csv ?? "").trim().split(/\r?\n/).filter(Boolean);
  return Math.max(rows.length - 1, 0);
}

function isExportAction(action = {}) {
  return action?.tool === "export_csv" || /^export\b/i.test(String(action?.label ?? ""));
}

function assertActionPolicy(result, label, { exportIntent = false, maxActions = exportIntent ? 3 : 2 } = {}) {
  const actions = result.actions ?? [];
  assert(actions.length <= maxActions, `${label}: exposed too many action chips`, actions);
  if (!exportIntent) {
    assert(!actions.some(isExportAction), `${label}: exposed export action without export intent`, actions);
  }
}

function isExportIntentText(content) {
  return /\b(export|download|csv)\b/i.test(String(content ?? ""));
}

const EXPECTED_LARGE_DETAIL_PREVIEW_ROWS = 50;

const formulaSafeCsv = rowsToCsv([{
  resident: "=2+2",
  description: "+SUM(A1:A2)",
  source: "@external",
  stringNumber: "-5",
  numericValue: -5
}]);
assert(formulaSafeCsv.includes("'=2+2"), "CSV export did not neutralize equals-formula cells", formulaSafeCsv);
assert(formulaSafeCsv.includes("'+SUM(A1:A2)"), "CSV export did not neutralize plus-formula cells", formulaSafeCsv);
assert(formulaSafeCsv.includes("'@external"), "CSV export did not neutralize at-formula cells", formulaSafeCsv);
assert(formulaSafeCsv.includes("'-5"), "CSV export did not neutralize string cells beginning with minus", formulaSafeCsv);
assert(formulaSafeCsv.endsWith(",-5"), "CSV export changed a legitimate numeric value", formulaSafeCsv);
assert(toSpreadsheetText("=HYPERLINK(\"https://example.invalid\")").startsWith("'="), "Spreadsheet export did not neutralize formula text");
assert(toSpreadsheetText(-5) === "-5", "Spreadsheet export changed a legitimate numeric value");

function assertLoadedWindowRecovery(result, label) {
  const text = textOf(result);
  const surfacedText = [text, result.visual?.subtitle].filter(Boolean).join(" ");
  assert((result.truthState ?? result.trace?.truthState) === "not_loaded", `${label}: did not mark not-loaded truth state`, result);
  assert(/not available|unavailable|not loaded/i.test(text), `${label}: did not explain missing data`, result);
  assert(/Available (range|periods?)/i.test(text), `${label}: did not name the available period range`, result);
  assert(/did not substitute a different period/i.test(surfacedText), `${label}: did not refuse an unrequested period`, result);
  assert(/closest available periods? in the same scope/i.test(text), `${label}: did not name the closest available period`, result);
  assert(/(?:request|answering it) requires|Requested level:/i.test(text), `${label}: did not identify the requested level`, result);
  assert(result.visual?.title === "Available Data for This Request", `${label}: did not render coverage diagnostics`, result.visual);
  assert(result.visual?.rows?.some((row) => row.label === "Available at requested scope"), `${label}: diagnostics omitted requested-scope coverage`, result.visual);
  const closestAction = result.actions?.find((action) => /^(Show|Compare) /i.test(action.label ?? ""));
  assert(closestAction?.prompt, `${label}: did not offer a precise closest-period rerun`, result.actions);
  assert(result.safeRefusal === true, `${label}: did not mark safe refusal`, result);
}

function assertLargePreviewPreservesArtifact(result, label) {
  assert(result.artifact?.content, `${label}: did not preserve full CSV artifact`, result);
  assert(result.artifact?.rowCount === csvRowCount(result.artifact.content), `${label}: artifact row count mismatch`, result.artifact);
  assert(result.visual?.type === "table", `${label}: did not render a table preview`, result.visual);
  assert(result.visual?.originalRowCount === result.artifact.rowCount, `${label}: visual did not declare the full artifact row count`, {
    visual: result.visual,
    artifact: result.artifact
  });
  if ((result.artifact?.rowCount ?? 0) > EXPECTED_LARGE_DETAIL_PREVIEW_ROWS) {
    assert(result.visual?.rows.length === EXPECTED_LARGE_DETAIL_PREVIEW_ROWS, `${label}: did not cap in-chat visual rows`, {
      visualRows: result.visual?.rows.length,
      artifactRows: result.artifact?.rowCount
    });
    const evidenceText = `${textOf(result)} ${result.structuredAnswer?.definition ?? ""}`;
    assert(/CSV includes all [\d,]+ exact matches/i.test(evidenceText), `${label}: did not tell the user the CSV preserves the full record set`, result);
    assert(!/preview starts with|expand to 50/i.test(evidenceText), `${label}: exposed table-preview mechanics in the analyst answer`, result);
  }
}

function assertNoExplorerActions(result, label) {
  assert(
    !(result.actions ?? []).some((candidate) => candidate.kind === "external" && /\/explorer\//.test(candidate.url ?? "")),
    `${label}: exposed explorer action while explorer links are paused`,
    result.actions
  );
}

function assertValid(result, label) {
  assert(result.handled, `${label}: result was not handled`, result);
  assert(result.planValidation?.valid !== false, `${label}: plan validation failed`, result.planValidation);
}

function assertToolResultContract(result, label) {
  assert(typeof result.handled === "boolean", `${label}: missing handled boolean`, result);
  assert(typeof result.tool === "string" && result.tool.length > 0, `${label}: missing tool string`, result);
  assert(typeof result.text === "string" && result.text.trim().length > 0, `${label}: missing text answer`, result);
  assert(result.truthState, `${label}: missing result truthState`, result);
  assert(result.trace && typeof result.trace === "object", `${label}: missing trace object`, result);
  assert(typeof result.trace.tool === "string" && result.trace.tool.length > 0, `${label}: trace missing tool`, result.trace);
  assert("rowCount" in result.trace, `${label}: trace missing rowCount`, result.trace);
  assert(result.trace.truthState, `${label}: trace missing truthState`, result.trace);
  assert(result.trace.truthState === result.truthState, `${label}: trace truthState differs from result truthState`, {
    truthState: result.truthState,
    traceTruthState: result.trace.truthState
  });
  assert(result.runtimeSchema?.valid === true, `${label}: runtime schema was not valid`, result.runtimeSchema);
  assert(Array.isArray(result.actions), `${label}: actions must always be an array`, result.actions);
  if (result.truthState ?? result.trace?.truthState) {
    assert(["valid_rows", "verified_zero", "summary_not_shown", "not_loaded", "stale", "plan_rejected"].includes(result.truthState ?? result.trace?.truthState), `${label}: invalid truth state`, {
      truthState: result.truthState,
      traceTruthState: result.trace?.truthState
    });
  }
  if (result.visual) {
    assert(typeof result.visual.type === "string" && result.visual.type.length > 0, `${label}: visual missing type`, result.visual);
    assert(typeof result.visual.title === "string" && result.visual.title.length > 0, `${label}: visual missing title`, result.visual);
    assert(Array.isArray(result.visual.rows), `${label}: visual rows must always be an array`, result.visual);
  }
  if (result.artifact) {
    assert(result.artifact.content || result.artifact.href || result.artifact.url, `${label}: artifact missing retrievable content`, result.artifact);
    assert(result.artifact.rowSetId, `${label}: artifact missing rowSetId`, result.artifact);
    assert(Number.isFinite(Number(result.artifact.rowCount)), `${label}: artifact missing rowCount`, result.artifact);
    assert(result.provenance?.rowSetId === result.artifact.rowSetId, `${label}: artifact/provenance rowSetId mismatch`, {
      artifact: result.artifact,
      provenance: result.provenance
    });
    assert(Number(result.provenance?.rowCount) === Number(result.artifact.rowCount), `${label}: artifact/provenance rowCount mismatch`, {
      artifact: result.artifact,
      provenance: result.provenance
    });
    assert(result.provenance?.dataset, `${label}: artifact provenance missing dataset`, result.provenance);
  }
}

function assertSchemaInvalid(fixture, expectedError, label) {
  const validation = validateToolResultSchema(fixture);
  assert(!validation.valid, `${label}: schema unexpectedly passed`, validation);
  assert(validation.errors.some((schemaError) => schemaError.includes(expectedError)), `${label}: schema did not report ${expectedError}`, validation);
}

const validSchemaFixture = {
  handled: true,
  tool: "incident_breakdown",
  text: "May 2026 AWOL/Elopement: Portfolio had 195 incident rows.",
  truthState: "valid_rows",
  trace: {
    tool: "incident_breakdown",
    rowCount: 195,
    truthState: "valid_rows"
  },
  actions: [],
  visual: {
    type: "bar_chart",
    title: "Portfolio AWOL/Elopement Incidents",
    rows: [{ label: "AWOL/Elopement", value: 195 }]
  }
};
assert(validateToolResultSchema(validSchemaFixture).valid, "Valid schema fixture did not pass", validateToolResultSchema(validSchemaFixture));
assertSchemaInvalid(
  {
    ...validSchemaFixture,
    text: "x".repeat(250_001)
  },
  "oversized text",
  "Oversized answer text schema guard"
);
assertSchemaInvalid(
  {
    ...validSchemaFixture,
    actions: [{ kind: "external", label: "Unsafe", url: "javascript:alert(1)" }]
  },
  "invalid URL",
  "Unsafe action URL schema guard"
);
assertSchemaInvalid(
  {
    ...validSchemaFixture,
    truthState: undefined,
    trace: { ...validSchemaFixture.trace, truthState: undefined }
  },
  "missing truthState",
  "Missing truthState schema guard"
);
assertSchemaInvalid(
  {
    ...validSchemaFixture,
    trace: { ...validSchemaFixture.trace, truthState: "stale" }
  },
  "does not match",
  "Mismatched truthState schema guard"
);
assertSchemaInvalid(
  {
    ...validSchemaFixture,
    trace: undefined
  },
  "trace must be an object",
  "Missing trace schema guard"
);
assertSchemaInvalid(
  {
    ...validSchemaFixture,
    artifact: {
      type: "csv",
      filename: "rows.csv",
      mimeType: "text/csv",
      content: "name\nA"
    }
  },
  "csv artifact is missing rowSetId",
  "Missing CSV artifact identity guard"
);
assertSchemaInvalid(
  {
    ...validSchemaFixture,
    artifact: {
      type: "csv",
      filename: "rows.csv",
      mimeType: "text/csv",
      content: "name\nA",
      rowSetId: "abc123",
      rowCount: 1
    }
  },
  "csv artifact is missing provenance",
  "Missing CSV provenance guard"
);
assertSchemaInvalid(
  {
    ...validSchemaFixture,
    artifact: {
      type: "csv",
      filename: "rows.csv",
      mimeType: "text/csv",
      content: "name\nA\nB",
      rowSetId: "abc123",
      rowCount: 1
    },
    provenance: {
      rowSetId: "abc123",
      rowCount: 1,
      dataset: "test_rows"
    }
  },
  "does not match content row count",
  "CSV payload row-count guard"
);
assertSchemaInvalid(
  {
    ...validSchemaFixture,
    visual: {
      type: "table",
      title: "Previewed Rows",
      columns: ["Name"],
      rows: [{ label: "A", value: 0, cells: ["A"] }]
    },
    artifact: {
      type: "csv",
      filename: "rows.csv",
      mimeType: "text/csv",
      content: "name\nA\nB",
      rowSetId: "abc123",
      rowCount: 2
    },
    provenance: {
      rowSetId: "abc123",
      rowCount: 2,
      dataset: "test_rows"
    }
  },
  "missing originalRowCount",
  "Table preview original row-count guard"
);
assertSchemaInvalid(
  {
    ...validSchemaFixture,
    visual: {
      type: "table",
      title: "Previewed Rows",
      columns: ["Name"],
      originalRowCount: 1,
      rows: [{ label: "A", value: 0, cells: ["A"] }]
    },
    artifact: {
      type: "csv",
      filename: "rows.csv",
      mimeType: "text/csv",
      content: "name\nA\nB",
      rowSetId: "abc123",
      rowCount: 2
    },
    provenance: {
      rowSetId: "abc123",
      rowCount: 2,
      dataset: "test_rows"
    }
  },
  "originalRowCount does not match",
  "Table preview artifact row-count mismatch guard"
);

async function checkedTool(payload, label) {
  const result = await runCopilotTool(payload);
  assertToolResultContract(result, label);
  assertActionPolicy(result, label, { exportIntent: isExportIntentText(payload.content) });
  return result;
}

const awolPeople = await checkedTool({
  content: "i just want to know how many people went AWOL in May 2026",
  sessionId: newSession("awol-people")
}, "AWOL people count");
assertValid(awolPeople, "AWOL people count");
assert(awolPeople.tool === "incident_breakdown", "AWOL people count selected wrong tool", awolPeople);
assert(awolPeople.visual?.valueLabel === "Residents", "AWOL people count did not use resident grain", awolPeople.visual);
assert(/unique resident/i.test(textOf(awolPeople)), "AWOL people count did not define unique-resident grain", awolPeople);
assert(!/largest row/i.test(textOf(awolPeople)), "AWOL people count used generic largest-row language", awolPeople);
assert((awolPeople.actions ?? []).length <= 1, "AWOL people count exposed too many follow-up chips for a direct answer", awolPeople.actions);

const historicalClientCount = await checkedTool({
  content: "how many clients at san pablo in january of 2026",
  sessionId: newSession("historical-client-count")
}, "Historical client count");
assertValid(historicalClientCount, "Historical client count");
assert(historicalClientCount.tool === "census_trend", "Historical client count selected wrong tool", historicalClientCount);
assert(historicalClientCount.trace?.period === "2026-01", "Historical client count did not preserve requested month", historicalClientCount.trace);
assert(/had 139 clients in January 2026/i.test(textOf(historicalClientCount)), "Historical client count did not answer directly", historicalClientCount);
assert(!/could not answer|missing requested period|closest recovery path/i.test(textOf(historicalClientCount)), "Historical client count fell into recovery language", historicalClientCount);

const awolEvents = await checkedTool({
  content: "how many AWOL incidents in May 2026 total",
  sessionId: newSession("awol-events")
}, "AWOL incident count");
assertValid(awolEvents, "AWOL incident count");
assert(awolEvents.tool === "incident_breakdown", "AWOL incident count selected wrong tool", awolEvents);
assert(awolEvents.visual?.valueLabel === "Incidents", "AWOL incident count did not use incident-event grain", awolEvents.visual);
assert(!/unique resident/i.test(textOf(awolEvents)), "AWOL incident count incorrectly answered unique residents", awolEvents);

const awolClientsLastMonth = await checkedTool({
  content: "how many clients went AWOL last month",
  sessionId: newSession("awol-clients-last-month")
}, "AWOL clients last month");
assertValid(awolClientsLastMonth, "AWOL clients last month");
assert(awolClientsLastMonth.tool === "incident_breakdown", "AWOL clients last month selected wrong tool", awolClientsLastMonth);
assert(awolClientsLastMonth.trace?.period === "2026-05", "AWOL clients last month did not resolve to prior completed month", awolClientsLastMonth.trace);
assert(awolClientsLastMonth.visual?.valueLabel === "Residents", "AWOL clients last month did not use resident grain", awolClientsLastMonth.visual);
assert(/63 unique residents/i.test(textOf(awolClientsLastMonth)), "AWOL clients last month did not answer unique residents", awolClientsLastMonth);
assert(/unique residents (?:were )?involved (?:in|across) [\d,]+ .*incidents/i.test(textOf(awolClientsLastMonth)), "AWOL clients last month exposed unclear grain wording", awolClientsLastMonth);

const awolEventsLastMonth = await checkedTool({
  content: "total AWOL events last month",
  sessionId: newSession("awol-events-last-month")
}, "AWOL events last month");
assertValid(awolEventsLastMonth, "AWOL events last month");
assert(awolEventsLastMonth.tool === "incident_breakdown", "AWOL events last month selected wrong tool", awolEventsLastMonth);
assert(awolEventsLastMonth.trace?.period === "2026-05", "AWOL events last month did not resolve to prior completed month", awolEventsLastMonth.trace);
assert(awolEventsLastMonth.visual?.valueLabel === "Incidents", "AWOL events last month did not use incident grain", awolEventsLastMonth.visual);
assert(/195 .*incidents/i.test(textOf(awolEventsLastMonth)), "AWOL events last month did not answer incident volume", awolEventsLastMonth);
assert(!/63 unique residents/i.test(textOf(awolEventsLastMonth)), "AWOL events last month incorrectly answered residents", awolEventsLastMonth);

const awolDrivers = await checkedTool({
  content: "who is driving AWOL incidents in May 2026",
  sessionId: newSession("awol-drivers")
}, "AWOL resident drivers");
assertValid(awolDrivers, "AWOL resident drivers");
assert(awolDrivers.tool === "incident_resident_drivers", "AWOL resident drivers selected wrong tool", awolDrivers);
assert(awolDrivers.trace?.period === "2026-05", "AWOL resident drivers did not preserve requested month", awolDrivers.trace);
assert(/\bhad the most\b/i.test(textOf(awolDrivers)) && textOf(awolDrivers).includes(String(awolDrivers.visual?.rows?.[0]?.label ?? "")), "AWOL resident drivers did not identify a top resident", awolDrivers);
assert(awolDrivers.visual?.type === "table", "AWOL resident drivers did not render a table", awolDrivers.visual);
assert((awolDrivers.visual?.rows?.length ?? 0) >= 5, "AWOL resident drivers returned too few rows", awolDrivers.visual);
assert((awolDrivers.actions ?? []).length <= 1, "AWOL resident drivers exposed too many action chips", awolDrivers.actions);

const sanPabloDriverFollowUpSession = newSession("san-pablo-driver-followup");
const sanPabloMayIncidents = await checkedTool({
  content: "incidents san pablo may 2026",
  sessionId: sanPabloDriverFollowUpSession
}, "San Pablo May incident setup");
assertValid(sanPabloMayIncidents, "San Pablo May incident setup");
assert(sanPabloMayIncidents.tool === "incident_breakdown", "San Pablo May setup selected wrong tool", sanPabloMayIncidents);

const sanPabloMayDrivers = await checkedTool({
  content: "who had the most incidents in san pablo in may",
  sessionId: sanPabloDriverFollowUpSession
}, "San Pablo May incident driver direct follow-up");
assertValid(sanPabloMayDrivers, "San Pablo May incident driver direct follow-up");
assert(sanPabloMayDrivers.tool === "incident_resident_drivers", "San Pablo May driver follow-up selected wrong tool", sanPabloMayDrivers);
assert(sanPabloMayDrivers.trace?.period === "2026-05", "San Pablo May driver follow-up did not preserve May", sanPabloMayDrivers.trace);
assert(String(sanPabloMayDrivers.trace?.facilityId) === "337", "San Pablo May driver follow-up did not preserve San Pablo", sanPabloMayDrivers.trace);
assert(/Chandeng Xayavong|Tuesday Woo/i.test(textOf(sanPabloMayDrivers)), "San Pablo May driver follow-up did not name a top resident", sanPabloMayDrivers);

const sanPabloMayDriversTerse = await checkedTool({
  content: "who? what client had the most",
  sessionId: sanPabloDriverFollowUpSession
}, "San Pablo May incident driver terse follow-up");
assertValid(sanPabloMayDriversTerse, "San Pablo May incident driver terse follow-up");
assert(sanPabloMayDriversTerse.tool === "incident_resident_drivers", "Terse driver follow-up selected wrong tool", sanPabloMayDriversTerse);
assert(sanPabloMayDriversTerse.trace?.period === "2026-05", "Terse driver follow-up did not preserve May", sanPabloMayDriversTerse.trace);
assert(String(sanPabloMayDriversTerse.trace?.facilityId) === "337", "Terse driver follow-up did not preserve San Pablo", sanPabloMayDriversTerse.trace);

const detailSession = newSession("detail-followups");
const detail = await checkedTool({
  content: "List every AWOL incident from May through June by community, including resident name, date, incident type, and description",
  sessionId: detailSession
}, "May-June AWOL detail list");
assertValid(detail, "May-June AWOL detail list");
assert(detail.tool === "incident_detail_list", "May-June AWOL detail list selected wrong tool", detail);
assert(detail.visual?.type === "table", "May-June AWOL detail list did not render a table", detail.visual);
assert(detail.artifact?.content, "May-June AWOL detail list did not produce CSV artifact", detail);
assert(csvRowCount(detail.artifact.content) === (detail.visual.originalRowCount ?? detail.visual.rows.length), "May-June AWOL export row count does not match visual row contract", {
  csvRows: csvRowCount(detail.artifact.content),
  visualRows: detail.visual.rows.length,
  originalRowCount: detail.visual.originalRowCount
});
assert(/May 2026|2026-05/i.test(textOf(detail)) && /June 2026|2026-06/i.test(textOf(detail)), "May-June detail answer did not name both requested periods", detail);
assertNoExplorerActions(detail, "May-June AWOL detail list");

const mixedUnavailableDetail = await checkedTool({
  content: "List every AWOL incident from June 2026 and November 2020 by community including resident name date incident type and description",
  sessionId: newSession("mixed-unavailable-detail")
}, "Mixed unavailable detail rows");
assert(mixedUnavailableDetail.tool === "incident_detail_list", "Mixed unavailable detail rows selected wrong tool", mixedUnavailableDetail);
assert((mixedUnavailableDetail.truthState ?? mixedUnavailableDetail.trace?.truthState) === "not_loaded", "Mixed unavailable detail did not mark not-loaded truth state", mixedUnavailableDetail);
assert(mixedUnavailableDetail.safeRefusal === true, "Mixed unavailable detail did not fail closed", mixedUnavailableDetail);
assert(!mixedUnavailableDetail.artifact?.content, "Mixed unavailable detail exported a partial row set", mixedUnavailableDetail);
assert(/2026-06/.test(String(mixedUnavailableDetail.trace?.period ?? "")) && /2020-11/.test(String(mixedUnavailableDetail.trace?.period ?? "")), "Mixed unavailable detail did not preserve every requested period in trace", mixedUnavailableDetail.trace);
assert(!/Jan 2021|Feb 2021|Mar 2021/i.test(textOf(mixedUnavailableDetail)), "Mixed unavailable detail expanded a discrete request into a broad range", mixedUnavailableDetail);
assertLoadedWindowRecovery(mixedUnavailableDetail, "Mixed unavailable detail");

const explicitExport = await checkedTool({
  content: "export every AWOL incident from May 2026 to CSV",
  sessionId: newSession("explicit-export")
}, "Explicit export request");
assertValid(explicitExport, "Explicit export request");
assert(explicitExport.tool === "export_csv", "Explicit export request selected wrong tool", explicitExport);
assert(explicitExport.artifact?.content, "Explicit export request did not return a CSV artifact", explicitExport);
assert(explicitExport.artifact?.rowCount === csvRowCount(explicitExport.artifact.content), "Explicit export artifact row count mismatch", explicitExport.artifact);

const aprilFollowUp = await checkedTool({
  content: "do that for April now",
  sessionId: detailSession
}, "April follow-up detail list");
assertValid(aprilFollowUp, "April follow-up detail list");
assert(aprilFollowUp.tool === "incident_detail_list", "April follow-up selected wrong tool", aprilFollowUp);
assert(aprilFollowUp.trace?.period === "2026-04", "April follow-up did not patch period to April", aprilFollowUp.trace);
assert(/2026-04|Apr 2026|April 2026/i.test(textOf(aprilFollowUp)), "April follow-up answer did not name April", aprilFollowUp);

const largeDetail = await checkedTool({
  content: "List every incident from June 2026 by community including resident name date incident type and description",
  sessionId: newSession("large-detail-preview")
}, "Large exact detail preview");
assertValid(largeDetail, "Large exact detail preview");
assert(largeDetail.tool === "incident_detail_list", "Large exact detail selected wrong tool", largeDetail);
assertLargePreviewPreservesArtifact(largeDetail, "Large exact detail preview");
assert((largeDetail.actions ?? []).length <= 1, "Large exact detail preview exposed too many action chips", largeDetail.actions);
assertNoExplorerActions(largeDetail, "Large exact detail preview");

const allIncidentHistory = await checkedTool({
  content: "search every incident ever",
  sessionId: newSession("all-incident-history")
}, "All loaded incident history");
assertValid(allIncidentHistory, "All loaded incident history");
assert(allIncidentHistory.tool === "incident_detail_list", "All loaded incident history selected wrong tool", allIncidentHistory);
assert(allIncidentHistory.moduleSpec?.moduleId === "incident-detail-list", "All loaded incident history did not render the incident detail module", allIncidentHistory.moduleSpec);
assert((allIncidentHistory.artifact?.rowCount ?? 0) > 1000, "All loaded incident history only returned a small/latest-month row set", allIncidentHistory.artifact);
assert(String(allIncidentHistory.trace?.period ?? "").split(",").length >= 3, "All loaded incident history did not include multiple loaded periods", allIncidentHistory.trace);
assert(!/^2026-06$/.test(String(allIncidentHistory.trace?.period ?? "")), "All loaded incident history collapsed to latest month only", allIncidentHistory.trace);
assertLargePreviewPreservesArtifact(allIncidentHistory, "All loaded incident history");
assertNoExplorerActions(allIncidentHistory, "All loaded incident history");

const allMedicationRefusalHistory = await checkedTool({
  content: "find medication refusal incidents ever",
  sessionId: newSession("all-medication-refusal-history")
}, "All medication refusal incident history");
assertValid(allMedicationRefusalHistory, "All medication refusal incident history");
assert(allMedicationRefusalHistory.tool === "incident_detail_list", "Medication refusal incident search selected wrong tool", allMedicationRefusalHistory);
assert(/Medication Refusal/i.test(textOf(allMedicationRefusalHistory)), "Medication refusal incident search lost the category", allMedicationRefusalHistory);
assert((allMedicationRefusalHistory.artifact?.rowCount ?? 0) > 100, "Medication refusal incident search did not return loaded history rows", allMedicationRefusalHistory.artifact);
assert(String(allMedicationRefusalHistory.trace?.period ?? "").split(",").length >= 3, "Medication refusal incident search did not include multiple loaded periods", allMedicationRefusalHistory.trace);

const residentRosterDetail = await checkedTool({
  content: "list every resident row",
  sessionId: newSession("resident-roster-detail")
}, "Resident roster detail");
assertValid(residentRosterDetail, "Resident roster detail");
assert(residentRosterDetail.tool === "detail_list", "Resident roster detail selected wrong tool", residentRosterDetail);
assertLargePreviewPreservesArtifact(residentRosterDetail, "Resident roster detail");
assert((residentRosterDetail.artifact?.rowCount ?? 0) >= 100, "Resident roster detail did not preserve the full row set", residentRosterDetail.artifact);
assert(/CSV includes all [\d,]+ exact matches/i.test(textOf(residentRosterDetail)), "Resident roster detail did not explain the complete CSV", residentRosterDetail);
assert((residentRosterDetail.actions ?? []).length === 0, "Resident roster detail exposed action clutter", residentRosterDetail.actions);

const largeGenericCensusDetail = await checkedTool({
  content: "list every census row",
  sessionId: newSession("large-generic-census-detail-preview")
}, "Large generic census detail preview");
assertValid(largeGenericCensusDetail, "Large generic census detail preview");
assert(largeGenericCensusDetail.tool === "detail_list", "Large generic census detail selected wrong tool", largeGenericCensusDetail);
assertLargePreviewPreservesArtifact(largeGenericCensusDetail, "Large generic census detail preview");
assert(largeGenericCensusDetail.provenance?.dataset === "census", "Large generic census detail did not preserve dataset provenance", largeGenericCensusDetail.provenance);
assert((largeGenericCensusDetail.actions ?? []).length <= 1, "Large generic census detail preview exposed too many action chips", largeGenericCensusDetail.actions);
assertNoExplorerActions(largeGenericCensusDetail, "Large generic census detail preview");

const broadReset = await checkedTool({
  content: "How is San Pablo?",
  sessionId: detailSession
}, "Broad community reset");
assertValid(broadReset, "Broad community reset");
assert(broadReset.tool === "community_history", "Broad community reset did not route to community operating history", broadReset);
assert(broadReset.analysisFrame?.metric === null && broadReset.analysisFrame?.category === null, "Broad community reset inherited analytical filters", broadReset.analysisFrame);
assert(!/AWOL\/Elopement detail|May through June/i.test(textOf(broadReset)), "Broad community reset leaked prior detail context", broadReset);

const communityHistorySession = newSession("community-history");
const sanPabloLastThreeMonths = await checkedTool({
  content: "san pablo, how has been the last three months",
  sessionId: communityHistorySession
}, "Community history last-three-months");
assertValid(sanPabloLastThreeMonths, "Community history last-three-months");
assert(sanPabloLastThreeMonths.tool === "community_history", "Broad historical community question did not route to community history", sanPabloLastThreeMonths);
assert(sanPabloLastThreeMonths.visual?.type === "table", "Community history did not render a table", sanPabloLastThreeMonths.visual);
assert(
  /April 2026 through June 2026/i.test(textOf(sanPabloLastThreeMonths)) &&
    ["April 2026", "May 2026", "June 2026"].every((month) =>
      sanPabloLastThreeMonths.visual?.rows?.some((row) => row.label === month)
    ),
  "Last-three-month community history did not include the requested range and monthly rows",
  sanPabloLastThreeMonths
);
assert(!/current-state data|did not substitute/i.test(textOf(sanPabloLastThreeMonths)), "Community history incorrectly failed as current-state-only", sanPabloLastThreeMonths);
assert(!/AHS Turlock OP LLC/.test(String(sanPabloLastThreeMonths.visual?.rows?.at(-1)?.cells?.[3] ?? "")), "Numeric incident count was replaced with a facility name", sanPabloLastThreeMonths.visual);

const sanPabloTypoCrossYearRange = await checkedTool({
  content: "hey how was pablo november throuhg january",
  sessionId: newSession("community-history-typo-cross-year")
}, "Community history typo cross-year range");
assertValid(sanPabloTypoCrossYearRange, "Community history typo cross-year range");
assert(sanPabloTypoCrossYearRange.tool === "community_history", "Typo/cross-year community question did not route to community history", sanPabloTypoCrossYearRange);
assert(sanPabloTypoCrossYearRange.trace?.facilityId === "337", "Pablo shorthand did not resolve to San Pablo", sanPabloTypoCrossYearRange.trace);
assert(sanPabloTypoCrossYearRange.trace?.period === "2025-11, 2025-12, 2026-01", "Typo/cross-year range did not resolve to the loaded Nov-Jan span", sanPabloTypoCrossYearRange.trace);
assert(/November 2025/i.test(textOf(sanPabloTypoCrossYearRange)) && /January 2026/i.test(textOf(sanPabloTypoCrossYearRange)), "Typo/cross-year answer did not include the resolved months", sanPabloTypoCrossYearRange);
assert(!/I need the full question first|Nov 2026|not available/i.test(textOf(sanPabloTypoCrossYearRange)), "Typo/cross-year question fell into clarification or future-period recovery", sanPabloTypoCrossYearRange);

const broadCommunityHistoryPrompts = [
  {
    content: "what happened at Wallace between February and April",
    facilityId: "343",
    period: "2026-02, 2026-03, 2026-04",
    includes: ["February 2026", "April 2026"]
  },
  {
    content: "give me the read on clarita last few months",
    facilityId: "345",
    period: "2026-04, 2026-05, 2026-06",
    includes: ["April 2026", "June 2026"]
  },
  {
    content: "show Turlock YTD picture",
    facilityId: "344",
    period: "2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06",
    includes: ["January 2026", "June 2026"]
  },
  {
    content: "how has victoria been since november",
    facilityId: "342",
    period: "2025-11, 2025-12, 2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06",
    includes: ["November 2025", "June 2026"]
  },
  {
    content: "show me wallace quarter to date",
    facilityId: "343",
    period: "2026-04, 2026-05, 2026-06",
    includes: ["April 2026", "June 2026"]
  },
  {
    content: "what's the San Pablo read last 6 mos",
    facilityId: "337",
    period: "2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06",
    includes: ["January 2026", "June 2026"]
  }
];

for (const promptCase of broadCommunityHistoryPrompts) {
  const result = await checkedTool({
    content: promptCase.content,
    sessionId: newSession("broad-community-history")
  }, `Broad community history: ${promptCase.content}`);
  assertValid(result, `Broad community history: ${promptCase.content}`);
  assert(result.tool === "community_history", "Broad community history selected wrong tool", result);
  assert(result.trace?.facilityId === promptCase.facilityId, "Broad community history lost community scope", result.trace);
  assert(result.trace?.period === promptCase.period, "Broad community history resolved wrong period", result.trace);
  for (const expectedText of promptCase.includes) {
    assert(textOf(result).includes(expectedText), `Broad community history missed ${expectedText}`, result);
  }
  assert(
    ["table", "comparison_chart"].includes(result.visual?.type) && result.visual?.rows?.length >= 3,
    "Broad community history did not render useful monthly rows",
    result.visual
  );
  assert(!/I need the full question first|not available|current-state data/i.test(textOf(result)), "Broad community history fell into clarification or recovery", result);
}

const sanPabloMarchThroughJune = await checkedTool({
  content: "i want march april may june detail",
  sessionId: communityHistorySession
}, "Community history explicit follow-up months");
assertValid(sanPabloMarchThroughJune, "Community history explicit follow-up months");
assert(sanPabloMarchThroughJune.tool === "community_history", "Historical follow-up did not preserve community history tool", sanPabloMarchThroughJune);
assert(sanPabloMarchThroughJune.trace?.period === "2026-03, 2026-04, 2026-05, 2026-06", "Historical follow-up did not preserve all requested periods", sanPabloMarchThroughJune.trace);
assert(/March 2026/i.test(textOf(sanPabloMarchThroughJune)) && /June 2026/i.test(textOf(sanPabloMarchThroughJune)), "Historical follow-up text did not include first and last requested months", sanPabloMarchThroughJune);

const sliceIncidentCategory = await checkedTool({
  content: "slice San Pablo incidents by category for May 2026",
  sessionId: newSession("slice-incident-category")
}, "Slice incident category");
assertValid(sliceIncidentCategory, "Slice incident category");
assert(sliceIncidentCategory.tool === "slice_discovery", "Slice incident category selected wrong tool", sliceIncidentCategory);
assert(sliceIncidentCategory.trace?.period === "2026-05", "Slice incident category did not preserve requested period", sliceIncidentCategory.trace);
assert(sliceIncidentCategory.trace?.facilityId === "337", "Slice incident category did not preserve community scope", sliceIncidentCategory.trace);
assert(sliceIncidentCategory.visual?.columns?.includes("Category"), "Slice incident category did not render category grouping", sliceIncidentCategory.visual);
assert(/top result/i.test(textOf(sliceIncidentCategory)), "Slice incident category used unclear summary wording", sliceIncidentCategory);
assert(!/largest row/i.test(textOf(sliceIncidentCategory)), "Slice incident category used machine-like largest-row wording", sliceIncidentCategory);

const sliceCensusMultiMonth = await checkedTool({
  content: "compare San Pablo census March April May June 2026 by month",
  sessionId: newSession("slice-census-multi-month")
}, "Slice census multi-month comparison");
assertValid(sliceCensusMultiMonth, "Slice census multi-month comparison");
assert(sliceCensusMultiMonth.tool === "slice_discovery", "Multi-month census comparison did not use slice discovery", sliceCensusMultiMonth);
assert(sliceCensusMultiMonth.trace?.period === "2026-03, 2026-04, 2026-05, 2026-06", "Multi-month census comparison did not preserve every period", sliceCensusMultiMonth.trace);
assert(sliceCensusMultiMonth.visual?.columns?.includes("Month"), "Multi-month census comparison did not render month grouping", sliceCensusMultiMonth.visual);

const freshnessSession = newSession("freshness-context");
const residentProfile = await checkedTool({
  content: "show Shannon Romero resident profile",
  sessionId: freshnessSession
}, "Resident profile setup");
assertValid(residentProfile, "Resident profile setup");
assert(residentProfile.tool === "resident_lookup", "Resident profile setup selected wrong tool", residentProfile);
assert((residentProfile.truthState ?? residentProfile.trace?.truthState) === "valid_rows", "Resident profile with matched rows did not expose valid-rows truth state", residentProfile);
assert(/unit 239A/i.test(textOf(residentProfile)), "Resident profile did not preserve the actual unit value", residentProfile);
assert(!/unit Santa Clarita/i.test(textOf(residentProfile)), "Resident profile matched the unit field against community text", residentProfile);

const realDateNow = Date.now;
let tuesdayStartOfDay;
let tuesdayEndOfDay;
let wednesdayStartOfDay;
let freshnessStartOfDay;
let freshnessEndOfDay;
let freshnessNextDay;
try {
  Date.now = () => Date.parse("2026-07-17T07:01:00Z");
  tuesdayStartOfDay = await checkedTool({
    content: "What incidents does Tuesday Woo have?",
    sessionId: "answer-contract-tuesday-start"
  }, "Tuesday Woo start-of-day recency");
  freshnessStartOfDay = await checkedTool({
    content: "why are today's incidents not showing up",
    sessionId: "answer-contract-freshness-start"
  }, "Incident freshness start-of-day reporting date");
  Date.now = () => Date.parse("2026-07-18T06:59:00Z");
  tuesdayEndOfDay = await checkedTool({
    content: "What incidents does Tuesday Woo have?",
    sessionId: "answer-contract-tuesday-end"
  }, "Tuesday Woo end-of-day recency");
  freshnessEndOfDay = await checkedTool({
    content: "why are today's incidents not showing up",
    sessionId: "answer-contract-freshness-end"
  }, "Incident freshness end-of-day reporting date");
  Date.now = () => Date.parse("2026-07-18T07:01:00Z");
  wednesdayStartOfDay = await checkedTool({
    content: "What incidents does Tuesday Woo have?",
    sessionId: "answer-contract-wednesday-start"
  }, "Tuesday Woo next-day recency");
  freshnessNextDay = await checkedTool({
    content: "why are today's incidents not showing up",
    sessionId: "answer-contract-freshness-next"
  }, "Incident freshness next-day reporting date");
} finally {
  Date.now = realDateNow;
}
assert(
  textOf(tuesdayStartOfDay) === textOf(tuesdayEndOfDay),
  "Resident recency counts changed within the same California reporting day",
  { start: textOf(tuesdayStartOfDay), end: textOf(tuesdayEndOfDay) }
);
assert(
  textOf(tuesdayEndOfDay) !== textOf(wednesdayStartOfDay),
  "Resident recency counts did not roll over at California midnight",
  { end: textOf(tuesdayEndOfDay), nextDay: textOf(wednesdayStartOfDay) }
);
assert(
  textOf(freshnessStartOfDay) === textOf(freshnessEndOfDay),
  "Incident freshness changed within the same California reporting day",
  { start: textOf(freshnessStartOfDay), end: textOf(freshnessEndOfDay) }
);
assert(
  textOf(freshnessEndOfDay) !== textOf(freshnessNextDay),
  "Incident freshness did not roll over at California midnight",
  { end: textOf(freshnessEndOfDay), nextDay: textOf(freshnessNextDay) }
);

const freshness = await checkedTool({
  content: "why are today's incidents not showing up",
  sessionId: freshnessSession
}, "Freshness after resident context");
assertValid(freshness, "Freshness after resident context");
assert(freshness.tool === "data_availability", "Freshness question did not route to data availability", freshness);
assert(/most recent incident detail/i.test(textOf(freshness)), "Freshness answer did not include the most recent incident detail", freshness);
assert(!/Shannon Romero|resident profile/i.test(textOf(freshness)), "Freshness answer leaked resident context", freshness);
assert(freshness.artifact?.rowSetId === freshness.provenance?.rowSetId, "Freshness CSV artifact did not preserve row-set identity", freshness);
assert(freshness.provenance?.dataset === "incident_freshness", "Freshness CSV provenance did not identify its dataset", freshness.provenance);
assert(freshness.visual?.rows?.some((row) => row.label === "Lag to today"), "Freshness answer did not expose lag-to-today diagnostics", freshness.visual);
if (/behind today|not today|No incident detail rows are dated today/i.test(textOf(freshness))) {
  assert((freshness.truthState ?? freshness.trace?.truthState) === "stale", "Freshness answer did not mark stale incident detail when latest loaded date is behind today", freshness);
}
if (/current through today/i.test(textOf(freshness))) {
  assert((freshness.truthState ?? freshness.trace?.truthState) === "valid_rows", "Freshness answer did not mark valid rows when incident detail is current today", freshness);
}

const feedFreshness = await checkedTool({
  content: "is the incident feed behind",
  sessionId: freshnessSession
}, "Feed freshness after resident context");
assertValid(feedFreshness, "Feed freshness after resident context");
assert(feedFreshness.tool === "data_availability", "Feed freshness wording did not route to data availability", feedFreshness);
assert(/most recent incident detail/i.test(textOf(feedFreshness)), "Feed freshness answer did not include the most recent incident detail", feedFreshness);
assert(!/Shannon Romero|resident profile/i.test(textOf(feedFreshness)), "Feed freshness answer leaked resident context", feedFreshness);

const incidentCenterEmptyFreshness = await checkedTool({
  content: "why does Incident Center show zero today",
  sessionId: freshnessSession
}, "Incident Center zero freshness after resident context");
assertValid(incidentCenterEmptyFreshness, "Incident Center zero freshness after resident context");
assert(incidentCenterEmptyFreshness.tool === "data_availability", "Incident Center zero wording opened a module instead of freshness diagnostics", incidentCenterEmptyFreshness);
assert(/most recent incident detail/i.test(textOf(incidentCenterEmptyFreshness)), "Incident Center zero freshness did not include the most recent incident detail", incidentCenterEmptyFreshness);
assert(!/Opening Incident Center|Shannon Romero|resident profile/i.test(textOf(incidentCenterEmptyFreshness)), "Incident Center zero freshness leaked module or resident context", incidentCenterEmptyFreshness);

const platformRefresh = await checkedTool({
  content: "when did the platform last refresh",
  sessionId: freshnessSession
}, "Platform refresh after resident context");
assertValid(platformRefresh, "Platform refresh after resident context");
assert(platformRefresh.tool === "data_availability", "Platform refresh wording did not route to data availability", platformRefresh);
assert(!/Shannon Romero|resident profile/i.test(textOf(platformRefresh)), "Platform refresh answer leaked resident context", platformRefresh);

const censusAvailability = await checkedTool({
  content: "what periods are available for census",
  sessionId: newSession("census-availability")
}, "Focused census availability");
assert(censusAvailability.tool === "data_availability", "Focused census availability selected wrong tool", censusAvailability);
assert(censusAvailability.visual?.title === "Census monthly Availability", "Focused census availability did not render a census-specific diagnostic", censusAvailability.visual);
assert(censusAvailability.visual?.rows?.length === 1, "Focused census availability showed unrelated datasets", censusAvailability.visual);
assert(censusAvailability.visual?.rows?.[0]?.label === "Census monthly", "Focused census availability did not show census rows", censusAvailability.visual);

const residentAvailability = await checkedTool({
  content: "what resident roster data is loaded",
  sessionId: newSession("resident-availability")
}, "Focused resident availability");
assert(residentAvailability.tool === "data_availability", "Focused resident availability selected wrong tool", residentAvailability);
assert(residentAvailability.visual?.rows?.length === 1, "Focused resident availability showed unrelated datasets", residentAvailability.visual);
assert(residentAvailability.visual?.rows?.[0]?.label === "Resident roster", "Focused resident availability did not show roster rows", residentAvailability.visual);

const documentationAvailability = await checkedTool({
  content: "what documentation data is loaded",
  sessionId: newSession("documentation-availability")
}, "Focused documentation availability");
assert(documentationAvailability.tool === "data_availability", "Focused documentation availability selected wrong tool", documentationAvailability);
assert(documentationAvailability.visual?.rows?.length === 1, "Focused documentation availability showed unrelated datasets", documentationAvailability.visual);
assert(documentationAvailability.visual?.rows?.[0]?.label === "Documentation gaps", "Focused documentation availability did not show documentation rows", documentationAvailability.visual);

const missingResident = await checkedTool({
  content: "show john smith resident profile",
  sessionId: newSession("missing-resident")
}, "Missing resident");
assert(missingResident.tool === "data_recovery", "Missing resident did not route to recovery", missingResident);
assert(/current roster has no verified exact match for John Smith/i.test(textOf(missingResident)), "Missing resident did not explain exact-match failure", missingResident);
assert(!/Longest Stay Residents|Audrey West/i.test(textOf(missingResident)), "Missing resident fell back to unrelated roster", missingResident);
assert(missingResident.truthState === "verified_zero" || missingResident.trace?.truthState === "verified_zero", "Missing resident did not mark exact zero match", missingResident);
assert(!missingResident.visual || missingResident.visual?.title !== "Possible Roster Matches", "Missing resident showed weak partial matches", missingResident.visual);

const partialResident = await checkedTool({
  content: "show audrey resident profile",
  sessionId: newSession("partial-resident")
}, "Partial resident name");
assert(partialResident.tool === "data_recovery", "Partial resident name did not route to recovery", partialResident);
assert(/possible roster match/i.test(textOf(partialResident)), "Partial resident name did not show possible-match language", partialResident);
assert(partialResident.visual?.title === "Possible Roster Matches", "Partial resident name did not render possible matches", partialResident.visual);
assert(!(partialResident.actions ?? []).some((action) => /^open .* profile$/i.test(action.label ?? "")), "Partial resident recovery offered an unverified profile-open action", partialResident.actions);
assert((partialResident.actions ?? []).length <= 1, "Partial resident recovery exposed too many actions", partialResident.actions);

const residentSearchSurface = await checkedTool({
  content: "resident search",
  sessionId: newSession("resident-search-surface")
}, "Resident search surface");
assert(residentSearchSurface.tool === "surface_module", "Bare resident search did not open the resident-search surface", residentSearchSurface);
assert(/Opened Resident Search/i.test(textOf(residentSearchSurface)), "Bare resident search did not explain the opened surface", residentSearchSurface);
assert(!/Top matches|Matched 12 rows/i.test(textOf(residentSearchSurface)), "Bare resident search returned arbitrary roster rows", residentSearchSurface);

const residentRosterSearch = await checkedTool({
  content: "show resident roster",
  sessionId: newSession("resident-roster-search")
}, "Resident roster search");
assert(residentRosterSearch.tool === "resident_search", "Resident roster search selected wrong tool", residentRosterSearch);
assert(residentRosterSearch.moduleSpec?.moduleId === "resident-search-results", "Resident roster search did not render the resident-search module", residentRosterSearch.moduleSpec);
assert((residentRosterSearch.visual?.rows?.length ?? 0) >= 50, "Resident roster search did not return a browsable roster list", residentRosterSearch.visual);
assert(/contains [\d,]+ current residents?/i.test(textOf(residentRosterSearch)), "Resident roster search did not explain the available roster count", residentRosterSearch);
assert(!/Longest Stay Residents|Audrey West/i.test(textOf(residentRosterSearch)), "Resident roster search fell back to longest-stay ranking", residentRosterSearch);
assert((residentRosterSearch.actions ?? []).length === 0, "Resident roster search exposed action clutter", residentRosterSearch.actions);

const residentNameSearch = await checkedTool({
  content: "search residents named Romero",
  sessionId: newSession("resident-name-search")
}, "Resident name search");
assert(residentNameSearch.tool === "resident_search", "Resident name search selected wrong tool", residentNameSearch);
assert(residentNameSearch.moduleSpec?.moduleId === "resident-search-results", "Resident name search did not render the resident-search module", residentNameSearch.moduleSpec);
assert(/Shannon Romero/i.test(textOf(residentNameSearch)), "Resident name search did not include matching residents", residentNameSearch);
assert(!/Longest Stay Residents|Audrey West/i.test(textOf(residentNameSearch)), "Resident name search fell back to longest-stay ranking", residentNameSearch);

const ambiguousResident = await checkedTool({
  content: "show jon smth resident profile",
  sessionId: newSession("ambiguous-resident")
}, "Ambiguous resident");
assert(ambiguousResident.tool === "clarification", "Ambiguous resident did not request clarification", ambiguousResident);
assert(ambiguousResident.interpretation?.requiresConfirmation, "Ambiguous resident did not require confirmation", ambiguousResident.interpretation);

const unavailablePeriod = await checkedTool({
  content: "give me the top category of each community in incidents November of last year",
  sessionId: newSession("unavailable-period")
}, "Unavailable period");
assert(unavailablePeriod.handled, "Unavailable period prompt was not handled", unavailablePeriod);
assert(!/Medication Refusal is the largest incident category in this slice/i.test(textOf(unavailablePeriod)), "Unavailable period fell back to current-month category answer", unavailablePeriod);
assert(/not loaded|available|loaded months|loaded periods|could not/i.test(textOf(unavailablePeriod)), "Unavailable period did not explain data availability", unavailablePeriod);

const unavailableDetailRows = await checkedTool({
  content: "List every AWOL incident from November 2025 by community including resident name date incident type and description",
  sessionId: newSession("unavailable-detail-rows")
}, "Unavailable detail rows");
assert(unavailableDetailRows.tool === "incident_detail_list", "Unavailable detail rows selected wrong tool", unavailableDetailRows);
assert(unavailableDetailRows.planValidation?.valid, "Unavailable detail rows refusal failed validation", unavailableDetailRows);
assert((unavailableDetailRows.truthState ?? unavailableDetailRows.trace?.truthState) === "not_loaded", "Unavailable detail rows did not mark not-loaded truth state", unavailableDetailRows);
assert(/detail.*not available|not available.*detail|request requires incident records/i.test(textOf(unavailableDetailRows)), "Unavailable detail records did not explain the exact-detail gap", unavailableDetailRows);
assert(/did not substitute a different period/i.test([textOf(unavailableDetailRows), unavailableDetailRows.visual?.subtitle].filter(Boolean).join(" ")), "Unavailable detail records did not refuse an unrequested period", unavailableDetailRows);
assert(/Available (range|periods?)/i.test(textOf(unavailableDetailRows)), "Unavailable detail records did not name the available period range", unavailableDetailRows);
assert(unavailableDetailRows.actions?.some((action) => /^(Show|Compare) /i.test(action.label)), "Unavailable detail rows did not offer closest-period recovery", unavailableDetailRows.actions);
assert(!unavailableDetailRows.artifact?.content, "Unavailable detail rows produced an export for missing exact rows", unavailableDetailRows);

const unavailableGenericDetail = await checkedTool({
  content: "list every census row for November 2020",
  sessionId: newSession("unavailable-generic-detail")
}, "Unavailable generic detail rows");
assert(unavailableGenericDetail.tool === "detail_list" || unavailableGenericDetail.tool === "census_trend", "Unavailable generic detail selected unsupported tool", unavailableGenericDetail);
assertLoadedWindowRecovery(unavailableGenericDetail, "Unavailable generic detail");

const unavailableCensusTrend = await checkedTool({
  content: "show San Pablo census trend for November 2020",
  sessionId: newSession("unavailable-census-trend")
}, "Unavailable census trend");
assert(unavailableCensusTrend.tool === "census_trend", "Unavailable census trend selected wrong tool", unavailableCensusTrend);
assertLoadedWindowRecovery(unavailableCensusTrend, "Unavailable census trend");
const censusRecovery = unavailableCensusTrend.actions?.find((action) => /^Show /i.test(action.label ?? "") && action.prompt);
const recoveredCensusTrend = await checkedTool({
  content: censusRecovery.prompt,
  sessionId: newSession("recovered-census-trend")
}, "Recovered census trend");
assert(recoveredCensusTrend.tool === "census_trend", "Closest census period rerouted to the wrong tool", recoveredCensusTrend);
assert(recoveredCensusTrend.safeRefusal !== true, "Closest census period remained unavailable", recoveredCensusTrend);

const unavailableIncidentBreakdown = await checkedTool({
  content: "show San Pablo incident breakdown for November 2020",
  sessionId: newSession("unavailable-incident-breakdown")
}, "Unavailable incident breakdown");
assert(unavailableIncidentBreakdown.tool === "incident_breakdown", "Unavailable incident breakdown selected wrong tool", unavailableIncidentBreakdown);
assertLoadedWindowRecovery(unavailableIncidentBreakdown, "Unavailable incident breakdown");

const unavailablePeriodComparison = await checkedTool({
  content: "compare San Pablo incidents November 2020 to December 2020",
  sessionId: newSession("unavailable-period-comparison")
}, "Unavailable period comparison");
assert(unavailablePeriodComparison.tool === "compare_periods", "Unavailable period comparison selected wrong tool", unavailablePeriodComparison);
assertLoadedWindowRecovery(unavailablePeriodComparison, "Unavailable period comparison");
const comparisonRecovery = unavailablePeriodComparison.actions?.find((action) => /^Compare /i.test(action.label ?? ""));
assert(comparisonRecovery, "Unavailable period comparison did not offer a comparison recovery", unavailablePeriodComparison.actions);
assert(/A & A Health Services San Pablo/i.test(comparisonRecovery.prompt), "Comparison recovery lost community scope", comparisonRecovery);
assert(/\b20\d{2}\b/.test(comparisonRecovery.prompt), "Comparison recovery did not include valid periods", comparisonRecovery);
const recoveredComparison = await checkedTool({
  content: comparisonRecovery.prompt,
  sessionId: newSession("recovered-period-comparison")
}, "Recovered period comparison");
assert(recoveredComparison.tool === "compare_periods", "Closest comparison periods rerouted to the wrong tool", recoveredComparison);
assert(recoveredComparison.safeRefusal !== true, "Closest comparison periods remained unavailable", recoveredComparison);

const unavailableMedicationCompliance = await checkedTool({
  content: "show medication compliance for San Pablo in November 2020",
  sessionId: newSession("unavailable-medication-compliance")
}, "Unavailable medication compliance");
assert(unavailableMedicationCompliance.tool === "medication_compliance", "Unavailable medication compliance selected wrong tool", unavailableMedicationCompliance);
assertLoadedWindowRecovery(unavailableMedicationCompliance, "Unavailable medication compliance");

const historicalResidentProfile = await checkedTool({
  content: "show Shannon Romero resident profile for January 2026",
  sessionId: newSession("historical-resident-profile")
}, "Historical resident profile capability guard");
assert(historicalResidentProfile.tool === "resident_lookup", "Historical resident profile selected the wrong tool", historicalResidentProfile);
assert(historicalResidentProfile.safeRefusal === true, "Historical resident profile did not fail closed", historicalResidentProfile);
assert(historicalResidentProfile.planValidation?.preflightRejected === true, "Historical resident profile executed before capability rejection", historicalResidentProfile.planValidation);
assert(historicalResidentProfile.planValidation?.code === "temporal_scope_mismatch", "Historical resident profile did not expose a structured capability error", historicalResidentProfile.planValidation);
assert(/current-state data/i.test(textOf(historicalResidentProfile)), "Historical resident profile did not explain the temporal limitation", historicalResidentProfile);
assert(/did not substitute today's roster/i.test(textOf(historicalResidentProfile)), "Historical resident profile did not prevent current-state substitution", historicalResidentProfile);

const historicalDiagnosisMix = await checkedTool({
  content: "show San Pablo diagnosis mix for January 2026",
  sessionId: newSession("historical-diagnosis-mix")
}, "Historical diagnosis mix capability guard");
assert(historicalDiagnosisMix.tool === "diagnosis_mix", "Historical diagnosis mix selected the wrong tool", historicalDiagnosisMix);
assert(historicalDiagnosisMix.planValidation?.preflightRejected === true, "Historical diagnosis mix was not rejected before execution", historicalDiagnosisMix.planValidation);
assert((historicalDiagnosisMix.truthState ?? historicalDiagnosisMix.trace?.truthState) === "not_loaded", "Historical diagnosis mix did not expose not-loaded truth state", historicalDiagnosisMix);

const historicalCommunityProfile = await checkedTool({
  content: "show San Pablo community profile for January 2026",
  sessionId: newSession("historical-community-profile")
}, "Historical community profile capability guard");
assertValid(historicalCommunityProfile, "Historical community profile capability guard");
assert(historicalCommunityProfile.tool === "community_history", "Historical community profile did not route to monthly community history", historicalCommunityProfile);
assert(/January 2026/i.test(textOf(historicalCommunityProfile)), "Historical community profile did not include the requested period", historicalCommunityProfile);
assert(!/Active roster/i.test(textOf(historicalCommunityProfile)), "Historical community profile should not substitute current roster history", historicalCommunityProfile);

const historicalOperatingSnapshot = await checkedTool({
  content: "show operating snapshot January 2026",
  sessionId: newSession("historical-operating-snapshot")
}, "Historical operating snapshot capability guard");
assert(historicalOperatingSnapshot.tool === "operating_snapshot", "Historical operating snapshot selected the wrong tool", historicalOperatingSnapshot);
assert(historicalOperatingSnapshot.planValidation?.preflightRejected === true, "Historical operating snapshot was not rejected before execution", historicalOperatingSnapshot.planValidation);
assert(historicalOperatingSnapshot.planValidation?.code === "temporal_scope_mismatch", "Historical operating snapshot did not expose a structured capability error", historicalOperatingSnapshot.planValidation);
assert(!/I need the analysis subject first/i.test(textOf(historicalOperatingSnapshot)), "Historical operating snapshot was misclassified as a dangling follow-up", historicalOperatingSnapshot);

const historicalCommunityCompare = await checkedTool({
  content: "show community compare for January 2026",
  sessionId: newSession("historical-community-compare")
}, "Historical community compare capability guard");
assert(historicalCommunityCompare.tool === "community_compare", "Historical community compare selected the wrong tool", historicalCommunityCompare);
assert(historicalCommunityCompare.planValidation?.preflightRejected === true, "Historical community compare was not rejected before execution", historicalCommunityCompare.planValidation);
assert(historicalCommunityCompare.planValidation?.code === "temporal_scope_mismatch", "Historical community compare did not expose a structured capability error", historicalCommunityCompare.planValidation);

const medicationSpecificCompile = await compileCopilotIntent({
  content: "AHS Turlock OP LLC Eliquis refusals",
  sessionId: newSession("medication-specific-compile")
});
assert(medicationSpecificCompile.compiler?.inherited === false, "First-turn medication prompt was incorrectly treated as inherited context", medicationSpecificCompile);
const medicationSpecificRefusals = await checkedTool({
  content: "AHS Turlock OP LLC Eliquis refusals",
  sessionId: newSession("medication-specific-refusals")
}, "Medication-specific refusal filter");
assert(medicationSpecificRefusals.tool === "medication_refusals_by_community", "Medication-specific refusal selected wrong tool", medicationSpecificRefusals);
assert(/Eliquis/i.test(String(medicationSpecificRefusals.trace?.note ?? "") + textOf(medicationSpecificRefusals)), "Medication-specific refusal did not preserve requested medication", medicationSpecificRefusals);
assert(!/Nystatin|Miconazole|Polyethylene Glycol POWD/i.test(textOf(medicationSpecificRefusals)), "Medication-specific refusal fell back to unrelated top medications", medicationSpecificRefusals);
if ((medicationSpecificRefusals.trace?.rowCount ?? 0) === 0) {
  assert(["summary_not_shown", "verified_zero", "not_loaded"].includes(medicationSpecificRefusals.truthState ?? medicationSpecificRefusals.trace?.truthState), "Medication-specific zero-row result did not explain whether absence was proven", medicationSpecificRefusals);
}

const unavailableCommunityScope = await checkedTool({
  content: "show Santa Clarita census trend for November 2024",
  sessionId: newSession("unavailable-community-scope")
}, "Unavailable community scope");
assert(unavailableCommunityScope.tool === "census_trend", "Unavailable community scope selected wrong tool", unavailableCommunityScope);
assert(/requested period is available at Portfolio scope/i.test(textOf(unavailableCommunityScope)), "Unavailable community scope did not offer the exact portfolio period", unavailableCommunityScope);
const portfolioScopeRecovery = unavailableCommunityScope.actions?.find((action) => /Portfolio/i.test(action.label ?? "") && action.prompt);
assert(portfolioScopeRecovery, "Unavailable community scope did not provide an explicit portfolio action", unavailableCommunityScope.actions);
const recoveredPortfolioScope = await checkedTool({
  content: portfolioScopeRecovery.prompt,
  sessionId: newSession("recovered-portfolio-scope")
}, "Recovered portfolio scope");
assert(recoveredPortfolioScope.tool === "census_trend", "Portfolio scope recovery rerouted to the wrong tool", recoveredPortfolioScope);
assert(recoveredPortfolioScope.safeRefusal !== true, "Portfolio scope recovery remained unavailable", recoveredPortfolioScope);
assert(recoveredPortfolioScope.trace?.period === "2024-11", "Portfolio scope recovery changed the requested period", recoveredPortfolioScope.trace);

const categoryScopeRecovery = await checkedTool({
  content: "Victoria's House sexual incident breakdown for December 2025",
  sessionId: newSession("category-scope-recovery")
}, "Category scope recovery");
assert(categoryScopeRecovery.safeRefusal === true, "Category scope recovery did not fail closed", categoryScopeRecovery);
const categoryPortfolioAction = categoryScopeRecovery.actions?.find((action) => /Portfolio/i.test(action.label ?? "") && action.prompt);
assert(categoryPortfolioAction, "Category scope recovery did not offer a valid portfolio category slice", categoryScopeRecovery.actions);
assert(/Sexual Incident/i.test(categoryPortfolioAction.prompt), "Category scope recovery lost the requested category", categoryPortfolioAction);
const recoveredCategoryScope = await checkedTool({
  content: categoryPortfolioAction.prompt,
  sessionId: newSession("recovered-category-scope")
}, "Recovered category scope");
assert(recoveredCategoryScope.tool === "incident_breakdown", "Category portfolio recovery rerouted to the wrong tool", recoveredCategoryScope);
assert(recoveredCategoryScope.safeRefusal !== true, "Category portfolio recovery suggested an unavailable slice", recoveredCategoryScope);

const verifiedZeroCategory = await checkedTool({
  content: "AHS Turlock OP LLC sexual incident breakdown for May 2026",
  sessionId: newSession("verified-zero-category")
}, "Verified zero category");
assert(verifiedZeroCategory.tool === "incident_breakdown", "Verified zero category selected wrong tool", verifiedZeroCategory);
assert(verifiedZeroCategory.safeRefusal !== true, "Verified zero category incorrectly failed closed", verifiedZeroCategory);
assert((verifiedZeroCategory.truthState ?? verifiedZeroCategory.trace?.truthState) === "verified_zero", "Verified zero category did not expose verified-zero truth state", verifiedZeroCategory);
assert(/0 incidents/i.test(textOf(verifiedZeroCategory)), "Verified zero category did not answer zero directly", verifiedZeroCategory);
assert(/verified zero/i.test(String(verifiedZeroCategory.trace?.note ?? "")), "Verified zero category did not trace verified-zero status", verifiedZeroCategory.trace);

const verifiedZeroDetail = await checkedTool({
  content: "list every Victoria's House sexual incident in May 2026 including resident date type description",
  sessionId: newSession("verified-zero-detail")
}, "Verified zero detail list");
assert(verifiedZeroDetail.tool === "incident_detail_list", "Verified zero detail selected wrong tool", verifiedZeroDetail);
assert(verifiedZeroDetail.safeRefusal !== true, "Verified zero detail incorrectly failed closed", verifiedZeroDetail);
assert((verifiedZeroDetail.truthState ?? verifiedZeroDetail.trace?.truthState) === "verified_zero", "Verified zero detail did not expose verified-zero truth state", verifiedZeroDetail);
assert(verifiedZeroDetail.artifact?.rowCount === 0, "Verified zero detail did not preserve a zero-row export", verifiedZeroDetail.artifact);
assert(/no matching incidents/i.test(textOf(verifiedZeroDetail)), "Verified zero detail did not answer zero directly", verifiedZeroDetail);
assert(!verifiedZeroDetail.turnTrace?.quality?.flags?.includes("zero_rows_without_recovery"), "Verified zero detail was incorrectly scored as an unexplained zero", verifiedZeroDetail.turnTrace?.quality);

console.log("answer contract checks passed");
