import { useMsal } from "@azure/msal-react";
import { ArrowRight, Bell, ClipboardList, Pill, UsersRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatMonthLabel } from "../../../../shared/period-utils.mjs";
import { isE2EAuthBypassEnabled } from "../../../app/auth/authConfig";
import { getAccountExecutiveDirectorAccess } from "../../../shared/auth/executiveDirectorAccess";
import type { AdmissionsBoardCard } from "../../../shared/types/platformSnapshot";
import { ProgressModal } from "../../admissions/components/PipelineBoard";
import { ExecutiveCommunityDetailModal, ExecutiveCommunityWorkspace, type ExecutiveCommunityDetailView } from "../components/ExecutiveCommunityDetailModal";
import { ExecutiveReferralStatusPill } from "../components/ExecutiveReferralStatusPill";
import { ExecutiveTrendChart } from "../components/ExecutiveTrendChart";
import { ExecutiveIncidentRegister } from "../components/ExecutiveIncidentRegister";
import { formatImpendingAdmissionDate, impendingAdmissionCards } from "../components/executiveAdmissions";
import { formatExecutiveDate, formatExecutiveNumber } from "../components/executiveDashboardFormatters";
import { executiveIncidentCategoryPeriod } from "../components/executiveIncidentCategories";
import { fetchExecutiveDirectorCommunityDashboard, type ExecutiveDirectorCommunityDashboardResponse } from "../data/executiveDirectorApi";
import "../executiveCommunity.css";

const DEFAULT_PREVIEW_FACILITY_ID = "337";
const ADMISSIONS_STALE_MESSAGE = "Updates unavailable. Showing the last connected Pipeline data.";

