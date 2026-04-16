import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Filter,
  ShieldAlert
} from "lucide-react";
import { useMemo, useState } from "react";

type Severity = "HIGH" | "MEDIUM" | "LOW";

interface MobileIncident {
  id: string;
  facility: string;
  client: string;
  type: string;
  severity: Severity;
  age: string;
  occurredAt: string;
  detail: string;
  report: string;
  reviewed?: boolean;
}

const mockIncidents: MobileIncident[] = [
  {
    id: "INC-2041",
    facility: "San Pablo",
    client: "R. M.",
    type: "Behavioral",
    severity: "HIGH",
    age: "14m ago",
    occurredAt: "8:41 PM",
    detail: "Escalation required seclusion review and supervisor follow-up.",
    report:
      "Resident escalated during evening medication pass and struck unit door repeatedly. Staff initiated de-escalation, supervising nurse responded, and seclusion review was started per protocol. Family notification remains pending and supervisor sign-off is still needed."
  },
  {
    id: "INC-2038",
    facility: "Riverside",
    client: "K. L.",
    type: "Medical",
    severity: "MEDIUM",
    age: "32m ago",
    occurredAt: "8:23 PM",
    detail: "Fall assessment completed. Nursing reassessment still pending.",
    report:
      "Resident experienced a low-impact fall while transferring from chair to bed. Initial assessment was completed without visible injury. Vitals were stable. Nursing reassessment and overnight monitoring instructions are still open."
  },
  {
    id: "INC-2032",
    facility: "Santa Clarita",
    client: "T. S.",
    type: "Safety",
    severity: "HIGH",
    age: "1h ago",
    occurredAt: "7:48 PM",
    detail: "Transport completed. Need confirmation of discharge paperwork.",
    report:
      "Resident was transported for medical clearance after an off-unit safety concern. Transport completed successfully. Team needs confirmation that discharge paperwork and return instructions were uploaded before overnight closeout."
  },
  {
    id: "INC-2025",
    facility: "Turlock",
    client: "A. J.",
    type: "Behavioral",
    severity: "LOW",
    age: "2h ago",
    occurredAt: "6:37 PM",
    detail: "Resolved on unit. Documentation complete.",
    report:
      "Resident became verbally agitated during evening transition but returned to baseline with staff support. No medical follow-up needed. Documentation was completed by the unit lead and no escalation remains open."
  }
];

const severityFilters: Array<Severity | "ALL"> = ["ALL", "HIGH", "MEDIUM", "LOW"];

const severityStyles: Record<Severity, string> = {
  HIGH: "border-red-200 bg-red-50",
  MEDIUM: "border-amber-200 bg-amber-50",
  LOW: "border-emerald-200 bg-emerald-50"
};

export default function IncidentsPage() {
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | "ALL">("ALL");
  const [incidents, setIncidents] = useState<MobileIncident[]>(mockIncidents);
  const [expandedIncident, setExpandedIncident] = useState<string | null>(mockIncidents[0].id);

  const visibleIncidents = useMemo(
    () =>
      selectedSeverity === "ALL"
        ? incidents
        : incidents.filter((incident) => incident.severity === selectedSeverity),
    [incidents, selectedSeverity]
  );

  const acknowledge = (id: string) => {
    setIncidents((previous) =>
      previous.map((incident) =>
        incident.id === id ? { ...incident, reviewed: true } : incident
      )
    );
  };

  const snapshot = {
    total: incidents.length,
    high: incidents.filter((incident) => incident.severity === "HIGH").length,
    open: incidents.filter((incident) => !incident.reviewed).length
  };

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Mobile
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Incident Snapshot
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          A 24-hour stream designed for evening review after a push alert.
        </p>
      </header>

      <section className="rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Last 24 Hours
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
              {snapshot.high > 0 ? `${snapshot.high} high-priority incidents need review` : "No critical incidents tonight"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Open the cards below to read context, scan the full report, and acknowledge what you have reviewed.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-right shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Open
            </div>
            <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {snapshot.open}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Total
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900">{snapshot.total}</div>
          </div>
          <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              High
            </div>
            <div className="mt-1 text-lg font-bold text-red-600">{snapshot.high}</div>
          </div>
          <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Reviewed
            </div>
            <div className="mt-1 text-lg font-bold text-emerald-700">
              {incidents.filter((incident) => incident.reviewed).length}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Stream Filter
          </span>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {severityFilters.map((filter) => (
            <button
              key={filter}
              onClick={() => setSelectedSeverity(filter)}
              className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                selectedSeverity === filter
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {filter === "ALL" ? "All incidents" : `${filter} priority`}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {visibleIncidents.length === 0 && (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm font-medium text-slate-600 shadow-sm">
            No incidents in this filter right now.
          </div>
        )}

        {visibleIncidents.map((incident) => {
          const isExpanded = expandedIncident === incident.id;

          return (
            <article
              key={incident.id}
              className={`rounded-[28px] border p-4 shadow-sm transition-all ${
                severityStyles[incident.severity]
              } ${incident.reviewed ? "opacity-70" : ""}`}
            >
              <button
                onClick={() =>
                  setExpandedIncident((current) => (current === incident.id ? null : incident.id))
                }
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {incident.facility} · {incident.type}
                    </div>
                    <h2 className="mt-2 text-lg font-bold text-slate-900">
                      {incident.client}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{incident.detail}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">
                      {incident.severity}
                    </div>
                    <div className="text-xs font-medium text-slate-500">{incident.age}</div>
                    {isExpanded ? (
                      <ChevronUp size={18} className="text-slate-500" />
                    ) : (
                      <ChevronDown size={18} className="text-slate-500" />
                    )}
                  </div>
                </div>
              </button>

              <div className="mt-4 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>{incident.occurredAt}</span>
                <span>{incident.id}</span>
              </div>

              {isExpanded && (
                <div className="mt-4 space-y-4 border-t border-white/70 pt-4">
                  <div className="rounded-2xl bg-white/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Full Report
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{incident.report}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-2xl bg-white/80 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Facility
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-900">{incident.facility}</div>
                    </div>
                    <div className="rounded-2xl bg-white/80 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Client
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-900">{incident.client}</div>
                    </div>
                    <div className="rounded-2xl bg-white/80 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Status
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-900">
                        {incident.reviewed ? "Reviewed" : "Pending"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                      <ShieldAlert size={16} className="text-emerald-700" />
                      Manager evening review
                    </div>
                    {incident.reviewed ? (
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                        <CheckCircle2 size={16} />
                        Reviewed
                      </div>
                    ) : (
                      <button
                        onClick={() => acknowledge(incident.id)}
                        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                      >
                        Mark reviewed
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
