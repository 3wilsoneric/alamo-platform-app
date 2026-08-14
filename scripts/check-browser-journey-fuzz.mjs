#!/usr/bin/env node
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  BASE_URL,
  TIMEOUT_MS,
  attachPageDiagnostics,
  ask,
  getBrowserQaServerSnapshot,
  measureCanvas,
  openChat,
  prepareArtifactDirs,
  startCleanChat,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const DEFAULT_SEED = "browser-journey-20260623";
const SEED = String(process.env.BROWSER_JOURNEY_FUZZ_SEED || DEFAULT_SEED);
const SESSION_COUNT = Number(process.env.BROWSER_JOURNEY_FUZZ_SESSIONS || 8);
const MAX_TURNS_PER_SESSION = Number(process.env.BROWSER_JOURNEY_FUZZ_TURNS_PER_SESSION || 3);
const SNAP_NEAR_TOP_MAX_PX = Number(process.env.BROWSER_JOURNEY_SNAP_NEAR_TOP_MAX_PX || 240);

const globalRejects = [
  /Analysis tool unavailable/i,
  /Request failed \(\d+\)/i,
  /Cannot read properties of/i,
  /ReferenceError/i,
  /TypeError/i,
  /undefined undefined/i,
  /Claude request failed|rate_limit_error|overloaded_error/i,
  /\bNaN\b/
];

const deterministicEscalationRejects = [
  /Checking structured rows first\. AH Analyst will answer from this context/i,
  /Claude request failed/i,
  /rate_limit_error|overloaded_error/i
];

