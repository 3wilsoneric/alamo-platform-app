#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  attachPageDiagnostics,
  ask,
  measureCanvas,
  openChat,
  prepareArtifactDirs,
  startCleanChat,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const cases = [
  {
    name: "Count answer stays focused",
    prompt: "How many residents had AWOL/Elopement incidents in May 2026?",
    selection: {
      questionItemId: "incident-unique-people-count:0",
      promptTemplate: "How many residents had {incidentCategory} incidents in {month}?",
      searchText: "Incident unique people count"
    },
    expect: [/63 unique residents|AWOL\/Elopement/i],
    exportIntent: false
  },
  {
    name: "Resident search stays focused",
    prompt: "Can you show me the Resident Search module?",
    selection: {
      questionItemId: "resident-search:0",
      promptTemplate: "Search the resident roster.",
      searchText: "Search the resident roster"
    },
    expect: [/Resident Search/i, /current resident/i],
    exportIntent: false
  },
  {
    name: "Exact detail owns its download",
    prompt: "Can you list every AWOL/Elopement incident from May 2026 through June 2026?",
    selection: {
      questionItemId: "incident-detail-list:0",
      promptTemplate: "Can you list every {incidentCategory} incident from {startMonth} through {endMonth}?",
      searchText: "Incident detail list"
    },
    expect: [/Download|csv|prepared/i],
    exportIntent: true
  }
];

const rejectedText = [
  /\bKeep going\b/i,
  /\bContinue\b/i,
  /\bOpen a related view, run the next slice, or export the rows\b/i,
  /\bSource:\s*local data tool\b/i,
  /\bChecked\s*·\s*local data\b/i,
  /\bVerified\s*·\s*local data\b/i,
  /\bvia\s+[a-z ]+\s*·\s*20\d{2}-\d{2}\s*·\s*[\d,]+\s+rows\b/i,
  /\bAnswer The\b/i
];

function serializePattern(pattern) {
  return {
    source: pattern.source,
    flags: pattern.flags
  };
}

async function waitForPatterns(page, patterns) {
  await page.waitForFunction(
    (items) => items.every(({ source, flags }) => new RegExp(source, flags).test(document.body.innerText || "")),
    patterns.map(serializePattern),
    { timeout: 30_000 }
  );
}

async function readActionState(page) {
  return page.evaluate(() => {
    const assistantItems = Array.from(document.querySelectorAll('[data-chat-item-id]:not([data-chat-role="user"])'));
    return assistantItems.map((item) => {
      const buttons = Array.from(item.querySelectorAll("button:not([data-module-content-control='true'])"))
        .map((button) => ({
          label: String(button.textContent || button.getAttribute("aria-label") || "").trim(),
          routeId: String(button.getAttribute("data-certified-question-route-id") || "").trim()
        }))
        .filter((action) => action.label)
        .filter((action) => !/^Remove chat result$/i.test(action.label));
      const text = String(item.textContent || "");
      return {
        text: text.slice(0, 1800),
        buttonActions: buttons,
        buttonLabels: buttons.map((action) => action.label),
        visibleActionLabels: buttons.map((action) => action.label).filter((label) => !/^Remove/i.test(label))
      };
    });
  });
}

async function runCase(page, testCase, index, screenshotDir) {
  await startCleanChat(page);
  await ask(page, testCase.prompt, index + 1, testCase.selection);
  await waitForPatterns(page, testCase.expect);

  const actionState = await readActionState(page);
  const bodyText = await page.evaluate(() => document.body.innerText || "");
  const canvas = await measureCanvas(page);
  const screenshotPath = path.join(screenshotDir, `${String(index + 1).padStart(2, "0")}-${testCase.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const failures = [];
  const newestAssistant = actionState.at(-1);
  const rejected = rejectedText.filter((pattern) => pattern.test(bodyText)).map(String);
  if (rejected.length) failures.push(`rejected clutter text appeared: ${rejected.join(", ")}`);

  for (const [messageIndex, message] of actionState.entries()) {
    const visibleActions = message.buttonActions.filter((action) => !/^Remove/i.test(action.label));
    const questionActions = visibleActions.filter((action) => action.routeId);
    const allowedUtilityActions = visibleActions.filter((action) => (
      /^(Save|Pin module)$/i.test(action.label) ||
      /^(Download|Export)/i.test(action.label) ||
      /^Show (?:\d+|fewer) incidents$/i.test(action.label)
    ));
    const unvettedActions = visibleActions.filter((action) => (
      !action.routeId && !allowedUtilityActions.includes(action)
    ));
    if (questionActions.length > 1) {
      failures.push(`assistant message ${messageIndex + 1} rendered ${questionActions.length} next-question actions`);
    }
    if (unvettedActions.length) {
      failures.push(`assistant message ${messageIndex + 1} rendered unvetted actions: ${unvettedActions.map((action) => action.label).join(", ")}`);
    }
    for (const pattern of [/^(Save|Pin module)$/i, /^(Download|Export)/i, /^Show (?:\d+|fewer) incidents$/i]) {
      if (visibleActions.filter((action) => pattern.test(action.label)).length > 1) {
        failures.push(`assistant message ${messageIndex + 1} repeated the ${pattern} control`);
      }
    }
  }

  const newestLabels = newestAssistant?.visibleActionLabels ?? [];
  const hasDownload = newestLabels.some((label) => /Download|CSV|Excel/i.test(label));
  if (!testCase.exportIntent && hasDownload) failures.push("download/export action appeared without explicit export intent");
  if (testCase.exportIntent && !hasDownload) failures.push("explicit export did not expose a download action");
  if (canvas.horizontalOverflow > 8) failures.push(`horizontal overflow: ${canvas.horizontalOverflow}px`);

  return {
    name: testCase.name,
    prompt: testCase.prompt,
    passed: failures.length === 0,
    failures,
    newestLabels,
    actionState,
    canvas,
    screenshotPath
  };
}

async function main() {
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-clutter-qa");
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

    const results = [];
    for (const [index, testCase] of cases.entries()) {
      console.log(`clutter QA ${index + 1}/${cases.length}: ${testCase.name}`);
      const result = await runCase(page, testCase, index, screenshotDir);
      console.log(`clutter QA ${result.passed ? "passed" : "failed"}: ${testCase.name}`);
      results.push(result);
    }

    const passed = results.every((result) => result.passed) && consoleErrors.length === 0 && requestFailures.length === 0;
    const report = {
      generatedAt: new Date().toISOString(),
      passed,
      summary: {
        cases: results.length,
        passedCases: results.filter((result) => result.passed).length,
        consoleErrors: consoleErrors.length,
        requestFailures: requestFailures.length
      },
      consoleErrors,
      requestFailures,
      results
    };

    await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));

    if (!passed) {
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log(`browser clutter QA passed: ${report.summary.passedCases}/${report.summary.cases} cases`);
  }).catch(async (error) => {
    if (page) {
      await page.screenshot({ path: path.join(screenshotDir, "failure.png"), fullPage: true }).catch(() => {});
    }
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  });
}

await main();
