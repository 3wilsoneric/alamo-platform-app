#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  attachPageDiagnostics,
  ask,
  BASE_URL,
  measureCanvas,
  openChat,
  prepareArtifactDirs,
  startCleanChat,
  waitForThinkingToFinish,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const TIMEOUT_MS = Number(process.env.BROWSER_THREAD_CONTEXT_STRESS_TIMEOUT_MS || 35_000);
const SESSION_STORAGE_KEY = "alamo-platform:analysis-session-v1";

const globalRejects = [
  /\b(Thread active|Local thread|Continuing slice|New clean chat)\b/i,
  /Cannot read properties of/i,
  /ReferenceError/i,
  /TypeError/i,
  /\bundefined undefined\b/i,
  /\bNaN\b/i,
  /Analysis tool unavailable/i
];

const qualitativeRejects = [
  /\bSource:\s*local data tool\b/i,
  /\bTool pre-check\b/i,
  /\bAd hoc module\b/i,
  /\banalysis plan validation\b/i,
  /\bexecution plan rejected\b/i,
  /\bI could not answer that exact slice safely\b/i,
  /\bOpen a related view, run the next slice, or export the rows\b/i
];

const scenarios = [
  {
    id: "referential-memory-works-inside-thread",
    goal: "A same-thread follow-up should patch the prior AWOL question, not start over.",
    turns: [
      {
        prompt: "how many people went AWOL in May 2026",
        expectText: [/May 2026/i, /AWOL\/Elopement|AWOL/i, /unique residents|residents/i],
        expectFrame: (frame) => frame?.metric === "incidents" && frame?.category === "AWOL/Elopement" && frame?.periods?.includes("2026-05")
      },
      {
        prompt: "how many people went AWOL in April 2026",
        expectText: [/Apr|April 2026/i, /AWOL\/Elopement|AWOL/i],
        expectFrame: (frame) => frame?.category === "AWOL/Elopement" && frame?.periods?.includes("2026-04")
      }
    ]
  },
  {
    id: "broad-community-question-clears-old-detail",
    goal: "A broad community question should not drag along old AWOL/detail filters.",
    turns: [
      {
        prompt: "list every AWOL incident from May through June by community including resident name date type description",
        expectText: [/AWOL\/Elopement|AWOL/i, /May 2026/i, /Jun|June 2026/i],
        expectFrame: (frame) => frame?.mode === "detail" && frame?.category === "AWOL/Elopement"
      },
      {
        prompt: "how is san pablo",
        expectText: [/A & A Health Services San Pablo|San Pablo/i, /census|residents/i],
        expectFrame: (frame) => frame?.facilityId === "337" && frame?.category !== "AWOL/Elopement" && frame?.mode !== "detail"
      }
    ]
  },
  {
    id: "typo-correction-does-not-poison-new-chat",
    goal: "Typo recovery should work, but New Chat should remove that recovered scope.",
    turns: [
      {
        prompt: "show santa clartia censsus trend",
        expectText: [/Interpreted|Santa Clarita/i, /census/i],
        expectFrame: (frame) => frame?.metric === "census" && frame?.facilityId === "345"
      },
      {
        action: "new-chat",
        expectFrame: (frame) => frame === null
      },
      {
        prompt: "how many people went AWOL in April 2026",
        expectText: [/Apr|April 2026/i, /AWOL\/Elopement|AWOL/i],
        rejectText: [/Santa Clarita Census Trend/i],
        expectFrame: (frame) => frame?.metric === "incidents" && frame?.category === "AWOL/Elopement" && frame?.periods?.includes("2026-04") && frame?.facilityId !== "345"
      }
    ]
  },
  {
    id: "reload-and-new-chat-clear-context",
    goal: "Reload and New Chat should both start clean without exposing a History control.",
    turns: [
      {
        prompt: "how many people went AWOL in May 2026",
        expectText: [/May 2026/i, /AWOL\/Elopement|AWOL/i],
        expectFrame: (frame) => frame?.metric === "incidents" && frame?.category === "AWOL/Elopement"
      },
      {
        action: "reload",
        expectFrame: (frame) => frame === null
      },
      {
        action: "new-chat",
        expectFrame: (frame) => frame === null
      },
      {
        prompt: "how many people went AWOL in April 2026",
        expectText: [/Apr|April 2026/i, /AWOL\/Elopement|AWOL/i],
        rejectText: [/Shannon Romero/i, /9513755/i],
        expectFrame: (frame) => frame?.metric === "incidents" && frame?.category === "AWOL/Elopement" && !frame?.residentName
      }
    ]
  },
  {
    id: "current-incident-question-does-not-poison-next-question",
    goal: "A current incident question should not leak its broad scope into the next dated category question.",
    turns: [
      {
        prompt: "open incident center",
        expectText: [/Incident Center|Surface Incidents|incidents/i],
        expectFrame: (frame) => frame?.metric === "incidents" && !frame?.category
      },
      {
        prompt: "how many people went AWOL in April 2026",
        expectText: [/Apr|April 2026/i, /AWOL\/Elopement|AWOL/i],
        rejectText: [/Medication Refusal is the largest/i],
        expectFrame: (frame) => frame?.metric === "incidents" && frame?.category === "AWOL/Elopement"
      }
    ]
  },
  {
    id: "dated-guided-question-recovers-after-normal-question",
    goal: "A dated guided question should use its own period and not inherit a previous current snapshot.",
    turns: [
      {
        prompt: "incidents",
        expectText: [/Jun|June 2026/i, /incident/i],
        expectFrame: (frame) => frame === null || !frame?.metric || frame?.metric === "incidents"
      },
      {
        prompt: "What were San Pablo incident categories in January 2026?",
        expectText: [/A & A Health Services San Pablo|San Pablo/i, /Jan|January 2026/i, /incident/i],
        rejectText: [/November/i, /not loaded/i, /June 2026 incidents/i],
        expectFrame: (frame) => frame?.facilityId === "337" && frame?.periods?.includes("2026-01")
      }
    ]
  },
  {
    id: "resident-miss-does-not-fall-back-to-random-roster",
    goal: "Resident Search should behave like a surface: searchable roster first, exact resident card when the user supplies a real name.",
    turns: [
      {
        prompt: "resident search",
        expectText: [/All communities/i, /503\s*(?:\/\s*503|residents)/i],
        rejectText: [/Longest Stay Residents/i, /Portfolio Longest Stay/i],
        expectFrame: (frame) => frame === null || !frame?.residentName
      },
      {
        prompt: "show shannon romero resident profile",
        expectText: [/Shannon Romero/i, /Resident #|9513755/i],
        expectFrame: (frame) => frame === null || !frame?.residentName
      }
    ]
  },
  {
    id: "topic-switch-from-resident-to-portfolio-count",
    goal: "A portfolio count should not inherit the previous resident profile.",
    turns: [
      {
        prompt: "show Shannon Romero resident profile",
        expectText: [/Shannon Romero/i, /Resident #|9513755/i],
        expectFrame: (frame) => frame === null || !frame?.residentName
      },
      {
        prompt: "how many people went AWOL in May 2026",
        expectText: [/May 2026/i, /AWOL\/Elopement|AWOL/i, /unique residents|residents/i],
        rejectText: [/Shannon Romero.*AWOL/i],
        expectFrame: (frame) => frame?.metric === "incidents" && frame?.category === "AWOL/Elopement" && !frame?.residentName
      }
    ]
  }
];

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function patternLabel(pattern) {
  return `/${pattern.source}/${pattern.flags}`;
}

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
      latestText: latest.slice(0, 5000),
      bodyText: bodyText.slice(0, 12_000),
      hasUsingPriorAnswer: /Using prior answer/i.test(bodyText),
      hasBlankChatGuidance: /Blank chat\. Ask the full question once/i.test(bodyText),
      hasThreadJargon: /\b(Thread active|Local thread|Continuing slice|New clean chat)\b/i.test(bodyText)
    };
  });
}

