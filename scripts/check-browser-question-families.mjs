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

const VIEWPORTS = Object.freeze([
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 }
]);

const SCREENSHOT_FAMILIES = new Set([
  "community-month-status",
  "incident-detail-list",
  "medication-profile",
  "resident-search"
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

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function loadCases() {
  const report = JSON.parse(await readFile("generated/guided-answer-qa/latest.json", "utf8"));
  return getCertifiedQuestionMenuRoutes().map((route, index) => {
    const promptTemplate = route.prompt;
    const prompt = renderPromptVariables(route.runPrompt);
    const expected = report.answers.find((answer) => (
      answer.questionId === route.familyId &&
      Number(answer.promptOrdinal) - 1 === route.variantIndex
    ));
    if (!expected) throw new Error(`No scored guided answer found for ${route.id}: ${prompt}`);
    return {
      ordinal: index + 1,
      questionId: route.familyId,
      questionItemId: route.id,
      title: route.question.title,
      promptTemplate,
      prompt,
      expected
    };
  });
}

async function readRenderedState(page) {
  return page.evaluate(() => {
    const assistantItems = Array.from(document.querySelectorAll('[data-chat-item-id][data-chat-role="assistant"]'));
    const assistant = assistantItems.at(-1);
    const assistantRect = assistant?.getBoundingClientRect();
    const controls = assistant ? Array.from(assistant.querySelectorAll("button, a, select, input")) : [];
    const clippedControls = controls.map((control) => {
      const rect = control.getBoundingClientRect();
      return {
        label: String(control.getAttribute("aria-label") || control.textContent || "").trim(),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom)
      };
    }).filter((control) => control.left < -1 || control.right > window.innerWidth + 1);
    // Registered product surfaces render as the next timeline item beside their
    // assistant introduction; generated analyst visuals render inside the answer.
    const moduleCount = document.querySelectorAll(
      "[data-chat-module-content-id], [data-chat-visual-module-id]"
    ).length;
    const artifactActionCount = controls.filter((control) => /download|csv|export/i.test(String(control.getAttribute("aria-label") || control.textContent || ""))).length;
    const routeActionCount = controls.filter((control) => /open|surface/i.test(String(control.getAttribute("aria-label") || control.textContent || ""))).length;
    const paragraphs = assistant ? Array.from(assistant.querySelectorAll("p")).map((paragraph) => String(paragraph.textContent || "").trim()).filter(Boolean) : [];
    const documentElement = document.documentElement;

    return {
      assistantCount: assistantItems.length,
      text: String(assistant?.textContent || ""),
      paragraphs,
      moduleCount,
      artifactActionCount,
      routeActionCount,
      clippedControls,
      horizontalOverflow: documentElement.scrollWidth - documentElement.clientWidth,
      assistantWidth: assistantRect ? Math.round(assistantRect.width) : null,
      assistantLeft: assistantRect ? Math.round(assistantRect.left) : null,
      assistantRight: assistantRect ? Math.round(assistantRect.right) : null,
      viewportWidth: window.innerWidth,
      freeTextComposerCount: document.querySelectorAll('textarea[placeholder*="Ask" i]').length,
      thinkingVisible: /Thinking through the data|Still working through the data/i.test(document.body.innerText || "")
    };
  });
}

function validateRenderedState(testCase, state) {
  const failures = [];
  const renderedText = normalize(state.text);
  const renderedParagraphText = normalize(state.paragraphs.join(" "));
  const expectedAnswer = normalize(testCase.expected.answer);
  const expectedSurface = normalize(testCase.expected.surface);
  const expectsSubstantiveSurface = testCase.expected.visualType !== "summary_card";

  if (!state.assistantCount) failures.push("no assistant answer rendered");
  if (!expectedAnswer || !renderedParagraphText.includes(expectedAnswer)) failures.push("rendered lead does not match the scored answer");
  if (expectsSubstantiveSurface && expectedSurface && !renderedText.includes(expectedSurface)) failures.push(`expected surface was not rendered: ${expectedSurface}`);
  if (expectedAnswer && !renderedParagraphText.includes(expectedAnswer)) failures.push("scored lead is not rendered as readable chat paragraphs");
  if (expectsSubstantiveSurface && !state.moduleCount && !state.artifactActionCount && !state.routeActionCount) {
    failures.push("analytical answer rendered without its module, artifact, or route action");
  }
  if (state.horizontalOverflow > 1) failures.push(`page has ${state.horizontalOverflow}px horizontal overflow`);
  if (state.clippedControls.length) failures.push(`${state.clippedControls.length} answer controls are clipped horizontally`);
  if (state.assistantLeft != null && state.assistantLeft < -1) failures.push(`answer begins ${Math.abs(state.assistantLeft)}px outside the viewport`);
  if (state.assistantRight != null && state.assistantRight > state.viewportWidth + 1) failures.push(`answer ends ${state.assistantRight - state.viewportWidth}px outside the viewport`);
  if (state.freeTextComposerCount) failures.push("free-text composer reappeared on the guided-only surface");
  if (state.thinkingVisible) failures.push("answer remained in a thinking state");

  return failures;
}

async function runViewport(browser, viewport, cases, screenshotDir, diagnostics) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  attachPageDiagnostics(page, diagnostics);
  await openChat(page);

  const results = [];
  for (const [index, testCase] of cases.entries()) {
    console.log(`${viewport.name} question-family QA ${index + 1}/${cases.length}: ${testCase.questionId}`);
    await startCleanChat(page);
    await ask(page, testCase.prompt, index + 1, {
      questionId: testCase.questionId,
      questionItemId: testCase.questionItemId,
      promptTemplate: testCase.promptTemplate,
      searchText: testCase.prompt
    });
    const state = await readRenderedState(page);
    const failures = validateRenderedState(testCase, state);
    let screenshotPath = null;

    if (failures.length || SCREENSHOT_FAMILIES.has(testCase.questionId)) {
      screenshotPath = path.join(screenshotDir, `${viewport.name}-${String(testCase.ordinal).padStart(2, "0")}-${testCase.questionId}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    results.push({
      viewport: viewport.name,
      questionId: testCase.questionId,
      ordinal: testCase.ordinal,
      prompt: testCase.prompt,
      expectedAnswer: testCase.expected.answer,
      expectedTool: testCase.expected.actualTool,
      expectedSurface: testCase.expected.surface,
      passed: failures.length === 0,
      failures,
      state,
      screenshotPath
    });
  }

  await context.close();
  return results;
}

async function main() {
  const cases = await loadCases();
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-question-family-qa");
  const consoleErrors = [];
  const requestFailures = [];
  const results = [];

  await withBrowserQa(async (browser) => {
    for (const viewport of VIEWPORTS) {
      results.push(...await runViewport(browser, viewport, cases, screenshotDir, { consoleErrors, requestFailures }));
    }
  });

  const passed = results.every((result) => result.passed) && consoleErrors.length === 0 && requestFailures.length === 0;
  const report = {
    generatedAt: new Date().toISOString(),
    passed,
    summary: {
      families: cases.length,
      viewports: VIEWPORTS.length,
      renderedAnswers: results.length,
      passedAnswers: results.filter((result) => result.passed).length,
      failedAnswers: results.filter((result) => !result.passed).length,
      consoleErrors: consoleErrors.length,
      requestFailures: requestFailures.length
    },
    consoleErrors,
    requestFailures,
    results
  };

  await writeFile(path.join(artifactDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (!passed) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(`browser question-family QA passed (${report.summary.passedAnswers}/${report.summary.renderedAnswers} rendered answers across ${report.summary.families} families and ${report.summary.viewports} viewports)`);
}

await main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.stack ?? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
