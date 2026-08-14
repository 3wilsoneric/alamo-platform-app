#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  CERTIFIED_ANALYST_QUESTIONS,
  getCertifiedQuestionRoutes
} from "../shared/certified-analyst-questions.mjs";
import { validateGuidedQuestionResult } from "../shared/guided-question-contracts.mjs";
import { runCopilotTool } from "../server/copilot-tools.mjs";
import { findUserFacingDateContractViolations } from "./analyst-display-contract.mjs";

// This audit must exercise the current tool and renderer contracts. Cache
// validation has its own suite and must not mask newly introduced regressions.
process.env.CERTIFIED_ANSWER_CACHE_ENABLED = "false";

const NON_REPORT_TOOLS = new Set([
  "clarification",
  "data_recovery",
  "export_csv",
  "module_catalog",
  "surface_module"
]);

const BANNED_REPORT_PATTERNS = [
  /\nKey facts\n/i,
  /\nRows checked\n/i,
  /\nDefinition\n/i,
  /\bSource:\s*local data tool\b/i,
  /\bis open\b/i,
  /\bI don['’]t have that exact slice loaded\b/i,
  /\bverified fallback\b/i,
  /\bMissing period:/i,
  /\bavailable snapshot\b/i,
  /\bsnapshot\b/i,
  /\bsource views\b/i,
  /\bdisplayed\b/i,
  /\bexact records\b/i,
  /\bcurrent-state data\b/i,
  /\bCoverage diagnostics; no replacement query has run\b/i,
  /\blargest row in this slice\b/i,
  /\bclearest row\b/i,
  /\brow set\b/i,
  /\brows?\b/i,
  /\bchat module\b/i,
  /\bpreview shown\b/i,
  /\bThe (?:module|table|chart|card|list) (?:shows|opens|previews|compares)\b/i,
  /\b(?:listed|shown|provided) below\b/i,
  /\battached\b/i,
  /\bgoverned\b/i,
  /\blegacy\b/i,
  /\bloaded\b/i,
  /\bfield manifest\b/i,
  /\bleader count\b/i,
  /\bPeriod was\b/i,
  /\b(?:likely|probably|appears to|suggests that|may indicate|might indicate)\b/i,
  /;/,
  /T00:00:00\.000Z/
];

const BANNED_ACTION_LABEL_PATTERNS = [
  /\bBuild report\b/i,
  /\bOpen full .*search\b/i,
  /\bOpen full .*explorer\b/i,
  /\bData explorer\b/i
];

const BANNED_VISUAL_COPY_PATTERNS = [
  /\brows?\b/i,
  /\bgrain\b/i,
  /\bloaded\b/i,
  /\bgoverned\b/i,
  /\blegacy\b/i,
  /\bfield manifest\b/i,
  /\bverified zero\b/i,
  /\bfrom detail incident\b/i
];

const BANNED_PROSE_PATTERNS = [
  /\b(?:had|was|were)\s+(?:census|incidents?|top categories|medication compliance|incident detail|resident roster|active roster)\s+(?:is|are|was|were|rose|fell|has|had)\b/i,
  /\bsaw census (?:increased|decreased)\b/i,
  /\b(?:moved|move|movement)\s+(?:at\s+)?[+-]\d/i,
  /\.\s+[a-z]/,
  /\b(?:profile|topline):\s*[^.!?]{1,100}[.!?]\s+\d[\d,.]*%?\b/i,
  /\b(?:table|module|catalog) below\b/i,
  /\bThe (?:module|table|chart|card|list) (?:shows|opens|previews|compares)\b/i,
  /\b(?:listed|shown|provided) below\b/i,
  /\battached\b/i,
  /\bgoverned\b/i,
  /\blegacy\b/i,
  /\bloaded\b/i,
  /\bfield manifest\b/i,
  /\bleader count\b/i,
  /\bPeriod was\b/i,
  /\b(?:likely|probably|appears to|suggests that|may indicate|might indicate)\b/i
];

const PERIOD_LABELS = new Map([
  ["January 2026", "2026-01"],
  ["February 2026", "2026-02"],
  ["March 2026", "2026-03"],
  ["April 2026", "2026-04"],
  ["May 2026", "2026-05"],
  ["June 2026", "2026-06"],
  ["July 2026", "2026-07"]
]);

const SCORE_WEIGHTS = Object.freeze({
  routing: 15,
  scope: 15,
  truth: 15,
  answer: 20,
  evidence: 10,
  surface: 15,
  interaction: 5,
  prose: 5
});

const LATEST_LOADED_FAMILIES = new Set([
  "census-movement",
  "community-topline",
  "incident-current-snapshot",
  "medication-compliance",
  "medication-profile",
  "operating-snapshot"
]);

const POPULAR_ROUTE_DEPTH_REQUIREMENTS = Object.freeze({
  "community-month-status:0": { minWords: 40, minVisualRows: 4 },
  "operating-snapshot:0": { minWords: 32, minVisualRows: 5 },
  "census-point-count:0": { minWords: 9, minVisualRows: 1 },
  "census-trend:0": { minWords: 35, minVisualRows: 6 },
  "community-change-summary:0": { minWords: 38, minVisualRows: 4 },
  "community-comparison:0": { minWords: 35, minVisualRows: 5 },
  "incident-current-snapshot:0": { minWords: 30, minVisualRows: 5 },
  "incident-category-breakdown:0": { minWords: 30, minVisualRows: 5 },
  "resident-search:0": { minWords: 12, minVisualRows: 0 },
  "medication-profile:0": { minWords: 28, minVisualRows: 3 }
});

const NON_NUMERIC_ANSWER_TOOLS = new Set([
  "data_recovery",
  "module_catalog",
  "surface_module",
  "tool_context_catalog"
]);

function renderPromptVariables(prompt) {
  return String(prompt ?? "")
    .replace(/\{community\}/g, "San Pablo")
    .replace(/\{resident\}/g, "Shannon Romero")
    .replace(/\{incidentCategory\}/g, "AWOL/Elopement")
    .replace(/\{month\}/g, "May 2026")
    .replace(/\{startMonth\}/g, "May 2026")
    .replace(/\{endMonth\}/g, "June 2026")
    .replace(/\{medicationDetail\}/g, "medication refusal detail");
}

function catalogPrompts() {
  const questionIndexById = new Map(CERTIFIED_ANALYST_QUESTIONS.map((question, index) => [question.id, index]));
  return getCertifiedQuestionRoutes().map((route) => ({
    id: route.familyId,
    routeId: route.id,
    questionIndex: questionIndexById.get(route.familyId) ?? -1,
    title: route.question.title,
    preferredTool: route.question.preferredTool,
    answerStyle: route.question.answerStyle,
    variables: route.question.variables ?? [],
    prompt: route.prompt,
    runPrompt: renderPromptVariables(route.runPrompt),
    expectedTool: route.expectedTool,
    index: route.variantIndex
  }));
}

function hasExplicitMonth(value) {
  return /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+20\d{2})?\b|\b20\d{2}-\d{2}\b/i.test(String(value ?? ""));
}

