#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BASE_URL,
  ask,
  attachPageDiagnostics,
  openChat,
  prepareArtifactDirs,
  startCleanChat,
  waitForExpectations,
  withBrowserQa
} from "./browser-qa-utils.mjs";

let artifactDir = path.join(process.cwd(), "generated", "browser-mission-qa");
let screenshotDir = path.join(artifactDir, "screenshots");
let activePage = null;

const missions = [
  {
    name: "Portfolio and resident starting views",
    goal: "Move from a current portfolio review into the resident directory using vetted questions.",
    turns: [
      {
        prompt: "Show the current incident snapshot for this month.",
        expect: [/latest available incident month/i, /Portfolio Incident Category Breakdown/i],
        surface: /Medication Refusal|AWOL\/Elopement/i
      },
      {
        prompt: "Can you show me the Resident Search module?",
        expect: [/Opened Resident Search|All communities/i, /residents/i],
        surface: /All communities/i
      }
    ]
  },
  {
    name: "Resident profile lookup",
    goal: "Find a named resident and render one readable, complete profile.",
    turns: [
      {
        prompt: "show Shannon Romero resident profile",
        expect: [/Shannon Romero/i, /Santa Clarita/i, /Resident #/i],
        surface: /Shannon Romero|Resident #/i
      }
    ]
  },
  {
    name: "Typo trend recovery",
    goal: "Correct common spelling mistakes and still surface the right community trend.",
    turns: [
      {
        prompt: "show santa clartia censsus trend",
        expect: [/Santa Clarita/i, /Census Trend/i],
        surface: /Census Trend/i
      }
    ]
  },
  {
    name: "Guided AWOL investigation",
    goal: "Run multiple vetted AWOL questions without relying on unsupported free-form follow-ups.",
    turns: [
      {
        prompt: "List every AWOL incident from May through June by community, including resident name, date, incident type, and description",
        expect: [/AWOL\/Elopement/i, /May 2026/i, /Jun|June 2026/i],
        surface: /AWOL\/Elopement/i
      },
      {
        prompt: "Can you show AWOL incident descriptions for April 2026?",
        expect: [/AWOL\/Elopement/i, /Apr|April 2026/i],
        surface: /AWOL\/Elopement/i
      },
      {
        prompt: "How many AWOL incidents did San Pablo have in May 2026?",
        expect: [/A & A Health Services San Pablo/i, /AWOL\/Elopement/i],
        surface: /A & A Health Services San Pablo/i
      },
      {
        prompt: "How many residents had AWOL incidents in May 2026?",
        expect: [/AWOL\/Elopement/i, /residents/i],
        surface: /AWOL\/Elopement/i
      }
    ]
  },
  {
    name: "Community operating follow-up",
    goal: "Move from a complete community view into a medication-specific follow-up.",
    turns: [
      {
        prompt: "How is San Pablo doing?",
        expect: [/A & A Health Services San Pablo/i, /census|residents/i, /incidents/i],
        surface: /A & A Health Services San Pablo/i
      },
      {
        prompt: "Show San Pablo's medication profile.",
        expect: [/A & A Health Services San Pablo/i, /medication/i, /compliance|scheduled/i],
        surface: /Medication Profile|Compliance/i
      }
    ]
  }
];

async function runMission(page, mission, missionIndex) {
  await startCleanChat(page);

  const turns = [];

  for (const [turnIndex, turn] of mission.turns.entries()) {
    console.log(
      `browser mission ${missionIndex + 1}/${missions.length}, turn ${turnIndex + 1}/${mission.turns.length}: ${mission.name}`
    );
    const result = await ask(page, turn.prompt, turnIndex + 1);
    const expectations = await waitForExpectations(page, turn.expect);
    const surfaceExpectation = turn.surface
      ? await waitForExpectations(page, [turn.surface])
      : { found: [], missing: [] };
    const hasReadableAnchor = (canvas) => (
      typeof canvas.anchorTop === "number" &&
      canvas.anchorTop >= -20 &&
      canvas.anchorTop <= 280
    );
    const renderedInWorkspace =
      result.finalCanvas.composerVisible ||
      result.finalCanvas.latestModuleVisible ||
      result.finalCanvas.anchorVisibleNearTop ||
      hasReadableAnchor(result.finalCanvas) ||
      result.pendingCanvas.composerVisible ||
      result.pendingCanvas.latestModuleVisible ||
      result.pendingCanvas.anchorVisibleNearTop ||
      hasReadableAnchor(result.pendingCanvas);
    const passed =
      expectations.missing.length === 0 &&
      surfaceExpectation.missing.length === 0 &&
      renderedInWorkspace &&
      result.finalCanvas.horizontalOverflow <= 8;

    const screenshotPath = path.join(
      screenshotDir,
      `${String(missionIndex + 1).padStart(2, "0")}-${String(turnIndex + 1).padStart(2, "0")}.png`
    );
    await page.screenshot({ path: screenshotPath, fullPage: false });

    turns.push({
      ...result,
      expected: expectations,
      surfaceExpected: surfaceExpectation,
      passed,
      screenshotPath
    });
  }

  const passed = turns.every((turn) => turn.passed);
  return {
    name: mission.name,
    goal: mission.goal,
    passed,
    turns
  };
}

async function main() {
  const artifactDirs = await prepareArtifactDirs("browser-mission-qa");
  artifactDir = artifactDirs.artifactDir;
  screenshotDir = artifactDirs.screenshotDir;
  const consoleErrors = [];
  const requestFailures = [];

  await withBrowserQa(async (browser) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 920 }
    });
    const page = await context.newPage();
    activePage = page;
    attachPageDiagnostics(page, { consoleErrors, requestFailures });

    await openChat(page);

    const results = [];
    for (const [missionIndex, mission] of missions.entries()) {
      results.push(await runMission(page, mission, missionIndex));
    }

    const passed =
      results.every((mission) => mission.passed) &&
      consoleErrors.length === 0 &&
      requestFailures.length === 0;
    const turnCount = results.reduce((sum, mission) => sum + mission.turns.length, 0);
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      passed,
      summary: {
        missions: results.length,
        turns: turnCount,
        passedMissions: results.filter((mission) => mission.passed).length,
        consoleErrors: consoleErrors.length,
        requestFailures: requestFailures.length
      },
      consoleErrors,
      requestFailures,
      results
    };

    await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));

    if (!passed) {
      console.error(JSON.stringify(report.summary, null, 2));
      const failed = results
        .flatMap((mission) => mission.turns.map((turn) => ({ mission: mission.name, ...turn })))
        .filter((turn) => !turn.passed)
        .map((turn) => ({
          mission: turn.mission,
          prompt: turn.prompt,
          missing: turn.expected.missing,
          missingSurface: turn.surfaceExpected.missing,
          pendingCanvas: turn.pendingCanvas,
          finalCanvas: turn.finalCanvas,
          screenshotPath: turn.screenshotPath
        }));
      console.error(JSON.stringify({ failed, consoleErrors, requestFailures }, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log(
      `browser mission QA passed: ${report.summary.passedMissions}/${report.summary.missions} missions, ${turnCount} turns`
    );
  });
}

try {
  await main();
} catch (error) {
  if (activePage) {
    await activePage.screenshot({ path: path.join(screenshotDir, "failure.png"), fullPage: true }).catch(() => {});
  }
  const details = error?.details ? { details: error.details } : {};
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error), ...details }, null, 2));
  process.exitCode = 1;
}
