export const GOVERNED_REPORT_VERSION = "governed-one-page-v1";

export const GOVERNED_REPORT_AUDIENCES = Object.freeze([
  Object.freeze({ id: "executive", label: "Executive", description: "Headline, movement, and decisions." }),
  Object.freeze({ id: "operations", label: "Operations", description: "Performance, drivers, and next checks." }),
  Object.freeze({ id: "community", label: "Community leader", description: "Local results and practical follow-through." }),
  Object.freeze({ id: "clinical", label: "Clinical", description: "Safety, medication, and resident-care signals." })
]);

export const GOVERNED_REPORT_EMPHASES = Object.freeze([
  Object.freeze({ id: "overview", label: "Balanced overview" }),
  Object.freeze({ id: "changes", label: "What changed" }),
  Object.freeze({ id: "risks", label: "Risks and exceptions" }),
  Object.freeze({ id: "actions", label: "Actions and follow-up" })
]);

const AUDIENCE_IDS = new Set(GOVERNED_REPORT_AUDIENCES.map((item) => item.id));
const EMPHASIS_IDS = new Set(GOVERNED_REPORT_EMPHASES.map((item) => item.id));
const REPORTABLE_TRUTH_STATES = new Set(["valid_rows", "verified_zero"]);
const SECTION_LABELS = new Set([
  "answer",
  "key facts",
  "supporting facts",
  "context",
  "definition",
  "rows checked",
  "source",
  "next",
  "suggested next step",
  "suggested next steps"
]);
const MAX_SOURCE_ANSWER_LENGTH = 250_000;
const MAX_REPORT_SOURCES = 12;
const MAX_VISUAL_ROWS = 1_000;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeLine(value) {
  return String(value ?? "")
    .replace(/^\s*[-*•]\s*/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .trim();
}

function sentence(value) {
  const cleaned = compactWhitespace(value).replace(/[;:]\s*$/, "");
  if (!cleaned) return "";
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function unique(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = compactWhitespace(item).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compactHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createReportNonce() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().slice(0, 8);
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 8);
}

function firstPresent(...values) {
  return values.find((value) => value !== null && value !== undefined && String(value).trim()) ?? null;
}

function getRouteId(source) {
  return firstPresent(
    source?.routeId,
    source?.certifiedQuestionRouteId,
    source?.certifiedQuestion?.routeId,
    source?.guidedContract?.routeId
  );
}

function getSourceRouteIds(source) {
  return unique([
    source?.routeId,
    source?.certifiedQuestionRouteId,
    source?.certifiedQuestion?.routeId,
    source?.guidedContract?.routeId
  ].filter(Boolean).map(String));
}

function getTruthState(source) {
  return firstPresent(
    source?.truthState,
    source?.trace?.truthState,
    source?.turnTrace?.truthState
  );
}

function getAnswer(source) {
  return String(firstPresent(source?.answer, source?.text) ?? "").trim();
}

function validateVisual(visual) {
  if (visual == null) return true;
  if (!isObject(visual) || !Array.isArray(visual.rows) || visual.rows.length > MAX_VISUAL_ROWS) return false;
  return visual.rows.every((row) => (
    isObject(row) &&
    typeof row.label === "string" &&
    row.label.length <= 2_000 &&
    Number.isFinite(Number(row.value)) &&
    (
      row.cells === undefined ||
      (
        Array.isArray(row.cells) &&
        row.cells.length <= 100 &&
        row.cells.every((cell) => cell === null || ["string", "number"].includes(typeof cell))
      )
    )
  ));
}

export function normalizeGovernedReportOptions(options = {}) {
  const audience = AUDIENCE_IDS.has(options.audience) ? options.audience : "executive";
  const emphasis = EMPHASIS_IDS.has(options.emphasis) ? options.emphasis : "overview";
  return { audience, emphasis };
}

export function validateGovernedReportSource(source) {
  const errors = [];
  if (!isObject(source)) return { valid: false, errors: ["Report evidence must be an object."] };

  const answer = getAnswer(source);
  const routeId = getRouteId(source);
  const routeIds = getSourceRouteIds(source);
  const truthState = getTruthState(source);
  if (!answer || answer.length > MAX_SOURCE_ANSWER_LENGTH) errors.push("The verified answer is missing or too large.");
  if (!routeId || String(routeId).length > 256) errors.push("The answer is not tied to a registered question route.");
  if (routeIds.length !== 1) errors.push("The answer carries conflicting registered question routes.");
  if (!REPORTABLE_TRUTH_STATES.has(String(truthState ?? ""))) errors.push("The answer is stale, incomplete, or not supported by loaded rows.");
  if (source.handled !== true || source.safeRefusal === true || source.contractViolation) errors.push("The answer did not complete safely.");
  if (source.runtimeSchema?.valid !== true) errors.push("The answer is missing successful runtime schema validation.");
  if (source.turnTrace?.validation?.valid !== true) errors.push("The answer is missing successful execution-plan validation.");
  if (source.guidedContract?.valid !== true) errors.push("The answer is missing its successful registered question contract.");
  if (!validateVisual(source.visual)) errors.push("The answer visual is not safe to include.");

  return {
    valid: errors.length === 0,
    errors,
    normalized: errors.length
      ? null
      : {
          routeId: String(routeId),
          question: compactWhitespace(firstPresent(
            source.question,
            source.analysisFrame?.sourcePrompt,
            source.certifiedQuestion?.title,
            routeId
          )),
          answer,
          tool: compactWhitespace(firstPresent(source.tool, source.trace?.tool, source.turnTrace?.selectedTool, "verified analysis")),
          truthState: String(truthState),
          scope: compactWhitespace(firstPresent(
            source.scope,
            source.trace?.communityName,
            source.analysisFrame?.communityName,
            source.analysisFrame?.residentName,
            "Portfolio"
          )),
          period: compactWhitespace(firstPresent(
            source.period,
            source.trace?.period,
            source.analysisFrame?.periods?.join(" to "),
            "Latest approved data"
          )),
          rowCount: Number.isFinite(Number(firstPresent(source.trace?.rowCount, source.turnTrace?.rowCount, source.provenance?.rowCount)))
            ? Number(firstPresent(source.trace?.rowCount, source.turnTrace?.rowCount, source.provenance?.rowCount))
            : null,
          visual: source.visual ?? null,
          generatedFromCache: source.cached === true
        }
  };
}

export function validateGovernedReportSources(sources) {
  if (!Array.isArray(sources) || !sources.length || sources.length > MAX_REPORT_SOURCES) {
    return { valid: false, errors: [`A report requires 1 to ${MAX_REPORT_SOURCES} verified answers.`], sources: [] };
  }

  const validations = sources.map(validateGovernedReportSource);
  return {
    valid: validations.every((validation) => validation.valid),
    errors: validations.flatMap((validation, index) => validation.errors.map((error) => `Answer ${index + 1}: ${error}`)),
    sources: validations.map((validation) => validation.normalized).filter(Boolean)
  };
}

function parseAnswer(answer) {
  const lines = String(answer)
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);
  const content = lines.filter((line) => !SECTION_LABELS.has(line.toLowerCase()));
  const lead = content[0] ?? "";
  const details = unique(content.slice(1).map(sentence)).filter((line) => line.toLowerCase() !== sentence(lead).toLowerCase());
  return {
    lead: sentence(lead),
    details
  };
}

