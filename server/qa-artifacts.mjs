import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, "..");
const MAX_QA_ARTIFACT_BYTES = 5 * 1024 * 1024;
const ANALYST_QA_STATUSES = new Set(["pass", "warning", "fail", "unknown"]);
const ANALYST_QA_FAILURE_STAGES = new Set(["compiler", "tool_execution", "plan_validation", "formatting"]);

const analystQaPath = path.resolve(repositoryRoot, "generated/analyst-qa/latest.json");
const qaArtifactSpecs = [
  ["platformReady", "Platform Ready", "platform-ready"],
  ["regressionReplays", "Regression Replays", "regression-replays"],
  ["browserJourneyFuzz", "Browser Journey Fuzz", "browser-journey-fuzz"],
  ["browserJourneyReplay", "Browser Failure Replay", "browser-journey-replay"],
  ["browserSurfaces", "Browser Surfaces", "browser-surface-qa"],
  ["browserMissions", "Browser Missions", "browser-mission-qa"],
  ["browserPerformance", "Browser Performance", "browser-performance-qa"],
  ["userJourneys", "User Journeys", "user-journey-qa"],
  ["userJourneyFuzz", "User Journey Fuzz", "user-journey-fuzz"],
  ["userMissionQa", "User Missions", "user-mission-qa"],
  ["userJourneyStress", "Journey Stress", "user-journey-stress"],
  ["productionSmoke", "Production Smoke", "production-smoke"],
  ["productionSignedInSmoke", "Production Signed-In Smoke", "production-signed-in-smoke"]
].map(([key, label, directory]) => ({
  key,
  label,
  artifactPath: path.resolve(repositoryRoot, `generated/${directory}/latest.json`)
}));

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasErrorCode(error, code) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

function boundedStringOrNull(value, maximumLength = 2_000) {
  if (typeof value !== "string" || value.length > maximumLength) return null;
  const text = value.trim();
  return text || null;
}

function timestampOrNull(value) {
  const text = boundedStringOrNull(value, 100);
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function nonnegativeIntegerOrNull(value) {
  return Number.isInteger(value) && value >= 0 && value <= 10_000_000 ? value : null;
}

function nullableQaString(value, maximumLength = 2_000) {
  if (value == null) return null;
  return boundedStringOrNull(value, maximumLength);
}

function boundedStringArray(value, maximumItems = 20, maximumLength = 2_000) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => boundedStringOrNull(entry, maximumLength))
    .filter(Boolean)
    .slice(0, maximumItems);
}

function sanitizeAnalystSummary(value) {
  if (!isRecord(value)) return null;
  const summary = {
    total: nonnegativeIntegerOrNull(value.total),
    passed: nonnegativeIntegerOrNull(value.passed),
    failed: nonnegativeIntegerOrNull(value.failed),
    warnings: nonnegativeIntegerOrNull(value.warnings),
    certifiedCoverage: nonnegativeIntegerOrNull(value.certifiedCoverage),
    cachedHits: nonnegativeIntegerOrNull(value.cachedHits)
  };
  return Object.values(summary).every((entry) => entry !== null) ? summary : null;
}

function sanitizeMetricRecord(value) {
  if (!isRecord(value)) return {};
  /** @type {Record<string, number | boolean | string>} */
  const sanitized = {};
  for (const [key, entry] of Object.entries(value).slice(0, 100)) {
    const safeKey = boundedStringOrNull(key, 100);
    if (!safeKey) continue;
    if (typeof entry === "number" && Number.isFinite(entry)) {
      sanitized[safeKey] = entry;
      continue;
    }
    if (typeof entry === "boolean") {
      sanitized[safeKey] = entry;
      continue;
    }
    const safeString = boundedStringOrNull(entry, 500);
    if (safeString) sanitized[safeKey] = safeString;
  }
  return sanitized;
}

function sanitizeQaHistoryEntry(value) {
  if (!isRecord(value)) return null;
  const generatedAt = timestampOrNull(value.generatedAt);
  const total = nonnegativeIntegerOrNull(value.total);
  const passed = nonnegativeIntegerOrNull(value.passed);
  const failed = nonnegativeIntegerOrNull(value.failed);
  if (!generatedAt || total === null || passed === null || failed === null) return null;
  return {
    generatedAt,
    businessDate: nullableQaString(value.businessDate, 100),
    status: ANALYST_QA_STATUSES.has(value.status) ? value.status : "unknown",
    total,
    passed,
    failed
  };
}

function sanitizeQaExpected(value) {
  if (!isRecord(value)) return null;
  return {
    periods: boundedStringArray(value.periods, 24, 100),
    category: nullableQaString(value.category, 500),
    communityName: nullableQaString(value.communityName, 500),
    facilityId: nullableQaString(value.facilityId, 100)
  };
}

