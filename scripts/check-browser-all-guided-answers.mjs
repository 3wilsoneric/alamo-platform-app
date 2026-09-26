#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCertifiedQuestionMenuRoutes } from "../shared/certified-analyst-questions.mjs";
import {
  ask,
  attachPageDiagnostics,
  openChat,
  prepareArtifactDirs,
  startCleanChat,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const ALL_VIEWPORTS = Object.freeze([
  { name: "wide", width: 1600, height: 1000 },
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
  { name: "compact", width: 320, height: 568 }
]);
const requestedViewport = String(process.env.BROWSER_GUIDED_VIEWPORT ?? "").trim().toLowerCase();
const VIEWPORTS = requestedViewport
  ? ALL_VIEWPORTS.filter((viewport) => viewport.name === requestedViewport)
  : ALL_VIEWPORTS;
const BATCH_SIZE = Math.max(1, Number(process.env.BROWSER_GUIDED_BATCH_SIZE ?? 24));
const CASE_LIMIT = Math.max(0, Number(process.env.BROWSER_GUIDED_LIMIT ?? 0));
const REQUESTED_KEYS = new Set(
  String(process.env.BROWSER_GUIDED_KEYS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const SCREENSHOT_QUESTION_KEYS = new Set([
  "community-month-status:1",
  "census-point-count:1",
  "community-comparison:1",
  "incident-detail-list:1",
  "resident-search:1",
  "medication-profile:1",
  "operating-snapshot:1"
]);
const POST_RENDER_SETTLE_MS = Math.max(250, Number(process.env.BROWSER_GUIDED_SETTLE_MS ?? 1_500));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function loadCases() {
  const report = JSON.parse(await readFile("generated/guided-answer-qa/latest.json", "utf8"));
  if (!Array.isArray(report.answers) || report.answers.length < 200) {
    throw new Error(`Expected at least 200 scored answers, received ${report.answers?.length ?? 0}`);
  }
  if (Number(report.failureCount ?? 0) > 0) {
    throw new Error(`Guided answer report has ${report.failureCount} failures; run check:guided-report-shape first`);
  }

  const menuRouteIds = new Set(getCertifiedQuestionMenuRoutes().map((route) => route.id));
  return report.answers.filter((expected) => (
    menuRouteIds.has(`${expected.questionId}:${Number(expected.promptOrdinal) - 1}`)
  )).map((expected, index) => ({
    ordinal: index + 1,
    questionKey: expected.questionKey,
    questionItemId: `${expected.questionId}:${Number(expected.promptOrdinal) - 1}`,
    questionId: expected.questionId,
    title: expected.title,
    searchText: Number(expected.promptOrdinal) === 1 ? expected.title : expected.prompt,
    promptTemplate: expected.prompt,
    prompt: expected.runPrompt,
    expected
  }));
}

async function readRenderedState(page) {
  return page.evaluate(() => {
    const workspace = document.querySelector('[data-chat-workspace-panel="true"]');
    const assistantItems = Array.from(document.querySelectorAll('[data-chat-item-id][data-chat-role="assistant"]'));
    const userItems = Array.from(document.querySelectorAll('[data-chat-item-id][data-chat-role="user"]'));
    const assistant = assistantItems.at(-1);
    const user = userItems.at(-1);
    const assistantRect = assistant?.getBoundingClientRect();
    const workspaceRect = workspace?.getBoundingClientRect();
    const modules = Array.from(document.querySelectorAll(
      "[data-chat-module-content-id], [data-chat-visual-module-id]"
    ));
    const moduleRect = modules.at(-1)?.getBoundingClientRect();
    const visualModules = Array.from(document.querySelectorAll("[data-chat-visual-module-id]")).map((module) => ({
      moduleId: String(module.getAttribute("data-chat-visual-module-id") || ""),
      renderer: String(module.getAttribute("data-chat-visual-renderer") || ""),
      kpiStripCount: module.querySelectorAll('[data-module-row="kpi-strip"]').length,
      text: String(module.textContent || "").replace(/\s+/g, " ").trim()
    }));
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const controls = workspace
      ? Array.from(workspace.querySelectorAll("button, a, select, input")).filter(visible)
      : [];
    const clippedControls = controls.map((control) => {
      const rect = control.getBoundingClientRect();
      return {
        label: String(control.getAttribute("aria-label") || control.textContent || "").trim().slice(0, 120),
        tagName: control.tagName.toLowerCase(),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        clientWidth: control.clientWidth,
        scrollWidth: control.scrollWidth
      };
    }).filter((control) => (
      control.left < -1 ||
      control.right > window.innerWidth + 1 ||
      (["button", "a"].includes(control.tagName) && control.scrollWidth > control.clientWidth + 2)
    ));
    const paragraphs = assistant
      ? Array.from(assistant.querySelectorAll("p")).map((paragraph) => String(paragraph.textContent || "").trim()).filter(Boolean)
      : [];
    const actionText = controls.map((control) => String(
      control.getAttribute("aria-label") || control.textContent || ""
    ).trim()).filter(Boolean);
    const documentElement = document.documentElement;

    return {
      assistantCount: assistantItems.length,
      userCount: userItems.length,
      userText: String(user?.textContent || ""),
      text: String(assistant?.textContent || ""),
      paragraphs,
      moduleCount: modules.length,
      visualModules,
      artifactActionCount: actionText.filter((label) => /download|csv|export/i.test(label)).length,
      routeActionCount: actionText.filter((label) => /open|surface/i.test(label)).length,
      clippedControls,
      horizontalOverflow: documentElement.scrollWidth - documentElement.clientWidth,
      assistantWidth: assistantRect ? Math.round(assistantRect.width) : null,
      assistantLeft: assistantRect ? Math.round(assistantRect.left) : null,
      assistantRight: assistantRect ? Math.round(assistantRect.right) : null,
      workspaceWidth: workspaceRect ? Math.round(workspaceRect.width) : null,
      moduleWidth: moduleRect ? Math.round(moduleRect.width) : null,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      freeTextComposerCount: document.querySelectorAll('textarea[placeholder*="Ask" i]').length,
      thinkingVisible: /Thinking through the data|Still working through the data/i.test(document.body.innerText || "")
      ,safeModeVisible: /Safe Mode|could not render/i.test(document.body.innerText || "")
      ,alertText: Array.from(document.querySelectorAll('[role="alert"]'))
        .map((alert) => String(alert.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
    };
  });
}

function validateRenderedState(testCase, state) {
  const failures = [];
  const renderedParagraphText = normalize(state.paragraphs.join(" "));
  const expectedAnswer = normalize(testCase.expected.answer);
  const expectedSurface = normalize(testCase.expected.surface);
  const expectedPrompt = normalize(testCase.prompt);
  const renderedPrompt = normalize(state.userText);
  const minimumWidth = state.viewportWidth <= 480 ? state.viewportWidth - 56 : state.viewportWidth * 0.8;
  const isConversationalSummary = (
    testCase.expected.visualType === "summary_card" &&
    testCase.questionId !== "medication-profile"
  );

  if (state.userCount !== 1) failures.push(`expected one user message, rendered ${state.userCount}`);
  if (state.assistantCount !== 1) failures.push(`expected one assistant answer, rendered ${state.assistantCount}`);
  if (!renderedPrompt.includes(expectedPrompt)) failures.push("rendered user question does not match the selected guided prompt");
  if (!expectedAnswer || !renderedParagraphText.includes(expectedAnswer)) {
    failures.push("rendered answer does not match the scored answer");
  }
  if (!state.paragraphs.length) failures.push("answer is not rendered as readable prose");
  if (!isConversationalSummary && expectedSurface && !normalize(state.text).includes(expectedSurface)) {
    failures.push(`expected surface was not rendered: ${expectedSurface}`);
  }
  if (!isConversationalSummary && !state.moduleCount && !state.artifactActionCount && !state.routeActionCount) {
    failures.push("answer rendered without a module, artifact, or route action");
  }
  if (isConversationalSummary) {
    const visual = state.visualModules.at(-1);
    if (visual?.renderer === "summary_card") {
      failures.push("conversational answer repeated itself as a summary-card module");
    }
  }
  if (testCase.questionId === "incident-detail-list") {
    const moduleText = state.visualModules.at(-1)?.text ?? "";
    const previewLabels = moduleText.match(/Showing\s+[\d,]+\s+of\s+[\d,]+\s+incidents/gi) ?? [];
    if (previewLabels.length !== 1) failures.push(`incident detail rendered ${previewLabels.length} preview-count labels`);
  }
  if (testCase.questionId === "medication-profile") {
    const moduleText = state.visualModules.at(-1)?.text ?? "";
    if (/\b(?:Resident MAR rows|not loaded|no monthly)\b|Refusals\s+—/i.test(moduleText)) {
      failures.push("medication profile rendered unavailable or row-oriented KPI copy");
    }
  }
  if (testCase.questionId === "medication-refusal-detail" && /\bTop result\b/i.test(state.visualModules.at(-1)?.text ?? "")) {
    failures.push("medication refusal chart repeats its leading row in a separate top-result block");
  }
  if ((state.assistantWidth ?? 0) < minimumWidth) {
    failures.push(`answer uses only ${state.assistantWidth ?? 0}px of the ${state.viewportWidth}px viewport`);
  }
  if (state.moduleWidth != null && state.moduleWidth < minimumWidth - 2) {
    failures.push(`module uses only ${state.moduleWidth}px of the ${state.viewportWidth}px viewport`);
  }
  if (state.horizontalOverflow > 1) failures.push(`page has ${state.horizontalOverflow}px horizontal overflow`);
  if (state.clippedControls.length) failures.push(`${state.clippedControls.length} visible controls are clipped or truncate their label`);
  if (state.assistantLeft != null && state.assistantLeft < -1) failures.push(`answer begins ${Math.abs(state.assistantLeft)}px outside the viewport`);
  if (state.assistantRight != null && state.assistantRight > state.viewportWidth + 1) failures.push(`answer ends ${state.assistantRight - state.viewportWidth}px outside the viewport`);
  if (state.freeTextComposerCount) failures.push("free-text composer reappeared on the guided-only surface");
  if (state.thinkingVisible) failures.push("answer remained in a thinking state");
  if (state.safeModeVisible) failures.push(`workspace entered Safe Mode${state.alertText.length ? `: ${state.alertText.join(" | ")}` : ""}`);

  return failures;
}

async function openBatch(browser, viewport, diagnostics) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  attachPageDiagnostics(page, diagnostics);
  await openChat(page);
  return { context, page };
}

async function runViewport(browser, viewport, cases, screenshotDir, diagnostics) {
  const results = [];
  let activeBatch = null;
  let batchAnswerCount = 0;

  for (const [index, testCase] of cases.entries()) {
    if (!activeBatch || batchAnswerCount >= BATCH_SIZE) {
      await activeBatch?.context.close();
      activeBatch = await openBatch(browser, viewport, diagnostics);
      batchAnswerCount = 0;
    }

    if (index === 0 || (index + 1) % 10 === 0 || index + 1 === cases.length) {
      console.log(`${viewport.name} all-guided QA ${index + 1}/${cases.length}: ${testCase.questionKey}`);
    }

    let state = null;
    let failures = [];
    let screenshotPath = null;
    let attempts = 0;
    while (attempts < 2) {
      attempts += 1;
      try {
        await startCleanChat(activeBatch.page);
        await ask(activeBatch.page, testCase.prompt, index + 1, {
          questionItemId: testCase.questionItemId,
          questionId: testCase.questionId,
          promptTemplate: testCase.promptTemplate,
          searchText: testCase.searchText
        });
        await activeBatch.page.waitForTimeout(POST_RENDER_SETTLE_MS);
        state = await readRenderedState(activeBatch.page);
        failures = validateRenderedState(testCase, state);
        const blankTransitionFailure = state.userCount === 0 && state.assistantCount === 0;
        if (attempts === 1 && blankTransitionFailure) {
          console.log(`${viewport.name} all-guided QA retrying blank transition for ${testCase.questionKey}`);
          await activeBatch.context.close().catch(() => {});
          activeBatch = await openBatch(browser, viewport, diagnostics);
          batchAnswerCount = 0;
          continue;
        }
        break;
      } catch (error) {
        const bodyText = await activeBatch.page.locator("body").innerText().catch(() => "");
        const message = error instanceof Error ? error.message : String(error);
        const transientSetupFailure = (
          /Loading workspace/i.test(bodyText) ||
          /Timeout .* exceeded|waiting for locator|navigation|detached|Target page/i.test(message)
        );
        if (attempts === 1 && transientSetupFailure) {
          console.log(`${viewport.name} all-guided QA retrying transient setup for ${testCase.questionKey}`);
          await activeBatch.context.close().catch(() => {});
          activeBatch = await openBatch(browser, viewport, diagnostics);
          batchAnswerCount = 0;
          continue;
        }
        failures = [message];
        break;
      }
    }

    if (failures.length || SCREENSHOT_QUESTION_KEYS.has(testCase.questionKey)) {
      screenshotPath = path.join(
        screenshotDir,
        `${viewport.name}-${String(testCase.ordinal).padStart(3, "0")}-${testCase.questionKey.replace(/:/g, "-")}.png`
      );
      await activeBatch.page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
    }

    results.push({
      viewport: viewport.name,
      questionKey: testCase.questionKey,
      questionItemId: testCase.questionItemId,
      ordinal: testCase.ordinal,
      prompt: testCase.prompt,
      expectedAnswer: testCase.expected.answer,
      expectedTool: testCase.expected.actualTool,
      expectedSurface: testCase.expected.surface,
      attempts,
      passed: failures.length === 0,
      failures,
      state,
      screenshotPath
    });

    batchAnswerCount += 1;
    if (failures.some((failure) => /closed|timeout|navigation|detached/i.test(failure))) {
      await activeBatch.context.close().catch(() => {});
      activeBatch = null;
    }
  }

  await activeBatch?.context.close();
  return results;
}

async function main() {
  if (!VIEWPORTS.length) throw new Error(`Unknown BROWSER_GUIDED_VIEWPORT: ${requestedViewport}`);
  const allCases = await loadCases();
  const selectedCases = REQUESTED_KEYS.size
    ? allCases.filter((testCase) => REQUESTED_KEYS.has(testCase.questionKey))
    : allCases;
  const cases = CASE_LIMIT ? selectedCases.slice(0, CASE_LIMIT) : selectedCases;
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-all-guided-answer-qa");
  const consoleErrors = [];
  const requestFailures = [];
  const results = [];

  await withBrowserQa(async (browser) => {
    for (const viewport of VIEWPORTS) {
      results.push(...await runViewport(browser, viewport, cases, screenshotDir, { consoleErrors, requestFailures }));
    }
  });

  const failedResults = results.filter((result) => !result.passed);
  const passed = failedResults.length === 0 && consoleErrors.length === 0 && requestFailures.length === 0;
  const report = {
    generatedAt: new Date().toISOString(),
    passed,
    summary: {
      catalogAnswers: cases.length,
      totalCatalogAnswers: allCases.length,
      viewports: VIEWPORTS.length,
      expectedRenders: cases.length * VIEWPORTS.length,
      renderedAnswers: results.length,
      passedAnswers: results.filter((result) => result.passed).length,
      failedAnswers: failedResults.length,
      retriedAnswers: results.filter((result) => result.attempts > 1).length,
      consoleErrors: consoleErrors.length,
      requestFailures: requestFailures.length
    },
    failures: failedResults.map((result) => ({
      viewport: result.viewport,
      questionKey: result.questionKey,
      prompt: result.prompt,
      failures: result.failures,
      screenshotPath: result.screenshotPath
    })),
    consoleErrors,
    requestFailures,
    results
  };

  await writeFile(path.join(artifactDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (!passed) {
    console.error(JSON.stringify({ summary: report.summary, failures: report.failures.slice(0, 30) }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(`browser all-guided QA passed (${report.summary.passedAnswers}/${report.summary.expectedRenders} renders for ${cases.length} catalog answers across ${VIEWPORTS.length} viewports)`);
}

await main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.stack ?? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
