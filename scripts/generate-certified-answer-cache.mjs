import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCommunitiesDashboardData, getReportsSummaryData } from "../server/platform-data.mjs";
import { buildCertifiedAnswerDataSignature } from "../server/certified-answer-cache.mjs";
import { runCopilotTool } from "../server/copilot-tools.mjs";
import {
  getCertifiedQuestionRoutes,
  makeCertifiedQuestionMeta
} from "../shared/certified-analyst-questions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, "../generated/certified-answer-cache");
const outputPath = path.join(outputDir, "latest.json");

process.env.CERTIFIED_ANSWER_CACHE_ENABLED = "false";

function getMonths(communities, reportsSummary) {
  return [...new Set([
    ...(communities.census ?? []).map((row) => row.month_bucket),
    ...(communities.incidents ?? []).map((row) => row.month_bucket),
    ...(communities.incidentDetails ?? []).map((row) => row.month_bucket),
    ...(reportsSummary.medicationCompliance ?? []).map((row) => row.month_bucket)
  ].filter(Boolean))].sort();
}

function summarizeResult(result) {
  return {
    handled: Boolean(result.handled),
    tool: result.tool ?? null,
    text: result.text ?? null,
    trace: result.trace ?? null,
    visual: result.visual
      ? {
          type: result.visual.type,
          title: result.visual.title,
          subtitle: result.visual.subtitle ?? null,
          valueLabel: result.visual.valueLabel ?? null,
          columns: result.visual.columns ?? null,
          rows: result.visual.rows?.slice(0, 50) ?? []
        }
      : null,
    actions: (result.actions ?? []).slice(0, 5).map((action) => ({
      label: action.label,
      kind: action.kind,
      route: action.route ?? null,
      tool: action.tool ?? null,
      prompt: action.prompt ?? null
    })),
    moduleSpec: result.moduleSpec ?? null,
    moduleSpecs: result.moduleSpecs ?? null,
    summary: result.summary ?? null,
    certifiedQuestion: result.certifiedQuestion ?? null,
    analysisFrame: result.analysisFrame ?? null,
    planValidation: result.planValidation ?? null
  };
}

function renderRoutePrompt(route, { facilities, months }) {
  const community = facilities.find((facility) => /san pablo/i.test(String(facility.community_name ?? "")))?.community_name ??
    facilities[0]?.community_name ??
    "San Pablo";
  const latestMonth = months.at(-1) ?? "June 2026";
  const priorMonth = months.at(-2) ?? latestMonth;
  return String(route.runPrompt ?? route.prompt)
    .replace(/\{community\}/g, community)
    .replace(/\{resident\}/g, "Shannon Romero")
    .replace(/\{incidentCategory\}/g, "AWOL/Elopement")
    .replace(/\{month\}/g, latestMonth)
    .replace(/\{startMonth\}/g, priorMonth)
    .replace(/\{endMonth\}/g, latestMonth)
    .replace(/\{medicationDetail\}/g, "medication refusal detail");
}

async function main() {
  const generatedAt = new Date().toISOString();
  const [communities, reportsSummary] = await Promise.all([
    getCommunitiesDashboardData(),
    getReportsSummaryData()
  ]);
  const months = getMonths(communities, reportsSummary);
  const requests = getCertifiedQuestionRoutes().map((route) => ({
    route,
    prompt: renderRoutePrompt(route, {
      facilities: communities.facilities ?? [],
      months
    })
  }));
  const cacheRunId = `certified-cache-${Date.now()}`;
  const entries = [];
  const dataSignature = buildCertifiedAnswerDataSignature(communities, reportsSummary);

  for (const request of requests) {
    try {
      const result = await runCopilotTool({
        content: request.prompt,
        certifiedQuestionRouteId: request.route.id,
        // Each route must start from an empty analysis frame. Reusing a cache
        // session lets a prior selector leak scope into the next route.
        sessionId: `${cacheRunId}:${request.route.id}`
      });
      const fallbackMeta = makeCertifiedQuestionMeta(request.route.question, result.analysisFrame ?? {});
      const certifiedQuestion = result.certifiedQuestion ?? (fallbackMeta
        ? {
            ...fallbackMeta,
            routeId: request.route.id,
            cacheKey: `${fallbackMeta.cacheKey}:route:${request.route.id}`
          }
        : null);

      if (!certifiedQuestion?.cacheKey) continue;

      entries.push({
        cacheKey: certifiedQuestion.cacheKey,
        routeId: request.route.id,
        prompt: request.prompt,
        certifiedQuestion,
        result: summarizeResult({
          ...result,
          certifiedQuestion
        })
      });
    } catch (error) {
      entries.push({
        cacheKey: `error:${request.prompt}`,
        prompt: request.prompt,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const payload = {
    version: "certified-answer-cache-v2",
    generatedAt,
    dataSignature,
    months,
    entryCount: entries.filter((entry) => !entry.error).length,
    errorCount: entries.filter((entry) => entry.error).length,
    entries
  };

  await mkdir(outputDir, { recursive: true });
  const temporaryPath = path.join(outputDir, `.latest-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(temporaryPath, JSON.stringify(payload, null, 2));
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  console.log(`Generated certified answer cache at ${outputPath} (${payload.entryCount} entries, ${payload.errorCount} errors)`);
}

main().catch((error) => {
  console.error("Certified answer cache generation failed:", error);
  process.exit(1);
});
