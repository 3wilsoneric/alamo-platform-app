import type { HomeDashboardResponse } from "../../../shared/types/platformSnapshot";
import type { CaliforniaCommunity } from "../data/californiaCommunities";
import CaliforniaCommunityIndex from "./CaliforniaCommunityIndex";

export default function MobileCommunityHome({ communities, dashboard, unavailable, onSelectCommunity }: {
  communities: CaliforniaCommunity[];
  dashboard: HomeDashboardResponse | null;
  unavailable: boolean;
  onSelectCommunity: (facilityId: string) => void;
}) {
  return (
    <div data-mobile-community-home="true" className="mx-auto flex min-h-full w-full max-w-3xl flex-col bg-[#eef3f5] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-6 sm:pt-8">
      <div className="mx-auto w-full max-w-xl">
        <CaliforniaCommunityIndex
          communities={communities}
          dashboard={dashboard}
          unavailable={unavailable}
          mobile
          highlightedFacilityId={null}
          onHighlight={() => {}}
          onSelectCommunity={onSelectCommunity}
        />
      </div>
    </div>
  );
}
