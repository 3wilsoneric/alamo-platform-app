import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { isE2EAuthBypassEnabled } from "../../../app/auth/authConfig";
import { usePlatformOwnerAccess } from "../../../shared/auth/platformOwnerAccess";

import {
  fetchWorkforceDashboard,
  readCachedWorkforceDashboard
} from "../../../shared/api/platformData";
import type {
  WorkforceDashboardResponse,
  WorkforceOpenPosition,
  WorkforceSummary
} from "../../../shared/types/platformSnapshot";
import { StaffingMap } from "../components/StaffingMap";
import WorkforceBriefing from "../components/WorkforceBriefing";
import WorkforceRoles from "../components/WorkforceRoles";

type ConnectedWorkforce = Extract<WorkforceSummary, { status: "connected" }>;
type ColumnKey = "sourcing" | "interviewing" | "hiring";

// Columns are ordered by the action each role needs next, not by a funnel.
const COLUMNS: Array<{ key: ColumnKey; label: string; empty: string }> = [
  { key: "sourcing", label: "Needs candidates", empty: "Every open role has candidates in interviews or later" },
  { key: "interviewing", label: "Interviewing", empty: "No roles are waiting on interview decisions" },
  { key: "hiring", label: "Ready to hire", empty: "No candidates are in offer or clearance" }
];

// Same palette as the Admissions referral board so the two pages read as one system.
const COLUMN_STYLE: Record<ColumnKey, { surface: string; border: string; accent: string }> = {
  sourcing: { surface: "#fcf3ed", border: "#efd2bd", accent: "#b65318" },
  interviewing: { surface: "#f0f3fc", border: "#d4dcf5", accent: "#365fc7" },
  hiring: { surface: "#eef7f3", border: "#cde5d9", accent: "#257653" }
};

const PHASE_PIP = ["#b9dccf", "#4f9f86", "#1d5e4b"] as const;
const STALE_DAYS = 14;

// Every signed-in Platform user sees hiring by role. The briefing and hiring board, which also
// show staffing and credential gaps, stay owner-only; their API enforces the same rule.
export default function WorkforcePage() {
  const isOwner = usePlatformOwnerAccess();
  if (isOwner || isE2EAuthBypassEnabled) return <WorkforceOverview />;
  return (
    <WorkforceFrame>
      <WorkforceRoles />
    </WorkforceFrame>
  );
}

function WorkforceFrame({ children }: { children: ReactNode }) {
  return (
    <div
      data-workforce-overview="true"
      className="relative min-h-[calc(100dvh-var(--platform-header-height))] w-full bg-white px-3 pb-14 text-[#171918] sm:px-6 lg:px-10"
    >
      <div className="mx-auto w-full max-w-[1540px] pt-4 sm:pt-6">
        <h1 className="sr-only">Workforce</h1>
        {children}
      </div>
    </div>
  );
}

function WorkforceOverview() {
  const [dashboard, setDashboard] = useState<WorkforceDashboardResponse | null>(readCachedWorkforceDashboard);
  const [loading, setLoading] = useState(!dashboard);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchWorkforceDashboard(controller.signal)
      .then((value) => setDashboard(value))
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const workforce = dashboard?.workforce;
  const connected = workforce?.status === "connected" ? workforce : null;

  return (
    <WorkforceFrame>
        {connected ? (
          <WorkforceSurfaces workforce={connected} />
        ) : loading ? (
          <p role="status" className="py-16 text-center text-[12px] font-semibold uppercase tracking-[0.12em] text-[#737b77]">Loading workforce</p>
        ) : (
          <div role="alert" className="rounded-xl border border-[#e4d1ca] bg-white px-4 py-8">
            <p className="text-[14px] font-bold text-[#a04436]">
              {loadFailed || workforce?.status === "unavailable"
                ? "Workforce data is temporarily unavailable."
                : "Workforce is not connected yet."}
            </p>
            <p className="mt-2 text-[12px] leading-5 text-[#737373]">
              {workforce?.status === "not_connected"
                ? "Set WORKFORCE_SUMMARY_URL and WORKFORCE_SUMMARY_TOKEN on the Alamo server to show hiring and staffing here."
                : "Alamo retries the Workforce feed automatically. The Workforce app itself remains available."}
            </p>
          </div>
        )}
    </WorkforceFrame>
  );
}

type Surface = "board" | "briefing" | "roles";

const SURFACE_LABELS: Record<Surface, string> = { briefing: "Briefing", board: "Hiring board", roles: "By role" };

