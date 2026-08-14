#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = process.cwd();
const PROFILE = String(process.env.PLATFORM_READY_PROFILE || "full").toLowerCase();
const STOP_ON_FAILURE = process.env.PLATFORM_READY_STOP_ON_FAILURE === "true";
const INCLUDE_BROWSER = process.env.PLATFORM_READY_SKIP_BROWSER !== "true";
const INCLUDE_BUILD = process.env.PLATFORM_READY_INCLUDE_BUILD === "true";
const START_AT = String(process.env.PLATFORM_READY_START_AT || "").trim();
const BROWSER_STAGE_SETTLE_MS = Number(
  process.env.PLATFORM_READY_BROWSER_STAGE_SETTLE_MS || 1_500
);

const commandProfiles = {
  quick: [
    "check:docs",
    "typecheck",
    "check:code-health",
    "check:platform-api",
    "check:regression-replays",
    "check:user-journeys",
    "check:user-journey-fuzz",
    "check:thread-context-fuzz",
    "check:production-smoke",
    "check:production-signed-in-smoke"
  ],
  release: [
    "check:docs",
    "typecheck",
    "check:code-health",
    "check:dependencies",
    "check:platform-api",
    "check:regression-replays",
    "check:user-journeys",
    "check:user-journey-fuzz",
    "check:browser-surfaces",
    "check:browser-explorer",
    "check:browser-chat-flow",
    "check:browser-mobile",
    "check:browser-question-families",
    "check:browser-guided-accessibility",
    "check:browser-guided-interactions",
    "check:thread-context-ux",
    "check:thread-context-fuzz",
    "check:browser-clutter",
    "check:browser-scroll",
    "check:browser-journey-replay",
    "check:browser-performance",
    "check:production-smoke",
    "check:production-signed-in-smoke",
    "check:production-guided-questions"
  ],
  full: [
    "check:docs",
    "check:dependencies",
    "check:analyst",
    "check:regression-replays",
    "check:user-missions",
    "check:user-journey-stress",
    "check:thread-context-fuzz",
    ...(INCLUDE_BROWSER
      ? [
          "check:browser-surfaces",
          "check:browser-explorer",
          "check:browser-chat-flow",
          "check:browser-mobile",
          "check:browser-question-families",
          "check:browser-all-guided-answers",
          "check:browser-guided-accessibility",
          "check:browser-guided-interactions",
          "check:thread-context-ux",
          "check:thread-context-stress",
          "check:browser-clutter",
          "check:browser-scroll",
          "check:browser-california-home",
          "check:browser-missions",
          "check:browser-journey-fuzz",
          "check:browser-journey-replay",
          "check:browser-performance"
        ]
      : []),
    "check:production-smoke",
    "check:production-signed-in-smoke",
    "check:production-guided-questions",
    ...(INCLUDE_BUILD ? ["build"] : [])
  ]
};

function redacted(text) {
  return String(text)
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, "[redacted-key]")
    .replace(/([A-Z0-9]{20,})/g, (match) => (match.length > 36 ? "[redacted-token]" : match));
}

function tail(value, maxLength = 18_000) {
  const text = redacted(value);
  return text.length > maxLength ? text.slice(text.length - maxLength) : text;
}

function runNpmScript(scriptName) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", scriptName], {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = redacted(chunk.toString("utf8"));
      stdout = tail(stdout + text);
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = redacted(chunk.toString("utf8"));
      stderr = tail(stderr + text);
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      resolve({
        command: scriptName,
        status: "fail",
        exitCode: 1,
        elapsedMs: Date.now() - startedAt,
        stdout,
        stderr: tail(`${stderr}\n${error instanceof Error ? error.message : String(error)}`)
      });
    });
    child.on("close", (code) => {
      resolve({
        command: scriptName,
        status: code === 0 ? "pass" : "fail",
        exitCode: code,
        elapsedMs: Date.now() - startedAt,
        stdout,
        stderr
      });
    });
  });
}

async function main() {
  const profileCommands = commandProfiles[PROFILE];
  if (!profileCommands) {
    console.error(`Unknown PLATFORM_READY_PROFILE=${PROFILE}. Use quick, release, or full.`);
    process.exit(1);
  }

  let startIndex = 0;
  if (START_AT) {
    if (/^\d+$/.test(START_AT)) {
      startIndex = Number(START_AT) - 1;
    } else {
      startIndex = profileCommands.indexOf(START_AT.replace(/^npm run\s+/, ""));
    }
    if (startIndex < 0 || startIndex >= profileCommands.length) {
      console.error(
        `Unknown PLATFORM_READY_START_AT=${START_AT}. Use a 1-based stage number or one of: ${profileCommands.join(", ")}.`
      );
      process.exit(1);
    }
  }
  const commands = profileCommands.slice(startIndex);

  const artifactDir = path.join(ROOT, "generated", "platform-ready");
  await mkdir(artifactDir, { recursive: true });
  const startedAt = Date.now();
  const results = [];

  console.log(
    `platform readiness starting: profile=${PROFILE}, commands=${commands.length}/${profileCommands.length}, start=${startIndex + 1}`
  );
  for (const [index, command] of commands.entries()) {
    console.log(`\n=== platform-ready [${startIndex + index + 1}/${profileCommands.length}]: npm run ${command} ===`);
    const result = await runNpmScript(command);
    results.push(result);
    console.log(
      `platform-ready ${result.status}: ${command} in ${Math.round(result.elapsedMs / 1000)}s`
    );
    if (result.status !== "pass" && STOP_ON_FAILURE) break;
    const nextCommand = commands[index + 1];
    if (
      nextCommand &&
      BROWSER_STAGE_SETTLE_MS > 0 &&
      (command.includes("browser") || nextCommand.includes("browser"))
    ) {
      await delay(BROWSER_STAGE_SETTLE_MS);
    }
  }

  const failed = results.filter((result) => result.status !== "pass");
  const report = {
    generatedAt: new Date().toISOString(),
    version: "platform-ready-v1",
    profile: PROFILE,
    status: failed.length ? "fail" : "pass",
    passed: failed.length === 0,
    elapsedMs: Date.now() - startedAt,
    options: {
      includeBrowser: INCLUDE_BROWSER,
      includeBuild: INCLUDE_BUILD,
      stopOnFailure: STOP_ON_FAILURE,
      startAt: START_AT || null,
      startIndex: startIndex + 1,
      browserStageSettleMs: BROWSER_STAGE_SETTLE_MS
    },
    summary: {
      commands: commands.length,
      profileCommands: profileCommands.length,
      completed: results.length,
      passed: results.filter((result) => result.status === "pass").length,
      failed: failed.length,
      failedCommands: failed.map((result) => result.command)
    },
    results
  };
  const datedPath = path.join(artifactDir, `${new Date().toISOString().slice(0, 10)}-${PROFILE}.json`);

  await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));
  await writeFile(datedPath, JSON.stringify(report, null, 2));

  if (failed.length) {
    console.error(
      [
        `FAILED: platform readiness ${report.summary.passed}/${report.summary.completed} completed commands passed`,
        `Report: ${path.join(artifactDir, "latest.json")}`,
        ...failed.map((result) => `- ${result.command}: exit ${result.exitCode}`)
      ].join("\n")
    );
    process.exit(1);
  }

  console.log(
    `platform readiness passed: ${report.summary.passed}/${report.summary.commands} selected commands in ${Math.round(report.elapsedMs / 1000)}s`
  );
}

await main();
