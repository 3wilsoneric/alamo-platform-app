import { useMsal } from "@azure/msal-react";
import { ArrowRight, CalendarDays, ClipboardList, House, Pill, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatMonthLabel } from "../../../../shared/period-utils.mjs";
import { isE2EAuthBypassEnabled } from "../../../app/auth/authConfig";
import { getAccountExecutiveDirectorAccess } from "../../../shared/auth/executiveDirectorAccess";
import { CensusTrendModule } from "../../../shared/modules/CensusTrendModule";
import type { AdmissionsBoardCard, AdmissionsBoardColumnKey } from "../../../shared/types/platformSnapshot";
import { ProgressModal } from "../../admissions/components/PipelineBoard";
import {
  fetchExecutiveDirectorCommunityDashboard,
  type ExecutiveDirectorCommunityDashboardResponse
} from "../data/executiveDirectorApi";

const DEFAULT_PREVIEW_FACILITY_ID = "337";
const ADMISSION_STAGES: Array<{ key: AdmissionsBoardColumnKey; label: string }> = [
  { key: "received", label: "Received" },
  { key: "in_progress", label: "In progress" },
  { key: "decision", label: "Decision" }
];

function formatNumber(value: number | null | undefined, suffix = "") {
  return value == null ? "—" : `${new Intl.NumberFormat("en-US").format(value)}${suffix}`;
}

function formatDate(value: string | null, withTime = false) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {})
  }).format(date);
}