/** Same two-surface layout as Admissions: a briefing and the working board, addressable by ?view=. */
function WorkforceSurfaces({ workforce }: { workforce: ConnectedWorkforce }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view");
  const surface: Surface = view === "briefing" || view === "roles" ? view : "board";

  function show(next: Surface) {
    const params = new URLSearchParams(searchParams);
    if (next === "board") params.delete("view");
    else params.set("view", next);
    setSearchParams(params, { replace: false });
  }

  return (
    <>
      <nav aria-label="Workforce pages" className="mb-5 border-b border-[#d9dfdb]">
        <div role="tablist" className="flex items-end gap-7">
          {(["briefing", "board", "roles"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={surface === item}
              onClick={() => show(item)}
              className={`-mb-px min-h-11 border-b-2 px-0.5 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] ${surface === item ? "border-[#0f8b73] font-semibold text-[#163f36]" : "border-transparent font-medium text-[#69716c] hover:border-[#b8c6bf] hover:text-[#303532]"}`}
            >
              {SURFACE_LABELS[item]}
            </button>
          ))}
        </div>
      </nav>
      <div role="tabpanel" aria-label={SURFACE_LABELS[surface]}>
        {surface === "briefing" ? <WorkforceBriefing workforce={workforce} />
          : surface === "roles" ? <WorkforceRoles />
            : <WorkforceBoard workforce={workforce} />}
      </div>
    </>
  );
}

