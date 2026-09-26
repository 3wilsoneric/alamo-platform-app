#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCopilotTool } from "../server/copilot-tools.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const casesPath = path.join(__dirname, "regression-replay-cases.json");
const outputDir = path.join(ROOT, "generated", "regression-replays");
const outputPath = path.join(outputDir, "latest.json");

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function bodyFor(result) {
  return JSON.stringify({
    text: result?.text,
    tool: result?.tool,
    trace: result?.trace,
    analysisFrame: result?.analysisFrame,
    planValidation: result?.planValidation,
    interpretation: result?.interpretation,
    truthState: result?.truthState,
    visual: result?.visual,
    moduleSpec: result?.moduleSpec,
    moduleSpecs: result?.moduleSpecs,
    artifact: result?.artifact,
    actions: result?.actions,
    runtimeSchema: result?.runtimeSchema
  });
}

function includes(haystack, needle) {
  return String(haystack).toLowerCase().includes(String(needle).toLowerCase());
}

function validateCaseTurn(testCase, turn, result) {
  const expect = turn.expect ?? {};
  const body = bodyFor(result);
  const failures = [];

  if (result?.handled !== true) failures.push(`not handled: ${result?.reason ?? "no reason"}`);
  if (result?.handled && result?.tool !== "clarification" && result?.runtimeSchema?.valid !== true) {
    failures.push("runtime schema is missing or invalid");
  }

  const acceptedTools = asArray(expect.tool ?? expect.tools);
  if (acceptedTools.length && !acceptedTools.includes(result?.tool)) {
    failures.push(`expected tool ${acceptedTools.join(" or ")}, got ${result?.tool ?? "none"}`);
  }

  const acceptedTruthStates = asArray(expect.truthState ?? expect.truthStates);
  if (acceptedTruthStates.length && !acceptedTruthStates.includes(result?.truthState ?? result?.trace?.truthState)) {
    failures.push(`expected truthState ${acceptedTruthStates.join(" or ")}, got ${result?.truthState ?? result?.trace?.truthState ?? "none"}`);
  }

  if (expect.valueLabel && result?.visual?.valueLabel !== expect.valueLabel) {
    failures.push(`expected visual value label ${expect.valueLabel}, got ${result?.visual?.valueLabel ?? "none"}`);
  }

  if (expect.visualType && result?.visual?.type !== expect.visualType) {
    failures.push(`expected visual type ${expect.visualType}, got ${result?.visual?.type ?? "none"}`);
  }

  if (expect.artifact && !result?.artifact?.content && !result?.artifact?.href && !result?.artifact?.url) {
    failures.push("expected export artifact");
  }

  if (expect.artifactRowCountAtLeast && Number(result?.artifact?.rowCount ?? 0) < expect.artifactRowCountAtLeast) {
    failures.push(`expected at least ${expect.artifactRowCountAtLeast} artifact rows, got ${result?.artifact?.rowCount ?? "none"}`);
  }

  if (expect.visualRowsMax != null && Number(result?.visual?.rows?.length ?? 0) > expect.visualRowsMax) {
    failures.push(`expected at most ${expect.visualRowsMax} visual rows, got ${result?.visual?.rows?.length ?? "none"}`);
  }

  if (expect.period && !includes(body, expect.period)) failures.push(`missing period ${expect.period}`);
  if (expect.facilityId && !includes(body, expect.facilityId)) failures.push(`missing facility scope ${expect.facilityId}`);
  if (expect.category && !includes(body, expect.category)) failures.push(`missing category ${expect.category}`);
  if (expect.correctedText && result?.interpretation?.correctedText !== expect.correctedText) {
    failures.push(`expected correction ${expect.correctedText}, got ${result?.interpretation?.correctedText ?? "none"}`);
  }

  for (const snippet of asArray(expect.includes)) {
    if (!includes(body, snippet)) failures.push(`missing ${JSON.stringify(snippet)}`);
  }

  for (const snippet of asArray(expect.excludes)) {
    if (includes(body, snippet)) failures.push(`included forbidden snippet ${JSON.stringify(snippet)}`);
  }

  const forbiddenPatterns = [
    /\bAnalysis tool unavailable\b/i,
    /\bI could not answer that exact slice safely\b/i,
    /\bmissing requested category\b/i,
    /\bnot enough context\b/i,
    /\bAnswer The\b/i,
    /\bThe clearest row\b/i,
    /\blargest row in this slice\b/i,
    /\bClosest Recovery Path\b/i,
    /\bVictoria's Place\b/i,
    /\bfacility\s+(337|342|343|344|345)\b/i,
    /\bundefined\b/i,
    /\bObject object\b/i,
    /\bNaN\b/i
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(body)) failures.push(`matched forbidden pattern ${pattern}`);
  }

  return {
    id: `${testCase.id}#${turn.index}`,
    prompt: turn.prompt,
    tool: result?.tool ?? null,
    passed: failures.length === 0,
    failures,
    trace: {
      truthState: result?.truthState ?? result?.trace?.truthState ?? null,
      period: result?.trace?.period ?? result?.analysisFrame?.periods?.join(", ") ?? null,
      facilityId: result?.trace?.facilityId ?? result?.analysisFrame?.facilityId ?? null,
      rowCount: result?.trace?.rowCount ?? null,
      visualType: result?.visual?.type ?? null,
      visualRows: result?.visual?.rows?.length ?? null,
      artifactRows: result?.artifact?.rowCount ?? null
    },
    textSample: String(result?.text ?? "").slice(0, 900)
  };
}