function formatMetricValue(row) {
  if (Array.isArray(row?.cells) && row.cells.length) {
    const values = row.cells
      .filter((cell) => cell !== null && cell !== undefined && String(cell).trim())
      .slice(-2)
      .map((cell) => String(cell));
    if (values.length) return values.join(" · ");
  }
  const value = Number(row?.value);
  return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—";
}

function collectMetrics(sources) {
  const metrics = [];
  const seen = new Set();
  for (const source of sources) {
    for (const row of source.visual?.rows?.slice(0, 5) ?? []) {
      const label = compactWhitespace(row.label);
      const value = formatMetricValue(row);
      const key = `${label.toLowerCase()}:${value}`;
      if (!label || seen.has(key)) continue;
      seen.add(key);
      metrics.push({ label, value });
      if (metrics.length >= 6) return metrics;
    }
  }
  return metrics;
}

function makeReportTitle(sources, audience) {
  if (sources.length === 1) {
    const sourceTitle = compactWhitespace(sources[0]?.visual?.title);
    if (sourceTitle) return sourceTitle;
  }
  const scopes = unique(sources.map((source) => source.scope));
  const scope = scopes.length === 1 ? scopes[0] : "Portfolio";
  const audienceLabel = GOVERNED_REPORT_AUDIENCES.find((item) => item.id === audience)?.label ?? "Executive";
  return `${scope} ${audienceLabel.toLowerCase()} brief`;
}

