#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const PROFILE = String(process.env.PLATFORM_READY_PROFILE || "full").toLowerCase();
const STOP_ON_FAILURE = process.env.PLATFORM_READY_STOP_ON_FAILURE === "true";
const INCLUDE_BROWSER = process.env.PLATFORM_READY_SKIP_BROWSER !== "true";
const INCLUDE_PRODUCTION = process.env.PLATFORM_READY_SKIP_PRODUCTION !== "true";
const INCLUDE_BUILD = process.env.PLATFORM_READY_INCLUDE_BUILD === "true";
const START_AT = String(process.env.PLATFORM_READY_START_AT || "").trim();
const BROWSER_STAGE_SETTLE_MS = Number(
  process.env.PLATFORM_READY_BROWSER_STAGE_SETTLE_MS || 1_500
);

const commandProfiles = {
  // Bounded Ally releases: native report UI and governed report adapters only.
  // Broad shell, authentication, publishing or unrelated feature changes use full.
  ally: [
    "check:release-budget", "check:docs", "typecheck", "typecheck:server", "check:source-syntax",
    "check:dependencies", "check:platform-api", "check:executive-reports",
    "check:browser-executive-ally", "build"
  ],
  "ally-live": ["check:production-smoke", "check:production-signed-in-smoke"],
  quick: [
    "check:docs",
    "check:desktop",
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
    "check:desktop",
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
    "check:browser-executive-ally",
    "check:browser-mobile",
    "check:browser-platform-mobile",
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
    "check:desktop",
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
          "check:browser-executive-ally",
          "check:browser-mobile",
          "check:browser-platform-mobile",
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
    ...(INCLUDE_PRODUCTION
      ? ["check:production-smoke", "check:production-signed-in-smoke", "check:production-guided-questions"]
      : []),
    ...(INCLUDE_BUILD ? ["build"] : [])
  ]
};

// The routine release has one five-minute check budget: three before cutover,
// two against the deployed candidate. These are ceilings, never pass criteria.
export function releaseBudget(profile) {
  return profile === "ally" || profile === "ally-data" ? 180_000
    : profile === "ally-live" ? 120_000 : null;
}

// Publisher changes add their actual mapping/null/grant/transport checks, not
// every unrelated historical UI journey. Production data QA still runs before
// publication; this profile does not authorize publishing an unchecked snapshot.
commandProfiles["ally-data"] = [...commandProfiles.ally.slice(0, -2),
  "check:data-depth", "check:client-database", ...commandProfiles.ally.slice(-2)];

function redacted(text) {
  return String(text)
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, "[redacted-key]")
    .replace(/([A-Z0-9]{20,})/g, (match) => (match.length > 36 ? "[redacted-token]" : match));
}

function tail(value, maxLength = 18_000) {
  const text = redacted(value);
  return text.length > maxLength ? text.slice(text.length - maxLength) : text;
}

export function runNpmScript(scriptName, { timeoutMs = null, cwd = ROOT,
  executable = "npm", args = ["run", scriptName], quiet = false } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer;
    const finish = (code, error) => {
      clearTimeout(timer);
      resolve({ command: scriptName, status: !timedOut && code === 0 ? "pass" : "fail",
        exitCode: timedOut ? 124 : code, timedOut, elapsedMs: Date.now() - startedAt,
        stdout, stderr: error ? tail(`${stderr}\n${error.message}`) : stderr });
    };
    if (timeoutMs !== null) timer = setTimeout(() => {
      timedOut = true;
      stderr = tail(`${stderr}\nRelease check budget exhausted during ${scriptName}.`);
      // Kill this check's process group, including npm's browser/server children.
      // Never terminate the user's Chrome session or an unrelated process.
      if (child.pid) {
        try {
          if (process.platform === "win32") {
            spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
          } else process.kill(-child.pid, "SIGKILL");
        } catch (error) { if (error.code !== "ESRCH") child.kill("SIGKILL"); }
      }
    }, Math.max(1, timeoutMs));

    child.stdout.on("data", (chunk) => {
      const text = redacted(chunk.toString("utf8"));
      stdout = tail(stdout + text);
      if (!quiet) process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = redacted(chunk.toString("utf8"));
      stderr = tail(stderr + text);
      if (!quiet) process.stderr.write(text);
    });
    child.on("error", (error) => {
      finish(1, error);
    });
    child.on("close", (code) => {
      finish(code);
    });
  });
}

async function main() {
  const profileCommands = commandProfiles[PROFILE];
  if (!profileCommands) {
    console.error(`Unknown PLATFORM_READY_PROFILE=${PROFILE}. Use ${Object.keys(commandProfiles).join(", ")}.`);
    process.exit(1);
  }

  const budgetMs = releaseBudget(PROFILE);
  if (budgetMs && START_AT) throw new Error("Scoped release checks cannot skip stages. Reuse an existing passing receipt only for the identical tested candidate.");

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
    const remainingMs = budgetMs === null ? null : budgetMs - (Date.now() - startedAt);
    const result = remainingMs !== null && remainingMs <= 0
      ? { command, status: "fail", exitCode: 124, timedOut: true, elapsedMs: 0,
          stdout: "", stderr: "Release check budget exhausted before this stage." }
      : await runNpmScript(command, { timeoutMs: remainingMs });
    results.push(result);
    console.log(
      `platform-ready ${result.status}: ${command} in ${Math.round(result.elapsedMs / 1000)}s`
    );
    if (result.status !== "pass" && (STOP_ON_FAILURE || budgetMs !== null)) break;
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
    budgetMs,
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
