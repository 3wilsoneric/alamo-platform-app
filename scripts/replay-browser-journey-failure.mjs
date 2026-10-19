#!/usr/bin/env node
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  BASE_URL,
  attachPageDiagnostics,
  ask,
  measureCanvas,
  openChat,
  prepareArtifactDirs,
  startCleanChat,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const ROOT = process.cwd();
const FAILURE_DIR = path.join(ROOT, "generated", "browser-journey-fuzz", "failures");
const LATEST_FUZZ_REPORT = path.join(ROOT, "generated", "browser-journey-fuzz", "latest.json");
const EXPLICIT_ARTIFACT = process.env.BROWSER_JOURNEY_REPLAY_ARTIFACT || "";

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

function patternLabel(pattern) {
  return `/${pattern.source}/${pattern.flags}`;
}

function deserializePattern(value) {
  if (!value) return null;
  if (typeof value === "object" && typeof value.source === "string") {
    return new RegExp(value.source, value.flags || "");
  }
  const text = String(value);
  if (text.startsWith("/")) {
    const lastSlash = text.lastIndexOf("/");
    if (lastSlash > 0) {
      return new RegExp(text.slice(1, lastSlash), text.slice(lastSlash + 1));
    }
  }
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function deserializePatterns(values) {
  return (Array.isArray(values) ? values : []).map(deserializePattern).filter(Boolean);
}

async function findLatestFailureArtifact() {
  if (EXPLICIT_ARTIFACT) {
    return path.isAbsolute(EXPLICIT_ARTIFACT) ? EXPLICIT_ARTIFACT : path.resolve(ROOT, EXPLICIT_ARTIFACT);
  }

  try {
    const latestReport = JSON.parse(await readFile(LATEST_FUZZ_REPORT, "utf8"));
    if (latestReport?.passed === true) return null;
  } catch {
    // Fall back to the failure directory when no current fuzz report exists.
  }

  let entries = [];
  try {
    entries = await readdir(FAILURE_DIR);
  } catch {
    return null;
  }

  const files = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        const filePath = path.join(FAILURE_DIR, entry);
        const info = await stat(filePath);
        return { filePath, mtimeMs: info.mtimeMs };
      })
  );

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.filePath ?? null;
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

async function ensureComposerReady(page) {
  await openChat(page).catch(() => {});
  return true;
}

async function submitPrompt(page, prompt) {
  const beforeItems = await getChatItems(page);
  await ask(page, prompt);
  await delay(350);

  const afterItems = await getChatItems(page);
  const newItems = afterItems.slice(beforeItems.length);
  return {
    prompt,
    beforeCount: beforeItems.length,
    afterCount: afterItems.length,
    newItems,
    text: newItems.map((item) => item.text).join("\n"),
    canvas: await measureCanvas(page)
  };
}

function validateReplay(artifact, result) {
  const expected = deserializePatterns(artifact.expected);
  const reject = [...globalRejects, ...deserializePatterns(artifact.reject)];
  const expectedMissing = expected.filter((pattern) => !pattern.test(result.text)).map(patternLabel);
  const rejectMatches = reject.filter((pattern) => pattern.test(result.text)).map(patternLabel);
  const newModuleCount = result.newItems.filter((item) => item.hasModule).length;
  const failures = [];

  if (!result.newItems.length) failures.push("no new chat item was created");
  if (expectedMissing.length) failures.push(`missing expected text: ${expectedMissing.join(", ")}`);
  if (rejectMatches.length) failures.push(`rejected text appeared: ${rejectMatches.join(", ")}`);
  if (artifact.requireModule && newModuleCount < 1) failures.push("no new surfaced/generated module appeared");
  if (result.canvas.horizontalOverflow > 8) failures.push(`horizontal overflow: ${result.canvas.horizontalOverflow}px`);

  return {
    passed: failures.length === 0,
    failures,
    expectedMissing,
    rejectMatches,
    newModuleCount
  };
}

async function main() {
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-journey-replay");
  const artifactPath = await findLatestFailureArtifact();

  if (!artifactPath) {
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      status: "skipped",
      passed: true,
      reason: "No browser journey failure artifacts were found."
    };
    await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));
    console.log("browser journey replay skipped: no failure artifacts found");
    return;
  }

  const failureArtifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const priorPrompts = Array.isArray(failureArtifact.priorPrompts) ? failureArtifact.priorPrompts : [];
  const consoleErrors = [];
  const requestFailures = [];
  let page;

  await withBrowserQa(async (browser) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 920 } });
    page = await context.newPage();
    attachPageDiagnostics(page, { consoleErrors, requestFailures });
    await openChat(page);
    await startCleanChat(page);
    await ensureComposerReady(page);

    const setupTurns = [];
    for (const prompt of priorPrompts) {
      console.log(`replay setup: ${prompt}`);
      setupTurns.push(await submitPrompt(page, prompt));
    }

    console.log(`replay target: ${failureArtifact.prompt}`);
    const result = await submitPrompt(page, failureArtifact.prompt);
    const validation = validateReplay(failureArtifact, result);
    const screenshotPath = path.join(screenshotDir, "replay-target.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const passed = validation.passed && consoleErrors.length === 0 && requestFailures.length === 0;
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      sourceArtifactPath: artifactPath,
      sourceGeneratedAt: failureArtifact.generatedAt ?? null,
      session: failureArtifact.session ?? null,
      replayedPriorPrompts: priorPrompts.length,
      prompt: failureArtifact.prompt,
      passed,
      validation,
      consoleErrors,
      requestFailures,
      setupTurns: setupTurns.map((turn) => ({
        prompt: turn.prompt,
        textSample: turn.text.slice(0, 800),
        newModuleCount: turn.newItems.filter((item) => item.hasModule).length
      })),
      target: {
        textSample: result.text.slice(0, 2000),
        newModuleCount: result.newItems.filter((item) => item.hasModule).length,
        canvas: result.canvas,
        screenshotPath
      }
    };

    await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));

    if (!passed) {
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log(`browser journey replay passed: ${failureArtifact.prompt}`);
  }).catch(async (error) => {
    if (page) {
      await page.screenshot({ path: path.join(screenshotDir, "failure.png"), fullPage: true }).catch(() => {});
    }
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      sourceArtifactPath: artifactPath,
      passed: false,
      error: error instanceof Error ? error.message : String(error)
    };
    await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  });
}

await main();