function sanitizeQaActual(value) {
  if (!isRecord(value)) return null;
  const rowCount = nonnegativeIntegerOrNull(value.rowCount);
  return {
    tool: nullableQaString(value.tool, 240),
    period: nullableQaString(value.period, 100),
    community: nullableQaString(value.community, 500),
    category: nullableQaString(value.category, 500),
    ...(rowCount === null ? {} : { rowCount }),
    valid: typeof value.valid === "boolean" ? value.valid : null,
    validationErrors: boundedStringArray(value.validationErrors, 20, 2_000)
  };
}

function sanitizeQaFailure(value) {
  if (!isRecord(value)) return null;
  const id = boundedStringOrNull(value.id, 512);
  const prompt = boundedStringOrNull(value.prompt, 12_000);
  if (!id || !prompt) return null;
  const failures = boundedStringArray(value.failures, 20, 2_000);
  const failureDetails = Array.isArray(value.failureDetails)
    ? value.failureDetails
      .filter(isRecord)
      .map((detail) => ({
        stage: ANALYST_QA_FAILURE_STAGES.has(detail.stage) ? detail.stage : null,
        reason: boundedStringOrNull(detail.reason, 2_000)
      }))
      .filter((detail) => detail.stage && detail.reason)
      .slice(0, 20)
    : [];
  return {
    id,
    prompt,
    expectedTool: nullableQaString(value.expectedTool, 240),
    failures,
    failureDetails,
    expected: sanitizeQaExpected(value.expected),
    actual: sanitizeQaActual(value.actual)
  };
}

async function readBoundedQaArtifact(filePath) {
  const file = await stat(filePath);
  if (file.size > MAX_QA_ARTIFACT_BYTES) {
    throw new Error(`QA artifact exceeds the ${MAX_QA_ARTIFACT_BYTES}-byte read limit.`);
  }
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  if (!isRecord(parsed)) throw new Error("QA artifact root must be a JSON object.");
  return parsed;
}

export function normalizeAnalystQaArtifact(artifact) {
  if (!isRecord(artifact)) return null;
  return {
    status: ANALYST_QA_STATUSES.has(artifact.status) ? artifact.status : "unknown",
    generatedAt: timestampOrNull(artifact.generatedAt),
    businessDate: boundedStringOrNull(artifact.businessDate, 100),
    summary: sanitizeAnalystSummary(artifact.summary),
    history: Array.isArray(artifact.history)
      ? artifact.history.map(sanitizeQaHistoryEntry).filter(Boolean).slice(0, 7)
      : [],
    failures: Array.isArray(artifact.failures)
      ? artifact.failures.map(sanitizeQaFailure).filter(Boolean).slice(0, 20)
      : []
  };
}

async function readAnalystQaArtifact() {
  try {
    return normalizeAnalystQaArtifact(await readBoundedQaArtifact(analystQaPath));
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT")) console.warn("Analyst QA artifact could not be read.", error);
    return null;
  }
}

