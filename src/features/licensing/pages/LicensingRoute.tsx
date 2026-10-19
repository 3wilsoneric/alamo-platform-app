import { Navigate, useNavigate } from "react-router-dom";
import { useLicensingAccess } from "../../../shared/auth/licensingAccess";
import AnalyticsSectionNavigation from "../../california/components/AnalyticsSectionNavigation";
import LicensingWorkspace from "./LicensingPage";

export default function LicensingRoute() {
  const navigate = useNavigate();
  const allowed = useLicensingAccess();
  if (!allowed) return <Navigate to="/analytics" replace />;
  return <>
    <AnalyticsSectionNavigation active="licensing" onNavigate={section => navigate(section === "reports" ? "/analytics" : `/analytics/${section}`)} />
    <LicensingWorkspace />
  </>;
}
