import { useEffect, useRef, useState } from "react";
import { displayIncidentLabel } from "../../../../shared/incident-display-labels.mjs";
import { Link, useSearchParams } from "react-router-dom";
import { ALAMO_FACILITIES } from "../../../../shared/community-names.mjs";
import "../incidentCenter.css";
import {
  AlertTriangle,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Minus,
  RefreshCw,
  X
} from "lucide-react";
import {
  PLATFORM_DATA_REFRESH_EVENT,
  fetchCommunitiesDashboard,
  fetchIncidentFeed,
} from "../../../shared/api/platformData";
import { useIsPhoneLayout } from "../../../shared/hooks/useIsPhoneLayout";
import {
  displayDetailValue,
  enrichIncidentsWithResidents,
  formatIncidentAge as timeAgo,
  formatIncidentDateKey as formatDateKey,
  formatIncidentPriority,
  INCIDENT_PRIORITY_ORDER,
  getIncidentReceivedDateKey,
  getTodayDateKey,
  matchesIncidentSearch as matchesSearch,
  partitionIncidentsByReviewStage,
  withResolvedIncidentPriority,
  type IncidentPriority,
  type IncidentRecord
} from "../incidentCenterModel";
import { ResidentIncidentHistoryDrawer } from "../components/ResidentIncidentHistoryDrawer";

const PRIORITY_CONFIG: Record<
  IncidentPriority,
  {
    color: string;
    bg: string;
    border: string;
    accent: string;
    dot: string;
    icon: typeof AlertTriangle;
  }
> = {
  HIGH: {
    color: "#b42318",
    bg: "#fff1f0",
    border: "#f0b8b4",
    accent: "#fff7f5",
    dot: "#d92d20",
    icon: AlertTriangle
  },
  MEDIUM: {
    color: "#a15c07",
    bg: "#fff7e8",
    border: "#e9c184",
    accent: "#fffbf2",
    dot: "#d9822b",
    icon: Minus
  },
  LOW: {
    color: "#207a45",
    bg: "#eefbf2",
    border: "#a8dcb8",
    accent: "#f7fff9",
    dot: "#2fa866",
    icon: ArrowDown
  },
  // Not classifiable: all three recorded flags are blank. Neutral, not a severity.
  UNKNOWN: {
    color: "#595959",
    bg: "#f5f4ef",
    border: "#d9d9d9",
    accent: "#fafafa",
    dot: "#8c8c8c",
    icon: CircleHelp
  }
};
const CLASSIFIED_PRIORITIES: IncidentPriority[] = ["HIGH", "MEDIUM", "LOW"];

function DetailPanel({ incident, onClose, onOpenResident }: {
  incident: IncidentRecord;
  onClose: () => void;
  onOpenResident: (incident: IncidentRecord) => void;
}) {
  return (
    <div className="incident-detail">
      <div className="incident-detail-heading">
        <strong>Details</strong>
        <button type="button" onClick={onClose} aria-label="Close incident details"><X size={18} aria-hidden="true" /></button>
      </div>
      <dl className="incident-detail-facts">
        {[
          ["Community", incident.facility_name], ["Resident #", incident.resident_id || "—"],
          ["Unit", incident.unit_number || "—"], ["Age", incident.age],
          ["Care Level", incident.care_level || "—"], ["Diagnosis", incident.primary_diagnosis || "—"],
          ["Physician", incident.physician || "—"], ["Staff", incident.staff_name || incident.sender],
          ["Type", displayIncidentLabel(incident.incident_type)], ["Location", incident.location || "—"],
          ["Date", incident.incident_date || "—"], ["Score", incident.triage_score],
          ["Injury", incident.injury_occurred ? "Yes" : "No"], ["Police", incident.police_called ? "Yes" : "No"]
        ].map(([label, value]) => <div key={label as string}><dt>{label}</dt><dd>{displayDetailValue(value)}</dd></div>)}
        <div className="incident-detail-client"><dt>Client</dt><dd><button type="button" onClick={() => onOpenResident(incident)}>{incident.client_name || "Unknown Client"}</button></dd></div>
      </dl>
      {incident.email_body ? <div className="incident-staff-note"><strong>Staff Note</strong><p>{incident.email_body}</p></div> : null}
      {incident.notifications?.length ? <div className="incident-notifications"><strong>Notifications</strong>
        {incident.notifications.map((notification, index) => <div key={index}><span>{notification.recipient}</span><span>{notification.status}</span></div>)}
      </div> : null}
    </div>
  );
}

