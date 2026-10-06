import { createHash } from "node:crypto";
import { readBlob, uploadImmutable } from "./cloud-storage.mjs";

const NOTIFICATION_VERSION = "licensing-change-email-v1";
const PENDING_PREFIX = "licensing/notifications/pending/";
const SENT_PREFIX = "licensing/notifications/sent/";
const MAX_NOTIFICATION_BYTES = 64 * 1024;
const MAX_ALERTS = 100;

export const LICENSING_ALERT_RECIPIENTS = Object.freeze([
  "betty@aaahealthservices.com",
  "raj@aaahealthservices.com"
]);

export function licensingAlertDeliveryEnabled(value = process.env.LICENSING_ALERT_NOTIFICATIONS_ENABLED) {
  return value === "true";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function validatedWebhookUrl(value = process.env.LICENSING_ALERT_WEBHOOK_URL) {
  if (!value) throw new Error("LICENSING_ALERT_WEBHOOK_URL is required when licensing changes need delivery.");
  let url;
  try { url = new URL(value); }
  catch { throw new Error("LICENSING_ALERT_WEBHOOK_URL must be a valid HTTPS URL."); }
  if (url.protocol !== "https:" || !url.hostname.endsWith("logic.azure.com")) {
    throw new Error("LICENSING_ALERT_WEBHOOK_URL must be an Azure Logic Apps HTTPS callback URL.");
  }
  return url.toString();
}

function validatedRunId(value) {
  const runId = String(value ?? "");
  if (!/^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/.test(runId)) throw new Error("Invalid licensing notification run ID.");
  return runId;
}

function validatedAlerts(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_ALERTS) throw new Error("Licensing notification requires 1 to 100 alerts.");
  return value.map((alert) => {
    const community = String(alert?.community ?? "").trim().slice(0, 150);
    const title = String(alert?.title ?? "").trim().slice(0, 200);
    const at = String(alert?.at ?? "");
    if (!community || !title || !Number.isFinite(Date.parse(at))) throw new Error("Invalid licensing notification alert.");
    return { community, title, at, reportId: alert.reportId ?? null, reportDate: alert.reportDate ?? null };
  });
}

export function buildLicensingChangeEmail({ runId, alerts, checkedAt }) {
  const safeRunId = validatedRunId(runId);
  const safeAlerts = validatedAlerts(alerts);
  const timestamp = String(checkedAt ?? safeAlerts[0].at);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error("Invalid licensing notification timestamp.");
  const communities = [...new Set(safeAlerts.map((alert) => alert.community))];
  const subject = safeAlerts.length === 1
    ? `Licensing update: ${communities[0]}`
    : `Licensing updates: ${safeAlerts.length} changes across ${communities.length} communities`;
  const rows = safeAlerts.map((alert) => `<li style="margin:0 0 12px"><strong>${escapeHtml(alert.community)}</strong><br>${escapeHtml(alert.title)}</li>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;color:#233c33;line-height:1.55;max-width:680px">
<h1 style="font-size:22px;margin:0 0 12px">Licensing records changed</h1>
<p style="margin:0 0 18px">The weekly California licensing check found ${safeAlerts.length} ${safeAlerts.length === 1 ? "change" : "changes"}.</p>
<ul style="padding-left:22px;margin:0 0 20px">${rows}</ul>
<p style="margin:0 0 18px"><a href="https://www.alamoplatform.com/analytics/licensing" style="color:#0f795f;font-weight:600">Review Licensing in Alamo Platform</a></p>
<p style="font-size:12px;color:#68756f;margin:0">Checked ${escapeHtml(new Date(timestamp).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }))} Pacific. Automated notice ${escapeHtml(safeRunId)}.</p>
</div>`;
  return {
    version: NOTIFICATION_VERSION,
    runId: safeRunId,
    idempotencyKey: `licensing:${safeRunId}`,
    to: [...LICENSING_ALERT_RECIPIENTS],
    subject,
    html,
    alertCount: safeAlerts.length,
    alerts: safeAlerts,
    communities,
    checkedAt: new Date(timestamp).toISOString()
  };
}

export async function queueLicensingChangeNotification(container, input) {
  if (!input.alerts?.length) return { status: "skipped", reason: "No licensing changes." };
  const envelope = buildLicensingChangeEmail(input);
  const bytes = Buffer.from(JSON.stringify(envelope));
  await uploadImmutable(container.getBlockBlobClient(`${PENDING_PREFIX}${envelope.runId}.json`), bytes, "application/json");
  return { status: "queued", runId: envelope.runId, alertCount: envelope.alertCount };
}

async function sentReceiptExists(container, runId) {
  return container.getBlockBlobClient(`${SENT_PREFIX}${runId}.json`).exists();
}

export async function deliverPendingLicensingNotifications(container, {
  enabled = licensingAlertDeliveryEnabled(),
  fetchImpl = fetch,
  webhookUrl
} = {}) {
  const pending = [];
  for await (const blob of container.listBlobsFlat({ prefix: PENDING_PREFIX })) pending.push(blob.name);
  if (!enabled) return pending.length ? [{ status: "paused", pendingCount: pending.length }] : [];
  const results = [];
  for (const name of pending.sort()) {
    const runId = validatedRunId(name.slice(PENDING_PREFIX.length, -".json".length));
    if (await sentReceiptExists(container, runId)) {
      results.push({ status: "already_sent", runId });
      continue;
    }
    const source = await readBlob(container.getBlockBlobClient(name), MAX_NOTIFICATION_BYTES);
    const envelope = JSON.parse(source.bytes.toString("utf8"));
    const expected = buildLicensingChangeEmail({ runId: envelope.runId, alerts: envelope.alerts ?? [], checkedAt: envelope.checkedAt });
    // Pending objects contain rendered content rather than raw source alerts.
    if (envelope.version !== NOTIFICATION_VERSION || envelope.runId !== runId || envelope.idempotencyKey !== expected.idempotencyKey ||
      JSON.stringify(envelope.to) !== JSON.stringify(LICENSING_ALERT_RECIPIENTS) || envelope.subject !== expected.subject || envelope.html !== expected.html ||
      envelope.alertCount !== expected.alertCount || JSON.stringify(envelope.communities) !== JSON.stringify(expected.communities)) {
      throw new Error("Invalid queued licensing notification.");
    }
    const url = validatedWebhookUrl(webhookUrl);
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": envelope.idempotencyKey },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Licensing notification delivery failed with HTTP ${response.status}.`);
    }
    await response.body?.cancel().catch(() => undefined);
    const receipt = Buffer.from(JSON.stringify({ version: NOTIFICATION_VERSION, runId, sentAt: new Date().toISOString(),
      alertCount: envelope.alertCount, recipients: LICENSING_ALERT_RECIPIENTS,
      sha256: createHash("sha256").update(source.bytes).digest("hex") }));
    await uploadImmutable(container.getBlockBlobClient(`${SENT_PREFIX}${runId}.json`), receipt, "application/json");
    results.push({ status: "sent", runId, alertCount: envelope.alertCount });
  }
  return results;
}
