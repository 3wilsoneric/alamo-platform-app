import { useEffect, useRef, useState } from "react";
import { Building2, CalendarDays, ChevronDown, ChevronRight, ClipboardList, Clock3, House } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import {
  fetchAdmissionsDashboard,
  readCachedAdmissionsDashboard,
  type AdmissionsDashboardResponse
} from "../../../shared/api/platformData";
import type {
  AdmissionsBoardCard,
  AdmissionsBoardColumnKey,
  AdmissionsReferralPipeline
} from "../../../shared/types/platformSnapshot";
import { readStorageItem, writeStorageItem } from "../../../shared/storage/browserStorage";
import PipelineBoard, { ProgressModal } from "../components/PipelineBoard";
import {
  buildAdmissionsMoveInSchedule,
  isAcceptedReferral,
  isDeclinedReferral,
  type AdmissionsScheduleEvent
} from "../schedule";

type ConnectedAdmissionsPipeline = Extract<AdmissionsReferralPipeline, { status: "connected" }>;
type ExecutiveUpdateSegment = { text: string; strong?: boolean; accent?: boolean };
type ExecutiveUpdateLine = {
  key: string;
  group: "summary" | "scheduled" | "pending" | "pipeline";
  label?: string;
  segments: ExecutiveUpdateSegment[];
};

const CHAT_STREAM_START_DELAY_MS = 240;
const CHAT_STREAM_TICK_MS = 45;
const CHAT_STREAM_CHARS_PER_TICK = 3;
const ADMISSIONS_BRIEFING_TYPED_SESSION_KEY = "alamo:admissions-briefing-typed:v1";

export default function AdmissionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [dashboard, setDashboard] = useState<AdmissionsDashboardResponse | null>(readCachedAdmissionsDashboard);
  const [loading, setLoading] = useState(!dashboard);
  const [loadFailed, setLoadFailed] = useState(false);
  const [mobilePipelineColumn, setMobilePipelineColumn] = useState<AdmissionsBoardColumnKey>("received");
  const [briefingCard, setBriefingCard] = useState<AdmissionsBoardCard | null>(null);

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
  const today = admissionsToday();
  const scheduledMoveIns = buildAdmissionsMoveInSchedule(pipeline, dashboard?.briefing ?? null, today);
  const surface = searchParams.get("view") === "pipeline" ? "pipeline" : "briefing";

  function showSurface(next: "pipeline" | "briefing") {
    setBriefingCard(null);
    const params = new URLSearchParams(searchParams);
    if (next === "pipeline") params.set("view", "pipeline");
    else params.delete("view");
    setSearchParams(params, { replace: false });
  }

  return (
    <div
      data-admissions-overview="true"
      className="relative min-h-[calc(100dvh-var(--platform-header-height))] w-full bg-[#fbfaf7] px-3 pb-[max(3.5rem,env(safe-area-inset-bottom))] text-[#171918] sm:px-6 lg:px-10"
    >
      <div className="mx-auto w-full max-w-[1540px]">
        <h1 className="sr-only">Admissions</h1>

        {freshnessWarning ? (
          <div className="mt-4 mb-4 rounded-lg border border-[#efc8bd] bg-[#fff7f5] px-4 py-3 text-[12px] leading-5 text-[#6e352d] sm:mt-6">
            <strong>Data update delayed.</strong> {freshnessWarning}
          </div>
        ) : null}

        {loadFailed && !dashboard ? (
          <div role="alert" className="mb-6 rounded-xl border border-[#e4d1ca] bg-white px-4 py-8">
            <p className="text-[14px] font-bold text-[#a04436]">Admissions data is temporarily unavailable.</p>
            <p className="mt-2 text-[12px] leading-5 text-[#737373]">Pipeline remains available while Alamo retries its governed feed.</p>
          </div>
        ) : null}

        <div className="pt-4 sm:pt-6">
          <AdmissionsSurfaceNavigation surface={surface} onChange={showSurface} />

          {surface === "pipeline" ? (
          <section
            id="admissions-referral-board-panel"
            role="tabpanel"
            aria-label="Admissions pipeline"
            aria-labelledby="admissions-referral-board-title"
            data-admissions-pipeline-page="true"
            className="pt-5 sm:pt-6"
          >
            <h2 id="admissions-referral-board-title" className="sr-only">Referral board</h2>
            {pipeline ? (
              <>
                <div
                  role="tablist"
                  aria-label="Referral board categories"
                  data-admissions-mobile-category-navigation="true"
                  className="-mx-3 mb-3 grid grid-cols-3 border-b border-[#d9dfdb] px-3 lg:hidden"
                >
                  {(["received", "in_progress", "decision"] as const).map((column) => {
                    const columnSummary = pipeline.board.columns.find((candidate) => candidate.key === column);
                    return (
                      <SurfaceTab
                        key={column}
                        active={mobilePipelineColumn === column}
                        label={mobilePipelineLabel(column)}
                        count={columnSummary?.count ?? null}
                        panel="admissions-mobile-board-list"
                        onClick={() => setMobilePipelineColumn(column)}
                        compact
                      />
                    );
                  })}
                </div>
                <div
                  id="admissions-mobile-board-list"
                  role="tabpanel"
                  aria-label={`${mobilePipelineLabel(mobilePipelineColumn)} referrals`}
                >
                  <PipelineBoard
                    pipeline={pipeline}
                    communities={dashboard?.communities ?? []}
                    mobileColumn={mobilePipelineColumn}
                  />
                </div>
              </>
            ) : (
              <div
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
              </div>
            )}
          </section>
          ) : (
            <div id="admissions-briefing-page" role="tabpanel" aria-label="Admissions briefing" data-admissions-briefing-page="true" className="pt-5 sm:pt-6">
              {pipeline ? <AdmissionsExecutiveUpdate pipeline={pipeline} scheduledMoveIns={scheduledMoveIns} /> : null}
              <AdmissionsBriefingDashboard
                dashboard={dashboard}
                pipeline={pipeline}
                scheduledMoveIns={scheduledMoveIns}
                loading={loading && !dashboard}
                onOpenCard={setBriefingCard}
              />
            </div>
          )}
        </div>
      </div>
      {briefingCard && pipeline ? (
        <ProgressModal card={briefingCard} generatedAt={pipeline.generatedAt} onClose={() => setBriefingCard(null)} />
      ) : null}
    </div>
  );
}

function AdmissionsSurfaceNavigation({
  surface,
  onChange
}: {
  surface: "pipeline" | "briefing";
  onChange: (surface: "pipeline" | "briefing") => void;
}) {
  return (
    <nav aria-label="Admissions pages" data-admissions-surface-navigation="true" className="-mx-3 border-b border-[#d9dfdb] bg-[#fbfaf7] px-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <div role="tablist" className="flex items-end gap-7">
        {(["briefing", "pipeline"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={surface === item}
            aria-controls={item === "pipeline" ? "admissions-referral-board-panel" : "admissions-briefing-page"}
            onClick={() => onChange(item)}
            className={`-mb-px min-h-12 border-b-2 px-0.5 text-[15px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] ${surface === item ? "border-[#0f8b73] font-semibold text-[#163f36]" : "border-transparent font-medium text-[#69716c] hover:border-[#b8c6bf] hover:text-[#303532]"}`}
          >
            {item === "pipeline" ? "Pipeline" : "Briefing"}
          </button>
        ))}
      </div>
    </nav>
  );
}

