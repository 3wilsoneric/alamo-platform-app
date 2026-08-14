import { runCopilotTool } from "../server/copilot-tools.mjs";
import { getCommunitiesDashboardData, getReportsSummaryData } from "../server/platform-data.mjs";
import { platformModuleRegistry } from "../shared/platform-module-registry.mjs";

const surfaceModuleCount = platformModuleRegistry.filter((module) => module.kind === "surface").length;
const analysisModuleCount = platformModuleRegistry.filter((module) => module.kind === "analysis").length;

const cases = [
  {
    prompt: "how many AWOL incidents in may",
    tool: "incident_breakdown",
    period: "2026-05",
    noteIncludes: "AWOL/Elopement",
    textIncludes: "The portfolio recorded 195 AWOL/Elopement incidents in May 2026.",
    textExcludes: "June 2026"
  },
  {
    prompt: "how many incidents in may",
    tool: "incident_breakdown",
    period: "2026-05",
    textIncludes: "884 incidents in May 2026",
    textExcludes: "June 2026"
  },
  {
    prompt: "show AWOL residents in may",
    tool: "incident_detail_list",
    period: "2026-05",
    noteIncludes: "AWOL/Elopement",
    textIncludes: "May 2026",
    textExcludes: "June 2026"
  },
  {
    prompt: "who is driving AWOL incidents in May",
    tool: "incident_resident_drivers",
    period: "2026-05",
    noteIncludes: "AWOL/Elopement",
    textIncludes: "had the most incidents for AWOL/Elopement",
    visualType: "table",
    minimumRows: 5
  },
  {
    prompt: "list all AWOL incidents with the description and name from May and June",
    tool: "incident_detail_list",
    period: "2026-05, 2026-06",
    noteIncludes: "AWOL/Elopement",
    textIncludes: "89 unique residents were involved in 375 matching AWOL/Elopement incidents in May 2026 and June 2026 across the portfolio",
    textExcludes: "scope did not match",
    visualType: "table",
    minimumRows: 1,
    artifact: true
  },
  {
    prompt: "AWOL incidents by community in May and June",
    tool: "slice_metric",
    period: "2026-05, 2026-06",
    noteIncludes: "AWOL/Elopement",
    textIncludes: "Across May 2026 and June 2026, 375 AWOL/Elopement incidents were recorded",
    visualLabelIncludes: ["May 2026", "June 2026"]
  },
  {
    prompt: "give me the top incident category of each community in May and June",
    tool: "top_incident_category_by_community",
    period: "2026-05, 2026-06",
    textIncludes: "Medication Refusal was the most common leading category in each selected period: 4 of 5 communities in May 2026",
    visualLabelIncludes: ["May 2026", "June 2026"],
    minimumRows: 10
  },
  {
    prompt: "compare March April and May incidents by category",
    tool: "slice_discovery",
    period: "2026-03, 2026-04, 2026-05",
    noteIncludes: "slice=incident_monthly_by_community_category",
    textIncludes: "top result",
    textExcludes: "accepts exactly two periods",
    visualTitleIncludes: "Monthly Incidents by Community and Category"
  },
  {
    prompt: "show all documentation gaps",
    tool: "documentation_gaps",
    textIncludes: "documentation gaps",
    minimumRows: 13
  },
  {
    prompt: "show all diagnoses",
    tool: "diagnosis_mix",
    textIncludes: "Portfolio's most common diagnosis is Schizophrenia at 105 of 503 current residents",
    minimumRows: 5
  },
  {
    prompt: "export all AWOL incidents from May and June",
    tool: "export_csv",
    period: "2026-05, 2026-06",
    noteIncludes: "AWOL/Elopement",
    textIncludes: "all 375 AWOL/Elopement incidents",
    artifact: true
  },
  {
    prompt: "List every AWOL incident from May through June by community, including resident name, date, incident type, and description, then export the exact same rows to CSV.",
    tool: "export_csv",
    period: "2026-05, 2026-06",
    noteIncludes: "AWOL/Elopement",
    textIncludes: "incidents",
    textExcludes: "resident records",
    artifact: true,
    artifactIncludes: ["community_name", "client_name", "incident_date", "incident_type", "description"]
  },
  {
    prompt: "List every AWOL incident from May through June by community, including resident name, date, incident type, and description",
    tool: "incident_detail_list",
    period: "2026-05, 2026-06",
    noteIncludes: "AWOL/Elopement",
    textIncludes: "89 unique residents were involved in 375 matching AWOL/Elopement incidents",
    textExcludes: "category comparison",
    minimumRows: 50,
    artifact: true
  },
  {
    prompt: "show incidents by month",
    tool: "slice_metric",
    textIncludes: "By month",
    chronologicalLabels: true
  },
  {
    prompt: "how many incidents were there in May and June",
    tool: "compare_periods",
    period: "2026-05 vs 2026-06",
    textIncludes: "May 2026 had",
    textExcludes: "down by -"
  },
  {
    prompt: "show medication compliance in May and June",
    tool: "medication_compliance",
    period: "2026-05, 2026-06",
    textIncludes: "May 2026 and June 2026",
    visualLabelIncludes: ["May 2026", "June 2026"]
  },
  {
    prompt: "show documentation gaps in May",
    tool: "documentation_gaps",
    period: "2026-05",
    noteIncludes: "historical slice unavailable",
    textIncludes: "current-state data",
    textExcludes: "Largest gaps"
  },
  {
    prompt: "show diagnosis mix in May",
    tool: "diagnosis_mix",
    period: "2026-05",
    noteIncludes: "historical slice unavailable",
    textIncludes: "current-state data",
    textExcludes: "Top diagnoses"
  },
  {
    prompt: "show San Pablo community profile for January 2026",
    tool: "community_history",
    period: "2026-01",
    noteIncludes: "historical community operating detail",
    textIncludes: "January 2026",
    textExcludes: "current-state data"
  },
  {
    prompt: "show operating snapshot January 2026",
    tool: "operating_snapshot",
    period: "2026-01",
    noteIncludes: "temporal_scope_mismatch",
    textIncludes: "current-state data",
    textExcludes: "I need the analysis subject first"
  },
  {
    prompt: "show community compare for January 2026",
    tool: "community_compare",
    period: "2026-01",
    noteIncludes: "temporal_scope_mismatch",
    textIncludes: "current-state data",
    textExcludes: "Highest incident rate"
  },
  {
    prompt: "resident risk watchlist all residents",
    tool: "resident_risk_summary",
    textIncludes: "highest-ranked residents are Chandeng Xayavong",
    textExcludes: "Did you mean"
  },
  {
    prompt: "all AWOL incidents since May",
    tool: "incident_detail_list",
    period: "2026-05, 2026-06",
    noteIncludes: "AWOL/Elopement",
    textIncludes: "May 2026 and June 2026",
    artifact: true
  },
  {
    prompt: "show monthly census from January through June",
    tool: "slice_metric",
    period: "2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06",
    textIncludes: "By month",
    visualLabelIncludes: ["January 2026", "February 2026", "March 2026", "April 2026", "May 2026", "June 2026"]
  },
  {
    prompt: "Between April and May 2026, which community had the largest increase in incidents per 100 residents? Show the census, incident totals, calculated rates for both months, and the incident categories that contributed most to the change.",
    tool: "incident_rate_change",
    period: "2026-04 vs 2026-05",
    noteIncludes: "rate = incidents / census * 100",
    textIncludes: "incidents per 100 residents",
    textExcludes: "Portfolio incident category comparison"
  },
  {
    prompt: "give me frebruary breakdown of awol incidents by community",
    tool: "slice_metric",
    period: "2026-02",
    noteIncludes: "category=AWOL/Elopement",
    textIncludes: "JC Wallace House accounted for 113 of 260 AWOL/Elopement incidents in February 2026",
    visualTitleIncludes: "AWOL/Elopement Incident Slice",
    textExcludes: "June 2026"
  },
  {
    prompt: "incdients by communty",
    tool: "slice_metric",
    correctedText: "incidents by community",
    textIncludes: "A & A Health Services San Pablo accounted for 344 of 813 incidents in June 2026",
    visualTitleIncludes: "Portfolio Incident Slice",
    textExcludes: "Did you mean"
  },
  {
    prompt: "show santa clartia censsus trend",
    tool: "census_trend",
    correctedText: "show santa clarita census trend",
    textIncludes: "Santa Clarita census moved from \\d+ in August 2025 to 119 in June 2026",
    visualTitleIncludes: "Santa Clarita Census Trend",
    textExcludes: "Did you mean"
  },
  {
    prompt: "febr awol incdients",
    tool: "clarification",
    correctedText: "february awol incidents",
    requiresConfirmation: true,
    textIncludes: "Did you mean",
    textExcludes: "Incident Slice"
  },
  {
    prompt: "compare marc and aprl incidents",
    tool: "clarification",
    correctedText: "compare march and april incidents",
    requiresConfirmation: true,
    textIncludes: "Did you mean",
    textExcludes: "incident comparison"
  },
  {
    prompt: "sant census trend",
    tool: "clarification",
    correctedText: "santa census trend",
    requiresConfirmation: true,
    textIncludes: "or “san”",
    textExcludes: "census point"
  },
  {
    prompt: "medcation emergncy incidents by comunity",
    tool: "slice_metric",
    correctedText: "medication emergency incidents by community",
    noteIncludes: "category=Medical Emergency",
    textIncludes: "JC Wallace House accounted for 45 of 100 Medical Emergency incidents in June 2026",
    textExcludes: ["Medication compliance uses scheduled administrations", "Medication Refusal"],
    visualTitleIncludes: "Medical Emergency Incident Slice",
  },
  {
    prompt: "show john smith resident profile",
    tool: "data_recovery",
    textIncludes: "current roster has no verified exact match for John Smith",
    textExcludes: "Longest Stay Residents"
  },
  {
    prompt: "show audrey west resident profile",
    tool: "resident_lookup",
    textIncludes: "current resident at A & A Health Services San Pablo",
    visualTitleIncludes: "Audrey West Resident Profile",
    textExcludes: "Longest Stay Residents"
  },
  {
    prompt: "show jon smth resident profile",
    tool: "clarification",
    requiresConfirmation: true,
    textIncludes: "Did you mean",
    textExcludes: "Longest Stay Residents"
  },
  {
    prompt: "can i just get the search census module",
    tool: "surface_module",
    noteIncludes: "module=resident-census-search",
    actionRoute: "/resident-search",
    textIncludes: "Opened Resident Search",
    textExcludes: "Portfolio census trend"
  },
  {
    prompt: "open the incident center module",
    tool: "surface_module",
    noteIncludes: "module=incident-center",
    actionRoute: "/incidents",
    textIncludes: "Opened Incident Center",
    textExcludes: "incident breakdown"
  },
  {
    prompt: "show Santa Clarita census datasheet module",
    tool: "surface_module",
    noteIncludes: "module=community-census",
    actionRoute: "/communities/345?focus=census",
    textIncludes: "Opened Community Census for Santa Clarita",
    textExcludes: "Portfolio census trend"
  },
  {
    prompt: "open Santa Clarita incidents module",
    tool: "surface_module",
    noteIncludes: "module=community-incidents",
    actionRoute: "/communities/345?focus=incidents",
    textIncludes: "Opened Community Incidents for Santa Clarita",
    textExcludes: "Portfolio incident breakdown"
  },
  {
    prompt: "find a resident",
    tool: "surface_module",
    noteIncludes: "module=resident-census-search",
    actionRoute: "/resident-search",
    textIncludes: "Opened Resident Search",
    textExcludes: "could not verify"
  },
  {
    prompt: "show available modules",
    tool: "module_catalog",
    textIncludes: `${surfaceModuleCount} product surfaces and ${analysisModuleCount} analytical modules`,
    textExcludes: "No tool context manifest"
  },
  {
    prompt: "list all census rows for May 2026",
    tool: "detail_list",
    period: "2026-05",
    textIncludes: "There are 5 portfolio census entries for May 2026",
    visualType: "table",
    minimumRows: 5,
    artifact: true
  },
  {
    prompt: "list every medication compliance row for May 2026",
    tool: "detail_list",
    period: "2026-05",
    textIncludes: "There are 5 portfolio medication compliance entries for May 2026",
    visualType: "table",
    minimumRows: 5,
    artifact: true
  },
  {
    prompt: "list all documentation gap rows",
    tool: "detail_list",
    textIncludes: "There are 21 portfolio documentation gap entries",
    visualType: "table",
    minimumRows: 1,
    artifact: true
  },
  {
    prompt: "what is the latest incident date loaded",
    tool: "data_availability",
    textIncludes: "most recent incident detail",
    visualType: "table",
    minimumRows: 7,
    artifact: true
  }
];