function classifyFailure(failure) {
  const value = String(failure ?? "").toLowerCase();
  if (/expected .* received|tool|plan_rejected|safe-refusal|schema/.test(value)) return "routing";
  if (/community scope|period-scoped|missing (?:jan|feb|mar|apr|may|jun|jul)|requested period|latest loaded/.test(value)) return "scope";
  if (/not_loaded|truth|verified zero|stale|unavailable|cannot verify|current-only|boundary/.test(value)) return "truth";
  if (/visual|module|artifact|csv|surface|column|preview|provenance/.test(value)) return "surface";
  if (/action/.test(value)) return "interaction";
  if (/choppy|awkward|wording|prose|sentence|repeats|heading fragment|symbolic delta|banned report/.test(value)) return "prose";
  if (/numerator|denominator|leading|comparison breadth|runner-up|category context|movement|identity fields|evidence|incident count|exact-row/.test(value)) return "evidence";
  return "answer";
}

function enrichFailure(failure) {
  return {
    ...failure,
    dimension: failure.dimension ?? classifyFailure(failure.failure),
    severity: failure.severity ?? "blocking"
  };
}

function scoreDimensions(issues) {
  const failedDimensions = new Set(issues.map((issue) => issue.dimension));
  const dimensions = Object.fromEntries(
    Object.entries(SCORE_WEIGHTS).map(([dimension, weight]) => [dimension, failedDimensions.has(dimension) ? 0 : weight])
  );
  return {
    dimensions,
    score: Object.values(dimensions).reduce((total, value) => total + value, 0)
  };
}

function shouldUseReportShape(result) {
  if (!result?.handled) return false;
  if (result.safeRefusal) return false;
  if (NON_REPORT_TOOLS.has(result.tool)) return false;
  return true;
}

function hasUsefulSurface(result) {
  return Boolean(
    result?.visual ||
    result?.moduleSpec ||
    (Array.isArray(result?.moduleSpecs) && result.moduleSpecs.length) ||
    result?.artifact
  );
}

function validateVisualCopy(result) {
  const failures = [];
  const candidates = [
    result?.visual,
    result?.moduleSpec?.visual,
    ...(result?.moduleSpecs ?? []).map((moduleSpec) => moduleSpec?.visual)
  ].filter(Boolean);
  const checked = new Set();

  for (const visual of candidates) {
    const copy = [visual.title, visual.subtitle, visual.valueLabel, ...(visual.columns ?? [])]
      .filter(Boolean)
      .join(" | ");
    if (!copy || checked.has(copy)) continue;
    checked.add(copy);
    for (const pattern of BANNED_VISUAL_COPY_PATTERNS) {
      if (pattern.test(copy)) failures.push(`visual copy matched product jargon ${pattern}: ${JSON.stringify(copy)}`);
    }
  }

  return failures;
}

function includesAny(haystack, needles) {
  const value = String(haystack ?? "").toLowerCase();
  return needles.some((needle) => value.includes(String(needle).toLowerCase()));
}

function getResultHaystack(result) {
  return [
    result?.text,
    result?.trace?.period,
    result?.trace?.communityName,
    result?.visual?.title,
    result?.visual?.subtitle,
    ...(result?.visual?.columns ?? []),
    ...(result?.visual?.rows ?? []).flatMap((row) => [
      row.label,
      row.meta,
      ...(row.cells ?? [])
    ])
  ].filter(Boolean).join(" ");
}

function getExpectedPeriods(entry) {
  const values = [...String(entry.runPrompt ?? "").matchAll(/\b(January|February|March|April|May|June|July) 2026\b/g)]
    .map((match) => `${match[1]} 2026`);
  return [...new Set(values)].map((label) => ({
    label,
    bucket: PERIOD_LABELS.get(label)
  })).filter((period) => period.bucket);
}