export async function getAnalystQaStatus() {
  const artifact = await readAnalystQaArtifact();
  if (!artifact) {
    return {
      available: false,
      status: "missing",
      generatedAt: null,
      businessDate: null,
      summary: null,
      history: [],
      failures: [],
      warning: "No analyst QA artifact is available yet. Run npm run qa:analyst after the daily snapshot/tools refresh."
    };
  }
  return {
    available: true,
    status: artifact.status,
    generatedAt: artifact.generatedAt,
    businessDate: artifact.businessDate,
    summary: artifact.summary,
    history: artifact.history,
    failures: artifact.failures,
    warning: artifact.status === "pass" ? null : "Analyst QA found issues that need review before trusting daily chat answers."
  };
}

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function getQaArtifactSummary(spec, artifact) {
  const source = isRecord(artifact) ? artifact : {};
  const summary = sanitizeMetricRecord(source.summary);
  const timings = sanitizeMetricRecord(source.timings);
  const generatedAt = timestampOrNull(source.generatedAt ?? summary.generatedAt);
  const explicitStatus = boundedStringOrNull(source.status ?? summary.status, 100);
  const passed = typeof source.passed === "boolean"
    ? source.passed
    : explicitStatus === "pass"
      ? true
      : explicitStatus === "fail"
        ? false
        : null;
  const total = firstNumber(
    summary.commands,
    summary.completed,
    summary.turns,
    summary.totalTurns,
    summary.cases,
    summary.missions,
    Array.isArray(source.results) ? source.results.length : null,
    Array.isArray(source.missions) ? source.missions.length : null,
    Array.isArray(source.scenarios) ? source.scenarios.length : null
  );
  const passedCount = firstNumber(
    summary.passed,
    summary.passedTurns,
    summary.passedCases,
    summary.passedMissions,
    total != null && passed === true ? total : null
  );
  const failedCount = firstNumber(
    summary.failed,
    summary.failedTurns,
    summary.failingTurns,
    summary.failedMissions,
    Array.isArray(source.failures) ? source.failures.length : null,
    total != null && passed === false && passedCount != null ? Math.max(0, total - passedCount) : null
  );
  const warnings = firstNumber(summary.warningTurns, Array.isArray(source.warningTurns) ? source.warningTurns.length : null);
  const status = explicitStatus === "skipped"
    ? "skipped"
    : passed === true
      ? "pass"
      : passed === false
        ? "fail"
        : "unknown";
  let detail = total != null
    ? `${passedCount ?? 0}/${total} checked${failedCount ? ` · ${failedCount} failed` : ""}${warnings ? ` · ${warnings} warnings` : ""}`
    : "Artifact loaded.";

  if (spec.key === "browserJourneyFuzz" && summary.sessions != null) {
    detail = `${summary.passedTurns ?? 0}/${summary.turns ?? 0} turns · ${summary.passedSessions ?? 0}/${summary.sessions} sessions`;
  } else if (spec.key === "browserSurfaces" && summary.cases != null) {
    detail = `${summary.passedCases ?? 0}/${summary.cases} surfaces · ${summary.consoleErrors ?? 0} console errors`;
  } else if (spec.key === "browserMissions" && summary.missions != null) {
    detail = `${summary.passedMissions ?? 0}/${summary.missions} missions · ${summary.turns ?? 0} turns`;
  } else if (spec.key === "browserPerformance" && Object.keys(timings).length) {
    detail = `Home ${Math.round(firstNumber(timings.homeReadyMs) ?? 0)}ms · chat ${Math.round(firstNumber(timings.chatReadyMs) ?? 0)}ms`;
  } else if (spec.key === "browserJourneyReplay" && explicitStatus === "skipped") {
    detail = boundedStringOrNull(source.reason) ?? "No failure artifact to replay.";
  } else if (spec.key === "platformReady" && summary.commands != null) {
    detail = `${summary.passed ?? 0}/${summary.commands} commands · ${Math.round((firstNumber(source.elapsedMs) ?? 0) / 1000)}s`;
  } else if (spec.key === "regressionReplays" && summary.turns != null) {
    detail = `${summary.passedTurns ?? 0}/${summary.turns} replay turns · ${summary.cases ?? 0} cases`;
  } else if (spec.key === "userJourneys" && summary.averageScore != null) {
    detail = `${summary.turns ?? 0} turns · average score ${summary.averageScore} · ${summary.failingTurns ?? 0} failed`;
  } else if (spec.key === "userJourneyFuzz" && summary.passRate != null) {
    detail = `${summary.totalTurns ?? 0} turns · ${summary.passRate}% pass rate`;
  } else if (spec.key === "userMissionQa" && summary.missions != null) {
    detail = `${summary.missions} missions · ${summary.turns ?? 0} turns · average score ${summary.averageScore ?? "—"}`;
  } else if (spec.key === "userJourneyStress" && summary.totalTurns != null) {
    detail = `${summary.totalTurns} turns · ${summary.failedTurns ?? 0} failed · max ${summary.maxElapsedMs ?? "—"}ms`;
  } else if (spec.key === "productionSmoke" && boundedStringOrNull(source.baseUrl)) {
    detail = `${boundedStringOrNull(source.baseUrl)} · ${summary.passedProbes ?? 0}/${summary.probes ?? 0} probes`;
  } else if (spec.key === "productionSignedInSmoke" && explicitStatus === "skipped") {
    detail = boundedStringOrNull(source.reason) ?? "Signed-in smoke skipped.";
  } else if (spec.key === "productionSignedInSmoke" && boundedStringOrNull(source.baseUrl)) {
    detail = `${boundedStringOrNull(source.baseUrl)}/home · ${Math.round(firstNumber(source.elapsedMs) ?? 0)}ms`;
  }

  return {
    key: spec.key,
    label: spec.label,
    available: true,
    status,
    generatedAt,
    detail: String(detail).slice(0, 2_000),
    passed: passed ?? status === "skipped",
    total,
    passedCount,
    failedCount,
    warningCount: warnings,
    artifactPath: path.relative(repositoryRoot, spec.artifactPath)
  };
}

async function readQaArtifactStatus(spec) {
  try {
    return getQaArtifactSummary(spec, await readBoundedQaArtifact(spec.artifactPath));
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT")) console.warn(`${spec.label} artifact could not be read.`, error);
    return {
      key: spec.key,
      label: spec.label,
      available: false,
      status: "missing",
      generatedAt: null,
      detail: "No artifact has been generated yet.",
      passed: false,
      total: null,
      passedCount: null,
      failedCount: null,
      warningCount: null,
      artifactPath: path.relative(repositoryRoot, spec.artifactPath)
    };
  }
}

export async function getQaArtifactStatuses() {
  return Promise.all(qaArtifactSpecs.map(readQaArtifactStatus));
}
