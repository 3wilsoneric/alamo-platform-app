import {
  applyAnalysisPatch,
  createExecutionPlan,
  deriveAnalysisPatch,
  validateResultAgainstPlan
} from "../shared/analysis-session-state.mjs";
import { understandQuery } from "../shared/query-understanding.mjs";
import { compileCopilotIntent, resetAnalysisSession, runCopilotTool } from "../server/copilot-tools.mjs";

const facilities = [
  { facility_id: "337", community_name: "A & A Health Services San Pablo" },
  { facility_id: "342", community_name: "Victoria's House" },
  { facility_id: "343", community_name: "JC Wallace House" },
  { facility_id: "344", community_name: "AHS Turlock OP LLC" },
  { facility_id: "345", community_name: "Santa Clarita" }
];
const options = {
  facilities,
  availableMonths: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
  categories: ["AWOL/Elopement", "Medication Refusal", "Medical Emergency", "Aggressive Behavior", "Substance Use"]
};
const basePrompt = "List every AWOL incident from May through June by community, including resident name, date, incident type, and description";
const baseFrame = applyAnalysisPatch(null, deriveAnalysisPatch(basePrompt, options));

function assert(condition, message, context = null) {
  if (condition) return;
  console.error(`FAILED: ${message}`);
  if (context) console.error(JSON.stringify(context, null, 2));
  process.exit(1);
}

assert(baseFrame.metric === "incidents", "base metric should be incidents", baseFrame);
assert(baseFrame.mode === "detail", "base mode should be detail", baseFrame);
assert(baseFrame.category === "AWOL/Elopement", "base category should be AWOL", baseFrame);
assert(baseFrame.periods.join(",") === "2026-05,2026-06", "base period should include May and June", baseFrame);
const rejectedMismatch = validateResultAgainstPlan(createExecutionPlan(baseFrame), {
  handled: true,
  tool: "incident_detail_list",
  trace: { period: "2026-06", note: "category=AWOL/Elopement", dataSource: "incident detail rows" },
  visual: { title: "Incident detail", columns: ["Community", "Resident", "Date", "Incident type", "Description"], rows: [] }
});
assert(!rejectedMismatch.valid && rejectedMismatch.errors.some((error) => error.includes("2026-05")), "post-execution validation accepted a missing period", rejectedMismatch);

const referentialPhrases = ["do it", "do that", "run this", "show that", "same thing", "same"];
const periodCases = [["January", "2026-01"], ["February", "2026-02"], ["April", "2026-04"], ["May", "2026-05"]];
const exportPhrases = ["export that", "download it", "export this to csv", "give me that csv"];
let generatedCases = 0;

for (const phrase of referentialPhrases) {
  for (const [periodLabel, expectedPeriod] of periodCases) {
    for (const facility of facilities) {
      const periodFrame = applyAnalysisPatch(baseFrame, deriveAnalysisPatch(`${phrase} for ${periodLabel}`, options));
      assert(periodFrame.metric === "incidents" && periodFrame.category === "AWOL/Elopement", "period patch lost subject", { phrase, periodLabel, periodFrame });
      assert(periodFrame.periods.join(",") === expectedPeriod, "period patch failed", { phrase, periodLabel, periodFrame });

      const facilityFrame = applyAnalysisPatch(periodFrame, deriveAnalysisPatch(`now ${facility.community_name}`, options));
      assert(String(facilityFrame.facilityId) === facility.facility_id, "community patch failed", { facility, facilityFrame });
      assert(facilityFrame.mode === "detail", "community patch lost detail mode", facilityFrame);

      for (const exportPhrase of exportPhrases) {
        const exportFrame = applyAnalysisPatch(facilityFrame, deriveAnalysisPatch(exportPhrase, options));
        const exportPlan = createExecutionPlan(exportFrame);
        assert(exportFrame.export && exportPlan.tool === "export_csv", "export patch failed", { exportPhrase, exportFrame, exportPlan });
        assert(exportFrame.periods[0] === expectedPeriod && exportFrame.facilityId === facility.facility_id, "export patch lost filters", exportFrame);
        generatedCases += 1;
      }
    }
  }
}

const categoryFrame = applyAnalysisPatch(baseFrame, deriveAnalysisPatch("same for Medication Refusal", options));
assert(categoryFrame.metric === "incidents" && categoryFrame.category === "Medication Refusal", "category patch changed the metric domain", categoryFrame);