const journeyFamilies = [
  {
    family: "portfolio-starting-views",
    goal: "Move through the vetted portfolio and resident starting views.",
    turns: [
      {
        prompt: "Show the current incident snapshot for this month.",
        expect: [/latest available incident month/i, /Portfolio Incident Category Breakdown/i],
        requireModule: true
      },
      {
        prompt: "Can you show me the Resident Search module?",
        expect: [/Opened Resident Search|All communities/i, /residents/i],
        requireModule: true
      },
      {
        prompt: "Can you compare communities?",
        expect: [/Communities|Community Comparison/i, /A & A Health Services San Pablo|Santa Clarita/i],
        requireModule: true
      }
    ]
  },
  {
    family: "resident-profile",
    goal: "Find one resident and keep the drilldown readable.",
    turns: [
      {
        prompt: "show Shannon Romero resident profile",
        expect: [/Shannon Romero/i, /Santa Clarita/i, /Resident #|Resident number|9513755/i],
        reject: [/Longest Stay Residents/i],
        requireModule: true
      }
    ]
  },
  {
    family: "incident-grain",
    goal: "Answer people-versus-incident questions at the right grain.",
    turns: [
      {
        prompt: "How many residents had AWOL/Elopement incidents in May 2026?",
        expect: [/May 2026/i, /AWOL\/Elopement|AWOL/i, /unique residents|residents/i],
        reject: [/missing requested category/i],
        requireModule: true
      },
      {
        prompt: "How many AWOL/Elopement incidents did San Pablo have in April 2026?",
        expect: [/A & A Health Services San Pablo|San Pablo/i, /Apr|April 2026/i, /AWOL\/Elopement|AWOL/i],
        reject: [/missing requested category/i],
        requireModule: true
      }
    ]
  },
  {
    family: "community-typo-trend",
    goal: "Recover common typos without silently routing to portfolio.",
    turns: [
      {
        prompt: "show santa clartia censsus trend",
        expect: [/Interpreted|Santa Clarita/i, /Santa Clarita/i, /Census Trend|census/i],
        reject: [/Portfolio Census Trend/i],
        requireModule: true
      },
      {
        prompt: "how many clients at san pablo in january of 2026",
        expect: [/A & A Health Services San Pablo|San Pablo/i, /Jan|January 2026/i, /census|clients|residents/i],
        reject: [/missing requested period 2026-01/i, /I could not answer that exact slice safely/i],
        requireModule: false
      }
    ]
  },
  {
    family: "current-incident-snapshot",
    goal: "Render the vetted current incident picture without substituting an unrelated period.",
    turns: [
      {
        prompt: "Show the current incident snapshot for this month.",
        expect: [/latest available incident month/i, /Portfolio Incident Category Breakdown/i],
        reject: [/zero incidents today because/i, /missing requested period/i],
        requireModule: true
      }
    ]
  },
  {
    family: "community-pulse",
    goal: "Give a compact current read for a community without route-only chatter.",
    turns: [
      {
        prompt: "how is San Pablo",
        expect: [/A & A Health Services San Pablo|San Pablo/i, /census|residents/i, /incidents/i],
        reject: [/Opening .* in this thread/i],
        requireModule: true
      },
      {
        prompt: "What are San Pablo incidents by category for April 2026?",
        expect: [/A & A Health Services San Pablo|San Pablo/i, /Apr|April 2026/i, /incident/i],
        requireModule: true
      }
    ]
  },
  {
    family: "historical-detail-list",
    goal: "Render bounded detail-list previews and preserve follow-up scope.",
    turns: [
      {
        prompt:
          "List every AWOL incident from May through June by community, including resident name, date, incident type, and description",
        expect: [/AWOL\/Elopement|AWOL/i, /May 2026/i, /Jun|June 2026/i, /rows|incidents/i],
        reject: [/I stopped this result because/i, /scope did not match/i],
        requireModule: true
      },
      {
        prompt: "Can you list every AWOL/Elopement incident from April 2026 through May 2026?",
        expect: [/AWOL\/Elopement|AWOL/i, /Apr|April 2026/i, /May 2026/i],
        reject: [/not enough context/i, /missing requested category/i],
        requireModule: true
      }
    ]
  },
  {
    family: "dated-guided-period",
    goal: "Use the selected historical period instead of falling back to the current snapshot.",
    turns: [
      {
        prompt: "What were San Pablo incident categories in January 2026?",
        expect: [/A & A Health Services San Pablo|San Pablo/i, /Jan|January 2026/i, /incident/i],
        reject: [/June 2026 incidents/i, /not loaded/i],
        requireModule: true
      }
    ]
  }
];

function createRng(seedText) {
  let hash = 2166136261;
  for (const char of seedText) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return () => {
    hash += 0x6d2b79f5;
    let next = hash;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

function buildSessions() {
  const rng = createRng(SEED);
  const sessions = [];

  for (let index = 0; index < SESSION_COUNT; index += 1) {
    const family = sample(rng, journeyFamilies);
    const turnCount = Math.max(1, Math.min(MAX_TURNS_PER_SESSION, family.turns.length));
    const turns = family.turns.slice(0, turnCount).map((turn) => ({
      mustStayDeterministic: true,
      ...turn
    }));
    sessions.push({
      id: `${family.family}-${String(index + 1).padStart(2, "0")}`,
      family: family.family,
      goal: family.goal,
      turns
    });
  }

  return sessions;
}

function serializePattern(pattern) {
  return { source: pattern.source, flags: pattern.flags };
}

function patternLabel(pattern) {
  return `/${pattern.source}/${pattern.flags}`;
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

async function getChatItems(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-chat-item-id]")).map((node, index) => {
      const rect = node.getBoundingClientRect();
      return {
        index,
        id: node.getAttribute("data-chat-item-id") || String(index),
        text: node.textContent || "",
        hasModule: Boolean(node.querySelector("[data-chat-module-content-id], [data-chat-visual-module-id]")),
        top: Math.round(rect.top),
        height: Math.round(rect.height)
      };
    })
  );
}

