import { ALAMO_FACILITIES } from "../../../../shared/community-names.mjs";
import type { HomeDashboardResponse } from "../../../shared/api/platformData";

interface MondayCensusBriefingProps {
  dashboard: HomeDashboardResponse;
}

const facilityCapacity = new Map(
  ALAMO_FACILITIES.map((facility) => [facility.facilityId, facility])
);

export default function MondayCensusBriefing({
  dashboard
}: MondayCensusBriefingProps) {
  const cadence = dashboard.operational.censusCadence;
  const currentCensus = dashboard.operational.currentCensus;
  const priorCensus = dashboard.operational.priorCensus;
  const censusChange = dashboard.operational.censusChange;
  const currentPeriod = dashboard.operational.currentCensusPeriod;
  const priorPeriod = dashboard.operational.priorCensusPeriod;
  const rows = dashboard.communities.map((community) => {
    const capacity = facilityCapacity.get(community.facility_id);
    return {
      facilityId: community.facility_id,
      community: capacity?.shortName ?? community.community_name,
      currentCensus: community.currentCensus,
      priorCensus: community.priorCensus,
      change: community.censusChange,
      operatingLimit: capacity?.operatingLimit ?? null
    };
  });
  const comparableRows = rows.filter((row) => row.change !== null);
  const communitiesUp = comparableRows.filter((row) => Number(row.change) > 0).length;
  const communitiesDown = comparableRows.filter((row) => Number(row.change) < 0).length;
  const communitiesUnchanged = comparableRows.filter((row) => row.change === 0).length;
  const largestMovement = [...comparableRows].sort(
    (left, right) =>
      Math.abs(Number(right.change)) - Math.abs(Number(left.change)) ||
      left.community.localeCompare(right.community)
  )[0] ?? null;
  const maximumMovement = Math.max(
    1,
    ...comparableRows.map((row) => Math.abs(Number(row.change)))
  );
  const operatingLimit = rows.reduce(
    (total, row) => total + (row.operatingLimit ?? 0),
    0
  );
  const utilization =
    currentCensus !== null && operatingLimit > 0
      ? (currentCensus / operatingLimit) * 100
      : null;
  const hasCompleteComparison =
    currentCensus !== null &&
    priorCensus !== null &&
    censusChange !== null &&
    comparableRows.length === rows.length;

  return (
    <article
      data-monday-census-briefing="true"
      className="border-t-[5px] border-[#0f8b73] bg-white"
    >
      <header className="flex flex-col gap-4 border-b-2 border-[#111111] py-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0f8b73]">
            Monday census
          </p>
          <h2 className="mt-1 text-[30px] font-bold leading-none tracking-[-0.05em] text-[#111111] sm:text-[36px]">
            {cadence === "weekly" ? "Weekly census change" : "Latest census change"}
          </h2>
          <p className="mt-3 text-[11px] leading-5 text-[#595959]">
            Governed census through {formatPeriod(currentPeriod)}
          </p>
        </div>
        <div className="text-left text-[10px] leading-4 text-[#737373] sm:text-right">
          <p>{cadence === "weekly" ? "Seven-day comparison" : "Monthly comparison fallback"}</p>
          <p>Snapshot updated {formatTimestamp(dashboard.generated_at)}</p>
        </div>
      </header>

      {dashboard.snapshot_status?.warning ? (
        <div className="border-l-4 border-[#a04436] bg-[#fff7f5] px-4 py-3 text-[11px] leading-5 text-[#6e352d]">
          <strong>Data update delayed.</strong> {dashboard.snapshot_status.warning}
        </div>
      ) : null}

      <section
        aria-label="Monday census metrics"
        className="grid border-b border-[#111111] sm:grid-cols-2 xl:grid-cols-4"
      >
        <BriefingMetric
          label={cadence === "weekly" ? "Weekly change" : "Latest change"}
          value={formatChange(censusChange)}
          detail={`${formatNumber(priorCensus)} in the prior governed period`}
          tone={changeTone(censusChange)}
        />
        <BriefingMetric
          label="Current census"
          value={formatNumber(currentCensus)}
          detail={`${formatNumber(operatingLimit)} current operating limit`}
        />
        <BriefingMetric
          label="Communities up"
          value={hasCompleteComparison ? String(communitiesUp) : "Not loaded"}
          detail={hasCompleteComparison ? `${communitiesUnchanged} unchanged` : "Complete comparison unavailable"}
          tone={communitiesUp > 0 ? "positive" : "neutral"}
        />
        <BriefingMetric
          label="Operating utilization"
          value={formatPercent(utilization)}
          detail={
            currentCensus === null || operatingLimit <= 0
              ? "Current operating position unavailable"
              : `${formatNumber(operatingLimit - currentCensus)} open to current limits`
          }
        />
      </section>

      <section className="py-6" aria-labelledby="monday-census-change-chart">
        <div className="flex items-end justify-between gap-4 border-b border-[#111111] pb-2">
          <h3
            id="monday-census-change-chart"
            className="text-[18px] font-bold tracking-[-0.035em]"
          >
            Change by community
          </h3>
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#737373]">
            {cadence === "weekly" ? "Seven days" : "Latest periods"}
          </p>
        </div>

        <div className="divide-y divide-[#e5e5e5]">
          {rows.map((row) => (
            <CommunityChangeRow
              key={row.facilityId}
              community={row.community}
              currentCensus={row.currentCensus}
              change={row.change}
              maximumMovement={maximumMovement}
            />
          ))}
        </div>
        <p className="mt-3 text-[9px] leading-4 text-[#737373]">
          Green indicates an increase, rust indicates a decrease, and gray indicates no change.
        </p>
      </section>

      <section
        aria-label="Monday census context"
        className="border-l-4 border-[#0f8b73] bg-[#effaf5] px-5 py-4 text-[12px] leading-6 text-[#315b54] sm:text-[13px]"
      >
        {buildContext({
          cadence,
          currentPeriod,
          priorPeriod,
          currentCensus,
          priorCensus,
          censusChange,
          communitiesUp,
          communitiesDown,
          communitiesUnchanged,
          largestMovement,
          complete: hasCompleteComparison
        })}
      </section>

      <footer className="mt-6 border-t border-[#d9d9d9] py-4 text-[9px] leading-4 text-[#737373]">
        Governed Alamo census snapshot. Figures are published only after census QA and reconciliation.
      </footer>
    </article>
  );
}

