import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, ChevronRight, Columns3, List, X } from "lucide-react";

import type {
  AdmissionsBoardCard,
  AdmissionsBoardColumnKey,
  AdmissionsReferralPipeline
} from "../../../shared/types/platformSnapshot";

type ConnectedPipeline = Extract<AdmissionsReferralPipeline, { status: "connected" }>;
type ChartDrilldown = "admission" | "workflow" | "context";

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
          <div data-admissions-layout-toggle="true" className="flex shrink-0 self-end gap-1 sm:self-start" role="group" aria-label="Board layout">
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
                        <BoardCard card={card} onOpen={() => setSelectedCard(card)} />
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
    className: "border-[#145b43] bg-[#197453] !text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
  },
  deny: {
    state: "deny",
    label: "Deny",
    className: "border-[#8f3932] bg-[#b64c43] text-white"
  },
  inProgress: {
    state: "in-progress",
    label: "In progress",
    className: "border-[#3159b8] bg-[#365fc7] !text-white"
  },
  underReview: {
    state: "under-review",
    label: "Under review",
    className: "border-[#d2a126] bg-[#f3c64f] text-[#403000] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
  }
} as const;

function decisionTabFor(card: AdmissionsBoardCard) {
  const status = card.status
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (status.includes("declin") || status.includes("deni")) return DECISION_TAB.deny;
  if (
    status.startsWith("accept") ||
    status === "awaiting admit" ||
    status === "meet the client not sent"
  ) {
    return DECISION_TAB.accept;
  }
  if (status === "under review") return DECISION_TAB.underReview;
  return DECISION_TAB.inProgress;
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
  const drilldownCloseButtonRef = useRef<HTMLButtonElement>(null);
  const [activeDrilldown, setActiveDrilldown] = useState<ChartDrilldown | null>(null);
  const currentStage = PROGRESS_STAGES.findIndex((stage) => stage.key === card.column);
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
      if (event.key === "Escape") {
        if (activeDrilldown) setActiveDrilldown(null);
        else onClose();
      }
      if (event.key === "Tab") {
        const focusScope = activeDrilldown
          ? dialogRef.current?.querySelector<HTMLElement>("[data-admissions-drilldown-panel='true']")
          : dialogRef.current;
        const focusable = [...(focusScope?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? [])]
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
  }, [activeDrilldown, onClose]);

  useEffect(() => {
    if (activeDrilldown) drilldownCloseButtonRef.current?.focus();
  }, [activeDrilldown]);

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
            className="flex h-16 min-w-0 items-center rounded-t-xl border border-b-0 border-[#ccb98f] bg-[#f2e5c9] p-2 shadow-[0_-3px_12px_rgba(49,40,18,0.07)] sm:h-[72px] sm:p-[3px]"
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
                <h3 id="admissions-chart-next-action" className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#517067]">Current management focus</h3>
                <p className="mt-1.5 text-[15px] font-semibold leading-6 text-[#183f34]">{card.nextAction || "Confirm the next workflow step"}</p>
              </section>

              <div className="mx-auto w-full max-w-[980px]" data-admissions-chart-stream="true">
                <section data-admissions-chart-section="admission-brief" aria-labelledby="admissions-chart-admission-brief">
                  <ChartBand id="admissions-chart-admission-brief" title="Admission brief" detail={card.status} onOpen={() => setActiveDrilldown("admission")} />
                  <dl className="divide-y divide-[#e1e5e2] border-b border-[#bfcac5] bg-[#fffefb]">
                    <ChartRow label="Placement" value={`${communityName(card)} · Planned admission ${formatPlannedDate(card.plannedAdmissionDate)}`} />
                    <ChartRow label="Referral" value={`${formatProfileValue(profile.referralSource)} · ${formatProfileValue(profile.referringCounty)}`} />
                    <ChartRow label="Coverage" value={`${formatProfileValue(profile.payer)} · Responsible person ${formatProfileValue(profile.responsiblePerson)}`} />
                    <ChartRow label="Client" value={`Born ${formatProfileDate(profile.dateOfBirth)} · Conserved ${formatConservedStatus(profile.conservedStatus).toLowerCase()}`} />
                  </dl>
                </section>

                <section data-admissions-chart-section="workflow" aria-labelledby="admissions-chart-workflow">
                  <ChartBand id="admissions-chart-workflow" title="Workflow and readiness" detail={`Stage ${currentStage + 1} of ${PROGRESS_STAGES.length}`} onOpen={() => setActiveDrilldown("workflow")} />
                  <div className="border-b border-[#d8dfdb] bg-[#f8faf8] px-5 py-5 sm:px-8 sm:py-6">
                    <div className="relative mx-auto max-w-[640px]">
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
                              <span className={`mt-2 max-w-[120px] text-[10px] leading-4 ${current ? "font-semibold text-[#25463d]" : "font-medium text-[#747c78]"}`}>{stage.label}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  </div>
                  <dl className="divide-y divide-[#e1e5e2] border-b border-[#bfcac5] bg-[#fffefb]">
                    <ChartRow label="Owner and timing" value={`${card.owner || "Unassigned"} · ${formatPriority(card.priority)} priority · ${formatLongDays(card.daysOpen)} · ${formatLastUpdate(card.daysSinceUpdate)}`} />
                    <ChartRow label="Assessment" value={assessmentLabel} tone={profile.assessmentSigned ? "positive" : "attention"} />
                    <ChartRow label="Referral documents" value={formatProfileValue(profile.documentStatus)} tone={profile.documentStatus === "Reviewed" ? "positive" : "attention"} />
                    <ChartRow
                      label="Requirements"
                      value={`${profile.openRequirements} open · ${profile.blockingRequirements} blocking`}
                      tone={profile.openRequirements === 0 && profile.blockingRequirements === 0 ? "positive" : "attention"}
                    />
                  </dl>
                </section>

                <section data-admissions-chart-section="client-context" aria-labelledby="admissions-chart-client-context">
                  <ChartBand
                    id="admissions-chart-client-context"
                    title="Client context"
                    detail={profile.assessmentSigned ? "Verified from signed assessment" : "Current intake record"}
                    onOpen={() => setActiveDrilldown("context")}
                  />
                  <div className="divide-y divide-[#e1e5e2] border-b border-[#bfcac5] bg-[#fffefb]">
                    <ChartContextBlock title="At a glance">
                      {profile.overview.length ? (
                        <ul className="space-y-2.5" data-admissions-management-overview="true">
                          {profile.overview.map((item) => (
                            <li key={item} className="flex items-start gap-2.5 text-[12px] leading-5 text-[#424b47]">
                              <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#4b7c6b]" aria-hidden="true" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <ChartEmpty>{profile.assessmentSigned ? "No management narrative is recorded in the signed assessment." : "This brief fills in when the assessment is signed."}</ChartEmpty>
                      )}
                    </ChartContextBlock>

                    <ChartContextBlock title="Care and support">
                      {profile.supportSnapshot.length ? (
                        <dl className="divide-y divide-[#e7eae8]" data-admissions-management-support="true">
                          {profile.supportSnapshot.map((item) => <ChartRow key={item.label} label={item.label} value={item.value} compact />)}
                        </dl>
                      ) : (
                        <ChartEmpty>{profile.assessmentSigned ? "No structured support details are recorded." : "Verified support details become available after the assessment is signed."}</ChartEmpty>
                      )}
                    </ChartContextBlock>

                    <ChartContextBlock title="Medication handoff" detail={medicationSourceLabel(profile.medicationSource)}>
                      {profile.medications.length ? (
                        <ul className="space-y-2" data-admissions-management-medications="true">
                          {profile.medications.map((medication, index) => (
                            <li key={`${medication}-${index}`} className="flex items-start gap-2.5 text-[12px] leading-5 text-[#424b47]">
                              <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#4b7c6b]" aria-hidden="true" />
                              <span>{medication}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <ChartEmpty>No medication list is recorded in the current referral or signed assessment.</ChartEmpty>
                      )}
                    </ChartContextBlock>
                  </div>
                </section>
              </div>

              <div className="border-t border-[#cfd6d2] bg-[#f7f9f7] px-5 py-3 text-center text-[10px] leading-4 text-[#7f8783] sm:px-8">
                Updated {formatUpdatedAt(generatedAt)} · Assessment detail appears only from the signed chart; intake fields retain their source status.
              </div>
            </div>

            {activeDrilldown ? (
              <ChartDrilldownSheet
                card={card}
                generatedAt={generatedAt}
                drilldown={activeDrilldown}
                closeButtonRef={drilldownCloseButtonRef}
                onClose={() => setActiveDrilldown(null)}
              />
            ) : null}

          </article>
        </div>
      </section>
    </div>,
    document.body
  );
}

const DRILLDOWN_TITLES: Record<ChartDrilldown, string> = {
  admission: "Admission status and placement",
  workflow: "Workflow and readiness",
  context: "Client context and handoff"
};

function ChartDrilldownSheet({
  card,
  generatedAt,
  drilldown,
  closeButtonRef,
  onClose
}: {
  card: AdmissionsBoardCard;
  generatedAt: string;
  drilldown: ChartDrilldown;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const profile = card.managementProfile;
  const decision = decisionTabFor(card);
  const currentStage = PROGRESS_STAGES.find((stage) => stage.key === card.column)?.label ?? "In progress";
  const assessmentLabel = profile.assessmentSigned
    ? `Signed${profile.assessmentDate ? ` ${formatProfileDate(profile.assessmentDate)}` : ""}`
    : formatProfileValue(profile.assessmentStatus);

  return (
    <div
      className="absolute inset-0 z-30 flex justify-end bg-[#10221d]/20 backdrop-blur-[1px]"
      data-admissions-drilldown="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        data-admissions-drilldown-panel="true"
        aria-labelledby="admissions-drilldown-title"
        className="flex h-full w-full min-w-0 flex-col border-l border-[#c6d0cb] bg-[#fffefb] shadow-[-18px_0_50px_rgba(19,43,35,0.18)] sm:max-w-[680px]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#bfcac5] bg-[#edf5f1] px-5 py-5 sm:px-7 sm:py-6">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#517067]">Client chart detail</p>
            <h2 id="admissions-drilldown-title" className="mt-1.5 text-[21px] font-semibold leading-7 tracking-[-0.025em] text-[#183f34] sm:text-[25px]">
              {DRILLDOWN_TITLES[drilldown]}
            </h2>
            <p className="mt-1 truncate text-[11px] text-[#66716c]">{card.clientName} · Referral #{card.referralId}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close chart detail"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#cbd5d0] bg-white text-[#4e5752] shadow-sm transition hover:bg-[#f5f8f6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto" data-admissions-drilldown-content={drilldown}>
          {drilldown === "admission" ? (
            <>
              <DrilldownSection title="Status transparency" detail="Direct from Pipeline">
                <div className="rounded-xl border border-[#dbe2de] bg-[#f8faf8] p-4">
                  <span className={`inline-flex rounded-md border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.07em] ${decision.className}`}>{decision.label}</span>
                  <p className="mt-3 text-[13px] leading-6 text-[#3e4944]" data-admissions-drilldown-status-explanation="true">
                    {statusCategoryExplanation(decision.state)}
                  </p>
                </div>
                <dl className="mt-4 divide-y divide-[#e1e5e2] border-y border-[#d8dfdb]">
                  <ChartRow label="Pipeline status" value={card.status} compact />
                  <ChartRow label="Board stage" value={currentStage} compact />
                  <ChartRow label="Management focus" value={card.nextAction || "Confirm the next workflow step"} compact />
                </dl>
              </DrilldownSection>

              <DrilldownSection title="Placement">
                <dl className="divide-y divide-[#e1e5e2] border-y border-[#d8dfdb]">
                  <ChartRow label="Destination" value={communityName(card)} compact />
                  <ChartRow label="Planned admission" value={formatPlannedDate(card.plannedAdmissionDate)} compact />
                  <ChartRow label="Coverage" value={formatProfileValue(profile.payer)} compact />
                  <ChartRow label="Responsible person" value={formatProfileValue(profile.responsiblePerson)} compact />
                </dl>
              </DrilldownSection>

              <DrilldownSection title="Referral origin">
                <dl className="divide-y divide-[#e1e5e2] border-y border-[#d8dfdb]">
                  <ChartRow label="Source" value={formatProfileValue(profile.referralSource)} compact />
                  <ChartRow label="County" value={formatProfileValue(profile.referringCounty)} compact />
                  <ChartRow label="Date of birth" value={formatProfileDate(profile.dateOfBirth)} compact />
                  <ChartRow label="Conserved" value={formatConservedStatus(profile.conservedStatus)} compact />
                </dl>
              </DrilldownSection>
            </>
          ) : null}

          {drilldown === "workflow" ? (
            <>
              <DrilldownSection title="Current position" detail={`Stage ${Math.max(1, PROGRESS_STAGES.findIndex((stage) => stage.key === card.column) + 1)} of ${PROGRESS_STAGES.length}`}>
                <dl className="divide-y divide-[#e1e5e2] border-y border-[#d8dfdb]">
                  <ChartRow label="Stage" value={currentStage} compact />
                  <ChartRow label="Pipeline status" value={card.status} compact />
                  <ChartRow label="Next step" value={card.nextAction || "Confirm the next workflow step"} compact />
                </dl>
              </DrilldownSection>

              <DrilldownSection title="Ownership and timing">
                <dl className="divide-y divide-[#e1e5e2] border-y border-[#d8dfdb]">
                  <ChartRow label="Owner" value={card.owner || "Unassigned"} compact />
                  <ChartRow label="Priority" value={formatPriority(card.priority)} compact />
                  <ChartRow label="Time open" value={formatLongDays(card.daysOpen)} compact />
                  <ChartRow label="Last Pipeline update" value={formatLastUpdate(card.daysSinceUpdate)} compact />
                </dl>
              </DrilldownSection>

              <DrilldownSection title="Readiness">
                <dl className="divide-y divide-[#e1e5e2] border-y border-[#d8dfdb]">
                  <ChartRow label="Assessment" value={assessmentLabel} tone={profile.assessmentSigned ? "positive" : "attention"} compact />
                  <ChartRow label="Referral documents" value={formatProfileValue(profile.documentStatus)} tone={profile.documentStatus === "Reviewed" ? "positive" : "attention"} compact />
                  <ChartRow label="Open requirements" value={String(profile.openRequirements)} tone={profile.openRequirements ? "attention" : "positive"} compact />
                  <ChartRow label="Blocking requirements" value={String(profile.blockingRequirements)} tone={profile.blockingRequirements ? "attention" : "positive"} compact />
                </dl>
              </DrilldownSection>
            </>
          ) : null}

          {drilldown === "context" ? (
            <>
              <DrilldownSection
                title="Assessment context"
                detail={profile.assessmentSigned ? "Verified signed assessment" : "Current intake record"}
              >
                {profile.overview.length ? (
                  <DrilldownList items={profile.overview} dataAttribute="overview" />
                ) : (
                  <ChartEmpty>{profile.assessmentSigned ? "No management narrative is recorded in the signed assessment." : "This context fills in when the assessment is signed."}</ChartEmpty>
                )}
              </DrilldownSection>

              <DrilldownSection title="Care and support">
                {profile.supportSnapshot.length ? (
                  <dl className="divide-y divide-[#e1e5e2] border-y border-[#d8dfdb]">
                    {profile.supportSnapshot.map((item) => <ChartRow key={item.label} label={item.label} value={item.value} compact />)}
                  </dl>
                ) : (
                  <ChartEmpty>{profile.assessmentSigned ? "No structured support details are recorded." : "Verified support details become available after the assessment is signed."}</ChartEmpty>
                )}
              </DrilldownSection>

              <DrilldownSection title="Medication handoff" detail={medicationSourceLabel(profile.medicationSource)}>
                {profile.medications.length ? (
                  <DrilldownList items={profile.medications} dataAttribute="medications" />
                ) : (
                  <ChartEmpty>No medication list is recorded in the current referral or signed assessment.</ChartEmpty>
                )}
              </DrilldownSection>
            </>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-[#d7ded9] bg-[#f7f9f7] px-5 py-3 text-[10px] leading-4 text-[#737d78] sm:px-7">
          Updated {formatUpdatedAt(generatedAt)} · Protected Pipeline summary · No raw notes or documents are shown.
        </footer>
      </aside>
    </div>
  );
}

function DrilldownSection({ title, detail, children }: { title: string; detail?: string | undefined; children: ReactNode }) {
  return (
    <section className="border-b border-[#dce2df] px-5 py-5 last:border-b-0 sm:px-7 sm:py-6" data-admissions-drilldown-section={title.toLowerCase().replaceAll(" ", "-")}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#35584f]">{title}</h3>
        {detail ? <span className="text-right text-[10px] text-[#74807a]">{detail}</span> : null}
      </div>
      {children}
    </section>
  );
}

function DrilldownList({ items, dataAttribute }: { items: string[]; dataAttribute: string }) {
  return (
    <ul className="divide-y divide-[#e3e7e5] border-y border-[#d8dfdb]" data-admissions-drilldown-list={dataAttribute}>
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex items-start gap-3 py-3 text-[12px] leading-5 text-[#3f4945]">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#4b7c6b]" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function statusCategoryExplanation(state: string) {
  if (state === "under-review") return "Pipeline explicitly marks this referral Under Review. The yellow category reflects that recorded decision state.";
  if (state === "accept") return "Pipeline records an accepted referral moving toward admission. The green category reflects that source status.";
  if (state === "deny") return "Pipeline records a declined or denied referral. The red category reflects that source status.";
  return "Pipeline has not recorded Accept, Deny, or the explicit Under Review selection. This referral remains In progress.";
}

function ChartRow({
  label,
  value,
  tone = "default",
  compact = false
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "attention";
  compact?: boolean;
}) {
  return (
    <div className={`grid min-w-0 gap-1 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-6 ${compact ? "py-2.5" : "px-5 py-3.5 sm:px-8"}`}>
      <dt className="text-[10px] font-medium uppercase tracking-[0.07em] text-[#7b837f]">{label}</dt>
      <dd
        className={`break-words text-[12px] font-semibold leading-5 ${tone === "positive" ? "text-[#176d51]" : tone === "attention" ? "text-[#75591d]" : "text-[#303532]"}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function ChartContextBlock({
  title,
  detail,
  children
}: {
  title: string;
  detail?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="px-5 py-5 sm:px-8 sm:py-6">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#4f5e58]">{title}</h4>
        {detail ? <span className="text-right text-[10px] text-[#7a837e]">{detail}</span> : null}
      </div>
      {children}
    </div>
  );
}

function ChartEmpty({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-5 text-[#727a76]">{children}</p>;
}

function ChartBand({
  id,
  title,
  detail,
  onOpen
}: {
  id: string;
  title: string;
  detail?: string | undefined;
  onOpen: () => void;
}) {
  return (
    <h3 id={id} className="border-y border-[#aebbb5] bg-[#eaf1ee] text-[#244b41]">
      <button
        type="button"
        onClick={onOpen}
        data-admissions-drilldown-trigger={id.replace("admissions-chart-", "")}
        className="group flex w-full items-center justify-between gap-4 px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors hover:bg-[#e1ece7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0f8b73] sm:px-6 sm:text-[11px]"
      >
        <span>{title}</span>
        <span className="flex min-w-0 items-center gap-2 text-right text-[10px] font-medium normal-case tracking-normal text-[#62706a]">
          {detail ? <span className="truncate">{detail}</span> : null}
          <span className="hidden text-[#3f6a5e] sm:inline">View details</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#4c7468] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </button>
    </h3>
  );
}

function BoardCard({ card, onOpen }: { card: AdmissionsBoardCard; onOpen: () => void }) {
  const decision = decisionTabFor(card);
  const readiness = cardReadiness(card);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-admissions-board-card={card.referralId}
      aria-label={`${card.clientName}, referral ${card.referralId}, ${communityName(card)}, ${card.status}. View management briefing`}
      className="group block w-full rounded-xl border border-[#dfe3e1] bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition hover:-translate-y-px hover:border-[#bfc9c3] hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span data-admissions-client-name="true" className="block truncate text-[15px] font-semibold tracking-[-0.02em] text-[#171918]">{card.clientName}</span>
          <span className="mt-1 block truncate text-[11px] text-[#69716c]">Referral #{card.referralId} · {communityName(card)}</span>
        </div>
        <span data-admissions-card-decision={decision.state} className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.06em] ${decision.className}`}>{decision.label}</span>
      </div>

      <dl className="mt-4 divide-y divide-[#edf0ee] border-y border-[#edf0ee]" data-admissions-card-facts="true">
        <BoardCardFact label="Stage" value={card.status} />
        <BoardCardFact label="Owner" value={card.owner || "Unassigned"} />
        <BoardCardFact label="Timing" value={`${formatLongDays(card.daysOpen)} open · updated ${formatLastUpdate(card.daysSinceUpdate).toLowerCase()}`} />
        <BoardCardFact label="Planned admission" value={formatPlannedDate(card.plannedAdmissionDate)} />
      </dl>

      <div className="mt-3 flex items-start justify-between gap-3">
        <span data-admissions-card-readiness={readiness.tone} className={`min-w-0 text-[10px] font-semibold leading-4 ${readiness.className}`}>
          {readiness.label}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#0f795f]">
          Briefing
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
        {shown.map((card) => <li key={card.referralId}><BoardCard card={card} onOpen={() => onOpen(card)} /></li>)}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1040px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#e2e6e3] text-[10px] font-medium text-[#69716c]">
              <th className="px-4 py-4">Referral</th>
              <th className="px-4 py-4">Decision</th>
              <th className="px-4 py-4">Stage</th>
              <th className="px-4 py-4">Community</th>
              <th className="px-4 py-4">Owner</th>
              <th className="px-4 py-4">Timing</th>
              <th className="px-4 py-4">Planned admission</th>
              <th className="px-4 py-4">Readiness</th>
              <th className="px-4 py-4"><span className="sr-only">View management briefing</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((card) => {
              const decision = decisionTabFor(card);
              const readiness = cardReadiness(card);
              return (
              <tr key={card.referralId} className="border-b border-[#edf0ee] text-[12px] last:border-b-0 hover:bg-[#fafbfa]">
                <td className="px-4 py-4">
                  <span className="block font-semibold">{card.clientName}</span>
                  <span className="mt-0.5 block text-[11px] text-[#69716c]">Referral #{card.referralId}</span>
                </td>
                <td className="px-4 py-4"><span className={`inline-flex rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.06em] ${decision.className}`}>{decision.label}</span></td>
                <td className="px-4 py-4 font-medium">{card.status}</td>
                <td className="px-4 py-4">{communityName(card)}</td>
                <td className="px-4 py-4">{card.owner}</td>
                <td className="px-4 py-4"><span className="block">{formatLongDays(card.daysOpen)} open</span><span className="mt-0.5 block text-[11px] text-[#69716c]">Updated {formatLastUpdate(card.daysSinceUpdate).toLowerCase()}</span></td>
                <td className="px-4 py-4">{formatPlannedDate(card.plannedAdmissionDate)}</td>
                <td className={`px-4 py-4 text-[11px] font-semibold ${readiness.className}`}>{readiness.label}</td>
                <td className="px-4 py-4 text-right">
                  <button type="button" onClick={() => onOpen(card)} aria-label={`View management briefing for ${card.clientName}, referral ${card.referralId}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0f795f] hover:underline">
                    Briefing <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </td>
              </tr>
              );
            })}
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
      data-admissions-view-active={active ? "true" : "false"}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-[12px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] ${active ? "bg-[#e5f2ec] text-[#145e48]" : "bg-transparent text-[#59615c] hover:bg-[#f3f6f4] hover:text-[#2f4c43]"}`}
    >
      {icon}
      <span>{children}</span>
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

function communityName(card: AdmissionsBoardCard) {
  return card.facilityId ? card.community : "No community";
}

function BoardCardFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 py-2" data-admissions-card-fact={label.toLowerCase().replaceAll(" ", "-")}>
      <dt className="text-[9px] font-medium uppercase tracking-[0.07em] text-[#7b837f]">{label}</dt>
      <dd className="truncate text-[11px] font-semibold text-[#303532]" title={value}>{value}</dd>
    </div>
  );
}

function cardReadiness(card: AdmissionsBoardCard) {
  const profile = card.managementProfile;
  if (profile.blockingRequirements > 0) {
    return {
      tone: "blocked",
      label: `${profile.blockingRequirements} blocking ${profile.blockingRequirements === 1 ? "requirement" : "requirements"}`,
      className: "text-[#9a3f36]"
    } as const;
  }
  if (!profile.assessmentSigned) {
    return { tone: "assessment-pending", label: "Assessment not signed", className: "text-[#75591d]" } as const;
  }
  if (profile.documentStatus !== "Reviewed") {
    return { tone: "documents-pending", label: "Documents not reviewed", className: "text-[#75591d]" } as const;
  }
  if (profile.openRequirements > 0) {
    return {
      tone: "open-requirements",
      label: `${profile.openRequirements} open ${profile.openRequirements === 1 ? "requirement" : "requirements"}`,
      className: "text-[#75591d]"
    } as const;
  }
  return { tone: "ready", label: "No open requirements", className: "text-[#176d51]" } as const;
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
