#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { compileCopilotIntent } from "../server/copilot-tools.mjs";
import { hasMeaningfulAnalysisFrame } from "../shared/analysis-session-state.mjs";

const ROOT = process.cwd();
const ARTIFACT_DIR = path.join(ROOT, "generated", "thread-context-fuzz");
const SESSION_COUNT_TARGET = Number(process.env.THREAD_CONTEXT_FUZZ_SESSIONS || 130);

const facilities = [
  { id: "337", name: "A & A Health Services San Pablo", short: "San Pablo", typo: "san pabllo" },
  { id: "342", name: "Victoria's House", short: "Victoria's House", typo: "victoria place" },
  { id: "343", name: "JC Wallace House", short: "JC Wallace", typo: "jc wallce" },
  { id: "344", name: "AHS Turlock OP LLC", short: "Turlock", typo: "turlok" },
  { id: "345", name: "Santa Clarita", short: "Santa Clarita", typo: "santa clartia" }
];

const months = [
  ["2026-01", "January"],
  ["2026-02", "February"],
  ["2026-03", "March"],
  ["2026-04", "April"],
  ["2026-05", "May"],
  ["2026-06", "June"]
];

const monthTypos = new Map([
  ["2026-01", "janurary"],
  ["2026-02", "frebruary"],
  ["2026-03", "march"],
  ["2026-04", "apirl"],
  ["2026-05", "may"],
  ["2026-06", "june"]
]);

function periodLabel(period) {
  return months.find(([value]) => value === period)?.[1] ?? period;
}

function nextPeriod(period) {
  const index = months.findIndex(([value]) => value === period);
  return months[(index + 1) % months.length][0];
}

function isEmptyFrame(frame) {
  return !hasMeaningfulAnalysisFrame(frame);
}

function frameSummary(frame) {
  if (!frame) return null;
  return {
    metric: frame.metric,
    metricGrain: frame.metricGrain,
    category: frame.category,
    mode: frame.mode,
    periods: frame.periods,
    grouping: frame.grouping,
    fields: frame.fields,
    export: frame.export,
    facilityId: frame.facilityId,
    communityName: frame.communityName,
    residentName: frame.residentName,
    calculation: frame.calculation,
    presentation: frame.presentation
  };
}

function checkExpectation({ result, nextFrame, expect }) {
  const failures = [];

  if (expect.missingPriorContext) {
    if (result.handled !== false || result.reason !== "missing-prior-analysis-context") {
      failures.push("expected missing-prior-analysis-context");
    }
  } else if (expect.handled !== false && result.handled !== true) {
    failures.push(`expected handled compiler result, got ${result.reason ?? "unknown"}`);
  }

  if (expect.noMeaningfulFrame && !isEmptyFrame(nextFrame)) failures.push("expected no meaningful analysis frame");
  if (expect.metric !== undefined && (nextFrame?.metric ?? null) !== expect.metric) failures.push(`expected metric ${expect.metric}, got ${nextFrame?.metric ?? "null"}`);
  if (expect.metricGrain !== undefined && (nextFrame?.metricGrain ?? null) !== expect.metricGrain) failures.push(`expected metricGrain ${expect.metricGrain}, got ${nextFrame?.metricGrain ?? "null"}`);
  if (expect.category !== undefined && (nextFrame?.category ?? null) !== expect.category) failures.push(`expected category ${expect.category}, got ${nextFrame?.category ?? "null"}`);
  if (expect.mode !== undefined && (nextFrame?.mode ?? null) !== expect.mode) failures.push(`expected mode ${expect.mode}, got ${nextFrame?.mode ?? "null"}`);
  if (expect.facilityId !== undefined && String(nextFrame?.facilityId ?? "") !== String(expect.facilityId)) failures.push(`expected facility ${expect.facilityId}, got ${nextFrame?.facilityId ?? "null"}`);
  if (expect.residentName !== undefined && nextFrame?.residentName !== expect.residentName) failures.push(`expected resident ${expect.residentName}, got ${nextFrame?.residentName ?? "null"}`);
  if (expect.noResident && nextFrame?.residentName) failures.push(`resident leaked into unrelated turn: ${nextFrame.residentName}`);
  if (expect.noCategory && nextFrame?.category) failures.push(`category leaked into unrelated turn: ${nextFrame.category}`);
  if (expect.export !== undefined && Boolean(nextFrame?.export) !== expect.export) failures.push(`expected export ${expect.export}, got ${Boolean(nextFrame?.export)}`);
  if (expect.periods) {
    const actualPeriods = nextFrame?.periods ?? [];
    for (const period of expect.periods) {
      if (!actualPeriods.includes(period)) failures.push(`expected period ${period}, got ${actualPeriods.join(",") || "none"}`);
    }
    if (expect.exactPeriods && actualPeriods.join(",") !== expect.periods.join(",")) {
      failures.push(`expected exact periods ${expect.periods.join(",")}, got ${actualPeriods.join(",") || "none"}`);
    }
  }
  if (expect.tool !== undefined && result.executionPlan?.tool !== expect.tool) failures.push(`expected tool ${expect.tool}, got ${result.executionPlan?.tool ?? "none"}`);
  if (expect.notTool !== undefined && result.executionPlan?.tool === expect.notTool) failures.push(`unexpected tool ${expect.notTool}`);

  return failures;
}

