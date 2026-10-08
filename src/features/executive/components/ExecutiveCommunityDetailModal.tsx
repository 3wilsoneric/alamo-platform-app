import { ArrowRight, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { formatMonthLabel } from "../../../../shared/period-utils.mjs";
import { CensusTrendModule } from "../../../shared/modules/CensusTrendModule";
import type { AdmissionsBoardCard, AdmissionsBoardColumnKey } from "../../../shared/types/platformSnapshot";
import type { ExecutiveDirectorCommunityDashboardResponse } from "../data/executiveDirectorApi";
import { formatExecutiveDate, formatExecutiveNumber } from "./executiveDashboardFormatters";

export type ExecutiveCommunityDetailView = "census" | "incidents" | "medications" | "admissions";

const VIEWS: Array<{ key: ExecutiveCommunityDetailView; label: string }> = [
  { key: "census", label: "Census" },
  { key: "incidents", label: "Incidents" },
  { key: "medications", label: "Medications" },
  { key: "admissions", label: "Admissions" }
];

const ADMISSION_STAGES: Array<{ key: AdmissionsBoardColumnKey; label: string }> = [
  { key: "received", label: "Received" },
  { key: "in_progress", label: "In progress" },
  { key: "decision", label: "Decision" }
];

function keepFocusInsideDialog(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (event.key !== "Tab" || !dialog) return;
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"))
    .filter((element) => !element.hasAttribute("disabled"));
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  const leavingStart = event.shiftKey && document.activeElement === first;
  const leavingEnd = !event.shiftKey && document.activeElement === last;
  if (!leavingStart && !leavingEnd) return;
  event.preventDefault();
  (leavingStart ? last : first).focus();
}

export function ExecutiveCommunityDetailModal({
  facility,
  dashboard,
  view,
  onViewChange,
  onClose,
  onOpenAdmissionCard
}: {
  facility: ExecutiveDirectorCommunityDashboardResponse["facility"];
  dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"];
  view: ExecutiveCommunityDetailView;
  onViewChange: (view: ExecutiveCommunityDetailView) => void;
  onClose: () => void;
  onOpenAdmissionCard: (card: AdmissionsBoardCard) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const title = VIEWS.find((item) => item.key === view)?.label ?? "Community detail";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      keepFocusInsideDialog(event, dialogRef.current);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      data-executive-community-modal-backdrop="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#111111]/72 p-0 backdrop-blur-[7px] sm:items-center sm:p-6 lg:p-10"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="executive-community-dialog-title"
        data-executive-community-detail-modal={view}
        className="relative z-10 flex h-dvh w-full max-w-[1344px] flex-col overflow-hidden border-t-[3px] border-t-[#0f8b73] bg-white text-[#111111] shadow-[0_24px_90px_rgba(0,0,0,0.42)] sm:h-[88dvh] sm:rounded-[16px] sm:border sm:border-t-[3px] sm:border-[#b3b3b3] sm:border-t-[#0f8b73]"
      >
        <header className="sticky top-0 z-20 shrink-0 border-b border-[#d9d9d9] bg-white">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0f8b73]">{facility.shortName}</p>
              <h1 id="executive-community-dialog-title" className="mt-0.5 text-[19px] font-semibold tracking-[-0.03em] sm:text-[22px]">{title}</h1>
            </div>
            <button ref={closeButtonRef} type="button" onClick={onClose} aria-label={`Close ${title} detail`} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[#d9d9d9] bg-white text-[#595959] transition-colors hover:border-[#111111] hover:text-[#111111] lg:h-9 lg:w-9">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Community detail sections" className="overflow-x-auto border-t border-[#eeeeee] px-4 sm:px-6">
            <div role="tablist" className="flex min-w-max gap-6">
              {VIEWS.map((item) => (
                <button key={item.key} type="button" role="tab" aria-selected={view === item.key} onClick={() => onViewChange(item.key)} className={`-mb-px min-h-12 border-b-2 px-0.5 text-[13px] transition-colors ${view === item.key ? "border-[#0f8b73] font-semibold text-[#173f36]" : "border-transparent font-medium text-[#69716c] hover:text-[#242a27]"}`}>
                  {item.label}
                </button>
              ))}
            </div>
          </nav>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f4f6f5] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
          {view === "census" ? <CensusDetail dashboard={dashboard} /> : null}
          {view === "incidents" ? <IncidentDetail dashboard={dashboard} /> : null}
          {view === "medications" ? <MedicationDetail dashboard={dashboard} /> : null}
          {view === "admissions" ? <AdmissionsDetail dashboard={dashboard} onOpenCard={onOpenAdmissionCard} /> : null}
        </div>
      </section>
    </div>,
    document.body
  );
}

