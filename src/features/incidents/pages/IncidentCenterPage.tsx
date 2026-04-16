import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Minus,
  RefreshCw,
  X
} from "lucide-react";

const API = import.meta.env.VITE_INCIDENTS_API_URL || "http://localhost:8001";

type IncidentPriority = "HIGH" | "MEDIUM" | "LOW";

interface IncidentRecord {
  id: string;
  priority: IncidentPriority;
  stage?: string;
  client_name?: string;
  staff_name?: string;
  sender?: string;
  incident_type?: string;
  location?: string;
  incident_date?: string;
  triage_score?: string | number;
  injury_occurred?: boolean;
  police_called?: boolean;
  email_body?: string;
  flags?: string[];
  received_at: string;
}

interface IncidentNotification {
  recipient: string;
  status: string;
}

interface IncidentDetailResponse {
  notifications?: IncidentNotification[];
}

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
    color: "#ef4444",
    bg: "#fef2f2",
    border: "#fecaca",
    accent: "#fee2e2",
    dot: "#ef4444",
    icon: AlertTriangle
  },
  MEDIUM: {
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
    accent: "#fef3c7",
    dot: "#f59e0b",
    icon: Minus
  },
  LOW: {
    color: "#16a34a",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    accent: "#dcfce7",
    dot: "#22c55e",
    icon: ArrowDown
  }
};

function matchesSearch(incident: IncidentRecord, searchTerm: string) {
  if (!searchTerm) return true;
  const query = searchTerm.toLowerCase();

  return (
    (incident.client_name || "").toLowerCase().includes(query) ||
    (incident.staff_name || "").toLowerCase().includes(query) ||
    (incident.incident_type || "").toLowerCase().includes(query) ||
    incident.id.toLowerCase().includes(query)
  );
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

function DetailPanel({
  incident,
  onClose
}: {
  incident: IncidentRecord;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<IncidentDetailResponse | null>(null);
  const cfg = PRIORITY_CONFIG[incident.priority];

  useEffect(() => {
    fetch(`${API}/incidents/${incident.id}`)
      .then((response) => response.json())
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [incident.id]);

  return (
    <div
      style={{
        marginTop: 10,
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
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
            color: "#6b7280",
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
            color: "#9ca3af",
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
          ["Client", incident.client_name],
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
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 2
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: 13, color: "#111827", fontWeight: 500 }}>
              {value || "—"}
            </div>
          </div>
        ))}
      </div>

      {incident.email_body && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#9ca3af",
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
              color: "#374151",
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

      {(detail?.notifications || []).length > 0 && (
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 6
            }}
          >
            Notifications Sent
          </div>
          {detail?.notifications?.map((notification, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "5px 0",
                borderBottom: "1px solid #f3f4f6",
                fontSize: 12,
                color: "#6b7280"
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
  onAcknowledge
}: {
  incident: IncidentRecord;
  onAcknowledge: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = PRIORITY_CONFIG[incident.priority];
  const acknowledged = incident.stage === "reviewed";

  return (
    <div
      style={{
        background: "white",
        border: `1px solid ${acknowledged ? "#e5e7eb" : cfg.border}`,
        borderLeft: `3px solid ${acknowledged ? "#d1d5db" : cfg.dot}`,
        borderRadius: 8,
        padding: "12px 14px",
        marginBottom: 8,
        opacity: acknowledged ? 0.55 : 1,
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
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
          {incident.client_name || "Unknown Client"}
        </div>
        <span
          style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap", marginLeft: 8 }}
        >
          {timeAgo(incident.received_at)}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
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
          className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          {expanded ? "Less" : "Details"}
        </button>

        {!acknowledged ? (
          <button
            onClick={() => onAcknowledge(incident.id)}
            className="flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold transition-colors"
            style={{
              color: cfg.color,
              borderColor: cfg.border,
              background: cfg.bg
            }}
          >
            <CheckCircle size={11} />
            Acknowledge
          </button>
        ) : (
          <span
            style={{
              fontSize: 11,
              color: "#9ca3af",
              display: "flex",
              alignItems: "center",
              gap: 4
            }}
          >
            <CheckCircle size={10} color="#9ca3af" /> Acknowledged
          </span>
        )}

        <span style={{ marginLeft: "auto", fontSize: 11, color: "#d1d5db" }}>{incident.id}</span>
      </div>

      {expanded && <DetailPanel incident={incident} onClose={() => setExpanded(false)} />}
    </div>
  );
}

function PriorityColumn({
  priority,
  incidents,
  onAcknowledge
}: {
  priority: IncidentPriority;
  incidents: IncidentRecord[];
  onAcknowledge: (id: string) => void;
}) {
  const cfg = PRIORITY_CONFIG[priority];
  const Icon = cfg.icon;
  const active = incidents.filter((incident) => incident.stage !== "reviewed");
  const acknowledged = incidents.filter((incident) => incident.stage === "reviewed");

  return (
    <div className="min-w-0 flex-1">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          padding: "10px 14px",
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
          borderRadius: 8
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Icon size={14} color={cfg.color} />
          <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, letterSpacing: "0.05em" }}>
            {priority}
          </span>
        </div>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: active.length > 0 ? cfg.color : "#d1d5db",
            lineHeight: 1
          }}
        >
          {active.length}
        </span>
      </div>

      <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 260px)" }}>
        {active.length === 0 && acknowledged.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "32px 0",
              color: "#d1d5db",
              fontSize: 12
            }}
          >
            No active incidents
          </div>
        )}
        {active.map((incident) => (
          <IncidentCard key={incident.id} incident={incident} onAcknowledge={onAcknowledge} />
        ))}
        {acknowledged.map((incident) => (
          <IncidentCard key={incident.id} incident={incident} onAcknowledge={onAcknowledge} />
        ))}
      </div>
    </div>
  );
}

