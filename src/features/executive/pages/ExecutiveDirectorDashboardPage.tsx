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
    <section data-executive-community-dashboard="true" className="mx-auto w-full max-w-[1480px] px-4 pb-16 pt-5 font-sans sm:px-6 sm:pt-6 lg:px-8">
      <header className="flex min-h-14 flex-col justify-center gap-1.5 border-b-2 border-[#222825] pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate !font-sans text-[35px] font-semibold leading-none tracking-[-0.05em] text-[#101311] sm:text-[42px]">
            {facility?.shortName ?? "Community"}
          </h1>
          {facility?.state ? <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">{facility.state}</span> : null}
        </div>
        <p className="text-[13px] font-medium leading-5 text-[#5d6661] sm:text-right sm:text-[14px]">
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
    <div data-daily-operating-summary="true" className="pt-5 sm:pt-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(380px,0.65fr)]">
        <article data-executive-dashboard-panel="census" data-executive-dashboard-theme="census" className="overflow-hidden rounded-[22px] border border-[#9fb2c5] border-t-[6px] border-t-[#315d89] bg-[#e5ebf2] p-5 shadow-[0_14px_34px_rgba(33,55,78,0.08)] sm:p-7">
          <div className="flex items-start justify-between gap-5 border-b border-[#b9c7d5] pb-4">
            <h2 className="flex items-center gap-3 !font-sans text-[18px] font-semibold text-[#172433] sm:text-[20px]"><span className="grid h-10 w-10 place-items-center rounded-xl border border-[#9fb2c5] bg-[#d4dfea]"><UsersRound className="h-5 w-5 text-[#315d89]" aria-hidden="true" /></span>12-month census</h2>
            <DetailLink tone="navy" onClick={() => onOpenDetail("census")}>History</DetailLink>
          </div>
          <div className="mt-5"><CensusTrendModule points={censusPoints} height={250} accentColor="#315d89" emptyLabel="Census history is not available for this community." /></div>
        </article>

        <article data-executive-dashboard-panel="admissions" data-executive-dashboard-theme="admissions" data-executive-impending-summary="true" className="overflow-hidden rounded-[22px] border border-[#c8ad77] border-t-[6px] border-t-[#98661e] bg-[#f1e7d6] p-5 shadow-[0_14px_34px_rgba(91,62,20,0.08)] sm:p-7">
          <div className="flex items-center justify-between gap-4 border-b border-[#d2bc8e] pb-4">
            <h2 className="flex min-w-0 items-center gap-3 !font-sans text-[18px] font-semibold text-[#332613] sm:text-[20px]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#c8ad77] bg-[#e5d2ac]"><CalendarCheck2 className="h-5 w-5 text-[#835618]" aria-hidden="true" /></span><span>Impending admits <span className="whitespace-nowrap text-[13px] font-medium text-[#705b38]">{formatExecutiveNumber(impendingCards.length)} clients</span></span></h2>
            <DetailLink tone="ochre" onClick={() => onOpenDetail("admissions")}>Meet the clients</DetailLink>
          </div>
          {dashboard.admissions.status === "connected" ? (
            <>
              {impendingCards.length ? (
                <ol className="mt-5 overflow-hidden rounded-xl border border-[#d2bc8e] bg-[#fffdf8] divide-y divide-[#ddcba7]">
                  {impendingCards.slice(0, 4).map((card) => (
                    <li key={card.referralId}>
                      <button type="button" onClick={() => onOpenCard(card)} className="group flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f9f0df] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#98661e]">
                        <span className="min-w-0"><strong className="block truncate text-[15px] text-[#241b0e]">{card.clientName}</strong><span className="mt-1.5 flex min-w-0 items-center gap-2"><ExecutiveReferralStatusPill status={card.status} /><span className="truncate text-[12px] font-medium text-[#705f43]">{card.plannedAdmissionDate ? formatImpendingAdmissionDate(card.plannedAdmissionDate, false) : "Date pending"}</span></span></span>
                        <ArrowRight className="h-5 w-5 shrink-0 text-[#98661e] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : <CompactEmpty>No clients are currently moving toward admission.</CompactEmpty>}
            </>
          ) : <CompactEmpty>Admissions feed unavailable.</CompactEmpty>}
        </article>
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-2" aria-label="Operational detail">
        <article data-executive-dashboard-panel="incidents" data-executive-dashboard-theme="incidents" className="overflow-hidden rounded-[22px] border border-[#c39f96] border-t-[6px] border-t-[#8b493e] bg-[#efe3df] p-5 shadow-[0_14px_34px_rgba(84,44,36,0.07)] sm:p-7">
          <div className="flex items-start justify-between gap-5">
            <div>
              <h2 className="flex items-center gap-3 !font-sans text-[18px] font-semibold text-[#34201c] sm:text-[20px]"><span className="grid h-10 w-10 place-items-center rounded-xl border border-[#c39f96] bg-[#e4cec8]"><ClipboardList className="h-5 w-5 text-[#824238]" aria-hidden="true" /></span>Incident categories</h2>
              <p className="mt-2 text-[13px] leading-5 text-[#6f554f] sm:text-[14px]">The latest month recorded {formatExecutiveNumber(dashboard.summary?.currentIncidents)} incidents. {incidentChange}.</p>
            </div>
            <DetailLink tone="rust" onClick={() => onOpenDetail("incidents")}>Trend</DetailLink>
          </div>
          {dashboard.topIncidentCategories.length ? (
            <ol className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {dashboard.topIncidentCategories.slice(0, 4).map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-4 rounded-xl border border-[#d2b6b0] bg-[#fffaf8] px-4 py-3.5">
                  <span className="truncate text-[13px] font-medium text-[#694b45] sm:text-[14px]">{item.label}</span><strong className="text-[18px] tabular-nums text-[#34201c]">{formatExecutiveNumber(item.count)}</strong>
                </li>
              ))}
            </ol>
          ) : <CompactEmpty>No category totals available.</CompactEmpty>}
        </article>

        <article data-executive-dashboard-panel="medications" data-executive-dashboard-theme="medications" className="overflow-hidden rounded-[22px] border border-[#aca4ba] border-t-[6px] border-t-[#665074] bg-[#ebe7ee] p-5 shadow-[0_14px_34px_rgba(58,44,66,0.07)] sm:p-7">
          <div className="flex items-start justify-between gap-5">
            <div>
              <h2 className="flex items-center gap-3 !font-sans text-[18px] font-semibold text-[#2e2733] sm:text-[20px]"><span className="grid h-10 w-10 place-items-center rounded-xl border border-[#aca4ba] bg-[#ddd6e2]"><Pill className="h-5 w-5 text-[#665074]" aria-hidden="true" /></span>Medication totals</h2>
              <p className="mt-2 text-[13px] font-medium text-[#655d6a] sm:text-[14px]">{formatExecutiveNumber(dashboard.medication?.compliancePct, "%")} compliance · latest governed period</p>
            </div>
            <DetailLink tone="plum" onClick={() => onOpenDetail("medications")}>Detail</DetailLink>
          </div>
          {dashboard.medication ? (
            <>
              <div className="mt-6 h-3 overflow-hidden rounded-full bg-[#d5cfda]" aria-label={`Medication compliance ${formatExecutiveNumber(dashboard.medication.compliancePct, "%")}`}>
                <span className="block h-full rounded-full bg-[#665074]" style={{ width: `${Math.min(Math.max(dashboard.medication.compliancePct ?? 0, 0), 100)}%` }} />
              </div>
              <p className="mt-5 rounded-xl border border-[#c8c0ce] bg-[#fdfbfe] px-4 py-4 text-[14px] leading-6 text-[#554c5a]">{formatExecutiveNumber(dashboard.medication.given)} of {formatExecutiveNumber(dashboard.medication.scheduled)} scheduled administrations were given; <strong className="font-semibold text-[#2e2733]">{formatExecutiveNumber(dashboard.medication.notGiven)} were not</strong>.</p>
            </>
          ) : <CompactEmpty>Medication totals unavailable.</CompactEmpty>}
        </article>
      </section>
    </div>
  );
}

function DetailLink({ children, onClick, tone = "emerald" }: { children: React.ReactNode; onClick: () => void; tone?: "emerald" | "navy" | "ochre" | "rust" | "plum" }) {
  const toneClass = {
    emerald: "text-[#08745d] hover:text-[#054b3c] focus-visible:outline-[#0f8b73]",
    navy: "text-[#315d89] hover:text-[#1f4264] focus-visible:outline-[#315d89]",
    ochre: "text-[#835618] hover:text-[#5f3d10] focus-visible:outline-[#98661e]",
    rust: "text-[#824238] hover:text-[#5e2f28] focus-visible:outline-[#8b493e]",
    plum: "text-[#665074] hover:text-[#46344f] focus-visible:outline-[#665074]"
  }[tone];
  return <button type="button" onClick={onClick} className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-[13px] ${toneClass}`}>{children}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>;
}

function CompactEmpty({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 border-t border-current/15 py-5 text-[14px] text-[#5e6662]">{children}</p>;
}