function scoreTurn({ result, nextFrame, expect, failures }) {
  const scorecard = {
    contextCorrect: failures.length === 0,
    safeFailure: !expect.missingPriorContext || result.reason === "missing-prior-analysis-context",
    noHiddenMemory: !(expect.noMeaningfulFrame && hasMeaningfulAnalysisFrame(nextFrame)),
    noWrongTool: !expect.tool || result.executionPlan?.tool === expect.tool,
    boundedCapability: result.handled === false || Boolean(result.executionPlan?.tool || result.detectedTool || expect.missingPriorContext)
  };
  const score = Object.values(scorecard).filter(Boolean).length;
  return {
    ...scorecard,
    score,
    maxScore: Object.keys(scorecard).length,
    passed: scorecard.contextCorrect && scorecard.safeFailure && scorecard.noHiddenMemory && scorecard.noWrongTool
  };
}

function makeAwolCountSession(index, facility, period, variant) {
  const next = nextPeriod(period);
  const basePrompt = variant === 0
    ? `how many people went AWOL in ${periodLabel(period)} 2026`
    : variant === 1
      ? `how many AWOL incidents in ${periodLabel(period)} 2026 total`
      : `how many clients went awol in ${monthTypos.get(period)} 2026`;
  const metricGrain = variant === 1 ? "incident_events" : "distinct_residents";
  return {
    id: `awol-count-${index}`,
    kind: "incident-count-follow-up",
    turns: [
      {
        prompt: basePrompt,
        expect: {
          metric: "incidents",
          metricGrain,
          category: "AWOL/Elopement",
          mode: "aggregate",
          periods: [period],
          exactPeriods: true,
          tool: "incident_breakdown"
        }
      },
      {
        prompt: `same thing for ${periodLabel(next)}`,
        expect: {
          metric: "incidents",
          metricGrain,
          category: "AWOL/Elopement",
          mode: "aggregate",
          periods: [next],
          exactPeriods: true,
          tool: "incident_breakdown"
        }
      },
      {
        prompt: `now ${facility.short}`,
        expect: {
          metric: "incidents",
          metricGrain,
          category: "AWOL/Elopement",
          mode: "aggregate",
          facilityId: facility.id,
          periods: [next],
          tool: "incident_breakdown"
        }
      },
      {
        prompt: "why are today's incidents not showing up",
        expect: {
          metric: null,
          noMeaningfulFrame: true,
          tool: "data_availability"
        }
      },
      {
        prompt: "do it for april",
        expect: {
          missingPriorContext: true,
          noMeaningfulFrame: true
        }
      }
    ]
  };
}

function makeDetailExportSession(index, facility, period) {
  return {
    id: `detail-export-${index}`,
    kind: "exact-detail-export",
    turns: [
      {
        prompt: `list every AWOL incident in ${periodLabel(period)} 2026 by community including resident name date type and description`,
        expect: {
          metric: "incidents",
          category: "AWOL/Elopement",
          mode: "detail",
          periods: [period],
          exactPeriods: true,
          tool: "incident_detail_list"
        }
      },
      {
        prompt: `same for ${facility.short}`,
        expect: {
          metric: "incidents",
          category: "AWOL/Elopement",
          mode: "detail",
          facilityId: facility.id,
          periods: [period],
          tool: "incident_detail_list"
        }
      },
      {
        prompt: "export that",
        expect: {
          metric: "incidents",
          category: "AWOL/Elopement",
          mode: "detail",
          export: true,
          facilityId: facility.id,
          periods: [period],
          tool: "export_csv"
        }
      },
      {
        prompt: `how is ${facility.short}`,
        expect: {
          metric: null,
          category: null,
          mode: null,
          facilityId: facility.id,
          noCategory: true,
          tool: "community_history"
        }
      }
    ]
  };
}