function AdmissionsExecutiveUpdate({
  pipeline,
  scheduledMoveIns
}: {
  pipeline: ConnectedAdmissionsPipeline;
  scheduledMoveIns: AdmissionsScheduleEvent[];
}) {
  const update = buildAdmissionsExecutiveUpdate(pipeline);
  const lines = buildExecutiveUpdateLines(update, admissionsToday(), scheduledMoveIns);
  const totalCharacters = lines.reduce(
    (total, line) => total + line.segments.reduce((lineTotal, segment) => lineTotal + segment.text.length, 0),
    0
  );
  const [playTypingAnimation] = useState(() => !hasSeenAdmissionsBriefing());
  const initialCharacterTarget = useRef(totalCharacters);
  const [revealedCharacters, setRevealedCharacters] = useState(() => playTypingAnimation ? 0 : totalCharacters);
  const [typing, setTyping] = useState(playTypingAnimation);

  useEffect(() => {
    rememberAdmissionsBriefing();
    const characterTarget = initialCharacterTarget.current;
    if (!playTypingAnimation || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealedCharacters(characterTarget);
      setTyping(false);
      return;
    }

    setRevealedCharacters(0);
    setTyping(true);
    let revealed = 0;
    let interval: number | undefined;
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        revealed = Math.min(characterTarget, revealed + CHAT_STREAM_CHARS_PER_TICK);
        setRevealedCharacters(revealed);
        if (revealed >= characterTarget) {
          if (interval != null) window.clearInterval(interval);
          setTyping(false);
        }
      }, CHAT_STREAM_TICK_MS);
    }, CHAT_STREAM_START_DELAY_MS);
    return () => {
      window.clearTimeout(start);
      if (interval != null) window.clearInterval(interval);
    };
  }, [playTypingAnimation]);

  useEffect(() => {
    if (!typing) setRevealedCharacters(totalCharacters);
  }, [totalCharacters, typing]);

  let characterOffset = 0;
  const visibleLines = lines.flatMap((line) => {
    const lineLength = line.segments.reduce((total, segment) => total + segment.text.length, 0);
    const visibleCharacters = Math.max(0, Math.min(lineLength, revealedCharacters - characterOffset));
    const lineStarted = visibleCharacters > 0 || (typing && characterOffset === 0);
    const lineIsStreaming = typing && lineStarted && visibleCharacters < lineLength;
    characterOffset += lineLength;
    return lineStarted ? [{ ...line, visibleCharacters, lineIsStreaming }] : [];
  });
  const summaryLine = visibleLines.find((line) => line.group === "summary");
  const conversationLines = visibleLines.filter((line) => line.group !== "summary");

  return (
    <section
      data-admissions-executive-update="true"
      data-admissions-chat-response="true"
      data-admissions-chat-typing={typing ? "true" : "false"}
      aria-label="Admissions briefing"
      aria-busy={typing}
      className="mb-6 w-full rounded-[24px] border border-[#e2ded4] bg-[linear-gradient(135deg,#faf6ef_0%,#f2f7f5_58%,#f5f3f8_100%)] px-5 py-5 text-[#46504b] shadow-[0_10px_30px_rgba(65,59,48,0.05)] sm:px-8 sm:py-7 lg:px-10 lg:py-8"
    >
      {summaryLine ? (
        <p data-admissions-executive-summary="true" className="max-w-[1280px] text-[18px] leading-7 tracking-[-0.018em] text-[#3f4b46] sm:text-[21px] sm:leading-8">
          <StreamingSegments segments={summaryLine.segments} visibleCharacters={summaryLine.visibleCharacters} />
          {summaryLine.lineIsStreaming ? <span data-admissions-typing-caret="true" className="ml-0.5 inline-block animate-pulse font-semibold text-[#0f8b73]" aria-hidden="true">▍</span> : null}
        </p>
      ) : null}
      <div className="mt-5 max-w-[1320px] space-y-3 border-t border-[#d6e2dc] pt-5 text-[15px] leading-7 text-[#52605a] sm:text-[16px]">
        {conversationLines.map((line) => (
          <p key={line.key} data-admissions-executive-section={line.group} data-admissions-executive-row={line.key}>
            <StreamingSegments segments={line.segments} visibleCharacters={line.visibleCharacters} />
            {line.lineIsStreaming ? <TypingCaret /> : null}
          </p>
        ))}
      </div>
    </section>
  );
}

function TypingCaret() {
  return <span data-admissions-typing-caret="true" className="ml-0.5 inline-block animate-pulse font-semibold text-[#0f8b73]" aria-hidden="true">▍</span>;
}

function hasSeenAdmissionsBriefing() {
  return readStorageItem(ADMISSIONS_BRIEFING_TYPED_SESSION_KEY, {
    kind: "session",
    label: "Admissions briefing animation"
  }) === "true";
}

function rememberAdmissionsBriefing() {
  writeStorageItem(ADMISSIONS_BRIEFING_TYPED_SESSION_KEY, "true", {
    kind: "session",
    label: "Admissions briefing animation"
  });
}

function StreamingSegments({ segments, visibleCharacters }: { segments: ExecutiveUpdateSegment[]; visibleCharacters: number }) {
  let remaining = visibleCharacters;
  return segments.map((segment, index) => {
    if (remaining <= 0) return null;
    const text = segment.text.slice(0, remaining);
    remaining -= segment.text.length;
    if (segment.accent) return <strong key={index} className="font-semibold text-[#0f795f]">{text}</strong>;
    return segment.strong
      ? <strong key={index} className="font-semibold text-[#183f34]">{text}</strong>
      : <span key={index}>{text}</span>;
  });
}

