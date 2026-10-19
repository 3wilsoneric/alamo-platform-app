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

const TIMEOUT_MS = Number(process.env.BROWSER_THREAD_CONTEXT_TIMEOUT_MS || 35_000);
const SESSION_STORAGE_KEY = "alamo-platform:analysis-session-v1";
const CHAT_HISTORY_PREFIX = "alamo-platform:chat-history-v1:";

async function storedAnalysisSession(page) {
  return page.evaluate((storageKey) => {
    const raw = window.sessionStorage.getItem(storageKey);
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
  }, SESSION_STORAGE_KEY);
}

async function chatSnapshot(page) {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll("[data-chat-item-id]"));
    const latest = String(items.at(-1)?.textContent || "");
    const bodyText = document.body.innerText || "";

    return {
      itemCount: items.length,
      latestText: latest.slice(0, 1400),
      hasUsingPriorAnswer: /Using prior answer/i.test(bodyText),
      hasBlankChatGuidance: /Blank chat\. Ask the full question once/i.test(bodyText),
      hasThreadJargon: /\b(Thread active|Local thread|Continuing slice|New clean chat)\b/i.test(bodyText)
    };
  });
}

async function readChatHistory(page) {
  return page.evaluate((prefix) => {
    const entries = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) || "{}");
        entries.push(...(Array.isArray(parsed?.threads) ? parsed.threads : []));
      } catch {
        entries.push({ parseError: true });
      }
    }
    return entries;
  }, CHAT_HISTORY_PREFIX);
}

async function waitForText(page, pattern, timeout = TIMEOUT_MS) {
  await page.waitForFunction(
    ({ source, flags }) => new RegExp(source, flags).test(document.body.innerText || ""),
    { source: pattern.source, flags: pattern.flags },
    { timeout }
  );
}

