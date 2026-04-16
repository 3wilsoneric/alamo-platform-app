import { Navigate, Route, Routes } from "react-router-dom";
import MobileShell from "../layout/MobileShell";
import FacilitiesPage from "../pages/FacilitiesPage";
import IncidentsPage from "../pages/IncidentsPage";
import SummaryPage from "../pages/SummaryPage";

export default function MobileApp() {
  return (
    <Routes>
      <Route element={<MobileShell />}>
        <Route path="/" element={<Navigate to="/mobile/summary" replace />} />
        <Route path="/mobile" element={<Navigate to="/mobile/summary" replace />} />
        <Route path="/mobile/summary" element={<SummaryPage />} />
        <Route path="/mobile/incidents" element={<IncidentsPage />} />
        <Route path="/mobile/facilities" element={<FacilitiesPage />} />
      </Route>
    </Routes>
  );
}
