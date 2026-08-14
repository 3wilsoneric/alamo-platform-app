#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCertifiedQuestionMenuRoutes } from "../shared/certified-analyst-questions.mjs";
import {
  attachPageDiagnostics,
  openChat,
  prepareArtifactDirs,
  startCleanChat,
  waitForThinkingToFinish,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const ALL_VIEWPORTS = Object.freeze([
  { name: "desktop", width: 1280, height: 900 },
  { name: "compact", width: 320, height: 568 }
]);
const requestedViewport = String(process.env.BROWSER_GUIDED_ACCESSIBILITY_VIEWPORT ?? "").trim().toLowerCase();
const VIEWPORTS = requestedViewport
  ? ALL_VIEWPORTS.filter((viewport) => viewport.name === requestedViewport)
  : ALL_VIEWPORTS;

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
  return report.answers.filter((answer) => (
    menuRouteIds.has(`${answer.questionId}:${Number(answer.promptOrdinal) - 1}`)
  )).map((answer, index) => ({
    ordinal: index + 1,
    questionKey: answer.questionKey,
    questionId: answer.questionId,
    questionItemId: `${answer.questionId}:${Number(answer.promptOrdinal) - 1}`,
    promptTemplate: answer.prompt,
    searchText: Number(answer.promptOrdinal) === 1 ? answer.title : answer.prompt,
    hasVariables: /\{[a-zA-Z0-9_-]+\}/.test(answer.prompt)
  }));
}

async function ensureQuestionGuideOpen(page) {
  const guide = page.locator('[data-certified-question-guide="true"]').first();
  if (await guide.isVisible().catch(() => false)) return guide;

  const openButton = page.getByRole("button", { name: /^(Ask a question|Questions|Open questions)$/i }).first();
  await openButton.click({ timeout: 10_000 });
  await guide.waitFor({ state: "visible", timeout: 10_000 });
  return guide;
}

async function inspectControl(page, testCase) {
  const guide = await ensureQuestionGuideOpen(page);
  const search = guide.locator('[data-certified-question-search="true"]');
  await search.fill(testCase.searchText);

  const control = guide.locator(
    `[data-certified-question-button="true"][data-certified-question-id="${testCase.questionItemId}"]`
  );
  await control.waitFor({ state: "visible", timeout: 10_000 });

  return control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const promptText = element.querySelector('[data-certified-question-prompt-text="true"]');
    const submit = element.querySelector('[data-certified-question-submit="true"]');
    const triggers = Array.from(element.querySelectorAll('[data-question-variable-trigger="true"]'));
    const promptStyle = promptText ? window.getComputedStyle(promptText) : null;
    const documentElement = document.documentElement;

    return {
      tagName: element.tagName,
      role: element.getAttribute("role"),
      label: String(submit?.getAttribute("aria-label") || ""),
      prompt: String(element.getAttribute("data-certified-question-prompt") || ""),
      itemId: String(element.getAttribute("data-certified-question-id") || ""),
      nestedInteractive: element.querySelectorAll("button, a, input, select, textarea, [role=button]").length,
      triggerCount: triggers.length,
      triggerLabels: triggers.map((trigger) => String(trigger.getAttribute("aria-label") || "")),
      triggerStyles: triggers.map((trigger) => {
        const style = window.getComputedStyle(trigger);
        return {
          backgroundColor: style.backgroundColor,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          borderTopWidth: style.borderTopWidth,
          borderRightWidth: style.borderRightWidth,
          borderBottomWidth: style.borderBottomWidth,
          borderLeftWidth: style.borderLeftWidth
        };
      }),
      submitCount: submit ? 1 : 0,
      submitTagName: submit?.tagName ?? null,
      submitType: submit?.getAttribute("type") ?? null,
      submitDisabled: submit instanceof HTMLButtonElement ? submit.disabled : null,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      viewportWidth: window.innerWidth,
      horizontalOverflow: documentElement.scrollWidth - documentElement.clientWidth,
      letterSpacing: promptStyle?.letterSpacing ?? null,
      promptFontSize: promptStyle?.fontSize ?? null
    };
  });
}

