import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  fetchAdmissionsDashboard,
  readCachedAdmissionsDashboard,
  type AdmissionsDashboardResponse
} from "../../../shared/api/platformData";
import type { AdmissionsFlowPoint } from "../../../shared/types/platformSnapshot";
import PipelineBoard from "../components/PipelineBoard";
import PlatformPageNavigation, {
  type PlatformPage
} from "../../california/components/PlatformPageNavigation";

const FULL_PIPELINE_URL = "https://alamo-pipeline.com";
// Validated as a pair (light surface, CVD-safe with the direct legend labels).
const ADMISSIONS_COLOR = "#0f8b73";
const DISCHARGES_COLOR = "#b8493a";
// Referral series, validated as a set with ADMISSIONS_COLOR (all pairs, CVD).
const REFERRALS_COLOR = "#4a67c4";
const ACCEPTED_COLOR = "#c7851a";

export default function AdmissionsPage() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<AdmissionsDashboardResponse | null>(readCachedAdmissionsDashboard);
  const [loading, setLoading] = useState(!dashboard);
  const [loadFailed, setLoadFailed] = useState(false);

  // Every signed-in Platform user sees this leadership view. Rows carry
  // process facts only; client identity stays behind Pipeline's own sign-in.
  useEffect(() => {
    const controller = new AbortController();
    setLoadFailed(false);
    fetchAdmissionsDashboard(controller.signal)
      .then((value) => setDashboard(value))
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const portfolio = dashboard?.portfolio ?? null;
  const monthLabel = dashboard ? formatMonth(dashboard.month) : "This month";
  const priorMonthLabel = dashboard ? formatMonth(dashboard.prior_month) : "last month";
  const freshnessWarning = dashboard?.snapshot_status?.warning ?? null;
  const referralPipeline = dashboard?.referral_pipeline ?? null;
  const pipeline = referralPipeline?.status === "connected" ? referralPipeline : null;

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
        <header className="flex flex-wrap items-end justify-between gap-4 pb-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Admissions</h1>
            <p className="mt-1 text-[11px] text-[#737373]">
              {dashboard ? `Census data through ${formatDate(dashboard.as_of_date)}` : "Loading governed data"}
            </p>
          </div>
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
          <div className="mb-6 border-l-4 border-[#b8493a] bg-[#fff7f5] px-4 py-3 text-[12px] leading-5 text-[#6e352d]">
            <strong>Data update delayed.</strong> {freshnessWarning}
          </div>
        ) : null}

        {loadFailed && !dashboard ? (
          <div role="alert" className="mb-6 border-y border-[#d9d9d9] px-4 py-8">
            <p className="text-[14px] font-bold text-[#a04436]">Admissions data is temporarily unavailable.</p>
            <p className="mt-2 text-[12px] leading-5 text-[#737373]">Pipeline remains available while Alamo retries its governed feed.</p>
          </div>
        ) : null}

        {pipeline ? (
          <PipelineBoard pipeline={pipeline} communities={dashboard?.communities ?? []} />
        ) : (
          <section
            aria-labelledby="admissions-board-title"
            data-admissions-referral-pipeline={referralPipeline?.status ?? "loading"}
            className="border-y-2 border-[#111111] py-6"
          >
            <h2 id="admissions-board-title" className="text-[22px] font-semibold tracking-[-0.03em]">Pipeline now</h2>
            <p className="mt-2 text-[12px] leading-5 text-[#595959]">
              {referralPipeline?.status === "unavailable"
                ? "The live referral board is temporarily unavailable. Census below is current."
                : referralPipeline
                  ? "The live referral board appears here once the Pipeline summary feed is connected."
                  : "Loading the referral board…"}
            </p>
          </section>
        )}

        <section aria-labelledby="admissions-census-title" className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[#111111] pb-3">
            <h2 id="admissions-census-title" className="text-[22px] font-semibold tracking-[-0.03em]">Census</h2>
            {loadFailed && dashboard ? (
              <p className="flex items-center gap-2 text-[10px] text-[#8a6118]">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Showing the last available Alamo snapshot.
              </p>
            ) : null}
          </div>
          <div aria-label="Census headline" className="grid border-b border-[#d9d9d9] sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Current census"
              value={formatNumber(portfolio?.census ?? null)}
              detail={portfolio?.occupancyPct != null
                ? `${portfolio.occupancyPct}% of ${formatNumber(portfolio.operatingLimit)} operating beds · ${formatDelta(portfolio.censusChange)} vs prior`
                : "Occupancy unavailable"}
            />
            <Metric
              label={`Admissions · ${monthLabel}`}
              value={formatNumber(portfolio?.monthToDate.admissions ?? null)}
              detail={portfolio ? `${formatNumber(portfolio.lastMonth.admissions)} in all of ${priorMonthLabel}` : "Not loaded"}
            />
            <Metric
              label={`Discharges · ${monthLabel}`}
              value={formatNumber(portfolio?.monthToDate.discharges ?? null)}
              detail={portfolio ? `${formatNumber(portfolio.lastMonth.discharges)} in all of ${priorMonthLabel}` : "Not loaded"}
            />
            <Metric
              label={`Net movement · ${monthLabel}`}
              value={formatDelta(portfolio?.monthToDate.net ?? null)}
              detail={portfolio ? `${formatDelta(portfolio.recentWeeks.net)} over the last 4 weeks` : "Not loaded"}
            />
          </div>

          <div className="mt-8" aria-labelledby="admissions-community-census-title">
            <div className="flex items-end justify-between gap-4 border-b border-[#111111] pb-3">
              <h3 id="admissions-community-census-title" className="text-[16px] font-semibold tracking-[-0.02em]">
                Community census
              </h3>
              <p className="text-right text-[10px] leading-4 text-[#737373]">
                {monthLabel} to date{pipeline ? " · board counts from Pipeline" : ""}
              </p>
            </div>

            {loading && !dashboard ? (
              <div aria-label="Loading Admissions census" aria-busy="true" className="space-y-px bg-[#d9d9d9]">
                {Array.from({ length: 5 }, (_, index) => (
                  <div key={index} className="h-16 animate-pulse bg-[#f7f8f7]" />
                ))}
              </div>
            ) : (
              <>
                <div className="divide-y divide-[#d9d9d9] sm:hidden">
                  {(dashboard?.communities ?? []).map((community) => (
                    <article
                      key={community.facilityId}
                      data-admissions-community-census-card={community.facilityId}
                      className="py-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h4 className="text-[13px] font-bold leading-5">{community.shortName}</h4>
                          <p className="mt-1 text-[10px] text-[#737373]">
                            {community.occupancyPct != null ? `${community.occupancyPct}% occupied` : "Occupancy unavailable"}
                          </p>
                        </div>
                        <p className="shrink-0 text-[26px] font-semibold leading-none">{formatNumber(community.census)}</p>
                      </div>
                      <div className="mt-4 grid grid-cols-3 border-t border-[#e5e5e5] pt-3 text-[10px]">
                        <span><span className="text-[#737373]">In </span><strong>{community.monthToDate.admissions}</strong></span>
                        <span><span className="text-[#737373]">Out </span><strong>{community.monthToDate.discharges}</strong></span>
                        <span className="text-right font-semibold text-[#315b54]">{formatDelta(community.monthToDate.net)}</span>
                      </div>
                      {community.referrals ? (
                        <p className="mt-2 text-[10px] text-[#595959]">
                          {community.referrals.onBoard} on the board · {community.referrals.inDecision} at decision
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[680px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[#d9d9d9] text-[9px] font-bold uppercase tracking-[0.12em] text-[#737373]">
                        <th className="px-3 py-3">Community</th>
                        <th className="px-3 py-3 text-right">Census</th>
                        <th className="px-3 py-3 text-right">Occupancy</th>
                        <th className="px-3 py-3 text-right">Admissions</th>
                        <th className="px-3 py-3 text-right">Discharges</th>
                        <th className="px-3 py-3 text-right">Net</th>
                        {pipeline ? (
                          <>
                            <th className="px-3 py-3 text-right">On board</th>
                            <th className="px-3 py-3 text-right">At decision</th>
                          </>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {(dashboard?.communities ?? []).map((community) => (
                        <tr key={community.facilityId} className="border-b border-[#e5e5e5] text-[12px]">
                          <td className="px-3 py-3.5 font-bold text-[#111111]">{community.communityName}</td>
                          <td className="px-3 py-3.5 text-right text-[16px] font-semibold">{formatNumber(community.census)}</td>
                          <td className="px-3 py-3.5 text-right text-[#595959]">
                            {community.occupancyPct != null ? `${community.occupancyPct}%` : "—"}
                          </td>
                          <td className="px-3 py-3.5 text-right">{community.monthToDate.admissions}</td>
                          <td className="px-3 py-3.5 text-right">{community.monthToDate.discharges}</td>
                          <td className="px-3 py-3.5 text-right font-semibold text-[#315b54]">{formatDelta(community.monthToDate.net)}</td>
                          {pipeline ? (
                            <>
                              <td className="px-3 py-3.5 text-right">{community.referrals?.onBoard ?? 0}</td>
                              <td className="px-3 py-3.5 text-right">{community.referrals?.inDecision ?? 0}</td>
                            </>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>

        <section aria-labelledby="admissions-history-title" className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[#111111] pb-3">
            <h2 id="admissions-history-title" className="text-[22px] font-semibold tracking-[-0.03em]">History</h2>
            {pipeline?.history.decisionTiming.medianDaysToDecision != null ? (
              <p className="text-[11px] text-[#595959]">
                Median <strong className="text-[#111111]">{pipeline.history.decisionTiming.medianDaysToDecision} days</strong> from
                referral to decision · last {pipeline.history.decisionTiming.windowDays} days
              </p>
            ) : null}
          </div>
          <div className="mt-6 grid gap-10 xl:grid-cols-2">
            {dashboard?.referral_trend.length ? <ReferralTrendChart points={dashboard.referral_trend} /> : null}
            <WeeklyFlowChart points={dashboard?.weekly ?? []} loading={loading && !dashboard} />
          </div>
        </section>
      </div>
    </div>
  );
}

function ReferralTrendChart({ points }: { points: AdmissionsDashboardResponse["referral_trend"] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...points.flatMap((point) => [point.received, point.accepted, point.censusAdmissions]));
  const focused = active != null ? points[active] : points.at(-1) ?? null;

  return (
    <section aria-labelledby="admissions-referral-trend-title" data-admissions-referral-trend="true">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#111111] pb-3">
        <h2 id="admissions-referral-trend-title" className="text-[20px] font-semibold tracking-[-0.03em]">
          Referrals to move-ins
        </h2>
        <div className="flex flex-wrap items-center gap-4 text-[10px] text-[#595959]">
          <LegendSwatch color={REFERRALS_COLOR} label="Referrals received" />
          <LegendSwatch color={ACCEPTED_COLOR} label="Accepted" />
          <LegendSwatch color={ADMISSIONS_COLOR} label="Census admissions" />
        </div>
      </div>
      <p className="mt-3 min-h-5 text-[11px] text-[#595959]" aria-live="polite">
        {focused ? (
          <>
            {formatMonth(focused.month)}: <strong className="text-[#111111]">{focused.received}</strong> referrals,{" "}
            <strong className="text-[#111111]">{focused.accepted}</strong> accepted,{" "}
            <strong className="text-[#111111]">{focused.censusAdmissions}</strong> admitted to census
          </>
        ) : null}
      </p>
      <div className="mt-2 flex h-44 items-end gap-2 border-b border-[#d9d9d9] sm:gap-4" onMouseLeave={() => setActive(null)}>
        {points.map((point, index) => (
          <button
            key={point.month}
            type="button"
            aria-label={`${formatMonth(point.month)}: ${point.received} referrals, ${point.accepted} accepted, ${point.censusAdmissions} census admissions`}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            className={`flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-t-sm pt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f8b73] ${active === index ? "bg-[#f1f4f2]" : ""}`}
          >
            <Bar value={point.received} max={max} color={REFERRALS_COLOR} />
            <Bar value={point.accepted} max={max} color={ACCEPTED_COLOR} />
            <Bar value={point.censusAdmissions} max={max} color={ADMISSIONS_COLOR} />
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2 text-[9px] text-[#737373] sm:gap-4">
        {points.map((point) => (
          <span key={point.month} className="min-w-0 flex-1 truncate text-center">{formatMonth(point.month).slice(0, 3)}</span>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-[#737373]">
        Referrals and acceptances come from Pipeline; admissions come from the census record, so a month can admit clients accepted earlier.
      </p>
    </section>
  );
}

function WeeklyFlowChart({ points, loading }: { points: AdmissionsFlowPoint[]; loading: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...points.flatMap((point) => [point.admissions, point.discharges]));
  const focused = active != null ? points[active] : points.at(-1) ?? null;

  return (
    <section aria-labelledby="admissions-weekly-title" data-admissions-weekly-chart="true">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#111111] pb-3">
        <h2 id="admissions-weekly-title" className="text-[20px] font-semibold tracking-[-0.03em]">
          Weekly admissions and discharges
        </h2>
        <div className="flex items-center gap-4 text-[10px] text-[#595959]">
          <LegendSwatch color={ADMISSIONS_COLOR} label="Admissions" />
          <LegendSwatch color={DISCHARGES_COLOR} label="Discharges" />
        </div>
      </div>

      {loading ? (
        <div aria-busy="true" className="mt-4 h-48 animate-pulse bg-[#f7f8f7]" />
      ) : points.length ? (
        <>
          <p className="mt-3 min-h-5 text-[11px] text-[#595959]" aria-live="polite">
            {focused ? (
              <>
                Week of {formatDate(focused.period)}{focused.partial ? " (in progress)" : ""}:{" "}
                <strong className="text-[#111111]">{focused.admissions}</strong> admitted,{" "}
                <strong className="text-[#111111]">{focused.discharges}</strong> discharged, net{" "}
                <strong className="text-[#111111]">{formatDelta(focused.net)}</strong>
              </>
            ) : null}
          </p>
          <div
            className="mt-2 flex h-44 items-end gap-1 border-b border-[#d9d9d9] sm:gap-2"
            onMouseLeave={() => setActive(null)}
          >
            {points.map((point, index) => (
              <button
                key={point.period}
                type="button"
                aria-label={`Week of ${formatDate(point.period)}: ${point.admissions} admissions, ${point.discharges} discharges`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className={`flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-t-sm pt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f8b73] ${active === index ? "bg-[#f1f4f2]" : ""}`}
              >
                <Bar value={point.admissions} max={max} color={ADMISSIONS_COLOR} partial={point.partial === true} />
                <Bar value={point.discharges} max={max} color={DISCHARGES_COLOR} partial={point.partial === true} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1 text-[9px] text-[#737373] sm:gap-2">
            {points.map((point, index) => (
              <span key={point.period} className="min-w-0 flex-1 truncate text-center">
                {index % 2 === points.length % 2 ? "" : formatShortDate(point.period)}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-[#737373]">Weeks start Monday. The latest week is still in progress and shown lighter.</p>
        </>
      ) : (
        <p className="py-8 text-[12px] text-[#737373]">Weekly resident flow is not available in the current snapshot.</p>
      )}
    </section>
  );
}

function Bar({ value, max, color, partial }: { value: number; max: number; color: string; partial?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="block w-full max-w-3 rounded-t-[4px]"
      style={{
        height: `${Math.max(value ? 3 : 0, (value / max) * 100)}%`,
        backgroundColor: color,
        opacity: partial ? 0.45 : 1
      }}
    />
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
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

function formatNumber(value: number | null) {
  return value == null || !Number.isFinite(value) ? "Not loaded" : value.toLocaleString("en-US");
}

function formatDelta(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Not loaded";
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-US")}`;
}

function formatMonth(value: string) {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatShortDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric" }).format(date);
}

