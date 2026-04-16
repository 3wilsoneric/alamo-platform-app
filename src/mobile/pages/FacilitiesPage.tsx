import { Building2, ChevronRight, TriangleAlert, Users } from "lucide-react";

const facilities = [
  {
    name: "San Pablo",
    occupancy: "94.7%",
    incidents: 3,
    openShifts: 1,
    note: "Compliance follow-up due within 48 hours."
  },
  {
    name: "Turlock",
    occupancy: "92.0%",
    incidents: 2,
    openShifts: 0,
    note: "Stable operations and low alert volume."
  },
  {
    name: "Riverside",
    occupancy: "96.7%",
    incidents: 4,
    openShifts: 2,
    note: "Night coverage remains the top concern."
  },
  {
    name: "Santa Clarita",
    occupancy: "92.0%",
    incidents: 3,
    openShifts: 0,
    note: "Clinical follow-up remains open on one incident."
  }
];

export default function FacilitiesPage() {
  const spotlight = facilities[2];

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Mobile
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Facilities</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Facility-by-facility status for quick scanning and handoff.
        </p>
      </header>

      <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Priority Facility
        </p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{spotlight.name}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{spotlight.note}</p>
          </div>
          <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Open Shifts
            </div>
            <div className="mt-1 text-xl font-bold text-slate-900">{spotlight.openShifts}</div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        {facilities.map((facility) => (
          <article
            key={facility.name}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-emerald-700" />
                  <h2 className="text-lg font-bold text-slate-900">{facility.name}</h2>
                  {facility.openShifts > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">
                      Attention
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{facility.note}</p>
              </div>
              <ChevronRight size={18} className="text-slate-400" />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Occupancy
                </div>
                <div className="mt-2 text-lg font-bold text-slate-900">{facility.occupancy}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <TriangleAlert size={12} />
                  Incidents
                </div>
                <div className="mt-2 text-lg font-bold text-slate-900">{facility.incidents}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <Users size={12} />
                  Shifts
                </div>
                <div className="mt-2 text-lg font-bold text-slate-900">{facility.openShifts}</div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
