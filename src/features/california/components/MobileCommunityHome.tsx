import { ArrowRight } from "lucide-react";
import type { CaliforniaCommunity } from "../data/californiaCommunities";

export default function MobileCommunityHome({ communities, onSelectCommunity }: {
  communities: CaliforniaCommunity[];
  onSelectCommunity: (facilityId: string) => void;
}) {
  return (
    <div data-mobile-community-home="true" className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-6 sm:pt-8">
      <h1 className="font-sans text-[28px] font-semibold leading-tight tracking-[-0.04em]">Communities</h1>
      <div className="mt-4 flex flex-1 flex-col border-t border-[#d9e2dc] sm:mt-5">
        {communities.map((community) => (
          <button key={community.facilityId} type="button" data-mobile-community-card={community.facilityId} onClick={() => onSelectCommunity(community.facilityId)} aria-label={`Open ${community.communityName} profile`} className="group flex min-h-[84px] w-full flex-1 items-center justify-between gap-4 border-b border-[#d9e2dc] py-4 text-left transition-colors hover:bg-[#f7faf8] focus-visible:bg-[#f7faf8]">
            <span className="min-w-0">
              <span className="block text-[18px] font-medium leading-6 text-[#244f41]">{community.shortName}</span>
              <span className="mt-1 block text-sm text-[#66776e]">{community.city}, California</span>
            </span>
            <ArrowRight size={19} className="shrink-0 text-[#0f8b73] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
