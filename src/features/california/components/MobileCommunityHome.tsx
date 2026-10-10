import { ArrowRight } from "lucide-react";
import type { HomeDashboardResponse } from "../../../shared/types/platformSnapshot";
import type { CaliforniaCommunity } from "../data/californiaCommunities";

export default function MobileCommunityHome({ communities, dashboard, unavailable, onSelectCommunity }: {
  communities: CaliforniaCommunity[];
  dashboard: HomeDashboardResponse | null;
  unavailable: boolean;
  onSelectCommunity: (facilityId: string) => void;
}) {
  const byFacility = new Map(dashboard?.communities.map((community) => [String(community.facility_id), community]) ?? []);
  return (
    <div data-mobile-community-home="true" className="mx-auto flex min-h-full w-full max-w-3xl flex-col bg-[#f7f7f3] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-6 sm:pt-8">
      <div className="flex items-baseline justify-between gap-3 border-b-2 border-[#1a3e55] pb-3">
        <h1 className="font-sans text-[28px] font-semibold leading-tight tracking-[-0.04em] text-[#16283a]">Communities</h1>
        <span className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#5d6b74]">Current census</span>
      </div>
      <div className="flex flex-1 flex-col">
        {communities.map((community) => {
          const census = byFacility.get(community.facilityId)?.currentCensus ?? null;
          return <button key={community.facilityId} type="button" data-mobile-community-card={community.facilityId} onClick={() => onSelectCommunity(community.facilityId)} aria-label={`Open ${community.communityName} profile${census === null ? "" : `, census ${census.toLocaleString()}`}`} className="group flex min-h-[84px] w-full flex-1 items-center justify-between gap-4 border-b border-[#cfd9da] py-4 text-left transition-colors hover:bg-white focus-visible:bg-white">
            <span className="min-w-0">
              <span className="block text-[18px] font-semibold leading-6 text-[#19384c]">{community.shortName}</span>
              <span className="mt-1 block text-sm text-[#66776e]">{community.city}, California</span>
            </span>
            <span className="flex shrink-0 items-center gap-2.5">
              <span className="text-right"><strong className="block text-[24px] leading-6 tabular-nums text-[#19384c]">{census === null ? "—" : census.toLocaleString()}</strong><small className="block text-[11px] text-[#64717a]">{census === null ? dashboard || unavailable ? "Unavailable" : "Loading" : "residents"}</small></span>
              <ArrowRight size={19} className="shrink-0 text-[#0f8b73] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </button>;
        })}
      </div>
    </div>
  );
}
