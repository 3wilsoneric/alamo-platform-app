#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getCertifiedQuestionMenuRoutes } from "../shared/certified-analyst-questions.mjs";
import { ALAMO_FACILITIES } from "../shared/community-names.mjs";
import {
  ask,
  attachPageDiagnostics,
  openChat,
  prepareArtifactDirs,
  startCleanChat,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const failurePatterns = [
  /I (?:do not|don't) have (?:that|the) exact/i,
  /could not answer/i,
  /did not satisfy the analysis plan/i,
  /missing requested/i,
  /verified fallback/i,
  /Analysis tool unavailable/i,
  /Safe Mode/i,
  /could not render/i,
  /Invalid Date/i,
  /\bundefined\b/i,
  /Victoria's Place/i
];

function renderPrompt(template, communityName) {
  return String(template)
    .replaceAll("{community}", communityName)
    .replaceAll("{resident}", "Shannon Romero")
    .replaceAll("{incidentCategory}", "AWOL/Elopement")
    .replaceAll("{month}", "May 2026")
    .replaceAll("{startMonth}", "May 2026")
    .replaceAll("{endMonth}", "June 2026")
    .replaceAll("{medicationDetail}", "medication refusal detail");
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

async function readAnswerState(page) {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll("[data-chat-item-id]"));
    const assistantItems = items.filter((item) => item.getAttribute("data-chat-role") === "assistant");
    const moduleItems = Array.from(document.querySelectorAll("[data-chat-module-content-id]"));
    const visualItems = Array.from(document.querySelectorAll("[data-chat-visual-module-id]"));
    const text = items.map((item) => String(item.textContent ?? "")).join("\n");
    const documentElement = document.documentElement;
    const controls = items.flatMap((item) => Array.from(item.querySelectorAll("button, a, select, input")));
    const clippedControls = controls.filter((control) => {
      const rect = control.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1);
    }).map((control) => String(control.getAttribute("aria-label") || control.textContent || "").trim().slice(0, 100));

    return {
      text,
      itemCount: items.length,
      assistantCount: assistantItems.length,
      moduleCount: moduleItems.length,
      visualCount: visualItems.length,
      downloadCount: controls.filter((control) => /download|csv|export/i.test(String(control.getAttribute("aria-label") || control.textContent || ""))).length,
      hasNumericValue: /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?%?\b/.test(text),
      horizontalOverflow: documentElement.scrollWidth - documentElement.clientWidth,
      clippedControls
    };
  });
}

function validateAnswer(testCase, state) {
  const failures = [];
  const explicitlyUnavailable = /\b(?:not published|not loaded|unavailable)\b/i.test(state.text);
  if (!state.itemCount) failures.push("no chat response rendered");
  if (state.assistantCount !== 1) failures.push(`expected one assistant answer, got ${state.assistantCount}`);
  if (!state.text.includes(testCase.community.communityName)) failures.push("selected community is absent from the answer");
  if (testCase.question.id !== "module-surface" && !state.hasNumericValue && !explicitlyUnavailable) {
    failures.push("answer has no visible numeric result");
  }
  if (explicitlyUnavailable && !state.visualCount) failures.push("unavailable answer has no explicit status visual");
  if (state.horizontalOverflow > 1) failures.push(`page has ${state.horizontalOverflow}px horizontal overflow`);
  if (state.clippedControls.length) failures.push(`clipped controls: ${state.clippedControls.join(" | ")}`);
  for (const pattern of failurePatterns) {
    if (pattern.test(state.text)) failures.push(`failure text matched ${pattern}`);
  }
  return failures;
}

async function main() {
  const variants = getCertifiedQuestionMenuRoutes()
    .filter((route) => route.prompt.includes("{community}") || route.runPrompt.includes("{community}"))
    .map((route) => ({
      question: route.question,
      questionItemId: route.id,
      promptTemplate: route.prompt,
      runPromptTemplate: route.runPrompt,
      variantIndex: route.variantIndex
    }));
  const questionFamilies = new Set(variants.map((entry) => entry.question.id));
  const cases = variants.flatMap((entry) => ALAMO_FACILITIES.map((community) => ({ ...entry, community })));
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-community-question-qa");
  const consoleErrors = [];
  const requestFailures = [];
  const results = [];

  await withBrowserQa(async (browser) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 920 } });
    let page = await context.newPage();
    attachPageDiagnostics(page, { consoleErrors, requestFailures });
    await openChat(page);

    for (const [index, testCase] of cases.entries()) {
      if (index > 0 && index % 20 === 0) {
        await page.close();
        page = await context.newPage();
        attachPageDiagnostics(page, { consoleErrors, requestFailures });
        await openChat(page);
      }
      const prompt = renderPrompt(testCase.runPromptTemplate, testCase.community.communityName);
      const name = `${testCase.question.id} variant ${testCase.variantIndex + 1} / ${testCase.community.communityName}`;
      let state = null;
      let failures = [];
      let screenshotPath = null;
      try {
        await startCleanChat(page);
        await ask(page, prompt, index + 1, {
          questionId: testCase.question.id,
          questionItemId: testCase.questionItemId,
          promptTemplate: testCase.promptTemplate,
          searchText: testCase.promptTemplate
        });
        state = await readAnswerState(page);
        failures = validateAnswer(testCase, state);
      } catch (error) {
        failures = [error instanceof Error ? error.message : String(error)];
      }
      if (failures.length) {
        screenshotPath = path.join(screenshotDir, `${slug(name)}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      }
      results.push({
        name,
        questionId: testCase.question.id,
        facilityId: testCase.community.facilityId,
        communityName: testCase.community.communityName,
        prompt,
        passed: failures.length === 0,
        failures,
        state,
        screenshotPath
      });
      console.log(`community question ${index + 1}/${cases.length} ${failures.length ? "failed" : "passed"}: ${name}`);
    }
    await context.close();
  });

  const failed = results.filter((result) => !result.passed);
  const report = {
    generatedAt: new Date().toISOString(),
    passed: failed.length === 0 && consoleErrors.length === 0 && requestFailures.length === 0,
    summary: {
      questionFamilies: questionFamilies.size,
      questionVariants: variants.length,
      canonicalCommunities: ALAMO_FACILITIES.length,
      permutations: cases.length,
      passed: results.filter((result) => result.passed).length,
      failed: failed.length,
      consoleErrors: consoleErrors.length,
      requestFailures: requestFailures.length
    },
    consoleErrors,
    requestFailures,
    results
  };
  await writeFile(path.join(artifactDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) {
    console.error(JSON.stringify({ summary: report.summary, failed, consoleErrors, requestFailures }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(`community guided-question QA passed: ${report.summary.passed}/${report.summary.permutations} permutations`);
}

await main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.stack ?? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
