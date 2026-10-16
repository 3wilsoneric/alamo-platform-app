import { createHash } from "node:crypto";
import { getLicensingLibrary, getLicensingUpdates } from "./licensing-library.mjs";
import { getPipelineAdmissionsSummary } from "./pipeline-admissions-summary.mjs";

export function everyAgentFingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

export function createEveryAgentAdapters({ licensing = getLicensingLibrary, updates = getLicensingUpdates, pipeline = getPipelineAdmissionsSummary } = {}) {
  return {
    async licensing() {
      const [library, feed] = await Promise.all([licensing(new URL("https://www.alamoplatform.com/api/platform/licensing")), updates()]);
      if (feed.status === "failed") return { connection: "unavailable", issue: "The latest state check failed. The last complete report collection remains available.", sourceCheckedAt: feed.lastChecked, entries: [] };
      if (feed.status !== "complete") return { connection: "not_checked", issue: "Waiting for the first completed state check.", sourceCheckedAt: feed.lastChecked, entries: [] };
      return {
        connection: "connected", issue: null, sourceCheckedAt: feed.lastChecked,
        entries: library.reports.map(report => ({
          key: report.id, fingerprint: report.textSha256, communityIds: [report.facilityId],
          title: report.title, summary: `${report.reportDate} · ${report.reportType}. ${report.analysis?.headline ?? "State report ready to review."}`,
          evidence: [
            { id: `community:${report.facilityId}`, kind: "community", label: library.communities.find(c => c.facilityId === report.facilityId)?.name ?? "Community",
              href: `/analytics/agent?skill=licensing&community=${report.facilityId}`, observedAt: library.collectedAt },
            { id: `report:${report.id}`, kind: "report", label: "Read report",
              href: `/analytics/agent?skill=licensing&report=${report.id}`, observedAt: report.retrievedAt },
            { id: `source:${report.id}`, kind: "source", label: "Original state record", href: report.sourceUrl, observedAt: report.retrievedAt }
          ],
          relationships: [
            { from: `community:${report.facilityId}`, relation: "has_report", to: `report:${report.id}` },
            { from: `report:${report.id}`, relation: "sourced_from", to: `source:${report.id}` }
          ]
        }))
      };
    },
    async "admissions-watch"() {
      const summary = await pipeline();
      if (summary.status !== "connected") return { connection: summary.status === "not_connected" ? "not_connected" : "unavailable",
        issue: summary.status === "not_connected" ? "Pipeline has not connected its published summary." : "Pipeline's published summary is temporarily unavailable.", sourceCheckedAt: null, entries: [] };
      const generated = Date.parse(summary.generatedAt);
      if (!Number.isFinite(generated) || generated > Date.now() + 300_000 || Date.now() - generated > 86_400_000) {
        return { connection: "unavailable", issue: "Pipeline's summary is out of date. Open Admissions to check the source.", sourceCheckedAt: Number.isFinite(generated) ? summary.generatedAt : null, entries: [] };
      }
      // Deliberately project aggregate counts. Referral names, packets, clinical
      // details, and raw upstream payloads never enter EveryAgent memory.
      const metrics = summary.metrics;
      const fields = [metrics?.activeReferrals, metrics?.stale, metrics?.unassigned, metrics?.awaitingAdmission];
      if (fields.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error("Invalid Pipeline summary.");
      return { connection: "connected", issue: null, sourceCheckedAt: summary.generatedAt, entries: [{
        key: "pipeline-admissions-summary", fingerprint: everyAgentFingerprint(fields), communityIds: [],
        title: "Admissions activity",
        summary: `${metrics.activeReferrals} active referrals · ${metrics.stale} flagged as stale · ${metrics.unassigned} unassigned · ${metrics.awaitingAdmission} awaiting admission.`,
        evidence: [
          { id: "pipeline:admissions", kind: "application", label: "Open Pipeline", href: "https://alamo-pipeline.com", observedAt: summary.generatedAt },
          { id: "platform:admissions", kind: "module", label: "Admissions overview", href: "/admissions", observedAt: summary.generatedAt }
        ],
        relationships: [{ from: "platform:admissions", relation: "summarizes", to: "pipeline:admissions" }]
      }] };
    }
  };
}