function validateControl(testCase, state) {
  const failures = [];
  const letterSpacing = state.letterSpacing === "normal" ? 0 : Number.parseFloat(state.letterSpacing);
  const expectedVariableCount = new Set(
    Array.from(testCase.promptTemplate.matchAll(/\{([a-zA-Z0-9_-]+)\}/g)).map((match) => match[1])
  ).size;

  if (state.tagName !== "DIV") failures.push(`question row uses ${state.tagName || "no element"} instead of a neutral group`);
  if (state.role) failures.push(`question row unexpectedly declares role=${state.role}`);
  if (state.triggerCount !== expectedVariableCount) {
    failures.push(`question row rendered ${state.triggerCount} custom selectors instead of ${expectedVariableCount}`);
  }
  if (state.submitCount !== 1) failures.push(`question row rendered ${state.submitCount} submit controls`);
  if (state.submitTagName !== "BUTTON") failures.push(`submit control uses ${state.submitTagName || "no element"} instead of a native button`);
  if (state.submitType !== "button") failures.push(`submit button has type ${state.submitType || "missing"}`);
  if (state.nestedInteractive !== expectedVariableCount + 1) {
    failures.push(`question row contains ${state.nestedInteractive} controls instead of ${expectedVariableCount + 1}`);
  }
  if (state.triggerLabels.some((label) => !normalize(label))) failures.push("a custom inline selector has no accessible label");
  state.triggerStyles.forEach((style) => {
    if (style.backgroundColor !== "rgba(0, 0, 0, 0)") failures.push(`inline selector has a filled background: ${style.backgroundColor}`);
    if (style.fontSize !== state.promptFontSize) {
      failures.push(`inline selector uses ${style.fontSize} instead of the ${state.promptFontSize} sentence typography`);
    }
    if (Number.parseInt(style.fontWeight, 10) < 600) failures.push(`inline selector uses font weight ${style.fontWeight}`);
    if (style.borderTopWidth !== "0px" || style.borderRightWidth !== "0px" || style.borderLeftWidth !== "0px") {
      failures.push("inline selector renders as a boxed control instead of sentence text");
    }
    if (style.borderBottomWidth !== "1px") failures.push(`inline selector underline is ${style.borderBottomWidth}`);
  });
  if (state.itemId !== testCase.questionItemId) failures.push(`control id changed to ${state.itemId}`);
  if (normalize(state.prompt) !== normalize(testCase.promptTemplate)) failures.push("visible prompt contract changed");
  if (!normalize(state.label).includes(normalize(testCase.promptTemplate))) failures.push("accessible name omits the full visible question");
  if (testCase.hasVariables && !/\bChoose\b/.test(state.label)) failures.push("variable-driven question does not announce its missing selections");
  if (!testCase.hasVariables && !/^Run:/i.test(state.label)) failures.push("ready question does not announce its run action");
  if (testCase.hasVariables && state.submitDisabled !== true) failures.push("submit is enabled before required inline selections");
  if (!testCase.hasVariables && state.submitDisabled !== false) failures.push("ready question submit is unexpectedly disabled");
  if (state.height < 44) failures.push(`question target is only ${state.height}px tall`);
  if (state.width < 44) failures.push(`question target is only ${state.width}px wide`);
  if (state.left < -1 || state.right > state.viewportWidth + 1) failures.push("question control extends outside the viewport");
  if (state.horizontalOverflow > 1) failures.push(`page has ${state.horizontalOverflow}px horizontal overflow`);
  if (!Number.isFinite(letterSpacing) || letterSpacing < 0) failures.push(`question text has invalid letter spacing: ${state.letterSpacing}`);

  return failures;
}

