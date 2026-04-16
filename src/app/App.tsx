import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./auth/LoginPage";
import ProtectedAppShell from "../shared/layout/ProtectedAppShell";
import AppHomePage from "../features/communities/pages/AppHomePage";
import CommunitiesPage from "../features/communities/pages/CommunitiesPage";
import ReportsPage from "../features/reports/pages/ReportsPage";
import IncidentCenterPage from "../features/incidents/pages/IncidentCenterPage";
import WorkforcePage from "../features/workforce/pages/WorkforcePage";
import SettingsPage from "../features/settings/pages/SettingsPage";
import AdminPage from "../features/admin/pages/AdminPage";
import CommandCenterPage from "../features/command-center/pages/CommandCenterPage";
import AskHelperWorkspacePage from "../features/ask-helper/pages/AskHelperWorkspacePage";
import MobileShell from "../mobile/layout/MobileShell";
import SummaryPage from "../mobile/pages/SummaryPage";
import IncidentsPage from "../mobile/pages/IncidentsPage";
import FacilitiesPage from "../mobile/pages/FacilitiesPage";
import IncidentFlowDemoPage from "../features/demo/pages/IncidentFlowDemoPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/demo/incident-flow" element={<IncidentFlowDemoPage />} />
      <Route path="/mobile" element={<MobileShell />}>
        <Route index element={<Navigate to="/mobile/summary" replace />} />
        <Route path="summary" element={<SummaryPage />} />
        <Route path="incidents" element={<IncidentsPage />} />
        <Route path="facilities" element={<FacilitiesPage />} />
      </Route>
      <Route element={<ProtectedAppShell />}>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<AppHomePage />} />
        <Route path="/communities" element={<CommunitiesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/incidents" element={<IncidentCenterPage />} />
        <Route path="/workforce" element={<WorkforcePage />} />
        <Route path="/assistant" element={<AskHelperWorkspacePage />} />
        <Route path="/command-center" element={<CommandCenterPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
    </Routes>
  );
}