for (const testCase of cases) {
  try {
    const result = await runCopilotTool({ content: testCase.prompt });
    const failures = [];

    if (result.handled !== true) failures.push("expected handled=true");
    if (result.tool !== testCase.tool) failures.push(`wrong tool: ${result.tool}`);
    if (Object.hasOwn(testCase, "period") && result.trace?.period !== testCase.period) failures.push(`wrong period: ${result.trace?.period}`);

    if (testCase.correctedText && result.interpretation?.correctedText !== testCase.correctedText) {
      failures.push(`wrong corrected text: ${result.interpretation?.correctedText ?? "none"}`);
    }

    if (Object.hasOwn(testCase, "requiresConfirmation") && result.interpretation?.requiresConfirmation !== testCase.requiresConfirmation) {
      failures.push(`wrong confirmation state: ${result.interpretation?.requiresConfirmation}`);
    }

    if (testCase.noteIncludes) {
      const expectedNote = new RegExp(testCase.noteIncludes.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      if (!expectedNote.test(result.trace?.note ?? "")) failures.push(`wrong category note: ${result.trace?.note ?? ""}`);
    }

    if (testCase.actionRoute) {
      const routes = (result.actions ?? []).map((action) => action.route).filter(Boolean);
      if (!routes.includes(testCase.actionRoute)) failures.push(`missing action route: ${testCase.actionRoute}`);
    }

    if (testCase.visualType && result.visual?.type !== testCase.visualType) failures.push(`wrong visual type: ${result.visual?.type ?? "none"}`);
    if (testCase.visualTitleIncludes && !new RegExp(testCase.visualTitleIncludes, "i").test(result.visual?.title ?? "")) {
      failures.push(`visual title missing: ${testCase.visualTitleIncludes}`);
    }
    if (testCase.minimumRows && (result.visual?.rows?.length ?? 0) < testCase.minimumRows) failures.push(`expected at least ${testCase.minimumRows} visual rows`);
    if (testCase.artifact && !result.artifact?.content) failures.push("expected CSV artifact");
    if (testCase.artifactIncludes) {
      for (const expectedValue of testCase.artifactIncludes) {
        if (!String(result.artifact?.content ?? "").includes(expectedValue)) failures.push(`CSV artifact missing: ${expectedValue}`);
      }
    }
    if (testCase.visualLabelIncludes) {
      const labels = (result.visual?.rows ?? []).flatMap((row) => [row.label, ...(row.cells ?? []).map(String)]).join(" ");
      for (const expectedLabel of testCase.visualLabelIncludes) {
        if (!labels.includes(expectedLabel)) failures.push(`visual rows missing label: ${expectedLabel}`);
      }
    }
    if (testCase.chronologicalLabels) {
      const times = (result.visual?.rows ?? []).map((row) => Date.parse(`1 ${row.label}`)).filter(Number.isFinite);
      if (times.some((value, index) => index > 0 && value < times[index - 1])) failures.push("visual month rows are not chronological");
    }

    if (!new RegExp(testCase.textIncludes, "i").test(result.text ?? "")) {
      failures.push(`missing expected text: ${testCase.textIncludes}`);
    }

    for (const excludedText of Array.isArray(testCase.textExcludes) ? testCase.textExcludes : [testCase.textExcludes].filter(Boolean)) {
      if (new RegExp(excludedText, "i").test(result.text ?? "")) {
        failures.push(`included excluded text: ${excludedText}`);
      }
    }

    if (failures.length) {
      console.error(`FAILED: ${testCase.prompt}`);
      console.error(failures.map((failure) => `- ${failure}`).join("\n"));
      console.error(JSON.stringify(result, null, 2));
      process.exitCode = 1;
      break;
    }
  } catch (error) {
    console.error(`FAILED: ${testCase.prompt}`);
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
    break;
  }
}

if (!process.exitCode) {
  try {
    const sessionId = `exact-export-${Date.now()}`;
    const detail = await runCopilotTool({
      content: "list all census rows for May 2026",
      sessionId
    });
    const exported = await runCopilotTool({
      content: "export that",
      sessionId
    });
    const failures = [];
    if (!detail.provenance?.rowSetId) failures.push("detail result omitted row-set fingerprint");
    if (detail.provenance?.rowSetId !== exported.provenance?.rowSetId) failures.push("detail and export row-set fingerprints differ");
    if (detail.provenance?.rowCount !== exported.provenance?.rowCount) failures.push("detail and export row counts differ");
    if (!exported.artifact?.content) failures.push("follow-up export omitted CSV content");
    if (failures.length) {
      console.error("FAILED: exact detail/export row contract");
      console.error(failures.map((failure) => `- ${failure}`).join("\n"));
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("FAILED: exact detail/export row contract");
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  }
}

if (!process.exitCode) {
  try {
    const [communities, reportsSummary] = await Promise.all([
      getCommunitiesDashboardData(),
      getReportsSummaryData()
    ]);
    const result = await runCopilotTool({ content: "Portfolio community profile" });
    const trendResult = await runCopilotTool({ content: "Portfolio census trend over time" });
    const cards = new Map((result.visual?.rows ?? []).map((row) => [row.label, Number(row.value)]));
    const censusMonths = [...new Set((communities.census ?? []).map((row) => row.month_bucket).filter(Boolean))].sort();
    const latestCensusMonth = censusMonths.at(-1);
    const priorCensusMonth = censusMonths.at(-2);
    const expectedCensus = (communities.census ?? [])
      .filter((row) => row.month_bucket === latestCensusMonth)
      .reduce((total, row) => total + Number(row.census || 0), 0);
    const expectedPriorCensus = (communities.census ?? [])
      .filter((row) => row.month_bucket === priorCensusMonth)
      .reduce((total, row) => total + Number(row.census || 0), 0);
    const incidentRows = reportsSummary.toolContext?.incidentMonthlyByCommunityCategory ?? communities.incidents ?? [];
    const incidentMonth = [...new Set(incidentRows.map((row) => row.month_bucket).filter(Boolean))].sort().at(-1);
    const expectedIncidents = incidentRows
      .filter((row) => row.month_bucket === incidentMonth)
      .reduce((total, row) => total + Number(row.incident_count || 0), 0);
    const categoryTotals = new Map();
    incidentRows
      .filter((row) => row.month_bucket === incidentMonth)
      .forEach((row) => categoryTotals.set(row.category, (categoryTotals.get(row.category) ?? 0) + Number(row.incident_count || 0)));
    const [expectedTopCategory, expectedTopCategoryCount] = [...categoryTotals.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];
    const latestTrendPoint = trendResult.visual?.rows?.at(-1);
    const failures = [];

    if (cards.get("Active roster") !== communities.residents.length) {
      failures.push(`active roster mismatch: ${cards.get("Active roster")} vs ${communities.residents.length}`);
    }
    if (cards.get("Reporting census") !== expectedCensus) {
      failures.push(`portfolio census mismatch: ${cards.get("Reporting census")} vs ${expectedCensus}`);
    }
    if (cards.get("Census movement") !== expectedCensus - expectedPriorCensus) {
      failures.push(`portfolio census movement mismatch: ${cards.get("Census movement")} vs ${expectedCensus - expectedPriorCensus}`);
    }
    if (cards.get("Incidents") !== expectedIncidents) {
      failures.push(`portfolio incidents mismatch: ${cards.get("Incidents")} vs ${expectedIncidents}`);
    }
    if (expectedTopCategory && !String(result.text ?? "").includes(`${expectedTopCategory} (${expectedTopCategoryCount})`)) {
      failures.push(`portfolio top category fact missing from answer: ${expectedTopCategory} (${expectedTopCategoryCount})`);
    }
    if ((result.visual?.rows?.length ?? 0) > 6) {
      failures.push(`portfolio topline is too dense: ${result.visual.rows.length} rows`);
    }
    if (trendResult.visual?.type !== "line_chart" || Number(latestTrendPoint?.value) !== expectedCensus) {
      failures.push(`portfolio census trend mismatch: ${latestTrendPoint?.value} vs ${expectedCensus}`);
    }

    if (failures.length) {
      console.error("FAILED: portfolio aggregation invariants");
      console.error(failures.map((failure) => `- ${failure}`).join("\n"));
      console.error(JSON.stringify(result, null, 2));
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("FAILED: portfolio aggregation invariants");
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  }
}

if (!process.exitCode) {
  console.log(`copilot tool scope checks passed (${cases.length + 1})`);
}
