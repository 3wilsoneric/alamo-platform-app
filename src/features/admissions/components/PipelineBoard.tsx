import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, ArrowUpRight, Columns3, List, X } from "lucide-react";

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

const FULL_PIPELINE_URL = "https://alamo-pipeline.com";
const NO_COMMUNITY = "none";
const LIST_PREVIEW = 15;
const EMPTY_FILTER: BoardFilter = { status: null, facilityId: null, attentionOnly: false };

const COLUMN_STYLE: Record<AdmissionsBoardColumnKey, { surface: string; border: string; accent: string; action: string }> = {
  received: {
    surface: "#eef7f3",
    border: "#cde5d9",
    accent: "#257653",
    action: "#e8f4ee"
  },
  in_progress: {
    surface: "#f0f3fc",
    border: "#d4dcf5",
    accent: "#365fc7",
    action: "#edf1fc"
  },
  decision: {
    surface: "#fcf3ed",
    border: "#efd2bd",
    accent: "#b65318",
    action: "#fbefe5"
  }
};

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
  const [listExpanded, setListExpanded] = useState(false);
  const { board } = pipeline;

  const cards = useMemo(() => board.cards.filter((card) => matches(card, filter)), [board.cards, filter]);
  const statuses = useMemo(() => [...new Set(board.cards.map((card) => card.status))].sort(), [board.cards]);
  const attentionCount = board.cards.filter((card) =>
    needsAttention(card) && matches(card, { ...filter, attentionOnly: false })).length;
  const hasNoCommunity = board.cards.some((card) => !card.facilityId);
  const filtered = Boolean(filter.status || filter.facilityId || filter.attentionOnly);

  function update(next: Partial<BoardFilter>) {
    setFilter((current) => ({ ...current, ...next }));
    setListExpanded(false);
  }

  return (
    <section aria-label="Referral board" data-admissions-board="true">
      <div className="mb-4">
        <div className="grid min-w-0 grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap" role="toolbar" aria-label="Filter the board">
          <label className="min-w-0 sm:min-w-[150px] sm:max-w-[220px] sm:flex-1">
            <span className="sr-only">Community</span>
            <select
              value={filter.facilityId ?? ""}
              onChange={(event) => update({ facilityId: event.target.value || null })}
              className="min-h-11 w-full rounded-lg border border-[#d9dfdb] bg-white px-3 text-[12px] font-medium text-[#303532] outline-none focus:border-[#0f8b73]"
            >
              <option value="">All communities</option>
              {communities.map((community) => <option key={community.facilityId} value={community.facilityId}>{community.shortName}</option>)}
              {hasNoCommunity ? <option value={NO_COMMUNITY}>No community</option> : null}
            </select>
          </label>
          <label className="min-w-0 sm:min-w-[150px] sm:max-w-[220px] sm:flex-1">
            <span className="sr-only">Status</span>
            <select
              value={filter.status ?? ""}
              onChange={(event) => update({ status: event.target.value || null })}
              className="min-h-11 w-full rounded-lg border border-[#d9dfdb] bg-white px-3 text-[12px] font-medium text-[#303532] outline-none focus:border-[#0f8b73]"
            >
              <option value="">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <button
            type="button"
            aria-pressed={filter.attentionOnly}
            onClick={() => update({ attentionOnly: !filter.attentionOnly })}
            className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-[12px] font-medium transition-colors ${filter.attentionOnly ? "border-[#8a6118] bg-[#fff4d9] text-[#6f4e12]" : "border-[#d9dfdb] bg-white text-[#4e5752] hover:bg-[#fafbfa]"}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Attention
            <span className="rounded bg-[#f0ede5] px-1.5 py-0.5 text-[10px] font-semibold">{attentionCount}</span>
          </button>
          <div className="flex justify-self-end rounded-lg bg-[#e9ecef] p-1 sm:ml-auto" role="group" aria-label="Board layout">
            <ViewButton active={view === "board"} onClick={() => setView("board")} icon={<Columns3 className="h-3.5 w-3.5" aria-hidden="true" />}>Board</ViewButton>
            <ViewButton active={view === "list"} onClick={() => setView("list")} icon={<List className="h-3.5 w-3.5" aria-hidden="true" />}>List</ViewButton>
          </div>
          {filtered ? (
            <button type="button" onClick={() => update(EMPTY_FILTER)} className="col-span-2 inline-flex min-h-11 items-center gap-1.5 px-2 text-[11px] font-semibold text-[#0f8b73] hover:text-[#0c705f] sm:col-span-1">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {view === "board" ? (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {board.columns.map((column) => {
            const columnCards = cards.filter((card) => card.column === column.key);
            const style = COLUMN_STYLE[column.key];
            return (
              <section
                key={column.key}
                data-admissions-board-column={column.key}
                className="min-w-0 overflow-hidden rounded-2xl border"
                style={{ backgroundColor: style.surface, borderColor: style.border }}
              >
                <header className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <h2 className="truncate text-[16px] font-semibold tracking-[-0.02em]">{column.label}</h2>
                    <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-[#3f4642] shadow-sm">
                      {columnCards.length}
                    </span>
                  </div>
                  <a
                    href={FULL_PIPELINE_URL}
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold hover:underline"
                    style={{ color: style.accent }}
                  >
                    View all
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </header>

                {columnCards.length ? (
                  <ul className="max-h-[690px] space-y-3 overflow-y-auto px-4 pb-4">
                    {columnCards.map((card) => (
                      <li key={card.referralId}>
                        <BoardCard card={card} column={column.key} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mx-4 mb-4 rounded-xl border border-dashed bg-white/55 px-4 py-10 text-center text-[12px] text-[#69716c]" style={{ borderColor: style.border }}>
                    No referrals here
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <ReferralList cards={cards} expanded={listExpanded} onToggle={() => setListExpanded((value) => !value)} />
      )}

      {board.truncated ? (
        <p className="mt-3 text-[10px] text-[#69716c]">Showing the 300 oldest referrals. Pipeline has the full board.</p>
      ) : null}
    </section>
  );
}

function BoardCard({ card, column }: { card: AdmissionsBoardCard; column: AdmissionsBoardColumnKey }) {
  const style = COLUMN_STYLE[column];
  const attention = needsAttention(card);
  return (
    <a
      href={card.pipelineUrl}
      data-admissions-board-card={card.referralId}
      aria-label={`Referral ${card.referralId}, ${communityName(card)}, ${card.status}. Open in Pipeline`}
      className="group block rounded-xl border border-[#dfe3e1] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition hover:-translate-y-px hover:border-[#bfc9c3] hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[15px] font-semibold tracking-[-0.02em] text-[#171918]">Referral #{card.referralId}</span>
          <span className="mt-1 block truncate text-[11px] text-[#69716c]">{communityName(card)}</span>
        </div>
        <span className="shrink-0 rounded-md bg-[#f2f4f3] px-2 py-1 text-[10px] font-semibold text-[#59615c]">{formatShortDays(card.daysOpen)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: style.action, color: style.accent }}>
          {card.status}
        </span>
        {attention ? <Flags card={card} /> : null}
      </div>

      {card.nextAction ? (
        <div className="mt-3 rounded-lg bg-[#f7f8f7] px-3 py-2.5 text-[11px] leading-4 text-[#4e5752]">
          {card.nextAction}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#edf0ee] pt-3">
        <span className="flex min-w-0 items-center gap-2 text-[11px] text-[#59615c]">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eef1f4] text-[10px] font-semibold" style={{ color: style.accent }}>
            {ownerInitials(card.owner)}
          </span>
          <span className="truncate">{card.owner}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#0f795f]">
          Open
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </div>
    </a>
  );
}

function ReferralList({ cards, expanded, onToggle }: { cards: AdmissionsBoardCard[]; expanded: boolean; onToggle: () => void }) {
  if (!cards.length) return <p className="rounded-xl border border-[#dfe3e1] bg-white px-4 py-10 text-center text-[12px] text-[#69716c]">No referrals match these filters.</p>;
  const shown = expanded ? cards : cards.slice(0, LIST_PREVIEW);
  return (
    <div className="overflow-hidden rounded-xl border border-[#dfe3e1] bg-white" data-admissions-board-list="true">
      <ul className="space-y-3 p-3 md:hidden">
        {shown.map((card) => <li key={card.referralId}><BoardCard card={card} column={card.column} /></li>)}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#e2e6e3] text-[10px] font-medium text-[#69716c]">
              <th className="px-4 py-4">Referral</th>
              <th className="px-4 py-4">Status and next step</th>
              <th className="px-4 py-4">Community</th>
              <th className="px-4 py-4">Owner</th>
              <th className="px-4 py-4 text-right">Open</th>
              <th className="px-4 py-4 text-right">Updated</th>
              <th className="px-4 py-4">Flags</th>
              <th className="px-4 py-4"><span className="sr-only">Open in Pipeline</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((card) => (
              <tr key={card.referralId} className="border-b border-[#edf0ee] text-[12px] last:border-b-0 hover:bg-[#fafbfa]">
                <td className="px-4 py-4 font-semibold">#{card.referralId}</td>
                <td className="px-4 py-4"><span className="font-medium">{card.status}</span><span className="block text-[11px] text-[#69716c]">{card.nextAction}</span></td>
                <td className="px-4 py-4">{communityName(card)}</td>
                <td className="px-4 py-4">{card.owner}</td>
                <td className="px-4 py-4 text-right">{formatShortDays(card.daysOpen)}</td>
                <td className="px-4 py-4 text-right text-[#59615c]">{card.daysSinceUpdate ? `${card.daysSinceUpdate}d` : "Today"}</td>
                <td className="px-4 py-4">{needsAttention(card) ? <Flags card={card} /> : <span className="text-[#b3b8b5]">—</span>}</td>
                <td className="px-4 py-4 text-right">
                  <a href={card.pipelineUrl} aria-label={`Open referral ${card.referralId} in Pipeline`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0f795f] hover:underline">
                    Open <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cards.length > LIST_PREVIEW ? (
        <button type="button" onClick={onToggle} className="m-4 text-[11px] font-semibold text-[#0f795f] hover:underline">
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
      onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-[11px] font-medium transition-colors ${active ? "bg-white text-[#171918] shadow-sm" : "text-[#59615c] hover:bg-white/60"}`}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}

function Flags({ card }: { card: AdmissionsBoardCard }) {
  const flags = [
    card.flags.moveInOverdue ? "Move-in overdue" : null,
    card.flags.unassigned ? "No owner" : null,
    card.flags.stale ? "Update overdue" : null
  ].filter((value): value is string => Boolean(value));
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((label) => (
        <span key={label} className="inline-flex items-center gap-1 rounded-md bg-[#fff4d9] px-2 py-1 text-[10px] font-semibold text-[#775715]">
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

function ownerInitials(owner: string) {
  if (!owner || owner === "Unassigned") return "—";
  return owner.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function formatShortDays(value: number | null) {
  return value == null ? "—" : `${value}d`;
}