function IncidentCard({ incident, onOpenResident }: {
  incident: IncidentRecord;
  onOpenResident: (incident: IncidentRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsRef = useRef<HTMLButtonElement>(null);
  const cfg = PRIORITY_CONFIG[incident.priority];
  const acknowledged = incident.stage === "reviewed";
  return (
    <article data-incident-card="true" data-incident-reviewed={acknowledged ? "true" : "false"}
      className="incident-card" style={{ borderLeftColor: cfg.dot }}>
      <div className="incident-card-heading">
        <button type="button" data-incident-resident-link="true" onClick={() => onOpenResident(incident)}>
          {incident.client_name || "Unknown Client"}
        </button>
        <span>{timeAgo(incident.received_at)}</span>
      </div>
      <div className="incident-card-summary">{displayIncidentLabel(incident.incident_type || "general")}</div>
      <div className="incident-card-community">
        {ALAMO_FACILITIES.find((facility) => facility.facilityId === String(incident.facility_id))?.shortName || incident.facility_name}
        {acknowledged ? <span> · Reviewed</span> : null}
      </div>
      {(incident.flags || []).length > 0 ? <div className="incident-flags">
        {(incident.flags || []).map((flag) => <span key={flag} style={{ color: cfg.color, background: cfg.accent, borderColor: cfg.border }}>{flag.replace(/_/g, " ")}</span>)}
      </div> : null}
      <button ref={detailsRef} type="button" data-incident-details-toggle="true" aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}>
        {expanded ? "Less" : "Details"}{expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
      </button>
      {expanded ? <DetailPanel incident={incident} onClose={() => { setExpanded(false); detailsRef.current?.focus(); }} onOpenResident={onOpenResident} /> : null}
    </article>
  );
}

function PriorityHeader({ priority, activeCount }: { priority: IncidentPriority; activeCount: number }) {
  const cfg = PRIORITY_CONFIG[priority];
  const Icon = cfg.icon;
  return <div data-incident-priority={priority} className="incident-priority-heading" style={{ color: cfg.color, borderColor: cfg.border }}>
    <span><Icon size={18} aria-hidden="true" />{formatIncidentPriority(priority)}</span><strong>{activeCount}</strong>
  </div>;
}

function PriorityColumn({
  priority,
  incidents,
  onOpenResident
}: {
  priority: IncidentPriority;
  incidents: IncidentRecord[];
  onOpenResident: (incident: IncidentRecord) => void;
}) {
  const { active, acknowledged } = partitionIncidentsByReviewStage(incidents);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PriorityHeader priority={priority} activeCount={active.length} />

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {active.length === 0 && acknowledged.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "32px 0",
              color: "#b3a692",
              fontSize: 12
            }}
          >
            No active incidents
          </div>
        )}
        {active.map((incident) => (
          <IncidentCard
            key={incident.id}
            incident={incident}
            onOpenResident={onOpenResident}
          />
        ))}
        {acknowledged.map((incident) => (
          <IncidentCard
            key={incident.id}
            incident={incident}
            onOpenResident={onOpenResident}
          />
        ))}
      </div>
    </div>
  );
}