function expectsCommunityScope(entry) {
  return (entry.variables ?? []).some((variable) => variable.id === "community") &&
    /\b(San Pablo|A & A Health Services San Pablo)\b/i.test(entry.runPrompt);
}

function hasCommunityScope(result) {
  return includesAny(getResultHaystack(result), ["San Pablo", "A & A Health Services San Pablo"]);
}

function hasPeriodCoverage(result, period) {
  const haystack = getResultHaystack(result);
  return includesAny(haystack, [period.label, period.bucket]);
}

function hasVisualColumn(result, columnName) {
  return (result?.visual?.columns ?? []).some((column) => String(column).toLowerCase() === columnName.toLowerCase());
}

function getTruthState(result) {
  return String(result?.truthState ?? result?.trace?.truthState ?? "").trim();
}

function answerCoverageTokens(value) {
  const matches = String(value ?? "").toLowerCase().match(
    /\d[\d,.]*%?|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|census|incidents?|medications?|compliance|refusals?|awol|elopement|substance|categories?|residents?|clients?|roster|diagnoses?|age|length of stay|los|scheduled|not given)\b/g
  ) ?? [];
  return [...new Set(matches.map((token) => token.replace(/\.$/, "")))];
}

function isFactCoveredByAnswer(fact, answer) {
  const factTokens = answerCoverageTokens(fact);
  const numericTokens = factTokens.filter((token) => /\d/.test(token));
  if (factTokens.length < 2 || numericTokens.length < 1) return false;
  const answerTokens = new Set(answerCoverageTokens(answer));
  const covered = factTokens.filter((token) => answerTokens.has(token)).length;
  return covered / factTokens.length >= 0.8;
}

function validateProseQuality(result) {
  const failures = [];
  const text = String(result?.text ?? "");
  const answer = String(result?.structuredAnswer?.answer ?? "") || text
    .split("\n")
    .map((line) => line.trim())
    .find((line, index) => index > 0 && !/^[-*]\s+/.test(line)) || "";
  const sentences = answer
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const sentenceWordCounts = sentences.map((sentence) => sentence.split(/\s+/).filter(Boolean).length);
  const averageSentenceWords = sentenceWordCounts.length
    ? sentenceWordCounts.reduce((total, count) => total + count, 0) / sentenceWordCounts.length
    : 0;

  if (sentences.length >= 4 && averageSentenceWords < 10) {
    failures.push(`answer is choppy (${sentences.length} sentences averaging ${averageSentenceWords.toFixed(1)} words)`);
  }
  if (sentenceWordCounts.some((count) => count > 30)) {
    failures.push(`answer contains an overlong sentence (${Math.max(...sentenceWordCounts)} words)`);
  }
  const answerWordCount = answer.split(/\s+/).filter(Boolean).length;
  if (answerWordCount > 64) {
    failures.push(`lead answer is too long for an executive read (${answerWordCount} words)`);
  }
  if (/\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(?:\d{1,2}\s+)?20\d{2}\b/.test(answer)) {
    failures.push("answer prose abbreviates a calendar month");
  }
  if (sentences.slice(1).some((sentence) => /^[\d,]+(?:\.\d+)?\b/.test(sentence))) {
    failures.push("follow-up sentence starts with an unexplained number");
  }

  for (const pattern of BANNED_PROSE_PATTERNS) {
    if (pattern.test(answer)) failures.push(`answer matched awkward prose ${pattern}`);
  }

  for (const fact of result?.structuredAnswer?.facts ?? []) {
    const factSentences = String(fact)
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    const factSentenceWordCounts = factSentences.map((sentence) => sentence.split(/\s+/).filter(Boolean).length);
    if (factSentenceWordCounts.some((count) => count > 30)) {
      failures.push(`supporting fact contains an overlong sentence (${Math.max(...factSentenceWordCounts)} words)`);
    }
    if (factSentences.length >= 3 && factSentenceWordCounts.reduce((total, count) => total + count, 0) / factSentences.length < 7) {
      failures.push(`supporting fact is choppy: ${JSON.stringify(fact)}`);
    }
    if (isFactCoveredByAnswer(fact, answer)) {
      failures.push(`supporting fact repeats the lead answer: ${JSON.stringify(fact)}`);
    }
  }

  return failures;
}

function isKnownResidentProfilePrompt(entry) {
  return /\b(Shannon Romero|Tuesday Woo)\b/i.test(entry.runPrompt) &&
    !/\b(module|resident search)\b/i.test(entry.runPrompt);
}

function isResidentSearchSurfacePrompt(entry) {
  return entry.id === "resident-profile" && /\bResident Search module\b/i.test(entry.runPrompt);
}

function isExpectedUnknownResidentRecovery(entry, result) {
  return entry.id === "resident-profile" &&
    /\bJohn Smith\b/i.test(entry.runPrompt) &&
    result?.tool === "data_recovery" &&
    getTruthState(result) === "verified_zero" &&
    /\bresident\b.*\bnot\b.*\bfound\b|\bcould not verify\b|\bno verified exact match\b/i.test(String(result?.text ?? ""));
}

function isAllowedUnavailable(entry, result) {
  const truthState = getTruthState(result);
  if (truthState !== "not_loaded") return false;
  if (!["medication-current-orders", "medication-exception-detail", "medication-watch"].includes(entry.id)) return false;
  return /\b(?:MAR|resident-level|medication orders?)\b/i.test(String(result?.text ?? "")) &&
    /\b(?:not loaded|unavailable|not published)\b/i.test(String(result?.text ?? "")) &&
    hasUsefulSurface(result);
}

