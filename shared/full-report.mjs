import { EFFECTIVENESS_AUDIENCES } from "./effectiveness-evidence.mjs";

export const FULL_REPORT_VERSION = "governed-full-report-v1";

export const FULL_REPORT_DEFINITIONS = Object.freeze([
  {
    id: "overview",
    title: "Portfolio overview",
    cadence: "Current snapshot",
    audience: "Executive and operations",
    scope: "portfolio",
    showInAnalyticsNav: true,
    description: "A concise cross-community comparison of census, operating position, incidents, medication completion, resident flow when loaded, and current resident context."
  },
  {
    id: "community",
    title: "Community performance report",
    cadence: "Monthly",
    audience: "Operations leaders",
    scope: "community",
    showInAnalyticsNav: false,
    description: "One community across census, resident flow and profile, incidents, medication performance, documentation coverage, and current capacity."
  },
  {
    id: "effectiveness",
    title: "Effectiveness evidence report",
    cadence: "Latest or monthly",
    audience: "Purchasers and external partners",
    scope: "portfolio",
    showInAnalyticsNav: false,
    description: "Audience-specific evidence of reach, acuity, stabilization signals, medication execution, internal readmissions, continuity, and known outcome gaps.",
    audienceOptions: EFFECTIVENESS_AUDIENCES.map(({ id, label }) => ({ id, label }))
  },
  {
    id: "census",
    title: "Census and resident flow",
    cadence: "Monthly history",
    audience: "Operations and growth",
    scope: "portfolio",
    showInAnalyticsNav: true,
    description: "Selected-month census, recent trend, annual census context, and monthly and annual resident flow when loaded."
  },
  {
    id: "incidents",
    title: "Incident report",
    cadence: "Monthly",
    audience: "Clinical and operations",
    scope: "portfolio",
    showInAnalyticsNav: true,
    description: "Incident direction, category concentration, community comparison, and reconciled severity indicators when complete."
  },
  {
    id: "medications",
    title: "Medication performance report",
    cadence: "Monthly",
    audience: "Clinical leadership",
    scope: "portfolio",
    showInAnalyticsNav: true,
    description: "Monthly scheduled-administration trend, community performance, period-aligned refusals, and current resident medication burden when complete."
  },
  {
    id: "residents",
    title: "Resident population",
    cadence: "Current population",
    audience: "Clinical and executive teams",
    scope: "portfolio",
    showInAnalyticsNav: true,
    description: "Current profile coverage, diagnosis mix, age, valid length-of-stay measures when complete, and community comparisons without substituting profile rows for census."
  }
]);

const REPORT_IDS = new Set(FULL_REPORT_DEFINITIONS.map((definition) => definition.id));
const BLOCK_TYPES = new Set([
  "paragraph",
  "callout",
  "metric_grid",
  "bar_list",
  "line_chart",
  "trend",
  "table",
  "bullets"
]);

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

export function getFullReportDefinition(reportId) {
  return FULL_REPORT_DEFINITIONS.find((definition) => definition.id === reportId) ?? null;
}

export function normalizeFullReportRequest(value = {}) {
  const reportId = requiredText(value.reportId, "reportId");
  if (!REPORT_IDS.has(reportId)) throw new Error(`Unknown full report: ${reportId}.`);
  const definition = getFullReportDefinition(reportId);

  const facilityId = optionalText(value.facilityId);
  if (facilityId && !/^[a-z0-9_-]{1,64}$/i.test(facilityId)) {
    throw new Error("facilityId is invalid.");
  }

  const period = optionalText(value.period);
  if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new Error("period must use YYYY-MM.");
  }

  if (reportId === "community" && !facilityId) {
    throw new Error("facilityId is required for a community report.");
  }
  if (reportId === "overview" && facilityId) {
    throw new Error("The portfolio overview does not accept community scope.");
  }
  if (reportId === "residents" && period) {
    throw new Error("The resident population report is current-state only.");
  }

  const requestedAudience = optionalText(value.audience);
  const audienceOptions = definition?.audienceOptions ?? [];
  if (requestedAudience && !audienceOptions.some((option) => option.id === requestedAudience)) {
    throw new Error(`audience is not supported for ${reportId}.`);
  }

  return {
    reportId,
    facilityId,
    period,
    audience: requestedAudience ?? audienceOptions[0]?.id ?? null
  };
}

