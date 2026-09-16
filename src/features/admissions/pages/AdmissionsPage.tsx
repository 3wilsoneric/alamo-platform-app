import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import { useMsal } from "@azure/msal-react";
import { Link, useNavigate } from "react-router-dom";

import { isE2EAuthBypassEnabled } from "../../../app/auth/authConfig";
import {
  fetchHomeDashboard,
  readCachedHomeDashboard,
  type HomeDashboardResponse
} from "../../../shared/api/platformData";
import { getAccountAdmissionsAccess } from "../../../shared/auth/admissionsAccess";
import PlatformPageNavigation, {
  type PlatformPage
} from "../../california/components/PlatformPageNavigation";

const FULL_PIPELINE_URL = "https://alamo-pipeline.com";

export default function AdmissionsPage() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const access = getAccountAdmissionsAccess(accounts[0], isE2EAuthBypassEnabled);
  const [dashboard, setDashboard] = useState<HomeDashboardResponse | null>(readCachedHomeDashboard);
  const [loading, setLoading] = useState(!dashboard);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!access.allowed) return;
    const controller = new AbortController();
    setLoadFailed(false);
    fetchHomeDashboard(controller.signal)
      .then((value) => setDashboard(value))
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [access.allowed]);

  if (!access.allowed) {
    return (
      <section className="mx-auto flex min-h-[calc(100vh-96px)] w-full max-w-3xl items-center px-4 py-12 sm:px-8">
        <div className="w-full border-y border-[#111111] py-9">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#a04436]">
            Admissions access
          </p>
          <h1 className="mt-3 text-[34px] font-semibold leading-tight text-[#111111]">
            Your account is not assigned to Admissions.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#595959]">
            Ask an Entra administrator to assign Admissions access, then sign out and back in.
          </p>
          <Link
            to="/home"
            className="mt-7 inline-flex items-center gap-2 text-[14px] font-bold text-[#0f8b73] hover:text-[#0c705f]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Alamo
          </Link>
        </div>
      </section>
    );
  }

  const portfolioCensus = dashboard?.operational.currentWeeklyCensus
    ?? dashboard?.operational.currentCensus
    ?? null;
  const censusPeriod = dashboard?.operational.latestCensusWeek
    ?? dashboard?.operational.currentCensusPeriod
    ?? dashboard?.operational.asOf
    ?? null;
  const censusChange = dashboard?.operational.censusChange7d
    ?? dashboard?.operational.censusChange
    ?? null;
  const freshnessWarning = dashboard?.snapshot_status?.warning ?? null;

  function openPlatformPage(page: Exclude<PlatformPage, "admissions">) {
    navigate(page === "home" ? "/home" : "/analytics");
  }

  return (
    <div
      data-admissions-overview="true"
      className="relative left-1/2 min-h-dvh w-screen -translate-x-1/2 bg-white px-4 pb-14 pt-16 text-[#111111] sm:px-8 lg:px-12"
    >
      <PlatformPageNavigation
        active="admissions"
        admissionsAllowed
        onNavigate={openPlatformPage}
      />

      <div className="mx-auto w-full max-w-[1432px]">
        <h1 className="sr-only">Admissions</h1>
        <header className="flex justify-end border-b-2 border-[#111111] pb-4">
          <a
            href={FULL_PIPELINE_URL}
            data-open-full-pipeline="true"
            data-dark-action="true"
            className="inline-flex min-h-12 items-center justify-center gap-2 bg-[#111111] px-5 text-[12px] font-bold text-white transition-colors hover:bg-[#0f8b73] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f8b73]"
          >
            Open Pipeline
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </header>

        {freshnessWarning ? (
          <div className="mt-6 border-l-4 border-[#b8493a] bg-[#fff7f5] px-4 py-3 text-[12px] leading-5 text-[#6e352d]">
            <strong>Data update delayed.</strong> {freshnessWarning}
          </div>
        ) : null}

        <section aria-label="Admissions census context" className="mt-5 grid border-y border-[#111111] sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Portfolio census"
            value={formatNumber(portfolioCensus)}
            detail={censusPeriod ? `Governed period ${formatDate(censusPeriod)}` : "Governed period unavailable"}
          />
          <Metric
            label="Census movement"
            value={formatDelta(censusChange)}
            detail={dashboard?.operational.censusCadence === "monthly" ? "Compared with prior month" : "Compared with prior loaded week"}
          />
          <Metric
            label="Communities"
            value={formatNumber(dashboard?.portfolio.communityCount ?? null)}
            detail="Current Alamo operating communities"
          />
          <Metric
            label="Resident profiles"
            value={formatNumber(dashboard?.portfolio.residentCount ?? null)}
            detail="Current governed profile rows"
          />
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.7fr)]">
          <section aria-labelledby="admissions-community-census-title" className="min-w-0">
            <div className="flex items-end justify-between gap-4 border-b border-[#111111] pb-3">
              <h2 id="admissions-community-census-title" className="text-[20px] font-semibold tracking-[-0.03em]">
                Community census
              </h2>
              <p className="text-right text-[10px] leading-4 text-[#737373]">
                {dashboard?.generated_at ? `Updated ${formatTimestamp(dashboard.generated_at)}` : "Update time unavailable"}
              </p>
            </div>

            {loading && !dashboard ? (
              <div aria-label="Loading Admissions census" aria-busy="true" className="space-y-px bg-[#d9d9d9]">
                {Array.from({ length: 5 }, (_, index) => (
                  <div key={index} className="h-16 animate-pulse bg-[#f7f8f7]" />
                ))}
              </div>
            ) : loadFailed && !dashboard ? (
              <div role="alert" className="border-b border-[#d9d9d9] px-4 py-8">
                <p className="text-[14px] font-bold text-[#a04436]">Census context is temporarily unavailable.</p>
                <p className="mt-2 text-[12px] leading-5 text-[#737373]">The full Pipeline workspace remains available while Alamo retries its governed dashboard feed.</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-[#d9d9d9] sm:hidden">
                  {(dashboard?.communities ?? []).map((community) => {
                    const currentCensus = community.currentWeeklyCensus ?? community.currentCensus ?? null;
                    const change = community.censusChange7d ?? community.censusChange ?? null;
                    const period = community.latestCensusWeek ?? community.currentCensusPeriod ?? null;
                    return (
                      <article
                        key={community.facility_id}
                        data-admissions-community-census-card={community.facility_id}
                        className="py-5"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <h3 className="text-[13px] font-bold leading-5">{community.community_name}</h3>
                            <p className="mt-1 text-[10px] text-[#737373]">{community.city}, {community.state}</p>
                          </div>
                          <p className="shrink-0 text-[26px] font-semibold leading-none">{formatNumber(currentCensus)}</p>
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-[#e5e5e5] pt-3 text-[10px]">
                          <span className="font-semibold text-[#315b54]">{formatDelta(change)}</span>
                          <span className="text-[#737373]">{period ? `Through ${formatDate(period)}` : "Period not loaded"}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[680px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#d9d9d9] text-[9px] font-bold uppercase tracking-[0.12em] text-[#737373]">
                      <th className="px-3 py-3">Community</th>
                      <th className="px-3 py-3">Location</th>
                      <th className="px-3 py-3 text-right">Census</th>
                      <th className="px-3 py-3 text-right">Change</th>
                      <th className="px-3 py-3 text-right">Data through</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.communities ?? []).map((community) => {
                      const currentCensus = community.currentWeeklyCensus ?? community.currentCensus ?? null;
                      const change = community.censusChange7d ?? community.censusChange ?? null;
                      const period = community.latestCensusWeek ?? community.currentCensusPeriod ?? null;
                      return (
                        <tr key={community.facility_id} className="border-b border-[#e5e5e5] text-[12px]">
                          <td className="px-3 py-4 font-bold text-[#111111]">{community.community_name}</td>
                          <td className="px-3 py-4 text-[#595959]">{community.city}, {community.state}</td>
                          <td className="px-3 py-4 text-right text-[16px] font-semibold">{formatNumber(currentCensus)}</td>
                          <td className="px-3 py-4 text-right font-semibold text-[#315b54]">{formatDelta(change)}</td>
                          <td className="px-3 py-4 text-right text-[#737373]">{period ? formatDate(period) : "Not loaded"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </section>

          <aside aria-label="Full Pipeline workspace" className="border-t-4 border-[#0f8b73] bg-[#f5f4ef] p-6">
            <h2 className="sr-only">Pipeline workspace</h2>
            <div className="divide-y divide-[#cfcfc9] border-y border-[#cfcfc9]">
              <WorkspaceLink href={`${FULL_PIPELINE_URL}/?view=referrals`} label="Referral worklist" />
              <WorkspaceLink href={`${FULL_PIPELINE_URL}/?view=referrals&screen=packet`} label="Create a referral packet" />
              <WorkspaceLink href={`${FULL_PIPELINE_URL}/?screen=profiles`} label="Client profiles" />
            </div>
            {loadFailed && dashboard ? (
              <p className="mt-5 flex items-center gap-2 text-[10px] leading-4 text-[#8a6118]">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Showing the last available Alamo census snapshot.
              </p>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="min-h-32 border-b border-[#d9d9d9] px-4 py-5 sm:even:border-l xl:border-b-0 xl:border-l xl:first:border-l-0">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#737373]">{label}</p>
      <p className="mt-3 text-[34px] font-semibold leading-none tracking-[-0.04em]">{value}</p>
      <p className="mt-3 text-[10px] leading-4 text-[#737373]">{detail}</p>
    </article>
  );
}

function WorkspaceLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="group flex items-center justify-between gap-4 py-3 text-[12px] font-bold text-[#111111] hover:text-[#0f8b73]">
      <span>{label}</span>
      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
    </a>
  );
}

function formatNumber(value: number | null) {
  return value == null || !Number.isFinite(value) ? "Not loaded" : value.toLocaleString("en-US");
}

function formatDelta(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Not loaded";
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-US")}`;
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
