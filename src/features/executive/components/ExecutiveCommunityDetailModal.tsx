import { ArrowRight, CalendarCheck2, ClipboardList, Pill, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { formatMonthLabel } from "../../../../shared/period-utils.mjs";
import { CensusTrendModule } from "../../../shared/modules/CensusTrendModule";
import type { AdmissionsBoardCard } from "../../../shared/types/platformSnapshot";
import type { ExecutiveDirectorCommunityDashboardResponse } from "../data/executiveDirectorApi";
import { ExecutiveReferralStatusPill } from "./ExecutiveReferralStatusPill";
import { formatImpendingAdmissionDate, impendingAdmissionCards, impendingAdmissionReadiness } from "./executiveAdmissions";
import { formatExecutiveDate, formatExecutiveNumber } from "./executiveDashboardFormatters";

export type ExecutiveCommunityDetailView = "census" | "incidents" | "medications" | "admissions";

const VIEWS: Array<{ key: ExecutiveCommunityDetailView; label: string }> = [
  { key: "census", label: "Census" },
  { key: "admissions", label: "Admissions" },
  { key: "incidents", label: "Incidents" },
  { key: "medications", label: "Medications" }
];

const VIEW_TONE = {
  census: { accent: "#2d735c", border: "#b8cac1", surface: "#dce8e2", ink: "#204f42" },
  admissions: { accent: "#2d735c", border: "#b8cac1", surface: "#dce8e2", ink: "#204f42" },
  incidents: { accent: "#2d735c", border: "#b8cac1", surface: "#dce8e2", ink: "#204f42" },
  medications: { accent: "#2d735c", border: "#b8cac1", surface: "#dce8e2", ink: "#204f42" }
} satisfies Record<ExecutiveCommunityDetailView, { accent: string; border: string; surface: string; ink: string }>;

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
  const activeTone = VIEW_TONE[view];

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
        className="relative z-10 flex h-dvh w-full max-w-[1344px] flex-col overflow-hidden border-t-[4px] bg-white text-[#111111] shadow-[0_24px_90px_rgba(0,0,0,0.42)] sm:h-[90dvh] sm:rounded-[22px] sm:border sm:border-t-[4px] sm:border-[#b9c3be]"
        style={{ borderTopColor: activeTone.accent }}
      >
        <header className="sticky top-0 z-20 shrink-0 border-b border-[#d9d9d9] bg-white">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0">
              <h1 id="executive-community-dialog-title" className="truncate !font-sans text-[19px] font-semibold tracking-[-0.035em] sm:text-[22px]">{facility.shortName}<span className="font-normal text-[#7a827e]"> / {title}</span></h1>
              <p className="mt-0.5 text-[10px] text-[#707975]">{dashboard.reportingMonth ? formatMonthLabel(dashboard.reportingMonth, { month: "long" }) : "Latest governed period"}{dashboard.generatedAt ? ` · Updated ${formatExecutiveDate(dashboard.generatedAt, true)}` : ""}</p>
            </div>
            <button ref={closeButtonRef} type="button" onClick={onClose} aria-label={`Close ${title} detail`} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[#d9d9d9] bg-white text-[#595959] transition-colors hover:border-[#111111] hover:text-[#111111] lg:h-9 lg:w-9">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Community detail sections" className="overflow-x-auto border-t border-[#eeeeee] px-4 py-2 sm:px-6">
            <div role="tablist" className="flex min-w-max gap-1.5">
              {VIEWS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={view === item.key}
                  onClick={() => onViewChange(item.key)}
                  className="min-h-10 rounded-lg border px-3 text-[12px] font-medium transition-colors"
                  style={view === item.key
                    ? { backgroundColor: VIEW_TONE[item.key].surface, borderColor: VIEW_TONE[item.key].border, color: VIEW_TONE[item.key].ink }
                    : { backgroundColor: "transparent", borderColor: "transparent", color: "#69716c" }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f5f6f4] px-4 py-5 sm:px-7 sm:py-7 lg:px-10">
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

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <h2 className="flex items-center gap-2.5 !font-sans text-[16px] font-semibold text-[#17201c]">{icon}{children}</h2>;
}

function CensusDetail({ dashboard }: { dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"] }) {
  const points = dashboard.census.map((point) => ({ id: point.month, label: formatMonthLabel(point.month, { fallback: point.month, month: "short" }), value: point.census }));
  const latest = dashboard.census.at(-1);
  const prior = dashboard.census.at(-2);
  const change = latest && prior ? latest.census - prior.census : null;
  return (
    <div data-executive-detail-view="census" className="space-y-5">
      <section className="overflow-hidden rounded-[22px] border border-[#b8cac1] border-t-[4px] border-t-[#2d735c] bg-[#e6ece8] p-4 sm:p-6">
        <div className="flex items-center justify-between gap-4 border-b border-[#dbe7e2] pb-3">
          <SectionTitle icon={<span className="grid h-8 w-8 place-items-center rounded-lg border border-[#b8cac1] bg-[#dce8e2]"><UsersRound className="h-4 w-4 text-[#245f4d]" aria-hidden="true" /></span>}>Monthly census</SectionTitle>
          <span className="text-[11px] text-[#68716d]">{formatExecutiveNumber(latest?.census ?? dashboard.summary?.residents)} current{change == null ? "" : ` · ${change > 0 ? "+" : ""}${formatExecutiveNumber(change)} vs ${prior ? formatMonthLabel(prior.month, { fallback: prior.month, month: "short" }) : "prior"}`}</span>
        </div>
        <div className="mt-4"><CensusTrendModule points={points} height={320} emptyLabel="Census history is not available for this community." /></div>
      </section>
      <section className="overflow-hidden rounded-[20px] border border-[#cbd7d1] bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-[#dbe2de] px-4 py-3 sm:px-5"><h3 className="!font-sans text-[14px] font-semibold">Period history</h3><span className="text-[10px] text-[#68716d]">Newest first</span></div>
        {dashboard.census.length ? <ol className="grid gap-px bg-[#dbe2de] sm:grid-cols-2 lg:grid-cols-4">{[...dashboard.census].reverse().map((point) => <li key={point.month} className="flex items-center justify-between gap-4 bg-white px-4 py-3 text-[12px]"><span className="text-[#5e6863]">{formatMonthLabel(point.month, { fallback: point.month, month: "short" })}</span><strong className="tabular-nums text-[#215f4d]">{formatExecutiveNumber(point.census)}</strong></li>)}</ol> : <EmptyState>Census history is not available.</EmptyState>}
      </section>
    </div>
  );
}

function IncidentDetail({ dashboard }: { dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"] }) {
  const maximum = Math.max(...dashboard.incidentTrend.map((item) => item.count), 1);
  const latest = dashboard.incidentTrend.at(-1);
  const prior = dashboard.incidentTrend.at(-2);
  const change = latest && prior ? latest.count - prior.count : null;
  return (
    <div data-executive-detail-view="incidents" className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <section className="overflow-hidden rounded-[22px] border border-[#b8cac1] border-t-[4px] border-t-[#2d735c] bg-[#e6ece8] p-4 sm:p-6">
          <div className="flex items-center justify-between gap-4"><SectionTitle icon={<span className="grid h-8 w-8 place-items-center rounded-lg border border-[#b8cac1] bg-[#dce8e2]"><ClipboardList className="h-4 w-4 text-[#245f4d]" aria-hidden="true" /></span>}>Monthly volume</SectionTitle><span className="text-[11px] text-[#66716b]">{formatExecutiveNumber(latest?.count ?? dashboard.summary?.currentIncidents)} current{change == null ? "" : ` · ${formatExecutiveNumber(Math.abs(change))} ${change > 0 ? "more" : "fewer"}`}</span></div>
          {dashboard.incidentTrend.length ? (
            <ol className="mt-4 overflow-hidden rounded-xl border border-[#c8d5cf] bg-white">
              {dashboard.incidentTrend.map((item) => <li key={item.month} className="grid grid-cols-[82px_minmax(0,1fr)_auto] items-center gap-4 border-b border-[#d9e1dd] px-4 py-3 last:border-b-0"><span className="text-[12px] text-[#5e6863]">{formatMonthLabel(item.month, { fallback: item.month, month: "short" })}</span><span className="h-2 overflow-hidden rounded-full bg-[#dfe8e3]"><span className="block h-full rounded-full bg-[#2d735c]" style={{ width: `${Math.max((item.count / maximum) * 100, item.count ? 2 : 0)}%` }} /></span><strong className="text-[13px] tabular-nums">{formatExecutiveNumber(item.count)}</strong></li>)}
            </ol>
          ) : <EmptyState>Monthly incident history is not available.</EmptyState>}
        </section>
        <section className="overflow-hidden rounded-[22px] border border-[#b8cac1] bg-[#e6ece8] p-4 sm:p-6">
          <h2 className="!font-sans text-[16px] font-semibold text-[#17201c]">Category mix</h2>
              {dashboard.topIncidentCategories.length ? <ol className="mt-4 overflow-hidden rounded-xl border border-[#d1dbd6]">{dashboard.topIncidentCategories.map((item, index) => <li key={item.label} className="flex items-center justify-between gap-5 border-b border-[#dfe5e2] px-4 py-3 text-[12px] last:border-b-0"><span className="flex min-w-0 items-center gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#dce8e2] text-[10px] font-semibold text-[#245f4d]">{index + 1}</span><span className="truncate">{item.label}</span></span><strong className="tabular-nums">{formatExecutiveNumber(item.count)}</strong></li>)}</ol> : <EmptyState>Incident categories are not available for the latest month.</EmptyState>}
        </section>
      </div>
    </div>
  );
}

function MedicationDetail({ dashboard }: { dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"] }) {
  const medication = dashboard.medication;
  return (
    <div data-executive-detail-view="medications" className="space-y-5">
      {medication ? (
        <>
          <section className="overflow-hidden rounded-[22px] border border-[#b8cac1] border-t-[4px] border-t-[#2d735c] bg-[#e6ece8] p-5 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <SectionTitle icon={<span className="grid h-8 w-8 place-items-center rounded-lg border border-[#b8cac1] bg-[#dce8e2]"><Pill className="h-4 w-4 text-[#245f4d]" aria-hidden="true" /></span>}>Administration completion</SectionTitle>
              <strong className="text-[28px] tabular-nums tracking-[-0.045em] text-[#22644f]">{formatExecutiveNumber(medication.compliancePct, "%")}</strong>
            </div>
            <div className="mt-5 h-4 overflow-hidden rounded-full bg-[#dce9e3]" aria-label={`Medication compliance ${formatExecutiveNumber(medication.compliancePct, "%")}`}><span className="block h-full rounded-full bg-[#2e8065]" style={{ width: `${Math.min(Math.max(medication.compliancePct ?? 0, 0), 100)}%` }} /></div>
            <p className="mt-4 text-[13px] text-[#56615c]">{formatExecutiveNumber(medication.given)} given · {formatExecutiveNumber(medication.notGiven)} not given · {formatExecutiveNumber(medication.scheduled)} scheduled</p>
          </section>
        </>
      ) : <EmptyState>Medication administration totals are not available.</EmptyState>}
    </div>
  );
}

function AdmissionsDetail({ dashboard, onOpenCard }: { dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"]; onOpenCard: (card: AdmissionsBoardCard) => void }) {
  const admissions = dashboard.admissions;
  const clients = useMemo(() => impendingAdmissionCards(admissions.cards), [admissions.cards]);
  const plannedByReferral = useMemo(() => new Map(admissions.plannedMoveIns.map((item) => [item.referralId, item])), [admissions.plannedMoveIns]);
  const scheduled = clients.filter((card) => card.plannedAdmissionDate || plannedByReferral.has(card.referralId));
  const withoutDate = clients.filter((card) => !card.plannedAdmissionDate && !plannedByReferral.has(card.referralId));
  const ready = clients.filter((card) => impendingAdmissionReadiness(card) === "Ready for admission");
  if (admissions.status !== "connected") return <EmptyState>The admissions feed is temporarily unavailable.</EmptyState>;
  return (
    <div data-executive-detail-view="admissions" className="space-y-5">
      <section className="overflow-hidden rounded-[22px] border border-[#ccd5d0] bg-white p-4 sm:p-6" data-executive-impending-admits="true">
        <div className="flex flex-col items-start gap-2 border-b border-[#dce2df] pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"><SectionTitle icon={<span className="grid h-8 w-8 place-items-center rounded-lg border border-[#b8cac1] bg-[#dce8e2]"><CalendarCheck2 className="h-4 w-4 text-[#245f4d]" aria-hidden="true" /></span>}>Impending admits</SectionTitle><span className="text-[12px] text-[#606964]">{clients.length} clients<span className="hidden sm:inline"> · {scheduled.length} scheduled · {withoutDate.length} need a date · {ready.length} ready</span></span></div>
        {clients.length ? (
          <ol className="grid gap-4 pt-5 lg:grid-cols-2">
            {clients.map((card) => {
              const planned = plannedByReferral.get(card.referralId);
              return <li key={card.referralId}><MeetClientCard card={card} plannedAt={planned?.plannedAt ?? card.plannedAdmissionDate} onOpen={() => onOpenCard(card)} /></li>;
            })}
          </ol>
        ) : <EmptyState>No clients are currently moving toward admission.</EmptyState>}
      </section>
    </div>
  );
}

function MeetClientCard({ card, plannedAt, onOpen }: { card: AdmissionsBoardCard; plannedAt: string | null | undefined; onOpen: () => void }) {
  const profile = card.managementProfile;
  const readiness = impendingAdmissionReadiness(card);
  const readinessTone = readiness === "Ready for admission"
    ? "border-[#b8d9ca] bg-[#e9f5ef] text-[#21664f]"
    : readiness.includes("blocking")
      ? "border-[#e3bbb3] bg-[#fcedea] text-[#963f36]"
      : "border-[#e2cf91] bg-[#fff6d9] text-[#75591d]";
  const facts = [
    ["Payer", profile.payer || "Not recorded"],
    ["Referral source", profile.referralSource || "Not recorded"],
    ["Referring county", profile.referringCounty || "Not recorded"]
  ];
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[18px] border border-[#b8cac1] bg-[#f7f9f8]" data-executive-meet-client={card.referralId}>
      <div className="flex items-start justify-between gap-3 border-b border-[#cbd7d1] bg-[#dce8e2] px-4 py-3.5 sm:px-5">
        <div className="min-w-0"><h3 className="truncate !font-sans text-[17px] font-semibold text-[#17201c]">{card.clientName}</h3><p className="mt-1 text-[11px] font-medium text-[#315e50]">{plannedAt ? `Planned ${formatImpendingAdmissionDate(plannedAt, true)}` : "Admission date pending"}</p></div>
        <ExecutiveReferralStatusPill status={card.status} />
      </div>
      <div className="flex flex-1 flex-col px-4 py-4 sm:px-5">
        <span className={`w-fit rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.05em] ${readinessTone}`}>{readiness}</span>
        <dl className="mt-4 grid gap-px overflow-hidden rounded-xl border border-[#dfe4ea] bg-[#dfe4ea] sm:grid-cols-3">
          {facts.map(([label, value]) => <div key={label} className="min-w-0 bg-white px-3 py-2.5"><dt className="text-[8px] font-semibold uppercase tracking-[0.07em] text-[#78807c]">{label}</dt><dd className="mt-1 truncate text-[11px] font-semibold text-[#343a37]">{value}</dd></div>)}
        </dl>
        {profile.overview.length ? <ul className="mt-4 space-y-2 text-[12px] leading-5 text-[#57615c]">{profile.overview.slice(0, 2).map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2d735c]" aria-hidden="true" /><span>{item}</span></li>)}</ul> : null}
        <button type="button" onClick={onOpen} className="group mt-auto flex min-h-11 items-center justify-between gap-3 border-t border-[#cbd7d1] pt-3 text-left text-[12px] font-semibold text-[#245f4d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]">Meet the client<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></button>
      </div>
    </article>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 border-y border-[#cfd6d2] bg-white px-4 py-8 text-[13px] leading-5 text-[#68716d]">{children}</p>;
}
