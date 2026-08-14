import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import WorkspaceHomePage from "../../home/pages/WorkspaceHomePage";
import ReportsPage from "../../reports/pages/ReportsPage";
import {
  fetchHomeDashboard,
  readCachedHomeDashboard,
  type HomeDashboardResponse
} from "../../../shared/api/platformData";
import { PlatformWordmark } from "../../../shared/branding/PlatformWordmark";
import CaliforniaCommunityMap from "../components/CaliforniaCommunityMap";
import CaliforniaCommunityModal from "../components/CaliforniaCommunityModal";
import {
  CALIFORNIA_COMMUNITIES,
  CALIFORNIA_COMMUNITY_BY_ID
} from "../data/californiaCommunities";
import { isE2EAuthBypassEnabled } from "../../../app/auth/authConfig";
import { getAccountAdmissionsAccess } from "../../../shared/auth/admissionsAccess";

type CaliforniaWorkspacePanel = "map" | "questions" | "reports";

const ANALYTICS_NAVIGATION_ENABLED = true;

const PANEL_INDEX: Record<CaliforniaWorkspacePanel, number> = {
  map: 0,
  questions: 1,
  reports: 2
};

function panelForPath(pathname: string): CaliforniaWorkspacePanel {
  if (pathname === "/questions") return "questions";
  if (pathname.startsWith("/analytics")) return "reports";
  if (pathname.startsWith("/reports")) return "reports";
  return "map";
}

export default function CaliforniaHomePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { accounts } = useMsal();
  const admissionsAccess = getAccountAdmissionsAccess(
    accounts[0],
    isE2EAuthBypassEnabled
  );
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
          : "/questions"
    );
  }

  return (
    <div
      data-california-workspace-carousel="true"
      data-california-active-panel={activePanel}
      className="relative left-1/2 h-dvh w-screen -translate-x-1/2 overflow-clip bg-white text-[#111111]"
    >
      {activePanel !== "map" ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-30 h-16 bg-white sm:h-[72px]"
        />
      ) : null}

      <Link
        to="/home"
        onClick={() => setActivePanel("map")}
        aria-label="Return to the California overview"
        data-california-workspace-brand="true"
        className={`absolute top-4 z-40 transition-[left] duration-300 motion-reduce:transition-none sm:top-5 ${
          activePanel === "map" ? "left-4 sm:left-6" : "left-[68px] sm:left-[84px]"
        }`}
      >
        <PlatformWordmark />
      </Link>

      {activePanel !== "map" ? (
        <button
          type="button"
          onClick={() => openPanel("map")}
          data-california-carousel-back="true"
          className="absolute left-4 top-4 z-40 grid h-10 w-10 place-items-center rounded-full border border-[#d9d9d9] bg-white/95 text-[#595959] shadow-[0_6px_18px_rgba(17,17,17,0.08)] backdrop-blur-sm transition-[border-color,color,transform] duration-200 hover:-translate-x-0.5 hover:border-[#111111] hover:text-[#111111] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f8b73] sm:left-6 sm:top-5"
          aria-label="Back to California map"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      ) : null}

      <div
        data-california-carousel-track="true"
        className="flex h-full w-[300vw] will-change-transform transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{
          transform: `translate3d(-${PANEL_INDEX[activePanel] * 100}vw, 0, 0)`
        }}
      >
        <section
          data-california-carousel-panel="map"
          aria-hidden={activePanel !== "map"}
          inert={activePanel !== "map"}
          className="relative h-full w-screen shrink-0 overflow-clip bg-white"
        >
          <div
            data-california-home-hero="true"
            className="relative flex h-full flex-col items-center overflow-clip px-2 pb-5 sm:px-4 sm:pb-6"
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
            <nav
              data-california-hero-menu="true"
              aria-label="Platform menu"
              className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2 sm:right-6 sm:top-5 sm:gap-3"
            >
              {admissionsAccess.allowed ? (
                <Link
                  to="/admissions"
                  data-california-hero-action="admissions"
                  className="group inline-flex items-center gap-2 text-left font-sans text-[15px] font-bold tracking-[-0.055em] text-[#315b54] transition-colors hover:text-[#0f8b73] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f8b73] sm:text-[18px]"
                >
                  <span>Admissions</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => openPanel("questions")}
                data-california-hero-action="questions"
                className="group inline-flex items-center gap-2 text-left font-sans text-[15px] font-bold tracking-[-0.055em] text-[#315b54] transition-colors hover:text-[#0f8b73] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f8b73] sm:text-[18px]"
              >
                <span>Ask a question</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </button>
              {ANALYTICS_NAVIGATION_ENABLED ? (
                <button
                  type="button"
                  onClick={() => openPanel("reports")}
                  data-california-hero-action="analytics"
                  className="group inline-flex items-center gap-2 text-left font-sans text-[15px] font-bold tracking-[-0.055em] text-[#315b54] transition-colors hover:text-[#0f8b73] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f8b73] sm:text-[18px]"
                >
                  <span>Analytics</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </button>
              ) : null}
            </nav>
          </div>
        </section>

        <section
          data-california-carousel-panel="questions"
          aria-hidden={activePanel !== "questions"}
          inert={activePanel !== "questions"}
          className="relative h-full w-screen shrink-0 overflow-y-auto overscroll-contain bg-white px-2 pb-8 pt-14 sm:px-4 sm:pt-16"
        >
          {ANALYTICS_NAVIGATION_ENABLED ? (
            <button
              type="button"
              onClick={() => openPanel("reports")}
              data-california-question-analytics-link="true"
              className="absolute right-4 top-4 z-20 inline-flex items-center gap-2 font-sans text-[15px] font-bold tracking-[-0.055em] text-[#0f8b73] transition-colors hover:text-[#0c705f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f8b73] sm:right-6 sm:top-5 sm:text-[18px]"
            >
              <span>Analytics</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : null}
          <div
            data-california-question-workspace="true"
            className="mx-auto w-full max-w-[1380px]"
          >
            <WorkspaceHomePage
              embedded
              sectionId="questions"
              initialQuestionsOpen
            />
          </div>
        </section>

        <section
          data-california-carousel-panel="reports"
          aria-hidden={activePanel !== "reports"}
          inert={activePanel !== "reports"}
          className="h-full w-screen shrink-0 overflow-y-auto overscroll-contain bg-white px-4 pb-8 pt-16 sm:px-8 sm:pt-[72px] lg:px-12"
        >
          <ReportsPage embedded active={activePanel === "reports"} />
        </section>
      </div>

      <CaliforniaCommunityModal
        community={selectedCommunity}
        onClose={clearCommunity}
      />
    </div>
  );
}
