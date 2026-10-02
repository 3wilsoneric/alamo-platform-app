import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import {
  fetchAdmissionsDashboard,
  readCachedAdmissionsDashboard,
  type AdmissionsDashboardResponse
} from "../../../shared/api/platformData";
import type {
  AdmissionsBoardColumnKey,
  AdmissionsReferralPipeline
} from "../../../shared/types/platformSnapshot";
import { readStorageItem, writeStorageItem } from "../../../shared/storage/browserStorage";
import PipelineBoard from "../components/PipelineBoard";

type ConnectedAdmissionsPipeline = Extract<AdmissionsReferralPipeline, { status: "connected" }>;
type ExecutiveUpdateSegment = { text: string; strong?: boolean };
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
              <AdmissionsBriefingDashboard dashboard={dashboard} loading={loading && !dashboard} />
            </div>
          )}
        </div>
      </div>
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
  const answerSections = [
    { group: "scheduled" as const, title: "Scheduled" },
    { group: "pending" as const, title: "Awaiting dates" },
    { group: "pipeline" as const, title: "Pipeline" }
  ];

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
      <ul className="mt-3 grid gap-2 border-t border-[#dce5e1] pt-3 md:grid-cols-[1.35fr_1fr_0.9fr] md:gap-5">
        {answerSections.map((section) => {
          const sectionLines = visibleLines.filter((line) => line.group === section.group);
          if (!sectionLines.length) return null;
          return (
            <li
              key={section.group}
              data-admissions-executive-section={section.group}
              className="flex min-w-0 gap-2 text-[11px] leading-[1.55] text-[#46504b] sm:text-[12px]"
            >
              <span className="mt-[0.52em] h-1.5 w-1.5 shrink-0 rounded-full bg-[#0f8b73]" aria-hidden="true" />
              <p className="min-w-0">
                <strong className="font-semibold text-[#263c35]">{section.title}:</strong>{" "}
                {sectionLines.map((line, index) => (
                  <span key={line.key} data-admissions-executive-row={line.key}>
                    {index ? "; " : ""}
                    {line.label ? <span className="font-medium text-[#66736d]">{line.label}: </span> : null}
                    <StreamingSegments segments={line.segments} visibleCharacters={line.visibleCharacters} />
                    {line.lineIsStreaming ? <span data-admissions-typing-caret="true" className="ml-0.5 inline-block animate-pulse font-semibold text-[#0f8b73]" aria-hidden="true">▍</span> : null}
                  </span>
                ))}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
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
      { text: `${update.total} active ${pluralize("referral", update.total)}`, strong: true },
      { text: update.acceptedClients.length ? ". " : "." },
      ...(update.acceptedClients.length ? [
        { text: `${update.acceptedClients.length} accepted`, strong: true },
        { text: ": " },
        ...(scheduledCount ? [{ text: `${scheduledCount} scheduled` }] : []),
        ...(pendingCount ? [{ text: `${scheduledCount ? " and " : ""}${pendingCount} awaiting ${pendingCount === 1 ? "a date" : "dates"}` }] : []),
        { text: "." }
      ] : [])
    ]
  }];
  for (const group of scheduledGroups) {
    lines.push({
      key: `scheduled:${group.key}`,
      group: "scheduled",
      label: group.label,
      segments: [...buildNameSegments(group.names), { text: ` · ${group.community}` }]
    });
  }
  for (const group of pendingGroups) {
    lines.push({
      key: `pending:${group.key}`,
      group: "pending",
      label: group.community,
      segments: buildNameSegments(group.names)
    });
  }
  lines.push({
    key: "pipeline:stages",
    group: "pipeline",
    label: "Stages",
    segments: [
      { text: `${update.received} new`, strong: true },
      { text: " · " },
      { text: `${update.inProgress} assessment / review`, strong: true },
      { text: " · " },
      { text: `${update.decision} decision`, strong: true }
    ]
  });
  if (update.busiest.length) {
    lines.push({
      key: "pipeline:load",
      group: "pipeline",
      label: "Highest load",
      segments: [{ text: formatCommunityLoad(update.busiest) }]
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
      label: mode === "scheduled" ? formatDate(dateKey) : client.community,
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

function AdmissionsBriefingDashboard({
  dashboard,
  loading
}: {
  dashboard: AdmissionsDashboardResponse | null;
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

  return (
    <section data-admissions-weekly-briefing="true" aria-labelledby="admissions-weekly-briefing-title">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="admissions-weekly-briefing-title" className="text-[18px] font-semibold tracking-[-0.025em] text-[#202623]">Weekly operating brief</h2>
          <p className="mt-1 text-[11px] text-[#737b77]">{formatDate(briefing.weekStart)} through {formatDate(briefing.weekEnd)}</p>
        </div>
        <p className="text-[10px] text-[#7a817d]">Census through {formatDate(briefing.asOfDate)}{briefing.pipelineAsOfDate ? ` · Pipeline through ${formatDate(briefing.pipelineAsOfDate)}` : ""}</p>
      </header>

      {briefing.sourceStatus !== "ready" ? (
        <p data-admissions-briefing-source-notice="true" className="mb-4 rounded-xl border border-[#ead8a9] bg-[#fffaf0] px-4 py-3 text-[11px] leading-5 text-[#75591f]">
          Census remains governed. Pipeline event sections are marked incomplete where the source has not published coverage; missing data is never shown as zero.
        </p>
      ) : null}

      <div data-admissions-briefing-dashboard="true" className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-12"><BriefingCommunityDashboard briefing={briefing} /></div>
        <div className="lg:col-span-6">
          <BriefingSchedule
            title="Upcoming assessments"
            tone="assessment"
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
        </div>
        <div className="lg:col-span-6">
          <BriefingSchedule
            title="Move-ins this week"
            tone="move-in"
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
    </section>
  );
}

function BriefingCommunityDashboard({ briefing }: { briefing: AdmissionsDashboardResponse["briefing"] }) {
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
          <h3 id="admissions-community-dashboard-title" className="text-[15px] font-semibold tracking-[-0.02em] text-[#263c35]">Community census</h3>
          <p className="mt-0.5 text-[10px] text-[#737b77]">Current census with this week’s admissions activity.</p>
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
        {assignedCommunities.map((community) => (
          <article key={community.facilityId} data-admissions-briefing-community={community.facilityId} className="px-1 py-3 sm:grid sm:grid-cols-[minmax(180px,1fr)_120px_160px_160px] sm:items-center sm:gap-4 sm:py-3.5">
            <div className="flex items-center justify-between gap-4 sm:block">
              <h4 className="min-w-0 text-[13px] font-semibold leading-5 text-[#263c35]">{community.shortName}</h4>
              <p data-admissions-community-census="true" className="text-right sm:hidden"><strong className="text-[22px] font-semibold leading-none tracking-[-0.04em] text-[#183f34]">{formatBriefingCount(community.census)}</strong><span className="ml-1.5 text-[9px] uppercase tracking-[0.08em] text-[#7a817d]">census</span></p>
            </div>
            <p data-admissions-community-census="true" className="hidden text-right sm:block"><strong className="text-[18px] font-semibold tabular-nums text-[#183f34]">{formatBriefingCount(community.census)}</strong></p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:contents">
              <p data-admissions-community-upcoming-admits="true" className="text-[10px] text-[#737b77] sm:text-right"><span className="block text-[8px] font-semibold uppercase tracking-[0.08em] sm:hidden">Upcoming admits</span><strong className="text-[15px] font-semibold tabular-nums text-[#263c35] sm:text-[13px]">{formatBriefingCount(community.plannedMoveInsThisWeek)}</strong><span className="ml-1 sm:hidden">this week</span></p>
              <p data-admissions-community-referrals="true" className="text-[10px] text-[#737b77] sm:text-right"><span className="block text-[8px] font-semibold uppercase tracking-[0.08em] sm:hidden">New referrals</span><strong className="text-[15px] font-semibold tabular-nums text-[#263c35] sm:text-[13px]">{formatBriefingCount(community.newReferrals7d)}</strong><span className="ml-1 sm:hidden">last 7 days</span></p>
            </div>
          </article>
        ))}
      </div>
      {unassignedActivity > 0 ? (
        <p data-admissions-unassigned-footnote="true" className="border-t border-[#e5e9e7] px-1 py-2.5 text-[9px] leading-4 text-[#737b77]">
          {unassignedActivity} recent {pluralize("referral", unassignedActivity)} {unassignedActivity === 1 ? "has" : "have"} not yet been assigned to a community and {unassignedActivity === 1 ? "is" : "are"} omitted here.
        </p>
      ) : null}
    </section>
  );
}

function BriefingSchedule({
  title,
  tone,
  covered,
  emptyLabel,
  items
}: {
  title: string;
  tone: "assessment" | "move-in";
  covered: boolean;
  emptyLabel: string;
  items: Array<{ key: string; clientName: string; date: string; community: string; owner: string; status: string }>;
}) {
  const treatment = tone === "move-in"
    ? { surface: "bg-[#edf7f2]", border: "border-[#c8dfd3]", count: "bg-[#197453] text-white", date: "bg-[#dcefe6] text-[#145b43]" }
    : { surface: "bg-[#f0f3fc]", border: "border-[#d4dcf5]", count: "bg-[#365fc7] text-white", date: "bg-[#e2e8fa] text-[#3159b8]" };
  return (
    <section data-admissions-priority-schedule={tone} className={`h-full overflow-hidden rounded-2xl border ${treatment.border} bg-white shadow-[0_2px_8px_rgba(24,63,52,0.04)] sm:min-h-[230px]`}>
      <div className={`flex items-center justify-between gap-4 px-4 py-4 sm:px-5 ${treatment.surface}`}>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6f7974]">This week</p>
          <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.025em] text-[#263c35]">{title}</h2>
        </div>
        <span className={`inline-flex min-w-9 items-center justify-center rounded-full px-2.5 py-1.5 text-[12px] font-semibold tabular-nums ${treatment.count}`}>{covered ? items.length : "—"}</span>
      </div>
      {covered ? (
        items.length ? (
          <div className="space-y-2 p-3 sm:p-4">
            {items.map((item) => (
              <article key={item.key} className="grid gap-2 rounded-xl border border-[#e6eae8] bg-white p-3 text-[10px] sm:grid-cols-[84px_minmax(0,1fr)] sm:items-center sm:gap-x-4">
                <time className={`inline-flex w-fit rounded-lg px-2.5 py-1.5 font-semibold ${treatment.date}`}>{formatEventDate(item.date)}</time>
                <div className="min-w-0">
                  <p className="truncate text-[11px]"><strong className="font-semibold text-[#263c35]">{item.clientName}</strong><span className="text-[#69716c]"> · {item.community}</span></p>
                  <p className="mt-1 text-[9px] leading-4 text-[#7a817d]">{item.owner} · {item.status}</p>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="flex min-h-[104px] items-center justify-center px-5 text-center text-[12px] text-[#69716c] sm:min-h-[150px]">{emptyLabel}</p>
      ) : <IncompleteBriefingField label={title} />}
    </section>
  );
}

function IncompleteBriefingField({ label }: { label: string }) {
  return (
    <p className="py-5 text-[12px] leading-5 text-[#8a6118] sm:py-8">
      {label} is incomplete in the current Pipeline contract. No estimate is shown.
    </p>
  );
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

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}
