import { ArrowLeft, ArrowRight, CalendarCheck2, CheckCircle2, Circle, ClipboardList, Clock3, ExternalLink, FileCheck2, MapPin, NotebookText, Pill, ShieldCheck, UsersRound, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatMonthLabel } from "../../../../shared/period-utils.mjs";
import { ExecutiveTrendChart } from "./ExecutiveTrendChart";
import { ExecutiveIncidentRegister } from "./ExecutiveIncidentRegister";
import type { AdmissionsBoardCard } from "../../../shared/types/platformSnapshot";
import type { ExecutiveDirectorCommunityDashboardResponse } from "../data/executiveDirectorApi";
import { formatImpendingAdmissionDate, impendingAdmissionCards } from "./executiveAdmissions";
import { formatExecutiveDate, formatExecutiveNumber } from "./executiveDashboardFormatters";
import { executiveIncidentCategoryPeriod } from "./executiveIncidentCategories";

export type ExecutiveCommunityDetailView = "census" | "incidents" | "medications" | "admissions";

const VIEW_TONE = {
  census: { label: "Census", material: "ledger", accent: "#315d89", border: "#9fb2c5", surface: "#e5ebf2", canvas: "#eef2f6", ink: "#172433" },
  admissions: { label: "Admissions", material: "folder", accent: "#98661e", border: "#c8ad77", surface: "#f1e7d6", canvas: "#f5efe4", ink: "#332613" },
  incidents: { label: "Incidents", material: "register", accent: "#8b493e", border: "#c39f96", surface: "#efe3df", canvas: "#f5edeb", ink: "#34201c" },
  medications: { label: "Medication administration", material: "binder", accent: "#665074", border: "#aca4ba", surface: "#ebe7ee", canvas: "#f1eef3", ink: "#2e2733" }
} satisfies Record<ExecutiveCommunityDetailView, { label: string; material: string; accent: string; border: string; surface: string; canvas: string; ink: string }>;

function keepFocusInsideDialog(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (event.key !== "Tab" || !dialog) return;
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"))
    .filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0 && element.getClientRects().length > 0);
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
  initialAdmissionId,
  onAdmissionSelectionChange,
  sourceNotice,
  onClose,
  onOpenAdmissionCard
}: {
  facility: ExecutiveDirectorCommunityDashboardResponse["facility"];
  dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"];
  view: ExecutiveCommunityDetailView;
  initialAdmissionId?: number | null;
  onAdmissionSelectionChange?: (referralId: number) => void;
  sourceNotice?: string | null;
  onClose: () => void;
  onOpenAdmissionCard: (card: AdmissionsBoardCard) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const tone = VIEW_TONE[view];

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      if (trigger?.isConnected) trigger.focus();
    };
  }, [onClose]);

  return createPortal(
    <div data-executive-community-modal-backdrop="true" className="fixed inset-0 z-50 flex items-end justify-center bg-[#111111]/70 p-0 backdrop-blur-[6px] sm:items-center sm:p-6 lg:p-9" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="executive-community-dialog-title" data-executive-community-detail-modal={view} data-executive-detail-material={tone.material} className={`app-theme-root executive-material-dialog executive-material-dialog--${view}`}>
        <div className="executive-material-dialog__scroll">
          {sourceNotice ? <p role="status" className="executive-client-source-notice">{sourceNotice}</p> : null}
          {view === "census" ? <CensusDetail facilityName={facility.shortName} dashboard={dashboard} onClose={onClose} closeButtonRef={closeButtonRef} /> : null}
          {view === "incidents" ? <IncidentDetail facilityId={facility.facilityId} facilityName={facility.shortName} dashboard={dashboard} onClose={onClose} closeButtonRef={closeButtonRef} /> : null}
          {view === "medications" ? <MedicationDetail facilityName={facility.shortName} dashboard={dashboard} onClose={onClose} closeButtonRef={closeButtonRef} /> : null}
          {view === "admissions" ? <AdmissionsDetail facilityName={facility.shortName} dashboard={dashboard} initialAdmissionId={initialAdmissionId ?? null} onSelectionChange={onAdmissionSelectionChange} onOpenCard={onOpenAdmissionCard} onClose={onClose} closeButtonRef={closeButtonRef} /> : null}
        </div>
      </section>
    </div>,
    document.body
  );
}

export function ExecutiveCommunityWorkspace({
  facility,
  dashboard,
  view,
  onBack
}: {
  facility: ExecutiveDirectorCommunityDashboardResponse["facility"];
  dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"];
  view: "incidents" | "medications";
  onBack: () => void;
}) {
  const backButtonRef = useRef<HTMLButtonElement>(null);
  return (
    <section
      aria-labelledby="executive-community-workspace-title"
      data-executive-community-workspace={view}
      data-executive-detail-material={VIEW_TONE[view].material}
      className={`app-theme-root executive-material-workspace executive-material-workspace--${view}`}
    >
      {view === "incidents"
        ? <IncidentDetail facilityId={facility.facilityId} facilityName={facility.shortName} dashboard={dashboard} onClose={onBack} closeButtonRef={backButtonRef} embedded />
        : <MedicationDetail facilityName={facility.shortName} dashboard={dashboard} onClose={onBack} closeButtonRef={backButtonRef} embedded />}
    </section>
  );
}

