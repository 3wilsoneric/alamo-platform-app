import {
  ANALYSIS_SLICE_CATALOG,
  ANALYSIS_SLICE_CATALOG_VERSION,
  rankAnalysisSlicesForQuery
} from "../shared/analysis-slice-catalog.mjs";
import {
  compileCopilotIntent,
  runCopilotTool
} from "../server/copilot-tools.mjs";

function assert(condition, message, context = null) {
  if (condition) return;
  console.error(`FAILED: ${message}`);
  if (context) console.error(JSON.stringify(context, null, 2));
  process.exit(1);
}

function sessionKey(prefix, prompt) {
  return `${prefix}-${Buffer.from(prompt).toString("hex").slice(0, 32)}`;
}

assert(ANALYSIS_SLICE_CATALOG_VERSION === "slice-catalog-v1", "unexpected catalog version");
assert(ANALYSIS_SLICE_CATALOG.length >= 11, "slice catalog is missing expected core slices", ANALYSIS_SLICE_CATALOG);

for (const slice of ANALYSIS_SLICE_CATALOG) {
  assert(slice.id && slice.title && slice.domain && slice.grain, "slice is missing identity metadata", slice);
  assert(Array.isArray(slice.metrics) && slice.metrics.length, "slice is missing metrics", slice);
  assert(Array.isArray(slice.modes) && slice.modes.length, "slice is missing modes", slice);
  assert(Array.isArray(slice.dimensions) && slice.dimensions.length, "slice is missing dimensions", slice);
  assert(Array.isArray(slice.fields) && slice.fields.length, "slice is missing fields", slice);
  assert(slice.defaultGrouping, "slice is missing default grouping", slice);
}

const rankCases = [
  ["slice incidents by community and category for May 2026", "incident_monthly_by_community_category"],
  ["pivot San Pablo incidents by category for June 2026", "incident_monthly_by_community_category"],
  ["group census by month for San Pablo from March through June 2026", "census_monthly_by_community"],
  ["slice medication compliance by community for June 2026", "medication_compliance_monthly"],
  ["list MAR exception rows by resident", "mar_exception_detail_90d"],
  ["slice documentation gaps by resident", "documentation_status"],
  ["group resident incidents by resident", "resident_incident_summary"],
  ["slice resident medication summary by resident", "mar_resident_summary"],
  ["custom view community operating snapshot by community", "community_operating_summary"],
  ["show census data quality by community", "census_data_quality"],
  ["show resident countability audit", "resident_countability_audit"],
  ["show fake or non-countable residents in the census audit", "resident_countability_audit"],
  ["show weekly census by community", "census_weekly_by_community"],
  ["show monthly intake and discharge by community", "resident_flow_monthly_by_community"]
];

for (const [prompt, expectedSlice] of rankCases) {
  const ranked = rankAnalysisSlicesForQuery(prompt);
  assert(ranked[0]?.slice?.id === expectedSlice, "catalog ranked the wrong slice", {
    prompt,
    expectedSlice,
    ranked: ranked.slice(0, 3).map((candidate) => ({
      id: candidate.slice.id,
      score: candidate.score,
      confidence: candidate.confidence
    }))
  });
}