function buildExecutiveUpdateLines(
  update: ReturnType<typeof buildAdmissionsExecutiveUpdate>,
  today: string,
  scheduledMoveIns: AdmissionsScheduleEvent[]
): ExecutiveUpdateLine[] {
  if (!update) {
    return [{
      key: "summary",
      group: "summary",
      segments: [{ text: "There are no active referrals in the current admissions update." }]
    }];
  }

  const scheduledGroups = groupScheduledClients(
    scheduledMoveIns.map((event) => ({
      name: event.clientName,
      community: event.community,
      plannedAdmissionDate: event.date.slice(0, 10)
    })),
  );
  const pendingCount = update.acceptedClients.filter((client) => !client.plannedAdmissionDate).length;
  const pastPlannedCount = update.acceptedClients.filter((client) => client.plannedAdmissionDate && client.plannedAdmissionDate < today).length;
  const todayGroups = scheduledGroups.filter((group) => group.date === today);
  const futureGroups = scheduledGroups.filter((group) => group.date !== today);
  const lines: ExecutiveUpdateLine[] = [{
    key: "summary",
    group: "summary",
    segments: [
      { text: "Admissions is managing " },
      { text: `${update.total} active ${pluralize("referral", update.total)}`, strong: true },
      { text: update.acceptedClients.length ? ". Of those, " : "." },
      ...(update.acceptedClients.length ? [
        { text: `${update.acceptedClients.length} have been accepted`, strong: true },
        { text: "." }
      ] : [])
    ]
  }];
  if (todayGroups.length) {
    const todayClients = flattenScheduledClients(todayGroups);
    const onlyTodayClient = todayClients[0]!;
    lines.push({
      key: `scheduled:${today}|today`,
      group: "scheduled",
      segments: todayClients.length === 1
        ? [
            { text: onlyTodayClient.name, strong: true },
            { text: " is scheduled for " },
            { text: onlyTodayClient.community, accent: true },
            { text: " today." }
          ]
        : [
            { text: "Today's scheduled move-ins are " },
            ...buildClientDestinationSegments(todayClients),
            { text: "." }
          ]
    });
  }

  if (futureGroups.length) {
    const firstFutureGroup = futureGroups[0]!;
    const nextDate = firstFutureGroup.date ?? today;
    const nextDateGroups = futureGroups.filter((group) => group.date === nextDate);
    const firstNextDateGroup = nextDateGroups[0] ?? firstFutureGroup;
    const laterGroups = futureGroups.filter((group) => group.date !== nextDate);
    const nextClients = flattenScheduledClients(nextDateGroups);
    const onlyNextClient = nextClients[0]!;
    const laterCount = laterGroups.reduce((total, group) => total + group.names.length, 0);
    const lastScheduledLabel = futureGroups.at(-1)?.label ?? firstNextDateGroup.label;
    const segments: ExecutiveUpdateSegment[] = nextClients.length === 1
      ? [
          { text: onlyNextClient.name, strong: true },
          { text: " is scheduled for " },
          { text: onlyNextClient.community, accent: true },
          { text: ` on ${firstNextDateGroup.label}` }
        ]
      : [
          { text: `The next scheduled move-ins, on ${firstNextDateGroup.label}, are ` },
          ...buildClientDestinationSegments(nextClients)
        ];
    if (laterCount) {
      segments.push({ text: `, followed by ${laterCount} additional ${pluralize("move-in", laterCount)} through ${lastScheduledLabel}` });
    }
    segments.push({ text: "." });
    lines.push({ key: `scheduled:${nextDate}|future`, group: "scheduled", segments });
  }

  if (pendingCount || pastPlannedCount) {
    const segments: ExecutiveUpdateSegment[] = [];
    if (pendingCount) {
      segments.push(
        { text: `${pendingCount} accepted ${pluralize("client", pendingCount)}`, strong: true },
        { text: ` still ${pendingCount === 1 ? "needs" : "need"} an admission date.` }
      );
    }
    if (pastPlannedCount) {
      if (pendingCount) segments.push({ text: " " });
      segments.push(
        { text: `${pastPlannedCount} past-dated ${pluralize("acceptance", pastPlannedCount)}`, strong: true },
        { text: ` ${pastPlannedCount === 1 ? "needs" : "need"} move-in outcome confirmation.` }
      );
    }
    lines.push({
      key: "pending:accepted-follow-up",
      group: "pending",
      segments
    });
  }
  if (update.busiest.length) {
    const [leader, runnerUp] = update.busiest;
    lines.push({
      key: "pipeline:load",
      group: "pipeline",
      segments: [
        { text: leader?.name ?? "The leading community", accent: true },
        { text: " has the largest active workload" },
        { text: ` with ${leader?.count ?? 0} ${pluralize("referral", leader?.count ?? 0)}` },
        ...(runnerUp ? [{ text: ", followed by " }, { text: runnerUp.name, accent: true }, { text: ` with ${runnerUp.count}` }] : []),
        { text: ". Pipeline status: " },
        { text: `${update.received} new ${pluralize("referral", update.received)}`, strong: true },
        { text: ", " },
        { text: `${update.inProgress} in assessment or review`, strong: true },
        { text: ", and " },
        { text: `${update.decision} at decision`, strong: true },
        { text: "." }
      ]
    });
  }
  return lines;
}

