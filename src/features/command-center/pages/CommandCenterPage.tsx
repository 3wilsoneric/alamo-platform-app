import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Database,
  RefreshCcw,
  ServerCog,
} from "lucide-react";
import { compileCopilotIntent, type CopilotIntentDebugResult } from "../../../shared/api/copilotChat";
import {
  fetchAnalystTraceTelemetry,
  fetchPlatformHealth,
  type AnalystTraceTelemetryResponse,
  type PlatformHealthResponse
} from "../../../shared/api/platformData";
import {
  ANALYST_CAPABILITY_REGISTRY,
  getAnalystCapability,
  summarizeCapabilityModes
} from "../../../../shared/analyst-capability-registry.mjs";
import { formatDisplayDate, formatDisplayDateTime } from "../../../../shared/display-date.mjs";
import { formatMonthLabel } from "../../../../shared/period-utils.mjs";

const QA_RERUN_COMMAND = "npm run qa:analyst";

function formatQaScope(scope?: {
  periods?: string[];
  category?: string | null;
  communityName?: string | null;
  facilityId?: string | null;
} | null) {
  if (!scope) return "No scope captured";
  return [
    scope.periods?.length ? scope.periods.join(", ") : null,
    scope.category,
    scope.communityName ?? (scope.facilityId ? `Community ${scope.facilityId}` : null)
  ].filter(Boolean).join(" · ") || "Portfolio · latest period";
}

function formatQaStage(stage?: string) {
  return String(stage ?? "validation").replace(/_/g, " ");
}

function formatTelemetryLabel(value?: string | null) {
  return String(value ?? "unknown").replace(/_/g, " ");
}

function getQualityTone(grade?: string | null) {
  if (grade === "excellent") return "bg-[#f3faf4] text-[#0f7a65]";
  if (grade === "good") return "bg-[#f5f7ff] text-[#4a5fb8]";
  if (grade === "review") return "bg-[#fff8ea] text-[#9a6a12]";
  return "bg-[#fff4f2] text-[#a04436]";
}

function formatSnapshotGeneratedAt(value?: string | null) {
  return formatDisplayDateTime(value, { fallback: "unknown time" });
}

function formatDateBucket(value?: string | null) {
  if (!value) return "unknown date";
  return formatDisplayDate(value, { fallback: "unknown date" });
}

function formatQaArtifactGeneratedAt(value?: string | null) {
  return formatDisplayDateTime(value, { fallback: "not run" });
}

