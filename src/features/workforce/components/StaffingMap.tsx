import { ArrowRight } from "lucide-react";

import type { WorkforceTotals } from "../../../shared/types/platformSnapshot";

const MAX_SEATS = 60;

export function StaffingMap({ rows, workforceUrl }: { rows: Array<{ community: string; totals: WorkforceTotals }>; workforceUrl: string | null }) {
  return (
    <section className="mt-8" aria-labelledby="workforce-staffing-title" data-workforce-staffing="true">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="workforce-staffing-title" className="text-[17px] font-semibold tracking-[-0.02em] text-[#263c35]">Staffing by community</h2>
        <SeatLegend />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {rows.map(({ community, totals }) => {
          const blocked = Math.min(totals.staffBlockedFromScheduling, totals.active + totals.onboarding);
          const working = totals.active + totals.onboarding - blocked;
          // Large communities: one dot stands for several people so the map stays readable.
          const perSeat = Math.max(1, Math.ceil((working + blocked + totals.onLeave + totals.openRoles) / MAX_SEATS));
          const seats = (count: number) => (count > 0 ? Math.max(1, Math.round(count / perSeat)) : 0);
          const action = blocked > 0
            ? { label: `${blocked} can’t be scheduled`, detail: "Missing or expired credentials", href: workforceUrl && `${workforceUrl}/credentials?community=${encodeURIComponent(community)}`, className: "text-[#9a3f36]" }
            : totals.openRoles > 0
              ? { label: `${totals.openRoles} ${totals.openRoles === 1 ? "seat" : "seats"} to fill`, detail: `${totals.applicants} ${totals.applicants === 1 ? "candidate" : "candidates"} in the pipeline`, href: workforceUrl && `${workforceUrl}/hiring`, className: "text-[#b65318]" }
              : { label: "Fully staffed", detail: "No open roles or scheduling blocks", href: null, className: "text-[#257653]" };
          return (
            <article key={community} data-workforce-community={community} className="rounded-xl border border-[#e0e6e2] bg-white p-4 shadow-[0_1px_0_rgba(19,45,37,0.03)]">
              <h4 className="text-[16px] font-semibold text-[#263c35]">{community}</h4>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px] sm:hidden">
                <div><dt className="text-[#5d6d65]">Available</dt><dd className="text-[18px] font-semibold tabular-nums text-[#26745e]">{working}</dd></div>
                <div><dt className="text-[#5d6d65]">Open seats</dt><dd className="text-[18px] font-semibold tabular-nums text-[#ad571e]">{totals.openRoles}</dd></div>
                <div><dt className="text-[#5d6d65]">Can’t be scheduled</dt><dd className="text-[18px] font-semibold tabular-nums text-[#a94e30]">{blocked}</dd></div>
                <div><dt className="text-[#5d6d65]">On leave</dt><dd className="text-[18px] font-semibold tabular-nums text-[#52645b]">{totals.onLeave}</dd></div>
              </dl>
              <div
                className="mt-3 hidden flex-wrap gap-1 sm:flex"
                role="img"
                aria-label={`${working} staff available, ${blocked} blocked from scheduling, ${totals.onLeave} on leave, ${totals.openRoles} open seats`}
              >
                {Seats(seats(blocked), "h-3.5 w-3.5 rounded-full bg-[#d98b3a]")}
                {Seats(seats(working), "h-3.5 w-3.5 rounded-full bg-[#2f8f74]")}
                {Seats(seats(totals.onLeave), "h-3.5 w-3.5 rounded-full bg-[#c9d0cc]")}
                {Seats(seats(totals.openRoles), "h-3.5 w-3.5 rounded-full border-[1.5px] border-dashed border-[#b8c2bd]")}
              </div>
              {perSeat > 1 ? <p className="mt-1.5 hidden text-[11px] text-[#6b7971] sm:block">Each dot is about {perSeat} people</p> : null}
              <div className="mt-4 border-t border-[#edf0ee] pt-3">
                {action.href ? (
                  <a href={action.href} className={`group inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold ${action.className} hover:underline`}>
                    {action.label}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </a>
                ) : (
                  <p className={`text-[14px] font-semibold ${action.className}`}>{action.label}</p>
                )}
                <p className="mt-1 text-[12px] text-[#637068]">{action.detail}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SeatLegend() {
  const items: Array<[string, string]> = [
    ["h-2.5 w-2.5 rounded-full bg-[#2f8f74]", "Available"],
    ["h-2.5 w-2.5 rounded-full bg-[#d98b3a]", "Can’t be scheduled"],
    ["h-2.5 w-2.5 rounded-full bg-[#c9d0cc]", "On leave"],
    ["h-2.5 w-2.5 rounded-full border-[1.5px] border-dashed border-[#b8c2bd]", "Open seat"]
  ];
  return (
    <ul className="hidden flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#5f6762] sm:flex">
      {items.map(([className, label]) => (
        <li key={label} className="inline-flex items-center gap-1.5"><span className={className} aria-hidden="true" />{label}</li>
      ))}
    </ul>
  );
}

function Seats(count: number, className: string) {
  return Array.from({ length: count }, (_, index) => <span key={`${className}-${index}`} className={className} />);
}
