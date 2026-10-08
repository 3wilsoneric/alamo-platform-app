import { useMsal } from "@azure/msal-react";
import { ArrowRight, CalendarDays } from "lucide-react";
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
    <section data-executive-community-dashboard="true" className="mx-auto w-full max-w-[1480px] px-4 pb-20 pt-6 sm:px-6 sm:pt-9 lg:px-8">
      <header className="grid gap-5 border-b-2 border-[#111111] pb-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#0f8b73]">
            {[facility?.city, facility?.state].filter(Boolean).join(", ") || "Your community"}
          </p>
          <h1 className="mt-2 text-[38px] font-semibold tracking-[-0.052em] text-[#111111] sm:text-[52px]">
            {facility?.shortName ?? "Community"}
          </h1>
          <p className="mt-3 max-w-[760px] text-[17px] leading-7 text-[#4f5854] sm:text-[19px] sm:leading-8">
            A current view of resident census, operational activity, medication administration, and the admissions work ahead.
          </p>
        </div>
        <div className="border-l-[3px] border-[#0f8b73] pl-4 text-[12px] leading-5 text-[#5d6662]">
          <strong className="block text-[13px] text-[#1b211e]">Community data</strong>
          <span>{dashboard?.reportingMonth ? `Reporting through ${formatMonthLabel(dashboard.reportingMonth, { month: "long" })}` : "Latest available reporting period"}</span>
          {generatedAt ? <span className="block">Updated {formatExecutiveDate(generatedAt, true)}</span> : null}
        </div>
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
  const firstAssessment = dashboard.admissions.upcomingAssessments[0];
  const firstMoveIn = dashboard.admissions.plannedMoveIns[0];
  const recentCards = dashboard.admissions.cards.slice(0, 4);

  return (
    <div className="pt-8">
      <section aria-labelledby="community-brief-title">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#0f8b73]">At a glance</p>
            <h2 id="community-brief-title" className="mt-1 text-[27px] font-semibold tracking-[-0.04em] text-[#171b19] sm:text-[32px]">Community briefing</h2>
          </div>
          <p className="max-w-[520px] text-[14px] leading-6 text-[#5d6662] sm:text-right">Select any area to open the underlying community detail.</p>
        </div>

        <div className="mt-5 grid border-y-2 border-[#111111] bg-white md:grid-cols-2">
          <BriefingLink
            label="Census"
            title={`${formatExecutiveNumber(dashboard.summary?.residents ?? community?.census)} residents in community`}
            detail={community?.occupancyPct != null && community.operatingLimit != null ? `${formatExecutiveNumber(community.occupancyPct, "%")} occupancy against an operating limit of ${formatExecutiveNumber(community.operatingLimit)}.` : "Open the resident trend and monthly history."}
            onClick={() => onOpenDetail("census")}
          />
          <BriefingLink
            label="Admissions"
            title={dashboard.admissions.status === "connected" ? `${formatExecutiveNumber(community?.activeReferrals)} active community referrals` : "Admissions feed unavailable"}
            detail={dashboard.admissions.status === "connected" ? `${formatExecutiveNumber(community?.assessmentsThisWeek)} assessments and ${formatExecutiveNumber(community?.plannedMoveInsThisWeek)} planned move-ins remain this week.` : "The community dashboard will update when the feed reconnects."}
            onClick={() => onOpenDetail("admissions")}
          />
          <BriefingLink
            label="Incidents"
            title={`${formatExecutiveNumber(dashboard.summary?.currentIncidents)} recorded in the latest month`}
            detail={incidentDelta == null ? "Open the monthly trend and category mix." : `${incidentDelta > 0 ? "+" : ""}${incidentDelta} compared with the prior month. Open the trend and category mix.`}
            onClick={() => onOpenDetail("incidents")}
          />
          <BriefingLink
            label="Medication administration"
            title={dashboard.medication?.compliancePct == null ? "Latest period unavailable" : `${formatExecutiveNumber(dashboard.medication.compliancePct, "%")} compliance in the latest period`}
            detail={dashboard.medication ? `${formatExecutiveNumber(dashboard.medication.given)} of ${formatExecutiveNumber(dashboard.medication.scheduled)} scheduled administrations were given.` : "Medication administration totals are not available."}
            onClick={() => onOpenDetail("medications")}
          />
        </div>
      </section>

      <section className="mt-12 grid gap-8 border-b border-[#aeb8b3] pb-12 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,0.65fr)] xl:gap-12" aria-labelledby="census-movement-title">
        <div>
          <SectionHeading eyebrow="Census" title="Resident movement" id="census-movement-title" />
          <div className="mt-5"><CensusTrendModule points={censusPoints} height={300} emptyLabel="Census history is not available for this community." /></div>
        </div>
        <div className="border-t-2 border-[#111111] xl:border-l xl:border-t-0 xl:border-[#b9c1bd] xl:pl-8">
          <div className="py-5 xl:pt-0">
            <h3 className="text-[17px] font-semibold text-[#171b19]">How to read this</h3>
            <p className="mt-2 text-[14px] leading-6 text-[#5b6560]">The chart shows the governed monthly census history for this community. Open the detail to inspect every available period.</p>
            <TextLink onClick={() => onOpenDetail("census")}>Open census detail</TextLink>
          </div>
          <dl className="border-t border-[#cbd2ce]">
            <InlineRow label="Average age" value={dashboard.summary?.averageAge == null ? "—" : `${dashboard.summary.averageAge} years`} />
            <InlineRow label="Average length of stay" value={dashboard.summary?.averageLengthOfStay == null ? "—" : `${formatExecutiveNumber(dashboard.summary.averageLengthOfStay)} days`} />
          </dl>
        </div>
      </section>

      <section className="-mx-4 border-b border-[#b9c7c1] bg-[#edf3f0] px-4 py-10 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" aria-labelledby="admissions-next-title">
        <div className="mx-auto max-w-[1416px]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading eyebrow="Admissions" title="What is next" id="admissions-next-title" />
            <TextLink onClick={() => onOpenDetail("admissions")}>Open admissions detail</TextLink>
          </div>
          {dashboard.admissions.status === "connected" ? (
            <div className="mt-6 grid border-y border-[#91a79d] bg-white lg:grid-cols-2">
              <NextEvent title="Next assessment" name={firstAssessment?.clientName ?? "No remaining assessment scheduled"} date={firstAssessment?.scheduledAt ?? null} detail={firstAssessment?.status ?? "The weekly assessment schedule is clear."} />
              <NextEvent title="Next planned move-in" name={firstMoveIn?.clientName ?? "No move-in currently scheduled"} date={firstMoveIn?.plannedAt ?? null} detail={firstMoveIn ? `${firstMoveIn.status}${firstMoveIn.readiness === "ready" ? "" : ` · ${firstMoveIn.readiness}`}` : "The weekly move-in schedule is clear."} />
            </div>
          ) : <UnavailableCopy label="The admissions feed is temporarily unavailable." />}

          {recentCards.length ? (
            <div className="mt-7">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#527067]">Current referral work</p>
              <ol className="grid border-t border-[#aebdb6] sm:grid-cols-2">
                {recentCards.map((card) => (
                  <li key={card.referralId} className="border-b border-[#aebdb6] sm:odd:border-r">
                    <button type="button" onClick={() => onOpenCard(card)} className="group flex min-h-20 w-full items-center justify-between gap-4 bg-transparent px-1 py-4 text-left transition-colors hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] sm:px-4">
                      <span><strong className="block text-[15px] text-[#17201c]">{card.clientName}</strong><span className="mt-1 block text-[12px] text-[#65706a]">{card.status}</span></span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-[#0f8b73] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-10 border-b-2 border-[#111111] py-12 lg:grid-cols-2 lg:gap-16" aria-label="Operational detail">
        <OperationalDetail eyebrow="Incidents" title="Latest category mix" onClick={() => onOpenDetail("incidents")} empty="No incident category totals are available for the latest month." items={dashboard.topIncidentCategories.slice(0, 5).map((item) => ({ label: item.label, value: formatExecutiveNumber(item.count) }))} />
        <OperationalDetail eyebrow="Medication administration" title="Latest administration period" onClick={() => onOpenDetail("medications")} empty="Medication administration totals are not available." items={dashboard.medication ? [{ label: "Scheduled", value: formatExecutiveNumber(dashboard.medication.scheduled) }, { label: "Given", value: formatExecutiveNumber(dashboard.medication.given) }, { label: "Not given", value: formatExecutiveNumber(dashboard.medication.notGiven) }] : []} />
      </section>
    </div>
  );
}

function BriefingLink({ label, title, detail, onClick }: { label: string; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group grid min-h-[150px] grid-cols-[minmax(0,1fr)_auto] gap-5 border-b border-[#bfc7c3] p-5 text-left transition-colors hover:bg-[#f5f8f6] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f8b73] md:odd:border-r md:[&:nth-last-child(-n+2)]:border-b-0 sm:p-7">
      <span><span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">{label}</span><strong className="mt-2 block text-[19px] leading-6 tracking-[-0.02em] text-[#151a17] sm:text-[22px] sm:leading-7">{title}</strong><span className="mt-2 block max-w-[560px] text-[13px] leading-5 text-[#5d6662]">{detail}</span></span>
      <ArrowRight className="mt-1 h-5 w-5 text-[#0f8b73] transition-transform group-hover:translate-x-1" aria-hidden="true" />
    </button>
  );
}

function SectionHeading({ eyebrow, title, id }: { eyebrow: string; title: string; id?: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#0f8b73]">{eyebrow}</p><h2 id={id} className="mt-1 text-[27px] font-semibold tracking-[-0.04em] text-[#171b19] sm:text-[32px]">{title}</h2></div>;
}

function TextLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="mt-4 inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-[#08745d] underline decoration-[#8fb9aa] underline-offset-4 transition-colors hover:text-[#054b3c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]">{children}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>;
}

function InlineRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-[#d8ddda] py-3 text-[13px]"><dt className="text-[#5e6863]">{label}</dt><dd className="font-semibold tabular-nums text-[#18201c]">{value}</dd></div>;
}

function NextEvent({ title, name, date, detail }: { title: string; name: string; date: string | null; detail: string }) {
  return <article className="grid min-h-[138px] grid-cols-[auto_minmax(0,1fr)] gap-4 border-b border-[#c8d2cd] p-5 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0 sm:p-6"><CalendarDays className="mt-0.5 h-5 w-5 text-[#0f8b73]" aria-hidden="true" /><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#607169]">{title}</p><h3 className="mt-2 text-[18px] font-semibold text-[#17201c]">{name}</h3><p className="mt-1 text-[13px] text-[#5d6762]">{date ? `${formatExecutiveDate(date, true)} · ` : ""}{detail}</p></div></article>;
}

function OperationalDetail({ eyebrow, title, items, empty, onClick }: { eyebrow: string; title: string; items: Array<{ label: string; value: string }>; empty: string; onClick: () => void }) {
  return <article><SectionHeading eyebrow={eyebrow} title={title} />{items.length ? <ol className="mt-5 border-y border-[#aeb8b3]">{items.map((item) => <li key={item.label} className="flex items-center justify-between gap-4 border-b border-[#d8ddda] py-3.5 text-[14px] last:border-b-0"><span>{item.label}</span><strong className="tabular-nums">{item.value}</strong></li>)}</ol> : <UnavailableCopy label={empty} />}<TextLink onClick={onClick}>Open full detail</TextLink></article>;
}

function UnavailableCopy({ label }: { label: string }) {
  return <p className="mt-5 border-y border-[#cfd6d2] py-5 text-[13px] leading-5 text-[#68716d]">{label}</p>;
}
