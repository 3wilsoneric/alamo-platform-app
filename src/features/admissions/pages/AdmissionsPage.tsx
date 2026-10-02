import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
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
      className="relative min-h-[calc(100dvh-var(--platform-header-height))] w-full bg-white px-3 pb-14 text-[#171918] sm:px-6 lg:px-10"
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
            className={`-mb-px min-h-11 border-b-2 px-0.5 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] ${surface === item ? "border-[#0f8b73] font-semibold text-[#163f36]" : "border-transparent font-medium text-[#69716c] hover:border-[#b8c6bf] hover:text-[#303532]"}`}
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
  const lines = buildExecutiveUpdateLines(update);
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
      className="mb-5 w-full rounded-[14px] bg-[#f4f7f5] px-4 py-3.5 text-[#46504b] sm:px-5 sm:py-4"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
        <div className="flex shrink-0 items-center gap-2.5">
          <span data-admissions-chat-avatar="true" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#dcebe5] text-[#176d51]">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-[12px] font-semibold text-[#263c35]">Admissions analyst</span>
            {typing ? <span className="text-[10px] text-[#7a847f]" aria-hidden="true">Composing…</span> : null}
          </div>
        </div>
        {summaryLine ? (
          <p data-admissions-executive-summary="true" className="min-w-0 flex-1 text-[13px] leading-5 text-[#46504b] sm:text-[14px]">
            <StreamingSegments segments={summaryLine.segments} visibleCharacters={summaryLine.visibleCharacters} />
            {summaryLine.lineIsStreaming ? <span data-admissions-typing-caret="true" className="ml-0.5 inline-block animate-pulse font-semibold text-[#0f8b73]" aria-hidden="true">▍</span> : null}
          </p>
        ) : null}
      </div>
      <div className="mt-3 max-w-[1180px] space-y-2 border-t border-[#dce5e1] pt-3 text-[12px] leading-[1.55] text-[#56615c] sm:text-[13px]">
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

function buildExecutiveUpdateLines(update: ReturnType<typeof buildAdmissionsExecutiveUpdate>): ExecutiveUpdateLine[] {
  if (!update) {
    return [{
      key: "summary",
      group: "summary",
      segments: [{ text: "There are no active referrals in the current admissions update." }]
    }];
  }

  const scheduledGroups = groupAcceptedClients(update.acceptedClients.filter((client) => client.plannedAdmissionDate), "scheduled");
  const pendingGroups = groupAcceptedClients(update.acceptedClients.filter((client) => !client.plannedAdmissionDate), "pending");
  const scheduledCount = scheduledGroups.reduce((total, group) => total + group.names.length, 0);
  const pendingCount = pendingGroups.reduce((total, group) => total + group.names.length, 0);
  const lines: ExecutiveUpdateLine[] = [{
    key: "summary",
    group: "summary",
    segments: [
      { text: "Admissions is managing " },
      { text: `${update.total} active ${pluralize("referral", update.total)}`, strong: true },
      { text: update.acceptedClients.length ? ". " : "." },
      ...(update.acceptedClients.length ? [
        { text: `${update.acceptedClients.length} have been accepted`, strong: true },
        { text: "." }
      ] : [])
    ]
  }];
  if (scheduledGroups.length) {
    const previewGroups = scheduledGroups.slice(0, 3);
    const previewCount = previewGroups.reduce((total, group) => total + group.names.length, 0);
    previewGroups.forEach((group, index) => {
      lines.push({
        key: `scheduled:${group.key}`,
        group: "scheduled",
        segments: [
          { text: `${index === 0 ? "On" : "Also on"} ${group.label}, ` },
          ...buildNameSegments(group.names),
          { text: `${group.names.length === 1 ? " is" : " are"} scheduled for ` },
          { text: group.community, accent: true },
          { text: "." }
        ]
      });
    });
    if (scheduledCount > previewCount) {
      const remaining = scheduledCount - previewCount;
      lines.push({
        key: "scheduled:later",
        group: "scheduled",
        segments: [{ text: `${remaining} later ${pluralize("move-in", remaining)} ${remaining === 1 ? "is" : "are"} also on the calendar.` }]
      });
    }
  }
  if (pendingCount) {
    lines.push({
      key: "pending:summary",
      group: "pending",
      segments: [
        { text: `${pendingCount} accepted ${pluralize("client", pendingCount)}`, strong: true },
        { text: ` still ${pendingCount === 1 ? "needs" : "need"} an admission date.` }
      ]
    });
  }
  if (update.busiest.length) {
    const [leader, runnerUp] = update.busiest;
    lines.push({
      key: "pipeline:load",
      group: "pipeline",
      segments: [
        { text: leader?.name ?? "The leading community", accent: true },
        { text: " has the heaviest active workload" },
        { text: ` with ${leader?.count ?? 0} ${pluralize("referral", leader?.count ?? 0)}` },
        ...(runnerUp ? [{ text: ". " }, { text: runnerUp.name, accent: true }, { text: ` follows with ${runnerUp.count}` }] : []),
        { text: "." }
      ]
    });
    lines.push({
      key: "pipeline:stages",
      group: "pipeline",
      segments: [
        { text: "Across the pipeline, " },
        { text: `${update.received} ${update.received === 1 ? "is" : "are"} new`, strong: true },
        { text: ". " },
        { text: `${update.inProgress} ${update.inProgress === 1 ? "is" : "are"} in assessment or review`, strong: true },
        { text: ". " },
        { text: `${update.decision} ${update.decision === 1 ? "is" : "are"} at decision`, strong: true },
        { text: "." }
      ]
    });
  }
  return lines;
}

