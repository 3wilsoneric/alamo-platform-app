import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Building2, CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
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
  const surface = searchParams.get("view") === "briefing" ? "briefing" : "pipeline";

  function showSurface(next: "pipeline" | "briefing") {
    setBriefingCard(null);
    const params = new URLSearchParams(searchParams);
    if (next === "briefing") params.set("view", "briefing");
    else params.delete("view");
    setSearchParams(params, { replace: false });
  }

  return (
    <div
      data-admissions-overview="true"
      className="relative min-h-[calc(100dvh-var(--platform-header-height))] w-full bg-[#fbfaf7] px-3 pb-14 text-[#171918] sm:px-6 lg:px-10"
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
              {pipeline ? <AdmissionsExecutiveUpdate pipeline={pipeline} /> : null}
              <AdmissionsBriefingDashboard
                dashboard={dashboard}
                pipeline={pipeline}
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
    <nav aria-label="Admissions pages" data-admissions-surface-navigation="true" className="border-b border-[#d9dfdb]">
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

function AdmissionsExecutiveUpdate({ pipeline }: { pipeline: ConnectedAdmissionsPipeline }) {
  const update = buildAdmissionsExecutiveUpdate(pipeline);
  const lines = buildExecutiveUpdateLines(update, admissionsToday());
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

function buildExecutiveUpdateLines(update: ReturnType<typeof buildAdmissionsExecutiveUpdate>, today: string): ExecutiveUpdateLine[] {
  if (!update) {
    return [{
      key: "summary",
      group: "summary",
      segments: [{ text: "There are no active referrals in the current admissions update." }]
    }];
  }

  const scheduledGroups = groupScheduledClients(
    update.acceptedClients.filter((client) => client.plannedAdmissionDate && client.plannedAdmissionDate >= today),
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
  onOpenCard,
  loading
}: {
  dashboard: AdmissionsDashboardResponse | null;
  pipeline: ConnectedAdmissionsPipeline | null;
  onOpenCard: (card: AdmissionsBoardCard) => void;
  loading: boolean;
}) {
  const [briefingPage, setBriefingPage] = useState<"movement" | "communities" | "attention">("movement");
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
  const attentionItems = buildAdmissionsAttentionItems(pipeline);
  const scheduledCount = (
    (briefing.coverage.assessments ? briefing.upcomingAssessments.filter((item) => isCurrentOrFutureEvent(item.scheduledAt, today)).length : 0) +
    (briefing.coverage.moveIns ? briefing.plannedMoveIns.filter((item) => isCurrentOrFutureEvent(item.plannedAt, today)).length : 0)
  );
  const communityCount = briefing.communities.filter((community) =>
    community.census != null && !/unassigned|no community/i.test(`${community.shortName} ${community.communityName}`)
  ).length;
  const pages = [
    {
      key: "movement" as const,
      label: "Movement",
      detail: `${scheduledCount} scheduled · ${awaitingSchedule.length} awaiting`,
      icon: CalendarDays
    },
    {
      key: "communities" as const,
      label: "Communities",
      detail: `${communityCount} locations · ${formatBriefingCount(briefing.totals.census)} residents`,
      icon: Building2
    },
    ...(attentionItems.length ? [{
      key: "attention" as const,
      label: "Attention",
      detail: `${attentionItems.length} flagged for review`,
      icon: AlertTriangle
    }] : [])
  ];

  return (
    <section data-admissions-weekly-briefing="true" aria-label="Admissions operating snapshot">
      {briefing.sourceStatus !== "ready" ? (
        <p data-admissions-briefing-source-notice="true" className="mb-5 rounded-2xl border border-[#ead8a9] bg-[#fffaf0] px-5 py-4 text-[13px] leading-6 text-[#75591f] sm:px-6 sm:text-[14px]">
          Census remains governed. Pipeline event sections are marked incomplete where the source has not published coverage; missing data is never shown as zero.
        </p>
      ) : null}

      <div data-admissions-briefing-dashboard="true">
        <nav aria-label="Admissions dashboard sections" data-admissions-briefing-navigation="true" className="mb-5">
          <div role="tablist" className={`grid gap-2 rounded-[20px] border border-[#e2ded6] bg-[#f3f0eb] p-2 ${pages.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {pages.map((page) => {
              const Icon = page.icon;
              const active = briefingPage === page.key;
              return (
                <button
                  key={page.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`admissions-dashboard-${page.key}`}
                  onClick={() => setBriefingPage(page.key)}
                  className={`flex min-h-[68px] min-w-0 items-center justify-center gap-3 rounded-[14px] border px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] sm:min-h-[78px] sm:justify-start sm:px-5 ${dashboardPageTone(page.key, active)}`}
                >
                  <Icon className={`hidden h-5 w-5 shrink-0 sm:block ${active ? dashboardPageIconTone(page.key) : "text-[#817f7a]"}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-center text-[14px] font-semibold tracking-[-0.01em] sm:text-left sm:text-[17px]">{page.label}</span>
                    <span className="mt-0.5 hidden truncate text-[12px] font-normal text-[#6f7471] sm:block">{page.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {briefingPage === "movement" ? (
          <div id="admissions-dashboard-movement" role="tabpanel" aria-label="Admissions movement dashboard" data-admissions-dashboard-page="movement">
          <AdmissionsMovement
            briefing={briefing}
            pipeline={pipeline}
            awaitingSchedule={awaitingSchedule}
            today={today}
            onOpenCard={onOpenCard}
          />
          </div>
        ) : null}
        {briefingPage === "communities" ? (
          <div id="admissions-dashboard-communities" role="tabpanel" aria-label="Community dashboard" data-admissions-dashboard-page="communities">
          <BriefingCommunityDashboard briefing={briefing} pipeline={pipeline} today={today} onOpenCard={onOpenCard} />
          </div>
        ) : null}
        {briefingPage === "attention" && attentionItems.length ? (
          <div id="admissions-dashboard-attention" role="tabpanel" aria-label="Admissions attention dashboard" data-admissions-dashboard-page="attention">
            <AdmissionsAttention items={attentionItems} onOpenCard={onOpenCard} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function dashboardPageTone(page: "movement" | "communities" | "attention", active: boolean) {
  if (page === "movement") {
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

function dashboardPageIconTone(page: "movement" | "communities" | "attention") {
  if (page === "movement") return "text-[#47749a]";
  if (page === "communities") return "text-[#33705d]";
  return "text-[#9a6b17]";
}

type AdmissionsAttentionItem = {
  card: AdmissionsBoardCard;
  issues: string[];
  score: number;
};

function AdmissionsMovement({
  briefing,
  pipeline,
  awaitingSchedule,
  today,
  onOpenCard
}: {
  briefing: AdmissionsDashboardResponse["briefing"];
  pipeline: ConnectedAdmissionsPipeline | null;
  awaitingSchedule: AdmissionsBoardCard[];
  today: string;
  onOpenCard: (card: AdmissionsBoardCard) => void;
}) {
  const events = [
    ...(briefing.coverage.assessments ? briefing.upcomingAssessments.filter((item) => isCurrentOrFutureEvent(item.scheduledAt, today)).map((item) => ({
      key: `assessment:${item.referralId}:${item.scheduledAt}`,
      referralId: item.referralId,
      kind: "Assessment" as const,
      date: item.scheduledAt,
      clientName: item.clientName,
      community: item.facilityId ? item.community : "Community not assigned",
      owner: item.owner,
      detail: item.status
    })) : []),
    ...(briefing.coverage.moveIns ? briefing.plannedMoveIns.filter((item) => isCurrentOrFutureEvent(item.plannedAt, today)).map((item) => ({
      key: `move-in:${item.referralId}:${item.plannedAt}`,
      referralId: item.referralId,
      kind: "Move-in" as const,
      date: item.plannedAt,
      clientName: item.clientName,
      community: item.facilityId ? item.community : "Community not assigned",
      owner: item.owner,
      detail: item.readiness === "unknown" ? item.status : `${item.status} · ${item.readiness}`
    })) : [])
  ].sort((left, right) => left.date.localeCompare(right.date) || left.clientName.localeCompare(right.clientName));

  return (
    <section data-admissions-movement="true" className="overflow-hidden rounded-[24px] border border-[#cfd9e5] bg-white shadow-[0_12px_32px_rgba(50,75,105,0.07)]" aria-labelledby="admissions-movement-title">
      <div className="flex items-center justify-between gap-4 border-b border-[#d8e1eb] bg-[linear-gradient(110deg,#f1f6fb_0%,#f8f5ef_100%)] px-5 py-5 sm:px-7 sm:py-6">
        <div>
          <h3 id="admissions-movement-title" className="text-[22px] font-semibold tracking-[-0.03em] text-[#263c35] sm:text-[25px]">Admissions movement</h3>
          <p className="mt-1 text-[13px] leading-5 text-[#6d7872] sm:text-[14px]">Scheduled activity and accepted clients still waiting for a date.</p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#cddbeb] bg-[#f7fbff]"><CalendarDays className="h-5 w-5 text-[#467299]" aria-hidden="true" /></span>
      </div>

      <div className={`grid ${awaitingSchedule.length ? "lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]" : ""}`}>
        <div className={awaitingSchedule.length ? "lg:border-r lg:border-[#e2e7e4]" : ""}>
          <div className="flex items-center justify-between px-5 py-4 sm:px-7">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#65716b]">On the calendar</h4>
            <span className="text-[13px] font-medium tabular-nums text-[#65716b]">{events.length} scheduled</span>
          </div>
          {events.length ? (
            <div className="divide-y divide-[#e7ebe9] border-t border-[#e7ebe9]">
              {events.map((event) => {
                const card = pipeline?.board.cards.find((candidate) => candidate.referralId === event.referralId) ?? null;
                return (
                  <button
                    key={event.key}
                    type="button"
                    data-admissions-movement-item={event.kind.toLowerCase()}
                    data-admissions-event-date={event.date.slice(0, 10)}
                    disabled={!card}
                    onClick={() => card && onOpenCard(card)}
                    className="grid w-full min-w-0 grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 text-left transition hover:bg-[#f3f7fb] disabled:cursor-default disabled:hover:bg-transparent sm:grid-cols-[118px_104px_minmax(0,1fr)_auto] sm:px-7 sm:py-5"
                  >
                    <time className="text-[13px] font-semibold tabular-nums text-[#3f678b] sm:text-[14px]">{formatEventDate(event.date)}</time>
                    <span className={`hidden w-fit rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] sm:inline-flex ${event.kind === "Move-in" ? "bg-[#e2f1e9] text-[#176d51]" : "bg-[#e8edfb] text-[#365fc7]"}`}>{event.kind}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[16px] font-semibold text-[#273b34] sm:text-[17px]">{event.clientName}<span className="font-normal text-[#68736d]"> · {event.community}</span></span>
                      <span className="mt-1 block truncate text-[12px] text-[#7a847f] sm:text-[13px]">{event.owner} · {event.detail}</span>
                    </span>
                    {card ? <ChevronRight className="h-5 w-5 text-[#7d8782]" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="border-t border-[#e7ebe9] px-5 py-10 text-[15px] text-[#68736d] sm:px-7">Nothing else is scheduled in the current weekly window.</p>
          )}
        </div>

        {awaitingSchedule.length ? (
          <div className="border-t border-[#e2e7e4] bg-[#fdfbf6] lg:border-t-0">
            <div className="flex items-center justify-between px-5 py-4 sm:px-6">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#65716b]">Awaiting scheduling</h4>
              <span className="text-[13px] font-medium tabular-nums text-[#65716b]">{awaitingSchedule.length} accepted</span>
            </div>
            <div className="divide-y divide-[#e7ebe9] border-t border-[#e7ebe9]">
              {awaitingSchedule.map((card) => (
                <button key={card.referralId} type="button" onClick={() => onOpenCard(card)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-[#faf4e9] sm:px-6 sm:py-5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-[#273b34] sm:text-[16px]">{card.clientName}</span>
                    <span className="mt-1 block truncate text-[12px] text-[#737d78]">{card.facilityId ? card.community : "Community not assigned"} · {card.owner}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[#7d8782]" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function buildAdmissionsAttentionItems(pipeline: ConnectedAdmissionsPipeline | null): AdmissionsAttentionItem[] {
  if (!pipeline) return [];
  return pipeline.board.cards
    .map((card) => {
      const issues: string[] = [];
      let score = 0;
      if (card.flags.moveInOverdue) {
        issues.push("Planned move-in is overdue");
        score += 100;
      }
      if (card.managementProfile.blockingRequirements > 0) {
        issues.push(`${card.managementProfile.blockingRequirements} blocking ${pluralize("requirement", card.managementProfile.blockingRequirements)}`);
        score += 80;
      }
      if (card.flags.unassigned) {
        issues.push("Community not assigned");
        score += 60;
      }
      if (card.flags.stale) {
        issues.push(`${card.daysSinceUpdate} days since the last update`);
        score += 40 + card.daysSinceUpdate;
      }
      return { card, issues, score };
    })
    .filter((item) => item.issues.length > 0)
    .sort((left, right) => right.score - left.score || left.card.clientName.localeCompare(right.card.clientName));
}

function AdmissionsAttention({ items, onOpenCard }: { items: AdmissionsAttentionItem[]; onOpenCard: (card: AdmissionsBoardCard) => void }) {
  const visibleItems = items.slice(0, 8);
  return (
    <section data-admissions-attention="true" className="overflow-hidden rounded-[24px] border border-[#e3d8bd] bg-[#fffdf8] shadow-[0_10px_30px_rgba(92,67,22,0.06)]" aria-labelledby="admissions-attention-title">
      <div className="flex items-center justify-between gap-4 border-b border-[#eee5d2] bg-[#fffbf2] px-5 py-5 sm:px-7 sm:py-6">
        <div>
          <h3 id="admissions-attention-title" className="flex items-center gap-3 text-[22px] font-semibold tracking-[-0.03em] text-[#4e4229] sm:text-[25px]"><AlertTriangle className="h-6 w-6 text-[#9a6b17]" aria-hidden="true" />Needs attention</h3>
          <p className="mt-1 text-[13px] leading-5 text-[#786d58] sm:text-[14px]">Recorded blockers, overdue dates, missing assignments, and stale updates.</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#f4e8ca] px-3 py-1.5 text-[13px] font-semibold tabular-nums text-[#76591f]">{items.length} flagged</span>
      </div>
      <div className="divide-y divide-[#eee5d2]">
        {visibleItems.map(({ card, issues }) => (
          <button key={card.referralId} type="button" onClick={() => onOpenCard(card)} className="grid w-full min-w-0 gap-1.5 px-5 py-4 text-left transition hover:bg-[#fff8e9] sm:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.25fr)_auto] sm:items-center sm:gap-5 sm:px-7 sm:py-5">
            <span className="truncate text-[15px] font-semibold text-[#3e392f] sm:text-[16px]">{card.clientName}<span className="font-normal text-[#746b59]"> · {card.facilityId ? card.community : "No community"}</span></span>
            <span className="text-[13px] leading-5 text-[#76591f] sm:text-[14px]">{issues.join(" · ")}</span>
            <ChevronRight className="hidden h-5 w-5 text-[#9b8e73] sm:block" aria-hidden="true" />
          </button>
        ))}
      </div>
      {items.length > visibleItems.length ? <p className="border-t border-[#eee5d2] px-5 py-3 text-[12px] text-[#7e735e] sm:px-7">Showing the {visibleItems.length} highest-priority items. The complete queue remains in Pipeline.</p> : null}
    </section>
  );
}

function BriefingCommunityDashboard({
  briefing,
  pipeline,
  today,
  onOpenCard
}: {
  briefing: AdmissionsDashboardResponse["briefing"];
  pipeline: ConnectedAdmissionsPipeline | null;
  today: string;
  onOpenCard: (card: AdmissionsBoardCard) => void;
}) {
  const [expandedFacilityId, setExpandedFacilityId] = useState<string | null>(null);
  const upcomingAssessments = briefing.upcomingAssessments.filter((item) => isCurrentOrFutureEvent(item.scheduledAt, today));
  const upcomingMoveIns = briefing.plannedMoveIns.filter((item) => isCurrentOrFutureEvent(item.plannedAt, today));
  const assignedCommunities = briefing.communities.filter((community) =>
    community.census != null && !/unassigned|no community/i.test(`${community.shortName} ${community.communityName}`)
  );
  const unassignedActivity = briefing.communities
    .filter((community) => !assignedCommunities.includes(community))
    .reduce((total, community) => total + (community.newReferrals7d ?? 0), 0);

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#cadbd4] bg-white shadow-[0_12px_32px_rgba(37,77,64,0.07)]" aria-labelledby="admissions-community-dashboard-title">
      <div className="flex items-center justify-between gap-4 border-b border-[#d3e1dc] bg-[linear-gradient(110deg,#eef6f2_0%,#faf7f0_100%)] px-5 py-5 sm:px-7 sm:py-6">
        <div>
          <h3 id="admissions-community-dashboard-title" className="text-[22px] font-semibold tracking-[-0.03em] text-[#263c35] sm:text-[25px]">Community snapshot</h3>
          <p className="mt-1 text-[13px] leading-5 text-[#6d7872] sm:text-[14px]">Current residents, upcoming admits, and new referrals by community.</p>
        </div>
        <p className="text-right text-[11px] font-semibold uppercase tracking-[0.09em] text-[#6d7872]"><strong className="block text-[30px] font-semibold leading-none tracking-[-0.05em] text-[#183f34] sm:text-[34px]">{formatBriefingCount(briefing.totals.census)}</strong><span className="mt-1 block">total residents</span></p>
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
          const upcomingAdmits = briefing.coverage.moveIns
            ? upcomingMoveIns.filter((item) => item.facilityId === community.facilityId).length
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
                  <p data-admissions-community-upcoming-admits="true" className="rounded-xl bg-[#f1f5fa] px-3 py-2 text-[12px] text-[#627181] sm:bg-transparent sm:px-0 sm:py-0 sm:text-right"><span className="block text-[9px] font-semibold uppercase tracking-[0.09em] sm:hidden">Upcoming admits</span><strong className="text-[21px] font-semibold tabular-nums text-[#416b90] sm:text-[22px]">{formatBriefingCount(upcomingAdmits)}</strong><span className="ml-1.5 sm:hidden">this week</span></p>
                  <p data-admissions-community-referrals="true" className="rounded-xl bg-[#fbf4e9] px-3 py-2 text-[12px] text-[#7a6a57] sm:bg-transparent sm:px-0 sm:py-0 sm:text-right"><span className="block text-[9px] font-semibold uppercase tracking-[0.09em] sm:hidden">New referrals</span><strong className="text-[21px] font-semibold tabular-nums text-[#906633] sm:text-[22px]">{formatBriefingCount(community.newReferrals7d)}</strong><span className="ml-1.5 sm:hidden">last 7 days</span></p>
                </div>
              </button>
              {expanded ? (
                <CommunityAdmissionsDetail
                  community={community}
                  cards={communityCards}
                  assessments={upcomingAssessments.filter((item) => item.facilityId === community.facilityId)}
                  moveIns={upcomingMoveIns.filter((item) => item.facilityId === community.facilityId)}
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
  onOpenCard
}: {
  community: AdmissionsDashboardResponse["briefing"]["communities"][number];
  cards: AdmissionsBoardCard[];
  assessments: AdmissionsDashboardResponse["briefing"]["upcomingAssessments"];
  moveIns: AdmissionsDashboardResponse["briefing"]["plannedMoveIns"];
  onOpenCard: (card: AdmissionsBoardCard) => void;
}) {
  const stageCounts = {
    received: cards.filter((card) => card.column === "received").length,
    inProgress: cards.filter((card) => card.column === "in_progress").length,
    decision: cards.filter((card) => card.column === "decision").length
  };
  const activity = [
    ...assessments.map((item) => ({ referralId: item.referralId, key: `assessment:${item.referralId}:${item.scheduledAt}`, kind: "Assessment", date: item.scheduledAt, clientName: item.clientName })),
    ...moveIns.map((item) => ({ referralId: item.referralId, key: `move-in:${item.referralId}:${item.plannedAt}`, kind: "Move-in", date: item.plannedAt, clientName: item.clientName }))
  ].sort((left, right) => left.date.localeCompare(right.date));

  return (
    <div data-admissions-community-detail="true" className="border-t border-[#dfe5e2] bg-[#f3f8f5] px-5 py-5 sm:px-7 sm:py-7">
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
                    <span className="block truncate text-[14px] font-semibold text-[#2f3e39] sm:text-[15px]">{card.clientName}</span>
                    <span className="mt-1 block truncate text-[12px] text-[#6f7a74]">{card.status} · {card.owner}</span>
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
            <div className="mt-4 divide-y divide-[#dde6e1] border-y border-[#d8e2dd]">
              {activity.map((item) => {
                const card = cards.find((candidate) => candidate.referralId === item.referralId) ?? null;
                return (
                  <button key={item.key} type="button" disabled={!card} onClick={() => card && onOpenCard(card)} className="grid w-full grid-cols-[82px_minmax(0,1fr)_auto] items-center gap-3 py-3.5 text-left disabled:cursor-default">
                    <time className="text-[12px] font-semibold text-[#42675b]">{formatEventDate(item.date)}</time>
                    <span className="truncate text-[13px] text-[#33443e]"><strong className="font-semibold">{item.clientName}</strong> · {item.kind}</span>
                    {card ? <ChevronRight className="h-5 w-5 text-[#86908b]" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          ) : <p className="mt-4 border-t border-[#dde5e1] py-5 text-[13px] text-[#6f7974]">No assessments or move-ins are currently scheduled here this week.</p>}
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

function formatEventDate(value: string) {
  const includesTime = value.includes("T");
  const date = new Date(includesTime ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", includesTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }
    : { month: "short", day: "numeric" }).format(date);
}
