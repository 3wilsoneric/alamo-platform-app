import { useMsal } from "@azure/msal-react";
import { ArrowRight, CalendarCheck2, ClipboardList, Pill, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMonthLabel } from "../../../../shared/period-utils.mjs";
import { isE2EAuthBypassEnabled } from "../../../app/auth/authConfig";
import { getAccountExecutiveDirectorAccess } from "../../../shared/auth/executiveDirectorAccess";
import { CensusTrendModule } from "../../../shared/modules/CensusTrendModule";
import type { AdmissionsBoardCard } from "../../../shared/types/platformSnapshot";
import { ProgressModal } from "../../admissions/components/PipelineBoard";
import { ExecutiveCommunityDetailModal, type ExecutiveCommunityDetailView } from "../components/ExecutiveCommunityDetailModal";
import { formatExecutiveDate, formatExecutiveNumber } from "../components/executiveDashboardFormatters";
import {
  fetchExecutiveDirectorCommunityDashboard,
  type ExecutiveDirectorCommunityDashboardResponse
} from "../data/executiveDirectorApi";

const DEFAULT_PREVIEW_FACILITY_ID = "337";

export default function ExecutiveDirectorDashboardPage() {
  const { accounts, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  const access = getAccountExecutiveDirectorAccess(account, isE2EAuthBypassEnabled);
  const facilityId = access.primaryFacilityId ?? DEFAULT_PREVIEW_FACILITY_ID;
  const [response, setResponse] = useState<ExecutiveDirectorCommunityDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<ExecutiveCommunityDetailView | null>(null);
  const [selectedCard, setSelectedCard] = useState<AdmissionsBoardCard | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    fetchExecutiveDirectorCommunityDashboard(facilityId, controller.signal)
      .then(setResponse)
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "The community dashboard is unavailable.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [facilityId]);

  const facility = response?.facility;
  const dashboard = response?.dashboard;
  const admissions = dashboard?.admissions;
  const generatedAt = [dashboard?.generatedAt, admissions?.generatedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  function openAdmissionCard(card: AdmissionsBoardCard) {
    setDetailView(null);
    setSelectedCard(card);
  }

  return (
    <section data-executive-community-dashboard="true" className="mx-auto w-full max-w-[1480px] px-4 pb-16 pt-4 font-sans sm:px-6 sm:pt-5 lg:px-8">
      <header className="flex min-h-12 flex-col justify-center gap-1 border-b border-[#cfd6d2] pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate !font-sans text-[27px] font-semibold tracking-[-0.045em] text-[#111111] sm:text-[31px]">
            {facility?.shortName ?? "Community"}
          </h1>
          {facility?.state ? <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0f8b73]">{facility.state}</span> : null}
        </div>
        <p className="text-[11px] leading-5 text-[#68716d] sm:text-right sm:text-[12px]">
          {dashboard?.reportingMonth ? formatMonthLabel(dashboard.reportingMonth, { month: "long" }) : "Latest period"}
          {generatedAt ? ` · Updated ${formatExecutiveDate(generatedAt, true)}` : ""}
        </p>
      </header>

      {error ? <div role="alert" className="mt-6 border-l-4 border-[#b24c3d] bg-[#fff7f5] px-4 py-3 text-[14px] text-[#7f3328]">{error}</div> : null}
      {loading && !response ? <DashboardLoading /> : null}
      {!loading && dashboard?.status === "unavailable" ? (
        <div role="status" className="mt-8 border-y border-[#cfd6d2] bg-white px-1 py-8 text-[15px] text-[#5b6560]">
          Current community measures are temporarily unavailable. Admissions activity will remain visible when its feed is connected.
        </div>
      ) : null}

      {dashboard ? <CommunityOverview dashboard={dashboard} onOpenDetail={setDetailView} onOpenCard={openAdmissionCard} /> : null}

      {dashboard && facility && detailView ? (
        <ExecutiveCommunityDetailModal
          facility={facility}
          dashboard={dashboard}
          view={detailView}
          onViewChange={setDetailView}
          onClose={() => setDetailView(null)}
          onOpenAdmissionCard={openAdmissionCard}
        />
      ) : null}

      {selectedCard && admissions?.status === "connected" ? (
        <ProgressModal card={selectedCard} generatedAt={admissions.generatedAt ?? generatedAt ?? new Date().toISOString()} onClose={() => setSelectedCard(null)} />
      ) : null}
    </section>
  );
}

function DashboardLoading() {
  return (
    <div role="status" className="mt-8 space-y-4">
      <span className="block h-44 animate-pulse border-y border-[#dfe4e1] bg-white" />
      <span className="block h-72 animate-pulse border-y border-[#dfe4e1] bg-white" />
      <span className="sr-only">Loading community dashboard…</span>
    </div>
  );
}

function CommunityOverview({
  dashboard,
  onOpenDetail,
  onOpenCard
}: {
  dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"];
  onOpenDetail: (view: ExecutiveCommunityDetailView) => void;
  onOpenCard: (card: AdmissionsBoardCard) => void;
}) {
  const community = dashboard.admissions.community;
  const censusPoints = dashboard.census.slice(-12).map((point) => ({
    id: point.month,
    label: formatMonthLabel(point.month, { fallback: point.month, month: "short" }),
    value: point.census
  }));
  const incidentDelta = dashboard.summary?.currentIncidents != null && dashboard.summary?.priorIncidents != null
    ? dashboard.summary.currentIncidents - dashboard.summary.priorIncidents
    : null;
  const latestCensus = dashboard.census.at(-1);
  const priorCensus = dashboard.census.at(-2);
  const censusDelta = latestCensus && priorCensus ? latestCensus.census - priorCensus.census : null;
  const firstAssessment = dashboard.admissions.upcomingAssessments[0];
  const firstMoveIn = dashboard.admissions.plannedMoveIns[0];
  const recentCards = dashboard.admissions.cards.slice(0, 4);
  const incidentChange = incidentDelta == null
    ? "Prior comparison unavailable"
    : incidentDelta === 0
      ? "No change from prior month"
      : `${formatExecutiveNumber(Math.abs(incidentDelta))} ${incidentDelta > 0 ? "more" : "fewer"} than prior month`;
  const censusChange = censusDelta == null
    ? "Prior comparison unavailable"
    : censusDelta === 0
      ? "No change from prior month"
      : `${censusDelta > 0 ? "+" : "−"}${formatExecutiveNumber(Math.abs(censusDelta))} from prior month`;

  return (
    <div data-daily-operating-summary="true" className="pt-4">
      <section aria-label="Current community snapshot" className="grid grid-cols-2 overflow-hidden rounded-[20px] border border-[#cdd5d1] bg-white xl:grid-cols-4">
        <SnapshotButton
          label="Census"
          value={formatExecutiveNumber(dashboard.summary?.residents ?? community?.census)}
          detail={community?.occupancyPct != null && community.operatingLimit != null ? `${formatExecutiveNumber(community.occupancyPct, "%")} occupied · ${formatExecutiveNumber(community.operatingLimit)} capacity` : censusChange}
          tone="sand"
          onClick={() => onOpenDetail("census")}
        />
        <SnapshotButton
          label="Active referrals"
          value={dashboard.admissions.status === "connected" ? formatExecutiveNumber(community?.activeReferrals) : "—"}
          detail={dashboard.admissions.status === "connected" ? `${formatExecutiveNumber(community?.assessmentsThisWeek)} assessments · ${formatExecutiveNumber(community?.plannedMoveInsThisWeek)} move-ins this week` : "Admissions feed unavailable"}
          tone="blue"
          onClick={() => onOpenDetail("admissions")}
        />
        <SnapshotButton
          label="Incidents"
          value={formatExecutiveNumber(dashboard.summary?.currentIncidents)}
          detail={incidentChange}
          tone="peach"
          onClick={() => onOpenDetail("incidents")}
        />
        <SnapshotButton
          label="Med pass"
          value={formatExecutiveNumber(dashboard.medication?.compliancePct, "%")}
          detail={dashboard.medication ? `${formatExecutiveNumber(dashboard.medication.given)} of ${formatExecutiveNumber(dashboard.medication.scheduled)} given` : "Latest period unavailable"}
          tone="green"
          onClick={() => onOpenDetail("medications")}
        />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <article className="overflow-hidden rounded-[22px] border border-[#c8d8d1] border-t-[4px] border-t-[#2c8269] bg-[#fbfdfc] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-5 border-b border-[#e0e4e2] pb-3">
            <h2 className="flex items-center gap-2.5 !font-sans text-[15px] font-semibold text-[#17201c]"><span className="grid h-8 w-8 place-items-center rounded-lg border border-[#c6ddd4] bg-[#eef7f3]"><UsersRound className="h-4 w-4 text-[#28745d]" aria-hidden="true" /></span>12-month census</h2>
            <DetailLink onClick={() => onOpenDetail("census")}>History</DetailLink>
          </div>
          <div className="mt-3"><CensusTrendModule points={censusPoints} height={220} emptyLabel="Census history is not available for this community." /></div>
          <dl className="mt-3 grid border-t border-[#e0e4e2] sm:grid-cols-2">
            <CompactFact label="Average age" value={dashboard.summary?.averageAge == null ? "—" : `${formatExecutiveNumber(Math.round(dashboard.summary.averageAge * 10) / 10)} years`} />
            <CompactFact label="Average stay" value={dashboard.summary?.averageLengthOfStay == null ? "—" : `${formatExecutiveNumber(Math.round(dashboard.summary.averageLengthOfStay))} days`} />
          </dl>
        </article>

        <article className="overflow-hidden rounded-[22px] border border-[#cbd5ec] border-t-[4px] border-t-[#5877bf] bg-[#f5f7fd] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4 border-b border-[#d7ddda] pb-3">
            <h2 className="flex items-center gap-2.5 !font-sans text-[15px] font-semibold text-[#17201c]"><span className="grid h-8 w-8 place-items-center rounded-lg border border-[#ccd6ef] bg-white"><CalendarCheck2 className="h-4 w-4 text-[#4667b5]" aria-hidden="true" /></span>Admissions</h2>
            <DetailLink onClick={() => onOpenDetail("admissions")}>All activity</DetailLink>
          </div>
          {dashboard.admissions.status === "connected" ? (
            <>
              <div className="grid border-b border-[#d7ddda] sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <CompactEvent label="Next assessment" name={firstAssessment?.clientName ?? "None scheduled"} date={firstAssessment?.scheduledAt ?? null} detail={firstAssessment?.status ?? "This week"} />
                <CompactEvent label="Next move-in" name={firstMoveIn?.clientName ?? "None scheduled"} date={firstMoveIn?.plannedAt ?? null} detail={firstMoveIn ? `${firstMoveIn.status}${firstMoveIn.readiness === "ready" ? "" : ` · ${firstMoveIn.readiness}`}` : "This week"} />
              </div>
              {recentCards.length ? (
                <ol className="divide-y divide-[#d7ddda]">
                  {recentCards.map((card) => (
                    <li key={card.referralId}>
                      <button type="button" onClick={() => onOpenCard(card)} className="group flex min-h-12 w-full items-center justify-between gap-3 px-1 py-2.5 text-left transition-colors hover:bg-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f8b73]">
                        <span className="min-w-0"><strong className="block truncate text-[13px] text-[#17201c]">{card.clientName}</strong><span className="mt-1 flex min-w-0 items-center gap-2"><ReferralStatusPill status={card.status} /><span className="truncate text-[10px] text-[#68716d]">{formatExecutiveNumber(card.daysOpen)}d open</span></span></span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-[#0f8b73] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : <CompactEmpty>No active referral charts.</CompactEmpty>}
            </>
          ) : <CompactEmpty>Admissions feed unavailable.</CompactEmpty>}
        </article>
      </div>

      <section className="mt-5 grid gap-5 lg:grid-cols-2" aria-label="Operational detail">
        <article className="overflow-hidden rounded-[22px] border border-[#ead2c1] border-t-[4px] border-t-[#bd7040] bg-[#fff8f3] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-5">
            <div>
              <h2 className="flex items-center gap-2.5 !font-sans text-[15px] font-semibold text-[#17201c]"><span className="grid h-8 w-8 place-items-center rounded-lg border border-[#efd7c6] bg-white"><ClipboardList className="h-4 w-4 text-[#ad6437]" aria-hidden="true" /></span>Incident categories</h2>
              <p className="mt-0.5 text-[11px] text-[#68716d]">{dashboard.reportingMonth ? `${formatMonthLabel(dashboard.reportingMonth, { month: "long" })} · ` : ""}{incidentChange}</p>
            </div>
            <DetailLink onClick={() => onOpenDetail("incidents")}>Trend</DetailLink>
          </div>
          {dashboard.topIncidentCategories.length ? (
            <ol className="mt-4 grid border-t border-[#d7ddda] sm:grid-cols-2">
              {dashboard.topIncidentCategories.slice(0, 4).map((item, index) => (
                <li key={item.label} className={`flex items-center justify-between gap-4 border-b border-[#d7ddda] py-2.5 text-[12px] sm:px-3 ${index % 2 === 0 ? "sm:border-r sm:pl-0" : "sm:pr-0"}`}>
                  <span className="truncate text-[#4f5954]">{item.label}</span><strong className="tabular-nums text-[#17201c]">{formatExecutiveNumber(item.count)}</strong>
                </li>
              ))}
            </ol>
          ) : <CompactEmpty>No category totals available.</CompactEmpty>}
        </article>

        <article className="overflow-hidden rounded-[22px] border border-[#c5ddd3] border-t-[4px] border-t-[#2e8065] bg-[#f3faf7] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-5">
            <div>
              <h2 className="flex items-center gap-2.5 !font-sans text-[15px] font-semibold text-[#17201c]"><span className="grid h-8 w-8 place-items-center rounded-lg border border-[#c8dfd5] bg-white"><Pill className="h-4 w-4 text-[#28745d]" aria-hidden="true" /></span>Medication totals</h2>
              <p className="mt-0.5 text-[11px] text-[#68716d]">Latest governed period</p>
            </div>
            <DetailLink onClick={() => onOpenDetail("medications")}>Detail</DetailLink>
          </div>
          {dashboard.medication ? (
            <>
              <div className="mt-4 h-2 overflow-hidden bg-[#e2e8e5]" aria-label={`Medication compliance ${formatExecutiveNumber(dashboard.medication.compliancePct, "%")}`}>
                <span className="block h-full bg-[#0f8b73]" style={{ width: `${Math.min(Math.max(dashboard.medication.compliancePct ?? 0, 0), 100)}%` }} />
              </div>
              <dl className="mt-4 grid grid-cols-3 border-t border-[#d7ddda]">
                <CompactFact label="Scheduled" value={formatExecutiveNumber(dashboard.medication.scheduled)} />
                <CompactFact label="Given" value={formatExecutiveNumber(dashboard.medication.given)} />
                <CompactFact label="Not given" value={formatExecutiveNumber(dashboard.medication.notGiven)} />
              </dl>
            </>
          ) : <CompactEmpty>Medication totals unavailable.</CompactEmpty>}
        </article>
      </section>
    </div>
  );
}

const SNAPSHOT_TONE = {
  sand: "bg-[#fbf7ef] hover:bg-[#f6efe3]",
  blue: "bg-[#f1f4fc] hover:bg-[#e9eefb]",
  peach: "bg-[#fff4ec] hover:bg-[#fbeade]",
  green: "bg-[#edf7f2] hover:bg-[#e4f2ec]"
} as const;

function SnapshotButton({ label, value, detail, tone, onClick }: { label: string; value: string; detail: string; tone: keyof typeof SNAPSHOT_TONE; onClick: () => void }) {
  return (
    <button type="button" data-executive-dashboard-tone={tone} onClick={onClick} className={`group flex min-h-[102px] items-center justify-between gap-3 border-b border-[#d4dad7] px-3 py-3 text-left transition-colors odd:border-r focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f8b73] [&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:px-5 xl:last:border-r-0 ${SNAPSHOT_TONE[tone]}`}>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold text-[#4f5a55]">{label}</span>
        <strong className="mt-0.5 block text-[26px] leading-none tabular-nums tracking-[-0.045em] text-[#173f36] sm:text-[30px]">{value}</strong>
        <span className="mt-1.5 block min-h-8 text-[10px] leading-4 text-[#68716d] sm:text-[11px]">{detail}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[#0f8b73] transition-transform group-hover:translate-x-1" aria-hidden="true" />
    </button>
  );
}

function ReferralStatusPill({ status }: { status: string }) {
  const normalized = status.trim().toLowerCase();
  const tone = normalized.includes("accept") || normalized.includes("awaiting admit")
    ? "border-[#a9d2c0] bg-[#e3f3eb] text-[#1e684e]"
    : normalized.includes("declin") || normalized.includes("deni")
      ? "border-[#e2aaa4] bg-[#fae5e2] text-[#963c34]"
      : normalized === "under review"
        ? "border-[#dfc36f] bg-[#fff0bb] text-[#76580b]"
        : "border-[#bccaf0] bg-[#e8edfc] text-[#365ba9]";
  return <span data-executive-referral-status="true" className={`inline-flex max-w-full truncate rounded-md border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.05em] ${tone}`}>{status}</span>;
}

function DetailLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex min-h-8 shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[#08745d] transition-colors hover:text-[#054b3c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]">{children}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>;
}

function CompactFact({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-[#e0e4e2] px-2 py-2.5 first:pl-0 last:pr-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><dt className="text-[10px] text-[#68716d]">{label}</dt><dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#17201c]">{value}</dd></div>;
}

function CompactEvent({ label, name, date, detail }: { label: string; name: string; date: string | null; detail: string }) {
  return <div className="min-w-0 border-b border-[#d7ddda] px-1 py-3 sm:border-b-0 sm:border-r sm:px-3 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0 xl:border-b xl:border-r-0 xl:px-1 xl:first:pl-1 2xl:border-b-0 2xl:border-r 2xl:px-3 2xl:first:pl-0 2xl:last:border-r-0 2xl:last:pr-0"><p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#68716d]">{label}</p><strong className="mt-1 block truncate text-[13px] text-[#17201c]">{name}</strong><p className="mt-0.5 truncate text-[11px] text-[#68716d]">{date ? `${formatExecutiveDate(date, true)} · ` : ""}{detail}</p></div>;
}

function CompactEmpty({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 border-t border-[#d7ddda] py-4 text-[12px] text-[#68716d]">{children}</p>;
}