function MobilePrioritySection({
  priority,
  incidents,
  onOpenResident
}: {
  priority: IncidentPriority;
  incidents: IncidentRecord[];
  onOpenResident: (incident: IncidentRecord) => void;
}) {
  const { active, acknowledged } = partitionIncidentsByReviewStage(incidents);
  const [showAll, setShowAll] = useState(false);
  const orderedIncidents = [...active, ...acknowledged];
  const visibleIncidents = showAll ? orderedIncidents : orderedIncidents.slice(0, 4);

  return (
    <section
      data-incident-priority-section={priority}
      className="incident-mobile-section"
    >

      <div data-incident-priority-list="true" className="space-y-2">
        {active.length === 0 && acknowledged.length === 0 ? (
          <div className="incident-empty">
            No incidents in this priority.
          </div>
        ) : (
          visibleIncidents.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              onOpenResident={onOpenResident}
            />
          ))
        )}
      </div>
      {orderedIncidents.length > 4 ? (
        <button
          type="button"
          data-incident-priority-toggle="true"
          aria-expanded={showAll}
          onClick={() => setShowAll((current) => !current)}
          className="incident-show-all"
        >
          {showAll ? "Show fewer" : `Show all ${orderedIncidents.length}`}
        </button>
      ) : null}
    </section>
  );
}

interface IncidentCenterPageProps {
  searchTerm?: string;
  embedded?: boolean;
  facilityId?: string;
  facilityName?: string;
  onOpenResident?: (incident: IncidentRecord) => void;
}