export default function CommandCenterPage({ embedded = false }: { embedded?: boolean }) {
  const [health, setHealth] = useState<PlatformHealthResponse | null>(null);
  const [traceTelemetry, setTraceTelemetry] = useState<AnalystTraceTelemetryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [intentPrompt, setIntentPrompt] = useState("how many people went AWOL in May 2026");
  const [intentLoading, setIntentLoading] = useState(false);
  const [intentResult, setIntentResult] = useState<CopilotIntentDebugResult | null>(null);
  const [rerunCopied, setRerunCopied] = useState(false);
  const healthRequestRef = useRef<AbortController | null>(null);
  const intentRequestRef = useRef<AbortController | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  const loadHealth = useCallback(() => {
    healthRequestRef.current?.abort();
    const controller = new AbortController();
    healthRequestRef.current = controller;
    setLoading(true);

    Promise.allSettled([
      fetchPlatformHealth(controller.signal),
      fetchAnalystTraceTelemetry(controller.signal)
    ])
      .then(([healthResult, traceResult]) => {
        if (controller.signal.aborted || healthRequestRef.current !== controller) return;

        if (healthResult.status === "fulfilled") {
          setHealth(healthResult.value);
        } else {
          console.warn("Command Center health is unavailable.", healthResult.reason);
        }

        if (traceResult.status === "fulfilled") {
          setTraceTelemetry(traceResult.value);
        } else {
          console.warn("Analyst trace telemetry is unavailable.", traceResult.reason);
          setTraceTelemetry(null);
        }
      })
      .finally(() => {
        if (healthRequestRef.current !== controller) return;
        healthRequestRef.current = null;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadHealth();
    return () => {
      healthRequestRef.current?.abort();
      healthRequestRef.current = null;
      intentRequestRef.current?.abort();
      intentRequestRef.current = null;
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    };
  }, [loadHealth]);

  const systemHealth = useMemo(() => {
    const analystQa = health?.analystQa;
    const snapshot = health?.snapshotDiagnostics;
    const traceSummary = traceTelemetry?.summary;
    const qaHealthy = analystQa?.status === "pass";
    const qaDetail = analystQa?.summary
      ? `${analystQa.summary.passed}/${analystQa.summary.total} prompts passed · ${analystQa.businessDate ?? "latest"}`
      : analystQa?.warning ?? "Run the daily analyst QA after snapshot refresh.";

    return [
      {
        label: "Databricks Warehouse",
        status: health?.ok ? "Connected" : "Unavailable",
        detail: health?.backend ? `${health.backend} · ${health.catalog}.${health.schema}` : "No live health data.",
        healthy: Boolean(health?.ok),
        icon: Database
      },
      {
        label: "Warehouse Time",
        status: health?.warehouseTime ? "Live" : "Unavailable",
        detail: health?.warehouseTime ? formatDisplayDateTime(health.warehouseTime) : "No live health data.",
        healthy: Boolean(health?.warehouseTime),
        icon: ServerCog
      },
      {
        label: "Catalog Binding",
        status: health?.currentCatalog ? "Resolved" : "Unavailable",
        detail:
          health?.currentCatalog && health?.currentSchema
            ? `${health.currentCatalog}.${health.currentSchema}`
            : "No live catalog binding.",
        healthy: Boolean(health?.currentCatalog && health?.currentSchema),
        icon: CheckCircle2
      },
      {
        label: "Analyst QA",
        status: analystQa?.available ? analystQa.status.toUpperCase() : "Missing",
        detail: qaDetail,
        healthy: qaHealthy,
        icon: qaHealthy ? ClipboardCheck : AlertTriangle
      },
      {
        label: "Snapshot Freshness",
        status: snapshot ? (snapshot.stale ? "Stale" : "Current") : "Unavailable",
        detail: snapshot?.ageHours == null
          ? "No snapshot timestamp is available."
          : `${snapshot.ageHours.toFixed(1)} hours old · target under ${snapshot.maxAgeHours} hours`,
        healthy: Boolean(snapshot && !snapshot.stale),
        icon: snapshot?.stale ? AlertTriangle : CheckCircle2
      },
      {
        label: "Snapshot Payload",
        status: snapshot ? (snapshot.oversized ? "Review" : "Healthy") : "Unavailable",
        detail: snapshot
          ? `${snapshot.sizeMegabytes.toFixed(1)} MB of ${snapshot.maxSizeMegabytes.toFixed(0)} MB · ${snapshot.snapshotSource} · ${snapshot.snapshotLatestPath}`
          : "No snapshot payload diagnostics are available.",
        healthy: Boolean(snapshot && !snapshot.oversized),
        icon: snapshot?.oversized ? AlertTriangle : Database
      },
      {
        label: "Analyst Traces",
        status: traceSummary?.totalTurns ? "Recording" : "Waiting",
        detail: traceSummary?.totalTurns
          ? `${traceSummary.totalTurns.toLocaleString()} runtime turns · ${traceSummary.toolsObserved} tools · ${traceSummary.recoveryTurns} recovery · ${traceSummary.previewedTurns} previews · ${traceSummary.slowTurns} slow · ${traceSummary.issueTurns} review flags`
          : "No runtime analyst turns have been recorded in this API process yet.",
        healthy: Boolean(traceSummary?.totalTurns),
        icon: traceSummary?.issueTurns ? AlertTriangle : Activity
      },
      {
        label: "MAR Analyst Context",
        status: snapshot?.marReady ? "Ready" : "Missing",
        detail: snapshot
          ? snapshot.marReady
            ? `v${snapshot.toolContextVersion ?? "—"} · ${snapshot.marMonthlyRows.toLocaleString()} monthly medication rows · ${snapshot.marResidentRows.toLocaleString()} resident summaries · ${snapshot.marExceptionRows.toLocaleString()} exceptions`
            : `Active snapshot generated ${formatSnapshotGeneratedAt(snapshot.generatedAt)} has manifest ${snapshot.toolContextManifestRows ?? 0} rows and ${snapshot.toolContextTableCount ?? 0} tool tables. Re-run snapshot_publish after tool_context_views.`
          : "No snapshot diagnostics are available.",
        healthy: Boolean(snapshot?.marReady),
        icon: snapshot?.marReady ? CheckCircle2 : AlertTriangle
      },
      {
        label: "Census Trust Context",
        status: snapshot?.censusTrustReady ? "Ready" : "Missing",
        detail: snapshot
          ? snapshot.censusTrustReady
            ? `Latest census ${formatMonthLabel(snapshot.latestCensusMonth, { fallback: "unknown month" })} · weekly coverage through ${formatDateBucket(snapshot.censusWeeklyMaxWeek)} · flow through ${formatMonthLabel(snapshot.residentFlowMonthlyMaxMonth, { fallback: "unknown month" })}`
            : `Active snapshot generated ${formatSnapshotGeneratedAt(snapshot.generatedAt)} has ${snapshot.censusWeeklyRows ?? 0} weekly census rows, ${snapshot.censusQualityRows ?? 0} quality rows, ${snapshot.residentCountabilityRows ?? 0} countability rows, and ${snapshot.residentFlowMonthlyRows ?? 0} monthly flow rows. Re-run tool_context_views, analyst_context_qa, census_quality_audit, and snapshot_publish.`
          : "No snapshot diagnostics are available.",
        healthy: Boolean(snapshot?.censusTrustReady),
        icon: snapshot?.censusTrustReady ? CheckCircle2 : AlertTriangle
      },
      {
        label: "Historical Aggregate Context",
        status: snapshot?.historicalAggregateReady ? "Ready" : "Missing",
        detail: snapshot
          ? snapshot.historicalAggregateReady
            ? `${snapshot.incidentMonthlyRows.toLocaleString()} monthly incident rows · ${snapshot.medicationComplianceRows.toLocaleString()} monthly medication-compliance rows`
            : `Active snapshot has ${snapshot.incidentMonthlyRows ?? 0} monthly incident rows and ${snapshot.medicationComplianceRows ?? 0} monthly medication-compliance rows. Re-run tool_context_views, analyst_context_qa, and snapshot_publish.`
          : "No snapshot diagnostics are available.",
        healthy: Boolean(snapshot?.historicalAggregateReady),
        icon: snapshot?.historicalAggregateReady ? CheckCircle2 : AlertTriangle
      }
    ];
  }, [health, traceTelemetry]);

  const analystQa = health?.analystQa;
  const analystDataQa = health?.analystDataQa;
  const qaArtifacts = health?.qaArtifacts ?? [];
  const capabilityHealth = useMemo(() => {
    const modes = summarizeCapabilityModes();
    const answerFormats = new Set(ANALYST_CAPABILITY_REGISTRY.map((capability) => capability.answerFormat));
    const deterministic = modes.deterministic_only ?? 0;
    const synthesisOptional = modes.verified_synthesis_optional ?? 0;
    const agentic = modes.agentic_synthesis ?? 0;

    return {
      total: ANALYST_CAPABILITY_REGISTRY.length,
      deterministic,
      synthesisOptional,
      agentic,
      answerFormats: answerFormats.size,
      promptSeeds: ANALYST_CAPABILITY_REGISTRY.reduce(
        (total, capability) => total + capability.examples.length,
        0
      )
    };
  }, []);
  const previousQaRun = analystQa?.history?.[0];
  const qaSummaryText =
    analystQa?.status === "pass"
      ? "The analyst passed today's validation suite. Use the chat normally."
      : analystQa?.status === "warning"
        ? "The analyst is usable today, but one tested question path needs review before relying on that slice."
        : analystQa?.available
          ? "Review the analyst before relying on chat answers today."
          : "Daily analyst validation has not run yet.";
  const qaTone =
    analystQa?.status === "pass"
      ? "border-[#c8ddcb] bg-[#f3faf4] text-[#0f7a65]"
      : analystQa?.status === "warning"
        ? "border-[#ead8ba] bg-[#fff8ea] text-[#8a5b16]"
        : "border-[#e8c9c5] bg-[#fff4f2] text-[#a04436]";
  const qaArtifactTotals = qaArtifacts.reduce(
    (totals, artifact) => ({
      passed: totals.passed + (artifact.passed ? 1 : 0),
      missing: totals.missing + (!artifact.available ? 1 : 0),
      failing: totals.failing + (artifact.available && !artifact.passed ? 1 : 0)
    }),
    { passed: 0, missing: 0, failing: 0 }
  );
  const copyRerunCommand = () => {
    navigator.clipboard.writeText(QA_RERUN_COMMAND)
      .then(() => {
        setRerunCopied(true);
        if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = window.setTimeout(() => {
          copiedTimerRef.current = null;
          setRerunCopied(false);
        }, 1800);
      })
      .catch((error) => console.warn("Could not copy the analyst QA command.", error));
  };
  const compileIntent = () => {
    const prompt = intentPrompt.trim();
    if (!prompt) return;
    intentRequestRef.current?.abort();
    const controller = new AbortController();
    intentRequestRef.current = controller;
    setIntentLoading(true);

    compileCopilotIntent({ content: prompt }, { signal: controller.signal })
      .then((result) => {
        if (intentRequestRef.current === controller) setIntentResult(result);
      })
      .catch((error) => {
        if (controller.signal.aborted || intentRequestRef.current !== controller) return;
        console.warn("Intent compiler debug is unavailable.", error);
        setIntentResult({
          handled: false,
          reason: "Intent compiler debug is unavailable."
        });
      })
      .finally(() => {
        if (intentRequestRef.current !== controller) return;
        intentRequestRef.current = null;
        setIntentLoading(false);
      });
  };
  const frame = intentResult?.analysisFrame;
  const plan = intentResult?.executionPlan;
  const compiler = intentResult?.compiler;
  const intentCapability = intentResult?.certifiedQuestion?.id
    ? getAnalystCapability(intentResult.certifiedQuestion.id)
    : null;
  const intentFacts = [
    ["Metric", frame?.metric ?? "—"],
    ["Grain", frame?.metricGrain ?? "—"],
    ["Category", frame?.category ?? "—"],
    ["Mode", frame?.mode ?? "—"],
    ["Periods", frame?.periods?.length ? frame.periods.join(", ") : "—"],
    ["Grouping", frame?.grouping ?? "—"],
    ["Calculation", frame?.calculation ?? "—"],
    ["Selected tool", plan?.tool ?? "—"],
    ["Fallback tool", compiler?.fallbackTool ?? "—"],
    ["Execution mode", intentCapability?.executionMode ?? intentResult?.certifiedQuestion?.executionMode ?? "—"],
    ["Answer format", intentCapability?.answerFormat ?? "—"],
    ["Canonical prompt", plan?.canonicalPrompt ?? "—"]
  ];

  return (
    <div
      data-command-center="true"
      data-command-center-loading={loading ? "true" : "false"}
      className="space-y-5 text-[#201a14]"
    >
      <section className="rounded-[8px] border border-[#ddd4c8] bg-[#fffdfa]/88 p-4 shadow-[0_24px_70px_-52px_rgba(91,74,54,0.46)] sm:rounded-[30px] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b7b68]">
              Command Center
            </div>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.055em] text-[#201a14]">
              Platform status and analyst QA
            </h1>
            <p className="mt-2 max-w-[760px] text-[14px] leading-7 text-[#736657]">
              Current warehouse health, published context checks, and daily analyst prompt validation.
            </p>
          </div>
          {!embedded ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/home"
                className="inline-flex items-center gap-2 rounded-full border border-[#ddd4c8] bg-white/80 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#5f5346] transition-colors hover:bg-white hover:text-[#201a14]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Workspace
              </a>
              <button
                type="button"
                onClick={() => loadHealth()}
                className="inline-flex items-center gap-2 rounded-full border border-[#ddd4c8] bg-white/80 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#5f5346] transition-colors hover:bg-white hover:text-[#201a14]"
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {systemHealth.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.label} className="rounded-[20px] border border-[#d8d0c3] bg-white/74 px-4 py-3">
                <div className="flex items-start gap-3">
                  <Icon className={`mt-0.5 h-4 w-4 ${item.healthy ? "text-[#0f7a65]" : "text-[#a04436]"}`} />
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b7b68]">
                      {item.label}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`text-[13px] font-bold ${item.healthy ? "text-[#0f7a65]" : "text-[#a04436]"}`}>
                        {item.status}
                      </span>
                      <span className="text-[12px] leading-5 text-[#736657]">{item.detail}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={`rounded-[30px] border p-5 shadow-[0_18px_58px_-50px_rgba(91,74,54,0.48)] ${qaTone}`}>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex max-w-[720px] items-start gap-3">
            {analystQa?.status === "pass" ? (
              <ClipboardCheck className="mt-1 h-5 w-5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-1 h-5 w-5 shrink-0" />
            )}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-75">Daily analyst QA</div>
              <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.045em]">
                {analystQa?.summary
                  ? `${analystQa.summary.passed} of ${analystQa.summary.total} prompts passed`
                  : "Validation has not run"}
              </h2>
              <p className="mt-1 text-[13px] leading-6 opacity-85">{qaSummaryText}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.11em] opacity-75">
                <span>{analystQa?.generatedAt ? `Run ${formatDisplayDateTime(analystQa.generatedAt)}` : "No run timestamp"}</span>
                <span className="rounded-full bg-white/58 px-3 py-1.5 normal-case tracking-normal">
                  {analystDataQa
                    ? `Data contracts ${analystDataQa.passed}/${analystDataQa.total}${analystDataQa.warnings ? ` · ${analystDataQa.warnings} warnings` : ""}`
                    : "Data-contract QA will appear after the next Databricks publish"}
                </span>
                {previousQaRun ? (
                  <span className="rounded-full bg-white/58 px-3 py-1.5 normal-case tracking-normal">
                    Previous {previousQaRun.passed}/{previousQaRun.total} → Current {analystQa?.summary?.passed}/{analystQa?.summary?.total}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col items-end gap-3 sm:w-auto">
            {analystQa?.summary ? (
              <div className="grid w-full min-w-0 grid-cols-3 gap-2 sm:min-w-[280px]">
                <div className="rounded-[18px] bg-white/62 px-3 py-2 text-center">
                  <div className="text-[20px] font-bold">{analystQa.summary.passed}</div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-70">Passed</div>
                </div>
                <div className="rounded-[18px] bg-white/62 px-3 py-2 text-center">
                  <div className="text-[20px] font-bold">{analystQa.summary.failed}</div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-70">Failed</div>
                </div>
                <div className="rounded-[18px] bg-white/62 px-3 py-2 text-center">
                  <div className="text-[20px] font-bold">{analystQa.summary.total}</div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-70">Total</div>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => loadHealth()}
                className="inline-flex items-center gap-2 rounded-full border border-current/20 bg-white/62 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.11em] transition hover:bg-white"
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh status
              </button>
              <button
                type="button"
                onClick={copyRerunCommand}
                className="inline-flex items-center gap-2 rounded-full border border-current/20 bg-white/62 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.11em] transition hover:bg-white"
                title={`Rerun from the app workspace with ${QA_RERUN_COMMAND}`}
              >
                <Copy className="h-3.5 w-3.5" />
                {rerunCopied ? "Command copied" : "Copy rerun command"}
              </button>
            </div>
          </div>
        </div>

        {analystQa?.failures?.length ? (
          <div className="mt-5 border-t border-current/15 pt-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">Failed prompts</div>
                <p className="mt-1 text-[12px] leading-5 opacity-80">
                  These exact paths failed. The rest of the suite passed.
                </p>
              </div>
              <span className="text-[11px] font-semibold opacity-70">{analystQa.failures.length} shown</span>
            </div>
            <div className="mt-3 space-y-3">
              {analystQa.failures.map((failure) => (
                <article key={failure.id} className="rounded-[20px] bg-white/68 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-[820px]">
                      <div className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-60">Prompt</div>
                      <div className="mt-1 text-[14px] font-semibold leading-5">{failure.prompt}</div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(failure.failureDetails?.length
                        ? [...new Set(failure.failureDetails.map((detail) => detail.stage))]
                        : ["validation"]
                      ).map((stage) => (
                        <span key={stage} className="rounded-full border border-current/15 bg-white/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]">
                          {formatQaStage(stage)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-60">Expected</div>
                      <div className="mt-1 text-[12px] font-semibold">{failure.expectedTool ?? "No tool recorded"}</div>
                      <div className="mt-1 text-[11px] leading-5 opacity-75">{formatQaScope(failure.expected)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-60">Actual</div>
                      <div className="mt-1 text-[12px] font-semibold">{failure.actual?.tool ?? "No tool returned"}</div>
                      <div className="mt-1 text-[11px] leading-5 opacity-75">
                        {[failure.actual?.period, failure.actual?.category, failure.actual?.community].filter(Boolean).join(" · ") || "No validated scope returned"}
                        {typeof failure.actual?.rowCount === "number" ? ` · ${failure.actual.rowCount} rows` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-current/10 pt-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-60">Why it failed</div>
                    <ul className="mt-1 space-y-1 text-[11px] leading-5 opacity-80">
                      {(failure.failureDetails?.length
                        ? failure.failureDetails.map((detail) => detail.reason)
                        : failure.failures
                      ).map((reason) => <li key={reason}>• {reason}</li>)}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : analystQa?.available ? (
          <div className="mt-5 border-t border-current/15 pt-4 text-[12px] font-semibold opacity-80">
            No failed prompts in this run.
          </div>
        ) : null}
      </section>

      <section className="rounded-[30px] border border-[#ddd4c8] bg-white/76 p-5 shadow-[0_18px_58px_-50px_rgba(91,74,54,0.42)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8b7b68]">
              Validation coverage
            </div>
            <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.045em] text-[#201a14]">
              Browser, journey, and production smoke checks
            </h2>
            <p className="mt-1 max-w-[760px] text-[13px] leading-6 text-[#736657]">
              These artifacts show whether the tested user flows, surfaced modules, and production shell are healthy.
            </p>
          </div>
          <div className="rounded-full border border-[#ddd4c8] bg-[#fffdfa] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#736657]">
            {qaArtifactTotals.passed}/{qaArtifacts.length || 0} passing
          </div>
        </div>

        {qaArtifacts.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {qaArtifacts.map((artifact) => {
              const healthy = artifact.passed;
              const tone = healthy
                ? "border-[#c8ddcb] bg-[#f7fbf4] text-[#0f7a65]"
                : artifact.available
                  ? "border-[#ead8ba] bg-[#fff8ea] text-[#8a5b16]"
                  : "border-[#ddd4c8] bg-[#fffdfa] text-[#736657]";
              const Icon = healthy ? CheckCircle2 : AlertTriangle;

              return (
                <article key={artifact.key} className={`rounded-[20px] border px-4 py-3 ${tone}`}>
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12px] font-bold text-[#201a14]">{artifact.label}</span>
                        <span className="rounded-full bg-white/64 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]">
                          {artifact.status}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-5 opacity-85">{artifact.detail}</p>
                      <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.09em] opacity-65">
                        {formatQaArtifactGeneratedAt(artifact.generatedAt)}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-[20px] border border-dashed border-[#ddd4c8] bg-[#fffdfa]/62 px-4 py-4 text-[12px] leading-6 text-[#736657]">
            Validation artifacts have not been loaded into this health response yet.
          </div>
        )}

        {qaArtifactTotals.failing || qaArtifactTotals.missing ? (
          <p className="mt-3 text-[12px] leading-5 text-[#736657]">
            {qaArtifactTotals.failing ? `${qaArtifactTotals.failing} artifact needs review. ` : ""}
            {qaArtifactTotals.missing ? `${qaArtifactTotals.missing} artifact has not run yet.` : ""}
          </p>
        ) : null}
      </section>

      <section className="rounded-[30px] border border-[#ddd4c8] bg-white/76 p-5 shadow-[0_18px_58px_-50px_rgba(91,74,54,0.42)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8b7b68]">
              Runtime analyst traces
            </div>
            <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.045em] text-[#201a14]">
              Low-PHI turn journal
            </h2>
            <p className="mt-1 max-w-[760px] text-[13px] leading-6 text-[#736657]">
              Recent chat turns are retained as metadata so routing, validation, cache use, and module rendering can be audited without storing raw prompts.
            </p>
          </div>
          <div className="rounded-full border border-[#ddd4c8] bg-[#fffdfa] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#736657]">
            {traceTelemetry?.retention.currentRecords ?? 0} / {traceTelemetry?.retention.maxRecords ?? 0} retained
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Turns", traceTelemetry?.summary.totalTurns ?? 0],
            ["Tools", traceTelemetry?.summary.toolsObserved ?? 0],
            ["Recovery turns", traceTelemetry?.summary.recoveryTurns ?? 0],
            ["Stale turns", traceTelemetry?.summary.staleTurns ?? 0],
            ["Uncategorized", traceTelemetry?.summary.uncertifiedTurns ?? 0],
            ["Review flags", traceTelemetry?.summary.issueTurns ?? 0],
            ["Module turns", traceTelemetry?.summary.moduleTurns ?? 0],
            ["Avg quality", traceTelemetry?.summary.averageQualityScore ?? 0],
            ["Needs review", traceTelemetry?.summary.lowQualityTurns ?? 0]
          ].map(([label, value]) => (
            <div key={label} className="rounded-[20px] border border-[#d8d0c3] bg-[#fffdfa] px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b7b68]">
                {label}
              </div>
              <div className="mt-1 text-[24px] font-bold tracking-[-0.04em] text-[#201a14]">
                {Number(value).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {traceTelemetry?.tools.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {traceTelemetry.tools.slice(0, 6).map((tool) => (
              <div key={tool.tool} className="rounded-[20px] border border-[#ddd4c8] bg-[#fffdfa]/76 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[12px] font-bold text-[#201a14]">
                      {tool.tool.replace(/_/g, " ")}
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-[#736657]">
                      {tool.count.toLocaleString()} turns · {tool.certifiedTurns.toLocaleString()} certified · {tool.uncertifiedTurns.toLocaleString()} uncategorized
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${
                    tool.validationIssues || tool.schemaIssues
                      ? "bg-[#fff4f2] text-[#a04436]"
                      : "bg-[#f3faf4] text-[#0f7a65]"
                  }`}>
                    {tool.validationIssues + tool.schemaIssues} flags
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-[20px] border border-dashed border-[#ddd4c8] bg-[#fffdfa]/62 px-4 py-4 text-[12px] leading-6 text-[#736657]">
            No runtime analyst traces have been recorded in this API process yet. Ask one workspace question, then refresh Command Center.
          </div>
        )}

        {traceTelemetry?.families.length ? (
          <div className="mt-4 border-t border-[#ddd4c8] pt-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b7b68]">
              Recovery by family
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {traceTelemetry.families.slice(0, 4).map((family) => (
                <div key={family.family} className="rounded-[18px] bg-[#fffdfa]/76 px-4 py-3 text-[12px] leading-5 text-[#736657]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="font-bold text-[#201a14]">{family.family.replace(/_/g, " ")}</span>
                    <span className="rounded-full bg-[#f5efe6] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#6f6253]">
                      {family.count.toLocaleString()} turns
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <span>{family.recoveryTurns.toLocaleString()} recovery</span>
                    <span>{family.staleTurns.toLocaleString()} stale</span>
                    <span>{family.notLoadedTurns.toLocaleString()} not loaded</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {traceTelemetry?.decisionFamilies.length ? (
          <div className="mt-4 border-t border-[#ddd4c8] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b7b68]">
                Answer quality by request type
              </div>
              <div className="rounded-full bg-[#f5efe6] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#6f6253]">
                {traceTelemetry.summary.qualityScoredTurns.toLocaleString()} scored turns
              </div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {traceTelemetry.decisionFamilies.slice(0, 6).map((family) => (
                <div key={family.family} className="rounded-[18px] bg-[#fffdfa]/76 px-4 py-3 text-[12px] leading-5 text-[#736657]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="font-bold text-[#201a14]">{formatTelemetryLabel(family.family)}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${family.avgQualityScore >= 86 ? "bg-[#f3faf4] text-[#0f7a65]" : "bg-[#fff8ea] text-[#9a6a12]"}`}>
                      {family.avgQualityScore}/100
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <span>{family.count.toLocaleString()} turns</span>
                    <span>{family.reviewTurns.toLocaleString()} review</span>
                    <span>{family.moduleTurns.toLocaleString()} modules</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {traceTelemetry?.qualityFlags.length ? (
          <div className="mt-4 border-t border-[#ddd4c8] pt-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b7b68]">
              Common quality flags
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {traceTelemetry.qualityFlags.slice(0, 10).map((flag) => (
                <span key={flag.flag} className="rounded-full border border-[#ddd4c8] bg-[#fffdfa] px-3 py-1.5 text-[11px] font-semibold text-[#6f6253]">
                  {formatTelemetryLabel(flag.flag)} · {flag.count.toLocaleString()}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {traceTelemetry?.recentIssues.length ? (
          <div className="mt-4 border-t border-[#ddd4c8] pt-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b7b68]">
              Recent review flags
            </div>
            <div className="mt-3 space-y-2">
              {traceTelemetry.recentIssues.slice(0, 4).map((trace) => (
                <div key={trace.turnId} className="rounded-[18px] bg-[#fff8ea] px-4 py-3 text-[12px] leading-5 text-[#736657]">
                  <span className="font-bold text-[#201a14]">{(trace.selectedTool ?? "unknown").replace(/_/g, " ")}</span>
                  {" · "}
                  {trace.truthState ?? "no truth state"}
                  {trace.validation?.errors.length ? ` · ${trace.validation.errors.join("; ")}` : ""}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {traceTelemetry?.recent.length ? (
          <div className="mt-4 border-t border-[#ddd4c8] pt-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b7b68]">
              Recent turn review
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {traceTelemetry.recent.slice(0, 8).map((trace) => (
                <div key={trace.turnId} className="rounded-[18px] border border-[#eee6da] bg-[#fffdfa]/76 px-4 py-3 text-[12px] leading-5 text-[#736657]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-[#201a14]">
                        {formatTelemetryLabel(trace.plan?.decision?.family ?? trace.selectedTool)}
                      </div>
                      <div className="mt-0.5 text-[11px]">
                        {formatTelemetryLabel(trace.selectedTool)} · {trace.truthState ?? "no truth state"} · {trace.rowCount ?? 0} rows
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${getQualityTone(trace.quality?.grade)}`}>
                      {trace.quality?.grade ?? "unscored"} {trace.quality ? `${trace.quality.score}` : ""}
                    </span>
                  </div>
                  {trace.quality?.flags.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {trace.quality.flags.slice(0, 3).map((flag) => (
                        <span key={flag} className="rounded-full bg-[#f5efe6] px-2 py-0.5 text-[10px] font-semibold text-[#7c664c]">
                          {formatTelemetryLabel(flag)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-[30px] border border-[#ddd4c8] bg-white/76 p-5 shadow-[0_18px_58px_-50px_rgba(91,74,54,0.42)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8b7b68]">
              Module coverage map
            </div>
            <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.045em] text-[#201a14]">
              Surfaces and analytical modules under watch
            </h2>
            <p className="mt-1 max-w-[760px] text-[13px] leading-6 text-[#736657]">
              This compares the module registry to what runtime traces have actually exercised in this API process.
            </p>
          </div>
          <div className="rounded-full border border-[#ddd4c8] bg-[#fffdfa] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#736657]">
            {traceTelemetry?.moduleCoverage.totalModules ?? 0} registered
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            ["Surfaces", traceTelemetry?.moduleCoverage.surfaceModules ?? 0],
            ["Analysis modules", traceTelemetry?.moduleCoverage.analysisModules ?? 0],
            ["Observed modules", traceTelemetry?.moduleCoverage.observedModuleIds ?? 0],
            ["Observed tools", traceTelemetry?.moduleCoverage.observedAnalysisTools ?? 0]
          ].map(([label, value]) => (
            <div key={label} className="rounded-[20px] border border-[#d8d0c3] bg-[#fffdfa] px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b7b68]">{label}</div>
              <div className="mt-1 text-[24px] font-bold tracking-[-0.04em] text-[#201a14]">{Number(value).toLocaleString()}</div>
            </div>
          ))}
        </div>

        {traceTelemetry?.moduleCoverage.families.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {traceTelemetry.moduleCoverage.families.slice(0, 8).map((family) => (
              <div key={family.family} className="rounded-[18px] bg-[#fffdfa]/76 px-4 py-3 text-[12px] leading-5 text-[#736657]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <span className="font-bold text-[#201a14]">{formatTelemetryLabel(family.family)}</span>
                  <span className="rounded-full bg-[#f5efe6] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#6f6253]">
                    {family.total.toLocaleString()} modules
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                  <span>{family.surfaces} surfaces</span>
                  <span>{family.analyses} analysis</span>
                  <span>{family.observedModules} seen</span>
                  <span>{family.observedTools} tools</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {traceTelemetry?.moduleCoverage.uncoveredAnalysisModules.length ? (
          <div className="mt-4 border-t border-[#ddd4c8] pt-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b7b68]">
              Not observed recently
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {traceTelemetry.moduleCoverage.uncoveredAnalysisModules.slice(0, 10).map((module) => (
                <span key={module.id} className="rounded-full border border-[#ddd4c8] bg-[#fffdfa] px-3 py-1.5 text-[11px] font-semibold text-[#6f6253]">
                  {module.title} · {formatTelemetryLabel(module.tool)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-[30px] border border-[#ddd4c8] bg-white/76 p-5 shadow-[0_18px_58px_-50px_rgba(91,74,54,0.42)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8b7b68]">
              Analyst capability rails
            </div>
            <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.045em] text-[#201a14]">
              Deterministic first, synthesis only when useful
            </h2>
            <p className="mt-1 max-w-[760px] text-[13px] leading-6 text-[#736657]">
              Certified question families now share one registry for tool routing, answer format, and AH Analyst synthesis policy.
            </p>
          </div>
          <div className="rounded-full border border-[#ddd4c8] bg-[#fffdfa] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#736657]">
            {capabilityHealth.total} capabilities
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-[20px] border border-[#d8d0c3] bg-[#f7fbf4] px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#768265]">
              Deterministic
            </div>
            <div className="mt-1 text-[24px] font-bold tracking-[-0.04em] text-[#0f7a65]">
              {capabilityHealth.deterministic}
            </div>
            <div className="mt-1 text-[12px] leading-5 text-[#6f7a60]">
              Counts, rows, profiles, search, exports, and freshness stay local.
            </div>
          </div>
          <div className="rounded-[20px] border border-[#d8d0c3] bg-[#f5f7ff] px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6e78a8]">
              Synthesis optional
            </div>
            <div className="mt-1 text-[24px] font-bold tracking-[-0.04em] text-[#4a5fb8]">
              {capabilityHealth.synthesisOptional}
            </div>
            <div className="mt-1 text-[12px] leading-5 text-[#69709b]">
              Broad how/why prompts can use verified tool evidence.
            </div>
          </div>
          <div className="rounded-[20px] border border-[#d8d0c3] bg-[#fff8ea] px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9a7a3e]">
              Agentic
            </div>
            <div className="mt-1 text-[24px] font-bold tracking-[-0.04em] text-[#8a5b16]">
              {capabilityHealth.agentic}
            </div>
            <div className="mt-1 text-[12px] leading-5 text-[#7b6a4d]">
              Reserved for operating synthesis after facts are gathered.
            </div>
          </div>
          <div className="rounded-[20px] border border-[#d8d0c3] bg-[#fffdfa] px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b7b68]">
              QA seeds
            </div>
            <div className="mt-1 text-[24px] font-bold tracking-[-0.04em] text-[#201a14]">
              {capabilityHealth.promptSeeds}
            </div>
            <div className="mt-1 text-[12px] leading-5 text-[#736657]">
              Expanded into generated prompt variants during `check:analyst`.
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from(new Set(ANALYST_CAPABILITY_REGISTRY.map((capability) => capability.answerFormat))).sort().map((format) => (
            <span
              key={format}
              className="rounded-full border border-[#ddd4c8] bg-[#fffdfa] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.11em] text-[#736657]"
            >
              {format.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-[30px] border border-[#ddd4c8] bg-white/76 p-5 shadow-[0_18px_58px_-50px_rgba(91,74,54,0.42)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8b7b68]">
              Intent compiler
            </div>
            <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.045em] text-[#201a14]">
              Prompt workbench
            </h2>
            <p className="mt-1 max-w-[760px] text-[13px] leading-6 text-[#736657]">
              Compile a question into metric, grain, scope, and selected tool before it runs against data.
            </p>
          </div>
          {compiler ? (
            <div className="rounded-full border border-[#ddd4c8] bg-[#fffdfa] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#736657]">
              {compiler.frameFirst ? "Frame-first" : "Fallback"} route
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row">
          <input
            value={intentPrompt}
            onChange={(event) => setIntentPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") compileIntent();
            }}
            className="min-h-[46px] flex-1 rounded-full border border-[#ddd4c8] bg-[#fffdfa] px-5 text-[14px] font-semibold text-[#201a14] outline-none transition focus:border-[#8ea2ff]"
            placeholder="Ask a platform question to inspect the compiled intent"
          />
          <button
            type="button"
            onClick={compileIntent}
            className="inline-flex min-h-[46px] items-center justify-center rounded-full border border-[#cfc4b5] bg-[#201a14] px-5 text-[11px] font-bold uppercase tracking-[0.13em] text-white transition hover:bg-[#3a3026]"
          >
            {intentLoading ? "Compiling..." : "Compile"}
          </button>
        </div>

        {intentResult ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[24px] border border-[#ddd4c8] bg-[#fffdfa]/82 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b7b68]">
                Compiled intent
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {intentFacts.map(([label, value]) => (
                  <div key={label} className="rounded-[16px] bg-white/78 px-3 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9b8e7b]">
                      {label}
                    </div>
                    <div className="mt-1 break-words text-[13px] font-semibold leading-5 text-[#201a14]">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-[#ddd4c8] bg-[#fffdfa]/82 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b7b68]">
                Validation context
              </div>
              <div className="mt-3 space-y-2 text-[12px] leading-5 text-[#736657]">
                <p>
                  Input: <span className="font-semibold text-[#201a14]">{intentResult.originalContent ?? "—"}</span>
                </p>
                <p>
                  Interpreted:{" "}
                  <span className="font-semibold text-[#201a14]">{intentResult.interpretedContent ?? "—"}</span>
                </p>
                <p>
                  Certified rail:{" "}
                  <span className="font-semibold text-[#201a14]">
                    {intentResult.certifiedQuestion?.title ?? "—"}
                  </span>
                </p>
                <p>
                  Execution policy:{" "}
                  <span className="font-semibold text-[#201a14]">
                    {intentCapability
                      ? `${intentCapability.executionMode.replace(/_/g, " ")} · ${intentCapability.answerFormat.replace(/_/g, " ")}`
                      : "—"}
                  </span>
                </p>
                <p>
                  Compiler flags:{" "}
                  <span className="font-semibold text-[#201a14]">
                    {compiler
                      ? [
                          compiler.hasExplicitAnalyticalShape ? "analytical-shape" : null,
                          compiler.isModuleSurfaceIntent ? "surface-intent" : null,
                          compiler.inherited ? "inherited" : null
                        ].filter(Boolean).join(", ") || "none"
                      : "—"}
                  </span>
                </p>
                {intentResult.reason ? (
                  <p className="rounded-[16px] border border-[#ead8ba] bg-[#fff8ea] px-3 py-2 font-semibold text-[#8a5b16]">
                    {intentResult.reason}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </section>

    </div>
  );
}