async function waitForStoredFrame(page, predicate, label) {
  await page.waitForFunction(
    ({ storageKey, predicateSource }) => {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return false;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return false;
      }
      return Function("session", `return (${predicateSource})(session);`)(parsed);
    },
    {
      storageKey: SESSION_STORAGE_KEY,
      predicateSource: predicate.toString()
    },
    { timeout: TIMEOUT_MS }
  ).catch(async (error) => {
    const session = await storedAnalysisSession(page);
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}; session=${JSON.stringify(session)}`);
  });
}

async function waitForHistory(page) {
  await page.waitForFunction(
    (prefix) => {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        try {
          const parsed = JSON.parse(window.localStorage.getItem(key) || "{}");
          if (Array.isArray(parsed?.threads) && parsed.threads.length) return true;
        } catch {
          return false;
        }
      }
      return false;
    },
    CHAT_HISTORY_PREFIX,
    { timeout: TIMEOUT_MS }
  );
}

async function ensureComposerVisible(page) {
  await openChat(page);
}

async function runThreadContextUx(page, screenshotDir) {
  const failures = [];
  const checkpoints = [];

  await openChat(page);
  await startCleanChat(page);
  checkpoints.push({ step: "initial clean boot", session: await storedAnalysisSession(page), chat: await chatSnapshot(page) });

  await ask(page, "how many people went AWOL in May 2026");
  await waitForText(page, /63 unique residents|195 incident rows|AWOL\/Elopement/i);
  await waitForStoredFrame(
    page,
    (session) => session?.frame?.metric === "incidents" && session?.frame?.category === "AWOL/Elopement",
    "AWOL frame did not persist"
  );
  checkpoints.push({ step: "context established", session: await storedAnalysisSession(page), chat: await chatSnapshot(page) });

  await ask(page, "how many people went AWOL in April 2026");
  await waitForText(page, /April 2026|Apr 2026|AWOL\/Elopement/i);
  await waitForStoredFrame(
    page,
    (session) => session?.frame?.category === "AWOL/Elopement" && session?.frame?.periods?.includes("2026-04"),
    "guided follow-up did not update the selected incident period"
  );
  checkpoints.push({ step: "guided follow-up updated context", session: await storedAnalysisSession(page), chat: await chatSnapshot(page) });

  await ask(page, "How is San Pablo?");
  await waitForText(page, /A & A Health Services San Pablo|San Pablo/i);
  await waitForStoredFrame(
    page,
    (session) => session?.frame?.facilityId === "337" && session?.frame?.category !== "AWOL/Elopement" && session?.frame?.mode !== "detail",
    "broad community question did not clear old incident-detail context"
  );
  checkpoints.push({ step: "broad question reset prior slice", session: await storedAnalysisSession(page), chat: await chatSnapshot(page) });

  await waitForHistory(page);
  const historyBeforeReload = await readChatHistory(page);
  if (!historyBeforeReload.length) failures.push("chat history did not save before reload");

  const sessionBeforeReload = await storedAnalysisSession(page);
  await page.reload({ waitUntil: "networkidle" });
  await waitForStoredFrame(page, (session) => typeof session?.sessionId === "string" && session?.frame === null, "reload did not create a clean active workspace");
  const sessionAfterReload = await storedAnalysisSession(page);
  const reloadChat = await chatSnapshot(page);
  if (sessionBeforeReload?.sessionId && sessionAfterReload?.sessionId === sessionBeforeReload.sessionId) {
    failures.push("reload reused the previous active analysis session id");
  }
  if (reloadChat.hasUsingPriorAnswer) failures.push("reload still displayed a prior-context banner");
  if (reloadChat.hasThreadJargon) failures.push("reload surface exposed thread jargon");
  checkpoints.push({ step: "reload is clean", beforeSession: sessionBeforeReload, afterSession: sessionAfterReload, chat: reloadChat });

  if (await page.getByRole("button", { name: /Open chat history/i }).count()) {
    failures.push("retired History button remained visible after reload");
  }
  checkpoints.push({
    step: "reload stays clean without history UI",
    session: sessionAfterReload,
    chat: reloadChat,
    persistedConversationCount: historyBeforeReload.length
  });

  await startCleanChat(page);
  await waitForStoredFrame(page, (session) => typeof session?.sessionId === "string" && session?.frame === null, "new chat did not stay clean");
  const cleanAfterReload = await chatSnapshot(page);
  if (cleanAfterReload.itemCount !== 0) failures.push(`new chat after reload left ${cleanAfterReload.itemCount} visible chat items`);
  if (cleanAfterReload.hasUsingPriorAnswer) failures.push("new chat after reload still showed a prior-context banner");
  checkpoints.push({ step: "new chat remains clean", session: await storedAnalysisSession(page), chat: cleanAfterReload });

  await ensureComposerVisible(page);
  await ask(page, "How is San Pablo?");
  await waitForThinkingToFinish(page);
  await delay(300);
  const broadQuestionAfterClean = await chatSnapshot(page);
  const broadSessionAfterClean = await storedAnalysisSession(page);
  if (broadSessionAfterClean?.frame?.category === "AWOL/Elopement") {
    failures.push("a broad question in a new chat reused old AWOL context");
  }
  if (String(broadSessionAfterClean?.frame?.facilityId ?? "") !== "337") {
    failures.push(`a broad San Pablo question in a new chat did not establish San Pablo context: ${JSON.stringify(broadSessionAfterClean?.frame ?? null)}`);
  }
  checkpoints.push({ step: "broad question after clean chat does not inherit", chat: broadQuestionAfterClean, session: broadSessionAfterClean });

  const finalCanvas = await measureCanvas(page);
  if (!(await page.getByRole("button", { name: /Choose another question/i }).count())) {
    failures.push("completed answer did not retain the vetted question continuation");
  }
  if (finalCanvas.horizontalOverflow > 8) failures.push(`horizontal overflow: ${finalCanvas.horizontalOverflow}px`);

  const screenshotPath = path.join(screenshotDir, "thread-context-ux-final.png");
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
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("thread-context-ux-qa");
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

    const flow = await runThreadContextUx(page, screenshotDir);
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

    console.log("thread context UX QA passed");
  }).catch(async (error) => {
    if (page) {
      await page.screenshot({ path: path.join(screenshotDir, "failure.png"), fullPage: true }).catch(() => {});
    }
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  });
}

await main();