function makeCensusTypoSession(index, facility, period) {
  return {
    id: `census-typo-${index}`,
    kind: "typo-correction-reset",
    turns: [
      {
        prompt: `show ${facility.typo} censsus trend`,
        expect: {
          metric: "census",
          mode: "trend",
          facilityId: facility.id,
          tool: "census_trend"
        }
      },
      {
        prompt: `same thing for ${periodLabel(period)}`,
        expect: {
          metric: "census",
          mode: "trend",
          facilityId: facility.id,
          periods: [period],
          tool: "census_trend"
        }
      },
      { action: "new-chat" },
      {
        prompt: "do it for april",
        expect: {
          missingPriorContext: true,
          noMeaningfulFrame: true
        }
      },
      {
        prompt: `show ${facility.name} census trend`,
        expect: {
          metric: "census",
          mode: "trend",
          facilityId: facility.id,
          tool: "census_trend"
        }
      }
    ]
  };
}

function makeResidentSwitchSession(index) {
  return {
    id: `resident-switch-${index}`,
    kind: "resident-to-portfolio-switch",
    turns: [
      {
        prompt: "show Shannon Romero resident profile",
        expect: {
          metric: "residents",
          mode: "profile",
          residentName: "Shannon Romero",
          tool: "resident_lookup"
        }
      },
      {
        prompt: "show incident history",
        expect: {
          metric: "incidents",
          residentName: "Shannon Romero",
          noCategory: true,
          tool: "resident_incident_history"
        }
      },
      {
        prompt: "how many people went AWOL in May 2026",
        expect: {
          metric: "incidents",
          metricGrain: "distinct_residents",
          category: "AWOL/Elopement",
          mode: "aggregate",
          periods: ["2026-05"],
          noResident: true,
          tool: "incident_breakdown"
        }
      },
      { action: "new-chat" },
      {
        prompt: "show incident history",
        expect: {
          metric: "incidents",
          mode: "trend",
          noResident: true,
          tool: "slice_metric"
        }
      }
    ]
  };
}

function makeHistorySession(index, facility, period) {
  return {
    id: `history-restore-${index}`,
    kind: "history-restore-explicit-only",
    turns: [
      {
        prompt: `show ${facility.short} ${periodLabel(period)} incident categories`,
        expect: {
          metric: "incidents",
          facilityId: facility.id,
          periods: [period],
          tool: "incident_breakdown"
        }
      },
      { action: "save-history" },
      { action: "reload" },
      {
        prompt: "same thing for May",
        expect: {
          missingPriorContext: true,
          noMeaningfulFrame: true
        }
      },
      { action: "restore-history" },
      {
        prompt: "same thing for May",
        expect: {
          metric: "incidents",
          facilityId: facility.id,
          periods: ["2026-05"],
          exactPeriods: true,
          tool: "incident_breakdown"
        }
      },
      { action: "new-chat" },
      {
        prompt: "same thing for June",
        expect: {
          missingPriorContext: true,
          noMeaningfulFrame: true
        }
      }
    ]
  };
}

function buildSessions() {
  const sessions = [];
  let index = 0;
  for (const facility of facilities) {
    for (const [period] of months) {
      sessions.push(makeAwolCountSession(index++, facility, period, 0));
      sessions.push(makeAwolCountSession(index++, facility, period, 1));
      sessions.push(makeDetailExportSession(index++, facility, period));
      sessions.push(makeCensusTypoSession(index++, facility, period));
    }
  }
  for (let count = 0; count < 5; count += 1) sessions.push(makeResidentSwitchSession(index++));
  for (const facility of facilities) sessions.push(makeHistorySession(index++, facility, "2026-04"));
  return sessions.slice(0, Math.max(SESSION_COUNT_TARGET, 1));
}

