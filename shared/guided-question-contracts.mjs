const DEFAULT_TRUTH_STATES = Object.freeze(["valid_rows", "verified_zero"]);

function contract(config) {
  return Object.freeze({
    allowedTruthStates: DEFAULT_TRUTH_STATES,
    allowedVisualTypes: Object.freeze([]),
    requiredColumns: Object.freeze([]),
    requiredAnswerTerms: Object.freeze([]),
    requiresVisual: true,
    requiresArtifact: false,
    maxActions: 3,
    maxModules: 1,
    ...config
  });
}

export const GUIDED_QUESTION_CONTRACTS = Object.freeze({
  "incident-unique-people-count": contract({
    allowedVisualTypes: ["summary_card"],
    requiredAnswerTerms: [["unique resident", "unique client"], ["incident"]]
  }),
  "incident-event-count": contract({
    allowedVisualTypes: ["summary_card"],
    requiredAnswerTerms: [["incident"]]
  }),
  "census-point-count": contract({
    allowedVisualTypes: ["summary_card"],
    requiredAnswerTerms: [["client", "resident", "census", "headcount"]]
  }),
  "community-month-status": contract({
    allowedVisualTypes: ["summary_card", "table"],
    requiredColumns: ["Month", "Census", "Incidents", "Top incident categories", "Medication compliance"],
    requiredAnswerTerms: [["census", "client"], ["incident"], ["medication compliance"]]
  }),
  "incident-freshness-troubleshoot": contract({
    allowedTruthStates: ["valid_rows", "stale"],
    allowedVisualTypes: ["table"],
    requiredColumns: ["Check", "Value", "Scope"],
    requiredAnswerTerms: [["most recent incident detail", "latest incident detail"], ["today", "current"]]
  }),
  "incident-current-snapshot": contract({
    allowedVisualTypes: ["bar_chart", "donut_chart"],
    requiredAnswerTerms: [["incident"], ["largest category", "leading category"]]
  }),
  "incident-detail-list": contract({
    allowedVisualTypes: ["table"],
    requiredColumns: ["Date", "Community", "Resident", "Category", "Description"],
    requiredAnswerTerms: [["incident"]],
    requiresArtifact: true,
    maxActions: 1
  }),
  "incident-row-export": contract({
    allowedVisualTypes: [],
    requiredAnswerTerms: [["CSV"]],
    requiresVisual: false,
    requiresArtifact: true,
    maxActions: 1
  }),
  "generic-detail-list": contract({
    allowedVisualTypes: ["table"],
    requiredAnswerTerms: [["record", "entry", "resident", "medication", "documentation", "census"]],
    requiresArtifact: true,
    maxActions: 1
  }),
  "resident-flow-weekly": contract({
    allowedTruthStates: ["valid_rows", "summary_not_shown"],
    allowedVisualTypes: ["table"],
    requiredColumns: ["Week", "Community", "Intakes", "Discharges", "Net"],
    requiredAnswerTerms: [["admission", "intake"], ["discharge"]]
  }),
  "data-availability": contract({
    allowedVisualTypes: ["table"],
    requiredColumns: ["Dataset", "Level", "Records", "Earliest", "Latest"],
    requiredAnswerTerms: [["historical coverage", "data area", "coverage"]]
  }),
  "module-catalog": contract({
    allowedVisualTypes: ["table"],
    requiredColumns: ["Module", "Family", "Kind", "Scopes", "Capabilities"],
    requiredAnswerTerms: [["module"], ["scope", "capabilit"]]
  }),
  "module-surface": contract({
    allowedVisualTypes: [],
    requiredAnswerTerms: [["opened", "open"]],
    requiresVisual: false,
    maxActions: 1
  }),
  "incident-category-breakdown": contract({
    allowedVisualTypes: ["bar_chart", "donut_chart"],
    requiredAnswerTerms: [["incident"], ["largest category", "leading category"]]
  }),
  "incident-top-category-by-community": contract({
    allowedVisualTypes: ["table"],
    requiredColumns: ["Community", "Top category", "Category incidents", "Total incidents", "Share"],
    requiredAnswerTerms: [["communities"], ["led", "leading", "top category"]]
  }),
  "incident-category-by-community": contract({
    allowedVisualTypes: ["table", "bar_chart"],
    requiredAnswerTerms: [["accounted for"], ["communities"]]
  }),
  "incident-period-comparison": contract({
    allowedVisualTypes: ["comparison_chart", "table"],
    requiredColumns: ["Category", "Delta"],
    requiredAnswerTerms: [["incident"], ["more", "fewer", "up", "down", "unchanged"]]
  }),
  "incident-rate": contract({
    allowedVisualTypes: ["bar_chart"],
    requiredAnswerTerms: [["per 100 resident"], ["highest"]]
  }),
  "incident-rate-change": contract({
    allowedVisualTypes: ["table"],
    requiredColumns: ["Community", "Rate change"],
    requiredAnswerTerms: [["incident-rate change", "incident rate change"], ["rising", "falling", "increased", "decreased"]]
  }),
  "incident-resident-drivers": contract({
    allowedVisualTypes: ["table", "ranked_list"],
    requiredColumns: ["Resident", "Community", "Incidents", "Top category", "Latest incident"],
    requiredAnswerTerms: [["most incident", "tied for the most", "highest"]]
  }),
  "community-time-series": contract({
    allowedVisualTypes: ["multi_line_chart", "heatmap", "table"],
    requiredAnswerTerms: [["increase", "decrease", "high", "low", "unchanged", "reached"]],
    maxModules: 2
  }),
  "census-trend": contract({
    allowedVisualTypes: ["line_chart"],
    requiredAnswerTerms: [["census"], ["increased", "decreased", "more", "fewer", "unchanged", "moved"]]
  }),
  "census-movement": contract({
    allowedVisualTypes: ["bar_chart", "comparison_chart"],
    requiredAnswerTerms: [["census"], ["increased", "decreased", "unchanged"]]
  }),
  "census-drop-history": contract({
    allowedVisualTypes: ["table"],
    requiredColumns: ["Community", "From", "To", "Prior census", "Current census", "Change"],
    requiredAnswerTerms: [["decline", "drop", "down"]]
  }),
  "resident-profile": contract({
    allowedTruthStates: ["valid_rows", "verified_zero"],
    allowedVisualTypes: ["profile_card"],
    requiredAnswerTerms: [["resident", "community", "unit"]]
  }),
  "resident-current-medications": contract({
    allowedTruthStates: ["valid_rows", "verified_zero", "not_loaded"],
    allowedVisualTypes: ["profile_card"],
    requiredAnswerTerms: [["medication", "MAR"], ["resident", "community"]]
  }),
  "resident-change-summary": contract({
    allowedTruthStates: ["valid_rows", "verified_zero", "summary_not_shown"],
    allowedVisualTypes: ["profile_card"],
    requiredAnswerTerms: [["resident", "change", "incident", "profile"]]
  }),
  "resident-incident-history": contract({
    allowedTruthStates: ["valid_rows", "verified_zero"],
    allowedVisualTypes: ["bar_chart", "table"],
    requiredAnswerTerms: [["incident"]]
  }),
  "resident-search": contract({
    allowedTruthStates: ["valid_rows", "verified_zero"],
    allowedVisualTypes: ["table"],
    requiredAnswerTerms: [["resident search", "resident"]]
  }),
  "resident-risk-summary": contract({
    allowedVisualTypes: ["table", "ranked_list"],
    requiredColumns: ["Resident", "Community", "Incidents"],
    requiredAnswerTerms: [["operational review queue"], ["not a clinical risk score"]]
  }),
  "diagnosis-mix": contract({
    allowedVisualTypes: ["table", "bar_chart", "donut_chart"],
    requiredAnswerTerms: [["diagnosis"]]
  }),
  "length-of-stay": contract({
    allowedVisualTypes: ["table", "bar_chart", "donut_chart"],
    requiredAnswerTerms: [["length of stay", "LOS"]]
  }),
  "community-topline": contract({
    allowedVisualTypes: ["summary_card"],
    requiredAnswerTerms: [["census"], ["incident"], ["length of stay", "LOS"]]
  }),
  "community-change-summary": contract({
    allowedVisualTypes: ["summary_card", "table"],
    requiredColumns: ["Month", "Census", "Census change", "Incidents", "Incident change", "Top incident categories", "Medication compliance"],
    requiredAnswerTerms: [["census", "client"], ["incident"], ["medication compliance"]]
  }),
  "community-comparison": contract({
    allowedVisualTypes: ["comparison_chart", "table"],
    requiredColumns: ["Community", "Census", "Incidents", "Rate / 100"],
    requiredAnswerTerms: [["highest"], ["lowest"]]
  }),
  "medication-exception-detail": contract({
    allowedTruthStates: ["valid_rows", "not_loaded"],
    allowedVisualTypes: ["table"],
    requiredAnswerTerms: [["MAR exception", "medication exception"]],
    requiresArtifactWhenValid: true
  }),
  "medication-current-orders": contract({
    allowedTruthStates: ["valid_rows", "not_loaded"],
    allowedVisualTypes: ["table"],
    requiredColumns: ["Resident", "Community", "Medication", "Dose", "Route", "Schedule", "Flags"],
    requiredAnswerTerms: [["current medication order", "active medication order"], ["resident"]],
    requiresArtifactWhenValid: true,
    maxActions: 0
  }),
  "medication-refusal-detail": contract({
    allowedTruthStates: ["valid_rows", "verified_zero", "not_loaded"],
    allowedVisualTypes: ["bar_chart", "table"],
    requiredAnswerTerms: [["refusal"]]
  }),
  "medication-watch": contract({
    allowedTruthStates: ["valid_rows", "not_loaded"],
    allowedVisualTypes: ["table", "ranked_list"],
    requiredAnswerTerms: [["medication watch", "resident-level MAR"]]
  }),
  "medication-profile": contract({
    allowedVisualTypes: ["summary_card", "table"],
    requiredAnswerTerms: [["compliance"], ["scheduled administration"], ["documented as given"]]
  }),
  "medication-compliance": contract({
    allowedVisualTypes: ["table", "bar_chart"],
    requiredAnswerTerms: [["compliance"], ["scheduled administration"], ["documented as given"]]
  }),
  "medication-compliance-history": contract({
    allowedVisualTypes: ["line_chart"],
    requiredAnswerTerms: [
      ["compliance"],
      ["increased", "decreased", "unchanged", "rose", "fell"],
      ["percentage point", "percentage points"]
    ]
  }),
  "data-slice-catalog": contract({
    allowedVisualTypes: ["table"],
    requiredColumns: ["Surface", "Coverage", "Status"],
    requiredAnswerTerms: [["supports", "data bundle"]]
  }),
  "operating-snapshot": contract({
    allowedVisualTypes: ["table", "summary_card"],
    requiredColumns: ["Community", "Census", "Incidents", "Rate / 100", "Census Δ"],
    requiredAnswerTerms: [["census"], ["incident"], ["per 100 resident"]]
  })
});