export default function ExecutiveDirectorDashboardPage() {
  const { accounts, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  const access = getAccountExecutiveDirectorAccess(account, isE2EAuthBypassEnabled);
  const facilityId = access.primaryFacilityId ?? DEFAULT_PREVIEW_FACILITY_ID;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const view = requestedView === "mars" || requestedView === "incidents" ? requestedView : "overview";
  const [response, setResponse] = useState<ExecutiveDirectorCommunityDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [admissionsStale, setAdmissionsStale] = useState(false);
  const [detailView, setDetailView] = useState<"census" | "admissions" | null>(null);
  const [admissionId, setAdmissionId] = useState<number | null>(null);
  const [managementId, setManagementId] = useState<number | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const communityRef = useRef<HTMLElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const notificationPopoverRef = useRef<HTMLElement>(null);

  useEffect(() => {
    communityRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [view]);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    setResponse(null);
    setLoading(true);
    setError(null);
    setAdmissionsStale(false);
    setNotificationsOpen(false);
    setDetailView(null);
    setManagementId(null);
    setAdmissionId(null);
    async function refresh() {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const fresh = await fetchExecutiveDirectorCommunityDashboard(facilityId, controller.signal);
        if (controller.signal.aborted) return;
        setAdmissionsStale(fresh.dashboard.admissions.status !== "connected");
        setResponse((previous) => {
          // A failed feed refresh must not dismiss a pending client's notification.
          if (fresh.dashboard.admissions.status !== "connected" && previous?.facility.facilityId === fresh.facility.facilityId && previous.dashboard.admissions.status === "connected") {
            return { ...fresh, dashboard: { ...fresh.dashboard, admissions: previous.dashboard.admissions } };
          }
          return fresh;
        });
        setError(null);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setAdmissionsStale(true);
          setError(reason instanceof Error ? reason.message : "The community dashboard could not be refreshed.");
        }
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    const refreshVisible = () => { if (document.visibilityState !== "hidden") void refresh(); };
    void refresh();
    const timer = window.setInterval(refreshVisible, 60_000);
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("online", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("online", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [facilityId]);

  useEffect(() => {
    if (!notificationsOpen) return;
    function fitPopover() {
      const popover = notificationPopoverRef.current;
      if (!popover) return;
      const visualViewport = window.visualViewport;
      const bottom = (visualViewport?.height ?? window.innerHeight) + (visualViewport?.offsetTop ?? 0);
      popover.style.maxHeight = `${Math.max(0, bottom - popover.getBoundingClientRect().top - 12)}px`;
    }
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !notificationRef.current?.contains(event.target)) setNotificationsOpen(false);
    }
    function closeEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setNotificationsOpen(false);
      notificationButtonRef.current?.focus();
    }
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeEscape);
    window.addEventListener("resize", fitPopover);
    window.addEventListener("scroll", fitPopover, true);
    window.visualViewport?.addEventListener("resize", fitPopover);
    fitPopover();
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeEscape);
      window.removeEventListener("resize", fitPopover);
      window.removeEventListener("scroll", fitPopover, true);
      window.visualViewport?.removeEventListener("resize", fitPopover);
    };
  }, [notificationsOpen]);

  const facility = response?.facility;
  const dashboard = response?.dashboard;
  const admissions = dashboard?.admissions;
  const clients = impendingAdmissionCards(admissions?.cards ?? []);
  const selectedCard = clients.find((card) => card.referralId === managementId) ?? null;
  const generatedAt = [dashboard?.generatedAt, admissions?.generatedAt].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const closeDetail = useCallback(() => {
    setDetailView(null);
    if (detailView === "admissions") {
      setAdmissionId(null);
      notificationButtonRef.current?.focus();
    }
  }, [detailView]);
  const closeManagement = useCallback(() => {
    setManagementId(null);
    setDetailView("admissions");
  }, []);

  useEffect(() => {
    if (!admissions || admissions.status !== "connected" || admissionsStale) return;
    const pending = impendingAdmissionCards(admissions.cards);
    if (admissionId != null && !pending.some((card) => card.referralId === admissionId)) {
      setDetailView((current) => current === "admissions" ? null : current);
      setManagementId(null);
      setAdmissionId(null);
      if (detailView === "admissions" || managementId != null) notificationButtonRef.current?.focus();
    }
  }, [admissions, admissionsStale, admissionId, detailView, managementId]);

  function selectView(next: "overview" | "mars" | "incidents") {
    setNotificationsOpen(false);
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (next === "overview") params.delete("view");
      else params.set("view", next);
      return params;
    });
  }
  function openDetail(next: ExecutiveCommunityDetailView) {
    if (next === "medications" || next === "incidents") {
      selectView(next === "medications" ? "mars" : "incidents");
    } else {
      setDetailView(next);
    }
  }
  function meetClient(card: AdmissionsBoardCard) {
    setAdmissionId(card.referralId);
    setNotificationsOpen(false);
    setDetailView("admissions");
  }

  return (
    <section ref={communityRef} data-executive-community-dashboard="true" className="executive-director-community">
      <header className="executive-director-community__masthead">
        <div><h1>{facility?.shortName ?? "Community"}</h1>{facility?.state ? <span>{facility.state}</span> : null}</div>
        <p>{dashboard?.reportingMonth ? formatMonthLabel(dashboard.reportingMonth, { month: "long" }) : "Latest period"}{generatedAt ? ` · Updated ${formatExecutiveDate(generatedAt, true)}` : ""}</p>
      </header>
      <div className="executive-community-toolbar">
        <div role="tablist" aria-label="Community views" className="executive-community-tabs">
          {([{ id: "overview", label: "Overview" }, { id: "mars", label: "MARs" }, { id: "incidents", label: "Incidents" }] as const).map((item, index, items) => <button key={item.id} id={`executive-tab-${item.id}`} type="button" role="tab" aria-selected={view === item.id} aria-controls="executive-view-panel" tabIndex={view === item.id ? 0 : -1} onClick={() => selectView(item.id)} onKeyDown={(event) => {
            const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (!offset && event.key !== "Home" && event.key !== "End") return;
            event.preventDefault();
            const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + offset + items.length) % items.length;
            const next = items[nextIndex];
            if (!next) return;
            selectView(next.id);
            document.getElementById(`executive-tab-${next.id}`)?.focus();
          }}>{item.label}</button>)}
        </div>
        <div className="executive-client-notifications" ref={notificationRef}>
          <button ref={notificationButtonRef} data-executive-meet-client-trigger="true" className="executive-client-notifications__trigger" type="button" aria-label="New client notifications" aria-expanded={notificationsOpen} aria-controls="executive-client-notifications" onClick={() => setNotificationsOpen((open) => !open)}>
            <Bell aria-hidden="true" /><span>New client</span>{admissions?.status === "connected" && clients.length > 0 ? <b data-executive-notification-count="true">{clients.length}</b> : null}
          </button>
          {notificationsOpen ? <section ref={notificationPopoverRef} id="executive-client-notifications" data-executive-client-notifications="true" role="region" aria-label="New client notifications" className="executive-client-notifications__popover">
            <header><h2>New client</h2>{admissions?.status === "connected" ? <span>{clients.length} pending</span> : null}</header>
            {admissions?.status === "connected" ? <>
              {admissionsStale ? <p role="status" className="executive-client-notifications__status">{ADMISSIONS_STALE_MESSAGE}</p> : null}
              {clients.length ? <ul>{clients.map((card) => <li key={card.referralId}><button type="button" onClick={() => meetClient(card)}><span><strong>{card.clientName}</strong><small>{card.plannedAdmissionDate ? `Planned ${formatImpendingAdmissionDate(card.plannedAdmissionDate, false)}` : "Date pending"}</small><ExecutiveReferralStatusPill status={card.status} /></span><ArrowRight aria-hidden="true" /></button></li>)}</ul> : <p className="executive-client-notifications__status">No clients awaiting admission.</p>}
            </> : <p className="executive-client-notifications__status">{loading ? "Loading client notifications…" : "Admissions feed unavailable."}</p>}
          </section> : null}
        </div>
      </div>
      {error ? <div role="alert" className="executive-dashboard-message">{error}</div> : null}
      {loading && !response ? <div role="status" className="executive-dashboard-loading">Loading community dashboard…</div> : null}
      {!loading && dashboard?.status === "unavailable" ? <div role="status" className="executive-dashboard-message">Community measures are temporarily unavailable.</div> : null}
      <div id="executive-view-panel" role="tabpanel" aria-labelledby={`executive-tab-${view}`}>
        {dashboard && view === "overview" ? <CommunityOverview dashboard={dashboard} onOpenDetail={openDetail} /> : null}
        {view === "overview" ? <div className="executive-all-incidents"><ExecutiveIncidentRegister key={facilityId} facilityId={facilityId} /></div> : null}
        {dashboard && facility && view !== "overview" ? <ExecutiveCommunityWorkspace key={view} facility={facility} dashboard={dashboard} view={view === "mars" ? "medications" : "incidents"} onBack={() => selectView("overview")} /> : null}
      </div>
      {dashboard && facility && detailView ? <ExecutiveCommunityDetailModal facility={facility} dashboard={dashboard} view={detailView} initialAdmissionId={admissionId} sourceNotice={detailView === "admissions" && admissionsStale ? ADMISSIONS_STALE_MESSAGE : null} onAdmissionSelectionChange={setAdmissionId} onClose={closeDetail} onOpenAdmissionCard={(card) => { setAdmissionId(card.referralId); setDetailView(null); setManagementId(card.referralId); }} /> : null}
      {selectedCard && admissions?.status === "connected" ? <ProgressModal card={selectedCard} generatedAt={admissions.generatedAt ?? generatedAt ?? new Date().toISOString()} sourceNotice={admissionsStale ? ADMISSIONS_STALE_MESSAGE : null} onClose={closeManagement} /> : null}
    </section>
  );
}

