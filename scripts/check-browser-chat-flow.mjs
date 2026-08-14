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
  waitForThinkingToFinish,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const TIMEOUT_MS = Number(process.env.BROWSER_CHAT_FLOW_TIMEOUT_MS || 30_000);
const UNIQUE_AWOL_PROMPT = "How many residents had AWOL/Elopement incidents in May 2026?";

async function latestAssistantText(page) {
  return page.evaluate(() => {
    const answers = Array.from(document.querySelectorAll('[data-chat-message-content="assistant"]'));
    return String(answers.at(-1)?.textContent || "");
  });
}

async function chatState(page) {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll("[data-chat-item-id]"));
    const userItems = Array.from(document.querySelectorAll('[data-chat-role="user"][data-chat-item-id]'));
    const assistantItems = items.filter((item) => item.getAttribute("data-chat-role") !== "user");
    const actionGroups = assistantItems.map((item) => ({
      text: String(item.textContent || "").slice(0, 500),
      actions: Array.from(item.querySelectorAll("button")).map((button) => String(button.textContent || button.getAttribute("aria-label") || "").trim()).filter(Boolean)
    }));

    return {
      itemCount: items.length,
      userItemCount: userItems.length,
      assistantItemCount: assistantItems.length,
      latestText: String(items.at(-1)?.textContent || "").slice(0, 1200),
      actionGroups
    };
  });
}

async function latestAnswerLayout(page) {
  return page.evaluate(() => {
    const workspace = document.querySelector('[data-chat-workspace-panel="true"]');
    const answers = Array.from(document.querySelectorAll('[data-chat-message-content="assistant"]'));
    const answer = answers.at(-1);
    const formattedText = answer?.querySelector('[data-formatted-message-text="true"]');
    const answerParagraph = formattedText?.querySelector("p");
    const module = answer?.parentElement?.querySelector('[data-chat-visual-module-id]');
    const workspaceRect = workspace?.getBoundingClientRect();
    const answerRect = answer?.getBoundingClientRect();
    const textRect = formattedText?.getBoundingClientRect();
    const paragraphRect = answerParagraph?.getBoundingClientRect();
    const paragraphStyle = answerParagraph
      ? window.getComputedStyle(answerParagraph)
      : null;
    const moduleRect = module?.getBoundingClientRect();

    return {
      viewportWidth: window.innerWidth,
      workspaceWidth: workspaceRect ? Math.round(workspaceRect.width) : null,
      answerWidth: answerRect ? Math.round(answerRect.width) : null,
      textWidth: textRect ? Math.round(textRect.width) : null,
      paragraphWidth: paragraphRect ? Math.round(paragraphRect.width) : null,
      paragraphFontWeight: paragraphStyle?.fontWeight ?? null,
      paragraphCount: formattedText?.querySelectorAll("p").length ?? 0,
      moduleWidth: moduleRect ? Math.round(moduleRect.width) : null,
      moduleRenderer: module?.getAttribute("data-chat-visual-renderer") ?? null
    };
  });
}

async function platformWordmarkState(page) {
  return page.evaluate(() => {
    const wordmark = document.querySelector('[data-platform-wordmark="true"]');
    const rect = wordmark?.getBoundingClientRect();
    const styles = wordmark ? window.getComputedStyle(wordmark) : null;
    return {
      found: Boolean(wordmark),
      width: rect ? Math.round(rect.width) : 0,
      opacity: styles ? Number(styles.opacity) : 0
    };
  });
}

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
    { timeout: 10_000 }
  );
}

async function storedAnalysisSession(page) {
  return page.evaluate(() => {
    const raw = window.sessionStorage.getItem("alamo-platform:analysis-session-v1");
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      return {
        sessionId: typeof parsed?.sessionId === "string" ? parsed.sessionId : null,
        frame: parsed?.frame ?? null
      };
    } catch {
      return {
        sessionId: null,
        frame: "parse-error"
      };
    }
  });
}

async function waitForText(page, pattern, timeout = TIMEOUT_MS) {
  await page.waitForFunction(
    ({ source, flags }) => new RegExp(source, flags).test(document.body.innerText || ""),
    { source: pattern.source, flags: pattern.flags },
    { timeout }
  );
}

