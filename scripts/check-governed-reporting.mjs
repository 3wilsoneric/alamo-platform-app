import assert from "node:assert/strict";
import {
  buildGovernedOnePageReport,
  getGovernedReportFilename,
  renderGovernedReportHtml,
  validateGovernedReportSource
} from "../shared/governed-report.mjs";
import { getCertifiedQuestionRouteById } from "../shared/certified-analyst-questions.mjs";
import {
  createGovernedReport,
  deliverGovernedReport,
  getGovernedReportDeliveryStatus
} from "../server/governed-reporting.mjs";
import { getWeeklyBriefingPlanSummary } from "../server/weekly-briefings.mjs";
import { validateGovernedReportRequest } from "../server/http-request-schema.mjs";

const originalEnvironment = {
  synthesis: process.env.GOVERNED_REPORT_SYNTHESIS_ENABLED,
  webhookUrl: process.env.REPORT_EMAIL_WEBHOOK_URL,
  webhookSecret: process.env.REPORT_EMAIL_WEBHOOK_SECRET,
  allowedDomains: process.env.REPORT_EMAIL_ALLOWED_DOMAINS
};
const originalFetch = globalThis.fetch;

function restoreEnvironment() {
  for (const [key, value] of Object.entries({
    GOVERNED_REPORT_SYNTHESIS_ENABLED: originalEnvironment.synthesis,
    REPORT_EMAIL_WEBHOOK_URL: originalEnvironment.webhookUrl,
    REPORT_EMAIL_WEBHOOK_SECRET: originalEnvironment.webhookSecret,
    REPORT_EMAIL_ALLOWED_DOMAINS: originalEnvironment.allowedDomains
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
}

function createVerifiedSource(overrides = {}) {
  return {
    handled: true,
    routeId: "incident-current-snapshot:0",
    question: "Show the current incident snapshot for this month.",
    answer: [
      "June 2026 incidents were led by Medication Refusal at 173 incidents.",
      "",
      "Key facts",
      "- AWOL/Elopement accounted for 129 incidents.",
      "- Medical Emergency accounted for 77 incidents."
    ].join("\n"),
    tool: "incident breakdown",
    truthState: "valid_rows",
    scope: "Portfolio",
    period: "June 2026",
    visual: {
      type: "bar_chart",
      title: "Portfolio incident category breakdown",
      subtitle: "June 2026",
      valueLabel: "Incidents",
      rows: [
        { label: "Medication Refusal", value: 173 },
        { label: "AWOL/Elopement", value: 129 },
        { label: "Medical Emergency", value: 77 }
      ]
    },
    runtimeSchema: { valid: true },
    turnTrace: {
      truthState: "valid_rows",
      selectedTool: "incident_breakdown",
      rowCount: 588,
      validation: { valid: true }
    },
    certifiedQuestion: {
      routeId: "incident-current-snapshot:0",
      title: "Current incident snapshot"
    },
    guidedContract: {
      valid: true,
      routeId: "incident-current-snapshot:0"
    },
    provenance: { rowCount: 588 },
    ...overrides
  };
}

try {
  process.env.GOVERNED_REPORT_SYNTHESIS_ENABLED = "false";
  delete process.env.REPORT_EMAIL_WEBHOOK_URL;
  delete process.env.REPORT_EMAIL_WEBHOOK_SECRET;
  delete process.env.REPORT_EMAIL_ALLOWED_DOMAINS;

  const source = createVerifiedSource();
  assert.equal(validateGovernedReportSource(source).valid, true);
  assert.equal(validateGovernedReportSource({ ...source, runtimeSchema: undefined }).valid, false);
  assert.equal(validateGovernedReportSource({ ...source, turnTrace: undefined }).valid, false);
  assert.equal(validateGovernedReportSource({ ...source, guidedContract: undefined }).valid, false);
  assert.equal(validateGovernedReportSource({ ...source, truthState: "stale" }).valid, false);
  assert.equal(validateGovernedReportSource({
    ...source,
    guidedContract: { valid: true, routeId: "incident-rate:0" }
  }).valid, false);

  const report = buildGovernedOnePageReport({
    sources: [source],
    options: { audience: "executive", emphasis: "changes" },
    generatedAt: "2026-07-22T15:00:00.000Z"
  });
  assert.equal(report.version, "governed-one-page-v1");
  assert.equal(report.audience, "executive");
  assert.equal(report.emphasis, "changes");
  assert.equal(report.sourceRouteIds[0], "incident-current-snapshot:0");
  assert.equal(report.metrics[0]?.label, "Medication Refusal");
  assert.equal(report.metrics[0]?.value, "173");
  assert.match(report.sourceNote, /^Based on approved platform data/);
  assert.doesNotMatch(report.sourceNote, /\brows?\b/i);
  assert.equal(getGovernedReportFilename(report), "portfolio-incident-category-breakdown.html");

  const escapedReport = buildGovernedOnePageReport({
    sources: [createVerifiedSource({
      answer: "The verified answer contains <script>alert('unsafe')</script> as plain source text."
    })],
    generatedAt: "2026-07-22T15:00:00.000Z"
  });
  const escapedHtml = renderGovernedReportHtml(escapedReport);
  assert.doesNotMatch(escapedHtml, /<script>alert/);
  assert.match(escapedHtml, /&lt;script&gt;alert/);

  const request = validateGovernedReportRequest({
    sources: [source],
    options: { audience: "operations", emphasis: "actions" }
  });
  assert.equal(request.sources.length, 1);
  assert.equal(request.options.audience, "operations");
  assert.throws(() => validateGovernedReportRequest({ sources: [] }), /1 to 12/);

  const reportPackage = await createGovernedReport({
    sources: [source],
    options: { audience: "executive", emphasis: "overview" }
  });
  assert.equal(reportPackage.narrativeMode, "deterministic-fallback");
  assert.equal(reportPackage.delivery.deliveryMode, "download-only");
  assert.match(reportPackage.html, /Alamo Health/);
  assert.doesNotMatch(reportPackage.html, /Alamo Health Management/);

  await assert.rejects(
    createGovernedReport({
      sources: [createVerifiedSource({
        routeId: "not-a-real-question:0",
        certifiedQuestion: { routeId: "not-a-real-question:0", title: "Not real" },
        guidedContract: { valid: true, routeId: "not-a-real-question:0" }
      })]
    }),
    (error) => error?.code === "governed_report_route_unregistered"
  );

  process.env.REPORT_EMAIL_WEBHOOK_URL = "https://delivery.example.test/reports";
  process.env.REPORT_EMAIL_WEBHOOK_SECRET = "test-secret";
  process.env.REPORT_EMAIL_ALLOWED_DOMAINS = "alamohealth.com";
  let deliveredRequest = null;
  globalThis.fetch = async (url, options) => {
    deliveredRequest = { url, options };
    return new Response(null, { status: 204 });
  };
  assert.equal(getGovernedReportDeliveryStatus().emailConfigured, true);
  const delivery = await deliverGovernedReport({
    reportPackage,
    recipients: ["leader@alamohealth.com"],
    idempotencyKey: "weekly:2026-07-20:2026-07:executive"
  });
  assert.equal(delivery.ok, true);
  assert.equal(deliveredRequest?.options?.headers?.["Idempotency-Key"], "weekly:2026-07-20:2026-07:executive");
  const deliveryPayload = JSON.parse(String(deliveredRequest?.options?.body));
  assert.equal(deliveryPayload.idempotencyKey, "weekly:2026-07-20:2026-07:executive");
  await assert.rejects(
    deliverGovernedReport({
      reportPackage,
      recipients: ["outside@example.com"]
    }),
    (error) => error?.code === "report_email_domain_not_allowed"
  );

  const weekly = getWeeklyBriefingPlanSummary();
  assert.deepEqual(
    weekly.portfolioPlans.map((plan) => plan.id),
    ["executive", "operations", "clinical"]
  );
  const routeIds = [
    ...weekly.portfolioPlans.flatMap((plan) => plan.routeIds),
    ...weekly.communityPlan.routeIds
  ];
  assert.equal(routeIds.every((routeId) => Boolean(getCertifiedQuestionRouteById(routeId))), true);

  console.log("governed reporting checks passed");
} finally {
  restoreEnvironment();
}
