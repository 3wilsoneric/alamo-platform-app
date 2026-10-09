import { useEffect, useState } from "react";

import { fetchWorkforceRoles, readCachedWorkforceRoles } from "../../../shared/api/platformData";
import type {
  WorkforceRoleHiring,
  WorkforceRoleOverview,
  WorkforceRolesResponse
} from "../../../shared/types/platformSnapshot";

type ConnectedRoles = Extract<WorkforceRoleOverview, { status: "connected" }>;

const PHASE_PIP = ["#b9dccf", "#4f9f86", "#1d5e4b"] as const;
const MAX_PIPS = 24;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 8_000;

/**
 * Hiring by role for every signed-in Platform user: open roles and what they
 * are, and applicants in each hiring phase. It reads its own endpoint, which
 * carries no staffing, credential, or person-level data.
 */
export default function WorkforceRoles() {
  const [response, setResponse] = useState<WorkforceRolesResponse | null>(readCachedWorkforceRoles);
  const [loading, setLoading] = useState(response?.workforce.status !== "connected");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let retry: number | undefined;
    // The Workforce app sleeps when idle; its first answer after waking can miss the server's
    // timeout. Keep showing the loading state and try again a few times before reporting a problem.
    const load = (attemptsLeft: number) => {
      fetchWorkforceRoles(controller.signal)
        .then((value) => {
          if (value.workforce.status === "unavailable" && attemptsLeft > 0) {
            retry = window.setTimeout(() => load(attemptsLeft - 1), RETRY_DELAY_MS);
            return;
          }
          setResponse(value);
          setLoading(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setLoadFailed(true);
          setLoading(false);
        });
    };
    load(RETRY_ATTEMPTS);
    return () => {
      controller.abort();
      if (retry != null) window.clearTimeout(retry);
    };
  }, []);

  const workforce = response?.workforce;
  if (workforce?.status === "connected") return <RoleOverview workforce={workforce} />;
  if (loading) {
    return <p role="status" className="py-16 text-center text-[12px] font-semibold uppercase tracking-[0.12em] text-[#737b77]">Loading hiring by role</p>;
  }
  return (
    <div role="alert" className="rounded-xl border border-[#e4d1ca] bg-white px-4 py-8">
      <p className="text-[14px] font-bold text-[#a04436]">
        {loadFailed || workforce?.status === "unavailable" ? "Hiring by role is temporarily unavailable." : "Workforce is not connected yet."}
      </p>
      <p className="mt-2 text-[12px] leading-5 text-[#737373]">Open roles and applicants will appear here once the Workforce feed responds.</p>
    </div>
  );
}

function RoleOverview({ workforce }: { workforce: ConnectedRoles }) {
  const openRoles = workforce.roles.reduce((total, role) => total + role.positions.length, 0);
  const openings = workforce.roles.reduce((total, role) => total + role.openRoles, 0);
  const phases = [0, 1, 2].map((index) => workforce.roles.reduce((total, role) => total + phaseCounts(role)[index]!, 0));
  const applicants = phases.reduce((total, count) => total + count, 0);

  return (
    <section data-workforce-roles="true" aria-labelledby="workforce-roles-title">
      {workforce.placeholderData ? (
        <p data-workforce-sample-notice="true" className="mb-5 rounded-xl border border-[#ead8a9] bg-[#fffaf0] px-4 py-3 text-[12px] leading-5 text-[#75591f]">
          <strong className="font-semibold">Sample data.</strong> These roles and applicants are placeholders that show how this page will work. They are not real HR records.
        </p>
      ) : null}

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="workforce-roles-title" className="text-[18px] font-semibold tracking-[-0.025em] text-[#202623]">Hiring by role</h2>
          <p className="mt-1 text-[12px] leading-5 text-[#5f6762]">
            {plural(openRoles, "open role")} with {plural(openings, "opening")} · {plural(applicants, "applicant")}
            {applicants > 0 ? `: ${phases.map((count, index) => `${count} in Phase ${index + 1}`).join(", ")}` : ""}
          </p>
        </div>
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#5f6762]" aria-label="Hiring phases">
          {workforce.phaseNames.map((name, index) => (
            <li key={name} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: PHASE_PIP[index] }} aria-hidden="true" />
              Phase {index + 1} · {name}
            </li>
          ))}
        </ol>
      </header>

      {workforce.roles.length ? (
        <ul className="space-y-3">
          {workforce.roles.map((role) => (
            <li key={role.discipline}>
              <RoleCard role={role} phaseNames={workforce.phaseNames} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-[#dfe3e1] bg-white px-5 py-12 text-center text-[13px] text-[#69716c]">No open roles or applicants right now.</p>
      )}

      {workforce.rolesWithoutHiring.length ? (
        <p className="mt-4 text-[11px] leading-5 text-[#737b77]">
          No open roles or applicants: {workforce.rolesWithoutHiring.join(", ")}.
        </p>
      ) : null}
    </section>
  );
}

function RoleCard({ role, phaseNames }: { role: WorkforceRoleHiring; phaseNames: [string, string, string] }) {
  const phases = phaseCounts(role);
  return (
    <article data-workforce-role={role.discipline} className="overflow-hidden rounded-2xl border border-[#dfe3e1] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[#edf0ee] bg-[#f8faf9] px-4 py-3 sm:px-5">
        <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-[#263c35]">{role.label}</h3>
        <p className="text-[12px] text-[#4b5652]">
          <strong className="font-semibold text-[#171918]">{plural(role.positions.length, "open role")}</strong>
          {role.openRoles !== role.positions.length ? ` (${plural(role.openRoles, "opening")})` : ""}
          {" · "}
          <strong className="font-semibold text-[#171918]">{plural(role.applicants, "applicant")}</strong>
        </p>
      </header>

      <div className="grid gap-x-8 gap-y-5 px-4 py-4 sm:px-5 lg:grid-cols-2">
        <div>
          <h4 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6f7974]">Open roles</h4>
          {role.positions.length ? (
            <ul className="mt-2 divide-y divide-[#edf0ee]">
              {role.positions.map((position) => (
                <li key={`${position.title}|${position.community}`} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-[#263c35]">{position.title}</span>
                    <span className="block text-[11px] text-[#69716c]">{position.community}</span>
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-[#4b5652]">{plural(position.openings, "opening")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-[#737b77]">No open roles. Applicants are in the general pool.</p>
          )}
        </div>

        <div>
          <h4 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6f7974]">Applicants by phase</h4>
          <dl className="mt-2 divide-y divide-[#edf0ee]">
            {phases.map((count, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_28px] items-center gap-3 py-2">
                <dt className="text-[12px] text-[#374540]">
                  Phase {index + 1}
                  <span className="block text-[10px] text-[#7b837f]">{phaseNames[index]}</span>
                </dt>
                <dd className="flex min-h-4 flex-wrap gap-1" aria-hidden="true">
                  {Array.from({ length: Math.min(count, MAX_PIPS) }, (_, pip) => (
                    <span key={pip} className="h-4 w-4 rounded-[4px]" style={{ backgroundColor: PHASE_PIP[index] }} />
                  ))}
                  {count > MAX_PIPS ? <span className="text-[10px] text-[#7b837f]">+{count - MAX_PIPS}</span> : null}
                </dd>
                <dd className="text-right text-[13px] font-semibold tabular-nums text-[#171918]">{count}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </article>
  );
}

function phaseCounts(role: WorkforceRoleHiring) {
  return [role.phase1, role.phase2, role.phase3];
}

function plural(count: number, noun: string) {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}
