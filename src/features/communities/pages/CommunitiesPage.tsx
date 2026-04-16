import { useState } from "react";
import { AlertTriangle, CheckCircle, Clock, Users } from "lucide-react";

interface CommunitiesPageProps {
  searchTerm?: string;
}

const communities = [
  { value: "all", label: "All Communities" },
  { value: "sanpablo", label: "San Pablo" },
  { value: "turlock", label: "Turlock" },
  { value: "riverside", label: "Riverside" },
  { value: "santaclarita", label: "Santa Clarita" }
];

const summaryCards = [
  {
    label: "Occupancy Rate",
    note: "Will resolve from facility census and capacity models.",
    icon: Users,
    tone: "text-sky-600"
  },
  {
    label: "Compliance Score",
    note: "Will resolve from Azure compliance rollups.",
    icon: CheckCircle,
    tone: "text-emerald-600"
  },
  {
    label: "Overdue Documents",
    note: "Will resolve from clinical documentation feeds.",
    icon: Clock,
    tone: "text-amber-600"
  },
  {
    label: "Incidents This Week",
    note: "Will resolve from Incident Center and summary marts.",
    icon: AlertTriangle,
    tone: "text-rose-600"
  }
];

const panelTitles = [
  "Staff Certifications Expiring",
  "Current Shift Coverage by Role",
  "Incident Trends",
  "Client Distribution by Program"
];

function ChartPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-[250px] flex-col justify-between rounded-[18px] border border-dashed border-slate-300 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-5">
      <div className="flex items-end gap-2">
        {[42, 68, 54, 82, 60, 74].map((height, index) => (
          <div
            key={index}
            className="flex-1 rounded-t-[8px] bg-slate-300/60"
            style={{ height }}
          />
        ))}
      </div>
      <div className="space-y-1 text-center">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          This chart area
        </div>
        <div className="text-[13px] leading-6 text-slate-500">
          {label} will appear here once connected Azure data is available.
        </div>
      </div>
    </div>
  );
}

export default function CommunitiesPage({ searchTerm = "" }: CommunitiesPageProps) {
  const [selectedCommunity, setSelectedCommunity] = useState("all");

  return (
    <div>
      <div className="mx-auto max-w-[1320px] px-4 py-4 sm:px-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[13px] text-gray-500">
            {searchTerm
              ? `Filtered by search: "${searchTerm}"`
              : "Community names are in place. Connected census, compliance, and incident data will populate after source integration."}
          </div>
        </div>

        <div className="mb-4 rounded-[22px] border border-black/80 bg-white p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]">
          <div className="flex flex-col items-start justify-between gap-4 lg:flex-row">
            <div className="flex w-full flex-col gap-3 lg:w-auto">
              <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-900">
                Select Community
              </label>
              <div className="flex flex-wrap gap-2">
                {communities.map((community) => (
                  <button
                    key={community.value}
                    onClick={() => setSelectedCommunity(community.value)}
                    className={`rounded-full px-4 py-2 text-[13px] font-medium transition-all ${
                      selectedCommunity === community.value
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {community.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-5 py-4 text-center lg:items-end">
              <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Community Snapshot
              </label>
              <div className="text-[13px] font-medium text-gray-700">
                Connected values will appear here
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="rounded-[20px] border border-black/80 bg-white p-4 shadow-[0_10px_26px_-24px_rgba(15,23,42,0.25)]"
              >
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                    {card.label}
                  </h3>
                  <Icon className={`h-4.5 w-4.5 ${card.tone}`} />
                </div>
                <div className="mb-1 text-[1.65rem] font-semibold tracking-[-0.04em] text-gray-300">
                  —
                </div>
                <p className="text-[13px] leading-5 text-gray-500">{card.note}</p>
              </div>
            );
          })}
        </div>

        <div className="mb-4 rounded-[22px] border border-black/80 bg-white p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]">
          <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-900">
            <AlertTriangle className="h-3.5 w-3.5 text-slate-400" />
            Alerts and Exceptions
          </h3>
          <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-[13px] leading-6 text-slate-500">
            Connected alerting will appear here once the platform receives live incident,
            compliance, and staffing signals for the selected community.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {panelTitles.map((title) => (
            <div
              key={title}
              className="rounded-[22px] border border-black/80 bg-white p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]"
            >
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-900">
                {title}
              </h3>
              <ChartPlaceholder label={title} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