const totalsFrame = applyAnalysisPatch(baseFrame, deriveAnalysisPatch("just totals", options));
assert(totalsFrame.mode === "aggregate" && totalsFrame.fields.length === 0, "totals patch retained detail fields", totalsFrame);

for (const prompt of ["How is San Pablo?", "San Pablo overview", "give me San Pablo topline"]) {
  const resetPatch = deriveAnalysisPatch(prompt, options);
  const resetFrame = applyAnalysisPatch(baseFrame, resetPatch);
  const expectedTool = /^how is/i.test(prompt) ? "community_history" : "community_profile";
  const resetPlan = createExecutionPlan(resetFrame, expectedTool, { preferFallback: true });
  assert(resetPatch.reset && !resetPatch.inherit, "broad community request did not reset thread state", { prompt, resetPatch });
  assert(resetFrame.metric === null && resetFrame.mode === null && resetFrame.category === null, "broad community request retained analytical filters", { prompt, resetFrame });
  assert(resetFrame.periods.length === 0 && resetFrame.fields.length === 0 && resetPlan.tool === expectedTool, "broad community request retained period/detail state", { prompt, resetFrame, resetPlan });
}

const censusDomainSwitch = applyAnalysisPatch(baseFrame, deriveAnalysisPatch("now show census", options));
assert(censusDomainSwitch.metric === "census" && censusDomainSwitch.mode === null, "incident detail mode leaked into census domain", censusDomainSwitch);
assert(censusDomainSwitch.category === null && censusDomainSwitch.fields.length === 0, "incident category or detail fields leaked into census domain", censusDomainSwitch);

const medicationDomainSwitch = applyAnalysisPatch(baseFrame, deriveAnalysisPatch("now show medication compliance", options));
assert(medicationDomainSwitch.metric === "medications" && medicationDomainSwitch.mode === null, "incident detail mode leaked into medication domain", medicationDomainSwitch);
assert(medicationDomainSwitch.category === null && medicationDomainSwitch.fields.length === 0, "incident category or detail fields leaked into medication domain", medicationDomainSwitch);

const peopleCountFrame = applyAnalysisPatch(null, deriveAnalysisPatch("i just want to know how many people went awol last month total, may 2026", options));
const peopleCountPlan = createExecutionPlan(peopleCountFrame);
assert(peopleCountFrame.metric === "incidents" && peopleCountFrame.metricGrain === "distinct_residents", "people-count question did not compile to distinct resident grain", peopleCountFrame);
assert(peopleCountFrame.mode === "aggregate" && peopleCountFrame.category === "AWOL/Elopement" && peopleCountFrame.periods.join(",") === "2026-05", "people-count question lost category, period, or aggregate mode", peopleCountFrame);
assert(peopleCountPlan.tool === "incident_breakdown", "people-count plan selected wrong tool", peopleCountPlan);

const eventCountFrame = applyAnalysisPatch(null, deriveAnalysisPatch("how many AWOL incidents in May 2026 total", options));
const eventCountPlan = createExecutionPlan(eventCountFrame);
assert(eventCountFrame.metric === "incidents" && eventCountFrame.metricGrain === "incident_events", "incident-count question did not compile to incident event grain", eventCountFrame);
assert(eventCountFrame.mode === "aggregate" && eventCountPlan.tool === "incident_breakdown", "incident-count plan selected wrong aggregate tool", { eventCountFrame, eventCountPlan });

const aprilFrame = applyAnalysisPatch(baseFrame, deriveAnalysisPatch("do it for April", options));
const compareFrame = applyAnalysisPatch(aprilFrame, deriveAnalysisPatch("compare it with May", options));
assert(compareFrame.mode === "comparison" && compareFrame.periods.join(",") === "2026-04,2026-05", "comparison patch did not add a period", compareFrame);

for (const typoPrompt of ["list every awol incdient in february", "show santa clartia censsus trend", "frebruary awol incidents"]) {
  const understood = understandQuery(typoPrompt, { communities: facilities });
  const typoFrame = applyAnalysisPatch(null, deriveAnalysisPatch(understood.correctedText, options));
  assert(Boolean(typoFrame.metric), "corrected typo did not produce a metric", { typoPrompt, understood, typoFrame });
  generatedCases += 1;
}

