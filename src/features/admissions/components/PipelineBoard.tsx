import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, FileText, X } from "lucide-react";

import type {
  AdmissionsBoardCard,
  AdmissionsBoardColumnKey
} from "../../../shared/types/platformSnapshot";

type ChartDataPoint =
  | "status"
  | "placement"
  | "referral"
  | "coverage"
  | "client"
  | "owner-timing"
  | "assessment"
  | "documents"
  | "requirements";

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

export function ProgressModal({
  card,
  generatedAt,
  sourceNotice,
  onClose
}: {
  card: AdmissionsBoardCard;
  generatedAt: string;
  sourceNotice?: string | null;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [expandedDataPoint, setExpandedDataPoint] = useState<ChartDataPoint | null>(null);
  const expandedDataPointRef = useRef<ChartDataPoint | null>(null);
  const onCloseRef = useRef(onClose);
  expandedDataPointRef.current = expandedDataPoint;
  onCloseRef.current = onClose;
  const currentStage = PROGRESS_STAGES.findIndex((stage) => stage.key === card.column);
  const profile = card.managementProfile;
  const decisionTab = decisionTabFor(card);
  const assessmentLabel = profile.assessmentSigned
    ? `Signed${profile.assessmentDate ? ` ${formatProfileDate(profile.assessmentDate)}` : ""}`
    : formatProfileValue(profile.assessmentStatus);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (expandedDataPointRef.current) setExpandedDataPoint(null);
        else onCloseRef.current();
      }
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
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  function toggleDataPoint(dataPoint: ChartDataPoint) {
    setExpandedDataPoint((current) => current === dataPoint ? null : dataPoint);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#10221d]/40 p-2 [padding-bottom:max(0.5rem,env(safe-area-inset-bottom))] [padding-top:max(0.5rem,env(safe-area-inset-top))] backdrop-blur-[2px] sm:p-6"
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
            className="flex h-16 min-w-0 flex-1 items-center rounded-t-xl border border-b-0 border-[#ccb98f] bg-[#f2e5c9] p-2 shadow-[0_-3px_12px_rgba(49,40,18,0.07)] sm:h-[72px] sm:p-[3px]"
          >
            <div
              data-admissions-chart-name-label="true"
              className="flex h-full w-full min-w-0 items-center rounded-[4px] border border-[#d7d0c1] bg-[#fffdfa] px-3.5 shadow-[0_1px_2px_rgba(58,47,24,0.08)] sm:px-5"
            >
              <span data-admissions-chart-tab-name="true" className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[#202321] sm:text-[17px]">Client file</span>
            </div>
          </div>
          <span className="admissions-client-cover-reference">Referral #{card.referralId}</span>
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
              aria-label="Close client file"
              className="absolute right-3 top-3 z-20 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d3dad6] bg-white text-[#4e5752] shadow-sm transition hover:bg-[#eef3f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] sm:right-5 sm:top-4"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {sourceNotice ? <p role="status" className="border-b border-[#d8c5a0] bg-[#fbf4e5] py-3 pl-5 pr-16 text-sm text-[#79531c] sm:pl-8 sm:pr-20">{sourceNotice}</p> : null}
              <header className="admissions-client-document-header">
                <div className="admissions-client-document-identity">
                  <span className="admissions-client-document-icon" aria-hidden="true"><FileText size={22} strokeWidth={1.8} /></span>
                  <div className="min-w-0">
                    <span className="admissions-client-document-eyebrow">Admissions referral · {communityName(card)}</span>
                    <h2 id="admissions-progress-title">{card.clientName}</h2>
                  </div>
                </div>
                <span data-admissions-decision-tab={decisionTab.state} className="admissions-client-document-status">{card.status}</span>
              </header>
              <section data-admissions-chart-section="next-action" aria-labelledby="admissions-chart-next-action" className="admissions-client-next-action">
                <h3 id="admissions-chart-next-action">Next step</h3>
                <p>{card.nextAction || "No next step recorded"}</p>
              </section>

              <div className="mx-auto w-full max-w-[1000px]" data-admissions-chart-stream="true">
                <section data-admissions-chart-section="admission-brief" aria-labelledby="admissions-chart-admission-brief">
                  <ChartSectionHeader id="admissions-chart-admission-brief" number="01" title="Admission brief" />
                  <div className="divide-y divide-[#dfe5e1] border-b border-[#bfcac5] bg-[#fffefb]">
                    <ChartDisclosureRow
                      id="status"
                      label="Pipeline status"
                      value={card.status}
                      expanded={expandedDataPoint === "status"}
                      onToggle={() => toggleDataPoint("status")}
                    >
                      <DataPointGrid>
                        <DataPointFact label="Board stage" value={PROGRESS_STAGES[currentStage]?.label ?? "In progress"} />
                        <DataPointFact label="Next step" value={card.nextAction || "No next step recorded"} wide />
                      </DataPointGrid>
                    </ChartDisclosureRow>
                    <ChartDisclosureRow
                      id="placement"
                      label="Placement"
                      value={`${communityName(card)} · ${formatPlannedDate(card.plannedAdmissionDate)}`}
                      expanded={expandedDataPoint === "placement"}
                      onToggle={() => toggleDataPoint("placement")}
                    >
                      <DataPointGrid>
                        <DataPointFact label="Destination community" value={communityName(card)} />
                        <DataPointFact label="Planned admission" value={formatPlannedDate(card.plannedAdmissionDate)} />
                      </DataPointGrid>
                    </ChartDisclosureRow>
                    <ChartDisclosureRow
                      id="referral"
                      label="Referral origin"
                      value={`${formatProfileValue(profile.referralSource)} · ${formatProfileValue(profile.referringCounty)}`}
                      expanded={expandedDataPoint === "referral"}
                      onToggle={() => toggleDataPoint("referral")}
                    >
                      <DataPointGrid>
                        <DataPointFact label="Referral source" value={formatProfileValue(profile.referralSource)} />
                        <DataPointFact label="Client county" value={formatProfileValue(profile.referringCounty)} />
                      </DataPointGrid>
                    </ChartDisclosureRow>
                    <ChartDisclosureRow
                      id="coverage"
                      label="Coverage"
                      value={`${formatProfileValue(profile.payer)} · ${formatProfileValue(profile.responsiblePerson)}`}
                      expanded={expandedDataPoint === "coverage"}
                      onToggle={() => toggleDataPoint("coverage")}
                    >
                      <DataPointGrid>
                        <DataPointFact label="Payer" value={formatProfileValue(profile.payer)} />
                        <DataPointFact label="Responsible person" value={formatProfileValue(profile.responsiblePerson)} />
                      </DataPointGrid>
                    </ChartDisclosureRow>
                    <ChartDisclosureRow
                      id="client"
                      label="Client details"
                      value={`${formatProfileDate(profile.dateOfBirth)} · Conserved ${formatConservedStatus(profile.conservedStatus).toLowerCase()}`}
                      expanded={expandedDataPoint === "client"}
                      onToggle={() => toggleDataPoint("client")}
                    >
                      <DataPointGrid>
                        <DataPointFact label="Date of birth" value={formatProfileDate(profile.dateOfBirth)} />
                        <DataPointFact label="Conserved" value={formatConservedStatus(profile.conservedStatus)} />
                      </DataPointGrid>
                    </ChartDisclosureRow>
                  </div>
                </section>

                <section data-admissions-chart-section="workflow" aria-labelledby="admissions-chart-workflow">
                  <ChartSectionHeader id="admissions-chart-workflow" number="02" title="Workflow and readiness" detail={`Stage ${currentStage + 1} of ${PROGRESS_STAGES.length}`} />
                  <div className="border-b border-[#d8dfdb] bg-[#f7faf8] px-5 py-6 sm:px-8 sm:py-7">
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
                  <div className="divide-y divide-[#dfe5e1] border-b border-[#bfcac5] bg-[#fffefb]">
                    <ChartDisclosureRow
                      id="owner-timing"
                      label="Owner and timing"
                      value={`${card.owner || "Unassigned"} · ${formatLongDays(card.daysOpen)}`}
                      expanded={expandedDataPoint === "owner-timing"}
                      onToggle={() => toggleDataPoint("owner-timing")}
                    >
                      <DataPointGrid>
                        <DataPointFact label="Owner" value={card.owner || "Unassigned"} />
                        <DataPointFact label="Priority" value={`${formatPriority(card.priority)} priority`} />
                        <DataPointFact label="Time open" value={formatLongDays(card.daysOpen)} />
                        <DataPointFact label="Last Pipeline update" value={formatLastUpdate(card.daysSinceUpdate)} />
                      </DataPointGrid>
                    </ChartDisclosureRow>
                    <ChartDisclosureRow
                      id="assessment"
                      label="Assessment"
                      value={assessmentLabel}
                      tone={profile.assessmentSigned ? "positive" : "attention"}
                      expanded={expandedDataPoint === "assessment"}
                      onToggle={() => toggleDataPoint("assessment")}
                    >
                      <DataPointGrid>
                        <DataPointFact label="Assessment status" value={formatProfileValue(profile.assessmentStatus)} />
                        <DataPointFact label="Signed" value={profile.assessmentSigned ? "Yes" : "No"} />
                        <DataPointFact label="Assessment date" value={formatProfileDate(profile.assessmentDate)} />
                        <DataPointFact label="Context source" value={profile.assessmentSigned ? "Signed assessment" : "Current intake record"} />
                      </DataPointGrid>
                    </ChartDisclosureRow>
                    <ChartDisclosureRow
                      id="documents"
                      label="Referral documents"
                      value={formatProfileValue(profile.documentStatus)}
                      tone={profile.documentStatus === "Reviewed" ? "positive" : "attention"}
                      expanded={expandedDataPoint === "documents"}
                      onToggle={() => toggleDataPoint("documents")}
                    >
                      <DataPointGrid>
                        <DataPointFact label="Document status" value={formatProfileValue(profile.documentStatus)} />
                        <DataPointFact label="Recorded in" value="Pipeline referral record" />
                      </DataPointGrid>
                    </ChartDisclosureRow>
                    <ChartDisclosureRow
                      id="requirements"
                      label="Requirements"
                      value={`${profile.openRequirements} open · ${profile.blockingRequirements} blocking`}
                      tone={profile.openRequirements === 0 && profile.blockingRequirements === 0 ? "positive" : "attention"}
                      expanded={expandedDataPoint === "requirements"}
                      onToggle={() => toggleDataPoint("requirements")}
                    >
                      <DataPointGrid>
                        <DataPointFact label="Open requirements" value={String(profile.openRequirements)} />
                        <DataPointFact label="Blocking requirements" value={String(profile.blockingRequirements)} />
                      </DataPointGrid>
                    </ChartDisclosureRow>
                  </div>
                </section>

                <section data-admissions-chart-section="client-context" aria-labelledby="admissions-chart-client-context">
                  <ChartSectionHeader
                    id="admissions-chart-client-context"
                    number="03"
                    title="Client context"
                    detail={profile.assessmentSigned ? "Verified from signed assessment" : "Current intake record"}
                  />
                  <div className="grid border-b border-[#bfcac5] bg-[#fffefb] lg:grid-cols-2" data-admissions-client-context-grid="true">
                    <ChartContextBlock title="At a glance">
                      {profile.overview.length ? (
                        <ul className="space-y-3" data-admissions-management-overview="true">
                          {profile.overview.map((item) => (
                            <li key={item} className="flex items-start gap-3 text-[13px] leading-6 text-[#34423d]">
                              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#3c7563]" aria-hidden="true" />
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
                        <ul className="space-y-3" data-admissions-management-medications="true">
                          {profile.medications.map((medication, index) => (
                            <li key={`${medication}-${index}`} className="flex items-start gap-3 text-[13px] leading-6 text-[#34423d]">
                              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#3c7563]" aria-hidden="true" />
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
                Pipeline updated {formatUpdatedAt(generatedAt)} · Signed assessment details are identified above.
              </div>
            </div>

          </article>
        </div>
      </section>
    </div>,
    document.body
  );
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
    <div className={`grid min-w-0 gap-1.5 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-6 ${compact ? "py-3" : "px-5 py-4 sm:px-8"}`}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#6f7a75]">{label}</dt>
      <dd
        className={`break-words text-[13px] font-medium leading-5 ${tone === "positive" ? "text-[#176d51]" : tone === "attention" ? "text-[#75591d]" : "text-[#303532]"}`}
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
    <div className="border-b border-[#e1e6e3] px-5 py-6 last:border-b-0 sm:px-8 sm:py-7 lg:odd:border-r lg:last:col-span-2 lg:last:border-r-0">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h4 className="text-[12px] font-semibold tracking-[-0.01em] text-[#294d43]">{title}</h4>
        {detail ? <span className="text-right text-[10px] font-medium text-[#74807a]">{detail}</span> : null}
      </div>
      {children}
    </div>
  );
}

function ChartEmpty({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-6 text-[#67726d]">{children}</p>;
}

function ChartSectionHeader({
  id,
  number,
  title,
  detail
}: {
  id: string;
  number: string;
  title: string;
  detail?: string | undefined;
}) {
  return (
    <div className="admissions-client-section-heading flex flex-col items-start gap-1 border-y border-[#aebbb5] bg-[#eaf1ee] px-5 py-3.5 text-[#244b41] sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:px-8">
      <div className="admissions-client-section-title"><span aria-hidden="true">{number}</span><h3 id={id} className="text-[13px] font-semibold tracking-[-0.01em] sm:text-[14px]">{title}</h3></div>
      {detail ? <span className="min-w-0 text-[10px] font-medium leading-4 text-[#617069] sm:truncate sm:text-right sm:text-[11px]">{detail}</span> : null}
    </div>
  );
}

function ChartDisclosureRow({
  id,
  label,
  value,
  tone = "default",
  expanded,
  onToggle,
  children
}: {
  id: ChartDataPoint;
  label: string;
  value: string;
  tone?: "default" | "positive" | "attention";
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const detailId = `admissions-data-detail-${id}`;
  return (
    <div data-admissions-data-point={id}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailId}
        data-admissions-data-trigger={id}
        className={`group grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-4 text-left transition-colors hover:bg-[#f4f8f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0f8b73] sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:gap-x-6 sm:px-8 sm:py-[18px] ${expanded ? "bg-[#f3f8f5]" : "bg-[#fffefb]"}`}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#66736d]">{label}</span>
        <span className={`col-start-1 mt-1.5 min-w-0 break-words text-[14px] font-semibold leading-5 sm:col-start-2 sm:mt-0 ${tone === "positive" ? "text-[#176d51]" : tone === "attention" ? "text-[#75591d]" : "text-[#252b28]"}`} title={value}>
          {value}
        </span>
        <span className="col-start-2 row-span-2 row-start-1 inline-flex h-8 w-8 items-center justify-center self-center rounded-full border border-[#d6dfda] bg-white text-[#4e7166] shadow-sm sm:col-start-3 sm:row-span-1">
          <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : "group-hover:translate-x-0.5"}`} aria-hidden="true" />
          <span className="sr-only">{expanded ? "Hide detail" : "Show detail"}</span>
        </span>
      </button>
      {expanded ? (
        <div id={detailId} data-admissions-data-detail={id} className="border-t border-[#dce5e0] bg-[#f7faf8] px-5 py-5 sm:px-8 sm:py-6">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function DataPointGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-3 sm:grid-cols-2" data-admissions-data-detail-grid="true">{children}</dl>;
}

function DataPointFact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-[#dce4df] bg-white px-4 py-3 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#77827d]">{label}</dt>
      <dd className="mt-1.5 break-words text-[13px] font-semibold leading-5 text-[#2d3733]">{value}</dd>
    </div>
  );
}

function communityName(card: AdmissionsBoardCard) {
  return card.facilityId ? card.community : "No community";
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
