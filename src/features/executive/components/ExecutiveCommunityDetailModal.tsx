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
  census: { accent: "#2c8269", border: "#c6ddd4", surface: "#eff8f4", ink: "#215f4d" },
  admissions: { accent: "#5877bf", border: "#cbd5ec", surface: "#f1f4fc", ink: "#3f5f9f" },
  incidents: { accent: "#bd7040", border: "#ead2c1", surface: "#fff4ec", ink: "#98532b" },
  medications: { accent: "#2e8065", border: "#c5ddd3", surface: "#edf7f2", ink: "#22644f" }
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

function MetricStrip({ items, view }: { items: Array<{ label: string; value: string; detail?: string | undefined }>; view: ExecutiveCommunityDetailView }) {
  const tone = VIEW_TONE[view];
  return (
    <dl className={`grid gap-px overflow-hidden rounded-[18px] border ${items.length === 3 ? "sm:grid-cols-3" : "grid-cols-2 lg:grid-cols-4"}`} style={{ backgroundColor: tone.border, borderColor: tone.border }}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0 px-4 py-3.5 sm:px-5" style={{ backgroundColor: tone.surface }}>
          <dt className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#69736e]">{item.label}</dt>
          <dd className="mt-1 text-[25px] font-semibold leading-none tabular-nums tracking-[-0.045em]" style={{ color: tone.ink }}>{item.value}</dd>
          {item.detail ? <p className="mt-1.5 truncate text-[10px] text-[#69736e]">{item.detail}</p> : null}
        </div>
      ))}
    </dl>
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
      <MetricStrip
        view="census"
        items={[
          { label: "Latest census", value: formatExecutiveNumber(latest?.census ?? dashboard.summary?.residents), detail: latest ? formatMonthLabel(latest.month, { fallback: latest.month, month: "long" }) : undefined },
          { label: "Month change", value: change == null ? "—" : `${change > 0 ? "+" : ""}${formatExecutiveNumber(change)}`, detail: prior ? `vs ${formatMonthLabel(prior.month, { fallback: prior.month, month: "short" })}` : undefined },
          { label: "Average stay", value: dashboard.summary?.averageLengthOfStay == null ? "—" : `${formatExecutiveNumber(Math.round(dashboard.summary.averageLengthOfStay))}d`, detail: dashboard.summary?.averageAge == null ? undefined : `${formatExecutiveNumber(Math.round(dashboard.summary.averageAge * 10) / 10)} average age` }
        ]}
      />
      <section className="overflow-hidden rounded-[22px] border border-[#c6ddd4] border-t-[4px] border-t-[#2c8269] bg-white p-4 sm:p-6">
        <div className="flex items-center justify-between gap-4 border-b border-[#dbe7e2] pb-3">
          <SectionTitle icon={<span className="grid h-8 w-8 place-items-center rounded-lg border border-[#c6ddd4] bg-[#eff8f4]"><UsersRound className="h-4 w-4 text-[#28745d]" aria-hidden="true" /></span>}>Monthly census</SectionTitle>
          <span className="text-[11px] text-[#68716d]">{dashboard.census.length} periods</span>
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
      <MetricStrip
        view="incidents"
        items={[
          { label: "Current month", value: formatExecutiveNumber(latest?.count ?? dashboard.summary?.currentIncidents), detail: latest ? formatMonthLabel(latest.month, { fallback: latest.month, month: "long" }) : undefined },
          { label: "Prior month", value: formatExecutiveNumber(prior?.count ?? dashboard.summary?.priorIncidents), detail: prior ? formatMonthLabel(prior.month, { fallback: prior.month, month: "long" }) : undefined },
          { label: "Change", value: change == null ? "—" : `${change > 0 ? "+" : ""}${formatExecutiveNumber(change)}`, detail: change == null ? undefined : change === 0 ? "No change" : change > 0 ? "More incidents" : "Fewer incidents" }
        ]}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <section className="overflow-hidden rounded-[22px] border border-[#ead2c1] border-t-[4px] border-t-[#bd7040] bg-[#fffaf7] p-4 sm:p-6">
          <SectionTitle icon={<span className="grid h-8 w-8 place-items-center rounded-lg border border-[#ead2c1] bg-[#fff4ec]"><ClipboardList className="h-4 w-4 text-[#ad6437]" aria-hidden="true" /></span>}>Monthly volume</SectionTitle>
          {dashboard.incidentTrend.length ? (
            <ol className="mt-4 overflow-hidden rounded-xl border border-[#ecd9cb] bg-white">
              {dashboard.incidentTrend.map((item) => <li key={item.month} className="grid grid-cols-[82px_minmax(0,1fr)_auto] items-center gap-4 border-b border-[#eee0d6] px-4 py-3 last:border-b-0"><span className="text-[12px] text-[#6b625c]">{formatMonthLabel(item.month, { fallback: item.month, month: "short" })}</span><span className="h-2 overflow-hidden rounded-full bg-[#f3e7df]"><span className="block h-full rounded-full bg-[#bd7040]" style={{ width: `${Math.max((item.count / maximum) * 100, item.count ? 2 : 0)}%` }} /></span><strong className="text-[13px] tabular-nums">{formatExecutiveNumber(item.count)}</strong></li>)}
            </ol>
          ) : <EmptyState>Monthly incident history is not available.</EmptyState>}
        </section>
        <section className="overflow-hidden rounded-[22px] border border-[#dfd7cf] bg-white p-4 sm:p-6">
          <h2 className="!font-sans text-[16px] font-semibold text-[#17201c]">Category mix</h2>
          {dashboard.topIncidentCategories.length ? <ol className="mt-4 overflow-hidden rounded-xl border border-[#e3ded9]">{dashboard.topIncidentCategories.map((item, index) => <li key={item.label} className="flex items-center justify-between gap-5 border-b border-[#ebe7e3] px-4 py-3 text-[12px] last:border-b-0"><span className="flex min-w-0 items-center gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#fff1e7] text-[10px] font-semibold text-[#9a572f]">{index + 1}</span><span className="truncate">{item.label}</span></span><strong className="tabular-nums">{formatExecutiveNumber(item.count)}</strong></li>)}</ol> : <EmptyState>Incident categories are not available for the latest month.</EmptyState>}
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
          <MetricStrip
            view="medications"
            items={[
              { label: "Compliance", value: formatExecutiveNumber(medication.compliancePct, "%"), detail: formatMonthLabel(medication.month, { fallback: medication.month, month: "long" }) },
              { label: "Scheduled", value: formatExecutiveNumber(medication.scheduled) },
              { label: "Given", value: formatExecutiveNumber(medication.given) },
              { label: "Not given", value: formatExecutiveNumber(medication.notGiven) }
            ]}
          />
          <section className="overflow-hidden rounded-[22px] border border-[#c5ddd3] border-t-[4px] border-t-[#2e8065] bg-[#f7fcfa] p-5 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <SectionTitle icon={<span className="grid h-8 w-8 place-items-center rounded-lg border border-[#c5ddd3] bg-white"><Pill className="h-4 w-4 text-[#28745d]" aria-hidden="true" /></span>}>Administration completion</SectionTitle>
              <strong className="text-[28px] tabular-nums tracking-[-0.045em] text-[#22644f]">{formatExecutiveNumber(medication.compliancePct, "%")}</strong>
            </div>
            <div className="mt-5 h-4 overflow-hidden rounded-full bg-[#dce9e3]" aria-label={`Medication compliance ${formatExecutiveNumber(medication.compliancePct, "%")}`}><span className="block h-full rounded-full bg-[#2e8065]" style={{ width: `${Math.min(Math.max(medication.compliancePct ?? 0, 0), 100)}%` }} /></div>
            <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-[#d5e4dd] bg-[#d5e4dd] sm:grid-cols-2">
              <div className="bg-white px-4 py-4"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#68716d]">Completed</p><p className="mt-1 text-[18px] font-semibold tabular-nums text-[#22644f]">{formatExecutiveNumber(medication.given)}</p></div>
              <div className="bg-white px-4 py-4"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#68716d]">Exception total</p><p className="mt-1 text-[18px] font-semibold tabular-nums text-[#8b5b38]">{formatExecutiveNumber(medication.notGiven)}</p></div>
            </div>
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
      <MetricStrip
        view="admissions"
        items={[
          { label: "Impending admits", value: formatExecutiveNumber(clients.length), detail: "Accepted or awaiting admission" },
          { label: "Scheduled", value: formatExecutiveNumber(scheduled.length), detail: "Admission date recorded" },
          { label: "Need a date", value: formatExecutiveNumber(withoutDate.length), detail: "Accepted profiles" },
          { label: "Ready", value: formatExecutiveNumber(ready.length), detail: "No open profile requirements" }
        ]}
      />
      <section className="overflow-hidden rounded-[22px] border border-[#ccd5d0] bg-white p-4 sm:p-6" data-executive-impending-admits="true">
        <div className="flex items-center justify-between gap-4 border-b border-[#dce2df] pb-3"><SectionTitle icon={<span className="grid h-8 w-8 place-items-center rounded-lg border border-[#cbd5ec] bg-[#f1f4fc]"><CalendarCheck2 className="h-4 w-4 text-[#4667b5]" aria-hidden="true" /></span>}>Impending admits</SectionTitle><span className="text-[12px] text-[#606964]">{clients.length} clients</span></div>
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
    <article className="flex h-full flex-col overflow-hidden rounded-[18px] border border-[#d5dce8] bg-[#fbfcff]" data-executive-meet-client={card.referralId}>
      <div className="flex items-start justify-between gap-3 border-b border-[#dce2ee] bg-[#f1f4fc] px-4 py-3.5 sm:px-5">
        <div className="min-w-0"><h3 className="truncate !font-sans text-[17px] font-semibold text-[#17201c]">{card.clientName}</h3><p className="mt-1 text-[11px] font-medium text-[#526a9e]">{plannedAt ? `Planned ${formatImpendingAdmissionDate(plannedAt, true)}` : "Admission date pending"}</p></div>
        <ExecutiveReferralStatusPill status={card.status} />
      </div>
      <div className="flex flex-1 flex-col px-4 py-4 sm:px-5">
        <span className={`w-fit rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.05em] ${readinessTone}`}>{readiness}</span>
        <dl className="mt-4 grid gap-px overflow-hidden rounded-xl border border-[#dfe4ea] bg-[#dfe4ea] sm:grid-cols-3">
          {facts.map(([label, value]) => <div key={label} className="min-w-0 bg-white px-3 py-2.5"><dt className="text-[8px] font-semibold uppercase tracking-[0.07em] text-[#78807c]">{label}</dt><dd className="mt-1 truncate text-[11px] font-semibold text-[#343a37]">{value}</dd></div>)}
        </dl>
        {profile.overview.length ? <ul className="mt-4 space-y-2 text-[12px] leading-5 text-[#57615c]">{profile.overview.slice(0, 2).map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#5877bf]" aria-hidden="true" /><span>{item}</span></li>)}</ul> : null}
        <button type="button" onClick={onOpen} className="group mt-auto flex min-h-11 items-center justify-between gap-3 border-t border-[#dce2ee] pt-3 text-left text-[12px] font-semibold text-[#3159a8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]">Meet the client<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></button>
      </div>
    </article>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 border-y border-[#cfd6d2] bg-white px-4 py-8 text-[13px] leading-5 text-[#68716d]">{children}</p>;
}
