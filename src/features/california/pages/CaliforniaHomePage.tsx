import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import WorkspaceHomePage from "../../home/pages/WorkspaceHomePage";
import ReportsPage from "../../reports/pages/ReportsPage";
import {
  fetchHomeDashboard,
  readCachedHomeDashboard,
  type HomeDashboardResponse
} from "../../../shared/api/platformData";
import CaliforniaCommunityMap from "../components/CaliforniaCommunityMap";
import MobileCommunityHome from "../components/MobileCommunityHome";
import CaliforniaCommunityModal from "../components/CaliforniaCommunityModal";
import AnalyticsSectionNavigation, {
  type AnalyticsSection
} from "../components/AnalyticsSectionNavigation";
import {
  CALIFORNIA_COMMUNITIES,
  CALIFORNIA_COMMUNITY_BY_ID
} from "../data/californiaCommunities";

type CaliforniaWorkspacePanel = "map" | "questions" | "reports";

const PANEL_INDEX: Record<CaliforniaWorkspacePanel, number> = {
  map: 0,
  questions: 1,
  reports: 2
};

function panelForPath(pathname: string): CaliforniaWorkspacePanel {
  if (pathname === "/analytics/questions" || pathname === "/questions") return "questions";
  if (pathname.startsWith("/analytics")) return "reports";
  if (pathname.startsWith("/reports")) return "reports";
  return "map";
}

export default function CaliforniaHomePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState<CaliforniaWorkspacePanel>(() =>
    panelForPath(location.pathname)
  );
  const [mapDashboard, setMapDashboard] = useState<HomeDashboardResponse | null>(readCachedHomeDashboard);
  const [mapDashboardUnavailable, setMapDashboardUnavailable] = useState(false);
  const communityPathMatch = location.pathname.match(/^\/home\/community\/([^/]+)$/);
  const encodedPathFacilityId = communityPathMatch?.[1];
  const pathFacilityId = encodedPathFacilityId
    ? decodeURIComponent(encodedPathFacilityId)
    : null;
  const routeFacilityId =
    pathFacilityId ?? new URLSearchParams(location.search).get("community");
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(
    routeFacilityId
  );
  const selectedCommunity = selectedFacilityId
    ? CALIFORNIA_COMMUNITY_BY_ID.get(selectedFacilityId) ?? null
    : null;

  useEffect(() => {
    setSelectedFacilityId(routeFacilityId);
  }, [routeFacilityId]);

  useEffect(() => {
    setActivePanel(panelForPath(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    const syncPanelToBrowserHistory = () => {
      setActivePanel(panelForPath(window.location.pathname));
    };
    window.addEventListener("popstate", syncPanelToBrowserHistory);
    return () => {
      window.removeEventListener("popstate", syncPanelToBrowserHistory);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void fetchHomeDashboard()
      .then((dashboard) => {
        if (mounted) {
          setMapDashboardUnavailable(false);
          setMapDashboard(dashboard);
        }
      })
      .catch(() => {
        if (mounted) setMapDashboardUnavailable(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activePanel]);

  function clearCommunity() {
    setSelectedFacilityId(null);
    navigate("/home", { replace: true });
  }

  function openCommunity(facilityId: string) {
    setSelectedFacilityId(facilityId);
    navigate(`/home/community/${encodeURIComponent(facilityId)}`);
  }

  function openPanel(panel: CaliforniaWorkspacePanel) {
    setActivePanel(panel);
    navigate(
      panel === "map"
        ? "/home"
        : panel === "reports"
          ? "/analytics"
          : "/analytics/questions"
    );
  }

  function openAnalyticsSection(section: AnalyticsSection) {
    openPanel(section);
  }

  return (
    <div
      data-california-workspace-carousel="true"
      data-california-active-panel={activePanel}
      className="relative flex h-[calc(100dvh-var(--platform-header-height))] w-full flex-col overflow-clip bg-white text-[#111111]"
    >
      {activePanel !== "map" ? (
        <AnalyticsSectionNavigation
          active={activePanel}
          onNavigate={openAnalyticsSection}
        />
      ) : null}

      <div
        data-california-carousel-track="true"
        className="flex min-h-0 flex-1 w-[300%] will-change-transform transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{
          transform: `translate3d(-${PANEL_INDEX[activePanel] * (100 / 3)}%, 0, 0)`
        }}
      >
        <section
          data-california-carousel-panel="map"
          aria-hidden={activePanel !== "map"}
          inert={activePanel !== "map"}
          className="relative h-full w-1/3 shrink-0 overflow-y-auto overscroll-contain bg-white lg:overflow-clip"
        >
          <div className="lg:hidden">
            <MobileCommunityHome
              communities={CALIFORNIA_COMMUNITIES}
              onSelectCommunity={openCommunity}
            />
          </div>
          <div
            data-california-home-hero="true"
            className="relative hidden h-full flex-col items-center overflow-clip px-2 pb-5 sm:px-4 sm:pb-6 lg:flex"
          >
            <div className="flex min-h-0 w-full flex-1 -translate-y-3 items-center justify-center sm:translate-y-0">
              <CaliforniaCommunityMap
                communities={CALIFORNIA_COMMUNITIES}
                dashboard={mapDashboard}
                dashboardUnavailable={mapDashboardUnavailable}
                selectedFacilityId={selectedFacilityId}
                onSelectCommunity={openCommunity}
              />
            </div>
          </div>
        </section>

        <section
          data-california-carousel-panel="questions"
          aria-hidden={activePanel !== "questions"}
          inert={activePanel !== "questions"}
          className="relative h-full w-1/3 shrink-0 overflow-y-auto overscroll-contain bg-white px-3 pb-[calc(32px+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-8 lg:px-8"
        >
          <div
            data-california-question-workspace="true"
            className="mx-auto w-full max-w-[1432px]"
          >
            <div className="mx-auto w-full max-w-[1380px]">
              <WorkspaceHomePage
                embedded
                sectionId="questions"
                initialQuestionsOpen
              />
            </div>
          </div>
        </section>

        <section
          data-california-carousel-panel="reports"
          aria-hidden={activePanel !== "reports"}
          inert={activePanel !== "reports"}
          className="relative h-full w-1/3 shrink-0 overflow-y-auto overscroll-contain bg-white px-4 pb-[calc(32px+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-8 lg:px-8"
        >
          <div className="mx-auto w-full max-w-[1432px]">
            <ReportsPage embedded active={activePanel === "reports"} />
          </div>
        </section>
      </div>

      <CaliforniaCommunityModal
        community={selectedCommunity}
        onClose={clearCommunity}
      />
    </div>
  );
}
