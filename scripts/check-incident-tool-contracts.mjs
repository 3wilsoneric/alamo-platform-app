import { runCopilotTool } from "../server/copilot-tools.mjs";

function assert(condition, message, context = null) {
  if (condition) return;
  console.error(`FAILED: ${message}`);
  if (context) console.error(JSON.stringify(context, null, 2));
  process.exit(1);
}

function assertValidResult(result, expectedTool, expectedPeriod) {
  assert(result?.handled === true, `${expectedTool} did not return a handled result`, result);
  assert(result.tool === expectedTool, `expected ${expectedTool}, received ${result.tool}`, result);
  assert(result.safeRefusal !== true, `${expectedTool} unexpectedly refused a loaded request`, result);
  assert(result.truthState === "valid_rows", `${expectedTool} did not report valid rows`, result);
  assert(result.planValidation?.valid === true, `${expectedTool} failed plan validation`, result.planValidation);
  assert(result.trace?.tool === expectedTool, `${expectedTool} trace ownership is incorrect`, result.trace);
  assert(Number(result.trace?.rowCount) > 0, `${expectedTool} did not report checked rows`, result.trace);
  if (expectedPeriod) {
    assert(result.trace?.period === expectedPeriod, `${expectedTool} returned the wrong period`, result.trace);
  }
}

const breakdown = await runCopilotTool({
  content: "show June 2026 incidents by category"
});
assertValidResult(breakdown, "incident_breakdown", "2026-06");
assert(breakdown.visual?.type === "bar_chart", "incident breakdown must render a category chart", breakdown.visual);
assert(breakdown.visual?.valueLabel === "Incidents", "incident breakdown must label incident counts", breakdown.visual);
assert(breakdown.visual?.rows?.length > 0, "incident breakdown must include category rows", breakdown.visual);

const peopleCount = await runCopilotTool({
  content: "how many people went AWOL in May 2026"
});
assertValidResult(peopleCount, "incident_breakdown", "2026-05");
assert(peopleCount.visual?.valueLabel === "Residents", "people-count questions must return residents, not incident rows", peopleCount.visual);
assert(/unique resident/i.test(peopleCount.text), "people-count answer must define the unique-resident grain", peopleCount.text);
assert(
  /(?:involved in|across|in) [\d,]+(?: [\w/-]+)? incidents/i.test(peopleCount.text),
  "people-count answer must preserve the event-count distinction",
  peopleCount.text
);

const detailList = await runCopilotTool({
  content: "List every AWOL incident from May through June by community, including resident name, date, incident type, and description"
});
assertValidResult(detailList, "incident_detail_list", "2026-05, 2026-06");
assert(detailList.visual?.type === "table", "incident detail must render a table", detailList.visual);
assert(detailList.artifact?.type === "csv", "incident detail must attach a CSV artifact", detailList.artifact);
assert(detailList.artifact?.rowCount > 0, "incident detail CSV must contain rows", detailList.artifact);
assert(detailList.artifact?.rowCount === detailList.provenance?.rowCount, "incident detail artifact and provenance row counts differ", {
  artifact: detailList.artifact,
  provenance: detailList.provenance
});
assert(detailList.artifact?.rowSetId === detailList.provenance?.rowSetId, "incident detail artifact and provenance fingerprints differ", {
  artifact: detailList.artifact,
  provenance: detailList.provenance
});
assert(detailList.visual?.originalRowCount === detailList.artifact?.rowCount, "incident detail preview does not describe the full artifact row set", {
  visual: detailList.visual,
  artifact: detailList.artifact
});
assert(detailList.visual?.rows.length <= 50, "incident detail preview should stay bounded for chat rendering", detailList.visual);
assert(detailList.visual?.rows.length < detailList.artifact?.rowCount, "incident detail preview should not render the full large row set in chat", {
  visual: detailList.visual,
  artifact: detailList.artifact
});
for (const column of ["Date", "Community", "Resident", "Incident type", "Description"]) {
  assert(detailList.visual?.columns?.includes(column), `incident detail is missing the ${column} column`, detailList.visual);
}
assert(detailList.artifact.content.split(/\r?\n/).length === detailList.artifact.rowCount + 1, "incident detail CSV row count does not match its payload", detailList.artifact);

const comparison = await runCopilotTool({
  content: "Compare San Pablo May incidents to June incidents by category"
});
assertValidResult(comparison, "incident_category_comparison", "2026-05 vs 2026-06");
assert(["comparison_chart", "table"].includes(comparison.visual?.type), "incident comparison must render a comparison visual", comparison.visual);
assert(comparison.visual?.columns?.length === 4, "incident comparison must expose category, two periods, and delta", comparison.visual);
assert(comparison.visual?.columns?.[0] === "Category", "incident comparison must group by category", comparison.visual);
assert(comparison.visual?.columns?.at(-1) === "Delta", "incident comparison must expose the delta", comparison.visual);

const topByCommunity = await runCopilotTool({
  content: "give me the top incident category of each community in May 2026"
});
assertValidResult(topByCommunity, "top_incident_category_by_community", "2026-05");
assert(topByCommunity.visual?.type === "table", "top-category tool must render a table", topByCommunity.visual);
assert(topByCommunity.visual?.columns?.includes("Community"), "top-category tool must include community scope", topByCommunity.visual);
assert(topByCommunity.visual?.columns?.includes("Top category"), "top-category tool must include the winning category", topByCommunity.visual);
assert(topByCommunity.visual?.rows?.length > 1, "portfolio top-category tool must include multiple communities", topByCommunity.visual);

const rate = await runCopilotTool({
  content: "show incident rates per 100 residents"
});
assertValidResult(rate, "incident_rate", rate.trace?.period);
assert(rate.visual?.type === "bar_chart", "incident-rate tool must render a chart", rate.visual);
assert(rate.visual?.valueLabel === "Rate / 100", "incident-rate tool must identify its denominator", rate.visual);
assert(rate.visual?.rows?.every((row) => Number.isFinite(Number(row.value))), "incident-rate tool returned a non-numeric rate", rate.visual);

const rateChange = await runCopilotTool({
  content: "Between April and May 2026, which community had the largest increase in incidents per 100 residents?"
});
assertValidResult(rateChange, "incident_rate_change", "2026-04 vs 2026-05");
assert(rateChange.visual?.type === "table", "incident-rate change must render a table", rateChange.visual);
for (const suffix of ["census", "incidents", "rate"]) {
  assert(rateChange.visual?.columns?.some((column) => column.endsWith(suffix)), `incident-rate change is missing a ${suffix} column`, rateChange.visual);
}
assert(rateChange.visual?.columns?.includes("Rate change"), "incident-rate change must expose the calculated delta", rateChange.visual);

const unavailable = await runCopilotTool({
  content: "show incidents by category in January 2020"
});
assert(unavailable?.handled === true, "unavailable incident period was not handled", unavailable);
assert(unavailable.safeRefusal === true || unavailable.truthState === "not_loaded", "unavailable incident period did not fail closed", unavailable);
assert(unavailable.truthState !== "valid_rows", "unavailable incident period incorrectly returned valid rows", unavailable);
assert(unavailable.visual?.valueLabel !== "Incidents", "unavailable incident period rendered an analytical incident series", unavailable.visual);
assert(/available data|coverage|recovery/i.test(`${unavailable.visual?.title ?? ""} ${unavailable.visual?.subtitle ?? ""}`), "unavailable incident period did not render a diagnostic recovery surface", unavailable.visual);

console.log("incident tool contracts passed (8 stable behavior contracts)");