async function runSession(session, sessionIndex) {
  let frame = null;
  let savedFrame = null;
  const turns = [];
  const sessionId = `thread-context-fuzz-${Date.now()}-${sessionIndex}`;

  for (const [turnIndex, turn] of session.turns.entries()) {
    if (turn.action === "new-chat" || turn.action === "reload") {
      frame = null;
      turns.push({
        turnIndex: turnIndex + 1,
        action: turn.action,
        passed: true,
        failures: [],
        scorecard: { contextCorrect: true, safeFailure: true, noHiddenMemory: true, noWrongTool: true, boundedCapability: true, score: 5, maxScore: 5, passed: true },
        frame: null
      });
      continue;
    }

    if (turn.action === "save-history") {
      savedFrame = hasMeaningfulAnalysisFrame(frame) ? frame : null;
      turns.push({
        turnIndex: turnIndex + 1,
        action: turn.action,
        passed: Boolean(savedFrame),
        failures: savedFrame ? [] : ["expected a meaningful frame to save"],
        scorecard: { contextCorrect: Boolean(savedFrame), safeFailure: true, noHiddenMemory: true, noWrongTool: true, boundedCapability: true, score: savedFrame ? 5 : 4, maxScore: 5, passed: Boolean(savedFrame) },
        frame: frameSummary(frame)
      });
      continue;
    }

    if (turn.action === "restore-history") {
      frame = savedFrame;
      turns.push({
        turnIndex: turnIndex + 1,
        action: turn.action,
        passed: Boolean(frame),
        failures: frame ? [] : ["expected saved frame to restore"],
        scorecard: { contextCorrect: Boolean(frame), safeFailure: true, noHiddenMemory: true, noWrongTool: true, boundedCapability: true, score: frame ? 5 : 4, maxScore: 5, passed: Boolean(frame) },
        frame: frameSummary(frame)
      });
      continue;
    }

    const result = await compileCopilotIntent({
      content: turn.prompt,
      sessionId,
      analysisFrame: frame
    });
    const nextFrame = hasMeaningfulAnalysisFrame(result.analysisFrame) ? result.analysisFrame : null;
    const failures = checkExpectation({ result, nextFrame, expect: turn.expect ?? {} });
    const scorecard = scoreTurn({ result, nextFrame, expect: turn.expect ?? {}, failures });
    const passed = failures.length === 0 && scorecard.passed;
    turns.push({
      turnIndex: turnIndex + 1,
      prompt: turn.prompt,
      passed,
      failures,
      scorecard,
      compiler: {
        handled: result.handled,
        reason: result.reason ?? null,
        interpretedContent: result.interpretedContent ?? null,
        detectedTool: result.detectedTool ?? null,
        executionTool: result.executionPlan?.tool ?? null,
        inherited: Boolean(result.compiler?.inherited),
        missingPriorContext: Boolean(result.compiler?.missingPriorContext)
      },
      frame: frameSummary(nextFrame)
    });
    frame = nextFrame;
  }

  return {
    id: session.id,
    kind: session.kind,
    passed: turns.every((turn) => turn.passed),
    turns
  };
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const sessions = buildSessions();
  const results = [];

  for (const [index, session] of sessions.entries()) {
    const result = await runSession(session, index);
    results.push(result);
  }

  const turns = results.flatMap((result) => result.turns);
  const scorecards = turns.map((turn) => turn.scorecard).filter(Boolean);
  const scoreTotal = scorecards.reduce((sum, scorecard) => sum + scorecard.score, 0);
  const maxScoreTotal = scorecards.reduce((sum, scorecard) => sum + scorecard.maxScore, 0);
  const failed = results.filter((result) => !result.passed);
  const report = {
    generatedAt: new Date().toISOString(),
    version: "thread-context-fuzz-v1",
    passed: failed.length === 0,
    summary: {
      sessions: results.length,
      turns: turns.length,
      passedSessions: results.length - failed.length,
      passedTurns: turns.filter((turn) => turn.passed).length,
      qualitativeScore: maxScoreTotal ? Number((scoreTotal / maxScoreTotal).toFixed(3)) : null
    },
    failed: failed.slice(0, 25),
    results
  };

  await writeFile(path.join(ARTIFACT_DIR, "latest.json"), JSON.stringify(report, null, 2));

  if (!report.passed) {
    console.error(JSON.stringify({ summary: report.summary, failed: report.failed }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(
    `thread context fuzz passed: ${report.summary.passedTurns}/${report.summary.turns} turns across ${report.summary.sessions} sessions; qualitative=${report.summary.qualitativeScore}`
  );
}

await main();
