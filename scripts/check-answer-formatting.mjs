import { runCopilotTool } from "../server/copilot-tools.mjs";
import { formatIncidentPeriodLabel } from "../server/tools/platform-overview.mjs";
import { createStructuredToolResultRenderer } from "../server/tools/result-contracts.mjs";
import { enforceAnswerInvariants } from "../server/tools/result-safety.mjs";
import { platformModuleRegistry } from "../shared/platform-module-registry.mjs";
import { getReportingDateKey } from "../shared/reporting-date.mjs";

const surfaceModuleCount = platformModuleRegistry.filter((module) => module.kind === "surface").length;
const analysisModuleCount = platformModuleRegistry.filter((module) => module.kind === "analysis").length;
const totalModuleCount = platformModuleRegistry.length;

const cases = [
  {
    prompt: "show santa clarita census trend",
    tool: "census_trend",
    visualTitleIncludes: "Santa Clarita Census Trend",
    mustInclude: ["Answer\n", "Santa Clarita census moved from", "in June 2026", "high point"]
  },
  {
    prompt: "which community added the most residents in May 2026",
    tool: "census_movement",
    visualTitleIncludes: "Census Movement",
    mustInclude: ["Answer\n", "Portfolio census increased by 14 to 506 in May 2026", "Across communities, 2 increased, 3 were unchanged, and 0 decreased", "Santa Clarita had the largest move, increasing by 10 to 114"],
    mustExclude: ["June 2026", "A & A Health Services San Pablo had the largest move"]
  },
  {
    prompt: "how many clients at san pablo in january of 2026",
    tool: "census_trend",
    visualTitleIncludes: "A & A Health Services San Pablo Census",
    mustInclude: ["Answer\n", "A & A Health Services San Pablo had 139 clients in January 2026."],
    mustExclude: ["I could not answer that exact slice safely", "missing requested period", "Closest Recovery Path", "latest census point"]
  },
  {
    prompt: "show census by community from January through June 2026",
    tool: "slice_discovery",
    visualTitleIncludes: "Monthly Census by Community",
    mustInclude: ["Answer\n", "Portfolio census is shown by month and community for January 2026 through June 2026.", "point-in-time census"],
    mustExclude: ["latest point", "Top result", "was the top result"]
  },
  {
    prompt: "Compare San Pablo May incidents to June incidents by category",
    tool: "incident_category_comparison",
    mustInclude: ["Answer\n", "largest category movement was"]
  },
  {
    prompt: "i just want to know how many people went awol last month total, may 2026",
    tool: "incident_breakdown",
    visualValueLabel: "Residents",
    mustInclude: ["Answer\n", "unique residents"]
  },
  {
    prompt: "how many AWOL incidents in May 2026 total",
    tool: "incident_breakdown",
    visualValueLabel: "Incidents",
    mustInclude: ["Answer\n", "The portfolio recorded 195 AWOL/Elopement incidents in May 2026."],
    mustExclude: ["unique residents"]
  },
  {
    prompt: "show Shannon Romero resident profile",
    tool: "resident_lookup",
    visualTitleIncludes: "Shannon Romero Resident Profile",
    mustInclude: ["Answer\n", "current resident at Santa Clarita", "Incident history shows"]
  },
  {
    prompt: "show Shannon Romero incident history",
    tool: "resident_incident_history",
    mustInclude: ["matched incidents", "most recent incident", "June 16, 2026"],
    mustExclude: ["T00:00:00.000Z"]
  },
  {
    prompt: "how is San Pablo",
    tool: "community_history",
    mustInclude: ["Answer\n", "A & A Health Services San Pablo's census was", "clients", "There were", "incidents", "most common category"],
    mustExclude: ["I don't have that exact slice loaded", "current-state data", "had census was", "was census was", "recorded"],
    maxVisualRows: 5
  },
  {
    prompt: "List every AWOL incident from May through June by community, including resident name, date, incident type, and description",
    tool: "incident_detail_list",
    artifact: true,
    visualType: "table",
    mustInclude: ["Answer\n", "89 unique residents were involved", "375 matching AWOL/Elopement incidents", "The CSV includes all 375 exact matches"],
    definitionIncludes: ["The CSV includes all 375 exact matches"],
    mustExclude: ["The table includes every loaded matching incident", "same 646 rows shown in the module", "attached", "chat module"]
  },
  {
    prompt: "Can you list every AWOL/Elopement incident from May 2026 through June 2026?",
    tool: "incident_detail_list",
    artifact: true,
    visualType: "table",
    mustInclude: ["monthly split was 195 in May 2026 and 180 in June 2026", "The CSV includes all 375 exact matches"],
    definitionIncludes: ["The CSV includes all 375 exact matches"],
    mustExclude: ["Counts by month were"]
  },
  {
    prompt: "show me june 2026 incidents",
    tool: "incident_breakdown",
    mustInclude: ["Answer\n", "Portfolio recorded", "in June 2026"],
    mustExclude: ["largest row"]
  },
  {
    prompt: "what is the latest incident date loaded",
    tool: "data_availability",
    visualTitleIncludes: "Incident Freshness",
    artifact: true,
    mustInclude: ["Answer\n", "most recent incident detail is dated", "behind today"],
    mustExclude: ["largest row", "datasets"]
  },
  {
    prompt: "What data periods are available for incident detail?",
    tool: "data_availability",
    visualTitleIncludes: "Incident Detail Availability",
    mustInclude: ["Answer\n", "most recent incident detail is", "incident events are available", "spanning"],
    mustExclude: ["largest row", "Arlena Harper", "The table includes every loaded matching incident"]
  },
  {
    prompt: "why are today's incidents not showing up",
    tool: "data_availability",
    visualTitleIncludes: "Incident Freshness",
    mustInclude: ["Answer\n", "most recent incident detail is dated", "Today's incidents will not appear"],
    mustExclude: ["Loaded Data Availability", "largest row"]
  },
  {
    prompt: "show diagnosis mix in May",
    tool: "diagnosis_mix",
    mustInclude: ["Answer\n", "current-state data", "verified fallback"],
    mustExclude: ["Top diagnoses", "No rows matched", "Closest surface", "Closest Recovery Path"]
  },
  {
    prompt: "show documentation gaps in May",
    tool: "documentation_gaps",
    mustInclude: ["Answer\n", "current-state data", "verified fallback"],
    mustExclude: ["Largest gaps", "Closest surface", "Closest Recovery Path"]
  },
  {
    prompt: "show santa clartia censsus trend",
    tool: "census_trend",
    correctedText: "show santa clarita census trend",
    visualTitleIncludes: "Santa Clarita Census Trend",
    mustInclude: ["Answer\n", "Santa Clarita census moved from", "in June 2026", "high point"],
    mustExclude: ["Did you mean"]
  },
  {
    prompt: "incdients by communty",
    tool: "slice_metric",
    correctedText: "incidents by community",
    visualTitleIncludes: "Portfolio Incident Slice",
    mustInclude: ["Answer\n", "accounted for", "The comparison covers all 5 communities"],
    mustExclude: ["Did you mean", "Incident Freshness"]
  },
  {
    prompt: "give me frebruary breakdown of awol incidents by community",
    tool: "slice_metric",
    correctedText: "give me february breakdown of awol incidents by community",
    visualTitleIncludes: "AWOL/Elopement Incident Slice",
    mustInclude: ["Answer\n", "February 2026"],
    mustExclude: ["June 2026", "Medication Refusal"]
  },
  {
    prompt: "JC Wallace House current incident category breakdown",
    tool: "incident_breakdown",
    visualTitleIncludes: "JC Wallace House Incident Category Breakdown",
    mustInclude: ["Answer\n", "Medical Emergency", "AWOL/Elopement"],
    mustExclude: ["Incident Freshness"]
  },
  {
    prompt: "show john smith resident profile",
    tool: "data_recovery",
    mustInclude: ["current roster has no verified exact match for John Smith", "different spelling, resident number, unit, or community"],
    mustExclude: ["Longest Stay Residents", "Audrey West", "Possible Roster Matches"]
  },
  {
    prompt: "show jon smth resident profile",
    tool: "clarification",
    requiresConfirmation: true,
    mustInclude: ["Did you mean"],
    mustExclude: ["Longest Stay Residents"]
  },
  {
    prompt: "can i just get the search census module",
    tool: "surface_module",
    mustInclude: ["Opened Resident Search"],
    mustExclude: ["Portfolio census trend"]
  },
  {
    prompt: "resident search",
    tool: "surface_module",
    mustInclude: ["Opened Resident Search"],
    mustExclude: ["Matched 12 rows", "Top matches"]
  },
  {
    prompt: "open the incident center module",
    tool: "surface_module",
    mustInclude: ["Opened Incident Center"],
    mustExclude: ["incident breakdown"]
  },
  {
    prompt: "resident risk watchlist all residents",
    tool: "resident_risk_summary",
    visualTitleIncludes: "Resident Review Queue",
    mustInclude: ["Answer\n", "operational review queue", "not a clinical risk score", "Across December 2025 through June 2026"],
    mustExclude: ["Did you mean", "Definition\nDetail-list"]
  },
  {
    prompt: "show medication compliance in May and June",
    tool: "medication_compliance",
    visualTitleIncludes: "Medication Compliance",
    mustInclude: ["Answer\n", "May 2026 and June 2026", "were documented as given", "Medication compliance uses scheduled administrations"],
    mustExclude: ["largest row"]
  },
  {
    prompt: "How is San Pablo doing with medications?",
    tool: "medication_profile",
    mustInclude: ["A & A Health Services San Pablo documented 97.1% medication compliance", "scheduled administrations", "were documented as given", "Monthly refusal counts are not available for this period"],
    mustExclude: ["Portfolio medication profile", "separate cumulative summary", "has no monthly period"]
  },
  {
    prompt: "What medications had the most refusals?",
    tool: "medication_refusals_by_community",
    visualTitleIncludes: "Medication Refusals",
    mustInclude: ["Answer\n", "refusal summary includes 4,077 cumulative refusals", "cumulative refusal totals", "no monthly period"],
    mustExclude: ["largest row"]
  },
  {
    prompt: "show San Pablo medication exception detail",
    tool: "medication_exception_detail",
    visualTitleIncludes: "detail",
    mustInclude: ["Answer\n", "MAR exception detail"],
    mustExclude: ["largest row", "Source:"]
  },
  {
    prompt: "Between April and May 2026, which community had the largest increase in incidents per 100 residents?",
    tool: "incident_rate_change",
    visualTitleIncludes: "Incident-Rate Change",
    mustInclude: ["Answer\n", "incidents per 100 residents"],
    mustExclude: ["Portfolio incident category comparison"]
  },
  {
    prompt: "show all diagnoses",
    tool: "diagnosis_mix",
    visualTitleIncludes: "Diagnosis Mix",
    mustInclude: ["Answer\n", "Portfolio's most common diagnosis is Schizophrenia", "105 of 503 current residents", "followed by"],
    mustExclude: ["Definition\nDetail-list"]
  },
  {
    prompt: "list all census rows for May 2026",
    tool: "detail_list",
    visualType: "table",
    artifact: true,
    mustInclude: ["Answer\n", "There are 5 portfolio census entries", "The CSV includes all 5 exact matches"],
    mustExclude: ["No rows matched"]
  },
  {
    prompt: "show available modules",
    tool: "module_catalog",
    visualTitleIncludes: "Platform Module Catalog",
    mustInclude: [
      `${totalModuleCount} modules are available`,
      `${surfaceModuleCount} product surfaces`,
      `${analysisModuleCount} analytical modules`,
      "scope and capabilities"
    ],
    mustExclude: ["No tool context manifest"]
  }
];

