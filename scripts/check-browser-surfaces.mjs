#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  attachPageDiagnostics,
  ask,
  measureCanvas,
  openChat,
  prepareArtifactDirs,
  startCleanChat,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const EXPECTATION_TIMEOUT_MS = Number(process.env.BROWSER_SURFACE_EXPECTATION_TIMEOUT_MS || 8_000);

async function surfaceModule(page, route, sourceLabel) {
  const moduleCountBefore = await page.locator("[data-chat-module-content-id]").count();
  await page.evaluate(({ nextRoute, nextLabel }) => {
    window.dispatchEvent(new CustomEvent("alamo-platform:surface-in-canvas", {
      detail: {
        route: nextRoute,
        sourceLabel: nextLabel,
        introText: null
      }
    }));
  }, { nextRoute: route, nextLabel: sourceLabel });
  await page.waitForFunction(
    (previousCount) => document.querySelectorAll("[data-chat-module-content-id]").length > previousCount,
    moduleCountBefore,
    { timeout: 12_000 }
  );
}

const surfaceCases = [
  {
    name: "Communities overview surface",
    kind: "surface",
    route: "/communities",
    prompt: "Can you open the Communities Overview?",
    expect: [/Communities Overview is open|Communities Overview/i, /A & A Health Services San Pablo|Santa Clarita|JC Wallace House/i]
  },
  {
    name: "Incident center surface",
    kind: "surface",
    route: "/incidents",
    prompt: "Can you open the Incident Center module?",
    expect: [
      /Latest two loaded incident days/i,
      /Latest received/i,
      /Previous loaded day|[0-9]{1,2} [A-Z][a-z]+ 20[0-9]{2}/i,
      /[1-9][0-9]* reports in this stream/i,
      /\bHigh\b/i,
      /\bMedium\b/i,
      /\bLow\b/i
    ]
  },
  {
    name: "Resident search surface",
    kind: "surface",
    route: "/communities/337?focus=search",
    prompt: "Can you show me the Resident Search module?",
    expect: [
      /All communities/i,
      /[1-9][0-9]* residents/i,
      /Community|Unit|Diagnosis/i
    ]
  },
  {
    name: "San Pablo census surface",
    kind: "surface",
    route: "/communities/337?focus=census",
    prompt: "Can you show the San Pablo census module?",
    expect: [/A & A Health Services San Pablo/i, /Census|census/i, /Jun|June|May|2026/i]
  },
  {
    name: "San Pablo incidents surface",
    kind: "surface",
    route: "/communities/337?focus=incidents",
    prompt: "Can you show the San Pablo incidents module?",
    expect: [/A & A Health Services San Pablo/i, /Incident|Medication Refusal|AWOL\/Elopement/i]
  },
  {
    name: "Glossary surface",
    kind: "surface",
    route: "/glossary",
    prompt: "Can you open the Glossary?",
    expect: [/Glossary/i, /Active Residents/i, /Census/i, /Incident Volume/i]
  },
  {
    name: "Command center surface",
    kind: "surface",
    route: "/command-center",
    prompt: "Can you take me to Command Center?",
    expect: [/Command Center is open|Command Center/i, /Databricks Warehouse|Analyst QA|Prompt workbench/i],
    allowEmptyState: true
  }
];