async function runChatFlow(page, screenshotDir) {
  const failures = [];
  const checkpoints = [];
  const mark = (step) => console.log(`browser chat flow: ${step}`);

  mark("open clean workspace");
  await openChat(page);
  await startCleanChat(page);

  mark("full wordmark is visible at the root workspace");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await delay(400);
  const wordmarkAtTop = await platformWordmarkState(page);
  if (!wordmarkAtTop.found || wordmarkAtTop.width < 90 || wordmarkAtTop.opacity < 0.9) {
    failures.push(`full platform wordmark was not visible at the top: ${JSON.stringify(wordmarkAtTop)}`);
  }
  if (await page.locator('[data-chat-history-menu="true"]').count()) {
    failures.push("retired History control was visible in the workspace");
  }
  checkpoints.push({ step: "wordmark without history clutter", wordmarkAtTop });

  mark("surfacing a module closes the question menu");
  const questionGuide = page.locator('[data-certified-question-guide="true"]');
  if (!(await questionGuide.isVisible().catch(() => false))) {
    await page
      .getByRole("button", {
        name: /^(Ask a question|Questions|Open questions|Choose another question)$/i
      })
      .first()
      .click();
    await questionGuide.waitFor({ state: "visible", timeout: 8_000 });
  }
  await surfaceModule(page, "/communities", "Communities");
  if (await questionGuide.isVisible().catch(() => false)) {
    failures.push("question menu remained open after a surface was added to the thread");
  }
  if (!(await page.getByRole("button", { name: /Choose another question/i }).isVisible().catch(() => false))) {
    failures.push("surfaced module did not leave Choose another question reachable");
  }
  checkpoints.push({ step: "surface closes question menu", state: await chatState(page), canvas: await measureCanvas(page) });

  mark("surface resident search");
  await surfaceModule(page, "/resident-search", "Resident Search");
  await page.locator('[data-resident-search-module="true"]').last().waitFor({ state: "visible", timeout: TIMEOUT_MS });
  const residentSearch = page.getByLabel(/Search residents/i).last();
  await residentSearch.waitFor({ state: "visible", timeout: TIMEOUT_MS });
  await residentSearch.fill("Shannon");
  await page.getByRole("button", { name: /Shannon Romero/i }).first().click({ timeout: 8_000 });
  await waitForText(page, /Shannon Romero/i);
  await waitForText(page, /Resident #|Santa Clarita|Datasheet/i);
  checkpoints.push({ step: "resident search profile", state: await chatState(page), canvas: await measureCanvas(page) });

  mark("run guided AWOL people question");
  await ask(page, UNIQUE_AWOL_PROMPT, 2, {
    questionId: "incident-unique-people-count",
    questionItemId: "incident-unique-people-count:0",
    promptTemplate: "How many residents had {incidentCategory} incidents in {month}?",
    searchText: UNIQUE_AWOL_PROMPT
  });
  await waitForText(page, /63 unique residents|195 incident rows|AWOL\/Elopement/i);
  if (await questionGuide.isVisible().catch(() => false)) {
    failures.push("question menu remained open after a guided question started");
  }
  if (!(await page.getByRole("button", { name: /Choose another question/i }).isVisible().catch(() => false))) {
    failures.push("guided answer did not leave Choose another question reachable");
  }
  const guidedAnswerLayout = await latestAnswerLayout(page);
  checkpoints.push({ step: "guided question submit", state: await chatState(page), canvas: await measureCanvas(page), layout: guidedAnswerLayout });
  if ((guidedAnswerLayout.workspaceWidth ?? 0) < guidedAnswerLayout.viewportWidth * 0.84) {
    failures.push(`answer workspace is too narrow: ${JSON.stringify(guidedAnswerLayout)}`);
  }
  if ((guidedAnswerLayout.answerWidth ?? 0) < (guidedAnswerLayout.workspaceWidth ?? 0) * 0.9) {
    failures.push(`assistant answer does not use the workspace width: ${JSON.stringify(guidedAnswerLayout)}`);
  }
  if ((guidedAnswerLayout.textWidth ?? 0) < Math.min(1000, (guidedAnswerLayout.answerWidth ?? 0) - 40)) {
    failures.push(`answer prose column is too narrow: ${JSON.stringify(guidedAnswerLayout)}`);
  }
  if ((guidedAnswerLayout.paragraphWidth ?? 0) < Math.min(860, (guidedAnswerLayout.answerWidth ?? 0) - 40)) {
    failures.push(`answer paragraph measure is too narrow: ${JSON.stringify(guidedAnswerLayout)}`);
  }
  if (Number(guidedAnswerLayout.paragraphFontWeight ?? 700) > 500) {
    failures.push(`answer paragraph is too bold for conversational chat: ${JSON.stringify(guidedAnswerLayout)}`);
  }
  if (guidedAnswerLayout.moduleWidth != null && guidedAnswerLayout.moduleWidth < (guidedAnswerLayout.answerWidth ?? 0) * 0.9) {
    failures.push(`answer module does not use the available width: ${JSON.stringify(guidedAnswerLayout)}`);
  }
  if (guidedAnswerLayout.moduleRenderer === "summary_card") {
    failures.push("direct count answer repeated its narrative as a summary-card module");
  }

  mark("copy prior user input");
  const copyButton = page.getByRole("button", { name: /Copy message/i }).first();
  await copyButton.waitFor({ state: "visible", timeout: 5_000 });
  await copyButton.click();
  await page.getByRole("button", { name: /Message copied|Copy message/i }).first().waitFor({ state: "visible", timeout: 5_000 });
  checkpoints.push({ step: "copy user input", state: await chatState(page) });

  mark("wordmark remains visible while reading");
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await delay(400);
  const wordmarkWhileReading = await platformWordmarkState(page);
  if (!wordmarkWhileReading.found || wordmarkWhileReading.width < 90 || wordmarkWhileReading.opacity < 0.9) {
    failures.push(`platform wordmark was not persistently visible while reading: ${JSON.stringify(wordmarkWhileReading)}`);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await delay(400);
  const wordmarkAfterReturn = await platformWordmarkState(page);
  if (wordmarkAfterReturn.width < 90 || wordmarkAfterReturn.opacity < 0.9) {
    failures.push(`platform wordmark did not return after scrolling up: ${JSON.stringify(wordmarkAfterReturn)}`);
  }
  checkpoints.push({
    step: "persistent wordmark while reading",
    wordmarkWhileReading,
    wordmarkAfterReturn
  });

  mark("run registered answer drilldown");
  const latestAssistant = page.locator('[data-chat-role="assistant"][data-chat-item-id]').last();
  const drilldowns = latestAssistant.locator('[data-certified-question-route-id]');
  const drilldownCount = await drilldowns.count();
  if (drilldownCount < 1 || drilldownCount > 2) {
    failures.push(`guided answer exposed ${drilldownCount} registered drilldowns instead of one or two`);
  } else {
    const routeId = await drilldowns.first().getAttribute("data-certified-question-route-id");
    const beforeDrilldown = await chatState(page);
    await drilldowns.first().click();
    await page.waitForFunction(
      (previousCount) => document.querySelectorAll("[data-chat-item-id]").length > previousCount,
      beforeDrilldown.itemCount,
      { timeout: TIMEOUT_MS }
    );
    await waitForThinkingToFinish(page);
    const afterDrilldown = await chatState(page);
    if (afterDrilldown.userItemCount !== beforeDrilldown.userItemCount + 1) {
      failures.push(`registered drilldown did not append one question: ${JSON.stringify({ beforeDrilldown, afterDrilldown })}`);
    }
    checkpoints.push({ step: "registered answer drilldown", routeId, state: afterDrilldown, canvas: await measureCanvas(page) });
  }

  mark("rerun prior question");
  const beforeRerun = await chatState(page);
  await page.getByRole("button", { name: /Rerun message/i }).last().click();
  await page.waitForFunction(
    (previousCount) => document.querySelectorAll("[data-chat-item-id]").length > previousCount,
    beforeRerun.itemCount,
    { timeout: TIMEOUT_MS }
  );
  await waitForThinkingToFinish(page);
  const rerunAnswerText = await latestAssistantText(page);
  if (!/April 2026/i.test(rerunAnswerText) || !/May 2026/i.test(rerunAnswerText) || /June 2026/i.test(rerunAnswerText)) {
    failures.push(`registered drilldown rerun lost its selected periods: ${rerunAnswerText}`);
  }
  checkpoints.push({ step: "rerun", state: await chatState(page), canvas: await measureCanvas(page) });

  mark("reload should clear analysis context");
  await delay(600);
  const persistedBeforeReload = await storedAnalysisSession(page);
  if (!persistedBeforeReload?.sessionId || !persistedBeforeReload?.frame?.metric) {
    failures.push("analysis context was not persisted before the reload isolation check");
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const raw = window.sessionStorage.getItem("alamo-platform:analysis-session-v1");
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      const visibleItems = document.querySelectorAll("[data-chat-item-id]").length;
      return typeof parsed?.sessionId === "string" && parsed?.frame == null && visibleItems === 0;
    } catch {
      return false;
    }
  }, undefined, { timeout: 10_000 });
  await delay(250);
  const persistedAfterReload = await storedAnalysisSession(page);
  if (persistedAfterReload?.frame) {
    failures.push(`reload restored stale analysis context: ${JSON.stringify(persistedAfterReload.frame)}`);
  }
  if (
    persistedBeforeReload?.sessionId &&
    persistedAfterReload?.sessionId &&
    persistedBeforeReload.sessionId === persistedAfterReload.sessionId
  ) {
    failures.push("reload reused the previous analysis session id instead of starting clean");
  }
  await openChat(page, { resetClientState: false });
  checkpoints.push({
    step: "reload starts clean",
    beforeSessionId: persistedBeforeReload?.sessionId ?? null,
    afterSessionId: persistedAfterReload?.sessionId ?? null,
    afterFrame: persistedAfterReload?.frame ?? null,
    state: await chatState(page),
    canvas: await measureCanvas(page)
  });

  mark("new chat should be empty");
  await startCleanChat(page);
  const cleanState = await chatState(page);
  if (cleanState.itemCount !== 0) failures.push(`new clean chat did not clear the visible thread; saw ${cleanState.itemCount} items`);
  if (!(await page.locator('[data-certified-question-guide="true"]').isVisible().catch(() => false))) {
    failures.push("new clean chat did not open the vetted question menu");
  }
  checkpoints.push({ step: "new clean chat", state: cleanState, canvas: await measureCanvas(page) });

  mark("community answer stays conversational");
  await ask(page, "How is San Pablo doing?", 2, {
    questionId: "community-month-status",
    questionItemId: "community-month-status:0",
    promptTemplate: "How is {community} doing?",
    searchText: "How is San Pablo doing?"
  });
  await waitForText(page, /A & A Health Services San Pablo/i);
  await waitForText(page, /(?:census was|had) [\d,]+ clients/i);
  const communityAnswerLayout = await latestAnswerLayout(page);
  if (communityAnswerLayout.paragraphCount < 2) {
    failures.push(`community operating answer did not render as multiple paragraphs: ${JSON.stringify(communityAnswerLayout)}`);
  }
  if (communityAnswerLayout.moduleRenderer === "summary_card") {
    failures.push("community operating answer repeated itself as a summary-card module");
  }
  checkpoints.push({
    step: "conversational community answer",
    state: await chatState(page),
    layout: communityAnswerLayout
  });

  await startCleanChat(page);

  mark("history remains absent after the full chat flow");
  if (await page.getByRole("button", { name: /Open chat history/i }).count()) {
    failures.push("retired History button returned after the chat flow");
  }
  checkpoints.push({ step: "history remains absent", state: await chatState(page) });

  const finalCanvas = await measureCanvas(page);
  if (!finalCanvas.composerVisible) failures.push("question entry point was not visible after chat flow");
  if (finalCanvas.horizontalOverflow > 8) failures.push(`horizontal overflow: ${finalCanvas.horizontalOverflow}px`);

  const screenshotPath = path.join(screenshotDir, "chat-flow-final.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });

  return {
    passed: failures.length === 0,
    failures,
    checkpoints,
    finalCanvas,
    screenshotPath
  };
}

async function main() {
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-chat-flow-qa");
  const consoleErrors = [];
  const requestFailures = [];
  let page;

  await withBrowserQa(async (browser) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 920 },
      permissions: ["clipboard-read", "clipboard-write"]
    });
    page = await context.newPage();
    attachPageDiagnostics(page, { consoleErrors, requestFailures });

    const flow = await runChatFlow(page, screenshotDir);
    const passed = flow.passed && consoleErrors.length === 0 && requestFailures.length === 0;
    const report = {
      generatedAt: new Date().toISOString(),
      passed,
      consoleErrors,
      requestFailures,
      flow
    };

    await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));

    if (!passed) {
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log("browser chat flow QA passed");
  }).catch(async (error) => {
    if (page) {
      await page.screenshot({ path: path.join(screenshotDir, "failure.png"), fullPage: true }).catch(() => {});
    }
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  });
}

await main();