async function exerciseKeyboardJourney(page, testCase) {
  await startCleanChat(page);
  const guide = await ensureQuestionGuideOpen(page);
  const search = guide.locator('[data-certified-question-search="true"]');
  await search.fill(testCase.searchText);
  const control = guide.locator(
    `[data-certified-question-button="true"][data-certified-question-id="${testCase.questionItemId}"]`
  );
  await control.waitFor({ state: "visible", timeout: 10_000 });
  const itemCountBefore = await page.locator("[data-chat-item-id]").count();
  const failures = [];
  let inlineControls = null;
  const submit = control.locator('[data-certified-question-submit="true"]');

  if (testCase.hasVariables) {
    const expectedSelectCount = new Set(
      Array.from(testCase.promptTemplate.matchAll(/\{([a-zA-Z0-9_-]+)\}/g)).map((match) => match[1])
    ).size;
    const triggers = control.locator('[data-question-variable-trigger="true"]');
    const triggerCount = await triggers.count();
    const submitCount = await submit.count();
    const initiallyEnabled = submitCount === 1 ? await submit.isEnabled() : null;

    if (triggerCount !== expectedSelectCount) failures.push(`question rendered ${triggerCount} custom selectors instead of ${expectedSelectCount}`);
    if (submitCount !== 1) failures.push(`question rendered ${submitCount} submit buttons`);
    if (initiallyEnabled !== false) failures.push("submit is not disabled before required inline selections");

    const menuStates = [];
    for (let index = 0; index < triggerCount; index += 1) {
      const trigger = triggers.nth(index);
      await trigger.focus();
      await trigger.press("ArrowDown");
      const menu = page.locator('[data-question-variable-menu="true"]');
      await menu.waitFor({ state: "visible", timeout: 5_000 });
      const menuState = await menu.evaluate((element) => {
        const style = window.getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderTopWidth: style.borderTopWidth,
          optionCount: element.querySelectorAll('[data-question-variable-option]').length
        };
      });
      menuStates.push(menuState);
      if (menuState.backgroundColor !== "rgb(255, 255, 255)") failures.push(`custom selector menu background is ${menuState.backgroundColor}`);
      if (menuState.borderTopWidth !== "1px") failures.push(`custom selector menu border is ${menuState.borderTopWidth}`);
      if (menuState.optionCount < 1) failures.push("custom selector menu has no options");
      await page.waitForFunction(
        () => document.activeElement?.getAttribute("role") === "option",
        undefined,
        { timeout: 5_000 }
      ).catch((error) => {
        throw new Error(
          `Keyboard focus did not enter selector ${index + 1} for ${testCase.questionKey}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      });
      await page.keyboard.press("Enter");
      await menu.waitFor({ state: "detached", timeout: 5_000 });
    }
    await submit.waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForFunction(
      (questionItemId) => {
        const row = document.querySelector(
          `[data-certified-question-button="true"][data-certified-question-id="${questionItemId}"]`
        );
        const button = row?.querySelector('[data-certified-question-submit="true"]');
        return button instanceof HTMLButtonElement && !button.disabled;
      },
      testCase.questionItemId,
      { timeout: 5_000 }
    ).catch((error) => {
      throw new Error(
        `Submit stayed disabled after selecting ${triggerCount} values for ${testCase.questionKey}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
    inlineControls = {
      expectedSelectCount,
      triggerCount,
      submitCount,
      initiallyEnabled,
      menuStates
    };
  }
  await submit.press("Enter");

  await page.waitForFunction(
    (previousCount) => document.querySelectorAll("[data-chat-item-id]").length > previousCount,
    itemCountBefore,
    { timeout: 10_000 }
  );
  await waitForThinkingToFinish(page);
  await page.waitForFunction(
    () => {
      const assistants = Array.from(document.querySelectorAll('[data-chat-item-id][data-chat-role="assistant"]'));
      const rect = assistants.at(-1)?.getBoundingClientRect();
      return Boolean(rect && rect.top >= 68);
    },
    undefined,
    { timeout: 1_000 }
  );
  const finalState = await page.evaluate(() => ({
    assistantCount: document.querySelectorAll('[data-chat-item-id][data-chat-role="assistant"]').length,
    assistantTop: Math.round(
      Array.from(document.querySelectorAll('[data-chat-item-id][data-chat-role="assistant"]')).at(-1)?.getBoundingClientRect().top ?? -1
    ),
    guideVisible: Boolean(document.querySelector('[data-certified-question-guide="true"]')),
    freeTextComposerCount: document.querySelectorAll('textarea[placeholder*="Ask" i]').length,
    visibleBackToTopCount: Array.from(document.querySelectorAll('button[aria-label="Back to top"]'))
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length,
    viewportWidth: window.innerWidth,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));

  if (finalState.assistantCount !== 1) failures.push(`keyboard run rendered ${finalState.assistantCount} assistant answers`);
  if (finalState.assistantTop < 68) failures.push(`assistant lead is covered by the fixed header at ${finalState.assistantTop}px`);
  if (finalState.guideVisible) failures.push("question guide remained open after keyboard execution");
  if (finalState.freeTextComposerCount) failures.push("free-text composer appeared after keyboard execution");
  if (finalState.viewportWidth < 640 && finalState.visibleBackToTopCount) {
    failures.push("phone-width answer is covered by a floating back-to-top control");
  }
  if (finalState.horizontalOverflow > 1) failures.push(`keyboard answer has ${finalState.horizontalOverflow}px horizontal overflow`);

  return {
    questionKey: testCase.questionKey,
    kind: testCase.hasVariables ? "clarifier" : "direct",
    passed: failures.length === 0,
    failures,
    inlineControls,
    finalState
  };
}

async function runViewport(browser, viewport, cases, screenshotDir, diagnostics) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  attachPageDiagnostics(page, diagnostics);
  await openChat(page);
  await ensureQuestionGuideOpen(page);
  const controls = [];

  for (const [index, testCase] of cases.entries()) {
    if (index === 0 || (index + 1) % 25 === 0 || index + 1 === cases.length) {
      console.log(`${viewport.name} guided accessibility QA ${index + 1}/${cases.length}: ${testCase.questionKey}`);
    }
    try {
      const state = await inspectControl(page, testCase);
      const failures = validateControl(testCase, state);
      controls.push({
        viewport: viewport.name,
        questionKey: testCase.questionKey,
        questionItemId: testCase.questionItemId,
        label: state.label,
        passed: failures.length === 0,
        failures,
        state
      });
    } catch (error) {
      controls.push({
        viewport: viewport.name,
        questionKey: testCase.questionKey,
        questionItemId: testCase.questionItemId,
        label: null,
        passed: false,
        failures: [error instanceof Error ? error.message : String(error)],
        state: null
      });
    }
  }

  const labelCounts = controls.reduce((counts, result) => {
    if (result.label) counts.set(result.label, (counts.get(result.label) ?? 0) + 1);
    return counts;
  }, new Map());
  controls.forEach((result) => {
    if (result.label && (labelCounts.get(result.label) ?? 0) > 1) {
      result.failures.push(`accessible name is shared by ${labelCounts.get(result.label)} question controls`);
      result.passed = false;
    }
  });

  const variableCase = cases.find((testCase) => testCase.hasVariables);
  const directCase = cases.find((testCase) => testCase.questionId === "incident-current-snapshot" && !testCase.hasVariables) ??
    cases.find((testCase) => !testCase.hasVariables);
  if (!variableCase || !directCase) throw new Error("Could not identify keyboard journey fixtures");

  const guide = await ensureQuestionGuideOpen(page);
  await guide.locator('[data-certified-question-search="true"]').fill(variableCase.searchText);
  await guide.locator(
    `[data-certified-question-button="true"][data-certified-question-id="${variableCase.questionItemId}"]`
  ).waitFor({ state: "visible", timeout: 10_000 });
  const selectorScreenshotPath = path.join(screenshotDir, `${viewport.name}-inline-selector.png`);
  const firstTrigger = guide.locator(
    `[data-certified-question-button="true"][data-certified-question-id="${variableCase.questionItemId}"] [data-question-variable-trigger="true"]`
  ).first();
  await firstTrigger.click();
  await page.locator('[data-question-variable-menu="true"]').waitFor({ state: "visible", timeout: 5_000 });
  await page.screenshot({ path: selectorScreenshotPath, fullPage: false }).catch(() => {});
  await page.keyboard.press("Escape");

  const keyboardJourneys = [];
  for (const testCase of [variableCase, directCase]) {
    try {
      keyboardJourneys.push({
        viewport: viewport.name,
        ...await exerciseKeyboardJourney(page, testCase)
      });
    } catch (error) {
      keyboardJourneys.push({
        viewport: viewport.name,
        questionKey: testCase.questionKey,
        kind: testCase.hasVariables ? "clarifier" : "direct",
        passed: false,
        failures: [error instanceof Error ? error.message : String(error)],
        inlineControls: null,
        finalState: null
      });
    }
  }

  const screenshotPath = path.join(screenshotDir, `${viewport.name}-keyboard-answer.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
  await context.close();
  return { controls, keyboardJourneys, screenshotPaths: [selectorScreenshotPath, screenshotPath] };
}

async function main() {
  if (!VIEWPORTS.length) throw new Error(`Unknown BROWSER_GUIDED_ACCESSIBILITY_VIEWPORT: ${requestedViewport}`);
  const cases = await loadCases();
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-guided-accessibility-qa");
  const consoleErrors = [];
  const requestFailures = [];
  const controls = [];
  const keyboardJourneys = [];
  const screenshots = [];

  await withBrowserQa(async (browser) => {
    for (const viewport of VIEWPORTS) {
      const result = await runViewport(browser, viewport, cases, screenshotDir, { consoleErrors, requestFailures });
      controls.push(...result.controls);
      keyboardJourneys.push(...result.keyboardJourneys);
      screenshots.push(...result.screenshotPaths);
    }
  });

  const passedControls = controls.filter((result) => result.passed).length;
  const passedJourneys = keyboardJourneys.filter((result) => result.passed).length;
  const passed = passedControls === controls.length &&
    passedJourneys === keyboardJourneys.length &&
    consoleErrors.length === 0 &&
    requestFailures.length === 0;
  const report = {
    generatedAt: new Date().toISOString(),
    passed,
    summary: {
      catalogControls: cases.length,
      viewports: VIEWPORTS.length,
      expectedControls: cases.length * VIEWPORTS.length,
      inspectedControls: controls.length,
      passedControls,
      failedControls: controls.length - passedControls,
      expectedKeyboardJourneys: VIEWPORTS.length * 2,
      passedKeyboardJourneys: passedJourneys,
      failedKeyboardJourneys: keyboardJourneys.length - passedJourneys,
      consoleErrors: consoleErrors.length,
      requestFailures: requestFailures.length
    },
    failures: [
      ...controls.filter((result) => !result.passed),
      ...keyboardJourneys.filter((result) => !result.passed)
    ],
    consoleErrors,
    requestFailures,
    screenshots,
    controls,
    keyboardJourneys
  };

  await writeFile(path.join(artifactDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (!passed) {
    console.error(JSON.stringify({ summary: report.summary, failures: report.failures.slice(0, 30) }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(
    `browser guided accessibility QA passed: ${passedControls}/${controls.length} controls and ${passedJourneys}/${keyboardJourneys.length} keyboard journeys`
  );
}

await main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.stack ?? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