function makeReportSubtitle(sources) {
  const periods = unique(sources.map((source) => source.period));
  return periods.length === 1 ? periods[0] : periods.slice(0, 3).join(" · ");
}

function makeKeyPoints(sources) {
  return unique(
    sources.flatMap((source) => {
      const parsed = parseAnswer(source.answer);
      return [parsed.lead, ...parsed.details.slice(0, 2)];
    })
  ).slice(0, 6);
}

function makeSourceNote(sources) {
  const toolLabels = unique(sources.map((source) => source.tool));
  return `Based on approved platform data from ${toolLabels.length.toLocaleString("en-US")} verified ${toolLabels.length === 1 ? "analysis" : "analyses"}.`;
}

export function buildGovernedOnePageReport({ sources, options = {}, narrative = null, generatedAt = new Date().toISOString() }) {
  const sourceValidation = validateGovernedReportSources(sources);
  if (!sourceValidation.valid) {
    const error = new Error(`One-page brief could not be created: ${sourceValidation.errors.join(" ")}`);
    error.code = "governed_report_source_invalid";
    throw error;
  }

  const normalizedOptions = normalizeGovernedReportOptions(options);
  const normalizedSources = sourceValidation.sources;
  const keyPoints = makeKeyPoints(normalizedSources);
  const deterministicSummary = keyPoints[0] || "The verified analysis completed without a narrative summary.";
  const summary = sentence(narrative?.summary) || deterministicSummary;
  const emphasisLabel = GOVERNED_REPORT_EMPHASES.find((item) => item.id === normalizedOptions.emphasis)?.label ?? "Balanced overview";
  const sourceRouteIds = unique(normalizedSources.map((source) => source.routeId));
  const reportIdSeed = JSON.stringify({
    sourceRouteIds,
    questions: normalizedSources.map((source) => source.question),
    options: normalizedOptions,
    generatedAt
  });
  const reportId = `brief-${compactHash(reportIdSeed)}-${createReportNonce()}`;

  return {
    version: GOVERNED_REPORT_VERSION,
    reportId,
    title: makeReportTitle(normalizedSources, normalizedOptions.audience),
    subtitle: makeReportSubtitle(normalizedSources),
    audience: normalizedOptions.audience,
    emphasis: normalizedOptions.emphasis,
    emphasisLabel,
    generatedAt,
    sourceQuestions: normalizedSources.map((source) => source.question),
    sourceRouteIds,
    scope: unique(normalizedSources.map((source) => source.scope)).join(" · "),
    period: makeReportSubtitle(normalizedSources),
    summary,
    keyPoints: unique([
      ...(Array.isArray(narrative?.keyPoints) ? narrative.keyPoints.map(sentence) : []),
      ...keyPoints
    ]).slice(0, 6),
    metrics: collectMetrics(normalizedSources),
    closing: sentence(narrative?.closing) || (
      normalizedOptions.emphasis === "actions"
        ? "Use the linked platform questions to verify the next operating decision against the latest approved data."
        : `This brief emphasizes ${emphasisLabel.toLowerCase()} and stays within the verified answer set.`
    ),
    sourceNote: makeSourceNote(normalizedSources),
    sources: normalizedSources.map((source) => ({
      routeId: source.routeId,
      question: source.question,
      tool: source.tool,
      scope: source.scope,
      period: source.period,
      rowCount: source.rowCount,
      truthState: source.truthState
    }))
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderList(items) {
  if (!items.length) return "";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderMetrics(metrics) {
  if (!metrics.length) return "";
  return `<section class="metrics" aria-label="Key measures">${metrics.map((metric) => (
    `<div class="metric"><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong></div>`
  )).join("")}</section>`;
}

export function renderGovernedReportHtml(report) {
  if (!isObject(report) || report.version !== GOVERNED_REPORT_VERSION) {
    throw new Error("A valid governed one-page report is required.");
  }

  const audienceLabel = GOVERNED_REPORT_AUDIENCES.find((item) => item.id === report.audience)?.label ?? "Executive";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report.title)}</title>
  <style>
    :root{--ink:#111;--muted:#595959;--rule:#d9d9d9;--accent:#0f8b73;--wash:#f3f8f6}
    *{box-sizing:border-box}
    body{margin:0;background:#fff;color:var(--ink);font-family:Georgia,"Times New Roman",serif}
    main{width:min(8.1in,calc(100% - 40px));min-height:10.35in;margin:0 auto;padding:.48in .55in .4in;border-top:8px solid var(--accent)}
    header{display:grid;grid-template-columns:1fr auto;gap:24px;padding-bottom:20px;border-bottom:1px solid var(--ink)}
    .brand,.label,.source{font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:.12em}
    .brand{font-size:11px;font-weight:700;color:var(--accent)}
    h1{margin:12px 0 6px;font-size:33px;line-height:1.05}
    .subtitle{margin:0;color:var(--muted);font-size:17px}
    .label{font-size:10px;font-weight:700;color:var(--muted)}
    .summary{margin:24px 0 20px;font-size:22px;line-height:1.4}
    .metrics{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--rule);border-left:1px solid var(--rule);margin:20px 0}
    .metric{min-height:82px;padding:14px;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule)}
    .metric span{display:block;font-family:Arial,sans-serif;font-size:11px;color:var(--muted);line-height:1.25}
    .metric strong{display:block;margin-top:8px;font-family:Arial,sans-serif;font-size:22px}
    h2{margin:22px 0 10px;font-size:20px;border-bottom:1px solid var(--rule);padding-bottom:8px}
    ul{margin:0;padding-left:20px;columns:2;column-gap:36px}
    li{break-inside:avoid;margin:0 0 10px;font-size:15px;line-height:1.45}
    .closing{margin:22px 0 0;padding:14px 16px;background:var(--wash);border-left:4px solid var(--accent);font-size:15px;line-height:1.45}
    footer{margin-top:24px;padding-top:12px;border-top:1px solid var(--ink);display:flex;justify-content:space-between;gap:20px}
    .source{font-size:9px;line-height:1.5;color:var(--muted)}
    @media(max-width:700px){main{width:100%;min-height:0;padding:28px 22px}.metrics{grid-template-columns:1fr 1fr}ul{columns:1}}
    @media print{@page{size:letter;margin:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}main{margin:0;width:8.5in;min-height:11in}}
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <div class="brand">Alamo Health</div>
        <h1>${escapeHtml(report.title)}</h1>
        <p class="subtitle">${escapeHtml(report.subtitle)}</p>
      </div>
      <div>
        <div class="label">${escapeHtml(audienceLabel)} brief</div>
        <div class="label">${escapeHtml(report.emphasisLabel)}</div>
      </div>
    </header>
    <p class="summary">${escapeHtml(report.summary)}</p>
    ${renderMetrics(report.metrics)}
    <h2>What the data says</h2>
    ${renderList(report.keyPoints)}
    <p class="closing">${escapeHtml(report.closing)}</p>
    <footer>
      <div class="source">${escapeHtml(report.sourceNote)}</div>
      <div class="source">Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString("en-US"))}<br>Report ${escapeHtml(report.reportId)}</div>
    </footer>
  </main>
</body>
</html>`;
}

export function getGovernedReportFilename(report, extension = "html") {
  const base = compactWhitespace(report?.title ?? "alamo-one-page-brief")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "alamo-one-page-brief";
  return `${base}.${extension}`;
}
