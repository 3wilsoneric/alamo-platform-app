#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  attachPageDiagnostics,
  measureCanvas,
  openChat,
  prepareArtifactDirs,
  startCleanChat,
  submitQuestion,
  waitForThinkingToFinish,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const TOOL_RESPONSE_DELAY_MS = Number(process.env.BROWSER_SCROLL_TOOL_DELAY_MS || 2_500);
const USER_SCROLL_DELTA = Number(process.env.BROWSER_SCROLL_DELTA || 520);
const SCROLL_STABILITY_TOLERANCE_PX = Number(process.env.BROWSER_SCROLL_STABILITY_TOLERANCE_PX || 160);
const PROMPT = "how many people went AWOL in May 2026";

async function readScrollState(page) {
  return page.evaluate(() => {
    const workspace = document.querySelector('[data-chat-workspace-panel="true"]');
    let scrollContainer = workspace?.parentElement ?? null;
    while (scrollContainer) {
      const overflowY = window.getComputedStyle(scrollContainer).overflowY;
      if (/(auto|scroll|overlay)/.test(overflowY)) break;
      scrollContainer = scrollContainer.parentElement;
    }
    const anchors = Array.from(document.querySelectorAll("[data-chat-snap-anchor-id]"));
    const lastAnchor = anchors.at(-1);
    const lastAnchorRect = lastAnchor?.getBoundingClientRect();
    const items = Array.from(document.querySelectorAll("[data-chat-item-id]"));
    const lastItem = items.at(-1);
    const lastItemRect = lastItem?.getBoundingClientRect();

    return {
      scrollY: Math.round(scrollContainer?.scrollTop ?? window.scrollY),
      scrollContainer: scrollContainer
        ? scrollContainer.getAttribute("data-carousel-panel") || scrollContainer.tagName
        : "window",
      viewportHeight: window.innerHeight,
      anchorTop: lastAnchorRect ? Math.round(lastAnchorRect.top) : null,
      itemCount: items.length,
      lastItemTop: lastItemRect ? Math.round(lastItemRect.top) : null,
      latestText: String(lastItem?.textContent || "").slice(0, 500)
    };
  });
}

async function readUserPromptAnchorState(page, prompt) {
  return page.evaluate((submittedPrompt) => {
    const userItems = Array.from(document.querySelectorAll('[data-chat-role="user"][data-chat-item-id]'));
    const exactMatch = userItems.find((entry) => String(entry.textContent || "").includes(submittedPrompt));
    const target = exactMatch ?? userItems.at(-1);
    const itemId = target?.getAttribute("data-chat-item-id") ?? null;
    const anchor = itemId
      ? document.querySelector(`[data-chat-snap-anchor-id="${CSS.escape(itemId)}"]`) ?? target
      : target;
    const anchorRect = anchor?.getBoundingClientRect();

    return {
      itemId,
      anchorTop: anchorRect ? Math.round(anchorRect.top) : null,
      visibleNearTop: anchorRect ? anchorRect.top >= -12 && anchorRect.top <= 190 : false,
      text: String(target?.textContent || "").slice(0, 300)
    };
  }, prompt);
}

