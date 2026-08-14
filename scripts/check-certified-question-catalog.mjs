import {
  CERTIFIED_ANALYST_QUESTIONS,
  CERTIFIED_QUESTION_MENU,
  getCertifiedQuestionMenuRoutes,
  matchCertifiedQuestion
} from "../shared/certified-analyst-questions.mjs";

const TARGET_EXAMPLE_COUNT = 200;
const MIN_EXAMPLES_PER_FAMILY = 4;
const MAX_QUESTION_LENGTH = 140;

const facilities = [
  { facility_id: "337", community_name: "A & A Health Services San Pablo" },
  { facility_id: "342", community_name: "Victoria's House" },
  { facility_id: "343", community_name: "JC Wallace House" },
  { facility_id: "344", community_name: "AHS Turlock OP LLC" },
  { facility_id: "345", community_name: "Santa Clarita" }
];

const residents = [
  { resident_name: "Shannon Romero" },
  { resident_name: "Tuesday Woo" },
  { resident_name: "John Smith" },
  { resident_name: "Brian Hinz" }
];

const frameOptions = {
  facilities,
  residents,
  availableMonths: ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
  categories: ["AWOL/Elopement", "Medication Refusal", "Medical Emergency", "Aggressive Behavior", "Substance Use", "Fall"]
};

const bannedVisibleLanguage = [
  /\bguided\b/i,
  /\bcertified\b/i,
  /\bon rails\b/i,
  /\btool context manifest\b/i,
  /\brows?\b/i,
  /\bdischare\b/i
];

const hardcodedResidentNames = [
  /\bShannon Romero\b/i,
  /\bTuesday Woo\b/i,
  /\bJohn Smith\b/i,
  /\bBrian Hinz\b/i
];

const hardcodedCommunityNames = [
  /\bSan Pablo\b/i,
  /\bSanta Clarita\b/i,
  /\bJC Wallace(?: House)?\b/i,
  /\bAHS Turlock(?: OP LLC)?\b/i,
  /\bTurlock\b/i,
  /\bVictoria'?s House\b/i,
  /\bVictoria\b/i
];

const hardcodedMonthOrYear = [
  /\bJanuary\b/i,
  /\bFebruary\b/i,
  /\bMarch\b/i,
  /\bApril\b/i,
  /\bMay\b/i,
  /\bJune\b/i,
  /\bJuly\b/i,
  /\bAugust\b/i,
  /\bSeptember\b/i,
  /\bOctober\b/i,
  /\bNovember\b/i,
  /\bDecember\b/i,
  /\b20\d{2}\b/
];

const hardcodedIncidentCategories = [
  /\bAWOL\b/i,
  /\bElopement\b/i,
  /\bMedication Refusal\b/i,
  /\bMedical Emergency\b/i,
  /\bAggressive Behavior\b/i,
  /\bSubstance Use\b/i,
  /\bFall\b/i
];

const residentPickerFamilies = new Set([
  "resident-current-medications",
  "resident-profile",
  "resident-change-summary",
  "resident-incident-history",
  "resident-search"
]);

const hiddenMenuFamilies = new Set([
  "incident-row-export",
  "generic-detail-list",
  "resident-flow-weekly",
  "data-availability",
  "module-catalog",
  "module-surface",
  "incident-freshness-troubleshoot",
  "resident-profile",
  "resident-change-summary",
  "resident-incident-history",
  "resident-risk-summary",
  "community-topline",
  "data-slice-catalog"
]);

const expectedMenuOpening = [
  "community-month-status:0",
  "operating-snapshot:0",
  "census-point-count:0",
  "census-trend:0",
  "community-change-summary:0",
  "community-comparison:0",
  "incident-current-snapshot:0",
  "incident-category-breakdown:0",
  "resident-search:0",
  "medication-profile:0"
];
const expectedOpeningCategories = new Set([
  "Communities",
  "Census",
  "Operating",
  "Incidents",
  "Residents",
  "Medications"
]);

const allowedMenuCategories = new Set([
  "Communities",
  "Census",
  "Operating",
  "Incidents",
  "Residents",
  "Medications"
]);