function validateFamilyContract(entry, result) {
  const failures = [];
  const text = String(result?.text ?? "");
  const answer = String(result?.structuredAnswer?.answer ?? text);
  const haystack = getResultHaystack(result);
  const allowedUnavailable = isAllowedUnavailable(entry, result);
  const allowedResidentRecovery = isExpectedUnknownResidentRecovery(entry, result);

  if (result?.tool !== entry.expectedTool && !allowedResidentRecovery) {
    failures.push(`expected ${entry.expectedTool}, received ${result?.tool ?? "no tool"}`);
  }

  if (/^community-(month-status|change-summary)$/.test(entry.id)) {
    if (!/\bclients?\b|\bcensus\b/i.test(answer)) failures.push("community operating answer missing census/client read");
    if (!/\bincidents?\b/i.test(answer)) failures.push("community operating answer missing incident read");
    if (!/\btop incident categor/i.test(answer) && !hasVisualColumn(result, "Top incident categories")) {
      failures.push("community operating answer missing category context");
    }
    if (!/\bmedication compliance\b/i.test(answer) && !hasVisualColumn(result, "Medication compliance")) {
      failures.push("community operating answer missing medication context");
    }
  }

  if (entry.id === "community-topline" && !/\bcurrent\b/i.test(`${entry.runPrompt} ${entry.title}`)) {
    failures.push("community profile question is not explicitly current-state");
  }

  if (entry.id === "incident-detail-list" && !result?.artifact?.content) {
    failures.push("exact incident detail question missing full CSV artifact");
  }
  if (entry.id === "incident-detail-list" && /\b(who|resident|residents|client|clients|people|person|involved|names?)\b/i.test(entry.runPrompt)) {
    if (!/\b\d[\d,]* (?:unique )?residents were involved\b/i.test(answer)) {
      failures.push("people-focused incident detail answer does not lead with the unique resident count");
    }
    if (!/\bCSV includes all [\d,]+ exact matches\b/i.test(String(result?.structuredAnswer?.definition ?? ""))) {
      failures.push("people-focused incident detail answer does not preserve the complete CSV evidence boundary");
    }
  }
  if (entry.id === "incident-detail-list" && /\b(description|descriptions|narrative|narratives)\b/i.test(entry.runPrompt) && !hasVisualColumn(result, "Description")) {
    failures.push("description-focused incident detail answer does not expose description evidence");
  }

  if (entry.id === "incident-row-export" && !result?.artifact?.content) {
    failures.push("export question missing CSV artifact");
  }

  if (isResidentSearchSurfacePrompt(entry) && !/\bresident search\b/i.test(haystack)) {
    failures.push("resident profile surface prompt missing resident-search module context");
  }

  if (isExpectedUnknownResidentRecovery(entry, result)) {
    return failures;
  }

  if (entry.id === "resident-profile" && isKnownResidentProfilePrompt(entry) && !includesAny(haystack, ["Shannon Romero", "Tuesday Woo", "Resident #"])) {
    failures.push("resident profile answer missing identity fields");
  }

  if (entry.id === "resident-search" && !/\bresident search\b/i.test(haystack)) {
    failures.push("resident search answer missing resident-search module context");
  }

  if (entry.id === "incident-freshness-troubleshoot" && !/\blatest\b/i.test(haystack)) {
    failures.push("freshness answer missing latest loaded data signal");
  }

  if (entry.id === "data-availability" && /\bhow current is (?:the )?data\b/i.test(entry.runPrompt)) {
    if (!/\bincident detail\b/i.test(answer) || !/\bcensus\b/i.test(answer) || !/\bmedication compliance\b/i.test(answer)) {
      failures.push("broad freshness answer does not summarize incident, census, and medication coverage");
    }
    if (!/\bcurrent[- ]only\b/i.test(answer) || !/\b(?:not populated|not available|unavailable)\b/i.test(answer)) {
      failures.push("broad freshness answer omits current-only or unavailable-data boundaries");
    }
  }

  if (entry.id === "medication-profile" && !/\bcompliance\b/i.test(haystack)) {
    failures.push("medication profile missing compliance context");
  }
  if (entry.id === "medication-profile" && result?.summary?.refusalCoverage === "legacy_cumulative") {
    const visibleAnswer = `${answer} ${(result?.structuredAnswer?.facts ?? []).join(" ")}`;
    if (!/\bmonthly refusal counts? (?:are|is) not available\b/i.test(visibleAnswer)) {
      failures.push("medication profile does not identify the unavailable monthly refusal measure");
    }
    if (/\b(?:separate cumulative|cumulative summary reports|legacy)\b/i.test(answer)) {
      failures.push("medication profile leads with a cumulative refusal caveat instead of the monthly compliance read");
    }
  }

  if (entry.id === "medication-compliance" && !/\bwere documented as given\b/i.test(answer)) {
    failures.push("medication compliance answer omits the documented-given numerator");
  }

  if (entry.id === "medication-refusal-detail" && !String(result?.trace?.period ?? "").trim()) {
    if (!/\bcumulative refusal totals\b/i.test(answer) || !/\bno monthly period\b/i.test(answer)) {
      failures.push("legacy refusal answer does not state its cumulative, non-monthly boundary");
    }
    if (!/\brefusal summary includes [\d,]+ cumulative refusals\b/i.test(answer) || !/\b\d+\.\d%/.test(answer)) {
      failures.push("refusal answer omits the total denominator or leading share");
    }
  }

  if (entry.id === "medication-exception-detail" && !allowedUnavailable && !result?.artifact?.content) {
    failures.push("medication exception detail missing exact-row artifact");
  }

  if (entry.id === "resident-risk-summary") {
    if (!/\boperational review queue\b/i.test(answer) || !/\bnot a clinical risk score\b/i.test(answer)) {
      failures.push("resident attention answer is missing its non-clinical decision boundary");
    }
    if (!/\bAcross\b.+\bthrough\b/i.test(answer)) {
      failures.push("resident attention answer is missing the loaded incident-history window");
    }
  }

  if (entry.id === "incident-category-by-community") {
    if (!/\baccounted for [\d,]+ of [\d,]+\b/i.test(answer) || !/\bcomparison covers all [\d,]+ communities\b/i.test(answer)) {
      failures.push("category-by-community answer omits denominator or comparison breadth");
    }
    if (!/\bnext at\b/i.test(answer)) {
      failures.push("category-by-community answer omits the runner-up comparison");
    }
  }

  if (entry.id === "community-time-series" && /\bcensus\b/i.test(entry.runPrompt) && /\bincidents?\b/i.test(entry.runPrompt)) {
    const moduleTitles = (result?.moduleSpecs ?? []).map((moduleSpec) => String(moduleSpec?.title ?? ""));
    if (!/\bportfolio census (?:increased|decreased|held steady)\b/i.test(answer) || !/\bincidents (?:increased|decreased|held steady)\b/i.test(answer)) {
      failures.push("dual-metric trend answer does not interpret both census and incident movement");
    }
    if (moduleTitles.length !== 2 || !moduleTitles.some((title) => /\bcensus\b/i.test(title)) || !moduleTitles.some((title) => /\bincidents?\b/i.test(title))) {
      failures.push(`dual-metric trend did not return exactly two metric-specific modules (${moduleTitles.join(", ") || "none"})`);
    }
  }

  return failures;
}

