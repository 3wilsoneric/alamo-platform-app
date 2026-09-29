import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

import {
  fetchAdmissionsDashboard,
  readCachedAdmissionsDashboard,
  type AdmissionsDashboardResponse
} from "../../../shared/api/platformData";
import type {
  AdmissionsBoardColumnKey,
  AdmissionsReferralPipeline
} from "../../../shared/types/platformSnapshot";
import PipelineBoard from "../components/PipelineBoard";


// Validated as a pair (light surface, CVD-safe with the direct legend labels).
const ADMISSIONS_COLOR = "#0f8b73";
// Referral series, validated as a set with ADMISSIONS_COLOR (all pairs, CVD).
const REFERRALS_COLOR = "#4a67c4";
const ACCEPTED_COLOR = "#c7851a";
type AdmissionsSurface = "briefing" | "board" | "census";
type ConnectedAdmissionsPipeline = Extract<AdmissionsReferralPipeline, { status: "connected" }>;
type ExecutiveUpdateSegment = { text: string; strong?: boolean };
type ExecutiveUpdateLine = {
  key: "accepted" | "workload" | "locations";
  segments: ExecutiveUpdateSegment[];
};

const CHAT_STREAM_START_DELAY_MS = 240;
const CHAT_STREAM_TICK_MS = 45;
const CHAT_STREAM_CHARS_PER_TICK = 3;

