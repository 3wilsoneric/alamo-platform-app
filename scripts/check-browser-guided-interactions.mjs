#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getCertifiedQuestionMenuRoutes,
  getCertifiedQuestionRoutes
} from "../shared/certified-analyst-questions.mjs";
import {
  ask,
  attachPageDiagnostics,
  openChat,
  prepareArtifactDirs,
  startCleanChat,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const ALL_VIEWPORTS = Object.freeze([
  { name: "desktop", width: 1280, height: 900 },
  { name: "compact", width: 320, height: 568 }
]);
const DOWNLOAD_QUESTION_IDS = new Set([
  "incident-freshness-troubleshoot",
  "incident-detail-list",
  "incident-row-export",
  "generic-detail-list",
  "data-availability"
]);
const EXPANDABLE_QUESTION_IDS = new Set(["incident-detail-list", "generic-detail-list"]);
const SCREENSHOT_KEYS = new Set(["incident-detail-list:1", "generic-detail-list:3"]);
const requestedViewport = String(process.env.BROWSER_GUIDED_INTERACTION_VIEWPORT ?? "").trim().toLowerCase();
const requestedKeys = new Set(
  String(process.env.BROWSER_GUIDED_INTERACTION_KEYS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const VIEWPORTS = requestedViewport
  ? ALL_VIEWPORTS.filter((viewport) => viewport.name === requestedViewport)
  : ALL_VIEWPORTS;

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function inspectCsv(text) {
  let inQuotes = false;
  let recordHasContent = false;
  let logicalRecords = 0;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      recordHasContent = true;
      if (inQuotes && text[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === "\n" && !inQuotes) {
      if (recordHasContent) logicalRecords += 1;
      recordHasContent = false;
    } else if (character !== "\r") {
      recordHasContent = true;
    }
  }
  if (recordHasContent) logicalRecords += 1;

  const firstLine = String(text.split(/\r?\n/, 1)[0] ?? "").replace(/^\uFEFF/, "");
  return {
    balancedQuotes: !inQuotes,
    header: firstLine,
    headerColumns: firstLine.split(",").length,
    dataRows: Math.max(0, logicalRecords - 1)
  };
}

async function loadCases() {
  const report = JSON.parse(await readFile("generated/guided-answer-qa/latest.json", "utf8"));
  const expectedAnswerCount = getCertifiedQuestionRoutes().length;
  if (!Array.isArray(report.answers) || report.answers.length !== expectedAnswerCount) {
    throw new Error(`Expected ${expectedAnswerCount} scored answers, received ${report.answers?.length ?? 0}`);
  }

  const menuRouteIds = new Set(getCertifiedQuestionMenuRoutes().map((route) => route.id));
  const cases = report.answers
    .filter((answer) => (
      DOWNLOAD_QUESTION_IDS.has(answer.questionId) &&
      menuRouteIds.has(`${answer.questionId}:${Number(answer.promptOrdinal) - 1}`)
    ))
    .map((answer) => ({
      questionKey: answer.questionKey,
      questionId: answer.questionId,
      questionItemId: `${answer.questionId}:${Number(answer.promptOrdinal) - 1}`,
      promptTemplate: answer.prompt,
      searchText: Number(answer.promptOrdinal) === 1 ? answer.title : answer.prompt,
      prompt: answer.runPrompt,
      expectedRows: Number(answer.artifactRowCount),
      expandable: EXPANDABLE_QUESTION_IDS.has(answer.questionId) && Number(answer.artifactRowCount) > 5
    }));

  if (!cases.length) throw new Error("No visible guided download answers were found");
  if (!cases.some((testCase) => testCase.expandable)) throw new Error("No visible expandable guided answer was found");
  if (cases.some((testCase) => !Number.isInteger(testCase.expectedRows) || testCase.expectedRows < 1)) {
    throw new Error("Every guided download answer must declare a positive artifact row count");
  }

  return requestedKeys.size
    ? cases.filter((testCase) => requestedKeys.has(testCase.questionKey))
    : cases;
}

async function readInteractionLayout(page) {
  return page.evaluate(() => {
    const assistant = Array.from(document.querySelectorAll('[data-chat-item-id][data-chat-role="assistant"]')).at(-1);
    const module = assistant?.querySelector("[data-chat-visual-module-id]");
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const clippedControls = assistant
      ? Array.from(assistant.querySelectorAll("button, a, select, input"))
          .filter(visible)
          .map((control) => {
            const rect = control.getBoundingClientRect();
            return {
              label: String(control.getAttribute("aria-label") || control.textContent || "").trim().slice(0, 100),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              clientWidth: control.clientWidth,
              scrollWidth: control.scrollWidth
            };
          })
          .filter((control) => (
            control.left < -1 ||
            control.right > window.innerWidth + 1 ||
            control.scrollWidth > control.clientWidth + 2
          ))
      : [];
    const documentElement = document.documentElement;
    const moduleRect = module?.getBoundingClientRect();

    return {
      scrollY: Math.round(window.scrollY),
      viewportHeight: window.innerHeight,
      horizontalOverflow: documentElement.scrollWidth - documentElement.clientWidth,
      clippedControls,
      moduleTop: moduleRect ? Math.round(moduleRect.top) : null,
      moduleWidth: moduleRect ? Math.round(moduleRect.width) : null,
      moduleText: String(module?.textContent || "").replace(/\s+/g, " ").trim(),
      incidentRows: assistant?.querySelectorAll('[data-module-row="incident-detail"]').length ?? 0,
      evidenceRows: assistant?.querySelectorAll('[data-module-row="evidence-table"]').length ?? 0
    };
  });
}

function validateLayout(layout, stage) {
  const failures = [];
  if (layout.horizontalOverflow > 1) failures.push(`${stage} has ${layout.horizontalOverflow}px horizontal overflow`);
  if (layout.clippedControls.length) failures.push(`${stage} has clipped controls: ${JSON.stringify(layout.clippedControls)}`);
  return failures;
}

async function exerciseExpansion(assistant, page, testCase) {
  const renderButton = assistant.getByRole("button", {
    name: /^(?:Render preview|Show) [\d,]+ (?:records|incidents)$/i
  });
  const showAllButton = assistant.getByRole("button", { name: /^Show all [\d,]+ records$/i });
  const renderCount = await renderButton.count();
  const showAllCount = await showAllButton.count();
  const availableControls = renderCount + showAllCount;

  if (!testCase.expandable) {
    return {
      exercised: false,
      passed: availableControls === 0,
      failures: availableControls ? [`unexpected expansion control on a ${testCase.expectedRows}-row answer`] : [],
      initialLayout: await readInteractionLayout(page),
      expandedLayout: null,
      collapsedLayout: null
    };
  }
  if (availableControls !== 1) {
    return {
      exercised: false,
      passed: false,
      failures: [`expected one expansion control, found ${availableControls}`],
      initialLayout: await readInteractionLayout(page),
      expandedLayout: null,
      collapsedLayout: null
    };
  }

  const control = renderCount ? renderButton : showAllButton;
  // Match a real user taking scroll control before interacting with a module.
  // This also cancels the answer's bounded post-render snap retries.
  await page.mouse.wheel(0, 1);
  await page.waitForTimeout(20);
  await control.scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);
  const initialLayout = await readInteractionLayout(page);
  const initialLabel = normalize(await control.textContent());
  const initialControlBox = await control.boundingBox();
  const expectedVisibleRows = renderCount ? Math.min(50, testCase.expectedRows) : testCase.expectedRows;
  const rowNounPattern = testCase.questionId === "incident-detail-list" ? "incidents" : "records";
  await control.click();

  if (renderCount) {
    await assistant.getByText(
      new RegExp(
        `^Showing ${expectedVisibleRows.toLocaleString()} of ${testCase.expectedRows.toLocaleString()} ${rowNounPattern}$`,
        "i"
      )
    ).waitFor({ timeout: 10_000 });
    await assistant.getByRole("button", { name: /^Collapse preview$/i }).waitFor({ timeout: 10_000 });
  } else {
    await assistant.getByRole("button", { name: /^Show fewer records$/i }).waitFor({ timeout: 10_000 });
  }

  await page.waitForTimeout(100);
  const collapseButton = renderCount
    ? assistant.getByRole("button", { name: /^Collapse preview$/i })
    : assistant.getByRole("button", { name: /^Show fewer records$/i });
  const expandedControlBox = await collapseButton.boundingBox();
  const expandedLayout = await readInteractionLayout(page);
  const renderedRows = testCase.questionId === "incident-detail-list"
    ? expandedLayout.incidentRows
    : expandedLayout.evidenceRows;
  const failures = [
    ...validateLayout(initialLayout, "initial state"),
    ...validateLayout(expandedLayout, "expanded state")
  ];
  if (renderCount && !new RegExp(`(?:previewing|showing) 5 of ${testCase.expectedRows.toLocaleString()} ${rowNounPattern}`, "i").test(initialLayout.moduleText)) {
    failures.push(`initial module header does not report 5 of ${testCase.expectedRows} visible ${rowNounPattern}`);
  }
  if (renderedRows !== expectedVisibleRows) {
    failures.push(`one expansion click promised ${expectedVisibleRows} visible rows but rendered ${renderedRows}`);
  }
  if (renderCount && !new RegExp(`showing ${expectedVisibleRows.toLocaleString()} of ${testCase.expectedRows.toLocaleString()} ${rowNounPattern}`, "i").test(expandedLayout.moduleText)) {
    failures.push(`expanded module header does not report ${expectedVisibleRows} of ${testCase.expectedRows} visible ${rowNounPattern}`);
  }
  if (!initialControlBox || !expandedControlBox) {
    failures.push("expansion control was not measurable before and after expansion");
  } else {
    const controlDrift = Math.abs(expandedControlBox.y - initialControlBox.y);
    if (controlDrift > 160) {
      failures.push(`expansion moved the active control by ${Math.round(controlDrift)}px instead of preserving the user's reading position`);
    }
    if (expandedControlBox.y < -2 || expandedControlBox.y + expandedControlBox.height > expandedLayout.viewportHeight + 2) {
      failures.push("expansion moved the active control outside the viewport");
    }
  }

  await collapseButton.click();
  const restoredControl = assistant.getByRole("button", {
    name: new RegExp(`^${initialLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
  });
  await restoredControl.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(100);
  const collapsedControlBox = await restoredControl.boundingBox();
  const collapsedLayout = await readInteractionLayout(page);
  const collapsedRows = testCase.questionId === "incident-detail-list"
    ? collapsedLayout.incidentRows
    : collapsedLayout.evidenceRows;
  failures.push(...validateLayout(collapsedLayout, "collapsed state"));
  if (collapsedRows !== Math.min(5, testCase.expectedRows)) {
    failures.push(`collapse should restore 5 visible rows, rendered ${collapsedRows}`);
  }
  if (renderCount && !new RegExp(`(?:previewing|showing) 5 of ${testCase.expectedRows.toLocaleString()} ${rowNounPattern}`, "i").test(collapsedLayout.moduleText)) {
    failures.push(`collapsed module header does not report 5 of ${testCase.expectedRows} visible ${rowNounPattern}`);
  }
  if (!expandedControlBox || !collapsedControlBox) {
    failures.push("expansion control was not measurable before and after collapse");
  } else {
    const controlDrift = Math.abs(collapsedControlBox.y - expandedControlBox.y);
    if (controlDrift > 160) {
      failures.push(`collapse moved the active control by ${Math.round(controlDrift)}px instead of preserving the user's reading position`);
    }
    if (collapsedControlBox.y < -2 || collapsedControlBox.y + collapsedControlBox.height > collapsedLayout.viewportHeight + 2) {
      failures.push("collapse moved the active control outside the viewport");
    }
  }

  return {
    exercised: true,
    passed: failures.length === 0,
    failures,
    initialLabel,
    expectedVisibleRows,
    renderedRows,
    collapsedRows,
    initialControlBox,
    expandedControlBox,
    collapsedControlBox,
    initialLayout,
    expandedLayout,
    collapsedLayout
  };
}

async function exerciseDownload(assistant, page, testCase) {
  const button = assistant.getByRole("button", { name: /^Download .+\.csv$/i });
  const buttonCount = await button.count();
  if (buttonCount !== 1) {
    return {
      passed: false,
      failures: [`expected one CSV download button, found ${buttonCount}`]
    };
  }

  const label = normalize(await button.textContent());
  const expectedFilename = label.replace(/^Download\s+/i, "");
  const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
  await button.click();
  const download = await downloadPromise;
  const failure = await download.failure();
  const suggestedFilename = download.suggestedFilename();
  const downloadPath = failure ? null : await download.path();
  const content = downloadPath ? await readFile(downloadPath, "utf8") : "";
  const csv = inspectCsv(content);
  const failures = [];

  if (failure) failures.push(`browser download failed: ${failure}`);
  if (!/\.csv$/i.test(suggestedFilename)) failures.push(`download is not a CSV: ${suggestedFilename}`);
  if (suggestedFilename !== expectedFilename) failures.push(`button promised ${expectedFilename}, browser received ${suggestedFilename}`);
  if (Buffer.byteLength(content, "utf8") < 10) failures.push("downloaded CSV is empty");
  if (!csv.balancedQuotes) failures.push("downloaded CSV has unbalanced quotes");
  if (csv.headerColumns < 2) failures.push(`downloaded CSV header is malformed: ${csv.header}`);
  if (csv.dataRows !== testCase.expectedRows) {
    failures.push(`download promised ${testCase.expectedRows.toLocaleString()} records but contains ${csv.dataRows.toLocaleString()}`);
  }
  if (/\[object Object\]|undefined/i.test(csv.header)) failures.push(`downloaded CSV header contains an invalid value: ${csv.header}`);

  return {
    passed: failures.length === 0,
    failures,
    label,
    expectedFilename,
    suggestedFilename,
    bytes: Buffer.byteLength(content, "utf8"),
    csv
  };
}

async function runCase(page, testCase, viewport, ordinal, screenshotDir) {
  const failures = [];
  let download = null;
  let expansion = null;
  let screenshotPath = null;

  try {
    await startCleanChat(page);
    await ask(page, testCase.prompt, ordinal, {
      questionItemId: testCase.questionItemId,
      questionId: testCase.questionId,
      promptTemplate: testCase.promptTemplate,
      searchText: testCase.searchText
    });
    const assistant = page.locator('[data-chat-item-id][data-chat-role="assistant"]').last();
    download = await exerciseDownload(assistant, page, testCase);
    expansion = await exerciseExpansion(assistant, page, testCase);
    failures.push(...download.failures, ...expansion.failures);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  if (failures.length || SCREENSHOT_KEYS.has(testCase.questionKey)) {
    screenshotPath = path.join(
      screenshotDir,
      `${viewport.name}-${String(ordinal).padStart(2, "0")}-${testCase.questionKey.replace(/:/g, "-")}.png`
    );
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
  }

  return {
    viewport: viewport.name,
    questionKey: testCase.questionKey,
    prompt: testCase.prompt,
    expectedRows: testCase.expectedRows,
    passed: failures.length === 0,
    failures,
    download,
    expansion,
    screenshotPath
  };
}

async function main() {
  if (!VIEWPORTS.length) throw new Error(`Unknown BROWSER_GUIDED_INTERACTION_VIEWPORT: ${requestedViewport}`);
  const cases = await loadCases();
  if (!cases.length) throw new Error("No guided interaction cases matched the requested keys");
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-guided-interaction-qa");
  const consoleErrors = [];
  const requestFailures = [];
  const results = [];

  await withBrowserQa(async (browser) => {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        acceptDownloads: true
      });
      const page = await context.newPage();
      attachPageDiagnostics(page, { consoleErrors, requestFailures });
      await openChat(page);

      for (const [index, testCase] of cases.entries()) {
        console.log(`${viewport.name} guided interaction QA ${index + 1}/${cases.length}: ${testCase.questionKey}`);
        results.push(await runCase(page, testCase, viewport, index + 1, screenshotDir));
      }
      await context.close();
    }
  });

  const failures = results.filter((result) => !result.passed);
  const expansionResults = results.filter((result) => result.expansion?.exercised);
  const passed = failures.length === 0 && consoleErrors.length === 0 && requestFailures.length === 0;
  const report = {
    generatedAt: new Date().toISOString(),
    passed,
    summary: {
      catalogDownloadAnswers: cases.length,
      viewports: VIEWPORTS.length,
      expectedDownloads: cases.length * VIEWPORTS.length,
      passedDownloads: results.filter((result) => result.download?.passed).length,
      expectedExpansions: cases.filter((testCase) => testCase.expandable).length * VIEWPORTS.length,
      passedExpansions: expansionResults.filter((result) => result.passed).length,
      failedAnswers: failures.length,
      consoleErrors: consoleErrors.length,
      requestFailures: requestFailures.length
    },
    failures: failures.map((result) => ({
      viewport: result.viewport,
      questionKey: result.questionKey,
      failures: result.failures,
      screenshotPath: result.screenshotPath
    })),
    consoleErrors,
    requestFailures,
    results
  };

  await writeFile(path.join(artifactDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (!passed) {
    console.error(JSON.stringify({ summary: report.summary, failures: report.failures }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(
    `browser guided interaction QA passed: ${report.summary.passedDownloads}/${report.summary.expectedDownloads} downloads and ` +
    `${report.summary.passedExpansions}/${report.summary.expectedExpansions} expansions`
  );
}

await main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.stack ?? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
