import { AlertTriangle, BedDouble, ClipboardList, ShieldCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";

const facilities = [
  {
    id: "all",
    name: "All Facilities",
    occupancy: "93.8%",
    staffOpenings: 3,
    overdueItems: 23,
    incidents: 12,
    compliance: "94%",
    summary: "Two facilities need staffing attention today. Compliance remains stable."
  },
  {
    id: "san-pablo",
    name: "San Pablo",
    occupancy: "94.7%",
    staffOpenings: 1,
    overdueItems: 6,
    incidents: 3,
    compliance: "92%",
    summary: "Compliance follow-up is the primary issue this morning."
  },
  {
    id: "turlock",
    name: "Turlock",
    occupancy: "92.0%",
    staffOpenings: 0,
    overdueItems: 4,
    incidents: 2,
    compliance: "96%",
    summary: "Stable operations with low alert volume."
  },
  {
    id: "riverside",
    name: "Riverside",
    occupancy: "96.7%",
    staffOpenings: 2,
    overdueItems: 7,
    incidents: 4,
    compliance: "93%",
    summary: "Night staffing remains the main operational risk."
  },
  {
    id: "santa-clarita",
    name: "Santa Clarita",
    occupancy: "92.0%",
    staffOpenings: 0,
    overdueItems: 6,
    incidents: 3,
    compliance: "95%",
    summary: "Clinical follow-up needed on one recent escalation."
  }
];

const alerts = [
  {
    facility: "San Pablo",
    kind: "Compliance",
    detail: "3 treatment plan reviews overdue. Complete within 48 hours.",
    tone: "red"
  },
  {
    facility: "Riverside",
    kind: "Staffing",
    detail: "Night shift RN coverage still unfilled for tonight.",
    tone: "amber"
  },
  {
    facility: "Santa Clarita",
    kind: "Clinical",
    detail: "Recent incident requires medical follow-up confirmation.",
    tone: "red"
  }
];

const tasks = [
  "Confirm night shift coverage for Riverside",
  "Review overdue plans at San Pablo",
  "Check incident follow-up status at Santa Clarita"
];

const updateFeed = [
  {
    facility: "Riverside",
    label: "Staffing",
    detail: "Two open night shifts remain uncovered for this evening."
  },
  {
    facility: "San Pablo",
    label: "Compliance",
    detail: "Three treatment plans are still pending supervisor review."
  },
  {
    facility: "Turlock",
    label: "Operations",
    detail: "Census stable and no new escalation since morning rounds."
  }
];

function getHealthScore({
  staffOpenings,
  overdueItems,
  incidents
}: {
  staffOpenings: number;
  overdueItems: number;
  incidents: number;
}) {
  return Math.max(71, 100 - staffOpenings * 3 - overdueItems - incidents * 2);
}

export default function SummaryPage() {
  const [selectedFacility, setSelectedFacility] = useState("all");

  const currentFacility = useMemo(
    () => facilities.find((facility) => facility.id === selectedFacility) || facilities[0],
    [selectedFacility]
  );

  const visibleAlerts =
    selectedFacility === "all"
      ? alerts
      : alerts.filter(
          (alert) =>
            alert.facility.toLowerCase().replace(/\s+/g, "-") === selectedFacility
        );

  const rankedFacilities = facilities
    .filter((facility) => facility.id !== "all")
    .map((facility) => ({
      ...facility,
      score: getHealthScore(facility)
    }))
    .sort((a, b) => a.score - b.score);

  const priorityFacility =
    selectedFacility === "all"
      ? rankedFacilities[0]
      : rankedFacilities.find((facility) => facility.id === selectedFacility) || rankedFacilities[0];

  const healthScore = getHealthScore(currentFacility);

  const stats = [
    {
      label: "Occupancy",
      value: currentFacility.occupancy,
      icon: BedDouble,
      tone: "emerald"
    },
    {
      label: "Open Shifts",
      value: String(currentFacility.staffOpenings),
      icon: Users,
      tone: currentFacility.staffOpenings > 0 ? "amber" : "emerald"
    },
    {
      label: "Overdue",
      value: String(currentFacility.overdueItems),
      icon: ClipboardList,
      tone: currentFacility.overdueItems > 5 ? "red" : "amber"
    },
    {
      label: "Compliance",
      value: currentFacility.compliance,
      icon: ShieldCheck,
      tone: "emerald"
    }
  ];

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Mobile
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Summary</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          What needs attention today across facilities.
        </p>
      </header>

      <section className="overflow-hidden rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white shadow-sm">
        <div className="border-b border-emerald-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Morning Brief
          </p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                {priorityFacility.name}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">{priorityFacility.summary}</p>
            </div>
            <div className="shrink-0 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-center shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Health
              </div>
              <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {selectedFacility === "all" ? priorityFacility.score : healthScore}
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-px bg-emerald-100">
          <div className="bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Priority
            </div>
            <div className="mt-1 text-sm font-bold text-slate-900">
              {priorityFacility.openShifts > 0 ? "Staffing" : "Compliance"}
            </div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Incidents
            </div>
            <div className="mt-1 text-sm font-bold text-slate-900">{priorityFacility.incidents} open</div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Open Shifts
            </div>
            <div className="mt-1 text-sm font-bold text-slate-900">{priorityFacility.staffOpenings}</div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Facility
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {facilities.map((facility) => (
            <button
              key={facility.id}
              onClick={() => setSelectedFacility(facility.id)}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                selectedFacility === facility.id
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {facility.name}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Today
        </p>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
          {currentFacility.name}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{currentFacility.summary}</p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Facility Rank
            </p>
            <h2 className="mt-1 text-base font-bold text-slate-900">Where attention goes first</h2>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">
            Live
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {rankedFacilities.map((facility, index) => (
            <div
              key={facility.id}
              className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700 shadow-sm">
                  {index + 1}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">{facility.name}</div>
                  <div className="text-xs font-medium text-slate-500">
                    {facility.openShifts} open shifts · {facility.overdueItems} overdue items
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-slate-900">{facility.score}</div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Score
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const toneClass =
            stat.tone === "red"
              ? "bg-red-50 text-red-600"
              : stat.tone === "amber"
                ? "bg-amber-50 text-amber-600"
                : "bg-emerald-50 text-emerald-600";

          return (
            <div
              key={stat.label}
              className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {stat.label}
                </span>
                <div className={`rounded-xl p-2 ${toneClass}`}>
                  <Icon size={16} />
                </div>
              </div>
              <div className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
                {stat.value}
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Live Snapshot
            </p>
            <h2 className="mt-1 text-base font-bold text-slate-900">
              Operational updates from the field
            </h2>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
            3 updates
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {updateFeed.map((item) => (
            <div key={`${item.facility}-${item.label}`} className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {item.facility} · {item.label}
              </div>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-800">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-500" />
          <h2 className="text-base font-bold text-slate-900">Critical Alerts</h2>
        </div>
        <div className="mt-4 space-y-3">
          {visibleAlerts.map((alert) => (
            <div
              key={`${alert.facility}-${alert.kind}`}
              className={`rounded-2xl border p-4 ${
                alert.tone === "red"
                  ? "border-red-200 bg-red-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {alert.facility} · {alert.kind}
              </div>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-800">{alert.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Next Actions</h2>
        <div className="mt-4 space-y-2">
          {tasks.map((task) => (
            <div
              key={task}
              className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
            >
              {task}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