export default function AdmissionsPage() {
  const [dashboard, setDashboard] = useState<AdmissionsDashboardResponse | null>(readCachedAdmissionsDashboard);
  const [loading, setLoading] = useState(!dashboard);
  const [loadFailed, setLoadFailed] = useState(false);
  const [surface, setSurface] = useState<AdmissionsSurface>("briefing");
  const [mobilePipelineColumn, setMobilePipelineColumn] = useState<AdmissionsBoardColumnKey>("received");

  // Every signed-in Platform user sees this working view, including the client
  // identity already available throughout the authenticated Platform.
  useEffect(() => {
    const controller = new AbortController();
    setLoadFailed(false);
    fetchAdmissionsDashboard(controller.signal)
      .then((value) => setDashboard(value))
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const freshnessWarning = dashboard?.snapshot_status?.warning ?? null;
  const referralPipeline = dashboard?.referral_pipeline ?? null;
  const pipeline = referralPipeline?.status === "connected" ? referralPipeline : null;

  return (
    <div
      data-admissions-overview="true"
      className="relative min-h-[calc(100dvh-var(--platform-header-height))] w-full bg-white px-3 pb-14 text-[#171918] sm:px-6 lg:px-10"
    >
      <div className="mx-auto w-full max-w-[1540px]">
        <h1 className="sr-only">Admissions</h1>
        <div className="-mx-3 py-2 lg:hidden">
          <div
            role="tablist"
            aria-label="Admissions categories"
            data-admissions-mobile-category-navigation="true"
            className="grid min-w-0 w-full grid-cols-5 border-b border-[#d9dfdb] px-3"
          >
            {(["received", "in_progress", "decision"] as const).map((column) => {
              const columnSummary = pipeline?.board.columns.find((candidate) => candidate.key === column);
              return (
                <SurfaceTab
                  key={column}
                  active={surface === "board" && mobilePipelineColumn === column}
                  label={mobilePipelineLabel(column)}
                  count={columnSummary?.count ?? null}
                  panel="admissions-board-panel"
                  onClick={() => {
                    setMobilePipelineColumn(column);
                    setSurface("board");
                  }}
                  compact
                />
              );
            })}
            <SurfaceTab active={surface === "census"} label="Census" count={dashboard?.portfolio.census ?? null} panel="admissions-census-panel" onClick={() => setSurface("census")} compact />
            <SurfaceTab active={surface === "briefing"} label="Briefing" count={null} panel="admissions-briefing-panel" onClick={() => setSurface("briefing")} compact />
          </div>
        </div>

        <div className="hidden py-5 lg:block">
          <div
            role="tablist"
            aria-label="Admissions views"
            data-admissions-surface-tabs="true"
            className="flex min-w-0 max-w-full justify-center gap-6 overflow-x-auto border-b border-[#d9dfdb] sm:gap-8"
          >
            <SurfaceTab active={surface === "board"} label="Board" count={pipeline?.board.total ?? null} panel="admissions-board-panel" onClick={() => setSurface("board")} />
            <SurfaceTab active={surface === "census"} label="Census" count={dashboard?.portfolio.census ?? null} panel="admissions-census-panel" onClick={() => setSurface("census")} />
            <SurfaceTab active={surface === "briefing"} label="Briefing" count={null} panel="admissions-briefing-panel" onClick={() => setSurface("briefing")} />
          </div>
        </div>

        {freshnessWarning ? (
          <div className="mb-4 rounded-lg border border-[#efc8bd] bg-[#fff7f5] px-4 py-3 text-[12px] leading-5 text-[#6e352d]">
            <strong>Data update delayed.</strong> {freshnessWarning}
          </div>
        ) : null}

        {loadFailed && !dashboard ? (
          <div role="alert" className="mb-6 rounded-xl border border-[#e4d1ca] bg-white px-4 py-8">
            <p className="text-[14px] font-bold text-[#a04436]">Admissions data is temporarily unavailable.</p>
            <p className="mt-2 text-[12px] leading-5 text-[#737373]">Pipeline remains available while Alamo retries its governed feed.</p>
          </div>
        ) : null}

        <div id={`admissions-${surface}-panel`} role="tabpanel" className="pt-1">
          {surface === "briefing" ? (
            <AdmissionsBriefingPanel
              dashboard={dashboard}
              loading={loading && !dashboard}
              pipeline={pipeline}
            />
          ) : null}

          {surface === "board" ? (
            pipeline ? (
              <PipelineBoard
                pipeline={pipeline}
                communities={dashboard?.communities ?? []}
                mobileColumn={mobilePipelineColumn}
              />
            ) : (
              <section
                aria-label="Referral board"
                data-admissions-referral-pipeline={referralPipeline?.status ?? "loading"}
                className="rounded-xl border border-[#dfe3e1] bg-white px-5 py-12 text-center"
              >
                <p className="text-[13px] text-[#5f6762]">
                  {referralPipeline?.status === "unavailable"
                    ? "The live referral board is temporarily unavailable."
                    : referralPipeline
                      ? "The referral feed has not been connected yet."
                      : "Loading the referral board…"}
                </p>
              </section>
            )
          ) : null}

          {surface === "census" ? (
            <CensusPanel
              dashboard={dashboard}
              loading={loading && !dashboard}
              stale={loadFailed && Boolean(dashboard)}
              pipelineConnected={Boolean(pipeline)}
            />
          ) : null}

        </div>
      </div>
    </div>
  );
}

function AdmissionsExecutiveUpdate({ pipeline }: { pipeline: ConnectedAdmissionsPipeline }) {
  const update = buildAdmissionsExecutiveUpdate(pipeline);
  const lines = buildExecutiveUpdateLines(update);
  const totalCharacters = lines.reduce(
    (total, line) => total + line.segments.reduce((lineTotal, segment) => lineTotal + segment.text.length, 0),
    0
  );
  const responseKey = `${pipeline.generatedAt}:${update?.total ?? 0}`;
  const [revealedCharacters, setRevealedCharacters] = useState(0);
  const [typing, setTyping] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealedCharacters(totalCharacters);
      setTyping(false);
      return;
    }

    setRevealedCharacters(0);
    setTyping(true);
    let revealed = 0;
    let interval: number | undefined;
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        revealed = Math.min(totalCharacters, revealed + CHAT_STREAM_CHARS_PER_TICK);
        setRevealedCharacters(revealed);
        if (revealed >= totalCharacters) {
          if (interval != null) window.clearInterval(interval);
          setTyping(false);
        }
      }, CHAT_STREAM_TICK_MS);
    }, CHAT_STREAM_START_DELAY_MS);
    return () => {
      window.clearTimeout(start);
      if (interval != null) window.clearInterval(interval);
    };
  }, [responseKey, totalCharacters]);

  let characterOffset = 0;

  return (
    <section
      data-admissions-executive-update="true"
      data-admissions-chat-response="true"
      data-admissions-chat-typing={typing ? "true" : "false"}
      aria-label="Admissions analyst update"
      aria-busy={typing}
      className="mb-6 max-w-[1120px] rounded-[16px] bg-[#f4f7f5] px-4 py-4 text-[#46504b] sm:px-5 sm:py-5"
    >
      <div className="flex items-start gap-3.5">
        <span data-admissions-chat-avatar="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dcebe5] text-[#176d51] sm:h-9 sm:w-9">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-8 items-center gap-2">
            <span className="text-[12px] font-semibold text-[#263c35] sm:text-[13px]">Admissions analyst</span>
            <span className="text-[10px] text-[#7a847f]" aria-hidden="true">{typing ? "Composing…" : "Live update"}</span>
          </div>
          <div className="mt-2.5 space-y-2 text-[13px] leading-6 sm:text-[14px] sm:leading-7">
            {lines.map((line) => {
              const lineLength = line.segments.reduce((total, segment) => total + segment.text.length, 0);
              const visibleCharacters = Math.max(0, Math.min(lineLength, revealedCharacters - characterOffset));
              const lineStarted = visibleCharacters > 0 || (typing && characterOffset === 0);
              const lineIsStreaming = typing && visibleCharacters > 0 && visibleCharacters < lineLength;
              characterOffset += lineLength;
              if (!lineStarted) return null;
              return (
                <p
                  key={line.key}
                  data-admissions-executive-line={line.key}
                >
                  <StreamingSegments segments={line.segments} visibleCharacters={visibleCharacters} />
                  {lineIsStreaming ? <span data-admissions-typing-caret="true" className="ml-0.5 inline-block animate-pulse font-semibold text-[#0f8b73]" aria-hidden="true">▍</span> : null}
                </p>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function StreamingSegments({ segments, visibleCharacters }: { segments: ExecutiveUpdateSegment[]; visibleCharacters: number }) {
  let remaining = visibleCharacters;
  return segments.map((segment, index) => {
    if (remaining <= 0) return null;
    const text = segment.text.slice(0, remaining);
    remaining -= segment.text.length;
    return segment.strong
      ? <strong key={index} className="font-semibold text-[#183f34]">{text}</strong>
      : <span key={index}>{text}</span>;
  });
}

function buildExecutiveUpdateLines(update: ReturnType<typeof buildAdmissionsExecutiveUpdate>): ExecutiveUpdateLine[] {
  if (!update) {
    return [{ key: "workload", segments: [{ text: "There are no active referrals in the current admissions update." }] }];
  }

  const lines: ExecutiveUpdateLine[] = [];
  if (update.acceptedClients.length) {
    lines.push({
      key: "accepted",
      segments: buildAcceptedClientSegments(update.acceptedClients)
    });
  }
  lines.push({
    key: "workload",
    segments: [
      { text: "Admissions is managing " },
      { text: `${update.total} active ${pluralize("referral", update.total)}`, strong: true },
      { text: ": " },
      { text: `${update.received} newly received`, strong: true },
      { text: ", " },
      { text: `${update.inProgress} in assessment and review`, strong: true },
      { text: ", and " },
      { text: `${update.decision} at decision`, strong: true },
      { text: "." }
    ]
  });
  if (update.busiest.length) {
    lines.push({
      key: "locations",
      segments: [
        { text: "Where the work is:", strong: true },
        { text: ` ${formatCommunityLoad(update.busiest)}.` }
      ]
    });
  }
  return lines;
}

function buildAcceptedClientSegments(
  clients: Array<{ name: string; community: string; plannedAdmissionDate: string | null }>
): ExecutiveUpdateSegment[] {
  const segments: ExecutiveUpdateSegment[] = [
    { text: "Accepted clients moving toward admission:", strong: true },
    { text: " " }
  ];
  clients.forEach((client, index) => {
    segments.push({ text: client.name, strong: true });
    segments.push({ text: ` to ${client.community}` });
    segments.push({
      text: client.plannedAdmissionDate
        ? `, planned ${formatDate(client.plannedAdmissionDate)}`
        : ", admission date not scheduled"
    });
    segments.push({ text: index === clients.length - 1 ? "." : "; " });
  });
  return segments;
}

function buildAdmissionsExecutiveUpdate(pipeline: ConnectedAdmissionsPipeline) {
  const columns = new Map(pipeline.board.columns.map((column) => [column.key, column.count]));
  const total = pipeline.board.total;
  if (!total) return null;

  const received = columns.get("received") ?? 0;
  const inProgress = columns.get("in_progress") ?? 0;
  const decision = columns.get("decision") ?? 0;
  const acceptedClients = pipeline.board.cards
    .filter((card) => isAcceptedReferral(card.status))
    .map((card) => ({
      name: card.clientName,
      community: card.facilityId ? card.community : "No community assigned",
      plannedAdmissionDate: card.plannedAdmissionDate
    }))
    .sort((left, right) => {
      if (left.plannedAdmissionDate && right.plannedAdmissionDate) {
        const dateOrder = left.plannedAdmissionDate.localeCompare(right.plannedAdmissionDate);
        if (dateOrder) return dateOrder;
      } else if (left.plannedAdmissionDate) {
        return -1;
      } else if (right.plannedAdmissionDate) {
        return 1;
      }
      return left.name.localeCompare(right.name);
    });
  const communityCounts = new Map<string, number>();
  for (const card of pipeline.board.cards) {
    const community = card.facilityId ? card.community : "No community assigned";
    communityCounts.set(community, (communityCounts.get(community) ?? 0) + 1);
  }
  const busiest = [...communityCounts.entries()]
    .sort(([leftName, leftCount], [rightName, rightCount]) => rightCount - leftCount || leftName.localeCompare(rightName))
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  return { total, received, inProgress, decision, acceptedClients, busiest };
}

function isAcceptedReferral(status: string) {
  const normalized = status.trim().toLowerCase();
  return normalized.startsWith("accept") || normalized === "awaiting admit" || normalized === "meet the client not sent";
}

function formatCommunityLoad(communities: Array<{ name: string; count: number }>) {
  const values = communities.map(({ name, count }) =>
    name === "No community assigned" ? `${count} unassigned` : `${count} at ${name}`
  );
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function pluralize(noun: string, count: number) {
  return count === 1 ? noun : `${noun}s`;
}

function SurfaceTab({
  active,
  label,
  count,
  panel,
  onClick,
  compact = false
}: {
  active: boolean;
  label: string;
  count: string | number | null;
  panel: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={panel}
      onClick={onClick}
      className={`relative -mb-px inline-flex shrink-0 items-center gap-2 border-b-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] ${compact ? "min-h-12 min-w-0 justify-center px-0.5 text-[11px] sm:text-[12px]" : "min-h-12 px-0.5 text-[13px]"} ${active ? "border-[#0f8b73] font-semibold text-[#163f36]" : "border-transparent font-medium text-[#69716c] hover:border-[#b8c6bf] hover:text-[#303532]"}`}
    >
      {label}
      {count != null ? <span className={`${compact ? "sr-only" : ""} text-[11px] font-medium tabular-nums ${active ? "text-[#0f795f]" : "text-[#929995]"}`}>{count}</span> : null}
    </button>
  );
}

function mobilePipelineLabel(column: AdmissionsBoardColumnKey) {
  if (column === "received") return "Received";
  if (column === "in_progress") return "In progress";
  return "Decision";
}

function AdmissionsBriefingPanel({
  dashboard,
  loading,
  pipeline
}: {
  dashboard: AdmissionsDashboardResponse | null;
  loading: boolean;
  pipeline: ConnectedAdmissionsPipeline | null;
}) {
  const briefing = dashboard?.briefing ?? null;
  if (loading) {
    return (
      <div aria-label="Loading Admissions briefing" aria-busy="true" className="space-y-4">
        <div className="h-28 animate-pulse rounded-2xl bg-[#f1f4f2]" />
        <div className="h-72 animate-pulse rounded-xl bg-[#f7f8f7]" />
      </div>
    );
  }
  if (!dashboard || !briefing) {
    return <p className="rounded-xl border border-[#dfe3e1] bg-white px-5 py-10 text-center text-[13px] text-[#69716c]">The weekly briefing is not available in the current snapshot.</p>;
  }

  return (
    <div data-admissions-weekly-briefing="true" className="space-y-5">
      {pipeline ? <AdmissionsExecutiveUpdate pipeline={pipeline} /> : null}

      <section className="overflow-hidden rounded-xl border border-[#dfe3e1] bg-white" aria-labelledby="admissions-briefing-community-title">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#dfe3e1] px-4 py-4 sm:px-5">
          <div>
            <h2 id="admissions-briefing-community-title" className="text-[15px] font-semibold tracking-[-0.02em]">Community briefing</h2>
            <p className="mt-1 text-[10px] text-[#737b77]">
              Week of {formatDate(briefing.weekStart)} through {formatDate(briefing.weekEnd)}
            </p>
          </div>
          <p className="text-[10px] text-[#737b77]">
            Census through {formatDate(briefing.asOfDate)}
            {briefing.pipelineAsOfDate ? ` · Referrals through ${formatDate(briefing.pipelineAsOfDate)}` : ""}
          </p>
        </div>

        {briefing.sourceStatus !== "ready" ? (
          <p data-admissions-briefing-source-notice="true" className="border-b border-[#ead8a9] bg-[#fffaf0] px-4 py-3 text-[11px] leading-5 text-[#75591f] sm:px-5">
            Census and completed move-ins remain governed. Exact 7- and 14-day referral origins, scheduled assessments, and planned move-ins will populate when Pipeline publishes the briefing event feed; unavailable fields are not treated as zero.
          </p>
        ) : null}

        <div className="space-y-3 p-3 sm:hidden">
          {briefing.communities.map((community) => (
            <article key={community.facilityId} data-admissions-briefing-community={community.facilityId} className="rounded-xl border border-[#e3e7e5] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-[13px] font-semibold">{community.shortName}</h3>
                  <p className="mt-1 text-[10px] text-[#737b77]">{community.occupancyPct != null ? `${community.occupancyPct}% occupied` : "No census assigned"}</p>
                </div>
                <strong className="text-[24px] font-semibold tracking-[-0.03em]">{formatBriefingCount(community.census)}</strong>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#edf0ee] pt-3 text-[10px]">
                <BriefingFact label="New referrals · 7d" value={community.newReferrals7d} />
                <BriefingFact label="New referrals · 14d" value={community.newReferrals14d} />
                <BriefingFact label="Assessments this week" value={community.assessmentsThisWeek} />
                <BriefingFact label="Planned move-ins" value={community.plannedMoveInsThisWeek} />
                <BriefingFact label="Completed move-ins" value={community.completedMoveInsThisWeek} />
              </dl>
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[940px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e2e6e3] text-[10px] font-medium text-[#69716c]">
                <th className="px-5 py-4">Community</th>
                <th className="px-3 py-4 text-right">Census</th>
                <th className="px-3 py-4 text-right">Referrals · 7d</th>
                <th className="px-3 py-4 text-right">Referrals · 14d</th>
                <th className="px-3 py-4 text-right">Assessments</th>
                <th className="px-3 py-4 text-right">Planned move-ins</th>
                <th className="px-5 py-4 text-right">Completed move-ins</th>
              </tr>
            </thead>
            <tbody>
              {briefing.communities.map((community) => (
                <tr key={community.facilityId} data-admissions-briefing-community={community.facilityId} className="border-b border-[#edf0ee] text-[12px] last:border-b-0">
                  <td className="px-5 py-4 font-medium">{community.communityName}</td>
                  <td className="px-3 py-4 text-right text-[16px] font-semibold">{formatBriefingCount(community.census)}</td>
                  <td className="px-3 py-4 text-right">{formatBriefingCount(community.newReferrals7d)}</td>
                  <td className="px-3 py-4 text-right">{formatBriefingCount(community.newReferrals14d)}</td>
                  <td className="px-3 py-4 text-right">{formatBriefingCount(community.assessmentsThisWeek)}</td>
                  <td className="px-3 py-4 text-right">{formatBriefingCount(community.plannedMoveInsThisWeek)}</td>
                  <td className="px-5 py-4 text-right">{formatBriefingCount(community.completedMoveInsThisWeek)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
        <section className="rounded-xl border border-[#dfe3e1] bg-white p-4 sm:p-5" aria-labelledby="admissions-origin-title">
          <div className="border-b border-[#edf0ee] pb-3">
            <h2 id="admissions-origin-title" className="text-[15px] font-semibold tracking-[-0.02em]">Referral origin · last 14 days</h2>
            <p className="mt-1 text-[10px] text-[#737b77]">Last seven days compared with the previous seven.</p>
          </div>
          {briefing.coverage.recentReferrals ? (
            briefing.origins.length ? (
              <>
                <div className="space-y-2 py-3 sm:hidden">
                  {briefing.origins.map((origin) => (
                    <article key={origin.key} className="rounded-lg border border-[#e3e7e5] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-[11px] font-semibold leading-4 text-[#263c35]">{origin.sourceName}</h3>
                          {origin.referringCounty ? <p className="mt-0.5 text-[9px] text-[#7a817d]">{origin.referringCounty} County</p> : null}
                        </div>
                        <strong className="text-[16px] font-semibold tabular-nums text-[#263c35]">{origin.total14Days}</strong>
                      </div>
                      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-[#edf0ee] pt-2 text-[9px]">
                        <div><dt className="text-[#7a817d]">Last 7</dt><dd className="mt-0.5 font-semibold">{origin.last7Days}</dd></div>
                        <div><dt className="text-[#7a817d]">Prior 7</dt><dd className="mt-0.5 font-semibold">{origin.previous7Days}</dd></div>
                        <div><dt className="text-[#7a817d]">14 days</dt><dd className="mt-0.5 font-semibold">{origin.total14Days}</dd></div>
                      </dl>
                      <p className="mt-2 text-[9px] leading-4 text-[#69716c]">{origin.communities.join(", ")}</p>
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[560px] border-collapse text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-[#edf0ee] text-[9px] font-medium uppercase tracking-[0.08em] text-[#7a817d]">
                        <th className="py-3 pr-3">Origin</th>
                        <th className="px-2 py-3 text-right">Last 7</th>
                        <th className="px-2 py-3 text-right">Prior 7</th>
                        <th className="px-2 py-3 text-right">14 days</th>
                        <th className="py-3 pl-3">Communities</th>
                      </tr>
                    </thead>
                    <tbody>
                      {briefing.origins.map((origin) => (
                        <tr key={origin.key} className="border-b border-[#f0f2f1] last:border-b-0">
                          <td className="py-3 pr-3"><strong className="font-medium">{origin.sourceName}</strong>{origin.referringCounty ? <span className="mt-0.5 block text-[9px] text-[#7a817d]">{origin.referringCounty} County</span> : null}</td>
                          <td className="px-2 py-3 text-right">{origin.last7Days}</td>
                          <td className="px-2 py-3 text-right">{origin.previous7Days}</td>
                          <td className="px-2 py-3 text-right font-semibold">{origin.total14Days}</td>
                          <td className="py-3 pl-3 text-[#5f6762]">{origin.communities.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 max-h-64 divide-y divide-[#edf0ee] overflow-y-auto border-t border-[#dfe3e1]">
                  {briefing.recentReferrals.map((referral) => (
                    <article key={`${referral.referralId}:${referral.receivedAt}`} data-admissions-recent-referral={referral.referralId} className="grid gap-1 py-3 text-[10px] sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                      <p><strong className="font-semibold text-[#263c35]">{referral.clientName}</strong><span className="text-[#69716c]"> · {referral.sourceName ?? referral.sourceCategory ?? "Origin not recorded"}{referral.referringCounty ? ` · ${referral.referringCounty} County` : ""}</span></p>
                      <p className="text-[#69716c] sm:text-right">{formatEventDate(referral.receivedAt)} · {referral.facilityId ? referral.community : "No community assigned"}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : <p className="py-8 text-[12px] text-[#737b77]">No referrals were received during the governed 14-day window.</p>
          ) : <IncompleteBriefingField label="Recent-referral dates and origin" />}
        </section>

        <BriefingTrendPanel dashboard={dashboard} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <BriefingSchedule
          title="Upcoming assessments"
          covered={briefing.coverage.assessments}
          emptyLabel="No remaining assessments are scheduled this week."
          items={briefing.upcomingAssessments.map((item) => ({
            key: `${item.referralId}:${item.scheduledAt}`,
            clientName: item.clientName,
            date: item.scheduledAt,
            community: item.facilityId ? item.community : "No community assigned",
            owner: item.owner,
            status: item.status
          }))}
        />
        <BriefingSchedule
          title="Move-ins this week"
          covered={briefing.coverage.moveIns}
          emptyLabel="No move-ins are planned for this week."
          items={briefing.plannedMoveIns.map((item) => ({
            key: `${item.referralId}:${item.plannedAt}`,
            clientName: item.clientName,
            date: item.plannedAt,
            community: item.facilityId ? item.community : "No community assigned",
            owner: item.owner,
            status: item.readiness === "unknown" ? item.status : `${item.status} · ${item.readiness}`
          }))}
        />
      </div>
    </div>
  );
}

function BriefingFact({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="text-[#737b77]">{label}</dt>
      <dd className="mt-0.5 font-semibold text-[#263c35]">{formatBriefingCount(value)}</dd>
    </div>
  );
}

function BriefingTrendPanel({ dashboard }: { dashboard: AdmissionsDashboardResponse }) {
  const points = dashboard.briefing.trend;
  const max = Math.max(1, ...points.flatMap((point) => [point.received, point.accepted, point.completedMoveIns ?? 0]));
  return (
    <section data-admissions-briefing-trend="true" className="rounded-xl border border-[#dfe3e1] bg-white p-4 sm:p-5" aria-labelledby="admissions-briefing-trend-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0ee] pb-3">
        <h2 id="admissions-briefing-trend-title" className="text-[15px] font-semibold tracking-[-0.02em]">Weekly trend</h2>
        <div className="flex flex-wrap gap-3 text-[9px] text-[#69716c]">
          <LegendSwatch color={REFERRALS_COLOR} label="Received" />
          <LegendSwatch color={ACCEPTED_COLOR} label="Accepted" />
          <LegendSwatch color={ADMISSIONS_COLOR} label="Moved in" />
        </div>
      </div>
      {dashboard.briefing.coverage.weeklyTrend && points.length ? (
        <>
          <div className="mt-5 flex h-48 items-end gap-2 border-b border-[#d9d9d9]">
            {points.map((point) => (
              <div key={point.weekStart} className="flex h-full min-w-0 flex-1 items-end justify-center gap-[2px]" title={`Week of ${formatDate(point.weekStart)}: ${point.received} received, ${point.accepted} accepted, ${formatBriefingCount(point.completedMoveIns)} moved in`}>
                <Bar value={point.received} max={max} color={REFERRALS_COLOR} />
                <Bar value={point.accepted} max={max} color={ACCEPTED_COLOR} />
                <Bar value={point.completedMoveIns ?? 0} max={max} color={ADMISSIONS_COLOR} partial={point.completedMoveIns == null} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2 text-[9px] text-[#737373]">
            {points.map((point) => <span key={point.weekStart} className="min-w-0 flex-1 truncate text-center">{formatShortDate(point.weekStart)}</span>)}
          </div>
        </>
      ) : <IncompleteBriefingField label="Weekly referral and acceptance history" />}
    </section>
  );
}

function BriefingSchedule({
  title,
  covered,
  emptyLabel,
  items
}: {
  title: string;
  covered: boolean;
  emptyLabel: string;
  items: Array<{ key: string; clientName: string; date: string; community: string; owner: string; status: string }>;
}) {
  return (
    <section className="rounded-xl border border-[#dfe3e1] bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4 border-b border-[#edf0ee] pb-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em]">{title}</h2>
        <span className="text-[11px] font-semibold tabular-nums text-[#315b54]">{covered ? items.length : "—"}</span>
      </div>
      {covered ? (
        items.length ? (
          <div className="max-h-72 divide-y divide-[#edf0ee] overflow-y-auto">
            {items.map((item) => (
              <article key={item.key} className="grid gap-1 py-3 text-[10px] sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4">
                <time className="font-semibold text-[#315b54]">{formatEventDate(item.date)}</time>
                <div className="min-w-0">
                  <p className="truncate"><strong className="font-semibold text-[#263c35]">{item.clientName}</strong><span className="text-[#69716c]"> · {item.community}</span></p>
                  <p className="mt-0.5 text-[#7a817d]">{item.owner} · {item.status}</p>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="py-8 text-[12px] text-[#737b77]">{emptyLabel}</p>
      ) : <IncompleteBriefingField label={title} />}
    </section>
  );
}

function IncompleteBriefingField({ label }: { label: string }) {
  return (
    <p className="py-8 text-[12px] leading-5 text-[#8a6118]">
      {label} is incomplete in the current Pipeline contract. No estimate is shown.
    </p>
  );
}

function CensusPanel({
  dashboard,
  loading,
  stale,
  pipelineConnected
}: {
  dashboard: AdmissionsDashboardResponse | null;
  loading: boolean;
  stale: boolean;
  pipelineConnected: boolean;
}) {
  const portfolio = dashboard?.portfolio ?? null;
  const monthLabel = dashboard ? formatMonth(dashboard.month) : "This month";

  return (
    <section aria-labelledby="admissions-community-census-title" className="overflow-hidden rounded-xl border border-[#dfe3e1] bg-white">
      <h2 id="admissions-community-census-title" className="sr-only">Community census</h2>
      {stale ? (
        <p className="flex items-center gap-2 border-b border-[#ead8a9] bg-[#fffaf0] px-4 py-2 text-[11px] text-[#7a5a18]">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Showing the last available Alamo snapshot.
        </p>
      ) : null}

      {loading ? (
        <div aria-label="Loading Admissions census" aria-busy="true" className="space-y-px bg-[#d9d9d9]">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-20 animate-pulse bg-[#f7f8f7]" />)}
        </div>
      ) : (
        <>
          <div className="space-y-3 p-3 sm:hidden">
            <article className="rounded-xl bg-[#edf3f0] p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[13px] font-semibold">Portfolio</span>
                <strong className="text-[24px] font-semibold tracking-[-0.03em]">{formatNumber(portfolio?.census ?? null)}</strong>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-[10px] text-[#5f6762]">
                <span>{portfolio?.occupancyPct != null ? `${portfolio.occupancyPct}% full` : "—"}</span>
                <span>In <strong className="text-[#171918]">{portfolio?.monthToDate.admissions ?? "—"}</strong></span>
                <span>Out <strong className="text-[#171918]">{portfolio?.monthToDate.discharges ?? "—"}</strong></span>
                <span className="text-right font-semibold text-[#315b54]">{formatDelta(portfolio?.monthToDate.net ?? null)}</span>
              </div>
            </article>
            {(dashboard?.communities ?? []).map((community) => (
              <article
                key={community.facilityId}
                data-admissions-community-census-card={community.facilityId}
                className="rounded-xl border border-[#e2e6e3] p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="min-w-0 truncate text-[13px] font-medium">{community.shortName}</span>
                  <strong className="text-[22px] font-semibold tracking-[-0.03em]">{formatNumber(community.census)}</strong>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-[10px] text-[#69716c]">
                  <span>{community.occupancyPct != null ? `${community.occupancyPct}% full` : "—"}</span>
                  <span>In <strong className="text-[#171918]">{community.monthToDate.admissions}</strong></span>
                  <span>Out <strong className="text-[#171918]">{community.monthToDate.discharges}</strong></span>
                  <span className="text-right font-semibold text-[#315b54]">{formatDelta(community.monthToDate.net)}</span>
                </div>
                {community.referrals ? (
                  <div className="mt-3 flex gap-2 border-t border-[#edf0ee] pt-3 text-[10px] text-[#69716c]">
                    <span>{community.referrals.onBoard} on board</span>
                    <span aria-hidden="true">·</span>
                    <span>{community.referrals.inDecision} at decision</span>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#e2e6e3] text-[10px] font-medium text-[#69716c]">
                  <th className="px-5 py-4">Community</th>
                  <th className="px-4 py-4 text-right">Census</th>
                  <th className="px-4 py-4 text-right">Occupancy</th>
                  <th className="px-4 py-4 text-right">In · {monthLabel}</th>
                  <th className="px-4 py-4 text-right">Out · {monthLabel}</th>
                  <th className="px-4 py-4 text-right">Net</th>
                  {pipelineConnected ? <th className="px-5 py-4 text-right">Board</th> : null}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#dbe5df] bg-[#edf3f0] text-[12px]">
                  <td className="px-5 py-4 font-semibold">Portfolio</td>
                  <td className="px-4 py-4 text-right text-[17px] font-semibold">{formatNumber(portfolio?.census ?? null)}</td>
                  <td className="px-4 py-4 text-right">{portfolio?.occupancyPct != null ? `${portfolio.occupancyPct}%` : "—"}</td>
                  <td className="px-4 py-4 text-right">{portfolio?.monthToDate.admissions ?? "—"}</td>
                  <td className="px-4 py-4 text-right">{portfolio?.monthToDate.discharges ?? "—"}</td>
                  <td className="px-4 py-4 text-right font-semibold text-[#315b54]">{formatDelta(portfolio?.monthToDate.net ?? null)}</td>
                  {pipelineConnected ? <td className="px-5 py-4 text-right">{dashboard?.referral_pipeline.status === "connected" ? dashboard.referral_pipeline.board.total : "—"}</td> : null}
                </tr>
                {(dashboard?.communities ?? []).map((community) => (
                  <tr key={community.facilityId} className="border-b border-[#edf0ee] text-[12px] last:border-b-0 hover:bg-[#fafbfa]">
                    <td className="px-5 py-4 font-medium">{community.communityName}</td>
                    <td className="px-4 py-4 text-right text-[16px] font-semibold">{formatNumber(community.census)}</td>
                    <td className="px-4 py-4 text-right text-[#5f6762]">{community.occupancyPct != null ? `${community.occupancyPct}%` : "—"}</td>
                    <td className="px-4 py-4 text-right">{community.monthToDate.admissions}</td>
                    <td className="px-4 py-4 text-right">{community.monthToDate.discharges}</td>
                    <td className="px-4 py-4 text-right font-semibold text-[#315b54]">{formatDelta(community.monthToDate.net)}</td>
                    {pipelineConnected ? <td className="px-5 py-4 text-right">{community.referrals?.onBoard ?? 0}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Bar({ value, max, color, partial }: { value: number; max: number; color: string; partial?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="block w-full max-w-3 rounded-t-[4px]"
      style={{
        height: `${Math.max(value ? 3 : 0, (value / max) * 100)}%`,
        backgroundColor: color,
        opacity: partial ? 0.45 : 1
      }}
    />
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function formatNumber(value: number | null) {
  return value == null || !Number.isFinite(value) ? "Not loaded" : value.toLocaleString("en-US");
}

function formatBriefingCount(value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US");
}

function formatEventDate(value: string) {
  const includesTime = value.includes("T");
  const date = new Date(includesTime ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", includesTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }
    : { month: "short", day: "numeric" }).format(date);
}

function formatDelta(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Not loaded";
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-US")}`;
}

function formatMonth(value: string) {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatShortDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric" }).format(date);
}