function groupScheduledClients(clients: Array<{ name: string; community: string; plannedAdmissionDate: string | null }>) {
  const groups = new Map<string, { key: string; date: string | null; label: string; community: string; names: string[] }>();
  for (const client of clients) {
    const dateKey = client.plannedAdmissionDate ?? "";
    const key = `${dateKey}|${client.community}`;
    const current = groups.get(key) ?? {
      key,
      date: client.plannedAdmissionDate,
      label: formatEventDate(dateKey),
      community: client.community,
      names: []
    };
    current.names.push(client.name);
    groups.set(key, current);
  }
  return [...groups.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function flattenScheduledClients(groups: Array<{ community: string; names: string[] }>) {
  return groups.flatMap((group) => group.names.map((name) => ({ name, community: group.community })));
}

function buildClientDestinationSegments(clients: Array<{ name: string; community: string }>): ExecutiveUpdateSegment[] {
  const segments: ExecutiveUpdateSegment[] = [];
  clients.forEach((client, index) => {
    if (index) segments.push({ text: index === clients.length - 1 ? (clients.length === 2 ? " and " : ", and ") : ", " });
    segments.push(
      { text: client.name, strong: true },
      { text: " to " },
      { text: client.community, accent: true }
    );
  });
  return segments;
}

function admissionsToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function isCurrentOrFutureEvent(value: string, today: string) {
  return value.slice(0, 10) >= today;
}

function buildAdmissionsExecutiveUpdate(pipeline: ConnectedAdmissionsPipeline) {
  const activeCards = pipeline.board.cards.filter((card) => !isDeclinedReferral(card.status));
  const total = pipeline.metrics.activeReferrals;
  if (!total) return null;

  const received = activeCards.filter((card) => card.column === "received").length;
  const inProgress = activeCards.filter((card) => card.column === "in_progress").length;
  const decision = activeCards.filter((card) => card.column === "decision").length;
  const acceptedClients = activeCards
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
  for (const card of activeCards) {
    const community = card.facilityId ? card.community : "No community assigned";
    communityCounts.set(community, (communityCounts.get(community) ?? 0) + 1);
  }
  const busiest = [...communityCounts.entries()]
    .sort(([leftName, leftCount], [rightName, rightCount]) => rightCount - leftCount || leftName.localeCompare(rightName))
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  return { total, received, inProgress, decision, acceptedClients, busiest };
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

function AdmissionsBriefingDashboard({
  dashboard,
  pipeline,
  scheduledMoveIns,
  onOpenCard,
  loading
}: {
  dashboard: AdmissionsDashboardResponse | null;
  pipeline: ConnectedAdmissionsPipeline | null;
  scheduledMoveIns: AdmissionsScheduleEvent[];
  onOpenCard: (card: AdmissionsBoardCard) => void;
  loading: boolean;
}) {
  const [briefingPage, setBriefingPage] = useState<"schedule" | "communities" | "followup">("schedule");
  if (loading) {
    return (
      <div aria-label="Loading Admissions briefing" aria-busy="true" className="grid gap-4 lg:grid-cols-12">
        <div className="h-60 animate-pulse rounded-2xl bg-[#f1f4f2] lg:col-span-12" />
        <div className="h-80 animate-pulse rounded-2xl bg-[#f7f8f7] lg:col-span-7" />
        <div className="h-80 animate-pulse rounded-2xl bg-[#f7f8f7] lg:col-span-5" />
      </div>
    );
  }
  if (!dashboard?.briefing) {
    return <p className="rounded-2xl border border-[#dfe3e1] bg-white px-5 py-12 text-center text-[13px] text-[#69716c]">The weekly briefing is not available in the current snapshot.</p>;
  }
  const { briefing } = dashboard;
  const today = admissionsToday();
  const awaitingSchedule = pipeline?.board.cards.filter((card) => isAcceptedReferral(card.status) && !card.plannedAdmissionDate) ?? [];
  const followUpItems = buildAdmissionsFollowUpItems(pipeline);
  const assessmentCount = briefing.coverage.assessments
    ? briefing.upcomingAssessments.filter((item) => isCurrentOrFutureEvent(item.scheduledAt, today)).length
    : null;
  const moveInCount = scheduledMoveIns.length;
  const moveInCoverage = pipeline != null || briefing.coverage.moveIns;
  const unavailableCoverage = [
    !briefing.coverage.recentReferrals ? "new referral counts" : null,
    !briefing.coverage.assessments ? "assessment schedule" : null,
    !moveInCoverage ? "move-in schedule" : null
  ].filter((value): value is string => Boolean(value));
  const scheduleCoverageAvailable = assessmentCount != null || moveInCoverage;
  const hasScheduleContent = (assessmentCount ?? 0) + moveInCount + (pipeline ? awaitingSchedule.length : 0) > 0;
  const communityCount = briefing.communities.filter((community) =>
    community.census != null && !/unassigned|no community/i.test(`${community.shortName} ${community.communityName}`)
  ).length;
  const pages = [
    ...(hasScheduleContent ? [{
      key: "schedule" as const,
      label: "Schedule",
      detail: scheduleCoverageAvailable
        ? `${formatBriefingCount(assessmentCount)} assessments · ${formatBriefingCount(moveInCount)} move-ins`
        : "Schedule coverage unavailable",
      icon: CalendarDays
    }] : []),
    {
      key: "communities" as const,
      label: "Communities",
      detail: `${communityCount} locations · ${formatBriefingCount(briefing.totals.census)} residents`,
      icon: Building2
    },
    ...(followUpItems.length ? [{
      key: "followup" as const,
      label: "Open fields",
      detail: `${followUpItems.length} records with unresolved fields`,
      icon: ClipboardList
    }] : [])
  ];
  const activeBriefingPage = pages.some((page) => page.key === briefingPage) ? briefingPage : (pages[0]?.key ?? "communities");

  return (
    <section data-admissions-weekly-briefing="true" aria-label="Admissions operating snapshot">
      {briefing.sourceStatus !== "ready" || unavailableCoverage.length ? (
        <div data-admissions-briefing-source-notice="true" role="status" className="mb-5 rounded-2xl border border-[#dfd4bc] bg-[#fffaf0] px-5 py-4 text-[#675630] sm:flex sm:items-baseline sm:gap-3 sm:px-6">
          <strong className="block text-[13px] font-semibold sm:shrink-0 sm:text-[14px]">Partial admissions snapshot</strong>
          <p className="mt-1 text-[13px] leading-5 sm:mt-0 sm:text-[14px]">
            {unavailableCoverage.length
              ? `${joinReadableList(unavailableCoverage)} ${unavailableCoverage.length === 1 ? "was" : "were"} not published and ${unavailableCoverage.length === 1 ? "is" : "are"} shown as unavailable. Census and connected Pipeline values remain available.`
              : "The detailed admissions briefing feed is unavailable. Census and connected Pipeline values remain available."}
          </p>
        </div>
      ) : null}

      <div data-admissions-briefing-dashboard="true">
        <nav aria-label="Admissions dashboard sections" data-admissions-briefing-navigation="true" className="mb-5">
          <div role="tablist" className={`grid gap-1 rounded-[16px] border border-[#e2ded6] bg-[#f3f0eb] p-1 sm:gap-2 sm:rounded-[20px] sm:p-2 ${pages.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {pages.map((page) => {
              const Icon = page.icon;
                  const active = activeBriefingPage === page.key;
              return (
                <button
                  key={page.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`admissions-dashboard-${page.key}`}
                  onClick={() => setBriefingPage(page.key)}
                  className={`flex min-h-[52px] min-w-0 items-center justify-center gap-3 rounded-[11px] border px-1.5 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] sm:min-h-[78px] sm:justify-start sm:rounded-[14px] sm:px-5 sm:py-3 ${dashboardPageTone(page.key, active)}`}
                >
                  <Icon className={`hidden h-5 w-5 shrink-0 sm:block ${active ? dashboardPageIconTone(page.key) : "text-[#817f7a]"}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span data-admissions-dashboard-label="true" className="block text-center text-[13px] font-semibold leading-4 tracking-[-0.01em] sm:truncate sm:text-left sm:text-[17px] sm:leading-normal">{page.label}</span>
                    <span className="mt-0.5 hidden truncate text-[12px] font-normal text-[#6f7471] sm:block">{page.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {activeBriefingPage === "schedule" ? (
          <div id="admissions-dashboard-schedule" role="tabpanel" aria-label="Admissions schedule dashboard" data-admissions-dashboard-page="schedule">
          <AdmissionsSchedule
            briefing={briefing}
            pipeline={pipeline}
            moveIns={scheduledMoveIns}
            moveInCoverage={moveInCoverage}
            awaitingSchedule={awaitingSchedule}
            today={today}
            onOpenCard={onOpenCard}
          />
          </div>
        ) : null}
        {activeBriefingPage === "communities" ? (
          <div id="admissions-dashboard-communities" role="tabpanel" aria-label="Community dashboard" data-admissions-dashboard-page="communities">
          <BriefingCommunityDashboard briefing={briefing} pipeline={pipeline} scheduledMoveIns={scheduledMoveIns} today={today} onOpenCard={onOpenCard} />
          </div>
        ) : null}
        {activeBriefingPage === "followup" && followUpItems.length ? (
          <div id="admissions-dashboard-followup" role="tabpanel" aria-label="Admissions open fields" data-admissions-dashboard-page="followup">
            <AdmissionsFollowUp items={followUpItems} onOpenCard={onOpenCard} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function dashboardPageTone(page: "schedule" | "communities" | "followup", active: boolean) {
  if (page === "schedule") {
    return active
      ? "border-[#c8d7e6] bg-[#edf4fa] text-[#315a7d] shadow-[0_4px_16px_rgba(64,98,130,0.10)]"
      : "border-transparent bg-transparent text-[#686b69] hover:border-[#d4dfe9] hover:bg-[#f2f6fa] hover:text-[#3f6484]";
  }
  if (page === "communities") {
    return active
      ? "border-[#c8dbd4] bg-[#edf6f2] text-[#27584a] shadow-[0_4px_16px_rgba(50,91,76,0.10)]"
      : "border-transparent bg-transparent text-[#686b69] hover:border-[#d1dfda] hover:bg-[#f1f6f3] hover:text-[#365f52]";
  }
  return active
    ? "border-[#ead8ae] bg-[#fff6e4] text-[#76561c] shadow-[0_4px_16px_rgba(115,84,30,0.10)]"
    : "border-transparent bg-transparent text-[#686b69] hover:border-[#eadfc8] hover:bg-[#fbf6ea] hover:text-[#765f34]";
}

function dashboardPageIconTone(page: "schedule" | "communities" | "followup") {
  if (page === "schedule") return "text-[#47749a]";
  if (page === "communities") return "text-[#33705d]";
  return "text-[#9a6b17]";
}

type AdmissionsFollowUpItem = {
  card: AdmissionsBoardCard;
  issues: string[];
};

function AdmissionsSchedule({
  briefing,
  pipeline,
  moveIns,
  moveInCoverage,
  awaitingSchedule,
  today,
  onOpenCard
}: {
  briefing: AdmissionsDashboardResponse["briefing"];
  pipeline: ConnectedAdmissionsPipeline | null;
  moveIns: AdmissionsScheduleEvent[];
  moveInCoverage: boolean;
  awaitingSchedule: AdmissionsBoardCard[];
  today: string;
  onOpenCard: (card: AdmissionsBoardCard) => void;
}) {
  const assessments: AdmissionsScheduleEvent[] = briefing.coverage.assessments
    ? briefing.upcomingAssessments.filter((item) => isCurrentOrFutureEvent(item.scheduledAt, today)).map((item) => ({
      key: `assessment:${item.referralId}:${item.scheduledAt}`,
      referralId: item.referralId,
      kind: "Assessment" as const,
      date: item.scheduledAt,
      clientName: item.clientName,
      community: item.facilityId ? item.community : "Community not assigned",
      facilityId: item.facilityId,
      owner: item.owner,
      detail: item.status
    }))
    : [];
  const events = [...assessments, ...moveIns]
    .sort((left, right) => left.date.localeCompare(right.date) || left.clientName.localeCompare(right.clientName));
  const scheduleDays = buildScheduleWeek(today, events.map((event) => event.date));
  const scheduleCoverageAvailable = briefing.coverage.assessments || moveInCoverage;
  const scheduleHeadline = scheduleCoverageAvailable
    ? `${assessments.length} upcoming ${pluralize("assessment", assessments.length)} and ${moveIns.length} planned ${pluralize("move-in", moveIns.length)}.${pipeline && awaitingSchedule.length ? ` ${awaitingSchedule.length} accepted ${pluralize("client", awaitingSchedule.length)} ${awaitingSchedule.length === 1 ? "still needs" : "still need"} a date.` : ""}`
    : "Assessment and move-in schedules are not included in the current snapshot.";

  return (
    <section data-admissions-schedule="true" className="overflow-hidden rounded-[24px] border border-[#c8d6e4] border-t-[4px] border-t-[#789ab8] bg-[#f8fafc] shadow-[0_12px_32px_rgba(50,75,105,0.08)]" aria-labelledby="admissions-schedule-title">
      <div className="flex items-center justify-between gap-4 border-b border-[#d8e1eb] bg-[linear-gradient(110deg,#edf5fb_0%,#faf6ee_100%)] px-5 py-5 sm:px-7 sm:py-6">
        <div>
          <h3 id="admissions-schedule-title" className="text-[22px] font-semibold tracking-[-0.03em] text-[#263c35] sm:text-[25px]">Admissions schedule</h3>
          <p className="mt-1 max-w-[900px] text-[14px] font-medium leading-6 text-[#50645f] sm:text-[16px]">{scheduleHeadline}</p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#cddbeb] bg-[#f7fbff]"><CalendarDays className="h-5 w-5 text-[#467299]" aria-hidden="true" /></span>
      </div>

      {scheduleCoverageAvailable ? (
        <div data-admissions-schedule-week="true" className="border-b border-[#dbe3eb] bg-[#eef4f9] bg-[linear-gradient(to_right,rgba(196,211,224,0.38)_1px,transparent_1px)] [background-size:calc(100%/7)_100%] px-4 py-4 sm:px-7 sm:py-5">
          <div className="mb-3 flex items-center justify-between gap-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#587087]">Next seven days</p>
            <p className="text-[12px] text-[#657687]">{events.length} scheduled</p>
          </div>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
            {scheduleDays.map((day) => (
              <div key={day.isoDate} className={`min-w-0 rounded-lg border px-1 py-2.5 text-center sm:px-2 sm:py-3 ${day.eventCount ? "border-[#abc3d8] bg-white shadow-[0_4px_12px_rgba(58,91,121,0.08)]" : "border-[#d7e1e9] bg-[#f8fafc]"}`}>
                <span className="block truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-[#677887] sm:text-[10px]">{day.weekday}</span>
                <strong className={`mt-1 block text-[17px] font-semibold leading-none tabular-nums sm:text-[20px] ${day.eventCount ? "text-[#315f86]" : "text-[#65717a]"}`}>{day.dayNumber}</strong>
                <span className={`mx-auto mt-2 block h-1.5 rounded-full ${day.eventCount ? "w-5 bg-[#5f89ac]" : "w-1.5 bg-[#c5d0d8]"}`} aria-label={`${day.eventCount} scheduled ${pluralize("event", day.eventCount)}`} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p data-admissions-schedule-coverage="unavailable" className="border-b border-[#dbe3eb] bg-[#f2f6f9] px-5 py-4 text-[13px] leading-5 text-[#5f7180] sm:px-7 sm:text-[14px]">
          Schedule coverage is unavailable. The lanes below identify the unpublished sources; no missing schedule is presented as zero.
        </p>
      )}

      <div className="grid divide-y divide-[#dce3e8] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <AdmissionsScheduleLane
          kind="Assessment"
          events={assessments}
          coverage={briefing.coverage.assessments}
          pipeline={pipeline}
          onOpenCard={onOpenCard}
        />
        <AdmissionsScheduleLane
          kind="Move-in"
          events={moveIns}
          coverage={moveInCoverage}
          pipeline={pipeline}
          onOpenCard={onOpenCard}
        />
        <section data-admissions-schedule-lane="accepted-no-date" className="bg-[#fdfaf3]">
          <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <h4 className="flex items-center gap-2 text-[12px] font-semibold text-[#5d5548]"><Clock3 className="h-4 w-4 text-[#9a7441]" aria-hidden="true" />Accepted, no date</h4>
            <span className="text-[12px] font-medium tabular-nums text-[#766d5c]">{pipeline ? awaitingSchedule.length : "—"}</span>
          </div>
          {awaitingSchedule.length ? (
            <div className="divide-y divide-[#e9e2d5] border-t border-[#e9e2d5]">
              {awaitingSchedule.map((card) => (
                <button key={card.referralId} type="button" onClick={() => onOpenCard(card)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-[#faf4e9] sm:px-6">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-[#343a36]">{card.clientName}</span>
                    <span className="mt-1 block truncate text-[12px] text-[#756d60]">{card.facilityId ? card.community : "Community not assigned"} · {card.owner}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#8e8370]" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <p className="border-t border-[#e9e2d5] px-5 py-6 text-[13px] leading-5 text-[#746b5c] sm:px-6">
              {pipeline ? "No accepted client is currently missing an admission date." : "Available when the live Pipeline board is connected."}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}

function AdmissionsScheduleLane({
  kind,
  events,
  coverage,
  pipeline,
  onOpenCard
}: {
  kind: "Assessment" | "Move-in";
  events: AdmissionsScheduleEvent[];
  coverage: boolean;
  pipeline: ConnectedAdmissionsPipeline | null;
  onOpenCard: (card: AdmissionsBoardCard) => void;
}) {
  const LaneIcon = kind === "Assessment" ? ClipboardList : House;
  const tone = kind === "Assessment"
    ? { background: "bg-[#f8faff]", border: "border-[#dce4f0]", icon: "text-[#4f73a1]", hover: "hover:bg-[#f1f5fb]" }
    : { background: "bg-[#f6faf7]", border: "border-[#d9e6df]", icon: "text-[#3f7966]", hover: "hover:bg-[#eff6f2]" };
  return (
    <section data-admissions-schedule-lane={kind.toLowerCase()} className={tone.background}>
      <div className="flex min-h-12 items-center justify-between gap-4 px-5 py-3.5 sm:px-6 sm:py-4">
        <h4 className="flex items-center gap-2 text-[12px] font-semibold text-[#40514b]"><LaneIcon className={`h-4 w-4 ${tone.icon}`} aria-hidden="true" />{kind === "Assessment" ? "Upcoming assessments" : "Planned move-ins"}</h4>
        <span className="text-[12px] font-medium tabular-nums text-[#66736e]">
          <span className="sm:hidden">{coverage ? (events.length || "None") : "—"}</span>
          <span className="hidden sm:inline">{coverage ? events.length : "—"}</span>
        </span>
      </div>
      {events.length ? (
        <div className={`divide-y ${tone.border} border-t ${tone.border}`}>
          {events.map((event) => {
            const card = pipeline?.board.cards.find((candidate) => candidate.referralId === event.referralId) ?? null;
            return (
              <button
                key={event.key}
                type="button"
                data-admissions-schedule-item={event.kind.toLowerCase()}
                data-admissions-event-date={event.date.slice(0, 10)}
                disabled={!card}
                onClick={() => card && onOpenCard(card)}
                className={`flex min-h-16 w-full items-start gap-3 px-5 py-3.5 text-left transition disabled:cursor-default sm:items-center sm:px-6 sm:py-4 ${tone.hover}`}
              >
                <time className={`w-[62px] shrink-0 pt-0.5 text-[12px] font-semibold leading-5 tabular-nums sm:w-[78px] sm:pt-0 ${tone.icon}`}>{formatEventDate(event.date)}</time>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-[#2f3c37]">{event.clientName}</span>
                  <span className="mt-1 block break-words text-[11px] leading-4 text-[#727d77] sm:truncate">{event.community} · {event.owner} · {event.detail}</span>
                </span>
                {card ? <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#7d8782] sm:mt-0" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className={`hidden border-t ${tone.border} px-5 py-6 text-[13px] leading-5 text-[#6d7872] sm:block sm:px-6`}>
          {coverage ? `No ${kind === "Assessment" ? "assessments" : "move-ins"} are scheduled in the current window.` : `${kind} schedule coverage was not published.`}
        </p>
      )}
    </section>
  );
}

function buildScheduleWeek(today: string, eventDates: string[]) {
  const [year = 1970, month = 1, day = 1] = today.split("-").map(Number);
  const baseDate = new Date(Date.UTC(year, month - 1, day));
  const counts = eventDates.reduce((result, value) => {
    const isoDate = value.slice(0, 10);
    result.set(isoDate, (result.get(isoDate) ?? 0) + 1);
    return result;
  }, new Map<string, number>());

  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(baseDate);
    date.setUTCDate(baseDate.getUTCDate() + offset);
    const isoDate = date.toISOString().slice(0, 10);
    return {
      isoDate,
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date),
      dayNumber: date.getUTCDate(),
      eventCount: counts.get(isoDate) ?? 0
    };
  });
}

function buildAdmissionsFollowUpItems(pipeline: ConnectedAdmissionsPipeline | null): AdmissionsFollowUpItem[] {
  if (!pipeline) return [];
  return pipeline.board.cards
    .filter((card) => !isDeclinedReferral(card.status))
    .map((card) => {
      const issues: string[] = [];
      if (card.flags.moveInOverdue) {
        issues.push("Planned admission date has passed; outcome is not recorded");
      }
      if (card.managementProfile.blockingRequirements > 0) {
        issues.push(`${card.managementProfile.blockingRequirements} ${pluralize("requirement", card.managementProfile.blockingRequirements)} marked blocking`);
      }
      if (card.flags.unassigned) {
        issues.push("Destination community is not recorded");
      }
      if (card.flags.stale) {
        issues.push(`Last update was ${card.daysSinceUpdate} days ago`);
      }
      return { card, issues };
    })
    .filter((item) => item.issues.length > 0);
}

function AdmissionsFollowUp({ items, onOpenCard }: { items: AdmissionsFollowUpItem[]; onOpenCard: (card: AdmissionsBoardCard) => void }) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const visibleItems = items.slice(0, 8);
  const mobilePreviewCount = Math.min(5, visibleItems.length);
  return (
    <section data-admissions-follow-up="true" className="overflow-hidden rounded-[24px] border border-[#ded9cf] border-t-[4px] border-t-[#a89675] bg-[#fffdf9] shadow-[0_12px_32px_rgba(74,64,46,0.07)]" aria-labelledby="admissions-follow-up-title">
      <div className="flex items-center justify-between gap-4 border-b border-[#e8e2d7] bg-[linear-gradient(110deg,#f7f3eb_0%,#fbfaf7_100%)] px-5 py-5 sm:px-7 sm:py-6">
        <div>
          <h3 id="admissions-follow-up-title" className="flex items-center gap-3 text-[22px] font-semibold tracking-[-0.03em] text-[#464038] sm:text-[25px]"><span className="grid h-10 w-10 place-items-center rounded-xl border border-[#ded6c7] bg-white/80"><ClipboardList className="h-5 w-5 text-[#75664f]" aria-hidden="true" /></span>Open fields</h3>
          <p className="mt-1 text-[13px] leading-5 text-[#71695d] sm:text-[14px]">Missing or unresolved fields already present in the admissions record, shown in Pipeline order.</p>
        </div>
        <span className="shrink-0 rounded-full border border-[#ded6c7] bg-white/80 px-3 py-1.5 text-[13px] font-semibold tabular-nums text-[#625746]">{items.length} records</span>
      </div>
      <div className="divide-y divide-[#ebe6dc]">
        {visibleItems.map(({ card, issues }, index) => (
          <button key={card.referralId} type="button" onClick={() => onOpenCard(card)} className={`${index >= mobilePreviewCount && !mobileExpanded ? "hidden sm:grid" : "grid"} w-full min-w-0 gap-1.5 px-5 py-4 text-left transition hover:bg-[#faf7f1] sm:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.25fr)_auto] sm:items-center sm:gap-5 sm:px-7 sm:py-5`}>
            <span className="truncate text-[15px] font-semibold text-[#3e3b35] sm:text-[16px]">{card.clientName}<span className="font-normal text-[#746f65]"> · {card.facilityId ? card.community : "Community not recorded"}</span></span>
            <span className="text-[13px] leading-5 text-[#635c51] sm:text-[14px]">{issues.join(" · ")}</span>
            <ChevronRight className="hidden h-5 w-5 text-[#918878] sm:block" aria-hidden="true" />
          </button>
        ))}
      </div>
      {visibleItems.length > mobilePreviewCount ? (
        <button type="button" onClick={() => setMobileExpanded((value) => !value)} className="min-h-11 w-full border-t border-[#ebe6dc] px-5 text-left text-[12px] font-semibold text-[#705f43] sm:hidden">
          {mobileExpanded ? "Show fewer records" : `Show ${visibleItems.length - mobilePreviewCount} more records`}
        </button>
      ) : null}
      {items.length > visibleItems.length ? <p className="border-t border-[#ebe6dc] px-5 py-3 text-[12px] text-[#756e62] sm:px-7">Showing the first <span className="sm:hidden">{mobileExpanded ? visibleItems.length : mobilePreviewCount}</span><span className="hidden sm:inline">{visibleItems.length}</span> records in Pipeline order. The complete queue remains in Pipeline.</p> : null}
    </section>
  );
}

function BriefingCommunityDashboard({
  briefing,
  pipeline,
  scheduledMoveIns,
  today,
  onOpenCard
}: {
  briefing: AdmissionsDashboardResponse["briefing"];
  pipeline: ConnectedAdmissionsPipeline | null;
  scheduledMoveIns: AdmissionsScheduleEvent[];
  today: string;
  onOpenCard: (card: AdmissionsBoardCard) => void;
}) {
  const [expandedFacilityId, setExpandedFacilityId] = useState<string | null>(null);
  const upcomingAssessments = briefing.upcomingAssessments.filter((item) => isCurrentOrFutureEvent(item.scheduledAt, today));
  const moveInCoverage = pipeline != null || briefing.coverage.moveIns;
  const assignedCommunities = briefing.communities.filter((community) =>
    community.census != null && !/unassigned|no community/i.test(`${community.shortName} ${community.communityName}`)
  );
  const unassignedActivity = briefing.communities
    .filter((community) => !assignedCommunities.includes(community))
    .reduce((total, community) => total + (community.newReferrals7d ?? 0), 0);

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#cadbd4] border-t-[4px] border-t-[#789b8e] bg-white shadow-[0_12px_32px_rgba(37,77,64,0.08)]" aria-labelledby="admissions-community-dashboard-title">
      <div className="relative flex items-center justify-between gap-4 overflow-hidden border-b border-[#d3e1dc] bg-[linear-gradient(110deg,#ebf5f0_0%,#faf6ed_100%)] px-5 py-5 sm:px-7 sm:py-6">
        <span aria-hidden="true" className="absolute -right-12 -top-24 h-52 w-52 rounded-full border-[30px] border-[#d7e7df]/60" />
        <span aria-hidden="true" className="absolute right-32 top-3 h-16 w-16 rounded-full border border-[#bad1c7]/55" />
        <div className="relative z-[1]">
          <h3 id="admissions-community-dashboard-title" className="text-[22px] font-semibold tracking-[-0.03em] text-[#263c35] sm:text-[25px]">Community snapshot</h3>
          <p className="mt-1 text-[13px] leading-5 text-[#6d7872] sm:text-[14px]">Current residents, upcoming admits, and new referrals by community.</p>
        </div>
        <p className="relative z-[1] text-right text-[11px] font-semibold uppercase tracking-[0.09em] text-[#6d7872]"><strong className="block text-[30px] font-semibold leading-none tracking-[-0.05em] text-[#183f34] sm:text-[34px]">{formatBriefingCount(briefing.totals.census)}</strong><span className="mt-1 block">total residents</span></p>
      </div>
      <div className="hidden grid-cols-[minmax(220px,1fr)_130px_180px_190px] gap-5 border-b border-[#e5e9e7] bg-[#f6f4ef] px-7 py-3 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#747e79] sm:grid">
        <span>Community</span>
        <span className="text-right">Census</span>
        <span className="text-right">Upcoming admits</span>
        <span className="text-right">New referrals · 7 days</span>
      </div>
      <div className="divide-y divide-[#e5e9e7]">
        {assignedCommunities.map((community, communityIndex) => {
          const expanded = expandedFacilityId === community.facilityId;
          const communityCards = pipeline?.board.cards.filter((card) => card.facilityId === community.facilityId) ?? [];
          const upcomingAdmits = moveInCoverage
            ? scheduledMoveIns.filter((item) => item.facilityId === community.facilityId).length
            : null;
          return (
            <div key={community.facilityId} data-admissions-briefing-community={community.facilityId} className={communityIndex % 2 === 1 ? "bg-[#fcfbf8]" : "bg-white"}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedFacilityId((current) => current === community.facilityId ? null : community.facilityId)}
                className="w-full px-5 py-4 text-left transition hover:bg-[#f1f7f4] sm:grid sm:grid-cols-[minmax(220px,1fr)_130px_180px_190px] sm:items-center sm:gap-5 sm:px-7 sm:py-5"
              >
                <div className="flex items-center justify-between gap-4">
                  <h4 className="min-w-0 text-[16px] font-semibold leading-6 text-[#263c35] sm:text-[18px]">{community.shortName}</h4>
                  <div className="flex items-center gap-2">
                    <p data-admissions-community-census="true" className="text-right sm:hidden"><strong className="text-[28px] font-semibold leading-none tracking-[-0.05em] text-[#183f34]">{formatBriefingCount(community.census)}</strong><span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#717b76]">census</span></p>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-[#74807a] transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                  </div>
                </div>
                <p data-admissions-community-census="true" className="hidden text-right sm:block"><strong className="text-[26px] font-semibold tabular-nums tracking-[-0.03em] text-[#183f34]">{formatBriefingCount(community.census)}</strong></p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:contents">
                  <p data-admissions-community-upcoming-admits="true" className="rounded-xl bg-[#f1f5fa] px-3 py-2 text-[12px] text-[#627181] sm:bg-transparent sm:px-0 sm:py-0 sm:text-right"><span className="block text-[9px] font-semibold uppercase tracking-[0.09em] sm:hidden">Upcoming admits</span><strong className="text-[21px] font-semibold tabular-nums text-[#416b90] sm:text-[22px]">{formatBriefingCount(upcomingAdmits)}</strong><span className="ml-1.5 sm:hidden">scheduled</span></p>
                  <p data-admissions-community-referrals="true" className="rounded-xl bg-[#fbf4e9] px-3 py-2 text-[12px] text-[#7a6a57] sm:bg-transparent sm:px-0 sm:py-0 sm:text-right"><span className="block text-[9px] font-semibold uppercase tracking-[0.09em] sm:hidden">New referrals</span><strong className="text-[21px] font-semibold tabular-nums text-[#906633] sm:text-[22px]">{formatBriefingCount(community.newReferrals7d)}</strong><span className="ml-1.5 sm:hidden">last 7 days</span></p>
                </div>
              </button>
              {expanded ? (
                <CommunityAdmissionsDetail
                  community={community}
                  cards={communityCards}
                  assessments={upcomingAssessments.filter((item) => item.facilityId === community.facilityId)}
                  moveIns={scheduledMoveIns.filter((item) => item.facilityId === community.facilityId)}
                  assessmentCoverage={briefing.coverage.assessments}
                  moveInCoverage={moveInCoverage}
                  onOpenCard={onOpenCard}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {unassignedActivity > 0 ? (
        <p data-admissions-unassigned-footnote="true" className="border-t border-[#e5e9e7] bg-[#fbfcfb] px-5 py-3 text-[12px] leading-5 text-[#68736d] sm:px-7">
          {unassignedActivity} recent {pluralize("referral", unassignedActivity)} {unassignedActivity === 1 ? "has" : "have"} not yet been assigned to a community and {unassignedActivity === 1 ? "is" : "are"} omitted here.
        </p>
      ) : null}
    </section>
  );
}

function CommunityAdmissionsDetail({
  community,
  cards,
  assessments,
  moveIns,
  assessmentCoverage,
  moveInCoverage,
  onOpenCard
}: {
  community: AdmissionsDashboardResponse["briefing"]["communities"][number];
  cards: AdmissionsBoardCard[];
  assessments: AdmissionsDashboardResponse["briefing"]["upcomingAssessments"];
  moveIns: AdmissionsScheduleEvent[];
  assessmentCoverage: boolean;
  moveInCoverage: boolean;
  onOpenCard: (card: AdmissionsBoardCard) => void;
}) {
  const stageCounts = {
    received: cards.filter((card) => card.column === "received").length,
    inProgress: cards.filter((card) => card.column === "in_progress").length,
    decision: cards.filter((card) => card.column === "decision").length
  };
  const activity = [
    ...assessments.map((item) => ({ referralId: item.referralId, key: `assessment:${item.referralId}:${item.scheduledAt}`, kind: "Assessment", date: item.scheduledAt, clientName: item.clientName })),
    ...moveIns.map((item) => ({ referralId: item.referralId, key: item.key, kind: "Move-in", date: item.date, clientName: item.clientName }))
  ].sort((left, right) => left.date.localeCompare(right.date));
  const missingActivitySources = [
    !assessmentCoverage ? "assessment schedule" : null,
    !moveInCoverage ? "move-in schedule" : null
  ].filter((value): value is string => Boolean(value));

  return (
    <div data-admissions-community-detail="true" className="border-t border-[#dfe5e2] bg-[#f2f7f4] bg-[radial-gradient(circle_at_1px_1px,#d8e5df_1px,transparent_0)] [background-size:22px_22px] px-5 py-5 sm:px-7 sm:py-7">
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <section aria-label={`${community.shortName} pipeline detail`}>
          <div className="flex flex-wrap items-center gap-2.5">
            <h5 className="mr-2 text-[15px] font-semibold text-[#29483f]">Active pipeline</h5>
            <CommunityMetric label="New" value={stageCounts.received} />
            <CommunityMetric label="Assessment / review" value={stageCounts.inProgress} />
            <CommunityMetric label="Decision" value={stageCounts.decision} />
            {community.occupancyPct != null ? <CommunityMetric label="Occupied" value={`${community.occupancyPct}%`} /> : null}
          </div>
          {cards.length ? (
            <div className="mt-4 grid gap-x-6 border-t border-[#d8e2dd] sm:grid-cols-2">
              {cards.map((card) => (
                <button key={card.referralId} type="button" onClick={() => onOpenCard(card)} className="flex min-w-0 items-center gap-3 border-b border-[#dde6e1] py-3.5 text-left transition hover:text-[#0f795f]">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[14px] font-semibold text-[#2f3e39] sm:truncate sm:text-[15px]">{card.clientName}</span>
                    <span className="mt-1 block break-words text-[12px] leading-4 text-[#6f7a74] sm:truncate">{card.status} · {card.owner}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[#86908b]" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : <p className="mt-4 border-t border-[#dde5e1] py-5 text-[13px] text-[#6f7974]">No active referrals are assigned to this community.</p>}
        </section>

        <section aria-label={`${community.shortName} upcoming activity`}>
          <h5 className="text-[15px] font-semibold text-[#29483f]">Upcoming activity</h5>
          {activity.length ? (
            <>
              <div className="mt-4 divide-y divide-[#dde6e1] border-y border-[#d8e2dd]">
                {activity.map((item) => {
                  const card = cards.find((candidate) => candidate.referralId === item.referralId) ?? null;
                  return (
                    <button key={item.key} type="button" disabled={!card} onClick={() => card && onOpenCard(card)} className="grid min-h-12 w-full grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 py-3 text-left disabled:cursor-default sm:grid-cols-[82px_minmax(0,1fr)_auto] sm:py-3.5">
                      <time className="text-[12px] font-semibold leading-4 text-[#42675b]">{formatEventDate(item.date)}</time>
                      <span className="break-words text-[13px] leading-5 text-[#33443e] sm:truncate"><strong className="font-semibold">{item.clientName}</strong> · {item.kind}</span>
                      {card ? <ChevronRight className="h-5 w-5 text-[#86908b]" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
              {missingActivitySources.length ? <p className="mt-3 text-[12px] leading-5 text-[#6f7974]">Not included: {joinReadableList(missingActivitySources)}.</p> : null}
            </>
          ) : (
            <p className="mt-4 border-t border-[#dde5e1] py-5 text-[13px] leading-5 text-[#6f7974]">
              {missingActivitySources.length
                ? `${joinReadableList(missingActivitySources)} ${missingActivitySources.length === 1 ? "was" : "were"} not published for this snapshot.`
                : "No assessments or move-ins are currently scheduled here."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function CommunityMetric({ label, value }: { label: string; value: string | number }) {
  return <span className="rounded-full border border-[#d3ded8] bg-white px-3 py-1.5 text-[11px] text-[#5f6d66]"><strong className="mr-1.5 text-[13px] font-semibold text-[#24483d]">{value}</strong>{label}</span>;
}

function formatBriefingCount(value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US");
}

function joinReadableList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function formatEventDate(value: string) {
  const includesTime = value.includes("T");
  const date = new Date(includesTime ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", includesTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }
    : { month: "short", day: "numeric" }).format(date);
}
