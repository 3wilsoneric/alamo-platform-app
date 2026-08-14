import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import LoginPage from "./auth/LoginPage";
import ProtectedAppShell from "../shared/layout/ProtectedAppShell";
import AppErrorBoundary from "../shared/ui/AppErrorBoundary";
import AppHomePage from "../features/communities/pages/AppHomePage";
import CommunitiesPage from "../features/communities/pages/CommunitiesPage";
import IncidentCenterPage from "../features/incidents/pages/IncidentCenterPage";
import CommandCenterPage from "../features/command-center/pages/CommandCenterPage";
import GlossaryPage from "../features/glossary/pages/GlossaryPage";
import DataExplorerPage from "../features/explorer/pages/DataExplorerPage";
import FiftyStatePage from "../features/fiftystate/pages/FiftyStatePage";
import CaliforniaHomePage from "../features/california/pages/CaliforniaHomePage";
import DataArchitecturePage from "../features/architecture/pages/DataArchitecturePage";
import AdmissionsPage from "../features/admissions/pages/AdmissionsPage";

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
        <Route path="/questions" element={withRouteBoundary(<CaliforniaHomePage />)} />
        <Route path="/analytics" element={withRouteBoundary(<CaliforniaHomePage />)} />
        <Route path="/reports" element={withRouteBoundary(<CaliforniaHomePage />)} />
        <Route path="/communities" element={withRouteBoundary(<AppHomePage />)} />
        <Route
          path="/communities/:facilityId"
          element={withRouteBoundary(<CommunitiesPage />)}
        />
        <Route path="/incidents" element={withRouteBoundary(<IncidentCenterPage />)} />
        <Route path="/admissions" element={withRouteBoundary(<AdmissionsPage />)} />
        <Route path="/glossary" element={withRouteBoundary(<GlossaryPage />)} />
        <Route path="/explorer/:kind" element={withRouteBoundary(<DataExplorerPage />)} />
        <Route path="/command-center" element={withRouteBoundary(<CommandCenterPage />)} />
        <Route path="/fiftystate" element={withRouteBoundary(<FiftyStatePage />)} />
        <Route
          path="/data-architecture"
          element={withRouteBoundary(<DataArchitecturePage />)}
        />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
