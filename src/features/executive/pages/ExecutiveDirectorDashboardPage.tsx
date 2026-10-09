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
import { ExecutiveReferralStatusPill } from "../components/ExecutiveReferralStatusPill";
import { formatImpendingAdmissionDate, impendingAdmissionCards } from "../components/executiveAdmissions";
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
  const censusPoints = dashboard.census.slice(-12).map((point) => ({
    id: point.month,
    label: formatMonthLabel(point.month, { fallback: point.month, month: "short" }),
    value: point.census
  }));
  const incidentDelta = dashboard.summary?.currentIncidents != null && dashboard.summary?.priorIncidents != null
    ? dashboard.summary.currentIncidents - dashboard.summary.priorIncidents
    : null;
  const impendingCards = impendingAdmissionCards(dashboard.admissions.cards);
  const incidentChange = incidentDelta == null
    ? "Prior comparison unavailable"
    : incidentDelta === 0
      ? "No change from prior month"
      : `${formatExecutiveNumber(Math.abs(incidentDelta))} ${incidentDelta > 0 ? "more" : "fewer"} than prior month`;
  return (
    <div data-daily-operating-summary="true" className="pt-4">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <article data-executive-dashboard-panel="census" className="overflow-hidden rounded-[22px] border border-[#b8cac1] border-t-[4px] border-t-[#2d735c] bg-[#e6ece8] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-5 border-b border-[#e0e4e2] pb-3">
            <h2 className="flex items-center gap-2.5 !font-sans text-[15px] font-semibold text-[#17201c]"><span className="grid h-8 w-8 place-items-center rounded-lg border border-[#b8cac1] bg-[#dce8e2]"><UsersRound className="h-4 w-4 text-[#245f4d]" aria-hidden="true" /></span>12-month census</h2>
            <DetailLink onClick={() => onOpenDetail("census")}>History</DetailLink>
          </div>
          <div className="mt-3"><CensusTrendModule points={censusPoints} height={220} emptyLabel="Census history is not available for this community." /></div>
        </article>

        <article data-executive-dashboard-panel="admissions" data-executive-impending-summary="true" className="overflow-hidden rounded-[22px] border border-[#b8cac1] border-t-[4px] border-t-[#2d735c] bg-[#e6ece8] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4 border-b border-[#d7ddda] pb-3">
            <h2 className="flex items-center gap-2.5 !font-sans text-[15px] font-semibold text-[#17201c]"><span className="grid h-8 w-8 place-items-center rounded-lg border border-[#b8cac1] bg-[#dce8e2]"><CalendarCheck2 className="h-4 w-4 text-[#245f4d]" aria-hidden="true" /></span>Impending admits <span className="text-[11px] font-normal text-[#65716b]">{formatExecutiveNumber(impendingCards.length)} clients</span></h2>
            <DetailLink onClick={() => onOpenDetail("admissions")}>Meet the clients</DetailLink>
          </div>
          {dashboard.admissions.status === "connected" ? (
            <>
              {impendingCards.length ? (
                <ol className="divide-y divide-[#d7ddda] border-t border-[#d7ddda]">
                  {impendingCards.slice(0, 4).map((card) => (
                    <li key={card.referralId}>
                      <button type="button" onClick={() => onOpenCard(card)} className="group flex min-h-12 w-full items-center justify-between gap-3 px-1 py-2.5 text-left transition-colors hover:bg-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f8b73]">
                        <span className="min-w-0"><strong className="block truncate text-[13px] text-[#17201c]">{card.clientName}</strong><span className="mt-1 flex min-w-0 items-center gap-2"><ExecutiveReferralStatusPill status={card.status} /><span className="truncate text-[10px] text-[#68716d]">{card.plannedAdmissionDate ? formatImpendingAdmissionDate(card.plannedAdmissionDate, false) : "Date pending"}</span></span></span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-[#0f8b73] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : <CompactEmpty>No clients are currently moving toward admission.</CompactEmpty>}
            </>
          ) : <CompactEmpty>Admissions feed unavailable.</CompactEmpty>}
        </article>
      </div>

      <section className="mt-5 grid gap-5 lg:grid-cols-2" aria-label="Operational detail">
        <article data-executive-dashboard-panel="incidents" className="overflow-hidden rounded-[22px] border border-[#b8cac1] border-t-[4px] border-t-[#2d735c] bg-[#e6ece8] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-5">
            <div>
              <h2 className="flex items-center gap-2.5 !font-sans text-[15px] font-semibold text-[#17201c]"><span className="grid h-8 w-8 place-items-center rounded-lg border border-[#b8cac1] bg-[#dce8e2]"><ClipboardList className="h-4 w-4 text-[#245f4d]" aria-hidden="true" /></span>Incident categories</h2>
              <p className="mt-0.5 text-[11px] text-[#68716d]">The latest month recorded {formatExecutiveNumber(dashboard.summary?.currentIncidents)} incidents. {incidentChange}.</p>
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

        <article data-executive-dashboard-panel="medications" className="overflow-hidden rounded-[22px] border border-[#b8cac1] border-t-[4px] border-t-[#2d735c] bg-[#e6ece8] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-5">
            <div>
              <h2 className="flex items-center gap-2.5 !font-sans text-[15px] font-semibold text-[#17201c]"><span className="grid h-8 w-8 place-items-center rounded-lg border border-[#b8cac1] bg-[#dce8e2]"><Pill className="h-4 w-4 text-[#245f4d]" aria-hidden="true" /></span>Medication totals</h2>
              <p className="mt-0.5 text-[11px] text-[#68716d]">{formatExecutiveNumber(dashboard.medication?.compliancePct, "%")} compliance · latest governed period</p>
            </div>
            <DetailLink onClick={() => onOpenDetail("medications")}>Detail</DetailLink>
          </div>
          {dashboard.medication ? (
            <>
              <div className="mt-4 h-2 overflow-hidden bg-[#e2e8e5]" aria-label={`Medication compliance ${formatExecutiveNumber(dashboard.medication.compliancePct, "%")}`}>
                <span className="block h-full bg-[#0f8b73]" style={{ width: `${Math.min(Math.max(dashboard.medication.compliancePct ?? 0, 0), 100)}%` }} />
              </div>
              <p className="mt-4 text-[12px] leading-5 text-[#4f5954]">{formatExecutiveNumber(dashboard.medication.given)} of {formatExecutiveNumber(dashboard.medication.scheduled)} scheduled administrations were given; {formatExecutiveNumber(dashboard.medication.notGiven)} were not.</p>
            </>
          ) : <CompactEmpty>Medication totals unavailable.</CompactEmpty>}
        </article>
      </section>
    </div>
  );
}

function DetailLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex min-h-8 shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[#08745d] transition-colors hover:text-[#054b3c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]">{children}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>;
}

function CompactEmpty({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 border-t border-[#d7ddda] py-4 text-[12px] text-[#68716d]">{children}</p>;
}