async function waitForUserMessageSnap(page, prompt, timeoutMs = 1_200) {
  try {
    await page.waitForFunction(
      (submittedPrompt) => {
        const userItems = Array.from(document.querySelectorAll('[data-chat-role="user"][data-chat-item-id]'));
        const exactMatch = userItems.find((entry) => String(entry.textContent || "").includes(submittedPrompt));
        const target = exactMatch ?? userItems.at(-1);
        const itemId = target?.getAttribute("data-chat-item-id");
        const anchor = itemId
          ? document.querySelector(`[data-chat-snap-anchor-id="${CSS.escape(itemId)}"]`) ?? target
          : target;
        const rect = anchor?.getBoundingClientRect();
        return Boolean(rect && rect.top >= -12 && rect.top <= 190);
      },
      prompt,
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}

async function waitForAwolAnswer(page) {
  await waitForThinkingToFinish(page);
  await page.waitForFunction(
    () => {
      const assistantItems = Array.from(document.querySelectorAll('[data-chat-role="assistant"]'));
      const latestAnswer = String(assistantItems.at(-1)?.textContent || "");
      return /AWOL\/Elopement/i.test(latestAnswer);
    },
    undefined,
    { timeout: 20_000 }
  );
}

async function main() {
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-scroll-snap-qa");
  const consoleErrors = [];
  const requestFailures = [];
  const delayedRequests = [];
  let page;

  await withBrowserQa(async (browser) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 920 }
    });
    page = await context.newPage();
    attachPageDiagnostics(page, { consoleErrors, requestFailures });

    await page.route(/\/api\/chat\/(?:tools|claude\/message)(?:\?.*)?$/, async (route) => {
      delayedRequests.push(route.request().url());
      await delay(TOOL_RESPONSE_DELAY_MS);
      await route.continue();
    });

    try {
      await openChat(page);
      await startCleanChat(page);
      await submitQuestion(page, PROMPT);
      await delay(200);
      const initialSnapObserved = await waitForUserMessageSnap(page, PROMPT);

      const pendingCanvas = await measureCanvas(page);
      const pendingUserAnchor = await readUserPromptAnchorState(page, PROMPT);
      const pendingScroll = await readScrollState(page);

      const workspaceBox = await page
        .locator('[data-chat-workspace-panel="true"]')
        .boundingBox();
      await page.mouse.move(
        workspaceBox ? workspaceBox.x + Math.min(workspaceBox.width / 2, 720) : 720,
        workspaceBox ? Math.max(120, Math.min(workspaceBox.y + 260, 760)) : 460
      );
      await page.mouse.wheel(0, USER_SCROLL_DELTA);
      await delay(250);
      const userControlledScroll = await readScrollState(page);

      await waitForAwolAnswer(page);
      await delay(500);
      const finalScroll = await readScrollState(page);
      const finalCanvas = await measureCanvas(page);
      const finalUserAnchor = await readUserPromptAnchorState(page, PROMPT);
      const screenshotPath = path.join(screenshotDir, "scroll-snap-regression.png");
      await page.screenshot({ path: screenshotPath, fullPage: false });

      const scrollMovedByUser = userControlledScroll.scrollY - pendingScroll.scrollY;
      const finalScrollDrift = Math.abs(finalScroll.scrollY - userControlledScroll.scrollY);
      const failures = [];

      if (!initialSnapObserved || !pendingUserAnchor.visibleNearTop) {
        failures.push(`new user message did not snap near top; anchorTop=${pendingUserAnchor.anchorTop}`);
      }
      if (scrollMovedByUser < Math.min(180, USER_SCROLL_DELTA * 0.4)) {
        failures.push(`user scroll did not take control; moved ${scrollMovedByUser}px`);
      }
      if (finalScrollDrift > SCROLL_STABILITY_TOLERANCE_PX) {
        failures.push(`answer render changed scroll by ${finalScrollDrift}px after user took control`);
      }
      if (finalCanvas.horizontalOverflow > 8) failures.push(`horizontal overflow: ${finalCanvas.horizontalOverflow}px`);
      if (consoleErrors.length) failures.push(`console errors: ${consoleErrors.length}`);
      if (requestFailures.length) failures.push(`api request failures: ${requestFailures.length}`);

      const report = {
      generatedAt: new Date().toISOString(),
      passed: failures.length === 0,
      prompt: PROMPT,
      thresholds: {
        toolResponseDelayMs: TOOL_RESPONSE_DELAY_MS,
        userScrollDelta: USER_SCROLL_DELTA,
        scrollStabilityTolerancePx: SCROLL_STABILITY_TOLERANCE_PX
      },
      pendingCanvas,
      finalCanvas,
      pendingUserAnchor,
      finalUserAnchor,
      initialSnapObserved,
      pendingScroll,
      userControlledScroll,
      finalScroll,
      scrollMovedByUser,
      finalScrollDrift,
      consoleErrors,
      requestFailures,
      delayedRequests,
      failures,
      screenshotPath
      };

      await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));

      if (!report.passed) {
        console.error(JSON.stringify(report, null, 2));
        process.exitCode = 1;
        return;
      }

      console.log(
        `browser scroll snap QA passed: user moved ${scrollMovedByUser}px; final drift ${finalScrollDrift}px`
      );
    } catch (error) {
      const screenshotPath = path.join(screenshotDir, "failure.png");
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      await writeFile(path.join(artifactDir, "failure.json"), JSON.stringify({
        generatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        bodyText: String(await page.locator("body").innerText().catch(() => "")).slice(0, 8_000),
        consoleErrors,
        requestFailures,
        delayedRequests,
        screenshotPath
      }, null, 2));
      throw error;
    }
  }).catch(async (error) => {
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  });
}

await main();