async function capturePageFailureSnapshot(page) {
  try {
    return await page.evaluate(() => {
      const chatItems = Array.from(document.querySelectorAll("[data-chat-item-id]"))
        .slice(-8)
        .map((node, index) => {
          const rect = node.getBoundingClientRect();
          return {
            index,
            id: node.getAttribute("data-chat-item-id") || String(index),
            text: (node.textContent || "").slice(0, 6000),
            top: Math.round(rect.top),
            height: Math.round(rect.height),
            hasModule: Boolean(node.querySelector("[data-chat-module-content-id], [data-chat-visual-module-id]"))
          };
        });
      const modules = Array.from(document.querySelectorAll("[data-chat-module-content-id], [data-chat-visual-module-id]"))
        .slice(-4)
        .map((node, index) => {
          const rect = node.getBoundingClientRect();
          return {
            index,
            text: (node.textContent || "").slice(0, 4000),
            top: Math.round(rect.top),
            height: Math.round(rect.height),
            width: Math.round(rect.width)
          };
        });

      return {
        url: window.location.href,
        title: document.title,
        bodyText: (document.body.innerText || "").slice(0, 12_000),
        chatItems,
        modules,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollY: Math.round(window.scrollY)
        }
      };
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function writeFailureArtifact({ page, failureDir, session, priorPrompts = [], turn, result, validation, screenshotPath }) {
  await mkdir(failureDir, { recursive: true });
  const artifactPath = path.join(
    failureDir,
    `${slug(session.id)}-${String(result?.turnIndex || 0).padStart(2, "0")}-${slug(turn.prompt)}.json`
  );
  const [pageSnapshot, serverSnapshot, canvas] = await Promise.all([
    capturePageFailureSnapshot(page),
    getBrowserQaServerSnapshot().catch((error) => ({
      error: error instanceof Error ? error.message : String(error)
    })),
    measureCanvas(page).catch((error) => ({
      error: error instanceof Error ? error.message : String(error)
    }))
  ]);

  await writeFile(
    artifactPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        session: {
          id: session.id,
          family: session.family,
          goal: session.goal
        },
        priorPrompts,
        prompt: turn.prompt,
        expected: turn.expect.map(patternLabel),
        reject: (turn.reject || []).map(patternLabel),
        requireModule: Boolean(turn.requireModule),
        mustStayDeterministic: Boolean(turn.mustStayDeterministic),
        failures: validation?.failures ?? result?.failures ?? [],
        expectedMissing: validation?.expectedMissing ?? [],
        rejectMatches: validation?.rejectMatches ?? [],
        deterministicMatches: validation?.deterministicMatches ?? [],
        screenshotPath,
        canvas,
        text: result?.text ?? "",
        pageSnapshot,
        serverSnapshot
      },
      null,
      2
    )
  );

  return artifactPath;
}

async function waitForLatestRenderableReady(page, timeoutMs = TIMEOUT_MS) {
  try {
    await page.waitForFunction(
      () => {
        const renderables = Array.from(
          document.querySelectorAll("[data-chat-module-content-id], [data-chat-visual-module-id]")
        );
        const root = renderables.at(-1);
        if (!root) return true;
        return !/Loading [\s\S]*?(data|snapshot|directory|incidents)|Loading\.\.\./i.test(root.textContent || "");
      },
      undefined,
      { timeout: timeoutMs }
    );
  } catch {
    // The turn-level assertions report missing or stuck renderables.
  }
}

async function waitForNewText(page, previousCount, expectations, timeoutMs = TIMEOUT_MS) {
  const serialized = expectations.map(serializePattern);
  try {
    await page.waitForFunction(
      ({ previousCount: previous, patterns }) => {
        const text = Array.from(document.querySelectorAll("[data-chat-item-id]"))
          .slice(previous)
          .map((node) => node.textContent || "")
          .join("\n");
        return patterns.every((entry) => new RegExp(entry.source, entry.flags).test(text));
      },
      { previousCount, patterns: serialized },
      { timeout: timeoutMs }
    );
  } catch {
    // Missing patterns are reported by validateTurn after final text capture.
  }
}

async function waitForSnapToSettle(page, timeoutMs = 4200) {
  await delay(Math.min(3600, timeoutMs));
  try {
    await page.waitForFunction(
      (maxTop) => {
        const anchors = Array.from(document.querySelectorAll("[data-chat-snap-anchor-id]"));
        const lastAnchor = anchors.at(-1);
        if (!lastAnchor) return false;
        const rect = lastAnchor.getBoundingClientRect();
        return rect.top >= -12 && rect.top <= maxTop;
      },
      SNAP_NEAR_TOP_MAX_PX,
      { timeout: Math.max(600, timeoutMs - 3600) }
    );
  } catch {
    // validateTurn reports the measured snap position.
  }
}

async function ensureComposerReady(page) {
  await openChat(page).catch(() => {});
  return true;
}

async function submitPrompt(page, prompt, turnIndex) {
  const beforeItems = await getChatItems(page);
  const run = await ask(page, prompt, turnIndex);
  await waitForLatestRenderableReady(page);
  await delay(250);
  const finalCanvas = await measureCanvas(page);
  const afterItems = await getChatItems(page);
  const newItems = afterItems.slice(beforeItems.length);

  return {
    turnIndex,
    prompt,
    beforeCount: beforeItems.length,
    afterCount: afterItems.length,
    newItems,
    pendingCanvas: run.pendingCanvas,
    finalCanvas: finalCanvas ?? run.finalCanvas,
    text: newItems.map((item) => item.text).join("\n")
  };
}

function findMatches(text, patterns) {
  return patterns.filter((pattern) => pattern.test(text)).map(patternLabel);
}

function validateTurn(turn, result) {
  const text = result.text || "";
  const expectedMissing = turn.expect.filter((pattern) => !pattern.test(text)).map(patternLabel);
  const rejectMatches = findMatches(text, [...globalRejects, ...(turn.reject || [])]);
  const deterministicMatches = turn.mustStayDeterministic ? findMatches(text, deterministicEscalationRejects) : [];
  const newModuleCount = result.newItems.filter((item) => item.hasModule).length;
  const failures = [];

  if (!result.newItems.length) failures.push("no new chat item was created");
  if (expectedMissing.length) failures.push(`missing expected text: ${expectedMissing.join(", ")}`);
  if (rejectMatches.length) failures.push(`rejected text appeared: ${rejectMatches.join(", ")}`);
  if (deterministicMatches.length) {
    failures.push(`deterministic journey used analyst escalation text: ${deterministicMatches.join(", ")}`);
  }
  if (turn.requireModule && newModuleCount < 1) failures.push("no new surfaced/generated module appeared");
  if (result.finalCanvas.horizontalOverflow > 8) {
    failures.push(`horizontal overflow: ${result.finalCanvas.horizontalOverflow}px`);
  }
  const anchorTop = result.finalCanvas.anchorTop;
  if (anchorTop == null || anchorTop < -12 || anchorTop > SNAP_NEAR_TOP_MAX_PX) {
    failures.push(`latest snap anchor not near top: ${result.finalCanvas.anchorTop}`);
  }

  return {
    passed: failures.length === 0,
    failures,
    expectedMissing,
    rejectMatches,
    deterministicMatches,
    newModuleCount
  };
}

async function runSession(page, session, sessionIndex, screenshotDir, failureDir) {
  await ensureComposerReady(page);
  await startCleanChat(page);
  await ensureComposerReady(page);

  const turns = [];
  for (const [turnIndex, turn] of session.turns.entries()) {
    const screenshotPath = path.join(
      screenshotDir,
      `${String(sessionIndex + 1).padStart(2, "0")}-${String(turnIndex + 1).padStart(2, "0")}-${slug(session.family)}.png`
    );
    try {
      const result = await submitPrompt(page, turn.prompt, turnIndex + 1);
      await waitForNewText(page, result.beforeCount, turn.expect);
      await waitForSnapToSettle(page);
      const settledItems = await getChatItems(page);
      const settledResult = {
        ...result,
        afterCount: settledItems.length,
        newItems: settledItems.slice(result.beforeCount),
        text: settledItems
          .slice(result.beforeCount)
          .map((item) => item.text)
          .join("\n"),
        finalCanvas: await measureCanvas(page)
      };
      const validation = validateTurn(turn, settledResult);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      const failureArtifactPath = validation.passed
        ? null
        : await writeFailureArtifact({
            page,
            failureDir,
            session,
            priorPrompts: turns.map((existingTurn) => existingTurn.prompt),
            turn,
            result: settledResult,
            validation,
            screenshotPath
          });

      turns.push({
        prompt: turn.prompt,
        passed: validation.passed,
        failures: validation.failures,
        expected: turn.expect.map(patternLabel),
        expectedMissing: validation.expectedMissing,
        rejectMatches: validation.rejectMatches,
        deterministicMatches: validation.deterministicMatches,
        newModuleCount: validation.newModuleCount,
        pendingCanvas: settledResult.pendingCanvas,
        finalCanvas: settledResult.finalCanvas,
        textSample: settledResult.text.slice(0, 1600),
        screenshotPath,
        failureArtifactPath
      });
    } catch (error) {
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      const failureResult = {
        turnIndex: turnIndex + 1,
        text: "",
        failures: [error instanceof Error ? error.message : String(error)]
      };
      const failureArtifactPath = await writeFailureArtifact({
        page,
        failureDir,
        session,
        priorPrompts: turns.map((existingTurn) => existingTurn.prompt),
        turn,
        result: failureResult,
        validation: {
          failures: failureResult.failures,
          expectedMissing: turn.expect.map(patternLabel),
          rejectMatches: [],
          deterministicMatches: []
        },
        screenshotPath
      }).catch(() => null);
      turns.push({
        prompt: turn.prompt,
        passed: false,
        failures: [error instanceof Error ? error.message : String(error)],
        expected: turn.expect.map(patternLabel),
        expectedMissing: turn.expect.map(patternLabel),
        rejectMatches: [],
        deterministicMatches: [],
        newModuleCount: 0,
        pendingCanvas: null,
        finalCanvas: await measureCanvas(page).catch(() => null),
        textSample: "",
        screenshotPath,
        failureArtifactPath
      });
      await ensureComposerReady(page);
      break;
    }
  }

  return {
    id: session.id,
    family: session.family,
    goal: session.goal,
    passed: turns.every((turn) => turn.passed),
    turns
  };
}

async function main() {
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-journey-fuzz");
  const failureDir = path.join(artifactDir, "failures");
  await rm(failureDir, { recursive: true, force: true });
  await mkdir(failureDir, { recursive: true });
  const sessions = buildSessions();
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
    for (const [sessionIndex, session] of sessions.entries()) {
      console.log(`browser journey fuzz ${sessionIndex + 1}/${sessions.length}: ${session.family}`);
      const result = await runSession(page, session, sessionIndex, screenshotDir, failureDir);
      console.log(`browser journey fuzz ${result.passed ? "passed" : "failed"}: ${session.family}`);
      results.push(result);
    }

    const turnCount = results.reduce((sum, session) => sum + session.turns.length, 0);
    const passed =
      results.every((result) => result.passed) && consoleErrors.length === 0 && requestFailures.length === 0;
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      seed: SEED,
      passed,
      summary: {
        sessions: results.length,
        turns: turnCount,
        passedSessions: results.filter((result) => result.passed).length,
        passedTurns: results.flatMap((result) => result.turns).filter((turn) => turn.passed).length,
        consoleErrors: consoleErrors.length,
        requestFailures: requestFailures.length
      },
      consoleErrors,
      requestFailures,
      results
    };

    await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));
    await writeFile(
      path.join(artifactDir, `${slug(SEED)}-${SESSION_COUNT}x${MAX_TURNS_PER_SESSION}.json`),
      JSON.stringify(report, null, 2)
    );

    if (!passed) {
      const failed = results
        .flatMap((session) =>
          session.turns.map((turn) => ({
            session: session.id,
            family: session.family,
            ...turn
          }))
        )
        .filter((turn) => !turn.passed);
      console.error(JSON.stringify({ summary: report.summary, failed, consoleErrors, requestFailures }, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log(
      `browser journey fuzz passed: ${report.summary.passedTurns}/${turnCount} turns across ${report.summary.sessions} sessions`
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
