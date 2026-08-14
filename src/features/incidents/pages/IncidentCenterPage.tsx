import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ChevronDown,
  ChevronRight,
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
  daysBetweenDateKeys,
  displayDetailValue,
  enrichIncidentsWithResidents,
  formatIncidentAge as timeAgo,
  formatIncidentDateKey as formatDateKey,
  getIncidentReceivedDateKey,
  getTodayDateKey,
  matchesIncidentSearch as matchesSearch,
  partitionIncidentsByReviewStage,
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
  }
};

function DetailPanel({
  incident,
  onClose,
  onOpenResident
}: {
  incident: IncidentRecord;
  onClose: () => void;
  onOpenResident: (incident: IncidentRecord) => void;
}) {
  const cfg = PRIORITY_CONFIG[incident.priority];

  return (
    <div
      style={{
        marginTop: 10,
        background: "#fffdfa",
        border: "1px solid #ddd4c8",
        borderRadius: 14,
        padding: 14,
        fontSize: 12
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#7c664c",
            textTransform: "uppercase",
            letterSpacing: "0.06em"
          }}
        >
          Details
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#9e907c",
            padding: 0
          }}
        >
          <X size={13} />
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px 16px",
          marginBottom: 12
        }}
      >
        {[
          ["Community", incident.facility_name],
          ["Resident #", incident.resident_id || "—"],
          ["Unit", incident.unit_number || "—"],
          ["Age", incident.age],
          ["Care Level", incident.care_level || "—"],
          ["Diagnosis", incident.primary_diagnosis || "—"],
          ["Physician", incident.physician || "—"],
          ["Staff", incident.staff_name || incident.sender],
          ["Type", incident.incident_type],
          ["Location", incident.location || "—"],
          ["Date", incident.incident_date || "—"],
          ["Score", incident.triage_score],
          ["Injury", incident.injury_occurred ? "Yes" : "No"],
          ["Police", incident.police_called ? "Yes" : "No"]
        ].map(([label, value]) => (
          <div key={label as string}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#7c664c",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 2
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: 13, color: "#2d261d", fontWeight: 500 }}>
              {displayDetailValue(value)}
            </div>
          </div>
        ))}
        <div style={{ gridColumn: "1 / -1" }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#7c664c",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 2
            }}
          >
            Client
          </div>
          <button
            type="button"
            onClick={() => onOpenResident(incident)}
            className="text-left text-[13px] font-semibold text-[#293866] underline decoration-[#8ea2ff]/70 underline-offset-4 transition-colors hover:text-[#111827]"
          >
            {incident.client_name || "Unknown Client"}
          </button>
        </div>
      </div>

      {incident.email_body && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
            fontSize: 10,
            fontWeight: 600,
            color: "#7c664c",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 6
            }}
          >
            Staff Note
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#4f4539",
              lineHeight: 1.6,
              borderLeft: `3px solid ${cfg.border}`,
              paddingLeft: 10,
              fontStyle: "italic"
            }}
          >
            {incident.email_body}
          </div>
        </div>
      )}

      {(incident.notifications || []).length > 0 && (
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#7c664c",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 6
            }}
          >
            Notifications Sent
          </div>
          {incident.notifications?.map((notification, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "5px 0",
                borderBottom: "1px solid #e4dbcf",
                fontSize: 12,
                color: "#736657"
              }}
            >
              <span>{notification.recipient}</span>
              <span
                style={{
                  color: notification.status === "sent" ? "#16a34a" : "#ef4444",
                  fontWeight: 600
                }}
              >
                {notification.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IncidentCard({
  incident,
  onOpenResident
}: {
  incident: IncidentRecord;
  onOpenResident: (incident: IncidentRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = PRIORITY_CONFIG[incident.priority];
  const acknowledged = incident.stage === "reviewed";

  return (
    <div
      style={{
        background: "#fffdfa",
        border: `1px solid ${acknowledged ? "#e4dbcf" : cfg.border}`,
        borderLeft: `3px solid ${acknowledged ? "#d8d0c3" : cfg.dot}`,
        borderRadius: 18,
        padding: "10px 12px",
        marginBottom: 6,
        opacity: acknowledged ? 0.62 : 1,
        transition: "all 0.2s ease"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 6
        }}
      >
        <button
          type="button"
          onClick={() => onOpenResident(incident)}
          className="text-left text-[12.5px] font-semibold text-[#2d261d] transition-colors hover:text-[#293866]"
        >
          {incident.client_name || "Unknown Client"}
        </button>
        <span style={{ fontSize: 11, color: "#9e907c", whiteSpace: "nowrap", marginLeft: 8 }}>
          {timeAgo(incident.received_at)}
        </span>
      </div>

      <div style={{ fontSize: 11.5, color: "#736657", marginBottom: 8 }}>
        {incident.incident_type || "general"} · {incident.staff_name || incident.sender}
      </div>

      {(incident.flags || []).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
          {(incident.flags || []).map((flag) => (
            <span
              key={flag}
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: cfg.color,
                background: cfg.accent,
                border: `1px solid ${cfg.border}`,
                borderRadius: 4,
                padding: "1px 6px",
                textTransform: "uppercase",
                letterSpacing: "0.04em"
              }}
            >
              {flag.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 rounded-full border border-[#ddd4c8] bg-[#fffdfa] px-2.5 py-1 text-xs font-medium text-[#736657] transition-colors hover:border-[#c7bcae] hover:bg-[#f5efe6] hover:text-[#2d261d]"
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          {expanded ? "Less" : "Details"}
        </button>

      </div>

      {expanded && (
        <DetailPanel
          incident={incident}
          onClose={() => setExpanded(false)}
          onOpenResident={onOpenResident}
        />
      )}
    </div>
  );
}

function PriorityHeader({
  priority,
  activeCount,
  compact = false,
  light = false
}: {
  priority: IncidentPriority;
  activeCount: number;
  compact?: boolean;
  light?: boolean;
}) {
  const cfg = PRIORITY_CONFIG[priority];
  const Icon = cfg.icon;

  return (
    <div
      data-incident-priority={priority}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
        padding: compact ? "8px 10px" : "8px 12px",
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: light || compact ? 0 : 8
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Icon size={14} color={cfg.color} />
        <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, letterSpacing: "0.07em" }}>
          {priority}
        </span>
      </div>
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: activeCount > 0 ? cfg.color : "#b3a692",
          lineHeight: 1
        }}
      >
        {activeCount}
      </span>
    </div>
  );
}

function PriorityColumn({
  priority,
  incidents,
  onOpenResident,
  light = false
}: {
  priority: IncidentPriority;
  incidents: IncidentRecord[];
  onOpenResident: (incident: IncidentRecord) => void;
  light?: boolean;
}) {
  const { active, acknowledged } = partitionIncidentsByReviewStage(incidents);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PriorityHeader priority={priority} activeCount={active.length} light={light} />

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
  onOpenResident,
  light = false
}: {
  priority: IncidentPriority;
  incidents: IncidentRecord[];
  onOpenResident: (incident: IncidentRecord) => void;
  light?: boolean;
}) {
  const { active, acknowledged } = partitionIncidentsByReviewStage(incidents);

  return (
    <section
      className={
        light
          ? "border border-[#d9d9d9] bg-white p-3"
          : "rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,#121722_0%,#0f131c_100%)] p-3 shadow-[0_24px_44px_-34px_rgba(0,0,0,0.9)]"
      }
    >
      <PriorityHeader priority={priority} activeCount={active.length} compact light={light} />

      <div className="space-y-2">
        {active.length === 0 && acknowledged.length === 0 ? (
          <div className={light
            ? "border border-dashed border-[#d9d9d9] bg-[#fafafa] px-4 py-5 text-center text-[12px] text-[#737373]"
            : "rounded-[16px] border border-dashed border-white/[0.08] bg-white/[0.03] px-4 py-5 text-center text-[12px] text-white/30"
          }>
            No incidents in this priority.
          </div>
        ) : (
          [...active, ...acknowledged].map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              onOpenResident={onOpenResident}
            />
          ))
        )}
      </div>
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
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [feedWarning, setFeedWarning] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const [contentPage, setContentPage] = useState(0);
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
        : list as IncidentRecord[];
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
  }, [facilityId]);

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

  const todayDateKey = getTodayDateKey();
  const incidentDateKeys = Array.from(
    new Set(incidents.map((incident) => getIncidentReceivedDateKey(incident)).filter(Boolean))
  ).sort((left, right) => right.localeCompare(left));
  const activeDateKey = incidentDateKeys.includes(todayDateKey)
    ? todayDateKey
    : incidentDateKeys[0] || "";
  const previousDateKey = incidentDateKeys.find((dateKey) => dateKey !== activeDateKey);
  const activeDateLabel = !activeDateKey || activeDateKey === todayDateKey
    ? "Received today"
    : `Latest received · ${formatDateKey(activeDateKey)}`;
  const previousDateLabel = previousDateKey ? formatDateKey(previousDateKey) : "Previous";

  const activeDateFiltered = incidents.filter(
    (incident) => getIncidentReceivedDateKey(incident) === activeDateKey && matchesSearch(incident, searchTerm)
  );

  const previousDateFiltered = incidents.filter(
    (incident) => getIncidentReceivedDateKey(incident) === previousDateKey && matchesSearch(incident, searchTerm)
  );

  const byPriority: Record<IncidentPriority, IncidentRecord[]> = {
    HIGH: (contentPage === 0 ? activeDateFiltered : previousDateFiltered)
      .filter((incident) => incident.priority === "HIGH"),
    MEDIUM: (contentPage === 0 ? activeDateFiltered : previousDateFiltered)
      .filter((incident) => incident.priority === "MEDIUM"),
    LOW: (contentPage === 0 ? activeDateFiltered : previousDateFiltered)
      .filter((incident) => incident.priority === "LOW")
  };

  const selectedDateIncidents = contentPage === 0 ? activeDateFiltered : previousDateFiltered;
  const totalActive = selectedDateIncidents.filter((incident) => incident.stage !== "reviewed").length;
  const contentPages = [
    {
      label: activeDateLabel,
      description:
        activeDateKey === todayDateKey
          ? "Incident reports received by the platform today."
          : "Showing the newest reports received by the platform."
    },
    {
      label: previousDateLabel,
      description: "Previous incident day review and carry-forward context."
    }
  ];
  const todayIncidentCount = incidents.filter((incident) => getIncidentReceivedDateKey(incident) === todayDateKey).length;
  const latestLoadedCount = incidents.filter((incident) => getIncidentReceivedDateKey(incident) === activeDateKey).length;
  const freshnessLagDays = !activeDateKey || activeDateKey === todayDateKey
    ? 0
    : daysBetweenDateKeys(activeDateKey, todayDateKey);
  const freshnessCopy = todayIncidentCount > 0
    ? `${todayIncidentCount} received today.`
    : activeDateKey
      ? `No rows received today; latest loaded day is ${formatDateKey(activeDateKey)}${freshnessLagDays ? ` (${freshnessLagDays} day${freshnessLagDays === 1 ? "" : "s"} behind)` : ""}.`
      : "No incident dates are loaded in this view.";
  const handleOpenResident = (incident: IncidentRecord) => {
    if (onOpenResident) {
      onOpenResident(incident);
      return;
    }
    setResidentDrilldownIncident(incident);
  };

  return (
    <div
      data-incident-center="true"
      data-incident-center-facility={facilityId}
      data-incident-center-embedded={embedded ? "true" : "false"}
      className={
        embedded
          ? "relative flex min-w-0 flex-col overflow-x-hidden bg-white text-[#111111]"
          : "relative flex min-h-[calc(100vh-112px)] flex-col overflow-x-hidden pb-4 pt-0 text-white md:h-[calc(100vh-112px)]"
      }
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[1520px] flex-1 flex-col">
        {!embedded ? (
          <div className="border-b border-white/[0.08] px-1 pb-4">
            <div className="flex items-start gap-4">
              <div className="inline-flex items-center gap-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                  Incident Center
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          {embedded ? (
            <div className="border-b border-[#111111] pb-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">
                Recent incident triage
              </div>
              <h3 className="mt-1 font-serif text-[22px] font-semibold tracking-[-0.03em]">
                Latest two loaded incident days
              </h3>
              <p className="mt-1 text-[13px] leading-5 text-[#595959]">
                {facilityName
                  ? `High, medium, and low priority reports received for ${facilityName}.`
                  : "High, medium, and low priority reports received by the platform."}
              </p>
            </div>
          ) : null}

          <div className={embedded ? "border-b border-[#d9d9d9] py-2.5" : "border-b border-white/[0.08] px-1 py-2.5"}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {contentPages.map((page, index) => (
                  <button
                    key={page.label}
                    type="button"
                    data-incident-date-window={index === 0 ? "latest" : "previous"}
                    onClick={() => setContentPage(index)}
                    disabled={index === 1 && !previousDateKey}
                    className={
                      embedded
                        ? `border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                            contentPage === index
                              ? "border-[#0f8b73] bg-[#eef8f5] text-[#0f6f5d]"
                              : "border-[#d9d9d9] bg-white text-[#595959] hover:border-[#111111] hover:text-[#111111] disabled:cursor-not-allowed disabled:opacity-45"
                          }`
                        : `rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-all ${
                            contentPage === index
                              ? "border border-[#0f8b73] bg-[#eef8f5] text-[#0f6f5d]"
                              : "border border-white/[0.08] bg-white/[0.03] text-white/52 hover:border-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                          }`
                    }
                  >
                    {page.label}
                  </button>
                ))}
              </div>
              <div className={embedded ? "text-[11px] text-[#737373]" : "text-[11px] text-white/34"}>
                {totalActive} active
              </div>
            </div>
          </div>

          <div className={embedded ? "min-h-0 flex-1 py-3" : "min-h-0 flex-1 px-1 py-2.5"}>
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3 px-1">
              <div className="flex min-w-0 items-center gap-2.5">
                <h1 className={embedded
                  ? "text-[11px] font-bold uppercase tracking-[0.14em] text-[#595959]"
                  : "text-[12px] font-semibold uppercase tracking-[0.16em] text-white/40"
                }>
                  {contentPage === 0 ? activeDateLabel : previousDateLabel}
                </h1>
                {lastUpdated ? (
                  <span className={embedded ? "text-[11px] text-[#737373]" : "text-[11px] text-white/32"}>
                    Refreshed {lastUpdated.toLocaleTimeString()}
                  </span>
                ) : null}
              </div>
              {!embedded ? (
                <button
                  onClick={fetchIncidents}
                  className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/68 transition-colors hover:bg-white/[0.08]"
                >
                  <RefreshCw size={11} />
                  Refresh
                </button>
              ) : null}
            </div>

            {feedWarning || refreshError ? (
              <div
                className={embedded
                  ? "mb-3 border border-[#d6b36a] bg-[#fff8e8] px-3.5 py-2.5 text-[12px] leading-5 text-[#7a4b08]"
                  : "mb-3 rounded-[18px] border border-[#8a6f35]/45 bg-[#5b4518]/28 px-3.5 py-2.5 text-[12px] leading-5 text-[#f0d99c]"
                }
                role="status"
              >
                {refreshError
                  ? incidents.length
                    ? "The incident feed could not be refreshed, so the previously loaded incidents remain on screen."
                    : "Incidents could not be loaded. Select Refresh to try again."
                  : feedWarning}
              </div>
            ) : null}

            <div className={embedded
              ? "mb-3 border-y border-[#d9d9d9] bg-[#fafafa] px-3.5 py-2.5 text-[12px] text-[#595959]"
              : "mb-3 rounded-[18px] border border-white/[0.08] bg-white/[0.035] px-3.5 py-2.5 text-[12px] text-white/58"
            }>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className={embedded ? "font-semibold text-[#111111]" : "font-semibold text-white/72"}>
                  Freshness
                </span>
                <span>{freshnessCopy}</span>
                <span>{latestLoadedCount.toLocaleString()} on latest loaded day.</span>
                <span>{incidents.length.toLocaleString()} reports in this {facilityId ? "community" : "stream"}.</span>
              </div>
            </div>

            {loading ? (
              <div className={embedded
                ? "py-20 text-center text-[13px] text-[#737373]"
                : "py-20 text-center text-[13px] text-white/30"
              }>
                Loading incidents...
              </div>
            ) : (
              isPhoneLayout ? (
                <div className="space-y-3">
                  {(["HIGH", "MEDIUM", "LOW"] as const).map((priority) => (
                    <MobilePrioritySection
                      key={priority}
                      priority={priority}
                      incidents={byPriority[priority]}
                      onOpenResident={handleOpenResident}
                      light={embedded}
                    />
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    alignItems: "stretch",
                    padding: 0,
                    border: "none",
                    borderRadius: 0,
                    background: "transparent",
                    boxShadow: "none",
                    height: embedded ? "auto" : "calc(100% - 96px)",
                    minHeight: embedded ? 330 : 0,
                    maxHeight: embedded ? 520 : undefined
                  }}
                >
                  {(["HIGH", "MEDIUM", "LOW"] as const).map((priority) => (
                    <PriorityColumn
                      key={priority}
                      priority={priority}
                      incidents={byPriority[priority]}
                      onOpenResident={handleOpenResident}
                      light={embedded}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>
      {!onOpenResident ? (
        <ResidentIncidentHistoryDrawer
          incident={residentDrilldownIncident}
          incidents={incidents}
          priorityConfig={PRIORITY_CONFIG}
          onClose={() => setResidentDrilldownIncident(null)}
        />
      ) : null}
    </div>
  );
}
