import { runCopilotTool } from "../server/copilot-tools.mjs";

const facilities = [
  { name: "San Pablo", fullName: "A & A Health Services San Pablo" },
  { name: "Santa Clarita", fullName: "Santa Clarita" },
  { name: "JC Wallace House", fullName: "JC Wallace House" },
  { name: "Turlock", fullName: "AHS Turlock OP LLC" },
  { name: "Victoria's House", fullName: "Victoria's House" }
];

const months = [
  ["January", "2026-01"],
  ["February", "2026-02"],
  ["March", "2026-03"],
  ["April", "2026-04"],
  ["May", "2026-05"],
  ["June", "2026-06"]
];

const categories = [
  ["AWOL", "AWOL/Elopement"],
  ["Medication Refusal", "Medication Refusal"],
  ["Medical Emergency", "Medical Emergency"],
  ["Substance Use", "Substance Use"],
  ["Aggressive Behavior", "Aggressive Behavior"]
];

const exactResidents = [
  "Shannon Romero",
  "Audrey West",
  "Frank Romero",
  "Tuesday Woo",
  "Chandeng Xayavong"
];

const forbiddenPatterns = [
  /Answer The\b/i,
  /The clearest row/i,
  /largest row in this slice/i,
  /Closest Recovery Path/i,
  /same \d+ rows shown in the module/i,
  /\bVictoria's Place\b/i,
  /\bfacility\s+(337|342|343|344|345)\b/i,
  /T00:00:00\.000Z/i,
  /Object object/i,
  /undefined/i
];

const cases = [];
const add = (prompt, expected) => cases.push({ prompt, ...expected });

for (const facility of facilities) {
  add(`show ${facility.name} census trend`, { tool: "census_trend", requireVisual: true });
  add(`${facility.name} census history over time`, { tool: "census_trend", requireVisual: true });
  add(`how many clients at ${facility.name} in January of 2026`, { tool: "census_trend", mustInclude: ["January 2026"] });
  add(`how many residents did ${facility.name} have in May 2026`, { tool: "census_trend", mustInclude: ["May 2026"] });
  add(`How is ${facility.name}?`, { tool: "community_history", requireVisual: true, mustInclude: [facility.fullName] });
  add(`show ${facility.name} medication compliance`, { tool: "medication_compliance", requireVisual: true });
  add(`show ${facility.name} diagnosis mix`, { tool: "diagnosis_mix", requireVisual: true });
  add(`show ${facility.name} length of stay mix`, { tool: "length_of_stay_mix", requireVisual: true });
}

for (const [month] of months.slice(1)) {
  add(`which community added the most residents in ${month} 2026`, { tool: "census_movement" });
  add(`portfolio census movement in ${month} 2026`, { tool: "census_movement" });
}

for (const facility of facilities) {
  for (const [phrase, category] of categories.slice(0, 4)) {
    add(`how many ${phrase} incidents did ${facility.name} have in May 2026`, {
      tool: "incident_breakdown",
      mustInclude: [category]
    });
    add(`how many people had ${phrase} incidents at ${facility.name} in May 2026`, {
      tool: "incident_breakdown",
      valueLabel: "Residents",
      mustInclude: [category, "unique resident"]
    });
  }
}

for (const [phrase, category] of categories) {
  add(`${phrase} incidents by community in February 2026`, {
    tool: "slice_metric",
    mustInclude: [category]
  });
  add(`give me ${phrase} incidents breakdown by community for June 2026`, {
    tool: "slice_metric",
    mustInclude: [category]
  });
}

add("List every AWOL incident from May through June by community, including resident name, date, incident type, and description", {
  tool: "incident_detail_list",
  artifact: true,
  visualType: "table",
  mustInclude: ["The CSV includes all 375 exact matches"]
});
add("list every San Pablo incident detail for April 2026 with resident date type and description", {
  tool: "incident_detail_list",
  artifact: true,
  visualType: "table",
  mustInclude: ["April 2026"]
});
add("list June incidents with resident names and descriptions", {
  tool: "incident_detail_list",
  artifact: true,
  visualType: "table",
  mustInclude: ["June 2026"]
});
add("show residents involved in June AWOL incidents", {
  tool: "incident_detail_list",
  artifact: true,
  visualType: "table",
  mustInclude: ["AWOL/Elopement"]
});
add("give me admissions from January through May Santa Clarita", {
  tool: "detail_list",
  artifact: true,
  visualType: "table",
  mustInclude: ["admissions for Santa Clarita", "January 2026", "May 2026"],
  artifactRowCountAtLeast: 1
});
add("Santa Clarita admits Jan through May 2026", {
  tool: "detail_list",
  artifact: true,
  visualType: "table",
  mustInclude: ["admissions", "admit dates", "January 2026", "May 2026"],
  artifactRowCountAtLeast: 1
});
add("how many admissions Santa Clarita Jan-May 2026", {
  tool: "detail_list",
  artifact: true,
  visualType: "table",
  mustInclude: ["admissions for Santa Clarita"],
  artifactRowCountAtLeast: 1
});
add("week by week breakdown by community of intake and discharge", {
  tool: "resident_flow_weekly",
  requireVisual: true,
  visualType: "table",
  mustInclude: ["Weekly Intake and Discharge", "Discharges are not populated", "current roster"]
});
add("show weekly intake and dischare for San Pablo", {
  tool: "resident_flow_weekly",
  requireVisual: true,
  visualType: "table",
  mustInclude: ["A & A Health Services San Pablo", "Discharges are not populated"]
});

