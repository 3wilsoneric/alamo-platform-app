import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  fetchAdmissionsDashboard,
  readCachedAdmissionsDashboard,
  type AdmissionsDashboardResponse
} from "../../../shared/api/platformData";
import type {
  AdmissionsBoardColumnKey,
  AdmissionsFlowPoint,
  AdmissionsReferralPipeline
} from "../../../shared/types/platformSnapshot";
import PipelineBoard from "../components/PipelineBoard";
import PlatformPageNavigation, {
  type PlatformPage
} from "../../california/components/PlatformPageNavigation";

// Validated as a pair (light surface, CVD-safe with the direct legend labels).
const ADMISSIONS_COLOR = "#0f8b73";
const DISCHARGES_COLOR = "#b8493a";
// Referral series, validated as a set with ADMISSIONS_COLOR (all pairs, CVD).
const REFERRALS_COLOR = "#4a67c4";
const ACCEPTED_COLOR = "#c7851a";
type AdmissionsSurface = "board" | "census" | "trends";
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
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<AdmissionsDashboardResponse | null>(readCachedAdmissionsDashboard);
  const [loading, setLoading] = useState(!dashboard);
  const [loadFailed, setLoadFailed] = useState(false);
  const [surface, setSurface] = useState<AdmissionsSurface>("board");
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

  function openPlatformPage(page: Exclude<PlatformPage, "admissions">) {
    navigate(page === "home" ? "/home" : "/analytics");
  }

  return (
    <div
      data-admissions-overview="true"
      className="relative left-1/2 min-h-dvh w-screen -translate-x-1/2 bg-white px-3 pb-14 pt-16 text-[#171918] sm:px-6 lg:px-10"
    >
      <PlatformPageNavigation
        active="admissions"
        onNavigate={openPlatformPage}
      />

      <div className="mx-auto w-full max-w-[1540px]">
        <h1 className="sr-only">Admissions</h1>
        <div className="-mx-3 py-2 lg:hidden">
          <div
            role="tablist"
            aria-label="Admissions categories"
            data-admissions-mobile-category-navigation="true"
            className="flex min-w-0 max-w-full gap-1 overflow-x-auto overscroll-x-contain border-b border-[#d9dfdb] px-3"
          >
            {(["received", "in_progress", "decision"] as const).map((column) => {
              const columnSummary = pipeline?.board.columns.find((candidate) => candidate.key === column);
              return (
                <SurfaceTab
                  key={column}
                  active={surface === "board" && mobilePipelineColumn === column}
                  label={columnSummary?.label ?? mobilePipelineLabel(column)}
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
            <SurfaceTab active={surface === "trends"} label="Trends" count={dashboard?.referral_trend.length ? `${dashboard.referral_trend.length} mo` : null} panel="admissions-trends-panel" onClick={() => setSurface("trends")} compact />
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
            <SurfaceTab active={surface === "trends"} label="Trends" count={dashboard?.referral_trend.length ? `${dashboard.referral_trend.length} mo` : null} panel="admissions-trends-panel" onClick={() => setSurface("trends")} />
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

        {surface === "board" && pipeline ? (
          <AdmissionsExecutiveUpdate pipeline={pipeline} />
        ) : null}

        <div id={`admissions-${surface}-panel`} role="tabpanel" className="pt-1">
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

          {surface === "trends" ? (
            <section aria-label="Admissions trends" className="grid gap-5 xl:grid-cols-2">
              {dashboard?.referral_trend.length ? <ReferralTrendChart points={dashboard.referral_trend} /> : null}
              <WeeklyFlowChart points={dashboard?.weekly ?? []} loading={loading && !dashboard} />
            </section>
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
      className={`relative -mb-px inline-flex shrink-0 items-center gap-2 border-b-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] ${compact ? "min-h-11 px-3 text-[12px]" : "min-h-12 px-0.5 text-[13px]"} ${active ? "border-[#0f8b73] font-semibold text-[#163f36]" : "border-transparent font-medium text-[#69716c] hover:border-[#b8c6bf] hover:text-[#303532]"}`}
    >
      {label}
      {count != null ? <span className={`text-[11px] font-medium tabular-nums ${active ? "text-[#0f795f]" : "text-[#929995]"}`}>{count}</span> : null}
    </button>
  );
}

function mobilePipelineLabel(column: AdmissionsBoardColumnKey) {
  if (column === "received") return "Referral received";
  if (column === "in_progress") return "In progress";
  return "Decision";
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

function ReferralTrendChart({ points }: { points: AdmissionsDashboardResponse["referral_trend"] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...points.flatMap((point) => [point.received, point.accepted, point.censusAdmissions]));
  const focused = active != null ? points[active] : points.at(-1) ?? null;

  return (
    <section aria-labelledby="admissions-referral-trend-title" data-admissions-referral-trend="true" className="rounded-xl border border-[#dfe3e1] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0ee] pb-4">
        <h2 id="admissions-referral-trend-title" className="text-[15px] font-semibold tracking-[-0.02em]">
          Referrals to move-ins
        </h2>
        <div className="flex flex-wrap items-center gap-4 text-[10px] text-[#595959]">
          <LegendSwatch color={REFERRALS_COLOR} label="Referrals received" />
          <LegendSwatch color={ACCEPTED_COLOR} label="Accepted" />
          <LegendSwatch color={ADMISSIONS_COLOR} label="Census admissions" />
        </div>
      </div>
      <p className="mt-3 min-h-5 text-[11px] text-[#595959]" aria-live="polite">
        {focused ? (
          <>
            {formatMonth(focused.month)}: <strong className="text-[#111111]">{focused.received}</strong> referrals,{" "}
            <strong className="text-[#111111]">{focused.accepted}</strong> accepted,{" "}
            <strong className="text-[#111111]">{focused.censusAdmissions}</strong> admitted to census
          </>
        ) : null}
      </p>
      <div className="mt-2 flex h-44 items-end gap-2 border-b border-[#d9d9d9] sm:gap-4" onMouseLeave={() => setActive(null)}>
        {points.map((point, index) => (
          <button
            key={point.month}
            type="button"
            aria-label={`${formatMonth(point.month)}: ${point.received} referrals, ${point.accepted} accepted, ${point.censusAdmissions} census admissions`}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            className={`flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-t-sm pt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f8b73] ${active === index ? "bg-[#f1f4f2]" : ""}`}
          >
            <Bar value={point.received} max={max} color={REFERRALS_COLOR} />
            <Bar value={point.accepted} max={max} color={ACCEPTED_COLOR} />
            <Bar value={point.censusAdmissions} max={max} color={ADMISSIONS_COLOR} />
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2 text-[9px] text-[#737373] sm:gap-4">
        {points.map((point) => (
          <span key={point.month} className="min-w-0 flex-1 truncate text-center">{formatMonth(point.month).slice(0, 3)}</span>
        ))}
      </div>
    </section>
  );
}

function WeeklyFlowChart({ points, loading }: { points: AdmissionsFlowPoint[]; loading: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...points.flatMap((point) => [point.admissions, point.discharges]));
  const focused = active != null ? points[active] : points.at(-1) ?? null;

  return (
    <section aria-labelledby="admissions-weekly-title" data-admissions-weekly-chart="true" className="rounded-xl border border-[#dfe3e1] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0ee] pb-4">
        <h2 id="admissions-weekly-title" className="text-[15px] font-semibold tracking-[-0.02em]">
          Weekly admissions and discharges
        </h2>
        <div className="flex items-center gap-4 text-[10px] text-[#595959]">
          <LegendSwatch color={ADMISSIONS_COLOR} label="Admissions" />
          <LegendSwatch color={DISCHARGES_COLOR} label="Discharges" />
        </div>
      </div>

      {loading ? (
        <div aria-busy="true" className="mt-4 h-48 animate-pulse bg-[#f7f8f7]" />
      ) : points.length ? (
        <>
          <p className="mt-3 min-h-5 text-[11px] text-[#595959]" aria-live="polite">
            {focused ? (
              <>
                Week of {formatDate(focused.period)}{focused.partial ? " (in progress)" : ""}:{" "}
                <strong className="text-[#111111]">{focused.admissions}</strong> admitted,{" "}
                <strong className="text-[#111111]">{focused.discharges}</strong> discharged, net{" "}
                <strong className="text-[#111111]">{formatDelta(focused.net)}</strong>
              </>
            ) : null}
          </p>
          <div
            className="mt-2 flex h-44 items-end gap-1 border-b border-[#d9d9d9] sm:gap-2"
            onMouseLeave={() => setActive(null)}
          >
            {points.map((point, index) => (
              <button
                key={point.period}
                type="button"
                aria-label={`Week of ${formatDate(point.period)}: ${point.admissions} admissions, ${point.discharges} discharges`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className={`flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-t-sm pt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f8b73] ${active === index ? "bg-[#f1f4f2]" : ""}`}
              >
                <Bar value={point.admissions} max={max} color={ADMISSIONS_COLOR} partial={point.partial === true} />
                <Bar value={point.discharges} max={max} color={DISCHARGES_COLOR} partial={point.partial === true} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1 text-[9px] text-[#737373] sm:gap-2">
            {points.map((point, index) => (
              <span key={point.period} className="min-w-0 flex-1 truncate text-center">
                {index % 2 === points.length % 2 ? "" : formatShortDate(point.period)}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="py-8 text-[12px] text-[#737373]">Weekly resident flow is not available in the current snapshot.</p>
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