const sessionId = `analysis-state-check-${Date.now()}`;
const first = await runCopilotTool({ content: basePrompt, sessionId });
assert(
  first.planValidation?.valid &&
    first.tool === "incident_detail_list" &&
    first.artifact?.rowCount >= 300 &&
    first.visual?.rows?.length <= 50 &&
    first.visual?.originalRowCount === first.artifact.rowCount,
  "initial live plan failed",
  first
);
assert(first.visual.rows.every((row) => row.cells?.[4] === "AWOL/Elopement"), "detail result included a different structured category", first.visual.rows.filter((row) => row.cells?.[4] !== "AWOL/Elopement"));
const sharedOwnerSessionId = `analysis-owner-isolation-${Date.now()}`;
await runCopilotTool({ content: basePrompt, sessionId: sharedOwnerSessionId, sessionOwnerKey: "analysis-user-a" });
const otherOwnerCompile = await compileCopilotIntent({
  content: "do it for April",
  sessionId: sharedOwnerSessionId,
  sessionOwnerKey: "analysis-user-b"
});
assert(
  !otherOwnerCompile.handled && !otherOwnerCompile.analysisFrame?.metric,
  "analysis session context crossed authenticated user boundaries",
  otherOwnerCompile
);
const originalOwnerCompile = await compileCopilotIntent({
  content: "do it for April",
  sessionId: sharedOwnerSessionId,
  sessionOwnerKey: "analysis-user-a"
});
assert(
  originalOwnerCompile.analysisFrame?.category === "AWOL/Elopement" && originalOwnerCompile.analysisFrame?.periods?.join(",") === "2026-04",
  "analysis session owner could not recover its own stored context",
  originalOwnerCompile
);
resetAnalysisSession(sharedOwnerSessionId, "analysis-user-b");
const ownerAfterForeignReset = await compileCopilotIntent({
  content: "do it for April",
  sessionId: sharedOwnerSessionId,
  sessionOwnerKey: "analysis-user-a"
});
assert(
  ownerAfterForeignReset.analysisFrame?.category === "AWOL/Elopement",
  "one user reset another user's analysis session",
  ownerAfterForeignReset
);
resetAnalysisSession(sharedOwnerSessionId, "analysis-user-a");
const serverMemoryCompile = await compileCopilotIntent({ content: "do it for April", sessionId });
assert(serverMemoryCompile.analysisFrame?.category === "AWOL/Elopement" && serverMemoryCompile.analysisFrame?.periods?.join(",") === "2026-04", "compiler did not recover prior frame from server session memory", serverMemoryCompile);
const resetResult = resetAnalysisSession(sessionId);
assert(resetResult.ok, "server session reset did not return ok", resetResult);
const afterServerResetCompile = await compileCopilotIntent({ content: "do it for April", sessionId });
assert(!afterServerResetCompile.handled && !afterServerResetCompile.analysisFrame?.metric, "server session reset left old analysis frame active", afterServerResetCompile);
await runCopilotTool({ content: basePrompt, sessionId });
const serverMemoryApril = await runCopilotTool({ content: "do it for April", sessionId });
assert(
  serverMemoryApril.planValidation?.valid &&
    serverMemoryApril.trace?.period === "2026-04" &&
    serverMemoryApril.artifact?.rowCount >= 200 &&
    serverMemoryApril.visual?.rows?.length <= 50 &&
    serverMemoryApril.visual?.originalRowCount === serverMemoryApril.artifact.rowCount,
  "server-memory follow-up failed without an explicit frame",
  serverMemoryApril
);
const serverMemoryExport = await runCopilotTool({ content: "export that", sessionId });
assert(serverMemoryExport.planValidation?.valid && serverMemoryExport.tool === "export_csv" && Boolean(serverMemoryExport.artifact?.content), "server-memory export failed without an explicit frame", serverMemoryExport);
const serverMemoryCommunityReset = await runCopilotTool({ content: "How is San Pablo?", sessionId });
assert(serverMemoryCommunityReset.planValidation?.valid && serverMemoryCommunityReset.tool === "community_history" && serverMemoryCommunityReset.analysisFrame?.metric === null && serverMemoryCommunityReset.analysisFrame?.mode === null, "broad community question inherited prior incident detail state", serverMemoryCommunityReset);
const communityHistorySessionId = `community-history-follow-up-${Date.now()}`;
const sanPabloHistory = await runCopilotTool({ content: "san pablo, how has been the last three months", sessionId: communityHistorySessionId });
assert(
  sanPabloHistory.planValidation?.valid &&
    sanPabloHistory.tool === "community_history" &&
    sanPabloHistory.trace?.period === "2026-04, 2026-05, 2026-06" &&
    sanPabloHistory.visual?.rows?.length === 3 &&
    /April 2026/i.test(sanPabloHistory.text ?? "") &&
    /June 2026/i.test(sanPabloHistory.text ?? "") &&
    !/current-state data|I don't have that exact slice/i.test(sanPabloHistory.text ?? ""),
  "community history baseline did not answer the requested multi-month slice",
  sanPabloHistory
);
assert(
  sanPabloHistory.visual.rows.every((row) => !String(row.cells?.[3] ?? "").includes("AHS Turlock")),
  "numeric incident cells were rewritten as community names",
  sanPabloHistory.visual.rows
);
const sanPabloMarchThroughJune = await runCopilotTool({ content: "i want march april may june detail", sessionId: communityHistorySessionId });
assert(
  sanPabloMarchThroughJune.planValidation?.valid &&
    sanPabloMarchThroughJune.tool === "community_history" &&
    sanPabloMarchThroughJune.trace?.period === "2026-03, 2026-04, 2026-05, 2026-06" &&
    sanPabloMarchThroughJune.visual?.rows?.length === 4 &&
    /March 2026/i.test(sanPabloMarchThroughJune.text ?? "") &&
    /June 2026/i.test(sanPabloMarchThroughJune.text ?? "") &&
    !/current-state data|I don't have that exact slice/i.test(sanPabloMarchThroughJune.text ?? ""),
  "community history follow-up did not preserve community and patch the month range",
  sanPabloMarchThroughJune
);
const uglyCommunityHistory = await runCopilotTool({
  content: "hey how was pablo november throuhg january",
  sessionId: `community-history-ugly-blank-thread-${Date.now()}`
});
assert(
  uglyCommunityHistory.planValidation?.valid &&
    uglyCommunityHistory.tool === "community_history" &&
    uglyCommunityHistory.trace?.facilityId === "337" &&
    uglyCommunityHistory.trace?.period === "2025-11, 2025-12, 2026-01" &&
    /November 2025/i.test(uglyCommunityHistory.text ?? "") &&
    /January 2026/i.test(uglyCommunityHistory.text ?? "") &&
    !/I need the full question first|Nov 2026|not available/i.test(uglyCommunityHistory.text ?? ""),
  "blank-thread conversational typo range should compile as a complete community-history request",
  uglyCommunityHistory
);
const serverMemoryFreshnessCompile = await compileCopilotIntent({ content: "why are today's incidents not showing up", sessionId });
assert(serverMemoryFreshnessCompile.executionPlan?.tool === "data_availability" && serverMemoryFreshnessCompile.analysisFrame?.metric === null && !serverMemoryFreshnessCompile.derivedFrame?.inherit, "freshness compile inherited prior analytical state", serverMemoryFreshnessCompile);
const serverMemoryFreshness = await runCopilotTool({ content: "why are today's incidents not showing up", sessionId });
assert(serverMemoryFreshness.planValidation?.valid && serverMemoryFreshness.tool === "data_availability" && serverMemoryFreshness.analysisFrame?.metric === null, "freshness tool inherited prior analytical state", serverMemoryFreshness);
assert(!/shannon|resident profile|awol\/elopement/i.test(serverMemoryFreshness.text ?? ""), "freshness answer leaked prior resident or incident-detail context", serverMemoryFreshness);
const unrelated = await runCopilotTool({ content: "hello there", sessionId, analysisFrame: first.analysisFrame });
assert(!unrelated.handled && unrelated.analysisFrame?.revision === first.analysisFrame?.revision, "unrelated chat mutated the analysis frame", unrelated);
const april = await runCopilotTool({ content: "do it for April", sessionId, analysisFrame: first.analysisFrame });
assert(
  april.planValidation?.valid &&
    april.trace?.period === "2026-04" &&
    april.artifact?.rowCount >= 200 &&
    april.visual?.rows?.length <= 50 &&
    april.visual?.originalRowCount === april.artifact.rowCount,
  "April live patch failed",
  april
);
const compared = await runCopilotTool({ content: "compare it with May", sessionId, analysisFrame: april.analysisFrame });
assert(compared.planValidation?.valid && compared.trace?.period === "2026-04, 2026-05" && compared.tool === "slice_metric", "comparison live patch failed", compared);
const sanPablo = await runCopilotTool({ content: "now San Pablo", sessionId, analysisFrame: april.analysisFrame });
assert(sanPablo.planValidation?.valid && String(sanPablo.trace?.facilityId) === "337" && sanPablo.visual?.rows?.length > 0, "community live patch failed", sanPablo);
const exported = await runCopilotTool({ content: "export that", sessionId, analysisFrame: sanPablo.analysisFrame });
assert(exported.planValidation?.valid && exported.tool === "export_csv" && Boolean(exported.artifact?.content), "live export patch failed", exported);
const totals = await runCopilotTool({ content: "just totals", sessionId, analysisFrame: sanPablo.analysisFrame });
assert(totals.planValidation?.valid && totals.analysisFrame?.mode === "aggregate" && totals.analysisFrame?.fields.length === 0, "aggregate live patch failed", totals);
const awolPeopleCount = await runCopilotTool({ content: "i just want to know how many people went awol last month total, may 2026", sessionId: `awol-people-count-${Date.now()}` });
assert(awolPeopleCount.planValidation?.valid && awolPeopleCount.tool === "incident_breakdown", "AWOL people-count routed to the wrong tool", awolPeopleCount);
assert(/unique resident/.test(awolPeopleCount.text ?? "") && awolPeopleCount.visual?.valueLabel === "Residents", "AWOL people-count did not answer distinct residents", awolPeopleCount);
const awolIncidentCount = await runCopilotTool({ content: "how many AWOL incidents in May 2026 total", sessionId: `awol-incident-count-${Date.now()}` });
assert(awolIncidentCount.planValidation?.valid && awolIncidentCount.tool === "incident_breakdown", "AWOL incident-count routed to the wrong tool", awolIncidentCount);
assert(
  Number(awolIncidentCount.summary?.incidentCount) === 195 && awolIncidentCount.visual?.valueLabel === "Incidents",
  "AWOL incident-count did not answer incident volume",
  awolIncidentCount
);