add("Compare San Pablo May incidents to June incidents by category", { tool: "incident_category_comparison", requireVisual: true });
add("Between April and May 2026, which community had the largest increase in incidents per 100 residents?", { tool: "incident_rate_change", requireVisual: true });
add("compare incident categories April 2026 vs May 2026", { tool: "incident_category_comparison", requireVisual: true });
add("show incident rates by community", { tool: "incident_rate", requireVisual: true });
add("show current incident category breakdown", { tool: "incident_breakdown", requireVisual: true });
add("what changed in incidents this month", { tool: "incident_breakdown", mustInclude: ["June 2026 is the latest available incident month", "recorded 813 incidents", "71 fewer than in May 2026"] });
add("what changed in incidents from May to June", { tools: ["incident_category_comparison", "compare_periods"], requireVisual: true });
add("how many people went AWOL in May 2026", {
  tool: "incident_breakdown",
  valueLabel: "Residents",
  mustInclude: ["unique resident"]
});
add("how many AWOL events were there in May 2026", {
  tool: "incident_breakdown",
  valueLabel: "Incidents",
  mustInclude: ["AWOL/Elopement"]
});
add("total AWOL residents last month, May 2026", {
  tool: "incident_breakdown",
  valueLabel: "Residents",
  mustInclude: ["unique resident"]
});
add("who had the most incidents in San Pablo in May 2026", {
  tool: "incident_resident_drivers",
  requireVisual: true,
  visualType: "table",
  mustInclude: ["A & A Health Services San Pablo", "May 2026", "Chandeng Xayavong"]
});

for (const resident of exactResidents) {
  add(`show ${resident} resident profile`, { tool: "resident_lookup", mustInclude: [resident] });
  add(`show ${resident} incident history`, { tool: "resident_incident_history", requireVisual: true });
}
add("pull up Shannon Romero", { tool: "resident_lookup", truthState: "valid_rows", mustInclude: ["Shannon Romero"] });
add("tell me about Shannon Romero", { tool: "resident_lookup", truthState: "valid_rows", mustInclude: ["Shannon Romero"] });
add("what changed for Shannon Romero", { tool: "resident_lookup", mustInclude: ["Shannon Romero"] });

add("show john smith resident profile", { tool: "data_recovery", mustInclude: ["current roster has no verified exact match for John Smith", "different spelling, resident number, unit, or community"], mustExclude: ["Possible Roster Matches"] });
add("show jon smth resident profile", { tool: "clarification", mustInclude: ["Did you mean"] });
add("resident search", { tool: "surface_module", mustInclude: ["Opened Resident Search"], mustExclude: ["Matched 12 rows"] });
add("can i just get the search census module", { tool: "surface_module", mustInclude: ["Opened Resident Search"] });
add("search residents in San Pablo", { tool: "resident_search", requireVisual: true });
add("find residents named Romero", { tool: "resident_search", requireVisual: true });
add("list every client at San Pablo", { tool: "resident_search", requireVisual: true, mustInclude: ["A & A Health Services San Pablo resident roster contains 149 current residents"] });
add("show the full roster for Santa Clarita", { tool: "resident_search", requireVisual: true, mustInclude: ["Santa Clarita resident roster contains 113 current residents"] });
add("census search for Wallace", { tool: "resident_search", requireVisual: true, mustInclude: ["JC Wallace House resident roster"] });
add("how many clients at San Pablo in January 2026", { tool: "census_trend", mustInclude: ["January 2026"] });