function DetailHeader({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <header className="grid gap-4 border-b-2 border-[#111111] pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.42fr)] lg:items-end">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#0f8b73]">{eyebrow}</p><h2 className="mt-1 text-[30px] font-semibold tracking-[-0.045em] sm:text-[38px]">{title}</h2></div>
      <p className="text-[14px] leading-6 text-[#59625e] lg:border-l-[3px] lg:border-[#0f8b73] lg:pl-4">{copy}</p>
    </header>
  );
}

function CensusDetail({ dashboard }: { dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"] }) {
  const points = dashboard.census.map((point) => ({ id: point.month, label: formatMonthLabel(point.month, { fallback: point.month, month: "short" }), value: point.census }));
  return (
    <div data-executive-detail-view="census">
      <DetailHeader eyebrow="Resident census" title="Census history" copy="Governed monthly census for this community, shown without portfolio or cross-community data." />
      <div className="mt-8"><CensusTrendModule points={points} height={330} emptyLabel="Census history is not available for this community." /></div>
      <div className="mt-8">
        <h3 className="text-[20px] font-semibold tracking-[-0.025em]">Available periods</h3>
        {dashboard.census.length ? <ol className="mt-4 grid border-y border-[#aeb8b3] bg-white sm:grid-cols-2 lg:grid-cols-3">{[...dashboard.census].reverse().map((point, index) => <li key={point.month} className={`flex items-center justify-between gap-4 border-b border-[#d8ddda] px-4 py-3 text-[13px] ${index % 2 === 0 ? "sm:border-r" : ""}`}><span className="text-[#5e6863]">{formatMonthLabel(point.month, { fallback: point.month, month: "long" })}</span><strong className="tabular-nums">{formatExecutiveNumber(point.census)}</strong></li>)}</ol> : <EmptyState>Census history is not available.</EmptyState>}
      </div>
    </div>
  );
}

function IncidentDetail({ dashboard }: { dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"] }) {
  const maximum = Math.max(...dashboard.incidentTrend.map((item) => item.count), 1);
  return (
    <div data-executive-detail-view="incidents">
      <DetailHeader eyebrow="Operational activity" title="Incident detail" copy="Monthly incident volume and the recorded category mix for the latest governed period." />
      <div className="mt-8 grid gap-9 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <section>
          <h3 className="text-[20px] font-semibold tracking-[-0.025em]">Monthly volume</h3>
          {dashboard.incidentTrend.length ? (
            <ol className="mt-4 border-y border-[#aeb8b3] bg-white">
              {dashboard.incidentTrend.map((item) => <li key={item.month} className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-4 border-b border-[#d8ddda] px-4 py-3 last:border-b-0"><span className="text-[12px] text-[#5e6863]">{formatMonthLabel(item.month, { fallback: item.month, month: "short" })}</span><span className="h-2 bg-[#edf1ef]"><span className="block h-full bg-[#0f8b73]" style={{ width: `${Math.max((item.count / maximum) * 100, item.count ? 2 : 0)}%` }} /></span><strong className="text-[13px] tabular-nums">{formatExecutiveNumber(item.count)}</strong></li>)}
            </ol>
          ) : <EmptyState>Monthly incident history is not available.</EmptyState>}
        </section>
        <section>
          <h3 className="text-[20px] font-semibold tracking-[-0.025em]">Latest category mix</h3>
          {dashboard.topIncidentCategories.length ? <ol className="mt-4 border-y border-[#aeb8b3] bg-white">{dashboard.topIncidentCategories.map((item) => <li key={item.label} className="flex items-center justify-between gap-5 border-b border-[#d8ddda] px-4 py-3.5 text-[13px] last:border-b-0"><span>{item.label}</span><strong className="tabular-nums">{formatExecutiveNumber(item.count)}</strong></li>)}</ol> : <EmptyState>Incident categories are not available for the latest month.</EmptyState>}
        </section>
      </div>
    </div>
  );
}

function MedicationDetail({ dashboard }: { dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"] }) {
  const medication = dashboard.medication;
  return (
    <div data-executive-detail-view="medications">
      <DetailHeader eyebrow="Medication administration" title="Latest governed period" copy={medication?.month ? `Administration totals for ${formatMonthLabel(medication.month, { fallback: medication.month, month: "long" })}.` : "Medication administration totals are not available for this community."} />
      {medication ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <section className="border-y-2 border-[#111111] bg-white p-5 sm:p-7">
            <p className="text-[15px] leading-7 text-[#3f4844]"><strong className="text-[#173f36]">{formatExecutiveNumber(medication.given)}</strong> of <strong>{formatExecutiveNumber(medication.scheduled)}</strong> scheduled administrations were recorded as given. The latest compliance rate is <strong className="text-[#173f36]">{formatExecutiveNumber(medication.compliancePct, "%")}</strong>.</p>
            <div className="mt-6 h-3 bg-[#e2e8e5]" aria-label={`Medication compliance ${formatExecutiveNumber(medication.compliancePct, "%")}`}><span className="block h-full bg-[#0f8b73]" style={{ width: `${Math.min(Math.max(medication.compliancePct ?? 0, 0), 100)}%` }} /></div>
          </section>
          <dl className="border-y border-[#aeb8b3] bg-white"><DetailRow label="Scheduled" value={formatExecutiveNumber(medication.scheduled)} /><DetailRow label="Given" value={formatExecutiveNumber(medication.given)} /><DetailRow label="Not given" value={formatExecutiveNumber(medication.notGiven)} /></dl>
        </div>
      ) : <EmptyState>Medication administration totals are not available.</EmptyState>}
    </div>
  );
}

function AdmissionsDetail({ dashboard, onOpenCard }: { dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"]; onOpenCard: (card: AdmissionsBoardCard) => void }) {
  const admissions = dashboard.admissions;
  const community = admissions.community;
  const columns = useMemo(() => ADMISSION_STAGES.map((stage) => ({ ...stage, cards: admissions.cards.filter((card) => card.column === stage.key) })), [admissions.cards]);
  if (admissions.status !== "connected") return <EmptyState>The admissions feed is temporarily unavailable.</EmptyState>;
  return (
    <div data-executive-detail-view="admissions">
      <DetailHeader eyebrow="Admissions" title="Community pipeline" copy={`${formatExecutiveNumber(community?.activeReferrals)} active referrals are assigned to this community. Client charts open the existing management review.`} />
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <ScheduleList title="Upcoming assessments" empty="No remaining assessments are scheduled this week." items={admissions.upcomingAssessments.map((item) => ({ id: item.referralId, date: item.scheduledAt, name: item.clientName, detail: item.status }))} />
        <ScheduleList title="Planned move-ins" empty="No move-ins are currently scheduled this week." items={admissions.plannedMoveIns.map((item) => ({ id: item.referralId, date: item.plannedAt, name: item.clientName, detail: item.readiness === "ready" ? item.status : `${item.status} · ${item.readiness}` }))} />
      </div>
      <section className="mt-10">
        <div className="flex items-end justify-between gap-4 border-b-2 border-[#111111] pb-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">Pipeline</p><h3 className="mt-1 text-[23px] font-semibold tracking-[-0.03em]">Referral charts</h3></div><span className="text-[12px] text-[#606964]">{admissions.cards.length} total</span></div>
        <div className="grid items-start gap-5 pt-5 lg:grid-cols-3">
          {columns.map((column) => (
            <article key={column.key} className="border-t-[3px] border-[#0f8b73] bg-white">
              <header className="flex items-center justify-between border-x border-b border-[#d0d7d3] px-4 py-3"><h4 className="text-[14px] font-semibold">{column.label}</h4><span className="text-[12px] font-semibold tabular-nums text-[#0f765e]">{column.cards.length}</span></header>
              {column.cards.length ? <ol className="border-x border-[#d0d7d3]">{column.cards.map((card) => <li key={card.referralId} className="border-b border-[#d0d7d3]"><button type="button" onClick={() => onOpenCard(card)} className="group flex min-h-24 w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-[#f4f8f6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f8b73]"><span><strong className="block text-[15px]">{card.clientName}</strong><span className="mt-1 block text-[12px] leading-5 text-[#626b67]">{card.status}</span><span className="mt-1 block text-[11px] text-[#7a827e]">{card.daysOpen == null ? "Timing unavailable" : `${card.daysOpen} days open`}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[#0f8b73] transition-transform group-hover:translate-x-1" aria-hidden="true" /></button></li>)}</ol> : <p className="border-x border-b border-[#d0d7d3] px-4 py-8 text-center text-[12px] text-[#68716d]">No referrals here</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ScheduleList({ title, items, empty }: { title: string; items: Array<{ id: number; date: string; name: string; detail: string }>; empty: string }) {
  return <section><h3 className="text-[20px] font-semibold tracking-[-0.025em]">{title}</h3>{items.length ? <ol className="mt-4 border-y border-[#aeb8b3] bg-white">{items.map((item) => <li key={item.id} className="grid gap-1 border-b border-[#d8ddda] px-4 py-3.5 last:border-b-0 sm:grid-cols-[132px_1fr_auto] sm:items-center sm:gap-4"><time className="text-[12px] font-semibold text-[#0a765f]">{formatExecutiveDate(item.date, true)}</time><strong className="text-[14px]">{item.name}</strong><span className="text-[11px] text-[#68716d] sm:text-right">{item.detail}</span></li>)}</ol> : <EmptyState>{empty}</EmptyState>}</section>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-[#d8ddda] px-4 py-4 text-[14px] last:border-b-0"><dt className="text-[#5e6863]">{label}</dt><dd className="font-semibold tabular-nums text-[#18201c]">{value}</dd></div>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 border-y border-[#cfd6d2] bg-white px-4 py-8 text-[13px] leading-5 text-[#68716d]">{children}</p>;
}
