import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, Columns3, List, X } from "lucide-react";

import type {
  AdmissionsBoardCard,
  AdmissionsBoardColumnKey,
  AdmissionsReferralPipeline
} from "../../../shared/types/platformSnapshot";

type ConnectedPipeline = Extract<AdmissionsReferralPipeline, { status: "connected" }>;

type BoardFilter = {
  status: string | null;
  facilityId: string | null;
  attentionOnly: boolean;
};

const NO_COMMUNITY = "none";
const COLUMN_PREVIEW = 8;
const LIST_PREVIEW = 15;
const EMPTY_FILTER: BoardFilter = { status: null, facilityId: null, attentionOnly: false };

// Mirrors Pipeline's stage accents so the board reads the same in both apps.
const COLUMN_ACCENT: Record<AdmissionsBoardColumnKey, string> = {
  received: "#8a8f8c",
  in_progress: "#0f8b73",
  decision: "#c7851a"
};
const DECLINED_ACCENT = "#b8493a";

function needsAttention(card: AdmissionsBoardCard) {
  return card.flags.stale || card.flags.unassigned || card.flags.moveInOverdue;
}

function matches(card: AdmissionsBoardCard, filter: BoardFilter) {
  if (filter.status && card.status !== filter.status) return false;
  if (filter.facilityId && (card.facilityId ?? NO_COMMUNITY) !== filter.facilityId) return false;
  if (filter.attentionOnly && !needsAttention(card)) return false;
  return true;
}