add("what is the latest incident date loaded", { tool: "data_availability", mustInclude: ["most recent incident detail"] });
add("what data is loaded for incidents", { tool: "data_availability", mustInclude: ["most recent incident detail"] });
add("do we have November 2025 incident detail rows loaded", { tool: "data_availability", mustInclude: ["Incident detail does not include November 2025"] });
add("do we have May 2026 incident detail rows loaded", { tool: "data_availability", mustInclude: ["Incident detail includes May 2026"] });
add("do we have May 2026 census data loaded", { tool: "data_availability", mustInclude: ["Census monthly includes May 2026"] });
add("do we have January 2026 resident roster rows loaded", { tool: "data_availability", mustInclude: ["Resident roster is current only"] });
add("do we have resident roster rows", { tool: "data_availability", mustInclude: ["Resident"] });
add("is the snapshot stale", { tool: "data_availability", mustInclude: ["most recent incident detail"] });
add("when did the platform last refresh", { tool: "data_availability", mustInclude: ["most recent incident detail"] });
add("why are today's incidents not showing up", { tool: "data_availability", mustInclude: ["most recent incident detail"] });
add("are today's incidents current", { tool: "data_availability", mustInclude: ["most recent incident detail"] });
add("why is the incident center empty", { tool: "data_availability", mustInclude: ["most recent incident detail"] });
add("why does Incident Center show zero today", { tool: "data_availability", mustInclude: ["most recent incident detail"] });
add("did yesterday incidents load", { tool: "data_availability", mustInclude: ["most recent incident detail"] });
add("how fresh is the incident data", { tool: "data_availability", mustInclude: ["most recent incident detail"] });
add("is the incident feed behind", { tool: "data_availability", mustInclude: ["most recent incident detail"] });
add("did new incidents come in today", { tool: "data_availability", mustInclude: ["most recent incident detail"] });
add("when was incident data last received", { tool: "data_availability", mustInclude: ["most recent incident detail"] });
add("What data periods are available for incident detail?", { tool: "data_availability", mustInclude: ["incident events are available"] });
add("show available analytical slices", { tool: "tool_context_catalog" });
add("show available modules", { tool: "module_catalog", requireVisual: true });

add("open the incident center module", { tool: "surface_module", mustInclude: ["Opened Incident Center"] });
add("show me the resident search module", { tool: "surface_module", mustInclude: ["Opened Resident Search"] });
add("surface the community trend module", { tool: "surface_module", mustInclude: ["Opened Communities Overview"] });
add("open communities overview", { tool: "surface_module", mustInclude: ["Opened Communities Overview"] });
add("open command center", { tool: "surface_module", mustInclude: ["Opened Command Center"] });
add("show the glossary", { tool: "surface_module", mustInclude: ["Opened Glossary"] });
add("show San Pablo incidents module", { tool: "surface_module", mustInclude: ["Opened Community Incidents for A & A Health Services San Pablo"] });
add("show San Pablo census module", { tool: "surface_module", mustInclude: ["Opened Community Census for A & A Health Services San Pablo"] });

add("show medication compliance in May and June", { tool: "medication_compliance", requireVisual: true });
add("How is San Pablo doing with medications?", {
  tool: "medication_profile",
  mustInclude: [
    "A & A Health Services San Pablo",
    "97.1% medication compliance",
    "scheduled administrations",
  ],
});
add("What medications had the most refusals?", { tool: "medication_refusals_by_community", requireVisual: true, mustInclude: ["Eliquis 2.5 MG TABS had the most"] });
add("show medication refusals by community", { tool: "medication_refusals_by_community", requireVisual: true });
add("show San Pablo medication exception detail", { tool: "medication_exception_detail", requireVisual: true });
add("who refused meds recently", { tool: "medication_exception_detail", requireVisual: true });
add("list PRN medication exceptions", { tool: "medication_exception_detail", requireVisual: true });
add("show documentation gaps", { tool: "documentation_gaps", requireVisual: true });
add("show all diagnoses", { tool: "diagnosis_mix", requireVisual: true });
add("show resident demographics", { tool: "resident_demographics", requireVisual: true });
add("resident risk watchlist all residents", { tool: "resident_risk_summary", requireVisual: true });
add("what changed at San Pablo", { tool: "community_history", requireVisual: true, mustInclude: ["A & A Health Services San Pablo"] });
add("what's going on with San Pablo", { tool: "community_history", requireVisual: true, mustInclude: ["A & A Health Services San Pablo"] });
add("how's San Pablo doing", { tool: "community_history", requireVisual: true, mustInclude: ["A & A Health Services San Pablo"] });
add("tell me about San Pablo", { tool: "community_profile", mustInclude: ["A & A Health Services San Pablo"] });
add("san pablo, how has been the last three months", { tool: "community_history", requireVisual: true, mustInclude: ["April 2026", "June 2026"] });
add("hey how was pablo november throuhg january", { tool: "community_history", requireVisual: true, mustInclude: ["November 2025", "January 2026"] });
add("what happened at Wallace between February and April", { tool: "community_history", requireVisual: true, mustInclude: ["February 2026", "April 2026"] });
add("give me the read on clarita last few months", { tool: "community_history", requireVisual: true, mustInclude: ["April 2026", "June 2026"] });
add("show Turlock YTD picture", { tool: "community_history", requireVisual: true, mustInclude: ["January 2026", "June 2026"] });
add("how has victoria been since november", { tool: "community_history", requireVisual: true, mustInclude: ["November 2025", "June 2026"] });
add("show me wallace quarter to date", { tool: "community_history", requireVisual: true, mustInclude: ["April 2026", "June 2026"] });
add("what's the San Pablo read last 6 mos", { tool: "community_history", requireVisual: true, mustInclude: ["January 2026", "June 2026"] });
add("show San Pablo community profile for January 2026", { tool: "community_history", requireVisual: true, mustInclude: ["January 2026"] });
add("what changed in census at San Pablo", { tool: "census_movement", requireVisual: true });