export function getGuidedQuestionContract(questionId) {
  return GUIDED_QUESTION_CONTRACTS[String(questionId ?? "")] ?? null;
}

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function includesTermGroup(value, terms) {
  const haystack = normalize(value);
  return terms.some((term) => haystack.includes(normalize(term)));
}

function getTruthState(result) {
  return String(result?.truthState ?? result?.trace?.truthState ?? "").trim();
}

function getAnswer(result) {
  return String(result?.structuredAnswer?.answer ?? result?.text ?? "").trim();
}

function requiredColumnsMissing(visual, requiredColumns) {
  const columns = new Set((visual?.columns ?? []).map(normalize));
  return requiredColumns.filter((column) => !columns.has(normalize(column)));
}

function validatePromptSpecificShape({ content, questionId, result }) {
  const failures = [];
  const prompt = normalize(content);
  const visual = result?.visual;
  const columns = new Set((visual?.columns ?? []).map(normalize));

  if (/\bheatmap\b/.test(prompt) && visual?.type !== "heatmap") failures.push("heatmap question did not return a heatmap");
  if (questionId !== "census-drop-history" && /\btrend|over time|time series\b/.test(prompt) && !["line_chart", "multi_line_chart", "heatmap"].includes(visual?.type)) {
    failures.push("trend question did not return a time-series visualization");
  }
  if (/\bweek|weekly|week by week\b/.test(prompt) && visual?.type === "table" && !columns.has("week")) {
    failures.push("weekly question is missing a Week column");
  }
  if (/\bdescription|descriptions|narrative|narratives\b/.test(prompt) && visual?.type === "table" && !columns.has("description")) {
    failures.push("detail question is missing a Description column");
  }
  if (/\bexport|download|csv\b/.test(prompt) && !result?.artifact?.content) {
    failures.push("export question did not return an artifact");
  }
  return failures;
}