function validateDecisionQuality(entry, result) {
  const failures = [];
  const answer = String(result?.structuredAnswer?.answer ?? result?.text ?? "");
  const wordTotal = answer.split(/\s+/).filter(Boolean).length;

  const expectsNarrativeDepth = /\b(profile|operating|comparison|trend|movement|history|availability|summary)\b/i.test(entry.answerStyle) &&
    !["resident-incident-history"].includes(entry.id);
  if (shouldUseReportShape(result) && expectsNarrativeDepth && wordTotal < 9) {
    failures.push(`answer is too thin for an end user (${wordTotal} words)`);
  }

  if (/\b(compare|comparison|change|delta|movement)\b/i.test(`${entry.answerStyle} ${entry.runPrompt}`) &&
      !/\b(up|down|increase|increased|decrease|decreased|more|fewer|unchanged|from|to|versus|vs|gap|range|highest|lowest|larger|smaller)\b/i.test(answer)) {
    failures.push("comparison answer does not state direction or magnitude");
  }

  if (/\b(trend|movement|history|drop)\b/i.test(entry.answerStyle) && entry.id !== "resident-incident-history" && result?.tool !== "surface_module" &&
      !/\b(latest|from|to|up|down|increase|decrease|high|low|decline|movement|unchanged|more|fewer)\b/i.test(answer)) {
    failures.push("trend answer does not interpret the displayed movement");
  }

  if (["incident-rate", "incident-rate-change"].includes(entry.id) && /\d+\.\d{2,}\s+incidents per 100/i.test(answer)) {
    failures.push("rate answer exposes excessive decimal precision");
  }

  if (["incident-category-breakdown", "incident-current-snapshot", "incident-top-category-by-community", "diagnosis-mix"].includes(entry.id) &&
      !/\b(top|largest|leading|highest|most common)\b/i.test(answer)) {
    failures.push("composition answer does not identify the leading result");
  }

  if (/\b(?:calculation|category changes|top categories|drops found|largest community moves)\s*[:.]?$/im.test(String(result?.text ?? ""))) {
    failures.push("rendered answer contains a heading fragment");
  }

  if (/\b(?:was|were|is|are)\s+[+-]\d/.test(answer)) {
    failures.push("answer uses a symbolic delta as a sentence predicate");
  }

  return failures;
}

