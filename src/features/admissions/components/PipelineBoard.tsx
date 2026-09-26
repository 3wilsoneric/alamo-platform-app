import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowRight, CalendarDays, Check, Clock3, Columns3, List, UserRound, X } from "lucide-react";

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
  const [selectedCard, setSelectedCard] = useState<AdmissionsBoardCard | null>(null);
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
                </header>

                {columnCards.length ? (
                  <ul className="max-h-[690px] space-y-3 overflow-y-auto px-4 pb-4">
                    {columnCards.map((card) => (
                      <li key={card.referralId}>
                        <BoardCard card={card} column={column.key} onOpen={() => setSelectedCard(card)} />
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
        <ReferralList cards={cards} expanded={listExpanded} onToggle={() => setListExpanded((value) => !value)} onOpen={setSelectedCard} />
      )}

      {board.truncated ? (
        <p className="mt-3 text-[10px] text-[#69716c]">Showing the 300 oldest referrals in the current governed update.</p>
      ) : null}

      {selectedCard ? <ProgressModal card={selectedCard} generatedAt={pipeline.generatedAt} onClose={() => setSelectedCard(null)} /> : null}
    </section>
  );
}

const PROGRESS_STAGES: Array<{ key: AdmissionsBoardColumnKey; label: string }> = [
  { key: "received", label: "Referral received" },
  { key: "in_progress", label: "Assessment & review" },
  { key: "decision", label: "Decision" }
];

function ProgressModal({
  card,
  generatedAt,
  onClose
}: {
  card: AdmissionsBoardCard;
  generatedAt: string;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const currentStage = PROGRESS_STAGES.findIndex((stage) => stage.key === card.column);
  const attentionLabels = getFlagLabels(card);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-[#10221d]/40 backdrop-blur-[2px] sm:items-center sm:p-6"
      data-admissions-progress-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="admissions-progress-title"
        className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[24px] bg-white shadow-[0_24px_80px_rgba(15,35,29,0.24)] sm:max-w-[660px] sm:rounded-[20px]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-5 border-b border-[#e3e7e5] bg-white/95 px-5 py-5 backdrop-blur sm:px-7 sm:py-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0f795f]">Referral progress</p>
            <h2 id="admissions-progress-title" className="mt-1 truncate text-[24px] font-semibold tracking-[-0.035em] text-[#171918] sm:text-[28px]">
              {card.clientName}
            </h2>
            <p className="mt-1 text-[11px] text-[#69716c]">Referral #{card.referralId} · {communityName(card)}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close progress update"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dfe4e1] text-[#4e5752] transition hover:bg-[#f3f5f4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
          <section aria-label="Current referral stage" className="rounded-2xl border border-[#dfe5e2] bg-[#fafbfa] px-4 py-5 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-[#69716c]">Current stage</span>
              <span className="rounded-md bg-[#e8f4ee] px-2.5 py-1 text-[11px] font-semibold text-[#176d51]">{card.status}</span>
            </div>
            <div className="relative mt-6">
              <span aria-hidden="true" className="absolute left-[16.66%] right-[16.66%] top-4 h-px bg-[#cfd8d3]" />
              <ol className="relative grid grid-cols-3 gap-2" aria-label="Referral progress">
                {PROGRESS_STAGES.map((stage, index) => {
                  const complete = index < currentStage;
                  const current = index === currentStage;
                  return (
                    <li key={stage.key} className="relative z-[1] flex min-w-0 flex-col items-center text-center" data-admissions-progress-step={stage.key}>
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-semibold ${complete ? "border-[#0f795f] bg-[#0f795f] text-white" : current ? "border-[#0f795f] bg-white text-[#0f795f] ring-4 ring-[#dff0e9]" : "border-[#cfd8d3] bg-white text-[#8b938f]"}`}>
                        {complete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                      </span>
                      <span className={`mt-2 max-w-[110px] text-[10px] leading-4 ${current ? "font-semibold text-[#25463d]" : "font-medium text-[#747c78]"}`}>{stage.label}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

          <section aria-label="Next required action" className="rounded-2xl bg-[#edf5f1] px-4 py-4 sm:px-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#517067]">Next required action</p>
            <p className="mt-2 text-[15px] font-semibold leading-6 text-[#183f34]">{card.nextAction || "Confirm the next workflow step"}</p>
          </section>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#e1e5e3] bg-[#e1e5e3] sm:grid-cols-3">
            <ProgressFact icon={<UserRound className="h-3.5 w-3.5" aria-hidden="true" />} label="Assigned to" value={card.owner || "Unassigned"} />
            <ProgressFact icon={<Clock3 className="h-3.5 w-3.5" aria-hidden="true" />} label="Time open" value={formatLongDays(card.daysOpen)} />
            <ProgressFact icon={<Clock3 className="h-3.5 w-3.5" aria-hidden="true" />} label="Last update" value={formatLastUpdate(card.daysSinceUpdate)} />
            <ProgressFact label="Priority" value={formatPriority(card.priority)} />
            <ProgressFact icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />} label="Planned admission" value={formatPlannedDate(card.plannedAdmissionDate)} />
            <ProgressFact label="Community" value={communityName(card)} />
          </dl>

          <section aria-label="Analyst review" className={`rounded-2xl border px-4 py-4 sm:px-5 ${attentionLabels.length ? "border-[#ead3a5] bg-[#fffaf0]" : "border-[#dce7e2] bg-[#f7faf8]"}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${attentionLabels.length ? "bg-[#fff0ca] text-[#805d16]" : "bg-[#e5f2ec] text-[#176d51]"}`}>
                {attentionLabels.length ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              </span>
              <div>
                <p className="text-[11px] font-semibold text-[#303532]">{attentionLabels.length ? "Review focus" : "Current review"}</p>
                <p className="mt-1 text-[12px] leading-5 text-[#5f6762]">
                  {attentionLabels.length ? attentionLabels.join(" · ") : "No workflow exceptions are flagged in the current update."}
                </p>
              </div>
            </div>
          </section>

          <p className="text-center text-[10px] text-[#8a918d]">Updated {formatUpdatedAt(generatedAt)}</p>
        </div>

        <footer className="sticky bottom-0 border-t border-[#e3e7e5] bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
          <button type="button" onClick={onClose} style={{ color: "#ffffff" }} className="min-h-11 w-full rounded-xl bg-[#163f36] px-4 text-[12px] font-semibold transition hover:bg-[#0f795f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]">
            Done
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}

function ProgressFact({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 bg-white px-4 py-3.5">
      <dt className="flex items-center gap-1.5 text-[10px] font-medium text-[#7b837f]">{icon}{label}</dt>
      <dd className="mt-1.5 truncate text-[12px] font-semibold text-[#303532]" title={value}>{value}</dd>
    </div>
  );
}

function BoardCard({ card, column, onOpen }: { card: AdmissionsBoardCard; column: AdmissionsBoardColumnKey; onOpen: () => void }) {
  const style = COLUMN_STYLE[column];
  const attention = needsAttention(card);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-admissions-board-card={card.referralId}
      aria-label={`${card.clientName}, referral ${card.referralId}, ${communityName(card)}, ${card.status}. Open progress update`}
      className="group block w-full rounded-xl border border-[#dfe3e1] bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition hover:-translate-y-px hover:border-[#bfc9c3] hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span data-admissions-client-name="true" className="block truncate text-[15px] font-semibold tracking-[-0.02em] text-[#171918]">{card.clientName}</span>
          <span className="mt-1 block truncate text-[11px] text-[#69716c]">Referral #{card.referralId} · {communityName(card)}</span>
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
    </button>
  );
}

function ReferralList({ cards, expanded, onToggle, onOpen }: { cards: AdmissionsBoardCard[]; expanded: boolean; onToggle: () => void; onOpen: (card: AdmissionsBoardCard) => void }) {
  if (!cards.length) return <p className="rounded-xl border border-[#dfe3e1] bg-white px-4 py-10 text-center text-[12px] text-[#69716c]">No referrals match these filters.</p>;
  const shown = expanded ? cards : cards.slice(0, LIST_PREVIEW);
  return (
    <div className="overflow-hidden rounded-xl border border-[#dfe3e1] bg-white" data-admissions-board-list="true">
      <ul className="space-y-3 p-3 md:hidden">
        {shown.map((card) => <li key={card.referralId}><BoardCard card={card} column={card.column} onOpen={() => onOpen(card)} /></li>)}
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
              <th className="px-4 py-4"><span className="sr-only">Open progress update</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((card) => (
              <tr key={card.referralId} className="border-b border-[#edf0ee] text-[12px] last:border-b-0 hover:bg-[#fafbfa]">
                <td className="px-4 py-4">
                  <span className="block font-semibold">{card.clientName}</span>
                  <span className="mt-0.5 block text-[11px] text-[#69716c]">Referral #{card.referralId}</span>
                </td>
                <td className="px-4 py-4"><span className="font-medium">{card.status}</span><span className="block text-[11px] text-[#69716c]">{card.nextAction}</span></td>
                <td className="px-4 py-4">{communityName(card)}</td>
                <td className="px-4 py-4">{card.owner}</td>
                <td className="px-4 py-4 text-right">{formatShortDays(card.daysOpen)}</td>
                <td className="px-4 py-4 text-right text-[#59615c]">{card.daysSinceUpdate ? `${card.daysSinceUpdate}d` : "Today"}</td>
                <td className="px-4 py-4">{needsAttention(card) ? <Flags card={card} /> : <span className="text-[#b3b8b5]">—</span>}</td>
                <td className="px-4 py-4 text-right">
                  <button type="button" onClick={() => onOpen(card)} aria-label={`Open progress update for ${card.clientName}, referral ${card.referralId}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0f795f] hover:underline">
                    Open <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
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
  const flags = getFlagLabels(card);
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

function getFlagLabels(card: AdmissionsBoardCard) {
  return [
    card.flags.moveInOverdue ? "Move-in overdue" : null,
    card.flags.unassigned ? "No owner" : null,
    card.flags.stale ? "Update overdue" : null
  ].filter((value): value is string => Boolean(value));
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

function formatLongDays(value: number | null) {
  if (value == null) return "Not available";
  return `${value} ${value === 1 ? "day" : "days"}`;
}

function formatLastUpdate(value: number) {
  if (value <= 0) return "Today";
  return `${value} ${value === 1 ? "day" : "days"} ago`;
}

function formatPriority(value: string) {
  if (!value) return "Standard";
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function formatPlannedDate(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "from the current feed";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
