import { ArrowUpRight } from "lucide-react";
import type { HomeDashboardResponse } from "../../../shared/types/platformSnapshot";
import type { CaliforniaCommunity } from "../data/californiaCommunities";

function censusPeriod(period: string | null, cadence: "weekly" | "monthly" | null) {
  if (!period) return null;
  const date = Date.parse(`${/^\d{4}-\d{2}$/.test(period) ? `${period}-01` : period}T00:00:00.000Z`);
  if (!Number.isFinite(date)) return period;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    ...(cadence === "monthly" ? { year: "numeric" as const } : { day: "numeric" as const }),
    timeZone: "UTC"
  }).format(new Date(date));
}

export default function CaliforniaCommunityIndex({
  communities,
  dashboard,
  unavailable,
  highlightedFacilityId,
  onHighlight,
  onSelectCommunity
}: {
  communities: CaliforniaCommunity[];
  dashboard: HomeDashboardResponse | null;
  unavailable: boolean;
  highlightedFacilityId: string | null;
  onHighlight: (facilityId: string | null) => void;
  onSelectCommunity: (facilityId: string) => void;
}) {
  const byFacility = new Map(dashboard?.communities.map((community) => [String(community.facility_id), community]) ?? []);

  return (
    <aside data-california-community-index="true" aria-label="Community index" className="california-community-index">
      <header className="california-community-index__header">
        <h1>Communities</h1>
        <span>Current census</span>
      </header>
      <div className="california-community-index__rows">
        {communities.map((community) => {
          const metrics = byFacility.get(community.facilityId);
          const census = metrics?.currentCensus ?? null;
          const change = metrics?.censusChange ?? null;
          const period = censusPeriod(metrics?.currentCensusPeriod ?? null, metrics?.censusCadence ?? null);
          return (
            <button
              key={community.facilityId}
              type="button"
              data-california-index-community={community.facilityId}
              data-california-index-highlighted={highlightedFacilityId === community.facilityId ? "true" : undefined}
              className="california-community-index__row"
              onMouseEnter={() => onHighlight(community.facilityId)}
              onMouseLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(community.facilityId)}
              onBlur={() => onHighlight(null)}
              onClick={() => onSelectCommunity(community.facilityId)}
              aria-label={`Open ${community.communityName} profile${census === null ? "" : `, census ${census.toLocaleString()}`}`}
            >
              <span className="california-community-index__identity">
                <strong>{community.shortName}</strong>
                <small>{community.city}, CA</small>
              </span>
              <span className="california-community-index__metric">
                <strong>{census === null ? "—" : census.toLocaleString()}</strong>
                <small>{census === null ? dashboard || unavailable ? "Unavailable" : "Loading" : period ?? "Current period"}</small>
                {census !== null && change !== null ? <small>{change > 0 ? "+" : ""}{change} vs prior</small> : null}
              </span>
              <ArrowUpRight size={17} strokeWidth={1.9} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
