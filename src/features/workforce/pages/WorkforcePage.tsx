import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import {
  fetchWorkforceDashboard,
  readCachedWorkforceDashboard
} from "../../../shared/api/platformData";
import type {
  WorkforceDashboardResponse,
  WorkforceOpenPosition,
  WorkforceSummary,
  WorkforceTotals
} from "../../../shared/types/platformSnapshot";

type ConnectedWorkforce = Extract<WorkforceSummary, { status: "connected" }>;

const PHASE_COLORS = ["#8fc9b9", "#2f9d86", "#0b5f4f"] as const;

export default function WorkforcePage() {
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
    <div
      data-workforce-overview="true"
      className="relative min-h-[calc(100dvh-var(--platform-header-height))] w-full bg-white px-3 pb-14 text-[#171918] sm:px-6 lg:px-10"
    >
      <div className="mx-auto w-full max-w-[1540px] pt-5 sm:pt-7">
        {connected ? (
          <WorkforceOverview workforce={connected} />
        ) : loading ? (
          <p role="status" className="py-16 text-center text-[12px] font-semibold uppercase tracking-[0.12em] text-[#737b77]">Loading workforce</p>
        ) : (
          <>
            <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#171918]">Workforce</h1>
            <div role="alert" className="mt-6 rounded-xl border border-[#e4d1ca] bg-white px-4 py-8">
              <p className="text-[14px] font-bold text-[#a04436]">
                {loadFailed || workforce?.status === "unavailable"
                  ? "Workforce data is temporarily unavailable."
                  : "Workforce is not connected yet."}
              </p>
              <p className="mt-2 text-[12px] leading-5 text-[#737373]">
                {workforce?.status === "not_connected"
                  ? "Set WORKFORCE_SUMMARY_URL and WORKFORCE_SUMMARY_TOKEN on the Alamo server to show headcount, open roles, and applicants here."
                  : "Alamo retries the Workforce feed automatically. The Workforce app itself remains available."}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function WorkforceOverview({ workforce }: { workforce: ConnectedWorkforce }) {
  const { portfolio } = workforce;
  const openPositions = workforce.openPositions.length;
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#dfe3e1] pb-5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0f8b73]">Workforce</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-[#171918] sm:text-[34px]">
            {portfolio.openRoles} open {pluralize("role", portfolio.openRoles)} · {portfolio.applicants} {pluralize("applicant", portfolio.applicants)} in the pipeline
          </h1>
          <p className="mt-2 text-[13px] leading-5 text-[#5f6762]">
            {portfolio.active} active staff, {portfolio.onboarding} onboarding, {portfolio.onLeave} on leave across {workforce.communities.length} communities · as of {formatDate(workforce.asOf)}
          </p>
        </div>
        {workforce.workforceUrl ? (
          <a
            href={workforce.workforceUrl}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0f8b73] px-4 text-[13px] font-semibold text-white hover:bg-[#0c705f]"
          >
            Open Workforce
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
      </header>

      <PhasePipeline phaseNames={workforce.phaseNames} totals={portfolio} />

      <BreakdownSection
        id="workforce-by-community"
        title="By community"
        rows={workforce.communities.map((row) => ({ key: row.community, name: row.community, totals: row.totals }))}
        label="Community"
      />

      <BreakdownSection
        id="workforce-by-role"
        title="By role"
        rows={workforce.roles.map((row) => ({ key: row.discipline, name: row.label, totals: row.totals }))}
        label="Role"
      />

      <section className="mt-8" aria-labelledby="workforce-open-roles">
        <SectionHeading id="workforce-open-roles" title="Open roles" count={openPositions} note={`${portfolio.openRoles} ${pluralize("opening", portfolio.openRoles)} in total`} />
        {openPositions === 0 ? (
          <p className="py-6 text-[12px] text-[#737b77]">No open roles right now.</p>
        ) : (
          <OpenRolesTable positions={workforce.openPositions} />
        )}
      </section>
    </>
  );
}

function PhasePipeline({ phaseNames, totals }: { phaseNames: [string, string, string]; totals: WorkforceTotals }) {
  const phases = [totals.phase1, totals.phase2, totals.phase3];
  return (
    <section className="mt-6" aria-labelledby="workforce-phases">
      <SectionHeading id="workforce-phases" title="Applicants by phase" count={totals.applicants} />
      {totals.applicants > 0 ? (
        <div className="flex h-3 overflow-hidden rounded-full bg-[#e8eeeb]" aria-hidden="true">
          {phases.map((count, index) => (
            <span key={index} style={{ width: `${(count / totals.applicants) * 100}%`, background: PHASE_COLORS[index] }} />
          ))}
        </div>
      ) : null}
      <ol className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {phases.map((count, index) => (
          <li key={index} className="flex items-center gap-2 text-[13px] text-[#374540]">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PHASE_COLORS[index] }} aria-hidden="true" />
            <span>Phase {index + 1} · {phaseNames[index]}</span>
            <strong className="font-semibold tabular-nums text-[#171918]">{count}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

function BreakdownSection({ id, title, label, rows }: { id: string; title: string; label: string; rows: Array<{ key: string; name: string; totals: WorkforceTotals }> }) {
  return (
    <section className="mt-8" aria-labelledby={id}>
      <SectionHeading id={id} title={title} count={rows.length} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b-2 border-[#171918] text-[10px] font-bold uppercase tracking-[0.1em] text-[#374540]">
              <th className="py-2 pr-4">{label}</th>
              <Numeric>Active</Numeric>
              <Numeric>Onboarding</Numeric>
              <Numeric>On leave</Numeric>
              <Numeric>Open roles</Numeric>
              <Numeric>Applicants</Numeric>
              <Numeric>Phase 1</Numeric>
              <Numeric>Phase 2</Numeric>
              <Numeric>Phase 3</Numeric>
              <Numeric>Credentials current</Numeric>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, name, totals }) => (
              <tr key={key} data-workforce-row={key} className="border-b border-[#e8ecea] hover:bg-[#f8faf9]">
                <th scope="row" className="whitespace-nowrap py-3 pr-4 font-semibold text-[#263c35]">{name}</th>
                <Numeric cell>{totals.active}</Numeric>
                <Numeric cell>{totals.onboarding}</Numeric>
                <Numeric cell>{totals.onLeave}</Numeric>
                <Numeric cell strong={totals.openRoles > 0}>{totals.openRoles}</Numeric>
                <Numeric cell>{totals.applicants}</Numeric>
                <Numeric cell>{totals.phase1}</Numeric>
                <Numeric cell>{totals.phase2}</Numeric>
                <Numeric cell>{totals.phase3}</Numeric>
                <Numeric cell>{Math.round(totals.complianceRate * 100)}%</Numeric>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OpenRolesTable({ positions }: { positions: WorkforceOpenPosition[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b-2 border-[#171918] text-[10px] font-bold uppercase tracking-[0.1em] text-[#374540]">
            <th className="py-2 pr-4">Role</th>
            <th className="py-2 pr-4">Community</th>
            <Numeric>Openings</Numeric>
            <Numeric>Days open</Numeric>
            <Numeric>Phase 1</Numeric>
            <Numeric>Phase 2</Numeric>
            <Numeric>Phase 3</Numeric>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => {
            const applicants = position.phase1 + position.phase2 + position.phase3;
            return (
              <tr key={`${position.title}|${position.community}|${position.openedOn}`} className="border-b border-[#e8ecea] hover:bg-[#f8faf9]">
                <td className="py-3 pr-4">
                  <span className="font-semibold text-[#263c35]">{position.title}</span>
                  <span className="block text-[11px] text-[#737b77]">
                    {position.roleLabel}
                    {applicants === 0 ? <span className="ml-2 font-semibold text-[#a04436]">No applicants yet</span> : null}
                  </span>
                </td>
                <td className="whitespace-nowrap py-3 pr-4 text-[#374540]">{position.community}</td>
                <Numeric cell strong>{position.openings}</Numeric>
                <Numeric cell>{position.daysOpen}</Numeric>
                <Numeric cell>{position.phase1}</Numeric>
                <Numeric cell>{position.phase2}</Numeric>
                <Numeric cell>{position.phase3}</Numeric>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeading({ id, title, count, note }: { id: string; title: string; count: number; note?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[17px] font-semibold tracking-[-0.02em] text-[#263c35]">
        {title} <span className="font-medium tabular-nums text-[#737b77]">{count}</span>
      </h2>
      {note ? <p className="text-[11px] text-[#737b77]">{note}</p> : null}
    </div>
  );
}

function Numeric({ children, cell = false, strong = false }: { children: ReactNode; cell?: boolean; strong?: boolean }) {
  const className = `${cell ? "py-3" : "py-2"} pl-3 text-right tabular-nums ${strong ? "font-semibold text-[#171918]" : cell ? "text-[#374540]" : ""}`;
  return cell ? <td className={className}>{children}</td> : <th className={className}>{children}</th>;
}

function pluralize(word: string, count: number) {
  return count === 1 ? word : `${word}s`;
}

function formatDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