const failures = [];

if (getReportingDateKey("2026-07-20T06:30:00.000Z") !== "2026-07-19") {
  failures.push("reporting date: UTC must not advance the California reporting day before local midnight");
}
if (getReportingDateKey("2026-07-20T07:30:00.000Z") !== "2026-07-20") {
  failures.push("reporting date: California reporting day must advance after local midnight");
}

const monthLabel = (value) => ({
  "2026-06": "June 2026",
  "2026-07": "July 2026"
})[value] ?? value;
if (formatIncidentPeriodLabel("2026-06", "2026-06-24", monthLabel) !== "June 2026 month to date") {
  failures.push("incident period label: an incomplete governed month should be labeled month to date");
}
if (formatIncidentPeriodLabel("2026-06", "2026-06-30", monthLabel) !== "June 2026") {
  failures.push("incident period label: a completed governed month should not be labeled month to date");
}
if (formatIncidentPeriodLabel("2026-06", "2026-07-08", monthLabel) !== "June 2026") {
  failures.push("incident period label: a prior month should not inherit month-to-date wording from the wall clock");
}
if (formatIncidentPeriodLabel("2026-06", undefined, monthLabel) !== "June 2026") {
  failures.push("incident period label: a missing as-of date should downshift to a neutral month label");
}

const syntheticRenderer = createStructuredToolResultRenderer({
  formatDateLabel: (value) => String(value ?? ""),
  formatNumber: (value) => String(value ?? ""),
  normalizeText: (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
});

const syntheticText = syntheticRenderer.buildReadableAnswerText("Synthetic answer.", {
  handled: true,
  tool: "synthetic",
  text: [
    "Synthetic",
    "- Apr 2026: census was 104. Incidents were 188.",
    "- Santa Clarita: medication compliance was 91.7%.",
    "- Data coverage: Incident detail is available from Jan 2026 through Jun 2026.",
    "- Active roster: 12 current resident rows"
  ].join("\n"),
  visual: { title: "Synthetic", rows: [] },
  truthState: "valid_rows",
  trace: { rowCount: 0, truthState: "valid_rows" }
}, "", { id: "profile", maxFacts: 5, requiredSource: false });

for (const expected of [
  "April 2026 census was 104.",
  "Santa Clarita medication compliance was 91.7%.",
  "Incident detail is available from January 2026 through June 2026.",
  "Active roster was 12 residents."
]) {
  if (!syntheticText.includes(expected)) {
    failures.push(`synthetic formatter: missing ${JSON.stringify(expected)} in ${JSON.stringify(syntheticText)}`);
  }
}

for (const forbidden of [
  /had census was/i,
  /was census was/i,
  /was incident detail is/i,
  /was medication compliance was/i,
  /were incidents were/i
]) {
  if (forbidden.test(syntheticText)) {
    failures.push(`synthetic formatter: forbidden grammar ${forbidden} in ${JSON.stringify(syntheticText)}`);
  }
}

function getRenderedVisualStrings(visual) {
  if (!visual || typeof visual !== "object") return [];
  return [
    visual.title,
    visual.subtitle,
    visual.valueLabel,
    ...(visual.columns ?? []),
    ...(visual.rows ?? []).flatMap((row) => [row.label, row.meta, ...(row.cells ?? [])])
  ];
}

function getRenderedModuleStrings(moduleSpec) {
  if (!moduleSpec || typeof moduleSpec !== "object") return [];
  return [
    moduleSpec.title,
    moduleSpec.selectionReason?.label,
    ...getRenderedVisualStrings(moduleSpec.visual)
  ];
}

function stringifyRenderedPayload(result) {
  return JSON.stringify([
    result.text,
    ...getRenderedVisualStrings(result.visual),
    ...getRenderedModuleStrings(result.moduleSpec),
    ...(result.moduleSpecs ?? []).flatMap(getRenderedModuleStrings),
    ...(result.actions ?? []).map((action) => action.label)
  ]);
}

const invariantInput = {
  handled: true,
  tool: "synthetic_contract",
  text: "Victoria's Place reviewed 11!2!2026 and month 2026-02.",
  trace: { period: "2026-02", note: "machine trace 2026-02-11" },
  analysisFrame: { periods: ["2026-02"] },
  provenance: { dataset: "resident-2026-02" },
  artifact: { filename: "resident-2026-02.csv", content: "2026-02-11" },
  actions: [{
    label: "Open Victoria's Place on 2026-02-11",
    kind: "route",
    route: "/communities/victorias-place?period=2026-02",
    prompt: "show Victoria's Place for 2026-02"
  }],
  moduleSpec: {
    id: "adhoc-victorias-place-2026-02-2026-02-11",
    title: "Victoria's Place 2026-02",
    filters: { communityName: "Victoria's Place", period: "2026-02" },
    provenance: { dataset: "victorias-place-2026-02", rowSetId: "rows-2026-02-11" },
    selectionReason: { code: "direct_answer", label: "Victoria's Place result for 2026-02" },
    request: "show Victoria's Place for 2026-02",
    visual: {
      type: "table",
      title: "Victoria's Place on 2026-02-11",
      subtitle: "Month 2026-02",
      columns: ["Resident", "Admit date 2026-02-11"],
      rows: [{
        label: "Resident on 11!2!2026",
        value: 1,
        meta: "Victoria's Place 2026-02",
        cells: ["11!2!2026", "2026-02-11"]
      }]
    }
  }
};
const invariantOutput = enforceAnswerInvariants(invariantInput);

for (const [label, actual, expected] of [
  ["module id", invariantOutput.moduleSpec?.id, invariantInput.moduleSpec.id],
  ["module period filter", invariantOutput.moduleSpec?.filters?.period, invariantInput.moduleSpec.filters.period],
  ["module community filter", invariantOutput.moduleSpec?.filters?.communityName, invariantInput.moduleSpec.filters.communityName],
  ["module request", invariantOutput.moduleSpec?.request, invariantInput.moduleSpec.request],
  ["module provenance", invariantOutput.moduleSpec?.provenance?.dataset, invariantInput.moduleSpec.provenance.dataset],
  ["action route", invariantOutput.actions?.[0]?.route, invariantInput.actions[0].route],
  ["action prompt", invariantOutput.actions?.[0]?.prompt, invariantInput.actions[0].prompt],
  ["trace period", invariantOutput.trace?.period, invariantInput.trace.period],
  ["analysis frame", invariantOutput.analysisFrame?.periods?.[0], invariantInput.analysisFrame.periods[0]],
  ["artifact filename", invariantOutput.artifact?.filename, invariantInput.artifact.filename]
]) {
  if (actual !== expected) failures.push(`display invariant: ${label} mutated from ${JSON.stringify(expected)} to ${JSON.stringify(actual)}`);
}

for (const [label, actual, expected] of [
  ["answer text", invariantOutput.text, "Victoria's House reviewed 11 February 2026 and month February 2026."],
  ["module title", invariantOutput.moduleSpec?.title, "Victoria's House February 2026"],
  ["visual title", invariantOutput.moduleSpec?.visual?.title, "Victoria's House on 11 February 2026"],
  ["visual month subtitle", invariantOutput.moduleSpec?.visual?.subtitle, "Month February 2026"],
  ["bang-date cell", invariantOutput.moduleSpec?.visual?.rows?.[0]?.cells?.[0], "11 February 2026"],
  ["ISO-date cell", invariantOutput.moduleSpec?.visual?.rows?.[0]?.cells?.[1], "11 February 2026"],
  ["action label", invariantOutput.actions?.[0]?.label, "Open Victoria's House on 11 February 2026"]
]) {
  if (actual !== expected) failures.push(`display invariant: ${label} expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

for (const testCase of cases) {
  const result = await runCopilotTool({
    content: testCase.prompt,
    sessionId: `answer-format-${Date.now()}-${Math.random()}`
  });
  const text = String(result.text ?? "");
  const expectsRuntimeContract = result.handled && !["clarification"].includes(result.tool);

  if (expectsRuntimeContract && !result.runtimeSchema) {
    failures.push(`${testCase.prompt}: missing runtime schema validation metadata`);
  }

  if (result.runtimeSchema && result.runtimeSchema.valid !== true) {
    failures.push(`${testCase.prompt}: runtime schema validation failed ${JSON.stringify(result.runtimeSchema.errors ?? [])}`);
  }

  if (expectsRuntimeContract && !result.turnTrace?.turnId) {
    failures.push(`${testCase.prompt}: missing analyst turn trace`);
  }

  if (result.turnTrace && result.turnTrace.selectedTool !== result.tool) {
    failures.push(`${testCase.prompt}: turn trace selectedTool ${result.turnTrace.selectedTool} does not match result tool ${result.tool}`);
  }

  const moduleCount = result.moduleSpecs?.length ?? (result.moduleSpec ? 1 : 0);
  if (moduleCount > 0) {
    if (!result.turnTrace?.module) {
      failures.push(`${testCase.prompt}: module result missing turn trace module summary`);
    } else if (result.turnTrace.module.count !== moduleCount) {
      failures.push(`${testCase.prompt}: turn trace module count ${result.turnTrace.module.count} does not match rendered module count ${moduleCount}`);
    }
  }

  if (testCase.tool && result.tool !== testCase.tool) {
    failures.push(`${testCase.prompt}: expected tool ${testCase.tool}, received ${result.tool}`);
  }

  if (testCase.correctedText && result.interpretation?.correctedText !== testCase.correctedText) {
    failures.push(`${testCase.prompt}: expected corrected text ${JSON.stringify(testCase.correctedText)}, received ${JSON.stringify(result.interpretation?.correctedText)}`);
  }

  if (Object.hasOwn(testCase, "requiresConfirmation") && result.interpretation?.requiresConfirmation !== testCase.requiresConfirmation) {
    failures.push(`${testCase.prompt}: expected requiresConfirmation=${testCase.requiresConfirmation}, received ${result.interpretation?.requiresConfirmation}`);
  }

  if (testCase.visualType && result.visual?.type !== testCase.visualType) {
    failures.push(`${testCase.prompt}: expected visual type ${testCase.visualType}, received ${result.visual?.type ?? "none"}`);
  }

  if (testCase.visualTitleIncludes && !new RegExp(testCase.visualTitleIncludes, "i").test(result.visual?.title ?? "")) {
    failures.push(`${testCase.prompt}: visual title missing ${JSON.stringify(testCase.visualTitleIncludes)} in ${JSON.stringify(result.visual?.title ?? "")}`);
  }

  if (testCase.visualValueLabel && result.visual?.valueLabel !== testCase.visualValueLabel) {
    failures.push(`${testCase.prompt}: expected visual value label ${testCase.visualValueLabel}, received ${result.visual?.valueLabel ?? "none"}`);
  }

  if (testCase.artifact && !result.artifact?.content) {
    failures.push(`${testCase.prompt}: expected CSV artifact`);
  }

  for (const expected of testCase.mustInclude) {
    if (expected === "Answer\n") continue;
    if (!text.includes(expected)) {
      failures.push(`${testCase.prompt}: missing ${JSON.stringify(expected)}`);
    }
  }

  for (const excluded of testCase.mustExclude ?? []) {
    if (text.includes(excluded)) {
      failures.push(`${testCase.prompt}: included ${JSON.stringify(excluded)}`);
    }
  }

  for (const expected of testCase.definitionIncludes ?? []) {
    if (!String(result.structuredAnswer?.definition ?? "").includes(expected)) {
      failures.push(`${testCase.prompt}: definition missing ${JSON.stringify(expected)}`);
    }
  }

  if (testCase.maxVisualRows != null && (result.visual?.rows?.length ?? 0) > testCase.maxVisualRows) {
    failures.push(`${testCase.prompt}: returned ${result.visual.rows.length} visual rows; expected at most ${testCase.maxVisualRows}`);
  }

  if (/^Answer[^\S\r\n]+\S/m.test(text)) {
    failures.push(`${testCase.prompt}: answer heading is not on its own line`);
  }

  if (/^Answer\s*$/im.test(text)) {
    failures.push(`${testCase.prompt}: visible Answer heading leaked into the answer`);
  }

  if (/\nDetails\n/i.test(text) || /\nSupporting facts\n/i.test(text)) {
    failures.push(`${testCase.prompt}: old dense detail heading returned`);
  }

  if ((text.match(/\nRows checked\n/g) ?? []).length > 1) {
    failures.push(`${testCase.prompt}: duplicate row-source section`);
  }

  if (/\nDefinition\nDefinition:/i.test(text)) {
    failures.push(`${testCase.prompt}: duplicate definition label`);
  }

  if (/\nDefinition\n/i.test(text) || /\nRows checked\n/i.test(text)) {
    failures.push(`${testCase.prompt}: visible debug/source section leaked into the answer`);
  }

  const expectsStructuredAnswer =
    !result.safeRefusal &&
    !["clarification", "surface_module", "module_catalog", "data_recovery"].includes(result.tool);
  if (expectsStructuredAnswer) {
    if (!result.structuredAnswer || typeof result.structuredAnswer.answer !== "string") {
      failures.push(`${testCase.prompt}: missing structured answer contract`);
    } else {
      if (!result.structuredAnswer.answer.trim()) failures.push(`${testCase.prompt}: structured answer is empty`);
      if (!result.structuredAnswer.contractId) failures.push(`${testCase.prompt}: structured answer missing contract id`);
      if (!Array.isArray(result.structuredAnswer.facts)) failures.push(`${testCase.prompt}: structured answer facts are not an array`);
      if (!Array.isArray(result.structuredAnswer.rowsChecked)) failures.push(`${testCase.prompt}: structured answer rowsChecked is not an array`);
    }
  }

  for (const forbidden of [
    /^Answer[^\S\r\n]+\S/m,
    /^Answer\s*$/im,
    /\bThe clearest row in the returned slice\b/i,
    /\btop row in this slice\b/i,
    /\blargest row in this slice\b/i,
    /\bI stopped this result\b/i,
    /\bscope did not match\b/i,
    /\bSource:\s*local data tool\b/i,
    /\nDefinition\n/i,
    /\nRows checked\n/i,
    /\b(?:had|was|were)\s+(?:census|incidents?|top categories|medication compliance|incident detail|resident roster|active roster)\s+(?:is|are|was|were|rose|fell|has|had)\b/i,
    /T00:00:00\.000Z/
  ]) {
    if (forbidden.test(text)) {
      failures.push(`${testCase.prompt}: matched forbidden output ${forbidden}`);
    }
  }

  const renderedPayload = stringifyRenderedPayload(result);
  for (const forbidden of [
    /\b20\d{2}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:?\d{2})?\b/,
    /\b20\d{2}-\d{2}-\d{2}\b/,
    /\b20\d{2}-(?:0[1-9]|1[0-2])\b/,
    /\b\d{1,2}!\d{1,2}!\d{4}\b/,
    /Victoria's Place/,
    /"label":"(?:337|342|343|344|345)"/,
    /"cells":\["(?:337|342|343|344|345)"[,|\]]/
  ]) {
    const match = forbidden.exec(renderedPayload);
    if (match) {
      const start = Math.max(0, match.index - 80);
      const end = Math.min(renderedPayload.length, match.index + match[0].length + 80);
      failures.push(
        `${testCase.prompt}: rendered payload matched forbidden invariant ${forbidden} near ${JSON.stringify(renderedPayload.slice(start, end))}`
      );
    }
  }
}

const sessionCases = [
  {
    name: "detail rows export exact same rows",
    steps: [
      {
        prompt: "List every AWOL incident from May through June by community, including resident name, date, incident type, and description",
        tool: "incident_detail_list",
        artifact: true
      },
      {
        prompt: "export that",
        tool: "export_csv",
        artifact: true,
        sameRowSetAsStep: 0
      }
    ]
  },
  {
    name: "community medication follow-up keeps San Pablo scope",
    steps: [
      {
        prompt: "How is San Pablo doing with medications?",
        tool: "medication_profile",
        facilityId: "337"
      },
      {
        prompt: "Show me its compliance for the latest month.",
        tool: "medication_compliance",
        facilityId: "337"
      },
      {
        prompt: "What medications had the most refusals?",
        tool: "medication_refusals_by_community",
        facilityId: "337"
      }
    ]
  },
  {
    name: "broad community question resets incident detail context",
    steps: [
      {
        prompt: "List every AWOL incident from May through June by community, including resident name, date, incident type, and description",
        tool: "incident_detail_list"
      },
      {
        prompt: "How is San Pablo?",
        tool: "community_history",
        facilityId: "337",
        metric: null
      }
    ]
  }
];

for (const sessionCase of sessionCases) {
  const sessionId = `golden-ux-${Date.now()}-${Math.random()}`;
  const results = [];

  for (const [index, step] of sessionCase.steps.entries()) {
    const result = await runCopilotTool({
      content: step.prompt,
      sessionId,
      analysisFrame: index > 0 ? results.at(-1)?.analysisFrame : undefined
    });
    results.push(result);

    if (!result.runtimeSchema?.valid) {
      failures.push(`${sessionCase.name} step ${index + 1}: missing or invalid runtime schema`);
    }
    if (!result.turnTrace?.turnId) {
      failures.push(`${sessionCase.name} step ${index + 1}: missing analyst turn trace`);
    }

    if (step.tool && result.tool !== step.tool) {
      failures.push(`${sessionCase.name} step ${index + 1}: expected tool ${step.tool}, received ${result.tool}`);
    }
    if (step.artifact && !result.artifact?.content) {
      failures.push(`${sessionCase.name} step ${index + 1}: expected CSV artifact`);
    }
    if (step.facilityId && String(result.trace?.facilityId ?? result.analysisFrame?.facilityId ?? "") !== step.facilityId) {
      failures.push(`${sessionCase.name} step ${index + 1}: expected facility ${step.facilityId}, received trace=${result.trace?.facilityId ?? "none"} frame=${result.analysisFrame?.facilityId ?? "none"}`);
    }
    if (Object.hasOwn(step, "metric") && result.analysisFrame?.metric !== step.metric) {
      failures.push(`${sessionCase.name} step ${index + 1}: expected metric ${step.metric}, received ${result.analysisFrame?.metric}`);
    }
    if (step.sameRowSetAsStep != null) {
      const earlier = results[step.sameRowSetAsStep];
      if (!earlier?.provenance?.rowSetId || earlier.provenance.rowSetId !== result.provenance?.rowSetId) {
        failures.push(`${sessionCase.name} step ${index + 1}: exported row set did not match prior detail row set`);
      }
    }
  }
}

if (failures.length) {
  console.error(`FAILED: answer formatting (${failures.length})`);
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`answer formatting checks passed (${cases.length} prompts)`);
}