function buildNameSegments(names: string[]): ExecutiveUpdateSegment[] {
  const segments: ExecutiveUpdateSegment[] = [];
  names.forEach((name, index) => {
    if (index) segments.push({ text: index === names.length - 1 ? (names.length === 2 ? " and " : ", and ") : ", " });
    segments.push({ text: name, strong: true });
  });
  return segments;
}

function groupAcceptedClients(
  clients: Array<{ name: string; community: string; plannedAdmissionDate: string | null }>,
  mode: "scheduled" | "pending"
) {
  const groups = new Map<string, { key: string; label: string; community: string; names: string[] }>();
  for (const client of clients) {
    const dateKey = client.plannedAdmissionDate ?? "pending";
    const key = mode === "scheduled" ? `${dateKey}|${client.community}` : client.community;
    const current = groups.get(key) ?? {
      key,
      label: mode === "scheduled" ? formatEventDate(dateKey) : client.community,
      community: client.community,
      names: []
    };
    current.names.push(client.name);
    groups.set(key, current);
  }
  return [...groups.values()].sort((left, right) => left.key.localeCompare(right.key));
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
  const awaitingSchedule = pipeline?.board.cards.filter((card) => isAcceptedReferral(card.status) && !card.plannedAdmissionDate) ?? [];
  const attentionItems = buildAdmissionsAttentionItems(pipeline);

  return (
    <section data-admissions-weekly-briefing="true" aria-label="Admissions operating snapshot">
      {briefing.sourceStatus !== "ready" ? (
        <p data-admissions-briefing-source-notice="true" className="mb-4 rounded-xl border border-[#ead8a9] bg-[#fffaf0] px-4 py-3 text-[11px] leading-5 text-[#75591f]">
          Census remains governed. Pipeline event sections are marked incomplete where the source has not published coverage; missing data is never shown as zero.
        </p>
      ) : null}

      <div data-admissions-briefing-dashboard="true" className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <AdmissionsMovement
            briefing={briefing}
            pipeline={pipeline}
            awaitingSchedule={awaitingSchedule}
            onOpenCard={onOpenCard}
          />
        </div>
        <div className="lg:col-span-12">
          <BriefingCommunityDashboard briefing={briefing} pipeline={pipeline} onOpenCard={onOpenCard} />
        </div>
        {attentionItems.length ? (
          <div className="lg:col-span-12">
            <AdmissionsAttention items={attentionItems} onOpenCard={onOpenCard} />
          </div>
        ) : null}
      </div>
    </section>
  );
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
  onOpenCard
}: {
  briefing: AdmissionsDashboardResponse["briefing"];
  pipeline: ConnectedAdmissionsPipeline | null;
  awaitingSchedule: AdmissionsBoardCard[];
  onOpenCard: (card: AdmissionsBoardCard) => void;
}) {
  const events = [
    ...(briefing.coverage.assessments ? briefing.upcomingAssessments.map((item) => ({
      key: `assessment:${item.referralId}:${item.scheduledAt}`,
      referralId: item.referralId,
      kind: "Assessment" as const,
      date: item.scheduledAt,
      clientName: item.clientName,
      community: item.facilityId ? item.community : "Community not assigned",
      owner: item.owner,
      detail: item.status
    })) : []),
    ...(briefing.coverage.moveIns ? briefing.plannedMoveIns.map((item) => ({
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
    <section data-admissions-movement="true" className="border-y border-[#d9dedb] bg-white" aria-labelledby="admissions-movement-title">
      <div className="flex items-end justify-between gap-4 border-b border-[#d9dedb] px-1 py-3 sm:px-0">
        <div>
          <h3 id="admissions-movement-title" className="text-[15px] font-semibold tracking-[-0.02em] text-[#263c35]">Admissions movement</h3>
          <p className="mt-0.5 text-[10px] text-[#737b77]">The dated work ahead, followed by accepted clients who still need scheduling.</p>
        </div>
        <CalendarDays className="h-4 w-4 shrink-0 text-[#39715f]" aria-hidden="true" />
      </div>

      <div className={`grid ${awaitingSchedule.length ? "lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]" : ""}`}>
        <div className={awaitingSchedule.length ? "lg:border-r lg:border-[#e2e7e4] lg:pr-5" : ""}>
          <div className="flex items-center justify-between px-1 py-2.5 sm:px-0">
            <h4 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#6b7671]">On the calendar</h4>
            <span className="text-[10px] font-medium tabular-nums text-[#69736e]">{events.length} scheduled</span>
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
                    disabled={!card}
                    onClick={() => card && onOpenCard(card)}
                    className="grid w-full min-w-0 grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-3 px-1 py-3 text-left transition hover:bg-[#f7faf8] disabled:cursor-default disabled:hover:bg-transparent sm:grid-cols-[92px_86px_minmax(0,1fr)_auto] sm:px-0"
                  >
                    <time className="text-[10px] font-semibold tabular-nums text-[#315b4e]">{formatEventDate(event.date)}</time>
                    <span className={`hidden w-fit rounded-full px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] sm:inline-flex ${event.kind === "Move-in" ? "bg-[#e2f1e9] text-[#176d51]" : "bg-[#e8edfb] text-[#365fc7]"}`}>{event.kind}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-semibold text-[#273b34]">{event.clientName}<span className="font-normal text-[#727b76]"> · {event.community}</span></span>
                      <span className="mt-0.5 block truncate text-[9px] text-[#858c88]">{event.owner} · {event.detail}</span>
                    </span>
                    {card ? <ChevronRight className="h-3.5 w-3.5 text-[#7d8782]" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="border-t border-[#e7ebe9] px-1 py-5 text-[11px] text-[#737b77] sm:px-0">Nothing else is scheduled in the current weekly window.</p>
          )}
        </div>

        {awaitingSchedule.length ? (
          <div className="border-t border-[#e2e7e4] pt-1 lg:border-t-0 lg:pl-5 lg:pt-0">
            <div className="flex items-center justify-between px-1 py-2.5 sm:px-0">
              <h4 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#6b7671]">Awaiting scheduling</h4>
              <span className="text-[10px] font-medium tabular-nums text-[#69736e]">{awaitingSchedule.length} accepted</span>
            </div>
            <div className="divide-y divide-[#e7ebe9] border-t border-[#e7ebe9]">
              {awaitingSchedule.map((card) => (
                <button key={card.referralId} type="button" onClick={() => onOpenCard(card)} className="flex w-full items-center gap-3 px-1 py-3 text-left transition hover:bg-[#f7faf8] sm:px-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-semibold text-[#273b34]">{card.clientName}</span>
                    <span className="mt-0.5 block truncate text-[9px] text-[#7b837f]">{card.facilityId ? card.community : "Community not assigned"} · {card.owner}</span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#7d8782]" aria-hidden="true" />
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
  const [expanded, setExpanded] = useState(false);
  const visibleItems = items.slice(0, 8);
  return (
    <section data-admissions-attention="true" className="border-y border-[#e3d8bd] bg-[#fffdf8]" aria-labelledby="admissions-attention-title">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className={`flex w-full items-center justify-between gap-4 px-1 py-3 text-left transition hover:bg-[#fff9ec] sm:px-0 ${expanded ? "border-b border-[#eee5d2]" : ""}`}>
        <div>
          <h3 id="admissions-attention-title" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] text-[#4e4229]"><AlertTriangle className="h-4 w-4 text-[#9a6b17]" aria-hidden="true" />Needs attention</h3>
          <p className="mt-0.5 text-[10px] text-[#80745d]">Only referrals with a recorded blocker, overdue date, missing community, or stale update.</p>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-[10px] font-medium tabular-nums text-[#7a6d54]">{items.length} flagged<ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" /></span>
      </button>
      {expanded ? (
        <>
          <div className="divide-y divide-[#eee5d2]">
            {visibleItems.map(({ card, issues }) => (
              <button key={card.referralId} type="button" onClick={() => onOpenCard(card)} className="grid w-full min-w-0 gap-1 px-1 py-3 text-left transition hover:bg-[#fff9ec] sm:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.3fr)_auto] sm:items-center sm:gap-4 sm:px-0">
                <span className="truncate text-[11px] font-semibold text-[#3e392f]">{card.clientName}<span className="font-normal text-[#817865]"> · {card.facilityId ? card.community : "No community"}</span></span>
                <span className="text-[10px] leading-4 text-[#7c5c20]">{issues.join(" · ")}</span>
                <ChevronRight className="hidden h-3.5 w-3.5 text-[#9b8e73] sm:block" aria-hidden="true" />
              </button>
            ))}
          </div>
          {items.length > visibleItems.length ? <p className="border-t border-[#eee5d2] px-1 py-2 text-[9px] text-[#887b63] sm:px-0">Showing the {visibleItems.length} highest-priority items. The complete queue remains in Pipeline.</p> : null}
        </>
      ) : null}
    </section>
  );
}

function BriefingCommunityDashboard({
  briefing,
  pipeline,
  onOpenCard
}: {
  briefing: AdmissionsDashboardResponse["briefing"];
  pipeline: ConnectedAdmissionsPipeline | null;
  onOpenCard: (card: AdmissionsBoardCard) => void;
}) {
  const [expandedFacilityId, setExpandedFacilityId] = useState<string | null>(null);
  const assignedCommunities = briefing.communities.filter((community) =>
    community.census != null && !/unassigned|no community/i.test(`${community.shortName} ${community.communityName}`)
  );
  const unassignedActivity = briefing.communities
    .filter((community) => !assignedCommunities.includes(community))
    .reduce((total, community) => total + (community.newReferrals7d ?? 0), 0);

  return (
    <section className="border-y border-[#d9dedb] bg-white" aria-labelledby="admissions-community-dashboard-title">
      <div className="flex items-center justify-between gap-3 border-b border-[#d9dedb] px-1 py-3 sm:px-0">
        <div>
          <h3 id="admissions-community-dashboard-title" className="text-[15px] font-semibold tracking-[-0.02em] text-[#263c35]">Community snapshot</h3>
          <p className="mt-0.5 text-[10px] text-[#737b77]">Current residents, upcoming admits, and new referrals by community.</p>
        </div>
        <p className="text-right text-[10px] uppercase tracking-[0.08em] text-[#737b77]"><strong className="mr-1 text-[18px] font-semibold tracking-[-0.03em] text-[#183f34]">{formatBriefingCount(briefing.totals.census)}</strong> total</p>
      </div>
      <div className="hidden grid-cols-[minmax(180px,1fr)_120px_160px_160px] gap-4 border-b border-[#e5e9e7] px-1 py-2 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#858d88] sm:grid">
        <span>Community</span>
        <span className="text-right">Census</span>
        <span className="text-right">Upcoming admits</span>
        <span className="text-right">New referrals · 7 days</span>
      </div>
      <div className="divide-y divide-[#e5e9e7]">
        {assignedCommunities.map((community) => {
          const expanded = expandedFacilityId === community.facilityId;
          const communityCards = pipeline?.board.cards.filter((card) => card.facilityId === community.facilityId) ?? [];
          return (
            <div key={community.facilityId} data-admissions-briefing-community={community.facilityId}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedFacilityId((current) => current === community.facilityId ? null : community.facilityId)}
                className="w-full px-1 py-3 text-left transition hover:bg-[#f7faf8] sm:grid sm:grid-cols-[minmax(180px,1fr)_120px_160px_160px] sm:items-center sm:gap-4 sm:py-3.5"
              >
                <div className="flex items-center justify-between gap-4">
                  <h4 className="min-w-0 text-[13px] font-semibold leading-5 text-[#263c35]">{community.shortName}</h4>
                  <div className="flex items-center gap-2">
                    <p data-admissions-community-census="true" className="text-right sm:hidden"><strong className="text-[22px] font-semibold leading-none tracking-[-0.04em] text-[#183f34]">{formatBriefingCount(community.census)}</strong><span className="ml-1.5 text-[9px] uppercase tracking-[0.08em] text-[#7a817d]">census</span></p>
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[#7b8580] transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                  </div>
                </div>
                <p data-admissions-community-census="true" className="hidden text-right sm:block"><strong className="text-[18px] font-semibold tabular-nums text-[#183f34]">{formatBriefingCount(community.census)}</strong></p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:contents">
                  <p data-admissions-community-upcoming-admits="true" className="text-[10px] text-[#737b77] sm:text-right"><span className="block text-[8px] font-semibold uppercase tracking-[0.08em] sm:hidden">Upcoming admits</span><strong className="text-[15px] font-semibold tabular-nums text-[#263c35] sm:text-[13px]">{formatBriefingCount(community.plannedMoveInsThisWeek)}</strong><span className="ml-1 sm:hidden">this week</span></p>
                  <p data-admissions-community-referrals="true" className="text-[10px] text-[#737b77] sm:text-right"><span className="block text-[8px] font-semibold uppercase tracking-[0.08em] sm:hidden">New referrals</span><strong className="text-[15px] font-semibold tabular-nums text-[#263c35] sm:text-[13px]">{formatBriefingCount(community.newReferrals7d)}</strong><span className="ml-1 sm:hidden">last 7 days</span></p>
                </div>
              </button>
              {expanded ? (
                <CommunityAdmissionsDetail
                  community={community}
                  cards={communityCards}
                  assessments={briefing.upcomingAssessments.filter((item) => item.facilityId === community.facilityId)}
                  moveIns={briefing.plannedMoveIns.filter((item) => item.facilityId === community.facilityId)}
                  onOpenCard={onOpenCard}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {unassignedActivity > 0 ? (
        <p data-admissions-unassigned-footnote="true" className="border-t border-[#e5e9e7] px-1 py-2.5 text-[9px] leading-4 text-[#737b77]">
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
    <div data-admissions-community-detail="true" className="border-t border-[#dfe5e2] bg-[#f7faf8] px-3 py-4 sm:px-5 sm:py-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <section aria-label={`${community.shortName} pipeline detail`}>
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="mr-2 text-[11px] font-semibold text-[#29483f]">Active pipeline</h5>
            <CommunityMetric label="New" value={stageCounts.received} />
            <CommunityMetric label="Assessment / review" value={stageCounts.inProgress} />
            <CommunityMetric label="Decision" value={stageCounts.decision} />
            {community.occupancyPct != null ? <CommunityMetric label="Occupied" value={`${community.occupancyPct}%`} /> : null}
          </div>
          {cards.length ? (
            <div className="mt-3 grid gap-x-5 border-t border-[#dde5e1] sm:grid-cols-2">
              {cards.map((card) => (
                <button key={card.referralId} type="button" onClick={() => onOpenCard(card)} className="flex min-w-0 items-center gap-3 border-b border-[#e3e9e6] py-2.5 text-left transition hover:text-[#0f795f]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-semibold text-[#2f3e39]">{card.clientName}</span>
                    <span className="mt-0.5 block truncate text-[9px] text-[#7a837f]">{card.status} · {card.owner}</span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#86908b]" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : <p className="mt-3 border-t border-[#dde5e1] py-4 text-[10px] text-[#78817d]">No active referrals are assigned to this community.</p>}
        </section>

        <section aria-label={`${community.shortName} upcoming activity`}>
          <h5 className="text-[11px] font-semibold text-[#29483f]">Upcoming activity</h5>
          {activity.length ? (
            <div className="mt-3 divide-y divide-[#e3e9e6] border-y border-[#dde5e1]">
              {activity.map((item) => {
                const card = cards.find((candidate) => candidate.referralId === item.referralId) ?? null;
                return (
                  <button key={item.key} type="button" disabled={!card} onClick={() => card && onOpenCard(card)} className="grid w-full grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-2 py-2.5 text-left disabled:cursor-default">
                    <time className="text-[9px] font-semibold text-[#42675b]">{formatEventDate(item.date)}</time>
                    <span className="truncate text-[10px] text-[#33443e]"><strong className="font-semibold">{item.clientName}</strong> · {item.kind}</span>
                    {card ? <ChevronRight className="h-3.5 w-3.5 text-[#86908b]" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          ) : <p className="mt-3 border-t border-[#dde5e1] py-4 text-[10px] text-[#78817d]">No assessments or move-ins are currently scheduled here this week.</p>}
        </section>
      </div>
    </div>
  );
}

function CommunityMetric({ label, value }: { label: string; value: string | number }) {
  return <span className="rounded-full border border-[#d8e1dc] bg-white px-2.5 py-1 text-[9px] text-[#64716b]"><strong className="mr-1 font-semibold text-[#24483d]">{value}</strong>{label}</span>;
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