function validatePerQuestionExperience(entry, result) {
  const failures = [];
  const answer = String(result?.structuredAnswer?.answer ?? result?.text ?? "").trim();
  const truthState = getTruthState(result);
  const wordTotal = answer.split(/\s+/).filter(Boolean).length;
  const actions = result?.actions ?? [];
  const actionLabels = actions.map((action) => String(action?.label ?? "").trim()).filter(Boolean);
  const popularRouteRequirement = POPULAR_ROUTE_DEPTH_REQUIREMENTS[entry.routeId];
  const hasRegisteredSurfaceLauncher = result?.tool === "surface_module" &&
    actions.some((action) => action?.kind === "route" && String(action?.route ?? "").startsWith("/"));

  if (popularRouteRequirement) {
    if (wordTotal < popularRouteRequirement.minWords) {
      failures.push(
        `popular first-page answer is underdeveloped (${wordTotal} words; minimum ${popularRouteRequirement.minWords})`
      );
    }
    const visualRowCount = result?.visual?.rows?.length ?? 0;
    if (visualRowCount < popularRouteRequirement.minVisualRows) {
      failures.push(
        `popular first-page surface is too shallow (${visualRowCount} entries; minimum ${popularRouteRequirement.minVisualRows})`
      );
    }
    if (!hasUsefulSurface(result) && !hasRegisteredSurfaceLauncher) {
      failures.push("popular first-page answer does not provide a usable evidence surface");
    }
  }

  if (["incident-unique-people-count", "incident-event-count", "census-point-count"].includes(entry.id)) {
    if (wordTotal > 20) failures.push(`direct count answer is too long (${wordTotal} words)`);
    if ((result?.structuredAnswer?.facts ?? []).length > 0) failures.push("direct count answer includes unnecessary supporting facts");
    if (result?.visual?.type !== "summary_card") failures.push("direct count answer does not use a summary card");
  }

  if (["community-month-status", "community-change-summary"].includes(entry.id) && getExpectedPeriods(entry).length === 1) {
    if (result?.visual?.type !== "summary_card") failures.push("single-month community answer does not use an executive KPI summary");
    const labels = new Set((result?.visual?.rows ?? []).map((row) => String(row.label ?? "").toLowerCase()));
    for (const requiredLabel of ["census", "incidents", "leading category", "medication compliance"]) {
      if (!labels.has(requiredLabel)) failures.push(`single-month community summary is missing ${requiredLabel}`);
    }
  }

  if (entry.id === "medication-profile" && wordTotal > 48) {
    failures.push(`medication profile lead is too dense (${wordTotal} words)`);
  }

  if (LATEST_LOADED_FAMILIES.has(entry.id) && !hasExplicitMonth(entry.runPrompt) && !/\blatest available\b/i.test(answer)) {
    failures.push("relative-period answer does not disclose that its reporting month is the latest available month");
  }

  if (entry.id === "incident-freshness-troubleshoot" || /\blatest incident date loaded\b/i.test(entry.runPrompt)) {
    if (!/\bmost recent incident detail\b/i.test(answer)) failures.push("freshness answer does not identify the most recent incident detail date");
    if (truthState === "stale" && !/\bbehind today\b/i.test(answer)) failures.push("stale freshness answer does not quantify the lag to today");
    if (truthState === "stale" && !/\bcannot appear\b|\bnot current\b|\bnewer incident feed\b/i.test(answer)) {
      failures.push("stale freshness answer does not explain the end-user consequence");
    }
  }

  if (entry.id === "incident-detail-list" && getExpectedPeriods(entry).length > 1 && !/\bmonthly split\b/i.test(answer)) {
    failures.push("multi-period incident detail answer omits the monthly split from the lead paragraph");
  }
  if (entry.id === "incident-detail-list" && /\bshowing\s+[\d,]+\s+of\s+[\d,]+\s+(?:entries|records|rows)\b/i.test(String(result?.visual?.subtitle ?? ""))) {
    failures.push("incident detail subtitle duplicates browser-owned preview state");
  }

  if (entry.id === "medication-profile") {
    const visualText = (result?.visual?.rows ?? []).flatMap((row) => [row.label, ...(row.cells ?? [])]).join(" ");
    if (/\b(?:not loaded|not available|unavailable|no monthly)\b/i.test(visualText) || /(?:^|\s)—(?:\s|$)/.test(visualText)) {
      failures.push("medication profile renders an unavailable measure as a KPI");
    }
    if (/\bResident MAR rows\b/i.test(visualText)) failures.push("medication profile exposes row-oriented source language");
  }

  if (entry.id === "operating-snapshot") {
    const values = (result?.visual?.rows ?? []).map((row) => Number(row.value));
    if (values.some((value, index) => index > 0 && value > values[index - 1])) {
      failures.push("operating snapshot is not ranked by incident rate");
    }
  }

  if (entry.id === "resident-profile" && /\bJohn Smith\b/i.test(entry.runPrompt)) {
    if (!/\bJohn Smith\b/i.test(answer)) failures.push("unknown-resident recovery does not name the requested resident");
    if (!/\bdifferent spelling\b/i.test(answer) || !/\bresident number\b/i.test(answer)) {
      failures.push("unknown-resident recovery does not give a concrete retry path");
    }
  }

  if (entry.id === "module-catalog" && (!/\bproduct surfaces\b/i.test(answer) || !/\bscope and capabilities\b/i.test(answer))) {
    failures.push("module catalog answer does not explain what can be opened or what the catalog contains");
  }

  if (/\b(profile|operating|comparison|trend|movement|history|availability|summary)\b/i.test(entry.answerStyle) &&
      result?.tool !== "surface_module" && wordTotal < 14) {
    failures.push(`narrative answer is underdeveloped for its answer style (${wordTotal} words)`);
  }
  if (wordTotal > 110) failures.push(`lead answer is too long for the full-screen result hierarchy (${wordTotal} words)`);

  if (truthState === "stale" && !/\b(stale|behind|not current|cannot appear)\b/i.test(answer)) {
    failures.push("stale answer does not state its freshness limitation");
  }
  if (truthState === "not_loaded" && !/\b(unavailable|not published|not populated|not loaded)\b/i.test(answer)) {
    failures.push("not-loaded answer does not pair the limitation with a safe supported path");
  }
  if (truthState === "summary_not_shown" && !/\bnot loaded\b|\bcannot be verified\b|\bcurrent-state\b|\bnot populated\b|\bintake only\b/i.test(answer)) {
    failures.push("partial-coverage answer does not make its verification boundary explicit");
  }
  if (truthState === "verified_zero" && !/\b(?:0|no|none|not found|could not)\b/i.test(answer)) {
    failures.push("verified-zero answer does not state the zero or no-match result directly");
  }

  if (truthState === "valid_rows" && shouldUseReportShape(result) && !NON_NUMERIC_ANSWER_TOOLS.has(result?.tool) && !/\d/.test(answer)) {
    failures.push("data-backed answer does not include a concrete numeric result");
  }

  if (result?.visual) {
    if (!String(result.visual.title ?? "").trim()) failures.push("visual is missing a title");
    if (!Array.isArray(result.visual.rows)) failures.push("visual rows are not an array");
    if (result.visual.type === "table") {
      const columns = result.visual.columns ?? [];
      if (!columns.length) failures.push("table visual is missing columns");
      const malformedRow = (result.visual.rows ?? []).find((row) => !Array.isArray(row.cells) || row.cells.length !== columns.length);
      if (malformedRow) failures.push("table visual contains a row that does not match its columns");
    }
  }

  if (result?.moduleSpec?.provenance?.tool && result.moduleSpec.provenance.tool !== result.tool) {
    failures.push(`module provenance names ${result.moduleSpec.provenance.tool} instead of ${result.tool}`);
  }
  if (result?.artifact) {
    if (!String(result.artifact.content ?? "").trim()) failures.push("artifact has no content");
    if (!Number.isFinite(Number(result.artifact.rowCount))) failures.push("artifact has no deterministic row count");
    if (result.artifact.type === "csv" && !String(result.artifact.rowSetId ?? result.provenance?.rowSetId ?? "").trim()) {
      failures.push("CSV artifact has no row-set provenance");
    }
  }

  if (actions.length > 3) failures.push(`answer exposes too many follow-up actions (${actions.length})`);
  if (new Set(actionLabels.map((label) => label.toLowerCase())).size !== actionLabels.length) failures.push("answer exposes duplicate follow-up actions");
  if (actions.some((action) => !String(action?.kind ?? "").trim())) failures.push("follow-up action is missing its interaction kind");

  return failures;
}