function WorkforceBoard({ workforce }: { workforce: ConnectedWorkforce }) {
  const [communities, setCommunities] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<Set<string>>(new Set());
  const [mobileColumn, setMobileColumn] = useState<ColumnKey>("sourcing");

  const roleOptions = useMemo(() => {
    const seen = new Map<string, string>();
    workforce.openPositions.forEach((position) => seen.set(position.discipline, position.roleLabel));
    return [...seen].sort(([, a], [, b]) => a.localeCompare(b));
  }, [workforce.openPositions]);

  const positions = workforce.openPositions.filter((position) =>
    (communities.size === 0 || communities.has(position.community)) &&
    (roles.size === 0 || roles.has(position.discipline)));
  const staffing = workforce.communities.filter((row) => communities.size === 0 || communities.has(row.community));

  return (
    <>
      <div className="mb-4 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <PillRow label="Filter by community">
            <Pill active={communities.size === 0} onClick={() => setCommunities(new Set())}>All communities</Pill>
            {workforce.communities.map(({ community }) => (
              <Pill key={community} active={communities.has(community)} onClick={() => setCommunities(toggle(communities, community))}>{community}</Pill>
            ))}
          </PillRow>
          <PillRow label="Filter by role">
            <Pill active={roles.size === 0} onClick={() => setRoles(new Set())}>All roles</Pill>
            {roleOptions.map(([discipline, label]) => (
              <Pill key={discipline} active={roles.has(discipline)} onClick={() => setRoles(toggle(roles, discipline))}>{label}</Pill>
            ))}
          </PillRow>
        </div>
        {workforce.workforceUrl ? (
          <a
            href={workforce.workforceUrl}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-lg px-3.5 text-[12px] font-semibold text-[#145e48] hover:bg-[#e5f2ec]"
          >
            Open Workforce
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      <section aria-label="Hiring board" data-workforce-board="true">
        <div className="mb-3 flex gap-1 overflow-x-auto lg:hidden" role="group" aria-label="Board column">
          {COLUMNS.map((column) => (
            <button
              key={column.key}
              type="button"
              aria-pressed={mobileColumn === column.key}
              onClick={() => setMobileColumn(column.key)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-[12px] font-medium ${mobileColumn === column.key ? "bg-[#e5f2ec] text-[#145e48]" : "text-[#59615c]"}`}
            >
              {column.label}
              <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold shadow-sm">{positions.filter((position) => columnFor(position) === column.key).length}</span>
            </button>
          ))}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-3">
          {COLUMNS.map((column) => {
            const cards = positions
              .filter((position) => columnFor(position) === column.key)
              .sort((a, b) => urgency(b) - urgency(a));
            const style = COLUMN_STYLE[column.key];
            return (
              <section
                key={column.key}
                data-workforce-board-column={column.key}
                className={`min-w-0 overflow-hidden rounded-2xl border ${mobileColumn === column.key ? "" : "hidden lg:block"}`}
                style={{ backgroundColor: style.surface, borderColor: style.border }}
              >
                <header className="flex items-center gap-2.5 px-5 pb-4 pt-5">
                  <h2 className="truncate text-[16px] font-semibold tracking-[-0.02em]">{column.label}</h2>
                  <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-[#3f4642] shadow-sm">{cards.length}</span>
                </header>
                {cards.length ? (
                  <ul className="max-h-[720px] space-y-3 overflow-y-auto px-4 pb-4">
                    {cards.map((position) => (
                      <li key={`${position.title}|${position.community}|${position.openedOn}`}>
                        <RoleCard position={position} phaseNames={workforce.phaseNames} accent={style.accent} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mx-4 mb-4 rounded-xl border border-dashed bg-white/55 px-4 py-10 text-center text-[12px] text-[#69716c]" style={{ borderColor: style.border }}>
                    {column.empty}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </section>

      <StaffingMap rows={staffing} workforceUrl={workforce.workforceUrl} />
    </>
  );
}

function RoleCard({ position, phaseNames, accent }: { position: WorkforceOpenPosition; phaseNames: [string, string, string]; accent: string }) {
  const action = nextAction(position);
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block truncate text-[15px] font-semibold tracking-[-0.02em] text-[#171918]">{position.title}</span>
          <span className="mt-1 block truncate text-[11px] text-[#69716c]">{position.community} · {position.roleLabel}</span>
        </div>
        <span className="shrink-0 rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.06em]" style={{ borderColor: accent, color: accent }}>
          {position.openings} {position.openings === 1 ? "opening" : "openings"}
        </span>
      </div>

      <div className="mt-4 border-y border-[#edf0ee] py-3">
        <CandidateSeats position={position} phaseNames={phaseNames} />
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <span className={`min-w-0 text-[11px] font-semibold leading-4 ${action.className}`}>{action.label}</span>
        <span className="shrink-0 text-[10px] text-[#7b837f]">{position.daysOpen}d open</span>
      </div>

      {position.url ? (
        <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[#0f795f]">
          Open role
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      ) : null}
    </>
  );
  const className = "group block w-full rounded-xl border border-[#dfe3e1] bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition hover:-translate-y-px hover:border-[#bfc9c3] hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]";
  return position.url ? (
    <a href={position.url} data-workforce-role-card="true" className={className} aria-label={`${position.title}, ${position.community}. ${action.label}. Open in Workforce`}>{body}</a>
  ) : (
    <div data-workforce-role-card="true" className={className}>{body}</div>
  );
}

/** One square per candidate, shaded by phase, then a hollow square for each opening still uncovered. */
function CandidateSeats({ position, phaseNames }: { position: WorkforceOpenPosition; phaseNames: [string, string, string] }) {
  const phases = [position.phase1, position.phase2, position.phase3];
  const candidates = phases.reduce((total, count) => total + count, 0);
  const uncovered = Math.max(0, position.openings - candidates);
  const description = phases.map((count, index) => `${count} in ${(phaseNames[index] ?? `phase ${index + 1}`).toLowerCase()}`).join(", ");
  return (
    <div>
      <div className="flex flex-wrap gap-1" role="img" aria-label={`${description}; ${uncovered} openings without a candidate`}>
        {phases.flatMap((count, index) => Array.from({ length: count }, (_, pip) => (
          <span key={`${index}-${pip}`} className="h-4 w-4 rounded-[4px]" style={{ backgroundColor: PHASE_PIP[index] }} />
        )))}
        {Array.from({ length: uncovered }, (_, pip) => (
          <span key={`open-${pip}`} className="h-4 w-4 rounded-[4px] border-[1.5px] border-dashed border-[#b8c2bd] bg-white" />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#5f6762]">
        {phases.map((count, index) => count > 0 ? (
          <span key={index} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: PHASE_PIP[index] }} aria-hidden="true" />
            {count} {(phaseNames[index] ?? `phase ${index + 1}`).toLowerCase()}
          </span>
        ) : null)}
        {uncovered > 0 ? <span>{uncovered} {uncovered === 1 ? "opening" : "openings"} without a candidate</span> : null}
      </div>
    </div>
  );
}

function PillRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="-mx-3 flex min-w-0 flex-nowrap gap-2 overflow-x-auto overscroll-x-contain px-3 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0" role="group" aria-label={label}>
      {children}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] ${active ? "border-[#0f795f] bg-[#e5f2ec] text-[#145e48]" : "border-[#d9dfdb] bg-white text-[#59615c] hover:border-[#9eb9ac] hover:bg-[#f7faf8]"}`}
    >
      {children}
    </button>
  );
}

function columnFor(position: WorkforceOpenPosition): ColumnKey {
  if (position.phase3 > 0) return "hiring";
  if (position.phase2 > 0) return "interviewing";
  return "sourcing";
}

/** Higher sorts first within a column: uncovered openings and age drive urgency. */
function urgency(position: WorkforceOpenPosition) {
  const candidates = position.phase1 + position.phase2 + position.phase3;
  return Math.max(0, position.openings - candidates) * 100 + position.daysOpen;
}

function nextAction(position: WorkforceOpenPosition) {
  const candidates = position.phase1 + position.phase2 + position.phase3;
  const short = Math.max(0, position.openings - candidates);
  if (position.phase3 > 0) {
    return { label: `${position.phase3} in offer and clearance: finish background, TB, and start date`, className: "text-[#257653]" };
  }
  if (position.phase2 > 0) {
    return { label: `${position.phase2} interviewed: decide and extend offers${short ? `, and find ${short} more` : ""}`, className: "text-[#365fc7]" };
  }
  if (candidates === 0) {
    return position.daysOpen >= STALE_DAYS
      ? { label: `No applicants in ${position.daysOpen} days: repost or ask staff for referrals`, className: "text-[#9a3f36]" }
      : { label: "No applicants yet: share the posting", className: "text-[#b65318]" };
  }
  return { label: `${position.phase1} to screen: schedule interviews${short ? `, and find ${short} more` : ""}`, className: "text-[#b65318]" };
}

function toggle(set: Set<string>, value: string) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