function scoreQualitativeTurn(snapshot, canvas, failures) {
  const text = snapshot.latestText ?? "";
  const bodyText = snapshot.bodyText ?? "";
  const needsRecovery = /\b(I need the full question first|could not|not loaded|not available|did you mean|clarify|try one)\b/i.test(text);
  const scorecard = {
    contextCorrect: failures.every((failure) => !/analysis frame|rejected latest-answer|missing expected latest text/i.test(failure)),
    noJargon: qualitativeRejects.every((pattern) => !pattern.test(text)),
    clearRecovery: !needsRecovery || /\b(full question|try|ask|use|open|show)\b/i.test(text),
    noHiddenMemory: !/Using prior answer/i.test(bodyText) || !/Blank chat\. Ask the full question once/i.test(bodyText),
    layoutStable: Number(canvas?.horizontalOverflow ?? 0) <= 8
  };
  const score = Object.values(scorecard).filter(Boolean).length;
  return {
    ...scorecard,
    score,
    maxScore: Object.keys(scorecard).length,
    passed: score >= 4 && scorecard.contextCorrect && scorecard.noJargon && scorecard.noHiddenMemory
  };
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
      return Function("session", `return (${predicateSource})(session.frame ?? null);`)(parsed);
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

async function ensureComposerVisible(page) {
  await openChat(page);
}

async function validateTurn(page, turn, scenarioId, stepIndex) {
  const snapshot = await chatSnapshot(page);
  const session = await storedAnalysisSession(page);
  const text = snapshot.latestText;
  const failures = [];

  for (const pattern of turn.expectText ?? []) {
    if (!pattern.test(text)) failures.push(`missing expected latest text ${patternLabel(pattern)}`);
  }

  for (const pattern of globalRejects) {
    if (pattern.test(text) || pattern.test(snapshot.bodyText)) failures.push(`rejected global text appeared ${patternLabel(pattern)}`);
  }

  for (const pattern of turn.rejectText ?? []) {
    if (pattern.test(text)) failures.push(`rejected latest-answer text appeared ${patternLabel(pattern)}`);
  }

  if (turn.expectFrame && !turn.expectFrame(session?.frame ?? null)) {
    failures.push(`analysis frame did not match expectation: ${JSON.stringify(session?.frame ?? null)}`);
  }

  const canvas = await measureCanvas(page);
  if (canvas.horizontalOverflow > 8) failures.push(`horizontal overflow: ${canvas.horizontalOverflow}px`);
  const scorecard = scoreQualitativeTurn(snapshot, canvas, failures);
  if (!scorecard.passed) failures.push(`qualitative scorecard failed: ${JSON.stringify(scorecard)}`);

  return {
    scenarioId,
    stepIndex,
    prompt: turn.prompt ?? turn.action,
    passed: failures.length === 0,
    failures,
    session,
    chat: {
      itemCount: snapshot.itemCount,
      hasUsingPriorAnswer: snapshot.hasUsingPriorAnswer,
      hasBlankChatGuidance: snapshot.hasBlankChatGuidance,
      latestText: snapshot.latestText.slice(0, 1400)
    },
    scorecard,
    canvas
  };
}

async function runAction(page, action) {
  if (action === "new-chat") {
    await startCleanChat(page);
    await delay(350);
    return;
  }

  if (action === "reload") {
    const before = await storedAnalysisSession(page);
    await page.reload({ waitUntil: "networkidle" });
    await waitForStoredFrame(page, (frame) => frame === null, "reload should start clean");
    const after = await storedAnalysisSession(page);
    if (before?.sessionId && after?.sessionId === before.sessionId) {
      throw new Error("reload reused the previous analysis session id");
    }
    return;
  }

  throw new Error(`Unknown action: ${action}`);
}

async function runScenario(page, scenario, scenarioIndex, screenshotDir) {
  await ensureComposerVisible(page);
  await startCleanChat(page);
  await ensureComposerVisible(page);

  const turns = [];
  for (const [turnIndex, turn] of scenario.turns.entries()) {
    const screenshotPath = path.join(
      screenshotDir,
      `${String(scenarioIndex + 1).padStart(2, "0")}-${String(turnIndex + 1).padStart(2, "0")}-${slug(scenario.id)}.png`
    );

    try {
      if (turn.action) {
        await runAction(page, turn.action);
      } else {
        await ask(page, turn.prompt, turnIndex + 1);
        await waitForThinkingToFinish(page).catch(() => {});
        await delay(350);
      }

      if (turn.expectFrame) {
        await waitForStoredFrame(page, turn.expectFrame, `${scenario.id} step ${turnIndex + 1} frame`);
      }

      const result = await validateTurn(page, turn, scenario.id, turnIndex + 1);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      turns.push({ ...result, screenshotPath });
    } catch (error) {
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      turns.push({
        scenarioId: scenario.id,
        stepIndex: turnIndex + 1,
        prompt: turn.prompt ?? turn.action,
        passed: false,
        failures: [error instanceof Error ? error.message : String(error)],
        session: await storedAnalysisSession(page).catch(() => null),
        chat: await chatSnapshot(page).catch(() => null),
        canvas: await measureCanvas(page).catch(() => null),
        screenshotPath
      });
      break;
    }
  }

  return {
    id: scenario.id,
    goal: scenario.goal,
    passed: turns.every((turn) => turn.passed),
    turns
  };
}

async function main() {
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("thread-context-stress-qa");
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
    await openChat(page);

    const results = [];
    for (const [scenarioIndex, scenario] of scenarios.entries()) {
      console.log(`thread context stress ${scenarioIndex + 1}/${scenarios.length}: ${scenario.id}`);
      const result = await runScenario(page, scenario, scenarioIndex, screenshotDir);
      console.log(`thread context stress ${result.passed ? "passed" : "failed"}: ${scenario.id}`);
      results.push(result);
    }

    const turnCount = results.reduce((sum, scenario) => sum + scenario.turns.length, 0);
    const scorecards = results.flatMap((result) => result.turns.map((turn) => turn.scorecard).filter(Boolean));
    const scoreTotal = scorecards.reduce((sum, scorecard) => sum + scorecard.score, 0);
    const maxScoreTotal = scorecards.reduce((sum, scorecard) => sum + scorecard.maxScore, 0);
    const passed = results.every((result) => result.passed) && consoleErrors.length === 0 && requestFailures.length === 0;
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      passed,
      summary: {
        scenarios: results.length,
        turns: turnCount,
        passedScenarios: results.filter((result) => result.passed).length,
        passedTurns: results.flatMap((result) => result.turns).filter((turn) => turn.passed).length,
        qualitativeScore: maxScoreTotal ? Number((scoreTotal / maxScoreTotal).toFixed(3)) : null,
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
        .flatMap((scenario) => scenario.turns.map((turn) => ({ scenario: scenario.id, ...turn })))
        .filter((turn) => !turn.passed);
      console.error(JSON.stringify({ summary: report.summary, failed, consoleErrors, requestFailures }, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log(
      `thread context stress passed: ${report.summary.passedTurns}/${turnCount} turns across ${report.summary.scenarios} scenarios`
    );
  }).catch(async (error) => {
    if (page) {
      await page.screenshot({ path: path.join(screenshotDir, "failure.png"), fullPage: true }).catch(() => {});
    }
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  });
}

await main();