const routeCases = [
  {
    prompt: "slice San Pablo incidents by category for May 2026",
    expectedColumn: "Category",
    expectedPeriod: "2026-05"
  },
  {
    prompt: "pivot portfolio incidents by community and category for June 2026",
    expectedColumn: "Community",
    expectedPeriod: "2026-06"
  },
  {
    prompt: "group census by month for San Pablo from March through June 2026",
    expectedColumn: "Month",
    expectedPeriod: "2026-06",
    expectedFirstCell: "March 2026"
  },
  {
    prompt: "show census by community from January through June 2026",
    expectedColumn: "Month",
    expectedPeriod: "2026-06",
    expectedFirstCell: "January 2026"
  },
  {
    prompt: "slice medication compliance by community for June 2026",
    expectedColumn: "Community",
    expectedPeriod: "2026-06"
  },
  {
    prompt: "slice incident detail rows by resident for June 2026",
    expectedColumn: "Resident",
    expectedPeriod: "2026-06",
    expectedArtifact: true
  },
  {
    prompt: "slice documentation gaps by resident",
    expectedColumn: "Resident"
  },
  {
    prompt: "group resident incidents by resident",
    expectedColumn: "Resident"
  },
  {
    prompt: "slice resident medication summary by resident",
    expectedColumn: "Resident"
  },
  {
    prompt: "show census data quality by community",
    expectedColumn: "Community",
    allowNotLoaded: true
  },
  {
    prompt: "show resident countability audit",
    expectedColumn: "Resident",
    allowNotLoaded: true
  },
  {
    prompt: "show fake or non-countable residents in the census audit",
    expectedColumn: "Resident",
    allowNotLoaded: true
  },
  {
    prompt: "show weekly census by community",
    expectedColumn: "Week",
    allowNotLoaded: true
  },
  {
    prompt: "show monthly intake and discharge by community",
    expectedColumn: "Month",
    allowNotLoaded: true
  }
];

for (const routeCase of routeCases) {
  const intent = await compileCopilotIntent({ content: routeCase.prompt, sessionId: sessionKey("slice-catalog", routeCase.prompt) });
  assert(intent.executionPlan?.tool === "slice_discovery", "custom slice prompt did not route to slice_discovery", {
    prompt: routeCase.prompt,
    tool: intent.executionPlan?.tool,
    intent
  });

  const result = await runCopilotTool({ content: routeCase.prompt, sessionId: sessionKey("slice-catalog-run", routeCase.prompt) });
  assert(result.handled && result.tool === "slice_discovery", "slice_discovery did not handle routed prompt", {
    prompt: routeCase.prompt,
    result
  });
  if (routeCase.allowNotLoaded && result.truthState === "not_loaded") continue;
  assert(result.planValidation?.valid !== false, "slice_discovery failed plan validation", {
    prompt: routeCase.prompt,
    errors: result.planValidation?.errors,
    result
  });
  assert(result.visual?.columns?.includes(routeCase.expectedColumn), "slice_discovery visual is missing expected grouping column", {
    prompt: routeCase.prompt,
    expectedColumn: routeCase.expectedColumn,
    columns: result.visual?.columns,
    result
  });
  if (routeCase.expectedFirstCell) {
    assert(result.visual?.rows?.[0]?.cells?.[0] === routeCase.expectedFirstCell, "slice_discovery visual is not ordered by requested census period", {
      prompt: routeCase.prompt,
      expectedFirstCell: routeCase.expectedFirstCell,
      firstRow: result.visual?.rows?.[0],
      result
    });
  }
  if (routeCase.expectedPeriod) {
    assert(String(result.trace?.period ?? result.text).includes(routeCase.expectedPeriod), "slice_discovery result is missing expected period", {
      prompt: routeCase.prompt,
      expectedPeriod: routeCase.expectedPeriod,
      trace: result.trace,
      text: result.text
    });
  }
  if (routeCase.expectedArtifact) {
    assert(result.artifact?.type === "csv" && result.artifact.content && result.provenance?.rowSetId === result.artifact.rowSetId, "detail slice did not preserve a CSV row artifact", {
      prompt: routeCase.prompt,
      artifact: result.artifact,
      provenance: result.provenance,
      runtimeSchema: result.runtimeSchema
    });
  }
}

const nonHijackCases = [
  ["how many people went AWOL in May 2026", "incident_breakdown"],
  ["show santa clarita census trend", "census_trend"],
  ["show Shannon Romero resident profile", "resident_lookup"]
];

for (const [prompt, expectedTool] of nonHijackCases) {
  const intent = await compileCopilotIntent({ content: prompt, sessionId: `slice-non-hijack-${expectedTool}` });
  assert(intent.executionPlan?.tool === expectedTool, "slice discovery hijacked a known path", {
    prompt,
    expectedTool,
    actualTool: intent.executionPlan?.tool,
    intent
  });
}

console.log(`analysis slice catalog checks passed (${ANALYSIS_SLICE_CATALOG.length} slices, ${routeCases.length} live routes)`);