export default function IncidentCenterPage({
  searchTerm = "",
  embedded = false,
  facilityId,
  facilityName,
  onOpenResident
}: IncidentCenterPageProps) {
  const isPhoneLayout = useIsPhoneLayout();
  const [searchParams, setSearchParams] = useSearchParams();
  const communityParam = searchParams.get("community");
  const selectedFacility = facilityId || (ALAMO_FACILITIES.some((facility) => facility.facilityId === communityParam) ? communityParam! : "");
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [feedWarning, setFeedWarning] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const [contentPage, setContentPage] = useState(0);
  const [mobilePriority, setMobilePriority] = useState<IncidentPriority>("HIGH");
  const [residentDrilldownIncident, setResidentDrilldownIncident] = useState<IncidentRecord | null>(null);
  const latestFetchId = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);

  const fetchIncidents = async () => {
    if (document.visibilityState === "hidden") return;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const fetchId = ++latestFetchId.current;
    try {
      const [incidentResult, dashboardResult] = await Promise.allSettled([
        fetchIncidentFeed(controller.signal),
        fetchCommunitiesDashboard(controller.signal)
      ]);
      if (incidentResult.status !== "fulfilled") {
        throw incidentResult.reason;
      }
      const list = incidentResult.value.incidents;
      const dashboard = dashboardResult.status === "fulfilled" ? dashboardResult.value : null;
      if (dashboardResult.status === "rejected") {
        console.warn("Resident directory unavailable for incident name enrichment.", dashboardResult.reason);
      }
      const enriched = dashboard
        ? enrichIncidentsWithResidents(list, dashboard?.residents ?? [])
        : withResolvedIncidentPriority(list);
      if (fetchId !== latestFetchId.current) return;
      setIncidents(
        facilityId
          ? enriched.filter((incident) => String(incident.facility_id) === String(facilityId))
          : enriched
      );
      setFeedWarning(incidentResult.value.warning ?? null);
      setRefreshError(false);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (error) {
      if (controller.signal.aborted || fetchId !== latestFetchId.current) return;
      console.warn("Falling back to existing incident state.", error);
      setRefreshError(true);
      setLoading(false);
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
    }
  };

  useEffect(() => {
    setContentPage(0);
  }, [selectedFacility]);

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 15000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") fetchIncidents();
    };
    window.addEventListener(PLATFORM_DATA_REFRESH_EVENT, fetchIncidents);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      latestFetchId.current += 1;
      requestControllerRef.current?.abort();
      clearInterval(interval);
      window.removeEventListener(PLATFORM_DATA_REFRESH_EVENT, fetchIncidents);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [facilityId]);

  const scopedIncidents = selectedFacility
    ? incidents.filter((incident) => String(incident.facility_id) === selectedFacility)
    : incidents;
  const todayDateKey = getTodayDateKey();
  const incidentDateKeys = Array.from(
    new Set(scopedIncidents.map((incident) => getIncidentReceivedDateKey(incident)).filter(Boolean))
  ).sort((left, right) => right.localeCompare(left));
  const activeDateKey = incidentDateKeys.includes(todayDateKey)
    ? todayDateKey
    : incidentDateKeys[0] || "";
  const previousDateKey = incidentDateKeys.find((dateKey) => dateKey !== activeDateKey);
  const activeDateLabel = !activeDateKey || activeDateKey === todayDateKey
    ? "Received today"
    : `Latest received · ${formatDateKey(activeDateKey)}`;
  const previousDateLabel = previousDateKey ? formatDateKey(previousDateKey) : "Previous";

  const activeDateFiltered = scopedIncidents.filter(
    (incident) => getIncidentReceivedDateKey(incident) === activeDateKey && matchesSearch(incident, searchTerm)
  );

  const previousDateFiltered = scopedIncidents.filter(
    (incident) => getIncidentReceivedDateKey(incident) === previousDateKey && matchesSearch(incident, searchTerm)
  );

  const windowIncidents = contentPage === 0 ? activeDateFiltered : previousDateFiltered;
  const byPriority = Object.fromEntries(INCIDENT_PRIORITY_ORDER.map((priority) => [
    priority,
    windowIncidents.filter((incident) => incident.priority === priority)
  ])) as Record<IncidentPriority, IncidentRecord[]>;
  // Unknown appears only when the window holds unclassifiable incidents.
  const visiblePriorities: IncidentPriority[] = byPriority.UNKNOWN.length > 0
    ? [...CLASSIFIED_PRIORITIES, "UNKNOWN"]
    : CLASSIFIED_PRIORITIES;
  const selectedMobilePriority = visiblePriorities.includes(mobilePriority) ? mobilePriority : "HIGH";

  useEffect(() => {
    const highestAvailable = visiblePriorities.find((priority) => byPriority[priority].length > 0) ?? "HIGH";
    setMobilePriority(highestAvailable);
  }, [activeDateKey, contentPage, selectedFacility, previousDateKey]);

  const totalActive = windowIncidents.filter((incident) => incident.stage !== "reviewed").length;
  const freshnessCopy = activeDateKey && activeDateKey !== todayDateKey
    ? `No reports received today. Latest received ${formatDateKey(activeDateKey)}.`
    : activeDateKey ? `${activeDateFiltered.length} received today.` : "No incident dates are loaded in this view.";
  const handleOpenResident = (incident: IncidentRecord) => {
    if (onOpenResident) {
      onOpenResident(incident);
      return;
    }
    setResidentDrilldownIncident(incident);
  };

  return (
    <section
      data-incident-center="true"
      data-incident-center-facility={selectedFacility || undefined}
      data-incident-center-embedded={embedded ? "true" : "false"}
      className="incident-center"
    >
      <header className="incident-center-heading">
        {embedded ? <h3>Incidents</h3> : <h1>Incidents</h1>}
        <Link to={`/incidents/history${selectedFacility ? `?facilityId=${encodeURIComponent(selectedFacility)}` : ""}`}>
          Search full history <ChevronRight size={17} aria-hidden="true" />
        </Link>
      </header>
      <div className="incident-controls">
        {!embedded ? (
          <label className="incident-community-picker">
            <span className="sr-only">Community</span>
            <select value={selectedFacility} onChange={(event) => {
              setContentPage(0);
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                if (event.target.value) next.set("community", event.target.value);
                else next.delete("community");
                return next;
              });
            }}>
              <option value="">All communities</option>
              {ALAMO_FACILITIES.map((facility) => <option key={facility.facilityId} value={facility.facilityId}>{facility.shortName}</option>)}
            </select>
          </label>
        ) : facilityName ? <span className="incident-community-name">{facilityName}</span> : null}
        <div className="incident-date-options" aria-label="Incident received day">
          {[activeDateLabel, previousDateLabel].map((label, index) => (
            <button key={index} type="button"
              data-incident-date-window={index === 0 ? "latest" : "previous"}
              aria-pressed={contentPage === index}
              onClick={() => setContentPage(index)}
              disabled={loading || (index === 1 && !previousDateKey)}>{label}</button>
          ))}
        </div>
        <button type="button" className="incident-refresh" onClick={fetchIncidents} aria-label="Refresh incidents"
          title={lastUpdated ? `Refreshed ${lastUpdated.toLocaleTimeString()}` : "Refresh incidents"}>
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </div>
      {feedWarning || refreshError ? (
        <div className="incident-warning" role="status">
          {refreshError
            ? incidents.length
              ? "The incident feed could not be refreshed, so the previously loaded incidents remain on screen."
              : "Incidents could not be loaded. Select Refresh to try again."
            : feedWarning}
        </div>
      ) : null}
      {!loading ? <div className="incident-freshness">
        <span>{freshnessCopy}</span><span>{totalActive} active</span>
      </div> : null}
      {loading ? <div className="incident-empty" role="status">Loading incidents…</div> : isPhoneLayout ? (
        <div>
          <div role="tablist" aria-label="Incident priority" data-incident-priority-tabs="true" className="incident-priority-tabs"
            data-incident-priority-count={visiblePriorities.length}>
            {visiblePriorities.map((priority, index) => (
              <button key={priority} type="button" role="tab"
                id={`incident-tab-${selectedFacility || "all"}-${priority.toLowerCase()}`}
                aria-selected={selectedMobilePriority === priority}
                tabIndex={selectedMobilePriority === priority ? 0 : -1}
                aria-controls={`incident-priority-panel-${priority.toLowerCase()}`}
                onClick={() => setMobilePriority(priority)}
                onKeyDown={(event) => {
                  const count = visiblePriorities.length;
                  const next = event.key === "ArrowRight" ? (index + 1) % count
                    : event.key === "ArrowLeft" ? (index + count - 1) % count
                    : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  setMobilePriority(visiblePriorities[next]!);
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
                }}
                style={{ color: PRIORITY_CONFIG[priority].color,
                  borderColor: selectedMobilePriority === priority ? PRIORITY_CONFIG[priority].color : PRIORITY_CONFIG[priority].border,
                  background: selectedMobilePriority === priority ? PRIORITY_CONFIG[priority].bg : undefined }}>
                {formatIncidentPriority(priority)} <span>{partitionIncidentsByReviewStage(byPriority[priority]).active.length}</span>
              </button>
            ))}
          </div>
          <div id={`incident-priority-panel-${selectedMobilePriority.toLowerCase()}`} role="tabpanel"
            aria-label={`${selectedMobilePriority.toLowerCase()} priority incidents`}>
            <MobilePrioritySection key={`${selectedFacility}-${contentPage}-${selectedMobilePriority}`}
              priority={selectedMobilePriority} incidents={byPriority[selectedMobilePriority]} onOpenResident={handleOpenResident} />
          </div>
        </div>
      ) : (
        <div className="incident-columns" data-incident-priority-count={visiblePriorities.length}>
          {visiblePriorities.map((priority) => <PriorityColumn key={priority} priority={priority}
            incidents={byPriority[priority]} onOpenResident={handleOpenResident} />)}
        </div>
      )}
      {!onOpenResident ? <ResidentIncidentHistoryDrawer incident={residentDrilldownIncident}
        incidents={incidents} priorityConfig={PRIORITY_CONFIG} onClose={() => setResidentDrilldownIncident(null)} /> : null}
    </section>
  );
}
