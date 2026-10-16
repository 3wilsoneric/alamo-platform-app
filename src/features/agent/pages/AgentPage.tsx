import { Navigate, useNavigate } from "react-router-dom";
import AnalyticsSectionNavigation from "../../california/components/AnalyticsSectionNavigation";
import LicensingWorkspace from "../../licensing/pages/LicensingPage";
import { useLicensingAccess } from "../../../shared/auth/licensingAccess";

export default function AgentPage() {
  const navigate = useNavigate();
  const canUseLicensingSkill = useLicensingAccess();
  // Licensing is the first connected skill; keep its existing access boundary.
  if (!canUseLicensingSkill) return <Navigate to="/analytics" replace />;
  return <>
    <AnalyticsSectionNavigation active="agent" onNavigate={section => navigate(section === "reports" ? "/analytics" : `/analytics/${section}`)} />
    <LicensingWorkspace />
  </>;
}