function CommunityOverview({ dashboard, onOpenDetail }: {
  dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"];
  onOpenDetail: (view: ExecutiveCommunityDetailView, card?: AdmissionsBoardCard) => void;
}) {
  const census = dashboard.census.at(-1);
  const priorCensus = dashboard.census.at(-2);
  const delta = census && priorCensus ? census.census - priorCensus.census : null;
  const limit = dashboard.admissions.community?.operatingLimit ?? null;
  const occupancy = census && limit ? census.census / limit * 100 : null;
  const incident = dashboard.incidentTrend.at(-1);
  const priorIncident = dashboard.incidentTrend.at(-2);
  const incidentIsMonthToDate = Boolean(incident && dashboard.generatedAt?.startsWith(incident.month));
  const medication = dashboard.medication;
  const categoryPeriod = executiveIncidentCategoryPeriod(dashboard, incident?.month);
  const categories = categoryPeriod.categories.slice(0, 4);
  const categoryMaximum = Math.max(...categories.map((item) => item.count), 1);

  return <div data-daily-operating-summary="true" className="executive-dashboard-index">
    <DomainPanel kind="census" label="Census" title="12-month census" icon={<UsersRound />} action="History" onOpen={() => onOpenDetail("census")}>
      <div className="executive-census-overview">
        <div className="executive-census-figure"><strong>{formatExecutiveNumber(census?.census)}</strong><span>residents</span><small>{formatExecutiveNumber(occupancy, "%")} occupied{limit ? ` · ${limit} operating limit` : ""}</small></div>
        <div className="executive-census-change"><span>{census ? formatMonthLabel(census.month, { month: "short" }) : "No period"}</span>{delta != null ? <strong>{delta > 0 ? "+" : ""}{delta} <small>vs {formatMonthLabel(priorCensus!.month, { month: "short" })}</small></strong> : null}</div>
      </div>
      <ExecutiveTrendChart points={dashboard.census.slice(-12).map((item) => ({ id: item.month, label: formatMonthLabel(item.month, { month: "short" }), value: item.census }))} accent="#174f81" height={180} compact ariaLabel="Community census history" />
    </DomainPanel>
    <DomainPanel kind="incidents" label="Incidents" title="Incident activity" icon={<ClipboardList />} action="Trend" onOpen={() => onOpenDetail("incidents")}>
      <div className="executive-incident-overview">
        <div><div className="executive-section-meta"><span>{incident ? formatMonthLabel(incident.month, { month: "long" }) : "Latest period"}{incidentIsMonthToDate ? " · to date" : ""}</span><strong>{formatExecutiveNumber(incident?.count)}</strong></div>
          <ExecutiveTrendChart points={dashboard.incidentTrend.slice(-12).map((item) => ({ id: item.month, label: formatMonthLabel(item.month, { month: "short" }), value: item.count }))} accent="#9b3826" height={145} compact ariaLabel="Community incident history" />
          {priorIncident ? <p className="executive-period-note">{formatMonthLabel(priorIncident.month, { month: "short" })}: {formatExecutiveNumber(priorIncident.count)} recorded in the full month.</p> : null}
        </div>
        <div className="executive-category-index"><div className="executive-section-meta">{categoryPeriod.complete ? "Recorded categories" : `${categoryPeriod.recordCount} available records`}</div>{categories.length ? <ol>{categories.map((item) => <li key={item.label}><span>{item.label}</span><strong>{formatExecutiveNumber(item.count)}</strong><i><b style={{ width: `${item.count / categoryMaximum * 100}%` }} /></i></li>)}</ol> : <CompactEmpty>No category records available for this month.</CompactEmpty>}</div>
      </div>
    </DomainPanel>
    <DomainPanel kind="medications" label="MAR" title="Medication administration" icon={<Pill />} action="Detail" onOpen={() => onOpenDetail("medications")}>
      {medication ? <>
        <div className="executive-medication-overview"><div><strong>{formatExecutiveNumber(medication.compliancePct, "%")}</strong><span>given</span></div><span>{formatMonthLabel(medication.month, { month: "long" })}</span></div>
        <div className="executive-medication-bar" aria-label={`${formatExecutiveNumber(medication.compliancePct, "%")} given`}><span style={{ width: `${Math.min(Math.max(medication.compliancePct ?? 0, 0), 100)}%` }} /></div>
        <dl className="executive-medication-totals"><MedicationSummaryRow label="Scheduled" value={medication.scheduled} /><MedicationSummaryRow label="Given" value={medication.given} /><MedicationSummaryRow label="Not given" value={medication.notGiven} /></dl>
        <p className="executive-period-note">{formatExecutiveNumber(medication.given)} of {formatExecutiveNumber(medication.scheduled)} scheduled administrations were given.</p>
      </> : <CompactEmpty>Medication totals unavailable.</CompactEmpty>}
    </DomainPanel>
  </div>;
}

function DomainPanel({ kind, label, title, icon, action, onOpen, children }: { kind: ExecutiveCommunityDetailView; label: string; title: string; icon: React.ReactNode; action: string; onOpen: () => void; children: React.ReactNode }) {
  return <article data-executive-dashboard-panel={kind} className={`executive-domain-card executive-domain-card--${kind}`}>
    <span data-executive-panel-tab={kind} className="executive-domain-card__tab" aria-hidden="true">{label}</span>
    <div className="executive-domain-card__paper"><header data-executive-panel-header={kind}><h2><span>{icon}</span>{title}</h2><button type="button" onClick={onOpen} aria-label={action}>{kind === "admissions" ? "Open" : action}<ArrowRight aria-hidden="true" /></button></header><div data-executive-panel-body={kind}>{children}</div></div>
  </article>;
}
function MedicationSummaryRow({ label, value }: { label: string; value: number | null }) {
  return <div><dt>{label}</dt><dd>{formatExecutiveNumber(value)}</dd></div>;
}
function CompactEmpty({ children }: { children: React.ReactNode }) {
  return <p className="executive-inline-empty">{children}</p>;
}