const medicationSessionId = `medication-follow-up-${Date.now()}`;
const sanPabloMedicationProfile = await runCopilotTool({ content: "How is San Pablo doing with medications?", sessionId: medicationSessionId });
assert(String(sanPabloMedicationProfile.trace?.facilityId) === "337", "medication profile lost explicit community scope", sanPabloMedicationProfile);
const sanPabloMedicationCompliance = await runCopilotTool({ content: "Show me its compliance for the latest month.", sessionId: medicationSessionId });
assert(String(sanPabloMedicationCompliance.trace?.facilityId) === "337", "possessive medication follow-up lost community scope", sanPabloMedicationCompliance);
const sanPabloMedicationRefusals = await runCopilotTool({ content: "What medications had the most refusals?", sessionId: medicationSessionId });
assert(String(sanPabloMedicationRefusals.trace?.facilityId) === "337", "same-domain medication follow-up lost community scope", sanPabloMedicationRefusals);

const refinementSessionId = `analysis-refinement-check-${Date.now()}`;
const trend = await runCopilotTool({ content: "compare census trends across communities over the last six months", sessionId: refinementSessionId });
assert(trend.planValidation?.valid && trend.visual?.type === "multi_line_chart", "multi-series baseline failed", trend);
const heatmap = await runCopilotTool({ content: "switch this to a heatmap", sessionId: refinementSessionId, analysisFrame: trend.analysisFrame });
assert(heatmap.planValidation?.valid && heatmap.tool === "community_time_series" && heatmap.visual?.type === "heatmap", "heatmap refinement failed", heatmap);
const incidentHeatmap = await runCopilotTool({ content: "now show incidents", sessionId: refinementSessionId, analysisFrame: heatmap.analysisFrame });
assert(incidentHeatmap.planValidation?.valid && incidentHeatmap.analysisFrame?.metric === "incidents" && incidentHeatmap.visual?.type === "heatmap", "metric refinement lost presentation", incidentHeatmap);
const breakdown = await runCopilotTool({ content: "show San Pablo June incident category breakdown", sessionId: refinementSessionId });
const exactRows = await runCopilotTool({ content: "show exact rows", sessionId: refinementSessionId, analysisFrame: breakdown.analysisFrame });
assert(exactRows.planValidation?.valid && exactRows.tool === "incident_detail_list" && exactRows.visual?.type === "table" && exactRows.visual?.rows?.length > 0, "exact-row refinement failed", exactRows);

console.log(`analysis session checks passed (${generatedCases} generated combinations + 23 live turns)`);