export function validateGuidedQuestionResult({ contract: providedContract, questionId, route, content, result }) {
  const resolvedQuestionId = questionId ?? route?.familyId;
  const baseContract = providedContract ?? getGuidedQuestionContract(resolvedQuestionId);
  const contractValue = route?.id === "data-availability:1"
    ? contract({
        allowedTruthStates: ["valid_rows", "stale"],
        allowedVisualTypes: ["table"],
        requiredColumns: ["Check", "Value", "Scope"],
        requiredAnswerTerms: [["most recent incident", "latest incident"], ["today", "current"]]
      })
    : route?.id === "data-availability:3"
        ? contract({
            allowedVisualTypes: ["table"],
            requiredColumns: ["Dataset", "Level", "Records", "Earliest", "Latest"],
            requiredAnswerTerms: [["census"], ["coverage", "available"]]
          })
        : route?.id === "data-availability:4"
          ? contract({
              allowedVisualTypes: ["table"],
              requiredColumns: ["Dataset", "Level", "Records", "Earliest", "Latest"],
              requiredAnswerTerms: [["documentation"], ["coverage", "available", "unavailable"]]
            })
          : baseContract;
  const failures = [];
  if (!contractValue) return { valid: false, failures: ["guided question contract is missing"] };

  const expectedTool = route?.expectedTool;
  const truthState = getTruthState(result);
  const isKnownNoMatch = truthState === "verified_zero" && result?.tool === "data_recovery";
  if (route?.id && result?.certifiedQuestion?.routeId !== route.id) {
    failures.push(`expected route ${route.id}, received ${result?.certifiedQuestion?.routeId ?? "no route"}`);
  }
  if (route?.familyId && result?.certifiedQuestion?.id !== route.familyId) {
    failures.push(`expected family ${route.familyId}, received ${result?.certifiedQuestion?.id ?? "no family"}`);
  }
  if (expectedTool && result?.tool !== expectedTool && !isKnownNoMatch) {
    failures.push(`expected ${expectedTool}, received ${result?.tool ?? "no tool"}`);
  }
  if (!contractValue.allowedTruthStates.includes(truthState)) {
    failures.push(`truth state ${truthState || "missing"} is not allowed`);
  }

  const surfaceRoute = expectedTool === "surface_module";
  const answer = getAnswer(result);
  const answerWordCount = answer.split(/\s+/).filter(Boolean).length;
  if (!answer) failures.push("answer is missing");
  if (!surfaceRoute && truthState === "valid_rows" && answerWordCount < 7) failures.push("answer is too thin");
  if (answerWordCount > 110) failures.push("answer is too long");
  const answerTerms = surfaceRoute
    ? [["open", "opened", "resident search"]]
    : truthState === "not_loaded"
      ? contractValue.requiredAnswerTerms.slice(0, 1)
      : contractValue.requiredAnswerTerms;
  for (const terms of answerTerms) {
    if (!includesTermGroup(answer, terms)) failures.push(`answer is missing one of: ${terms.join(", ")}`);
  }

  if (surfaceRoute) {
    if (!(result?.actions ?? []).some((action) => action.kind === "route" && action.route)) {
      failures.push("surface question is missing its route action");
    }
  } else if (contractValue.requiresVisual && truthState === "valid_rows" && !result?.visual) {
    failures.push("required visualization is missing");
  }

  if (result?.visual && contractValue.allowedVisualTypes.length && !contractValue.allowedVisualTypes.includes(result.visual.type)) {
    failures.push(`visual type ${result.visual.type} is not allowed`);
  }
  if (truthState === "valid_rows" && result?.visual && contractValue.requiredColumns.length) {
    const missingColumns = requiredColumnsMissing(result.visual, contractValue.requiredColumns);
    if (missingColumns.length) failures.push(`visual is missing columns: ${missingColumns.join(", ")}`);
  }

  const requiresArtifact = contractValue.requiresArtifact || (contractValue.requiresArtifactWhenValid && truthState === "valid_rows");
  if (requiresArtifact && !result?.artifact?.content) failures.push("required artifact is missing");
  if ((result?.actions ?? []).length > contractValue.maxActions) failures.push("too many actions");
  if ((result?.moduleSpecs ?? []).length > contractValue.maxModules) failures.push("too many modules");
  failures.push(...validatePromptSpecificShape({ content, questionId: resolvedQuestionId, result }));

  return {
    valid: failures.length === 0,
    failures
  };
}