add("show santa clartia censsus trend", {
  tool: "census_trend",
  correctedText: "show santa clarita census trend",
  mustInclude: ["Santa Clarita"]
});
add("incdients by communty", {
  tool: "slice_metric",
  correctedText: "incidents by community",
  mustInclude: ["By community"]
});
add("give me frebruary breakdown of awol incidents by community", {
  tool: "slice_metric",
  correctedText: "give me february breakdown of awol incidents by community",
  mustInclude: ["February 2026", "AWOL/Elopement"]
});

add("list all census rows for May 2026", { tool: "detail_list", artifact: true, visualType: "table", mustInclude: ["The CSV includes all 5 exact matches"] });
add("list every medication compliance row for June 2026", { tool: "detail_list", artifact: true, visualType: "table" });
add("list every resident row", {
  tool: "detail_list",
  artifact: true,
  visualType: "table",
  artifactRowCountAtLeast: 100,
  maxVisualRowsWhenLarge: 50,
  originalRowCountMatchesArtifact: true,
  mustInclude: ["The CSV includes all 503 exact matches"]
});
add("list every census row", {
  tool: "detail_list",
  artifact: true,
  visualType: "table",
  artifactRowCountAtLeast: 100,
  maxVisualRowsWhenLarge: 50,
  originalRowCountMatchesArtifact: true,
  mustInclude: ["The CSV includes all 166 exact matches"]
});
add("list every census row for November 2020", { tool: "detail_list", truthState: "not_loaded", mustInclude: ["Available range"] });
add("give me the top category of each community in incidents November of last year", { truthState: "not_loaded", mustInclude: ["not available"] });

if (cases.length < 100 || cases.length > 250) {
  console.error(`FAILED: expected 100-250 operator prompts, found ${cases.length}`);
  process.exit(1);
}

const failures = [];

function renderedText(result) {
  return JSON.stringify({
    text: result.text,
    visual: result.visual,
    actionLabels: result.actions?.map((action) => action?.label),
    module: result.moduleSpec ? {
      title: result.moduleSpec.title,
      selectionReason: result.moduleSpec.selectionReason?.label,
      visual: result.moduleSpec.visual
    } : null,
    modules: result.moduleSpecs?.map((moduleSpec) => ({
      title: moduleSpec?.title,
      selectionReason: moduleSpec?.selectionReason?.label,
      visual: moduleSpec?.visual
    }))
  });
}