function validateReportShape(entry, result) {
  const failures = [];
  const text = String(result?.text ?? "");
  const allowedUnavailable = isAllowedUnavailable(entry, result);
  if (getTruthState(result) === "plan_rejected" && !isExpectedUnknownResidentRecovery(entry, result)) {
    failures.push("guided question returned plan_rejected");
  }

  if (shouldUseReportShape(result)) {
    if (result.safeRefusal) {
      failures.push("guided question returned a safe-refusal instead of a vetted report");
    }
    if (["not_loaded", "plan_rejected"].includes(getTruthState(result)) && !allowedUnavailable) {
      failures.push(`guided question returned ${getTruthState(result)}`);
    }
    if (/^Answer\s*$/im.test(text)) {
      failures.push("visible Answer heading leaked into report text");
    }
    if (!result.structuredAnswer?.answer) {
      failures.push("missing structured answer");
    }
    if (!hasUsefulSurface(result)) {
      failures.push("missing visualization, module, or artifact");
    }
    if (!result.structuredAnswer?.contractId || result.structuredAnswer.contractId === "generic") {
      failures.push("missing non-generic structured answer contract");
    }
    if (String(result.structuredAnswer?.answer ?? "").split(/\s+/).filter(Boolean).length < 7) {
      failures.push("answer sentence is too skinny");
    }
  }

  for (const pattern of BANNED_REPORT_PATTERNS) {
    if (pattern.test(text)) failures.push(`matched banned report wording ${pattern}`);
  }

  if (result?.structuredAnswer) {
    if (result.structuredAnswer.contractId && !result.structuredAnswer.answer) {
      failures.push("structured answer contract has no answer");
    }
    if (Array.isArray(result.structuredAnswer.facts) && result.structuredAnswer.facts.some((fact) => /\brows?\b/i.test(String(fact)))) {
      failures.push("structured context facts still mention rows");
    }
  }

  if (expectsCommunityScope(entry) && !hasCommunityScope(result)) {
    failures.push("community-scoped question missing community scope in rendered answer");
  }

  for (const period of getExpectedPeriods(entry)) {
    if (!hasPeriodCoverage(result, period)) {
      failures.push(`period-scoped question missing ${period.label}`);
    }
  }

  for (const action of result?.actions ?? []) {
    for (const pattern of BANNED_ACTION_LABEL_PATTERNS) {
      if (pattern.test(String(action.label ?? ""))) failures.push(`matched banned action ${pattern}`);
    }
  }

  failures.push(...validateFamilyContract(entry, result));
  failures.push(...validateProseQuality(result));
  failures.push(...validateVisualCopy(result));
  failures.push(...findUserFacingDateContractViolations(result));
  failures.push(...validateDecisionQuality(entry, result));
  failures.push(...validatePerQuestionExperience(entry, result));
  failures.push(...validateGuidedQuestionResult({
    questionId: entry.id,
    route: {
      id: entry.routeId,
      familyId: entry.id,
      expectedTool: entry.expectedTool
    },
    content: entry.runPrompt,
    result
  }).failures.map((failure) => `guided contract: ${failure}`));

  return failures.map((failure) => ({
    questionId: entry.id,
    title: entry.title,
    prompt: entry.prompt,
    runPrompt: entry.runPrompt,
    tool: result?.tool ?? null,
    failure
  }));
}

const entries = catalogPrompts();
const failures = [];
const toolCounts = new Map();
const auditResults = [];

