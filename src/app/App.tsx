import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import LoginPage from "./auth/LoginPage";
import ProtectedAppShell from "../shared/layout/ProtectedAppShell";
import AppErrorBoundary from "../shared/ui/AppErrorBoundary";
import AppHomePage from "../features/communities/pages/AppHomePage";
import CommunitiesPage from "../features/communities/pages/CommunitiesPage";
import IncidentCenterPage from "../features/incidents/pages/IncidentCenterPage";
import IncidentHistoryPage from "../features/incidents/pages/IncidentHistoryPage";
import CommandCenterPage from "../features/command-center/pages/CommandCenterPage";
import GlossaryPage from "../features/glossary/pages/GlossaryPage";
import DataExplorerPage from "../features/explorer/pages/DataExplorerPage";
import OutreachPage from "../features/fiftystate/pages/FiftyStatePage";
import CaliforniaHomePage from "../features/california/pages/CaliforniaHomePage";
import DataArchitecturePage from "../features/architecture/pages/DataArchitecturePage";
import AdmissionsPage from "../features/admissions/pages/AdmissionsPage";
import WorkforcePage from "../features/workforce/pages/WorkforcePage";
import PresentationPage from "../features/presentation/PresentationPage";
import OwnerChatPage from "../features/home/pages/OwnerChatPage";

import AgentPage from "../features/agent/pages/AgentPage";
import LicensingRoute from "../features/licensing/pages/LicensingRoute";
import { useEveryAgentAccess } from "../shared/auth/everyAgentAccess";
import ExecutiveDirectorPage from "../features/executive/pages/ExecutiveDirectorPage";
import ExecutiveDirectorDashboardPage from "../features/executive/pages/ExecutiveDirectorDashboardPage";
import WorkflowPage from "../features/workflow/pages/WorkflowPage";

function RouteBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <AppErrorBoundary
      label="Workspace view"
      resetKey={`${location.pathname}${location.search}`}
    >
      {children}
    </AppErrorBoundary>
  );
}

function withRouteBoundary(node: ReactNode) {
  return <RouteBoundary>{node}</RouteBoundary>;
}

function LegacyLicensingRedirect() {
  const location = useLocation();
  const canUseEveryAgent = useEveryAgentAccess();
  if (location.pathname !== "/everyagent" && !canUseEveryAgent) return <LicensingRoute />;
  const params = new URLSearchParams(location.search);
  if (location.pathname !== "/everyagent") params.set("skill", "licensing");
  return <Navigate to={`/analytics/agent${params.size ? `?${params}` : ""}${location.hash}`} replace />;
}

function LegacyOutreachRedirect() {
  const location = useLocation();
  return <Navigate to={`/outreach${location.search}${location.hash}`} replace />;
}

function LegacyWorkforceRedirect() {
  const location = useLocation();
  return <Navigate to={`/personnel${location.search}${location.hash}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedAppShell />}>
        <Route path="/" element={withRouteBoundary(<CaliforniaHomePage />)} />
        <Route path="/home" element={withRouteBoundary(<CaliforniaHomePage />)} />
        <Route
          path="/home/community/:facilityId"
          element={withRouteBoundary(<CaliforniaHomePage />)}
        />
        <Route path="/questions" element={<Navigate to="/analytics/questions" replace />} />
        <Route path="/analytics" element={withRouteBoundary(<CaliforniaHomePage />)} />
        <Route
          path="/analytics/questions"
          element={withRouteBoundary(<CaliforniaHomePage />)}
        />
        <Route path="/reports" element={withRouteBoundary(<CaliforniaHomePage />)} />
        <Route path="/communities" element={withRouteBoundary(<AppHomePage />)} />
        <Route
          path="/communities/:facilityId"
          element={withRouteBoundary(<CommunitiesPage />)}
        />
        <Route path="/incidents" element={withRouteBoundary(<IncidentCenterPage />)} />
        <Route path="/incidents/history" element={withRouteBoundary(<IncidentHistoryPage />)} />
        <Route path="/admissions" element={withRouteBoundary(<AdmissionsPage />)} />
        <Route path="/personnel" element={withRouteBoundary(<WorkforcePage />)} />
        <Route path="/workforce" element={<LegacyWorkforceRedirect />} />
        <Route path="/workflow" element={withRouteBoundary(<WorkflowPage />)} />
        <Route path="/executive" element={<Navigate to="/executive/dashboard" replace />} />
        <Route path="/executive/dashboard" element={withRouteBoundary(<ExecutiveDirectorDashboardPage />)} />
        <Route path="/executive/licensing" element={withRouteBoundary(<ExecutiveDirectorPage />)} />
        <Route path="/presentation" element={withRouteBoundary(<PresentationPage />)} />
        <Route path="/chat" element={withRouteBoundary(<OwnerChatPage />)} />
        <Route path="/pipeline" element={<Navigate to="/admissions" replace />} />
        <Route path="/glossary" element={withRouteBoundary(<GlossaryPage />)} />
        <Route path="/explorer/:kind" element={withRouteBoundary(<DataExplorerPage />)} />
        <Route path="/command-center" element={withRouteBoundary(<CommandCenterPage />)} />
        <Route path="/analytics/agent" element={withRouteBoundary(<AgentPage />)} />
        <Route path="/everyagent" element={<LegacyLicensingRedirect />} />
        <Route path="/analytics/licensing" element={<LegacyLicensingRedirect />} />
        <Route path="/licensing" element={<LegacyLicensingRedirect />} />
        <Route path="/outreach" element={withRouteBoundary(<OutreachPage />)} />
        <Route path="/fiftystate" element={<LegacyOutreachRedirect />} />
        <Route
          path="/data-architecture"
          element={withRouteBoundary(<DataArchitecturePage />)}
        />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
