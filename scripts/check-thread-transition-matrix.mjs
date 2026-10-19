import {
  applyAnalysisPatch,
  createExecutionPlan,
  deriveAnalysisPatch
} from "../shared/analysis-session-state.mjs";

const facilities = [
  { facility_id: "337", community_name: "A & A Health Services San Pablo" },
  { facility_id: "342", community_name: "Victoria's House" },
  { facility_id: "343", community_name: "JC Wallace House" },
  { facility_id: "344", community_name: "AHS Turlock OP LLC" },
  { facility_id: "345", community_name: "Santa Clarita" }
];
const categories = ["AWOL/Elopement", "Medication Refusal", "Medical Emergency", "Aggressive Behavior", "Substance Use"];
const months = ["2026-04", "2026-05", "2026-06"];
const options = {
  facilities,
  categories,
  availableMonths: ["2026-01", "2026-02", "2026-03", ...months]
};
const failures = [];
let cases = 0;

function assert(condition, label, context) {
  cases += 1;
  if (!condition) failures.push(`${label}: ${JSON.stringify(context)}`);
}

function categoryPrompt(category) {
  return category === "AWOL/Elopement" ? "AWOL" : category;
}

for (const sourceFacility of facilities) {
  for (const category of categories) {
    for (const month of months) {
      const basePrompt = `list every ${sourceFacility.community_name} ${categoryPrompt(category)} incident for ${month} including resident date type and description`;
      const baseFrame = applyAnalysisPatch(null, deriveAnalysisPatch(basePrompt, options));

      assert(
        baseFrame.metric === "incidents" && baseFrame.mode === "detail" && baseFrame.category === category,
        "base incident-detail frame",
        { basePrompt, baseFrame }
      );

      for (const targetFacility of facilities) {
        for (const resetPrompt of [
          `How is ${targetFacility.community_name}?`,
          `${targetFacility.community_name} overview`,
          `give me ${targetFacility.community_name} topline`
        ]) {
          const derived = deriveAnalysisPatch(resetPrompt, options);
          const frame = applyAnalysisPatch(baseFrame, derived);
          const expectedTool = /^How is/i.test(resetPrompt) ? "community_history" : "community_profile";
          const plan = createExecutionPlan(frame, expectedTool, { preferFallback: true });
          assert(
            derived.reset && !derived.inherit && frame.metric === null && frame.mode === null && frame.category === null &&
              frame.periods.length === 0 && frame.fields.length === 0 && plan.tool === expectedTool &&
              String(frame.facilityId) === targetFacility.facility_id,
            "broad community reset",
            { basePrompt, resetPrompt, derived, frame, plan }
          );
        }

        const scoped = applyAnalysisPatch(baseFrame, deriveAnalysisPatch(`same for ${targetFacility.community_name}`, options));
        assert(
          scoped.metric === "incidents" && scoped.mode === "detail" && scoped.category === category &&
            scoped.periods[0] === month && String(scoped.facilityId) === targetFacility.facility_id,
          "referential community inheritance",
          { basePrompt, scoped }
        );
      }

      const census = applyAnalysisPatch(baseFrame, deriveAnalysisPatch("now show census", options));
      assert(
        census.metric === "census" && census.mode === null && census.category === null && census.fields.length === 0,
        "incident-to-census reset",
        { basePrompt, census }
      );

      const medication = applyAnalysisPatch(baseFrame, deriveAnalysisPatch("now show medication compliance", options));
      assert(
        medication.metric === "medications" && medication.mode === null && medication.category === null && medication.fields.length === 0,
        "incident-to-medication reset",
        { basePrompt, medication }
      );

      const exportFrame = applyAnalysisPatch(baseFrame, deriveAnalysisPatch("export that", options));
      assert(
        exportFrame.export && exportFrame.metric === "incidents" && exportFrame.mode === "detail" && exportFrame.category === category &&
          createExecutionPlan(exportFrame).tool === "export_csv",
        "referential export inheritance",
        { basePrompt, exportFrame }
      );
    }
  }
}

if (failures.length) {
  console.error(`FAILED: thread transition matrix (${failures.length}/${cases})`);
  console.error(failures.slice(0, 25).map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`thread transition matrix passed (${cases} transition assertions)`);
}