for (const [index, entry] of entries.entries()) {
  const result = await runCopilotTool({
    content: entry.runPrompt,
    certifiedQuestionRouteId: entry.routeId,
    sessionId: `guided-report-shape-${Date.now()}-${index}`
  });
  toolCounts.set(result.tool, (toolCounts.get(result.tool) ?? 0) + 1);
  const issues = validateReportShape(entry, result).map(enrichFailure);
  const scorecard = scoreDimensions(issues);
  const answer = result?.structuredAnswer?.answer ?? null;
  auditResults.push({
    questionKey: `${entry.id}:${entry.index + 1}`,
    questionId: entry.id,
    routeId: entry.routeId,
    questionOrdinal: entry.questionIndex + 1,
    promptOrdinal: entry.index + 1,
    title: entry.title,
    prompt: entry.prompt,
    runPrompt: entry.runPrompt,
    answerStyle: entry.answerStyle,
    expectedTool: entry.expectedTool,
    actualTool: result?.tool ?? null,
    truthState: getTruthState(result),
    contractId: result?.structuredAnswer?.contractId ?? null,
    answer,
    answerWordCount: String(answer ?? "").split(/\s+/).filter(Boolean).length,
    text: result?.text ?? null,
    surface: result?.visual?.title ?? result?.moduleSpec?.title ?? result?.artifact?.filename ?? null,
    visualType: result?.visual?.type ?? null,
    visualRowCount: result?.visual?.rows?.length ?? 0,
    artifactRowCount: result?.artifact?.rowCount ?? null,
    provenanceRowCount: result?.moduleSpec?.provenance?.rowCount ?? result?.provenance?.rowCount ?? null,
    moduleSurfaces: (result?.moduleSpecs ?? []).map((moduleSpec) => moduleSpec?.title).filter(Boolean),
    actions: (result?.actions ?? []).map((action) => action.label),
    actionCount: result?.actions?.length ?? 0,
    score: scorecard.score,
    dimensions: scorecard.dimensions,
    issues
  });
  failures.push(...issues);
}

const currentIncidentAnswers = auditResults.filter((answer) => answer.questionId === "incident-current-snapshot");
const currentIncidentTotals = new Set(currentIncidentAnswers.map((answer) => {
  const match = String(answer.answer ?? "").match(/\brecorded\s+([\d,]+)\s+incidents\b/i);
  return match?.[1] ?? null;
}).filter(Boolean));
if (currentIncidentTotals.size !== 1) {
  failures.push({
    questionId: "incident-current-snapshot",
    title: "Current incident snapshot",
    prompt: "all certified paraphrases",
    runPrompt: currentIncidentAnswers.map((answer) => answer.runPrompt).join(" | "),
    tool: "incident_breakdown",
    failure: `equivalent current-incident prompts returned inconsistent totals: ${[...currentIncidentTotals].join(", ")}`
  });
}

const reportPath = resolve(process.env.GUIDED_ANSWER_REPORT_PATH || "generated/guided-answer-qa/latest.json");
const familyScorecard = CERTIFIED_ANALYST_QUESTIONS.map((question, index) => {
  const answers = auditResults.filter((answer) => answer.questionId === question.id);
  const score = answers.length ? answers.reduce((total, answer) => total + answer.score, 0) / answers.length : 0;
  return {
    questionId: question.id,
    ordinal: index + 1,
    title: question.title,
    promptCount: answers.length,
    score: Number(score.toFixed(1)),
    reviewCount: answers.filter((answer) => answer.issues.length).length
  };
});
const reviewQueue = auditResults
  .filter((answer) => answer.issues.length)
  .sort((left, right) => left.score - right.score || left.questionOrdinal - right.questionOrdinal || left.promptOrdinal - right.promptOrdinal)
  .map((answer) => ({
    questionKey: answer.questionKey,
    questionId: answer.questionId,
    runPrompt: answer.runPrompt,
    score: answer.score,
    issues: answer.issues
  }));
const weakTail = [...auditResults]
  .sort((left, right) => left.score - right.score || left.answerWordCount - right.answerWordCount || left.questionOrdinal - right.questionOrdinal)
  .slice(0, 20)
  .map((answer) => ({
    questionKey: answer.questionKey,
    questionId: answer.questionId,
    runPrompt: answer.runPrompt,
    score: answer.score,
    answerWordCount: answer.answerWordCount,
    issueCount: answer.issues.length
  }));
const averageScore = auditResults.length
  ? auditResults.reduce((total, answer) => total + answer.score, 0) / auditResults.length
  : 0;
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  checked: entries.length,
  familyCount: CERTIFIED_ANALYST_QUESTIONS.length,
  averageScore: Number(averageScore.toFixed(1)),
  perfectAnswerCount: auditResults.filter((answer) => answer.score === 100).length,
  reviewQueueCount: reviewQueue.length,
  toolCounts: Object.fromEntries([...toolCounts.entries()].sort()),
  failureCount: failures.length,
  failures,
  familyScorecard,
  reviewQueue,
  weakTail,
  answers: auditResults
}, null, 2)}\n`);

if (failures.length) {
  console.error(JSON.stringify({
    message: "guided answer report-shape checks failed",
    checked: entries.length,
    failures: failures.slice(0, 40),
    failureCount: failures.length,
    toolCounts: Object.fromEntries([...toolCounts.entries()].sort())
  }, null, 2));
  process.exit(1);
}

console.log(`guided answer report-shape checks passed (${entries.length} answers, ${CERTIFIED_ANALYST_QUESTIONS.length} families, ${toolCounts.size} tools, ${Number(averageScore.toFixed(1))}/100 average, ${reviewQueue.length} in review queue)`);