function checkResult(testCase, result) {
  const body = renderedText(result);
  const normalizedBody = body.toLowerCase();
  if (!result.handled) failures.push(`${testCase.prompt}: result was not handled`);
  if (result.handled && result.tool !== "clarification" && !result.runtimeSchema?.valid) {
    failures.push(`${testCase.prompt}: missing or invalid runtime schema`);
  }
  if (result.handled && result.tool !== "clarification" && !result.turnTrace?.turnId) {
    failures.push(`${testCase.prompt}: missing analyst turn trace`);
  }
  const acceptedTools = Array.isArray(testCase.tools) ? testCase.tools : testCase.tool ? [testCase.tool] : [];
  if (acceptedTools.length && !acceptedTools.includes(result.tool)) {
    failures.push(`${testCase.prompt}: expected tool ${acceptedTools.join(" or ")}, received ${result.tool ?? "none"}`);
  }
  if (testCase.correctedText && result.interpretation?.correctedText !== testCase.correctedText) {
    failures.push(`${testCase.prompt}: expected correction ${JSON.stringify(testCase.correctedText)}, received ${JSON.stringify(result.interpretation?.correctedText)}`);
  }
  if (testCase.truthState && (result.truthState ?? result.trace?.truthState) !== testCase.truthState) {
    failures.push(`${testCase.prompt}: expected truthState ${testCase.truthState}, received ${result.truthState ?? result.trace?.truthState ?? "none"}`);
  }
  if (testCase.valueLabel && result.visual?.valueLabel !== testCase.valueLabel) {
    failures.push(`${testCase.prompt}: expected visual value label ${testCase.valueLabel}, received ${result.visual?.valueLabel ?? "none"}`);
  }
  if (testCase.visualType && result.visual?.type !== testCase.visualType) {
    failures.push(`${testCase.prompt}: expected visual type ${testCase.visualType}, received ${result.visual?.type ?? "none"}`);
  }
  if (testCase.requireVisual && !result.visual && !result.moduleSpec && !result.moduleSpecs) {
    failures.push(`${testCase.prompt}: expected a visual or module spec`);
  }
  if (testCase.artifact && !result.artifact?.content && !result.artifact?.href && !result.artifact?.url) {
    failures.push(`${testCase.prompt}: expected an export artifact`);
  }
  if (testCase.artifactRowCountAtLeast && Number(result.artifact?.rowCount ?? 0) < testCase.artifactRowCountAtLeast) {
    failures.push(`${testCase.prompt}: expected at least ${testCase.artifactRowCountAtLeast} artifact rows, received ${result.artifact?.rowCount ?? "none"}`);
  }
  if (testCase.originalRowCountMatchesArtifact && result.visual?.originalRowCount !== result.artifact?.rowCount) {
    failures.push(`${testCase.prompt}: visual original row count did not match artifact row count`);
  }
  if (
    testCase.maxVisualRowsWhenLarge &&
    Number(result.artifact?.rowCount ?? 0) > testCase.maxVisualRowsWhenLarge &&
    (result.visual?.rows?.length ?? 0) !== testCase.maxVisualRowsWhenLarge
  ) {
    failures.push(`${testCase.prompt}: expected ${testCase.maxVisualRowsWhenLarge} preview rows for large result, received ${result.visual?.rows?.length ?? "none"}`);
  }
  for (const snippet of testCase.mustInclude ?? []) {
    if (!normalizedBody.includes(String(snippet).toLowerCase())) failures.push(`${testCase.prompt}: missing ${JSON.stringify(snippet)}`);
  }
  for (const snippet of testCase.mustExclude ?? []) {
    if (normalizedBody.includes(String(snippet).toLowerCase())) failures.push(`${testCase.prompt}: included forbidden snippet ${JSON.stringify(snippet)}`);
  }
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(body)) failures.push(`${testCase.prompt}: matched forbidden pattern ${pattern}`);
  }
}

for (const [index, testCase] of cases.entries()) {
  const result = await runCopilotTool({
    content: testCase.prompt,
    sessionId: `operator-prompt-${index}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  });
  checkResult(testCase, result);
}

const followUpSession = `operator-followup-${Date.now()}`;
const initialDetail = await runCopilotTool({
  content: "List every AWOL incident from May through June by community, including resident name, date, incident type, and description",
  sessionId: followUpSession
});
checkResult({ prompt: "follow-up setup", tool: "incident_detail_list", artifact: true }, initialDetail);

const followUps = [
  ["do that for April now", "incident_detail_list", "2026-04"],
  ["now San Pablo", "incident_detail_list", "337"],
  ["just totals", ["incident_breakdown", "slice_metric"], null],
  ["How is San Pablo?", "community_history", null]
];

for (const [prompt, toolOrTools, traceNeedle] of followUps) {
  const result = await runCopilotTool({ content: prompt, sessionId: followUpSession });
  checkResult({ prompt: `follow-up: ${prompt}`, ...(Array.isArray(toolOrTools) ? { tools: toolOrTools } : { tool: toolOrTools }) }, result);
  if (traceNeedle && !JSON.stringify(result.trace ?? {}).includes(traceNeedle) && !JSON.stringify(result.analysisFrame ?? {}).includes(traceNeedle)) {
    failures.push(`follow-up: ${prompt}: trace/frame missing ${traceNeedle}`);
  }
}

if (failures.length) {
  console.error(`FAILED: operator prompt suite (${failures.length}/${cases.length + followUps.length + 1})`);
  console.error(failures.slice(0, 80).map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`operator prompt suite passed (${cases.length} single-turn prompts + ${followUps.length} follow-ups)`);