const visualCases = [
  {
    name: "Typo-corrected census trend chart",
    kind: "visual",
    prompt: "show santa clartia censsus trend",
    expect: [/Santa Clarita/i, /Census Trend/i, /118|119|census/i],
    requireVisualStructure: true
  },
  {
    name: "Incident category breakdown visual",
    kind: "visual",
    prompt: "What is the incident category breakdown for JC Wallace in June 2026?",
    expect: [/JC Wallace House/i, /Incident Category Breakdown/i, /Jun|June 2026/i, /Medical Emergency|AWOL\/Elopement|Medication Refusal/i],
    requireVisualStructure: true
  },
  {
    name: "Historical community incident visual",
    kind: "visual",
    prompt: "What were San Pablo incident categories in January 2026?",
    expect: [/A & A Health Services San Pablo/i, /Jan|January 2026/i, /Medication Refusal|AWOL\/Elopement/i],
    requireVisualStructure: true
  },
  {
    name: "Incident category comparison visual",
    kind: "visual",
    prompt: "How did San Pablo incidents compare from May to June by category?",
    expect: [/A & A Health Services San Pablo/i, /May 2026/i, /Jun|June 2026/i, /Medication Refusal|AWOL\/Elopement/i],
    requireVisualStructure: true
  },
  {
    name: "Incident rate change table",
    kind: "visual",
    prompt: "which community had the biggest incident rate change from April to May 2026",
    expect: [/Incident-Rate Change|incident-rate change|incident rate change/i, /Apr|April 2026/i, /May 2026/i, /rate/i],
    requireVisualStructure: true
  },
  {
    name: "Resident profile card",
    kind: "visual",
    prompt: "Can you give me Shannon Romero's profile?",
    expect: [/Shannon Romero/i, /Resident #/i, /Santa Clarita/i]
  }
];

const marVisualCases = [
  {
    name: "MAR medication profile module",
    kind: "visual",
    prompt: "show San Pablo medication profile",
    selection: { questionId: "medication-profile" },
    expect: [
      /A & A Health Services San Pablo Medication Profile/i,
      /Compliance/i,
      /Scheduled/i,
      /Not given/i,
      /Resident summaries/i,
      /Medication exceptions/i
    ]
  },
  {
    name: "MAR medication watch module",
    kind: "visual",
    prompt: "Show the resident medication watchlist for San Pablo.",
    selection: { questionId: "medication-watch", searchText: "medication watch" },
    expect: [
      /A & A Health Services San Pablo Medication Watch/i,
      /watch item/i,
      /refusals in 30 days|not given in 30 days|compliance/i
    ],
    requireVisualStructure: true
  },
  {
    name: "MAR refusal detail module",
    kind: "visual",
    prompt: "show San Pablo medication refusal detail in June 2026",
    selection: { questionId: "medication-refusal-detail" },
    expect: [
      /A & A Health Services San Pablo Medication Refusals/i,
      /Top refused medications/i,
      /Refusals/i
    ],
    requireVisualStructure: true
  },
  {
    name: "Resident medication profile card",
    kind: "visual",
    prompt: "review Shannon Romero's medication summary",
    selection: { questionId: "resident-current-medications" },
    expect: [
      /Shannon Romero/i,
      /Santa Clarita/i,
      /Active medications|Medication summary/i,
      /MAR compliance, 30 days|Not published in this resident directory/i
    ]
  }
];

const globalRejects = [
  /\bVictoria's Place\b/i,
  /\bAnswer The\b/i,
  /\bSource:\s*local data tool\b/i,
  /\b1 residents\b/i,
  /\bundefined\b/i,
  /\bInvalid Date\b/i
];

function serializePattern(pattern) {
  if (pattern instanceof RegExp) {
    return {
      source: pattern.source,
      flags: pattern.flags
    };
  }
  return {
    source: String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    flags: "i"
  };
}

function patternLabel(pattern) {
  return pattern instanceof RegExp ? String(pattern) : String(pattern);
}

async function waitForPatterns(page, patterns, timeoutMs = EXPECTATION_TIMEOUT_MS) {
  const serializedPatterns = patterns.map(serializePattern);
  try {
    await page.waitForFunction(
      (items) => items.every(({ source, flags }) => new RegExp(source, flags).test(document.body.innerText)),
      serializedPatterns,
      { timeout: timeoutMs }
    );
  } catch {
    // Fall through and report the exact missing patterns from the final page text.
  }

  const pageText = await page.evaluate(() => document.body.innerText);
  const found = [];
  const missing = [];
  for (const pattern of patterns) {
    const serialized = serializePattern(pattern);
    if (new RegExp(serialized.source, serialized.flags).test(pageText)) {
      found.push(patternLabel(pattern));
    } else {
      missing.push(patternLabel(pattern));
    }
  }

  return { found, missing };
}

function findPatternMatches(text, patterns) {
  return patterns
    .filter((pattern) => new RegExp(serializePattern(pattern).source, serializePattern(pattern).flags).test(text))
    .map(patternLabel);
}

async function auditLatestRenderable(page) {
  return page.evaluate(() => {
    function parseColor(value) {
      const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
      if (!match) return null;
      return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
        a: match[4] == null ? 1 : Number(match[4])
      };
    }

    function luminance(color) {
      return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    }

    const renderables = Array.from(
      document.querySelectorAll("[data-chat-module-content-id], [data-chat-visual-module-id]")
    );
    const root = renderables.at(-1);
    if (!root) {
      return {
        present: false,
        text: "",
        textSample: "",
        rect: null,
        hasNumericValue: false,
        visualStructureCount: 0,
        rowCount: 0,
        darkBlocks: [],
        rawFacilityIdLeaks: [],
        emptyStateMatches: [],
        staleNameMatches: []
      };
    }

    const text = root.innerText || "";
    const rect = root.getBoundingClientRect();
    const rowCount = root.querySelectorAll("tbody tr, table tr, [role='row'], [data-module-row]").length;
    const rechartsCount = root.querySelectorAll(".recharts-wrapper, .recharts-surface, canvas").length;
    const moduleChartCount = root.querySelectorAll("[data-module-chart]").length;
    const barCount = Array.from(root.querySelectorAll("[style]")).filter((element) =>
      /width:\s*\d+(?:\.\d+)?%/i.test(element.getAttribute("style") || "")
    ).length;
    const visualStructureCount = rowCount + rechartsCount + moduleChartCount + barCount;
    const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const rawFacilityIdLeaks = lines.filter((line, index) => {
      const nearbyText = lines.slice(Math.max(0, index - 2), index + 3).join(" ");
      return (
        /\bfacility\s*(id|#)?\s*[:#]?\s*(337|342|343|344|345)\b/i.test(line) ||
        /\bcommunity\s*(id|#)?\s*[:#]?\s*(337|342|343|344|345)\b/i.test(line) ||
        (/^(337|342|343|344|345)$/.test(line) && /\b(facility|community)\s*(id|#)\b/i.test(nearbyText))
      );
    });
    const emptyStateMatches = lines.filter((line) =>
      /No rows matched this visual request|not available|No (?:resident profiles|community data|incident detail|rows) (?:are )?loaded|could not answer that exact slice safely|Closest Recovery Path/i.test(line)
    );
    const staleNameMatches = lines.filter((line) => /\bVictoria's Place\b/i.test(line));
    const darkBlocks = Array.from(root.querySelectorAll("*"))
      .map((element) => {
        const elementRect = element.getBoundingClientRect();
        const color = parseColor(getComputedStyle(element).backgroundColor);
        if (
          !color ||
          color.a < 0.75 ||
          elementRect.height < 32 ||
          elementRect.width * elementRect.height < 8000 ||
          luminance(color) >= 72
        ) {
          return null;
        }
        return {
          tag: element.tagName.toLowerCase(),
          className: String(element.getAttribute("class") || "").slice(0, 140),
          backgroundColor: getComputedStyle(element).backgroundColor,
          width: Math.round(elementRect.width),
          height: Math.round(elementRect.height),
          text: String(element.textContent || "").trim().slice(0, 120)
        };
      })
      .filter(Boolean);

    return {
      present: true,
      text,
      textSample: text.slice(0, 2400),
      rect: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      hasNumericValue: /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?%?\b/.test(text),
      visualStructureCount,
      rowCount,
      darkBlocks,
      rawFacilityIdLeaks,
      emptyStateMatches,
      staleNameMatches
    };
  });
}

async function waitForLatestRenderableReady(page, timeoutMs = 30_000) {
  try {
    await page.waitForFunction(
      () => {
        const renderables = Array.from(
          document.querySelectorAll("[data-chat-module-content-id], [data-chat-visual-module-id]")
        );
        const root = renderables.at(-1);
        if (!root) return false;
        return !/\bLoading\b[^\n]*(?:…|\.{3})/i.test(root.innerText || "");
      },
      undefined,
      { timeout: timeoutMs }
    );
  } catch {
    // The final audit will report the loading text if the surface never settles.
  }
}

async function assertScopedQuestionSearch(page) {
  await startCleanChat(page);
  const guide = page.locator('[data-certified-question-guide="true"]').first();
  if (!(await guide.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /^(Ask a question|Questions|Open questions)$/i }).first().click();
    await guide.waitFor({ state: "visible", timeout: 10_000 });
  }

  const search = guide.locator('[data-certified-question-search="true"]').last();
  await search.fill("How did San Pablo incidents compare from May to June by category?");
  const firstQuestion = guide.locator('[data-certified-question-button="true"]').first();
  await firstQuestion.waitFor({ state: "visible", timeout: 10_000 });
  const promptTemplate = await firstQuestion.getAttribute("data-certified-question-run-prompt");
  if (!promptTemplate?.includes("{community}")) {
    throw new Error(`Scoped question search selected a template without a community field: ${promptTemplate ?? "missing prompt"}`);
  }
}

async function assertCommunityRowClickThrough(page) {
  await startCleanChat(page);
  await surfaceModule(page, "/communities", "Communities");
  try {
    await page.locator('[data-community-overview-slider="true"]').last().waitFor({ state: "visible", timeout: 20_000 });
  } catch (error) {
    const moduleRoots = page.locator("[data-chat-module-content-id]");
    const moduleCount = await moduleRoots.count();
    const latestModuleText = moduleCount
      ? await moduleRoots.nth(moduleCount - 1).innerText().catch(() => "")
      : "";
    throw new Error(
      `Communities Overview did not finish rendering before the row-click check. ` +
      `Latest module text: ${JSON.stringify(latestModuleText.slice(0, 1_200))}. ` +
      `Original error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const moduleRoots = page.locator('[data-chat-module-content-id]');
  const moduleCount = await moduleRoots.count();
  if (!moduleCount) throw new Error("Communities Overview did not render before the row-click check");
  const overview = moduleRoots.nth(moduleCount - 1);

  for (const [index, communityName] of ["A & A Health Services San Pablo", "JC Wallace House"].entries()) {
    const escapedName = communityName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const row = overview.getByRole("button", { name: new RegExp(escapedName) }).first();
    await row.waitFor({ state: "visible", timeout: 10_000 });
    await row.click();
    await page.waitForFunction(
      (expectedCount) => document.querySelectorAll('[data-community-dashboard-surface="detail"]').length >= expectedCount,
      index + 1,
      { timeout: 10_000 }
    );

    const surfaces = page.locator('[data-community-dashboard-surface="detail"]');
    const surfaceCount = await surfaces.count();
    const latestSurface = surfaces.nth(surfaceCount - 1);
    if (!(await latestSurface.getByRole("heading", { name: communityName, exact: true }).isVisible())) {
      throw new Error(`${communityName} row opened the wrong community profile`);
    }
    if (!(await latestSurface.locator('[data-module-chart="census-trend"]').isVisible())) {
      throw new Error(`${communityName} profile did not render its census trend`);
    }
    if (!(await latestSurface.getByRole("heading", { name: "Medication performance", exact: true }).isVisible())) {
      throw new Error(`${communityName} profile did not render medication performance`);
    }
    if (!(await latestSurface.getByRole("heading", { name: "Diagnosis mix", exact: true }).isVisible())) {
      throw new Error(`${communityName} profile did not render diagnosis mix`);
    }
  }

  if (await page.getByText(/Community (?:Census|Detail) could not render/i).count()) {
    throw new Error("Community row click fell into Safe Mode");
  }
}

async function runCase(page, testCase, index, screenshotDir) {
  await startCleanChat(page);
  const turn = testCase.kind === "surface" && testCase.route
    ? await (async () => {
        await surfaceModule(page, testCase.route, testCase.name);
        const canvas = await measureCanvas(page);
        return { pendingCanvas: canvas, finalCanvas: canvas };
      })()
    : await ask(page, testCase.prompt, 1, testCase.selection);
  await waitForLatestRenderableReady(page);
  await delay(150);

  const expected = await waitForPatterns(page, testCase.expect);
  const canvas = await measureCanvas(page);
  const renderable = await auditLatestRenderable(page);
  const combinedText = `${documentTextSample(renderable)}\n${renderable.textSample ?? ""}`;
  const rejectMatches = findPatternMatches(combinedText, [...globalRejects, ...(testCase.reject ?? [])]);

  const failures = [];
  if (expected.missing.length) failures.push(`missing expected text: ${expected.missing.join(", ")}`);
  if (!testCase.allowNoRenderable && !renderable.present) failures.push("no surfaced or generated module was rendered");
  if (renderable.present && renderable.rect.height < 110) failures.push(`rendered module is too short (${renderable.rect.height}px)`);
  if (renderable.present && renderable.rect.width < 760) failures.push(`rendered module is too narrow (${renderable.rect.width}px)`);
  if (!testCase.allowNoValues && renderable.present && !renderable.hasNumericValue) failures.push("rendered module has no visible numeric values");
  if (testCase.requireVisualStructure && renderable.present && renderable.visualStructureCount < 1) {
    failures.push("rendered module has no chart, table, row, or bar structure");
  }
  if (!testCase.allowEmptyState && renderable.emptyStateMatches.length) {
    failures.push(`unexpected empty/recovery state: ${renderable.emptyStateMatches.slice(0, 3).join(" | ")}`);
  }
  if (renderable.staleNameMatches.length) failures.push(`stale community name: ${renderable.staleNameMatches[0]}`);
  if (renderable.rawFacilityIdLeaks.length) failures.push(`raw facility id leaked: ${renderable.rawFacilityIdLeaks.slice(0, 3).join(" | ")}`);
  if (renderable.darkBlocks.length) failures.push(`large dark block in rendered module: ${renderable.darkBlocks[0].backgroundColor}`);
  if (rejectMatches.length) failures.push(`rejected text appeared: ${rejectMatches.join(", ")}`);
  if (canvas.horizontalOverflow > 8) failures.push(`horizontal overflow: ${canvas.horizontalOverflow}px`);

  const screenshotPath = path.join(screenshotDir, `${String(index + 1).padStart(2, "0")}-${slug(testCase.name)}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  return {
    name: testCase.name,
    kind: testCase.kind,
    prompt: testCase.prompt,
    url: page.url(),
    passed: failures.length === 0,
    failures,
    expected,
    canvas,
    pendingCanvas: turn.pendingCanvas,
    renderable: {
      ...renderable,
      text: undefined
    },
    screenshotPath
  };
}

function documentTextSample(renderable) {
  return renderable?.textSample ?? "";
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function main() {
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-surface-qa");
  const includeMarCases = process.env.BROWSER_SURFACE_INCLUDE_MAR === "true";
  const caseFilter = String(process.env.BROWSER_SURFACE_FILTER ?? "").trim().toLowerCase();
  const allCases = [...surfaceCases, ...visualCases, ...(includeMarCases ? marVisualCases : [])]
    .filter((testCase) => !caseFilter || `${testCase.name} ${testCase.prompt}`.toLowerCase().includes(caseFilter));
  if (!allCases.length) {
    throw new Error(`No browser surface cases matched BROWSER_SURFACE_FILTER=${caseFilter}.`);
  }
  const consoleErrors = [];
  const requestFailures = [];
  let page;

  await withBrowserQa(async (browser) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 920 }
    });
    page = await context.newPage();
    attachPageDiagnostics(page, { consoleErrors, requestFailures });
    await openChat(page);
    await assertScopedQuestionSearch(page);
    await assertCommunityRowClickThrough(page);

    const results = [];
    for (const [index, testCase] of allCases.entries()) {
      console.log(`surface QA ${index + 1}/${allCases.length}: ${testCase.name}`);
      const result = await runCase(page, testCase, index, screenshotDir);
      console.log(`surface QA ${result.passed ? "passed" : "failed"}: ${testCase.name}`);
      results.push(result);
    }

    const passed = results.every((result) => result.passed) && consoleErrors.length === 0 && requestFailures.length === 0;
    const report = {
      generatedAt: new Date().toISOString(),
      passed,
      summary: {
        cases: results.length,
        passedCases: results.filter((result) => result.passed).length,
        surfaceCases: results.filter((result) => result.kind === "surface").length,
        visualCases: results.filter((result) => result.kind === "visual").length,
        marCasesIncluded: includeMarCases,
        consoleErrors: consoleErrors.length,
        requestFailures: requestFailures.length
      },
      consoleErrors,
      requestFailures,
      results
    };

    await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));

    if (!passed) {
      const failed = results
        .filter((result) => !result.passed)
        .map((result) => ({
          name: result.name,
          prompt: result.prompt,
          url: result.url,
          failures: result.failures,
          screenshotPath: result.screenshotPath,
          renderable: result.renderable
        }));
      console.error(JSON.stringify({ summary: report.summary, failed, consoleErrors, requestFailures }, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log(`browser surface QA passed: ${report.summary.passedCases}/${report.summary.cases} cases`);
  }).catch(async (error) => {
    if (page) {
      await page.screenshot({ path: path.join(screenshotDir, "failure.png"), fullPage: true }).catch(() => {});
    }
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  });
}

await main();
