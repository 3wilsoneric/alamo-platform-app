import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowRight, CalendarDays, Check, Clock3, Columns3, List, UserRound, X } from "lucide-react";

import type {
  AdmissionsBoardCard,
  AdmissionsBoardColumnKey,
  AdmissionsReferralPipeline
} from "../../../shared/types/platformSnapshot";

type ConnectedPipeline = Extract<AdmissionsReferralPipeline, { status: "connected" }>;

const NO_COMMUNITY = "none";
const LIST_PREVIEW = 15;

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

export default function PipelineBoard({
  pipeline,
  communities
}: {
  pipeline: ConnectedPipeline;
  communities: Array<{ facilityId: string; shortName: string }>;
}) {
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"board" | "list">("board");
  const [listExpanded, setListExpanded] = useState(false);
  const [selectedCard, setSelectedCard] = useState<AdmissionsBoardCard | null>(null);
  const { board } = pipeline;

  const cards = useMemo(
    () => selectedFacilityIds.size
      ? board.cards.filter((card) => selectedFacilityIds.has(card.facilityId ?? NO_COMMUNITY))
      : board.cards,
    [board.cards, selectedFacilityIds]
  );
  const hasNoCommunity = board.cards.some((card) => !card.facilityId);

  function toggleCommunity(facilityId: string) {
    setSelectedFacilityIds((current) => {
      const next = new Set(current);
      if (next.has(facilityId)) next.delete(facilityId);
      else next.add(facilityId);
      return next;
    });
    setListExpanded(false);
  }

  function showAllCommunities() {
    setSelectedFacilityIds(new Set());
    setListExpanded(false);
  }

  return (
    <section aria-label="Referral board" data-admissions-board="true">
      <div className="mb-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div
            data-admissions-community-filters="true"
            className="flex min-w-0 flex-wrap gap-2"
            role="group"
            aria-label="Filter by community"
          >
            <CommunityPill active={selectedFacilityIds.size === 0} onClick={showAllCommunities}>
              All communities
            </CommunityPill>
            {communities.map((community) => (
              <CommunityPill
                key={community.facilityId}
                active={selectedFacilityIds.has(community.facilityId)}
                onClick={() => toggleCommunity(community.facilityId)}
              >
                {community.shortName}
              </CommunityPill>
            ))}
            {hasNoCommunity ? (
              <CommunityPill
                active={selectedFacilityIds.has(NO_COMMUNITY)}
                onClick={() => toggleCommunity(NO_COMMUNITY)}
              >
                No community
              </CommunityPill>
            ) : null}
          </div>
          <div className="flex shrink-0 self-end rounded-lg bg-[#e9ecef] p-1 sm:self-start" role="group" aria-label="Board layout">
            <ViewButton active={view === "board"} onClick={() => setView("board")} icon={<Columns3 className="h-3.5 w-3.5" aria-hidden="true" />}>Board</ViewButton>
            <ViewButton active={view === "list"} onClick={() => setView("list")} icon={<List className="h-3.5 w-3.5" aria-hidden="true" />}>List</ViewButton>
          </div>
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

const DECISION_TAB = {
  accept: {
    state: "accept",
    label: "Accept",
    className: "border-[#176344] bg-[#257653] text-white"
  },
  deny: {
    state: "deny",
    label: "Deny",
    className: "border-[#8f3932] bg-[#b64c43] text-white"
  },
  underReview: {
    state: "under-review",
    label: "Under review",
    className: "border-[#c5952d] bg-[#e7be58] text-[#493707]"
  }
} as const;

function decisionTabFor(card: AdmissionsBoardCard) {
  const status = card.status.trim().toLowerCase();
  if (status.includes("declin") || status.includes("deni")) return DECISION_TAB.deny;
  if (
    status.startsWith("accept") ||
    status === "awaiting admit" ||
    status === "meet the client not sent"
  ) {
    return DECISION_TAB.accept;
  }
  return DECISION_TAB.underReview;
}

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
  const dialogRef = useRef<HTMLElement>(null);
  const currentStage = PROGRESS_STAGES.findIndex((stage) => stage.key === card.column);
  const attentionLabels = getFlagLabels(card);
  const profile = card.managementProfile;
  const decisionTab = decisionTabFor(card);
  const assessmentLabel = profile.assessmentSigned
    ? `Signed${profile.assessmentDate ? ` ${formatProfileDate(profile.assessmentDate)}` : ""}`
    : formatProfileValue(profile.assessmentStatus);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? [])]
          .filter((element) => !element.hasAttribute("disabled"));
        if (!focusable.length) return;
        const first = focusable[0]!;
        const last = focusable.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#10221d]/40 p-2 backdrop-blur-[2px] sm:p-6"
      data-admissions-progress-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admissions-progress-title"
        className="flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden sm:max-h-[calc(100dvh-3rem)] sm:max-w-[1240px]"
      >
        <div data-admissions-chart-folder-tab="true" className="ml-3 flex max-w-[calc(100%-1.5rem)] shrink-0 items-end gap-1.5 sm:ml-8 sm:max-w-[720px] sm:gap-2">
          <div
            data-admissions-chart-name-tab="true"
            className="flex h-16 min-w-0 items-center rounded-t-xl border border-b-0 border-[#ccb98f] bg-[#f2e5c9] p-2 shadow-[0_-3px_12px_rgba(49,40,18,0.07)] sm:h-[72px] sm:p-2.5"
          >
            <div
              data-admissions-chart-name-label="true"
              className="flex h-full min-w-0 items-center rounded-[4px] border border-[#d7d0c1] bg-[#fffdfa] px-3.5 shadow-[0_1px_2px_rgba(58,47,24,0.08)] sm:px-5"
            >
              <span id="admissions-progress-title" data-admissions-chart-tab-name="true" className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[#202321] sm:text-[17px]">{card.clientName}</span>
            </div>
          </div>
          <div
            data-admissions-decision-tab={decisionTab.state}
            className={`flex h-12 shrink-0 items-center rounded-t-xl border border-b-0 px-3 text-[10px] font-bold uppercase tracking-[0.08em] shadow-[0_-3px_12px_rgba(49,40,18,0.08)] sm:h-14 sm:px-5 sm:text-[11px] ${decisionTab.className}`}
          >
            {decisionTab.label}
          </div>
        </div>
        <div
          data-admissions-chart-folder="true"
          className="flex min-h-0 flex-1 overflow-hidden rounded-b-[18px] rounded-tr-[22px] border border-[#ccb98f] bg-[#f2e5c9] p-2 shadow-[0_24px_80px_rgba(15,35,29,0.24)] sm:rounded-b-[22px] sm:p-3"
        >
          <article
            data-admissions-chart-paper="true"
            className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-[#d2d5cf] bg-[#fffefb] shadow-[0_2px_8px_rgba(58,47,24,0.12)] sm:rounded-xl"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close management chart"
              className="absolute right-3 top-3 z-20 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d3dad6] bg-white text-[#4e5752] shadow-sm transition hover:bg-[#eef3f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] sm:right-5 sm:top-4"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <section data-admissions-chart-section="next-action" aria-labelledby="admissions-chart-next-action" className="border-b border-[#bfcac5] bg-[#edf5f1] py-5 pl-5 pr-16 sm:px-8 sm:pr-20">
                <h3 id="admissions-chart-next-action" className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#517067]">Next required action</h3>
                <p className="mt-1.5 text-[15px] font-semibold leading-6 text-[#183f34]">{card.nextAction || "Confirm the next workflow step"}</p>
              </section>

              <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.55fr)_minmax(310px,0.85fr)]">
                <div className="min-w-0 lg:border-r lg:border-[#bfcac5]">
                  <section data-admissions-chart-section="client-profile" aria-labelledby="admissions-chart-client-profile">
                    <ChartBand id="admissions-chart-client-profile" title="Client and placement" detail={profile.assessmentSigned ? "Verified from signed assessment" : "Current intake record"} />
                    <dl className="grid grid-cols-2 gap-px bg-[#bfcac5] sm:grid-cols-3">
                      <ProgressFact icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />} label="Date of birth" value={formatProfileDate(profile.dateOfBirth)} />
                      <ProgressFact label="Referral source" value={formatProfileValue(profile.referralSource)} />
                      <ProgressFact label="Referring county" value={formatProfileValue(profile.referringCounty)} />
                      <ProgressFact label="Coverage / payer" value={formatProfileValue(profile.payer)} />
                      <ProgressFact label="Responsible person" value={formatProfileValue(profile.responsiblePerson)} />
                      <ProgressFact label="Conserved status" value={formatConservedStatus(profile.conservedStatus)} />
                    </dl>
                  </section>

                  <section data-admissions-chart-section="about" aria-labelledby="admissions-chart-about">
                    <ChartBand id="admissions-chart-about" title="About the client" />
                    {profile.overview.length ? (
                      <ul className="grid gap-3 bg-[#fffefb] px-5 py-5 sm:grid-cols-2 sm:px-8" data-admissions-management-overview="true">
                        {profile.overview.map((item) => (
                          <li key={item} className="border-l-2 border-[#9fb8ad] pl-3 text-[12px] leading-5 text-[#4d5752]">{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <ChartEmpty>{profile.assessmentSigned ? "No management narrative is recorded in the signed assessment." : "The intake record is available. This brief fills in when the assessment is signed."}</ChartEmpty>
                    )}
                  </section>

                  <section data-admissions-chart-section="support" aria-labelledby="admissions-chart-support">
                    <ChartBand id="admissions-chart-support" title="Care and support snapshot" />
                    {profile.supportSnapshot.length ? (
                      <dl className="grid gap-px bg-[#bfcac5] sm:grid-cols-2" data-admissions-management-support="true">
                        {profile.supportSnapshot.map((item) => <ProgressFact key={item.label} label={item.label} value={item.value} />)}
                      </dl>
                    ) : (
                      <ChartEmpty>{profile.assessmentSigned ? "No structured support details are recorded." : "Verified support details become available after the assessment is signed."}</ChartEmpty>
                    )}
                  </section>

                  <section data-admissions-chart-section="medications" aria-labelledby="admissions-chart-medications">
                    <ChartBand id="admissions-chart-medications" title="Medication handoff" detail={medicationSourceLabel(profile.medicationSource)} />
                    {profile.medications.length ? (
                      <ul className="grid gap-x-6 gap-y-2 bg-[#fffefb] px-5 py-5 sm:grid-cols-2 sm:px-8" data-admissions-management-medications="true">
                        {profile.medications.map((medication, index) => (
                          <li key={`${medication}-${index}`} className="flex items-start gap-2 border-b border-[#e3e7e4] pb-2 text-[12px] leading-5 text-[#424b47]">
                            <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#4b7c6b]" aria-hidden="true" />
                            <span>{medication}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ChartEmpty>No medication list is recorded in the current referral or signed assessment.</ChartEmpty>
                    )}
                  </section>
                </div>

                <aside className="min-w-0 bg-[#f8faf8]">
                  <section data-admissions-chart-section="readiness" aria-labelledby="admissions-chart-readiness">
                    <ChartBand id="admissions-chart-readiness" title="Admission readiness" />
                    <dl className="grid grid-cols-2 gap-px bg-[#bfcac5]">
                      <ReadinessFact label="Assessment" value={assessmentLabel} good={profile.assessmentSigned} />
                      <ReadinessFact label="Referral documents" value={formatProfileValue(profile.documentStatus)} good={profile.documentStatus === "Reviewed"} />
                      <ReadinessFact label="Open requirements" value={String(profile.openRequirements)} good={profile.openRequirements === 0} />
                      <ReadinessFact label="Blocking" value={String(profile.blockingRequirements)} good={profile.blockingRequirements === 0} />
                    </dl>
                  </section>

                  <section data-admissions-chart-section="progress" aria-labelledby="admissions-chart-progress">
                    <ChartBand id="admissions-chart-progress" title="Workflow progress" detail={`Stage ${currentStage + 1} of ${PROGRESS_STAGES.length}`} />
                    <div className="bg-[#fffefb] px-4 py-5 sm:px-6">
                      <div className="relative">
                        <span aria-hidden="true" className="absolute left-[16.66%] right-[16.66%] top-4 h-px bg-[#c8d2cd]" />
                        <ol className="relative grid grid-cols-3 gap-2" aria-label="Referral progress">
                          {PROGRESS_STAGES.map((stage, index) => {
                            const complete = index < currentStage;
                            const current = index === currentStage;
                            return (
                              <li key={stage.key} className="relative z-[1] flex min-w-0 flex-col items-center text-center" data-admissions-progress-step={stage.key}>
                                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-semibold ${complete ? "border-[#0f795f] bg-[#0f795f] text-white" : current ? "border-[#0f795f] bg-white text-[#0f795f] ring-4 ring-[#dff0e9]" : "border-[#cfd8d3] bg-white text-[#8b938f]"}`}>
                                  {complete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                                </span>
                                <span className={`mt-2 max-w-[100px] text-[9px] leading-4 ${current ? "font-semibold text-[#25463d]" : "font-medium text-[#747c78]"}`}>{stage.label}</span>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    </div>
                  </section>

                  <section data-admissions-chart-section="workflow" aria-labelledby="admissions-chart-workflow">
                    <ChartBand id="admissions-chart-workflow" title="Workflow details" detail={card.status} />
                    <dl className="grid grid-cols-2 gap-px bg-[#bfcac5]">
                      <ProgressFact icon={<UserRound className="h-3.5 w-3.5" aria-hidden="true" />} label="Assigned to" value={card.owner || "Unassigned"} />
                      <ProgressFact icon={<Clock3 className="h-3.5 w-3.5" aria-hidden="true" />} label="Time open" value={formatLongDays(card.daysOpen)} />
                      <ProgressFact icon={<Clock3 className="h-3.5 w-3.5" aria-hidden="true" />} label="Last update" value={formatLastUpdate(card.daysSinceUpdate)} />
                      <ProgressFact label="Priority" value={formatPriority(card.priority)} />
                      <ProgressFact icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />} label="Planned admission" value={formatPlannedDate(card.plannedAdmissionDate)} />
                      <ProgressFact label="Community" value={communityName(card)} />
                    </dl>
                  </section>

                  <section data-admissions-chart-section="review" aria-labelledby="admissions-chart-review">
                    <ChartBand id="admissions-chart-review" title="Review focus" />
                    <div className={`flex items-start gap-3 px-5 py-4 sm:px-6 ${attentionLabels.length ? "bg-[#fffaf0]" : "bg-[#f7faf8]"}`}>
                      <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${attentionLabels.length ? "bg-[#fff0ca] text-[#805d16]" : "bg-[#e5f2ec] text-[#176d51]"}`}>
                        {attentionLabels.length ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      </span>
                      <div>
                        <p className="text-[11px] font-semibold text-[#303532]">{attentionLabels.length ? "Needs follow-up" : "Current review"}</p>
                        <p className="mt-1 text-[12px] leading-5 text-[#5f6762]">
                          {attentionLabels.length ? attentionLabels.join(" · ") : "No workflow exceptions are flagged in the current update."}
                        </p>
                      </div>
                    </div>
                  </section>
                </aside>
              </div>

              <div className="border-t border-[#cfd6d2] bg-[#f7f9f7] px-5 py-3 text-center text-[10px] leading-4 text-[#7f8783] sm:px-8">
                Updated {formatUpdatedAt(generatedAt)} · Assessment detail appears only from the signed chart; intake fields retain their source status.
              </div>
            </div>

            <footer className="shrink-0 border-t border-[#c7cfcb] bg-[#f8faf8] px-5 py-3 sm:px-7 sm:py-4">
              <button type="button" onClick={onClose} style={{ color: "#ffffff" }} className="min-h-11 w-full rounded-lg bg-[#163f36] px-4 text-[12px] font-semibold transition hover:bg-[#0f795f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]">
                Done
              </button>
            </footer>
          </article>
        </div>
      </section>
    </div>,
    document.body
  );
}

function ProgressFact({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 bg-white px-4 py-3.5">
      <dt className="flex items-center gap-1.5 text-[10px] font-medium text-[#7b837f]">{icon}{label}</dt>
      <dd className="mt-1.5 break-words text-[12px] font-semibold leading-5 text-[#303532]" title={value}>{value}</dd>
    </div>
  );
}

function ReadinessFact({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="min-w-0 bg-white px-4 py-4">
      <dt className="text-[9px] font-medium uppercase tracking-[0.08em] text-[#7b837f]">{label}</dt>
      <dd className={`mt-1.5 break-words text-[12px] font-semibold leading-5 ${good ? "text-[#176d51]" : "text-[#574f38]"}`}>{value}</dd>
    </div>
  );
}

function ChartEmpty({ children }: { children: ReactNode }) {
  return <p className="bg-[#fffefb] px-5 py-5 text-[12px] leading-5 text-[#727a76] sm:px-8">{children}</p>;
}

function ChartBand({ id, title, detail }: { id: string; title: string; detail?: string | undefined }) {
  return (
    <h3 id={id} className="flex items-center justify-between gap-4 border-y border-[#aebbb5] bg-[#eaf1ee] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#244b41] sm:px-6 sm:text-[11px]">
      {title}
      {detail ? <span className="text-right text-[10px] font-medium normal-case tracking-normal text-[#62706a]">{detail}</span> : null}
    </h3>
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

function CommunityPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] ${active ? "border-[#0f795f] bg-[#e5f2ec] text-[#145e48]" : "border-[#d9dfdb] bg-white text-[#59615c] hover:border-[#9eb9ac] hover:bg-[#f7faf8]"}`}
    >
      {children}
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

function formatProfileValue(value: string | null) {
  if (!value) return "Not recorded";
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function formatProfileDate(value: string | null) {
  if (!value) return "Not recorded";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatConservedStatus(value: string | null) {
  if (!value) return "Not recorded";
  if (value.toLowerCase() === "yes") return "Yes";
  if (value.toLowerCase() === "no") return "No";
  return formatProfileValue(value);
}

function medicationSourceLabel(value: "signed_assessment" | "referral" | null) {
  if (value === "signed_assessment") return "Signed assessment";
  if (value === "referral") return "Referral-reported";
  return undefined;
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