export default function PipelineBoard({
  pipeline,
  communities
}: {
  pipeline: ConnectedPipeline;
  communities: Array<{ facilityId: string; shortName: string }>;
}) {
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER);
  const [view, setView] = useState<"board" | "list">("board");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { board, upcomingAdmissions } = pipeline;

  const cards = useMemo(() => board.cards.filter((card) => matches(card, filter)), [board.cards, filter]);
  const attentionCount = board.cards.filter((card) =>
    needsAttention(card) && matches(card, { ...filter, status: null, attentionOnly: false })).length;
  const hasNoCommunity = board.cards.some((card) => !card.facilityId);
  const filtered = Boolean(filter.status || filter.facilityId || filter.attentionOnly);

  function update(next: Partial<BoardFilter>) {
    setFilter((current) => ({ ...current, ...next }));
    setExpanded(new Set());
  }

  function toggleExpanded(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section aria-labelledby="admissions-board-title" data-admissions-board="true">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[#111111] pb-3">
        <div>
          <h2 id="admissions-board-title" className="text-[22px] font-semibold tracking-[-0.03em]">
            Pipeline now
          </h2>
          <p className="mt-1 text-[11px] text-[#737373]">
            {board.total} referrals on the board · {pipeline.metrics.awaitingAdmission} accepted and awaiting move-in
            {upcomingAdmissions.next7Days ? ` · ${upcomingAdmissions.next7Days} due in 7 days` : ""}
            {" · "}from Pipeline {formatTime(pipeline.generatedAt)}
          </p>
        </div>
        <div className="flex rounded-full border border-[#d9d9d9] p-0.5" role="group" aria-label="Board layout">
          <ViewButton active={view === "board"} onClick={() => setView("board")} icon={<Columns3 className="h-3.5 w-3.5" aria-hidden="true" />}>Board</ViewButton>
          <ViewButton active={view === "list"} onClick={() => setView("list")} icon={<List className="h-3.5 w-3.5" aria-hidden="true" />}>List</ViewButton>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filter the board">
        <Chip active={filter.facilityId === null} onClick={() => update({ facilityId: null })}>All communities</Chip>
        {communities.map((community) => (
          <Chip
            key={community.facilityId}
            active={filter.facilityId === community.facilityId}
            onClick={() => update({ facilityId: filter.facilityId === community.facilityId ? null : community.facilityId })}
          >
            {community.shortName}
          </Chip>
        ))}
        {hasNoCommunity ? (
          <Chip active={filter.facilityId === NO_COMMUNITY} onClick={() => update({ facilityId: filter.facilityId === NO_COMMUNITY ? null : NO_COMMUNITY })}>
            No community
          </Chip>
        ) : null}
        <span className="mx-1 hidden h-5 w-px bg-[#d9d9d9] sm:block" aria-hidden="true" />
        <Chip active={filter.attentionOnly} tone="attention" onClick={() => update({ attentionOnly: !filter.attentionOnly })}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          Needs attention · {attentionCount}
        </Chip>
        {filter.status ? (
          <Chip active onClick={() => update({ status: null })}>
            {filter.status}
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Chip>
        ) : null}
        {filtered ? (
          <button type="button" onClick={() => update(EMPTY_FILTER)} className="ml-1 text-[11px] font-bold text-[#0f8b73] hover:text-[#0c705f]">
            Clear
          </button>
        ) : null}
      </div>

      {view === "board" ? (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-3">
          {board.columns.map((column) => {
            const columnCards = cards.filter((card) => card.column === column.key);
            const groups = column.statuses
              .map((row) => ({ status: row.status, cards: columnCards.filter((card) => card.status === row.status) }))
              .filter((group) => group.cards.length);
            return (
              <div
                key={column.key}
                data-admissions-board-column={column.key}
                className="min-w-0 border border-[#dfe5e1] bg-[#f7f9f8]"
                style={{ borderTop: `3px solid ${COLUMN_ACCENT[column.key]}` }}
              >
                <div className="flex items-baseline justify-between gap-3 border-b border-[#dfe5e1] bg-white px-4 py-3">
                  <h3 className="text-[13px] font-bold tracking-[-0.01em]">{column.label}</h3>
                  <span className="text-[11px] font-semibold text-[#69716c]">
                    {columnCards.length} {columnCards.length === 1 ? "referral" : "referrals"}
                  </span>
                </div>
                <div className="max-h-[640px] overflow-y-auto px-2 pb-3">
                  {groups.length ? groups.map((group) => {
                    const key = `${column.key}:${group.status}`;
                    const shown = expanded.has(key) ? group.cards : group.cards.slice(0, COLUMN_PREVIEW);
                    const selected = filter.status === group.status;
                    return (
                      <div key={group.status} className="pt-3">
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => update({ status: selected ? null : group.status })}
                          className="flex w-full items-center justify-between gap-2 px-1.5 pb-1.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[#69716c] hover:text-[#0f8b73]"
                        >
                          <span>{group.status}</span>
                          <span>{group.cards.length}</span>
                        </button>
                        <ul className="space-y-1.5">
                          {shown.map((card) => (
                            <li key={card.referralId}>
                              <BoardCard card={card} accent={card.status === "Declined" ? DECLINED_ACCENT : COLUMN_ACCENT[column.key]} />
                            </li>
                          ))}
                        </ul>
                        {group.cards.length > COLUMN_PREVIEW ? (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(key)}
                            className="mt-1.5 w-full py-1 text-center text-[11px] font-bold text-[#0f8b73] hover:text-[#0c705f]"
                          >
                            {expanded.has(key) ? "Show fewer" : `Show all ${group.cards.length}`}
                          </button>
                        ) : null}
                      </div>
                    );
                  }) : (
                    <p className="py-8 text-center text-[11px] text-[#77817a]">No referrals here</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ReferralList cards={cards} expanded={expanded.has("list")} onToggle={() => toggleExpanded("list")} />
      )}

      {board.truncated ? (
        <p className="mt-2 text-[10px] text-[#737373]">Showing the 300 oldest referrals; open Pipeline for the full board.</p>
      ) : null}
    </section>
  );
}

function BoardCard({ card, accent }: { card: AdmissionsBoardCard; accent: string }) {
  return (
    <a
      href={card.pipelineUrl}
      data-admissions-board-card={card.referralId}
      aria-label={`Referral ${card.referralId}, ${communityName(card)}, ${card.status}. Open in Pipeline`}
      className="group grid grid-cols-[3px_minmax(0,1fr)_auto] gap-x-2.5 border border-[#e1e7e3] bg-white px-2 py-2.5 transition-colors hover:border-[#b9cfc5] hover:bg-[#f5f9f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f8b73]"
    >
      <span aria-hidden="true" className="h-full min-h-9 w-[3px]" style={{ backgroundColor: accent }} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-[#202320]">{communityName(card)}</span>
        <span className="mt-0.5 block truncate text-[11px] text-[#69716c]">#{card.referralId} · {card.owner}</span>
        <span className="mt-1 block truncate text-[11px] text-[#3f4642]">{card.nextAction}</span>
        {needsAttention(card) ? <span className="mt-1.5 block"><Flags card={card} /></span> : null}
      </span>
      <span className="flex flex-col items-end justify-between text-right">
        <span className="text-[12px] font-semibold text-[#202320]">{formatShortDays(card.daysOpen)}</span>
        <ArrowUpRight className="h-3.5 w-3.5 text-[#9aa39e] group-hover:text-[#0f8b73]" aria-hidden="true" />
      </span>
    </a>
  );
}

function ReferralList({ cards, expanded, onToggle }: { cards: AdmissionsBoardCard[]; expanded: boolean; onToggle: () => void }) {
  if (!cards.length) return <p className="mt-6 text-[12px] text-[#737373]">No referrals match these filters.</p>;
  const shown = expanded ? cards : cards.slice(0, LIST_PREVIEW);
  return (
    <div className="mt-4" data-admissions-board-list="true">
      <ul className="divide-y divide-[#e5e5e5] border-y border-[#d9d9d9] md:hidden">
        {shown.map((card) => (
          <li key={card.referralId}>
            <BoardCard card={card} accent={COLUMN_ACCENT[card.column]} />
          </li>
        ))}
      </ul>
      <table className="hidden w-full border-collapse text-left md:table">
        <thead>
          <tr className="border-b border-[#d9d9d9] text-[9px] font-bold uppercase tracking-[0.12em] text-[#737373]">
            <th className="px-2 py-2">Referral</th>
            <th className="px-2 py-2">Status and next step</th>
            <th className="px-2 py-2">Community</th>
            <th className="px-2 py-2">Owner</th>
            <th className="px-2 py-2 text-right">Open</th>
            <th className="px-2 py-2 text-right">Last update</th>
            <th className="px-2 py-2">Flags</th>
            <th className="px-2 py-2"><span className="sr-only">Open in Pipeline</span></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((card) => (
            <tr key={card.referralId} className="border-b border-[#eeeeee] text-[12px] hover:bg-[#fafaf8]">
              <td className="px-2 py-2.5 text-[#737373]">#{card.referralId}</td>
              <td className="px-2 py-2.5">
                <span className="font-semibold">{card.status}</span>
                <span className="block text-[11px] text-[#737373]">{card.nextAction}</span>
              </td>
              <td className="px-2 py-2.5">{communityName(card)}</td>
              <td className="px-2 py-2.5">{card.owner}</td>
              <td className="px-2 py-2.5 text-right">{formatShortDays(card.daysOpen)}</td>
              <td className="px-2 py-2.5 text-right text-[#595959]">{card.daysSinceUpdate ? `${card.daysSinceUpdate}d ago` : "Today"}</td>
              <td className="px-2 py-2.5">{needsAttention(card) ? <Flags card={card} /> : <span className="text-[#b3b3b3]">—</span>}</td>
              <td className="px-2 py-2.5 text-right">
                <a
                  href={card.pipelineUrl}
                  aria-label={`Open referral ${card.referralId} in Pipeline`}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0f8b73] hover:text-[#0c705f]"
                >
                  Open
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {cards.length > LIST_PREVIEW ? (
        <button type="button" onClick={onToggle} className="mt-3 text-[11px] font-bold text-[#0f8b73] hover:text-[#0c705f]">
          {expanded ? "Show fewer" : `Show all ${cards.length}`}
        </button>
      ) : null}
    </div>
  );
}

function ViewButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      data-dark-action={active ? "true" : undefined}
      onClick={onClick}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold ${active ? "bg-[#111111]" : "text-[#333333] hover:bg-[#f5f4ef]"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function Chip({
  active,
  tone,
  onClick,
  children
}: {
  active: boolean;
  tone?: "attention";
  onClick: () => void;
  children: ReactNode;
}) {
  const activeClass = tone === "attention" ? "border-[#8a6118] bg-[#8a6118] text-white" : "border-[#111111] bg-[#111111] text-white";
  const idleClass = tone === "attention" ? "border-[#e2c98f] bg-[#fdf8ec] text-[#6f4e12]" : "border-[#d9d9d9] bg-white text-[#333333]";
  return (
    <button
      type="button"
      aria-pressed={active}
      data-dark-action={active ? "true" : undefined}
      onClick={onClick}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] ${active ? activeClass : idleClass}`}
    >
      {children}
    </button>
  );
}

function Flags({ card }: { card: AdmissionsBoardCard }) {
  const flags = [
    card.flags.moveInOverdue ? "Move-in date passed" : null,
    card.flags.unassigned ? "No owner" : null,
    card.flags.stale ? "Overdue update" : null
  ].filter(Boolean);
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((label) => (
        <span key={label} className="inline-flex items-center gap-1 rounded-sm bg-[#fdf3dc] px-1.5 py-0.5 text-[10px] font-semibold text-[#6f4e12]">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {label}
        </span>
      ))}
    </span>
  );
}

function communityName(card: AdmissionsBoardCard) {
  return card.facilityId ? card.community : "No community";
}

function formatShortDays(value: number | null) {
  return value == null ? "—" : `${value}d`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