export function validateFullReportDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Full report document must be an object.");
  }
  if (value.version !== FULL_REPORT_VERSION) {
    throw new Error(`Unsupported full report version: ${value.version ?? "missing"}.`);
  }
  if (!REPORT_IDS.has(value.reportId)) throw new Error("Full report has an unknown reportId.");

  requiredText(value.id, "report.id");
  requiredText(value.title, "report.title");
  requiredText(value.summary, "report.summary");
  requiredText(value.generatedAt, "report.generatedAt");
  requiredText(value.dataThrough, "report.dataThrough");
  if (!value.freshness || !["current", "stale"].includes(value.freshness.status)) {
    throw new Error("report.freshness.status must be current or stale.");
  }
  requiredText(value.freshness.generatedAt, "report.freshness.generatedAt");
  if (
    value.freshness.ageHours != null &&
    (!Number.isFinite(value.freshness.ageHours) || value.freshness.ageHours < 0)
  ) {
    throw new Error("report.freshness.ageHours must be a non-negative number.");
  }

  const metrics = assertArray(value.metrics, "report.metrics");
  if (metrics.length < 1 || metrics.length > 12) {
    throw new Error("Full report must contain 1 to 12 metrics.");
  }
  metrics.forEach((metric, index) => {
    requiredText(metric?.label, `report.metrics[${index}].label`);
    requiredText(metric?.value, `report.metrics[${index}].value`);
  });

  const sections = assertArray(value.sections, "report.sections");
  if (sections.length < 1 || sections.length > 20) {
    throw new Error("Full report must contain 1 to 20 sections.");
  }
  const sectionIds = new Set();
  sections.forEach((section, sectionIndex) => {
    const sectionId = requiredText(section?.id, `report.sections[${sectionIndex}].id`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sectionId)) {
      throw new Error(`Full report section id is invalid: ${sectionId}.`);
    }
    if (sectionIds.has(sectionId)) {
      throw new Error(`Full report contains duplicate section id: ${sectionId}.`);
    }
    sectionIds.add(sectionId);
    requiredText(section?.title, `report.sections[${sectionIndex}].title`);
    assertArray(section?.blocks, `report.sections[${sectionIndex}].blocks`).forEach(
      (block, blockIndex) => {
        if (!BLOCK_TYPES.has(block?.type)) {
          throw new Error(
            `Unsupported block type at report.sections[${sectionIndex}].blocks[${blockIndex}].`
          );
        }
      }
    );
  });

  const sources = assertArray(value.evidence?.sources, "report.evidence.sources");
  if (sources.length < 1) throw new Error("Full report must identify at least one evidence source.");
  sources.forEach((source, index) => {
    requiredText(source?.slice, `report.evidence.sources[${index}].slice`);
    if (!Number.isInteger(source?.rowCount) || source.rowCount < 0) {
      throw new Error(`report.evidence.sources[${index}].rowCount must be a non-negative integer.`);
    }
  });

  return value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderLineChart(block) {
  const items = (block.items ?? [])
    .map((item) => ({
      label: String(item.label ?? ""),
      value: Number(item.value),
      displayValue: String(item.displayValue ?? item.value ?? "")
    }))
    .filter((item) => item.label && Number.isFinite(item.value));
  if (items.length < 2) return "";

  const width = 860;
  const height = 280;
  const left = 48;
  const right = 20;
  const top = 24;
  const bottom = 52;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const values = items.map((item) => item.value);
  const rawMinimum = Math.min(...values);
  const rawMaximum = Math.max(...values);
  const padding = Math.max(1, (rawMaximum - rawMinimum) * 0.12);
  const minimum = rawMinimum - padding;
  const maximum = rawMaximum + padding;
  const range = Math.max(1, maximum - minimum);
  const pointFor = (item, index) => ({
    x: left + (index / Math.max(1, items.length - 1)) * chartWidth,
    y: top + ((maximum - item.value) / range) * chartHeight
  });
  const points = items.map(pointFor);
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const gridLines = [0, 0.5, 1].map((position) => {
    const y = top + position * chartHeight;
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="chart-grid" />`;
  }).join("");
  const dataPoints = points.map((point, index) => `
    <g>
      <circle cx="${point.x}" cy="${point.y}" r="4.5" class="chart-point" />
      <text x="${point.x}" y="${point.y - 12}" text-anchor="middle" class="chart-value">${escapeHtml(items[index].displayValue)}</text>
      <text x="${point.x}" y="${height - 18}" text-anchor="middle" class="chart-label">${escapeHtml(items[index].label)}</text>
    </g>`).join("");

  return `<figure class="line-chart report-block report-block-line-chart">
    ${block.label ? `<figcaption>${escapeHtml(block.label)}</figcaption>` : ""}
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(block.label ?? "Report trend")}">
      ${gridLines}
      <path d="${path}" class="chart-line" />
      ${dataPoints}
    </svg>
  </figure>`;
}

function renderBlock(block) {
  if (block.type === "paragraph") {
    return `<p class="report-paragraph report-block report-block-paragraph">${escapeHtml(block.text)}</p>`;
  }
  if (block.type === "callout") {
    return `<p class="report-callout report-block report-block-callout">${escapeHtml(block.text)}</p>`;
  }
  if (block.type === "metric_grid") {
    return `<div class="metric-grid report-block report-block-metric-grid">${(block.items ?? []).map((item) => `
      <div class="metric">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
        ${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}
      </div>`).join("")}</div>`;
  }
  if (block.type === "bar_list") {
    const maximum = Math.max(1, ...(block.items ?? []).map((item) => Number(item.value) || 0));
    return `<div class="bar-list report-block report-block-bar-list">${(block.items ?? []).map((item) => `
      <div class="bar-row">
        <div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.displayValue ?? item.value)}</strong></div>
        <i style="width:${Math.max(2, Math.round(((Number(item.value) || 0) / maximum) * 100))}%"></i>
      </div>`).join("")}</div>`;
  }
  if (block.type === "line_chart") {
    return renderLineChart(block);
  }
  if (block.type === "trend") {
    return `<div class="trend-list report-block report-block-trend">${(block.items ?? []).map((item) => `
      <div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`
    ).join("")}</div>`;
  }
  if (block.type === "bullets") {
    return `<ul class="report-list report-block report-block-bullets">${(block.items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }
  if (block.type === "table") {
    const columnCount = (block.columns ?? []).length;
    const rowCount = (block.rows ?? []).length;
    const density = columnCount >= 8 ? "dense" : columnCount >= 6 ? "compact" : "standard";
    return `<div class="table-wrap report-block report-block-table table-density-${density} table-columns-${columnCount} table-rows-${rowCount}"><table>
      <thead><tr>${(block.columns ?? []).map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead>
      <tbody>${(block.rows ?? []).map((row) => `<tr>${(block.columns ?? []).map((column) => `<td>${escapeHtml(row[column.key] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>`;
  }
  return "";
}

export function renderFullReportHtml(reportValue) {
  const report = validateFullReportDocument(reportValue);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report.title)}</title>
  <style>
    :root {
      color: #111;
      background: #fff;
      --accent: #0f8b73;
      --ink: #111;
      --muted: #595959;
      --rule: #d9d9d9;
      --canvas: #f5f4ef;
      --serif: Georgia, "Times New Roman", serif;
      --sans: "Avenir Next", "Helvetica Neue", Arial, sans-serif;
      font-family: var(--serif);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #111; }
    main { width: min(100% - 56px, 1160px); margin: 0 auto; padding: 48px 0 80px; }
    .freshness-warning { margin-bottom: 22px; border-left: 3px solid #a63d2f; background: #fff7f5; padding: 12px 14px; color: #59332d; font: 12px/1.5 var(--sans); }
    .report-header { display: grid; grid-template-columns: minmax(0, 8fr) minmax(220px, 4fr); gap: 32px; align-items: end; }
    .kicker, .meta, .metric span, .metric small, th, .evidence, .toc, figcaption, .bar-row div, .trend-list div {
      font-family: var(--sans);
    }
    .kicker { color: var(--accent); font: 700 11px/1.2 var(--sans); letter-spacing: .16em; text-transform: uppercase; }
    h1 { max-width: 850px; margin: 9px 0 0; font-size: 50px; line-height: .98; letter-spacing: -.045em; }
    .dek { max-width: 780px; margin: 18px 0 0; color: #333; font-size: 20px; line-height: 1.48; }
    .meta { display: grid; gap: 8px; border-left: 3px solid var(--accent); padding-left: 16px; color: var(--muted); font-size: 11px; line-height: 1.45; }
    .meta span { display: block; }
    .toc { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 18px; margin-top: 26px; border-top: 2px solid var(--ink); border-bottom: 1px solid var(--rule); padding: 12px 0; counter-reset: section; }
    .toc a { color: var(--ink); font-size: 10px; line-height: 1.45; text-decoration: none; }
    .toc a::before { color: var(--accent); counter-increment: section; content: counter(section, decimal-leading-zero) " "; font-weight: 700; }
    .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 30px; border-block: 1px solid var(--ink); }
    .metric { min-height: 118px; padding: 18px; border-left: 1px solid var(--rule); }
    .metric:first-child { border-left: 0; }
    .metric span, .metric small { display: block; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .metric strong { display: block; margin-top: 10px; font-size: 31px; line-height: 1; }
    .metric:first-child strong { color: var(--accent); }
    .metric small { margin-top: 10px; font-weight: 400; letter-spacing: 0; line-height: 1.4; text-transform: none; }
    section { break-inside: avoid; margin-top: 42px; border-top: 2px solid var(--ink); padding-top: 16px; }
    section::before { display: block; margin-bottom: 7px; color: var(--accent); content: attr(data-number); font: 700 10px/1 var(--sans); letter-spacing: .16em; }
    h2 { margin: 0; font-size: 30px; line-height: 1.08; letter-spacing: -.025em; }
    .section-intro, .report-paragraph { max-width: 820px; color: #333; font-size: 16px; line-height: 1.6; }
    .section-intro { font-size: 17px; }
    .report-paragraph + .report-paragraph { margin-top: 10px; }
    .report-callout { max-width: 920px; margin: 18px 0 0; border-left: 3px solid var(--accent); background: #f7faf9; padding: 14px 16px; color: #333; font: 14px/1.55 var(--sans); }
    .table-wrap { margin-top: 18px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-family: var(--sans); font-size: 11px; font-variant-numeric: tabular-nums; }
    th, td { border-bottom: 1px solid var(--rule); padding: 10px 8px; text-align: left; vertical-align: top; }
    th { border-bottom-color: var(--ink); color: var(--muted); font-size: 9px; letter-spacing: .11em; text-transform: uppercase; }
    tbody tr:hover { background: #f9f9f7; }
    .bar-list { margin-top: 18px; }
    .bar-row { border-bottom: 1px solid var(--rule); padding: 10px 0; }
    .bar-row div { display: flex; justify-content: space-between; gap: 18px; font-size: 12px; }
    .bar-row i { display: block; height: 5px; margin-top: 8px; background: var(--accent); }
    .line-chart { margin: 22px 0 0; border-block: 1px solid var(--rule); padding: 14px 0 8px; }
    .line-chart figcaption { color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    .line-chart svg { display: block; width: 100%; height: auto; overflow: visible; }
    .chart-grid { stroke: var(--rule); stroke-width: 1; }
    .chart-line { fill: none; stroke: var(--accent); stroke-width: 4; }
    .chart-point { fill: #fff; stroke: var(--accent); stroke-width: 3; }
    .chart-value { fill: var(--ink); font: 700 12px var(--sans); }
    .chart-label { fill: var(--muted); font: 10px var(--sans); }
    .trend-list { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 18px; border-top: 1px solid var(--rule); }
    .trend-list div { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--rule); padding: 10px; font-size: 12px; }
    ul { max-width: 850px; padding-left: 22px; }
    li { margin: 9px 0; color: #333; font-size: 15px; line-height: 1.55; }
    li::marker { color: var(--accent); }
    .evidence { margin-top: 48px; border-top: 1px solid var(--ink); padding-top: 12px; color: #737373; font-size: 10px; line-height: 1.55; }
    @media (max-width: 720px) {
      main { width: min(100% - 28px, 1160px); padding-top: 26px; }
      .report-header { grid-template-columns: 1fr; gap: 18px; }
      h1 { font-size: 38px; }
      .dek { font-size: 17px; }
      .toc { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .metric-grid { grid-template-columns: repeat(2, 1fr); }
      .metric:nth-child(3) { border-left: 0; border-top: 1px solid #d9d9d9; }
      .metric:nth-child(4) { border-top: 1px solid #d9d9d9; }
      .trend-list { grid-template-columns: 1fr; }
      .line-chart { overflow-x: auto; }
      .line-chart svg { min-width: 680px; }
    }
    @media print {
      :root {
        font-size: 10pt;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      body { background: #fff; }
      main { width: 100%; padding: 0; }
      .report-header {
        grid-template-columns: minmax(0, 8fr) minmax(2.3in, 4fr);
        gap: .26in;
        break-inside: avoid-page;
      }
      .kicker { font-size: 7.5pt; }
      h1 { font-size: 30pt; line-height: 1; }
      .dek { margin-top: .1in; font-size: 11.5pt; line-height: 1.35; }
      .meta { border-left-width: 2px; padding-left: .1in; font-size: 7.5pt; }
      .toc {
        grid-template-columns: repeat(8, minmax(0, 1fr));
        gap: .02in .12in;
        margin-top: .14in;
        padding: .08in 0;
        break-inside: avoid-page;
      }
      .toc a { font-size: 6.5pt; line-height: 1.3; }
      .report-scorecard { break-after: auto; }
      .metric-grid {
        margin-top: .15in;
        break-inside: avoid-page;
      }
      .report-scorecard .metric-grid {
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }
      .metric { min-height: .76in; padding: .1in; }
      .metric span, .metric small { font-size: 6.5pt; letter-spacing: .08em; }
      .metric strong { margin-top: .07in; font-size: 18pt; }
      .metric small { margin-top: .06in; line-height: 1.25; }
      section {
        margin-top: .2in;
        padding-top: .09in;
        break-inside: auto;
      }
      section::before, h2 { break-after: avoid-page; }
      section::before { margin-bottom: .045in; font-size: 7pt; }
      h2 { font-size: 18pt; line-height: 1.05; }
      .section-intro, .report-paragraph {
        max-width: 8.8in;
        font-size: 9.5pt;
        line-height: 1.4;
        orphans: 3;
        widows: 3;
      }
      .section-intro {
        margin: .08in 0 0;
        break-after: avoid-page;
        break-inside: avoid-page;
      }
      .report-paragraph { margin: .08in 0 0; }
      .report-paragraph + .report-paragraph { margin-top: .07in; }
      .report-callout {
        max-width: 9.2in;
        margin: .1in 0 0;
        border-left-width: 2px;
        padding: .08in .1in;
        font-size: 7.8pt;
        line-height: 1.35;
        break-inside: avoid-page;
      }
      .table-wrap {
        margin-top: .12in;
        overflow: visible;
        break-inside: auto;
        break-after: auto;
      }
      table {
        width: 100%;
        table-layout: auto;
        font-size: 7.4pt;
        break-inside: auto;
      }
      thead { display: table-header-group; }
      tr { break-inside: avoid-page; break-after: auto; }
      td, th {
        padding: .05in .045in;
        overflow-wrap: anywhere;
        hyphens: auto;
      }
      .table-density-compact table { font-size: 7pt; }
      .table-density-dense table { font-size: 6.4pt; }
      .table-density-dense th,
      .table-density-dense td { padding: .04in .032in; }
      .line-chart, .metric-grid, figure {
        break-inside: avoid-page;
      }
      .line-chart {
        width: 100%;
        margin-top: .12in;
        padding: .09in 0 .04in;
        overflow: visible;
      }
      .line-chart svg {
        width: 100%;
        min-width: 0 !important;
        max-width: 100%;
        max-height: 2.25in;
      }
      .report-section-medication-performance .line-chart svg {
        max-height: 1.48in;
      }
      .report-section-medication-performance table {
        font-size: 6.6pt;
      }
      .report-section-medication-performance th,
      .report-section-medication-performance td {
        padding: .03in;
      }
      .chart-value { font-size: 9px; }
      .chart-label { font-size: 8px; }
      .bar-list { margin-top: .1in; break-inside: auto; }
      .bar-row { padding: .045in 0; }
      .bar-row div { font-size: 7.5pt; }
      .bar-row i { height: 3px; margin-top: .035in; }
      .bar-row, .trend-list div, li { break-inside: avoid-page; }
      .trend-list { margin-top: .1in; }
      .trend-list div { padding: .065in; font-size: 7.5pt; }
      ul { margin: .08in 0 0; padding-left: .18in; }
      li { margin: .045in 0; font-size: 8.5pt; line-height: 1.35; }
      a { color: inherit; text-decoration: none; }
      .evidence {
        margin-top: .22in;
        padding-top: .08in;
        font-size: 6.5pt;
        line-height: 1.35;
        break-inside: avoid-page;
      }
      @page {
        size: letter landscape;
        margin: .48in .48in .55in;
        @bottom-left {
          color: #737373;
          content: "Alamo Health Management";
          font: 7pt var(--sans);
        }
        @bottom-right {
          color: #737373;
          content: counter(page);
          font: 7pt var(--sans);
        }
      }
    }
  </style>
</head>
<body>
  <main class="report report-${escapeHtml(report.reportId)}" data-report-id="${escapeHtml(report.reportId)}">
    ${report.freshness.status === "stale" ? `<div class="freshness-warning"><strong>Data update delayed.</strong> ${escapeHtml(report.freshness.warning ?? "This report uses the latest available governed snapshot, which is older than the platform freshness target.")}</div>` : ""}
    <div class="report-header">
      <div>
        <div class="kicker">${escapeHtml(report.scope.label)}</div>
        <h1>${escapeHtml(report.title)}</h1>
        <p class="dek">${escapeHtml(report.summary)}</p>
      </div>
      <div class="meta">
        <span><strong>Coverage</strong><br>${escapeHtml(report.period.label)}</span>
        <span><strong>Data through</strong><br>${escapeHtml(report.dataThrough)}</span>
        <span><strong>Snapshot updated</strong><br>${escapeHtml(report.generatedAtLabel)}</span>
      </div>
    </div>
    <nav class="toc" aria-label="Report contents">
      ${report.sections.map((section) => `<a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a>`).join("")}
    </nav>
    <div class="report-scorecard">
      ${renderBlock({ type: "metric_grid", items: report.metrics })}
    </div>
    <div class="report-body">
    ${report.sections.map((section, index) => `
      <section class="report-section report-section-${escapeHtml(section.id)} report-section-blocks-${section.blocks?.length ?? 0}" id="${escapeHtml(section.id)}" data-number="${String(index + 1).padStart(2, "0")}">
        <h2>${escapeHtml(section.title)}</h2>
        ${section.intro ? `<p class="section-intro">${escapeHtml(section.intro)}</p>` : ""}
        ${(section.blocks ?? []).map(renderBlock).join("")}
      </section>`).join("")}
    </div>
    <div class="evidence">
      Evidence: ${report.evidence.sources.map((source) => `${escapeHtml(source.slice)} (${source.rowCount} rows)`).join(", ")}.
      Values were compiled deterministically from the published platform snapshot.
    </div>
  </main>
</body>
</html>`;
}
