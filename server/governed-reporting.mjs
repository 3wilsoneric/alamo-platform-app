import {
  buildGovernedOnePageReport,
  getGovernedReportFilename,
  normalizeGovernedReportOptions,
  renderGovernedReportHtml,
  validateGovernedReportSources
} from "../shared/governed-report.mjs";
import { getCertifiedQuestionRouteById } from "../shared/certified-analyst-questions.mjs";
import { synthesizeGovernedReportNarrative } from "./claude-copilot.mjs";
import { createHttpError } from "./http-errors.mjs";
import { getBoundedIntegerEnv } from "./runtime-environment.mjs";

const DEFAULT_DELIVERY_TIMEOUT_MS = 12_000;
const MAX_EMAIL_RECIPIENTS = 10;

function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getDeliveryConfig() {
  const webhookUrl = process.env.REPORT_EMAIL_WEBHOOK_URL?.trim() || null;
  const webhookSecret = process.env.REPORT_EMAIL_WEBHOOK_SECRET?.trim() || null;
  const allowedDomains = new Set(splitCsv(process.env.REPORT_EMAIL_ALLOWED_DOMAINS).map((domain) => domain.toLowerCase()));
  const timeoutMs = getBoundedIntegerEnv(
    "REPORT_EMAIL_TIMEOUT_MS",
    DEFAULT_DELIVERY_TIMEOUT_MS,
    2_000,
    30_000
  );

  let validWebhook = false;
  if (webhookUrl) {
    try {
      validWebhook = new URL(webhookUrl).protocol === "https:";
    } catch {
      validWebhook = false;
    }
  }

  return {
    configured: validWebhook && Boolean(webhookSecret) && allowedDomains.size > 0,
    webhookUrl,
    webhookSecret,
    allowedDomains,
    timeoutMs
  };
}

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 320) return null;
  return email;
}

function assertAllowedRecipients(recipients, config) {
  const normalized = [...new Set(recipients.map(normalizeEmail).filter(Boolean))];
  if (!normalized.length || normalized.length > MAX_EMAIL_RECIPIENTS) {
    throw createHttpError(400, "report_email_recipient_invalid", `Email delivery requires 1 to ${MAX_EMAIL_RECIPIENTS} valid recipients.`);
  }
  const outsideAllowlist = normalized.filter((email) => !config.allowedDomains.has(email.split("@").at(-1)));
  if (outsideAllowlist.length) {
    throw createHttpError(403, "report_email_domain_not_allowed", "The report can only be emailed to an approved organization domain.");
  }
  return normalized;
}

export function getGovernedReportDeliveryStatus() {
  const config = getDeliveryConfig();
  return {
    emailConfigured: config.configured,
    deliveryMode: config.configured ? "approved-webhook" : "download-only"
  };
}

/**
 * @param {{ sources?: unknown[], options?: { audience?: string, emphasis?: string } }} [input]
 */
export async function createGovernedReport({ sources = [], options = {} } = {}) {
  const validation = validateGovernedReportSources(sources);
  if (!validation.valid) {
    throw createHttpError(
      422,
      "governed_report_source_invalid",
      "This answer cannot be turned into a brief because its verified evidence is incomplete.",
      { errors: validation.errors.slice(0, 12) }
    );
  }
  const unregisteredRoute = validation.sources.find((source) => !getCertifiedQuestionRouteById(String(source.routeId ?? "")));
  if (unregisteredRoute) {
    throw createHttpError(
      422,
      "governed_report_route_unregistered",
      "This answer cannot be turned into a brief because its saved question route is no longer registered."
    );
  }

  const normalizedOptions = normalizeGovernedReportOptions(options);
  const verifiedSources = /** @type {import("../shared/governed-report.mjs").GovernedReportSource[]} */ (sources);
  const narrative = await synthesizeGovernedReportNarrative({
    sources: validation.sources,
    ...normalizedOptions
  });
  const report = buildGovernedOnePageReport({
    sources: verifiedSources,
    options: normalizedOptions,
    narrative
  });
  const html = renderGovernedReportHtml(report);

  return {
    report,
    html,
    filename: getGovernedReportFilename(report),
    narrativeMode: narrative ? "verified-agent-synthesis" : "deterministic-fallback",
    delivery: getGovernedReportDeliveryStatus()
  };
}

export function getSignedInUserEmail(authContext) {
  return normalizeEmail(
    authContext?.claims?.preferred_username ??
    authContext?.claims?.email ??
    authContext?.claims?.upn
  );
}

/**
 * @param {{
 *   reportPackage: Awaited<ReturnType<typeof createGovernedReport>>,
 *   recipients: string[],
 *   idempotencyKey?: string | null
 * }} input
 */
export async function deliverGovernedReport({ reportPackage, recipients, idempotencyKey = null }) {
  const config = getDeliveryConfig();
  if (!config.configured || !config.webhookUrl || !config.webhookSecret) {
    throw createHttpError(
      503,
      "report_email_not_configured",
      "Email delivery is not connected yet. Download or print the brief instead."
    );
  }
  const webhookUrl = config.webhookUrl;
  const webhookSecret = config.webhookSecret;
  const safeIdempotencyKey = idempotencyKey == null
    ? null
    : String(idempotencyKey).replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 240);
  if (idempotencyKey != null && !safeIdempotencyKey) {
    throw createHttpError(400, "report_email_idempotency_invalid", "The email delivery idempotency key is invalid.");
  }
  const approvedRecipients = assertAllowedRecipients(recipients, config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${webhookSecret}`,
        ...(safeIdempotencyKey ? { "Idempotency-Key": safeIdempotencyKey } : {})
      },
      body: JSON.stringify({
        version: "governed-report-delivery-v1",
        to: approvedRecipients,
        subject: reportPackage.report.title,
        html: reportPackage.html,
        filename: reportPackage.filename,
        reportId: reportPackage.report.reportId,
        audience: reportPackage.report.audience,
        period: reportPackage.report.period,
        idempotencyKey: safeIdempotencyKey
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw createHttpError(
        502,
        "report_email_delivery_failed",
        "The brief was created, but email delivery did not complete. Download it and try email again later."
      );
    }
    await response.body?.cancel().catch(() => undefined);
    return {
      ok: true,
      reportId: reportPackage.report.reportId,
      recipientCount: approvedRecipients.length
    };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) throw error;
    if (controller.signal.aborted) {
      throw createHttpError(
        504,
        "report_email_delivery_timeout",
        "The brief was created, but email delivery timed out. Download it and try email again later."
      );
    }
    throw createHttpError(
      502,
      "report_email_delivery_failed",
      "The brief was created, but email delivery did not complete. Download it and try email again later."
    );
  } finally {
    clearTimeout(timeout);
  }
}