function normalizeQuestion(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fail(message, context = null) {
  console.error(`FAILED: ${message}`);
  if (context) console.error(JSON.stringify(context, null, 2));
  process.exitCode = 1;
}

function isSentenceLike(question) {
  return /^[A-Z0-9]/.test(question) && /[?.]$/.test(question);
}

function hasVariable(question, id) {
  return (question.variables ?? []).some((variable) => variable.id === id);
}

function hasCommunityVariable(question) {
  return hasVariable(question, "community");
}

function hasPeriodVariable(question) {
  return ["month", "startMonth", "endMonth"].some((id) => hasVariable(question, id));
}

function hasIncidentCategoryVariable(question) {
  return hasVariable(question, "incidentCategory");
}

function renderQuestionVariables(template, question) {
  const fallbackValues = {
    community: "San Pablo",
    incidentCategory: "AWOL/Elopement",
    month: "May 2026",
    startMonth: "May 2026",
    endMonth: "June 2026"
  };

  return String(template ?? "").replace(/\{([a-zA-Z0-9_-]+)\}/g, (_match, variableId) => {
    if (fallbackValues[variableId]) return fallbackValues[variableId];
    const variable = (question.variables ?? []).find((item) => item.id === variableId);
    const option = variable?.options?.[0];
    if (!option) return "";
    return typeof option === "string" ? option : option.value;
  });
}

const seen = new Map();
let exampleCount = 0;
const familyCounts = new Map();

for (const question of CERTIFIED_ANALYST_QUESTIONS) {
  if (!question.id || !question.title || !question.description || !question.preferredTool || !question.answerStyle || !question.cacheFamily) {
    fail("question family is missing required metadata", question);
  }

  const examples = question.examples ?? [];
  const promptTemplates = [question.displayPrompt, question.runPrompt, ...examples].filter(Boolean);
  const referencedVariableIds = new Set(promptTemplates.flatMap((template) => (
    [...String(template).matchAll(/\{([a-zA-Z0-9_-]+)\}/g)].map((match) => match[1])
  )));
  const declaredVariableIds = new Set((question.variables ?? []).map((variable) => variable.id));
  const undeclaredVariableIds = [...referencedVariableIds].filter((id) => !declaredVariableIds.has(id));
  const unusedVariableIds = [...declaredVariableIds].filter((id) => !referencedVariableIds.has(id));
  if (undeclaredVariableIds.length || unusedVariableIds.length) {
    fail("question family variable definitions do not match its prompt templates", {
      id: question.id,
      undeclaredVariableIds,
      unusedVariableIds
    });
  }

  familyCounts.set(question.id, examples.length);
  if (examples.length < MIN_EXAMPLES_PER_FAMILY) {
    fail("question family needs more examples", { id: question.id, count: examples.length, minimum: MIN_EXAMPLES_PER_FAMILY });
  }

  if (question.displayPrompt) {
    if (!isSentenceLike(question.displayPrompt)) {
      fail("display prompt must be a complete sentence or question", { id: question.id, displayPrompt: question.displayPrompt });
    }

    const bannedPattern = bannedVisibleLanguage.find((pattern) => pattern.test(question.displayPrompt));
    if (bannedPattern) {
      fail("display prompt contains internal or low-quality visible language", {
        id: question.id,
        displayPrompt: question.displayPrompt,
        bannedPattern: String(bannedPattern)
      });
    }

    const hardcodedResident = hardcodedResidentNames.find((pattern) => pattern.test(question.displayPrompt));
    if (hardcodedResident) {
      fail("display prompt must not hardcode a resident name; use a universal picker path", {
        id: question.id,
        displayPrompt: question.displayPrompt,
        hardcodedResident: String(hardcodedResident)
      });
    }

    const hardcodedCommunity = hardcodedCommunityNames.find((pattern) => pattern.test(question.displayPrompt));
    if (hardcodedCommunity && !hasCommunityVariable(question)) {
      fail("display prompt references a named community but does not expose the community selector", {
        id: question.id,
        displayPrompt: question.displayPrompt,
        hardcodedCommunity: String(hardcodedCommunity)
      });
    }

    const hardcodedPeriod = hardcodedMonthOrYear.find((pattern) => pattern.test(question.displayPrompt));
    if (hardcodedPeriod && !hasPeriodVariable(question)) {
      fail("display prompt references a fixed period but does not expose a period selector", {
        id: question.id,
        displayPrompt: question.displayPrompt,
        hardcodedPeriod: String(hardcodedPeriod)
      });
    }
  }

  if (residentPickerFamilies.has(question.id)) {
    if (!question.displayPrompt || !question.runPrompt) {
      fail("resident picker family must expose universal display/run prompts", {
        id: question.id,
        displayPrompt: question.displayPrompt ?? null,
        runPrompt: question.runPrompt ?? null
      });
    }

    if (!/resident search module/i.test(question.runPrompt)) {
      fail("resident picker family must open the universal Resident Search module", {
        id: question.id,
        runPrompt: question.runPrompt
      });
    }
  }

  examples.forEach((example, index) => {
    exampleCount += 1;
    const normalized = normalizeQuestion(example);
    const existing = seen.get(normalized);
    if (existing) {
      fail("duplicate question example", { question: example, first: existing, second: { id: question.id, index } });
    }
    seen.set(normalized, { id: question.id, index });

    if (!isSentenceLike(example)) {
      fail("question example must be a complete sentence or question", { id: question.id, index, example });
    }

    if (example.length > MAX_QUESTION_LENGTH) {
      fail("question example is too long for the picker", { id: question.id, index, length: example.length, example });
    }

    const bannedPattern = bannedVisibleLanguage.find((pattern) => pattern.test(example));
    if (bannedPattern) {
      fail("question example contains internal or low-quality visible language", { id: question.id, index, example, bannedPattern: String(bannedPattern) });
    }

    const hardcodedCommunity = hardcodedCommunityNames.find((pattern) => pattern.test(example));
    if (hardcodedCommunity && !hasCommunityVariable(question)) {
      fail("question example references a named community but does not expose the community selector", {
        id: question.id,
        index,
        example,
        hardcodedCommunity: String(hardcodedCommunity)
      });
    }

    const hardcodedPeriod = hardcodedMonthOrYear.find((pattern) => pattern.test(example));
    if (hardcodedPeriod && !hasPeriodVariable(question)) {
      fail("question example references a fixed period but does not expose a period selector", {
        id: question.id,
        index,
        example,
        hardcodedPeriod: String(hardcodedPeriod)
      });
    }

    const hardcodedCategory = hardcodedIncidentCategories.find((pattern) => pattern.test(example));
    if (question.id.startsWith("incident") && hardcodedCategory && !hasIncidentCategoryVariable(question)) {
      fail("incident question example references a fixed category but does not expose an incident category selector", {
        id: question.id,
        index,
        example,
        hardcodedCategory: String(hardcodedCategory)
      });
    }

    const matchableExample = renderQuestionVariables(example, question);
    const match = matchCertifiedQuestion(matchableExample, frameOptions);
    if (match?.id !== question.id) {
      fail("question example routes to the wrong analyst family", {
        expected: question.id,
        actual: match?.id ?? null,
        index,
        example,
        matchableExample
      });
    }
  });
}

if (exampleCount !== TARGET_EXAMPLE_COUNT) {
  fail("certified question catalog must contain exactly the target number of examples", {
    expected: TARGET_EXAMPLE_COUNT,
    actual: exampleCount
  });
}

const categoryCounts = {
  incidents: 0,
  census: 0,
  residents: 0,
  communities: 0,
  medications: 0,
  operatingAndData: 0
};

for (const [id, count] of familyCounts.entries()) {
  if (id.startsWith("incident")) categoryCounts.incidents += count;
  else if (id.startsWith("census")) categoryCounts.census += count;
  else if (id.startsWith("resident") || id === "diagnosis-mix" || id === "length-of-stay") categoryCounts.residents += count;
  else if (id.startsWith("community")) categoryCounts.communities += count;
  else if (id.startsWith("medication")) categoryCounts.medications += count;
  else categoryCounts.operatingAndData += count;
}

const minimumCategoryCoverage = {
  incidents: 55,
  census: 18,
  residents: 30,
  communities: 18,
  medications: 20,
  operatingAndData: 18
};

for (const [category, minimum] of Object.entries(minimumCategoryCoverage)) {
  if (categoryCounts[category] < minimum) {
    fail("question catalog category coverage is too thin", {
      category,
      minimum,
      actual: categoryCounts[category]
    });
  }
}

const menuRoutes = getCertifiedQuestionMenuRoutes();
const menuRouteIds = menuRoutes.map((route) => route.id);
const menuFamilies = new Set(menuRoutes.map((route) => route.familyId));
const duplicateMenuRouteIds = menuRouteIds.filter((routeId, index) => menuRouteIds.indexOf(routeId) !== index);
const duplicateMenuFamilies = menuRoutes
  .map((route) => route.familyId)
  .filter((familyId, index, values) => values.indexOf(familyId) !== index);

if (CERTIFIED_QUESTION_MENU.length !== menuRoutes.length || duplicateMenuRouteIds.length || duplicateMenuFamilies.length) {
  fail("visible question menu must contain one unique route per supported family", {
    configured: CERTIFIED_QUESTION_MENU.length,
    resolved: menuRoutes.length,
    duplicateMenuRouteIds,
    duplicateMenuFamilies
  });
}

const unaccountedFamilies = CERTIFIED_ANALYST_QUESTIONS
  .map((question) => question.id)
  .filter((familyId) => !menuFamilies.has(familyId) && !hiddenMenuFamilies.has(familyId));
const staleHiddenFamilyExceptions = [...hiddenMenuFamilies]
  .filter((familyId) => !CERTIFIED_ANALYST_QUESTIONS.some((question) => question.id === familyId));
if (unaccountedFamilies.length || staleHiddenFamilyExceptions.length) {
  fail("every tested question family must be visible or explicitly classified as contextual-only", {
    unaccountedFamilies,
    staleHiddenFamilyExceptions
  });
}

if (JSON.stringify(menuRouteIds.slice(0, expectedMenuOpening.length)) !== JSON.stringify(expectedMenuOpening)) {
  fail("visible question menu no longer starts with the highest-value cross-domain questions", {
    expected: expectedMenuOpening,
    actual: menuRouteIds.slice(0, expectedMenuOpening.length)
  });
}

const openingCategories = new Set(
  menuRoutes.slice(0, expectedMenuOpening.length).map((route) => route.menuCategory)
);
const missingOpeningCategories = [...expectedOpeningCategories].filter((category) => !openingCategories.has(category));
if (missingOpeningCategories.length) {
  fail("first question page must represent every core product domain", {
    missingOpeningCategories,
    actual: [...openingCategories]
  });
}

for (const route of menuRoutes) {
  if (hiddenMenuFamilies.has(route.familyId)) {
    fail("internal, incomplete, duplicate, or contextual-only family is exposed in the visible menu", {
      routeId: route.id,
      familyId: route.familyId
    });
  }
  if (!allowedMenuCategories.has(route.menuCategory)) {
    fail("visible question uses an unsupported product category", {
      routeId: route.id,
      category: route.menuCategory
    });
  }
  if (!isSentenceLike(route.prompt)) {
    fail("visible menu prompt must be a complete sentence or question", {
      routeId: route.id,
      prompt: route.prompt
    });
  }
  const hardcodedResident = hardcodedResidentNames.find((pattern) => pattern.test(route.prompt));
  if (hardcodedResident) {
    fail("visible menu prompt must not hardcode a resident name", {
      routeId: route.id,
      prompt: route.prompt,
      hardcodedResident: String(hardcodedResident)
    });
  }
  const bannedPattern = bannedVisibleLanguage.find((pattern) => pattern.test(route.prompt));
  if (bannedPattern) {
    fail("visible menu prompt contains internal or low-quality language", {
      routeId: route.id,
      prompt: route.prompt,
      bannedPattern: String(bannedPattern)
    });
  }
}

if (process.exitCode) process.exit(process.exitCode);

console.log(
  `certified question catalog passed (${menuRoutes.length} visible questions, ${CERTIFIED_ANALYST_QUESTIONS.length} tested families, ${exampleCount} parser examples, coverage ${JSON.stringify(categoryCounts)})`
);