function YesterdaySection({
  incidents,
  onAcknowledge
}: {
  incidents: IncidentRecord[];
  onAcknowledge: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const byPriority: Record<IncidentPriority, IncidentRecord[]> = {
    HIGH: incidents.filter((incident) => incident.priority === "HIGH"),
    MEDIUM: incidents.filter((incident) => incident.priority === "MEDIUM"),
    LOW: incidents.filter((incident) => incident.priority === "LOW")
  };

  return (
    <div style={{ marginTop: 32 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "6px 0",
          marginBottom: expanded ? 16 : 0
        }}
      >
        <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 12px",
            borderRadius: 20,
            border: "1px solid #e5e7eb",
            background: expanded ? "#f9fafb" : "white",
            transition: "background 0.15s ease"
          }}
        >
          <Clock size={12} color="#9ca3af" />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              whiteSpace: "nowrap"
            }}
          >
            Yesterday
            {incidents.length > 0 ? ` · ${incidents.length} incident${incidents.length !== 1 ? "s" : ""}` : " · none"}
          </span>
          <div
            style={{
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
              display: "flex",
              alignItems: "center"
            }}
          >
            <ChevronDown size={12} color="#9ca3af" />
          </div>
        </div>
        <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
      </button>

      <div
        style={{
          overflow: "hidden",
          maxHeight: expanded ? "2000px" : "0px",
          opacity: expanded ? 1 : 0,
          transition: "max-height 0.35s ease, opacity 0.25s ease"
        }}
      >
        {incidents.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px 0", color: "#d1d5db", fontSize: 13 }}>
            No incidents from yesterday
          </div>
        ) : (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {(["HIGH", "MEDIUM", "LOW"] as const).map((priority) => (
              <div key={priority} className="min-w-0 flex-1">
                {byPriority[priority].length > 0 ? (
                  byPriority[priority].map((incident) => (
                    <IncidentCard
                      key={incident.id}
                      incident={incident}
                      onAcknowledge={onAcknowledge}
                    />
                  ))
                ) : (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "20px 0",
                      color: "#e5e7eb",
                      fontSize: 12
                    }}
                  >
                    —
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface IncidentCenterPageProps {
  searchTerm?: string;
}

export default function IncidentCenterPage({
  searchTerm = ""
}: IncidentCenterPageProps) {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const prevCount = useRef(0);

  const fetchIncidents = async () => {
    try {
      const response = await fetch(`${API}/incidents`);
      const data = await response.json();
      const list = data.incidents || [];
      prevCount.current = list.length;
      setIncidents(list);
      setLastUpdated(new Date());
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 15000);
    return () => clearInterval(interval);
  }, []);

  const acknowledge = async (id: string) => {
    try {
      await fetch(`${API}/incidents/${id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "reviewed" })
      });

      setIncidents((previous) =>
        previous.map((incident) =>
          incident.id === id ? { ...incident, stage: "reviewed" } : incident
        )
      );
    } catch (error) {
      console.error(error);
    }
  };

  const now = Date.now();

  const todayFiltered = incidents.filter((incident) => {
    const ageHours = (now - new Date(incident.received_at).getTime()) / 3600000;
    if (ageHours > 24) return false;
    return matchesSearch(incident, searchTerm);
  });

  const yesterdayFiltered = incidents.filter((incident) => {
    const ageHours = (now - new Date(incident.received_at).getTime()) / 3600000;
    if (ageHours <= 24 || ageHours > 48) return false;
    return matchesSearch(incident, searchTerm);
  });

  const byPriority: Record<IncidentPriority, IncidentRecord[]> = {
    HIGH: todayFiltered.filter((incident) => incident.priority === "HIGH"),
    MEDIUM: todayFiltered.filter((incident) => incident.priority === "MEDIUM"),
    LOW: todayFiltered.filter((incident) => incident.priority === "LOW")
  };

  const totalActive = todayFiltered.filter((incident) => incident.stage !== "reviewed").length;

  return (
    <div>
      <div className="mx-auto max-w-[1320px] px-6 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-[1.55rem] font-semibold tracking-[-0.04em] text-gray-900">
              Incident Center
            </h1>
            <p className="mt-1 text-[13px] text-gray-500">
              {totalActive} active · last updated {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
          <button
            onClick={fetchIncidents}
            className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center text-[13px] text-gray-400">Loading incidents...</div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                gap: 16,
                alignItems: "flex-start",
                padding: 16,
                border: "1px solid rgba(15,23,42,0.9)",
                borderRadius: 22,
                background: "white",
                boxShadow: "0 12px 32px -24px rgba(15,23,42,0.25)"
              }}
            >
              {(["HIGH", "MEDIUM", "LOW"] as const).map((priority) => (
                <PriorityColumn
                  key={priority}
                  priority={priority}
                  incidents={byPriority[priority]}
                  onAcknowledge={acknowledge}
                />
              ))}
            </div>

            <div
              style={{
                marginTop: 16,
                padding: 16,
                border: "1px solid rgba(15,23,42,0.9)",
                borderRadius: 22,
                background: "white",
                boxShadow: "0 12px 32px -24px rgba(15,23,42,0.25)"
              }}
            >
              <YesterdaySection incidents={yesterdayFiltered} onAcknowledge={acknowledge} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