async function runCase(testCase) {
  const sessionId = `regression-replay-${testCase.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let analysisFrame = null;
  const turns = [];

  for (const [index, rawTurn] of (testCase.turns ?? []).entries()) {
    const startedAt = Date.now();
    const turn = { ...rawTurn, index: index + 1 };
    const result = await runCopilotTool({
      content: turn.prompt,
      sessionId,
      analysisFrame
    });
    if (result?.analysisFrame) analysisFrame = result.analysisFrame;
    turns.push({
      ...validateCaseTurn(testCase, turn, result),
      elapsedMs: Date.now() - startedAt
    });
  }

  return {
    id: testCase.id,
    title: testCase.title,
    priority: testCase.priority ?? "normal",
    source: testCase.source ?? "regression backlog",
    passed: turns.every((turn) => turn.passed),
    turns
  };
}

const catalog = JSON.parse(await readFile(casesPath, "utf8"));
const results = [];

for (const testCase of catalog.cases ?? []) {
  results.push(await runCase(testCase));
}

const turns = results.flatMap((result) => result.turns);
const failedTurns = results.flatMap((result) =>
  result.turns
    .filter((turn) => !turn.passed)
    .map((turn) => ({
      caseId: result.id,
      title: result.title,
      prompt: turn.prompt,
      tool: turn.tool,
      failures: turn.failures,
      trace: turn.trace
    }))
);
const report = {
  summary: {
    generatedAt: new Date().toISOString(),
    version: catalog.version ?? "regression-replay-v1",
    status: failedTurns.length ? "fail" : "pass",
    cases: results.length,
    turns: turns.length,
    passedCases: results.filter((result) => result.passed).length,
    passedTurns: turns.filter((turn) => turn.passed).length,
    failedTurns: failedTurns.length,
    maxElapsedMs: Math.max(0, ...turns.map((turn) => turn.elapsedMs))
  },
  cases: results,
  failedTurns
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2));

if (failedTurns.length) {
  console.error(
    [
      `FAILED: regression replay library (${report.summary.passedTurns}/${report.summary.turns} turns passed)`,
      `Report: ${outputPath}`,
      failedTurns
        .slice(0, 20)
        .map((turn) => `- ${turn.caseId}: "${turn.prompt}" :: ${turn.failures.join("; ")}`)
        .join("\n")
    ].join("\n")
  );
  process.exit(1);
}

console.log(`regression replays passed (${report.summary.passedTurns}/${report.summary.turns} turns across ${report.summary.cases} cases)`);