function useSelectedTabVisibility(selected: string | number | null) {
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const revealSelection = () => {
      const selected = strip.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!selected) return;
      const container = strip.getBoundingClientRect();
      const tab = selected.getBoundingClientRect();
      // Pan only the month strip, never the document or modal scroll position.
      if (tab.left < container.left) strip.scrollLeft -= container.left - tab.left;
      else if (tab.right > container.right) strip.scrollLeft += tab.right - container.right;
    };
    revealSelection();
    const observer = new ResizeObserver(revealSelection);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [selected]);
  return stripRef;
}

function PeriodTabs({ months, selectedMonth, onSelect, label, className, panelId }: {
  months: string[];
  selectedMonth: string | null;
  onSelect: (month: string) => void;
  label: string;
  className: string;
  panelId: string;
}) {
  const stripRef = useSelectedTabVisibility(selectedMonth);
  return <div ref={stripRef} className={`${className} material-period-tabs`} role="tablist" aria-label={label}>
    {months.map((month, index) => <button
      key={month}
      id={`${panelId}-${month}`}
      type="button"
      role="tab"
      aria-selected={selectedMonth === month}
      aria-controls={panelId}
      tabIndex={selectedMonth === month || (!months.includes(selectedMonth ?? "") && index === months.length - 1) ? 0 : -1}
      onClick={() => onSelect(month)}
      onKeyDown={(event) => {
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % months.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + months.length) % months.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = months.length - 1;
        else return;
        event.preventDefault();
        const nextMonth = months[next];
        if (!nextMonth) return;
        onSelect(nextMonth);
        stripRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus({ preventScroll: true });
      }}
    >{formatMonthLabel(month, { fallback: month, month: "short" })}</button>)}
  </div>;
}