export default function ExecutiveDirectorDashboardPage() {
  const { accounts, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  const access = getAccountExecutiveDirectorAccess(account, isE2EAuthBypassEnabled);
  const facilityId = access.primaryFacilityId ?? DEFAULT_PREVIEW_FACILITY_ID;
  const [searchParams, setSearchParams] = useSearchParams();
  const [response, setResponse] = useState<ExecutiveDirectorCommunityDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<AdmissionsBoardCard | null>(null);
  const section = searchParams.get("section") === "admissions" ? "admissions" : "overview";

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

  function showSection(next: "overview" | "admissions") {
    setSelectedCard(null);
    const params = new URLSearchParams(searchParams);
    if (next === "admissions") params.set("section", "admissions");
    else params.delete("section");
    setSearchParams(params, { replace: false });
  }

  return (
    <section data-executive-community-dashboard="true" className="mx-auto w-full max-w-[1480px] px-4 pb-16 pt-6 sm:px-6 sm:pt-9 lg:px-8">
      <header className="flex flex-col gap-3 border-b border-[#d7ddda] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#08745d]">{facility?.city ?? "Your community"}</p>
          <h1 className="mt-1 text-[34px] font-semibold tracking-[-0.045em] text-[#151917] sm:text-[44px]">
            {facility?.shortName ?? "Community"}
          </h1>
          <p className="mt-2 text-[16px] leading-7 text-[#5b6560]">Current operations and admissions activity for this community.</p>
        </div>
        {generatedAt ? <p className="text-[12px] text-[#747c78]">Updated {formatDate(generatedAt, true)}</p> : null}
      </header>

      <nav aria-label="Community dashboard sections" className="border-b border-[#d7ddda]">
        <div role="tablist" className="flex gap-7">
          {(["overview", "admissions"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={section === item}
              onClick={() => showSection(item)}
              className={`-mb-px min-h-14 border-b-2 px-0.5 text-[15px] capitalize transition-colors ${section === item ? "border-[#0f8b73] font-semibold text-[#173f36]" : "border-transparent font-medium text-[#69716c] hover:text-[#242a27]"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </nav>

      {error ? <div role="alert" className="mt-6 border-l-4 border-[#b24c3d] bg-[#fff7f5] px-4 py-3 text-[14px] text-[#7f3328]">{error}</div> : null}
      {loading && !response ? <DashboardLoading /> : null}
      {!loading && dashboard?.status === "unavailable" ? (
        <div role="status" className="mt-6 rounded-2xl border border-[#d7ddda] bg-white px-5 py-8 text-[14px] text-[#5b6560]">
          Current community measures are temporarily unavailable. Admissions activity will remain visible when its feed is connected.
        </div>
      ) : null}

      {dashboard && section === "overview" ? (
        <Overview dashboard={dashboard} onShowAdmissions={() => showSection("admissions")} />
      ) : null}
      {dashboard && section === "admissions" ? (
        <Admissions dashboard={dashboard} onOpenCard={setSelectedCard} />
      ) : null}

      {selectedCard && admissions?.status === "connected" ? (
        <ProgressModal card={selectedCard} generatedAt={admissions.generatedAt ?? generatedAt ?? new Date().toISOString()} onClose={() => setSelectedCard(null)} />
      ) : null}
    </section>
  );
}

function DashboardLoading() {
  return (
    <div role="status" className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((item) => <span key={item} className="h-32 animate-pulse rounded-2xl border border-[#dfe4e1] bg-white" />)}
      <span className="sr-only">Loading community dashboard…</span>
    </div>
  );
}

function Overview({
  dashboard,
  onShowAdmissions
}: {
  dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"];
  onShowAdmissions: () => void;
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

  return (
    <div className="space-y-7 pt-7">
      <div className="grid overflow-hidden rounded-[20px] border border-[#d7ddda] bg-white sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Users size={18} />} label="Current residents" value={formatNumber(dashboard.summary?.residents ?? community?.census)} detail={dashboard.reportingMonth ? `Through ${formatMonthLabel(dashboard.reportingMonth, { month: "long" })}` : null} />
        <Metric icon={<House size={18} />} label="Occupancy" value={formatNumber(community?.occupancyPct, "%")} detail={community?.operatingLimit != null ? `${formatNumber(community.census)} of ${formatNumber(community.operatingLimit)}` : null} />
        <Metric icon={<ClipboardList size={18} />} label="Incidents" value={formatNumber(dashboard.summary?.currentIncidents)} detail={incidentDelta == null ? null : `${incidentDelta > 0 ? "+" : ""}${incidentDelta} vs prior month`} />
        <Metric icon={<Pill size={18} />} label="Medication compliance" value={formatNumber(dashboard.medication?.compliancePct, "%")} detail={dashboard.medication?.month ? formatMonthLabel(dashboard.medication.month, { month: "long" }) : null} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <article className="rounded-[20px] border border-[#d7ddda] bg-white p-5 sm:p-7">
          <SectionTitle eyebrow="Census" title="Resident trend" />
          <CensusTrendModule points={censusPoints} height={270} emptyLabel="Census history is not available for this community." />
        </article>

        <article className="rounded-[20px] border border-[#cbdad4] bg-[linear-gradient(145deg,#f2f8f5_0%,#ffffff_72%)] p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <SectionTitle eyebrow="Admissions" title="Current activity" />
            <button type="button" onClick={onShowAdmissions} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-[#9dbdb0] bg-white px-4 text-[13px] font-semibold text-[#096650]">
              View detail <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
          {dashboard.admissions.status === "connected" ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-5 gap-y-6 border-t border-[#cddbd5] pt-5">
              <SmallMetric label="Active referrals" value={community?.activeReferrals} />
              <SmallMetric label="At decision" value={community?.inDecision} />
              <SmallMetric label="New · 7 days" value={community?.newReferrals7d} />
              <SmallMetric label="Move-ins · this week" value={community?.plannedMoveInsThisWeek} />
            </dl>
          ) : <UnavailableCopy label="The admissions feed is temporarily unavailable." />}
        </article>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailList title="Incident categories" items={dashboard.topIncidentCategories.map((item) => ({ label: item.label, value: item.count }))} empty="No incident category totals are available for the latest month." />
        <article className="rounded-[20px] border border-[#d7ddda] bg-white p-5 sm:p-7">
          <SectionTitle eyebrow="Medication" title="Latest administration period" />
          {dashboard.medication ? (
            <dl className="mt-5 divide-y divide-[#e2e6e4] border-y border-[#cfd6d2]">
              <DataRow label="Scheduled" value={formatNumber(dashboard.medication.scheduled)} />
              <DataRow label="Given" value={formatNumber(dashboard.medication.given)} />
              <DataRow label="Not given" value={formatNumber(dashboard.medication.notGiven)} />
            </dl>
          ) : <UnavailableCopy label="Medication administration totals are not available." />}
        </article>
      </div>
    </div>
  );
}

function Admissions({ dashboard, onOpenCard }: { dashboard: ExecutiveDirectorCommunityDashboardResponse["dashboard"]; onOpenCard: (card: AdmissionsBoardCard) => void }) {
  const { admissions } = dashboard;
  const community = admissions.community;
  const columns = useMemo(() => ADMISSION_STAGES.map((stage) => ({
    ...stage,
    cards: admissions.cards.filter((card) => card.column === stage.key)
  })), [admissions.cards]);

  if (admissions.status !== "connected") {
    return <div className="mt-7 rounded-[20px] border border-[#d7ddda] bg-white px-5 py-10 text-[14px] text-[#5b6560]">The community dashboard is ready, but the admissions feed is temporarily unavailable.</div>;
  }

  return (
    <div className="space-y-7 pt-7">
      <div className="grid overflow-hidden rounded-[20px] border border-[#d7ddda] bg-white sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Active referrals" value={formatNumber(community?.activeReferrals)} detail="Assigned to this community" />
        <Metric label="New referrals" value={formatNumber(community?.newReferrals7d)} detail="Last 7 days" />
        <Metric label="Assessments" value={formatNumber(community?.assessmentsThisWeek)} detail="Remaining this week" />
        <Metric label="Planned move-ins" value={formatNumber(community?.plannedMoveInsThisWeek)} detail="This week" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Schedule title="Upcoming assessments" empty="No remaining assessments are scheduled this week." items={admissions.upcomingAssessments.map((item) => ({ id: item.referralId, date: item.scheduledAt, name: item.clientName, detail: item.status }))} />
        <Schedule title="Planned move-ins" empty="No move-ins are currently scheduled this week." items={admissions.plannedMoveIns.map((item) => ({ id: item.referralId, date: item.plannedAt, name: item.clientName, detail: item.readiness === "ready" ? item.status : `${item.status} · ${item.readiness}` }))} />
      </div>

      <section>
        <div className="mb-4"><SectionTitle eyebrow="Pipeline" title="Community referrals" /></div>
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {columns.map((column) => (
            <article key={column.key} className={`overflow-hidden rounded-[18px] border ${column.key === "received" ? "border-[#cde5d9] bg-[#eef7f3]" : column.key === "in_progress" ? "border-[#d4dcf5] bg-[#f0f3fc]" : "border-[#efd2bd] bg-[#fcf3ed]"}`}>
              <header className="flex items-center justify-between px-5 py-4">
                <h3 className="text-[16px] font-semibold">{column.label}</h3>
                <span className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold shadow-sm">{column.cards.length}</span>
              </header>
              {column.cards.length ? (
                <ul className="space-y-3 px-3 pb-3">
                  {column.cards.map((card) => (
                    <li key={card.referralId}>
                      <button type="button" onClick={() => onOpenCard(card)} className="w-full rounded-[14px] border border-black/10 bg-white p-4 text-left shadow-[0_5px_16px_rgba(32,43,38,0.06)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]">
                        <span className="block text-[16px] font-semibold text-[#19201d]">{card.clientName}</span>
                        <span className="mt-1 block text-[13px] text-[#626b67]">{card.status}</span>
                        <span className="mt-3 flex items-center justify-between gap-3 border-t border-[#e3e7e5] pt-3 text-[12px] text-[#66706b]"><span>{card.daysOpen == null ? "Timing unavailable" : `${card.daysOpen} days open`}</span><ArrowRight size={15} aria-hidden="true" /></span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="mx-3 mb-3 rounded-xl border border-dashed border-black/10 bg-white/60 px-4 py-7 text-center text-[12px] text-[#68716d]">No referrals here</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon, label, value, detail }: { icon?: React.ReactNode; label: string; value: string; detail?: string | null }) {
  return <div className="min-h-32 border-b border-[#dfe4e1] p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><div className="flex items-center gap-2 text-[#08745d]">{icon}<span className="text-[11px] font-semibold uppercase tracking-[0.11em]">{label}</span></div><div className="mt-3 text-[34px] font-semibold tracking-[-0.055em] text-[#161a18]">{value}</div>{detail ? <div className="mt-1 text-[12px] text-[#68716d]">{detail}</div> : null}</div>;
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">{eyebrow}</p><h2 className="mt-1 text-[23px] font-semibold tracking-[-0.035em] text-[#171b19]">{title}</h2></div>;
}

function SmallMetric({ label, value }: { label: string; value: number | null | undefined }) {
  return <div><dt className="text-[12px] text-[#66706b]">{label}</dt><dd className="mt-1 text-[28px] font-semibold tracking-[-0.045em] text-[#17201c]">{formatNumber(value)}</dd></div>;
}

function DataRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 py-3 text-[14px]"><dt className="text-[#5e6863]">{label}</dt><dd className="font-semibold tabular-nums text-[#18201c]">{value}</dd></div>;
}

function DetailList({ title, items, empty }: { title: string; items: Array<{ label: string; value: number }>; empty: string }) {
  return <article className="rounded-[20px] border border-[#d7ddda] bg-white p-5 sm:p-7"><SectionTitle eyebrow="Incidents" title={title} />{items.length ? <ol className="mt-5 divide-y divide-[#e2e6e4] border-y border-[#cfd6d2]">{items.map((item) => <li key={item.label} className="flex items-center justify-between gap-4 py-3 text-[14px]"><span>{item.label}</span><strong className="tabular-nums">{item.value}</strong></li>)}</ol> : <UnavailableCopy label={empty} />}</article>;
}

function Schedule({ title, items, empty }: { title: string; items: Array<{ id: number; date: string; name: string; detail: string }>; empty: string }) {
  return <article className="rounded-[20px] border border-[#d7ddda] bg-white p-5 sm:p-7"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#e7f3ee] text-[#0b765f]"><CalendarDays size={19} aria-hidden="true" /></span><h2 className="text-[21px] font-semibold tracking-[-0.03em]">{title}</h2></div>{items.length ? <ol className="mt-5 divide-y divide-[#e0e5e2] border-t border-[#d3dad6]">{items.map((item) => <li key={item.id} className="grid gap-1 py-4 sm:grid-cols-[112px_1fr_auto] sm:items-center sm:gap-4"><time className="text-[13px] font-semibold text-[#0a765f]">{formatDate(item.date, true)}</time><strong className="text-[15px]">{item.name}</strong><span className="text-[12px] text-[#68716d] sm:text-right">{item.detail}</span></li>)}</ol> : <UnavailableCopy label={empty} />}</article>;
}

function UnavailableCopy({ label }: { label: string }) {
  return <p className="mt-5 border-y border-[#dde2df] py-5 text-[13px] leading-5 text-[#68716d]">{label}</p>;
}
