import { ArrowRight, BarChart3, MessageSquareText } from "lucide-react";
import type { HomeDashboardResponse } from "../../../shared/types/platformSnapshot";
import type { CaliforniaCommunity } from "../data/californiaCommunities";

function formatChange(value: number | null) {
  if (value === null) return "Change unavailable";
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${value.toLocaleString()} vs prior period`;
}

function changeClass(value: number | null) {
  if (value === null || value === 0) return "text-[#595959]";
  return value > 0 ? "text-[#08705d]" : "text-[#a04436]";
}

function formatPeriod(value: string, cadence: "weekly" | "monthly" | null) {
  const date = new Date(`${cadence === "monthly" ? `${value}-01` : value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    ...(cadence === "monthly" ? { year: "numeric" as const } : { day: "numeric" as const, year: "numeric" as const }),
    timeZone: "UTC"
  }).format(date);
}

export default function MobileCommunityHome({
  communities,
  dashboard,
  dashboardUnavailable,
  onSelectCommunity,
  onOpenReports,
  onOpenQuestions
}: {
  communities: CaliforniaCommunity[];
  dashboard: HomeDashboardResponse | null;
  dashboardUnavailable: boolean;
  onSelectCommunity: (facilityId: string) => void;
  onOpenReports: () => void;
  onOpenQuestions: () => void;
}) {
  const metricsByFacility = new Map(
    (dashboard?.communities ?? []).map((item) => [String(item.facility_id), item])
  );
  const portfolioCensus = dashboard?.operational.currentCensus ?? null;
  const portfolioChange = dashboard?.operational.censusChange ?? null;
  const censusLabel = dashboard?.operational.censusCadence === "monthly"
    ? "Current monthly census"
    : dashboard?.operational.censusCadence === "weekly"
      ? "Current weekly census"
      : "Current census";

  return (
    <div
      data-mobile-community-home="true"
      className="mx-auto w-full max-w-lg px-4 pb-[calc(32px+env(safe-area-inset-bottom))] pt-[76px] text-[#111111] sm:max-w-3xl sm:px-8 sm:pt-28"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#08745f]">
        Operating pulse
      </p>
      <h1 className="mt-2 font-serif text-[34px] font-semibold leading-[1.05] tracking-[-0.04em]">
        Your communities
      </h1>
      <p className="mt-3 text-[13px] leading-5 text-[#595959]">
        Five California communities. Open one for its census, incidents, medications, and residents.
      </p>

      <div className="mt-6 border-y border-[#111111] py-4" data-mobile-portfolio-pulse="true">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#595959]">
          {censusLabel}
        </p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <p className="font-sans text-[38px] font-bold leading-none tracking-[-0.06em]">
            {portfolioCensus === null ? "—" : portfolioCensus.toLocaleString()}
          </p>
          <p className={`pb-1 text-right text-[12px] font-semibold ${changeClass(portfolioChange)}`}>
            {portfolioCensus === null
              ? dashboardUnavailable ? "Data unavailable" : "Loading current data"
              : formatChange(portfolioChange)}
          </p>
        </div>
        {dashboard?.operational.currentCensusPeriod ? (
          <p className="mt-2 text-[11px] text-[#737373]">
            Governed period: {formatPeriod(dashboard.operational.currentCensusPeriod, dashboard.operational.censusCadence)}
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2" aria-label="Analytics shortcuts">
        <button
          type="button"
          onClick={onOpenReports}
          className="inline-flex min-h-12 items-center justify-center gap-2 border border-[#bfd1cb] bg-[#eef4f1] px-2 text-[13px] font-bold text-[#315b54] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]"
        >
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          Reports
        </button>
        <button
          type="button"
          onClick={onOpenQuestions}
          className="inline-flex min-h-12 items-center justify-center gap-2 border border-[#bfd1cb] bg-[#eef4f1] px-2 text-[13px] font-bold text-[#315b54] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]"
        >
          <MessageSquareText className="h-4 w-4" aria-hidden="true" />
          Ask a question
        </button>
      </div>

      <div className="mt-7 flex items-baseline justify-between border-b border-[#d9d9d9] pb-2">
        <h2 className="font-sans text-[18px] font-bold tracking-[-0.03em]">Communities</h2>
        <span className="text-[12px] font-semibold text-[#737373]">{communities.length} locations</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-6">
        {communities.map((community) => {
          const metrics = metricsByFacility.get(community.facilityId);
          const currentCensus = metrics?.currentCensus ?? null;
          const change = metrics?.censusChange ?? null;
          return (
            <button
              key={community.facilityId}
              type="button"
              data-mobile-community-card={community.facilityId}
              onClick={() => onSelectCommunity(community.facilityId)}
              className="flex min-h-[78px] w-full items-center justify-between gap-3 border-b border-[#d9d9d9] py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0f8b73]"
              aria-label={`Open ${community.communityName} profile${currentCensus === null ? "" : `, current census ${currentCensus.toLocaleString()}, ${formatChange(change)}`}`}
            >
              <span className="min-w-0">
                <span className="block break-words font-sans text-[16px] font-bold leading-5 tracking-[-0.03em]">
                  {community.communityName}
                </span>
                <span className="mt-1 block text-[12px] text-[#595959]">{community.city}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-right">
                  <span className="block text-[17px] font-bold leading-5">
                    {currentCensus === null ? "—" : currentCensus.toLocaleString()}
                  </span>
                  <span className={`block text-[10px] font-semibold ${changeClass(change)}`}>
                    {currentCensus === null ? "Census pending" : formatChange(change)}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 text-[#0f8b73]" aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-5 text-[11px] leading-4 text-[#737373]">
        Census values appear only when the governed snapshot is available. Open a profile for detail and source context.
      </p>
    </div>
  );
}