function CensusDetail({ facilityName, dashboard, onClose, closeButtonRef }: { facilityName: string; dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"]; onClose: () => void; closeButtonRef: React.RefObject<HTMLButtonElement | null> }) {
  const periodPanelId = useId();
  const points = dashboard.census.slice(-12).map((point) => ({ id: point.month, label: formatMonthLabel(point.month, { fallback: point.month, month: "short" }), value: point.census }));
  const latest = dashboard.census.at(-1);
  const prior = dashboard.census.at(-2);
  const [selectedMonth, setSelectedMonth] = useState(latest?.month ?? null);
  const [movementPage, setMovementPage] = useState(0);
  const selectedIndex = Math.max(dashboard.census.findIndex((point) => point.month === selectedMonth), 0);
  const selected = dashboard.census[selectedIndex] ?? latest;
  const selectedPrior = dashboard.census[selectedIndex - 1];
  const selectedChange = selected && selectedPrior ? selected.census - selectedPrior.census : null;
  const community = dashboard.admissions.community;
  const movement = community?.monthToDate;
  const operatingLimit = community?.operatingLimit ?? null;
  const occupancy = selected && operatingLimit ? (selected.census / operatingLimit) * 100 : null;
  const availableBeds = selected && operatingLimit ? Math.max(operatingLimit - selected.census, 0) : null;
  const movementRows = (dashboard.residentMovements ?? []).filter((row) => dateMatchesMonth(row.date, selectedMonth));
  const movementMatchesLatest = Boolean(latest && selectedMonth === latest.month && dashboard.admissions.asOfDate?.startsWith(`${latest.month}-`));
  const reconciled = Boolean(latest && prior && movement && prior.census + movement.admissions - movement.discharges === latest.census);
  function selectMonth(month: string) { setSelectedMonth(month); setMovementPage(0); }
  return (
    <div data-executive-detail-view="census" data-census-ledger="true" className="census-ledger">
      <header className="census-ledger__header"><h1 id="executive-community-dialog-title"><span>{facilityName}</span><i aria-hidden="true" />Census ledger</h1><div className="census-ledger__book-meta"><span>{points[0]?.label} – {points.at(-1)?.label}</span><span>Operating limit <strong>{formatExecutiveNumber(operatingLimit)}</strong></span></div><button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close Census detail"><X aria-hidden="true" /></button></header>
      <PeriodTabs months={dashboard.census.slice(-12).map((point) => point.month)} selectedMonth={selectedMonth} onSelect={selectMonth} label="Census month" className="census-ledger__tabs" panelId={periodPanelId} />
      <div className="census-ledger__sheet">
        <div id={periodPanelId} role="tabpanel" aria-labelledby={selectedMonth ? `${periodPanelId}-${selectedMonth}` : undefined}>
        <div className="census-ledger__primary">
          <section className="material-panel census-ledger__chart"><h2>12-month census</h2><ExecutiveTrendChart points={points} height={255} accent="#0d4f8d" selectedId={selectedMonth} onSelect={selectMonth} ariaLabel="Monthly census history" unit="residents" referenceLine={operatingLimit == null ? null : { value: operatingLimit, label: `Operating limit ${formatExecutiveNumber(operatingLimit)}` }} /></section>
          <aside className="material-panel census-ledger__summary" aria-label="Selected census period"><h2>{selected ? formatMonthLabel(selected.month, { fallback: selected.month, month: "long" }) : "Selected period"}</h2><div className="census-ledger__hero"><strong>{formatExecutiveNumber(selected?.census)}</strong><span>residents</span></div><div className="census-ledger__hero"><strong>{formatExecutiveNumber(occupancy, "%")}</strong><span>occupied</span></div><div className="census-ledger__hero is-change"><strong>{selectedChange == null ? "—" : `${selectedChange > 0 ? "+" : ""}${formatExecutiveNumber(selectedChange)}`}</strong><span>{selectedPrior ? `vs ${formatMonthLabel(selectedPrior.month, { fallback: selectedPrior.month, month: "long" })}` : "change"}</span></div><dl><div><dt>Operating limit</dt><dd>{formatExecutiveNumber(operatingLimit)}</dd></div><div><dt>Available beds</dt><dd>{formatExecutiveNumber(availableBeds)}</dd></div><div><dt>Prior census</dt><dd>{formatExecutiveNumber(selectedPrior?.census)}</dd></div><div><dt>Selected census</dt><dd>{formatExecutiveNumber(selected?.census)}</dd></div></dl></aside>
        </div>
        {latest && prior && movement && movementMatchesLatest ? reconciled ? <section data-census-reconciliation="true" className="material-panel census-ledger__reconciliation"><h2>Census reconciliation <span>({formatMonthLabel(prior.month, { fallback: prior.month, month: "long" })} → {formatMonthLabel(latest.month, { fallback: latest.month, month: "long" })})</span></h2><div><ReconciliationCell label={`${formatMonthLabel(prior.month, { fallback: prior.month, month: "long" })} census`} value={prior.census} /><b aria-hidden="true">+</b><ReconciliationCell label="Admissions" value={movement.admissions} /><b aria-hidden="true">−</b><ReconciliationCell label="Discharges" value={movement.discharges} /><b aria-hidden="true">=</b><ReconciliationCell label={`${formatMonthLabel(latest.month, { fallback: latest.month, month: "long" })} census`} value={latest.census} emphasis /></div></section> : <section className="material-panel" data-census-movement-summary="true"><h2>Recorded movement · {formatMonthLabel(latest.month, { month: "long" })}</h2><dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4"><FolderMetric label="Admissions" value={formatExecutiveNumber(movement.admissions)} /><FolderMetric label="Discharges" value={formatExecutiveNumber(movement.discharges)} /><FolderMetric label="Net movement" value={formatExecutiveNumber(movement.admissions - movement.discharges)} /><FolderMetric label="Census change" value={formatExecutiveNumber(latest.census - prior.census)} /></dl><p className="mt-3 text-sm text-slate-600">Census and recorded movement differ by {formatExecutiveNumber(Math.abs(latest.census - prior.census - movement.admissions + movement.discharges))} residents.</p></section> : null}
        <section className="material-panel material-table-panel"><div className="material-table-panel__heading"><h2>Resident movement</h2><span>{movementRows.length ? `${movementRows.length} loaded events` : "No loaded movement records for this month"}</span></div><ScrollableRecords label="Resident movement records"><table><thead><tr><th>Date</th><th>Name</th><th>Action</th><th>Type</th><th>Destination</th><th>Notes</th></tr></thead><tbody>{movementRows.length ? movementRows.slice(movementPage * 8, (movementPage + 1) * 8).map((row) => <tr key={row.id}><td>{row.date ? formatExecutiveDate(row.date) : "—"}</td><td>{row.residentName}</td><td><span className={`movement-status is-${row.action === "Move-in" ? "in" : "out"}`}>{row.action}</span></td><td>{row.type}</td><td>{row.destination || "—"}</td><td>{row.note || "—"}</td></tr>) : <tr><td colSpan={6} className="material-table-empty">No movement records for this month are included in the loaded history.</td></tr>}</tbody></table></ScrollableRecords><RecordPagination label="Resident movement" page={movementPage} pageSize={8} total={movementRows.length} onChange={setMovementPage} /></section>
        </div>
      </div>
    </div>
  );
}

function ReconciliationCell({ label, value, prefix = "", emphasis = false }: { label: string; value: number; prefix?: string; emphasis?: boolean }) {
  return <div className={`reconciliation-cell ${emphasis ? "is-emphasis" : ""}`}><span>{label}</span><strong>{prefix}{formatExecutiveNumber(value)}</strong></div>;
}

function IncidentDetail({ facilityId, facilityName, dashboard, onClose, closeButtonRef, embedded = false }: { facilityId: string; facilityName: string; dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"]; onClose: () => void; closeButtonRef: React.RefObject<HTMLButtonElement | null>; embedded?: boolean }) {
  const periodPanelId = useId();
  const [selectedMonth, setSelectedMonth] = useState(dashboard.incidentTrend.at(-1)?.month ?? null);
  const [registerFilter, setRegisterFilter] = useState<{ category: string | null; from: string; to: string; key: number; scroll?: boolean }>();
  const selected = dashboard.incidentTrend.find((point) => point.month === selectedMonth) ?? dashboard.incidentTrend.at(-1);
  const categoryPeriod = executiveIncidentCategoryPeriod(dashboard, selectedMonth);
  const categories = categoryPeriod.categories;
  const categoryTotal = categoryPeriod.recordCount;
  const maximum = Math.max(...categories.map((item) => item.count), 1);
  function filterRecords(month: string | null, category: string | null, scroll = false) {
    const [year, monthNumber] = (month ?? "").split("-").map(Number);
    const validMonth = Boolean(year && monthNumber && monthNumber >= 1 && monthNumber <= 12);
    const from = validMonth ? month + "-01" : "";
    const to = validMonth ? new Date(Date.UTC(year!, monthNumber!, 0)).toISOString().slice(0, 10) : "";
    setRegisterFilter((current) => ({ category, from, to, key: (current?.key ?? 0) + 1, scroll }));
  }
  function selectMonth(month: string) { setSelectedMonth(month); filterRecords(month, null); }
  function selectCategory(category: string) { filterRecords(selectedMonth, category, true); }
  return <div data-executive-detail-view="incidents" data-incident-register="true" className="incident-register">
    <div className="incident-register__book-tabs"><h1 id={embedded ? "executive-community-workspace-title" : "executive-community-dialog-title"}>{facilityName}</h1><strong><ClipboardList aria-hidden="true" />Incident register</strong><div><span>{facilityName}</span><i aria-hidden="true">/</i><span>Incidents</span><button ref={closeButtonRef} type="button" onClick={onClose} aria-label={embedded ? "Back to overview" : "Close Incidents detail"} className={embedded ? "executive-material-workspace__back" : undefined}>{embedded ? <><ArrowLeft aria-hidden="true" /><span>Back to overview</span></> : <X aria-hidden="true" />}</button></div></div>
    <PeriodTabs months={dashboard.incidentTrend.slice(-12).map((point) => point.month)} selectedMonth={selectedMonth} onSelect={selectMonth} label="Incident month" className="incident-register__months" panelId={periodPanelId} />
    <div className="incident-register__sheet" id={periodPanelId} role="tabpanel" aria-labelledby={selectedMonth ? `${periodPanelId}-${selectedMonth}` : undefined}>
      <div className="incident-register__primary">
        <section className="material-panel incident-register__chart"><div className="material-panel__title"><ClipboardList aria-hidden="true" /><h2>12-month volume</h2><strong>{formatExecutiveNumber(selected?.count)}</strong></div><OperationalLineChart points={dashboard.incidentTrend.slice(-12).map((item) => ({ id: item.month, label: formatMonthLabel(item.month, { fallback: item.month, month: "short" }), value: item.count }))} accent="#a33d26" selectedId={selectedMonth} onSelect={selectMonth} ariaLabel="Monthly incident volume" /></section>
        <section className="material-panel incident-register__categories"><div className="material-panel__title"><Circle aria-hidden="true" /><h2>Category mix</h2></div><p className="mb-3 text-sm text-slate-600">{selectedMonth ? formatMonthLabel(selectedMonth, { month: "long" }) : "No period"} · {categoryPeriod.complete ? `${formatExecutiveNumber(categoryTotal)} incidents` : `${categoryPeriod.recordCount} available records${categoryPeriod.totalCount != null ? ` of ${formatExecutiveNumber(categoryPeriod.totalCount)} incidents` : ""}`}</p>{categories.length ? <ol>{categories.slice(0, 6).map((item) => <li key={item.label}><button type="button" onClick={() => selectCategory(item.label)}><span>{item.label}</span><i><b style={{ width: `${(item.count / maximum) * 100}%` }} /></i><strong>{formatExecutiveNumber(item.count)}</strong><em>{categoryTotal > 0 ? formatExecutiveNumber((item.count / categoryTotal) * 100, "%") : "—"}</em></button></li>)}</ol> : <EmptyState>No category records for this month are included in the loaded history.</EmptyState>}</section>
      </div>
      <ExecutiveIncidentRegister key={facilityId} facilityId={facilityId} {...(registerFilter ? { focusFilter: registerFilter } : {})} />
    </div>
  </div>;
}

function OperationalLineChart({ points, accent, selectedId, onSelect, ariaLabel, unitLabel = "incidents" }: { points: Array<{ id: string; label: string; value: number }>; accent: string; selectedId: string | null; onSelect: (id: string) => void; ariaLabel: string; unitLabel?: string }) {
  return <ExecutiveTrendChart points={points} accent={accent} selectedId={selectedId} onSelect={onSelect} ariaLabel={ariaLabel} height={255} percentage={unitLabel === "percent"} unit={unitLabel === "percent" ? "" : unitLabel} />;
}

function MedicationDetail({ facilityName, dashboard, onClose, closeButtonRef, embedded = false }: { facilityName: string; dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"]; onClose: () => void; closeButtonRef: React.RefObject<HTMLButtonElement | null>; embedded?: boolean }) {
  const periodPanelId = useId();
  const medication = dashboard.medication;
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const [recordPage, setRecordPage] = useState(0);
  const availableHistory = (dashboard.medicationHistory ?? []).filter((item) => item.compliancePct != null);
  const history = (availableHistory.length ? availableHistory : medication ? [{ month: medication.month, compliancePct: medication.compliancePct, scheduled: medication.scheduled, given: medication.given, notGiven: medication.notGiven }] : []).slice(-6);
  const [selectedMonth, setSelectedMonth] = useState(medication?.month ?? history.at(-1)?.month ?? null);
  const chrome = <div className="mar-binder__book-tabs"><h1 id={embedded ? "executive-community-workspace-title" : "executive-community-dialog-title"}>{facilityName}</h1><strong><Pill aria-hidden="true" />Medication administration</strong><div className="mar-binder__context"><span>{facilityName}</span><i aria-hidden="true">/</i><span>Medication Administration</span><button ref={closeButtonRef} type="button" onClick={onClose} aria-label={embedded ? "Back to overview" : "Close Medication administration detail"} className={embedded ? "executive-material-workspace__back" : undefined}>{embedded ? <><ArrowLeft aria-hidden="true" /><span>Back to overview</span></> : <X aria-hidden="true" />}</button></div></div>;
  if (!medication) return <div data-executive-detail-view="medications" data-mar-binder="true" className="mar-binder">{chrome}<div className="mar-binder__sheet mar-binder__sheet--empty"><EmptyState>Medication administration totals are not available.</EmptyState></div></div>;
  const selectedPeriod = history.find((item) => item.month === selectedMonth) ?? medication;
  const scheduled = selectedPeriod.scheduled;
  const given = selectedPeriod.given;
  const notGiven = selectedPeriod.notGiven;
  const givenPct = scheduled != null && scheduled > 0 && given != null ? (given / scheduled) * 100 : null;
  const notGivenPct = scheduled != null && scheduled > 0 && notGiven != null ? (notGiven / scheduled) * 100 : null;
  const exceptions = (dashboard.medicationExceptions ?? []).filter((row) => dateMatchesMonth(row.date, selectedMonth));
  const exceptionKinds = [...exceptions.reduce((counts, row) => counts.set(row.outcome, (counts.get(row.outcome) ?? 0) + 1), new Map<string, number>()).entries()].sort((left, right) => right[1] - left[1]);
  const visibleExceptions = selectedKind ? exceptions.filter((row) => row.outcome === selectedKind) : exceptions;
  const periodWatch = [...exceptions.reduce((counts, row) => {
    const key = row.residentId ?? row.residentName;
    const current = counts.get(key) ?? { residentId: row.residentId, residentName: row.residentName, exceptions: 0 };
    current.exceptions += 1;
    counts.set(key, current);
    return counts;
  }, new Map<string, { residentId: string | null; residentName: string; exceptions: number }>()).values()].sort((left, right) => right.exceptions - left.exceptions).slice(0, 10);
  const watch = periodWatch;
  function selectMonth(month: string) { setSelectedMonth(month); setSelectedKind(null); setRecordPage(0); }
  function selectKind(kind: string | null) { setSelectedKind(kind); setRecordPage(0); }
  return <div data-executive-detail-view="medications" data-mar-binder="true" className="mar-binder">
    {chrome}
    <PeriodTabs months={history.map((point) => point.month)} selectedMonth={selectedMonth} onSelect={selectMonth} label="Medication month" className="mar-binder__months" panelId={periodPanelId} />
    <div className="mar-binder__sheet" id={periodPanelId} role="tabpanel" aria-labelledby={selectedMonth ? `${periodPanelId}-${selectedMonth}` : undefined}>
      <div className="mar-binder__rings" aria-hidden="true"><i /><i /><i /></div>
      <div className="mar-binder__primary">
        <section className="material-panel mar-binder__history"><div className="material-panel__title"><ClipboardList aria-hidden="true" /><h2>Compliance history</h2><strong>{formatExecutiveNumber(selectedPeriod.compliancePct, "%")} <small>completion</small></strong></div><OperationalLineChart points={history.filter((item) => item.compliancePct != null).map((item) => ({ id: item.month, label: formatMonthLabel(item.month, { fallback: item.month, month: "short" }), value: item.compliancePct! }))} accent="#74134f" selectedId={selectedMonth} onSelect={selectMonth} ariaLabel="Medication compliance history" unitLabel="percent" /></section>
        <section className="material-panel mar-binder__composition"><div className="material-panel__title"><Pill aria-hidden="true" /><h2>Administration composition</h2><strong>{formatMonthLabel(selectedPeriod.month, { fallback: selectedPeriod.month, month: "long" })}</strong></div>{givenPct != null && notGivenPct != null ? <div className="mar-composition-bar" aria-label={`${formatExecutiveNumber(givenPct, "%")} given and ${formatExecutiveNumber(notGivenPct, "%")} not given`}><span style={{ width: `${Math.min(100, givenPct)}%` }}>{formatExecutiveNumber(givenPct, "%")}</span><i style={{ width: `${Math.min(100, notGivenPct)}%` }}>{formatExecutiveNumber(notGivenPct, "%")}</i></div> : <p className="material-inline-empty">Composition unavailable for this period.</p>}<dl><MedicationTotal label="Scheduled" value={scheduled} /><MedicationTotal label="Given" value={given} /><MedicationTotal label="Not given" value={notGiven} emphasis /></dl></section>
      </div>
      <div className="mar-binder__detail-grid">
        <section className="material-panel material-table-panel mar-binder__exceptions"><div className="material-table-panel__heading"><h2><FileCheck2 aria-hidden="true" />Medication administration exceptions</h2><span>{exceptions.length ? `${exceptions.length} available records` : "No loaded exception records for this month"}</span></div>{exceptionKinds.length ? <div className="mar-exception-tabs"><button type="button" aria-pressed={!selectedKind} onClick={() => selectKind(null)}>All ({exceptions.length})</button>{exceptionKinds.map(([kind, count]) => <button key={kind} type="button" aria-pressed={selectedKind === kind} onClick={() => selectKind(kind)}>{kind} ({count})</button>)}</div> : null}<ScrollableRecords label="Medication exception records"><table><thead><tr><th>Resident</th><th>Medication</th><th>Date</th><th>Outcome</th><th>Recorded reason</th><th>Note</th></tr></thead><tbody>{visibleExceptions.length ? visibleExceptions.slice(recordPage * 12, (recordPage + 1) * 12).map((row) => <tr key={row.id}><td>{row.residentName}</td><td>{[row.medication, row.dosage].filter(Boolean).join(" ")}</td><td>{row.date ? formatExecutiveDate(row.date) : "—"}</td><td>{row.outcome}</td><td>{row.reason || "—"}</td><td>{row.noteRecorded ? "Recorded" : "Not recorded"}</td></tr>) : <tr><td colSpan={6} className="material-table-empty">{selectedKind ? `No ${selectedKind.toLowerCase()} records are available for this month.` : "No medication exception records for this month are included in the loaded history."}</td></tr>}</tbody></table></ScrollableRecords><RecordPagination label="Medication exceptions" page={recordPage} pageSize={12} total={visibleExceptions.length} onChange={setRecordPage} /></section>
        <aside className="material-panel mar-binder__watch"><div className="material-panel__title"><UsersRound aria-hidden="true" /><h2>Resident watch</h2></div><p>{formatMonthLabel(selectedPeriod.month, { month: "long" })} · Available exception records</p>{watch.length ? <ol>{watch.map((row, index) => <li key={row.residentId ?? row.residentName}><span>{index + 1}</span><strong>{row.residentName}</strong><b>{formatExecutiveNumber(row.exceptions)}</b></li>)}</ol> : <div className="material-inline-empty">No resident exception records for this month are included in the loaded history.</div>}</aside>
      </div>
    </div>
  </div>;
}

function MedicationTotal({ label, value, emphasis = false }: { label: string; value: number | null; emphasis?: boolean }) {
  return <div className="flex items-center justify-between gap-6 py-4"><dt className="text-[14px] font-medium text-[#625868]">{label}</dt><dd className={`text-[24px] font-semibold tabular-nums ${emphasis ? "text-[#7a3f69]" : "text-[#2e2733]"}`}>{formatExecutiveNumber(value)}</dd></div>;
}

function AdmissionsDetail({ facilityName, dashboard, initialAdmissionId, onSelectionChange, onOpenCard, onClose, closeButtonRef }: { facilityName: string; dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"]; initialAdmissionId?: number | null; onSelectionChange: ((referralId: number) => void) | undefined; onOpenCard: (card: AdmissionsBoardCard) => void; onClose: () => void; closeButtonRef: React.RefObject<HTMLButtonElement | null> }) {
  const admissions = dashboard.admissions;
  const clients = useMemo(() => impendingAdmissionCards(admissions.cards), [admissions.cards]);
  const [selectedReferralId, setSelectedReferralId] = useState<number | null>(initialAdmissionId ?? clients[0]?.referralId ?? null);
  const selected = clients.find((card) => card.referralId === selectedReferralId) ?? clients[0];
  const tabStripRef = useSelectedTabVisibility(selected?.referralId ?? null);
  if (admissions.status !== "connected") return <UnavailableAdmissionsDetail facilityName={facilityName} message="The admissions feed is temporarily unavailable." onClose={onClose} closeButtonRef={closeButtonRef} />;
  if (!selected) return <UnavailableAdmissionsDetail facilityName={facilityName} message="No clients are currently moving toward admission." onClose={onClose} closeButtonRef={closeButtonRef} />;
  const profile = selected.managementProfile;
  const planned = selected.plannedAdmissionDate;
  const assessmentComplete = profile.assessmentSigned;
  const documentsComplete = ["reviewed", "complete", "completed"].includes((profile.documentStatus ?? "").trim().toLowerCase());
  const requirementsComplete = profile.openRequirements === 0 && profile.blockingRequirements === 0;
  const statusLabel = selected.status || "Status not recorded";
  function selectClient(referralId: number) {
    setSelectedReferralId(referralId);
    onSelectionChange?.(referralId);
  }
  return <div data-executive-detail-view="admissions" data-executive-impending-admits="true" className="admissions-file-wrap">
    <section data-admissions-folder-shell="true" className="admissions-file">
      <div data-admissions-folder-masthead="true" className="admissions-file__masthead">
        <div ref={tabStripRef} className="admissions-file__tabs" role="tablist" aria-label="Impending admits">
          {clients.map((card, index) => <button
            key={card.referralId}
            id={selected.referralId === card.referralId ? "executive-community-dialog-title" : undefined}
            data-admissions-folder-tab="true"
            type="button"
            role="tab"
            aria-selected={selected.referralId === card.referralId}
            aria-controls="executive-admissions-client-panel"
            tabIndex={selected.referralId === card.referralId ? 0 : -1}
            className={`admissions-file__tab${selected.referralId === card.referralId ? " admissions-file__tab--active" : ""}`}
            onClick={() => selectClient(card.referralId)}
            onKeyDown={(event) => {
              const nextIndex = event.key === "ArrowRight" ? (index + 1) % clients.length : event.key === "ArrowLeft" ? (index - 1 + clients.length) % clients.length : event.key === "Home" ? 0 : event.key === "End" ? clients.length - 1 : null;
              if (nextIndex == null || !clients[nextIndex]) return;
              event.preventDefault();
              selectClient(clients[nextIndex].referralId);
              tabStripRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus({ preventScroll: true });
            }}
          >{card.clientName}</button>)}
        </div>
        <div className="admissions-file__context">
          <span>{facilityName}</span><span aria-hidden="true">/</span><span>Admissions</span>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close admissions detail" className="admissions-file__close"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
      </div>
      <div id="executive-admissions-client-panel" role="tabpanel" aria-labelledby="executive-community-dialog-title" data-admissions-folder-sheet="true" className="admissions-file__sheet">
        <div className="admissions-file__grid">
          <div className="admissions-file__column">
            <section className="admissions-file__client-file">
              <div className="admissions-file__identity">
                <span>Client file</span>
                <h2>{selected.clientName}</h2>
              </div>
              <dl className="admissions-file__identity-meta">
                <FolderMetric label="Referral ID" value={`#${selected.referralId}`} />
                <FolderMetric label="Days in pipeline" value={selected.daysOpen == null ? "Not recorded" : `${selected.daysOpen} days`} />
                <FolderMetric label="Current status" value={statusLabel} />
              </dl>
            </section>
            <section data-admissions-record-sheet="true" className="admissions-record-sheet">
              <AdmissionsRecordRow icon={<CalendarCheck2 aria-hidden="true" />} label="Planned move-in" primary={planned ? formatImpendingAdmissionDate(planned, true) : "Not scheduled"} emphasis />
              <AdmissionsRecordRow
                icon={<UsersRound aria-hidden="true" />}
                label="Referral source"
                primary={profile.referralSource || "Not recorded"}
                secondary={selected.owner ? `Assigned to ${selected.owner}` : "No owner assigned"}
                action={selected.pipelineUrl ? <a href={selected.pipelineUrl} target="_blank" rel="noreferrer" className="admissions-file__pipeline-link">Open in Pipeline<ExternalLink aria-hidden="true" /></a> : null}
              />
              <AdmissionsRecordRow icon={<MapPin aria-hidden="true" />} label="Community" primary={selected.community || facilityName} secondary={profile.referringCounty || "County not recorded"} />
              <AdmissionsRecordRow icon={<ShieldCheck aria-hidden="true" />} label="Payer" primary={profile.payer || "Not recorded"} />
              <AdmissionsRecordRow icon={<UsersRound aria-hidden="true" />} label="Responsible person" primary={profile.responsiblePerson || "Not recorded"} secondary={profile.conservedStatus || null} />
            </section>
            <section className="admissions-file__notes">
              <div className="admissions-file__notes-heading"><NotebookText aria-hidden="true" /><h3>Notes</h3></div>
              {profile.overview.length ? <ul className="admissions-file__copy-list">{profile.overview.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="admissions-file__empty-copy">No overview notes are recorded.</p>}
              <div className="admissions-file__notes-meta"><span>Updated {selected.daysSinceUpdate === 0 ? "today" : `${selected.daysSinceUpdate} days ago`}</span><button type="button" aria-label="Open full management chart" onClick={() => onOpenCard(selected)} className="admissions-file__open-chart">Open chart<ArrowRight aria-hidden="true" /></button></div>
            </section>
            <span className="admissions-file__page-grip" aria-hidden="true"><i /><i /></span>
          </div>
          <div className="admissions-file__column admissions-file__column--clinical">
            <FolderPanel icon={<ClipboardList aria-hidden="true" />} title="Assessment" status={profile.assessmentStatus || "Not recorded"} statusTone={assessmentComplete ? "complete" : "neutral"}><dl className="admissions-profile-grid"><FolderMetric label="Assessment date" value={profile.assessmentDate ? formatExecutiveDate(profile.assessmentDate) : "Not recorded"} /><FolderMetric label="Signed" value={profile.assessmentSigned ? "Yes" : "No"} /></dl></FolderPanel>
            <FolderPanel icon={<FileCheck2 aria-hidden="true" />} title="Documents" status={profile.documentStatus || "Not recorded"} statusTone={documentsComplete ? "complete" : "neutral"}><ul className="admissions-check-grid"><FolderCheck label="Assessment signature" complete={profile.assessmentSigned} /><FolderCheck label="Document review" complete={documentsComplete} /></ul></FolderPanel>
            <FolderPanel icon={<ShieldCheck aria-hidden="true" />} title="Open requirements" status={`${formatExecutiveNumber(profile.openRequirements)} open`} statusTone={requirementsComplete ? "complete" : profile.blockingRequirements > 0 ? "warning" : "neutral"}><dl className="admissions-profile-grid"><FolderMetric label="Open" value={formatExecutiveNumber(profile.openRequirements)} /><FolderMetric label="Blocking" value={formatExecutiveNumber(profile.blockingRequirements)} /></dl><p className="admissions-file__next-action">{selected.nextAction || "No next action is recorded."}</p></FolderPanel>
            <FolderPanel icon={<UsersRound aria-hidden="true" />} title="Support needs" status={profile.supportSnapshot.length ? "Identified" : "Not recorded"} statusTone={profile.supportSnapshot.length ? "complete" : "neutral"}>{profile.supportSnapshot.length ? <ul className="admissions-check-grid">{profile.supportSnapshot.map((item) => <FolderCheck key={`${item.label}-${item.value}`} label={`${item.label}: ${item.value}`} complete />)}</ul> : <p className="admissions-file__empty-copy">No support needs are recorded.</p>}</FolderPanel>
            <FolderPanel icon={<Pill aria-hidden="true" />} title="Medications" status={profile.medicationSource ? profile.medicationSource.replace(/_/g, " ") : "Source not recorded"} statusTone={profile.medications.length ? "complete" : "neutral"}>{profile.medications.length ? <ul className="admissions-file__copy-list">{profile.medications.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="admissions-file__empty-copy">No medication summary is available.</p>}</FolderPanel>
          </div>
          <aside data-admissions-folder-timeline="true" className="admissions-file__timeline"><h3><Clock3 aria-hidden="true" />Admissions timeline</h3><ol><FolderTimelineStep label="Referral in pipeline" detail={selected.daysOpen == null ? null : `${selected.daysOpen} days open`} state="done" /><FolderTimelineStep label="Assessment" detail={profile.assessmentDate ? formatExecutiveDate(profile.assessmentDate) : profile.assessmentStatus} state={assessmentComplete ? "done" : profile.assessmentStatus ? "current" : "pending"} /><FolderTimelineStep label="Documents" detail={profile.documentStatus} state={documentsComplete ? "done" : profile.documentStatus ? "current" : "pending"} /><FolderTimelineStep label="Requirements" detail={requirementsComplete ? "Clear" : `${formatExecutiveNumber(profile.openRequirements)} open`} state={requirementsComplete ? "done" : "current"} /><FolderTimelineStep label="Move-in" detail={planned ? formatImpendingAdmissionDate(planned, true) : "Not scheduled"} state={planned ? "current" : "pending"} /><FolderTimelineStep label="Admitted" detail="Pending" state="pending" last /></ol></aside>
        </div>
      </div>
    </section>
  </div>;
}

function UnavailableAdmissionsDetail({ facilityName, message, onClose, closeButtonRef }: { facilityName: string; message: string; onClose: () => void; closeButtonRef: React.RefObject<HTMLButtonElement | null> }) {
  return <div data-executive-detail-view="admissions" data-executive-impending-admits="true" className="admissions-file-wrap"><section data-admissions-folder-shell="true" className="admissions-file admissions-file--empty"><div className="admissions-file__masthead"><div className="admissions-file__tabs"><span id="executive-community-dialog-title" className="admissions-file__tab admissions-file__tab--active">Admissions</span></div><div className="admissions-file__context"><span>{facilityName}</span><span aria-hidden="true">/</span><span>Admissions</span><button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close admissions detail" className="admissions-file__close"><X aria-hidden="true" /></button></div></div><div className="admissions-file__sheet"><EmptyState>{message}</EmptyState></div></section></div>;
}

function FolderPanel({ icon, title, status, statusTone = "neutral", children }: { icon?: React.ReactNode; title?: string; status?: string; statusTone?: "complete" | "warning" | "neutral"; children: React.ReactNode }) {
  const badgeClass = statusTone === "complete" ? "is-complete" : statusTone === "warning" ? "is-warning" : "is-neutral";
  return <section data-admissions-folder-panel="true" className="admissions-folder-panel">{title ? <div className="admissions-folder-panel__heading"><h3>{icon ? <span>{icon}</span> : null}{title}</h3>{status ? <span className={`admissions-folder-panel__badge ${badgeClass}`}>{status}</span> : null}</div> : null}{children}</section>;
}

function FolderCheck({ label, complete }: { label: string; complete: boolean }) {
  return <li className="admissions-folder-check">{complete ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}<span>{label}</span></li>;
}

function FolderTimelineStep({ label, detail, state, last = false }: { label: string; detail: string | null; state: "done" | "current" | "pending"; last?: boolean }) {
  const icon = state === "done" ? <CheckCircle2 className="h-5 w-5 text-[#0f8b73]" aria-hidden="true" /> : state === "current" ? <Clock3 className="h-5 w-5 text-[#c47a10]" aria-hidden="true" /> : <Circle className="h-5 w-5 text-[#b9c0c4]" aria-hidden="true" />;
  return <li className={`admissions-timeline-step is-${state}`}>{!last ? <span className="admissions-timeline-step__line" aria-hidden="true" /> : null}<span className="admissions-timeline-step__icon">{icon}</span><span><strong>{label}</strong>{detail ? <small>{detail}</small> : null}</span></li>;
}

function AdmissionsRecordRow({ icon, label, primary, secondary, emphasis = false, action }: { icon: React.ReactNode; label: string; primary: string; secondary?: string | null; emphasis?: boolean; action?: React.ReactNode }) {
  return <div data-admissions-record-row="true" className={`admissions-record-row ${emphasis ? "is-emphasis" : ""}`}>
    <span className="admissions-record-row__icon">{icon}</span>
    <span className="admissions-record-row__label">{label}</span>
    <span className="admissions-record-row__value"><strong>{primary}</strong>{secondary ? <small>{secondary}</small> : null}</span>
    {action ? <span className="admissions-record-row__action">{action}</span> : null}
  </div>;
}

function FolderMetric({ label, value }: { label: string; value: string }) {
  return <div data-admissions-metric="true" className="admissions-folder-metric"><dt>{label}</dt><dd>{value}</dd></div>;
}

function dateMatchesMonth(date: string | null, month: string | null) {
  return Boolean(date && month && /^\d{4}-\d{2}-\d{2}/.test(date) && date.startsWith(`${month}-`));
}

function RecordPagination({ label, page, pageSize, total, onChange }: { label: string; page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  if (total <= pageSize) return null;
  const lastPage = Math.ceil(total / pageSize) - 1;
  return <nav aria-label={`${label} pages`} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
    <span aria-live="polite">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total} records</span>
    <div className="flex gap-2">
      <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)} className="min-h-11 rounded border border-slate-300 bg-white px-3 disabled:opacity-40">Previous</button>
      <button type="button" disabled={page >= lastPage} onClick={() => onChange(page + 1)} className="min-h-11 rounded border border-slate-300 bg-white px-3 disabled:opacity-40">Next</button>
    </div>
  </nav>;
}

function ScrollableRecords({ label, children }: { label: string; children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const measure = () => setOverflows(scroll.scrollWidth > scroll.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(scroll);
    if (scroll.firstElementChild) observer.observe(scroll.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, []);
  return <>
    <div ref={scrollRef} className="material-table-scroll" role="region" aria-label={label} aria-describedby={overflows ? hintId : undefined} tabIndex={0}>{children}</div>
    {overflows ? <p id={hintId} className="material-table-scroll-hint">↔ Scroll columns</p> : null}
  </>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[18px] border border-[#cfd6d2] bg-white px-4 py-8 text-[14px] leading-6 text-[#68716d]">{children}</p>;
}
