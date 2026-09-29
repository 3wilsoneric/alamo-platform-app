import { ArrowRight } from "lucide-react";
import type { CaliforniaCommunity } from "../data/californiaCommunities";

export default function MobileCommunityHome({ communities, onSelectCommunity }: {
  communities: CaliforniaCommunity[];
  onSelectCommunity: (facilityId: string) => void;
}) {
  return (
    <div data-mobile-community-home="true" className="mx-auto w-full max-w-3xl px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-8">
      <h1 className="font-sans text-[28px] font-semibold leading-tight tracking-[-0.04em]">Communities</h1>
      <div className="mt-5 border-t border-[#d9e2dc]">
        {communities.map((community) => (
          <button key={community.facilityId} type="button" data-mobile-community-card={community.facilityId} onClick={() => onSelectCommunity(community.facilityId)} aria-label={`Open ${community.communityName} profile`} className="flex min-h-[84px] w-full items-center justify-between gap-4 border-b border-[#d9e2dc] py-4 text-left">
            <span className="min-w-0">
              <span className="block text-[18px] font-semibold leading-6 text-[#244f41]">{community.shortName}</span>
              <span className="mt-1 block text-sm text-[#66776e]">{community.city}, California</span>
            </span>
            <ArrowRight size={19} className="shrink-0 text-[#0f8b73]" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