function BriefingMetric({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const valueColor =
    tone === "positive"
      ? "text-[#0f8b73]"
      : tone === "negative"
        ? "text-[#a04436]"
        : "text-[#111111]";

  return (
    <div className="min-h-32 border-b border-[#d9d9d9] px-4 py-5 sm:even:border-l xl:border-b-0 xl:border-l xl:first:border-l-0">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#737373]">{label}</p>
      <p className={`mt-3 text-[32px] font-bold leading-none tracking-[-0.045em] ${valueColor}`}>{value}</p>
      <p className="mt-3 text-[10px] leading-4 text-[#737373]">{detail}</p>
    </div>
  );
}

function CommunityChangeRow({
  community,
  currentCensus,
  change,
  maximumMovement
}: {
  community: string;
  currentCensus: number | null;
  change: number | null;
  maximumMovement: number;
}) {
  const movement = change !== null && Number.isFinite(change) ? change : 0;
  const width = change === null ? 0 : Math.max(3, Math.abs(movement) / maximumMovement * 50);
  const barColor =
    movement > 0 ? "bg-[#0f8b73]" : movement < 0 ? "bg-[#a04436]" : "bg-[#a7a7a2]";

  return (
    <div
      data-monday-census-community-row="true"
      className="py-3 sm:grid sm:grid-cols-[minmax(150px,0.9fr)_minmax(180px,1.5fr)_70px_64px] sm:items-center sm:gap-4"
    >
      <div className="flex items-baseline justify-between gap-3 sm:block">
        <p className="text-[12px] font-bold text-[#111111]">{community}</p>
        <p className="text-[10px] text-[#737373] sm:hidden">Census {formatNumber(currentCensus)}</p>
      </div>
      <div className="relative mt-2 h-3 bg-[#efeee9] sm:mt-0" aria-hidden="true">
        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-[#737373]" />
        {change !== null ? (
          <span
            className={`absolute inset-y-0 ${barColor}`}
            style={movement < 0 ? { right: "50%", width: `${width}%` } : { left: "50%", width: `${width}%` }}
          />
        ) : null}
      </div>
      <p className="hidden text-right text-[12px] font-semibold tabular-nums sm:block">{formatNumber(currentCensus)}</p>
      <p className={`mt-2 text-right text-[12px] font-bold tabular-nums sm:mt-0 ${toneClass(change)}`}>{formatChange(change)}</p>
    </div>
  );
}

function buildContext({
  cadence,
  currentPeriod,
  priorPeriod,
  currentCensus,
  priorCensus,
  censusChange,
  communitiesUp,
  communitiesDown,
  communitiesUnchanged,
  largestMovement,
  complete
}: {
  cadence: "weekly" | "monthly" | null;
  currentPeriod: string | null;
  priorPeriod: string | null;
  currentCensus: number | null;
  priorCensus: number | null;
  censusChange: number | null;
  communitiesUp: number;
  communitiesDown: number;
  communitiesUnchanged: number;
  largestMovement: { community: string; change: number | null } | null;
  complete: boolean;
}) {
  if (!complete || currentCensus === null || priorCensus === null || censusChange === null) {
    return "A complete portfolio comparison is not available in the current governed snapshot. Missing community values remain unreported rather than being replaced with zero.";
  }

  const periodText = cadence === "weekly"
    ? `During the seven days ending ${formatPeriod(currentPeriod)}`
    : `Between ${formatPeriod(priorPeriod)} and ${formatPeriod(currentPeriod)}`;
  const movement = censusChange > 0
    ? `increased by ${formatNumber(censusChange)}`
    : censusChange < 0
      ? `decreased by ${formatNumber(Math.abs(censusChange))}`
      : "was unchanged";
  const directionSummary = `${communitiesUp} ${communitiesUp === 1 ? "community increased" : "communities increased"}, ${communitiesDown === 0 ? "none decreased" : `${communitiesDown} ${communitiesDown === 1 ? "community decreased" : "communities decreased"}`}, and ${communitiesUnchanged} ${communitiesUnchanged === 1 ? "was" : "were"} unchanged.`;
  const largestSummary = !largestMovement || largestMovement.change === 0
    ? "No community changed from the prior period."
    : `${largestMovement.community} had the largest movement at ${formatChange(largestMovement.change)}.`;

  return `${periodText}, portfolio census ${movement}, from ${formatNumber(priorCensus)} to ${formatNumber(currentCensus)}. ${directionSummary} ${largestSummary}`;
}

function changeTone(value: number | null) {
  if (value === null || value === 0) return "neutral" as const;
  return value > 0 ? "positive" as const : "negative" as const;
}

function toneClass(value: number | null) {
  if (value === null || value === 0) return "text-[#595959]";
  return value > 0 ? "text-[#0f8b73]" : "text-[#a04436]";
}

function formatNumber(value: number | null) {
  return value === null || !Number.isFinite(value)
    ? "Not loaded"
    : Math.round(value).toLocaleString("en-US");
}

function formatChange(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Not loaded";
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString("en-US")}`;
}

function formatPercent(value: number | null) {
  return value === null || !Number.isFinite(value) ? "Not loaded" : `${value.toFixed(1)}%`;
}

function formatPeriod(value: string | null) {
  if (!value) return "an unavailable period";
  const normalized = /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value.slice(0, 10);
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: /^\d{4}-\d{2}$/.test(value) ? undefined : "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
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
